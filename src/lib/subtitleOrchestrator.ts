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

/** AI 자막 최대 표시 시간 (초) — gap이 길어도 이 이상 안 늘어남 */
const AI_MAX_DURATION = 5.0;

/** AI 자막 최소 표시 시간 (초) */
const AI_MIN_DURATION = 1.0;

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
 *  ★ 대본의 원본 endTime(STT 타이밍) 기준으로 gap 계산
 *    3초 연장은 AI 배치 후 step 5.5에서 처리 (AI 경계를 넘지 않는 범위 내)
 *    → 대본이 빽빽해도 음성이 끝난 순간부터 AI 자막 배치 가능
 */
function findDialogueGaps(
  dialogue: TranscriptItem[],
  timelineEnd: number,
): Gap[] {
  if (dialogue.length === 0) return [{ start: 0, end: timelineEnd }];
  const sorted = [...dialogue].sort((a, b) => a.startTime - b.startTime);

  const gaps: Gap[] = [];

  // 타임라인 시작 ~ 첫 대본
  if (sorted[0].startTime > AI_MIN_GAP) {
    gaps.push({ start: 0, end: sorted[0].startTime });
  }
  // 대본 사이 — 원본 endTime 기준으로 gap 계산
  for (let i = 0; i < sorted.length - 1; i++) {
    const gapStart = sorted[i].endTime;
    const gapEnd = sorted[i + 1].startTime;
    if (gapEnd - gapStart >= AI_MIN_GAP) {
      gaps.push({ start: gapStart, end: gapEnd });
    }
  }
  // 마지막 대본 ~ 타임라인 끝
  const lastEnd = sorted[sorted.length - 1].endTime;
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
  _timelineEnd: number,
): TranscriptItem[] {
  if (aiItems.length === 0 || gaps.length === 0) return [];

  // 1단계: gap을 슬롯으로 분할 (큰 gap → 여러 슬롯)
  interface Slot { start: number; end: number }
  const slots: Slot[] = [];

  for (const gap of gaps) {
    const gapDur = gap.end - gap.start;
    if (gapDur < AI_MIN_DURATION) continue;

    if (gapDur <= AI_MAX_DURATION) {
      // 작은 gap → 슬롯 1개 (gap 전체 사용)
      slots.push({ start: gap.start, end: gap.end });
    } else {
      // 큰 gap → 여러 슬롯으로 분할
      const numSlots = Math.max(1, Math.floor(gapDur / AI_MAX_DURATION));
      const slotDur = Math.min(AI_MAX_DURATION, gapDur / numSlots);
      // 슬롯을 gap 내에 균등 배치 (간격 포함)
      const totalSlotTime = numSlots * slotDur;
      const spacing = numSlots > 1 ? (gapDur - totalSlotTime) / (numSlots - 1) : 0;

      for (let s = 0; s < numSlots; s++) {
        const slotStart = gap.start + s * (slotDur + spacing);
        const slotEnd = slotStart + slotDur;
        if (slotEnd <= gap.end + 0.01) {
          slots.push({ start: slotStart, end: Math.min(slotEnd, gap.end) });
        }
      }
    }
  }

  if (slots.length === 0) return [];

  // 2단계: AI 자막을 가장 가까운 슬롯에 1:1 매칭
  const sorted = [...aiItems].sort((a, b) => a.startTime - b.startTime);
  const usedSlots = new Set<number>();
  const placed: TranscriptItem[] = [];

  for (const ai of sorted) {
    const aiMid = (ai.startTime + ai.endTime) / 2;

    let bestIdx = -1;
    let bestDist = Infinity;
    for (let s = 0; s < slots.length; s++) {
      if (usedSlots.has(s)) continue;
      const sMid = (slots[s].start + slots[s].end) / 2;
      const dist = Math.abs(aiMid - sMid);
      if (dist < bestDist) { bestDist = dist; bestIdx = s; }
    }
    if (bestIdx === -1) continue;

    const slot = slots[bestIdx];
    usedSlots.add(bestIdx);

    const dur = slot.end - slot.start;
    if (dur >= AI_MIN_DURATION) {
      placed.push({ ...ai, startTime: slot.start, endTime: slot.end });
    }
  }

  return placed.sort((a, b) => a.startTime - b.startTime);
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
  console.log(`[orchestrate] 입력: dialogue=${dialogue.length}, aiRaw=${aiRaw.length}, deoverlapped=${deoverlapped.length}, timelineEnd=${timelineEnd}`);

  // 2. 대본 빈 구간 계산
  const gaps = findDialogueGaps(dialogue, timelineEnd);
  console.log(`[orchestrate] gaps=${gaps.length}`, gaps.slice(0, 5).map(g => `${g.start.toFixed(1)}-${g.end.toFixed(1)}(${(g.end-g.start).toFixed(1)}s)`));

  // 3. AI 자막을 빈 구간에만 배치 + 골고루 분배
  const placedAi = placeAiInGaps(deoverlapped, gaps, timelineEnd);
  console.log(`[orchestrate] placedAi=${placedAi.length}`);

  // 4. 3종 스타일 DNA 할당
  const styledAi = assignStyleDna(placedAi);

  // 5. 배타적 노출: AI 자막 구간의 대본 제거
  const trimmedDialogue = cutDialogueAroundAi(dialogue, styledAi);

  // 5.5. 대본 최소 3초 보장 (AI 경계를 넘지 않는 범위 내)
  //      gap 계산은 3초 기준이지만 원본 endTime이 짧을 수 있으므로 여기서 확장
  const sortedAiStarts = styledAi.map(a => a.startTime).sort((a, b) => a - b);
  const sortedDStarts = [...trimmedDialogue].sort((a, b) => a.startTime - b.startTime).map(d => d.startTime);
  const extendedDialogue = trimmedDialogue.map(d => {
    const minEnd = d.startTime + DIALOGUE_MIN_DISPLAY;
    if (d.endTime >= minEnd) return d;
    // 확장 가능한 최대 지점: AI 시작 또는 다음 대본 시작 중 가까운 것
    let cap = minEnd;
    for (const t of sortedAiStarts) {
      if (t > d.startTime && t < cap) { cap = t; break; }
    }
    for (const t of sortedDStarts) {
      if (t > d.startTime && t < cap) { cap = t; break; }
    }
    return { ...d, endTime: Math.max(d.endTime, Math.min(minEnd, cap)) };
  });

  // 6. 타임라인 끝 clamp
  const clampD = extendedDialogue
    .filter(d => d.startTime < timelineEnd)
    .map(d => d.endTime > timelineEnd ? { ...d, endTime: timelineEnd } : d);
  const clampA = styledAi
    .filter(a => a.startTime < timelineEnd)
    .map(a => a.endTime > timelineEnd ? { ...a, endTime: timelineEnd } : a);

  return { dialogueItems: clampD, aiItems: clampA };
}
