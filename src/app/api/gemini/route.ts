import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300; // 5분 (대용량 영상 청크 순차 처리)

// 사용 가능한 Gemini 모델 목록 (v1beta 엔드포인트 사용)
const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
];

// Gemini API 엔드포인트 (v1beta 사용 — v1은 최신 모델 미지원)
const GEMINI_API_VERSION = 'v1beta';

// 청크 크기 (초 단위) - 2분씩 나눔 (더 촘촘한 AI 자막 생성)
const CHUNK_DURATION = 120;

// 전체 대본 텍스트 생성 (청크별 맥락 유지용 — 최대 1500자)
function buildContentSummary(allTranscripts: any[]): string {
  const texts = allTranscripts
    .map((t: any) => t.editedText || t.originalText || t.text || '')
    .filter(Boolean);
  const fullText = texts.join(' ');
  if (fullText.length <= 1500) return fullText;
  const third = Math.floor(texts.length / 3);
  const front = texts.slice(0, third).join(' ').slice(0, 500);
  const mid = texts.slice(third, third * 2).join(' ').slice(0, 500);
  const back = texts.slice(third * 2).join(' ').slice(0, 500);
  return `${front} ... ${mid} ... ${back}`;
}

// ★ 대본 맥락 분석 (Gemini 1차 호출: 주제/분위기/핵심포인트 추출)
async function analyzeTranscriptContext(
  transcriptText: string,
  geminiKey: string,
): Promise<{ topic: string; mood: string; audience: string; keyPoints: string[]; speakerStyle: string } | null> {
  const prompt = `아래 영상 대본을 분석하여 JSON으로만 응답하세요.

대본:
${transcriptText.slice(0, 3000)}

분석 항목:
1. topic: 이 영상의 핵심 주제 (한 줄)
2. mood: 전체 분위기 (예: 유쾌한, 진지한, 감동적, 긴장감 있는, 교육적)
3. audience: 타겟 시청자 (예: 20대 남성, 직장인, 학생, 게이머)
4. keyPoints: 시청자가 반응할 핵심 순간 3~5개 (배열, 각 한 줄)
5. speakerStyle: 화자의 말투 특징 (예: 친근한 반말, 전문가 톤, 유머러스한)

JSON만 출력:
{"topic":"...","mood":"...","audience":"...","keyPoints":["...","..."],"speakerStyle":"..."}`;

  for (const model of GEMINI_MODELS) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/${GEMINI_API_VERSION}/models/${model}:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 1024 },
          }),
        }
      );
      if (!response.ok) continue;
      const result = await response.json();
      const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
      const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const jsonMatch = cleaned.match(/\{[\s\S]*"topic"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        console.log(`[맥락 분석] 성공:`, parsed);
        return parsed;
      }
    } catch (e: any) {
      console.warn(`[맥락 분석] ${model} 실패:`, e.message);
    }
  }
  return null;
}

// ★ 예능 PD 모드: 침묵 구간 감지 (1.5초 이상 gap → 상황자막 힌트)
function detectSilentGaps(transcripts: any[]): { start: number; end: number; duration: number }[] {
  const sorted = [...transcripts].sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0));
  const gaps: { start: number; end: number; duration: number }[] = [];

  // 첫 대본 앞 gap
  if (sorted.length > 0 && (sorted[0].startTime ?? 0) > 1.5) {
    gaps.push({ start: 0, end: sorted[0].startTime, duration: sorted[0].startTime });
  }

  // 대본 사이 gap
  for (let i = 0; i < sorted.length - 1; i++) {
    const gapStart = sorted[i].endTime ?? 0;
    const gapEnd = sorted[i + 1].startTime ?? 0;
    const dur = gapEnd - gapStart;
    if (dur >= 1.5) {
      gaps.push({ start: gapStart, end: gapEnd, duration: dur });
    }
  }

  return gaps;
}

