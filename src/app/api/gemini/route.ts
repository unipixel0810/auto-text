import { NextRequest, NextResponse } from 'next/server';

// 사용 가능한 Gemini 모델 목록
const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
];

export async function POST(request: NextRequest) {
  try {
    const { transcripts } = await request.json();
    
    if (!transcripts || !Array.isArray(transcripts)) {
      return NextResponse.json({ error: '대본 데이터가 필요합니다' }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API 키가 설정되지 않았습니다' }, { status: 500 });
    }

    // 대본 텍스트 생성
    const transcriptText = transcripts
      .map((t: any) => `[${t.startTime.toFixed(1)}s - ${t.endTime.toFixed(1)}s] ${t.text}`)
      .join('\n');

    const prompt = `당신은 유튜브 영상 자막 전문가입니다. 시청자가 재미있게 볼 수 있는 자막을 만들어주세요.

## 원본 대본 (STT) - 참고용
${transcriptText}

## 자막 유형 가이드
1. **예능 자막 (ENTERTAINMENT)** - 재미있는 표현, 강조, 리액션
   예: "이거 진짜 대박인데?", "아니 근데 진심으로?", "실화냐고요 ㄷㄷ"
2. **상황 자막 (SITUATION)** - 상황 설명, 심리 묘사
   예: "(살짝 긴장하는 중)", "지금 완전 신나는 상황", "(이게 되네...?)"
3. **설명 자막 (EXPLANATION)** - 내용 요약, 핵심 정보
   예: "결론은 이렇습니다", "여기서 중요한 포인트!", "쉽게 말하면~"

## 중요 규칙
- 원본 대본을 **재미있고 자연스럽게** 다시 표현할 것
- 말하듯이 자연스러운 문장으로 (뚝뚝 끊기지 않게)
- 이모지는 **가끔만 랜덤하게** 사용 (매번 넣지 말 것!)
- 각 시간대에 **하나의 자막만** 생성
- JSON 배열만 출력 (마크다운 없이)

출력: [{"startTime": 0.0, "endTime": 2.5, "text": "자막 내용", "type": "ENTERTAINMENT", "reason": "이유"}]`;

    let lastError = null;

    // 여러 모델 시도
    for (const model of GEMINI_MODELS) {
      try {
        console.log(`Gemini 모델 시도: ${model}`);
        
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
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
          console.error(`${model} 에러:`, errorText);
          lastError = errorText;
          continue;
        }

        const result = await response.json();
        let text = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
        
        // JSON 파싱
        text = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        
        const subtitles = JSON.parse(text);
        
        if (Array.isArray(subtitles) && subtitles.length > 0) {
          console.log(`${model} 성공! ${subtitles.length}개 자막 생성`);
          return NextResponse.json({ subtitles, model });
        }
        
      } catch (e) {
        console.error(`${model} 처리 에러:`, e);
        lastError = e;
        continue;
      }
    }

    return NextResponse.json({ 
      error: `모든 Gemini 모델 실패: ${lastError}` 
    }, { status: 500 });
    
  } catch (error) {
    console.error('Gemini 처리 에러:', error);
    return NextResponse.json({ error: '자막 생성 중 오류가 발생했습니다' }, { status: 500 });
  }
}
