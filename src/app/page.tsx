'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import Header from '@/components/layout/Header';
import SecondaryToolbar from '@/components/layout/SecondaryToolbar';
import LeftSidebar from '@/components/layout/LeftSidebar';
import Player from '@/components/layout/Player';
import RightSidebar from '@/components/layout/RightSidebar';
import Timeline from '@/components/layout/Timeline';
import { parseSubtitleFile } from '@/lib/subtitleParser';
import { buildSubtitlePlacements, SUBTITLE_GAP_SECONDS, SUBTITLE_MAX_CHARS, SUBTITLE_MAX_CHARS_PORTRAIT } from '@/lib/subtitlePlacer';
import { detectSceneChanges } from '@/lib/sceneDetector';
import type { TranscriptItem, SubtitleItem } from '@/types/subtitle';
import type { VideoClip, HistoryEntry, ClipboardData, LibraryItem } from '@/types/video';
import type { SubtitlePreset } from '@/lib/subtitlePresets';
import { ShortcutsProvider, KeyboardShortcutsModal } from '@/components/shortcuts/KeyboardShortcuts';
import {
  saveProject, getProject, getCurrentProjectId, setCurrentProjectId,
  generateProjectId, type SavedProject, type EditorUIState
} from '@/lib/projectStorage';
import { useAuth } from '@/components/auth/AuthProvider';
import { initEditingTracker, stopEditingTracker, trackEditingAction } from '@/lib/analytics/editingTracker';
import { saveMediaBlob, loadMediaBlob, listMediaKeys } from '@/lib/mediaStorage';

const FRAME_DURATION = 1 / 30;
const MIN_ZOOM = 0.001;  // Shift+Z로 1시간 이상 영상도 한 화면에 표시 가능
const MAX_ZOOM = 5;
const ZOOM_STEP = 1.25;

