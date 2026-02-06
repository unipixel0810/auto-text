/**
 * 자막 분할 유틸리티
 * STT 결과를 2~3초 단위의 자막 조각으로 분할
 */

// ============================================
// 타입 정의
// ============================================

/**
 * STT 결과에서 받는 단어 단위 타임스탬프
 */
export interface WordTimestamp {
  /** 단어 텍스트 */
  word: string;
  /** 시작 시간 (초) */
  startTime: number;
  /** 종료 시간 (초) */
  endTime: number;
  /** 신뢰도 (0-1) */
  confidence?: number;
}

/**
 * STT 원본 결과 (전체 텍스트 + 단어별 타임스탬프)
 */
export interface STTResult {
  /** 전체 텍스트 */
  fullText: string;
  /** 단어별 타임스탬프 배열 */
  words: WordTimestamp[];
  /** 전체 음성 길이 (초) */
  duration: number;
  /** 언어 코드 */
  language?: string;
}

/**
 * 분할된 자막 조각
 */
export interface SubtitleSegment {
  /** 고유 ID */
  id: string;
  /** 자막 텍스트 */
  text: string;
  /** 시작 시간 (초) */
  startTime: number;
  /** 종료 시간 (초) */
  endTime: number;
  /** 포함된 단어들 */
  words: WordTimestamp[];
  /** 세그먼트 길이 (초) */
  duration: number;
}

/**
 * 분할 옵션
 */
export interface SplitterOptions {
  /** 최소 세그먼트 길이 (초) - 기본값: 1.5 */
  minDuration?: number;
  /** 목표 세그먼트 길이 (초) - 기본값: 2.5 */
  targetDuration?: number;
  /** 최대 세그먼트 길이 (초) - 기본값: 3.5 */
  maxDuration?: number;
  /** 최대 글자 수 - 기본값: 50 */
  maxCharacters?: number;
  /** 문장 구분자 패턴 */
  sentenceDelimiters?: RegExp;
  /** 자연스러운 끊김 패턴 (쉼표, 접속사 등) */
  naturalBreakPattern?: RegExp;
}

// ============================================
// 상수 정의
// ============================================

const DEFAULT_OPTIONS: Required<SplitterOptions> = {
  minDuration: 1.5,
  targetDuration: 2.5,
  maxDuration: 3.5,
  maxCharacters: 50,
  // 문장 종결 패턴: 마침표, 물음표, 느낌표
  sentenceDelimiters: /[.?!。？！]/,
  // 자연스러운 끊김 패턴: 쉼표, 접속사 뒤, 조사 뒤 등
  naturalBreakPattern: /[,，、:;]|\s+(그리고|그래서|하지만|그러나|그런데|또한|그리고는|그래서는|근데|아니면|또는)\s+/,
};

// 한국어 문장 종결 어미 패턴
const KOREAN_SENTENCE_ENDINGS = /(?:다|요|죠|네|나|까|지|고|며|면서|는데|니까|거든|잖아|래|세요|습니다|합니다|입니다|됩니다|니다)[\s]*$/;

