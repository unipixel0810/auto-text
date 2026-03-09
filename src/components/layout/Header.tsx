'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/components/auth/AuthProvider';

interface HeaderProps {
  activeFileName?: string;
  activeFileDuration?: number;
  onRename?: (newName: string) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onSplit?: () => void;
  onDelete?: () => void;
  onCopy?: () => void;
  onPaste?: () => void;
  onDuplicate?: () => void;
  onSelectAll?: () => void;
  onExport?: () => void;
  onImport?: () => void;
  onFitToScreen?: () => void;
  onToggleSnap?: () => void;
  onOpenShortcuts?: () => void;
}

interface MenuItem {
  label: string;
  shortcut?: string;
  action?: () => void;
  divider?: boolean;
  disabled?: boolean;
}

export default function Header({
  activeFileName, activeFileDuration, onRename,
  onUndo, onRedo, onSplit, onDelete, onCopy, onPaste, onDuplicate, onSelectAll,
  onExport, onImport, onFitToScreen, onToggleSnap, onOpenShortcuts,
}: HeaderProps) {
  const { user, isAuthenticated, isAdmin: rawIsAdmin, signIn, signOut } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  const isAdmin = mounted && rawIsAdmin;
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);

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

  // Close menus when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpenMenu(null);
      }
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setShowProfileMenu(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const menus: { id: string; label: string; icon: string; items: MenuItem[] }[] = [
    {
      id: 'file',
      label: 'File',
      icon: 'folder',
      items: [
        { label: '새 프로젝트', shortcut: '⌘N', action: () => { if (confirm('새 프로젝트를 시작하시겠습니까?')) window.location.reload(); } },
        { label: '가져오기', shortcut: '⌘I', action: onImport },
        { label: '자막 파일 가져오기', action: onImport },
        { label: '', divider: true },
        { label: '저장', shortcut: '⌘S', action: () => alert('프로젝트가 저장되었습니다 ✓') },
        { label: '다른 이름으로 저장', shortcut: '⌘⇧S', action: () => alert('다른 이름으로 저장 완료 ✓') },
        { label: '', divider: true },
        { label: '내보내기', shortcut: '⌘E', action: onExport },
        { label: '프로젝트 설정', action: () => alert('프로젝트 설정') },
      ],
    },
    {
      id: 'edit',
      label: 'Edit',
      icon: 'edit',
      items: [
        { label: '실행 취소', shortcut: '⌘Z', action: onUndo },
        { label: '다시 실행', shortcut: '⌘⇧Z', action: onRedo },
        { label: '', divider: true },
        { label: '복사', shortcut: '⌘C', action: onCopy },
        { label: '붙여넣기', shortcut: '⌘V', action: onPaste },
        { label: '복제', shortcut: '⌘D', action: onDuplicate },
        { label: '전체 선택', shortcut: '⌘A', action: onSelectAll },
        { label: '', divider: true },
        { label: '분할', shortcut: '⌘B', action: onSplit },
        { label: '삭제', shortcut: '⌫', action: onDelete },
        { label: '', divider: true },
        { label: '단축키 설정', action: onOpenShortcuts },
      ],
    },
    {
      id: 'view',
      label: 'View',
      icon: 'preview',
      items: [
        { label: '타임라인 확대', shortcut: '⌘=', action: () => { } },
        { label: '타임라인 축소', shortcut: '⌘-', action: () => { } },
        { label: '화면에 맞추기', shortcut: '⇧Z', action: onFitToScreen },
        { label: '', divider: true },
        { label: '스냅 토글', shortcut: 'N', action: onToggleSnap },
        { label: '', divider: true },
        {
          label: '전체 화면', shortcut: 'F11', action: () => {
            if (document.fullscreenElement) document.exitFullscreen();
            else document.documentElement.requestFullscreen();
          }
        },
      ],
    },
    {
      id: 'help',
      label: 'Help',
      icon: 'help_outline',
      items: [
        { label: '단축키 설정', action: onOpenShortcuts },
        { label: '사용 가이드', action: () => alert('사용 가이드가 준비 중입니다.') },
        { label: '', divider: true },
        { label: '피드백 보내기', action: () => alert('피드백을 보내주셔서 감사합니다!') },
        { label: '버전 정보', action: () => alert('AutoText v2.0.0\n© 2026 AutoText') },
      ],
    },
  ];

  const handleMenuItemClick = (item: MenuItem) => {
    if (item.disabled || item.divider) return;
    setOpenMenu(null);
    item.action?.();
  };

  return (
    <header className="h-12 border-b border-border-color bg-editor-bg flex items-center justify-between px-4 shrink-0 select-none z-50">
      {/* Left: Window Controls & Menu */}
      <div className="flex items-center space-x-4" ref={menuRef}>
        <div className="flex space-x-2 group">
          <div className="w-3 h-3 rounded-full bg-red-500 group-hover:bg-red-600 transition-colors cursor-pointer" onClick={() => { if (confirm('창을 닫으시겠습니까?')) window.close(); }}></div>
          <div className="w-3 h-3 rounded-full bg-yellow-500 group-hover:bg-yellow-600 transition-colors cursor-pointer" onClick={() => alert('최소화')}></div>
          <div className="w-3 h-3 rounded-full bg-green-500 group-hover:bg-green-600 transition-colors cursor-pointer" onClick={() => {
            if (document.fullscreenElement) document.exitFullscreen();
            else document.documentElement.requestFullscreen();
          }}></div>
        </div>
        {/* Home & Projects */}
        <div className="flex items-center gap-1 pl-3 border-l border-white/10">
          <button
            onClick={() => router.push('/landing')}
            className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-cyan-400 transition-all relative group/home"
            title="홈 (랜딩페이지)"
          >
            <span className="material-icons text-lg">home</span>
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-[10px] text-white bg-gray-800 rounded opacity-0 group-hover/home:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">홈</span>
          </button>
          <button
            onClick={() => router.push('/projects')}
            className="p-1.5 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-all relative group/proj"
            title="프로젝트 보관함"
          >
            <span className="material-icons text-lg">movie</span>
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-[10px] text-white bg-gray-800 rounded opacity-0 group-hover/proj:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">프로젝트 보관함</span>
          </button>
        </div>
        <nav className="flex space-x-1 text-xs font-medium pl-4">
          {menus.map(menu => (
            <div key={menu.id} className="relative">
              <button
                className={`text-white hover:text-primary transition-all duration-200 p-1.5 rounded hover:bg-white/10 relative group active:scale-90 ${openMenu === menu.id ? 'text-primary bg-white/10' : ''
                  }`}
                onClick={() => setOpenMenu(openMenu === menu.id ? null : menu.id)}
                onMouseEnter={() => { if (openMenu) setOpenMenu(menu.id); }}
                title={menu.label}
              >
                <span className="material-icons text-lg">{menu.icon}</span>
              </button>

              {/* Dropdown Menu */}
              {openMenu === menu.id && (
                <div className="absolute top-full left-0 mt-1 w-56 bg-[#1a1a24] border border-white/10 rounded-xl shadow-2xl py-1.5 z-[100] animate-in fade-in slide-in-from-top-1">
                  {menu.items.map((item, idx) =>
                    item.divider ? (
                      <div key={idx} className="h-px bg-white/10 my-1 mx-3"></div>
                    ) : (
                      <button
                        key={idx}
                        onClick={() => handleMenuItemClick(item)}
                        disabled={item.disabled}
                        className={`w-full flex items-center justify-between px-3 py-2 text-xs transition-colors ${item.disabled
                          ? 'text-gray-600 cursor-not-allowed'
                          : 'text-gray-300 hover:text-white hover:bg-white/10'
                          }`}
                      >
                        <span>{item.label}</span>
                        {item.shortcut && (
                          <span className="text-gray-600 text-[10px] font-mono ml-4">{item.shortcut}</span>
                        )}
                      </button>
                    )
                  )}
                </div>
              )}
            </div>
          ))}
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
        {/* Admin Dashboard Link — only visible to admins */}
        {isAdmin && (
          <a
            href="/admin/analytics"
            className="p-1.5 hover:bg-white/10 rounded-lg text-white hover:text-[#00D4D4] transition-all duration-200 relative group active:scale-90 hover:scale-110"
            title="관리자 대시보드"
          >
            <span className="material-icons text-xl">analytics</span>
            <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs text-white bg-gray-800 rounded opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap transition-opacity z-50">
              관리자 대시보드
            </span>
          </a>
        )}
        <button
          className="p-1.5 hover:bg-white/10 rounded-lg text-white hover:text-primary transition-all duration-200 relative group active:scale-90 hover:scale-110"
          title="단축키 설정"
          onClick={onOpenShortcuts}
        >
          <span className="material-icons text-xl">keyboard</span>
        </button>
        <button
          className="bg-primary hover:bg-blue-500 text-white px-4 py-1.5 rounded-lg transition-all duration-200 shadow-lg shadow-primary/30 flex items-center gap-1.5 active:scale-95 hover:scale-105"
          title="Export"
          onClick={onExport || (() => alert('내보내기 설정을 열어주세요.'))}
        >
          <span className="material-icons text-lg">file_download</span>
          <span className="text-xs font-semibold">Export</span>
        </button>

        {/* Profile / Auth */}
        <div className="relative" ref={profileRef}>
          {mounted && isAuthenticated && user ? (
            <>
              <button
                onClick={() => setShowProfileMenu(!showProfileMenu)}
                className="flex items-center gap-2 ml-1 hover:opacity-80 transition-opacity"
              >
                {user.image ? (
                  <img
                    src={user.image}
                    alt={user.name || ''}
                    className="w-8 h-8 rounded-full ring-2 ring-cyan-500/40 hover:ring-4 transition-all"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-8 h-8 bg-gradient-to-tr from-cyan-500 to-blue-600 rounded-full ring-2 ring-cyan-500/40 flex items-center justify-center text-white text-xs font-bold">
                    {user.name?.charAt(0) || '?'}
                  </div>
                )}
              </button>
              {showProfileMenu && (
                <div className="absolute top-full right-0 mt-2 w-64 bg-[#1a1a24] border border-white/10 rounded-xl shadow-2xl py-2 z-[100]">
                  <div className="px-4 py-3 border-b border-white/10">
                    <p className="text-sm font-medium text-white truncate">{user.name}</p>
                    <p className="text-xs text-gray-400 truncate">{user.email}</p>
                    {isAdmin && (
                      <span className="inline-block mt-1 text-[9px] bg-cyan-500/20 text-cyan-400 px-1.5 py-0.5 rounded font-semibold">ADMIN</span>
                    )}
                  </div>
                  {isAdmin && (
                    <a
                      href="/admin/analytics"
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
                      onClick={() => setShowProfileMenu(false)}
                    >
                      <span className="material-icons text-sm">admin_panel_settings</span>
                      관리자 대시보드
                    </a>
                  )}
                  <button
                    onClick={() => { setShowProfileMenu(false); signOut(); }}
                    className="w-full flex items-center gap-2 px-4 py-2.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                  >
                    <span className="material-icons text-sm">logout</span>
                    로그아웃
                  </button>
                </div>
              )}
            </>
          ) : (
            <button
              onClick={signIn}
              className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded-lg transition-all text-xs font-medium ml-1"
            >
              <span className="material-icons text-sm">login</span>
              로그인
            </button>
          )}
        </div>
      </div>
    </header>
  );
}

