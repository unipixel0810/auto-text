/**
 * SubtitleOrchestrator — 자막 믹싱 UseCase
 *
 * 핵심 원칙:
 *  1. 대본과 AI 자막은 절대 동시 노출 불가 (배타적).
 *  2. AI 자막은 대본 빈 구간에만 배치 + 전체 타임라인에 골고루.
 *  3. 3종 스타일 DNA (예능:상황:설명 = 3:3:4) 자동 할당.
 *  4. 오디오 파형 기반: 음성 있고 대본 없는 구간 → AI 슬롯.
 *  5. 동일 텍스트 중복 금지.
 *
 * 의존: types/subtitle, types/video,
 *       lib/subtitleConflictResolver, lib/audioGapDetector.
 * UI 의존 없음.
 */

import type { TranscriptItem } from '@/types/subtitle';
import type { VideoClip } from '@/types/video';
import {
  cutDialogueAroundAi,
  deoverlapAiItems,
} from './subtitleConflictResolver';
import { deduplicateByText, deduplicateDialogue } from './subtitleDeduplicator';

// ============================================
// 상수
// ============================================

export const AI_STYLE_RATIOS = {
  ENTERTAINMENT: 0.30,
  SITUATION: 0.30,
  EXPLANATION: 0.40,
} as const;

export const AI_STYLE_COLORS: Record<string, { color: string; strokeColor: string }> = {
  '예능자막': { color: '#FFE066', strokeColor: '#FF6B6B' },
  '예능':     { color: '#FFE066', strokeColor: '#FF6B6B' },
  '상황자막': { color: '#A8E6CF', strokeColor: '#000000' },
  '상황':     { color: '#A8E6CF', strokeColor: '#000000' },
  '설명자막': { color: '#88D8FF', strokeColor: '#0066CC' },
  '설명':     { color: '#88D8FF', strokeColor: '#0066CC' },
  '맥락':     { color: '#C9A0FF', strokeColor: '#6B21A8' },
};

const STYLE_CYCLE: ('예능' | '상황' | '설명')[] = [
  '예능', '상황', '설명', '예능', '상황', '설명', '설명', '예능', '상황', '설명',
];

/** AI 자막 최소 간격 (초) */
const AI_MIN_GAP = 1.0;

// ============================================
// 타입
// ============================================

export interface OrchestratedResult {
  dialogueItems: TranscriptItem[];
  aiItems: TranscriptItem[];
}

// ============================================
// 대본 빈 구간(Gap) 계산
// ============================================

interface Gap { start: number; end: number }

/** 대본의 실제 표시 시간 최소값 (subtitlePlacer의 SUBTITLE_MIN_DURATION과 동일) */
const DIALOGUE_MIN_DISPLAY = 3.0;

/** 대본 사이의 빈 구간 추출 (최소 AI_MIN_GAP 이상)
 *  ★ 대본이 타임라인에서 최소 3초로 연장되는 것을 반영하여 gap 계산
 */
function findDialogueGaps(
  dialogue: TranscriptItem[],
  timelineEnd: number,
): Gap[] {
  if (dialogue.length === 0) return [{ start: 0, end: timelineEnd }];
  const sorted = [...dialogue].sort((a, b) => a.startTime - b.startTime);

  // 대본의 실제 표시 endTime 계산 (최소 3초 보장, 다음 대본 침범 안 함)
  const displayEnds: number[] = sorted.map((d, i) => {
    const rawEnd = d.endTime;
    const minEnd = d.startTime + DIALOGUE_MIN_DISPLAY;
    const nextStart = i + 1 < sorted.length ? sorted[i + 1].startTime : timelineEnd;
    return Math.min(Math.max(rawEnd, minEnd), nextStart);
  });

  const gaps: Gap[] = [];

  // 타임라인 시작 ~ 첫 대본
  if (sorted[0].startTime > AI_MIN_GAP) {
    gaps.push({ start: 0, end: sorted[0].startTime });
  }
  // 대본 사이 — 연장된 endTime 기준으로 gap 계산
  for (let i = 0; i < sorted.length - 1; i++) {
    const gapStart = displayEnds[i];
    const gapEnd = sorted[i + 1].startTime;
    if (gapEnd - gapStart >= AI_MIN_GAP) {
      gaps.push({ start: gapStart, end: gapEnd });
    }
  }
  // 마지막 대본 ~ 타임라인 끝
  const lastEnd = displayEnds[displayEnds.length - 1];
  if (timelineEnd - lastEnd >= AI_MIN_GAP) {
    gaps.push({ start: lastEnd, end: timelineEnd });
  }
  return gaps;
}

// ============================================
// AI 자막을 대본 빈 구간에만 배치 + 골고루 분배
// ============================================

