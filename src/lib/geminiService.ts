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

  return `당신은 유튜브 영상 자막 전문가입니다. 시청자가 재미있게 볼 수 있는 자막을 만들어주세요.

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
}

// ============================================
// Gemini API 호출
// ============================================

// 사용 가능한 Gemini 모델 목록 (순서대로 시도)
const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.5-pro',
  'gemini-3-flash-preview',
];

export async function generateSubtitlesWithGemini(
  request: GeminiSubtitleRequest,
  apiKey: string,
  onProgress?: (percent: number, message: string) => void
): Promise<GeneratedSubtitle[]> {
  console.log('[Gemini] 자막 생성 요청, 대본 수:', request.transcripts.length);
  
  onProgress?.(10, 'Gemini API 연결 중...');
  
  const prompt = buildPrompt(request.transcripts);
  let lastError: Error | null = null;

  // 여러 모델 시도
  for (const model of GEMINI_MODELS) {
    console.log('[Gemini] 모델 시도:', model);
    onProgress?.(30, `${model} 모델로 생성 중...`);
    
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ 
              parts: [{ text: prompt }] 
            }],
            generationConfig: { 
              temperature: 0.7, 
              maxOutputTokens: 8192,
            },
          }),
        }
      );

      console.log('[Gemini]', model, '응답 상태:', response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('[Gemini]', model, '에러:', errorData);
        lastError = new Error(errorData.error?.message || `${model} 실패`);
        continue; // 다음 모델 시도
      }

      onProgress?.(70, '응답 처리 중...');
      
      const data = await response.json();
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!content) {
        console.warn('[Gemini]', model, '응답이 비어있음');
        lastError = new Error('Gemini 응답이 비어있습니다');
        continue;
      }

      console.log('[Gemini] 성공! 응답:', content.slice(0, 300));
      onProgress?.(90, 'JSON 파싱 중...');

      // JSON 추출 (```json ... ``` 형식도 처리)
      let jsonStr = content;
      const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (codeBlockMatch) {
        jsonStr = codeBlockMatch[1];
      }
      
      const jsonMatch = jsonStr.match(/\[[\s\S]*\]/);
      if (!jsonMatch) {
        console.error('[Gemini] JSON을 찾을 수 없음:', content.slice(0, 200));
        lastError = new Error('JSON 형식을 찾을 수 없습니다');
        continue;
      }

      const subtitles: GeneratedSubtitle[] = JSON.parse(jsonMatch[0]);
      console.log('[Gemini] 생성된 자막 수:', subtitles.length);
      onProgress?.(100, '자막 생성 완료!');
      
      return subtitles;

    } catch (error) {
      console.error('[Gemini]', model, '오류:', error);
      lastError = error instanceof Error ? error : new Error(String(error));
      // 다음 모델 시도
    }
  }

  // 모든 모델 실패
  throw lastError || new Error('모든 Gemini 모델 호출 실패');
}

// ============================================
// 자막 변환
// ============================================

export function convertToSubtitleItems(
  generated: GeneratedSubtitle[]
): SubtitleItem[] {
  return generated.map((item, index) => ({
    id: `ai_${Date.now()}_${index}`,
    startTime: item.startTime,
    endTime: item.endTime,
    text: item.text,
    type: item.type,
    confidence: 0.9,
    metadata: {
      type: item.type,
      summary: item.reason,
      detail: '',
      keywords: [],
      score: 90,
    },
  }));
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
