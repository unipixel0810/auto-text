/**
 * AudioGapDetector — 오디오 파형 분석 기반 음성 구간 감지
 *
 * 타임라인 클립의 waveform 데이터를 분석하여:
 *  1. 음성이 존재하는 구간(AudioSegment)을 식별
 *  2. 대본(Script)이 없는 빈 구간(Gap)을 찾아냄
 *  3. AI 자막을 배치할 후보 슬롯을 반환
 *
 * 의존: types/video, types/subtitle. UI 의존 없음.
 */

import type { VideoClip } from '@/types/video';
import type { TranscriptItem } from '@/types/subtitle';

// ============================================
// 상수
// ============================================

/** 음성 감지 최소 진폭 (0~1, waveform 정규화 기준) */
const MIN_AUDIO_THRESHOLD = 0.08;

/** 음성 구간 최소 길이 (초) — 이보다 짧으면 노이즈로 무시 */
const MIN_VOICE_DURATION = 0.3;

/** 대본-AI 전환 시 최소 간격 (초) */
const SCRIPT_AI_PADDING = 0.3;

/** AI 자막 최소 노출 시간 (초) */
const AI_SUBTITLE_MIN_DURATION = 1.0;

/** 인접 음성 구간 병합 임계치 (초) — 이보다 가까우면 하나로 합침 */
const MERGE_GAP_THRESHOLD = 0.5;

// ============================================
// 타입
// ============================================

export interface AudioSegment {
  start: number;
  end: number;
}

export interface ScriptSegment {
  start: number;
  end: number;
}

export interface AiSlot {
  start: number;
  end: number;
}

// ============================================
// 1. 파형에서 음성 구간 추출
// ============================================

/**
 * 클립의 waveform 데이터를 분석하여 음성이 존재하는 타임라인 구간을 반환
 */
export function detectAudioSegments(
  clips: VideoClip[],
  trackIndex = 1,
): AudioSegment[] {
  const mainClips = clips
    .filter(c => c.trackIndex === trackIndex && c.waveform && c.waveform.length > 0)
    .sort((a, b) => a.startTime - b.startTime);

  if (mainClips.length === 0) return [];

  const raw: AudioSegment[] = [];

  for (const clip of mainClips) {
    const wf = clip.waveform!;
    const samplesPerSecond = wf.length / clip.duration;
    let segStart: number | null = null;

    for (let i = 0; i < wf.length; i++) {
      const t = clip.startTime + i / samplesPerSecond;
      const isVoice = wf[i] >= MIN_AUDIO_THRESHOLD;

      if (isVoice && segStart === null) {
        segStart = t;
      } else if (!isVoice && segStart !== null) {
        const dur = t - segStart;
        if (dur >= MIN_VOICE_DURATION) {
          raw.push({ start: segStart, end: t });
        }
        segStart = null;
      }
    }
    // 클립 끝까지 음성이 이어진 경우
    if (segStart !== null) {
      const clipEnd = clip.startTime + clip.duration;
      if (clipEnd - segStart >= MIN_VOICE_DURATION) {
        raw.push({ start: segStart, end: clipEnd });
      }
    }
  }

  // 인접 구간 병합
  return mergeAdjacentSegments(raw);
}

function mergeAdjacentSegments(segments: AudioSegment[]): AudioSegment[] {
  if (segments.length <= 1) return segments;
  const sorted = [...segments].sort((a, b) => a.start - b.start);
  const merged: AudioSegment[] = [{ ...sorted[0] }];

  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    if (sorted[i].start - last.end <= MERGE_GAP_THRESHOLD) {
      last.end = Math.max(last.end, sorted[i].end);
    } else {
      merged.push({ ...sorted[i] });
    }
  }
  return merged;
}

// ============================================
// 2. 대본 구간 추출
// ============================================

export function extractScriptSegments(
  transcripts: TranscriptItem[],
): ScriptSegment[] {
  return transcripts
    .filter(t => t.endTime > t.startTime)
    .map(t => ({ start: t.startTime, end: t.endTime }))
    .sort((a, b) => a.start - b.start);
}

// ============================================
// 3. 음성 있고 대본 없는 빈 구간 찾기
// ============================================

/**
 * audio_exists && !script_exists 구간을 정확히 찾아냄
 * 대본 시작/끝 기준 SCRIPT_AI_PADDING 간격을 둠
 */
export function findAiSlots(
  audioSegments: AudioSegment[],
  scriptSegments: ScriptSegment[],
): AiSlot[] {
  if (audioSegments.length === 0) return [];

  const slots: AiSlot[] = [];

  for (const audio of audioSegments) {
    // 이 오디오 구간에서 대본이 차지하는 부분을 제거
    let freeRanges: AiSlot[] = [{ start: audio.start, end: audio.end }];

    for (const script of scriptSegments) {
      const padStart = script.start - SCRIPT_AI_PADDING;
      const padEnd = script.end + SCRIPT_AI_PADDING;
      const next: AiSlot[] = [];

      for (const range of freeRanges) {
        if (padEnd <= range.start || padStart >= range.end) {
          // 겹치지 않음
          next.push(range);
          continue;
        }
        // 왼쪽 조각
        if (padStart > range.start) {
          next.push({ start: range.start, end: padStart });
        }
        // 오른쪽 조각
        if (padEnd < range.end) {
          next.push({ start: padEnd, end: range.end });
        }
      }
      freeRanges = next;
    }

    // 최소 시간 이상인 슬롯만 추가
    for (const range of freeRanges) {
      if (range.end - range.start >= AI_SUBTITLE_MIN_DURATION) {
        slots.push(range);
      }
    }
  }

  return slots.sort((a, b) => a.start - b.start);
}

// ============================================
// 4. 통합: 클립 + 대본 → AI 슬롯
// ============================================

/**
 * 타임라인 클립과 대본 데이터로부터
 * AI 자막을 배치할 빈 슬롯 목록을 반환
 */
export function detectAiSubtitleSlots(
  clips: VideoClip[],
  transcripts: TranscriptItem[],
): AiSlot[] {
  const audioSegs = detectAudioSegments(clips);
  const scriptSegs = extractScriptSegments(transcripts);
  return findAiSlots(audioSegs, scriptSegs);
}
