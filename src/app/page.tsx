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
const MIN_ZOOM = 0.1;
const MAX_ZOOM = 5;
const ZOOM_STEP = 1.25;

export default function Home() {
  const { isAuthenticated, signIn } = useAuth();

  const [activeTab, setActiveTab] = useState<'media' | 'audio' | 'stickers' | 'effects' | 'transitions'>('media');
  const [transcripts, setTranscripts] = useState<TranscriptItem[]>([]);
  const [subtitles, setSubtitles] = useState<SubtitleItem[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
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
  const isTimelineHoveredRef = useRef(isTimelineHovered);
  const rippleModeRef = useRef(rippleMode);
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

  useEffect(() => { clipboardRef.current = clipboard; }, [clipboard]);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);
  useEffect(() => { isTimelineHoveredRef.current = isTimelineHovered; }, [isTimelineHovered]);
  useEffect(() => { rippleModeRef.current = rippleMode; }, [rippleMode]);
  useEffect(() => { historyRef.current = history; }, [history]);
  useEffect(() => { historyIndexRef.current = historyIndex; }, [historyIndex]);
  useEffect(() => { isAuthenticatedRef.current = isAuthenticated; }, [isAuthenticated]);

  // ===== Editing Tracker Init =====
  useEffect(() => {
    initEditingTracker();
    return () => stopEditingTracker();
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


  // Push to history
  const pushHistory = useCallback((newClips: VideoClip[], newSelectedIds: string[]) => {
    if (skipHistoryRef.current) { skipHistoryRef.current = false; return; }
    setHistory(prev => {
      const trimmed = prev.slice(0, historyIndexRef.current + 1);
      return [...trimmed, { clips: newClips, selectedClipIds: newSelectedIds }];
    });
    setHistoryIndex(prev => prev + 1);
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
    // Only subtitle tracks (0, 5) are strictly respected.
    // If main track is occupied at that time, fall back to the drop target or overlay.
    let finalTrackIndex = trackIndex;
    if (trackIndex === 0 || trackIndex === 5) {
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

    // Helper: generate lightweight proxy thumbnails (small size, low quality for timeline only)
    const generateThumbnails = (videoEl: HTMLVideoElement, dur: number, cid: string) => {
      // Cap at 30 thumbnails max for memory efficiency; 1 per 2 seconds for long videos
      const count = Math.min(Math.max(Math.ceil(dur / 2), 4), 30);
      const thumbs: string[] = [];
      let i = 0;
      const canvas = document.createElement('canvas');
      canvas.width = 96;   // reduced from 120
      canvas.height = 54;  // reduced from 68
      const ctx = canvas.getContext('2d');
      const captureNext = () => {
        if (i >= count || !ctx) {
          setClips(prev => prev.map(c => c.id === cid ? { ...c, thumbnails: thumbs } : c));
          canvas.width = 0; canvas.height = 0; // release canvas memory
          return;
        }
        videoEl.currentTime = (dur / count) * (i + 0.5);
      };
      videoEl.onseeked = () => {
        if (ctx) {
          ctx.drawImage(videoEl, 0, 0, canvas.width, canvas.height);
          thumbs.push(canvas.toDataURL('image/jpeg', 0.4)); // lower quality proxy
        }
        i++;
        captureNext();
      };
      captureNext();
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
  const handleVideoAdd = useCallback((file: File) => {
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
  }, [currentVideoUrl]);

  const handleClipUpdate = useCallback((clipId: string, updates: Partial<VideoClip>) => {
    setClips(prev => prev.map(clip => clip.id === clipId ? { ...clip, ...updates } : clip));
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

  const handlePlayheadChange = useCallback((position: number) => setCurrentTime(position), []);
  const handleSeek = useCallback((time: number) => setCurrentTime(time), []);
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

  const handleClipDelete = useCallback((clipId: string) => {
    const clip = clipsRef.current.find(c => c.id === clipId);
    if (clip) trackEditingAction('clip_delete', { targetTrack: clip.trackIndex, clipDuration: clip.duration, clipCount: clipsRef.current.length - 1 });
    setClips(prev => {
      let updated = prev.filter(c => c.id !== clipId);
      const deleted = prev.find(c => c.id === clipId);
      if (deleted && deleted.url === currentVideoUrl) {
        const next = updated.find(c => c.trackIndex === 1 && c.url);
        setCurrentVideoUrl(next?.url);
      }
      if (rippleModeRef.current) updated = rippleCloseGaps(updated);
      return updated;
    });
    setSelectedClipIds([]);
  }, [currentVideoUrl, rippleCloseGaps]);

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

    let lastEndTime = 0;
    const newClips: VideoClip[] = sortedItems.map((item) => {
      let startTime = item.startTime;
      let duration = item.endTime - item.startTime;

      // Prevent overlap with previous subtitle in this set
      if (startTime < lastEndTime) {
        startTime = lastEndTime;
        duration = Math.max(0.1, item.endTime - startTime);
      }

      const clip: VideoClip = {
        id: genId(),
        name: item.editedText || item.originalText,
        url: '', // Text clips have no URL
        startTime: startTime,
        duration: duration,
        trackIndex: trackIndex, // Set to provided track index (0 for Dialogue, 5 for AI)
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

  // Fit timeline to screen — tight fit to total clip duration
  const handleFitToScreen = useCallback(() => {
    const allClips = clipsRef.current;
    if (allClips.length === 0) return;
    const totalDuration = Math.max(...allClips.map(c => c.startTime + c.duration));
    if (totalDuration <= 0) return;
    const timelineEl = document.querySelector('footer');
    // TRACK_CONTROLS_WIDTH = 80
    const width = timelineEl ? timelineEl.clientWidth - 80 : 800;
    const fitZoom = width / (totalDuration * 50);
    setTimelineZoom(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fitZoom)));
    // Scroll to start
    requestAnimationFrame(() => {
      const scrollArea = timelineEl?.querySelector('.overflow-x-auto');
      if (scrollArea) scrollArea.scrollLeft = 0;
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

      // --- FIT TIMELINE TO SCREEN (Shift+Z, no cmd — Final Cut Pro style) ---
      if (shift && !cmd && !e.altKey && e.code === 'KeyZ') {
        e.preventDefault();
        handleFitToScreen();
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

      // Check authentication for other shortcuts
      if (!isAuthenticatedRef.current) {
        if (!['Escape', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' ', 'Space'].includes(e.key)) {
          e.preventDefault();
          alert('로그인이 필요한 기능입니다.');
          return;
        }
      }

      // --- PLAYBACK ---
      if (e.code === 'Space' && !cmd) {
        e.preventDefault();
        setIsPlaying(prev => !prev);
        return;
      }

      // --- SPLIT (M or Cmd+B) --- uses e.code for Korean IME compatibility
      if (e.code === 'KeyM' && !cmd) {
        e.preventDefault();
        splitAtPlayhead();
        return;
      }
      if (cmd && e.code === 'KeyB') {
        e.preventDefault();
        splitAtPlayhead();
        return;
      }

      // --- DELETE ---
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        const selIds = selectedClipIdsRef.current;
        if (selIds.length > 0) {
          setClipsSynced(prev => prev.filter(c => !selIds.includes(c.id)));
          setSelectedClipIdsSynced([]);
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

      // --- TRIM LEFT (Q) ---
      if (e.code === 'KeyQ') {
        e.preventDefault();
        trimLeft();
        return;
      }

      // --- TRIM RIGHT (W) ---
      if (e.code === 'KeyW') {
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
    // Priority: hoverTimeRef (orange, when mouse is over timeline) > currentTimeRef (blue playhead)
    // Both refs are synced synchronously — no stale closure, no pixel math.
    function getCutTime(): number {
      // hoverTimeRef is non-null only while mouse is inside the timeline area
      // (set synchronously by setHoverTimeSynced, cleared to null on mouseLeave)
      if (hoverTimeRef.current != null) return hoverTimeRef.current;
      return currentTimeRef.current;
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
      setClipsSynced(prev => [
        ...prev.map(c => c.id === clip.id ? { ...c, duration: firstDur } : c),
        { ...clip, id: secondId, startTime: t, duration: secondDur },
      ]);
      setSelectedClipIdsSynced([secondId]);
    }

    // Q: trim left — move clip startTime to cut point, discard everything before
    function trimLeft() {
      const t = getCutTime();
      const selId = selectedClipIdsRef.current[0];
      const clip = selId
        ? clipsRef.current.find(c => c.id === selId)
        : clipsRef.current.find(c => c.startTime < t && t < c.startTime + c.duration);
      if (!clip) return;
      const clipEnd = clip.startTime + clip.duration;
      if (t <= clip.startTime || t >= clipEnd) return;
      setClipsSynced(prev => {
        const trimmed = prev.map(c => c.id === clip.id ? {
          ...c,
          startTime: t,
          duration: clipEnd - t,
          trimStart: (c.trimStart ?? 0) + (t - clip.startTime),
        } : c);
        return rippleModeRef.current ? rippleCloseGaps(trimmed) : trimmed;
      });
    }

    // W: trim right — move clip endTime to cut point, discard everything after
    function trimRight() {
      const t = getCutTime();
      const selId = selectedClipIdsRef.current[0];
      const clip = selId
        ? clipsRef.current.find(c => c.id === selId)
        : clipsRef.current.find(c => c.startTime < t && t < c.startTime + c.duration);
      if (!clip) return;
      if (t <= clip.startTime || t >= clip.startTime + clip.duration) return;
      setClipsSynced(prev => {
        const trimmed = prev.map(c => c.id === clip.id ? {
          ...c,
          duration: t - clip.startTime,
          trimEnd: t - clip.startTime,
        } : c);
        return rippleModeRef.current ? rippleCloseGaps(trimmed) : trimmed;
      });
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

  const handleInteractionGuard = useCallback((e: React.MouseEvent | React.TouchEvent | React.PointerEvent) => {
    if (!isAuthenticated) {
      e.preventDefault();
      e.stopPropagation();
      alert('로그인이 필요한 기능입니다.');
      signIn();
    }
  }, [isAuthenticated, signIn]);

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

  // Delete (from Header menu)
  const handleDeleteMenu = useCallback(() => {
    const selIds = selectedClipIdsRef.current;
    if (selIds.length > 0) {
      setClips(prev => prev.filter(c => !selIds.includes(c.id)));
      setSelectedClipIds([]);
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
    const selId = selectedClipIdsRef.current[0];
    const clip = clipsRef.current.find(c => c.id === selId);
    if (!clip) return;
    const t = hoverTimeRef.current ?? currentTimeRef.current;
    const clipEnd = clip.startTime + clip.duration;
    if (t <= clip.startTime || t >= clipEnd) return;
    trackEditingAction('clip_trim_left', { targetTrack: clip.trackIndex, clipDuration: clip.duration, timelinePosition: t });
    setClips(prev => {
      const trimmed = prev.map(c => c.id === clip.id ? { ...c, startTime: t, duration: clipEnd - t, trimStart: (c.trimStart ?? 0) + (t - clip.startTime) } : c);
      return rippleModeRef.current ? rippleCloseGaps(trimmed) : trimmed;
    });
  }, [rippleCloseGaps]);

  const handleTrimRight = useCallback(() => {
    const selId = selectedClipIdsRef.current[0];
    const clip = clipsRef.current.find(c => c.id === selId);
    if (!clip) return;
    const t = hoverTimeRef.current ?? currentTimeRef.current;
    if (t <= clip.startTime || t >= clip.startTime + clip.duration) return;
    trackEditingAction('clip_trim_right', { targetTrack: clip.trackIndex, clipDuration: clip.duration, timelinePosition: t });
    setClips(prev => {
      const trimmed = prev.map(c => c.id === clip.id ? { ...c, duration: t - clip.startTime, trimEnd: t - clip.startTime } : c);
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
            currentTime={currentTime}
            hoverTime={hoverTime}
            selectedClipIds={selectedClipIds}
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
              onSubtitlesUpdate={setSubtitles}
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
