'use client';

import React, { useState, useMemo, useCallback } from 'react';
import type { SubtitleItem, SubtitleType } from '@/types/subtitle';
import { 
  downloadSrt, 
  downloadVtt, 
  downloadJson,
  previewSrt,
  type SrtExportOptions 
} from '@/utils/exportSrt';

// ============================================
// 타입 정의
// ============================================

interface SubtitleListProps {
  subtitles: SubtitleItem[];
  onUpdate?: (id: string, updates: Partial<SubtitleItem>) => void;
  onDelete?: (id: string) => void;
  currentTime?: number;
  onSeek?: (time: number) => void;
  videoFileName?: string;
}

type ExportFormat = 'srt' | 'vtt' | 'json';
type TagFormat = 'bracket' | 'parenthesis' | 'emoji' | 'none';

// ============================================
// 상수 및 스타일
// ============================================

const TYPE_CONFIG: Record<SubtitleType, { color: string; label: string; icon: string }> = {
  ENTERTAINMENT: { color: 'hsl(330 80% 60%)', label: '예능', icon: '🎭' },
  SITUATION: { color: 'hsl(210 80% 60%)', label: '상황', icon: '📍' },
  EXPLANATION: { color: 'hsl(150 80% 50%)', label: '설명', icon: '📚' },
  TRANSCRIPT: { color: 'hsl(45 80% 60%)', label: '말자막', icon: '💬' },
};

// ============================================
// 유틸리티 함수
// ============================================

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

// ============================================
// 서브 컴포넌트: 개별 자막 아이템
// ============================================

interface SubtitleItemRowProps {
  item: SubtitleItem;
  index: number;
  isActive: boolean;
  onUpdate?: (id: string, updates: Partial<SubtitleItem>) => void;
  onDelete?: (id: string) => void;
  onSeek?: (time: number) => void;
}

function SubtitleItemRow({ item, index, isActive, onUpdate, onDelete, onSeek }: SubtitleItemRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editText, setEditText] = useState(item.text);
  const [editType, setEditType] = useState<SubtitleType>(item.type);

  const config = TYPE_CONFIG[item.type];

  const handleSave = useCallback(() => {
    if (editText !== item.text || editType !== item.type) {
      onUpdate?.(item.id, { text: editText, type: editType });
    }
    setIsEditing(false);
  }, [editText, editType, item, onUpdate]);

  const handleCancel = useCallback(() => {
    setEditText(item.text);
    setEditType(item.type);
    setIsEditing(false);
  }, [item]);

  return (
    <div
      className={`group relative p-4 rounded-xl transition-all duration-300 ${isActive ? 'animate-pulse-glow' : ''}`}
      style={{
        background: isActive ? 'hsl(185 100% 50% / 0.1)' : 'linear-gradient(135deg, hsl(220 18% 10%) 0%, hsl(220 18% 6%) 100%)',
        border: `1px solid ${isActive ? 'hsl(185 100% 50% / 0.5)' : 'hsl(220 15% 18%)'}`,
      }}
    >
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span 
            className="w-7 h-7 flex items-center justify-center rounded-lg text-sm font-medium"
            style={{ background: 'hsl(220 15% 12%)', color: 'hsl(215 20% 55%)' }}
          >
            {index + 1}
          </span>

          <button
            type="button"
            onClick={() => onSeek?.(item.startTime)}
            className="text-sm font-mono transition-colors"
            style={{ color: 'hsl(215 20% 55%)' }}
            onMouseEnter={(e) => e.currentTarget.style.color = 'hsl(185 100% 50%)'}
            onMouseLeave={(e) => e.currentTarget.style.color = 'hsl(215 20% 55%)'}
          >
            {formatTime(item.startTime)} → {formatTime(item.endTime)}
          </button>

          {isEditing ? (
            <select
              value={editType}
              onChange={(e) => setEditType(e.target.value as SubtitleType)}
              className="px-2 py-1 rounded-lg text-sm outline-none"
              style={{ 
                background: 'hsl(220 18% 8%)', 
                border: '1px solid hsl(220 15% 18%)',
                color: 'hsl(210 40% 98%)'
              }}
            >
              {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
                <option key={key} value={key}>{cfg.icon} {cfg.label}</option>
              ))}
            </select>
          ) : (
            <span 
              className="px-2 py-1 rounded-lg text-xs font-medium"
              style={{ background: `${config.color}20`, color: config.color }}
            >
              {config.icon} {config.label}
            </span>
          )}
        </div>

        {/* 액션 버튼 */}
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          {isEditing ? (
            <>
              <button onClick={handleSave} className="p-1.5 rounded-lg transition-colors"
                style={{ background: 'hsl(150 80% 50% / 0.2)', color: 'hsl(150 80% 50%)' }}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </button>
              <button onClick={handleCancel} className="p-1.5 rounded-lg transition-colors"
                style={{ background: 'hsl(220 15% 15%)', color: 'hsl(215 20% 55%)' }}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </>
          ) : (
            <>
              <button onClick={() => setIsEditing(true)} className="p-1.5 rounded-lg transition-colors"
                style={{ background: 'hsl(220 15% 15%)', color: 'hsl(215 20% 55%)' }}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button onClick={() => onDelete?.(item.id)} className="p-1.5 rounded-lg transition-colors"
                style={{ background: 'hsl(220 15% 15%)', color: 'hsl(215 20% 55%)' }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = 'hsl(0 72% 51% / 0.2)';
                  e.currentTarget.style.color = 'hsl(0 72% 60%)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = 'hsl(220 15% 15%)';
                  e.currentTarget.style.color = 'hsl(215 20% 55%)';
                }}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </>
          )}
        </div>
      </div>

      {/* 텍스트 */}
      {isEditing ? (
        <textarea
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          className="w-full p-3 rounded-lg resize-none outline-none"
          style={{ 
            background: 'hsl(220 18% 6%)', 
            border: '1px solid hsl(185 100% 50%)',
            color: 'hsl(210 40% 98%)'
          }}
          rows={2}
          autoFocus
        />
      ) : (
        <p style={{ color: 'hsl(210 40% 98%)' }}>{item.text}</p>
      )}

      {/* 활성 인디케이터 */}
      {isActive && (
        <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-8 rounded-r-full"
          style={{ background: 'hsl(185 100% 50%)' }} />
      )}
    </div>
  );
}

