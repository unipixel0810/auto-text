'use client';

import React, { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
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
  const { isAdmin: rawIsAdmin, user, isAuthenticated, signIn, signOut } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  useEffect(() => { setMounted(true); }, []);
  const isAdmin = mounted && rawIsAdmin;

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);
  const [isEditing, setIsEditing] = useState(false);
  const [editName, setEditName] = useState('');
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

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

        {/* Profile / Login */}
        {mounted && (
          isAuthenticated && user ? (
            <div className="relative" ref={profileRef}>
              <button
                onClick={() => setProfileOpen(prev => !prev)}
                className="flex items-center gap-2 pl-2 pr-3 py-1 rounded-lg hover:bg-white/10 transition-all group"
                title={user.name ?? '프로필'}
              >
                {user.image ? (
                  <Image
                    src={user.image}
                    alt={user.name ?? ''}
                    width={26}
                    height={26}
                    className="rounded-full ring-1 ring-white/20 group-hover:ring-[#00D4D4]/60 transition-all"
                  />
                ) : (
                  <div className="w-[26px] h-[26px] rounded-full bg-[#00D4D4]/20 flex items-center justify-center ring-1 ring-[#00D4D4]/40">
                    <span className="material-icons text-[14px] text-[#00D4D4]">person</span>
                  </div>
                )}
                <span className="text-xs text-gray-300 group-hover:text-white transition-colors max-w-[90px] truncate hidden sm:block">
                  {user.name?.split(' ')[0]}
                </span>
                <span className="material-icons text-[14px] text-gray-500">expand_more</span>
              </button>

              {profileOpen && (
                <div className="absolute top-full right-0 mt-1.5 w-52 bg-[#1a1a24] border border-white/10 rounded-xl shadow-2xl py-2 z-[100] animate-in fade-in slide-in-from-top-1">
                  {/* User info */}
                  <div className="px-4 py-3 border-b border-white/10">
                    <div className="flex items-center gap-3 mb-1">
                      {user.image ? (
                        <Image src={user.image} alt="" width={32} height={32} className="rounded-full" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-[#00D4D4]/20 flex items-center justify-center">
                          <span className="material-icons text-[16px] text-[#00D4D4]">person</span>
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate">{user.name}</p>
                        <p className="text-[10px] text-gray-500 truncate">{user.email}</p>
                      </div>
                    </div>
                    {isAdmin && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-[#00D4D4] bg-[#00D4D4]/10 px-2 py-0.5 rounded-full mt-1">
                        <span className="material-icons text-[11px]">shield</span>
                        관리자
                      </span>
                    )}
                  </div>

                  {/* Menu items */}
                  {isAdmin && (
                    <a
                      href="/admin/analytics"
                      className="flex items-center gap-2.5 px-4 py-2.5 text-xs text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
                      onClick={() => setProfileOpen(false)}
                    >
                      <span className="material-icons text-[16px] text-[#00D4D4]">analytics</span>
                      관리자 대시보드
                    </a>
                  )}
                  <button
                    onClick={() => { setProfileOpen(false); router.push('/projects'); }}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-gray-300 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <span className="material-icons text-[16px] text-gray-500">folder</span>
                    내 프로젝트
                  </button>
                  <div className="h-px bg-white/10 mx-3 my-1" />
                  <button
                    onClick={() => { setProfileOpen(false); signOut(); }}
                    className="w-full flex items-center gap-2.5 px-4 py-2.5 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
                  >
                    <span className="material-icons text-[16px]">logout</span>
                    로그아웃
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              onClick={() => signIn()}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white transition-all"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" className="shrink-0">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
              Google 로그인
            </button>
          )
        )}
      </div>
    </header>
  );
}

