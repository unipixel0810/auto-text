'use client';

/**
 * SubtitleAnimationPanel
 * 자막 애니메이션 프리셋 선택 패널 — 3가지 핵심 효과
 */

import React, { useCallback, useState, useEffect, useRef } from 'react';
import type {
  SubtitleItem,
  SubtitleAnimation,
  AnimationPreset,
} from '@/types/subtitle';
import {
  DEFAULT_SUBTITLE_ANIMATION,
} from '@/types/subtitle';

interface SubtitleAnimationPanelProps {
  selectedSubtitle: SubtitleItem | null;
  isPro?: boolean;
  onUpdate: (id: string, animation: SubtitleAnimation) => void;
  onUpgradeClick?: () => void;
}

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
  'glitch':     'subtitle-anim-glitch',
  'wave':       'subtitle-anim-wave',
  'rubber':     'subtitle-anim-rubber',
  'jelly':      'subtitle-anim-jelly',
  'twist':      'subtitle-anim-twist',
};

/** 3가지 핵심 애니메이션 */
const ANIMATION_OPTIONS: {
  id: AnimationPreset;
  label: string;
  desc: string;
  icon: string;
  inPreset: AnimationPreset;
  outPreset: AnimationPreset;
}[] = [
  {
    id: 'fade-in',
    label: '페이드',
    desc: '부드럽게 나타나고 사라짐',
    icon: 'blur_on',
    inPreset: 'fade-in',
    outPreset: 'fade-out',
  },
  {
    id: 'pop',
    label: '팝',
    desc: '톡! 튀어나오는 효과',
    icon: 'flare',
    inPreset: 'pop',
    outPreset: 'fade-out',
  },
  {
    id: 'slide-up',
    label: '슬라이드',
    desc: '아래에서 올라오는 효과',
    icon: 'north',
    inPreset: 'slide-up',
    outPreset: 'fade-out',
  },
  {
    id: 'glitch',
    label: '글리치',
    desc: '화면 깨짐 왜곡 효과',
    icon: 'electric_bolt',
    inPreset: 'glitch',
    outPreset: 'fade-out',
  },
  {
    id: 'wave',
    label: '웨이브',
    desc: '물결치듯 흔들리는 효과',
    icon: 'waves',
    inPreset: 'wave',
    outPreset: 'fade-out',
  },
  {
    id: 'rubber',
    label: '고무줄',
    desc: '늘어났다 줄어드는 효과',
    icon: 'open_in_full',
    inPreset: 'rubber',
    outPreset: 'fade-out',
  },
  {
    id: 'jelly',
    label: '젤리',
    desc: '말랑말랑 젤리 효과',
    icon: 'bubble_chart',
    inPreset: 'jelly',
    outPreset: 'fade-out',
  },
  {
    id: 'twist',
    label: '트위스트',
    desc: '회전하며 등장하는 효과',
    icon: 'sync',
    inPreset: 'twist',
    outPreset: 'fade-out',
  },
];

