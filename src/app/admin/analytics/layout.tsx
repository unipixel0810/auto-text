'use client';

import React, { useState } from 'react';
import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { SegmentBuilder, type SegmentFilter } from '@/components/analytics/SegmentBuilder';

const NAV_GROUPS: { label: string; items: { href: string; label: string; icon: string; isNew?: boolean }[] }[] = [
  {
    label: 'Insights',
    items: [
      { href: '/admin/analytics', label: '개요', icon: 'dashboard' },
      { href: '/admin/analytics/retention', label: '리텐션', icon: 'event_repeat', isNew: true },
      { href: '/admin/analytics/flows', label: '유저 경로', icon: 'account_tree', isNew: true },
      { href: '/admin/analytics/cohorts', label: '코호트', icon: 'groups', isNew: true },
    ],
  },
  {
    label: 'Users',
    items: [
      { href: '/admin/analytics/users', label: '유저 프로필', icon: 'person_search', isNew: true },
      { href: '/admin/analytics/live', label: '실시간', icon: 'stream', isNew: true },
    ],
  },
  {
    label: 'Engagement',
    items: [
      { href: '/admin/analytics/demographics', label: '인구통계', icon: 'group' },
      { href: '/admin/analytics/heatmap', label: '히트맵', icon: 'heat_map' },
      { href: '/admin/analytics/funnels', label: '퍼널', icon: 'filter_alt' },
      { href: '/admin/analytics/experiments', label: 'A/B 테스트', icon: 'science' },
      { href: '/admin/analytics/recordings', label: '세션 녹화', icon: 'videocam' },
    ],
  },
  {
    label: 'Product',
    items: [
      { href: '/admin/analytics/editing', label: '편집 데이터', icon: 'movie_edit' },
      { href: '/admin/analytics/youtube', label: 'YouTube', icon: 'smart_display' },
    ],
  },
  {
    label: 'Operations',
    items: [
      { href: '/admin/analytics/dashboards', label: '대시보드', icon: 'space_dashboard', isNew: true },
      { href: '/admin/analytics/alerts', label: '알림', icon: 'notifications_active', isNew: true },
      { href: '/admin/analytics/health', label: '서비스 상태', icon: 'monitor_heart' },
      { href: '/admin/analytics/feedback', label: '피드백', icon: 'feedback' },
      { href: '/admin/analytics/survey', label: '설문', icon: 'quiz' },
    ],
  },
];

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [segment, setSegment] = useState<SegmentFilter>({});

  const isActive = (href: string) => {
    if (href === '/admin/analytics') return pathname === '/admin/analytics';
    return pathname.startsWith(href);
  };

  return (
    <div className="min-h-screen bg-[#0d0d14] text-white flex">
      {/* Sidebar */}
      <aside
        className={`${collapsed ? 'w-14' : 'w-52'} border-r border-[#1e1e2e] flex flex-col shrink-0 transition-all duration-200 sticky top-0 h-screen overflow-y-auto`}
      >
        {/* Logo area */}
        <div className="px-3 py-3 border-b border-[#1e1e2e] flex items-center justify-between">
          {!collapsed && (
            <Link href="/" className="flex items-center gap-2 text-gray-400 hover:text-white transition-colors">
              <span className="material-symbols-outlined text-[18px]">arrow_back</span>
              <span className="text-xs">편집기</span>
            </Link>
          )}
          <button
            onClick={() => setCollapsed(c => !c)}
            className="text-gray-500 hover:text-white transition-colors p-1"
          >
            <span className="material-symbols-outlined text-[16px]">
              {collapsed ? 'chevron_right' : 'chevron_left'}
            </span>
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-2 space-y-1">
          {NAV_GROUPS.map(group => (
            <div key={group.label}>
              {!collapsed && (
                <p className="px-3 pt-3 pb-1 text-[9px] font-semibold text-gray-600 uppercase tracking-widest">
                  {group.label}
                </p>
              )}
              {group.items.map(item => {
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`flex items-center gap-2.5 px-3 py-1.5 mx-1 rounded-md text-xs font-medium transition-colors ${
                      active
                        ? 'bg-[#00D4D4]/10 text-[#00D4D4]'
                        : 'text-gray-500 hover:text-gray-300 hover:bg-[#1a1a2e]'
                    }`}
                    title={collapsed ? item.label : undefined}
                  >
                    <span className={`material-symbols-outlined text-[16px] ${active ? 'text-[#00D4D4]' : ''}`}>
                      {item.icon}
                    </span>
                    {!collapsed && (
                      <>
                        <span className="truncate">{item.label}</span>
                        {item.isNew && (
                          <span className="ml-auto text-[8px] px-1 py-0.5 rounded bg-[#00D4D4]/20 text-[#00D4D4] font-bold">
                            NEW
                          </span>
                        )}
                      </>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
      </aside>

      {/* Main content */}
      <div className="flex-1 overflow-auto">
        {/* Global segment filter bar */}
        <div className="border-b border-[#1e1e2e] px-6 py-2 flex items-center justify-between bg-[#0d0d14]/95 backdrop-blur-sm sticky top-0 z-40">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#00D4D4] text-[20px]">analytics</span>
            <span className="text-sm font-semibold text-white">Analytics</span>
          </div>
          <SegmentBuilder segment={segment} onChange={setSegment} />
        </div>
        {children}
      </div>
    </div>
  );
}
