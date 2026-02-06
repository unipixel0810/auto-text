/**
 * 자막 유형 추천 엔진
 * 규칙 기반 분석 + LLM 기반 분석 하이브리드 시스템
 */

import type { 
  SubtitleType, 
  SubtitleItem, 
  RecommendationMetadata,
  EntertainmentMetadata,
  SituationMetadata,
  ExplanationMetadata,
  TranscriptMetadata,
} from '@/types/subtitle';
import type { SubtitleSegment } from './subtitleSplitter';

// ============================================
// 타입 정의
// ============================================

/**
 * 분석 컨텍스트 (오디오 메타데이터 포함)
 */
export interface AnalysisContext {
  /** 평균 데시벨 레벨 */
  averageDecibel?: number;
  /** 최대 데시벨 레벨 */
  peakDecibel?: number;
  /** 말하는 속도 (단어/초) */
  speechRate?: number;
  /** 침묵 비율 (0-1) */
  silenceRatio?: number;
  /** 이전 세그먼트 타입 */
  previousType?: SubtitleType;
  /** 다음 세그먼트 텍스트 (맥락용) */
  nextSegmentText?: string;
  /** 전체 비디오 장르/카테고리 */
  videoCategory?: string;
}

/**
 * 규칙 기반 분석 결과
 */
export interface RuleBasedScore {
  type: SubtitleType;
  score: number;
  matchedPatterns: string[];
}

/**
 * LLM 분석 요청
 */
export interface LLMAnalysisRequest {
  segment: SubtitleSegment;
  context?: AnalysisContext;
  ruleBasedHint?: RuleBasedScore[];
}

/**
 * LLM 분석 응답
 */
export interface LLMAnalysisResponse {
  type: SubtitleType;
  confidence: number;
  reason: string;
  metadata: Partial<RecommendationMetadata>;
}

/**
 * 최종 추천 결과
 */
export interface RecommendationResult {
  segment: SubtitleSegment;
  recommendedType: SubtitleType;
  confidence: number;
  reason: string;
  metadata: RecommendationMetadata;
  alternativeTypes: Array<{
    type: SubtitleType;
    confidence: number;
    reason: string;
  }>;
}

// ============================================
// 패턴 정의 (규칙 기반 분석용)
// ============================================

/**
 * 예능 자막 감지 패턴
 */
const ENTERTAINMENT_PATTERNS = {
  // 의성어/의태어
  onomatopoeia: /(?:ㅋ{2,}|ㅎ{2,}|ㅠ{2,}|ㅜ{2,}|헉|헐|와{2,}|우와|대박|쩔|미쳤|뭐야|어머|세상에|헉헉|두근|쿵|팡|짠|뿅|휘리릭|슝|쾅|철컹|우당탕|펑|삐걱|와장창)/gi,
  
  // 느낌표 다수
  exclamations: /!{1,}|！/g,
  
  // 강조 표현
  emphasis: /(?:진짜|완전|너무|엄청|개|겁나|존나|ㄹㅇ|레알|실화|찐|극한|최고|미친|역대급|레전드)/gi,
  
  // 리액션 표현
  reactions: /(?:와|우아|오오|헐|뭐|어|앗|악|읭|잉|응|음|흠|허|호|히|하하|호호|히히|크크|푸하하)/gi,
  
  // 짧고 강렬한 문장 (10자 이하 + 느낌표)
  shortIntense: /^.{1,10}!+$/,
  
  // 드립/유행어
  slang: /(?:ㄱㅇㄷ|ㅇㅈ|ㄹㅇ|ㅇㅇ|ㄴㄴ|ㅇㅋ|ㄱㅊ|존버|갓|핵|꿀|개꿀|빡세|쩐다|간지|킹받|어쩔티비|저쩔냉장고)/gi,
};

/**
 * 설명 자막 감지 패턴
 */
const EXPLANATION_PATTERNS = {
  // 정보성 키워드
  informational: /(?:입니다|합니다|됩니다|있습니다|것입니다|때문입니다|~란|~은|~는|정의|개념|원리|방법|이유|특징|장점|단점|차이|비교|분석|설명|소개|안내)/gi,
  
  // 숫자/통계
  statistics: /(?:\d+%|\d+년|\d+월|\d+일|\d+명|\d+개|\d+번|\d+위|\d+원|약\s*\d+|대략\s*\d+|평균|통계|수치|데이터)/gi,
  
  // 나열 표현
  listing: /(?:첫째|둘째|셋째|첫 번째|두 번째|세 번째|먼저|다음으로|마지막으로|그리고|또한|뿐만 아니라)/gi,
  
  // 전문 용어 마커
  technical: /(?:즉|다시 말해|예를 들어|구체적으로|일반적으로|결론적으로|요약하면|참고로|부연하면)/gi,
  
  // 교육적 어조
  educational: /(?:알아보|살펴보|확인해|이해하|배워|정리해|요약해|핵심은|포인트는|중요한 것은)/gi,
  
  // 긴 문장 (30자 이상)
  longSentence: /.{30,}/,
};

