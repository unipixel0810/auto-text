'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import Header from '@/components/layout/Header';
import SecondaryToolbar from '@/components/layout/SecondaryToolbar';
import LeftSidebar from '@/components/layout/LeftSidebar';
import Player from '@/components/layout/Player';
import RightSidebar from '@/components/layout/RightSidebar';
import Timeline from '@/components/layout/Timeline';
import { parseSubtitleFile } from '@/lib/subtitleParser';
import type { TranscriptItem, SubtitleItem } from '@/types/subtitle';
import type { VideoClip, HistoryEntry, ClipboardData, LibraryItem } from '@/types/video';
import type { SubtitlePreset } from '@/lib/subtitlePresets';
import { ShortcutsProvider, KeyboardShortcutsModal } from '@/components/shortcuts/KeyboardShortcuts';
import {
  saveProject, getProject, getCurrentProjectId, setCurrentProjectId,
  generateProjectId, type SavedProject
} from '@/lib/projectStorage';
import { useAuth } from '@/components/auth/AuthProvider';
import { initEditingTracker, stopEditingTracker, trackEditingAction } from '@/lib/analytics/editingTracker';

const FRAME_DURATION = 1 / 30;
const MIN_ZOOM = 0.001;  // Shift+Z로 1시간 이상 영상도 한 화면에 표시 가능
const MAX_ZOOM = 5;
const ZOOM_STEP = 1.25;

