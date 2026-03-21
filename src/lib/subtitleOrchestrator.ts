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

/** 강제 배치 시 최소 슬롯 시간 (초) — 자연 gap이 부족할 때 */
const FORCED_MIN_SLOT = 0.8;

/** AI 자막 최소 비율 — 전체 자막 중 AI가 이 비율 이상 (대본:AI = 7:3) */
const AI_MIN_RATIO = 0.3;

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

/**
 * 대본의 실제 발화 종료 시간 추출
 * - words가 있으면 마지막 단어의 endTime (실제 음성 끝)
 * - words가 없으면 endTime 사용하되, Whisper가 늘려놓은 것일 수 있으므로
 *   startTime + 텍스트 길이 기반 추정(글자당 0.12초)으로 보수적 cap
 */
function getSpeechEndTime(item: TranscriptItem): number {
  if (item.words && item.words.length > 0) {
    return item.words[item.words.length - 1].endTime;
  }
  // words가 없으면 텍스트 길이로 발화 시간 추정
  const text = item.editedText || item.originalText || '';
  const estimatedDur = Math.max(0.5, text.length * 0.12); // 한국어 ~8자/초
  const estimated = item.startTime + estimatedDur;
  // 원본 endTime보다 길면 원본 사용
  return Math.min(estimated, item.endTime);
}

/** 대본 사이의 빈 구간 추출 (최소 AI_MIN_GAP 이상)
 *  ★ 대본의 실제 발화 종료 시점 기준으로 gap 계산
 *    대본 화면 표시 3초 연장은 step 5.5에서 AI 경계를 넘지 않는 범위 내로 처리
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
  // 대본 사이 — 실제 발화 종료 시점 기준으로 gap 계산
  for (let i = 0; i < sorted.length - 1; i++) {
    const speechEnd = getSpeechEndTime(sorted[i]);
    const gapStart = speechEnd;
    const gapEnd = sorted[i + 1].startTime;
    if (gapEnd - gapStart >= AI_MIN_GAP) {
      gaps.push({ start: gapStart, end: gapEnd });
    }
  }
  // 마지막 대본 ~ 타임라인 끝
  const lastSpeechEnd = getSpeechEndTime(sorted[sorted.length - 1]);
  if (timelineEnd - lastSpeechEnd >= AI_MIN_GAP) {
    gaps.push({ start: lastSpeechEnd, end: timelineEnd });
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

  console.log(`[placeAiInGaps] gaps=${gaps.length} → slots=${slots.length}, aiItems=${aiItems.length}`);
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
// 강제 인터리빙 — AI 비율 50% 미달 시 대본 사이에 강제 배치
// ============================================

function forceInterleaveAi(
  dialogue: TranscriptItem[],
  aiPool: TranscriptItem[],
  alreadyPlaced: TranscriptItem[],
  timelineEnd: number,
): TranscriptItem[] {
  // AI 70% 목표: AI / (AI + dialogue) >= 0.7 → AI >= dialogue * (0.7/0.3) ≈ 2.33
  const totalTarget = Math.ceil(dialogue.length * (AI_MIN_RATIO / (1 - AI_MIN_RATIO)));
  const needed = totalTarget - alreadyPlaced.length;
  if (needed <= 0) return alreadyPlaced;

  const sorted = [...dialogue].sort((a, b) => a.startTime - b.startTime);
  // 아직 배치 안 된 AI 자막 풀
  const usedTexts = new Set(alreadyPlaced.map(a => a.editedText || a.originalText));
  const available = aiPool.filter(ai => !usedTexts.has(ai.editedText || ai.originalText));

  const forced = [...alreadyPlaced];
  let aiIdx = 0;

  // 대본 사이마다 AI 슬롯을 강제로 끼워넣기 (여러 개 가능)
  for (let i = 0; i < sorted.length && aiIdx < available.length && forced.length - alreadyPlaced.length < needed; i++) {
    const d = sorted[i];
    const speechEnd = getSpeechEndTime(d);
    const nextStart = i + 1 < sorted.length ? sorted[i + 1].startTime : timelineEnd;
    const gapDur = nextStart - speechEnd;

    if (gapDur < FORCED_MIN_SLOT) continue;

    // 이 gap에 넣을 수 있는 슬롯 수 계산 (슬롯당 2초 + 간격 0.3초)
    const slotSize = 2.0;
    const slotGap = 0.3;
    const maxSlots = Math.max(1, Math.floor((gapDur + slotGap) / (slotSize + slotGap)));
    const slotsNeeded = Math.min(maxSlots, needed - (forced.length - alreadyPlaced.length));

    for (let s = 0; s < slotsNeeded && aiIdx < available.length; s++) {
      const slotStart = speechEnd + s * (slotSize + slotGap);
      const slotEnd = Math.min(slotStart + slotSize, nextStart - (s < slotsNeeded - 1 ? slotGap : 0));
      if (slotEnd - slotStart < FORCED_MIN_SLOT) break;

      // 이미 이 시간에 AI가 있으면 스킵
      const hasAi = forced.some(a => a.startTime < slotEnd && a.endTime > slotStart);
      if (hasAi) continue;

      forced.push({
        ...available[aiIdx],
        startTime: slotStart,
        endTime: slotEnd,
      });
      aiIdx++;
    }
  }

  console.log(`[forceInterleave] needed=${needed}, placed=${forced.length - alreadyPlaced.length}, total AI=${forced.length}`);
  return forced.sort((a, b) => a.startTime - b.startTime);
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

  // 3. AI 자막을 빈 구간에 배치 + 골고루 분배
  const placedAi = placeAiInGaps(deoverlapped, gaps, timelineEnd);
  console.log(`[orchestrate] placedAi=${placedAi.length}`);

  // 3.5. AI 비율 50% 미달 시 강제 인터리빙
  const aiRatio = placedAi.length / Math.max(1, placedAi.length + dialogue.length);
  let finalPlacedAi = placedAi;
  if (aiRatio < AI_MIN_RATIO && deoverlapped.length > placedAi.length) {
    console.log(`[orchestrate] AI 비율 ${(aiRatio * 100).toFixed(0)}% < ${AI_MIN_RATIO * 100}% → 강제 인터리빙 시작`);
    finalPlacedAi = forceInterleaveAi(dialogue, deoverlapped, placedAi, timelineEnd);
  }
  const newRatio = finalPlacedAi.length / Math.max(1, finalPlacedAi.length + dialogue.length);
  console.log(`[orchestrate] 최종 AI: ${finalPlacedAi.length}개 (비율 ${(newRatio * 100).toFixed(0)}%)`);

  // 4. 3종 스타일 DNA 할당
  const styledAi = assignStyleDna(finalPlacedAi);

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
