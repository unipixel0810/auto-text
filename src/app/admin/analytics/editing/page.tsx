'use client';

import React, { useState, useEffect } from 'react';
import { DATE_FILTERS } from '@/lib/analytics/types';
import {
  KPICard, ChartCard, CustomTooltip, LoadingSpinner,
  COLORS, formatDuration, formatNumber,
} from '@/components/analytics/shared';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, Cell,
  PieChart, Pie, CartesianGrid, XAxis, YAxis,
  Tooltip as RechartsTooltip,
} from 'recharts';

const ACTION_LABELS: Record<string, string> = {
  clip_add: '클립 추가', clip_delete: '클립 삭제', clip_trim_left: '좌측 트림', clip_trim_right: '우측 트림',
  clip_split: '분할(컷)', clip_move: '클립 이동', clip_resize: '클립 리사이즈', clip_speed_change: '속도 변경',
  subtitle_add: '자막 추가', subtitle_edit: '자막 편집', subtitle_delete: '자막 삭제', subtitle_style_change: '자막 스타일',
  audio_add: '오디오 추가', audio_volume_change: '볼륨 조절', audio_delete: '오디오 삭제',
  effect_apply: '효과 적용', transition_add: '전환 추가',
  export_start: '내보내기 시작', export_complete: '내보내기 완료',
  undo: '실행 취소', redo: '다시 실행',
};

const CATEGORY_LABELS: Record<string, string> = {
  vlog: '브이로그', shorts: '쇼츠', tutorial: '튜토리얼', commercial: '광고', podcast: '팟캐스트',
};

const MEDIA_COLORS: Record<string, string> = {
  video: '#3B82F6', audio: '#10B981', image: '#F59E0B', subtitle: '#EC4899',
};

interface ActionStats {
  total_actions: number;
  unique_sessions: number;
  avg_actions_per_session: number;
  action_breakdown: { action_type: string; count: number }[];
  hourly_activity: { hour: number; count: number }[];
  top_projects: { project_id: string; total_actions: number; total_duration: number; clip_count: number }[];
  media_type_distribution: { media_type: string; count: number }[];
  editing_efficiency: { avg_actions_per_minute: number; avg_editing_duration: number; total_exports: number };
  templates: { id: string; name: string; category: string; popularity_score: number; is_premium: boolean }[];
  daily_trend: { date: string; actions: number; sessions: number }[];
}

