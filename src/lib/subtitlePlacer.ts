/**
 * 자막 배치 로직 (Subtitle Placer)
 * - 텍스트 분할
 * - 단일 트랙 겹침 방지 배치
 *
 * 의존: types/subtitle 만 참조. UI 레이어 의존 없음.
 */

import type { TranscriptItem, WordTiming } from '@/types/subtitle';

// ============================================
// 상수 (Constants)
// ============================================

/** AI 자막 간 최소 간격 (초) */
export const SUBTITLE_GAP_SECONDS = 0.5;

/** 자막 최소 노출 시간 (초) — 사람이 읽을 수 있는 최소 시간 */
export const SUBTITLE_MIN_DURATION = 3.0;

/** 한 줄 최대 글자 수 */
export const SUBTITLE_MAX_CHARS = 20;

/** 분할 시 최소 청크 글자 수 */
const SPLIT_MIN_CHARS = 6;

/** 의미 있는 세그먼트 최소 시간 (초) */
export const SEGMENT_MIN_DURATION = 0.3;

// ============================================
// 타입
// ============================================

export interface PlacedSubtitle {
  startTime: number;
  duration: number;
  item: TranscriptItem;
}

// ============================================
// 단어 타이밍 기반 분할 (정확한 음성 싱크)
// ============================================

