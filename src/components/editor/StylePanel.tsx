'use client';

import React from 'react';
import type { SubtitleStyle } from '@/types/subtitle';

interface StylePanelProps {
  style: SubtitleStyle;
  onChange: (style: Partial<SubtitleStyle>) => void;
  onApplyToAll?: () => void;
  compact?: boolean;
}

// 요청된 폰트 옵션
const FONT_OPTIONS = [
  { value: 'TMONBlack', label: '티몬 몬소리 Black' },
  { value: 'TMONRegular', label: '티몬 몬소리 Regular' },
  { value: 'PaperlogyBold', label: '페이퍼로지 7 (Bold)' },
  { value: 'PaperlogyExtraBold', label: '페이퍼로지 8 (ExtraBold)' },
  { value: 'PresentationRegular', label: '프레젠테이션체 (Regular)' },
  { value: 'PresentationBold', label: '프레젠테이션체 (Bold)' },
];

// 텍스트 색상 (블랙/화이트)
const TEXT_COLORS = ['#FFFFFF', '#000000'];

// 배경 색상 프리셋
const BG_COLORS = [
  '#FFE066', '#FF6B6B', '#00FFFF', '#88D8FF', 
  '#FF69B4', '#98FB98', '#FFB347', '#DDA0DD'
];

