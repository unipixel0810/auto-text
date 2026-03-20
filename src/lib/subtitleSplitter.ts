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
/** Whisper가 반환하는 문장 단위 세그먼트 */
export interface SentenceSegment {
  text: string;
  startTime: number;
  endTime: number;
}

export interface STTResult {
  /** 전체 텍스트 */
  fullText: string;
  /** 단어별 타임스탬프 배열 */
  words: WordTimestamp[];
  /** Whisper 원본 문장 세그먼트 (있으면 이걸 우선 사용) */
  sentences?: SentenceSegment[];
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
  minDuration: 3.0,
  targetDuration: 4.0,
  maxDuration: 10.0,
  maxCharacters: 80,
  sentenceDelimiters: /[.?!。？！]/,
  naturalBreakPattern: /[,，、:;]|\s+(그리고|그래서|하지만|그러나|그런데|또한|근데|아니면|또는)\s+/,
};

/** 침묵 기반 분할 임계값 (초) — 이 이상 쉬면 발화 단위가 바뀐 것으로 판단 */
const SILENCE_THRESHOLD = 0.4;

/** 너무 긴 발화를 나눌 때 사용하는 보조 침묵 임계값 */
const SOFT_SILENCE_THRESHOLD = 0.2;

// UUID 생성 함수
function generateId(): string {
  return `seg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// ============================================
// 메인 분할 함수
// ============================================

/**
 * STT 결과를 의미 단위(발화/침묵 기반)로 자막 세그먼트 분할
 *
 * 1단계: 침묵 구간(0.4초+)으로 "발화 덩어리"를 나눔 (화자 전환, 호흡 등)
 * 2단계: 너무 짧은 덩어리는 인접 덩어리에 병합
 * 3단계: 너무 긴 덩어리만 보조 침묵(0.2초+)으로 추가 분할
 */
export function splitSubtitles(
  sttResult: STTResult,
  options: SplitterOptions = {}
): SubtitleSegment[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Whisper 원본 문장 세그먼트가 있으면 우선 사용
  if (sttResult.sentences && sttResult.sentences.length > 0) {
    const rawSegments = sttResult.sentences
      .filter(s => s.text.trim().length > 0)
      .map(s => ({
        id: generateId(),
        text: s.text.trim(),
        startTime: s.startTime,
        endTime: s.endTime,
        words: [] as WordTimestamp[],
        duration: s.endTime - s.startTime,
      }));
    // 긴 문장은 자연스러운 지점에서 분할 (더 많은 자막 줄 생성)
    const segments: SubtitleSegment[] = [];
    for (const seg of rawSegments) {
      if (seg.duration > opts.maxDuration || seg.text.length > opts.maxCharacters) {
        const parts = splitSentenceText(seg.text, seg.startTime, seg.endTime);
        segments.push(...parts);
      } else {
        segments.push(seg);
      }
    }
    const trimmed = trimEndTimes(mergeFragments(segments));
    return trimmed;
  }

  const { words } = sttResult;

  if (words.length === 0) {
    return [];
  }

  // ── 1단계: 침묵 기반으로 발화 덩어리 생성 ──
  const utterances: WordTimestamp[][] = [];
  let current: WordTimestamp[] = [words[0]];

  for (let i = 1; i < words.length; i++) {
    const gap = words[i].startTime - words[i - 1].endTime;
    if (gap >= SILENCE_THRESHOLD) {
      utterances.push(current);
      current = [];
    }
    current.push(words[i]);
  }
  if (current.length > 0) utterances.push(current);

  // ── 2단계: 너무 짧은 덩어리(1초 미만, 2단어 이하)는 인접 덩어리에 병합 ──
  const merged: WordTimestamp[][] = [];
  for (const utt of utterances) {
    const uttDuration = utt[utt.length - 1].endTime - utt[0].startTime;
    if (
      merged.length > 0 &&
      uttDuration < opts.minDuration &&
      utt.length <= 2
    ) {
      // 이전 덩어리와의 갭이 작으면 병합
      const prev = merged[merged.length - 1];
      const gapToPrev = utt[0].startTime - prev[prev.length - 1].endTime;
      if (gapToPrev < 1.0) {
        prev.push(...utt);
        continue;
      }
    }
    merged.push(utt);
  }

  // ── 3단계: 너무 긴 덩어리만 보조 침묵으로 추가 분할 ──
  const segments: SubtitleSegment[] = [];
  for (const utt of merged) {
    const uttDuration = utt[utt.length - 1].endTime - utt[0].startTime;
    const uttChars = utt.map(w => w.word).join('').length;

    if (uttDuration <= opts.maxDuration && uttChars <= opts.maxCharacters) {
      segments.push(createSegment(utt, utt[0].startTime));
    } else {
      const subSegments = splitLongUtterance(utt, opts);
      segments.push(...subSegments);
    }
  }

  // ── 4단계: 의미 없는 조각 병합 ──
  // "리인데", "에서" 같은 4글자 미만 조각은 인접 세그먼트에 병합
  return trimEndTimes(mergeFragments(segments));
}

/** 자막이 너무 오래 표시되지 않도록 endTime 정리
 *  1) 다음 세그먼트 시작 전까지만 표시 (겹침 방지)
 *  2) 발화 길이 대비 최대 1.5초까지만 여유 허용 (침묵 구간에서 자막 안 남도록)
 */
function trimEndTimes(segments: SubtitleSegment[]): SubtitleSegment[] {
  if (segments.length === 0) return segments;

  return segments.map((seg, i) => {
    const next = segments[i + 1];
    let cappedEnd = seg.endTime;

    // 다음 세그먼트 시작 시간으로 제한 (겹침 방지)
    if (next) {
      cappedEnd = Math.min(cappedEnd, next.startTime);
    }

    // Whisper가 준 endTime을 기본 신뢰하되, 다음 발화까지 5초 이상 빈 구간이면 잘라냄
    const gapToNext = next ? next.startTime - seg.endTime : 0;
    if (!next || gapToNext <= 5.0) {
      // 갭이 적으면 Whisper endTime 그대로 (다음 시작 이전까지만)
    } else {
      // 긴 침묵 구간: endTime을 seg.endTime 그대로 유지 (이미 cappedEnd <= next.startTime)
      cappedEnd = Math.min(cappedEnd, seg.endTime);
    }

    // ★ 3초 최소 보장은 subtitlePlacer + orchestrator step 5.5에서 처리
    //   여기서 endTime을 늘리면 gap이 사라져 AI 자막 배치 불가
    // startTime보다는 항상 뒤에
    cappedEnd = Math.max(cappedEnd, seg.startTime + 0.5);

    if (cappedEnd === seg.endTime) return seg;

    return {
      ...seg,
      endTime: cappedEnd,
      duration: cappedEnd - seg.startTime,
    };
  });
}

/** 긴 Whisper 문장을 글자 수 비례로 시간 분배하여 분할 */
function splitSentenceText(
  text: string,
  startTime: number,
  endTime: number,
): SubtitleSegment[] {
  const totalDuration = endTime - startTime;
  const totalChars = text.length;

  // 자연스러운 끊김점: 쉼표, 마침표, 접속사, 조사 뒤 공백
  const breakPattern = /(?<=[,，.。?!·]\s*)|(?<=\s(?:그리고|그래서|하지만|그러나|그런데|또한|근데|아니면|또는|그래|그럼|네|예|아)\s)/g;
  const parts = text.split(breakPattern).filter(p => p.trim().length > 0);

  if (parts.length <= 1) {
    // 끊김점이 없으면 공백 기준으로 균등 분할
    const words = text.split(/\s+/);
    if (words.length <= 1) {
      return [{
        id: generateId(), text, startTime, endTime,
        words: [], duration: totalDuration,
      }];
    }
    const wordsPerPart = Math.ceil(words.length / Math.ceil(totalChars / 80));
    const result: SubtitleSegment[] = [];
    let charsSoFar = 0;
    for (let i = 0; i < words.length; i += wordsPerPart) {
      const chunk = words.slice(i, i + wordsPerPart);
      const chunkText = chunk.join(' ');
      const chunkStart = startTime + (charsSoFar / totalChars) * totalDuration;
      charsSoFar += chunkText.length;
      const chunkEnd = startTime + (charsSoFar / totalChars) * totalDuration;
      result.push({
        id: generateId(), text: chunkText.trim(),
        startTime: chunkStart, endTime: chunkEnd,
        words: [], duration: chunkEnd - chunkStart,
      });
    }
    return result;
  }

  // 자연스러운 끊김점으로 분할
  const segments: SubtitleSegment[] = [];
  let charsSoFar = 0;
  for (const part of parts) {
    const trimmed = part.trim();
    if (trimmed.length === 0) continue;
    const partStart = startTime + (charsSoFar / totalChars) * totalDuration;
    charsSoFar += part.length;
    const partEnd = startTime + (charsSoFar / totalChars) * totalDuration;
    segments.push({
      id: generateId(), text: trimmed,
      startTime: partStart, endTime: partEnd,
      words: [], duration: partEnd - partStart,
    });
  }

  return segments;
}

/** 의미 없는 짧은 조각(2글자 미만)을 인접 세그먼트에 병합 */
function mergeFragments(segments: SubtitleSegment[]): SubtitleSegment[] {
  if (segments.length <= 1) return segments;

  const MIN_MEANINGFUL_CHARS = 2;
  const result: SubtitleSegment[] = [];

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const textChars = seg.text.replace(/\s/g, '').length;

    if (textChars >= MIN_MEANINGFUL_CHARS) {
      result.push(seg);
      continue;
    }

    // 짧은 조각 → 가장 가까운 세그먼트에 병합
    const prev = result[result.length - 1];
    const next = segments[i + 1];

    if (prev && next) {
      // 이전/다음 중 시간적으로 더 가까운 쪽에 병합
      const gapToPrev = seg.startTime - prev.endTime;
      const gapToNext = next.startTime - seg.endTime;
      if (gapToPrev <= gapToNext) {
        // 이전에 병합
        result[result.length - 1] = combineSegments(prev, seg);
      } else {
        // 다음에 병합 (다음 세그먼트를 미리 합쳐서 교체)
        segments[i + 1] = combineSegments(seg, next);
      }
    } else if (prev) {
      result[result.length - 1] = combineSegments(prev, seg);
    } else if (next) {
      segments[i + 1] = combineSegments(seg, next);
    } else {
      // 유일한 세그먼트 → 그대로 유지
      result.push(seg);
    }
  }

  return result;
}

/** 두 세그먼트를 하나로 합침 */
function combineSegments(a: SubtitleSegment, b: SubtitleSegment): SubtitleSegment {
  const allWords = [...a.words, ...b.words];
  return {
    id: a.id,
    text: `${a.text} ${b.text}`.trim(),
    startTime: a.startTime,
    endTime: b.endTime,
    words: allWords,
    duration: b.endTime - a.startTime,
  };
}

/**
 * 긴 발화 덩어리를 보조 침묵 + 의미 단위로 분할
 */
function splitLongUtterance(
  words: WordTimestamp[],
  opts: Required<SplitterOptions>,
): SubtitleSegment[] {
  // 단어 간 갭을 찾아서 가장 큰 침묵 순으로 분할점 후보 수집
  const gaps: { index: number; gap: number }[] = [];
  for (let i = 1; i < words.length; i++) {
    const gap = words[i].startTime - words[i - 1].endTime;
    if (gap >= SOFT_SILENCE_THRESHOLD) {
      gaps.push({ index: i, gap });
    }
  }
  // 갭이 큰 순서로 정렬
  gaps.sort((a, b) => b.gap - a.gap);

  // 분할점을 하나씩 추가하면서, 모든 조각이 maxDuration/maxCharacters 이하가 될 때까지
  const splitIndices = new Set<number>();
  splitIndices.add(0);
  splitIndices.add(words.length);

  for (const { index } of gaps) {
    splitIndices.add(index);
    // 모든 조각이 조건을 만족하는지 체크
    const sorted = Array.from(splitIndices).sort((a, b) => a - b);
    let allOk = true;
    for (let i = 0; i < sorted.length - 1; i++) {
      const chunk = words.slice(sorted[i], sorted[i + 1]);
      const dur = chunk[chunk.length - 1].endTime - chunk[0].startTime;
      const chars = chunk.map(w => w.word).join('').length;
      if (dur > opts.maxDuration || chars > opts.maxCharacters) {
        allOk = false;
        break;
      }
    }
    if (allOk) break;
  }

  // 분할점이 부족하면 (침묵이 없는 긴 발화) 시간 기반으로 강제 분할
  const sorted = Array.from(splitIndices).sort((a, b) => a - b);
  const segments: SubtitleSegment[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const chunk = words.slice(sorted[i], sorted[i + 1]);
    if (chunk.length === 0) continue;
    const dur = chunk[chunk.length - 1].endTime - chunk[0].startTime;
    const chars = chunk.map(w => w.word).join('').length;

    if (dur > opts.maxDuration || chars > opts.maxCharacters) {
      // 침묵 없이 너무 긴 구간 → 단어 수 기반 균등 분할
      const numParts = Math.ceil(Math.max(dur / opts.targetDuration, chars / opts.maxCharacters));
      const wordsPerPart = Math.ceil(chunk.length / numParts);
      for (let j = 0; j < chunk.length; j += wordsPerPart) {
        const part = chunk.slice(j, j + wordsPerPart);
        if (part.length > 0) {
          segments.push(createSegment(part, part[0].startTime));
        }
      }
    } else {
      segments.push(createSegment(chunk, chunk[0].startTime));
    }
  }

  return segments;
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
