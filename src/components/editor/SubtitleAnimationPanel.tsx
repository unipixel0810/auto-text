'use client';

/**
 * SubtitleAnimationPanel
 * 자막 애니메이션 프리셋 선택 패널
 * Frontend Dev 스탬프 — 2026-03-11
 */

import React, { useCallback } from 'react';
import type {
  SubtitleItem,
  SubtitleAnimation,
  AnimationPreset,
} from '@/types/subtitle';
import {
  ANIMATION_PRESET_META,
  FREE_ANIMATION_PRESETS,
  DEFAULT_SUBTITLE_ANIMATION,
} from '@/types/subtitle';

interface SubtitleAnimationPanelProps {
  /** 현재 선택된 자막 */
  selectedSubtitle: SubtitleItem | null;
  /** 사용자가 PRO 구독 중인지 */
  isPro?: boolean;
  /** 자막 업데이트 콜백 */
  onUpdate: (id: string, animation: SubtitleAnimation) => void;
  /** PRO 업그레이드 모달 열기 */
  onUpgradeClick?: () => void;
}

const ALL_PRESETS: AnimationPreset[] = [
  'none', 'fade-in', 'fade-out', 'slide-up',
  'slide-down', 'pop', 'typewriter', 'bounce', 'shake',
];

// CSS 애니메이션 클래스 매핑 (globals.css에 keyframe 정의)
export const ANIMATION_CSS_CLASS: Record<AnimationPreset, string> = {
  'none':       '',
  'fade-in':    'subtitle-anim-fade-in',
  'fade-out':   'subtitle-anim-fade-out',
  'slide-up':   'subtitle-anim-slide-up',
  'slide-down': 'subtitle-anim-slide-down',
  'pop':        'subtitle-anim-pop',
  'typewriter': 'subtitle-anim-typewriter',
  'bounce':     'subtitle-anim-bounce',
  'shake':      'subtitle-anim-shake',
};

