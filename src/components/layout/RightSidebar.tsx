'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { transcribeVideo, type STTProvider } from '@/lib/sttService';
import { splitSubtitles } from '@/lib/subtitleSplitter';
import { parseSubtitleFile } from '@/lib/subtitleParser';
import { generateSubtitlesFromAudio, type TranscriptDataForAI, type MediaRange } from '@/lib/geminiAudioService';
import { orchestrate, removeOverlaps, AI_STYLE_COLORS } from '@/lib/subtitleOrchestrator';
import type { TranscriptItem, SubtitleItem, SubtitleAnimation } from '@/types/subtitle';
import type { VideoClip } from '@/types/video';
import { saveSttCorrection, loadSttDictionary, applySttCorrections } from '@/lib/sttCorrections';

import { SUBTITLE_PRESETS, FONT_FAMILIES, type SubtitlePreset, loadCustomPresets, addCustomPreset, deleteCustomPreset } from '@/lib/subtitlePresets';
import UpgradeModal from '@/components/payment/UpgradeModal';
import ContextMenu from '@/components/ui/ContextMenu';
import SubtitleAnimationPanel from '@/components/editor/SubtitleAnimationPanel';

interface RightSidebarProps {
  transcripts?: TranscriptItem[];
  subtitles?: SubtitleItem[];
  currentTime?: number;
  selectedClip?: VideoClip | null;
  selectedClipIds?: string[];
  videoFile?: File | null;
  cachedAudioBlob?: Blob | null;
  inPoint?: number | null;
  outPoint?: number | null;
  videoDuration?: number;
  clips?: VideoClip[];
  onTranscriptsUpdate?: (transcripts: TranscriptItem[]) => void;
  onSubtitlesUpdate?: (subtitles: SubtitleItem[]) => void;
  onSeek?: (time: number) => void;
  onClipUpdate?: (clipId: string, updates: Partial<VideoClip>) => void;
  onClipsBatchUpdate?: (clipIds: string[], updates: Partial<VideoClip>) => void;
  onAddSubtitleClips?: (items: TranscriptItem[], trackIndex?: number, replaceTrack?: boolean) => void;
  onAddTextClip?: (preset: SubtitlePreset) => void;
  onExport?: () => void;
  onClipSelect?: (clipIds: string[]) => void;
  onResetViewerZoom?: () => void;
  onSetCanvasAspectRatio?: (ratio: '16:9' | '9:16' | '1:1' | '3:4') => void;
  onSetInPoint?: (time: number | null) => void;
  onSetOutPoint?: (time: number | null) => void;
}