export default function SubtitleAnimationPanel({
  selectedSubtitle,
  onUpdate,
}: SubtitleAnimationPanelProps) {
  const animation = selectedSubtitle?.animation ?? DEFAULT_SUBTITLE_ANIMATION;
  const [previewKey, setPreviewKey] = useState(0);
  const previewRef = useRef<HTMLDivElement>(null);

  // 현재 선택된 옵션 (inPreset 기준)
  const currentId = animation.inPreset === 'none' ? null
    : ANIMATION_OPTIONS.find(o => o.inPreset === animation.inPreset)?.id ?? null;

  const handleSelect = useCallback((option: typeof ANIMATION_OPTIONS[0] | null) => {
    if (!selectedSubtitle) return;
    if (option === null) {
      // 효과 없음
      onUpdate(selectedSubtitle.id, {
        inPreset: 'none',
        outPreset: 'none',
        duration: animation.duration,
      });
    } else {
      onUpdate(selectedSubtitle.id, {
        inPreset: option.inPreset,
        outPreset: option.outPreset,
        duration: animation.duration,
      });
    }
    setPreviewKey(k => k + 1);
  }, [selectedSubtitle, animation.duration, onUpdate]);

  const handleDurationChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!selectedSubtitle) return;
      onUpdate(selectedSubtitle.id, {
        ...animation,
        duration: parseFloat(e.target.value),
      });
      setPreviewKey(k => k + 1);
    },
    [selectedSubtitle, animation, onUpdate]
  );

  // 프리뷰 애니메이션 재생
  useEffect(() => {
    if (previewRef.current && animation.inPreset !== 'none') {
      const el = previewRef.current;
      const cls = ANIMATION_CSS_CLASS[animation.inPreset];
      if (cls) {
        el.classList.remove(cls);
        void el.offsetWidth; // reflow
        el.classList.add(cls);
      }
    }
  }, [previewKey, animation.inPreset]);

  if (!selectedSubtitle) {
    return (
      <div className="flex flex-col items-center justify-center h-40 gap-3 text-center px-4">
        <span className="material-icons text-3xl text-white/20">animation</span>
        <p className="text-xs text-white/40 leading-relaxed">
          자막을 선택하면<br />애니메이션을 설정할 수 있어요
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-3">

      {/* 미리보기 */}
      <div className="relative bg-black/60 rounded-lg overflow-hidden h-20 flex items-center justify-center border border-white/10">
        <div
          ref={previewRef}
          key={previewKey}
          className={`text-sm font-bold text-white ${animation.inPreset !== 'none' ? ANIMATION_CSS_CLASS[animation.inPreset] : ''}`}
          style={{ '--anim-duration': `${animation.duration}s` } as React.CSSProperties}
        >
          {selectedSubtitle.text.slice(0, 20) || '미리보기'}
        </div>
        <button
          onClick={() => setPreviewKey(k => k + 1)}
          className="absolute top-1.5 right-1.5 p-1 rounded bg-white/10 hover:bg-white/20 transition-colors"
          title="다시 재생"
        >
          <span className="material-icons text-xs text-white/60">replay</span>
        </button>
      </div>

      {/* 효과 없음 */}
      <button
        onClick={() => handleSelect(null)}
        className={`w-full py-2 px-3 rounded-lg text-xs font-medium transition-all flex items-center gap-2 ${
          currentId === null
            ? 'bg-white/10 border border-white/30 text-white'
            : 'bg-white/5 border border-white/10 text-white/50 hover:bg-white/8 hover:text-white/70'
        }`}
      >
        <span className="material-icons text-sm">block</span>
        효과 없음
      </button>

      {/* 3가지 애니메이션 카드 */}
      <div className="space-y-2">
        {ANIMATION_OPTIONS.map(option => {
          const isSelected = currentId === option.id;
          return (
            <button
              key={option.id}
              onClick={() => handleSelect(option)}
              className={`w-full py-3 px-3 rounded-lg text-left transition-all flex items-center gap-3 ${
                isSelected
                  ? 'bg-primary/15 border border-primary text-white'
                  : 'bg-white/5 border border-white/10 text-white/60 hover:bg-white/8 hover:text-white/80'
              }`}
            >
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                isSelected ? 'bg-primary/30' : 'bg-white/10'
              }`}>
                <span className="material-icons text-lg">{option.icon}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold">{option.label}</div>
                <div className={`text-[10px] ${isSelected ? 'text-white/60' : 'text-white/40'}`}>{option.desc}</div>
              </div>
              {isSelected && (
                <span className="material-icons text-primary text-sm">check_circle</span>
              )}
            </button>
          );
        })}
      </div>

      {/* 속도 슬라이더 */}
      {currentId !== null && (
        <section className="bg-white/5 rounded-lg p-3 border border-white/10">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-medium text-white/60">속도</span>
            <span className="text-[11px] font-mono text-primary">
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
          />
          <div className="flex justify-between mt-1">
            <span className="text-[9px] text-white/30">빠르게</span>
            <span className="text-[9px] text-white/30">느리게</span>
          </div>
        </section>
      )}
    </div>
  );
}
