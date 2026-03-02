'use client';

import React, { useState } from 'react';

interface HeaderProps {
  activeFileName?: string;
  activeFileDuration?: number;
  onRename?: (newName: string) => void;
}

export default function Header({ activeFileName, activeFileDuration, onRename }: HeaderProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');

  const formatDuration = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const displayTitle = activeFileName
    ? `${activeFileName}${activeFileDuration ? ` - ${formatDuration(activeFileDuration)}` : ''}`
    : '0213 (2)';

  const handleTitleClick = () => {
    if (activeFileName) {
      setEditName(activeFileName);
      setIsEditing(true);
    }
  };

  const handleRenameSubmit = () => {
    if (editName.trim() && onRename) {
      onRename(editName.trim());
    }
    setIsEditing(false);
  };

  return (
    <header className="h-12 border-b border-border-color bg-editor-bg flex items-center justify-between px-4 shrink-0 select-none z-50">
      {/* Left: Window Controls & Menu */}
      <div className="flex items-center space-x-4">
        <div className="flex space-x-2 group">
          <div className="w-3 h-3 rounded-full bg-red-500 group-hover:bg-red-600 transition-colors"></div>
          <div className="w-3 h-3 rounded-full bg-yellow-500 group-hover:bg-yellow-600 transition-colors"></div>
          <div className="w-3 h-3 rounded-full bg-green-500 group-hover:bg-green-600 transition-colors"></div>
        </div>
        <nav className="flex space-x-2 text-xs font-medium pl-4">
          <a className="text-white hover:text-primary transition-all duration-200 p-1.5 rounded hover:bg-white/10 relative group active:scale-90 hover:scale-110" href="#" title="File">
            <span className="material-icons text-lg">folder</span>
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-800 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
              File
            </span>
          </a>
          <a className="text-white hover:text-primary transition-all duration-200 p-1.5 rounded hover:bg-white/10 relative group active:scale-90 hover:scale-110" href="#" title="Edit">
            <span className="material-icons text-lg">edit</span>
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-800 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
              Edit
            </span>
          </a>
          <a className="text-white hover:text-primary transition-all duration-200 p-1.5 rounded hover:bg-white/10 relative group active:scale-90 hover:scale-110" href="#" title="View">
            <span className="material-icons text-lg">visibility</span>
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-800 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
              View
            </span>
          </a>
          <a className="text-white hover:text-primary transition-all duration-200 p-1.5 rounded hover:bg-white/10 relative group active:scale-90 hover:scale-110" href="#" title="Help">
            <span className="material-icons text-lg">help_outline</span>
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-800 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
              Help
            </span>
          </a>
        </nav>
      </div>

      {/* Center: Project Title / Filename */}
      <div className="flex items-center space-x-2">
        {isEditing ? (
          <input
            autoFocus
            value={editName}
            onChange={(e) => setEditName(e.target.value)}
            onBlur={handleRenameSubmit}
            onKeyDown={(e) => { if (e.key === 'Enter') handleRenameSubmit(); if (e.key === 'Escape') setIsEditing(false); }}
            className="text-sm font-semibold bg-black/50 border border-primary rounded px-2 py-0.5 text-white focus:outline-none max-w-[300px]"
          />
        ) : (
          <span
            className={`text-sm font-semibold truncate max-w-[350px] ${activeFileName ? 'cursor-pointer hover:text-primary transition-colors' : ''}`}
            onClick={handleTitleClick}
            title={activeFileName ? 'Click to rename' : ''}
          >
            {displayTitle}
          </span>
        )}
        <span className="text-xs text-text-secondary bg-border-color/30 px-2 py-0.5 rounded">Auto Saved</span>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center space-x-3">
        <a
          href="/admin/analytics"
          className="p-1.5 hover:bg-white/10 rounded-lg text-white hover:text-[#00D4D4] transition-all duration-200 relative group active:scale-90 hover:scale-110"
          title="방문자 분석 대시보드"
        >
          <span className="material-icons text-xl">analytics</span>
          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-800 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
            방문자 분석 대시보드
          </span>
        </a>
        <button 
          className="p-1.5 hover:bg-white/10 rounded-lg text-white hover:text-primary transition-all duration-200 relative group active:scale-90 hover:scale-110"
          title="Settings"
        >
          <span className="material-icons text-xl">settings</span>
          <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-800 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
            Settings
          </span>
        </button>
        <button 
          className="bg-primary hover:bg-blue-500 text-white px-4 py-1.5 rounded-lg transition-all duration-200 shadow-lg shadow-primary/30 flex items-center gap-1.5 active:scale-95 hover:scale-105"
          title="Export"
          onClick={() => alert('내보내기 설정을 열어주세요.')}
          data-ab-test="header-export-btn"
          data-ab-variant-b="내보내기 시작"
        >
          <span className="material-icons text-lg">file_download</span>
          <span className="text-xs font-semibold">Export</span>
        </button>
        <div className="w-8 h-8 bg-gradient-to-tr from-purple-500 to-primary rounded-full ml-2 ring-2 ring-primary/30"></div>
      </div>
    </header>
  );
}