export default function EditingDataPage() {
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [actionStats, setActionStats] = useState<ActionStats | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/analytics/query?action=editing_data&days=${days}`)
      .then(r => {
        if (!r.ok) { console.error('Failed to fetch editing data:', r.status); setActionStats(null); setLoading(false); return null; }
        return r.json();
      })
      .then(data => { if (data) { setActionStats(data); } setLoading(false); })
      .catch((err) => {
        console.error('Failed to fetch editing data:', err);
        setActionStats(null);
        setLoading(false);
      });
  }, [days]);

  if (loading) return (
    <div className="min-h-screen bg-[#0d0d14] text-white">
      <Header days={days} setDays={setDays} />
      <main className="p-6 max-w-[1400px] mx-auto"><LoadingSpinner /></main>
    </div>
  );

  if (!actionStats) return (
    <div className="min-h-screen bg-[#0d0d14] text-white">
      <Header days={days} setDays={setDays} />
      <main className="p-6 max-w-[1400px] mx-auto">
        <p className="text-gray-500 text-center py-10">데이터 없음</p>
      </main>
    </div>
  );

  const cutActions = actionStats.action_breakdown
    .filter(a => ['clip_trim_left', 'clip_trim_right', 'clip_split', 'clip_delete'].includes(a.action_type))
    .reduce((s, a) => s + a.count, 0);
  const subtitleActions = actionStats.action_breakdown
    .filter(a => a.action_type.startsWith('subtitle_'))
    .reduce((s, a) => s + a.count, 0);
  const audioActions = actionStats.action_breakdown
    .filter(a => a.action_type.startsWith('audio_'))
    .reduce((s, a) => s + a.count, 0);

  return (
    <div className="min-h-screen bg-[#0d0d14] text-white">
      <Header days={days} setDays={setDays} />

      <main className="p-6 max-w-[1400px] mx-auto">
        <div className="space-y-6">
          {/* Data Asset Value Banner */}
          <div className="bg-gradient-to-r from-[#00D4D4]/10 via-[#3B82F6]/10 to-[#8B5CF6]/10 border border-[#00D4D4]/20 rounded-xl p-5">
            <div className="flex items-center gap-3 mb-2">
              <span className="material-symbols-outlined text-[#00D4D4] text-[24px]">diamond</span>
              <h3 className="text-base font-bold text-white">편집 데이터 자산</h3>
              <span className="px-2 py-0.5 bg-[#00D4D4]/20 text-[#00D4D4] text-[10px] font-bold rounded-full uppercase">Premium Data</span>
            </div>
            <p className="text-xs text-gray-400 mb-3">
              사용자 편집 패턴이 수집되어 AI 학습 데이터, 편집 템플릿, 자동화 서비스의 기반이 됩니다.
              이 데이터는 프리미엄 서비스로 수익화할 수 있는 핵심 자산입니다.
            </p>
            <div className="grid grid-cols-4 gap-3">
              <div className="bg-[#0d0d14]/60 rounded-lg p-3 text-center">
                <p className="text-xl font-black text-white">{formatNumber(actionStats.total_actions)}</p>
                <p className="text-[10px] text-gray-500">총 편집 액션</p>
              </div>
              <div className="bg-[#0d0d14]/60 rounded-lg p-3 text-center">
                <p className="text-xl font-black text-[#3B82F6]">{formatNumber(cutActions)}</p>
                <p className="text-[10px] text-gray-500">컷 편집 데이터</p>
              </div>
              <div className="bg-[#0d0d14]/60 rounded-lg p-3 text-center">
                <p className="text-xl font-black text-[#EC4899]">{formatNumber(subtitleActions)}</p>
                <p className="text-[10px] text-gray-500">자막 편집 데이터</p>
              </div>
              <div className="bg-[#0d0d14]/60 rounded-lg p-3 text-center">
                <p className="text-xl font-black text-[#10B981]">{formatNumber(audioActions)}</p>
                <p className="text-[10px] text-gray-500">오디오 편집 데이터</p>
              </div>
            </div>
          </div>

          {/* KPI Row */}
          <div className="grid grid-cols-4 gap-4">
            <KPICard title="활성 편집 세션" value={formatNumber(actionStats.unique_sessions)} icon="person" color="#00D4D4" subtitle={`세션당 평균 ${Math.round(actionStats.avg_actions_per_session)}회 편집`} />
            <KPICard title="편집 효율성" value={`${actionStats.editing_efficiency.avg_actions_per_minute}/분`} icon="speed" color="#3B82F6" subtitle="분당 평균 편집 횟수" />
            <KPICard title="평균 편집 시간" value={formatDuration(actionStats.editing_efficiency.avg_editing_duration)} icon="timer" color="#8B5CF6" subtitle="프로젝트당 편집 소요" />
            <KPICard title="내보내기 완료" value={formatNumber(actionStats.editing_efficiency.total_exports)} icon="upload" color="#10B981" subtitle="완성된 영상 수" />
          </div>

          {/* Charts Row 1 */}
          <div className="grid grid-cols-2 gap-4">
            {/* Daily Trend */}
            <ChartCard title="일별 편집 활동 추이" icon="show_chart">
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={actionStats.daily_trend}>
                    <defs>
                      <linearGradient id="editGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#00D4D4" stopOpacity={0.3} />
                        <stop offset="100%" stopColor="#00D4D4" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                    <XAxis dataKey="date" tick={{ fill: '#666', fontSize: 10 }} />
                    <YAxis tick={{ fill: '#666', fontSize: 10 }} />
                    <RechartsTooltip content={<CustomTooltip />} />
                    <Area type="monotone" dataKey="actions" stroke="#00D4D4" fill="url(#editGrad)" strokeWidth={2} name="편집 액션" />
                    <Area type="monotone" dataKey="sessions" stroke="#8B5CF6" fill="none" strokeWidth={2} strokeDasharray="4 4" name="세션 수" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            {/* Action Breakdown */}
            <ChartCard title="편집 액션 분포" icon="pie_chart">
              <div className="h-[250px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={actionStats.action_breakdown.slice(0, 10)} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                    <XAxis type="number" tick={{ fill: '#666', fontSize: 10 }} />
                    <YAxis type="category" dataKey="action_type" tick={{ fill: '#999', fontSize: 9 }} width={80}
                      tickFormatter={(v: string) => ACTION_LABELS[v] || v} />
                    <RechartsTooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" name="횟수" radius={[0, 4, 4, 0]}>
                      {actionStats.action_breakdown.slice(0, 10).map((_, i) => (
                        <Cell key={i} fill={COLORS[i % COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>
          </div>

          {/* Charts Row 2 */}
          <div className="grid grid-cols-3 gap-4">
            {/* Hourly Activity */}
            <ChartCard title="시간대별 편집 활동" icon="schedule">
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={actionStats.hourly_activity}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                    <XAxis dataKey="hour" tick={{ fill: '#666', fontSize: 9 }} tickFormatter={(h: number) => `${h}시`} />
                    <YAxis tick={{ fill: '#666', fontSize: 9 }} />
                    <RechartsTooltip content={<CustomTooltip />} />
                    <Bar dataKey="count" name="편집 횟수" fill="#3B82F6" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            {/* Media Type Distribution */}
            <ChartCard title="미디어 유형 분포" icon="perm_media">
              <div className="h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={actionStats.media_type_distribution}
                      cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3}
                      dataKey="count" nameKey="media_type"
                      label={({ name, value }: any) => `${name} (${value})`}
                    >
                      {actionStats.media_type_distribution.map((entry) => (
                        <Cell key={entry.media_type} fill={MEDIA_COLORS[entry.media_type] || '#666'} />
                      ))}
                    </Pie>
                    <RechartsTooltip content={<CustomTooltip />} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </ChartCard>

            {/* Top Projects */}
            <ChartCard title="활발한 프로젝트 TOP 5" icon="folder_special">
              <div className="space-y-2">
                {actionStats.top_projects.map((proj, i) => (
                  <div key={proj.project_id} className="flex items-center gap-2 p-2 bg-[#0d0d14] rounded-lg">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                      i === 0 ? 'bg-yellow-500/20 text-yellow-400' : i === 1 ? 'bg-gray-400/20 text-gray-300' : i === 2 ? 'bg-amber-700/20 text-amber-600' : 'bg-gray-800 text-gray-500'
                    }`}>{i + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-white truncate">{proj.project_id}</p>
                      <p className="text-[10px] text-gray-500">{proj.clip_count}개 클립 · {formatDuration(Math.round(proj.total_duration))}</p>
                    </div>
                    <span className="text-xs text-[#00D4D4] font-mono">{proj.total_actions}</span>
                  </div>
                ))}
              </div>
            </ChartCard>
          </div>

          {/* Premium Templates / Monetization */}
          <ChartCard title="편집 템플릿 마켓플레이스" icon="storefront"
            rightContent={
              <span className="px-2 py-0.5 bg-amber-500/10 text-amber-400 text-[10px] font-bold rounded-full">수익화 가능</span>
            }
          >
            <p className="text-xs text-gray-500 mb-4">사용자 편집 패턴에서 자동 생성된 템플릿입니다. 프리미엄으로 설정하면 유료 판매가 가능합니다.</p>
            <div className="grid grid-cols-1 gap-2">
              {actionStats.templates.map(tpl => (
                <div key={tpl.id} className="flex items-center gap-3 p-3 bg-[#0d0d14] rounded-lg border border-[#1e1e2e] hover:border-[#2a2a3e] transition-colors">
                  <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-[#3B82F6]/20 to-[#8B5CF6]/20 flex items-center justify-center">
                    <span className="material-symbols-outlined text-[18px] text-[#3B82F6]">
                      {tpl.category === 'vlog' ? 'videocam' : tpl.category === 'shorts' ? 'smartphone' : tpl.category === 'tutorial' ? 'school' : tpl.category === 'commercial' ? 'campaign' : 'mic'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-white">{tpl.name}</p>
                      {tpl.is_premium && (
                        <span className="px-1.5 py-0.5 bg-amber-500/15 text-amber-400 text-[9px] font-bold rounded">PREMIUM</span>
                      )}
                    </div>
                    <p className="text-[10px] text-gray-500">{CATEGORY_LABELS[tpl.category] || tpl.category}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className="text-xs font-medium text-white">{tpl.popularity_score}점</p>
                      <p className="text-[10px] text-gray-500">인기도</p>
                    </div>
                    <div className="w-20 h-1.5 bg-[#1e1e2e] rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-gradient-to-r from-[#00D4D4] to-[#3B82F6]" style={{ width: `${tpl.popularity_score}%` }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Revenue Potential */}
            <div className="mt-4 p-4 bg-gradient-to-r from-amber-500/5 to-orange-500/5 border border-amber-500/20 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <span className="material-symbols-outlined text-amber-400 text-[18px]">payments</span>
                <h4 className="text-sm font-bold text-white">수익화 잠재력</h4>
              </div>
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-lg font-black text-amber-400">{actionStats.templates.filter(t => t.is_premium).length}</p>
                  <p className="text-[10px] text-gray-500">프리미엄 템플릿</p>
                </div>
                <div>
                  <p className="text-lg font-black text-white">{formatNumber(actionStats.total_actions)}</p>
                  <p className="text-[10px] text-gray-500">AI 학습 데이터 포인트</p>
                </div>
                <div>
                  <p className="text-lg font-black text-emerald-400">
                    {formatNumber(Math.round(actionStats.total_actions * 0.02))}
                  </p>
                  <p className="text-[10px] text-gray-500">예상 편집 패턴 추출</p>
                </div>
              </div>
            </div>
          </ChartCard>
        </div>
      </main>
    </div>
  );
}

function Header({ days, setDays }: { days: number; setDays: (d: number) => void }) {
  return (
    <header className="border-b border-[#1e1e2e] px-6 py-3 flex items-center justify-between sticky top-0 bg-[#0d0d14]/95 backdrop-blur-sm z-50">
      <div className="flex items-center gap-3">
        <a href="/admin/analytics" className="text-gray-400 hover:text-white transition-colors">
          <span className="material-symbols-outlined text-[20px]">arrow_back</span>
        </a>
        <span className="material-symbols-outlined text-[#00D4D4] text-[24px]">movie_edit</span>
        <h1 className="text-lg font-semibold">편집 데이터</h1>
      </div>
      <div className="flex items-center gap-2">
        {DATE_FILTERS.map(filter => (
          <button
            key={filter.days}
            onClick={() => setDays(filter.days)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              days === filter.days
                ? 'bg-[#00D4D4] text-black'
                : 'bg-[#12121a] border border-[#1e1e2e] text-gray-400 hover:text-white'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>
    </header>
  );
}