// UUID 생성 함수
function generateId(): string {
  return `seg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// ============================================
// 메인 분할 함수
// ============================================

/**
 * STT 결과를 2~3초 단위 자막 세그먼트로 분할
 * 
 * @param sttResult - STT 분석 결과
 * @param options - 분할 옵션
 * @returns 분할된 자막 세그먼트 배열
 */
export function splitSubtitles(
  sttResult: STTResult,
  options: SplitterOptions = {}
): SubtitleSegment[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const { words } = sttResult;

  if (words.length === 0) {
    return [];
  }

  const segments: SubtitleSegment[] = [];
  let currentWords: WordTimestamp[] = [];
  let currentStartTime = words[0].startTime;

  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    const nextWord = words[i + 1];
    
    currentWords.push(word);
    
    const currentText = currentWords.map(w => w.word).join(' ');
    const currentDuration = word.endTime - currentStartTime;
    const currentCharCount = currentText.replace(/\s/g, '').length;

    // 세그먼트 종료 조건 체크
    const shouldSplit = checkShouldSplit({
      currentDuration,
      currentCharCount,
      currentText,
      word,
      nextWord,
      opts,
    });

    if (shouldSplit) {
      // 현재 세그먼트 저장
      segments.push(createSegment(currentWords, currentStartTime));
      
      // 다음 세그먼트 준비
      currentWords = [];
      if (nextWord) {
        currentStartTime = nextWord.startTime;
      }
    }
  }

  // 마지막 남은 단어들 처리
  if (currentWords.length > 0) {
    segments.push(createSegment(currentWords, currentStartTime));
  }

  // 후처리: 너무 짧은 세그먼트 병합
  return mergeShortSegments(segments, opts);
}

// ============================================
// 분할 조건 체크
// ============================================

interface SplitCheckParams {
  currentDuration: number;
  currentCharCount: number;
  currentText: string;
  word: WordTimestamp;
  nextWord?: WordTimestamp;
  opts: Required<SplitterOptions>;
}

/**
 * 현재 위치에서 세그먼트를 분할해야 하는지 체크
 */
function checkShouldSplit({
  currentDuration,
  currentCharCount,
  currentText,
  word,
  nextWord,
  opts,
}: SplitCheckParams): boolean {
  // 마지막 단어인 경우
  if (!nextWord) {
    return true;
  }

  const nextGap = nextWord.startTime - word.endTime;

  // 1. 최대 시간 초과 시 강제 분할
  if (currentDuration >= opts.maxDuration) {
    return true;
  }

  // 2. 최대 글자 수 초과 시 강제 분할
  if (currentCharCount >= opts.maxCharacters) {
    return true;
  }

  // 3. 문장 종결 + 목표 시간 도달
  const isSentenceEnd = 
    opts.sentenceDelimiters.test(word.word) || 
    KOREAN_SENTENCE_ENDINGS.test(word.word);
  
  if (isSentenceEnd && currentDuration >= opts.minDuration) {
    return true;
  }

  // 4. 자연스러운 끊김점 + 적절한 시간
  const isNaturalBreak = opts.naturalBreakPattern.test(currentText);
  if (isNaturalBreak && currentDuration >= opts.targetDuration) {
    return true;
  }

  // 5. 긴 침묵 (0.5초 이상) 후 분할
  if (nextGap >= 0.5 && currentDuration >= opts.minDuration) {
    return true;
  }

  // 6. 목표 시간 도달 + 단어 경계
  if (currentDuration >= opts.targetDuration) {
    // 다음 단어가 접속사나 새로운 문장 시작일 경우 분할
    const startsNewClause = /^(그리고|그래서|하지만|그러나|그런데|또한|근데|아니면|또는|그럼|자|이제|그때)/
      .test(nextWord.word);
    if (startsNewClause) {
      return true;
    }
  }

  return false;
}

// ============================================
// 세그먼트 생성
// ============================================

/**
 * 단어 배열로부터 세그먼트 객체 생성
 */
function createSegment(
  words: WordTimestamp[],
  startTime: number
): SubtitleSegment {
  const text = words.map(w => w.word).join(' ').trim();
  const endTime = words[words.length - 1].endTime;

  return {
    id: generateId(),
    text,
    startTime,
    endTime,
    words: [...words],
    duration: endTime - startTime,
  };
}

// ============================================
// 후처리: 짧은 세그먼트 병합
// ============================================

/**
 * 너무 짧은 세그먼트를 인접 세그먼트와 병합
 */
function mergeShortSegments(
  segments: SubtitleSegment[],
  opts: Required<SplitterOptions>
): SubtitleSegment[] {
  if (segments.length <= 1) {
    return segments;
  }

  const result: SubtitleSegment[] = [];
  let i = 0;

  while (i < segments.length) {
    const current = segments[i];
    const next = segments[i + 1];

    // 현재 세그먼트가 너무 짧고 다음 세그먼트가 있는 경우
    if (
      current.duration < opts.minDuration &&
      next &&
      current.duration + next.duration <= opts.maxDuration
    ) {
      // 두 세그먼트 병합
      const mergedWords = [...current.words, ...next.words];
      result.push({
        id: generateId(),
        text: `${current.text} ${next.text}`.trim(),
        startTime: current.startTime,
        endTime: next.endTime,
        words: mergedWords,
        duration: next.endTime - current.startTime,
      });
      i += 2; // 두 세그먼트 건너뛰기
    } else {
      result.push(current);
      i += 1;
    }
  }

  return result;
}

// ============================================
// 유틸리티 함수들
// ============================================

/**
 * 텍스트 기반으로 대략적인 자막 분할 (타임스탬프 없이)
 * 단어별 타임스탬프가 없는 경우 사용
 * 
 * @param text - 전체 텍스트
 * @param totalDuration - 전체 음성 길이 (초)
 * @param options - 분할 옵션
 */
export function splitTextByDuration(
  text: string,
  totalDuration: number,
  options: SplitterOptions = {}
): SubtitleSegment[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  // 문장 단위로 먼저 분리
  const sentences = splitIntoSentences(text);
  
  if (sentences.length === 0) {
    return [];
  }

  // 전체 글자 수 대비 비율로 시간 추정
  const totalChars = text.replace(/\s/g, '').length;
  const charPerSecond = totalChars / totalDuration;

  const segments: SubtitleSegment[] = [];
  let currentTime = 0;

  for (const sentence of sentences) {
    const sentenceChars = sentence.replace(/\s/g, '').length;
    const estimatedDuration = sentenceChars / charPerSecond;

    // 문장이 너무 길면 분할
    if (estimatedDuration > opts.maxDuration) {
      const subSegments = splitLongSentence(
        sentence,
        currentTime,
        estimatedDuration,
        opts
      );
      segments.push(...subSegments);
      currentTime += estimatedDuration;
    } else {
      segments.push({
        id: generateId(),
        text: sentence.trim(),
        startTime: currentTime,
        endTime: currentTime + estimatedDuration,
        words: [], // 단어별 타임스탬프 없음
        duration: estimatedDuration,
      });
      currentTime += estimatedDuration;
    }
  }

  return mergeShortSegments(segments, opts);
}

/**
 * 텍스트를 문장 단위로 분리
 */
function splitIntoSentences(text: string): string[] {
  // 문장 종결 패턴으로 분리하되, 구분자 유지
  const sentences = text
    .split(/(?<=[.?!。？！])\s*/)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  return sentences;
}

/**
 * 긴 문장을 목표 시간 내로 분할
 */
function splitLongSentence(
  sentence: string,
  startTime: number,
  totalDuration: number,
  opts: Required<SplitterOptions>
): SubtitleSegment[] {
  const segments: SubtitleSegment[] = [];
  
  // 자연스러운 끊김점으로 먼저 분리 시도
  const parts = sentence.split(opts.naturalBreakPattern).filter(p => p.trim().length > 0);
  
  if (parts.length <= 1) {
    // 자연스러운 끊김점이 없으면 단어 단위로 분할
    const words = sentence.split(/\s+/);
    return splitByWordCount(words, startTime, totalDuration, opts);
  }

  const totalChars = sentence.replace(/\s/g, '').length;
  let currentTime = startTime;

  for (const part of parts) {
    const partChars = part.replace(/\s/g, '').length;
    const partDuration = (partChars / totalChars) * totalDuration;

    if (partDuration > opts.maxDuration) {
      // 여전히 길면 단어 단위로 추가 분할
      const words = part.split(/\s+/);
      const subSegments = splitByWordCount(words, currentTime, partDuration, opts);
      segments.push(...subSegments);
    } else {
      segments.push({
        id: generateId(),
        text: part.trim(),
        startTime: currentTime,
        endTime: currentTime + partDuration,
        words: [],
        duration: partDuration,
      });
    }
    
    currentTime += partDuration;
  }

  return segments;
}

/**
 * 단어 개수 기반으로 분할
 */
function splitByWordCount(
  words: string[],
  startTime: number,
  totalDuration: number,
  opts: Required<SplitterOptions>
): SubtitleSegment[] {
  const segments: SubtitleSegment[] = [];
  const totalWords = words.length;
  const durationPerWord = totalDuration / totalWords;
  
  // 목표 시간에 맞는 단어 수 계산
  const wordsPerSegment = Math.ceil(opts.targetDuration / durationPerWord);
  
  let currentTime = startTime;
  
  for (let i = 0; i < words.length; i += wordsPerSegment) {
    const segmentWords = words.slice(i, i + wordsPerSegment);
    const segmentDuration = segmentWords.length * durationPerWord;
    
    segments.push({
      id: generateId(),
      text: segmentWords.join(' ').trim(),
      startTime: currentTime,
      endTime: currentTime + segmentDuration,
      words: [],
      duration: segmentDuration,
    });
    
    currentTime += segmentDuration;
  }

  return segments;
}

/**
 * 세그먼트 배열의 시간 정보 재계산
 * (수동 편집 후 시간 동기화에 사용)
 */
export function recalculateTimings(
  segments: SubtitleSegment[],
  totalDuration: number
): SubtitleSegment[] {
  if (segments.length === 0) return [];

  const totalChars = segments.reduce(
    (sum, seg) => sum + seg.text.replace(/\s/g, '').length,
    0
  );

  let currentTime = 0;

  return segments.map(segment => {
    const segmentChars = segment.text.replace(/\s/g, '').length;
    const segmentDuration = (segmentChars / totalChars) * totalDuration;

    const updated = {
      ...segment,
      startTime: currentTime,
      endTime: currentTime + segmentDuration,
      duration: segmentDuration,
    };

    currentTime += segmentDuration;
    return updated;
  });
}

/**
 * SubtitleItem 형태로 변환 (타입 시스템 연동)
 */
export function toSubtitleItems(
  segments: SubtitleSegment[],
  defaultType: 'ENTERTAINMENT' | 'SITUATION' | 'EXPLANATION' = 'SITUATION'
): Array<{
  id: string;
  startTime: number;
  endTime: number;
  text: string;
  type: 'ENTERTAINMENT' | 'SITUATION' | 'EXPLANATION';
  confidence: number;
}> {
  return segments.map(segment => ({
    id: segment.id,
    startTime: segment.startTime,
    endTime: segment.endTime,
    text: segment.text,
    type: defaultType,
    confidence: 0, // AI 분석 전 기본값
  }));
}

// ============================================
// 테스트/디버그 헬퍼
// ============================================

/**
 * 세그먼트 배열 요약 출력 (디버깅용)
 */
export function summarizeSegments(segments: SubtitleSegment[]): string {
  const lines = segments.map((seg, idx) => {
    const start = formatTime(seg.startTime);
    const end = formatTime(seg.endTime);
    const duration = seg.duration.toFixed(1);
    const preview = seg.text.length > 30 
      ? seg.text.substring(0, 30) + '...' 
      : seg.text;
    return `[${idx + 1}] ${start} → ${end} (${duration}s): "${preview}"`;
  });

  return lines.join('\n');
}

/**
 * 시간을 MM:SS.ms 형태로 포맷
 */
function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = (seconds % 60).toFixed(1);
  return `${mins}:${secs.padStart(4, '0')}`;
}