export default function Home() {
  const { isAuthenticated, signIn } = useAuth();

  // ── 모바일 감지 ──
  const [isMobile, setIsMobile] = useState(false);
  const [mobilePanel, setMobilePanel] = useState<'player' | 'library' | 'inspector' | 'timeline'>('player');
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const [activeTab, setActiveTab] = useState<'media' | 'audio' | 'stickers' | 'effects' | 'transitions'>('media');
  const [transcripts, setTranscripts] = useState<TranscriptItem[]>([]);
  const [subtitles, setSubtitles] = useState<SubtitleItem[]>([]);
  const [currentTime, setCurrentTime] = useState(0);       // Blue line: edit/click position
  const [playbackTime, setPlaybackTime] = useState(0);     // White line: actual video playback position
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [clips, setClips] = useState<VideoClip[]>([]);
  const [libraryItems, setLibraryItems] = useState<LibraryItem[]>([]);
  const [selectedLibraryIds, setSelectedLibraryIds] = useState<string[]>([]);
  const [selectedClipIds, setSelectedClipIds] = useState<string[]>([]);
  const [currentVideoUrl, setCurrentVideoUrl] = useState<string | undefined>();
  const [currentVideoFile, setCurrentVideoFile] = useState<File | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [rippleMode, setRippleMode] = useState(true);
  const [isTimelineHovered, setIsTimelineHovered] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [isDraggingPlayhead, setIsDraggingPlayhead] = useState(false);
  const [importToast, setImportToast] = useState<string | null>(null);
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
  const [currentTool, setCurrentTool] = useState<'selection' | 'blade'>('selection');
  // Resizable panels — percentage-based for true responsiveness
  const [leftPct, setLeftPct] = useState(18);   // % of window width
  const [rightPct, setRightPct] = useState(18); // % of window width
  const [timelinePct, setTimelinePct] = useState(35); // % of window height
  const [viewerZoom, setViewerZoom] = useState(100);
  const [libraryColumns, setLibraryColumns] = useState(2); // Local 패널 그리드 컬럼 수
  const [timelineHeightScale, setTimelineHeightScale] = useState(1); // 타임라인 높이 배율
  const [playbackQuality, setPlaybackQuality] = useState<'auto' | 'high' | 'medium' | 'low'>('auto');
  const [canvasAspectRatio, setCanvasAspectRatio] = useState<'16:9' | '9:16' | '1:1' | '3:4'>('16:9');
  const [activeSection, setActiveSection] = useState<'library' | 'viewer' | 'inspector' | 'timeline'>('viewer');

  // Active section border overlay component
  const SectionBorder = ({ active }: { active: boolean }) => active ? (
    <div className="absolute inset-0 pointer-events-none z-30" style={{ border: '2px solid #00D4D4', borderRadius: 2 }} />
  ) : null;
  const resizingRef = useRef<'left' | 'right' | 'timeline' | null>(null);
  const resizeStartRef = useRef({ x: 0, y: 0, size: 0 });
  const clipIdCounter = useRef(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Undo/Redo history
  const [history, setHistory] = useState<HistoryEntry[]>([{ clips: [], selectedClipIds: [] }]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const skipHistoryRef = useRef(false);
  const isDraggingOrResizingRef = useRef(false); // suppress history during drag/resize

  // Clipboard
  const [clipboard, setClipboard] = useState<ClipboardData | null>(null);

  // Active file info for header
  const [activeFileName, setActiveFileName] = useState<string | undefined>();
  const [activeFileDuration, setActiveFileDuration] = useState<number | undefined>();

  const selectedClip = clips.find(c => selectedClipIds.includes(c.id)) || null;

  // ===== REFS for stable access inside document-level keydown =====
  const isAuthenticatedRef = useRef(isAuthenticated);
  const clipsRef = useRef(clips);
  const currentVideoUrlRef = useRef(currentVideoUrl);
  const selectedClipIdsRef = useRef(selectedClipIds);
  const currentTimeRef = useRef(currentTime);
  const clipboardRef = useRef(clipboard);
  const isPlayingRef = useRef(isPlaying);
  const transcriptsRef = useRef(transcripts);
  const [hoverSuppressed, setHoverSuppressed] = useState(false); // 정지 직후 hover 프리뷰 억제
  const playbackTimeRef = useRef(playbackTime);
  const isTimelineHoveredRef = useRef(isTimelineHovered);
  const rippleModeRef = useRef(rippleMode);
  const currentToolRef = useRef(currentTool);
  const historyRef = useRef(history);
  const historyIndexRef = useRef(historyIndex);
  const selectedLibraryIdsRef = useRef(selectedLibraryIds);
  const libraryItemsRef = useRef(libraryItems);

  // Synchronous ref wrappers — refs are always up-to-date for keyboard handlers
  const setClipsSynced: typeof setClips = useCallback((action) => {
    setClips(prev => {
      const next = typeof action === 'function' ? action(prev) : action;
      clipsRef.current = next;
      return next;
    });
  }, []);
  const setCurrentTimeSynced = useCallback((action: number | ((prev: number) => number)) => {
    setCurrentTime(prev => {
      const next = typeof action === 'function' ? action(prev) : action;
      currentTimeRef.current = next;
      // Also sync playback position when not playing
      if (!isPlayingRef.current) {
        setPlaybackTime(next);
        playbackTimeRef.current = next;
      }
      return next;
    });
  }, []);
  const setSelectedClipIdsSynced = useCallback((action: string[] | ((prev: string[]) => string[])) => {
    setSelectedClipIds(prev => {
      const next = typeof action === 'function' ? action(prev) : action;
      selectedClipIdsRef.current = next;
      return next;
    });
  }, []);
  const hoverTimeRef = useRef(hoverTime);
  const setHoverTimeSynced = useCallback((val: number | null) => {
    hoverTimeRef.current = val;
    setHoverTime(val);
  }, []);

  // 자막 트랙 fontSize 정규화: 레거시 값(47, 48)을 35px로 리셋
  const DEFAULT_SUBTITLE_FONT_SIZE = 35;
  const LEGACY_FONT_SIZES = new Set([47, 48]);
  useEffect(() => {
    const isSubtitleTrack = (ti: number) => ti === 0 || (ti >= 5 && ti <= 8);
    const needsFix = clips.some(c => isSubtitleTrack(c.trackIndex) && c.fontSize !== undefined && LEGACY_FONT_SIZES.has(c.fontSize));
    if (needsFix) {
      setClips(prev => prev.map(c =>
        isSubtitleTrack(c.trackIndex) && c.fontSize !== undefined && LEGACY_FONT_SIZES.has(c.fontSize)
          ? { ...c, fontSize: DEFAULT_SUBTITLE_FONT_SIZE }
          : c
      ));
    }
  }, [clips]);

  // Keep ALL refs in sync — catches mutations from non-synced setters (Timeline, Player, etc.)
  useEffect(() => { clipsRef.current = clips; }, [clips]);
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);
  useEffect(() => { currentVideoUrlRef.current = currentVideoUrl; }, [currentVideoUrl]);
  useEffect(() => { selectedClipIdsRef.current = selectedClipIds; }, [selectedClipIds]);
  useEffect(() => { clipboardRef.current = clipboard; }, [clipboard]);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);
  useEffect(() => { playbackTimeRef.current = playbackTime; }, [playbackTime]);
  useEffect(() => { selectedLibraryIdsRef.current = selectedLibraryIds; }, [selectedLibraryIds]);
  useEffect(() => { libraryItemsRef.current = libraryItems; }, [libraryItems]);
  useEffect(() => { transcriptsRef.current = transcripts; }, [transcripts]);

  // ===== onPause 이벤트 =====
  // "재생 중" → "정지" 전환 시에만 파란 선 위치를 멈춘 곳으로 동기화.
  // wasPlayingRef로 실제 재생→정지 전환만 감지. 단순 seek/load 시 pause 이벤트는 무시.
  const wasPlayingRef = useRef(false);
  useEffect(() => { wasPlayingRef.current = isPlaying; }, [isPlaying]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handlePause = () => {
      // 재생 중이 아니었거나, 아직 재생 중(rAF가 돌고 있음)이면 무시
      if (!wasPlayingRef.current || isPlayingRef.current) return;

      const allClips = clipsRef.current;
      const isVideoTrack = (ti: number) => ti === 1 || (ti >= 10 && ti <= 14);
      const currentVideoTime = video.currentTime;
      const activeClip = allClips.find(c => {
        if (!isVideoTrack(c.trackIndex)) return false;
        if (c.url && (c.url.match(/\.(jpg|jpeg|png|gif|webp|svg)/i) || c.name?.match(/\.(jpg|jpeg|png|gif|webp|svg)/i))) return false;
        const mediaOffset = c.trimStart ?? 0;
        const mediaEnd = mediaOffset + c.duration;
        return currentVideoTime >= mediaOffset && currentVideoTime <= mediaEnd;
      });

      let stoppedAt: number;
      if (activeClip) {
        const mediaOffset = activeClip.trimStart ?? 0;
        stoppedAt = activeClip.startTime + (currentVideoTime - mediaOffset);
      } else {
        stoppedAt = playbackTimeRef.current;
      }

      setCurrentTime(stoppedAt);
      currentTimeRef.current = stoppedAt;
      setPlaybackTime(stoppedAt);
      playbackTimeRef.current = stoppedAt;
    };
    video.addEventListener('pause', handlePause);
    return () => video.removeEventListener('pause', handlePause);
  }, [clips]);

  // ===== rAF loop: white playback line + end-of-timeline stop =====
  // Ref updates every frame (for Player's rAF to read), but setState throttled to ~20fps
  // to avoid expensive full-page re-renders that freeze subtitles.
  const lastRafTimestampRef = useRef(0);
  const lastStateUpdateRef = useRef(0);
  const PLAYBACK_STATE_INTERVAL = 50; // ms between setState calls (20fps for timeline line)
  useEffect(() => {
    if (!isPlaying) return;
    let rafId: number;
    let frameCount = 0;
    lastRafTimestampRef.current = performance.now();
    lastStateUpdateRef.current = 0;

    const isVideoTrack = (ti: number) => ti === 1 || (ti >= 10 && ti <= 14);
    const isImageFile = (c: { url?: string; name?: string }) =>
      (c.url && /\.(jpg|jpeg|png|gif|webp|svg)/i.test(c.url)) ||
      (c.name && /\.(jpg|jpeg|png|gif|webp|svg)/i.test(c.name));

    const tick = (now: number) => {
      const video = videoRef.current;
      const allClips = clipsRef.current;
      const deltaMs = now - lastRafTimestampRef.current;
      lastRafTimestampRef.current = now;

      // 타임라인의 전체 끝 시간
      const timelineEnd = allClips.length > 0
        ? Math.max(...allClips.map(c => c.startTime + c.duration))
        : 0;

      let newTime: number | null = null;

      if (video && !video.paused) {
        const videoTime = video.currentTime;
        const activeClip = allClips.find(c => {
          if (!isVideoTrack(c.trackIndex)) return false;
          if (isImageFile(c)) return false;
          const mediaStart = c.trimStart ?? 0;
          const mediaEnd = mediaStart + c.duration;
          return videoTime >= mediaStart - 0.1 && videoTime <= mediaEnd + 0.1;
        });

        if (activeClip) {
          const mediaOffset = activeClip.trimStart ?? 0;
          newTime = activeClip.startTime + (videoTime - mediaOffset);
        } else {
          newTime = videoTime;
        }
      }

      // video가 없거나 paused 상태여도, 재생 중이면 wall-clock으로 시간 전진
      if (newTime === null) {
        const deltaSec = Math.min(deltaMs / 1000, 0.1);
        newTime = playbackTimeRef.current + deltaSec;
      }

      // 타임라인 끝 도달 시 자동 정지
      if (timelineEnd > 0 && newTime >= timelineEnd - 0.05) {
        setIsPlaying(false);
        setCurrentTime(timelineEnd);
        currentTimeRef.current = timelineEnd;
        setPlaybackTime(timelineEnd);
        playbackTimeRef.current = timelineEnd;
        setHoverSuppressed(true); setTimeout(() => setHoverSuppressed(false), 500);
        return;
      }

      // Always update ref (Player's rAF reads this)
      playbackTimeRef.current = newTime;
      frameCount++;

      // Throttle setState to avoid 60fps full-page re-renders (timeline white line only needs ~20fps)
      if (now - lastStateUpdateRef.current > PLAYBACK_STATE_INTERVAL) {
        setPlaybackTime(newTime);
        lastStateUpdateRef.current = now;
      }

      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [isPlaying]);

  useEffect(() => { isTimelineHoveredRef.current = isTimelineHovered; }, [isTimelineHovered]);
  useEffect(() => { rippleModeRef.current = rippleMode; }, [rippleMode]);
  useEffect(() => { currentToolRef.current = currentTool; }, [currentTool]);
  useEffect(() => { historyRef.current = history; }, [history]);
  useEffect(() => { historyIndexRef.current = historyIndex; }, [historyIndex]);
  useEffect(() => { isAuthenticatedRef.current = isAuthenticated; }, [isAuthenticated]);
  const activeSectionRef = useRef(activeSection);
  useEffect(() => { activeSectionRef.current = activeSection; }, [activeSection]);

  // ===== videoFile 자동 복원 =====
  // 타임라인에 비디오 URL이 있지만 currentVideoFile이 없으면 URL에서 fetch하여 File 복원
  // → RightSidebar의 "통합 AI 자막 마스터" 버튼이 활성화됨
  useEffect(() => {
    if (currentVideoFile || !currentVideoUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(currentVideoUrl);
        if (cancelled) return;
        const blob = await res.blob();
        if (cancelled) return;
        const name = activeFileName || 'restored-video.mp4';
        const file = new File([blob], name, { type: blob.type || 'video/mp4' });
        setCurrentVideoFile(file);
      } catch {
        // blob URL이 만료되었거나 fetch 실패 — 무시
      }
    })();
    return () => { cancelled = true; };
  }, [currentVideoUrl, currentVideoFile, activeFileName]);

  // ===== Editing Tracker Init =====
  useEffect(() => {
    initEditingTracker();
    return () => stopEditingTracker();
  }, []);

  // ===== Audio Scrubbing on Timeline Hover =====
  // Plays a short audio snippet (~150ms) when hovering over clips, debounced to avoid glitches
  const scrubAudioPoolRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const scrubDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrubSnippetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastScrubAudioTimeRef = useRef<number>(-1);

  const stopAllScrubAudio = useCallback(() => {
    scrubAudioPoolRef.current.forEach(audio => {
      audio.pause();
      audio.currentTime = 0;
    });
    if (scrubSnippetTimerRef.current) {
      clearTimeout(scrubSnippetTimerRef.current);
      scrubSnippetTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    // Don't scrub audio during playback or when hoverTime is null
    if (isPlaying || hoverTime == null) {
      stopAllScrubAudio();
      if (scrubDebounceRef.current) {
        clearTimeout(scrubDebounceRef.current);
        scrubDebounceRef.current = null;
      }
      lastScrubAudioTimeRef.current = -1;
      return;
    }

    // Debounce: only trigger audio after mouse pauses/moves slowly for 80ms
    if (scrubDebounceRef.current) clearTimeout(scrubDebounceRef.current);

    scrubDebounceRef.current = setTimeout(() => {
      const t = hoverTime;
      // Skip if position barely changed (< 0.05s difference)
      if (Math.abs(t - lastScrubAudioTimeRef.current) < 0.05) return;
      lastScrubAudioTimeRef.current = t;

      // Find all clips that overlap this time
      // Tracks with audio: Main(1), V1-V5(10-14), A1-A3(20-22)
      // Tracks without audio: 대본(0), AI자막(5)
      const allClips = clipsRef.current;
      const overlapping = allClips.filter(c => {
        if (c.disabled) return false;
        if (c.trackIndex === 0 || (c.trackIndex >= 5 && c.trackIndex <= 8)) return false; // text/subtitle
        if (!c.url) return false;
        return t >= c.startTime && t < c.startTime + c.duration;
      });

      // Stop any currently playing scrub audio
      stopAllScrubAudio();

      if (overlapping.length === 0) return;

      // Play a short snippet for each overlapping clip
      const SNIPPET_DURATION = 150; // ms
      const pool = scrubAudioPoolRef.current;

      overlapping.forEach(clip => {
        let audio = pool.get(clip.id);
        if (!audio || audio.src !== clip.url) {
          // Create or replace audio element for this clip
          if (audio) { audio.pause(); audio.src = ''; }
          audio = new Audio();
          audio.preload = 'auto';
          audio.src = clip.url;
          pool.set(clip.id, audio);
        }

        // Calculate relative time within the clip (accounting for trimStart and speed)
        const trimStart = clip.trimStart || 0;
        const speed = clip.speed || 1;
        const relativeTime = (t - clip.startTime) * speed + trimStart;

        // Set volume (clip volume, default 100%)
        audio.volume = Math.min(1, Math.max(0, (clip.volume ?? 100) / 100));
        audio.playbackRate = speed;
        audio.currentTime = relativeTime;

        // Play and auto-stop after snippet duration
        audio.play().catch(() => { /* ignore autoplay restrictions */ });
      });

      // Stop all after snippet duration
      scrubSnippetTimerRef.current = setTimeout(() => {
        stopAllScrubAudio();
      }, SNIPPET_DURATION);
    }, 80); // 80ms debounce

    return () => {
      if (scrubDebounceRef.current) clearTimeout(scrubDebounceRef.current);
    };
  }, [hoverTime, isPlaying, stopAllScrubAudio]);

  // Cleanup audio pool on unmount
  useEffect(() => {
    return () => {
      scrubAudioPoolRef.current.forEach(audio => {
        audio.pause();
        audio.src = '';
      });
      scrubAudioPoolRef.current.clear();
    };
  }, []);

  // ===== Project ID & Auto-Save =====
  const [projectId, setProjectId] = useState<string>('');
  const projectIdRef = useRef<string>('');
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize project ID & restore state (IndexedDB 미디어 복원 포함)
  useEffect(() => {
    const savedId = getCurrentProjectId();
    if (!savedId) {
      const newId = generateProjectId();
      setProjectId(newId);
      projectIdRef.current = newId;
      setCurrentProjectId(newId);
      return;
    }

    setProjectId(savedId);
    projectIdRef.current = savedId;
    const project = getProject(savedId);
    if (!project) return;

    setActiveFileName(project.name);
    if (project.transcripts.length > 0) setTranscripts(project.transcripts);
    if (project.subtitles.length > 0) setSubtitles(project.subtitles);

    // UI 상태 복원 (관리자 모드 전환 후 돌아와도 유지)
    if (project.uiState) {
      const ui = project.uiState;
      setLeftPct(ui.leftPct);
      setRightPct(ui.rightPct);
      setTimelinePct(ui.timelinePct);
      setTimelineZoom(ui.timelineZoom);
      setPlaybackQuality(ui.playbackQuality);
      setCanvasAspectRatio(ui.canvasAspectRatio);
      setActiveTab(ui.activeTab);
      setCurrentTool(ui.currentTool);
      setCurrentTime(ui.currentTime);
      setSnapEnabled(ui.snapEnabled);
      setRippleMode(ui.rippleMode);
    }

    if (!project.clips || !Array.isArray(project.clips) || project.clips.length === 0) return;

    const restoredClips = project.clips as VideoClip[];

    // IndexedDB에서 미디어 Blob을 복원하여 새 Blob URL 생성
    (async () => {
      const mediaKeys = await listMediaKeys(`${savedId}:`);
      // clipId → IndexedDB key 매핑
      const keyByClipId = new Map<string, string>();
      for (const key of mediaKeys) {
        const clipId = key.replace(`${savedId}:`, '');
        keyByClipId.set(clipId, key);
      }

      // 기존 blob URL이 아직 유효한지 테스트 (SPA 이동 시 유효할 수 있음)
      const testBlobUrl = async (url: string): Promise<boolean> => {
        if (!url || !url.startsWith('blob:')) return false;
        try {
          const res = await fetch(url, { method: 'HEAD' });
          return res.ok;
        } catch { return false; }
      };

      // 첫 번째 미디어 클립의 blob URL로 유효성 테스트
      const firstMediaClip = restoredClips.find(c =>
        c.url && c.trackIndex !== 0 && !(c.trackIndex >= 5 && c.trackIndex <= 8)
      );
      const blobStillValid = firstMediaClip ? await testBlobUrl(firstMediaClip.url) : false;

      const fileMap = new Map<string, File>(); // clipId → File (라이브러리 복원용)

      if (blobStillValid) {
        // SPA 네비게이션 복귀 — blob URL이 아직 유효하므로 그대로 사용
        setClips(restoredClips);
      } else if (mediaKeys.length > 0) {
        // 전체 리로드 또는 blob 만료 — IndexedDB에서 복원
        const urlMap = new Map<string, string>(); // oldUrl → newUrl

        // clipId 기반으로 IndexedDB에서 blob 복원 (lightenProject가 url을 ''로 저장하므로)
        const clipIdToNewUrl = new Map<string, string>();
        for (const clip of restoredClips) {
          // 텍스트/자막 트랙은 미디어 파일 불필요
          if (clip.trackIndex === 0 || (clip.trackIndex >= 5 && clip.trackIndex <= 8)) continue;
          // 이미 유효한 URL이 있으면 건너뛰기
          if (clip.url && urlMap.has(clip.url)) continue;

          const dbKey = keyByClipId.get(clip.id);
          if (!dbKey) continue;

          const media = await loadMediaBlob(dbKey);
          if (media) {
            if (clip.url) urlMap.set(clip.url, media.url);
            clipIdToNewUrl.set(clip.id, media.url);
            fileMap.set(clip.id, media.file);
          }
        }

        // 클립의 URL을 새 blob URL로 교체 (url 매핑 또는 clipId 매핑)
        const fixedClips = restoredClips.map(c => {
          const byUrl = c.url ? urlMap.get(c.url) : undefined;
          const byId = clipIdToNewUrl.get(c.id);
          const newUrl = byUrl || byId;
          return newUrl ? { ...c, url: newUrl } : c;
        });
        setClips(fixedClips);

        // currentVideoFile 복원
        const firstVideoClip = fixedClips.find(c => c.trackIndex === 1 && c.url);
        if (firstVideoClip) {
          const file = fileMap.get(firstVideoClip.id);
          if (file) setCurrentVideoFile(file);
        }
      } else {
        // IndexedDB에도 없음 — 클립 구조만 복원 (URL은 무효)
        setClips(restoredClips);
      }

      // clips state가 업데이트된 후 라이브러리 구성을 위해 약간 지연
      setTimeout(() => {
        const latestClips = clipsRef.current;
        const seen = new Set<string>();
        const lib: LibraryItem[] = [];
        for (const clip of latestClips) {
          if (!clip.url || seen.has(clip.url)) continue;
          if (clip.trackIndex === 0 || (clip.trackIndex >= 5 && clip.trackIndex <= 8)) continue;
          seen.add(clip.url);
          const isAudio = clip.trackIndex >= 20 && clip.trackIndex <= 22;
          const isImage = /\.(jpg|jpeg|png|gif|webp|svg)/i.test(clip.url || clip.name || '');
          const restoredFile = fileMap.get(clip.id);
          lib.push({
            id: clip.id + '_lib',
            name: clip.name || 'Untitled',
            url: clip.url,
            type: isImage ? 'image' : isAudio ? 'audio' : 'video',
            duration: clip.originalDuration || clip.duration || 0,
            file: restoredFile || new File([], clip.name || 'restored', { type: isImage ? 'image/png' : isAudio ? 'audio/mp3' : 'video/mp4' }),
          });
        }
        if (lib.length > 0) {
          setLibraryItems(lib);
          const firstVideo = lib.find(i => i.type === 'video');
          if (firstVideo) {
            setCurrentVideoUrl(firstVideo.url);
            setActiveFileDuration(firstVideo.duration);
          }
        }
      }, 100);
    })();
  }, []);

  // projectIdRef 동기화
  useEffect(() => { projectIdRef.current = projectId; }, [projectId]);

  // 즉시 저장 함수 (ref 기반으로 최신 상태 접근)
  const saveNowRef = useRef<() => void>(() => {});
  useEffect(() => {
    saveNowRef.current = () => {
      if (!projectId) return;
      const uiState: EditorUIState = {
        leftPct, rightPct, timelinePct,
        viewerZoom, timelineZoom,
        playbackQuality, canvasAspectRatio,
        activeTab, currentTool,
        currentTime, snapEnabled, rippleMode,
      };
      const project: SavedProject = {
        id: projectId,
        name: activeFileName || '제목 없는 프로젝트',
        createdAt: getProject(projectId)?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        videoFileName: activeFileName,
        videoDuration: activeFileDuration,
        transcripts,
        subtitles,
        clips,
        uiState,
      };
      saveProject(project);
    };
  }, [projectId, activeFileName, activeFileDuration, transcripts, subtitles, clips,
      leftPct, rightPct, timelinePct, viewerZoom, timelineZoom,
      playbackQuality, canvasAspectRatio, activeTab, currentTool,
      currentTime, snapEnabled, rippleMode]);

  // Auto-save project every 3 seconds (debounced)
  useEffect(() => {
    if (!projectId) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => saveNowRef.current(), 3000);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [projectId, activeFileName, activeFileDuration, transcripts, subtitles, clips,
      leftPct, rightPct, timelinePct, viewerZoom, timelineZoom,
      playbackQuality, canvasAspectRatio, activeTab, currentTool,
      currentTime, snapEnabled, rippleMode]);

  // 페이지 떠날 때 즉시 저장 (beforeunload + unmount)
  useEffect(() => {
    const handleBeforeUnload = () => saveNowRef.current();
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      // 컴포넌트 unmount 시에도 즉시 저장 (관리자 모드 이동 시)
      saveNowRef.current();
    };
  }, []);

  // ===== Resizable Panel Handler (percentage-based) =====
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      if (resizingRef.current === 'left') {
        const deltaPx = e.clientX - resizeStartRef.current.x;
        const deltaPct = (deltaPx / vw) * 100;
        setLeftPct(Math.max(10, Math.min(30, resizeStartRef.current.size + deltaPct)));
      } else if (resizingRef.current === 'right') {
        const deltaPx = resizeStartRef.current.x - e.clientX;
        const deltaPct = (deltaPx / vw) * 100;
        setRightPct(Math.max(10, Math.min(30, resizeStartRef.current.size + deltaPct)));
      } else if (resizingRef.current === 'timeline') {
        const deltaPx = resizeStartRef.current.y - e.clientY;
        const deltaPct = (deltaPx / vh) * 100;
        setTimelinePct(Math.max(15, Math.min(60, resizeStartRef.current.size + deltaPct)));
      }
    };
    const handleMouseUp = () => {
      resizingRef.current = null;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Percentage-based panels auto-adapt to window size — no resize handler needed


  // Push to history (최대 50개 유지 — 메모리 누수 방지)
  const MAX_HISTORY = 50;
  const pushHistory = useCallback((newClips: VideoClip[], newSelectedIds: string[]) => {
    if (skipHistoryRef.current) { skipHistoryRef.current = false; return; }
    setHistory(prev => {
      const trimmed = prev.slice(0, historyIndexRef.current + 1);
      const next = [...trimmed, { clips: newClips, selectedClipIds: newSelectedIds }];
      // 최대 개수 초과 시 가장 오래된 항목 제거
      if (next.length > MAX_HISTORY) {
        const overflow = next.length - MAX_HISTORY;
        historyIndexRef.current = Math.max(0, historyIndexRef.current - overflow);
        return next.slice(overflow);
      }
      return next;
    });
    setHistoryIndex(prev => Math.min(prev + 1, MAX_HISTORY - 1));
  }, []);

  // Track clips changes for history — skip during drag/resize (pushed once on end)
  useEffect(() => {
    if (isDraggingOrResizingRef.current) return;
    pushHistory(clips, selectedClipIds);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips]);

  // Generate unique clip ID
  const genId = () => `clip_${Date.now()}_${clipIdCounter.current++}`;

  // ===== Undo =====
  const handleUndo = useCallback(() => {
    const idx = historyIndexRef.current;
    const hist = historyRef.current;
    if (idx <= 0) return;
    trackEditingAction('undo');
    const newIndex = idx - 1;
    const entry = hist[newIndex];
    skipHistoryRef.current = true;
    setClips(entry.clips);
    setSelectedClipIds(entry.selectedClipIds);
    setHistoryIndex(newIndex);
  }, []);

  // ===== Redo =====
  const handleRedo = useCallback(() => {
    const idx = historyIndexRef.current;
    const hist = historyRef.current;
    if (idx >= hist.length - 1) return;
    trackEditingAction('redo');
    const newIndex = idx + 1;
    const entry = hist[newIndex];
    skipHistoryRef.current = true;
    setClips(entry.clips);
    setSelectedClipIds(entry.selectedClipIds);
    setHistoryIndex(newIndex);
  }, []);


  // 클립 교체 확인 모달 상태
  const [replaceConfirm, setReplaceConfirm] = useState<{
    overlappingClipIds: string[];
    pendingArgs: [File | null, number, number, string | undefined];
  } | null>(null);

  const handleClipAdd = useCallback((file: File | null, trackIndex: number, startTime: number, libraryItemId?: string, skipOverwriteCheck?: boolean) => {
    const clipId = genId();
    let url = '';
    let name = '';
    let duration = 0;
    let type: 'video' | 'audio' | 'image' | 'text' = 'video';

    if (libraryItemId) {
      const item = libraryItems.find(i => i.id === libraryItemId);
      if (!item) return;
      url = item.url;
      name = item.name;
      duration = item.duration || 10;
      type = item.type;
      // 라이브러리 경유 클립도 IndexedDB에 clipId로 저장 (새로고침 복원용)
      if (item.file && item.file.size > 0) {
        const pid = projectIdRef.current || 'default';
        saveMediaBlob(`${pid}:${clipId}`, item.file, name, item.file.type);
      }
    } else if (file) {
      url = URL.createObjectURL(file);
      name = file.name;
      duration = 10;
      const isAudio = (file.type.startsWith('audio/') || file.name.endsWith('.m4a') || file.name.endsWith('.aac') || file.name.endsWith('.wav'));
      const isImage = file.type.startsWith('image/');
      type = isImage ? 'image' : isAudio ? 'audio' : 'video';
      // IndexedDB에 미디어 파일 저장 (페이지 이동 후 복원용)
      const pid = projectIdRef.current || 'default';
      saveMediaBlob(`${pid}:${clipId}`, file, name, file.type);
    } else {
      return;
    }

    // Track logic
    let finalTrackIndex = trackIndex;
    if (trackIndex === 0 || (trackIndex >= 5 && trackIndex <= 8)) {
      finalTrackIndex = trackIndex;
    } else if (trackIndex >= 10 && trackIndex <= 14) {
      finalTrackIndex = trackIndex;
    } else if (trackIndex >= 20 && trackIndex <= 22) {
      finalTrackIndex = trackIndex;
    } else {
      finalTrackIndex = 1;
    }

    // 같은 트랙, 드롭 지점에 기존 클립이 있으면 교체 확인
    if (!skipOverwriteCheck) {
      const overlapping = clipsRef.current.filter(c =>
        c.trackIndex === finalTrackIndex &&
        startTime >= c.startTime && startTime < c.startTime + c.duration
      );
      if (overlapping.length > 0) {
        setReplaceConfirm({
          overlappingClipIds: overlapping.map(c => c.id),
          pendingArgs: [file, trackIndex, startTime, libraryItemId],
        });
        return;
      }
    }

    // Helper: generate lightweight proxy thumbnails with async queue (non-blocking)
    const generateThumbnails = (videoEl: HTMLVideoElement, dur: number, cid: string) => {
      const THUMB_W = 160;  // small enough for timeline display
      const THUMB_H = 90;
      const QUALITY = 0.35; // low quality JPEG — fast encode, small DataURL
      const PHASE1_COUNT = 4; // instant preview thumbnails
      const totalCount = Math.min(Math.max(Math.ceil(dur / 2), 4), 30);
      const interval = dur / totalCount;

      const canvas = document.createElement('canvas');
      canvas.width = THUMB_W;
      canvas.height = THUMB_H;
      const ctx = canvas.getContext('2d', { willReadFrequently: false });
      if (!ctx) return;

      const allThumbs: (string | null)[] = new Array(totalCount).fill(null);
      let cancelled = false;

      // Capture a single frame at a given index, yielding to browser between frames
      const captureFrame = (index: number): Promise<string | null> => {
        if (cancelled) return Promise.resolve(null);
        return new Promise(resolve => {
          const seekTime = interval * (index + 0.5);
          videoEl.currentTime = Math.min(seekTime, dur - 0.01);
          videoEl.onseeked = () => {
            // Yield to browser via rAF so UI stays responsive
            requestAnimationFrame(() => {
              if (cancelled) { resolve(null); return; }
              ctx.drawImage(videoEl, 0, 0, THUMB_W, THUMB_H);
              resolve(canvas.toDataURL('image/jpeg', QUALITY));
            });
          };
        });
      };

      // Flush current thumbnails to clip state (sparse array → fill gaps with neighbors)
      const flushToState = () => {
        const filled = allThumbs.map((t, i) => {
          if (t) return t;
          // Fill with nearest available thumbnail
          for (let d = 1; d < totalCount; d++) {
            if (allThumbs[i - d]) return allThumbs[i - d]!;
            if (allThumbs[i + d]) return allThumbs[i + d]!;
          }
          return null;
        }).filter(Boolean) as string[];
        if (filled.length > 0) {
          setClips(prev => prev.map(c => c.id === cid ? { ...c, thumbnails: filled } : c));
        }
      };

      // Phase 1: Quick preview — evenly spaced subset
      const phase1Indices = Array.from({ length: PHASE1_COUNT }, (_, i) =>
        Math.min(Math.round(i * (totalCount / PHASE1_COUNT)), totalCount - 1)
      );

      (async () => {
        // Phase 1: Extract preview thumbnails sequentially (fast — only 4 seeks)
        for (const idx of phase1Indices) {
          const thumb = await captureFrame(idx);
          if (thumb) allThumbs[idx] = thumb;
        }
        flushToState(); // Immediately show preview filmstrip

        // Phase 2: Fill remaining thumbnails via async queue, yielding between each
        for (let i = 0; i < totalCount; i++) {
          if (cancelled) break;
          if (allThumbs[i]) continue; // Already captured in Phase 1
          const thumb = await captureFrame(i);
          if (thumb) allThumbs[i] = thumb;
          // Flush every 4 frames to show progressive loading
          if (i % 4 === 3) flushToState();
        }
        if (!cancelled) flushToState(); // Final flush with all thumbnails

        // Cleanup
        canvas.width = 0; canvas.height = 0;
        videoEl.onseeked = null;
      })();

      // Return cancel function (used if clip is deleted before generation completes)
      return () => { cancelled = true; };
    };

    // Helper: extract high-density waveform for timeline display
    const extractWaveform = (fileUrl: string, cid: string) => {
      const audioCtx = new AudioContext();
      fetch(fileUrl).then(r => r.arrayBuffer()).then(buf => audioCtx.decodeAudioData(buf)).then(audioBuf => {
        const raw = audioBuf.getChannelData(0);
        // 초당 약 20샘플 (10초=200, 60초=1200, 5분=6000) — 촘촘한 파형
        const samples = Math.min(8000, Math.max(400, Math.round(audioBuf.duration * 20)));
        const blockSize = Math.max(1, Math.floor(raw.length / samples));
        const waveform: number[] = [];
        for (let s = 0; s < samples; s++) {
          let peak = 0;
          const start = s * blockSize;
          const end = Math.min(start + blockSize, raw.length);
          for (let j = start; j < end; j++) {
            const v = Math.abs(raw[j]);
            if (v > peak) peak = v;
          }
          waveform.push(peak);
        }
        const max = Math.max(...waveform, 0.001);
        const normalized = waveform.map(v => v / max);
        setClips(prev => prev.map(c => c.id === cid ? { ...c, waveform: normalized } : c));
        audioCtx.close();
      }).catch(() => audioCtx.close());
    };

    // 메인 트랙 클립 추가 시 ripple 모드면 갭 없이 순차 배치 (0:00부터 시작)
    const addClipWithRipple = (newClip: VideoClip) => {
      setClips(prev => {
        const next = [...prev, newClip];
        if (finalTrackIndex === 1 && rippleModeRef.current) {
          const mainClips = next.filter(c => c.trackIndex === 1).sort((a, b) => a.startTime - b.startTime);
          const others = next.filter(c => c.trackIndex !== 1);
          let cursor = 0;
          const adjusted = mainClips.map(c => { const u = { ...c, startTime: cursor }; cursor += c.duration; return u; });
          return [...others, ...adjusted];
        }
        return next;
      });
    };

    if (type === 'image') {
      const img = new Image();
      img.src = url;
      img.onload = () => {
        const initialScale = finalTrackIndex === 1 ? 100 : 200;
        addClipWithRipple({
          id: clipId, name, url, startTime, duration, originalDuration: duration,
          trackIndex: finalTrackIndex, scale: initialScale, positionX: 0, positionY: 0, rotation: 0, opacity: 100, blendMode: false, speed: 1, linked: true, linkGroupId: clipId,
          mediaWidth: img.naturalWidth, mediaHeight: img.naturalHeight,
        });
      };
      img.onerror = () => {
        addClipWithRipple({
          id: clipId, name, url, startTime, duration, originalDuration: duration,
          trackIndex: finalTrackIndex, scale: 100, positionX: 0, positionY: 0, rotation: 0, opacity: 100, blendMode: false, speed: 1, linked: true, linkGroupId: clipId,
        });
      };
    } else {
      const video = document.createElement('video');
      video.preload = 'metadata';
      video.crossOrigin = 'anonymous';
      video.src = url;
      video.onloadedmetadata = () => {
        const dur = video.duration || duration;
        const vw = video.videoWidth || 1920;
        const vh = video.videoHeight || 1080;
        const videoInitScale = finalTrackIndex === 1 ? 100 : 200;
        addClipWithRipple({
          id: clipId, name, url, startTime, duration: dur, originalDuration: dur,
          trackIndex: finalTrackIndex, scale: videoInitScale, positionX: 0, positionY: 0, rotation: 0, opacity: 100, blendMode: false, speed: 1, linked: true, linkGroupId: clipId, volume: 100,
          mediaWidth: vw, mediaHeight: vh,
        });
        if (type === 'video' && !currentVideoUrl) {
          setCurrentVideoUrl(url);
          setActiveFileName(name);
          setActiveFileDuration(dur);
        }
        // 메인 트랙 영상 배치 시 영상 비율에 맞춰 캔버스 비율 자동 변경
        if (finalTrackIndex === 1 && vw > 0 && vh > 0) {
          const videoAR = vw / vh;
          const ratios: { key: '16:9' | '9:16' | '1:1' | '3:4'; value: number }[] = [
            { key: '16:9', value: 16/9 },
            { key: '9:16', value: 9/16 },
            { key: '1:1', value: 1 },
            { key: '3:4', value: 3/4 },
          ];
          const closest = ratios.reduce((best, r) =>
            Math.abs(r.value - videoAR) < Math.abs(best.value - videoAR) ? r : best
          );
          setCanvasAspectRatio(closest.key);
        }
        // Generate thumbnails for video clips
        if (type === 'video') {
          const thumbVideo = document.createElement('video');
          thumbVideo.preload = 'auto';
          thumbVideo.crossOrigin = 'anonymous';
          thumbVideo.src = url;
          thumbVideo.muted = true;
          thumbVideo.onloadeddata = () => generateThumbnails(thumbVideo, dur, clipId);
        }
        // Extract waveform
        extractWaveform(url, clipId);
      };
      video.onerror = () => {
        // 메타데이터 로드 실패 — 기본값으로 클립 추가 (일부 코덱은 메타데이터 없이도 재생 가능)
        addClipWithRipple({
          id: clipId, name, url, startTime, duration, originalDuration: duration,
          trackIndex: finalTrackIndex, scale: 100, positionX: 0, positionY: 0, rotation: 0, opacity: 100, blendMode: false, speed: 1, linked: true, linkGroupId: clipId,
        });
      };
    }
  }, [libraryItems, currentVideoUrl]);

  // 여러 파일을 타임라인에 드롭할 때 겹치지 않도록 순차 배치
  const handleFilesDropToTimeline = useCallback(async (files: File[], trackIndex: number, startTime: number) => {
    // 각 파일의 duration을 순차적으로 읽기
    let cursor = startTime;
    for (const file of files) {
      const isImage = file.type.startsWith('image/');
      const url = URL.createObjectURL(file);
      const duration = isImage ? 10 : await new Promise<number>(resolve => {
        const el = document.createElement('video');
        el.preload = 'metadata';
        el.src = url;
        el.onloadedmetadata = () => { resolve(el.duration || 10); el.src = ''; };
        el.onerror = () => { resolve(10); el.src = ''; };
      });
      // 각 파일을 개별로 handleClipAdd에 전달 (cursor로 순차 배치)
      handleClipAdd(file, trackIndex, cursor);
      cursor += duration;
    }
  }, [handleClipAdd]);

  // Video add handler (now adds to Media Library)
  const handleVideoAdd = useCallback(async (file: File): Promise<string> => {
    const id = genId();
    // 파일 데이터를 메모리에 실제 복사 (원본 File 참조 GC 시 blob URL 무효화 방지)
    let memFile: File;
    try {
      const buf = await file.arrayBuffer();
      memFile = new File([buf], file.name, { type: file.type || 'video/mp4', lastModified: file.lastModified });
    } catch {
      memFile = new File([file], file.name, { type: file.type || 'video/mp4', lastModified: file.lastModified });
    }
    const url = URL.createObjectURL(memFile);
    const isAudio = (memFile.type.startsWith('audio/') || memFile.name.endsWith('.m4a') || memFile.name.endsWith('.aac') || memFile.name.endsWith('.wav'));
    const isImage = memFile.type.startsWith('image/');
    const type = isImage ? 'image' : isAudio ? 'audio' : 'video';

    const item: LibraryItem = {
      id,
      name: memFile.name,
      url,
      type,
      duration: isImage ? 10 : 0,
      file: memFile,
    };

    if (type !== 'image') {
      const tempVideo = document.createElement('video');
      tempVideo.preload = 'metadata';
      tempVideo.src = url;
      tempVideo.onloadedmetadata = () => {
        setLibraryItems(prev => prev.map(i => i.id === id ? { ...i, duration: tempVideo.duration } : i));
        if (type === 'video' && !currentVideoUrl) {
          setCurrentVideoUrl(url);
          setCurrentVideoFile(memFile);
          setActiveFileName(memFile.name);
          setActiveFileDuration(tempVideo.duration);
        }
      };
      // 재생 불가능한 파일은 자동 삭제
      tempVideo.onerror = () => {
        URL.revokeObjectURL(url);
        setLibraryItems(prev => prev.filter(i => i.id !== id));
        setImportToast(`⚠️ ${file.name} — 지원하지 않는 형식이라 삭제되었습니다`);
        setTimeout(() => setImportToast(null), 3000);
      };
    }

    setLibraryItems(prev => [...prev, item]);

    // IndexedDB에 미디어 파일 저장 (페이지 이동 후 복원용)
    const pid = projectIdRef.current || 'default';
    saveMediaBlob(`${pid}:${id}`, memFile, memFile.name, memFile.type);

    setImportToast(`${file.name} 라이브러리에 추가됨 — 타임라인에 드래그하여 배치하세요`);
    setTimeout(() => setImportToast(null), 3000);
    return id;
  }, [currentVideoUrl]);

  /**
   * 프리뷰 화면 드래그앤드롭 핸들러
   * - 파일 순서대로 duration을 먼저 읽어 누적 offset 계산 후 main 트랙에 겹침 없이 순차 배치
   * - handleVideoAdd(라이브러리+상태) + handleClipAdd(타임라인) 분리 호출로 thumbnails/waveform 포함
   */
  const handlePlayerFileDrop = useCallback(async (files: File[]) => {
    // 1. 모든 파일의 duration을 먼저 순차적으로 읽기
    type FileInfo = { file: File; url: string; type: 'video' | 'audio' | 'image'; duration: number; libId: string; clipId: string; };
    const infos: FileInfo[] = [];
    for (const file of files) {
      const isAudio = file.type.startsWith('audio/') || /\.(mp3|m4a|aac|wav|ogg|flac|wma)$/i.test(file.name);
      const isImage = file.type.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|bmp|svg|heic)$/i.test(file.name);
      const type: 'video' | 'audio' | 'image' = isImage ? 'image' : isAudio ? 'audio' : 'video';
      // 파일 데이터를 메모리에 실제 복사 (원본 참조 GC 방지)
      let memFile: File;
      try {
        const buf = await file.arrayBuffer();
        memFile = new File([buf], file.name, { type: file.type || 'video/mp4', lastModified: file.lastModified });
      } catch {
        memFile = file;
      }
      const url = URL.createObjectURL(memFile);
      const duration = isImage ? 10 : await new Promise<number>((resolve, reject) => {
        const el = document.createElement('video');
        el.preload = 'metadata';
        el.src = url;
        el.onloadedmetadata = () => resolve(el.duration || 10);
        el.onerror = () => reject(new Error('unsupported'));
      }).catch(() => -1) as number;
      // 재생 불가능한 파일은 건너뛰기
      if (duration < 0) {
        URL.revokeObjectURL(url);
        setImportToast(`⚠️ ${file.name} — 지원하지 않는 형식입니다`);
        setTimeout(() => setImportToast(null), 3000);
        continue;
      }
      infos.push({ file: memFile, url, type, duration, libId: genId(), clipId: genId() });
    }

    // 2. 현재 main 트랙 끝 시간 (모든 duration 수집 후 한 번만 읽기)
    let insertAt = clipsRef.current
      .filter(c => c.trackIndex === 1)
      .reduce((maxEnd, c) => Math.max(maxEnd, c.startTime + c.duration), 0);

    // 3. 라이브러리 일괄 추가
    setLibraryItems(prev => [...prev, ...infos.map(({ libId, file, url, type, duration }) =>
      ({ id: libId, name: file.name, url, type, duration, file })
    )]);

    // 4. 첫 번째 비디오만 currentVideoUrl 세팅
    const firstVideo = infos.find(i => i.type === 'video');
    if (firstVideo && !currentVideoUrlRef.current) {
      currentVideoUrlRef.current = firstVideo.url;
      setCurrentVideoUrl(firstVideo.url);
      setCurrentVideoFile(firstVideo.file);
      setActiveFileName(firstVideo.file.name);
      setActiveFileDuration(firstVideo.duration);
    }

    // 5. 타임라인에 모든 클립 한 번에 추가 (겹침 방지)
    const newClips = infos.map(({ clipId, file, url, duration }) => {
      const startTime = insertAt;
      insertAt += duration;
      return {
        id: clipId,
        name: file.name,
        url,
        startTime,
        duration,
        originalDuration: duration,
        trackIndex: 1,
        scale: 100,
        positionX: 0,
        positionY: 0,
        rotation: 0,
        opacity: 100,
        blendMode: false,
        speed: 1,
        linked: true,
        linkGroupId: clipId,
        volume: 100,
      };
    });
    setClipsSynced(prev => [...prev, ...newClips]);

    setImportToast(`${files.length}개 파일 타임라인에 추가됨`);
    setTimeout(() => setImportToast(null), 3000);
  }, [setClipsSynced]);

  const handleClipUpdate = useCallback((clipId: string, updates: Partial<VideoClip>) => {
    setClips(prev => {
      const oldClip = prev.find(c => c.id === clipId);
      if (!oldClip) return prev;

      let updated = prev.map(clip => clip.id === clipId ? { ...clip, ...updates } : clip);

      // ── 부모-자식 자막 동기화 (Parent–Child Subtitle Sync) ──
      //
      // 비디오 클립(부모)이 이동/리사이즈되면 시간대가 겹치는 자막(자식)도 함께 이동.
      //
      // Case A: 단순 드래그 (startTime만 변경)
      //   → 자막도 동일한 delta만큼 이동
      // Case B: 리사이즈 (trimStart + startTime 동시 변경)
      //   → subtitleShift = -(deltaTrimStart/speed) + deltaStartTime
      //   → 일반 리사이즈: shift ≈ 0 (자막 고정)
      //   → zero-bound 복원: 자막 올바르게 이동
      const isVideoTrack = oldClip.trackIndex === 1 || (oldClip.trackIndex >= 10 && oldClip.trackIndex <= 14);
      const isSubTrack = (ti: number) => ti === 0 || (ti >= 5 && ti <= 8);

      if (isVideoTrack && (updates.startTime !== undefined || updates.trimStart !== undefined)) {
        const speed = oldClip.speed ?? 1;
        const oldEnd = oldClip.startTime + oldClip.duration;
        const deltaStartTime = (updates.startTime ?? oldClip.startTime) - oldClip.startTime;

        let subtitleShift = 0;

        if (updates.trimStart !== undefined) {
          const deltaTrimStart = updates.trimStart - (oldClip.trimStart ?? 0);
          subtitleShift = -(deltaTrimStart / speed) + deltaStartTime;
        } else {
          subtitleShift = deltaStartTime;
        }

        if (Math.abs(subtitleShift) > 0.001) {
          updated = updated.map(c => {
            if (!isSubTrack(c.trackIndex)) return c;
            const cEnd = c.startTime + c.duration;
            if (cEnd > oldClip.startTime && c.startTime < oldEnd) {
              return { ...c, startTime: Math.max(0, c.startTime + subtitleShift) };
            }
            return c;
          });
        }
      }

      // ── 자막 겹침 방지 (Non-overlapping Subtitle Resolution) ──
      //
      // 같은 트랙의 자막끼리 시간이 겹치면 뒤쪽 자막을 밀어낸다.
      // 이동/리사이즈 후 항상 실행하여 겹침을 원천 차단.
      const subTrackIndices = [0, 5, 6, 7, 8];
      for (const ti of subTrackIndices) {
        const subs = updated.filter(c => c.trackIndex === ti);
        if (subs.length < 2) continue;

        // startTime 순으로 정렬, 겹침 발견 시 뒤 클립을 밀어냄
        const sorted = [...subs].sort((a, b) => a.startTime - b.startTime);
        const fixes = new Map<string, number>(); // clipId → corrected startTime

        for (let i = 1; i < sorted.length; i++) {
          const prevEnd = (fixes.get(sorted[i - 1].id) ?? sorted[i - 1].startTime) + sorted[i - 1].duration;
          const curStart = fixes.get(sorted[i].id) ?? sorted[i].startTime;
          if (curStart < prevEnd - 0.001) {
            // 겹침! → 뒤 클립을 앞 클립 끝으로 밀어냄
            fixes.set(sorted[i].id, prevEnd);
          }
        }

        if (fixes.size > 0) {
          updated = updated.map(c => {
            const fixed = fixes.get(c.id);
            return fixed !== undefined ? { ...c, startTime: fixed } : c;
          });
        }
      }

      return updated;
    });
  }, []);

  const handleClipsBatchUpdate = useCallback((clipIds: string[], updates: Partial<VideoClip>) => {
    const idSet = new Set(clipIds);
    setClips(prev => prev.map(clip => idSet.has(clip.id) ? { ...clip, ...updates } : clip));
  }, []);

  const handleTranscriptsUpdate = useCallback((newTranscripts: TranscriptItem[]) => {
    setTranscripts(prev => {
      // Sync edited transcript text to clip names
      const changed = newTranscripts.filter(nt => {
        const old = prev.find(ot => ot.id === nt.id);
        return old && (nt.editedText || nt.originalText) !== (old.editedText || old.originalText);
      });
      if (changed.length > 0) {
        setClips(prevClips => prevClips.map(clip => {
          const match = changed.find(t => {
            const oldText = prev.find(ot => ot.id === t.id);
            return oldText && clip.name === (oldText.editedText || oldText.originalText)
              && Math.abs(clip.startTime - t.startTime) < 0.5;
          });
          if (match) return { ...clip, name: match.editedText || match.originalText };
          return clip;
        }));
      }
      return newTranscripts;
    });
  }, []);

  // SubtitleItem 업데이트 시 연결된 VideoClip의 animation 필드도 동기화
  const handleSubtitlesUpdate = useCallback((newSubtitles: SubtitleItem[]) => {
    setSubtitles(prev => {
      // animation이 변경된 자막만 추출
      const animChanged = newSubtitles.filter(ns => {
        const old = prev.find(os => os.id === ns.id);
        if (!old) return false;
        const oldAnim = old.animation;
        const newAnim = ns.animation;
        if (!oldAnim && !newAnim) return false;
        if (!oldAnim || !newAnim) return true;
        return oldAnim.inPreset !== newAnim.inPreset ||
          oldAnim.outPreset !== newAnim.outPreset ||
          oldAnim.duration !== newAnim.duration;
      });
      // 변경된 자막이 있으면 대응 VideoClip도 업데이트
      if (animChanged.length > 0) {
        setClips(prevClips => prevClips.map(clip => {
          const match = animChanged.find(s =>
            (clip.trackIndex === 0 || (clip.trackIndex >= 5 && clip.trackIndex <= 8)) &&
            Math.abs(clip.startTime - s.startTime) < 0.1
          );
          if (!match || !match.animation) return clip;
          return {
            ...clip,
            subtitleAnimationPreset: match.animation.inPreset,
            subtitleOutPreset: match.animation.outPreset,
            subtitleAnimationDuration: match.animation.duration,
          };
        }));
      }
      return newSubtitles;
    });
  }, []);

  const handlePlayheadChange = useCallback((position: number) => {
    setCurrentTime(position);
    currentTimeRef.current = position;
    setPlaybackTime(position);
    playbackTimeRef.current = position;
  }, []);
  const handleSeek = useCallback((time: number) => {
    // 재생 중에 클릭하면 정지 + 파란선으로 전환
    if (isPlayingRef.current) {
      setIsPlaying(false);
      setHoverSuppressed(true);
      setTimeout(() => setHoverSuppressed(false), 500);
    }
    setCurrentTime(time);
    currentTimeRef.current = time;
    setPlaybackTime(time);
    playbackTimeRef.current = time;
  }, []);
  // Player reports actual video time during playback → update white playback line only
  const handlePlaybackTimeUpdate = useCallback((time: number) => {
    setPlaybackTime(time);
  }, []);
  // Player/Timeline에서 재생/정지 전환 시
  const handlePlayingChange = useCallback((playing: boolean) => {
    if (playing && !isPlayingRef.current) {
      // 재생 시작: blue line 우선, blue=0이고 hover가 있으면 hover 위치 사용
      const startAt = (currentTimeRef.current > 0 || hoverTimeRef.current == null)
        ? currentTimeRef.current
        : hoverTimeRef.current;
      setPlaybackTime(startAt);
      playbackTimeRef.current = startAt;
      setCurrentTime(startAt);
      currentTimeRef.current = startAt;
    } else if (!playing && isPlayingRef.current) {
      // 정지: 흰선(playback) 위치를 파란선(edit) 위치로 동기화
      const stoppedAt = playbackTimeRef.current;
      setCurrentTime(stoppedAt);
      currentTimeRef.current = stoppedAt;
      setHoverSuppressed(true); setTimeout(() => setHoverSuppressed(false), 500);
    }
    setIsPlaying(playing);
  }, []);
  const handleClipSelect = useCallback((clipIds: string[]) => {
    setSelectedClipIdsSynced(clipIds); // ref 즉시 동기화 — Q/W 등 키보드 핸들러가 바로 읽을 수 있도록
    // 타임라인 클립 선택 시 라이브러리 선택 해제 — Delete 키가 라이브러리까지 삭제하는 버그 방지
    if (clipIds.length > 0) setSelectedLibraryIds([]);
  }, [setSelectedClipIdsSynced]);

  // Close gaps on main track: sort by startTime, shift each to end of previous
  const rippleCloseGaps = useCallback((clips: VideoClip[]): VideoClip[] => {
    const mainClips = clips.filter(c => c.trackIndex === 1).sort((a, b) => a.startTime - b.startTime);
    const others = clips.filter(c => c.trackIndex !== 1);

    // 메인 트랙 갭 닫기 + 각 클립의 이동량(delta) 기록
    const deltas = new Map<number, { oldStart: number; newStart: number }>();
    let cursor = 0;
    const adjusted = mainClips.map(c => {
      const updated = { ...c, startTime: cursor };
      if (cursor !== c.startTime) {
        deltas.set(c.startTime, { oldStart: c.startTime, newStart: cursor });
      }
      cursor += c.duration;
      return updated;
    });

    // 메인 트랙이 이동했으면 자막/오디오 클립도 같이 이동
    if (deltas.size === 0) return [...others, ...adjusted];

    // 전체 이동량 계산 (간단히: 첫 번째 이동의 delta 적용)
    // 더 정확하게: 각 자막이 속한 메인 클립 구간 기준으로 이동
    const shiftedOthers = others.map(c => {
      // 이 클립의 시작시간이 어느 메인 클립의 원래 구간에 속하는지 찾기
      for (const mainC of mainClips) {
        if (c.startTime >= mainC.startTime && c.startTime < mainC.startTime + mainC.duration) {
          const d = deltas.get(mainC.startTime);
          if (d) {
            const shift = d.newStart - d.oldStart;
            return { ...c, startTime: Math.max(0, c.startTime + shift) };
          }
          break;
        }
      }
      return c;
    });

    return [...shiftedOthers, ...adjusted];
  }, []);

  const handleLibraryDelete = useCallback((ids: string[]) => {
    // 삭제 대상 라이브러리 아이템의 URL 수집
    const deletedUrls = new Set(
      libraryItems.filter(item => ids.includes(item.id)).map(item => item.url)
    );

    const remaining = libraryItems.filter(item => !ids.includes(item.id));
    setLibraryItems(remaining);
    setSelectedLibraryIds([]);

    // 라이브러리가 완전히 비면 타임라인 전체 초기화 (자막 포함)
    if (remaining.length === 0) {
      setClipsSynced([]);
      setSelectedClipIdsSynced([]);
      setCurrentVideoUrl(undefined);
      setCurrentVideoFile(null);
      setActiveFileName('');
      setActiveFileDuration(0);
      setTranscripts([]);
      setSubtitles([]);
      return;
    }

    // 타임라인에서 해당 URL을 사용하는 클립도 함께 삭제
    if (deletedUrls.size > 0) {
      setClipsSynced(prev => {
        const kept = prev.filter(c => !c.url || !deletedUrls.has(c.url));
        if (currentVideoUrl && deletedUrls.has(currentVideoUrl)) {
          const next = kept.find(c => c.trackIndex === 1 && c.url);
          setCurrentVideoUrl(next?.url);
        }
        return rippleModeRef.current ? rippleCloseGaps(kept) : kept;
      });
      setSelectedClipIdsSynced([]);
    }
  }, [libraryItems, currentVideoUrl, rippleCloseGaps, setClipsSynced, setSelectedClipIdsSynced]);

  /**
   * 클립 삭제 — 모든 삭제 경로(키보드 Delete, 툴바 버튼, 우클릭, 리사이즈 임계값)의 단일 진입점
   *
   * Premiere Pro / Final Cut Pro 방식:
   *  - 일반 Delete  → gap 남김  (rippleMode OFF)
   *  - Shift+Delete → Ripple Delete (rippleMode ON, 또는 외부에서 forceRipple=true)
   *
   * clipsRef.current를 즉시 동기화하여 stale closure 방지
   */
  const handleClipDelete = useCallback((clipId: string, forceRipple?: boolean) => {
    const clip = clipsRef.current.find(c => c.id === clipId);
    if (!clip) return; // 이미 삭제됐거나 없는 클립 → 무동작

    trackEditingAction('clip_delete', {
      targetTrack: clip.trackIndex,
      clipDuration: clip.duration,
      clipCount: clipsRef.current.length - 1,
    });

    setClipsSynced(prev => {
      const deleteIds = new Set<string>([clipId]);

      const isSubtitleTrack = clip.trackIndex === 0 || (clip.trackIndex >= 5 && clip.trackIndex <= 8);

      // 자막 삭제 → 자막만 삭제 (영상/오디오는 유지)
      // 영상/오디오 삭제 → 해당 클립의 시간 범위와 겹치는 자막만 함께 삭제
      //   ※ 같은 linkGroupId라도 다른 영상/오디오 클립은 삭제하지 않음 (분할 클립 보호)
      if (clip.linked && !isSubtitleTrack) {
        const clipStart = clip.startTime;
        const clipEnd = clip.startTime + clip.duration;
        const isSubTrackFn = (ti: number) => ti === 0 || (ti >= 5 && ti <= 8);

        for (const c of prev) {
          if (c.id === clipId) continue;
          // 자막 트랙만 연동 삭제 (영상/오디오 클립은 건드리지 않음)
          if (!isSubTrackFn(c.trackIndex)) continue;
          if (!c.linked) continue;

          const cEnd = c.startTime + c.duration;
          // 삭제되는 클립의 시간 범위와 겹치는 자막만 삭제
          const overlaps = c.startTime < clipEnd && cEnd > clipStart;
          if (overlaps) {
            deleteIds.add(c.id);
          }
        }
      }

      let updated = prev.filter(c => !deleteIds.has(c.id));

      // 삭제된 클립이 현재 비디오 URL과 같으면 다음 비디오 클립으로 전환
      if (clip.url && clip.url === currentVideoUrl) {
        const next = updated.find(c => c.trackIndex === 1 && c.url);
        setCurrentVideoUrl(next?.url);
      }

      // Ripple 모드이거나 강제 ripple 시 갭 제거 (Premiere의 Shift+Delete 동작)
      if (rippleModeRef.current || forceRipple) updated = rippleCloseGaps(updated);

      return updated;
    });
    setSelectedClipIdsSynced([]);
  }, [currentVideoUrl, rippleCloseGaps, setClipsSynced, setSelectedClipIdsSynced]);

  // handleClipDelete를 useEffect 클로저에서 stale 없이 쓰기 위한 ref 래퍼
  const handleClipDeleteRef = useRef(handleClipDelete);
  useEffect(() => { handleClipDeleteRef.current = handleClipDelete; }, [handleClipDelete]);

  // ===== Speed change — adjusts clip duration =====
  const handleSpeedChange = useCallback((clipId: string, speed: number) => {
    setClips(prev => prev.map(clip => {
      if (clip.id !== clipId) return clip;
      const origDur = clip.originalDuration ?? clip.duration;
      const newDuration = origDur / speed;
      return { ...clip, speed, originalDuration: origDur, duration: newDuration };
    }));
    // Also update video playback rate
    if (videoRef.current) {
      const clip = clipsRef.current.find(c => c.id === clipId);
      if (clip && clip.trackIndex === 1) {
        videoRef.current.playbackRate = speed;
      }
    }
  }, []);

  // Rename from header
  const handleRename = useCallback((newName: string) => {
    setActiveFileName(newName);
    const selIds = selectedClipIdsRef.current;
    if (selIds.length > 0) handleClipUpdate(selIds[0], { name: newName });
  }, [handleClipUpdate]);

  // 클립들을 exclusion 구간에서 잘라내는 헬퍼
  const trimClipsAgainstRanges = (clipsToTrim: VideoClip[], exclusionClips: VideoClip[]): VideoClip[] => {
    const trimmed: VideoClip[] = [];
    for (const clip of clipsToTrim) {
      let segments: { start: number; end: number }[] = [{ start: clip.startTime, end: clip.startTime + clip.duration }];
      for (const ex of exclusionClips) {
        const exStart = ex.startTime;
        const exEnd = ex.startTime + ex.duration;
        const next: { start: number; end: number }[] = [];
        for (const seg of segments) {
          if (exEnd <= seg.start || exStart >= seg.end) { next.push(seg); continue; }
          if (exStart > seg.start) next.push({ start: seg.start, end: exStart });
          if (exEnd < seg.end) next.push({ start: exEnd, end: seg.end });
        }
        segments = next;
      }
      for (const seg of segments) {
        if (seg.end - seg.start >= 0.3) {
          trimmed.push({ ...clip, id: genId(), startTime: seg.start, duration: seg.end - seg.start });
        }
      }
    }
    return trimmed;
  };

  // Add subtitle clips to timeline from parsed SRT/ASS or AI results
  const handleAddSubtitleClips = useCallback((items: TranscriptItem[], trackIndex: number = 0, replaceTrack: boolean = false) => {
    const isDialogueTrack = trackIndex === 0;
    const gap = isDialogueTrack ? 0 : SUBTITLE_GAP_SECONDS;

    // 비디오/오버레이 트랙의 끝 시간 = 자막이 넘으면 안 되는 한계
    const videoClips = clipsRef.current.filter(c => c.trackIndex === 1 || (c.trackIndex >= 10 && c.trackIndex <= 14));
    const tlEnd = videoClips.length > 0
      ? Math.max(...videoClips.map(c => c.startTime + c.duration))
      : 0;

    // 자막과 연결할 비디오 클립의 linkGroupId 찾기 (메인 비디오 트랙 기준)
    const mainVideo = clipsRef.current.find(c => c.trackIndex === 1);
    const groupId = mainVideo?.linkGroupId || mainVideo?.id;

    const isPortrait = canvasAspectRatio === '9:16' || canvasAspectRatio === '3:4';
    const maxChars = isPortrait ? SUBTITLE_MAX_CHARS_PORTRAIT : SUBTITLE_MAX_CHARS;

    const placements = buildSubtitlePlacements(items, {
      gap,
      continuous: isDialogueTrack,
      timelineEnd: tlEnd > 0 ? tlEnd : undefined,
      maxChars,
    });

    const newClips: VideoClip[] = placements.map(({ startTime, duration, item }) => ({
      id: genId(),
      name: item.editedText || item.originalText,
      url: '',
      startTime,
      duration,
      trackIndex,
      scale: 100, positionX: 0, positionY: 0, rotation: 0, opacity: 100, blendMode: false, speed: 1,
      linked: true, linkGroupId: groupId,
      fontFamily: 'PaperlogyExtraBold, sans-serif', fontSize: 40,
      color: item.color || '#FFFFFF', strokeColor: item.strokeColor || '#000000', strokeWidth: 3, fontWeight: 800, shadowColor: 'rgba(0,0,0,0.9)', shadowBlur: 8, shadowOffsetX: 2, shadowOffsetY: 2,
    }));

    setClips(prev => {
      // 오케스트레이터가 이미 대본-AI 겹침을 해결했으므로 추가 제거 불필요
      const base = replaceTrack ? prev.filter(c => c.trackIndex !== trackIndex) : prev;
      return [...base, ...newClips];
    });
  }, [canvasAspectRatio]);

  // Handle SRT/ASS file import
  const handleSubtitleImport = useCallback(async (file: File) => {
    try {
      const parsed = await parseSubtitleFile(file);
      setTranscripts(prev => [...prev, ...parsed]);
      handleAddSubtitleClips(parsed, 0); // Automatically add to Dialogue track
      setActiveFileName(file.name);
    } catch (err: any) {
      alert(`자막 파일 파싱 실패: ${err.message}`);
    }
  }, [handleAddSubtitleClips]);

  // Fit timeline to screen (Shift+Z) — Final Cut Pro style
  const handleFitToScreen = useCallback(() => {
    // 1. 최신 clips 참조 (stale closure 방지)
    const allClips = clipsRef.current;
    if (!allClips || allClips.length === 0) return;

    // 2. 프로젝트 총 길이: 모든 트랙에서 가장 늦게 끝나는 시간
    const maxEndTime = Math.max(...allClips.map(c => c.startTime + c.duration));
    if (!maxEndTime || maxEndTime <= 0 || !isFinite(maxEndTime)) return;

    // 3. 타임라인 컨테이너 가용 너비 (트랙 헤더 제외)
    const scrollArea = document.querySelector('[data-timeline-scroll="true"]') as HTMLElement | null;
    if (!scrollArea) return;
    const containerWidth = scrollArea.clientWidth;
    if (!containerWidth || containerWidth <= 0) return;
    const TRACK_HEADER_WIDTH = 80; // w-20 = 80px
    const availableWidth = (containerWidth - TRACK_HEADER_WIDTH) * 0.98;
    if (availableWidth <= 0) return;

    // 4. 줌 계산
    //    Timeline: pixelsPerSecond = 50 * zoom
    //    목표: maxEndTime * 50 * zoom = availableWidth
    //    → zoom = availableWidth / (maxEndTime * 50)
    const BASE_PPS = 50;
    let newZoom = availableWidth / (maxEndTime * BASE_PPS);

    // NaN / Infinity 방어 + Clamp
    if (!isFinite(newZoom) || isNaN(newZoom)) newZoom = 1;
    newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));

    setTimelineZoom(newZoom);

    // 5. 스크롤을 맨 앞으로 초기화
    requestAnimationFrame(() => {
      scrollArea.scrollLeft = 0;
    });
  }, []);

  const handleToggleEnable = useCallback(() => {
    const selIds = selectedClipIdsRef.current;
    if (selIds.length === 0) return;
    const selSet = new Set(selIds);
    setClips(prev => prev.map(c => selSet.has(c.id) ? { ...c, disabled: !c.disabled } : c));
  }, []);

  // ===== DEFINITIVE GLOBAL KEYBOARD SHORTCUTS =====
  // Uses refs to avoid stale closures — the handler never needs to be re-registered
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      const isTyping = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'
        || (document.activeElement as HTMLElement)?.isContentEditable;

      const cmd = e.metaKey || e.ctrlKey;
      const shift = e.shiftKey;

      // --- FIT TO SCREEN (Shift+Z — activeSection에 따라 분기) ---
      if (e.shiftKey && !cmd && !e.altKey && e.key.toLowerCase() === 'z' && !isTyping) {
        e.preventDefault();
        if (activeSectionRef.current === 'viewer') {
          setViewerZoom(100);
        } else {
          handleFitToScreen();
        }
        return;
      }

      // --- Cmd+/- : activeSection에 따라 각 패널 줌 ---
      if (cmd && !shift && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        const section = activeSectionRef.current;
        if (section === 'library') {
          setLibraryColumns(prev => Math.max(1, prev - 1));
        } else if (section === 'viewer') {
          setViewerZoom(prev => Math.min(200, prev + 25));
        } else {
          setTimelineZoom(prev => Math.min(MAX_ZOOM, prev * ZOOM_STEP));
        }
        return;
      }
      if (cmd && !shift && e.key === '-') {
        e.preventDefault();
        const section = activeSectionRef.current;
        if (section === 'library') {
          setLibraryColumns(prev => Math.min(5, prev + 1));
        } else if (section === 'viewer') {
          setViewerZoom(prev => Math.max(25, prev - 25));
        } else {
          setTimelineZoom(prev => Math.max(MIN_ZOOM, prev / ZOOM_STEP));
        }
        return;
      }
      if (cmd && shift && e.code === 'KeyF') {
        e.preventDefault();
        handleFitToScreen();
        return;
      }

      // --- UNDO / REDO ---
      if (cmd && !shift && e.code === 'KeyZ') {
        e.preventDefault();
        handleUndo();
        return;
      }
      if (cmd && shift && e.code === 'KeyZ') {
        e.preventDefault();
        handleRedo();
        return;
      }

      // Skip remaining shortcuts when typing
      if (isTyping) {
        return;
      }

      // --- PLAYBACK ---
      if (e.code === 'Space' && !cmd) {
        e.preventDefault();
        setIsPlaying(prev => {
          if (!prev) {
            // Starting playback: blue line 우선, blue=0이고 hover가 있으면 hover 위치 사용
            const startAt = (currentTimeRef.current > 0 || hoverTimeRef.current == null)
              ? currentTimeRef.current
              : hoverTimeRef.current;
            setPlaybackTime(startAt);
            playbackTimeRef.current = startAt;
            setCurrentTime(startAt);
            currentTimeRef.current = startAt;
          } else {
            // Stopping playback: 멈춘 위치를 새 편집 기준점(파란 선)으로 즉시 동기화
            // React 배치 덕분에 isPlaying=false와 currentTime 업데이트가 같은 렌더에 반영됨
            const stoppedAt = playbackTimeRef.current;
            setCurrentTime(stoppedAt);
            currentTimeRef.current = stoppedAt;
            setHoverSuppressed(true); setTimeout(() => setHoverSuppressed(false), 500);
          }
          return !prev;
        });
        return;
      }

      // --- TOOL MODE: A=selection, B=blade+split ---
      if (e.code === 'KeyA' && !cmd) {
        e.preventDefault();
        setCurrentTool('selection');
        return;
      }

      // --- SPLIT / BLADE (B, M, or Cmd+B) --- uses e.code for Korean IME compatibility
      if ((e.code === 'KeyB' || e.code === 'KeyM') && !cmd) {
        e.preventDefault();
        setCurrentTool('blade');
        splitAtPlayhead();
        return;
      }
      if (cmd && e.shiftKey && e.code === 'KeyB') {
        e.preventDefault();
        autoSplitByTranscript();
        return;
      }
      if (cmd && e.code === 'KeyB') {
        e.preventDefault();
        splitAtPlayhead();
        return;
      }

      // --- DELETE ---
      // Premiere Pro / Final Cut Pro 방식:
      //   Delete        → 클립 제거, gap 유지 (rippleMode 설정에 따름)
      //   Shift+Delete  → Ripple Delete — 무조건 gap 제거 (Premiere Pro와 동일)
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        const selIds = selectedClipIdsRef.current;
        if (selIds.length > 0) {
          const forceRipple = e.shiftKey; // Shift+Delete → ripple delete
          // handleClipDelete는 clipsRef 즉시 동기화 + currentVideoUrl 처리 포함
          selIds.forEach(id => handleClipDeleteRef.current(id, forceRipple));
        }
        return;
      }

      // --- COPY ---
      if (cmd && e.code === 'KeyC') {
        e.preventDefault();
        const selId = selectedClipIdsRef.current[0];
        const clip = clipsRef.current.find(c => c.id === selId);
        if (clip) setClipboard({ clip: { ...clip } });
        return;
      }

      // --- PASTE ---
      if (cmd && e.code === 'KeyV') {
        e.preventDefault();
        const cb = clipboardRef.current;
        if (!cb) return;
        const newId = genId();
        setClipsSynced(prev => {
          const sameTrack = prev.filter(c => c.trackIndex === cb.clip.trackIndex);
          const startTime = sameTrack.length > 0 ? Math.max(...sameTrack.map(c => c.startTime + c.duration)) : 0;
          return [...prev, { ...cb.clip, id: newId, startTime }];
        });
        setSelectedClipIdsSynced([newId]);
        return;
      }

      // --- DUPLICATE ---
      if (cmd && e.code === 'KeyD') {
        e.preventDefault();
        const selIds = selectedClipIdsRef.current;
        const clipsToSelect: string[] = [];
        setClipsSynced(prev => {
          let newClips = [...prev];
          selIds.forEach(selId => {
            const clip = prev.find(c => c.id === selId);
            if (clip) {
              const newId = genId();
              clipsToSelect.push(newId);
              newClips.push({ ...clip, id: newId, startTime: clip.startTime + clip.duration });
            }
          });
          return newClips;
        });
        if (clipsToSelect.length > 0) setSelectedClipIdsSynced(clipsToSelect);
        return;
      }

      // --- SELECT ALL (타임라인 활성 시 → 클립 전체 선택) ---
      if (cmd && e.code === 'KeyA' && activeSectionRef.current === 'timeline') {
        e.preventDefault();
        const all = clipsRef.current;
        if (all.length > 0) setSelectedClipIdsSynced(all.map(c => c.id));
        return;
      }

      // --- FRAME STEP ---
      if (e.code === 'BracketLeft') {
        e.preventDefault();
        setCurrentTimeSynced(prev => Math.max(0, prev - FRAME_DURATION));
        return;
      }
      if (e.code === 'BracketRight') {
        e.preventDefault();
        setCurrentTimeSynced(prev => prev + FRAME_DURATION);
        return;
      }

      // --- TRIM LEFT (Q) / TRIM RIGHT (W) ---
      if (e.code === 'KeyQ') {
        e.preventDefault();
        trimLeft();
        return;
      }
      if (e.code === 'KeyW') {
        e.preventDefault();
        trimRight();
        return;
      }

      // --- ARROW KEYS ---
      // 캡컷 동작: 클립 선택 시 → 클립 위치 nudge
      //            클립 미선택 시 → ←/→ 1프레임 플레이헤드 이동, ↑/↓ 이전/다음 편집 포인트 점프
      if (e.key === 'ArrowLeft' && !cmd) {
        e.preventDefault();
        if (selectedClipIdsRef.current.length > 0) {
          nudge(-1, 0);
        } else {
          // 1프레임(1/30s) 뒤로 — Shift: 이전 편집 포인트
          if (e.shiftKey) {
            seekToPrevEditPoint();
          } else {
            setCurrentTimeSynced(prev => Math.max(0, prev - FRAME_DURATION));
          }
        }
        return;
      }
      if (e.key === 'ArrowRight' && !cmd) {
        e.preventDefault();
        if (selectedClipIdsRef.current.length > 0) {
          nudge(1, 0);
        } else {
          // 1프레임(1/30s) 앞으로 — Shift: 다음 편집 포인트
          if (e.shiftKey) {
            seekToNextEditPoint();
          } else {
            setCurrentTimeSynced(prev => prev + FRAME_DURATION);
          }
        }
        return;
      }
      if (e.key === 'ArrowUp' && !cmd) {
        e.preventDefault();
        if (selectedClipIdsRef.current.length > 0) {
          nudge(0, -1);
        } else {
          seekToPrevEditPoint();  // 이전 편집 포인트 (캡컷 동일)
        }
        return;
      }
      if (e.key === 'ArrowDown' && !cmd) {
        e.preventDefault();
        if (selectedClipIdsRef.current.length > 0) {
          nudge(0, 1);
        } else {
          seekToNextEditPoint();  // 다음 편집 포인트 (캡컷 동일)
        }
        return;
      }

      // --- TOGGLE ENABLE (V) ---
      if (e.code === 'KeyV' && !cmd) {
        e.preventDefault();
        handleToggleEnable();
        return;
      }

      // --- AUTO COLOR CORRECTION (C) ---
      if (e.code === 'KeyC' && !cmd && !shift) {
        e.preventDefault();
        const selId = selectedClipIdsRef.current[0];
        const clip = selId
          ? clipsRef.current.find(c => c.id === selId)
          : clipsRef.current.find(c => c.trackIndex === 1);
        if (!clip) return;
        const isOn = clip.autoColorCorrection;
        const updates = isOn
          ? { autoColorCorrection: false, brightness: 100, contrast: 100, saturate: 100, temperature: 0, sharpen: 0 }
          : { autoColorCorrection: true, brightness: 115, contrast: 120, saturate: 130, temperature: 5, sharpen: 35 };
        setClipsSynced(prev => prev.map(c => c.id === clip.id ? { ...c, ...updates } : c));
        setImportToast(isOn ? '색상 보정 해제 ✓' : '자동 색상 보정 적용 ✓');
        setTimeout(() => setImportToast(null), 2000);
        return;
      }

      // --- INSERT SELECTED LIBRARY ITEMS TO TIMELINE (E) ---
      if (e.code === 'KeyE' && !cmd) {
        e.preventDefault();
        const selLibIds = selectedLibraryIdsRef.current;
        const libItems = libraryItemsRef.current;
        if (selLibIds.length === 0) return;
        const selected = selLibIds
          .map(id => libItems.find(i => i.id === id))
          .filter(Boolean) as typeof libItems;
        if (selected.length === 0) return;
        // 타임라인 트랙1 끝 시간 계산
        let insertAt = clipsRef.current
          .filter(c => c.trackIndex === 1)
          .reduce((max, c) => Math.max(max, c.startTime + c.duration), 0);
        const newClips: VideoClip[] = [];
        for (const item of selected) {
          const id = genId();
          newClips.push({
            id,
            name: item.name,
            url: item.url,
            startTime: insertAt,
            duration: item.duration || 10,
            originalDuration: item.duration || 10,
            trackIndex: 1,
            scale: 100, positionX: 0, positionY: 0, rotation: 0, opacity: 100,
            blendMode: false, speed: 1, linked: true, linkGroupId: id, volume: 100,
          });
          insertAt += item.duration || 10;
        }
        setClipsSynced(prev => [...prev, ...newClips]);
        // 첫 번째 영상이면 currentVideoUrl 세팅
        const firstVideo = selected.find(i => i.type === 'video');
        if (firstVideo && !currentVideoUrlRef.current) {
          currentVideoUrlRef.current = firstVideo.url;
          setCurrentVideoUrl(firstVideo.url);
          setCurrentVideoFile(firstVideo.file || null);
          setActiveFileName(firstVideo.name);
          setActiveFileDuration(firstVideo.duration);
        }
        return;
      }

      // --- ESCAPE ---
      if (e.key === 'Escape') {
        setSelectedClipIdsSynced([]);
        return;
      }
    };

    // ===== STATE-BASED CUT FUNCTIONS =====
    // getCutTime: Q / W / B / Split 모든 편집 단축키의 공통 기준 시간
    // 우선순위: 오렌지 호버선(마우스 위치) > 파란 플레이헤드(편집 기준점)
    // - 마우스가 타임라인 위에 있으면 오렌지 선(hoverTimeRef) 위치로 작업
    // - 타임라인 밖에 있으면 파란 플레이헤드(currentTimeRef) 위치로 작업
    // useRef로 항상 최신 값 참조 (stale closure 방지)
    function getCutTime(): number {
      if (hoverTimeRef.current != null) return hoverTimeRef.current;
      return currentTimeRef.current;
    }

    // === Subtitle sync helper ===
    // When a video/audio clip is edited, sync subtitle clips (trackIndex 0, 5)
    // that overlap the same time range
    const isSubTrack = (ti: number) => ti === 0 || (ti >= 5 && ti <= 8);

    function syncSubtitlesForSplit(prev: typeof clips, splitTime: number, parentTrack: number) {
      // Only sync subtitles when editing video/audio tracks (not subtitle tracks themselves)
      if (isSubTrack(parentTrack)) return prev;
      return prev.flatMap(c => {
        if (!isSubTrack(c.trackIndex)) return [c];
        // Subtitle overlaps the split point → split it too
        if (c.startTime < splitTime && splitTime < c.startTime + c.duration) {
          const firstDur = splitTime - c.startTime;
          const secondDur = c.duration - firstDur;
          const newId = `clip_${Date.now()}_${clipIdCounter.current++}`;
          return [
            { ...c, duration: firstDur },
            { ...c, id: newId, startTime: splitTime, duration: secondDur },
          ];
        }
        return [c];
      });
    }

    function syncSubtitlesForTrimLeft(prev: typeof clips, trimTime: number, parentTrack: number) {
      if (isSubTrack(parentTrack)) return prev;
      // trimLeft: 영상의 trimTime 이전 부분이 잘림 → 자막도 동기화
      return prev.filter(c => {
        if (!isSubTrack(c.trackIndex)) return true;
        const cEnd = c.startTime + c.duration;
        // 자막이 잘린 구간 안에 완전히 있으면 제거
        if (cEnd <= trimTime) return false;
        return true;
      }).map(c => {
        if (!isSubTrack(c.trackIndex)) return c;
        const cEnd = c.startTime + c.duration;
        // 자막이 trimTime에 걸쳐있으면 시작을 잘라줌
        if (c.startTime < trimTime && cEnd > trimTime) {
          return { ...c, startTime: trimTime, duration: cEnd - trimTime };
        }
        return c;
      });
    }

    function syncSubtitlesForTrimRight(prev: typeof clips, trimTime: number, parentTrack: number) {
      if (isSubTrack(parentTrack)) return prev;
      // trimRight: 영상의 trimTime 이후 부분이 잘림 → 자막도 동기화
      return prev.filter(c => {
        if (!isSubTrack(c.trackIndex)) return true;
        // 자막이 잘린 구간 안에 완전히 있으면 제거
        if (c.startTime >= trimTime) return false;
        return true;
      }).map(c => {
        if (!isSubTrack(c.trackIndex)) return c;
        // 자막이 trimTime에 걸쳐있으면 끝을 잘라줌
        if (c.startTime < trimTime && c.startTime + c.duration > trimTime) {
          return { ...c, duration: trimTime - c.startTime };
        }
        return c;
      });
    }

    function splitAtPlayhead() {
      const t = getCutTime();
      const clip = clipsRef.current.find(c =>
        c.startTime < t && t < c.startTime + c.duration
      );
      if (!clip) return;

      const firstDur = t - clip.startTime;
      const secondDur = clip.duration - firstDur;
      const secondId = `clip_${Date.now()}_${clipIdCounter.current++}`;

      const originalTrimStart = clip.trimStart ?? 0;
      const speed = clip.speed ?? 1;
      const secondTrimStart = originalTrimStart + (firstDur * speed);

      setClipsSynced(prev => {
        const idx = prev.findIndex(c => c.id === clip.id);
        if (idx === -1) return prev;
        const firstClip = { ...clip, duration: firstDur };
        const secondClip = { ...clip, id: secondId, startTime: t, duration: secondDur, trimStart: secondTrimStart };
        const result = [...prev];
        result[idx] = firstClip;
        result.splice(idx + 1, 0, secondClip);
        // Sync subtitle clips at the split point
        return syncSubtitlesForSplit(result, t, clip.trackIndex);
      });
      setSelectedClipIdsSynced([secondId]);
    }

    // ⌘⇧B: 대본 기반 자동 분할 (Auto Split by Transcript)
    // 비디오 클립을 대본의 문장 경계에서 자동으로 칼선(컷)을 넣어줌
    function autoSplitByTranscript() {
      const videoClips = clipsRef.current.filter(c => c.trackIndex === 1);
      if (videoClips.length === 0) { alert('타임라인에 비디오 클립이 없습니다.'); return; }

      const currentTranscripts = transcriptsRef.current;
      if (!currentTranscripts || currentTranscripts.length === 0) { alert('대본(STT) 결과가 없습니다. 먼저 음성 인식을 실행해주세요.'); return; }

      // 대본의 문장 경계 시간들 수집 (각 transcript의 startTime)
      const cutPoints = currentTranscripts
        .map(t => t.startTime)
        .filter(t => t > 0)
        .sort((a, b) => a - b);

      if (cutPoints.length === 0) { alert('분할할 경계점이 없습니다.'); return; }

      setClipsSynced(prev => {
        let result = [...prev];

        // 각 컷 포인트에서 비디오 클립을 분할
        for (const cutTime of cutPoints) {
          // 이 cutTime을 포함하는 비디오 클립 찾기
          const clipIdx = result.findIndex(c =>
            c.trackIndex === 1 &&
            c.startTime + 0.05 < cutTime &&
            cutTime < c.startTime + c.duration - 0.05
          );
          if (clipIdx === -1) continue;

          const clip = result[clipIdx];
          const firstDur = cutTime - clip.startTime;
          const secondDur = clip.duration - firstDur;
          const secondId = `clip_${Date.now()}_${clipIdCounter.current++}`;
          const originalTrimStart = clip.trimStart ?? 0;
          const speed = clip.speed ?? 1;
          const secondTrimStart = originalTrimStart + (firstDur * speed);

          const firstClip = { ...clip, duration: firstDur };
          const secondClip = { ...clip, id: secondId, startTime: cutTime, duration: secondDur, trimStart: secondTrimStart };
          result[clipIdx] = firstClip;
          result.splice(clipIdx + 1, 0, secondClip);

          // 자막도 같이 분할
          result = syncSubtitlesForSplit(result, cutTime, clip.trackIndex);
        }

        return result;
      });

      setImportToast(`자동 분할 완료: ${cutPoints.length}개 컷 생성 ✓`);
      setTimeout(() => setImportToast(null), 2500);
    }

    // Q: trim left — targetTime 앞부분 날리기 (startTime → targetTime으로 이동)
    // 우선순위: 오렌지 호버선(마우스 위치) > 파란 플레이헤드(편집 기준점)
    function trimLeft() {
      const targetTime = getCutTime();
      const EPS = 0.001;

      // ① 먼저 현재 클립 정보로 cutAmount 계산 (setClipsSynced 밖에서)
      const currentClips = clipsRef.current;
      const inRangeCheck = (c: typeof currentClips[0]) =>
        c.startTime <= targetTime + EPS && targetTime - EPS < c.startTime + c.duration;
      const selId = selectedClipIdsRef.current[0];
      const selClip = selId ? currentClips.find(c => c.id === selId) : null;
      const targetClip = (selClip && inRangeCheck(selClip))
        ? selClip
        : currentClips.find(c => !isSubTrack(c.trackIndex) && inRangeCheck(c))
          ?? currentClips.find(c => inRangeCheck(c));
      if (!targetClip) return;
      const cutAmount = targetTime - targetClip.startTime;
      if (cutAmount < EPS) return;

      // ② 클립 트림 + ripple + 자막 동기화
      setClipsSynced(prev => {
        const clip = prev.find(c => c.id === targetClip.id);
        if (!clip) return prev;

        const clipEnd = clip.startTime + clip.duration;
        const speed = clip.speed ?? 1;
        const ca = targetTime - clip.startTime;

        let trimmed = prev.map(c => c.id === clip.id ? {
          ...c,
          startTime: targetTime,
          duration: clipEnd - targetTime,
          trimStart: (c.trimStart ?? 0) + (ca * speed),
        } : c);

        trimmed = syncSubtitlesForTrimLeft(trimmed, targetTime, clip.trackIndex);

        // ripple: 갭 닫기
        if (rippleModeRef.current) {
          trimmed = rippleCloseGaps(trimmed);
        }
        return trimmed;
      });

      // ③ ripple일 때 플레이헤드도 cutAmount만큼 왼쪽으로 (setClipsSynced 밖에서!)
      if (rippleModeRef.current) {
        const newTime = Math.max(0, targetTime - cutAmount);
        setCurrentTimeSynced(newTime);
      }
    }

    function trimRight() {
      const targetTime = getCutTime();
      const EPS = 0.001;

      setClipsSynced(prev => {
        const inRange = (c: typeof prev[0]) =>
          c.startTime <= targetTime + EPS && targetTime - EPS < c.startTime + c.duration;

        const selId = selectedClipIdsRef.current[0];
        const selClip = selId ? prev.find(c => c.id === selId) : null;
        const clip = (selClip && inRange(selClip))
          ? selClip
          : prev.find(c => !isSubTrack(c.trackIndex) && inRange(c))
            ?? prev.find(c => inRange(c));
        if (!clip) return prev;

        const clipEnd = clip.startTime + clip.duration;
        if (clipEnd - targetTime < EPS) return prev;

        let trimmed = prev.map(c => c.id === clip.id ? {
          ...c,
          duration: targetTime - clip.startTime,
        } : c);

        trimmed = syncSubtitlesForTrimRight(trimmed, targetTime, clip.trackIndex);

        if (rippleModeRef.current) {
          trimmed = rippleCloseGaps(trimmed);
        }
        return trimmed;
      });
      // W는 오른쪽 잘림 → 플레이헤드 위치 변경 불필요
    }

    // 모든 클립 경계(start, start+duration)를 오름차순으로 반환
    function getEditPoints(): number[] {
      const pts = new Set<number>([0]);
      clipsRef.current.forEach(c => {
        pts.add(c.startTime);
        pts.add(c.startTime + c.duration);
      });
      return Array.from(pts).sort((a, b) => a - b);
    }

    // ↓ : 다음 편집 포인트로 플레이헤드 점프 (캡컷 동일)
    function seekToNextEditPoint() {
      const t = currentTimeRef.current;
      const pts = getEditPoints();
      const next = pts.find(p => p > t + 0.001);
      if (next !== undefined) setCurrentTimeSynced(next);
    }

    // ↑ : 이전 편집 포인트로 플레이헤드 점프 (캡컷 동일)
    function seekToPrevEditPoint() {
      const t = currentTimeRef.current;
      const pts = getEditPoints();
      const prev = [...pts].reverse().find(p => p < t - 0.001);
      if (prev !== undefined) setCurrentTimeSynced(prev);
    }

    function nudge(dx: number, dy: number) {
      const selIds = selectedClipIdsRef.current;
      if (selIds.length === 0) return;
      setClipsSynced(prev => prev.map(c => selIds.includes(c.id) ? {
        ...c,
        positionX: (c.positionX ?? 0) + dx,
        positionY: (c.positionY ?? 0) + dy,
      } : c));
    }

    window.addEventListener('keydown', onKey, true); // capture phase — fires before any stopPropagation
    return () => window.removeEventListener('keydown', onKey, true);
  }, [handleUndo, handleRedo, handleFitToScreen]);

  // Sync video playbackRate when selected clip changes
  useEffect(() => {
    if (videoRef.current && selectedClip && selectedClip.trackIndex === 1) {
      videoRef.current.playbackRate = selectedClip.speed ?? 1;
    }
  }, [selectedClip]);

  // Effects
  const handleSoundEffect = useCallback(() => alert('효과음 라이브러리'), []);
  const handleSticker = useCallback(() => alert('스티커 라이브러리'), []);
  const handleAutoColorCorrection = useCallback(() => {
    // 선택된 비디오 클립에 자동 색보정 적용/해제
    const clip = selectedClip || clipsRef.current.find(c => c.trackIndex === 1);
    if (!clip) { alert('영상 클립을 선택해주세요.'); return; }

    if (clip.autoColorCorrection) {
      // 이미 적용됨 → 해제 (기본값으로 복원)
      handleClipUpdate(clip.id, {
        autoColorCorrection: false,
        brightness: 100,
        contrast: 100,
        saturate: 100,
        temperature: 0,
        sharpen: 0,
      });
      setImportToast('색상 보정 해제 ✓');
    } else {
      // 자동 보정 적용: 캡컷 스타일 — 밝기↑ 대비↑ 채도↑ 약간 따뜻한 톤
      handleClipUpdate(clip.id, {
        autoColorCorrection: true,
        brightness: 115,    // +15% 밝기
        contrast: 120,      // +20% 대비
        saturate: 130,       // +30% 채도
        temperature: 5,      // 따뜻한 톤
        sharpen: 35,         // 선명
      });
      setImportToast('자동 색상 보정 적용 ✓');
    }
    setTimeout(() => setImportToast(null), 2000);
  }, [selectedClip, handleClipUpdate]);
  const handleAnimationEffect = useCallback(() => {
    if (selectedClip) {
      const fx = ['fadeIn', 'slideIn', 'zoomIn', 'bounce'];
      handleClipUpdate(selectedClip.id, { animationEffect: fx[Math.floor(Math.random() * fx.length)] });
      alert('애니메이션 효과 적용');
    } else alert('구간을 선택해주세요.');
  }, [selectedClip, handleClipUpdate]);

  // Auth guard disabled — allow all interactions without login
  const handleInteractionGuard = useCallback((_e: React.MouseEvent | React.TouchEvent | React.PointerEvent) => {
    // no-op
  }, []);

  // Import trigger — 기본 file input (가장 안정적)
  const importFileRef = useRef<(file: File) => void>(() => {});
  const handleImportClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);



  // Export handler — with folder/file picker
  const handleExportClick = useCallback(async () => {
    const projectData = {
      name: activeFileName || '제목 없는 프로젝트',
      exportedAt: new Date().toISOString(),
      clips: clipsRef.current,
      transcripts,
      subtitles,
      settings: {
        resolution: '1920x1080',
        frameRate: '30fps',
        format: 'JSON (Project)',
      },
    };
    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: 'application/json' });
    const fileName = `${activeFileName || 'autotext_project'}_${Date.now()}.json`;

    // Try File System Access API for folder selection
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: fileName,
          types: [
            { description: 'AutoText 프로젝트', accept: { 'application/json': ['.json'] } },
          ],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        setImportToast('프로젝트 저장 완료 ✓');
        setTimeout(() => setImportToast(null), 2000);
        return;
      } catch (err: any) {
        if (err.name === 'AbortError') return; // User cancelled
      }
    }

    // Fallback: regular download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setImportToast('프로젝트 내보내기 완료 ✓');
    setTimeout(() => setImportToast(null), 2000);
  }, [activeFileName, transcripts, subtitles]);

  // Copy (from Header menu)
  const handleCopy = useCallback(() => {
    const selId = selectedClipIdsRef.current[0];
    const clip = clipsRef.current.find(c => c.id === selId);
    if (clip) { setClipboard({ clip: { ...clip } }); setImportToast('복사됨 ✓'); setTimeout(() => setImportToast(null), 1500); }
    else alert('클립을 선택해주세요.');
  }, []);

  // Paste (from Header menu)
  const handlePaste = useCallback(() => {
    const cb = clipboardRef.current;
    if (!cb) { alert('클립보드가 비어있습니다.'); return; }
    const newId = genId();
    setClips(prev => {
      const sameTrack = prev.filter(c => c.trackIndex === cb.clip.trackIndex);
      const startTime = sameTrack.length > 0 ? Math.max(...sameTrack.map(c => c.startTime + c.duration)) : 0;
      return [...prev, { ...cb.clip, id: newId, startTime }];
    });
    setSelectedClipIds([newId]);
  }, []);

  // Duplicate (from Header menu)
  const handleDuplicate = useCallback(() => {
    const selId = selectedClipIdsRef.current[0];
    const clip = clipsRef.current.find(c => c.id === selId);
    if (!clip) { alert('클립을 선택해주세요.'); return; }
    const newId = genId();
    setClips(prev => [...prev, { ...clip, id: newId, startTime: clip.startTime + clip.duration }]);
    setSelectedClipIds([newId]);
  }, []);

  // Select All (from Header menu)
  const handleSelectAllMenu = useCallback(() => {
    const all = clipsRef.current;
    if (all.length > 0) setSelectedClipIds(all.map(c => c.id));
    else alert('클립이 없습니다.');
  }, []);

  // Delete (from Header menu) — handleClipDelete 단일 경로로 통합
  const handleDeleteMenu = useCallback(() => {
    const selIds = selectedClipIdsRef.current;
    if (selIds.length > 0) {
      selIds.forEach(id => handleClipDelete(id));
    } else alert('클립을 선택해주세요.');
  }, [handleClipDelete]);

  // ===== ADD TEXT CLIP from preset (click or drag) =====
  const handleAddTextClip = useCallback((preset: SubtitlePreset) => {
    const clipId = genId();
    const t = currentTimeRef.current;
    setClips(prev => [...prev, {
      id: clipId,
      name: '텍스트를 입력하세요',
      url: '',
      startTime: t,
      duration: 3,
      trackIndex: 0,
      scale: 100,
      positionX: 0,
      positionY: 0,
      rotation: 0,
      opacity: 100,
      blendMode: false,
      speed: 1,
      linked: false,
      color: preset.color,
      backgroundColor: preset.backgroundColor,
      strokeColor: preset.strokeColor,
      strokeWidth: preset.strokeWidth,
      shadowColor: preset.shadowColor,
      shadowBlur: preset.shadowBlur,
      shadowOffsetX: preset.shadowOffsetX,
      shadowOffsetY: preset.shadowOffsetY,
      glowColor: preset.glowColor,
      borderColor: preset.borderColor,
      borderWidth: preset.borderWidth,
      fontWeight: preset.fontWeight,
    }]);
    setSelectedClipIds([clipId]);
  }, []);

  const handleSubtitleAdd = useCallback((text: string, startTime: number) => {
    trackEditingAction('subtitle_add', { targetTrack: 0, timelinePosition: startTime, clipMediaType: 'subtitle' });
    const clipId = genId();
    setClips(prev => [...prev, {
      id: clipId,
      name: text,
      url: '',
      startTime: startTime,
      duration: 3,
      trackIndex: 0,
      scale: 100,
      positionX: 0,
      positionY: 0,
      rotation: 0,
      opacity: 100,
      blendMode: false,
      speed: 1,
      linked: false,
      color: '#FFFFFF',
      fontWeight: 700,
      strokeColor: '#000000',
      strokeWidth: 2,
    }]);
    setSelectedClipIds([clipId]);
  }, []);

  const handlePresetDrop = useCallback((preset: SubtitlePreset, _x: number, _y: number) => {
    handleAddTextClip(preset);
  }, [handleAddTextClip]);

  // ===== DRAG & DROP on entire app =====
  const importFile = useCallback(async (file: File) => {
    const fileName = file.name.toLowerCase();
    if (fileName.endsWith('.srt') || fileName.endsWith('.ass') || fileName.endsWith('.ssa')) {
      handleSubtitleImport(file);
      setImportToast('자막 파일이 추가되었습니다 ✓');
    } else if (file.type.startsWith('video/') || file.type.startsWith('audio/') || file.type.startsWith('image/')) {
      await handleVideoAdd(file);
      setImportToast('파일이 추가되었습니다 ✓');
    } else {
      setImportToast('지원하지 않는 파일 형식입니다');
    }
    setTimeout(() => setImportToast(null), 2500);
  }, [handleVideoAdd, handleSubtitleImport]);
  importFileRef.current = importFile;

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach(importFile);
    }
    e.target.value = '';
  }, [importFile]);

  const dragCounterRef = useRef(0);
  const handleGlobalDragOver = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }, []);

  const handleGlobalDragEnter = useCallback((e: React.DragEvent) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      dragCounterRef.current++;
      setIsDraggingFile(true);
    }
  }, []);

  const handleGlobalDragLeave = useCallback((e: React.DragEvent) => {
    dragCounterRef.current--;
    if (dragCounterRef.current <= 0) {
      dragCounterRef.current = 0;
      setIsDraggingFile(false);
    }
  }, []);

  const handleGlobalDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDraggingFile(false);
    Array.from(e.dataTransfer.files).forEach(importFile);
  }, [importFile]);

  // Callbacks for Timeline toolbar buttons (used for split/trim from toolbar)
  const handleSplit = useCallback(() => {
    const selId = selectedClipIdsRef.current[0];
    if (!selId) return;
    const clip = clipsRef.current.find(c => c.id === selId);
    if (!clip) return;
    const t = currentTimeRef.current;
    if (t <= clip.startTime || t >= clip.startTime + clip.duration) return;
    trackEditingAction('clip_split', { targetTrack: clip.trackIndex, clipDuration: clip.duration, timelinePosition: t, clipCount: clipsRef.current.length + 1 });
    const firstDur = t - clip.startTime;
    const secondDur = clip.duration - firstDur;
    const secondId = genId();
    setClips(prev => [
      ...prev.map(c => c.id === clip.id ? { ...c, duration: firstDur } : c),
      { ...clip, id: secondId, startTime: t, duration: secondDur },
    ]);
    setSelectedClipIds([secondId]);
  }, []);

  // 대본 기반 자동 분할 (toolbar button handler)
  const handleAutoSplit = useCallback(() => {
    const videoClips = clipsRef.current.filter(c => c.trackIndex === 1);
    if (videoClips.length === 0) { alert('타임라인에 비디오 클립이 없습니다.'); return; }
    const trs = transcriptsRef.current;
    if (!trs || trs.length === 0) { alert('대본(STT) 결과가 없습니다. 먼저 음성 인식을 실행해주세요.'); return; }

    const cutPoints = trs.map(t => t.startTime).filter(t => t > 0).sort((a, b) => a - b);
    if (cutPoints.length === 0) return;

    setClips(prev => {
      let result = [...prev];
      for (const cutTime of cutPoints) {
        const clipIdx = result.findIndex(c =>
          c.trackIndex === 1 &&
          c.startTime + 0.05 < cutTime &&
          cutTime < c.startTime + c.duration - 0.05
        );
        if (clipIdx === -1) continue;
        const clip = result[clipIdx];
        const firstDur = cutTime - clip.startTime;
        const secondDur = clip.duration - firstDur;
        const secondId = genId();
        const originalTrimStart = clip.trimStart ?? 0;
        const speed = clip.speed ?? 1;
        const secondTrimStart = originalTrimStart + (firstDur * speed);
        result[clipIdx] = { ...clip, duration: firstDur };
        result.splice(clipIdx + 1, 0, { ...clip, id: secondId, startTime: cutTime, duration: secondDur, trimStart: secondTrimStart });
      }
      return result;
    });
    setImportToast(`자동 분할 완료: ${cutPoints.length}개 컷 ✓`);
    setTimeout(() => setImportToast(null), 2500);
  }, []);

  // 장면 전환 감지 기반 자동 분할 (Canvas 프레임 비교 — 토큰 불필요)
  const handleSceneSplit = useCallback(async () => {
    const videoClips = clipsRef.current.filter(c => c.trackIndex === 1);
    if (videoClips.length === 0) { alert('타임라인에 비디오 클립이 없습니다.'); return; }

    const mainClip = videoClips[0];
    const videoUrl = mainClip.url;
    if (!videoUrl) { alert('비디오 URL이 없습니다.'); return; }

    setImportToast('장면 전환 감지 중...');

    try {
      const cutPoints = await detectSceneChanges(videoUrl, mainClip.duration, mainClip.trimStart ?? 0);

      if (cutPoints.length === 0) {
        setImportToast('장면 전환이 감지되지 않았습니다.');
        setTimeout(() => setImportToast(null), 2500);
        return;
      }

      // 타임라인 시간으로 변환 (mainClip.startTime 기준)
      const timelineCuts = cutPoints.map(t => mainClip.startTime + t);

      setClipsSynced(prev => {
        let result = [...prev];
        for (const cutTime of timelineCuts) {
          const clipIdx = result.findIndex(c =>
            c.trackIndex === 1 &&
            c.startTime + 0.05 < cutTime &&
            cutTime < c.startTime + c.duration - 0.05
          );
          if (clipIdx === -1) continue;
          const clip = result[clipIdx];
          const firstDur = cutTime - clip.startTime;
          const secondDur = clip.duration - firstDur;
          const secondId = genId();
          const originalTrimStart = clip.trimStart ?? 0;
          const speed = clip.speed ?? 1;
          const secondTrimStart = originalTrimStart + (firstDur * speed);
          result[clipIdx] = { ...clip, duration: firstDur };
          result.splice(clipIdx + 1, 0, { ...clip, id: secondId, startTime: cutTime, duration: secondDur, trimStart: secondTrimStart });
        }
        return result;
      });

      setImportToast(`장면 분할 완료: ${cutPoints.length}개 컷 생성 ✓`);
      setTimeout(() => setImportToast(null), 2500);
    } catch (err) {
      console.error('Scene detection error:', err);
      setImportToast('장면 감지 실패');
      setTimeout(() => setImportToast(null), 2500);
    }
  }, [setClipsSynced]);

  // 자막 트랙 판별 (useEffect 밖에서도 사용)
  const isSubTrackOuter = useCallback((ti: number) => ti === 0 || (ti >= 5 && ti <= 8), []);

  const handleTrimLeft = useCallback(() => {
    const t = hoverTimeRef.current ?? currentTimeRef.current;
    const EPS = 0.001;
    // cutAmount 먼저 계산 (setClipsSynced 밖)
    const currentClips = clipsRef.current;
    const inRangeChk = (c: VideoClip) => c.startTime <= t + EPS && t - EPS < c.startTime + c.duration;
    const selId = selectedClipIdsRef.current[0];
    const selClip = selId ? currentClips.find(c => c.id === selId) : null;
    const targetClip = (selClip && inRangeChk(selClip))
      ? selClip
      : currentClips.find(c => !isSubTrackOuter(c.trackIndex) && inRangeChk(c))
        ?? currentClips.find(c => inRangeChk(c));
    if (!targetClip || t - targetClip.startTime < EPS) return;
    const cutAmount = t - targetClip.startTime;

    setClipsSynced(prev => {
      const clip = prev.find(c => c.id === targetClip.id);
      if (!clip) return prev;
      const clipEnd = clip.startTime + clip.duration;
      const speed = clip.speed ?? 1;
      const ca = t - clip.startTime;
      trackEditingAction('clip_trim_left', { targetTrack: clip.trackIndex, clipDuration: clip.duration, timelinePosition: t });
      let trimmed = prev.map(c => c.id === clip.id ? {
        ...c, startTime: t, duration: clipEnd - t, trimStart: (c.trimStart ?? 0) + (ca * speed),
      } : c);
      if (!isSubTrackOuter(clip.trackIndex)) {
        trimmed = trimmed.filter(c => {
          if (!isSubTrackOuter(c.trackIndex)) return true;
          return c.startTime + c.duration > t;
        }).map(c => {
          if (!isSubTrackOuter(c.trackIndex)) return c;
          if (c.startTime < t && c.startTime + c.duration > t) {
            return { ...c, startTime: t, duration: c.startTime + c.duration - t };
          }
          return c;
        });
      }
      if (rippleModeRef.current) trimmed = rippleCloseGaps(trimmed);
      return trimmed;
    });
    // ripple: 플레이헤드를 잘린만큼 왼쪽으로
    if (rippleModeRef.current) {
      setCurrentTimeSynced(Math.max(0, t - cutAmount));
    }
  }, [rippleCloseGaps, setClipsSynced, isSubTrackOuter, setCurrentTimeSynced]);

  const handleTrimRight = useCallback(() => {
    const t = hoverTimeRef.current ?? currentTimeRef.current;
    const EPS = 0.001;
    setClipsSynced(prev => {
      const inRange = (c: VideoClip) => c.startTime <= t + EPS && t - EPS < c.startTime + c.duration;
      const selId = selectedClipIdsRef.current[0];
      const selClip = selId ? prev.find(c => c.id === selId) : null;
      const clip = (selClip && inRange(selClip))
        ? selClip
        : prev.find(c => !isSubTrackOuter(c.trackIndex) && inRange(c))
          ?? prev.find(c => inRange(c));
      if (!clip) return prev;
      const clipEnd = clip.startTime + clip.duration;
      if (clipEnd - t < EPS) return prev;
      trackEditingAction('clip_trim_right', { targetTrack: clip.trackIndex, clipDuration: clip.duration, timelinePosition: t });
      let trimmed = prev.map(c => c.id === clip.id ? {
        ...c, duration: t - clip.startTime,
      } : c);
      if (!isSubTrackOuter(clip.trackIndex)) {
        trimmed = trimmed.filter(c => {
          if (!isSubTrackOuter(c.trackIndex)) return true;
          return c.startTime < t;
        }).map(c => {
          if (!isSubTrackOuter(c.trackIndex)) return c;
          if (c.startTime < t && c.startTime + c.duration > t) {
            return { ...c, duration: t - c.startTime };
          }
          return c;
        });
      }
      if (rippleModeRef.current) trimmed = rippleCloseGaps(trimmed);
      return trimmed;
    });
  }, [rippleCloseGaps, setClipsSynced, isSubTrackOuter]);

  // Refs for keyboard shortcuts (avoid stale closures in useEffect)
  const handleTrimLeftRef = useRef(handleTrimLeft);
  useEffect(() => { handleTrimLeftRef.current = handleTrimLeft; }, [handleTrimLeft]);
  const handleTrimRightRef = useRef(handleTrimRight);
  useEffect(() => { handleTrimRightRef.current = handleTrimRight; }, [handleTrimRight]);

  const handleResizeEnd = useCallback(() => {
    if (rippleModeRef.current) {
      setClips(prev => rippleCloseGaps(prev));
    }
  }, [rippleCloseGaps]);

  // Suppress history during drag/resize, push once when done
  const handleInteractionStart = useCallback(() => {
    isDraggingOrResizingRef.current = true;
  }, []);
  const handleInteractionEnd = useCallback(() => {
    isDraggingOrResizingRef.current = false;
    // Push a single history entry for the final state
    pushHistory(clipsRef.current, selectedClipIdsRef.current);
  }, [pushHistory]);

  return (
    <ShortcutsProvider>
      <div
        className="bg-editor-bg text-white font-display fixed inset-0 flex flex-col overflow-hidden selection:bg-primary/30"
        tabIndex={-1}
        onDragOver={handleGlobalDragOver}
        onDragEnter={handleGlobalDragEnter}
        onDragLeave={handleGlobalDragLeave}
        onDrop={handleGlobalDrop}
      >
        {/* 드래그 앤 드롭 오버레이 (외장하드에서 Finder로 드래그 시 안내) */}
        {isDraggingFile && (
          <div className="fixed inset-0 z-[9999] bg-black/60 flex items-center justify-center pointer-events-none">
            <div className="border-4 border-dashed border-primary rounded-2xl p-12 text-center">
              <span className="material-icons text-6xl text-primary mb-4 block">cloud_upload</span>
              <p className="text-xl font-bold text-white mb-2">파일을 여기에 놓으세요</p>
              <p className="text-sm text-text-secondary">영상, 오디오, 이미지, 자막 파일 지원</p>
              <p className="text-xs text-text-secondary mt-1">외장하드 파일도 Finder에서 드래그하면 바로 가져올 수 있습니다</p>
            </div>
          </div>
        )}

        {/* Hidden file input for import */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={handleFileInputChange}
        />

        {/* Keyboard Shortcuts Modal */}
        <KeyboardShortcutsModal
          isOpen={shortcutsModalOpen}
          onClose={() => setShortcutsModalOpen(false)}
        />
        {/* Drop overlay 제거 — 파일 드롭 시 바로 추가됨 */}

        {/* Toast notification */}
        {importToast && (
          <div className="fixed top-20 left-1/2 -translate-x-1/2 z-[9998] bg-gray-900 border border-[#00D4D4] rounded-lg px-6 py-3 shadow-2xl animate-fade-in">
            <span className="text-white text-sm font-medium">{importToast}</span>
          </div>
        )}

        <Header
          activeFileName={activeFileName}
          activeFileDuration={activeFileDuration}
          onRename={handleRename}
          onExport={handleExportClick}
          onImport={handleImportClick}
          onOpenShortcuts={() => setShortcutsModalOpen(true)}
          videoFile={currentVideoFile}
          videoDuration={activeFileDuration}
          clips={clips}
          transcripts={transcripts}
        />
        {!isMobile && (
          <SecondaryToolbar
            onTabChange={setActiveTab}
            onSoundEffect={handleSoundEffect}
            onSticker={handleSticker}
            onAnimationEffect={handleAnimationEffect}
          />
        )}
        {/* ── 모바일 패널 탭 바 ── */}
        {isMobile && (
          <div className="flex shrink-0 bg-[#1a1a1a] border-b border-border-color z-40">
            {([
              { key: 'player' as const, icon: 'play_circle', label: '미리보기' },
              { key: 'library' as const, icon: 'video_library', label: '미디어' },
              { key: 'inspector' as const, icon: 'tune', label: 'AI자막' },
              { key: 'timeline' as const, icon: 'view_timeline', label: '타임라인' },
            ]).map(tab => (
              <button
                key={tab.key}
                onClick={() => setMobilePanel(tab.key)}
                className={`flex-1 flex flex-col items-center py-1.5 text-[10px] transition-colors ${
                  mobilePanel === tab.key ? 'text-[#00D4D4] bg-[#00D4D4]/10' : 'text-gray-500'
                }`}
              >
                <span className="material-icons text-base">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>
        )}

        <div
          className={`flex-1 ${isMobile ? 'flex flex-col' : 'flex'} overflow-hidden relative min-h-0`}
          onClickCapture={handleInteractionGuard}
          onPointerDownCapture={handleInteractionGuard}
        >
          {/* Left Sidebar */}
          <div
            style={isMobile ? undefined : { width: `${leftPct}%`, minWidth: 160 }}
            className={`shrink-0 relative overflow-hidden ${isMobile ? (mobilePanel === 'library' ? 'flex-1' : 'hidden') : ''}`}
            onPointerDownCapture={() => setActiveSection('library')}
          >
            {!isMobile && <SectionBorder active={activeSection === 'library'} />}
            <LeftSidebar
              onVideoAdd={handleVideoAdd}
              onSubtitleImport={handleSubtitleImport}
              libraryItems={libraryItems}
              clips={clips}
              selectedLibraryIds={selectedLibraryIds}
              onLibrarySelect={(ids: string[]) => { setSelectedLibraryIds(ids); if (ids.length > 0) setSelectedClipIdsSynced([]); }}
              onLibraryDelete={handleLibraryDelete}
              columns={libraryColumns}
              isActive={activeSection === 'library'}
              isMobile={isMobile}
              onAddToTimeline={(itemId: string) => {
                const insertAt = clipsRef.current
                  .filter(c => c.trackIndex === 1)
                  .reduce((maxEnd, c) => Math.max(maxEnd, c.startTime + c.duration), 0);
                handleClipAdd(null, 1, insertAt, itemId);
              }}
            />
          </div>
          {/* Left Divider */}
          {!isMobile && (
            <div
              className="w-1 bg-border-color hover:bg-[#00D4D4] cursor-col-resize shrink-0 transition-colors z-30 group relative"
              onMouseDown={(e) => {
                e.preventDefault();
                resizingRef.current = 'left';
                resizeStartRef.current = { x: e.clientX, y: 0, size: leftPct };
                document.body.style.cursor = 'col-resize';
                document.body.style.userSelect = 'none';
              }}
            >
              <div className="absolute inset-y-0 -left-1 -right-1" />
            </div>
          )}
          <div
            className={`flex-1 min-w-0 min-h-0 relative ${isMobile ? (mobilePanel === 'player' ? '' : '!hidden') : ''}`}
            onPointerDownCapture={() => setActiveSection('viewer')}
          >
            {!isMobile && <SectionBorder active={activeSection === 'viewer'} />}
          <Player
            videoUrl={currentVideoUrl}
            currentTime={isPlaying ? playbackTime : currentTime}
            hoverTime={isPlaying || hoverSuppressed ? null : hoverTime}
            selectedClipIds={selectedClipIds}
            clips={clips}
            isPlaying={isPlaying}
            onPlayingChange={handlePlayingChange}
            onTimeUpdate={handlePlaybackTimeUpdate}
            onSeek={handleSeek}
            onClipSelect={handleClipSelect}
            onClipDelete={handleClipDelete}
            onClipUpdate={handleClipUpdate}
            videoRefCallback={(ref) => { videoRef.current = ref; }}
            onPresetDrop={handlePresetDrop}
            onFileDrop={handlePlayerFileDrop}
            onLibraryItemDrop={(libId: string) => {
              const insertAt = clipsRef.current
                .filter(c => c.trackIndex === 1)
                .reduce((maxEnd, c) => Math.max(maxEnd, c.startTime + c.duration), 0);
              handleClipAdd(null, 1, insertAt, libId);
            }}
            isDraggingPlayhead={isDraggingPlayhead}
            viewerZoom={viewerZoom}
            onViewerZoomChange={setViewerZoom}
            playbackQuality={playbackQuality}
            onPlaybackQualityChange={setPlaybackQuality}
            canvasAspectRatio={canvasAspectRatio}
            onAspectRatioChange={setCanvasAspectRatio}
            onInteractionStart={handleInteractionStart}
            onInteractionEnd={handleInteractionEnd}
          />
          </div>
          {/* Right Divider */}
          {!isMobile && (
            <div
              className="w-1 bg-border-color hover:bg-[#00D4D4] cursor-col-resize shrink-0 transition-colors z-30 group relative"
              onMouseDown={(e) => {
                e.preventDefault();
                resizingRef.current = 'right';
                resizeStartRef.current = { x: e.clientX, y: 0, size: rightPct };
                document.body.style.cursor = 'col-resize';
                document.body.style.userSelect = 'none';
              }}
            >
              <div className="absolute inset-y-0 -left-1 -right-1" />
            </div>
          )}
          {/* Right Sidebar */}
          <div
            style={isMobile ? undefined : { width: `${rightPct}%`, minWidth: 160 }}
            className={`shrink-0 relative overflow-hidden ${isMobile ? (mobilePanel === 'inspector' ? 'flex-1' : 'hidden') : ''}`}
            onPointerDownCapture={() => setActiveSection('inspector')}
          >
            {!isMobile && <SectionBorder active={activeSection === 'inspector'} />}
            <RightSidebar
              transcripts={transcripts}
              subtitles={subtitles}
              currentTime={currentTime}
              selectedClip={selectedClipIds.length === 1 ? selectedClip : null}
              selectedClipIds={selectedClipIds}
              videoFile={currentVideoFile}
              videoDuration={activeFileDuration}
              clips={clips}
              onTranscriptsUpdate={handleTranscriptsUpdate}
              onSubtitlesUpdate={handleSubtitlesUpdate}
              onSeek={handleSeek}
              onClipUpdate={handleClipUpdate}
              onClipsBatchUpdate={handleClipsBatchUpdate}
              onAddSubtitleClips={handleAddSubtitleClips}
              onAddTextClip={handleAddTextClip}
              onExport={handleExportClick}
              onResetViewerZoom={() => setViewerZoom(100)}
            />
          </div>
        </div>
        {/* Timeline Divider (horizontal) — 모바일에서 숨김 */}
        {!isMobile && (
          <div
            className="h-1 bg-border-color hover:bg-[#00D4D4] cursor-row-resize shrink-0 transition-colors z-30 group relative"
            onMouseDown={(e) => {
              e.preventDefault();
              resizingRef.current = 'timeline';
              resizeStartRef.current = { x: 0, y: e.clientY, size: timelinePct };
              document.body.style.cursor = 'row-resize';
              document.body.style.userSelect = 'none';
            }}
          >
            <div className="absolute inset-x-0 -top-1 -bottom-1" />
          </div>
        )}
        <div
          style={isMobile ? (mobilePanel === 'timeline' ? { flex: '1 1 0' } : { display: 'none' }) : { flex: `0 0 ${timelinePct}%`, minHeight: 120 }}
          className="relative flex flex-col"
          onPointerDownCapture={() => setActiveSection('timeline')}
        >
          <SectionBorder active={activeSection === 'timeline'} />
          <Timeline
            clips={clips}
            playheadPosition={currentTime}
            playbackPosition={playbackTime}
            isPlaying={isPlaying}
            currentTool={currentTool}
            onToolChange={setCurrentTool}
            selectedClipIds={selectedClipIds}
            zoom={timelineZoom}
            onZoomChange={setTimelineZoom}
            snapEnabled={snapEnabled}
            onSnapToggle={() => setSnapEnabled(prev => !prev)}
            onPlayheadChange={handlePlayheadChange}
            onPlayheadDragChange={setIsDraggingPlayhead}
            onHoverTimeChange={setHoverTimeSynced}
            onClipAdd={handleClipAdd}
            onFilesAdd={handleFilesDropToTimeline}
            onClipUpdate={handleClipUpdate}
            onClipSelect={handleClipSelect}
            onClipDelete={handleClipDelete}
            onSplit={handleSplit}
            onAutoSplit={handleAutoSplit}
            onSceneSplit={handleSceneSplit}
            onAutoColorCorrection={handleAutoColorCorrection}
            onUndo={handleUndo}
            onRedo={handleRedo}
            onSpeedChange={handleSpeedChange}
            onFitToScreen={handleFitToScreen}
            onTrimLeft={handleTrimLeft}
            onTrimRight={handleTrimRight}
            rippleMode={rippleMode}
            onRippleToggle={() => {
              setRippleMode(prev => {
                const next = !prev;
                if (next) {
                  // 켜질 때 즉시 갭 제거
                  setClips(p => rippleCloseGaps(p));
                }
                return next;
              });
            }}
            onResizeEnd={handleResizeEnd}
            onInteractionStart={handleInteractionStart}
            onInteractionEnd={handleInteractionEnd}
            onSubtitleAdd={handleSubtitleAdd}
            isTimelineHovered={isTimelineHovered}
            onHoverChange={setIsTimelineHovered}
            trackHeightScale={timelineHeightScale}
            onTrackHeightScaleChange={setTimelineHeightScale}
          />
        </div>
      </div>
      {/* 클립 교체 확인 모달 */}
      {replaceConfirm && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-black/60">
          <div className="bg-panel-bg border border-border-color rounded-xl p-6 max-w-sm w-full mx-4 shadow-2xl">
            <h3 className="text-sm font-semibold text-white mb-2">클립 교체</h3>
            <p className="text-xs text-gray-400 mb-5">
              해당 위치에 이미 클립이 있습니다. 기존 클립을 삭제하고 새 클립으로 교체하시겠습니까?
            </p>
            <div className="flex gap-2 justify-end">
              <button
                className="px-4 py-1.5 text-xs rounded-lg border border-border-color text-gray-300 hover:bg-white/5 transition-colors"
                onClick={() => setReplaceConfirm(null)}
              >
                취소
              </button>
              <button
                className="px-4 py-1.5 text-xs rounded-lg bg-primary hover:bg-primary/80 text-black font-medium transition-colors"
                onClick={() => {
                  const { overlappingClipIds, pendingArgs } = replaceConfirm;
                  setClipsSynced(prev => prev.filter(c => !overlappingClipIds.includes(c.id)));
                  setReplaceConfirm(null);
                  handleClipAdd(pendingArgs[0], pendingArgs[1], pendingArgs[2], pendingArgs[3], true);
                }}
              >
                교체
              </button>
            </div>
          </div>
        </div>
      )}
    </ShortcutsProvider>
  );
}