function placeAiInGaps(
  aiItems: TranscriptItem[],
  gaps: Gap[],
  timelineEnd: number,
): TranscriptItem[] {
  if (aiItems.length === 0 || gaps.length === 0) return [];

  const sorted = [...aiItems].sort((a, b) => a.startTime - b.startTime);
  const usedGaps = new Set<number>();

  // 1단계: 각 AI 자막을 가장 가까운 gap에 배정하고, gap 경계에 정확히 맞춤
  const placed: TranscriptItem[] = [];
  for (const ai of sorted) {
    const aiMid = (ai.startTime + ai.endTime) / 2;

    // 아직 사용 안 된 가장 가까운 gap 찾기
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let g = 0; g < gaps.length; g++) {
      if (usedGaps.has(g)) continue;
      const gMid = (gaps[g].start + gaps[g].end) / 2;
      const dist = Math.abs(aiMid - gMid);
      if (dist < bestDist) { bestDist = dist; bestIdx = g; }
    }
    if (bestIdx === -1) continue;

    const gap = gaps[bestIdx];
    usedGaps.add(bestIdx);

    // ★ 핵심: AI 자막의 시작/끝을 gap 경계에 정확히 맞춤
    // (대본이 끝나는 지점에서 시작, 다음 대본이 시작하는 지점에서 끝)
    const newStart = gap.start;
    const newEnd = gap.end;

    if (newEnd - newStart >= 0.5) {
      placed.push({ ...ai, startTime: newStart, endTime: newEnd });
    }
  }

  // 2단계: 골고루 분배 — 타임라인 N등분, 구간당 최대 1개
  if (placed.length <= 1) return placed;
  const slotCount = Math.max(3, Math.floor(timelineEnd / 10));
  const slotDur = timelineEnd / slotCount;
  const distributed: TranscriptItem[] = [];

  for (let s = 0; s < slotCount; s++) {
    const sStart = s * slotDur;
    const sEnd = (s + 1) * slotDur;
    const sMid = (sStart + sEnd) / 2;
    const cands = placed.filter(a => a.startTime >= sStart && a.startTime < sEnd);
    if (cands.length === 0) continue;
    const best = cands.reduce((a, b) =>
      Math.abs(a.startTime - sMid) < Math.abs(b.startTime - sMid) ? a : b
    );
    if (distributed.length === 0 || best.startTime - distributed[distributed.length - 1].endTime >= AI_MIN_GAP) {
      distributed.push(best);
    }
  }

  return distributed;
}

// ============================================
// 3종 스타일 DNA 자동 할당
// ============================================

function assignStyleDna(items: TranscriptItem[]): TranscriptItem[] {
  return items.map((item, i) => {
    // 이미 스타일이 지정된 경우 유지
    const existingColor = item.color;
    if (existingColor && existingColor !== '#FFFFFF') return item;

    const style = STYLE_CYCLE[i % STYLE_CYCLE.length];
    const colors = AI_STYLE_COLORS[style] ?? { color: '#FFFFFF', strokeColor: '#000000' };
    return { ...item, color: colors.color, strokeColor: colors.strokeColor };
  });
}

// ============================================
// 레거시 호환
// ============================================

export function removeOverlaps(
  transcripts: TranscriptItem[],
  aiSubtitles: TranscriptItem[],
): TranscriptItem[] {
  return cutDialogueAroundAi(transcripts, aiSubtitles);
}

// ============================================
// 통합 오케스트레이션
// ============================================

export function orchestrate(
  dialogueItems: TranscriptItem[],
  rawAiItems: TranscriptItem[],
  timelineEnd: number,
  _clips?: VideoClip[],
): OrchestratedResult {
  const dialogue = deduplicateDialogue(dialogueItems);
  const aiRaw = deduplicateByText(rawAiItems);

  // 1. AI 자막 겹침 해소
  const deoverlapped = deoverlapAiItems(aiRaw);

  // 2. 대본 빈 구간 계산
  const gaps = findDialogueGaps(dialogue, timelineEnd);

  // 3. AI 자막을 빈 구간에만 배치 + 골고루 분배
  const placedAi = placeAiInGaps(deoverlapped, gaps, timelineEnd);

  // 4. 3종 스타일 DNA 할당
  const styledAi = assignStyleDna(placedAi);

  // 5. 배타적 노출: AI 자막 구간의 대본 제거
  const trimmedDialogue = cutDialogueAroundAi(dialogue, styledAi);

  // 6. 타임라인 끝 clamp
  const clampD = trimmedDialogue
    .filter(d => d.startTime < timelineEnd)
    .map(d => d.endTime > timelineEnd ? { ...d, endTime: timelineEnd } : d);
  const clampA = styledAi
    .filter(a => a.startTime < timelineEnd)
    .map(a => a.endTime > timelineEnd ? { ...a, endTime: timelineEnd } : a);

  return { dialogueItems: clampD, aiItems: clampA };
}
