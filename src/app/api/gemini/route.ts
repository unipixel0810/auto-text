import { NextRequest, NextResponse } from 'next/server';

// 사용 가능한 Gemini 모델 목록
const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
];

// OpenAI 모델
const OPENAI_MODEL = 'gpt-4o-mini';

export async function POST(request: NextRequest) {
  try {
    const { transcripts } = await request.json();
    
    if (!transcripts || !Array.isArray(transcripts)) {
      return NextResponse.json({ error: '대본 데이터가 필요합니다' }, { status: 400 });
    }

    // 대본 텍스트 생성 (editedText 또는 originalText 사용)
    const transcriptText = transcripts
      .map((t: any) => `[${t.startTime.toFixed(1)}s - ${t.endTime.toFixed(1)}s] ${t.editedText || t.originalText || t.text || ''}`)
      .join('\n');

    const prompt = `당신은 유튜브 영상 자막 전문가입니다. 스토리를 이해하고 시청자가 재미있게 볼 수 있는 자막을 만들어주세요.

## 원본 대본 (음성인식 STT 결과)
⚠️ 주의: 아래 대본은 음성인식으로 자동 생성된 것이라 맞춤법이 틀리거나 잘못 인식된 부분이 있을 수 있습니다.
문맥을 파악해서 올바른 단어로 교정해주세요.

${transcriptText}

## 당신의 역할
1. **전체 스토리 파악** - 대본 전체를 읽고 무슨 이야기인지 이해
2. **맞춤법 교정** - 잘못 인식된 단어를 문맥에 맞게 수정 (예: "안녕하세용" → "안녕하세요")
3. **자연스러운 자막 생성** - 시청자가 이해하기 쉽고 재미있게

## 자막 유형 가이드
1. **예능 자막 (ENTERTAINMENT)** - 재미있는 표현, 강조, 리액션
   예: "이거 진짜 대박인데?", "아니 근데 진심으로?", "실화냐고요 ㄷㄷ"
2. **상황 자막 (SITUATION)** - 상황 설명, 심리 묘사
   예: "(살짝 긴장하는 중)", "지금 완전 신나는 상황", "(이게 되네...?)"
3. **설명 자막 (EXPLANATION)** - 내용 요약, 핵심 정보
   예: "결론은 이렇습니다", "여기서 중요한 포인트!", "쉽게 말하면~"

## 중요 규칙
- **맞춤법과 띄어쓰기를 정확하게** 작성할 것
- 원본 대본의 **의미를 유지**하면서 더 명확하게 표현
- 대본에 없는 내용을 지어내지 말 것
- 말하듯이 자연스러운 문장으로 (뚝뚝 끊기지 않게)
- 이모지는 **가끔만** 사용 (매번 넣지 말 것!)
- 각 시간대에 **하나의 자막만** 생성
- JSON 배열만 출력 (마크다운 없이)

출력: [{"startTime": 0.0, "endTime": 2.5, "text": "자막 내용", "type": "ENTERTAINMENT", "reason": "이유"}]`;

    let lastError = null;

    // 1단계: Gemini 모델 시도
    const geminiKey = process.env.GEMINI_API_KEY;
    if (geminiKey) {
      for (const model of GEMINI_MODELS) {
        try {
          console.log(`[AI 자막] Gemini 시도: ${model}`);
          
          const response = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${geminiKey}`,
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
            const errorText = await response.text();
            console.error(`[AI 자막] Gemini ${model} 에러:`, errorText);
            lastError = errorText;
            continue;
          }

          const result = await response.json();
          let text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
          
          // JSON 파싱
          text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          
          const subtitles = JSON.parse(text);
          
          if (Array.isArray(subtitles) && subtitles.length > 0) {
            console.log(`[AI 자막] 성공! ${subtitles.length}개 자막 생성`);
            return NextResponse.json({ subtitles });
          }
          
        } catch (e) {
          console.error(`[AI 자막] Gemini ${model} 처리 에러:`, e);
          lastError = e;
          continue;
        }
      }
    }

    // 2단계: OpenAI 백업 시도
    const openaiKey = process.env.OPENAI_API_KEY;
    if (openaiKey) {
      try {
        console.log(`[AI 자막] OpenAI 백업 시도: ${OPENAI_MODEL}`);
        
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
          
          // JSON 파싱
          text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          
          const subtitles = JSON.parse(text);
          
          if (Array.isArray(subtitles) && subtitles.length > 0) {
            console.log(`[AI 자막] OpenAI 성공! ${subtitles.length}개 자막 생성`);
            return NextResponse.json({ subtitles });
          }
        } else {
          const errorText = await response.text();
          console.error('[AI 자막] OpenAI 에러:', errorText);
          lastError = errorText;
        }
        
      } catch (e) {
        console.error('[AI 자막] OpenAI 처리 에러:', e);
        lastError = e;
      }
    }

    return NextResponse.json({ 
      error: `AI 자막 생성 실패. 잠시 후 다시 시도해주세요.` 
    }, { status: 500 });
    
  } catch (error) {
    console.error('[AI 자막] 처리 에러:', error);
    return NextResponse.json({ error: '자막 생성 중 오류가 발생했습니다' }, { status: 500 });
  }
}