/**
 * 상황 자막 감지 패턴  
 */
const SITUATION_PATTERNS = {
  // 배경 묘사
  background: /(?:~에서|~에는|~하는 중|~하고 있|현재|지금|이때|그때|잠시 후|한편|그 순간|동시에|바로 그때)/gi,
  
  // 부연 설명
  supplementary: /(?:사실|참고로|덧붙이|추가로|여담으로|이건|저건|~인데요?|~거든요?|~잖아요?)/gi,
  
  // 장소/시간 표현
  locationTime: /(?:~에서|~에|~로|~까지|아침|점심|저녁|밤|새벽|오전|오후|~시|~분|여기|거기|저기|이곳|그곳)/gi,
  
  // 인물/상황 소개
  introduction: /(?:~씨|~님|~가|~이|등장|나타나|들어오|나가|앉|서|일어나|움직|걸어|달려)/gi,
  
  // 전환 표현
  transition: /(?:그런데|그러다|그러던 중|그 와중에|한편|반면|그에 반해|다른 한편)/gi,
  
  // 괄호 안 설명
  parenthetical: /[（(].+[)）]/,
};

// ============================================
// 규칙 기반 분석기
// ============================================

/**
 * 패턴 매칭으로 점수 계산
 */
function countPatternMatches(
  text: string, 
  patterns: Record<string, RegExp>
): { total: number; matched: string[] } {
  let total = 0;
  const matched: string[] = [];

  for (const [name, pattern] of Object.entries(patterns)) {
    const matches = text.match(pattern);
    if (matches) {
      total += matches.length;
      matched.push(`${name}(${matches.length})`);
    }
  }

  return { total, matched };
}

/**
 * 규칙 기반 분석 수행
 */
export function analyzeByRules(
  segment: SubtitleSegment,
  context?: AnalysisContext
): RuleBasedScore[] {
  const text = segment.text;
  const scores: RuleBasedScore[] = [];

  // 예능 자막 점수
  const entertainmentMatch = countPatternMatches(text, ENTERTAINMENT_PATTERNS);
  let entertainmentScore = entertainmentMatch.total * 10;
  
  // 짧은 문장 보너스
  if (text.length <= 15) entertainmentScore += 10;
  // 느낌표 보너스
  const exclamationCount = (text.match(/!/g) || []).length;
  entertainmentScore += exclamationCount * 5;
  // 높은 데시벨 보너스
  if (context?.peakDecibel && context.peakDecibel > 80) {
    entertainmentScore += 15;
  }
  
  scores.push({
    type: 'ENTERTAINMENT',
    score: Math.min(100, entertainmentScore),
    matchedPatterns: entertainmentMatch.matched,
  });

  // 설명 자막 점수
  const explanationMatch = countPatternMatches(text, EXPLANATION_PATTERNS);
  let explanationScore = explanationMatch.total * 10;
  
  // 긴 문장 보너스
  if (text.length >= 30) explanationScore += 15;
  // 차분한 어조 (낮은 데시벨)
  if (context?.averageDecibel && context.averageDecibel < 60) {
    explanationScore += 10;
  }
  // 느린 말하기 속도
  if (context?.speechRate && context.speechRate < 3) {
    explanationScore += 10;
  }
  
  scores.push({
    type: 'EXPLANATION',
    score: Math.min(100, explanationScore),
    matchedPatterns: explanationMatch.matched,
  });

  // 상황 자막 점수
  const situationMatch = countPatternMatches(text, SITUATION_PATTERNS);
  let situationScore = situationMatch.total * 10;
  
  // 중간 길이 문장
  if (text.length >= 15 && text.length <= 35) situationScore += 10;
  // 침묵 후 시작
  if (context?.silenceRatio && context.silenceRatio > 0.3) {
    situationScore += 15;
  }
  // 이전이 ENTERTAINMENT면 상황 설명 필요할 확률 높음
  if (context?.previousType === 'ENTERTAINMENT') {
    situationScore += 10;
  }
  
  scores.push({
    type: 'SITUATION',
    score: Math.min(100, situationScore),
    matchedPatterns: situationMatch.matched,
  });

  // 점수순 정렬
  return scores.sort((a, b) => b.score - a.score);
}