// ============================================
// 서브 컴포넌트: 내보내기 모달
// ============================================

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  subtitles: SubtitleItem[];
  videoFileName?: string;
}

function ExportModal({ isOpen, onClose, subtitles, videoFileName }: ExportModalProps) {
  const [format, setFormat] = useState<ExportFormat>('srt');
  const [tagFormat, setTagFormat] = useState<TagFormat>('bracket');

  const filename = useMemo(() => {
    const base = videoFileName?.replace(/\.[^.]+$/, '') || 'subtitle';
    return `${base}.${format}`;
  }, [videoFileName, format]);

  const preview = useMemo(() => {
    if (format === 'json') return JSON.stringify(subtitles.slice(0, 2), null, 2);
    return previewSrt(subtitles, 3, { tagFormat, includeTypeTag: tagFormat !== 'none' });
  }, [subtitles, format, tagFormat]);

  const handleExport = useCallback(() => {
    const options: SrtExportOptions = { filename, tagFormat, includeTypeTag: tagFormat !== 'none' };
    if (format === 'srt') downloadSrt(subtitles, options);
    else if (format === 'vtt') downloadVtt(subtitles, options);
    else downloadJson(subtitles, filename);
    onClose();
  }, [format, subtitles, filename, tagFormat, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 backdrop-blur-sm" style={{ background: 'hsl(220 20% 4% / 0.8)' }} onClick={onClose} />
      
      <div className="relative w-full max-w-lg glass-card p-6 animate-fade-in">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold" style={{ color: 'hsl(210 40% 98%)' }}>자막 내보내기</h2>
          <button onClick={onClose} className="p-2 rounded-lg" style={{ color: 'hsl(215 20% 55%)' }}>
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* 파일 형식 */}
        <div className="mb-6">
          <label className="text-sm font-medium mb-3 block" style={{ color: 'hsl(215 20% 55%)' }}>파일 형식</label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { value: 'srt', label: 'SRT' },
              { value: 'vtt', label: 'WebVTT' },
              { value: 'json', label: 'JSON' },
            ].map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFormat(opt.value as ExportFormat)}
                className="py-3 rounded-xl font-medium transition-all duration-300"
                style={{
                  background: format === opt.value ? 'hsl(185 100% 50% / 0.1)' : 'hsl(220 15% 12%)',
                  border: `1px solid ${format === opt.value ? 'hsl(185 100% 50%)' : 'hsl(220 15% 18%)'}`,
                  color: format === opt.value ? 'hsl(185 100% 50%)' : 'hsl(210 40% 98%)',
                  boxShadow: format === opt.value ? '0 0 15px hsl(185 100% 50% / 0.2)' : 'none'
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 태그 형식 */}
        {format !== 'json' && (
          <div className="mb-6">
            <label className="text-sm font-medium mb-3 block" style={{ color: 'hsl(215 20% 55%)' }}>유형 태그</label>
            <div className="grid grid-cols-4 gap-2">
              {[
                { value: 'bracket', label: '[예능]' },
                { value: 'emoji', label: '🎭' },
                { value: 'parenthesis', label: '(예능)' },
                { value: 'none', label: '없음' },
              ].map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setTagFormat(opt.value as TagFormat)}
                  className="py-2 rounded-lg text-sm transition-all duration-300"
                  style={{
                    background: tagFormat === opt.value ? 'hsl(185 100% 50% / 0.1)' : 'hsl(220 15% 12%)',
                    border: `1px solid ${tagFormat === opt.value ? 'hsl(185 100% 50%)' : 'hsl(220 15% 18%)'}`,
                    color: tagFormat === opt.value ? 'hsl(185 100% 50%)' : 'hsl(215 20% 55%)'
                  }}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 미리보기 */}
        <div className="mb-6">
          <label className="text-sm font-medium mb-3 block" style={{ color: 'hsl(215 20% 55%)' }}>미리보기</label>
          <pre className="p-4 rounded-xl text-xs font-mono overflow-auto max-h-32"
            style={{ background: 'hsl(220 18% 6%)', color: 'hsl(215 20% 65%)', border: '1px solid hsl(220 15% 18%)' }}>
            {preview}
          </pre>
        </div>

        {/* 버튼 */}
        <div className="flex gap-3">
          <button onClick={onClose} className="flex-1 py-3 rounded-xl font-medium btn-neon">
            취소
          </button>
          <button onClick={handleExport} className="flex-1 py-3 rounded-xl font-medium btn-hero flex items-center justify-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            다운로드
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================
// 메인 컴포넌트
// ============================================

export default function SubtitleList({
  subtitles,
  onUpdate,
  onDelete,
  currentTime = 0,
  onSeek,
  videoFileName,
}: SubtitleListProps) {
  const [showExportModal, setShowExportModal] = useState(false);
  const [filterType, setFilterType] = useState<SubtitleType | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSubtitles = useMemo(() => {
    return subtitles.filter((item) => {
      const matchesType = filterType === 'all' || item.type === filterType;
      const matchesSearch = !searchQuery || item.text.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesType && matchesSearch;
    });
  }, [subtitles, filterType, searchQuery]);

  const activeIndex = useMemo(() => {
    return subtitles.findIndex(item => currentTime >= item.startTime && currentTime < item.endTime);
  }, [subtitles, currentTime]);

  const stats = useMemo(() => {
    const types = subtitles.reduce((acc, item) => {
      acc[item.type] = (acc[item.type] || 0) + 1;
      return acc;
    }, {} as Record<SubtitleType, number>);
    return { total: subtitles.length, ...types };
  }, [subtitles]);

  if (subtitles.length === 0) {
    return (
      <div className="glass-card p-12 text-center">
        <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
          style={{ background: 'hsl(220 15% 12%)' }}>
          <svg className="w-8 h-8" style={{ color: 'hsl(215 20% 40%)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold mb-2" style={{ color: 'hsl(210 40% 98%)' }}>자막이 없습니다</h3>
        <p style={{ color: 'hsl(215 20% 55%)' }}>영상을 업로드하면 자막이 여기에 표시됩니다</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 통계 */}
      <div className="glass-card p-4">
        <div className="grid grid-cols-5 gap-4 text-center">
          <div>
            <p className="text-2xl font-bold" style={{ color: 'hsl(210 40% 98%)' }}>{stats.total}</p>
            <p className="text-xs" style={{ color: 'hsl(215 20% 55%)' }}>전체</p>
          </div>
          {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
            <div key={key}>
              <p className="text-2xl font-bold" style={{ color: cfg.color }}>{stats[key as SubtitleType] || 0}</p>
              <p className="text-xs" style={{ color: 'hsl(215 20% 55%)' }}>{cfg.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* 검색 및 필터 */}
      <div className="flex gap-3">
        <div className="flex-1 relative">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: 'hsl(215 20% 45%)' }} fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
          </svg>
          <input
            type="text"
            placeholder="자막 검색..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl outline-none transition-all duration-300"
            style={{ 
              background: 'hsl(220 18% 8%)', 
              border: '1px solid hsl(220 15% 18%)',
              color: 'hsl(210 40% 98%)'
            }}
            onFocus={(e) => e.currentTarget.style.borderColor = 'hsl(185 100% 50%)'}
            onBlur={(e) => e.currentTarget.style.borderColor = 'hsl(220 15% 18%)'}
          />
        </div>

        <select
          value={filterType}
          onChange={(e) => setFilterType(e.target.value as SubtitleType | 'all')}
          className="px-4 py-2.5 rounded-xl outline-none"
          style={{ 
            background: 'hsl(220 18% 8%)', 
            border: '1px solid hsl(220 15% 18%)',
            color: 'hsl(210 40% 98%)'
          }}
        >
          <option value="all">전체 유형</option>
          {Object.entries(TYPE_CONFIG).map(([key, cfg]) => (
            <option key={key} value={key}>{cfg.icon} {cfg.label}</option>
          ))}
        </select>

        <button
          onClick={() => setShowExportModal(true)}
          className="px-5 py-2.5 rounded-xl font-medium btn-hero flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          SRT 다운로드
        </button>
      </div>

      {/* 자막 목록 */}
      <div className="space-y-2">
        {filteredSubtitles.map((item) => {
          const originalIndex = subtitles.findIndex(s => s.id === item.id);
          return (
            <SubtitleItemRow
              key={item.id}
              item={item}
              index={originalIndex}
              isActive={originalIndex === activeIndex}
              onUpdate={onUpdate}
              onDelete={onDelete}
              onSeek={onSeek}
            />
          );
        })}
      </div>

      <ExportModal
        isOpen={showExportModal}
        onClose={() => setShowExportModal(false)}
        subtitles={subtitles}
        videoFileName={videoFileName}
      />
    </div>
  );
}
