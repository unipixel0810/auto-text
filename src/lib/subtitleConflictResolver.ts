/**
 * SubtitleConflictResolver — 대본/AI 자막 간 충돌 해소
 *
 * 핵심 원칙:
 *  - AI 자막이 있는 구간 → 해당 대본 제거 (배타적 노출)
 *  - 0.3초 패딩으로 시각적 충돌 방지
 *
 * 의존: types/subtitle, lib/subtitlePlacer. UI 의존 없음.
 */

import type { TranscriptItem } from '@/types/subtitle';
import { SEGMENT_MIN_DURATION } from './subtitlePlacer';

// ============================================
// 상수
// ============================================

/** 대본-AI 전환 시 최소 간격 (초) */
export const GAP_PADDING = 0.3;

// ============================================
// 타입
// ============================================

interface TimeRange {
  start: number;
  end: number;
}

// ============================================
// 헬퍼
// ============================================

function estimateTextForRange(
  d: TranscriptItem,
  seg: TimeRange,
): string {
  const fullText = d.editedText || d.originalText;
  const totalDur = d.endTime - d.startTime;
  if (totalDur <= 0) return fullText;

  const startRatio = Math.max(0, (seg.start - d.startTime) / totalDur);
  const endRatio = Math.min(1, (seg.end - d.startTime) / totalDur);
  const startIdx = Math.floor(startRatio * fullText.length);
  const endIdx = Math.ceil(endRatio * fullText.length);
  return fullText.slice(startIdx, endIdx).trim();
}

/**
 * 하나의 시간 범위 리스트에서 다른 범위를 잘라내는 공통 로직
 */
function subtractRanges(
  ranges: TimeRange[],
  blocker: TimeRange,
): TimeRange[] {
  const padStart = blocker.start - GAP_PADDING;
  const padEnd = blocker.end + GAP_PADDING;
  const result: TimeRange[] = [];

  for (const seg of ranges) {
    if (padEnd <= seg.start || padStart >= seg.end) {
      result.push(seg);
      continue;
    }
    if (padStart > seg.start) {
      result.push({ start: seg.start, end: padStart });
    }
    if (padEnd < seg.end) {
      result.push({ start: padEnd, end: seg.end });
    }
  }
  return result;
}

// ============================================
// 대본 구간에서 AI 자막 잘라내기
// ============================================

export function cutDialogueAroundAi(
  dialogueItems: TranscriptItem[],
  aiItems: TranscriptItem[],
): TranscriptItem[] {
  if (aiItems.length === 0) return dialogueItems;

  const result: TranscriptItem[] = [];

  for (const d of dialogueItems) {
    let segments: TimeRange[] = [{ start: d.startTime, end: d.endTime }];
    for (const ai of aiItems) {
      segments = subtractRanges(segments, { start: ai.startTime, end: ai.endTime });
    }

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (seg.end - seg.start < SEGMENT_MIN_DURATION) continue;

      let segText: string;
      let segWords = d.words;

      if (d.words && d.words.length > 0) {
        const wordsInRange = d.words.filter(
          w => w.startTime >= seg.start - 0.15 && w.endTime <= seg.end + 0.15,
        );
        if (wordsInRange.length > 0) {
          segText = wordsInRange.map(w => w.word).join(' ');
          segWords = wordsInRange;
        } else {
          segText = estimateTextForRange(d, seg);
          segWords = undefined;
        }
      } else {
        segText = estimateTextForRange(d, seg);
        segWords = undefined;
      }

      if (segText.trim().length === 0) continue;

      result.push({
        ...d,
        id: i === 0 ? d.id : `${d.id}_${i}`,
        startTime: seg.start,
        endTime: seg.end,
        originalText: segText,
        editedText: segText,
        words: segWords,
      });
    }
  }

  return result;
}

// ============================================
// AI 자막에서 대본 구간 잘라내기 (대본 우선)
// ============================================

export function cutAiAroundDialogue(
  aiItems: TranscriptItem[],
  dialogueItems: TranscriptItem[],
): TranscriptItem[] {
  if (dialogueItems.length === 0) return aiItems;

  const result: TranscriptItem[] = [];

  for (const ai of aiItems) {
    let segments: TimeRange[] = [{ start: ai.startTime, end: ai.endTime }];
    for (const d of dialogueItems) {
      segments = subtractRanges(segments, { start: d.startTime, end: d.endTime });
    }

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      if (seg.end - seg.start < SEGMENT_MIN_DURATION) continue;
      result.push({
        ...ai,
        id: i === 0 ? ai.id : `${ai.id}_${i}`,
        startTime: seg.start,
        endTime: seg.end,
      });
    }
  }

  return result;
}

// ============================================
// AI 자막끼리 겹침 해소
// ============================================

export function deoverlapAiItems(items: TranscriptItem[]): TranscriptItem[] {
  if (items.length <= 1) return items;

  const sorted = [...items].sort((a, b) => a.startTime - b.startTime);
  const result: TranscriptItem[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const prev = result[result.length - 1];
    const cur = sorted[i];

    if (cur.startTime < prev.endTime) {
      prev.endTime = cur.startTime;
      if (prev.endTime - prev.startTime >= SEGMENT_MIN_DURATION) {
        result.push({ ...cur });
      } else {
        result[result.length - 1] = { ...cur };
      }
    } else {
      result.push({ ...cur });
    }
  }

  return result;
}