// ============================================
// LLM 기반 분석기
// ============================================

/**
 * LLM 프롬프트 생성
 */
function buildLLMPrompt(
  segment: SubtitleSegment,
  context?: AnalysisContext,
  ruleBasedHint?: RuleBasedScore[]
): string {
  const hintText = ruleBasedHint
    ? `\n규칙 기반 분석 힌트: ${ruleBasedHint.map(h => `${h.type}(${h.score}점)`).join(', ')}`
    : '';

  const contextText = context
    ? `
오디오 컨텍스트:
- 평균 데시벨: ${context.averageDecibel ?? '알 수 없음'}
- 최대 데시벨: ${context.peakDecibel ?? '알 수 없음'}
- 말하기 속도: ${context.speechRate ?? '알 수 없음'} 단어/초
- 이전 자막 타입: ${context.previousType ?? '없음'}
- 비디오 카테고리: ${context.videoCategory ?? '알 수 없음'}`
    : '';

  return `당신은 영상 자막 유형 분류 전문가입니다.

다음 자막 텍스트를 분석하여 가장 적합한 자막 유형을 선택해주세요.

## 자막 유형 정의

1. **ENTERTAINMENT (예능 자막)**
   - 재미, 웃음, 흥미를 유발하는 내용
   - 느낌표(!), 의성어/의태어, 짧고 강렬한 표현
   - 리액션, 드립, 유행어
   - 높은 에너지, 빠른 템포

2. **EXPLANATION (설명 자막)**
   - 정보, 지식, 교육적 내용 전달
   - 숫자, 통계, 전문 용어 포함
   - 나열, 정의, 비교 표현
   - 차분하고 논리적인 어조

3. **SITUATION (상황 자막)**
   - 배경, 상황, 맥락 설명
   - 장소, 시간, 인물 소개
   - 부연 설명, 전환 표현
   - 대화 사이의 공백 채우기

## 분석할 자막

텍스트: "${segment.text}"
시작 시간: ${segment.startTime.toFixed(1)}초
종료 시간: ${segment.endTime.toFixed(1)}초
길이: ${segment.duration.toFixed(1)}초
${contextText}
${hintText}

## 응답 형식 (JSON)

{
  "type": "ENTERTAINMENT" | "EXPLANATION" | "SITUATION",
  "confidence": 0.0 ~ 1.0,
  "reason": "선택 이유 (한 문장)",
  "keywords": ["감지된", "핵심", "키워드"],
  "alternativeType": "차선책 타입",
  "alternativeReason": "차선책 이유"
}

JSON만 응답해주세요.`;
}

/**
 * OpenAI API 호출
 */
export async function callLLMAnalysis(
  request: LLMAnalysisRequest,
  apiKey: string,
  model: string = 'gpt-4o-mini'
): Promise<LLMAnalysisResponse> {
  const prompt = buildLLMPrompt(
    request.segment,
    request.context,
    request.ruleBasedHint
  );

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: '당신은 영상 자막 유형 분류 전문가입니다. JSON 형식으로만 응답합니다.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.3,
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices[0]?.message?.content;

    if (!content) {
      throw new Error('Empty response from LLM');
    }

    // JSON 파싱
    const parsed = JSON.parse(content);

    return {
      type: parsed.type as SubtitleType,
      confidence: parsed.confidence,
      reason: parsed.reason,
      metadata: {
        type: parsed.type,
        summary: parsed.reason,
        detail: parsed.alternativeReason || '',
        keywords: parsed.keywords || [],
        score: Math.round(parsed.confidence * 100),
      },
    };
  } catch (error) {
    console.error('LLM analysis error:', error);
    // 폴백: 규칙 기반 결과 반환
    const ruleResult = request.ruleBasedHint?.[0];
    return {
      type: ruleResult?.type || 'SITUATION',
      confidence: ruleResult ? ruleResult.score / 100 : 0.5,
      reason: 'LLM 분석 실패, 규칙 기반 결과 사용',
      metadata: {
        type: ruleResult?.type || 'SITUATION',
        summary: 'LLM 분석 실패',
        detail: ruleResult?.matchedPatterns.join(', ') || '',
        keywords: [],
        score: ruleResult?.score || 50,
      },
    };
  }
}

// ============================================
// 메타데이터 생성기
// ============================================

/**
 * 타입별 상세 메타데이터 생성
 */
