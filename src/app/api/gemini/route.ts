import { NextRequest, NextResponse } from 'next/server';

// 사용 가능한 Gemini 모델 목록 (2.0-flash는 신규사용자 불가, 2.5-flash 사용)
const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-1.5-flash',
];

// OpenAI 모델
const OPENAI_MODEL = 'gpt-4o-mini';

// 청크 크기 (초 단위) - 3분씩 나눔 (더 긴 맥락 파악)
const CHUNK_DURATION = 180;

// 프롬프트 생성 함수
function buildPrompt(transcriptText: string, isChunk: boolean = false): string {
  return `당신은 예능 PD입니다. 영상의 **핵심 메시지**에만 자막을 넣어 가독성과 몰입도를 높여주세요.

## 원본 대본 (참고용)
${transcriptText}

## ⚠️ 핵심 원칙: 적게, 임팩트 있게!
모든 음성을 자막으로 만들지 마세요.
추임새, 중복 단어, 의미 없는 발화는 과감히 삭제하세요.
**영상의 핵심 메시지가 담긴 순간**에만 자막을 배치합니다.

## 자막 유형 & 비율
1. **예능 자막 (ENTERTAINMENT)** [15%] — "결정적 순간"에만 크게 한 번 등장
   - 감정 폭발, 반전, 핵심 리액션 포인트에서만 사용
   - "이거 실화?? 🤯", "역대급 상황 발생"

2. **상황 자막 (SITUATION)** [15%] — 분위기가 바뀔 때만 은은하게
   - 씬 전환, 분위기 변화, 보충 설명이 필요한 순간
   - "(긴장감 200%)", "(분위기 급반전)"

3. **설명 자막 (EXPLANATION)** [20%] — 정보 전달이 필요한 구간만
   - 핵심 포인트, 수치, 결론을 짧고 명확하게
   - "⚡ 핵심 포인트!", "결론: ~"

4. **대본 자막 (TRANSCRIPT)** [50%] — 화자의 핵심 발언을 깔끔하게 정리
   - 의미 있는 발언만 선별하여 가독성 좋게 정리
   - 추임새, 반복, 불필요한 접속사 제거

## ⚠️ 밀도 & 가독성 규칙
- **7~12초에 하나씩** 자막 생성 (과하게 많이 X)
- 각 자막 최소 **2초 이상** 노출 유지
- **동시에 화면에 2줄 이상 나타나지 않게** — 자막 시간대가 겹치면 안 됨!
- 10~25자 적당한 길이, 문장이 너무 길면 끊어서 배치
- 이모지는 예능 자막에서만 가끔 사용 (전체의 10% 이하)

## ⛔ 절대 금지
- text 필드에 시간/타임코드 넣지 말 것
- 모든 음성을 빠짐없이 자막으로 만들지 말 것
- 같은 내용의 자막이 여러 트랙에 중복되지 않게 할 것

## 출력 형식
JSON 배열만 출력 (마크다운 코드블록 없이):
[{"startTime": 0.0, "endTime": 2.5, "text": "자막내용만", "type": "TRANSCRIPT", "reason": "이유"}]`;
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

// 단일 청크 처리 함수
async function processChunk(
  transcripts: any[],
  geminiKey: string | undefined,
  openaiKey: string | undefined
): Promise<any[]> {
  const transcriptText = transcripts
    .map((t: any) => `[${t.startTime.toFixed(1)}s - ${t.endTime.toFixed(1)}s] ${t.editedText || t.originalText || t.text || ''}`)
    .join('\n');

  const prompt = buildPrompt(transcriptText, true);

  // Gemini 시도 (재시도 포함)
  if (geminiKey) {
    for (const model of GEMINI_MODELS) {
      try {
        const response = await fetchWithRetry(
          `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${geminiKey}`,
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

        if (!response.ok) continue;

        const result = await response.json();
        let text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
        text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

        const subtitles = JSON.parse(text);
        if (Array.isArray(subtitles) && subtitles.length > 0) {
          return subtitles;
        }
      } catch (e) {
        continue;
      }
    }
  }

  // OpenAI 백업
  if (openaiKey) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiKey}`,
        },
        body: JSON.stringify({
          model: OPENAI_MODEL,
          messages: [
            { role: 'system', content: '당신은 유튜브 영상 자막 전문가입니다. JSON 배열만 출력하세요.' },
            { role: 'user', content: prompt },
          ],
          temperature: 0.8,
          max_tokens: 4096,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        let text = result.choices?.[0]?.message?.content || '';
        text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        
        const subtitles = JSON.parse(text);
        if (Array.isArray(subtitles) && subtitles.length > 0) {
          return subtitles;
        }
      }
    } catch (e) {
      // ignore
    }
  }

  return [];
}

export async function POST(request: NextRequest) {
  try {
    const { transcripts, customPrompt } = await request.json();
    
    if (!transcripts || !Array.isArray(transcripts)) {
      return NextResponse.json({ error: '대본 데이터가 필요합니다' }, { status: 400 });
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    const openaiKey = process.env.OPENAI_API_KEY;

    // customPrompt가 있으면 기존 방식 (단일 호출)
    if (customPrompt) {
      const transcriptText = transcripts
        .map((t: any) => `[${t.startTime.toFixed(1)}s - ${t.endTime.toFixed(1)}s] ${t.editedText || t.originalText || t.text || ''}`)
        .join('\n');

      const prompt = customPrompt.includes('현재 자막 목록') 
        ? customPrompt 
        : buildPrompt(transcriptText);

      // 단일 API 호출
      if (geminiKey) {
        for (const model of GEMINI_MODELS) {
          try {
            const response = await fetchWithRetry(
              `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${geminiKey}`,
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

            const subtitles = JSON.parse(text);
            if (Array.isArray(subtitles) && subtitles.length > 0) {
              return NextResponse.json({ subtitles });
            }
          } catch (e) {
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
        batch.map(chunk => processChunk(chunk, geminiKey, openaiKey))
      );
      results.forEach(subs => allSubtitles.push(...subs));
      console.log(`[AI 자막] 청크 ${i + 1}-${Math.min(i + 3, chunks.length)} 완료`);
    }

    // 시간순 정렬
    allSubtitles.sort((a, b) => a.startTime - b.startTime);

    console.log(`[AI 자막] 총 ${allSubtitles.length}개 자막 생성 완료`);
    return NextResponse.json({ subtitles: allSubtitles });
    
  } catch (error) {
    console.error('[AI 자막] 처리 에러:', error);
    return NextResponse.json({ error: '자막 생성 중 오류가 발생했습니다' }, { status: 500 });
  }
}