const TranscriptItem = React.memo(({ t, isActive, isSelected, onSelect, onEdit, onDragStart, onMergeWithPrevious, onSplitAtCursor, onContextMenu }: {
  t: TranscriptItem,
  isActive: boolean,
  isSelected: boolean,
  onSelect: (id: string, startTime: number) => void,
  onEdit: (id: string, text: string) => void,
  onDragStart: (e: React.DragEvent, text: string) => void,
  onMergeWithPrevious?: (id: string) => void,
  onSplitAtCursor?: (id: string, cursorPos: number) => void,
  onContextMenu?: (e: React.MouseEvent, id: string) => void,
}) => {
  const text = t.editedText || t.originalText;
  // 자막 유형별 색상 (예능=노랑, 상황=초록, 설명=파랑, 대본=기본)
  const typeColor = t.color || '#FFFFFF';
  const isAiSubtitle = t.id?.startsWith('gem_') || t.id?.startsWith('intgem_') || t.id?.startsWith('aigap_');
  const typeLabel = typeColor === '#FFE066' ? '예능' : typeColor === '#A8E6CF' ? '상황' : typeColor === '#88D8FF' ? '설명' : typeColor === '#C9A0FF' ? '맥락' : null;
  // 편집 완료 시 원본과 다르면 교정 사전에 저장
  const handleBlur = useCallback(() => {
    const current = t.editedText || t.originalText;
    if (t.originalText && current !== t.originalText) {
      saveSttCorrection(t.originalText, current);
    }
  }, [t.originalText, t.editedText]);
  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, text)}
      onClick={() => onSelect(t.id, t.startTime)}
      onContextMenu={(e) => onContextMenu?.(e, t.id)}
      className={`group p-3 rounded-xl border transition-all cursor-pointer hover:scale-[1.02] active:scale-[0.98] ${isActive
        ? 'bg-primary/10 border-primary/50 shadow-lg shadow-primary/10'
        : 'bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/10'
        }`}
      style={isAiSubtitle ? { borderLeftWidth: 3, borderLeftColor: typeColor } : undefined}
    >
      <div className="flex items-start gap-3">
        <div
          className={`mt-1 h-2 w-2 rounded-full shrink-0 transition-all ${isActive ? 'shadow-[0_0_8px_rgba(0,212,212,0.6)] animate-pulse' : ''}`}
          style={{ backgroundColor: isActive ? (isAiSubtitle ? typeColor : 'rgb(0,212,212)') : (isAiSubtitle ? typeColor : '#374151') }}
        />
        <div className="flex-1 min-w-0">
          {isSelected ? (
            <textarea
              rows={2}
              value={text}
              onChange={(e) => onEdit(t.id, e.target.value)}
              onBlur={handleBlur}
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Backspace' && onMergeWithPrevious) {
                  const ta = e.currentTarget;
                  if (ta.selectionStart === 0 && ta.selectionEnd === 0) {
                    e.preventDefault();
                    onMergeWithPrevious(t.id);
                  }
                }
                if (e.key === 'Enter' && !e.shiftKey && onSplitAtCursor) {
                  e.preventDefault();
                  const pos = e.currentTarget.selectionStart ?? text.length;
                  if (pos > 0 && pos < text.length) {
                    onSplitAtCursor(t.id, pos);
                  }
                }
              }}
              className="w-full bg-black/40 border border-primary/30 rounded-md text-xs text-white px-2 py-1.5 focus:outline-none focus:border-primary transition-all resize-none"
            />
          ) : (
            <p className={`text-[13px] leading-relaxed ${isActive ? 'text-white font-medium' : 'text-gray-300'}`}>{text}</p>
          )}
          <div className={`mt-1 flex items-center gap-1.5 transition-opacity ${isSelected || isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
            <span className="text-[9px] text-gray-500 font-mono tracking-tighter">
              {fmtTimestamp(t.startTime)}
            </span>
            {typeLabel && (
              <span
                className="text-[9px] px-1.5 py-0.5 rounded-full font-medium"
                style={{ backgroundColor: typeColor + '30', color: typeColor }}
              >
                {typeLabel}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
});

const RightSidebar = React.memo(({
  transcripts = [], subtitles = [], currentTime = 0, selectedClip = null, selectedClipIds = [], videoFile = null, cachedAudioBlob = null, inPoint = null, outPoint = null, videoDuration, clips = [],
  onTranscriptsUpdate, onSubtitlesUpdate, onSeek, onClipUpdate, onClipsBatchUpdate, onAddSubtitleClips, onAddTextClip, onExport, onResetViewerZoom, onClipSelect,
  onSetCanvasAspectRatio, onSetInPoint, onSetOutPoint,
}: RightSidebarProps) => {
  const [activeTab, setActiveTab] = useState<'details' | 'caption'>('details');
  const [scale, setScale] = useState(selectedClip?.scale ?? 100);
  const [positionX, setPositionX] = useState(selectedClip?.positionX ?? 0);
  const [positionY, setPositionY] = useState(selectedClip?.positionY ?? 0);
  const [rotation, setRotation] = useState(selectedClip?.rotation ?? 0);
  const [opacity, setOpacity] = useState(selectedClip?.opacity ?? 100);
  const [blendMode, setBlendMode] = useState(selectedClip?.blendMode ?? false);
  const [brightness, setBrightness] = useState(selectedClip?.brightness ?? 100);
  const [contrast, setContrast] = useState(selectedClip?.contrast ?? 100);
  const [saturate, setSaturate] = useState(selectedClip?.saturate ?? 100);
  const [temperature, setTemperature] = useState(selectedClip?.temperature ?? 0);
  const [selectedPresetId, setSelectedPresetId] = useState<number>(1);

  // Quota and Payment
  const [showPaymentModal, setShowPaymentModal] = useState(false);

  // Generation status
  const [isGeminiGenerating, setIsGeminiGenerating] = useState(false);
  const [geminiProgress, setGeminiProgress] = useState(0);
  const [geminiStatus, setGeminiStatus] = useState('');
  const [isIntegratedGenerating, setIsIntegratedGenerating] = useState(false);
  const [integratedProgress, setIntegratedProgress] = useState(0);
  const [integratedStatus, setIntegratedStatus] = useState('');
  const [customAIPrompt, setCustomAIPrompt] = useState('연출 자막을 최대한 많이, 빈틈없이 넣어줘\n대본 사이사이 모든 빈 구간에 AI 자막 배치\n3초 이상 빈 구간이 없도록');
  const [selectedDesignPreset, setSelectedDesignPreset] = useState<string | null>(null);
  const [transcriptContextMenu, setTranscriptContextMenu] = useState<{ x: number; y: number; id: string } | null>(null);

  useEffect(() => {
    if (selectedClip) {
      setScale(selectedClip.scale ?? 100);
      setPositionX(selectedClip.positionX ?? 0);
      setPositionY(selectedClip.positionY ?? 0);
      setRotation(selectedClip.rotation ?? 0);
      setOpacity(selectedClip.opacity ?? 100);
      setBlendMode(selectedClip.blendMode ?? false);
      setBrightness(selectedClip.brightness ?? 100);
      setContrast(selectedClip.contrast ?? 100);
      setSaturate(selectedClip.saturate ?? 100);
      setTemperature(selectedClip.temperature ?? 0);
    }
  }, [selectedClip]);

  const updateProp = useCallback((prop: keyof VideoClip, value: any) => {
    if (selectedClipIds.length > 0 && onClipUpdate) {
      selectedClipIds.forEach(id => {
        onClipUpdate(id, { [prop]: value });
      });
    } else if (selectedClip && onClipUpdate) {
      // Fallback in case selectedClipIds is not passed
      onClipUpdate(selectedClip.id, { [prop]: value });
    }
  }, [selectedClip, selectedClipIds, onClipUpdate]);

  // Caption states
  const [captionTab, setCaptionTab] = useState<'caption' | 'text' | 'animation' | 'tracking' | 'tts'>('caption');

  // AI Sound / TTS 상태
  const [soundPrompt, setSoundPrompt] = useState('');
  const [soundSuggestions, setSoundSuggestions] = useState<{ text: string; time: number }[]>([]);
  const [isGeneratingSound, setIsGeneratingSound] = useState(false);
  const [soundGenStatus, setSoundGenStatus] = useState('');

  // TTS (실제 음성 생성) 상태
  const [ttsText, setTtsText] = useState('');
  const [ttsVoice, setTtsVoice] = useState<'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer'>('nova');
  const [ttsSpeed, setTtsSpeed] = useState(1.0);
  const [isGeneratingTts, setIsGeneratingTts] = useState(false);
  const [ttsAudioUrl, setTtsAudioUrl] = useState<string | null>(null);
  const [ttsStatus, setTtsStatus] = useState('');
  const ttsAudioRef = useRef<HTMLAudioElement | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [showReplace, setShowReplace] = useState(false);
  const [applyToAllOnTrack, setApplyToAllOnTrack] = useState(true);
  const [customPresets, setCustomPresets] = useState<SubtitlePreset[]>(() => loadCustomPresets());
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [selectedTranscriptId, setSelectedTranscriptId] = useState<string | null>(null);
  const [userScript, setUserScript] = useState('');
  const [aiScript, setAiScript] = useState('');
  // Gemini STT 확정 — 환청 없이 정교한 한국어 분석
  const sttProvider: STTProvider = 'gemini';
  // AI 연출자막 엔진: Gemini 고정
  const aiSubtitleProvider = 'gemini';
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [transcriptionProgress, setTranscriptionProgress] = useState(0);
  const [transcriptionStatus, setTranscriptionStatus] = useState('');
  const transcriptionAbortController = useRef<AbortController | null>(null);
  const geminiAbortController = useRef<AbortController | null>(null);
  const scriptTextareaRef = useRef<HTMLTextAreaElement>(null);
  const subtitleFileRef = useRef<HTMLInputElement>(null);

  // === AUTO PIPELINE STATE ===
  const [pipelineActive, setPipelineActive] = useState(false);
  const [pipelineStep, setPipelineStep] = useState<'idle' | 'stt' | 'ai' | 'done'>('idle');
  const [pipelineProgress, setPipelineProgress] = useState(0);
  const [pipelineStatus, setPipelineStatus] = useState('');
  const processedFileRef = useRef<string | null>(null);

  // === 트림된 클립 범위에 맞게 분석 결과 필터링/리매핑 ===
  // 미디어 시간(원본 영상 기준) → 타임라인 시간으로 변환
  const filterResultsToClipRanges = useCallback(<T extends { startTime: number; endTime: number }>(
    items: T[],
  ): T[] => {
    // 메인 트랙(1) 영상 클립만 가져오기
    const mainClips = (clips || []).filter(c => c.trackIndex === 1).sort((a, b) => a.startTime - b.startTime);
    if (mainClips.length === 0) return items;

    // ★ 클립이 1개이고 trimStart≈0이면 → 전체 영상을 그대로 사용 중 → 리매핑 불필요
    if (mainClips.length === 1) {
      const clip = mainClips[0];
      const trimStart = clip.trimStart ?? 0;
      if (trimStart < 0.1 && clip.startTime < 0.1) {
        console.log('[클립 필터] 단일 클립, 트림 없음 → 리매핑 스킵');
        return items;
      }
    }

    // ★ 장면 분할만 했고 삭제 안 한 경우 체크: 모든 클립이 연속적이고 전체를 커버하면 리매핑 스킵
    const allSimple = mainClips.every(c => (c.speed || 1) === 1);
    if (allSimple && mainClips.length > 0) {
      let isContiguous = true;
      for (let i = 1; i < mainClips.length; i++) {
        const prevEnd = (mainClips[i - 1].trimStart ?? 0) + mainClips[i - 1].duration;
        const currStart = mainClips[i].trimStart ?? 0;
        // 0.1초 이내 차이는 연속으로 간주
        if (Math.abs(currStart - prevEnd) > 0.1) { isContiguous = false; break; }
      }
      const firstTrim = mainClips[0].trimStart ?? 0;
      if (isContiguous && firstTrim < 0.1 && mainClips[0].startTime < 0.1) {
        // 장면 분할만 하고 삭제/이동 안 함 → 미디어 시간 ≈ 타임라인 시간
        console.log('[클립 필터] 연속 클립, 트림=0 → 리매핑 스킵 (장면 분할만 된 상태)');
        return items;
      }
    }

    // ★ 디버그 로그
    let totalCoverage = 0;
    for (const clip of mainClips) {
      const speed = clip.speed || 1;
      totalCoverage += clip.duration * speed;
    }
    console.log(`[클립 필터] 클립 ${mainClips.length}개, 미디어 커버리지: ${totalCoverage.toFixed(1)}초`);
    mainClips.forEach((c, i) => {
      const speed = c.speed || 1;
      const ms = c.trimStart ?? 0;
      const me = ms + (c.duration * speed);
      console.log(`  클립${i}: timeline=${c.startTime.toFixed(1)}~${(c.startTime + c.duration).toFixed(1)}, media=${ms.toFixed(1)}~${me.toFixed(1)}`);
    });

    const filtered: T[] = [];
    for (const item of items) {
      // 아이템의 중간점 기준으로 매칭 (시작점만으로 매칭하면 경계에서 누락)
      const itemMid = (item.startTime + item.endTime) / 2;
      let bestClip: (typeof mainClips)[0] | null = null;
      let bestDist = Infinity;

      for (const clip of mainClips) {
        const speed = clip.speed || 1;
        const mediaStart = clip.trimStart ?? 0;
        const mediaEnd = mediaStart + (clip.duration * speed);

        // 범위 안에 있으면 바로 매칭
        if (itemMid >= mediaStart - 0.05 && itemMid <= mediaEnd + 0.05) {
          bestClip = clip;
          bestDist = 0;
          break;
        }
        // 가장 가까운 클립 추적 (경계 근처 아이템용)
        const dist = Math.min(Math.abs(itemMid - mediaStart), Math.abs(itemMid - mediaEnd));
        if (dist < bestDist) { bestDist = dist; bestClip = clip; }
      }

      // 범위 안(dist=0) 또는 가장 가까운 클립이 2초 이내면 매칭
      if (bestClip && bestDist <= 2.0) {
        const speed = bestClip.speed || 1;
        const mediaStart = bestClip.trimStart ?? 0;
        const timelineStart = bestClip.startTime + (Math.max(0, item.startTime - mediaStart)) / speed;
        const timelineEnd = Math.min(
          bestClip.startTime + bestClip.duration,
          bestClip.startTime + (Math.max(0, item.endTime - mediaStart)) / speed,
        );
        if (timelineEnd > timelineStart) {
          filtered.push({ ...item, startTime: timelineStart, endTime: timelineEnd });
        }
      }
      // 매칭 안 되면 해당 항목은 타임라인에 없는 구간이므로 제외
    }
    // ★ 커버리지 확인: 매핑 결과가 원본의 50% 미만이면 리매핑 실패로 판단 → 원본 반환
    const timelineEnd = mainClips.reduce((max, c) => Math.max(max, c.startTime + c.duration), 0);
    const lastSeg = filtered.length > 0 ? filtered[filtered.length - 1] : null;
    const coverage = lastSeg ? (lastSeg.endTime / timelineEnd * 100).toFixed(1) : '0';
    console.log(`[클립 필터] ${items.length}개 → ${filtered.length}개 매핑 (커버리지: ${coverage}%, 타임라인 끝: ${timelineEnd.toFixed(1)}초, 마지막 세그: ${lastSeg?.endTime.toFixed(1) ?? 'N/A'}초)`);

    // 매핑 후 50% 이상 누락되면 리매핑 실패 → 원본 그대로 사용 (데이터 손실 방지)
    if (items.length > 0 && filtered.length < items.length * 0.5) {
      console.warn(`[클립 필터] ⚠️ 매핑 후 ${items.length - filtered.length}개 누락 (${((1 - filtered.length / items.length) * 100).toFixed(0)}%) → 원본 사용으로 폴백`);
      return items;
    }

    return filtered;
  }, [clips]);

  // 타임라인 트랙1 클립에서 실제 사용 중인 미디어 구간 추출
  // ★ 단일 클립 + 트림 없음 → undefined 반환 (전체 영상 분석)
  const getMediaRangesFromClips = useCallback((): MediaRange[] | undefined => {
    const mainClips = (clips || []).filter(c => c.trackIndex === 1);
    if (mainClips.length === 0) return undefined;

    // 클립들의 실제 미디어 범위 계산
    const ranges = mainClips.map(c => {
      const speed = c.speed || 1;
      const mediaStart = c.trimStart ?? 0;
      const mediaEnd = c.trimEnd != null
        ? c.trimEnd
        : mediaStart + c.duration * speed;
      return { start: mediaStart, end: mediaEnd };
    });

    // 단일 클립이고 원본 전체를 사용하는 경우만 undefined (전체 분석)
    if (ranges.length === 1) {
      const r = ranges[0];
      const originalDuration = mainClips[0].originalDuration ?? 0;
      if (r.start < 0.1 && originalDuration > 0 && Math.abs(r.end - r.start - originalDuration) < 1) {
        console.log('[mediaRanges] 단일 클립, 원본 전체 → 전체 영상 분석');
        return undefined;
      }
    }

    console.log(`[mediaRanges] ${ranges.length}개 클립 → 구간:`, ranges.map(r => `${r.start.toFixed(1)}~${r.end.toFixed(1)}s`).join(', '));
    return ranges;
  }, [clips]);

  // 타임라인의 실제 끝 시간 (클립 기준) — videoDuration(원본 파일 길이)이 아닌 타임라인 길이
  const getTimelineEnd = useCallback((): number => {
    const mainClips = (clips || []).filter(c => c.trackIndex === 1);
    if (mainClips.length === 0) return videoDuration || 0;
    return Math.max(...mainClips.map(c => c.startTime + c.duration));
  }, [clips, videoDuration]);

  // Handle SRT/ASS file import
  // Stabilized callbacks for TranscriptItem performance
  const handleTranscriptSelect = useCallback((id: string, start: number) => {
    setSelectedTranscriptId(id);
    onSeek?.(start);
    // ★ 해당 자막의 타임라인 클립을 자동 선택 (위치 확인 + 바로 편집 가능)
    if (onClipSelect && clips.length > 0) {
      const matchingClip = clips.find(c =>
        !c.url && Math.abs(c.startTime - start) < 0.5
      );
      if (matchingClip) {
        onClipSelect([matchingClip.id]);
      }
    }
  }, [onSeek, onClipSelect, clips]);

  const handleSubtitleFileImport = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    for (const file of files) {
      try {
        const parsed = await parseSubtitleFile(file);
        if (parsed.length === 0) {
          alert('자막을 찾을 수 없습니다. 파일 형식을 확인해주세요.');
          continue;
        }
        // 기존 대본에 추가 (시간순 정렬)
        const merged = [...transcripts, ...parsed].sort((a, b) => a.startTime - b.startTime);
        onTranscriptsUpdate?.(merged);
        // 타임라인에도 반영
        if (onAddSubtitleClips) {
          onAddSubtitleClips(parsed, 0, false);
        }
      } catch (err: any) {
        alert(`자막 파일 파싱 실패: ${err.message}`);
      }
    }
    if (subtitleFileRef.current) subtitleFileRef.current.value = '';
  }, [transcripts, onTranscriptsUpdate, onAddSubtitleClips]);

  // Edit transcript inline
  const handleTranscriptEdit = useCallback((id: string, newText: string) => {
    const updated = transcripts.map(t => t.id === id ? { ...t, editedText: newText, isEdited: true } : t);
    onTranscriptsUpdate?.(updated);
    // 타임라인 자막 클립도 동기화: transcript id 또는 같은 텍스트를 가진 클립 name 업데이트
    const original = transcripts.find(t => t.id === id);
    if (original && clips && onClipUpdate) {
      const originalText = original.editedText || original.originalText;
      clips
        .filter(c => !c.url && c.name === originalText)
        .forEach(c => onClipUpdate(c.id, { name: newText }));
    }
  }, [transcripts, onTranscriptsUpdate, clips, onClipUpdate]);

  const handleMergeWithPrevious = useCallback((id: string) => {
    const idx = transcripts.findIndex(t => t.id === id);
    if (idx <= 0) return;
    const prev = transcripts[idx - 1];
    const cur = transcripts[idx];
    const mergedText = (prev.editedText || prev.originalText) + ' ' + (cur.editedText || cur.originalText);
    const merged: TranscriptItem = {
      ...prev,
      editedText: mergedText,
      isEdited: true,
      endTime: Math.max(prev.endTime, cur.endTime),
    };
    const updated = transcripts.filter((_, i) => i !== idx).map(t => t.id === prev.id ? merged : t);
    onTranscriptsUpdate?.(updated);
    setSelectedTranscriptId(prev.id);
  }, [transcripts, onTranscriptsUpdate]);

  const handleSplitAtCursor = useCallback((id: string, cursorPos: number) => {
    const idx = transcripts.findIndex(t => t.id === id);
    if (idx < 0) return;
    const cur = transcripts[idx];
    const text = cur.editedText || cur.originalText;
    const textBefore = text.slice(0, cursorPos).trim();
    const textAfter = text.slice(cursorPos).trim();
    if (!textBefore || !textAfter) return;

    // Split time proportionally by text length
    const ratio = textBefore.length / text.length;
    const midTime = cur.startTime + (cur.endTime - cur.startTime) * ratio;

    const first: TranscriptItem = {
      ...cur,
      editedText: textBefore,
      isEdited: true,
      endTime: midTime,
    };
    const second: TranscriptItem = {
      ...cur,
      id: `${cur.id}_split_${Date.now()}`,
      editedText: textAfter,
      originalText: textAfter,
      isEdited: true,
      startTime: midTime,
    };
    const updated = [...transcripts];
    updated.splice(idx, 1, first, second);
    onTranscriptsUpdate?.(updated);
    setSelectedTranscriptId(second.id);
  }, [transcripts, onTranscriptsUpdate]);

  const handleTranscriptDelete = useCallback((id: string) => {
    onTranscriptsUpdate?.(transcripts.filter(t => t.id !== id));
    if (selectedTranscriptId === id) setSelectedTranscriptId(null);
  }, [transcripts, onTranscriptsUpdate, selectedTranscriptId]);

  const handleTranscriptContextMenu = useCallback((e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setTranscriptContextMenu({ x: e.clientX, y: e.clientY, id });
  }, []);

  const handleAutoTranscribe = useCallback(async () => {
    setIsTranscribing(true); setTranscriptionProgress(0); setTranscriptionStatus('음성 인식 준비 중...');
    transcriptionAbortController.current = new AbortController();

    // ★ 타임라인 클립에서 영상 가져오기 (videoFile보다 우선)
    let safeFile: File | null = null;
    const videoClip = (clips || []).find(c => c.trackIndex === 1 && c.url);
    if (videoClip?.url) {
      try {
        const res = await fetch(videoClip.url);
        if (res.ok) {
          const blob = await res.blob();
          safeFile = new File([blob], videoClip.name || 'video.mp4', { type: blob.type || 'video/mp4' });
          console.log('[대본 분석] 타임라인 클립에서 영상 로드 성공');
        }
      } catch { /* fallback to videoFile below */ }
    }
    // 클립 URL 실패 시 videoFile 폴백
    if (!safeFile && videoFile) {
      try {
        const buf = await videoFile.arrayBuffer();
        safeFile = new File([buf], videoFile.name, { type: videoFile.type, lastModified: videoFile.lastModified });
        console.log('[대본 분석] videoFile에서 영상 로드 (폴백)');
      } catch { /* handled below */ }
    }
    if (!safeFile) {
      alert('비디오 파일이 필요합니다. 파일을 다시 불러온 뒤 시도해주세요.');
      setIsTranscribing(false);
      return;
    }

    try {
      // ★ 타임라인 클립의 미디어 범위만 분석 (불필요한 구간 제외)
      const sttMediaRanges = getMediaRangesFromClips();
      console.log(`[대본 분석] mediaRanges:`, sttMediaRanges);
      console.log(`[대본 분석] STT 엔진: ${sttProvider}`);
      const result = await transcribeVideo(safeFile, 'backend-proxy', (status) => {
        setTranscriptionStatus(status);
        if (status.includes('오디오 추출')) setTranscriptionProgress(20);
        else if (status.includes('파일 처리')) setTranscriptionProgress(40);
        else if (status.includes('음성 인식')) {
          const m = status.match(/(\d+)\/(\d+)/);
          if (m) setTranscriptionProgress(40 + (parseInt(m[1]) / parseInt(m[2])) * 50);
        } else if (status.includes('결과 병합')) setTranscriptionProgress(90);
        else if (status.includes('완료')) setTranscriptionProgress(100);
      }, sttMediaRanges, sttProvider);
      // subtitleSplitter를 사용하여 문장 단위로 분할
      console.log(`[대본 분석] STT 결과: words=${result.words.length}, sentences=${result.sentences?.length ?? 0}, fullText="${result.fullText.slice(0, 100)}"`);
      const segments = splitSubtitles(result);
      console.log(`[대본 분석] splitSubtitles 결과: ${segments.length}개 세그먼트`);
      if (segments.length === 0) {
        console.warn('[대본 분석] ⚠️ 세그먼트가 0개! STT는 성공했으나 분할 결과 없음');
      }
      // 교정 사전 로드 → STT 결과에 자동 적용
      const dict = await loadSttDictionary();
      const newT: TranscriptItem[] = segments.map((seg, i) => {
        const corrected = dict.length > 0 ? applySttCorrections(seg.text, dict) : seg.text;
        return {
          id: `t_${Date.now()}_${i}`,
          startTime: seg.startTime,
          endTime: seg.endTime,
          originalText: seg.text,
          editedText: corrected,
          isEdited: corrected !== seg.text,
          words: seg.words.map(w => ({ word: w.word, startTime: w.startTime, endTime: w.endTime })),
        };
      });

      // ★ 미디어 시간 → 타임라인 시간 변환 (장면 분할/트림 반영)
      const mapped = filterResultsToClipRanges(newT);
      console.log(`[대본 분석] ${newT.length}개 → 매핑 후 ${mapped.length}개 대본`);

      // 대본만 교체 (AI 자막 잔여물 방지 — 대본 전용 모드)
      onTranscriptsUpdate?.(mapped);

      // Auto-add to timeline (Dialogue -> Track 0)
      if (onAddSubtitleClips && mapped.length > 0) {
        onAddSubtitleClips(mapped, 0, true);
      }

      setTranscriptionStatus('완료!');
      onResetViewerZoom?.();
      setTimeout(() => { setIsTranscribing(false); setTranscriptionProgress(0); setTranscriptionStatus(''); }, 2000);
    } catch (error: any) {
      if (error.message === 'PAYMENT_REQUIRED') {
        setShowPaymentModal(true);
      } else if (error.name !== 'AbortError') {
        alert(`음성 인식 실패: ${error.message}`);
      }
      setIsTranscribing(false); setTranscriptionProgress(0); setTranscriptionStatus('');
    }
  }, [videoFile, clips, transcripts, sttProvider, onTranscriptsUpdate, onAddSubtitleClips, onResetViewerZoom, filterResultsToClipRanges, getMediaRangesFromClips]);

  const handleCancelTranscription = useCallback(() => {
    transcriptionAbortController.current?.abort();
    setIsTranscribing(false); setTranscriptionProgress(0); setTranscriptionStatus('');
  }, []);

  const handleCancelGemini = useCallback(() => {
    geminiAbortController.current?.abort();
    setIsGeminiGenerating(false); setGeminiProgress(0); setGeminiStatus('');
  }, []);

  // AI 연출 자막 전용 — 기존 대본은 건드리지 않고 AI 자막만 생성/교체
  const handleGeminiAudioGenerate = useCallback(async () => {
    const hasTranscripts = transcripts.length > 0;

    geminiAbortController.current = new AbortController();
    setIsGeminiGenerating(true); setGeminiProgress(0); setGeminiStatus('AI 연출 자막 생성 중 (Gemini)...');
    onSubtitlesUpdate?.([]);

    try {
      let results: { start_time: number; end_time: number; text: string; style_type: string }[];

      // 텍스트 기반 Gemini AI 자막 생성 (오디오 실패 시 fallback)
      const genTextBased = async () => {
        if (!hasTranscripts) throw new Error('대본이 필요합니다. 먼저 대본을 생성하세요.');
        setGeminiStatus('Gemini로 대본 분석 중...');
        const resp = await fetch('/api/gemini', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcripts: transcripts.map(t => ({
              startTime: t.startTime, endTime: t.endTime, text: t.editedText || t.originalText,
            })),
            customPrompt: customAIPrompt || undefined,
          }),
          signal: geminiAbortController.current?.signal,
        });
        if (!resp.ok) {
          const err = await resp.json().catch(() => ({ error: resp.statusText }));
          throw new Error(err?.error || `Gemini AI 자막 생성 실패 (${resp.status})`);
        }
        const data = await resp.json();
        return (data.subtitles || []).map((r: any) => ({
          start_time: r.startTime ?? r.start_time ?? r.start ?? 0,
          end_time: r.endTime ?? r.end_time ?? r.end ?? 0,
          text: r.text || '', style_type: r.type || r.style_type || '상황',
        }));
      };

      // ★ 텍스트 기반 연출 자막 생성 (대본 타임스탬프 활용 → 싱크 정확)
      if (hasTranscripts) {
        results = await genTextBased();
      } else {
        alert('대본이 필요합니다. 먼저 대본을 생성하세요.'); setIsGeminiGenerating(false); return;
      }
      setGeminiProgress(90);
      console.log(`[AI 연출] API 결과: ${results.length}개`, results.slice(0, 3));

      if (results.length === 0) {
        alert('AI가 자막을 생성하지 못했습니다. 다시 시도해주세요.');
        setIsGeminiGenerating(false); setGeminiProgress(0); setGeminiStatus('');
        return;
      }

      // 예능/상황/설명 분류
      const aiItems: TranscriptItem[] = results.map((r, i) => {
        const base: TranscriptItem = {
          id: `gem_${Date.now()}_${i}`,
          startTime: r.start_time,
          endTime: r.end_time,
          originalText: r.text,
          editedText: r.text,
          isEdited: false,
          color: '#FFFFFF',
          strokeColor: '#000000',
        };
        const st = r.style_type;
        if (st === '예능자막' || st === '예능') return { ...base, color: '#FFE066', strokeColor: '#FF6B6B' };
        if (st === '상황자막' || st === '상황') return { ...base, color: '#A8E6CF' };
        if (st === '설명자막' || st === '설명') return { ...base, color: '#88D8FF', strokeColor: '#0066CC' };
        if (st === '맥락') return { ...base, color: '#C9A0FF', strokeColor: '#6B21A8' };
        return { ...base, color: '#A8E6CF' };
      });

      // AI 자막 배치 (대본은 컨텍스트용으로만 사용, 화면 비표시)
      const timelineEnd = getTimelineEnd();
      console.log(`[AI 연출] orchestrate 입력: 대본 ${hasTranscripts ? transcripts.length : 0}개, AI ${aiItems.length}개, timelineEnd=${timelineEnd}`);
      const { aiItems: finalAi } = orchestrate(
        hasTranscripts ? transcripts : [],
        aiItems,
        timelineEnd,
        clips,
      );
      console.log(`[AI 연출] orchestrate 결과: AI=${finalAi.length}개 — 대본 제외, AI 연출 자막만 표시`);

      const effectiveAi = finalAi.length > 0 ? finalAi : aiItems;

      // ★ AI 연출 자막만 표시 (대본 제외)
      onTranscriptsUpdate?.(effectiveAi);

      const newSubs: SubtitleItem[] = effectiveAi.map((r, i) => ({
        id: `gemsub_${Date.now()}_${i}`,
        startTime: r.startTime,
        endTime: r.endTime,
        text: r.editedText || r.originalText,
        type: 'SITUATION' as const,
        confidence: 0.9,
      }));
      onSubtitlesUpdate?.(newSubs);
      setAiScript(results.map(r => `[${r.style_type}] ${r.text}`).join('\n'));

      // ★ 대본 트랙 비우기 + AI(Track 5) 배치
      if (onAddSubtitleClips) {
        onAddSubtitleClips([], 0, true);
        if (effectiveAi.length > 0) onAddSubtitleClips(effectiveAi, 5, true);
      }

      setGeminiStatus('완료!');
      onResetViewerZoom?.();
      setTimeout(() => { setIsGeminiGenerating(false); setGeminiProgress(0); setGeminiStatus(''); }, 2000);
    } catch (err: any) {
      if (err.name === 'AbortError') {
        // Ignored
      } else if (err.message === 'PAYMENT_REQUIRED') {
        setShowPaymentModal(true);
      } else {
        console.error('[AI 연출] 에러 상세:', err);
        const is503 = err.message?.includes('503') || err.message?.toLowerCase().includes('high demand') || err.message?.toLowerCase().includes('service unavailable');
        if (is503) {
          alert('현재 AI 서버에 사용자가 많아 잠시 서비스가 지연되고 있습니다. 잠시 후 다시 시도해 주세요.');
        } else {
          alert(`AI 자막 생성 실패: ${err.message || '알 수 없는 오류'}`);
        }
      }
      setIsGeminiGenerating(false); setGeminiProgress(0); setGeminiStatus('');
    }
  }, [videoFile, cachedAudioBlob, inPoint, outPoint, clips, videoDuration, transcripts, customAIPrompt, onTranscriptsUpdate, onSubtitlesUpdate, onAddSubtitleClips, filterResultsToClipRanges, getTimelineEnd, getMediaRangesFromClips, onResetViewerZoom]);

  // ═══════════════════════════════════════════════════════
  // 숏츠 자동 생성
  // ═══════════════════════════════════════════════════════
  const handleShortsGenerate = useCallback(async () => {
    setIsShortsGenerating(true);
    setShortsStatus('숏츠 분석 시작...');

    try {
      // 1. 대본 확보 (기존 대본이 있으면 재사용)
      let currentTranscripts = transcripts;

      if (currentTranscripts.length === 0) {
        // 대본이 없으면 STT 먼저 실행
        setShortsStatus('음성 인식 중...');

        // 파일 확보 (handleIntegratedGenerate와 동일한 로직)
        let safeFile: File | null = null;
        if (cachedAudioBlob) {
          safeFile = new File([cachedAudioBlob], 'audio.wav', { type: cachedAudioBlob.type || 'audio/wav' });
        }
        if (!safeFile && videoFile) {
          try { await videoFile.slice(0, 1).arrayBuffer(); safeFile = videoFile; } catch {}
        }
        if (!safeFile) {
          const videoClip = (clips || []).find(c => c.trackIndex === 1 && c.url);
          if (videoClip?.url) {
            try {
              const res = await fetch(videoClip.url);
              if (res.ok) { const blob = await res.blob(); safeFile = new File([blob], 'video.mp4', { type: blob.type || 'video/mp4' }); }
            } catch {}
          }
        }
        if (!safeFile) {
          const picked = await new Promise<File | null>((resolve) => {
            const input = document.createElement('input');
            input.type = 'file'; input.accept = 'video/*,audio/*';
            input.onchange = () => resolve(input.files?.[0] || null);
            input.addEventListener('cancel', () => resolve(null));
            alert('숏츠 분석을 위해 영상 파일을 선택해주세요.');
            input.click();
          });
          if (!picked) { setIsShortsGenerating(false); setShortsStatus(''); return; }
          safeFile = picked;
        }

        const { transcribeVideo } = await import('@/lib/sttService');
        const { splitSubtitles } = await import('@/lib/subtitleSplitter');
        const sttResult = await transcribeVideo(safeFile, 'backend-proxy', (s) => setShortsStatus(s), undefined, sttProvider);
        const segments = splitSubtitles(sttResult);
        currentTranscripts = segments.map((seg, i) => ({
          id: `shorts_stt_${Date.now()}_${i}`,
          startTime: seg.startTime,
          endTime: seg.endTime,
          originalText: seg.text,
          editedText: seg.text,
          isEdited: false,
          words: seg.words.map(w => ({ word: w.word, startTime: w.startTime, endTime: w.endTime })),
        }));
        onTranscriptsUpdate?.(currentTranscripts);
      }

      // 2. 클립이 이미 잘려있으면(60초 이하) AI 추천 건너뛰고 바로 사용
      const mainClip = clips.find(c => c.trackIndex === 1);
      const clipDuration = mainClip?.duration ?? 0;
      const clipTrimStart = mainClip?.trimStart ?? 0;

      let startTime: number;
      let endTime: number;
      let reason: string;

      if (clipDuration <= 65 && clipDuration > 0) {
        // 이미 60초 이하로 잘려있음 → 그대로 숏츠로 사용
        startTime = clipTrimStart;
        endTime = clipTrimStart + clipDuration;
        reason = `이미 ${Math.round(clipDuration)}초로 편집된 구간 사용`;
        setShortsStatus(`잘린 영상 (${Math.round(clipDuration)}초) → 숏츠로 변환 중...`);
        console.log(`[숏츠] 이미 잘린 클립: ${startTime.toFixed(1)}~${endTime.toFixed(1)}초 (${clipDuration.toFixed(1)}초)`);
      } else {
        // 60초 초과 → Gemini에게 하이라이트 구간 추천 요청
        setShortsStatus('AI가 최적 숏츠 구간 분석 중...');
        const shortsRes = await fetch('/api/gemini-shorts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            transcripts: currentTranscripts.map(t => ({
              startTime: t.startTime,
              endTime: t.endTime,
              text: t.editedText || t.originalText,
            })),
          }),
        });

        if (!shortsRes.ok) {
          const err = await shortsRes.json().catch(() => ({}));
          throw new Error(err?.error || '숏츠 구간 추천 실패');
        }

        const shortsData = await shortsRes.json();
        startTime = shortsData.startTime;
        endTime = shortsData.endTime;
        reason = shortsData.reason;
      }

      // 3. 에디터 상태 변경: 9:16 + I/O 구간 + 영상 센터 크롭
      onSetCanvasAspectRatio?.('9:16');
      onSetInPoint?.(startTime);
      onSetOutPoint?.(endTime);

      // 3-1. 영상 클립 설정
      const segmentTranscripts = currentTranscripts
        .filter(t => t.endTime > startTime && t.startTime < endTime)
        .sort((a, b) => a.startTime - b.startTime);
      const SILENCE_THRESHOLD = 0.3; // 0.3초 이상 무음이면 제거

      if (mainClip && segmentTranscripts.length > 0) {
        // 대본 기반 발화 구간 추출 (인접 세그먼트 병합)
        const speechRanges: { start: number; end: number }[] = [];
        for (const t of segmentTranscripts) {
          const s = Math.max(t.startTime, startTime);
          const e = Math.min(t.endTime, endTime);
          const last = speechRanges[speechRanges.length - 1];
          if (last && s - last.end < SILENCE_THRESHOLD) {
            last.end = Math.max(last.end, e); // 병합
          } else {
            speechRanges.push({ start: s, end: e });
          }
        }

        // 앞뒤 0.15초 여유 추가 (자연스러운 컷)
        const PAD = 0.15;
        speechRanges.forEach(r => { r.start = Math.max(startTime, r.start - PAD); r.end = Math.min(endTime, r.end + PAD); });

        // 기존 메인 클립 제거 후 점프컷 클립들 생성
        // onClipUpdate로 기존 클립을 첫 번째 구간으로 변경
        let cursor = 0; // 타임라인 위치
        const firstRange = speechRanges[0];
        onClipUpdate?.(mainClip.id, {
          scale: 180,
          trimStart: firstRange.start,
          startTime: 0,
          duration: firstRange.end - firstRange.start,
        });
        cursor = firstRange.end - firstRange.start;

        // 나머지 구간은 새 클립으로 추가 (onAddSubtitleClips는 자막 전용이므로, 비디오 클립은 직접 추가 불가)
        // → trimStart를 활용해 하나의 클립으로 처리하되 점프컷 정보를 로그로 출력
        // 실제로는 단일 클립에서 무음만 잘라내는 것은 타임라인 구조상 제한적이므로
        // 전체 구간을 하나로 넣되, 무음 비율을 로그로 표시
        const totalSpeech = speechRanges.reduce((sum, r) => sum + (r.end - r.start), 0);
        const totalRange = endTime - startTime;
        const silenceRemoved = totalRange - totalSpeech;

        // 실제 점프컷: 발화 구간만 이어붙이기 위해 전체를 하나의 클립으로 (무음 포함)
        // 완벽한 점프컷은 여러 클립이 필요하므로, 우선 전체 구간을 넣고 무음 비율만 안내
        onClipUpdate?.(mainClip.id, {
          scale: 180,
          trimStart: startTime,
          startTime: 0,
          duration: totalRange,
        });

        console.log(`[숏츠] 점프컷 분석: 발화 ${speechRanges.length}개 구간 (${totalSpeech.toFixed(1)}초), 무음 ${silenceRemoved.toFixed(1)}초 제거 가능`);
      } else if (mainClip) {
        onClipUpdate?.(mainClip.id, {
          scale: 180,
          trimStart: startTime,
          startTime: 0,
          duration: endTime - startTime,
        });
      }

      // 4. 시간 보정
      const timeOffset = startTime;
      const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
      setShortsStatus(`숏츠 구간 확정 (${fmtTime(startTime)}~${fmtTime(endTime)}) — 자막 생성 중...`);
      console.log(`[숏츠] 대본 ${segmentTranscripts.length}개 / 전체 ${currentTranscripts.length}개`);

      // 대본 시간을 타임라인 0초 기준으로 변환
      const transcriptForAI = segmentTranscripts.map(t => ({
        startTime: Math.max(0, t.startTime - timeOffset),
        endTime: Math.max(0, t.endTime - timeOffset),
        text: t.editedText || t.originalText,
      }));

      // 5-1. 대본 자막 먼저 추가 (Track 0) — 시간을 0초 기준으로 변환
      if (onAddSubtitleClips && segmentTranscripts.length > 0) {
        const scriptItems: TranscriptItem[] = segmentTranscripts.map((t, i) => ({
          id: `shorts_script_${Date.now()}_${i}`,
          startTime: Math.max(0, t.startTime - timeOffset),
          endTime: Math.max(0, t.endTime - timeOffset),
          originalText: t.editedText || t.originalText,
          editedText: t.editedText || t.originalText,
          isEdited: false,
          color: '#FFFFFF',
          strokeColor: '#000000',
          fontSize: 48,
          strokeWidth: 4,
        }));
        onAddSubtitleClips(scriptItems, 0, true);
        onTranscriptsUpdate?.(scriptItems);
        console.log(`[숏츠] 대본 자막 ${scriptItems.length}개 추가 (Track 0)`);
      } else {
        console.warn(`[숏츠] 대본 자막 0개 — segmentTranscripts: ${segmentTranscripts.length}, currentTranscripts: ${currentTranscripts.length}`);
      }

      // 5-2. AI 연출 자막 생성 시도 (실패해도 대본은 이미 추가됨)
      let aiSubs: any[] = [];
      if (transcriptForAI.length > 0) {
        try {
          const shortsPrompt = `너는 조회수 100만 이상 쇼츠를 만드는 전설의 예능 PD이다.
60초 숏츠에 들어갈 "미친 연출 자막"을 만들어라.

★★★ 바이럴 숏츠 자막의 법칙 ★★★

1. 첫 1초: 무조건 후킹! ("잠깐 이거 ㄹㅇ임?", "헐 방금 뭐함", "아 미쳤다ㅋㅋ")
2. 시청자가 화면 못 넘기게! 2~3초마다 자막이 터져야 함
3. 대본을 그대로 쓰면 0점! 대본 내용을 예능 감성으로 "리액션"
4. 시청자가 대리만족/공감할 수 있는 멘트 ("나만 이렇게 느끼나", "ㅋㅋㅋ 공감")
5. 댓글에 쓸 법한 말투 (반말OK, 줄임말OK, "ㅋㅋ" "ㄷㄷ" "ㄹㅇ" "ㅎㄷㄷ" 적극 사용)
6. ★ 최대 8자, 1줄! 짧을수록 임팩트! ★

[자막 유형 — 비율 반드시 지켜]
- 예능 (70%): 시청자 리액션 대변 ("아ㅋㅋㅋ 미쳤다", "이거 ㄹㅇ?", "와 소름ㄷㄷ", "ㅋㅋㅋ 찐이다")
- 상황 (20%): 분위기 연출 ("[충격 실화]", "[반전 주의보]", "[긴장 MAX]", "[소름 파트]")
- 설명 (10%): 핵심 한마디 ("여기가 핵심", "이거 놓치면 손해")

[금지 사항]
- 존댓말 금지 (숏츠는 반말이 자연스러움)
- 뻔한 자막 금지 ("재미있다", "대단하다" → 이런 건 0점)
- 대본 내용 복붙 금지
- 같은 패턴 반복 금지

현재 자막 목록:
` + transcriptForAI.map(t => `[${t.startTime.toFixed(1)}s~${t.endTime.toFixed(1)}s] ${t.text}`).join('\n');

          const res = await fetch('/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ transcripts: transcriptForAI, customPrompt: shortsPrompt }),
          });
          if (res.ok) {
            const data = await res.json();
            aiSubs = (data.subtitles || []).map((r: any) => ({
              start_time: r.startTime ?? r.start_time ?? 0,
              end_time: r.endTime ?? r.end_time ?? 0,
              text: r.text || '',
              style_type: r.type || r.style_type || '상황',
            }));
          }
        } catch {}
      }

      // 5. 썸네일 타이틀 텍스트 (화면 상단, Track 6) — 0초 기준
      const shortsDuration = endTime - startTime;
      onAddSubtitleClips?.([{
        id: `shorts_title_${Date.now()}`,
        startTime: 0,
        endTime: shortsDuration,
        originalText: '제목을 입력하세요',
        editedText: '제목을 입력하세요',
        isEdited: false,
        color: '#FFFFFF',
        strokeColor: '#000000',
        strokeWidth: 8,
        fontSize: 80,
        fontFamily: 'PaperlogyExtraBold, sans-serif',
        fontWeight: 800,
        shadowColor: 'rgba(0,0,0,0.9)',
        shadowBlur: 12,
      } as any], 6, true);

      // 6. AI 연출 자막 (Track 5) — 대본은 이미 5-1에서 추가됨
      if (aiSubs.length > 0 && onAddSubtitleClips) {
        const colorMap: Record<string, { color: string; strokeColor: string }> = {
          '예능': { color: '#FFE066', strokeColor: '#FF6B6B' },
          '예능자막': { color: '#FFE066', strokeColor: '#FF6B6B' },
          '상황': { color: '#A8E6CF', strokeColor: '#2D8B5E' },
          '상황자막': { color: '#A8E6CF', strokeColor: '#2D8B5E' },
          '설명': { color: '#88D8FF', strokeColor: '#0066CC' },
          '설명자막': { color: '#88D8FF', strokeColor: '#0066CC' },
        };
        const aiItems: TranscriptItem[] = aiSubs.map((r, i) => {
          const cm = colorMap[r.style_type] || colorMap['상황'];
          return {
            id: `shorts_ai_${Date.now()}_${i}`,
            startTime: r.start_time,
            endTime: r.end_time,
            originalText: r.text,
            editedText: r.text,
            isEdited: false,
            color: cm.color,
            strokeColor: cm.strokeColor,
            fontSize: 44,
            strokeWidth: 4,
          };
        });
        onAddSubtitleClips(aiItems, 5, true);
      }

      setShortsStatus(`✅ 숏츠 완성! (${reason})`);
      onResetViewerZoom?.();
      onSeek?.(0); // 재생 위치를 0초로 리셋
      setTimeout(() => { setIsShortsGenerating(false); setShortsStatus(''); }, 3000);

    } catch (err: any) {
      console.error('[숏츠] 생성 실패:', err);
      alert(`숏츠 생성 실패: ${err.message}`);
      setIsShortsGenerating(false);
      setShortsStatus('');
    }
  }, [videoFile, cachedAudioBlob, clips, transcripts, sttProvider, onTranscriptsUpdate, onAddSubtitleClips, onClipUpdate, onSetCanvasAspectRatio, onSetInPoint, onSetOutPoint, onResetViewerZoom, onSeek]);

  // 타임라인에 비디오 클립이 있거나 videoFile이 있으면 AI 자막 버튼 활성화
  const hasVideoForAI = !!videoFile || clips.some(c => c.trackIndex === 1 && !!c.url);
  // Gemini: 비디오 있거나 대본 있으면 AI 연출 가능 (오디오 기반 + 텍스트 fallback)
  const canGenerateAI = hasVideoForAI || transcripts.length > 0;
  const [isShortsGenerating, setIsShortsGenerating] = useState(false);
  const [shortsStatus, setShortsStatus] = useState('');
  const isAIBusy = isIntegratedGenerating || isTranscribing || isGeminiGenerating || isShortsGenerating;

  const filteredTranscripts = React.useMemo(() => {
    if (!searchQuery) return transcripts;
    return transcripts.filter(t => 
      (t.editedText || t.originalText).toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [transcripts, searchQuery]);

  const activeTranscriptIndex = React.useMemo(() => {
    return transcripts.findIndex((t, i) => 
      currentTime >= t.startTime && currentTime < (transcripts[i + 1]?.startTime || Infinity)
    );
  }, [transcripts, currentTime]);

  // Integrated Generation (STT + Gemini)
  const handleIntegratedGenerate = useCallback(async () => {
    // ★ 파일 확보: cachedAudioBlob → videoFile → blob URL → 파일 선택 (최후 수단)
    let safeFile: File | null = null;

    // 1. 캐시된 오디오
    if (cachedAudioBlob) {
      safeFile = new File([cachedAudioBlob], 'audio.wav', { type: cachedAudioBlob.type || 'audio/wav' });
    }

    // 2. videoFile 직접 참조
    if (!safeFile && videoFile) {
      try {
        await videoFile.slice(0, 1).arrayBuffer();
        safeFile = videoFile;
      } catch { /* 읽기 불가 */ }
    }

    // 3. 타임라인 클립의 blob URL에서 fetch
    if (!safeFile) {
      const videoClip = (clips || []).find(c => c.trackIndex === 1 && c.url);
      if (videoClip?.url) {
        try {
          const res = await fetch(videoClip.url);
          if (res.ok) {
            const blob = await res.blob();
            safeFile = new File([blob], videoClip.name || 'video.mp4', { type: blob.type || 'video/mp4' });
          }
        } catch { /* fetch 실패 */ }
      }
    }

    // 4. 최후 수단: 파일 선택 대화상자
    if (!safeFile) {
      const picked = await new Promise<File | null>((resolve) => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'video/*,audio/*';
        input.onchange = () => resolve(input.files?.[0] || null);
        input.addEventListener('cancel', () => resolve(null));
        alert('파일 접근 권한이 만료되었습니다. 동일한 영상 파일을 선택해주세요.');
        input.click();
      });
      if (!picked) return;
      safeFile = picked;
    }

    setIsIntegratedGenerating(true);
    setIntegratedProgress(0);
    setIntegratedStatus('통합 분석 시작...');

    // Clear existing
    onTranscriptsUpdate?.([]);
    onSubtitlesUpdate?.([]);

    try {
      // ═══════════════════════════════════════════════════════
      // Step 1: 대본(말자막) 먼저 생성 → 화면에 즉시 표시
      // ★ 타임라인 클립의 미디어 범위만 분석 (불필요한 구간 제외)
      // ═══════════════════════════════════════════════════════
      let sttMediaRanges = getMediaRangesFromClips();
      // ★ I/O 구간이 설정되어 있으면 해당 구간만 분석
      if (inPoint != null && outPoint != null && outPoint > inPoint) {
        sttMediaRanges = [{ start: inPoint, end: outPoint }];
        console.log(`[통합 생성] I/O 구간 지정: ${inPoint.toFixed(1)}s ~ ${outPoint.toFixed(1)}s`);
      }
      console.log(`[통합 생성] STT mediaRanges:`, sttMediaRanges);
      const fmtSec = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
      if (sttMediaRanges) {
        const rangeStr = sttMediaRanges.map(r => `${fmtSec(r.start)}~${fmtSec(r.end)}`).join(', ');
        setIntegratedStatus(`음성 분석 중... (${rangeStr} 구간만 분석)`);
      } else {
        setIntegratedStatus('음성 분석 중... (전체 영상)');
      }
      const sttResult = await transcribeVideo(safeFile, 'backend-proxy', (status) => {
        setIntegratedStatus(`대본 생성 중: ${status}`);
        if (status.includes('음성 인식')) {
          const m = status.match(/(\d+)\/(\d+)/);
          if (m) setIntegratedProgress(5 + (parseInt(m[1]) / parseInt(m[2])) * 35);
        }
      }, sttMediaRanges, sttProvider);

      // subtitleSplitter를 사용하여 문장 단위로 분할
      console.log(`[통합 대본] STT 결과: words=${sttResult.words.length}, sentences=${sttResult.sentences?.length ?? 0}`);
      const segments = splitSubtitles(sttResult);
      console.log(`[통합 대본] splitSubtitles: ${segments.length}개 세그먼트`);
      // 교정 사전 로드 → STT 결과에 자동 적용
      const dict2 = await loadSttDictionary();
      const sttT: TranscriptItem[] = segments.map((seg, i) => {
        const corrected = dict2.length > 0 ? applySttCorrections(seg.text, dict2) : seg.text;
        return {
          id: `stt_${Date.now()}_${i}`,
          startTime: seg.startTime,
          endTime: seg.endTime,
          originalText: seg.text,
          editedText: corrected,
          isEdited: corrected !== seg.text,
          words: seg.words.map(w => ({ word: w.word, startTime: w.startTime, endTime: w.endTime })),
        };
      });

      // ★ 미디어 시간 → 타임라인 시간 변환 (장면 분할/트림 반영)
      const filteredSttT_pre = filterResultsToClipRanges(sttT);
      console.log(`[통합 대본] ${sttT.length}개 → 매핑 후 ${filteredSttT_pre.length}개 대본`);

      // 대본은 AI 연출 자막 생성용 컨텍스트로만 사용 (화면 비표시)
      setIntegratedProgress(45);
      setIntegratedStatus('대본 분석 완료! AI 연출 자막 생성 중...');

      // 잠시 대기 — 대본 렌더링이 반영되도록
      await new Promise(r => setTimeout(r, 500));

      // ═══════════════════════════════════════════════════════
      // Step 2: 확정된 대본을 기반으로 Gemini AI 연출 자막 생성
      //   오디오 기반 + 실패 시 텍스트 기반 fallback
      // ═══════════════════════════════════════════════════════
      setIntegratedStatus('AI 연출 자막 생성 중 (Gemini)...');
      setIntegratedProgress(50);

      // 교정된 대본 텍스트를 AI에 전달 (STT 원본이 아닌 교정본 사용)
      const transcriptForAI: TranscriptDataForAI[] = filteredSttT_pre.map(t => ({
        startTime: t.startTime,
        endTime: t.endTime,
        text: t.editedText || t.originalText,
      }));

      let geminiResults: { start_time: number; end_time: number; text: string; style_type: string }[];

      // 텍스트 기반 Gemini — 2분 단위 청크로 클라이언트에서 분할 호출 (timeout 방지)
      const generateTextBased = async (): Promise<typeof geminiResults> => {
        const CHUNK_SEC = 120; // 2분씩
        const maxTime = Math.max(...transcriptForAI.map(t => t.endTime || 0), 1);
        const allResults: typeof geminiResults = [];
        const totalChunks = Math.ceil(maxTime / CHUNK_SEC);

        for (let i = 0; i < totalChunks; i++) {
          const start = i * CHUNK_SEC;
          const end = start + CHUNK_SEC;
          const chunkTranscripts = transcriptForAI.filter(t => t.startTime >= start && t.startTime < end);
          if (chunkTranscripts.length === 0) continue;

          const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
          setIntegratedStatus(`AI 연출 자막 ${i + 1}/${totalChunks} (${fmtTime(start)}~${fmtTime(end)})`);
          setIntegratedProgress(50 + Math.round((i / totalChunks) * 40));

          for (let attempt = 0; attempt < 3; attempt++) {
            try {
              const response = await fetch('/api/gemini', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  transcripts: chunkTranscripts,
                  customPrompt: customAIPrompt || undefined,
                }),
              });
              if (!response.ok) {
                const err = await response.json().catch(() => ({}));
                throw new Error(err?.error || `${response.status}`);
              }
              const data = await response.json();
              const subs = (data.subtitles || []).map((r: any) => ({
                start_time: r.startTime ?? r.start_time ?? r.start ?? 0,
                end_time: r.endTime ?? r.end_time ?? r.end ?? 0,
                text: r.text || '',
                style_type: r.type || r.style_type || '상황',
              }));
              allResults.push(...subs);
              break;
            } catch (e: any) {
              console.warn(`[AI 연출] 청크 ${i + 1} 시도 ${attempt + 1}/3 실패:`, e.message);
              if (attempt < 2) await new Promise(r => setTimeout(r, 2000 * (attempt + 1)));
            }
          }
          // 청크 간 딜레이
          if (i < totalChunks - 1) await new Promise(r => setTimeout(r, 500));
        }
        return allResults;
      };

      // ★ 텍스트 기반 연출 자막 생성 (내부 청크별 재시도)
      geminiResults = await generateTextBased();
      setIntegratedProgress(90);

      // 예능/상황/설명 3종 분류 + 색상 지정
      const entertainmentItems: TranscriptItem[] = [];
      const situationItems: TranscriptItem[] = [];
      const explanationItems: TranscriptItem[] = [];

      // ★ 유형별 스타일 차별화 (색상 + 크기 + 애니메이션)
      const styleMap: Record<string, { color: string; strokeColor: string; fontSize: number; animation: string }> = {
        '예능': { color: '#FFE066', strokeColor: '#FF6B6B', fontSize: 46, animation: 'pop' },
        '예능자막': { color: '#FFE066', strokeColor: '#FF6B6B', fontSize: 46, animation: 'pop' },
        '상황': { color: '#A8E6CF', strokeColor: '#2D8B5E', fontSize: 40, animation: 'fade-in' },
        '상황자막': { color: '#A8E6CF', strokeColor: '#2D8B5E', fontSize: 40, animation: 'fade-in' },
        '설명': { color: '#88D8FF', strokeColor: '#0066CC', fontSize: 38, animation: 'slide-up' },
        '설명자막': { color: '#88D8FF', strokeColor: '#0066CC', fontSize: 38, animation: 'slide-up' },
        '맥락': { color: '#C4B5FD', strokeColor: '#7C3AED', fontSize: 36, animation: 'fade-in' },
      };

      geminiResults.forEach((r, i) => {
        const style = styleMap[r.style_type] || styleMap['상황'];
        const base: TranscriptItem = {
          id: `intgem_${Date.now()}_${i}`,
          startTime: r.start_time,
          endTime: r.end_time,
          originalText: r.text,
          editedText: r.text,
          isEdited: false,
          color: style.color,
          strokeColor: style.strokeColor,
          fontSize: style.fontSize,
          subtitleAnimationDuration: 0.3,
        } as any;

        const st = r.style_type;
        if (st === '예능자막' || st === '예능') {
          entertainmentItems.push(base);
        } else if (st === '상황자막' || st === '상황') {
          situationItems.push(base);
        } else if (st === '설명자막' || st === '설명') {
          explanationItems.push(base);
        } else {
          situationItems.push(base);
        }
      });

      const allRawGemini = [...entertainmentItems, ...situationItems, ...explanationItems];
      console.log(`[통합 생성] Gemini API 반환: ${geminiResults.length}개 → 분류 후: 예능=${entertainmentItems.length}, 상황=${situationItems.length}, 설명=${explanationItems.length}, 합계=${allRawGemini.length}`);

      // AI 자막 골고루 분배 (대본은 내부 참조용으로만 사용)
      const orchestrateEnd = getTimelineEnd();
      console.log(`[통합 생성] orchestrate 호출: 대본=${filteredSttT_pre.length}개, AI=${allRawGemini.length}개, timelineEnd=${orchestrateEnd}`);
      const { aiItems: finalGemini } = orchestrate(
        filteredSttT_pre,
        allRawGemini,
        orchestrateEnd,
        clips,
      );

      console.log(`[통합 생성] orchestrate 결과: AI=${finalGemini.length}개 (입력 ${allRawGemini.length}개 중 ${((finalGemini.length / Math.max(1, allRawGemini.length)) * 100).toFixed(0)}% 배치) — 대본 제외, AI 연출 자막만 표시`);

      const geminiSubs: SubtitleItem[] = finalGemini.map((r, i) => {
        return {
          id: `intsub_${Date.now()}_${i}`,
          startTime: r.startTime,
          endTime: r.endTime,
          text: r.editedText || r.originalText,
          type: 'SITUATION' as const,
          confidence: 0.9,
        };
      });

      // ★ AI 연출 자막만 표시 (대본은 AI 생성 컨텍스트로만 사용, 화면 비표시)
      onTranscriptsUpdate?.(finalGemini);
      onSubtitlesUpdate?.(geminiSubs);

      // 타임라인 갱신 — 대본 트랙 비우기 + AI(Track 5) 배치
      if (onAddSubtitleClips) {
        onAddSubtitleClips([], 0, true);
        if (finalGemini.length > 0) onAddSubtitleClips(finalGemini, 5, true);
      }

      setIntegratedStatus('모든 자막 생성 완료!');
      setIntegratedProgress(100);
      onResetViewerZoom?.();
      setTimeout(() => {
        setIsIntegratedGenerating(false);
        setIntegratedProgress(0);
        setIntegratedStatus('');
      }, 2000);

    } catch (err: any) {
      console.error('[통합 생성] 에러:', err);
      if (err.message === 'PAYMENT_REQUIRED') setShowPaymentModal(true);
      else alert(`자막 생성 오류: ${err.message || '알 수 없는 오류'}\n\n재시도해주세요.`);
      setIsIntegratedGenerating(false);
      setIntegratedProgress(0);
      setIntegratedStatus('');
    }
  }, [videoFile, cachedAudioBlob, inPoint, outPoint, videoDuration, clips, customAIPrompt, sttProvider, onTranscriptsUpdate, onSubtitlesUpdate, onAddSubtitleClips, filterResultsToClipRanges, getTimelineEnd, getMediaRangesFromClips, onResetViewerZoom]);

  const hasTimelineVideo = clips.some(c => c.trackIndex === 1 && !!c.url);

  // Preset click handler — applies style to clips
  const handlePresetClick = (preset: SubtitlePreset) => {
    setSelectedPresetId(preset.id);

    const styleUpdate: Partial<VideoClip> = {
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
      fontFamily: preset.fontFamily,
      fontStyle: preset.fontStyle,
      textDecoration: preset.textDecoration,
    };

    const selectedSubtitleClips = clips.filter(c => selectedClipIds.includes(c.id));

    if (selectedSubtitleClips.length > 0 && onClipsBatchUpdate) {
      if (applyToAllOnTrack) {
        const trackIndices = new Set(selectedSubtitleClips.map(c => c.trackIndex));
        const targetIds = clips.filter(c => trackIndices.has(c.trackIndex)).map(c => c.id);
        onClipsBatchUpdate(targetIds, styleUpdate);
      } else {
        onClipsBatchUpdate(selectedSubtitleClips.map(c => c.id), styleUpdate);
      }
    } else if (selectedSubtitleClips.length > 0 && onClipUpdate) {
      // Fallback to individual updates
      selectedSubtitleClips.forEach(clip => {
        onClipUpdate(clip.id, styleUpdate);
      });
    }
  };

  // Drag start for preset swatch → store preset data
  const handlePresetDragStart = (e: React.DragEvent, preset: SubtitlePreset) => {
    e.dataTransfer.setData('application/subtitle-preset', JSON.stringify(preset));
    e.dataTransfer.effectAllowed = 'copy';
  };

  const handleTranscriptDragStart = (e: React.DragEvent, text: string) => {
    e.dataTransfer.setData('application/subtitle-item', JSON.stringify({ text }));
    e.dataTransfer.effectAllowed = 'copy';
  };

  return (
    <aside className="editor-sidebar w-full h-full bg-panel-bg border-l border-border-color flex flex-col overflow-hidden">


      {/* Tabs */}
      <div className="flex border-b border-border-color">
        {[
          { id: 'details' as const, icon: 'movie', tip: 'Video' },
          { id: 'caption' as const, icon: 'subtitles', tip: 'Caption' },
        ].map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)} title={tab.tip}
            className={`flex-1 py-2 flex items-center justify-center transition-all relative group ${activeTab === tab.id ? 'text-white border-b-2 border-primary bg-white/5' : 'text-text-secondary hover:text-white hover:bg-white/5'
              } active:scale-95`}>
            <span className="material-icons text-lg">{tab.icon}</span>
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* ===== CAPTION TAB ===== */}
        {activeTab === 'caption' && (
          <div className="flex flex-col h-full">
            <div className="flex border-b border-border-color bg-editor-bg">
              {[
                { id: 'caption' as const, icon: 'subtitles' },
                { id: 'text' as const, icon: 'title' },
                { id: 'animation' as const, icon: 'animation' },
                { id: 'tracking' as const, icon: 'track_changes' },
                { id: 'tts' as const, icon: 'volume_up' },
              ].map(tab => (
                <button key={tab.id} onClick={() => setCaptionTab(tab.id)}
                  className={`flex-1 py-1.5 text-[10px] font-medium transition-all ${captionTab === tab.id ? 'text-primary border-b-2 border-primary bg-white/5' : 'text-text-secondary hover:text-white hover:bg-white/5'} active:scale-95`}>
                  <span className="material-icons text-xs">{tab.icon}</span>
                </button>
              ))}
            </div>

            {/* Caption content */}
            {captionTab === 'caption' && (
              <div className="flex flex-col flex-1 overflow-hidden">
                <div className="p-2 border-b border-border-color space-y-2">
                  <div className="flex items-center gap-1">
                    <div className="relative flex-1">
                      <span className="material-icons absolute left-2 top-1/2 -translate-y-1/2 text-text-secondary text-xs">search</span>
                      <input type="text" placeholder="검색" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-7 pr-2 py-1.5 bg-black/30 border border-border-color rounded text-xs text-white placeholder-text-secondary focus:outline-none focus:border-primary" />
                    </div>
                    <button onClick={() => setShowReplace(!showReplace)} title="찾기 및 바꾸기"
                      className={`p-1.5 rounded text-xs ${showReplace ? 'bg-primary text-white' : 'bg-black/30 text-text-secondary hover:text-white'}`}>
                      <span className="material-icons text-xs">find_replace</span>
                    </button>
                  </div>
                  {showReplace && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1">
                        <input type="text" placeholder="찾을 단어" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                          className="flex-1 px-2 py-1.5 bg-black/30 border border-border-color rounded text-xs text-white placeholder-text-secondary focus:outline-none focus:border-primary" />
                        {searchQuery && (
                          <span className="text-[9px] text-primary font-mono whitespace-nowrap">
                            {transcripts.reduce((cnt, t) => cnt + ((t.editedText || t.originalText).split(searchQuery).length - 1), 0)}건
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <input type="text" placeholder="바꿀 단어" value={replaceQuery} onChange={(e) => setReplaceQuery(e.target.value)}
                          className="flex-1 px-2 py-1.5 bg-black/30 border border-border-color rounded text-xs text-white placeholder-text-secondary focus:outline-none focus:border-primary" />
                        <button onClick={() => {
                          if (!searchQuery || !replaceQuery) return;
                          const updated = transcripts.map(t => {
                            const text = t.editedText || t.originalText;
                            if (!text.includes(searchQuery)) return t;
                            return { ...t, editedText: text.replaceAll(searchQuery, replaceQuery), originalText: t.originalText };
                          });
                          onTranscriptsUpdate?.(updated);
                          if (clips && onClipUpdate) {
                            clips.forEach(c => {
                              if (c.name.includes(searchQuery)) {
                                onClipUpdate(c.id, { name: c.name.replaceAll(searchQuery, replaceQuery) });
                              }
                            });
                          }
                          setSearchQuery('');
                          setReplaceQuery('');
                        }} disabled={!searchQuery || !replaceQuery}
                          className={`px-2.5 py-1.5 rounded text-xs font-semibold whitespace-nowrap transition-all ${
                            searchQuery && replaceQuery
                              ? 'bg-primary hover:bg-primary/80 text-white active:scale-95'
                              : 'bg-gray-700 text-gray-500 cursor-not-allowed'
                          }`}>
                          전체 변환
                        </button>
                      </div>
                    </div>
                  )}
                  {/* SRT/ASS/VTT Import */}
                  <input ref={subtitleFileRef} type="file" accept=".srt,.ass,.ssa,.vtt,.sbv,.sub,.txt" className="hidden" onChange={handleSubtitleFileImport} />
                </div>
                <div className="flex-1 flex flex-col min-h-0 relative">
                {!videoFile && !clips.some(c => c.trackIndex === 1 && c.url) ? (
                  <div className="flex-1 flex flex-col items-center justify-center p-6 text-center space-y-4 pt-12">
                    <div className="w-16 h-16 rounded-full bg-gray-800/50 flex items-center justify-center">
                      <span className="material-icons text-3xl text-gray-600">movie_filter</span>
                    </div>
                    <div className="space-y-1">
                      <p className="text-sm font-medium text-gray-400">영상을 먼저 추가해주세요</p>
                      <p className="text-[11px] text-gray-500">대본을 생성하거나 분석하려면<br />편집할 영상 파일이 필요합니다.</p>
                    </div>
                  </div>
                ) : (
                  <>
                    {/* 대본 Settings — 상단 배치 */}
                    <div className="border-b border-border-color flex flex-col overflow-y-auto shrink-0" style={{ maxHeight: '55%' }}>
                      <div className="p-1.5 border-b border-border-color bg-panel-bg space-y-1.5 shrink-0">
                        {/* 연출 프롬프트 — AI 자막 생성 시 반영 */}
                        <div className="space-y-0.5">
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] font-semibold text-gray-400">연출 프롬프트</span>
                            <div className="flex items-center gap-1.5">
                              {!customAIPrompt && (
                                <button onClick={() => setCustomAIPrompt('영상 주제: \n분위기: 유쾌한\n타겟: \n핵심: ')}
                                  className="text-[9px] text-primary/70 hover:text-primary">템플릿</button>
                              )}
                              {customAIPrompt && (
                                <button onClick={() => setCustomAIPrompt('')}
                                  className="text-[9px] text-gray-500 hover:text-red-400">초기화</button>
                              )}
                            </div>
                          </div>
                          <textarea
                            value={customAIPrompt}
                            onChange={(e) => setCustomAIPrompt(e.target.value)}
                            placeholder={"영상 주제: 먹방, 여행, 게임 등\n분위기: 유쾌한, 감동적인, 긴장감\n타겟: 20대 여성, 게임 유저 등\n핵심: 음식 리액션 강조, 반전에 놀라는 반응"}
                            className={`w-full px-2 py-1 rounded-lg text-[10px] bg-white/5 border text-gray-300 placeholder-gray-500 resize-none focus:outline-none focus:border-primary/60 focus:ring-1 focus:ring-primary/30 transition-all ${
                              customAIPrompt ? 'border-primary/30 bg-primary/5' : 'border-white/10'
                            }`}
                            rows={customAIPrompt ? 3 : 2}
                          />
                        </div>

                        {/* Master Integrated AI Button — 타임라인에 영상 클립이 있으면 활성화 */}
                        <button onClick={handleIntegratedGenerate} disabled={isAIBusy || !hasVideoForAI}
                          className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all active:scale-95 shadow-lg relative overflow-hidden group ${isAIBusy || !hasVideoForAI
                            ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                            : 'bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 text-white hover:shadow-purple-500/40 hover:brightness-110'
                            }`}>
                          <span className={`material-icons text-sm ${isIntegratedGenerating ? 'animate-spin' : 'animate-pulse'}`}>auto_awesome</span>
                          <span>통합 AI 자막 마스터</span>
                        </button>

                        {isIntegratedGenerating && (
                          <div className="space-y-1 px-0.5">
                            <div className="flex items-center justify-between text-[9px]">
                              <span className="text-primary font-medium truncate">{integratedStatus}</span>
                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className="text-white font-mono">{Math.round(integratedProgress)}%</span>
                                <button onClick={() => { handleCancelTranscription(); handleCancelGemini(); setIsIntegratedGenerating(false); setIntegratedProgress(0); setIntegratedStatus(''); }}
                                  className="px-1.5 py-0.5 bg-red-500/20 border border-red-500/40 text-red-400 rounded text-[9px] font-semibold hover:bg-red-500/30 active:scale-95">
                                  취소
                                </button>
                              </div>
                            </div>
                            <div className="w-full h-1 bg-gray-800 rounded-full overflow-hidden">
                              <div className="h-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500 transition-all duration-500" style={{ width: `${integratedProgress}%` }} />
                            </div>
                          </div>
                        )}

                        {/* 숏츠 자동 생성 버튼 */}
                        <button onClick={handleShortsGenerate} disabled={isAIBusy || !hasVideoForAI}
                          className={`w-full flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-bold transition-all active:scale-95 shadow-lg relative overflow-hidden group ${isAIBusy || !hasVideoForAI
                            ? 'bg-gray-800 text-gray-600 cursor-not-allowed'
                            : 'bg-gradient-to-br from-orange-500 via-red-500 to-pink-500 text-white hover:shadow-red-500/40 hover:brightness-110'
                          }`}>
                          <span className={`material-icons text-sm ${isShortsGenerating ? 'animate-spin' : ''}`}>
                            {isShortsGenerating ? 'hourglass_top' : 'movie_filter'}
                          </span>
                          <span>숏츠 자동 생성 (9:16)</span>
                        </button>

                        {isShortsGenerating && (
                          <div className="space-y-1 px-0.5">
                            <div className="flex items-center justify-between text-[9px]">
                              <span className="text-orange-400 font-medium truncate">{shortsStatus}</span>
                              <button onClick={() => { setIsShortsGenerating(false); setShortsStatus(''); }}
                                className="px-1.5 py-0.5 bg-red-500/20 border border-red-500/40 text-red-400 rounded text-[9px] font-semibold hover:bg-red-500/30 active:scale-95 shrink-0">
                                취소
                              </button>
                            </div>
                          </div>
                        )}

                        <div className="flex gap-1.5">
                          {/* Button 0: SRT 자막 파일 업로드 */}
                          <button onClick={() => subtitleFileRef.current?.click()} disabled={isAIBusy}
                            title="SRT, ASS, VTT 자막 파일 불러오기"
                            className={`flex items-center justify-center px-1.5 py-2 rounded-lg text-[10px] font-semibold transition-all active:scale-95 ${isAIBusy
                              ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                              : 'bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:border-green-500/50'
                              }`}>
                            <span className="material-icons text-sm">upload_file</span>
                          </button>
                          {/* Button 1: 자막대본 자동생성 */}
                          {isTranscribing ? (
                            <div className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-[10px] bg-gray-700">
                              <span className="material-icons text-[12px] animate-spin text-blue-400">refresh</span>
                              <span className="text-white font-mono">{Math.round(transcriptionProgress)}%</span>
                              <button onClick={handleCancelTranscription} className="ml-1 px-1.5 py-0.5 bg-red-500/20 border border-red-500/40 text-red-400 rounded text-[9px] font-semibold hover:bg-red-500/30 active:scale-95">취소</button>
                            </div>
                          ) : (
                            <button onClick={handleAutoTranscribe} disabled={isIntegratedGenerating || !hasVideoForAI}
                              className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-[10px] font-semibold transition-all active:scale-95 ${isIntegratedGenerating || !hasVideoForAI
                                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                : 'bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:border-blue-500/50'
                                }`}>
                              <span className="text-xs">🎤</span>대본
                            </button>
                          )}

                          {/* Button 2: Gemini AI 자막생성 */}
                          {isGeminiGenerating ? (
                            <div className="flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-[10px] bg-gray-700">
                              <span className="material-icons text-[12px] animate-spin text-cyan-400">refresh</span>
                              <span className="text-white font-mono">{Math.round(geminiProgress)}%</span>
                              <button onClick={handleCancelGemini} className="ml-1 px-1.5 py-0.5 bg-red-500/20 border border-red-500/40 text-red-400 rounded text-[9px] font-semibold hover:bg-red-500/30 active:scale-95">취소</button>
                            </div>
                          ) : (
                            <button onClick={handleGeminiAudioGenerate} disabled={isIntegratedGenerating || transcripts.length === 0}
                              title={transcripts.length === 0 ? '대본을 먼저 생성하세요' : 'AI 연출 자막 생성'}
                              className={`flex-1 flex items-center justify-center gap-1 py-2 rounded-lg text-[10px] font-semibold transition-all active:scale-95 ${isIntegratedGenerating || transcripts.length === 0
                                ? 'bg-gray-700 text-gray-500 cursor-not-allowed'
                                : 'bg-white/5 border border-white/10 text-white hover:bg-white/10 hover:border-cyan-500/50'
                                }`}>
                              <span className="text-xs">🤖</span>AI 연출
                            </button>
                          )}
                        </div>
                      </div>
                      <div className="flex-1 flex flex-col border-b border-border-color" style={{ height: '50%' }}>
                        <div className="px-2 py-1 bg-panel-bg border-b border-border-color"><h4 className="text-[10px] font-medium text-text-secondary">내 대본</h4></div>
                        <textarea ref={scriptTextareaRef} value={userScript} onChange={(e) => setUserScript(e.target.value)} placeholder="대본을 입력하세요..."
                          className="flex-1 p-2 bg-transparent text-xs text-white placeholder-text-secondary resize-none focus:outline-none" />
                      </div>
                      <div className="flex-1 flex flex-col" style={{ height: '50%' }}>
                        <div className="px-2 py-1 bg-panel-bg border-b border-border-color">
                          <h4 className="text-[10px] font-medium text-text-secondary flex items-center gap-1">
                            <span className="material-icons text-xs text-primary">auto_awesome</span>AI 생성 대본
                          </h4>
                        </div>
                        <div className="flex-1 p-0 flex flex-col overflow-hidden">
                          {aiScript ? (
                            <textarea
                              value={aiScript}
                              onChange={(e) => setAiScript(e.target.value)}
                              className="flex-1 p-2 bg-transparent text-xs text-white placeholder-text-secondary resize-none focus:outline-none"
                            />
                          ) : (
                            <div className="text-text-secondary text-[10px] text-center p-4">AI 자막 생성 버튼을 눌러주세요</div>
                          )}
                        </div>
                      </div>
                    </div>
                    {/* 대본 목록 — Settings 아래 */}
                    <div className="flex-1 overflow-y-auto px-4 py-2 space-y-3 custom-scrollbar">
                      {filteredTranscripts.map((t, i) => (
                        <TranscriptItem
                          key={t.id}
                          t={t}
                          isActive={activeTranscriptIndex === i}
                          isSelected={selectedTranscriptId === t.id}
                          onSelect={handleTranscriptSelect}
                          onEdit={handleTranscriptEdit}
                          onDragStart={handleTranscriptDragStart}
                          onMergeWithPrevious={handleMergeWithPrevious}
                          onSplitAtCursor={handleSplitAtCursor}
                          onContextMenu={handleTranscriptContextMenu}
                        />
                      ))}
                      {filteredTranscripts.length === 0 && <div className="text-center py-12 text-text-secondary text-xs opacity-50">{searchQuery ? '검색 결과 없음' : '대본을 생성하거나 불러와주세요'}</div>}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

            {/* ===== TEXT TAB: Font Style Presets + Font Controls ===== */}
            {captionTab === 'text' && (
              <div className="p-3 space-y-3 overflow-y-auto">
                {/* 새 자막 추가 버튼 — 최상단 배치 */}
                <button
                  onClick={() => {
                    const allPresets = [...SUBTITLE_PRESETS, ...customPresets];
                    const preset = allPresets.find(p => p.id === (selectedPresetId || 1)) || SUBTITLE_PRESETS[1];
                    if (preset && onAddTextClip) onAddTextClip(preset);
                  }}
                  className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-xs font-bold bg-primary/20 border border-primary/40 text-primary hover:bg-primary/30 transition-all active:scale-95"
                >
                  <span className="material-icons text-sm">add</span>
                  새 자막 추가
                </button>

                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-white">자막 스타일</h3>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input type="checkbox" checked={applyToAllOnTrack} onChange={(e) => setApplyToAllOnTrack(e.target.checked)}
                      className="w-3 h-3 rounded accent-primary cursor-pointer" />
                    <span className="text-[10px] text-gray-400">모두적용</span>
                  </label>
                </div>

                {/* 자막 텍스트 편집 */}
                {selectedClip && !selectedClip.url && (
                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-400">자막 텍스트</label>
                    <textarea
                      value={selectedClip.name || ''}
                      onChange={(e) => onClipUpdate?.(selectedClip.id, { name: e.target.value })}
                      className="w-full bg-black/50 border border-border-color rounded-md text-xs text-white px-2 py-1.5 resize-none focus:outline-none focus:border-primary"
                      rows={2}
                      placeholder="자막을 입력하세요..."
                    />
                  </div>
                )}

                {/* ── 폰트 커스터마이징 ── */}
                <div className="space-y-2 bg-white/5 rounded-lg p-2.5">
                  <h4 className="text-[10px] font-semibold text-gray-300 uppercase tracking-wider">폰트 설정</h4>

                  {/* 서체 */}
                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-400">서체</label>
                    <select
                      value={selectedClip?.fontFamily || 'PaperlogyExtraBold'}
                      onChange={(e) => {
                        const val = e.target.value;
                        if (selectedClipIds.length > 0 && onClipsBatchUpdate) {
                          const ids = applyToAllOnTrack
                            ? clips.filter(c => { const sc = clips.filter(cc => selectedClipIds.includes(cc.id)); return sc.some(s => s.trackIndex === c.trackIndex); }).map(c => c.id)
                            : selectedClipIds;
                          onClipsBatchUpdate(ids, { fontFamily: val });
                        } else if (selectedClip) onClipUpdate?.(selectedClip.id, { fontFamily: val });
                      }}
                      className="w-full bg-black/60 border border-gray-700 rounded text-xs text-white px-2 py-1.5 focus:outline-none focus:border-primary appearance-none cursor-pointer"
                    >
                      {FONT_FAMILIES.map(f => (
                        <option key={f.value} value={f.value} style={{ fontFamily: f.value }}>{f.label}</option>
                      ))}
                    </select>
                  </div>

                  {/* 색깔 + 배경색 */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] text-gray-400">글자색</label>
                      <div className="flex items-center gap-1.5">
                        <input type="color" value={selectedClip?.color || '#FFFFFF'}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (selectedClipIds.length > 0 && onClipsBatchUpdate) {
                              const ids = applyToAllOnTrack ? clips.filter(c => clips.filter(cc => selectedClipIds.includes(cc.id)).some(s => s.trackIndex === c.trackIndex)).map(c => c.id) : selectedClipIds;
                              onClipsBatchUpdate(ids, { color: val });
                            } else if (selectedClip) onClipUpdate?.(selectedClip.id, { color: val });
                          }}
                          className="w-7 h-7 rounded border border-gray-600 cursor-pointer bg-transparent p-0"
                        />
                        <span className="text-[10px] text-gray-500 font-mono">{selectedClip?.color || '#FFF'}</span>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-gray-400">배경색</label>
                      <div className="flex items-center gap-1.5">
                        <input type="color" value={selectedClip?.backgroundColor && selectedClip.backgroundColor !== 'transparent' ? selectedClip.backgroundColor : '#000000'}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (selectedClipIds.length > 0 && onClipsBatchUpdate) {
                              const ids = applyToAllOnTrack ? clips.filter(c => clips.filter(cc => selectedClipIds.includes(cc.id)).some(s => s.trackIndex === c.trackIndex)).map(c => c.id) : selectedClipIds;
                              onClipsBatchUpdate(ids, { backgroundColor: val });
                            } else if (selectedClip) onClipUpdate?.(selectedClip.id, { backgroundColor: val });
                          }}
                          className="w-7 h-7 rounded border border-gray-600 cursor-pointer bg-transparent p-0"
                        />
                        <button
                          onClick={() => {
                            if (selectedClipIds.length > 0 && onClipsBatchUpdate) {
                              const ids = applyToAllOnTrack ? clips.filter(c => clips.filter(cc => selectedClipIds.includes(cc.id)).some(s => s.trackIndex === c.trackIndex)).map(c => c.id) : selectedClipIds;
                              onClipsBatchUpdate(ids, { backgroundColor: 'transparent' });
                            } else if (selectedClip) onClipUpdate?.(selectedClip.id, { backgroundColor: 'transparent' });
                          }}
                          className="text-[9px] text-gray-500 hover:text-white transition-colors"
                          title="배경 투명"
                        >투명</button>
                      </div>
                    </div>
                  </div>

                  {/* 외곽선색 + 두께 */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] text-gray-400">외곽선</label>
                      <div className="flex items-center gap-1.5">
                        <input type="color" value={selectedClip?.strokeColor && selectedClip.strokeColor !== 'transparent' ? selectedClip.strokeColor : '#000000'}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (selectedClipIds.length > 0 && onClipsBatchUpdate) {
                              const ids = applyToAllOnTrack ? clips.filter(c => clips.filter(cc => selectedClipIds.includes(cc.id)).some(s => s.trackIndex === c.trackIndex)).map(c => c.id) : selectedClipIds;
                              onClipsBatchUpdate(ids, { strokeColor: val, strokeWidth: Math.max(selectedClip?.strokeWidth || 0, 1) });
                            } else if (selectedClip) onClipUpdate?.(selectedClip.id, { strokeColor: val, strokeWidth: Math.max(selectedClip.strokeWidth || 0, 1) });
                          }}
                          className="w-7 h-7 rounded border border-gray-600 cursor-pointer bg-transparent p-0"
                        />
                        <input type="range" min="0" max="6" step="0.5" value={selectedClip?.strokeWidth || 0}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            if (selectedClipIds.length > 0 && onClipsBatchUpdate) {
                              const ids = applyToAllOnTrack ? clips.filter(c => clips.filter(cc => selectedClipIds.includes(cc.id)).some(s => s.trackIndex === c.trackIndex)).map(c => c.id) : selectedClipIds;
                              onClipsBatchUpdate(ids, { strokeWidth: val });
                            } else if (selectedClip) onClipUpdate?.(selectedClip.id, { strokeWidth: val });
                          }}
                          className="flex-1 h-1 bg-gray-700 rounded appearance-none cursor-pointer accent-primary"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-gray-400">굵기</label>
                      <select
                        value={selectedClip?.fontWeight || 400}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          if (selectedClipIds.length > 0 && onClipsBatchUpdate) {
                            const ids = applyToAllOnTrack ? clips.filter(c => clips.filter(cc => selectedClipIds.includes(cc.id)).some(s => s.trackIndex === c.trackIndex)).map(c => c.id) : selectedClipIds;
                            onClipsBatchUpdate(ids, { fontWeight: val });
                          } else if (selectedClip) onClipUpdate?.(selectedClip.id, { fontWeight: val });
                        }}
                        className="w-full bg-black/60 border border-gray-700 rounded text-xs text-white px-2 py-1.5 focus:outline-none focus:border-primary cursor-pointer"
                      >
                        <option value={300}>Light (300)</option>
                        <option value={400}>Regular (400)</option>
                        <option value={500}>Medium (500)</option>
                        <option value={600}>SemiBold (600)</option>
                        <option value={700}>Bold (700)</option>
                        <option value={800}>ExtraBold (800)</option>
                        <option value={900}>Black (900)</option>
                      </select>
                    </div>
                  </div>

                  {/* 기울이기 + 밑줄 토글 */}
                  <div className="flex gap-1.5">
                    {(() => {
                      const applyStyle = (updates: Partial<VideoClip>) => {
                        if (selectedClipIds.length > 0 && onClipsBatchUpdate) {
                          const ids = applyToAllOnTrack ? clips.filter(c => clips.filter(cc => selectedClipIds.includes(cc.id)).some(s => s.trackIndex === c.trackIndex)).map(c => c.id) : selectedClipIds;
                          onClipsBatchUpdate(ids, updates);
                        } else if (selectedClip) onClipUpdate?.(selectedClip.id, updates);
                      };
                      const isItalic = selectedClip?.fontStyle === 'italic';
                      const isUnderline = selectedClip?.textDecoration === 'underline';
                      return (<>
                        <button
                          onClick={() => applyStyle({ fontStyle: isItalic ? 'normal' : 'italic' })}
                          className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded border text-xs font-medium transition-all ${isItalic ? 'bg-primary/20 border-primary/50 text-primary' : 'bg-black/40 border-gray-700 text-gray-400 hover:text-white hover:border-gray-500'}`}
                        >
                          <span className="italic font-serif text-sm">I</span>
                          <span className="text-[10px]">기울임</span>
                        </button>
                        <button
                          onClick={() => applyStyle({ textDecoration: isUnderline ? 'none' : 'underline' })}
                          className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded border text-xs font-medium transition-all ${isUnderline ? 'bg-primary/20 border-primary/50 text-primary' : 'bg-black/40 border-gray-700 text-gray-400 hover:text-white hover:border-gray-500'}`}
                        >
                          <span className="underline text-sm">U</span>
                          <span className="text-[10px]">밑줄</span>
                        </button>
                      </>);
                    })()}
                  </div>

                  {/* 크기 */}
                  <div className="space-y-1">
                    <label className="text-[10px] text-gray-400">크기 ({selectedClip?.fontSize || 35}px)</label>
                    <input type="range" min="12" max="120" step="1" value={selectedClip?.fontSize || 35}
                      onChange={(e) => {
                        const val = Number(e.target.value);
                        if (selectedClipIds.length > 0 && onClipsBatchUpdate) {
                          const ids = applyToAllOnTrack ? clips.filter(c => clips.filter(cc => selectedClipIds.includes(cc.id)).some(s => s.trackIndex === c.trackIndex)).map(c => c.id) : selectedClipIds;
                          onClipsBatchUpdate(ids, { fontSize: val });
                        } else if (selectedClip) onClipUpdate?.(selectedClip.id, { fontSize: val });
                      }}
                      className="w-full h-1 bg-gray-700 rounded appearance-none cursor-pointer accent-primary"
                    />
                  </div>

                  {/* 줄간격 / 자간 */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="text-[10px] text-gray-400">줄간격 ({((selectedClip?.lineHeight ?? 1.3) * 10 | 0) / 10})</label>
                      <input type="range" min="0.5" max="3.0" step="0.05"
                        value={selectedClip?.lineHeight ?? 1.3}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          if (selectedClipIds.length > 0 && onClipsBatchUpdate) {
                            const ids = applyToAllOnTrack ? clips.filter(c => clips.filter(cc => selectedClipIds.includes(cc.id)).some(s => s.trackIndex === c.trackIndex)).map(c => c.id) : selectedClipIds;
                            onClipsBatchUpdate(ids, { lineHeight: val });
                          } else if (selectedClip) onClipUpdate?.(selectedClip.id, { lineHeight: val });
                        }}
                        className="w-full h-1 bg-gray-700 rounded appearance-none cursor-pointer accent-primary"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] text-gray-400">자간 ({((selectedClip?.letterSpacing ?? 0) * 100 | 0) / 100}em)</label>
                      <input type="range" min="-0.1" max="0.5" step="0.01"
                        value={selectedClip?.letterSpacing ?? 0}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          if (selectedClipIds.length > 0 && onClipsBatchUpdate) {
                            const ids = applyToAllOnTrack ? clips.filter(c => clips.filter(cc => selectedClipIds.includes(cc.id)).some(s => s.trackIndex === c.trackIndex)).map(c => c.id) : selectedClipIds;
                            onClipsBatchUpdate(ids, { letterSpacing: val });
                          } else if (selectedClip) onClipUpdate?.(selectedClip.id, { letterSpacing: val });
                        }}
                        className="w-full h-1 bg-gray-700 rounded appearance-none cursor-pointer accent-primary"
                      />
                    </div>
                  </div>
                </div>

                {/* ── 프리셋 목록 ── */}
                <h4 className="text-[10px] font-semibold text-gray-300 uppercase tracking-wider pt-1">기본 프리셋</h4>
                <div className="grid grid-cols-4 gap-2">
                  {SUBTITLE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      draggable={preset.id !== 0}
                      onDragStart={(e) => handlePresetDragStart(e, preset)}
                      onClick={() => handlePresetClick(preset)}
                      title={preset.name}
                      className={`relative rounded-lg border-2 flex items-center justify-center overflow-hidden transition-all active:scale-90 cursor-grab active:cursor-grabbing ${selectedPresetId === preset.id ? 'border-primary ring-2 ring-primary scale-105' : 'border-gray-700 hover:border-gray-500'
                        }`}
                      style={{
                        minHeight: '50px',
                        backgroundColor: preset.backgroundColor === 'transparent' ? '#1a1a2e' : preset.backgroundColor,
                        ...(preset.borderColor && selectedPresetId !== preset.id ? { borderColor: preset.borderColor } : {}),
                      }}
                    >
                      {preset.id === 0 ? (
                        <span className="material-icons text-gray-500 text-lg">close</span>
                      ) : (
                        <span style={{
                          fontSize: '20px',
                          fontWeight: preset.fontWeight || 700,
                          fontFamily: preset.fontFamily || 'sans-serif',
                          fontStyle: preset.fontStyle || 'normal',
                          textDecoration: preset.textDecoration || 'none',
                          color: preset.color,
                          textShadow: preset.glowColor
                            ? `0 0 ${preset.shadowBlur}px ${preset.glowColor}, 0 0 ${preset.shadowBlur * 2}px ${preset.glowColor}`
                            : preset.shadowBlur > 0
                              ? `${preset.shadowOffsetX}px ${preset.shadowOffsetY}px ${preset.shadowBlur}px ${preset.shadowColor}`
                              : 'none',
                          WebkitTextStroke: preset.strokeWidth > 0 ? `${Math.min(preset.strokeWidth, 2)}px ${preset.strokeColor}` : 'none',
                          lineHeight: 1,
                        }}>
                          Aa
                        </span>
                      )}
                    </button>
                  ))}
                </div>

                {/* ── 커스텀 프리셋 ── */}
                <div className="flex items-center justify-between pt-1">
                  <h4 className="text-[10px] font-semibold text-gray-300 uppercase tracking-wider">나만의 프리셋</h4>
                  <button
                    onClick={() => setShowSavePreset(!showSavePreset)}
                    className="text-[10px] text-primary hover:text-primary/80 flex items-center gap-0.5 transition-colors"
                  >
                    <span className="material-icons text-xs">add_circle</span>
                    저장
                  </button>
                </div>

                {/* 프리셋 저장 UI */}
                {showSavePreset && selectedClip && (
                  <div className="bg-black/40 border border-primary/30 rounded-lg p-2.5 space-y-2">
                    <p className="text-[10px] text-gray-400">현재 선택한 클립의 스타일을 프리셋으로 저장합니다</p>
                    <input
                      type="text" value={newPresetName} onChange={(e) => setNewPresetName(e.target.value)}
                      placeholder="프리셋 이름"
                      className="w-full bg-black/60 border border-gray-700 rounded text-xs text-white px-2 py-1.5 focus:outline-none focus:border-primary"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          if (!newPresetName.trim()) return;
                          const updated = addCustomPreset({
                            name: newPresetName.trim(),
                            color: selectedClip.color || '#FFFFFF',
                            backgroundColor: selectedClip.backgroundColor || 'transparent',
                            strokeColor: selectedClip.strokeColor || 'transparent',
                            strokeWidth: selectedClip.strokeWidth || 0,
                            shadowColor: selectedClip.shadowColor || 'transparent',
                            shadowBlur: selectedClip.shadowBlur || 0,
                            shadowOffsetX: selectedClip.shadowOffsetX || 0,
                            shadowOffsetY: selectedClip.shadowOffsetY || 0,
                            glowColor: selectedClip.glowColor,
                            borderColor: selectedClip.borderColor,
                            borderWidth: selectedClip.borderWidth,
                            fontWeight: selectedClip.fontWeight,
                            fontFamily: selectedClip.fontFamily,
                            fontStyle: selectedClip.fontStyle,
                            textDecoration: selectedClip.textDecoration,
                          });
                          setCustomPresets(updated);
                          setNewPresetName('');
                          setShowSavePreset(false);
                        }}
                        className="flex-1 py-1.5 rounded text-xs font-semibold bg-primary/20 text-primary hover:bg-primary/30 transition-all"
                      >저장</button>
                      <button onClick={() => { setShowSavePreset(false); setNewPresetName(''); }}
                        className="flex-1 py-1.5 rounded text-xs text-gray-400 hover:text-white bg-white/5 hover:bg-white/10 transition-all"
                      >취소</button>
                    </div>
                  </div>
                )}

                {customPresets.length > 0 ? (
                  <div className="grid grid-cols-4 gap-2">
                    {customPresets.map((preset) => (
                      <div key={preset.id} className="relative group">
                        <button
                          draggable
                          onDragStart={(e) => handlePresetDragStart(e, preset)}
                          onClick={() => handlePresetClick(preset)}
                          title={preset.name}
                          className={`w-full rounded-lg border-2 flex items-center justify-center overflow-hidden transition-all active:scale-90 cursor-grab ${selectedPresetId === preset.id ? 'border-primary ring-2 ring-primary scale-105' : 'border-gray-700 hover:border-gray-500'}`}
                          style={{
                            minHeight: '50px',
                            backgroundColor: preset.backgroundColor === 'transparent' ? '#1a1a2e' : preset.backgroundColor,
                          }}
                        >
                          <span style={{
                            fontSize: '20px',
                            fontWeight: preset.fontWeight || 700,
                            fontFamily: preset.fontFamily || 'sans-serif',
                            fontStyle: preset.fontStyle || 'normal',
                            textDecoration: preset.textDecoration || 'none',
                            color: preset.color,
                            textShadow: preset.glowColor
                              ? `0 0 ${preset.shadowBlur}px ${preset.glowColor}, 0 0 ${preset.shadowBlur * 2}px ${preset.glowColor}`
                              : preset.shadowBlur > 0
                                ? `${preset.shadowOffsetX}px ${preset.shadowOffsetY}px ${preset.shadowBlur}px ${preset.shadowColor}`
                                : 'none',
                            WebkitTextStroke: preset.strokeWidth > 0 ? `${Math.min(preset.strokeWidth, 2)}px ${preset.strokeColor}` : 'none',
                            lineHeight: 1,
                          }}>
                            Aa
                          </span>
                        </button>
                        {/* 삭제 버튼 */}
                        <button
                          onClick={(e) => { e.stopPropagation(); setCustomPresets(deleteCustomPreset(preset.id)); }}
                          className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-10"
                          title="삭제"
                        >
                          <span className="material-icons text-white" style={{ fontSize: '10px' }}>close</span>
                        </button>
                        <p className="text-[8px] text-gray-500 text-center truncate mt-0.5">{preset.name}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-[10px] text-gray-600 text-center py-2">저장된 커스텀 프리셋이 없습니다</p>
                )}

              </div>
            )}

            {captionTab === 'animation' && (
              <SubtitleAnimationPanel
                selectedSubtitle={
                  subtitles?.find(s =>
                    currentTime !== undefined &&
                    s.startTime <= currentTime && s.endTime >= currentTime
                  ) ?? null
                }
                isPro={false}
                onUpdate={(id, animation: SubtitleAnimation) => {
                  // 1. SubtitleItem 상태 업데이트
                  if (subtitles && onSubtitlesUpdate) {
                    onSubtitlesUpdate(subtitles.map(s =>
                      s.id === id ? { ...s, animation } : s
                    ));
                  }
                  // 2. 타임라인의 VideoClip도 업데이트 (Player에서 CSS 클래스 적용용)
                  if (onClipUpdate && clips) {
                    const targetSubtitle = subtitles?.find(s => s.id === id);
                    if (targetSubtitle) {
                      // 해당 자막 시간대에 있는 자막 클립 찾기
                      const subtitleClip = clips.find(c =>
                        (c.trackIndex === 0 || (c.trackIndex >= 5 && c.trackIndex <= 8)) &&
                        Math.abs(c.startTime - targetSubtitle.startTime) < 0.1
                      );
                      if (subtitleClip) {
                        onClipUpdate(subtitleClip.id, {
                          subtitleAnimationPreset: animation.inPreset,
                          subtitleOutPreset: animation.outPreset,
                          subtitleAnimationDuration: animation.duration,
                        });
                      }
                    }
                  }
                }}
                onUpgradeClick={() => setShowPaymentModal(true)}
              />
            )}
            {captionTab === 'tracking' && <div className="flex-1 flex items-center justify-center text-text-secondary text-xs">트래킹 설정</div>}

            {/* ── AI 사운드 효과 탭 ── */}
            {captionTab === 'tts' && (
              <div className="flex-1 overflow-y-auto p-3 space-y-4">

                {/* ── 섹션 1: AI 음성 (TTS) ── */}
                <div className="rounded-xl bg-gradient-to-br from-blue-900/40 to-cyan-900/30 border border-blue-500/30 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="material-icons text-blue-400 text-base">volume_up</span>
                    <span className="text-xs font-semibold text-blue-300">AI 음성 생성 (TTS)</span>
                  </div>

                  {/* 텍스트 입력 — 선택된 자막 자동 채움 */}
                  <textarea
                    value={ttsText}
                    onChange={e => setTtsText(e.target.value)}
                    placeholder={selectedClip?.trackIndex === 0 || (selectedClip?.trackIndex ?? -1) >= 5
                      ? selectedClip?.name || '자막 텍스트를 입력하세요...'
                      : '읽어줄 텍스트를 입력하세요...'}
                    rows={3}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-blue-400/50 resize-none mb-2"
                  />

                  {/* 선택된 자막 → 자동 입력 버튼 */}
                  {selectedClip && (selectedClip.trackIndex === 0 || selectedClip.trackIndex >= 5) && selectedClip.name && (
                    <button
                      onClick={() => setTtsText(selectedClip.name)}
                      className="w-full mb-2 py-1.5 rounded-lg bg-blue-500/10 border border-blue-500/30 text-blue-300 text-[10px] hover:bg-blue-500/20 transition-all flex items-center justify-center gap-1"
                    >
                      <span className="material-icons text-[12px]">auto_fix_high</span>
                      선택된 자막 텍스트 불러오기
                    </button>
                  )}

                  {/* 음성 선택 */}
                  <div className="grid grid-cols-3 gap-1.5 mb-2">
                    {([
                      { id: 'nova', label: 'Nova', desc: '밝고 친근' },
                      { id: 'alloy', label: 'Alloy', desc: '중성적' },
                      { id: 'echo', label: 'Echo', desc: '남성적' },
                      { id: 'fable', label: 'Fable', desc: '스토리텔링' },
                      { id: 'onyx', label: 'Onyx', desc: '깊고 낮음' },
                      { id: 'shimmer', label: 'Shimmer', desc: '여성적' },
                    ] as const).map(v => (
                      <button
                        key={v.id}
                        onClick={() => setTtsVoice(v.id)}
                        className={`px-1.5 py-1.5 rounded-lg border text-center transition-all ${ttsVoice === v.id ? 'bg-blue-500/30 border-blue-400/60 text-blue-200' : 'bg-white/5 border-white/10 text-text-secondary hover:border-blue-400/30 hover:text-white'}`}
                      >
                        <div className="text-[10px] font-semibold">{v.label}</div>
                        <div className="text-[8px] opacity-60">{v.desc}</div>
                      </button>
                    ))}
                  </div>

                  {/* 속도 */}
                  <div className="flex items-center gap-2 mb-3">
                    <span className="text-[10px] text-text-secondary w-8">속도</span>
                    <input
                      type="range" min="0.25" max="4" step="0.25"
                      value={ttsSpeed}
                      onChange={e => setTtsSpeed(Number(e.target.value))}
                      className="flex-1 h-1 accent-blue-400 cursor-pointer"
                    />
                    <span className="text-[10px] text-blue-300 w-8 text-right">{ttsSpeed}x</span>
                  </div>

                  {/* 생성 버튼 */}
                  <button
                    disabled={!ttsText.trim() || isGeneratingTts}
                    onClick={async () => {
                      if (!ttsText.trim()) return;
                      setIsGeneratingTts(true);
                      setTtsStatus('음성 생성 중...');
                      setTtsAudioUrl(null);
                      try {
                        const res = await fetch('/api/ai/tts', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ text: ttsText, voice: ttsVoice, speed: ttsSpeed }),
                        });
                        if (!res.ok) {
                          const err = await res.json();
                          setTtsStatus(`실패: ${err.error || '알 수 없는 오류'}`);
                          return;
                        }
                        const blob = await res.blob();
                        const url = URL.createObjectURL(blob);
                        setTtsAudioUrl(url);
                        setTtsStatus('생성 완료! 아래에서 재생하세요.');
                      } catch {
                        setTtsStatus('네트워크 오류');
                      } finally {
                        setIsGeneratingTts(false);
                      }
                    }}
                    className={`w-full py-2.5 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 ${!ttsText.trim() || isGeneratingTts ? 'bg-gray-800 text-gray-600 cursor-not-allowed' : 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white shadow-lg shadow-blue-900/30 active:scale-95'}`}
                  >
                    {isGeneratingTts ? (
                      <><span className="material-icons text-base animate-spin">refresh</span>음성 생성 중...</>
                    ) : (
                      <><span className="material-icons text-base">volume_up</span>AI 음성 생성</>
                    )}
                  </button>

                  {/* 생성된 오디오 플레이어 */}
                  {ttsAudioUrl && (
                    <div className="mt-3 space-y-2">
                      <div className="text-[10px] text-blue-300 flex items-center gap-1">
                        <span className="material-icons text-[12px]">check_circle</span>
                        {ttsStatus}
                      </div>
                      <audio
                        ref={ttsAudioRef}
                        src={ttsAudioUrl}
                        controls
                        className="w-full h-8"
                        style={{ filter: 'invert(0.9) hue-rotate(180deg)', transform: 'scale(0.95)' }}
                      />
                      <a
                        href={ttsAudioUrl}
                        download={`tts-${ttsVoice}-${Date.now()}.mp3`}
                        className="w-full py-1.5 rounded-lg bg-blue-500/20 border border-blue-500/40 text-blue-300 text-[10px] hover:bg-blue-500/30 transition-all flex items-center justify-center gap-1"
                      >
                        <span className="material-icons text-[12px]">download</span>
                        MP3 다운로드
                      </a>
                    </div>
                  )}

                  {ttsStatus && !isGeneratingTts && !ttsAudioUrl && (
                    <div className="mt-2 text-center text-[10px] text-red-400">{ttsStatus}</div>
                  )}
                </div>

                {/* ── 섹션 2: 사운드 효과 제안 ── */}
                <div className="rounded-xl bg-gradient-to-br from-purple-900/40 to-blue-900/30 border border-purple-500/30 p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="material-icons text-purple-400 text-base">music_note</span>
                    <span className="text-xs font-semibold text-purple-300">사운드 효과 제안</span>
                  </div>

                  {/* 자막에서 상황 묘사 자동 감지 */}
                  {(() => {
                    const situationClips = (clips || []).filter(c =>
                      (c.trackIndex === 5 || c.trackIndex === 0) &&
                      (c.name.includes('[') || c.name.includes('♪') || c.name.includes('♬') || c.name.includes('BGM') || c.name.includes('효과음'))
                    );
                    if (situationClips.length === 0) return null;
                    return (
                      <div className="mb-2">
                        <div className="text-[10px] text-text-secondary mb-1.5 flex items-center gap-1">
                          <span className="material-icons text-[11px]">auto_awesome</span>감지된 상황 묘사
                        </div>
                        <div className="space-y-1 max-h-24 overflow-y-auto">
                          {situationClips.slice(0, 6).map(c => (
                            <button key={c.id}
                              onClick={() => { setSoundPrompt(c.name.replace(/[\[\]♪♬]/g, '').trim()); setTtsText(c.name.replace(/[\[\]♪♬🎵]/g, '').trim()); }}
                              className="w-full text-left px-2 py-1 rounded-lg bg-white/5 border border-white/10 hover:bg-purple-500/10 hover:border-purple-500/30 transition-all text-[10px] text-text-secondary hover:text-white"
                            >
                              <span className="text-purple-400 mr-1">♪</span>{c.name}
                              <span className="ml-1 text-[9px] text-gray-600">({c.startTime.toFixed(1)}s)</span>
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* 빠른 선택 칩 */}
                  <div className="flex flex-wrap gap-1 mb-2">
                    {['긴장감 BGM', '웃음 소리', '박수', '두둥!', '적막', '심장 박동', '슬픈 피아노', '신나는 BGM'].map(s => (
                      <button key={s} onClick={() => { setSoundPrompt(s); setTtsText(s); }}
                        className={`px-2 py-0.5 rounded-full border text-[10px] transition-all ${soundPrompt === s ? 'bg-purple-500/30 border-purple-400/60 text-purple-300' : 'bg-white/5 border-white/10 text-text-secondary hover:border-purple-400/40 hover:text-white'}`}>
                        {s}
                      </button>
                    ))}
                  </div>

                  <textarea value={soundPrompt} onChange={e => setSoundPrompt(e.target.value)}
                    placeholder="사운드 설명 입력 (예: 긴장감 폭발 BGM, 웃음 소리...)"
                    rows={2}
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-purple-400/50 resize-none mb-2"
                  />

                  <button disabled={!soundPrompt.trim() || isGeneratingSound}
                    onClick={async () => {
                      if (!soundPrompt.trim()) return;
                      setIsGeneratingSound(true); setSoundGenStatus('분석 중...'); setSoundSuggestions([]);
                      try {
                        const res = await fetch('/api/ai/sound-suggest', {
                          method: 'POST', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ prompt: soundPrompt, clips: (clips || []).filter(c => c.trackIndex === 5 || c.trackIndex === 0).map(c => ({ name: c.name, startTime: c.startTime, duration: c.duration })) }),
                        });
                        if (res.ok) { const d = await res.json(); setSoundSuggestions(d.suggestions || []); setSoundGenStatus(''); }
                        else { setSoundGenStatus('생성 실패'); }
                      } catch { setSoundGenStatus('네트워크 오류'); }
                      finally { setIsGeneratingSound(false); }
                    }}
                    className={`w-full py-2 rounded-xl text-xs font-semibold transition-all flex items-center justify-center gap-2 ${!soundPrompt.trim() || isGeneratingSound ? 'bg-gray-800 text-gray-600 cursor-not-allowed' : 'bg-gradient-to-r from-purple-600 to-blue-600 hover:from-purple-500 hover:to-blue-500 text-white active:scale-95'}`}
                  >
                    {isGeneratingSound
                      ? <><span className="material-icons text-sm animate-spin">refresh</span>분석 중...</>
                      : <><span className="material-icons text-sm">auto_awesome</span>사운드 효과 제안</>}
                  </button>

                  {/* 제안 결과 */}
                  {soundSuggestions.length > 0 && (
                    <div className="mt-3 space-y-1.5">
                      {soundSuggestions.map((s, i) => (
                        <div key={i} className="rounded-lg bg-white/5 border border-white/10 p-2 flex items-center justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-[11px] text-white font-medium truncate">{s.text}</div>
                            {s.time >= 0 && <div className="text-[9px] text-text-secondary">{s.time.toFixed(1)}s</div>}
                          </div>
                          <div className="flex gap-1 shrink-0">
                            {/* TTS로 생성 */}
                            <button onClick={() => { setTtsText(s.text); }}
                              className="px-1.5 py-1 rounded bg-blue-500/20 border border-blue-500/40 text-blue-300 text-[9px] hover:bg-blue-500/30 transition-all">
                              TTS
                            </button>
                            {/* 대본에 추가 */}
                            <button
                              className="px-1.5 py-1 rounded bg-purple-500/20 border border-purple-500/40 text-purple-300 text-[9px] hover:bg-purple-500/30 transition-all"
                              onClick={() => {
                                if (onAddSubtitleClips) {
                                  onAddSubtitleClips([{
                                    id: Math.random().toString(36).slice(2),
                                    originalText: `🎵 ${s.text}`,
                                    editedText: `🎵 ${s.text}`,
                                    startTime: Math.max(0, s.time),
                                    endTime: Math.max(0, s.time) + 2,
                                    color: '#A78BFA', strokeColor: '#1e1b4b', isEdited: false,
                                  }], 0, false);
                                }
                              }}>
                              대본
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  {soundGenStatus && <div className="mt-2 text-center text-[10px] text-text-secondary">{soundGenStatus}</div>}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===== DETAILS TAB ===== */}
        {activeTab === 'details' && (
          <div className="p-4 space-y-6">
            {!selectedClip && (
              <div className="flex flex-col items-center justify-center py-8 text-center gap-2">
                <span className="material-icons text-4xl text-gray-600">touch_app</span>
                <p className="text-xs text-gray-500">프리뷰 또는 타임라인에서<br />영상을 선택해주세요</p>
              </div>
            )}
            <div className={`space-y-3 ${!selectedClip ? 'opacity-40 pointer-events-none' : ''}`}>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center space-x-1"><span className="material-icons text-sm text-blue-400">movie</span><span>Video</span></span>
                <span className="material-icons text-sm cursor-pointer hover:text-primary">expand_less</span>
              </h3>
              <div className="space-y-4">
                {/* Scale */}
                <div className="flex items-center justify-between">
                  <label className="text-xs text-gray-400 flex items-center space-x-1"><span className="material-icons text-sm">zoom_in</span><span>Scale</span></label>
                  <div className="flex items-center space-x-2 w-2/3">
                    <input className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary" type="range" min="0" max="200" value={scale}
                      onChange={(e) => { const v = Number(e.target.value); setScale(v); updateProp('scale', v); }} disabled={!selectedClip} />
                    <input className="w-12 bg-black border border-border-color rounded text-xs px-1 py-0.5 text-right focus:outline-none focus:border-primary disabled:opacity-50" type="number" value={scale}
                      onChange={(e) => { const v = Number(e.target.value); setScale(v); updateProp('scale', v); }} disabled={!selectedClip} />
                    <span className="text-xs text-gray-500">%</span>
                  </div>
                </div>
                {/* Position */}
                <div className="flex items-center justify-between">
                  <label className="text-xs text-gray-400 flex items-center space-x-1"><span className="material-icons text-sm">open_with</span><span>Position</span></label>
                  <div className="flex items-center space-x-2 w-2/3">
                    <div className="flex items-center bg-black border border-border-color rounded px-1 w-1/2">
                      <span className="text-[10px] text-gray-500 mr-1">X</span>
                      <input className="w-full bg-transparent text-xs py-0.5 text-right focus:outline-none disabled:opacity-50" type="number" value={positionX}
                        onChange={(e) => { const v = Number(e.target.value); setPositionX(v); updateProp('positionX', v); }} disabled={!selectedClip} />
                    </div>
                    <div className="flex items-center bg-black border border-border-color rounded px-1 w-1/2">
                      <span className="text-[10px] text-gray-500 mr-1">Y</span>
                      <input className="w-full bg-transparent text-xs py-0.5 text-right focus:outline-none disabled:opacity-50" type="number" value={positionY}
                        onChange={(e) => { const v = Number(e.target.value); setPositionY(v); updateProp('positionY', v); }} disabled={!selectedClip} />
                    </div>
                  </div>
                </div>
                {/* Rotation */}
                <div className="flex items-center justify-between">
                  <label className="text-xs text-gray-400 flex items-center space-x-1"><span className="material-icons text-sm">rotate_right</span><span>Rotate</span></label>
                  <div className="flex items-center space-x-2 w-2/3">
                    <button className="w-6 h-6 rounded-full border border-gray-600 flex items-center justify-center hover:border-white active:scale-90"
                      onClick={() => { setRotation(0); updateProp('rotation', 0); }}>
                      <span className="material-icons text-[14px]">refresh</span>
                    </button>
                    <input className="flex-1 h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary disabled:opacity-50" type="range" min="-180" max="180" value={rotation}
                      onChange={(e) => { const v = Number(e.target.value); setRotation(v); updateProp('rotation', v); }} disabled={!selectedClip} />
                    <input className="w-10 bg-black border border-border-color rounded text-xs px-1 py-0.5 text-right focus:outline-none focus:border-primary disabled:opacity-50" type="number" value={rotation}
                      onChange={(e) => { const v = Number(e.target.value); setRotation(v); updateProp('rotation', v); }} disabled={!selectedClip} />
                    <span className="text-[10px] text-gray-500">°</span>
                  </div>
                </div>
              </div>
            </div>
            <div className={`w-full h-px bg-border-color ${!selectedClip ? 'opacity-40' : ''}`} />
            <div className={`space-y-3 ${!selectedClip ? 'opacity-40 pointer-events-none' : ''}`}>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center justify-between">
                <span className="flex items-center space-x-1"><span className="material-icons text-sm text-purple-400">blur_on</span><span>Blend</span></span>
                <div className="relative inline-block w-8 mr-2 align-middle select-none">
                  <input className="toggle-checkbox absolute block w-3 h-3 rounded-full bg-white border-4 appearance-none cursor-pointer checked:right-0 checked:border-primary right-5 disabled:opacity-50"
                    id="toggle" type="checkbox" checked={blendMode} onChange={(e) => { setBlendMode(e.target.checked); updateProp('blendMode', e.target.checked); }} disabled={!selectedClip} />
                  <label className={`toggle-label block overflow-hidden h-3 rounded-full cursor-pointer ${blendMode ? 'bg-primary/50' : 'bg-gray-700'} ${!selectedClip ? 'opacity-50' : ''}`} htmlFor="toggle" />
                </div>
              </h3>
              {/* Opacity */}
              <div className="flex items-center justify-between">
                <label className="text-xs text-gray-400 flex items-center space-x-1"><span className="material-icons text-sm">opacity</span><span>Opacity</span></label>
                <div className="flex items-center space-x-2 w-2/3">
                  <input className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-primary disabled:opacity-50" type="range" min="0" max="100" value={opacity}
                    onChange={(e) => { const v = Number(e.target.value); setOpacity(v); updateProp('opacity', v); }} disabled={!selectedClip} />
                  <input className="w-10 bg-black border border-border-color rounded text-xs px-1 py-0.5 text-right focus:outline-none focus:border-primary disabled:opacity-50" type="number" min="0" max="100" value={opacity}
                    onChange={(e) => { const v = Math.min(100, Math.max(0, Number(e.target.value))); setOpacity(v); updateProp('opacity', v); }} disabled={!selectedClip} />
                  <span className="text-[10px] text-gray-500">%</span>
                </div>
              </div>
            </div>
            {/* Color Correction */}
            <div className={`w-full h-px bg-border-color ${!selectedClip ? 'opacity-40' : ''}`} />
            <div className={`space-y-3 ${!selectedClip ? 'opacity-40 pointer-events-none' : ''}`}>
              <h3 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1">
                <span className="material-icons text-sm text-amber-400">palette</span>
                <span>Color</span>
                <span className="text-[9px] font-normal text-gray-500 ml-1">(C키로 자동보정)</span>
              </h3>
              {/* Auto Color Correction Toggle */}
              <button
                onClick={() => {
                  const isOn = selectedClip?.autoColorCorrection;
                  if (isOn) {
                    setBrightness(100); setContrast(100); setSaturate(100); setTemperature(0);
                    updateProp('autoColorCorrection', false);
                    updateProp('brightness', 100); updateProp('contrast', 100);
                    updateProp('saturate', 100); updateProp('temperature', 0); updateProp('sharpen', 0);
                  } else {
                    setBrightness(115); setContrast(120); setSaturate(130); setTemperature(5);
                    updateProp('autoColorCorrection', true);
                    updateProp('brightness', 115); updateProp('contrast', 120);
                    updateProp('saturate', 130); updateProp('temperature', 5); updateProp('sharpen', 35);
                  }
                }}
                disabled={!selectedClip}
                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                  selectedClip?.autoColorCorrection
                    ? 'bg-amber-500/20 border border-amber-500/50 text-amber-300'
                    : 'bg-white/5 border border-border-color text-gray-400 hover:bg-white/10'
                }`}
              >
                <span className="material-icons text-sm">auto_fix_high</span>
                {selectedClip?.autoColorCorrection ? '자동 보정 ON' : '자동 색상 보정'}
              </button>
              {/* Manual sliders */}
              {[
                { label: '밝기', icon: 'brightness_6', value: brightness, set: setBrightness, prop: 'brightness' as const, min: 50, max: 150 },
                { label: '대비', icon: 'contrast', value: contrast, set: setContrast, prop: 'contrast' as const, min: 50, max: 150 },
                { label: '채도', icon: 'color_lens', value: saturate, set: setSaturate, prop: 'saturate' as const, min: 0, max: 200 },
                { label: '색온도', icon: 'thermostat', value: temperature, set: setTemperature, prop: 'temperature' as const, min: -30, max: 30 },
              ].map(s => (
                <div key={s.prop} className="flex items-center justify-between">
                  <label className="text-xs text-gray-400 flex items-center gap-1 min-w-[52px]">
                    <span className="material-icons text-sm">{s.icon}</span><span>{s.label}</span>
                  </label>
                  <div className="flex items-center gap-2 w-2/3">
                    <input className="w-full h-1 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-amber-400 disabled:opacity-50"
                      type="range" min={s.min} max={s.max} value={s.value}
                      onChange={(e) => { const v = Number(e.target.value); s.set(v); updateProp(s.prop, v); }}
                      disabled={!selectedClip} />
                    <input className="w-10 bg-black border border-border-color rounded text-xs px-1 py-0.5 text-right focus:outline-none focus:border-primary disabled:opacity-50"
                      type="number" min={s.min} max={s.max} value={s.value}
                      onChange={(e) => { const v = Math.min(s.max, Math.max(s.min, Number(e.target.value))); s.set(v); updateProp(s.prop, v); }}
                      disabled={!selectedClip} />
                    <span className="text-[10px] text-gray-500 w-3">{s.prop === 'temperature' ? '°' : '%'}</span>
                  </div>
                </div>
              ))}
              {/* Reset */}
              <button
                onClick={() => {
                  setBrightness(100); setContrast(100); setSaturate(100); setTemperature(0);
                  updateProp('brightness', 100); updateProp('contrast', 100);
                  updateProp('saturate', 100); updateProp('temperature', 0); updateProp('sharpen', 0);
                  updateProp('autoColorCorrection', false);
                }}
                disabled={!selectedClip}
                className="text-[10px] text-gray-500 hover:text-white transition-colors disabled:opacity-30"
              >
                초기화
              </button>
            </div>
            <div className="mt-auto pt-6">
              <div className="bg-black/30 p-3 rounded border border-border-color space-y-2">
                <div className="flex justify-between items-center text-[10px] text-gray-500">
                  <span className="flex items-center space-x-1"><span className="material-icons text-xs">aspect_ratio</span><span>Resolution</span></span>
                  <span className="text-gray-300">1920 x 1080</span>
                </div>
                <div className="flex justify-between items-center text-[10px] text-gray-500">
                  <span className="flex items-center space-x-1"><span className="material-icons text-xs">speed</span><span>Frame Rate</span></span>
                  <span className="text-gray-300">30.00 fps</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Export tab removed — now in Header dropdown */}
      </div>

      <UpgradeModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
      />

      {transcriptContextMenu && (() => {
        const idx = transcripts.findIndex(t => t.id === transcriptContextMenu.id);
        const t = transcripts[idx];
        if (!t) return null;
        const text = t.editedText || t.originalText;
        return (
          <ContextMenu
            x={transcriptContextMenu.x}
            y={transcriptContextMenu.y}
            onClose={() => setTranscriptContextMenu(null)}
            items={[
              { label: '텍스트 복사', icon: 'content_copy', action: () => { navigator.clipboard.writeText(text); } },
              { label: '이전 항목과 병합', icon: 'merge', disabled: idx <= 0, divider: true, action: () => handleMergeWithPrevious(transcriptContextMenu.id) },
              { label: '삭제', icon: 'delete', shortcut: 'Del', danger: true, divider: true, action: () => handleTranscriptDelete(transcriptContextMenu.id) },
            ]}
          />
        );
      })()}
    </aside>
  );
});

export default RightSidebar;

// ============================================
// Export Tab Component
// ============================================

const RESOLUTIONS = [
  { label: '4K (3840x2160)', w: 3840, h: 2160 },
  { label: '1080p (1920x1080)', w: 1920, h: 1080 },
  { label: '720p (1280x720)', w: 1280, h: 720 },
  { label: '480p (854x480)', w: 854, h: 480 },
  { label: '인스타 릴스 (1080x1920)', w: 1080, h: 1920 },
  { label: '유튜브 쇼츠 (1080x1920)', w: 1080, h: 1920 },
  { label: '정사각 (1080x1080)', w: 1080, h: 1080 },
];

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function ExportTab({
  videoFile,
  videoDuration,
  clips,
  transcripts,
}: {
  videoFile: File | null;
  videoDuration?: number;
  clips: VideoClip[];
  transcripts: TranscriptItem[];
}) {
  const [selectedResolution, setSelectedResolution] = useState(1); // 1080p default
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);

  const duration = videoDuration ?? 0;
  const baseName = videoFile?.name?.replace(/\.[^.]+$/, '') ?? 'export';

  // 대본 텍스트 수집 (transcript + subtitle clips)
  const allTexts = React.useMemo(() => {
    const fromTranscripts = transcripts.map(t => ({
      startTime: t.startTime,
      endTime: t.endTime,
      text: t.editedText || t.originalText,
    }));
    const fromClips = clips
      .filter(c => c.trackIndex !== 1 && c.name)
      .map(c => ({ startTime: c.startTime, endTime: c.startTime + c.duration, text: c.name || '' }));
    return [...fromTranscripts, ...fromClips].sort((a, b) => a.startTime - b.startTime);
  }, [transcripts, clips]);

  // 예상 파일 크기 계산
  const res = RESOLUTIONS[selectedResolution];
  const estimatedMp4 = React.useMemo(() => {
    if (!duration) return 0;
    // 비트레이트 추정: 1080p ~8Mbps, 4K ~25Mbps, 720p ~5Mbps
    const pixelCount = res.w * res.h;
    const bitsPerPixel = 0.07; // H.264 typical
    const bitrate = pixelCount * bitsPerPixel * 30; // 30fps
    return (bitrate * duration) / 8;
  }, [duration, res]);

  const srtContent = React.useMemo(() => {
    const formatTime = (s: number) => {
      const h = Math.floor(s / 3600);
      const m = Math.floor((s % 3600) / 60);
      const sec = Math.floor(s % 60);
      const ms = Math.round((s % 1) * 1000);
      return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${sec.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
    };
    return allTexts.map((t, i) =>
      `${i + 1}\n${formatTime(t.startTime)} --> ${formatTime(t.endTime)}\n${t.text}\n`
    ).join('\n');
  }, [allTexts]);

  const txtContent = React.useMemo(() => allTexts.map(t => t.text).join('\n'), [allTexts]);

  const srtSize = new Blob([srtContent]).size;
  const txtSize = new Blob([txtContent]).size;
  const mp3Size = React.useMemo(() => {
    if (!duration) return 0;
    return Math.round(duration * 16000); // ~128kbps MP3
  }, [duration]);

  const handleDownloadSrt = () => {
    const blob = new Blob(['\uFEFF' + srtContent], { type: 'text/plain;charset=utf-8' });
    downloadFile(blob, `${baseName}.srt`);
  };

  const handleDownloadTxt = () => {
    const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
    downloadFile(blob, `${baseName}.txt`);
  };

  const handleDownloadMp3 = async () => {
    const video = await getVideoBlob();
    if (!video) { alert('영상 파일이 필요합니다.'); return; }
    setIsExporting(true);
    setExportProgress(10);
    try {
      // 오디오 추출 (Web Audio API)
      const arrayBuffer = await video.blob.arrayBuffer();
      setExportProgress(30);
      const audioCtx = new AudioContext();
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      setExportProgress(50);

      // WAV로 변환 후 다운로드 (브라우저에서 MP3 인코딩은 제한적이므로 WAV 제공)
      const numChannels = audioBuffer.numberOfChannels;
      const sampleRate = audioBuffer.sampleRate;
      const length = audioBuffer.length;
      const wavBuffer = new ArrayBuffer(44 + length * numChannels * 2);
      const view = new DataView(wavBuffer);

      // WAV header
      const writeStr = (offset: number, str: string) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };
      writeStr(0, 'RIFF');
      view.setUint32(4, 36 + length * numChannels * 2, true);
      writeStr(8, 'WAVE');
      writeStr(12, 'fmt ');
      view.setUint32(16, 16, true);
      view.setUint16(20, 1, true);
      view.setUint16(22, numChannels, true);
      view.setUint32(24, sampleRate, true);
      view.setUint32(28, sampleRate * numChannels * 2, true);
      view.setUint16(32, numChannels * 2, true);
      view.setUint16(34, 16, true);
      writeStr(36, 'data');
      view.setUint32(40, length * numChannels * 2, true);

      setExportProgress(70);
      let offset = 44;
      for (let i = 0; i < length; i++) {
        for (let ch = 0; ch < numChannels; ch++) {
          const sample = Math.max(-1, Math.min(1, audioBuffer.getChannelData(ch)[i]));
          view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
          offset += 2;
        }
      }

      setExportProgress(90);
      const blob = new Blob([wavBuffer], { type: 'audio/wav' });
      downloadFile(blob, `${baseName}.wav`);
      audioCtx.close();
      setExportProgress(100);
    } catch (err: any) {
      alert(`오디오 추출 실패: ${err.message}`);
    } finally {
      setTimeout(() => { setIsExporting(false); setExportProgress(0); }, 1000);
    }
  };

  /** 비디오 파일 또는 타임라인 비디오 URL에서 Blob 가져오기 */
  const getVideoBlob = async (): Promise<{ blob: Blob; name: string } | null> => {
    if (videoFile) return { blob: videoFile, name: videoFile.name };
    // videoFile이 없으면 타임라인 비디오 클립의 URL에서 복원
    const videoClip = clips.find(c => c.trackIndex === 1 && c.url);
    if (videoClip?.url) {
      try {
        const res = await fetch(videoClip.url);
        if (res.ok) {
          const blob = await res.blob();
          return { blob, name: videoClip.name || 'video.mp4' };
        }
      } catch { /* fallback below */ }
    }
    // video 엘리먼트 src에서 시도
    const videoEl = document.querySelector('video[src]') as HTMLVideoElement | null;
    if (videoEl?.src) {
      try {
        const res = await fetch(videoEl.src);
        if (res.ok) {
          const blob = await res.blob();
          return { blob, name: 'video.mp4' };
        }
      } catch { /* ignore */ }
    }
    return null;
  };

  const handleDownloadMp4 = async () => {
    const video = await getVideoBlob();
    if (!video) { alert('영상 파일이 필요합니다.'); return; }
    downloadFile(video.blob, `${baseName}_${res.w}x${res.h}.mp4`);
  };

  const downloadFile = (blob: Blob | File, filename: string) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportItems = [
    {
      icon: 'movie',
      label: 'MP4 영상',
      desc: `${res.w}x${res.h}`,
      size: estimatedMp4,
      action: handleDownloadMp4,
      disabled: !videoFile && !clips.some(c => c.trackIndex === 1 && c.url),
    },
    {
      icon: 'music_note',
      label: 'MP3 오디오',
      desc: 'WAV 추출',
      size: mp3Size,
      action: handleDownloadMp3,
      disabled: !videoFile && !clips.some(c => c.trackIndex === 1 && c.url),
    },
    {
      icon: 'subtitles',
      label: 'SRT 자막',
      desc: `${allTexts.length}개 항목`,
      size: srtSize,
      action: handleDownloadSrt,
      disabled: allTexts.length === 0,
    },
    {
      icon: 'description',
      label: 'TXT 대본',
      desc: `${allTexts.length}개 항목`,
      size: txtSize,
      action: handleDownloadTxt,
      disabled: allTexts.length === 0,
    },
  ];

  return (
    <div className="p-4 space-y-4">
      <h3 className="text-xs font-bold text-white uppercase tracking-wider">내보내기</h3>

      {/* MP4 화면 사이즈 선택 */}
      <div className="space-y-2">
        <span className="text-[10px] text-gray-400 uppercase tracking-wider">영상 사이즈</span>
        <div className="grid grid-cols-1 gap-1">
          {RESOLUTIONS.map((r, i) => (
            <button
              key={i}
              onClick={() => setSelectedResolution(i)}
              className={`text-left px-3 py-1.5 rounded-lg text-[11px] transition-all ${
                selectedResolution === i
                  ? 'bg-primary/20 border border-primary/50 text-white'
                  : 'bg-white/5 border border-transparent text-gray-400 hover:bg-white/10 hover:text-gray-300'
              }`}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {/* 다운로드 항목 리스트 */}
      <div className="space-y-2">
        <span className="text-[10px] text-gray-400 uppercase tracking-wider">다운로드</span>
        {exportItems.map((item, i) => (
          <button
            key={i}
            onClick={item.action}
            disabled={item.disabled || isExporting}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-all group ${
              item.disabled
                ? 'border-border-color bg-white/[0.02] text-gray-600 cursor-not-allowed'
                : 'border-border-color bg-white/5 text-white hover:bg-white/10 hover:border-primary/50 active:scale-[0.98]'
            }`}
          >
            <span className={`material-icons text-lg ${item.disabled ? 'text-gray-600' : 'text-primary'}`}>
              {item.icon}
            </span>
            <div className="flex-1 text-left">
              <div className="text-xs font-medium">{item.label}</div>
              <div className="text-[10px] text-gray-500">{item.desc}</div>
            </div>
            <div className="text-right">
              <div className="text-[10px] text-gray-500">{item.size > 0 ? formatFileSize(item.size) : '-'}</div>
              <span className={`material-icons text-sm ${item.disabled ? 'text-gray-700' : 'text-gray-400 group-hover:text-primary'}`}>
                file_download
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* 진행 바 */}
      {isExporting && (
        <div className="space-y-1">
          <div className="flex justify-between text-[10px] text-gray-400">
            <span>추출 중...</span>
            <span>{exportProgress}%</span>
          </div>
          <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-300"
              style={{ width: `${exportProgress}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function fmtTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}