function createMetadata(
  type: SubtitleType,
  baseMetadata: Partial<RecommendationMetadata>,
  segment: SubtitleSegment,
  context?: AnalysisContext
): RecommendationMetadata {
  const base = {
    summary: baseMetadata.summary || '',
    detail: baseMetadata.detail || '',
    keywords: baseMetadata.keywords || [],
    score: baseMetadata.score || 50,
  };

  switch (type) {
    case 'ENTERTAINMENT': {
      const meta: EntertainmentMetadata = {
        ...base,
        type: 'ENTERTAINMENT',
        humorType: detectHumorType(segment.text),
        emotionalIntensity: calculateEmotionalIntensity(segment.text, context),
        expectedReaction: predictReaction(segment.text),
      };
      return meta;
    }

    case 'EXPLANATION': {
      const meta: ExplanationMetadata = {
        ...base,
        type: 'EXPLANATION',
        topicField: detectTopicField(segment.text),
        difficultyLevel: calculateDifficulty(segment.text),
        keyConcepts: extractKeyConcepts(segment.text),
      };
      return meta;
    }

    case 'SITUATION': {
      const meta: SituationMetadata = {
        ...base,
        type: 'SITUATION',
        situationCategory: detectSituationCategory(segment.text),
        contextImportance: calculateContextImportance(segment, context),
      };
      return meta;
    }

    case 'TRANSCRIPT': {
      const meta: TranscriptMetadata = {
        ...base,
        type: 'TRANSCRIPT',
        emotionTone: '일반',
      };
      return meta;
    }

    default:
      return {
        ...base,
        type: 'SITUATION',
      } as SituationMetadata;
  }
}

// ============================================
// 헬퍼 함수들
// ============================================

function detectHumorType(text: string): string {
  if (/ㅋ{2,}|ㅎ{2,}|하하|호호/.test(text)) return '웃음 유발';
  if (/헐|대박|뭐야/.test(text)) return '리액션';
  if (/!{2,}/.test(text)) return '강조';
  if (text.length <= 10) return '짧은 임팩트';
  return '일반 유머';
}

function calculateEmotionalIntensity(text: string, context?: AnalysisContext): number {
  let intensity = 5;
  
  // 느낌표 개수
  const exclamations = (text.match(/!/g) || []).length;
  intensity += exclamations;
  
  // 의성어
  if (/ㅋ{3,}|ㅎ{3,}|와{2,}/.test(text)) intensity += 2;
  
  // 데시벨
  if (context?.peakDecibel && context.peakDecibel > 80) intensity += 2;
  
  return Math.min(10, intensity);
}

function predictReaction(text: string): string {
  if (/ㅋ{3,}|ㅎ{3,}|하하/.test(text)) return '웃음';
  if (/헐|대박|미쳤/.test(text)) return '놀람';
  if (/와{2,}|우와/.test(text)) return '감탄';
  if (/ㅠ{2,}|ㅜ{2,}/.test(text)) return '공감';
  return '흥미';
}

function detectTopicField(text: string): string {
  if (/과학|실험|연구|발견/.test(text)) return '과학';
  if (/역사|시대|왕|전쟁/.test(text)) return '역사';
  if (/경제|주식|투자|금융/.test(text)) return '경제';
  if (/기술|개발|프로그램|AI/.test(text)) return '기술';
  if (/건강|의학|치료|증상/.test(text)) return '건강';
  if (/요리|음식|맛|레시피/.test(text)) return '요리';
  return '일반';
}

function calculateDifficulty(text: string): number {
  let difficulty = 3;
  
  // 긴 문장
  if (text.length > 50) difficulty += 2;
  
  // 숫자/통계
  if (/\d+%|\d+년/.test(text)) difficulty += 1;
  
  // 전문 용어 마커
  if (/즉|다시 말해|구체적으로/.test(text)) difficulty += 1;
  
  return Math.min(10, difficulty);
}

