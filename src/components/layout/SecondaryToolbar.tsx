'use client';

import React, { useState } from 'react';

type TabType = 'media' | 'audio' | 'stickers' | 'effects' | 'transitions';

interface SecondaryToolbarProps {
  onTabChange?: (tab: TabType) => void;
  onSoundEffect?: () => void;
  onSticker?: () => void;
  onAutoColorCorrection?: () => void;
  onAnimationEffect?: () => void;
}

export default function SecondaryToolbar({
  onTabChange,
  onSoundEffect,
  onSticker,
  onAutoColorCorrection,
  onAnimationEffect,
}: SecondaryToolbarProps) {
  const [activeTab, setActiveTab] = useState<TabType>('media');

  const handleTabClick = (tab: TabType) => {
    setActiveTab(tab);
    onTabChange?.(tab);
  };

  const tabs: { id: TabType; label: string; icon: string; action?: () => void }[] = [
    { id: 'media', label: 'Media', icon: 'movie' },
    {
      id: 'audio',
      label: '효과음',
      icon: 'music_note',
      action: onSoundEffect,
    },
    {
      id: 'stickers',
      label: '스티커',
      icon: 'emoji_emotions',
      action: onSticker,
    },
    {
      id: 'effects',
      label: '색상 자동 보정',
      icon: 'auto_fix_high',
      action: onAutoColorCorrection,
    },
    {
      id: 'transitions',
      label: '애니메이션 효과',
      icon: 'animation',
      action: onAnimationEffect,
    },
  ];

  return (
    <div className="h-12 border-b border-border-color bg-editor-bg flex items-center px-2 shrink-0 select-none">
      <div className="flex items-center space-x-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              handleTabClick(tab.id);
              tab.action?.();
            }}
            title={tab.label}
            className={`
              flex items-center justify-center px-4 py-1 h-full transition-all duration-200 relative group
              ${activeTab === tab.id
                ? 'text-primary border-b-2 border-primary bg-white/5'
                : 'text-gray-300 hover:text-white hover:bg-white/10 rounded-t'
              }
              active:scale-95
              hover:scale-105
            `}
          >
            <span className={`material-icons text-xl transition-transform duration-200 ${activeTab === tab.id ? 'animate-pulse' : ''}`}>
              {tab.icon}
            </span>
            {/* Tooltip */}
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-800 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
              {tab.label}
            </span>
          </button>
        ))}
      </div>

      {/* Spacer */}
      <div className="flex-1" />
    </div>
  );
}
