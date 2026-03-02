/**
 * Gemini API 자막 생성 서비스
 * AI 기반 자막 생성 (예능/상황/설명)
 */

import type { SubtitleType, SubtitleItem, TranscriptItem } from '@/types/subtitle';

// ============================================
// 타입 정의
// ============================================

export interface GeminiSubtitleRequest {
  /** 원본 대본 목록 */
  transcripts: TranscriptItem[];
}

export interface GeneratedSubtitle {
  startTime: number;
  endTime: number;
  text: string;
  type: SubtitleType;
  reason: string;
}

// ============================================
// 프롬프트 생성
// ============================================

function buildPrompt(transcripts: TranscriptItem[]): string {
  const transcriptText = transcripts
    .map(t => `[${t.startTime.toFixed(1)}s - ${t.endTime.toFixed(1)}s] ${t.editedText || t.originalText}`)
    .join('\n');

  return `당신은 예능 PD입니다. 영상에 **재미있는 자막**을 촘촘하게 넣어주세요.

## 원본 대본
${transcriptText}

## 핵심: 대본 그대로 X, 꾸며서 표현!

## 자막 유형
1. **ENTERTAINMENT** - 리액션 ("실화?? 🤯", "아니 ㅋㅋㅋ")
2. **SITUATION** - 상황 ("(긴장 MAX)", "(멘붕)")  
3. **EXPLANATION** - 포인트 ("⚡ 핵심!", "결론: ~")

## ⚠️ 필수 규칙
- **3~5초마다 하나씩** 자막 생성
- **재미있고 임팩트 있게!** (예능처럼)
- 10-20자 적당한 길이
- ⛔ 텍스트에 시간 넣지 말 것!

출력: [{"startTime": 0.0, "endTime": 2.5, "text": "자막", "type": "ENTERTAINMENT", "reason": "이유"}]`;
}

// ============================================
// Gemini API 호출
// ============================================

export async function generateSubtitlesWithGemini(
  request: GeminiSubtitleRequest,
  apiKey?: string, // 더 이상 필요 없음 (서버에서 관리)
  onProgress?: (percent: number, message: string) => void
): Promise<GeneratedSubtitle[]> {
  console.log('[Gemini] 자막 생성 요청, 대본 수:', request.transcripts.length);
  
  onProgress?.(10, 'AI 서버 연결 중...');

  try {
    // 서버 API Route 호출 (API 키는 서버에서 관리)
    const response = await fetch('/api/gemini', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcripts: request.transcripts }),
    });

    onProgress?.(50, '자막 생성 중...');

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || '자막 생성 실패');
    }

    onProgress?.(90, '응답 처리 중...');

    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error);
    }

    const subtitles: GeneratedSubtitle[] = data.subtitles;
    console.log('[AI 자막] 생성 완료:', subtitles.length, '개');
    onProgress?.(100, '자막 생성 완료!');
    
    return subtitles;

  } catch (error) {
    console.error('[Gemini] 오류:', error);
    throw error instanceof Error ? error : new Error(String(error));
  }
}

// ============================================
// 자막 변환
// ============================================

// 랜덤 스타일 프리셋 (다양한 색상/배경 조합)
const RANDOM_STYLES = [
  // 흰색 글씨 + 검정 테두리 (기본)
  { color: '#FFFFFF', backgroundColor: 'transparent', strokeColor: '#000000', strokeWidth: 3 },
  // 노란색 글씨 + 검정 테두리
  { color: '#FFFF00', backgroundColor: 'transparent', strokeColor: '#000000', strokeWidth: 3 },
  // 흰색 글씨 + 빨간 배경
  { color: '#FFFFFF', backgroundColor: '#FF0000', strokeColor: '#000000', strokeWidth: 1 },
  // 검정 글씨 + 노란 배경
  { color: '#000000', backgroundColor: '#FFFF00', strokeColor: '#000000', strokeWidth: 0 },
  // 흰색 글씨 + 파란 배경
  { color: '#FFFFFF', backgroundColor: '#0066FF', strokeColor: '#000000', strokeWidth: 1 },
  // 검정 글씨 + 흰색 배경
  { color: '#000000', backgroundColor: '#FFFFFF', strokeColor: '#000000', strokeWidth: 0 },
  // 시안 글씨 + 검정 테두리
  { color: '#00FFFF', backgroundColor: 'transparent', strokeColor: '#000000', strokeWidth: 3 },
  // 핑크 글씨 + 검정 테두리
  { color: '#FF69B4', backgroundColor: 'transparent', strokeColor: '#000000', strokeWidth: 3 },
  // 흰색 글씨 + 초록 배경
  { color: '#FFFFFF', backgroundColor: '#00CC00', strokeColor: '#000000', strokeWidth: 1 },
  // 흰색 글씨 + 주황 배경
  { color: '#000000', backgroundColor: '#FF9900', strokeColor: '#000000', strokeWidth: 0 },
];

export function convertToSubtitleItems(
  generated: GeneratedSubtitle[]
): SubtitleItem[] {
  return generated.map((item, index) => {
    // 랜덤 스타일 선택
    const randomStyle = RANDOM_STYLES[Math.floor(Math.random() * RANDOM_STYLES.length)];
    
    return {
      id: `ai_${Date.now()}_${index}`,
      startTime: item.startTime,
      endTime: item.endTime,
      text: item.text,
      type: item.type,
      confidence: 0.9,
      style: randomStyle, // 랜덤 스타일 적용
      metadata: {
        type: item.type,
        summary: item.reason,
        detail: '',
        keywords: [],
        score: 90,
      },
    };
  });
}

// ============================================
// 맞춤법 교정 (Gemini)
// ============================================

export async function correctSpelling(
  text: string,
  apiKey: string
): Promise<string> {
  const prompt = `다음 한국어 텍스트의 맞춤법과 띄어쓰기만 교정해주세요. 의미는 절대 변경하지 마세요.

원본: ${text}

교정된 텍스트만 출력하세요.`;

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.1, maxOutputTokens: 1024 },
        }),
      }
    );

    if (!response.ok) throw new Error('맞춤법 교정 실패');

    const data = await response.json();
    return data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() || text;

  } catch (error) {
    console.error('맞춤법 교정 오류:', error);
    return text;
  }
}
