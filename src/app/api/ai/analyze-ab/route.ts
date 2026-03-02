import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ 
        analysis: "Gemini API 키가 설정되지 않았습니다. 결과 데이터를 직접 분석해 주세요." 
      });
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `너는 A/B 테스트 분석 전문가야. 아래의 실험 결과를 바탕으로 전환율을 높이기 위한 인사이트와 구체적인 개선 방향을 한국어로 제안해줘.\n\n${prompt}`
            }]
          }]
        }),
      }
    );

    const data = await response.json();
    const analysis = data.candidates?.[0]?.content?.parts?.[0]?.text || "분석 결과를 생성할 수 없습니다.";

    return NextResponse.json({ analysis });
  } catch (err) {
    console.error('AI analysis error:', err);
    return NextResponse.json({ 
      analysis: "AI 분석 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요." 
    }, { status: 500 });
  }
}
