import { NextRequest, NextResponse } from 'next/server';

// 구조화된 분석 결과 타입
export interface ABAnalysisResult {
  verdict: 'B 채택 권장' | 'A 유지 권장' | '데이터 부족' | '무의미한 차이';
  confidence: '높음(95%+)' | '중간(80-95%)' | '낮음(80% 미만)';
  summary: string;
  insights: string[];
  actions: { priority: '즉시' | '단기' | '장기'; action: string; expected_impact: string }[];
  next_test: string;
}

const SYSTEM_PROMPT = `당신은 전환율 최적화(CRO) 전문가입니다.
A/B 테스트 통계 데이터를 분석하여 반드시 아래 JSON 형식으로만 응답하세요.
JSON 외 다른 텍스트는 절대 포함하지 마세요.

{
  "verdict": "B 채택 권장" 또는 "A 유지 권장" 또는 "데이터 부족" 또는 "무의미한 차이",
  "confidence": "높음(95%+)" 또는 "중간(80-95%)" 또는 "낮음(80% 미만)",
  "summary": "2문장 이내 핵심 요약",
  "insights": ["인사이트 1", "인사이트 2", "인사이트 3"],
  "actions": [
    { "priority": "즉시", "action": "구체적 액션", "expected_impact": "예상 효과" },
    { "priority": "단기", "action": "구체적 액션", "expected_impact": "예상 효과" }
  ],
  "next_test": "다음에 테스트하면 좋을 가설 1문장"
}`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({
        analysis: '데이터 없음',
        structured: null,
        error: 'API 키 미설정',
      });
    }

    // legacy prompt 방식 + 신규 structured 방식 모두 지원
    const prompt: string = body.prompt ?? body.data ?? '';

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,        // 낮은 온도 → 일관된 JSON 출력
            maxOutputTokens: 600,    // 비용 최소화: 구조화 JSON은 400토큰 이하
            responseMimeType: 'application/json',
          },
        }),
      }
    );

    const data = await response.json();
    const rawText: string = data.candidates?.[0]?.content?.parts?.[0]?.text ?? '';

    // JSON 파싱 시도
    let structured: ABAnalysisResult | null = null;
    try {
      // responseMimeType json 모드에서도 때로 마크다운 코드블록으로 감싸질 수 있음
      const cleaned = rawText.replace(/^```json\s*/i, '').replace(/\s*```$/i, '').trim();
      structured = JSON.parse(cleaned) as ABAnalysisResult;
    } catch {
      // 파싱 실패 시 rawText를 legacy analysis로 반환
    }

    return NextResponse.json({
      analysis: structured?.summary ?? rawText ?? '분석 결과를 생성할 수 없습니다.',
      structured,
    });
  } catch (err) {
    console.error('[analyze-ab] error:', err);
    return NextResponse.json(
      { analysis: 'AI 분석 중 오류가 발생했습니다.', structured: null },
      { status: 500 }
    );
  }
}
