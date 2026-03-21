import { NextRequest, NextResponse } from 'next/server';

// 사용 가능한 Gemini 모델 목록 (v1beta 엔드포인트 사용)
const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
];

// Gemini API 엔드포인트 (v1beta 사용 — v1은 최신 모델 미지원)
const GEMINI_API_VERSION = 'v1beta';

// 청크 크기 (초 단위) - 3분씩 나눔 (더 긴 맥락 파악)
const CHUNK_DURATION = 180;

// 프롬프트 생성 함수
function buildPrompt(transcriptText: string, isChunk: boolean = false): string {
  return `당신은 유튜브 조회수 1000만 영상의 자막 연출 전문가입니다.
아래 대본의 **문맥을 깊이 이해**하고, 시청자가 빠져들게 만드는 연출 자막을 만들어주세요.

★★★ 절대 규칙 ★★★
1. 대본(말자막)은 이미 별도로 있습니다. **대본 내용을 절대 반복/요약하지 마세요!**
2. 대본의 문맥을 파악해서 "그 순간 시청자가 느낄 감정/생각"을 자막으로 표현하세요
3. 뻔한 자막 금지! "와 대박" 같은 식상한 표현 대신, 상황에 딱 맞는 구체적 반응을 쓰세요
4. 같은 내용 절대 중복 금지
5. ★ 대본의 2배 이상 많이 만드세요! 빈 구간이 없어야 합니다 ★

## 원본 대본 (참고용 — 이 내용을 반복하면 안 됨!)
${transcriptText}

## 자막 유형 3가지 (골고루 섞되, 문맥에 맞게!)
- **예능** (40%): 그 상황에 딱 맞는 시청자 속마음
  · 누가 자랑할 때 → "이거 은근 플렉스 아닌가요?"
  · 실수할 때 → "아... 저거 나도 해봄 ㅋㅋ"
  · 맛있는 거 먹을 때 → "침 삼키는 소리 들린다"
  · 긴장 상황 → "심장이 멈추는 줄..."
- **상황** (30%): 드라마 감독처럼 분위기 연출
  · "[이 선택이 모든 걸 바꿀 줄은...]"
  · "[조용해진 현장]", "[숨 멎는 3초]"
  · 감동 → "[여기서 눈물 참기 챌린지]"
- **설명** (30%): 시청자가 놓칠 수 있는 포인트 짚어주기
  · "참고로 이거 원래 불가능한 건데?"
  · "★여기가 핵심★ 잘 보세요"
  · "쉽게 말해서 역대급이라는 뜻"

## 핵심 규칙
- ★ 대본 세그먼트 수의 2배 이상 만드세요! ★
- 대본 3초당 최소 1개의 AI 자막 — 빈 구간 금지!
- 각 자막 1~3초 노출 (짧고 임팩트!)
- 자막끼리 시간 겹침 금지 (최소 0.5초 간격)
- 영상 처음~끝까지 균등하게 분배
- 예능/상황/설명 골고루 (한 종류 연속 3개 금지)
- 이모지 쓰지 마세요 (깔끔하게)
- **문맥과 안 맞는 엉뚱한 자막은 넣지 마세요**

## 출력 형식
JSON 배열만 출력 (마크다운 코드블록 없이).
★★★ 모든 text는 반드시 한국어로만. ★★★
type은 "예능", "상황", "설명" 중 하나:
[{"startTime": 0.0, "endTime": 3.5, "text": "자막내용", "type": "예능"}]`;
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
): Promise<any[]> {
  const transcriptText = transcripts
    .map((t: any) => `[${(t.startTime ?? 0).toFixed(1)}s - ${(t.endTime ?? 0).toFixed(1)}s] ${t.editedText || t.originalText || t.text || ''}`)
    .join('\n');

  const prompt = buildPrompt(transcriptText, true);
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
              maxOutputTokens: 8192,
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

    // 각 청크 병렬 처리 (최대 3개씩)
    const allSubtitles: any[] = [];
    
    for (let i = 0; i < chunks.length; i += 3) {
      const batch = chunks.slice(i, i + 3);
      const results = await Promise.all(
        batch.map(chunk => processChunk(chunk, geminiKey))
      );
      results.forEach(subs => allSubtitles.push(...subs));
      console.log(`[AI 자막] 청크 ${i + 1}-${Math.min(i + 3, chunks.length)} 완료`);
    }

    // 시간순 정렬
    allSubtitles.sort((a, b) => a.startTime - b.startTime);

    console.log(`[AI 자막] 총 ${allSubtitles.length}개 자막 생성 완료`);

    if (allSubtitles.length === 0) {
      return NextResponse.json({ error: 'AI가 자막을 생성하지 못했습니다. 대본 내용을 확인하거나 다시 시도해주세요.' }, { status: 500 });
    }

    return NextResponse.json({ subtitles: allSubtitles });

  } catch (error: any) {
    console.error('[AI 자막] 처리 에러:', error?.message || error);
    return NextResponse.json({ error: `자막 생성 중 오류: ${error?.message || '알 수 없는 오류'}` }, { status: 500 });
  }
}