// ★ 예능 PD 모드: 임팩트 구간 감지 (짧고 빈번한 발화 = 고에너지)
function detectImpactZones(transcripts: any[]): { start: number; end: number; type: string }[] {
  const sorted = [...transcripts].sort((a, b) => (a.startTime ?? 0) - (b.startTime ?? 0));
  const zones: { start: number; end: number; type: string }[] = [];

  // 10초 윈도우에서 발화 밀도 분석
  for (let i = 0; i < sorted.length - 2; i++) {
    const windowStart = sorted[i].startTime ?? 0;
    const windowEnd = windowStart + 10;
    const segsInWindow = sorted.filter(
      (t: any) => (t.startTime ?? 0) >= windowStart && (t.startTime ?? 0) < windowEnd
    );
    // 10초 안에 5개 이상 발화 = 고에너지 구간
    if (segsInWindow.length >= 5) {
      const zoneEnd = segsInWindow[segsInWindow.length - 1].endTime ?? windowEnd;
      // 중복 방지
      if (zones.length === 0 || zones[zones.length - 1].end < windowStart) {
        zones.push({ start: windowStart, end: zoneEnd, type: '고에너지' });
      }
    }
  }

  // 짧은 발화 (1초 이하) 연속 = 빠른 리듬
  for (let i = 0; i < sorted.length - 1; i++) {
    const dur = (sorted[i].endTime ?? 0) - (sorted[i].startTime ?? 0);
    const nextDur = (sorted[i + 1].endTime ?? 0) - (sorted[i + 1].startTime ?? 0);
    if (dur <= 1.0 && nextDur <= 1.0) {
      const zStart = sorted[i].startTime ?? 0;
      const zEnd = sorted[i + 1].endTime ?? 0;
      if (zones.length === 0 || zones[zones.length - 1].end < zStart) {
        zones.push({ start: zStart, end: zEnd, type: '빠른리듬' });
      }
    }
  }

  return zones;
}

// ★ 필러 단어 필터링 (맥락 분석 정확도 향상)
const FILLER_WORDS = ['음', '어', '아', '그', '뭐', '이제', '근데', '그래서', '그러니까', '약간'];
function filterFillerWords(text: string): string {
  return text.split(' ').filter(w => !FILLER_WORDS.includes(w.trim())).join(' ').replace(/\s+/g, ' ').trim();
}