export default function SubtitleAnimationPanel({
  selectedSubtitle,
  isPro = false,
  onUpdate,
  onUpgradeClick,
}: SubtitleAnimationPanelProps) {
  const animation = selectedSubtitle?.animation ?? DEFAULT_SUBTITLE_ANIMATION;

  const handlePresetChange = useCallback(
    (type: 'in' | 'out', preset: AnimationPreset) => {
      if (!selectedSubtitle) return;
      const meta = ANIMATION_PRESET_META[preset];
      if (meta.isPro && !isPro) {
        onUpgradeClick?.();
        return;
      }
      onUpdate(selectedSubtitle.id, {
        ...animation,
        inPreset: type === 'in' ? preset : animation.inPreset,
        outPreset: type === 'out' ? preset : animation.outPreset,
      });
    },
    [selectedSubtitle, animation, isPro, onUpdate, onUpgradeClick]
  );

  const handleDurationChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!selectedSubtitle) return;
      onUpdate(selectedSubtitle.id, {
        ...animation,
        duration: parseFloat(e.target.value),
      });
    },
    [selectedSubtitle, animation, onUpdate]
  );

  // 자막 미선택 상태
  if (!selectedSubtitle) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-3 text-center px-4">
        <span className="text-3xl">🎬</span>
        <p className="text-xs text-white/40 leading-relaxed">
          자막을 선택하면<br />애니메이션을 설정할 수 있어요
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-3">

      {/* IN 애니메이션 */}
      <section>
        <h3 className="text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-2">
          🎬 등장 (IN)
        </h3>
        <div className="grid grid-cols-3 gap-1.5">
          {ALL_PRESETS.filter(p => p !== 'fade-out').map(preset => (
            <PresetCard
              key={preset}
              preset={preset}
              isSelected={animation.inPreset === preset}
              isPro={!FREE_ANIMATION_PRESETS.includes(preset) && !isPro}
              onClick={() => handlePresetChange('in', preset)}
            />
          ))}
        </div>
      </section>

      {/* 지속 시간 슬라이더 */}
      <section>
        <div className="flex items-center justify-between mb-1.5">
          <h3 className="text-[11px] font-semibold text-white/50 uppercase tracking-wider">
            ⏱ 지속 시간
          </h3>
          <span className="text-[11px] font-mono text-[#4488FF]">
            {animation.duration.toFixed(1)}s
          </span>
        </div>
        <input
          type="range"
          min="0.1"
          max="1.0"
          step="0.1"
          value={animation.duration}
          onChange={handleDurationChange}
          className="w-full h-1 rounded-full appearance-none cursor-pointer"
          style={{
            background: `linear-gradient(to right, #4488FF ${(animation.duration - 0.1) / 0.9 * 100}%, rgba(255,255,255,0.1) ${(animation.duration - 0.1) / 0.9 * 100}%)`
          }}
          aria-label="애니메이션 지속 시간"
        />
        <div className="flex justify-between mt-1">
          <span className="text-[9px] text-white/30">0.1s</span>
          <span className="text-[9px] text-white/30">1.0s</span>
        </div>
      </section>

      {/* OUT 애니메이션 */}
      <section>
        <h3 className="text-[11px] font-semibold text-white/50 uppercase tracking-wider mb-2">
          ✨ 퇴장 (OUT)
        </h3>
        <div className="grid grid-cols-3 gap-1.5">
          {ALL_PRESETS.filter(p => p !== 'fade-in').map(preset => (
            <PresetCard
              key={preset}
              preset={preset}
              isSelected={animation.outPreset === preset}
              isPro={!FREE_ANIMATION_PRESETS.includes(preset) && !isPro}
              onClick={() => handlePresetChange('out', preset)}
            />
          ))}
        </div>
      </section>

      {/* PRO CTA (비구독 시) */}
      {!isPro && (
        <button
          onClick={onUpgradeClick}
          className="w-full py-2.5 px-3 rounded-lg text-xs font-medium
            bg-[#4488FF]/15 border border-[#4488FF]/30
            text-[#4488FF] hover:bg-[#4488FF]/25 transition-colors"
        >
          ⚡ 프리미엄으로 모든 효과 사용하기
        </button>
      )}
    </div>
  );
}

// ── 개별 프리셋 카드 컴포넌트 ──────────────────────────
interface PresetCardProps {
  preset: AnimationPreset;
  isSelected: boolean;
  isPro: boolean; // 잠금 상태 (PRO 미구독)
  onClick: () => void;
}

function PresetCard({ preset, isSelected, isPro, onClick }: PresetCardProps) {
  const meta = ANIMATION_PRESET_META[preset];

  return (
    <button
      onClick={onClick}
      aria-label={`${meta.label} 애니메이션 선택`}
      aria-pressed={isSelected}
      className={`
        relative flex flex-col items-center justify-center gap-1
        px-1 py-2 rounded-lg text-center transition-all
        ${isSelected
          ? 'bg-[#4488FF]/10 border border-[#4488FF] text-white'
          : 'bg-white/5 border border-white/10 text-white/60 hover:bg-white/8 hover:text-white/80'
        }
        ${isPro ? 'opacity-60' : ''}
      `}
    >
      {/* PRO 잠금 오버레이 */}
      {isPro && (
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/30">
          <div className="flex flex-col items-center gap-0.5">
            <span className="text-[10px]">🔒</span>
            <span className="text-[8px] font-bold text-yellow-400">PRO</span>
          </div>
        </div>
      )}

      <span className="text-base leading-none">{meta.icon}</span>
      <span className="text-[9px] font-medium leading-tight">{meta.label}</span>

      {/* 선택 체크 */}
      {isSelected && !isPro && (
        <span className="absolute top-0.5 right-0.5 text-[#4488FF] text-[8px]">✓</span>
      )}
    </button>
  );
}