export default function StylePanel({ style, onChange, onApplyToAll, compact = false }: StylePanelProps) {
  if (compact) {
    // 영상 아래에 표시되는 컴팩트 버전
    return (
      <div 
        className="p-4 rounded-xl space-y-4"
        style={{ background: 'hsl(220 18% 8%)', border: '1px solid hsl(220 15% 18%)' }}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium" style={{ color: 'hsl(210 40% 98%)' }}>🎨 자막 스타일</span>
          {onApplyToAll && (
            <button
              onClick={onApplyToAll}
              className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80"
              style={{ 
                background: 'linear-gradient(135deg, hsl(185 100% 50%), hsl(200 100% 45%))',
                color: '#000'
              }}
            >
              ✨ 모두 적용
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          {/* 폰트 선택 */}
          <div>
            <label className="text-xs block mb-1.5" style={{ color: 'hsl(215 20% 55%)' }}>폰트</label>
            <select
              value={style.fontFamily}
              onChange={(e) => onChange({ fontFamily: e.target.value })}
              className="w-full p-2 rounded-lg text-sm outline-none"
              style={{ 
                background: 'hsl(220 18% 12%)', 
                border: '1px solid hsl(220 15% 20%)',
                color: 'hsl(210 40% 98%)'
              }}
            >
              {FONT_OPTIONS.map((font) => (
                <option key={font.value} value={font.value}>{font.label}</option>
              ))}
            </select>
          </div>

          {/* 크기 */}
          <div>
            <label className="text-xs block mb-1.5" style={{ color: 'hsl(215 20% 55%)' }}>
              크기: {style.fontSize}px
            </label>
            <input
              type="range"
              min="24"
              max="80"
              value={style.fontSize}
              onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
              className="w-full h-2 rounded-full appearance-none cursor-pointer"
              style={{ background: 'hsl(220 15% 20%)', accentColor: 'hsl(185 100% 50%)' }}
            />
          </div>
        </div>

        {/* 위치 */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs block mb-1.5" style={{ color: 'hsl(215 20% 55%)' }}>
              위치 X: {style.x}%
            </label>
            <input
              type="range"
              min="5"
              max="95"
              value={style.x}
              onChange={(e) => onChange({ x: Number(e.target.value) })}
              className="w-full h-2 rounded-full appearance-none cursor-pointer"
              style={{ background: 'hsl(220 15% 20%)', accentColor: 'hsl(185 100% 50%)' }}
            />
          </div>
          <div>
            <label className="text-xs block mb-1.5" style={{ color: 'hsl(215 20% 55%)' }}>
              위치 Y: {style.y}%
            </label>
            <input
              type="range"
              min="5"
              max="95"
              value={style.y}
              onChange={(e) => onChange({ y: Number(e.target.value) })}
              className="w-full h-2 rounded-full appearance-none cursor-pointer"
              style={{ background: 'hsl(220 15% 20%)', accentColor: 'hsl(185 100% 50%)' }}
            />
          </div>
        </div>

        {/* 텍스트 색상 (블랙/화이트) */}
        <div>
          <label className="text-xs block mb-1.5" style={{ color: 'hsl(215 20% 55%)' }}>텍스트 색상</label>
          <div className="flex items-center gap-2">
            {TEXT_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => onChange({ color })}
                className={`w-10 h-8 rounded-lg transition-all border-2 flex items-center justify-center text-xs font-medium`}
                style={{ 
                  background: color,
                  borderColor: style.color === color ? 'hsl(185 100% 50%)' : 'hsl(220 15% 25%)',
                  color: color === '#FFFFFF' ? '#000' : '#FFF'
                }}
              >
                {color === '#FFFFFF' ? '흰색' : '검정'}
              </button>
            ))}
          </div>
        </div>

        {/* 배경 색상 */}
        <div>
          <label className="text-xs block mb-1.5" style={{ color: 'hsl(215 20% 55%)' }}>배경 색상</label>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => onChange({ backgroundColor: 'transparent' })}
              className={`w-7 h-7 rounded-lg transition-all border-2 flex items-center justify-center text-xs`}
              style={{ 
                background: 'repeating-conic-gradient(#808080 0% 25%, transparent 0% 50%) 50% / 10px 10px',
                borderColor: style.backgroundColor === 'transparent' ? 'hsl(185 100% 50%)' : 'hsl(220 15% 25%)'
              }}
              title="투명"
            />
            {BG_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => onChange({ backgroundColor: color })}
                className={`w-7 h-7 rounded-lg transition-all border-2 ${style.backgroundColor === color ? 'scale-110' : ''}`}
                style={{ 
                  background: color,
                  borderColor: style.backgroundColor === color ? 'white' : 'transparent'
                }}
              />
            ))}
          </div>
        </div>

        {/* 테두리 & 그림자 */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs block mb-1.5" style={{ color: 'hsl(215 20% 55%)' }}>
              테두리: {style.strokeWidth}px
            </label>
            <div className="flex gap-2">
              <input
                type="range"
                min="0"
                max="8"
                value={style.strokeWidth}
                onChange={(e) => onChange({ strokeWidth: Number(e.target.value) })}
                className="flex-1 h-2 rounded-full appearance-none cursor-pointer"
                style={{ background: 'hsl(220 15% 20%)', accentColor: 'hsl(185 100% 50%)' }}
              />
              <input
                type="color"
                value={style.strokeColor}
                onChange={(e) => onChange({ strokeColor: e.target.value })}
                className="w-7 h-7 rounded cursor-pointer"
              />
            </div>
          </div>
          <div>
            <label className="text-xs block mb-1.5" style={{ color: 'hsl(215 20% 55%)' }}>
              그림자: {style.shadowBlur}px
            </label>
            <div className="flex gap-2">
              <input
                type="range"
                min="0"
                max="15"
                value={style.shadowBlur}
                onChange={(e) => onChange({ shadowBlur: Number(e.target.value) })}
                className="flex-1 h-2 rounded-full appearance-none cursor-pointer"
                style={{ background: 'hsl(220 15% 20%)', accentColor: 'hsl(185 100% 50%)' }}
              />
              <input
                type="color"
                value={style.shadowColor}
                onChange={(e) => onChange({ shadowColor: e.target.value })}
                className="w-7 h-7 rounded cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // 기존 전체 버전 (사이드바용)
  return (
    <div className="h-full flex flex-col">
      {/* 헤더 */}
      <div className="flex items-center gap-3 p-4" style={{ borderBottom: '1px solid hsl(220 15% 18%)' }}>
        <div className="w-1 h-5 rounded-full" style={{ background: 'hsl(45 80% 60%)' }} />
        <h3 className="font-semibold" style={{ color: 'hsl(210 40% 98%)' }}>스타일 설정</h3>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* 위치 */}
        <div>
          <label className="text-xs font-medium block mb-3" style={{ color: 'hsl(215 20% 65%)' }}>
            위치
          </label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <span className="text-xs" style={{ color: 'hsl(215 20% 45%)' }}>X: {style.x}%</span>
              <input
                type="range"
                min="0"
                max="100"
                value={style.x}
                onChange={(e) => onChange({ x: Number(e.target.value) })}
                className="w-full h-1 rounded-full appearance-none cursor-pointer"
                style={{ background: 'hsl(220 15% 20%)' }}
              />
            </div>
            <div>
              <span className="text-xs" style={{ color: 'hsl(215 20% 45%)' }}>Y: {style.y}%</span>
              <input
                type="range"
                min="0"
                max="100"
                value={style.y}
                onChange={(e) => onChange({ y: Number(e.target.value) })}
                className="w-full h-1 rounded-full appearance-none cursor-pointer"
                style={{ background: 'hsl(220 15% 20%)' }}
              />
            </div>
          </div>
        </div>

        {/* 폰트 */}
        <div>
          <label className="text-xs font-medium block mb-2" style={{ color: 'hsl(215 20% 65%)' }}>
            폰트
          </label>
          <select
            value={style.fontFamily}
            onChange={(e) => onChange({ fontFamily: e.target.value })}
            className="w-full p-2 rounded-lg text-sm outline-none"
            style={{ 
              background: 'hsl(220 18% 10%)', 
              border: '1px solid hsl(220 15% 20%)',
              color: 'hsl(210 40% 98%)'
            }}
          >
            {FONT_OPTIONS.map((font) => (
              <option key={font.value} value={font.value}>{font.label}</option>
            ))}
          </select>
        </div>

        {/* 크기 */}
        <div>
          <label className="text-xs font-medium block mb-2" style={{ color: 'hsl(215 20% 65%)' }}>
            크기: {style.fontSize}px
          </label>
          <input
            type="range"
            min="20"
            max="100"
            value={style.fontSize}
            onChange={(e) => onChange({ fontSize: Number(e.target.value) })}
            className="w-full h-1 rounded-full appearance-none cursor-pointer"
            style={{ background: 'hsl(220 15% 20%)' }}
          />
        </div>

        {/* 텍스트 색상 (블랙/화이트) */}
        <div>
          <label className="text-xs font-medium block mb-2" style={{ color: 'hsl(215 20% 65%)' }}>
            텍스트 색상
          </label>
          <div className="flex items-center gap-2">
            {TEXT_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => onChange({ color })}
                className={`px-4 py-2 rounded-lg transition-all border-2 text-sm font-medium`}
                style={{ 
                  background: color,
                  borderColor: style.color === color ? 'hsl(185 100% 50%)' : 'hsl(220 15% 25%)',
                  color: color === '#FFFFFF' ? '#000' : '#FFF'
                }}
              >
                {color === '#FFFFFF' ? '흰색' : '검정'}
              </button>
            ))}
          </div>
        </div>

        {/* 배경 색상 */}
        <div>
          <label className="text-xs font-medium block mb-2" style={{ color: 'hsl(215 20% 65%)' }}>
            배경 색상
          </label>
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => onChange({ backgroundColor: 'transparent' })}
              className={`w-7 h-7 rounded-lg transition-all border-2`}
              style={{ 
                background: 'repeating-conic-gradient(#808080 0% 25%, transparent 0% 50%) 50% / 10px 10px',
                borderColor: style.backgroundColor === 'transparent' ? 'hsl(185 100% 50%)' : 'hsl(220 15% 25%)'
              }}
              title="투명"
            />
            {BG_COLORS.map((color) => (
              <button
                key={color}
                onClick={() => onChange({ backgroundColor: color })}
                className={`w-7 h-7 rounded-lg transition-all ${style.backgroundColor === color ? 'ring-2 ring-white scale-110' : ''}`}
                style={{ background: color }}
              />
            ))}
          </div>
        </div>

        {/* 테두리 */}
        <div>
          <label className="text-xs font-medium block mb-2" style={{ color: 'hsl(215 20% 65%)' }}>
            테두리: {style.strokeWidth}px
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0"
              max="10"
              value={style.strokeWidth}
              onChange={(e) => onChange({ strokeWidth: Number(e.target.value) })}
              className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
              style={{ background: 'hsl(220 15% 20%)' }}
            />
            <input
              type="color"
              value={style.strokeColor}
              onChange={(e) => onChange({ strokeColor: e.target.value })}
              className="w-7 h-7 rounded-lg cursor-pointer"
            />
          </div>
        </div>

        {/* 그림자 */}
        <div>
          <label className="text-xs font-medium block mb-2" style={{ color: 'hsl(215 20% 65%)' }}>
            그림자: {style.shadowBlur}px
          </label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min="0"
              max="20"
              value={style.shadowBlur}
              onChange={(e) => onChange({ shadowBlur: Number(e.target.value) })}
              className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
              style={{ background: 'hsl(220 15% 20%)' }}
            />
            <input
              type="color"
              value={style.shadowColor}
              onChange={(e) => onChange({ shadowColor: e.target.value })}
              className="w-7 h-7 rounded-lg cursor-pointer"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