// 프롬프트 생성 함수 (예능 PD 모드)
function buildPrompt(
  transcriptText: string,
  contentSummary?: string,
  silentGaps?: { start: number; end: number; duration: number }[],
  impactZones?: { start: number; end: number; type: string }[],
  contextAnalysis?: { topic: string; mood: string; audience: string; keyPoints: string[]; speakerStyle: string } | null,
): string {
  const segmentCount = transcriptText.split('\n').filter(l => l.trim()).length;
  // ★ AI 연출 자막 풍부하게: 대본 세그먼트의 5배, 최소 30개
  const targetCount = Math.max(segmentCount * 5, 30);

  const summarySection = contentSummary
    ? `\n## ★★★ 영상 전체 내용 (반드시 먼저 읽고 완전히 이해하세요!) ★★★
${filterFillerWords(contentSummary)}\n`
    : '';

  // 침묵 구간 힌트
  let silenceHint = '';
  if (silentGaps && silentGaps.length > 0) {
    const gapLines = silentGaps.map(g =>
      `  ▸ ${g.start.toFixed(1)}s ~ ${g.end.toFixed(1)}s (${g.duration.toFixed(1)}초 침묵) → 상황자막 필수!`
    ).join('\n');
    silenceHint = `\n## 🔇 침묵 구간 (상황자막 필수 배치!)
침묵 = 의미 있는 순간. 긴장감/여운/반전의 기회!
${gapLines}\n`;
  }

  // 임팩트 구간 힌트
  let impactHint = '';
  if (impactZones && impactZones.length > 0) {
    const zoneLines = impactZones.map(z =>
      `  ▸ ${z.start.toFixed(1)}s ~ ${z.end.toFixed(1)}s [${z.type}] → 예능자막 집중!`
    ).join('\n');
    impactHint = `\n## ⚡ 고에너지 구간 (리액션 자막 집중!)
빠른 발화/고에너지 구간에 시청자 공감 자막을 밀도 있게 배치하세요.
${zoneLines}\n`;
  }

  // 맥락 분석 결과가 있으면 프롬프트에 포함
  let contextSection = '';
  if (contextAnalysis) {
    const keyPts = contextAnalysis.keyPoints?.map((p, i) => `  ${i + 1}. ${p}`).join('\n') || '';
    contextSection = `
## 🎯 영상 맥락 (AI 분석 결과 — 반드시 반영!)
- **주제**: ${contextAnalysis.topic}
- **분위기**: ${contextAnalysis.mood}
- **타겟 시청자**: ${contextAnalysis.audience}
- **화자 말투**: ${contextAnalysis.speakerStyle}
- **핵심 포인트** (여기에 자막을 집중 배치!):
${keyPts}

★ 위 맥락에 100% 맞는 자막만 생성하세요! 맥락과 무관한 자막 = 실격! ★
`;
  }

  return `당신은 MBC/tvN 간판 예능 PD 출신 유튜브 자막 연출 디렉터입니다.
★ 당신의 자막 하나가 영상의 조회수를 10배 올립니다. ★
${contextSection}
## STEP 1: 대본 완전 분석
대본을 처음부터 끝까지 읽고 아래를 파악하세요:
1) 이 영상의 핵심 주제는?
2) 화자의 감정 흐름 (시작 → 전환점 → 클라이맥스 → 마무리)
3) 시청자가 "ㅋㅋㅋ" 할 포인트, "와..." 할 포인트, "헐" 할 포인트
${summarySection}
## STEP 2: 원본 대본 (참고용 — 절대 반복 금지!)
${transcriptText}
${silenceHint}${impactHint}
## ★★★ 예능 PD 모드 — 핵심 원칙 ★★★

### 비율 (절대 준수!)
- 연출 자막 80% 이상 (예능 + 상황 + 설명 + 맥락)
- 대본 반복/요약 자막 = 0%! 대본은 이미 화면에 표시됨!

### 자막 유형 배분

#### 예능 (40%) — 시청자 속마음 + 공감 폭발
화자가 말할 때 시청자가 속으로 느끼는 감정을 대신 표현.
매번 전혀 다른 말투/패턴으로! 반복 = 실격!
· "아니 이게 된다고??" / "잠깐 뭐라고??"
· "나만 이렇게 느끼나" / "편집자 웃참 실패"
· "댓글란 예상: ㅋㅋㅋ" / "이건 인정..."
· "와 진짜 소름" / "구독 안 누르면 손해"

#### 상황 (25%) — PD의 연출 무기
침묵/전환/반전 순간을 드라마틱하게 연출.
특히 침묵 구간(1.5초+)에 반드시 배치!
· "[그리고 3초 후...]" / "[이때까지만 해도...]"
· "[긴장감 MAX]" / "[반전 주의보]"
· "[갑자기 조용...]" / "[여기서부터 실화]"
· "[잠깐! 놓치면 안 됨]" / "[두근두근]"

#### 설명 (20%) — 임팩트 강조
핵심 포인트를 짧고 강렬하게. 시청자가 스크린샷 찍을 만한 한 줄.
· "★오늘의 핵심★" / "여기가 포인트"
· "한줄요약: 역대급" / "이거 진짜 중요"

#### 맥락 (15%) — TMI/비하인드
시청자가 알면 더 재미있는 정보.
· "참고로 이거 첫 도전" / "아는 사람만 아는 포인트"
· "사실 여기서..." / "편집하다 발견"

## 절대 규칙
1. ★ 자막 = 무조건 1줄, 최대 12자! ★ (14자 초과 = 실격)
2. ★ 연출 자막만! 대본 내용 반복/요약 = 실격! ★
3. ★ 타임스탬프는 대본 사이 빈 구간에 배치! 대본과 겹치면 안 됨! ★
4. 최소 ${targetCount}개! 빈 구간 없이 꽉 채우세요!
5. 각 자막 1~2초 노출
6. 자막끼리 시간 겹침 금지 (최소 0.3초 간격)
7. 영상 처음~끝까지 균등 분배
8. 같은 패턴/말투/표현 반복 금지! 매번 신선하게!
9. 이모지 금지
10. 대본과 관련 없는 엉뚱한 자막 절대 금지!

## 출력 형식
JSON 배열만 출력 (마크다운 코드블록 없이).
★★★ 모든 text는 반드시 한국어로만. ★★★
type은 "예능", "상황", "설명", "맥락" 중 하나:
[{"startTime": 0.0, "endTime": 2.5, "text": "자막내용", "type": "예능"}]`;
}

