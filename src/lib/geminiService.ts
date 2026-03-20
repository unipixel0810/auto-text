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
    .map(t => `[${(t.startTime ?? 0).toFixed(1)}s - ${(t.endTime ?? 0).toFixed(1)}s] ${t.editedText || t.originalText}`)
    .join('\n');

  return `당신은 예능 PD입니다. 영상에 연출 자막(예능/상황/설명)을 넣어주세요.

## 원본 대본
${transcriptText}

## 핵심 원칙
- 대본(말자막)은 이미 별도로 있으므로 대본 내용을 반복/요약하지 마세요.
- 대본과 같은 시간대에 겹쳐도 OK — 시스템이 자동으로 분리합니다.

## 자막 유형 3가지
- **예능** (35%): 리액션/감탄 — "실화?? 🤯", "ㅋㅋ 진심?", "소름 돋았다"
- **상황** (30%): 분위기 내레이션 — "[숨 참는 중]", "[갑자기 진지]"
- **설명** (35%): 핵심 정보 — "무려 3배 차이", "★핵심 포인트★"

## 규칙
- 2~3초에 하나씩 자막 생성
- 각 자막 최소 3초 이상 노출
- 자막끼리 시간 겹침 금지
- ★ 영상 처음~끝까지 균등하게 분배하세요! 앞/뒤/중간에 몰리면 안 됩니다 ★
- 전체 영상 시간의 30% 이하만 AI 자막으로 채우세요 (나머지는 대본이 나옵니다)
- ⛔ 대본 반복 금지, 시간 넣지 말 것

★★★ 모든 text는 한국어로만. ★★★
type은 "예능", "상황", "설명" 중 하나:
출력: [{"startTime": 0.0, "endTime": 3.5, "text": "자막내용", "type": "예능", "reason": "이유"}]`;
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

// 한국어 → 영어 타입 매핑 (AI 응답은 한국어, 내부 시스템은 영어)
const TYPE_KR_TO_EN: Record<string, string> = {
  '예능': 'ENTERTAINMENT', '예능자막': 'ENTERTAINMENT',
  '상황': 'SITUATION', '상황자막': 'SITUATION',
  '설명': 'EXPLANATION', '설명자막': 'EXPLANATION',
  '대본': 'TRANSCRIPT', '맥락': 'CONTEXT',
};

function normalizeType(raw: string): SubtitleType {
  if (!raw) return 'TRANSCRIPT';
  const upper = raw.toUpperCase();
  if (['ENTERTAINMENT', 'SITUATION', 'EXPLANATION', 'CONTEXT', 'TRANSCRIPT'].includes(upper)) return upper as SubtitleType;
  return (TYPE_KR_TO_EN[raw] as SubtitleType) || 'TRANSCRIPT';
}

export function convertToSubtitleItems(
  generated: GeneratedSubtitle[]
): SubtitleItem[] {
  return generated.map((item, index) => {
    // 랜덤 스타일 선택
    const randomStyle = RANDOM_STYLES[Math.floor(Math.random() * RANDOM_STYLES.length)];
    const normalizedType = normalizeType(item.type);

    return {
      id: `ai_${Date.now()}_${index}`,
      startTime: item.startTime,
      endTime: item.endTime,
      text: item.text,
      type: normalizedType,
      confidence: 0.9,
      style: randomStyle, // 랜덤 스타일 적용
      metadata: {
        type: normalizedType,
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
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
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
