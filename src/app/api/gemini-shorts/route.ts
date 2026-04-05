import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 60;

const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];
const GEMINI_API_VERSION = 'v1beta';

export async function POST(request: NextRequest) {
  try {
    const { transcripts } = await request.json();
    if (!transcripts || !Array.isArray(transcripts) || transcripts.length === 0) {
      return NextResponse.json({ error: '대본 데이터가 필요합니다' }, { status: 400 });
    }

    const geminiKey = process.env.GEMINI_API_KEY;
    if (!geminiKey) {
      return NextResponse.json({ error: 'GEMINI_API_KEY가 설정되지 않았습니다' }, { status: 500 });
    }

    const transcriptText = transcripts
      .map((t: any) => `[${(t.startTime ?? 0).toFixed(1)}s~${(t.endTime ?? 0).toFixed(1)}s] ${t.editedText || t.originalText || t.text || ''}`)
      .join('\n');

    const maxTime = Math.max(...transcripts.map((t: any) => t.endTime || 0));

    const prompt = `당신은 유튜브 쇼츠/릴스/틱톡 전문 편집자입니다.
아래 영상 대본(총 ${Math.round(maxTime)}초)을 분석하여, 가장 재미있고 임팩트 있는 60초 이내 구간 1개를 추천하세요.

[추천 기준]
1. 시청자의 관심을 즉시 끌 수 있는 시작점 (첫 3초가 중요!)
2. 감정적 하이라이트 — 웃음, 놀라움, 감동, 분노, 반전
3. 자연스러운 시작과 끝 (발화 중간에 자르지 않기)
4. 60초 이내 (쇼츠 제한) — 40~55초가 이상적
5. 맥락 없이도 이해 가능한 독립적 구간

[대본]
${transcriptText}

반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트 없이:
{"startTime": 0.0, "endTime": 55.0, "reason": "추천 이유를 한 줄로"}`;

    for (const model of GEMINI_MODELS) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/${GEMINI_API_VERSION}/models/${model}:generateContent?key=${geminiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: { temperature: 0.7, maxOutputTokens: 512 },
            }),
          }
        );

        if (!response.ok) continue;

        const result = await response.json();
        const rawText = result.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        const jsonMatch = cleaned.match(/\{[\s\S]*"startTime"[\s\S]*"endTime"[\s\S]*\}/);
        if (!jsonMatch) continue;

        const parsed = JSON.parse(jsonMatch[0]);
        const startTime = Number(parsed.startTime) || 0;
        let endTime = Number(parsed.endTime) || 60;

        // 60초 제한 강제
        if (endTime - startTime > 60) endTime = startTime + 60;
        // 영상 범위 내로 클램핑
        const clampedEnd = Math.min(endTime, maxTime);

        console.log(`[Shorts] ${model} 추천: ${startTime.toFixed(1)}s~${clampedEnd.toFixed(1)}s — ${parsed.reason}`);
        return NextResponse.json({
          startTime,
          endTime: clampedEnd,
          reason: parsed.reason || '하이라이트 구간',
        });
      } catch (e: any) {
        console.warn(`[Shorts] ${model} 실패:`, e.message);
        continue;
      }
    }

    return NextResponse.json({ error: '숏츠 구간 추천 실패' }, { status: 500 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || '서버 오류' }, { status: 500 });
  }
}