function extractKeyConcepts(text: string): string[] {
  const concepts: string[] = [];
  
  // 따옴표 안의 용어
  const quoted = text.match(/['"「」『』]([^'"「」『』]+)['"「」『』]/g);
  if (quoted) concepts.push(...quoted.map(q => q.replace(/['"「」『』]/g, '')));
  
  // 숫자 포함 표현
  const numbers = text.match(/\d+[%년월일명개번위원]/g);
  if (numbers) concepts.push(...numbers);
  
  return concepts.slice(0, 5);
}

function detectSituationCategory(text: string): string {
  if (/지금|현재|이때/.test(text)) return '시간 표시';
  if (/~에서|여기|거기/.test(text)) return '장소 표시';
  if (/~씨|~님|등장/.test(text)) return '인물 소개';
  if (/그런데|한편|그러다/.test(text)) return '장면 전환';
  if (/사실|참고로/.test(text)) return '부연 설명';
  return '일반 상황';
}

function calculateContextImportance(
  segment: SubtitleSegment,
  context?: AnalysisContext
): number {
  let importance = 5;
  
  // 문장 길이에 따른 중요도
  if (segment.text.length > 30) importance += 2;
  
  // 침묵 후 등장
  if (context?.silenceRatio && context.silenceRatio > 0.3) importance += 2;
  
  // 장면 전환 표현
  if (/그런데|한편|그러다/.test(segment.text)) importance += 1;
  
  return Math.min(10, importance);
}

// ============================================
// 메인 추천 함수
// ============================================

/**
 * 단일 세그먼트 분석 및 추천
 */
export async function recommendSubtitleType(
  segment: SubtitleSegment,
  context?: AnalysisContext,
  options?: {
    apiKey?: string;
    useLLM?: boolean;
    model?: string;
  }
): Promise<RecommendationResult> {
  // 1. 규칙 기반 분석
  const ruleScores = analyzeByRules(segment, context);
  
  let finalType: SubtitleType;
  let finalConfidence: number;
  let finalReason: string;
  let metadata: RecommendationMetadata;

  // 2. LLM 분석 (옵션)
  if (options?.useLLM && options?.apiKey) {
    const llmResult = await callLLMAnalysis(
      { segment, context, ruleBasedHint: ruleScores },
      options.apiKey,
      options.model
    );
    
    finalType = llmResult.type;
    finalConfidence = llmResult.confidence;
    finalReason = llmResult.reason;
    metadata = createMetadata(finalType, llmResult.metadata, segment, context);
  } else {
    // 규칙 기반만 사용
    const topScore = ruleScores[0];
    finalType = topScore.type;
    finalConfidence = topScore.score / 100;
    finalReason = `패턴 매칭: ${topScore.matchedPatterns.join(', ') || '기본 분류'}`;
    metadata = createMetadata(finalType, {
      summary: finalReason,
      keywords: topScore.matchedPatterns,
      score: topScore.score,
    }, segment, context);
  }

  // 3. 대안 타입 생성
  const alternativeTypes = ruleScores
    .filter(s => s.type !== finalType)
    .map(s => ({
      type: s.type,
      confidence: s.score / 100,
      reason: s.matchedPatterns.join(', ') || '대안 분류',
    }));

  return {
    segment,
    recommendedType: finalType,
    confidence: finalConfidence,
    reason: finalReason,
    metadata,
    alternativeTypes,
  };
}

/**
 * 여러 세그먼트 일괄 분석
 */
export async function recommendBatch(
  segments: SubtitleSegment[],
  options?: {
    apiKey?: string;
    useLLM?: boolean;
    model?: string;
    videoCategory?: string;
    onProgress?: (current: number, total: number) => void;
  }
): Promise<RecommendationResult[]> {
  const results: RecommendationResult[] = [];
  
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    
    // 컨텍스트 구성
    const context: AnalysisContext = {
      previousType: results[i - 1]?.recommendedType,
      nextSegmentText: segments[i + 1]?.text,
      videoCategory: options?.videoCategory,
    };

    const result = await recommendSubtitleType(segment, context, {
      apiKey: options?.apiKey,
      useLLM: options?.useLLM,
      model: options?.model,
    });

    results.push(result);
    
    // 진행률 콜백
    options?.onProgress?.(i + 1, segments.length);

    // API 레이트 리밋 방지 (LLM 사용 시)
    if (options?.useLLM && i < segments.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 200));
    }
  }

  return results;
}

/**
 * SubtitleItem 배열로 변환
 */
export function toSubtitleItems(
  results: RecommendationResult[]
): SubtitleItem[] {
  return results.map(result => ({
    id: result.segment.id,
    startTime: result.segment.startTime,
    endTime: result.segment.endTime,
    text: result.segment.text,
    type: result.recommendedType,
    confidence: result.confidence,
    metadata: result.metadata,
  }));
}

// ============================================
// 빠른 분류 (규칙 기반만)
// ============================================

/**
 * 빠른 규칙 기반 분류 (LLM 없이)
 */
export function quickClassify(text: string): {
  type: SubtitleType;
  confidence: number;
  reason: string;
} {
  const segment: SubtitleSegment = {
    id: 'temp',
    text,
    startTime: 0,
    endTime: 0,
    words: [],
    duration: 0,
  };

  const scores = analyzeByRules(segment);
  const top = scores[0];

  return {
    type: top.type,
    confidence: top.score / 100,
    reason: top.matchedPatterns.join(', ') || '기본 분류',
  };
}
