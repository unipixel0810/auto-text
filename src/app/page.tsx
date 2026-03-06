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
import type { VideoClip, HistoryEntry, ClipboardData } from '@/types/video';
import type { SubtitlePreset } from '@/lib/subtitlePresets';
import { ShortcutsProvider, KeyboardShortcutsModal } from '@/components/shortcuts/KeyboardShortcuts';
import {
  saveProject, getProject, getCurrentProjectId, setCurrentProjectId,
  generateProjectId, type SavedProject
} from '@/lib/projectStorage';

const FRAME_DURATION = 1 / 30;
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 1.25;

export default function Home() {
  const [activeTab, setActiveTab] = useState<'media' | 'audio' | 'stickers' | 'effects' | 'transitions'>('media');
  const [transcripts, setTranscripts] = useState<TranscriptItem[]>([]);
  const [subtitles, setSubtitles] = useState<SubtitleItem[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [clips, setClips] = useState<VideoClip[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  const [currentVideoUrl, setCurrentVideoUrl] = useState<string | undefined>();
  const [currentVideoFile, setCurrentVideoFile] = useState<File | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [snapEnabled, setSnapEnabled] = useState(true);
  const [isTimelineHovered, setIsTimelineHovered] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [importToast, setImportToast] = useState<string | null>(null);
  const [shortcutsModalOpen, setShortcutsModalOpen] = useState(false);
  // Resizable panels
  const [leftWidth, setLeftWidth] = useState(280);
  const [rightWidth, setRightWidth] = useState(288);
  const [timelineHeight, setTimelineHeight] = useState(320);
  const [viewerZoom, setViewerZoom] = useState(100);
  const [playbackQuality, setPlaybackQuality] = useState<'auto' | 'high' | 'medium' | 'low'>('auto');
  const resizingRef = useRef<'left' | 'right' | 'timeline' | null>(null);
  const resizeStartRef = useRef({ x: 0, y: 0, size: 0 });
  const clipIdCounter = useRef(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Undo/Redo history
  const [history, setHistory] = useState<HistoryEntry[]>([{ clips: [], selectedClipId: null }]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const skipHistoryRef = useRef(false);

  // Clipboard
  const [clipboard, setClipboard] = useState<ClipboardData | null>(null);

  // Active file info for header
  const [activeFileName, setActiveFileName] = useState<string | undefined>();
  const [activeFileDuration, setActiveFileDuration] = useState<number | undefined>();

  const selectedClip = clips.find(c => c.id === selectedClipId) || null;

  // ===== REFS for stable access inside document-level keydown =====
  const clipsRef = useRef(clips);
  const selectedClipIdRef = useRef(selectedClipId);
  const currentTimeRef = useRef(currentTime);
  const clipboardRef = useRef(clipboard);
  const isPlayingRef = useRef(isPlaying);
  const isTimelineHoveredRef = useRef(isTimelineHovered);
  const historyRef = useRef(history);
  const historyIndexRef = useRef(historyIndex);

  useEffect(() => { clipsRef.current = clips; }, [clips]);
  useEffect(() => { selectedClipIdRef.current = selectedClipId; }, [selectedClipId]);
  useEffect(() => { currentTimeRef.current = currentTime; }, [currentTime]);
  useEffect(() => { clipboardRef.current = clipboard; }, [clipboard]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { isTimelineHoveredRef.current = isTimelineHovered; }, [isTimelineHovered]);
  useEffect(() => { historyRef.current = history; }, [history]);
  useEffect(() => { historyIndexRef.current = historyIndex; }, [historyIndex]);

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

  // ===== Resizable Panel Handler =====
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      if (resizingRef.current === 'left') {
        const delta = e.clientX - resizeStartRef.current.x;
        setLeftWidth(Math.max(180, Math.min(500, resizeStartRef.current.size + delta)));
      } else if (resizingRef.current === 'right') {
        const delta = resizeStartRef.current.x - e.clientX;
        setRightWidth(Math.max(200, Math.min(500, resizeStartRef.current.size + delta)));
      } else if (resizingRef.current === 'timeline') {
        const delta = resizeStartRef.current.y - e.clientY;
        setTimelineHeight(Math.max(120, Math.min(500, resizeStartRef.current.size + delta)));
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

  // Push to history
  const pushHistory = useCallback((newClips: VideoClip[], newSelectedId: string | null) => {
    if (skipHistoryRef.current) { skipHistoryRef.current = false; return; }
    setHistory(prev => {
      const trimmed = prev.slice(0, historyIndexRef.current + 1);
      return [...trimmed, { clips: newClips, selectedClipId: newSelectedId }];
    });
    setHistoryIndex(prev => prev + 1);
  }, []);

  // Track clips changes for history
  useEffect(() => {
    pushHistory(clips, selectedClipId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clips]);

  // Generate unique clip ID
  const genId = () => `clip_${Date.now()}_${clipIdCounter.current++}`;

  // ===== Undo =====
  const handleUndo = useCallback(() => {
    const idx = historyIndexRef.current;
    const hist = historyRef.current;
    if (idx <= 0) return;
    const newIndex = idx - 1;
    const entry = hist[newIndex];
    skipHistoryRef.current = true;
    setClips(entry.clips);
    setSelectedClipId(entry.selectedClipId);
    setHistoryIndex(newIndex);
  }, []);

  // ===== Redo =====
  const handleRedo = useCallback(() => {
    const idx = historyIndexRef.current;
    const hist = historyRef.current;
    if (idx >= hist.length - 1) return;
    const newIndex = idx + 1;
    const entry = hist[newIndex];
    skipHistoryRef.current = true;
    setClips(entry.clips);
    setSelectedClipId(entry.selectedClipId);
    setHistoryIndex(newIndex);
  }, []);

  // Video add handler
  const handleVideoAdd = useCallback((file: File) => {
    const clipId = genId();
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = url;
    video.onloadedmetadata = () => {
      const duration = video.duration;
      const isAudio = (file.type.startsWith('audio/') || file.name.endsWith('.m4a') || file.name.endsWith('.aac') || file.name.endsWith('.wav'));
      const isImage = file.type.startsWith('image/');
      const trackIndex = (file.type.startsWith('video/') || isImage) ? 1 : isAudio ? 20 : 0;

      setClips(prev => {
        const startTime = currentTimeRef.current;
        const finalDuration = isImage ? 10 : (duration || 10);
        const endTime = startTime + finalDuration;

        // Overwrite logic: filter/trim clips on the same track
        const remainingClips = prev.flatMap(c => {
          if (c.trackIndex !== trackIndex) return [c];

          const cEnd = c.startTime + c.duration;

          // Case 1: Existing clip is entirely within the new clip's range -> Remove
          if (c.startTime >= startTime && cEnd <= endTime) return [];

          // Case 2: New clip is entirely within the existing clip -> Split existing into two
          if (c.startTime < startTime && cEnd > endTime) {
            return [
              { ...c, duration: startTime - c.startTime },
              { ...c, id: genId(), startTime: endTime, duration: cEnd - endTime }
            ];
          }

          // Case 3: Existing clip overlaps from the start -> Trim end
          if (c.startTime < startTime && cEnd > startTime) {
            return [{ ...c, duration: startTime - c.startTime }];
          }

          // Case 4: Existing clip overlaps from the end -> Trim start
          if (c.startTime < endTime && cEnd > endTime) {
            return [{ ...c, startTime: endTime, duration: cEnd - endTime }];
          }

          return [c];
        });

        return [...remainingClips, {
          id: clipId, name: file.name, url, startTime, duration: finalDuration, originalDuration: finalDuration,
          trackIndex, scale: 100, positionX: 0, positionY: 0, rotation: 0, opacity: 100, blendMode: false, speed: 1, linked: true,
        }];
      });
      setSelectedClipId(clipId);
      if (file.type.startsWith('video/')) {
        setCurrentVideoUrl(url);
        setCurrentVideoFile(file);
        setActiveFileName(file.name);
        setActiveFileDuration(duration);
      }
    };
    video.onerror = () => {
      const trackIndex = file.type.startsWith('image/') ? 1 : 0;
      setClips(prev => [...prev, {
        id: clipId, name: file.name, url, startTime: 0, duration: 10, originalDuration: 10,
        trackIndex, scale: 100, positionX: 0, positionY: 0, rotation: 0, opacity: 100, blendMode: false, speed: 1, linked: true,
      }]);
    };
  }, []);

  const handleClipAdd = useCallback((file: File, trackIndex: number, startTime: number) => {
    const clipId = genId();
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = url;
    video.onloadedmetadata = () => {
      const dur = video.duration || 10;
      setClips(prev => [...prev, {
        id: clipId, name: file.name, url, startTime, duration: dur, originalDuration: dur,
        trackIndex, scale: 100, positionX: 0, positionY: 0, rotation: 0, opacity: 100, blendMode: false, speed: 1, linked: true,
      }]);
      if (file.type.startsWith('video/') && !currentVideoUrl) {
        setCurrentVideoUrl(url);
        setActiveFileName(file.name);
        setActiveFileDuration(video.duration);
      }
    };
    video.onerror = () => {
      // Index 1: Visual, Index 20+: Audio
      const isAudio = file.type.startsWith('audio/');
      const finalTrackIndex = trackIndex === 0 && isAudio ? 20 : trackIndex;
      setClips(prev => [...prev, {
        id: clipId, name: file.name, url, startTime, duration: 10, originalDuration: 10,
        trackIndex: finalTrackIndex, scale: 100, positionX: 0, positionY: 0, rotation: 0, opacity: 100, blendMode: false, speed: 1, linked: true,
      }]);
    };
  }, [currentVideoUrl]);

  const handleClipUpdate = useCallback((clipId: string, updates: Partial<VideoClip>) => {
    setClips(prev => prev.map(clip => clip.id === clipId ? { ...clip, ...updates } : clip));
  }, []);

  const handlePlayheadChange = useCallback((position: number) => setCurrentTime(position), []);
  const handleSeek = useCallback((time: number) => setCurrentTime(time), []);
  const handleClipSelect = useCallback((clipId: string | null) => {
    setSelectedClipId(clipId);
    if (clipId) {
      const clip = clipsRef.current.find(c => c.id === clipId);
      if (clip) {
        setActiveFileName(clip.name);
        setActiveFileDuration(clip.originalDuration ?? clip.duration);
      }
    }
  }, []);

  const handleClipDelete = useCallback((clipId: string) => {
    setClips(prev => {
      const updated = prev.filter(c => c.id !== clipId);
      const deleted = prev.find(c => c.id === clipId);
      if (deleted && deleted.url === currentVideoUrl) {
        const next = updated.find(c => c.trackIndex === 1 && c.url);
        setCurrentVideoUrl(next?.url);
      }
      return updated;
    });
    setSelectedClipId(null);
  }, [currentVideoUrl]);

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
    const selId = selectedClipIdRef.current;
    if (selId) handleClipUpdate(selId, { name: newName });
  }, [handleClipUpdate]);

  // Add subtitle clips to timeline from parsed SRT/ASS
  const handleAddSubtitleClips = useCallback((items: TranscriptItem[]) => {
    const newClips: VideoClip[] = items.map((item) => ({
      id: genId(),
      name: item.editedText || item.originalText,
      url: '',
      startTime: item.startTime,
      duration: item.endTime - item.startTime,
      trackIndex: 0,
      scale: 100, positionX: 0, positionY: 0, rotation: 0, opacity: 100, blendMode: false, speed: 1, linked: false,
    }));
    setClips(prev => [...prev, ...newClips]);
  }, []);

  // Handle SRT/ASS file import
  const handleSubtitleImport = useCallback(async (file: File) => {
    try {
      const parsed = await parseSubtitleFile(file);
      setTranscripts(prev => [...prev, ...parsed]);
      const newClips: VideoClip[] = parsed.map((item) => ({
        id: genId(),
        name: item.editedText || item.originalText,
        url: '',
        startTime: item.startTime,
        duration: item.endTime - item.startTime,
        trackIndex: 0,
        scale: 100, positionX: 0, positionY: 0, rotation: 0, opacity: 100, blendMode: false, speed: 1, linked: false,
      }));
      setClips(prev => [...prev, ...newClips]);
      setActiveFileName(file.name);
    } catch (err: any) {
      alert(`자막 파일 파싱 실패: ${err.message}`);
    }
  }, []);

  // Fit timeline to screen
  const handleFitToScreen = useCallback(() => {
    const allClips = clipsRef.current;
    const totalDuration = allClips.length > 0 ? Math.max(...allClips.map(c => c.startTime + c.duration)) : 60;
    const timelineEl = document.querySelector('footer');
    const width = timelineEl ? timelineEl.clientWidth - 96 : 800;
    const fitZoom = width / (totalDuration * 50);
    setTimelineZoom(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fitZoom)));
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
      if (cmd && shift && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        handleFitToScreen();
        return;
      }

      // --- UNDO / REDO (always, even in inputs for consistency) ---
      if (cmd && !shift && e.key === 'z') {
        e.preventDefault();
        handleUndo();
        return;
      }
      if (cmd && shift && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        handleRedo();
        return;
      }

      // --- FIT TIMELINE (Shift+Z, no cmd — CapCut style) ---
      if (shift && !cmd && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        handleFitToScreen();
        return;
      }

      // Skip remaining shortcuts when typing
      if (isTyping) return;

      // --- PLAYBACK ---
      if (e.code === 'Space' && !cmd) {
        e.preventDefault();
        setIsPlaying(prev => !prev);
        return;
      }

      // --- SPLIT ---
      if ((e.key === 'm' || e.key === 'M') && !cmd) {
        e.preventDefault();
        splitAtPlayhead();
        return;
      }
      if (cmd && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        splitAtPlayhead();
        return;
      }

      // --- DELETE ---
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        const selId = selectedClipIdRef.current;
        if (selId) {
          setClips(prev => prev.filter(c => c.id !== selId));
          setSelectedClipId(null);
        }
        return;
      }

      // --- COPY ---
      if (cmd && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault();
        const selId = selectedClipIdRef.current;
        const clip = clipsRef.current.find(c => c.id === selId);
        if (clip) setClipboard({ clip: { ...clip } });
        return;
      }

      // --- PASTE ---
      if (cmd && (e.key === 'v' || e.key === 'V')) {
        e.preventDefault();
        const cb = clipboardRef.current;
        if (!cb) return;
        const newId = genId();
        setClips(prev => {
          const sameTrack = prev.filter(c => c.trackIndex === cb.clip.trackIndex);
          const startTime = sameTrack.length > 0 ? Math.max(...sameTrack.map(c => c.startTime + c.duration)) : 0;
          return [...prev, { ...cb.clip, id: newId, startTime }];
        });
        setSelectedClipId(newId);
        return;
      }

      // --- DUPLICATE ---
      if (cmd && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        const selId = selectedClipIdRef.current;
        const clip = clipsRef.current.find(c => c.id === selId);
        if (!clip) return;
        const newId = genId();
        setClips(prev => [...prev, { ...clip, id: newId, startTime: clip.startTime + clip.duration }]);
        setSelectedClipId(newId);
        return;
      }

      // --- SELECT ALL ---
      if (cmd && (e.key === 'a' || e.key === 'A')) {
        e.preventDefault();
        const all = clipsRef.current;
        if (all.length > 0) setSelectedClipId(all[0].id);
        return;
      }

      // --- FRAME STEP ---
      if (e.key === '[') {
        e.preventDefault();
        setCurrentTime(prev => Math.max(0, prev - FRAME_DURATION));
        return;
      }
      if (e.key === ']') {
        e.preventDefault();
        setCurrentTime(prev => prev + FRAME_DURATION);
        return;
      }

      // --- TRIM LEFT (Q) ---
      if (e.key === 'q' || e.key === 'Q') {
        e.preventDefault();
        trimLeft();
        return;
      }

      // --- TRIM RIGHT (W) ---
      if (e.key === 'w' || e.key === 'W') {
        e.preventDefault();
        trimRight();
        return;
      }

      // --- ARROW KEYS: Nudge ---
      if (e.key === 'ArrowLeft' && !cmd) {
        e.preventDefault();
        nudge(-1, 0);
        return;
      }
      if (e.key === 'ArrowRight' && !cmd) {
        e.preventDefault();
        nudge(1, 0);
        return;
      }
      if (e.key === 'ArrowUp' && !cmd) {
        e.preventDefault();
        nudge(0, -1);
        return;
      }
      if (e.key === 'ArrowDown' && !cmd) {
        e.preventDefault();
        nudge(0, 1);
        return;
      }

      // --- ESCAPE ---
      if (e.key === 'Escape') {
        setSelectedClipId(null);
        return;
      }
    };

    // Helper functions that read from refs
    function splitAtPlayhead() {
      const selId = selectedClipIdRef.current;
      if (!selId) return;
      const clip = clipsRef.current.find(c => c.id === selId);
      if (!clip) return;
      const t = currentTimeRef.current;
      if (t <= clip.startTime || t >= clip.startTime + clip.duration) return;
      const firstDur = t - clip.startTime;
      const secondDur = clip.duration - firstDur;
      const secondId = `clip_${Date.now()}_${clipIdCounter.current++}`;
      setClips(prev => [
        ...prev.map(c => c.id === clip.id ? { ...c, duration: firstDur } : c),
        { ...clip, id: secondId, startTime: t, duration: secondDur },
      ]);
      setSelectedClipId(secondId);
    }

    function trimLeft() {
      const selId = selectedClipIdRef.current;
      const clip = clipsRef.current.find(c => c.id === selId);
      if (!clip) return;
      const t = currentTimeRef.current;
      const clipEnd = clip.startTime + clip.duration;
      if (t <= clip.startTime || t >= clipEnd) return;
      setClips(prev => prev.map(c => c.id === clip.id ? { ...c, startTime: t, duration: clipEnd - t } : c));
    }

    function trimRight() {
      const selId = selectedClipIdRef.current;
      const clip = clipsRef.current.find(c => c.id === selId);
      if (!clip) return;
      const t = currentTimeRef.current;
      if (t <= clip.startTime || t >= clip.startTime + clip.duration) return;
      setClips(prev => prev.map(c => c.id === clip.id ? { ...c, duration: t - clip.startTime } : c));
    }

    function nudge(dx: number, dy: number) {
      const selId = selectedClipIdRef.current;
      const clip = clipsRef.current.find(c => c.id === selId);
      if (!clip) return;
      setClips(prev => prev.map(c => c.id === clip.id ? {
        ...c,
        positionX: (c.positionX ?? 0) + dx,
        positionY: (c.positionY ?? 0) + dy,
      } : c));
    }

    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
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
    const selId = selectedClipIdRef.current;
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
    setSelectedClipId(newId);
  }, []);

  // Duplicate (from Header menu)
  const handleDuplicate = useCallback(() => {
    const selId = selectedClipIdRef.current;
    const clip = clipsRef.current.find(c => c.id === selId);
    if (!clip) { alert('클립을 선택해주세요.'); return; }
    const newId = genId();
    setClips(prev => [...prev, { ...clip, id: newId, startTime: clip.startTime + clip.duration }]);
    setSelectedClipId(newId);
  }, []);

  // Select All (from Header menu)
  const handleSelectAllMenu = useCallback(() => {
    const all = clipsRef.current;
    if (all.length > 0) setSelectedClipId(all[0].id);
    else alert('클립이 없습니다.');
  }, []);

  // Delete (from Header menu)
  const handleDeleteMenu = useCallback(() => {
    const selId = selectedClipIdRef.current;
    if (selId) {
      setClips(prev => prev.filter(c => c.id !== selId));
      setSelectedClipId(null);
    } else alert('클립을 선택해주세요.');
  }, []);

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
    }]);
    setSelectedClipId(clipId);
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
    e.preventDefault();
    if (e.dataTransfer.types.includes('Files')) {
      setIsDraggingFile(true);
    }
  }, []);

  const handleGlobalDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    // relatedTarget === null means cursor left the window
    if (!e.relatedTarget) {
      setIsDraggingFile(false);
    }
  }, []);

  const handleGlobalDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingFile(false);
    Array.from(e.dataTransfer.files).forEach(importFile);
  }, [importFile]);

  // Callbacks for Timeline toolbar buttons (used for split/trim from toolbar)
  const handleSplit = useCallback(() => {
    const selId = selectedClipIdRef.current;
    if (!selId) return;
    const clip = clipsRef.current.find(c => c.id === selId);
    if (!clip) return;
    const t = currentTimeRef.current;
    if (t <= clip.startTime || t >= clip.startTime + clip.duration) return;
    const firstDur = t - clip.startTime;
    const secondDur = clip.duration - firstDur;
    const secondId = genId();
    setClips(prev => [
      ...prev.map(c => c.id === clip.id ? { ...c, duration: firstDur } : c),
      { ...clip, id: secondId, startTime: t, duration: secondDur },
    ]);
    setSelectedClipId(secondId);
  }, []);

  const handleTrimLeft = useCallback(() => {
    const selId = selectedClipIdRef.current;
    const clip = clipsRef.current.find(c => c.id === selId);
    if (!clip) return;
    const t = currentTimeRef.current;
    const clipEnd = clip.startTime + clip.duration;
    if (t <= clip.startTime || t >= clipEnd) return;
    setClips(prev => prev.map(c => c.id === clip.id ? { ...c, startTime: t, duration: clipEnd - t } : c));
  }, []);

  const handleTrimRight = useCallback(() => {
    const selId = selectedClipIdRef.current;
    const clip = clipsRef.current.find(c => c.id === selId);
    if (!clip) return;
    const t = currentTimeRef.current;
    if (t <= clip.startTime || t >= clip.startTime + clip.duration) return;
    setClips(prev => prev.map(c => c.id === clip.id ? { ...c, duration: t - clip.startTime } : c));
  }, []);

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
        {/* Drop overlay */}
        {isDraggingFile && (
          <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-sm flex items-center justify-center pointer-events-none">
            <div className="border-4 border-dashed border-[#00D4D4] rounded-2xl p-16 flex flex-col items-center gap-4 bg-black/60">
              <span className="text-7xl">📁</span>
              <span className="text-3xl font-bold text-white">파일을 여기에 놓으세요</span>
              <span className="text-lg text-gray-400">동영상, 사진, 오디오, 자막 파일 지원</span>
            </div>
          </div>
        )}

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
        <div className="flex-1 flex overflow-hidden relative">
          {/* Left Sidebar */}
          <div style={{ width: leftWidth, minWidth: 180, maxWidth: 500 }} className="shrink-0">
            <LeftSidebar
              onVideoAdd={handleVideoAdd}
              onSubtitleImport={handleSubtitleImport}
              clips={clips}
              selectedClipId={selectedClipId}
              onClipSelect={handleClipSelect}
            />
          </div>
          {/* Left Divider */}
          <div
            className="w-1 bg-border-color hover:bg-[#00D4D4] cursor-col-resize shrink-0 transition-colors z-30 group relative"
            onMouseDown={(e) => {
              e.preventDefault();
              resizingRef.current = 'left';
              resizeStartRef.current = { x: e.clientX, y: 0, size: leftWidth };
              document.body.style.cursor = 'col-resize';
              document.body.style.userSelect = 'none';
            }}
          >
            <div className="absolute inset-y-0 -left-1 -right-1" />
          </div>
          <Player
            videoUrl={currentVideoUrl}
            currentTime={currentTime}
            hoverTime={hoverTime}
            selectedClipId={selectedClipId}
            clips={clips}
            isPlaying={isPlaying}
            onPlayingChange={setIsPlaying}
            onTimeUpdate={setCurrentTime}
            onSeek={handleSeek}
            onClipSelect={handleClipSelect}
            onClipDelete={handleClipDelete}
            onClipUpdate={handleClipUpdate}
            videoRefCallback={(ref) => { videoRef.current = ref; }}
            onPresetDrop={handlePresetDrop}
            viewerZoom={viewerZoom}
            onViewerZoomChange={setViewerZoom}
            playbackQuality={playbackQuality}
            onPlaybackQualityChange={setPlaybackQuality}
          />
          {/* Right Divider */}
          <div
            className="w-1 bg-border-color hover:bg-[#00D4D4] cursor-col-resize shrink-0 transition-colors z-30 group relative"
            onMouseDown={(e) => {
              e.preventDefault();
              resizingRef.current = 'right';
              resizeStartRef.current = { x: e.clientX, y: 0, size: rightWidth };
              document.body.style.cursor = 'col-resize';
              document.body.style.userSelect = 'none';
            }}
          >
            <div className="absolute inset-y-0 -left-1 -right-1" />
          </div>
          {/* Right Sidebar */}
          <div style={{ width: rightWidth, minWidth: 200, maxWidth: 500 }} className="shrink-0">
            <RightSidebar
              transcripts={transcripts}
              subtitles={subtitles}
              currentTime={currentTime}
              selectedClip={selectedClip}
              videoFile={currentVideoFile}
              clips={clips}
              onTranscriptsUpdate={setTranscripts}
              onSubtitlesUpdate={setSubtitles}
              onSeek={handleSeek}
              onClipUpdate={handleClipUpdate}
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
            resizeStartRef.current = { x: 0, y: e.clientY, size: timelineHeight };
            document.body.style.cursor = 'row-resize';
            document.body.style.userSelect = 'none';
          }}
        >
          <div className="absolute inset-x-0 -top-1 -bottom-1" />
        </div>
        <div style={{ height: timelineHeight, minHeight: 120, maxHeight: 500 }} className="shrink-0">
          <Timeline
            clips={clips}
            playheadPosition={currentTime}
            selectedClipId={selectedClipId}
            zoom={timelineZoom}
            onZoomChange={setTimelineZoom}
            snapEnabled={snapEnabled}
            onSnapToggle={() => setSnapEnabled(prev => !prev)}
            onPlayheadChange={handlePlayheadChange}
            onHoverTimeChange={setHoverTime}
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
            isTimelineHovered={isTimelineHovered}
            onHoverChange={setIsTimelineHovered}
          />
        </div>
      </div>
    </ShortcutsProvider>
  );
}
