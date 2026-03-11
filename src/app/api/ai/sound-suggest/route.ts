import { NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const maxDuration = 60;

export async function POST(req: Request) {
  try {
    const { prompt, clips } = await req.json();
    if (!prompt) {
      return NextResponse.json({ error: 'prompt required' }, { status: 400 });
    }

    const apiKey = process.env.GOOGLE_AI_API_KEY || process.env.NEXT_PUBLIC_GEMINI_API_KEY || '';
    if (!apiKey) {
      // API 키 없으면 프리셋 제안으로 폴백
      return NextResponse.json({ suggestions: buildPresetSuggestions(prompt) });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

    // 기존 자막 정보를 컨텍스트로 제공
    const clipContext = clips && clips.length > 0
      ? `\n[현재 자막 클립 목록]\n${clips.slice(0, 20).map((c: { name: string; startTime: number; duration: number }) => `- "${c.name}" (${c.startTime.toFixed(1)}s, ${c.duration.toFixed(1)}초)`).join('\n')}`
      : '';

    const systemPrompt = `당신은 유튜브 영상 편집 전문가입니다. 사용자가 요청한 사운드/음향 효과에 맞는 설명과 배치 시간을 제안해주세요.${clipContext}

사용자 요청: "${prompt}"

다음 JSON 배열 형식으로만 응답하세요 (다른 설명 없음):
[
  {"text": "효과음/BGM 설명 (한국어, 15자 이내)", "time": 배치_추천_초(숫자)},
  ...
]

규칙:
- 최대 5개 제안
- 각 text는 실제 사운드 효과를 구체적으로 묘사 (예: "긴장감 폭발 오케스트라 BGM", "코믹 효과음 뿅뿅", "웃음 소리 하하하")
- time은 현재 자막이 없는 구간 또는 -1 (배치 무관)
- 반드시 JSON 배열만 출력`;

    const result = await model.generateContent(systemPrompt);
    const text = result.response.text().trim();

    // JSON 파싱
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      return NextResponse.json({ suggestions: buildPresetSuggestions(prompt) });
    }

    const suggestions = JSON.parse(jsonMatch[0]);
    return NextResponse.json({ suggestions });
  } catch (err) {
    console.error('sound-suggest error:', err);
    // 오류 시 프리셋 제안으로 폴백
    const { prompt } = await req.json().catch(() => ({ prompt: '' }));
    return NextResponse.json({ suggestions: buildPresetSuggestions(prompt || '') });
  }
}

// Gemini 없을 때 키워드 기반 프리셋 제안
function buildPresetSuggestions(prompt: string): { text: string; time: number }[] {
  const p = prompt.toLowerCase();
  if (p.includes('긴장') || p.includes('스릴')) {
    return [
      { text: '긴장감 폭발 오케스트라 BGM', time: -1 },
      { text: '심장 박동 쿵쿵 효과음', time: -1 },
      { text: '불안한 현악기 BGM', time: -1 },
    ];
  }
  if (p.includes('웃음') || p.includes('코믹') || p.includes('ㅋㅋ')) {
    return [
      { text: '폭소 관객 웃음 소리', time: -1 },
      { text: '코믹 뿅뿅 효과음', time: -1 },
      { text: '유쾌한 리코더 BGM', time: -1 },
    ];
  }
  if (p.includes('슬픔') || p.includes('눈물') || p.includes('피아노')) {
    return [
      { text: '슬픈 피아노 멜로디', time: -1 },
      { text: '감성 어쿠스틱 BGM', time: -1 },
    ];
  }
  if (p.includes('박수') || p.includes('환호')) {
    return [
      { text: '관중 박수 갈채', time: -1 },
      { text: '환호성 효과음', time: -1 },
    ];
  }
  if (p.includes('적막') || p.includes('silence') || p.includes('조용')) {
    return [
      { text: '정적 효과음 (침묵)', time: -1 },
      { text: '바람 소리 효과음', time: -1 },
    ];
  }
  // 기본
  return [
    { text: `${prompt} 배경음`, time: -1 },
    { text: `${prompt} 효과음`, time: -1 },
  ];
}