// AI 응답에서 JSON 배열 안전하게 파싱
function safeParseJsonArray(raw: string): any[] | null {
  let text = raw.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const jsonMatch = text.match(/\[\s*\{[\s\S]*\}\s*\]/);
  if (!jsonMatch) return null;

  let jsonStr = jsonMatch[0]
    .replace(/,\s*([}\]])/g, '$1')            // trailing comma
    .replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":') // unquoted keys
    .replace(/:\s*'([^']*)'/g, ': "$1"')       // single → double quotes
    .replace(/\n/g, ' ');

  try {
    const arr = JSON.parse(jsonStr);
    return Array.isArray(arr) && arr.length > 0 ? arr : null;
  } catch {
    // fallback: 개별 객체 파싱
    const results: any[] = [];
    for (const m of jsonStr.matchAll(/\{[^{}]+\}/g)) {
      try { results.push(JSON.parse(m[0])); } catch { /* skip */ }
    }
    return results.length > 0 ? results : null;
  }
}

// 재시도 가능한 fetch (503/429 대응)
const MAX_RETRIES = 3;
const RETRY_DELAYS = [2000, 5000, 10000]; // ms

async function fetchWithRetry(url: string, options: RequestInit): Promise<Response> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    const response = await fetch(url, options);
    if (response.ok) return response;

    // 503(과부하) 또는 429(Rate Limit)만 재시도
    if ((response.status === 503 || response.status === 429) && attempt < MAX_RETRIES) {
      const delay = RETRY_DELAYS[attempt] ?? 10000;
      console.warn(`[Gemini] ${response.status} 응답, ${delay / 1000}초 후 재시도 (${attempt + 1}/${MAX_RETRIES})`);
      await new Promise(r => setTimeout(r, delay));
      continue;
    }

    return response; // 다른 에러는 그대로 반환
  }
  // 도달 불가하지만 TypeScript 만족
  throw new Error('Max retries exceeded');
}