export default function Home() {
  const { isAuthenticated, signIn } = useAuth();

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
  const [importToast, setImportToast] = useState<string | null>(null);
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
  const [currentTool, setCurrentTool] = useState<'selection' | 'blade'>('selection');
  // Resizable panels — percentage-based for true responsiveness
  const [leftPct, setLeftPct] = useState(18);   // % of window width
  const [rightPct, setRightPct] = useState(18); // % of window width
  const [timelinePct, setTimelinePct] = useState(35); // % of window height
  const [viewerZoom, setViewerZoom] = useState(100);
  const [playbackQuality, setPlaybackQuality] = useState<'auto' | 'high' | 'medium' | 'low'>('auto');
  const [canvasAspectRatio, setCanvasAspectRatio] = useState<'16:9' | '9:16' | '1:1' | '3:4'>('16:9');
  const [activeSection, setActiveSection] = useState<'library' | 'viewer' | 'inspector' | 'timeline'>('viewer');

  // Active section border overlay component
  const SectionBorder = ({ active }: { active: boolean }) => active ? (
    <div className="absolute inset-0 pointer-events-none z-50" style={{ border: '2px solid #00D4D4', borderRadius: 2 }} />
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
  const selectedClipIdsRef = useRef(selectedClipIds);
  const currentTimeRef = useRef(currentTime);
  const clipboardRef = useRef(clipboard);
  const isPlayingRef = useRef(isPlaying);
  const playbackTimeRef = useRef(playbackTime);
  const isTimelineHoveredRef = useRef(isTimelineHovered);
  const rippleModeRef = useRef(rippleMode);
  const currentToolRef = useRef(currentTool);
  const historyRef = useRef(history);
  const historyIndexRef = useRef(historyIndex);

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

  // Keep ALL refs in sync — catches mutations from non-synced setters (Timeline, Player, etc.)
  useEffect(() => { clipsRef.current = clips; }, [clips]);
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);
  useEffect(() => { selectedClipIdsRef.current = selectedClipIds; }, [selectedClipIds]);
  useEffect(() => { clipboardRef.current = clipboard; }, [clipboard]);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);
  useEffect(() => { playbackTimeRef.current = playbackTime; }, [playbackTime]);

  // ===== onPause 이벤트 =====
  // 비디오가 멈추면:
  //  1) 파란 선(currentTime)을 멈춘 위치로 이동
  //  2) playbackTime도 같은 위치로 맞춤 → 다음 재생 시 흰색 선이 정확한 위치에서 출발
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    const handlePause = () => {
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

      // 멈춘 타임라인 시간 계산
      let stoppedAt: number;
      if (activeClip) {
        const mediaOffset = activeClip.trimStart ?? 0;
        stoppedAt = activeClip.startTime + (currentVideoTime - mediaOffset);
      } else {
        // 비디오 트랙 없거나 범위 밖 → rAF 루프가 마지막으로 기록한 위치
        stoppedAt = playbackTimeRef.current;
      }

      // ① 파란 선을 멈춘 위치로 (사용자가 편집을 시작할 기준점)
      setCurrentTime(stoppedAt);
      currentTimeRef.current = stoppedAt;
      // ② playbackTime도 동기화 (흰색 선이 숨겨진 상태에서 위치 유지 → 다음 재생 정확한 시작)
      setPlaybackTime(stoppedAt);
      playbackTimeRef.current = stoppedAt;
    };
    video.addEventListener('pause', handlePause);
    return () => video.removeEventListener('pause', handlePause);
  }, [clips]);

  // ===== rAF loop: smooth 60fps white playback line + end-of-timeline stop =====
  useEffect(() => {
    if (!isPlaying) return;
    let rafId: number;
    const isVideoTrack = (ti: number) => ti === 1 || (ti >= 10 && ti <= 14);
    const isImageFile = (c: { url?: string; name?: string }) =>
      (c.url && /\.(jpg|jpeg|png|gif|webp|svg)/i.test(c.url)) ||
      (c.name && /\.(jpg|jpeg|png|gif|webp|svg)/i.test(c.name));

    const tick = () => {
      const video = videoRef.current;
      const allClips = clipsRef.current;

      // ─── 타임라인 끝 감지: 재생 가능한 비디오 클립이 없거나 video.ended면 정지 ───
      const videoClips = allClips.filter(c => isVideoTrack(c.trackIndex) && !isImageFile(c) && c.url);
      if (videoClips.length === 0 || (video && video.ended)) {
        setIsPlaying(false);
        rafId = requestAnimationFrame(tick); // 한 프레임 더 돌려서 정리 후 종료
        cancelAnimationFrame(rafId);
        return;
      }

      // 타임라인의 전체 끝 시간
      const timelineEnd = Math.max(...allClips.map(c => c.startTime + c.duration));

      if (video && !video.paused) {
        const videoTime = video.currentTime;

        // video.currentTime(미디어 좌표)으로 직접 클립을 검색 — stale ref 문제 완전 회피
        const activeClip = allClips.find(c => {
          if (!isVideoTrack(c.trackIndex)) return false;
          if (isImageFile(c)) return false;
          const mediaStart = c.trimStart ?? 0;
          const mediaEnd = mediaStart + c.duration;
          return videoTime >= mediaStart - 0.1 && videoTime <= mediaEnd + 0.1;
        });

        if (activeClip) {
          const mediaOffset = activeClip.trimStart ?? 0;
          const timelineTime = activeClip.startTime + (videoTime - mediaOffset);
          setPlaybackTime(timelineTime);
          playbackTimeRef.current = timelineTime;

          // ─── 타임라인 끝 도달 시 자동 정지 ───
          if (timelineTime >= timelineEnd - 0.05) {
            setIsPlaying(false);
            setCurrentTime(timelineEnd);
            currentTimeRef.current = timelineEnd;
            return; // rafId 등록 없이 종료
          }
        }
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
  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize project ID
  useEffect(() => {
    const savedId = getCurrentProjectId();
    if (savedId) {
      setProjectId(savedId);
      // Restore project data
      const project = getProject(savedId);
      if (project) {
        setActiveFileName(project.name);
        if (project.transcripts.length > 0) setTranscripts(project.transcripts);
        if (project.subtitles.length > 0) setSubtitles(project.subtitles);
      }
    } else {
      const newId = generateProjectId();
      setProjectId(newId);
      setCurrentProjectId(newId);
    }
  }, []);

  // Auto-save project every 5 seconds
  useEffect(() => {
    if (!projectId) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
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
      };
      saveProject(project);
    }, 5000);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [projectId, activeFileName, activeFileDuration, transcripts, subtitles, clips]);

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


  const handleClipAdd = useCallback((file: File | null, trackIndex: number, startTime: number, libraryItemId?: string) => {
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
    } else if (file) {
      url = URL.createObjectURL(file);
      name = file.name;
      duration = 10;
      const isAudio = (file.type.startsWith('audio/') || file.name.endsWith('.m4a') || file.name.endsWith('.aac') || file.name.endsWith('.wav'));
      const isImage = file.type.startsWith('image/');
      type = isImage ? 'image' : isAudio ? 'audio' : 'video';
    } else {
      return;
    }

    // Track logic:
    // Main track (trackIndex 1) is the default for ALL media types (video, audio, image).
    // Only subtitle tracks (0, 5-8) are strictly respected.
    // If main track is occupied at that time, fall back to the drop target or overlay.
    let finalTrackIndex = trackIndex;
    if (trackIndex === 0 || (trackIndex >= 5 && trackIndex <= 8)) {
      finalTrackIndex = trackIndex; // Subtitle tracks stay as-is
    } else if (trackIndex >= 10 && trackIndex <= 14) {
      // Explicitly dropped on overlay track — respect it
      finalTrackIndex = trackIndex;
    } else if (trackIndex >= 20 && trackIndex <= 22) {
      // Explicitly dropped on audio track — respect it
      finalTrackIndex = trackIndex;
    } else {
      // Dropped on main track (1) or unknown
      const hasClipInMainAtTime = clipsRef.current.some(c =>
        c.trackIndex === 1 &&
        ((startTime >= c.startTime && startTime < c.startTime + c.duration) ||
         (startTime + duration > c.startTime && startTime + duration <= c.startTime + c.duration))
      );

      if (!hasClipInMainAtTime) {
        finalTrackIndex = 1;
      } else {
        // Main occupied — auto-find next free track
        if (type === 'audio') {
          finalTrackIndex = [20, 21, 22].find(ti =>
            !clipsRef.current.some(c => c.trackIndex === ti &&
              startTime < c.startTime + c.duration && startTime + duration > c.startTime)
          ) ?? 20;
        } else {
          finalTrackIndex = [10, 11, 12, 13, 14].find(ti =>
            !clipsRef.current.some(c => c.trackIndex === ti &&
              startTime < c.startTime + c.duration && startTime + duration > c.startTime)
          ) ?? 10;
        }
      }
    }

    // Helper: generate lightweight proxy thumbnails with async queue (non-blocking)
    // Phase 1: Extract 4 quick preview thumbnails immediately for instant visual feedback
    // Phase 2: Remaining thumbnails generated lazily via requestAnimationFrame yielding
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

    // Helper: extract lightweight waveform proxy (100 samples for timeline display only)
    const extractWaveform = (fileUrl: string, cid: string) => {
      const audioCtx = new AudioContext();
      fetch(fileUrl).then(r => r.arrayBuffer()).then(buf => audioCtx.decodeAudioData(buf)).then(audioBuf => {
        const raw = audioBuf.getChannelData(0);
        const samples = 100; // reduced from 200 — enough for timeline display
        const blockSize = Math.floor(raw.length / samples);
        const waveform: number[] = [];
        for (let s = 0; s < samples; s++) {
          let sum = 0;
          const start = s * blockSize;
          for (let j = 0; j < blockSize; j++) sum += Math.abs(raw[start + j]);
          waveform.push(sum / blockSize);
        }
        const max = Math.max(...waveform, 0.001);
        const normalized = waveform.map(v => v / max);
        setClips(prev => prev.map(c => c.id === cid ? { ...c, waveform: normalized } : c));
        audioCtx.close();
      }).catch(() => audioCtx.close());
    };

    if (type === 'image') {
      const img = new Image();
      img.src = url;
      img.onload = () => {
        // Main track (1): renderer uses object-contain in inset-0 div, scale 100 = full fit
        // Overlay tracks (10+): renderer sizes to 50% of contain-fit, so scale 200 = full height
        const initialScale = finalTrackIndex === 1 ? 100 : 200;
        setClips(prev => [...prev, {
          id: clipId, name, url, startTime, duration, originalDuration: duration,
          trackIndex: finalTrackIndex, scale: initialScale, positionX: 0, positionY: 0, rotation: 0, opacity: 100, blendMode: false, speed: 1, linked: true,
          mediaWidth: img.naturalWidth, mediaHeight: img.naturalHeight,
        }]);
      };
      img.onerror = () => {
        setClips(prev => [...prev, {
          id: clipId, name, url, startTime, duration, originalDuration: duration,
          trackIndex: finalTrackIndex, scale: 100, positionX: 0, positionY: 0, rotation: 0, opacity: 100, blendMode: false, speed: 1, linked: true,
        }]);
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
        // Main track: object-contain handles fitting, scale 100 = full fit
        // Overlay tracks: renderer sizes to 50% of contain-fit, scale 200 = full height
        const videoInitScale = finalTrackIndex === 1 ? 100 : 200;
        setClips(prev => [...prev, {
          id: clipId, name, url, startTime, duration: dur, originalDuration: dur,
          trackIndex: finalTrackIndex, scale: videoInitScale, positionX: 0, positionY: 0, rotation: 0, opacity: 100, blendMode: false, speed: 1, linked: true, volume: 100,
          mediaWidth: vw, mediaHeight: vh,
        }]);
        if (type === 'video' && !currentVideoUrl) {
          setCurrentVideoUrl(url);
          setActiveFileName(name);
          setActiveFileDuration(dur);
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
        setClips(prev => [...prev, {
          id: clipId, name, url, startTime, duration, originalDuration: duration,
          trackIndex: finalTrackIndex, scale: 100, positionX: 0, positionY: 0, rotation: 0, opacity: 100, blendMode: false, speed: 1, linked: true,
        }]);
      };
    }
  }, [libraryItems, currentVideoUrl]);

  // Video add handler (now adds to Media Library)
  const handleVideoAdd = useCallback((file: File): string => {
    const id = genId();
    const url = URL.createObjectURL(file);
    const isAudio = (file.type.startsWith('audio/') || file.name.endsWith('.m4a') || file.name.endsWith('.aac') || file.name.endsWith('.wav'));
    const isImage = file.type.startsWith('image/');
    const type = isImage ? 'image' : isAudio ? 'audio' : 'video';

    const item: LibraryItem = {
      id,
      name: file.name,
      url,
      type,
      duration: isImage ? 10 : 0,
      file,
    };

    if (type !== 'image') {
      const tempVideo = document.createElement('video');
      tempVideo.preload = 'metadata';
      tempVideo.src = url;
      tempVideo.onloadedmetadata = () => {
        setLibraryItems(prev => prev.map(i => i.id === id ? { ...i, duration: tempVideo.duration } : i));
        if (type === 'video' && !currentVideoUrl) {
          setCurrentVideoUrl(url);
          setCurrentVideoFile(file);
          setActiveFileName(file.name);
          setActiveFileDuration(tempVideo.duration);
        }
      };
    }

    setLibraryItems(prev => [...prev, item]);
    setTranscripts([]);
    setSubtitles([]);

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
    // 현재 main 트랙 끝 시간 (1회 스냅샷)
    let insertAt = clipsRef.current
      .filter(c => c.trackIndex === 1)
      .reduce((maxEnd, c) => Math.max(maxEnd, c.startTime + c.duration), 0);

    for (const file of files) {
      const isImage = file.type.startsWith('image/');

      // duration을 먼저 읽기 (handleVideoAdd의 비동기 onloadedmetadata 대기)
      const duration = isImage ? 10 : await new Promise<number>(resolve => {
        const el = document.createElement('video');
        el.preload = 'metadata';
        el.src = URL.createObjectURL(file);
        el.onloadedmetadata = () => { resolve(el.duration || 10); el.src = ''; };
        el.onerror = () => resolve(10);
      });

      // 1. 라이브러리 추가 + currentVideoUrl 등 상태 세팅
      handleVideoAdd(file);

      // 2. clipsRef 기반이 아닌 직접 계산한 insertAt으로 클립 배치 (겹침 방지)
      const capturedInsertAt = insertAt;
      setTimeout(() => {
        handleClipAdd(file, 1, capturedInsertAt);
      }, 50);

      insertAt += duration;
    }

    setImportToast(`${files.length}개 파일 타임라인에 추가됨`);
    setTimeout(() => setImportToast(null), 3000);
  }, [handleVideoAdd, handleClipAdd]);

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
    // Also sync playback to the new edit position when not playing
    if (!isPlayingRef.current) setPlaybackTime(position);
  }, []);
  const handleSeek = useCallback((time: number) => {
    setCurrentTime(time);
    if (!isPlayingRef.current) setPlaybackTime(time);
  }, []);
  // Player reports actual video time during playback → update white playback line only
  const handlePlaybackTimeUpdate = useCallback((time: number) => {
    setPlaybackTime(time);
  }, []);
  const handleClipSelect = useCallback((clipIds: string[]) => {
    setSelectedClipIds(clipIds);
  }, []);

  const handleLibraryDelete = useCallback((ids: string[]) => {
    setLibraryItems(prev => prev.filter(item => !ids.includes(item.id)));
    setSelectedLibraryIds([]);
  }, []);

  // Close gaps on main track: sort by startTime, shift each to end of previous
  const rippleCloseGaps = useCallback((clips: VideoClip[]): VideoClip[] => {
    const mainClips = clips.filter(c => c.trackIndex === 1).sort((a, b) => a.startTime - b.startTime);
    const others = clips.filter(c => c.trackIndex !== 1);
    let cursor = 0;
    const adjusted = mainClips.map(c => {
      const updated = { ...c, startTime: cursor };
      cursor += c.duration;
      return updated;
    });
    return [...others, ...adjusted];
  }, []);

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
    if (!clip) return; // 이미 삭제됐거나 없는 클립 → 무동작 (이게 "그대로야" 버그의 핵심 방어선)

    trackEditingAction('clip_delete', {
      targetTrack: clip.trackIndex,
      clipDuration: clip.duration,
      clipCount: clipsRef.current.length - 1,
    });

    setClipsSynced(prev => {
      let updated = prev.filter(c => c.id !== clipId);

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

  // Add subtitle clips to timeline from parsed SRT/ASS or AI results
  const handleAddSubtitleClips = useCallback((items: TranscriptItem[], trackIndex: number = 0, replaceTrack: boolean = false) => {
    // Sort items by startTime to ensure orderly placement
    const sortedItems = [...items].sort((a, b) => a.startTime - b.startTime);

    // ── 대본(0) / AI자막(5~8) 균등 분포 로직 ──────────────────────────────
    // 같은 트랙 내에서 겹침 방지 + 너무 긴 공백(>5s)이 있으면 자막을 당겨서 분산
    let lastEndTime = 0;
    const GAP_THRESHOLD = 5; // 5초 이상 빈 구간은 자막을 앞으로 당김
    const MIN_GAP = 0.1;     // 자막 사이 최소 간격

    const newClips: VideoClip[] = sortedItems.map((item) => {
      let startTime = item.startTime;
      let duration = Math.max(0.5, item.endTime - item.startTime);

      // 1) 이전 자막과 겹치면 밀어냄
      if (startTime < lastEndTime + MIN_GAP) {
        startTime = lastEndTime + MIN_GAP;
      }

      // 2) 너무 큰 공백(GAP_THRESHOLD 초 이상)이 생기면 원래 시간 유지
      //    (AI 자막은 의도적으로 빈 공간을 채우므로 당기지 않음)
      // → 대본(trackIndex=0)은 STT 타임코드를 최대한 존중

      // 3) 최대 지속 시간 cap: 6초 (너무 긴 자막은 읽기 어려움)
      if (duration > 6) duration = 6;

      const clip: VideoClip = {
        id: genId(),
        name: item.editedText || item.originalText,
        url: '', // Text clips have no URL
        startTime: startTime,
        duration: duration,
        trackIndex: trackIndex, // 0: 대본, 5~8: AI자막
        scale: 100, positionX: 0, positionY: 0, rotation: 0, opacity: 100, blendMode: false, speed: 1, linked: false,
        fontFamily: 'PaperlogyExtraBold, sans-serif', fontSize: 47,
        color: item.color || '#FFFFFF', strokeColor: item.strokeColor || '#000000', strokeWidth: 2, fontWeight: 800, shadowColor: 'rgba(0,0,0,0.8)', shadowBlur: 4, shadowOffsetX: 2, shadowOffsetY: 2,
      };

      lastEndTime = startTime + duration;
      return clip;
    });

    if (replaceTrack) {
      // Remove all existing clips on this track, then add new ones
      setClips(prev => [...prev.filter(c => c.trackIndex !== trackIndex), ...newClips]);
    } else {
      setClips(prev => [...prev, ...newClips]);
    }
  }, []);

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
    const selId = selectedClipIdsRef.current[0];
    if (!selId) return;
    setClips(prev => prev.map(c => c.id === selId ? { ...c, disabled: !c.disabled } : c));
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

      // --- FIT TIMELINE TO SCREEN (Shift+Z — 최우선 체크, Final Cut Pro style) ---
      if (e.shiftKey && !cmd && !e.altKey && e.key.toLowerCase() === 'z' && !isTyping) {
        e.preventDefault();
        handleFitToScreen();
        return;
      }

      // --- TIMELINE ZOOM (always, Cmd+= / Cmd+- / Cmd+Shift+F) ---
      if (cmd && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        setTimelineZoom(prev => Math.min(MAX_ZOOM, prev * ZOOM_STEP));
        return;
      }
      if (cmd && e.key === '-' && !shift) {
        e.preventDefault();
        setTimelineZoom(prev => Math.max(MIN_ZOOM, prev / ZOOM_STEP));
        return;
      }
      if (cmd && shift && e.code === 'KeyF') {
        e.preventDefault();
        handleFitToScreen();
        return;
      }

      // --- UNDO / REDO (always, even in inputs for consistency) ---
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

      // --- VIEWER ZOOM (Alt+= / Alt+- — also match Mac special chars ≠/–) ---
      if (e.altKey && !cmd && (e.key === '=' || e.key === '+' || e.key === '≠' || e.code === 'Equal')) {
        e.preventDefault();
        setViewerZoom(prev => Math.min(200, prev + 25));
        return;
      }
      if (e.altKey && !cmd && (e.key === '-' || e.key === '–' || e.code === 'Minus')) {
        e.preventDefault();
        setViewerZoom(prev => Math.max(25, prev - 25));
        return;
      }

      // Skip remaining shortcuts when typing
      if (isTyping) return;

      // --- PLAYBACK ---
      if (e.code === 'Space' && !cmd) {
        e.preventDefault();
        setIsPlaying(prev => {
          if (!prev) {
            // Starting playback: sync white line to blue line position
            setPlaybackTime(currentTimeRef.current);
            playbackTimeRef.current = currentTimeRef.current;
          } else {
            // Stopping playback: 멈춘 위치를 새 편집 기준점(파란 선)으로 즉시 동기화
            // React 배치 덕분에 isPlaying=false와 currentTime 업데이트가 같은 렌더에 반영됨
            const stoppedAt = playbackTimeRef.current;
            setCurrentTime(stoppedAt);
            currentTimeRef.current = stoppedAt;
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

      // --- SELECT ALL ---
      if (cmd && e.code === 'KeyA') {
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
      return prev.map(c => {
        if (!isSubTrack(c.trackIndex)) return c;
        const cEnd = c.startTime + c.duration;
        // Subtitle fully before trim point → remove
        if (cEnd <= trimTime) return c; // keep — it's outside the clip range
        // Subtitle starts before trim point but extends past → trim its start
        if (c.startTime < trimTime && cEnd > trimTime) {
          return { ...c, startTime: trimTime, duration: cEnd - trimTime };
        }
        return c;
      });
    }

    function syncSubtitlesForTrimRight(prev: typeof clips, trimTime: number, parentTrack: number) {
      if (isSubTrack(parentTrack)) return prev;
      return prev.map(c => {
        if (!isSubTrack(c.trackIndex)) return c;
        // Subtitle extends past trim point → trim its end
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

    // Q: trim left — targetTime 앞부분 날리기 (startTime → targetTime으로 이동)
    // 우선순위: 오렌지 호버선(마우스 위치) > 파란 플레이헤드(편집 기준점)
    function trimLeft() {
      const targetTime = getCutTime();

      setClipsSynced(prev => {
        // ① 선택된 클립이 있고 targetTime이 그 안에 있으면 우선 사용
        // ② 아니면 targetTime이 내부를 지나는 클립을 찾기
        const selId = selectedClipIdsRef.current[0];
        const selClip = selId ? prev.find(c => c.id === selId) : null;
        const clip = (selClip && selClip.startTime < targetTime && targetTime < selClip.startTime + selClip.duration)
          ? selClip
          : prev.find(c => c.startTime < targetTime && targetTime < c.startTime + c.duration);
        if (!clip) return prev;

        const clipEnd = clip.startTime + clip.duration;
        const speed = clip.speed ?? 1;
        const cutAmount = targetTime - clip.startTime;

        // ⭐ 새 mediaOffset = 기존 mediaOffset + (잘린 양 × speed)
        let trimmed = prev.map(c => c.id === clip.id ? {
          ...c,
          startTime: targetTime,
          duration: clipEnd - targetTime,
          trimStart: (c.trimStart ?? 0) + (cutAmount * speed),
        } : c);

        trimmed = syncSubtitlesForTrimLeft(trimmed, targetTime, clip.trackIndex);
        return rippleModeRef.current ? rippleCloseGaps(trimmed) : trimmed;
      });
    }

    // W: trim right — targetTime 뒷부분 날리기 (endTime → targetTime으로 축소)
    // 우선순위: 오렌지 호버선(마우스 위치) > 파란 플레이헤드(편집 기준점)
    function trimRight() {
      const targetTime = getCutTime();

      setClipsSynced(prev => {
        const selId = selectedClipIdsRef.current[0];
        const selClip = selId ? prev.find(c => c.id === selId) : null;
        const clip = (selClip && selClip.startTime < targetTime && targetTime < selClip.startTime + selClip.duration)
          ? selClip
          : prev.find(c => c.startTime < targetTime && targetTime < c.startTime + c.duration);
        if (!clip) return prev;

        // mediaOffset은 변경 불필요 — 앞부분은 그대로, 뒤만 잘림
        let trimmed = prev.map(c => c.id === clip.id ? {
          ...c,
          duration: targetTime - clip.startTime,
        } : c);

        trimmed = syncSubtitlesForTrimRight(trimmed, targetTime, clip.trackIndex);
        return rippleModeRef.current ? rippleCloseGaps(trimmed) : trimmed;
      });
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
    if (selectedClip) { handleClipUpdate(selectedClip.id, { autoColorCorrection: true }); alert('자동 색상 보정 적용'); }
    else alert('영상을 선택해주세요.');
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

  // Import trigger via file input
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
  const importFile = useCallback((file: File) => {
    const fileName = file.name.toLowerCase();
    if (fileName.endsWith('.srt') || fileName.endsWith('.ass') || fileName.endsWith('.ssa')) {
      handleSubtitleImport(file);
      setImportToast('자막 파일이 추가되었습니다 ✓');
    } else if (file.type.startsWith('video/') || file.type.startsWith('audio/') || file.type.startsWith('image/')) {
      handleVideoAdd(file);
      setImportToast('파일이 추가되었습니다 ✓');
    } else {
      setImportToast('지원하지 않는 파일 형식입니다');
    }
    setTimeout(() => setImportToast(null), 2500);
  }, [handleVideoAdd, handleSubtitleImport]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files) {
      Array.from(files).forEach(importFile);
    }
    e.target.value = '';
  }, [importFile]);

  const handleGlobalDragOver = useCallback((e: React.DragEvent) => {
    // 파일 드래그일 때만 브라우저 기본 동작 막기 (오버레이 없이 처리)
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
    }
  }, []);

  const handleGlobalDragLeave = useCallback((e: React.DragEvent) => {
    // 오버레이 없으므로 아무것도 하지 않음
  }, []);

  const handleGlobalDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
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

  // Close gaps on main track: sort by startTime, shift each to end of previous
  const handleTrimLeft = useCallback(() => {
    const t = hoverTimeRef.current ?? currentTimeRef.current;
    setClips(prev => {
      const selId = selectedClipIdsRef.current[0];
      const selClip = selId ? prev.find(c => c.id === selId) : null;
      const clip = (selClip && selClip.startTime < t && t < selClip.startTime + selClip.duration)
        ? selClip
        : prev.find(c => c.startTime < t && t < c.startTime + c.duration);
      if (!clip) return prev;
      const clipEnd = clip.startTime + clip.duration;
      const speed = clip.speed ?? 1;
      const cutAmount = t - clip.startTime;
      trackEditingAction('clip_trim_left', { targetTrack: clip.trackIndex, clipDuration: clip.duration, timelinePosition: t });
      const trimmed = prev.map(c => c.id === clip.id ? {
        ...c,
        startTime: t,
        duration: clipEnd - t,
        trimStart: (c.trimStart ?? 0) + (cutAmount * speed),
      } : c);
      return rippleModeRef.current ? rippleCloseGaps(trimmed) : trimmed;
    });
  }, [rippleCloseGaps]);

  const handleTrimRight = useCallback(() => {
    const t = hoverTimeRef.current ?? currentTimeRef.current;
    setClips(prev => {
      const selId = selectedClipIdsRef.current[0];
      const selClip = selId ? prev.find(c => c.id === selId) : null;
      const clip = (selClip && selClip.startTime < t && t < selClip.startTime + selClip.duration)
        ? selClip
        : prev.find(c => c.startTime < t && t < c.startTime + c.duration);
      if (!clip) return prev;
      trackEditingAction('clip_trim_right', { targetTrack: clip.trackIndex, clipDuration: clip.duration, timelinePosition: t });
      const trimmed = prev.map(c => c.id === clip.id ? {
        ...c,
        duration: t - clip.startTime,
      } : c);
      return rippleModeRef.current ? rippleCloseGaps(trimmed) : trimmed;
    });
  }, [rippleCloseGaps]);

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
        onDragLeave={handleGlobalDragLeave}
        onDrop={handleGlobalDrop}
      >
        {/* Hidden file input for import */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept="video/*,audio/*,image/*,.srt,.ass,.ssa,.m4a,.wav,.aac"
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
          onUndo={handleUndo}
          onRedo={handleRedo}
          onSplit={handleSplit}
          onDelete={handleDeleteMenu}
          onCopy={handleCopy}
          onPaste={handlePaste}
          onDuplicate={handleDuplicate}
          onSelectAll={handleSelectAllMenu}
          onExport={handleExportClick}
          onImport={handleImportClick}
          onFitToScreen={handleFitToScreen}
          onToggleSnap={() => setSnapEnabled(prev => !prev)}
          onOpenShortcuts={() => setShortcutsModalOpen(true)}
        />
        <SecondaryToolbar
          onTabChange={setActiveTab}
          onSoundEffect={handleSoundEffect}
          onSticker={handleSticker}
          onAutoColorCorrection={handleAutoColorCorrection}
          onAnimationEffect={handleAnimationEffect}
        />
        <div
          className="flex-1 flex overflow-hidden relative min-h-0"
          onClickCapture={handleInteractionGuard}
          onPointerDownCapture={handleInteractionGuard}
        >
          {/* Left Sidebar */}
          <div
            style={{ width: `${leftPct}%`, minWidth: 160 }}
            className="shrink-0 relative overflow-hidden"
            onMouseDown={() => setActiveSection('library')}
          >
            <SectionBorder active={activeSection === 'library'} />
            <LeftSidebar
              onVideoAdd={handleVideoAdd}
              onSubtitleImport={handleSubtitleImport}
              libraryItems={libraryItems}
              clips={clips}
              selectedLibraryIds={selectedLibraryIds}
              onLibrarySelect={setSelectedLibraryIds}
              onLibraryDelete={handleLibraryDelete}
            />
          </div>
          {/* Left Divider */}
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
          <div
            className="flex-1 min-w-0 min-h-0 relative"
            onMouseDown={() => setActiveSection('viewer')}
          >
            <SectionBorder active={activeSection === 'viewer'} />
          <Player
            videoUrl={currentVideoUrl}
            currentTime={isPlaying ? playbackTime : currentTime}
            hoverTime={hoverTime}
            selectedClipIds={selectedClipIds}
            clips={clips}
            isPlaying={isPlaying}
            onPlayingChange={setIsPlaying}
            onTimeUpdate={handlePlaybackTimeUpdate}
            onSeek={handleSeek}
            onClipSelect={handleClipSelect}
            onClipDelete={handleClipDelete}
            onClipUpdate={handleClipUpdate}
            videoRefCallback={(ref) => { videoRef.current = ref; }}
            onPresetDrop={handlePresetDrop}
            onFileDrop={handlePlayerFileDrop}
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
          {/* Right Sidebar */}
          <div
            style={{ width: `${rightPct}%`, minWidth: 160 }}
            className="shrink-0 relative overflow-hidden"
            onMouseDown={() => setActiveSection('inspector')}
          >
            <SectionBorder active={activeSection === 'inspector'} />
            <RightSidebar
              transcripts={transcripts}
              subtitles={subtitles}
              currentTime={currentTime}
              selectedClip={selectedClipIds.length === 1 ? selectedClip : null}
              selectedClipIds={selectedClipIds}
              videoFile={currentVideoFile}
              clips={clips}
              onTranscriptsUpdate={handleTranscriptsUpdate}
              onSubtitlesUpdate={handleSubtitlesUpdate}
              onSeek={handleSeek}
              onClipUpdate={handleClipUpdate}
              onClipsBatchUpdate={handleClipsBatchUpdate}
              onAddSubtitleClips={handleAddSubtitleClips}
              onAddTextClip={handleAddTextClip}
              onExport={handleExportClick}
            />
          </div>
        </div>
        {/* Timeline Divider (horizontal) */}
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
        <div
          style={{ flex: `0 0 ${timelinePct}%`, minHeight: 120 }}
          className="relative flex flex-col"
          onMouseDown={() => setActiveSection('timeline')}
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
            onHoverTimeChange={setHoverTimeSynced}
            onClipAdd={handleClipAdd}
            onClipUpdate={handleClipUpdate}
            onClipSelect={handleClipSelect}
            onClipDelete={handleClipDelete}
            onSplit={handleSplit}
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
          />
        </div>
      </div>
    </ShortcutsProvider>
  );
}