function splitWordsByCharLimit(words: WordTiming[], maxChars: number): WordTiming[][] {
  const chunks: WordTiming[][] = [];
  let current: WordTiming[] = [];
  let currentLen = 0;

  for (const w of words) {
    const wordLen = w.word.length + (current.length > 0 ? 1 : 0); // 공백 포함
    if (currentLen + wordLen > maxChars && current.length > 0) {
      chunks.push(current);
      current = [w];
      currentLen = w.word.length;
    } else {
      current.push(w);
      currentLen += wordLen;
    }
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

// ============================================
// 텍스트 분할 (긴 자막 → 20자 이내 청크)
// ============================================

export function splitLongSubtitles(items: TranscriptItem[]): TranscriptItem[] {
  const result: TranscriptItem[] = [];

  for (const item of items) {
    const text = item.editedText || item.originalText;
    if (text.length <= SUBTITLE_MAX_CHARS) {
      result.push(item);
      continue;
    }

    // 단어 타이밍이 있으면 단어 단위로 분할 (음성 싱크 정확)
    if (item.words && item.words.length > 1) {
      const wordChunks = splitWordsByCharLimit(item.words, SUBTITLE_MAX_CHARS);
      for (let ci = 0; ci < wordChunks.length; ci++) {
        const wc = wordChunks[ci];
        const chunkText = wc.map(w => w.word).join(' ');
        result.push({
          ...item,
          id: `${item.id}_${ci}`,
          startTime: wc[0].startTime,
          endTime: wc[wc.length - 1].endTime,
          editedText: chunkText,
          originalText: chunkText,
          words: wc,
        });
      }
      continue;
    }

    // 단어 타이밍 없으면 글자 수 비례 분배 (폴백)
    const totalDuration = item.endTime - item.startTime;
    const chunks = splitTextAtBreakPoints(text);
    const totalChars = chunks.reduce((s, c) => s + c.length, 0);

    let t = item.startTime;
    for (let ci = 0; ci < chunks.length; ci++) {
      const dur = (chunks[ci].length / totalChars) * totalDuration;
      result.push({
        ...item,
        id: `${item.id}_${ci}`,
        startTime: t,
        endTime: t + dur,
        editedText: chunks[ci],
        originalText: chunks[ci],
      });
      t += dur;
    }
  }

  return result;
}

/** 한국어 조사/어미 뒤가 자연스러운 분할 지점인지 판별 */
function isKoreanBreakPoint(text: string, idx: number): boolean {
  const ch = text[idx];
  // 공백, 쉼표, 마침표, 물음표, 느낌표, 중간점
  if (' ,，.。!?、·…~'.includes(ch)) return true;
  // 닫는 괄호/따옴표 뒤
  if (')）」』】]"\''.includes(ch)) return true;

  // 한국어: 조사·어미 패턴 — 다음 글자가 있고 그게 공백이 아닐 때
  // 받침 있는 글자 뒤 + 다음 글자가 한글이면 조사 경계일 가능성
  // 간단한 휴리스틱: 한글 음절 뒤 공백이 있으면 단어 경계
  if (idx + 1 < text.length && text[idx + 1] === ' ') return true;

  // 한국어 자연 분할: ~은/는/이/가/을/를/에/도/로/와/과/의/에서/까지/부터/만/요/죠/고/서/면/니다/해요/하고
  // idx 위치의 글자가 이런 조사/어미 끝이면 그 뒤에서 자름
  const nextCh = idx + 1 < text.length ? text[idx + 1] : '';
  const twoChar = ch + nextCh;
  const PARTICLES = new Set(['은', '는', '이', '가', '을', '를', '에', '도', '로', '와', '과', '의', '만', '요', '죠', '고', '서', '면', '게', '지', '죠', '든']);
  const TWO_PARTICLES = new Set(['에서', '까지', '부터', '처럼', '니다', '해요', '하고', '인데', '는데', '지만', '거든', '래요']);

  if (TWO_PARTICLES.has(twoChar)) return false; // 2글자 조사의 첫 글자에서 자르면 안됨
  if (idx > 0 && PARTICLES.has(ch) && nextCh && /[\uAC00-\uD7AF]/.test(nextCh)) return true;

  return false;
}

function splitTextAtBreakPoints(text: string): string[] {
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > SUBTITLE_MAX_CHARS) {
    let splitIdx = -1;

    // 1순위: 공백, 쉼표, 구두점에서 분할
    for (let j = SUBTITLE_MAX_CHARS - 1; j >= SPLIT_MIN_CHARS; j--) {
      if (' ,，.。!?、·'.includes(remaining[j])) {
        splitIdx = j + 1;
        break;
      }
    }

    // 2순위: 한국어 자연 분할점 (조사/어미 뒤)
    if (splitIdx === -1) {
      for (let j = SUBTITLE_MAX_CHARS - 1; j >= SPLIT_MIN_CHARS; j--) {
        if (isKoreanBreakPoint(remaining, j)) {
          splitIdx = j + 1;
          break;
        }
      }
    }

    // 3순위: 그래도 못 찾으면 최대 길이에서 자르되, 한글 음절 경계 유지
    if (splitIdx === -1) splitIdx = SUBTITLE_MAX_CHARS;

    chunks.push(remaining.slice(0, splitIdx).trim());
    remaining = remaining.slice(splitIdx).trim();
  }
  if (remaining) chunks.push(remaining);

  return chunks;
}

// ============================================
// 겹침 방지 배치 (단일 트랙)
// ============================================

export function placeWithoutOverlap(
  items: TranscriptItem[],
  gap: number = SUBTITLE_GAP_SECONDS,
  continuous: boolean = false,
): PlacedSubtitle[] {
  if (items.length === 0) return [];

  const sorted = [...items].sort((a, b) => a.startTime - b.startTime);
  const resolved: PlacedSubtitle[] = [];

  if (continuous) {
    // 대본(Dialogue) 모드:
    // ★ 최소 3초 보장 — 다음 대본/AI 시작 전까지만 확장
    //    STT 원본 endTime이 짧아도(0.5~2초) 읽기 편하도록 3초까지 늘림
    for (let i = 0; i < sorted.length; i++) {
      const item = sorted[i];
      const startTime = item.startTime;
      const rawDuration = item.endTime - item.startTime;
      const nextStart = i + 1 < sorted.length ? sorted[i + 1].startTime : Infinity;
      // 3초 최소 보장, 단 다음 대본과 겹치지 않도록 제한
      const desiredDuration = Math.max(rawDuration, SUBTITLE_MIN_DURATION);
      const duration = Math.min(nextStart - startTime, desiredDuration);

      resolved.push({ startTime, duration: Math.max(duration, 0.5), item });
    }
  } else {
    // AI 자막 모드: 오케스트레이터가 정한 gap 경계(endTime)를 그대로 사용
    // ★ AI 자막은 이미 gap.start~gap.end에 맞춰져 있으므로 확장 불필요
    let lastEndTime = 0;
    for (let i = 0; i < sorted.length; i++) {
      const item = sorted[i];
      let startTime = item.startTime;
      const originalDuration = item.endTime - item.startTime;

      if (startTime < lastEndTime + gap) {
        startTime = lastEndTime + gap;
      }

      // endTime을 초과하지 않음
      const duration = Math.min(originalDuration, item.endTime - startTime);

      if (duration >= 0.3) {
        resolved.push({ startTime, duration, item });
        lastEndTime = startTime + duration;
      }
    }
  }

  return resolved;
}

// ============================================
// 통합 파이프라인 (단일 트랙용)
// ============================================

export function buildSubtitlePlacements(
  items: TranscriptItem[],
  options: { gap?: number; continuous?: boolean; timelineEnd?: number } = {},
): PlacedSubtitle[] {
  const { gap = SUBTITLE_GAP_SECONDS, continuous = false, timelineEnd } = options;
  // 대본·AI 모두 긴 텍스트 분할 적용 (화면 밖 overflow 방지)
  // 3초 미만 조각은 placeWithoutOverlap에서 SUBTITLE_MIN_DURATION으로 보장
  const expanded = splitLongSubtitles(items);
  const placed = placeWithoutOverlap(expanded, gap, continuous);

  // timelineEnd가 있으면 초과 구간 제거/클램핑
  if (timelineEnd && timelineEnd > 0) {
    return placed
      .filter(p => p.startTime < timelineEnd)
      .map(p => {
        if (p.startTime + p.duration > timelineEnd) {
          return { ...p, duration: timelineEnd - p.startTime };
        }
        return p;
      });
  }

  return placed;
}
