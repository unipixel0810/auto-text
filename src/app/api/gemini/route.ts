import { NextRequest, NextResponse } from 'next/server';

// 사용 가능한 Gemini 모델 목록
const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
];

// OpenAI 모델
const OPENAI_MODEL = 'gpt-4o-mini';

// 청크 크기 (초 단위) - 3분씩 나눔 (더 긴 맥락 파악)
const CHUNK_DURATION = 180;

// 프롬프트 생성 함수
function buildPrompt(transcriptText: string, isChunk: boolean = false): string {
  return `당신은 예능 PD입니다. 영상에 **재미있는 자막**을 넣어 시청자 몰입도를 높여주세요.

## 원본 대본 (참고용)
${transcriptText}

## ⚠️ 핵심: 대본을 그대로 적지 마세요!
AI 자막은 말을 그대로 받아쓰는 게 아닙니다.
예능 프로그램처럼 **상황을 꾸미고, 강조하고, 재미를 더하는** 역할입니다.

## 자막 유형 (골고루 섞어서 사용)
1. **예능 자막 (ENTERTAINMENT)** - 웃긴 포인트, 과장된 리액션, 드립
   - "이거 실화임?? 🤯", "아니 미쳤다 진짜ㅋㅋㅋ", "역대급 상황 발생"
   - "방금 뭐라고요??", "대박 터졌다", "이게 왜 돼??"
   
2. **상황 자막 (SITUATION)** - 현재 상황을 재밌게 설명
   - "(긴장감 200%)", "(현재 멘붕 상태)", "(심장이 쿵쾅쿵쾅)"
   - "(눈 앞이 캄캄)", "(뇌정지 옴)", "(손이 떨리는 중)"
   
3. **설명 자막 (EXPLANATION)** - 핵심 포인트를 임팩트 있게
   - "⚡ 여기가 핵심!", "결론: 대성공!", "포인트는 바로 이거!"

## ⚠️ 중요: 자막 규칙
- **3~5초마다 하나씩** 자막 생성 (너무 빽빽하게 X)
- **재미있고 임팩트 있게!** 밋밋하면 안 됨
- 예능 프로그램 자막처럼 **과장, 드립, 재미** 요소 필수
- **주어진 시간 범위 전체**에 자막 배치

## 자막 작성 규칙
1. **말을 그대로 적지 말고** 상황/감정을 재밌게 표현
2. **10-20자 정도** 적당한 길이로 (너무 짧으면 재미없음)
3. 이모지는 **30% 정도** 사용해서 생동감 있게
4. **ㅋㅋㅋ, ??, !!** 등 강조 표현 적극 사용

## ⛔⛔⛔ 절대 금지 ⛔⛔⛔
- text 필드에 **시간(00:00:00, 00:00, 타임코드)을 절대 넣지 마세요!**
- 잘못된 예: "00:00:36 그동안 너무 비싼" ❌
- 올바른 예: "가격 실화??" ✅

## 출력 형식
JSON 배열만 출력 (마크다운 코드블록 없이):
[{"startTime": 0.0, "endTime": 2.5, "text": "자막내용만", "type": "ENTERTAINMENT", "reason": "이유"}]`;
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

  // Gemini 시도
  if (geminiKey) {
    for (const model of GEMINI_MODELS) {
      try {
        const response = await fetch(
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
            const response = await fetch(
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
