/**
 * TranscriptGapAnalyzer — 대본 공백 구간 탐지 UseCase
 *
 * 핵심 역할:
 *  1. 타임라인 클립(waveform)에서 음성 존재 구간을 감지
 *  2. 기존 대본(TranscriptItem[])과 비교하여 대본이 누락된 구간을 식별
 *  3. 누락 구간을 MediaRange[]로 반환 → STT 재분석 트리거용
 *
 * 아키텍처: application 레이어 UseCase
 * 의존: lib/audioGapDetector (domain), types/video, types/subtitle
 * UI 의존 없음.
 */

import type { VideoClip } from '@/types/video';
import type { TranscriptItem } from '@/types/subtitle';
import type { MediaRange } from '@/lib/geminiAudioService';
import {
  detectAudioSegments,
  extractScriptSegments,
  type AudioSegment,
} from './audioGapDetector';

// ============================================
// 상수
// ============================================

/** 음성 존재 판정 최소 길이 (초) */
const MIN_GAP_DURATION = 0.5;

/** 대본과 음성 구간 비교 시 허용 오차 (초) */
const OVERLAP_TOLERANCE = 0.2;

/** 대본 커버리지 최소 비율 — 이보다 적게 커버하면 공백으로 간주 */
const MIN_COVERAGE_RATIO = 0.3;

// ============================================
// 타입
// ============================================

export interface TranscriptGap {
  /** 타임라인 시작 시간 (초) */
  timelineStart: number;
  /** 타임라인 끝 시간 (초) */
  timelineEnd: number;
  /** 미디어 시작 시간 (원본 파일 기준, 초) */
  mediaStart: number;
  /** 미디어 끝 시간 (원본 파일 기준, 초) */
  mediaEnd: number;
}

// ============================================
// 핵심 로직
// ============================================

/**
 * 음성이 있지만 대본이 없는 공백 구간을 찾아 MediaRange[]로 반환
 *
 * @param clips 타임라인 전체 클립 배열
 * @param transcripts 현재 존재하는 대본 목록
 * @returns 대본이 누락된 미디어 구간 목록 (STT 재분석용)
 */
export function findTranscriptGaps(
  clips: VideoClip[],
  transcripts: TranscriptItem[],
): TranscriptGap[] {
  const mainClips = clips
    .filter(c => c.trackIndex === 1)
    .sort((a, b) => a.startTime - b.startTime);

  if (mainClips.length === 0) return [];

  // 1. 오디오 파형에서 음성 존재 구간 추출
  const audioSegments = detectAudioSegments(clips);
  if (audioSegments.length === 0) return [];

  // 2. 기존 대본의 타임라인 구간 추출
  const scriptSegments = extractScriptSegments(transcripts);

  // 3. 음성 구간에서 대본이 커버하지 않는 부분 식별
  const gaps: TranscriptGap[] = [];

  for (const audio of audioSegments) {
    const uncovered = subtractScriptFromAudio(audio, scriptSegments);
    for (const range of uncovered) {
      if (range.end - range.start < MIN_GAP_DURATION) continue;

      // 타임라인 시간 → 미디어 시간 역산
      const mediaRange = timelineToMedia(range.start, range.end, mainClips);
      if (!mediaRange) continue;

      gaps.push({
        timelineStart: range.start,
        timelineEnd: range.end,
        mediaStart: mediaRange.start,
        mediaEnd: mediaRange.end,
      });
    }
  }

  return gaps.sort((a, b) => a.timelineStart - b.timelineStart);
}

/**
 * 공백 구간을 STT가 받는 MediaRange[] 형태로 변환
 */
export function gapsToMediaRanges(gaps: TranscriptGap[]): MediaRange[] {
  return gaps.map(g => ({ start: g.mediaStart, end: g.mediaEnd }));
}

/**
 * 전체 클립에 대해 공백 분석 후 STT용 MediaRange 반환
 * (RightSidebar에서 직접 호출하는 통합 엔트리포인트)
 */
export function analyzeAndGetGapRanges(
  clips: VideoClip[],
  transcripts: TranscriptItem[],
): MediaRange[] {
  const gaps = findTranscriptGaps(clips, transcripts);
  if (gaps.length === 0) return [];
  console.log(`[GapAnalyzer] ${gaps.length}개 대본 공백 발견:`,
    gaps.map(g => `${g.timelineStart.toFixed(1)}~${g.timelineEnd.toFixed(1)}s`));
  return gapsToMediaRanges(gaps);
}

// ============================================
// 내부 헬퍼
// ============================================

/**
 * 하나의 오디오 구간에서 대본이 커버하는 부분을 빼고 남은 범위 반환
 */
function subtractScriptFromAudio(
  audio: AudioSegment,
  scripts: { start: number; end: number }[],
): { start: number; end: number }[] {
  let freeRanges: { start: number; end: number }[] = [
    { start: audio.start, end: audio.end },
  ];

  for (const script of scripts) {
    const padStart = script.start - OVERLAP_TOLERANCE;
    const padEnd = script.end + OVERLAP_TOLERANCE;
    const next: { start: number; end: number }[] = [];

    for (const range of freeRanges) {
      if (padEnd <= range.start || padStart >= range.end) {
        next.push(range);
        continue;
      }
      if (padStart > range.start) {
        next.push({ start: range.start, end: padStart });
      }
      if (padEnd < range.end) {
        next.push({ start: padEnd, end: range.end });
      }
    }
    freeRanges = next;
  }

  return freeRanges;
}

/**
 * 타임라인 시간을 미디어 시간(원본 파일 기준)으로 역산
 */
function timelineToMedia(
  tlStart: number,
  tlEnd: number,
  mainClips: VideoClip[],
): { start: number; end: number } | null {
  // 타임라인 범위의 중간점이 속하는 클립을 찾아서 역산
  const mid = (tlStart + tlEnd) / 2;

  for (const clip of mainClips) {
    const clipEnd = clip.startTime + clip.duration;
    if (mid >= clip.startTime && mid <= clipEnd) {
      const speed = clip.speed || 1;
      const trimStart = clip.trimStart ?? 0;
      const mediaStart = trimStart + (tlStart - clip.startTime) * speed;
      const mediaEnd = trimStart + (tlEnd - clip.startTime) * speed;
      return {
        start: Math.max(trimStart, mediaStart),
        end: Math.min(trimStart + clip.duration * speed, mediaEnd),
      };
    }
  }

  // 중간점이 어디에도 안 맞으면 가장 가까운 클립 사용
  let bestClip = mainClips[0];
  let bestDist = Infinity;
  for (const clip of mainClips) {
    const clipEnd = clip.startTime + clip.duration;
    const dist = Math.min(Math.abs(mid - clip.startTime), Math.abs(mid - clipEnd));
    if (dist < bestDist) { bestDist = dist; bestClip = clip; }
  }

  if (bestDist > 2.0) return null;

  const speed = bestClip.speed || 1;
  const trimStart = bestClip.trimStart ?? 0;
  return {
    start: trimStart + Math.max(0, tlStart - bestClip.startTime) * speed,
    end: trimStart + Math.max(0, tlEnd - bestClip.startTime) * speed,
  };
}