// 단일 청크 처리 함수 (Gemini 전용)
async function processChunk(
  transcripts: any[],
  geminiKey: string,
  contentSummary?: string,
  contextAnalysis?: { topic: string; mood: string; audience: string; keyPoints: string[]; speakerStyle: string } | null,
): Promise<any[]> {
  const transcriptText = transcripts
    .map((t: any) => `[${(t.startTime ?? 0).toFixed(1)}s - ${(t.endTime ?? 0).toFixed(1)}s] ${t.editedText || t.originalText || t.text || ''}`)
    .join('\n');

  // 예능 PD 모드: 청크별 침묵/임팩트 분석
  const silentGaps = detectSilentGaps(transcripts);
  const impactZones = detectImpactZones(transcripts);

  const prompt = buildPrompt(transcriptText, contentSummary, silentGaps, impactZones, contextAnalysis);
  console.log(`[processChunk] Gemini, textLen=${transcriptText.length}`);

  for (const model of GEMINI_MODELS) {
    try {
      const response = await fetchWithRetry(
        `https://generativelanguage.googleapis.com/${GEMINI_API_VERSION}/models/${model}:generateContent?key=${geminiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.8,
              maxOutputTokens: 16384,
            },
          }),
        }
      );

      if (!response.ok) {
        const errBody = await response.text().catch(() => '');
        console.warn(`[Gemini] ${model} HTTP ${response.status}: ${errBody.slice(0, 200)}`);
        continue;
      }

      const result = await response.json();
      const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
      console.log(`[Gemini] ${model} 응답 길이: ${rawText.length}자`);
      const subtitles = safeParseJsonArray(rawText);
      if (subtitles) {
        console.log(`[Gemini] ${model} 파싱 성공: ${subtitles.length}개 자막`);
        return subtitles;
      }
      console.warn(`[Gemini] ${model} JSON 파싱 실패, rawText: ${rawText.slice(0, 200)}`);
    } catch (e: any) {
      console.warn(`[Gemini] ${model} 에러:`, e.message);
      continue;
    }
  }

  console.error('[processChunk] Gemini 모든 모델 실패');
  return [];
}

export async function POST(request: NextRequest) {
  try {
    const { transcripts, customPrompt } = await request.json();

    if (!transcripts || !Array.isArray(transcripts)) {
      return NextResponse.json({ error: '대본 데이터가 필요합니다' }, { status: 400 });
    }

    const geminiKey = process.env.GEMINI_API_KEY;

    if (!geminiKey) {
      console.error('[AI 자막] GEMINI_API_KEY 미설정');
      return NextResponse.json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다.' }, { status: 500 });
    }

    console.log(`[AI 자막 API] transcripts=${transcripts.length}개`);

    // customPrompt가 있으면 기존 방식 (단일 호출)
    if (customPrompt) {
      const transcriptText = transcripts
        .map((t: any) => `[${(t.startTime ?? 0).toFixed(1)}s - ${(t.endTime ?? 0).toFixed(1)}s] ${t.editedText || t.originalText || t.text || ''}`)
        .join('\n');

      const prompt = customPrompt.includes('현재 자막 목록') 
        ? customPrompt 
        : buildPrompt(transcriptText);

      // 단일 API 호출
      if (geminiKey) {
        for (const model of GEMINI_MODELS) {
          try {
            const response = await fetchWithRetry(
              `https://generativelanguage.googleapis.com/${GEMINI_API_VERSION}/models/${model}:generateContent?key=${geminiKey}`,
              {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  contents: [{ parts: [{ text: prompt }] }],
                  generationConfig: { temperature: 0.8, maxOutputTokens: 8192 },
                }),
              }
            );

            if (!response.ok) continue;

            const result = await response.json();
            let text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
            text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

            const subtitles = safeParseJsonArray(text) ?? JSON.parse(text);
            if (Array.isArray(subtitles) && subtitles.length > 0) {
              return NextResponse.json({ subtitles });
            }
          } catch (e: any) {
            console.error(`[AI 자막] customPrompt 모델 ${model} 실패:`, e.message);
            continue;
          }
        }
      }

      return NextResponse.json({ error: 'AI 자막 생성 실패' }, { status: 500 });
    }

    // 대본 전체 시간 계산
    const maxTime = Math.max(...transcripts.map((t: any) => t.endTime || 0));
    console.log(`[AI 자막] 총 길이: ${(maxTime / 60).toFixed(1)}분`);

    // 청크로 나누기 (2분씩)
    const chunks: any[][] = [];
    for (let startTime = 0; startTime < maxTime; startTime += CHUNK_DURATION) {
      const endTime = startTime + CHUNK_DURATION;
      const chunkTranscripts = transcripts.filter((t: any) => 
        t.startTime >= startTime && t.startTime < endTime
      );
      if (chunkTranscripts.length > 0) {
        chunks.push(chunkTranscripts);
      }
    }

    console.log(`[AI 자막] ${chunks.length}개 청크로 분할 처리`);

    // 전체 맥락 생성
    const contentSummary = buildContentSummary(transcripts);

    // ★ 1차: 대본 맥락 분석 (주제/분위기/핵심포인트 추출)
    const contextAnalysis = await analyzeTranscriptContext(contentSummary, geminiKey);
    if (contextAnalysis) {
      console.log(`[AI 자막] 맥락 분석 완료 — 주제: ${contextAnalysis.topic}, 분위기: ${contextAnalysis.mood}, 타겟: ${contextAnalysis.audience}`);
    }

    // 2차: 청크 순차 처리 (맥락 분석 결과 포함)
    const allSubtitles: any[] = [];

    for (let i = 0; i < chunks.length; i++) {
      let subs: any[] = [];
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          subs = await processChunk(chunks[i], geminiKey, contentSummary, contextAnalysis);
          break;
        } catch (e: any) {
          console.warn(`[AI 자막] 청크 ${i + 1}/${chunks.length} 시도 ${attempt + 1}/3 실패:`, e.message);
          if (attempt < 2) await new Promise(r => setTimeout(r, 3000 * (attempt + 1)));
        }
      }
      allSubtitles.push(...subs);
      console.log(`[AI 자막] 청크 ${i + 1}/${chunks.length} 완료 (${subs.length}개 자막)`);
      // 청크 간 딜레이 (rate limit 방지)
      if (i < chunks.length - 1) await new Promise(r => setTimeout(r, 1000));
    }

    // ★ 1줄 강제: 12자 초과 자막 자르기 (줄바꿈 제거 + 말줄임)
    for (const sub of allSubtitles) {
      if (sub.text) {
        sub.text = sub.text.replace(/\n/g, ' ').trim();
        if (sub.text.length > 14) {
          sub.text = sub.text.slice(0, 12) + '...';
        }
      }
    }

    // 시간순 정렬
    allSubtitles.sort((a, b) => a.startTime - b.startTime);

    // ★ 대본과 겹치는 AI 자막을 대본 사이 빈 구간으로 밀어넣기 (싱크 보정)
    const sortedTranscripts = [...transcripts].sort((a: any, b: any) => (a.startTime ?? 0) - (b.startTime ?? 0));
    for (const ai of allSubtitles) {
      // AI 자막이 대본과 겹치는지 체크
      for (const t of sortedTranscripts) {
        const tStart = t.startTime ?? 0;
        const tEnd = t.endTime ?? 0;
        if (ai.startTime < tEnd && ai.endTime > tStart) {
          // 겹침 → 대본 뒤로 밀기
          if (ai.startTime < tStart) {
            ai.endTime = Math.min(ai.endTime, tStart - 0.1);
          } else {
            ai.startTime = tEnd + 0.1;
            ai.endTime = Math.max(ai.endTime, ai.startTime + 1.0);
          }
        }
      }
      // 최소 1초 유지
      if (ai.endTime - ai.startTime < 0.5) {
        ai.endTime = ai.startTime + 1.0;
      }
    }

    // 보정 후 재정렬 + 겹침 해소
    allSubtitles.sort((a, b) => a.startTime - b.startTime);
    for (let i = 1; i < allSubtitles.length; i++) {
      if (allSubtitles[i].startTime < allSubtitles[i - 1].endTime) {
        allSubtitles[i].startTime = allSubtitles[i - 1].endTime + 0.1;
        if (allSubtitles[i].endTime <= allSubtitles[i].startTime) {
          allSubtitles[i].endTime = allSubtitles[i].startTime + 1.0;
        }
      }
    }

    console.log(`[AI 자막] 총 ${allSubtitles.length}개 자막 생성 완료 (싱크 보정 적용)`);

    if (allSubtitles.length === 0) {
      return NextResponse.json({ error: 'AI가 자막을 생성하지 못했습니다. 대본 내용을 확인하거나 다시 시도해주세요.' }, { status: 500 });
    }

    return NextResponse.json({ subtitles: allSubtitles });

  } catch (error: any) {
    console.error('[AI 자막] 처리 에러:', error?.message || error);
    return NextResponse.json({ error: `자막 생성 중 오류: ${error?.message || '알 수 없는 오류'}` }, { status: 500 });
  }
}
