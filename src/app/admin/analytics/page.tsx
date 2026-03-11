'use client';

import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import type { AnalyticsEvent, DateFilter, VisitorStats, WebVitals } from '@/lib/analytics/types';
import { DATE_FILTERS } from '@/lib/analytics/types';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  Legend,
  RadialBarChart,
  RadialBar,
} from 'recharts';

// ─── Constants ───────────────────────────────────────────────────────────
const COLORS = ['#00D4D4', '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444', '#EC4899', '#6366F1'];
const HEATMAP_RADIUS = 30;
const HEATMAP_MAX_ALPHA = 0.7;
const PREVIEW_WIDTH = 1200;
const PREVIEW_HEIGHT = 750;

type TabId = 'overview' | 'demographics' | 'heatmap' | 'funnels' | 'health' | 'recordings' | 'editing' | 'youtube';

const TABS: { id: TabId; label: string; icon: string }[] = [
  { id: 'overview', label: '개요', icon: 'dashboard' },
  { id: 'demographics', label: '인구통계', icon: 'group' },
  { id: 'editing', label: '편집 데이터', icon: 'movie_edit' },
  { id: 'youtube', label: 'YouTube 성과', icon: 'smart_display' },
  { id: 'heatmap', label: '히트맵', icon: 'heat_map' },
  { id: 'funnels', label: '퍼널', icon: 'filter_alt' },
  { id: 'health', label: '서비스 상태', icon: 'monitor_heart' },
  { id: 'recordings', label: '세션 녹화', icon: 'videocam' },
];

// ─── Helpers ─────────────────────────────────────────────────────────────
const formatDuration = (seconds: number) => {
  if (seconds < 60) return `${seconds}초`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}분 ${s}초`;
};

const formatNumber = (n: number) => {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
};

const safePercent = (part: number, total: number) =>
  total === 0 ? 0 : Math.round((part / total) * 1000) / 10;

// ─── Shared sub-components ──────────────────────────────────────────────
const KPICard = memo(function KPICard({
  title, value, change, icon, color, subtitle,
}: {
  title: string; value: string; change?: number | null; icon: string; color: string; subtitle?: string;
}) {
  return (
    <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-5 hover:border-[#2a2a3e] transition-colors">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[11px] text-gray-500 font-medium uppercase tracking-wider">{title}</span>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}18` }}>
          <span className="material-symbols-outlined text-[18px]" style={{ color }}>{icon}</span>
        </div>
      </div>
      <p className="text-2xl font-black text-white mb-1">{value}</p>
      <div className="flex items-center gap-2">
        {change !== undefined && change !== null && (
          <span className={`text-xs font-bold flex items-center gap-0.5 ${change >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
            <span className="material-symbols-outlined text-[14px]">{change >= 0 ? 'trending_up' : 'trending_down'}</span>
            {change >= 0 ? '+' : ''}{change.toFixed(1)}%
          </span>
        )}
        {subtitle && <span className="text-[11px] text-gray-600">{subtitle}</span>}
      </div>
    </div>
  );
});

const ChartCard = memo(function ChartCard({
  title, icon, children, className, rightContent,
}: {
  title: string; icon: string; children: React.ReactNode; className?: string; rightContent?: React.ReactNode;
}) {
  return (
    <div className={`bg-[#12121a] border border-[#1e1e2e] rounded-xl p-5 ${className || ''}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px] text-[#00D4D4]">{icon}</span>
          <h3 className="text-sm font-bold text-white">{title}</h3>
        </div>
        {rightContent}
      </div>
      {children}
    </div>
  );
});

const CustomTooltip = memo(function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-[#1a1a2e] border border-[#2a2a3e] rounded-lg px-3 py-2 shadow-2xl">
      {label && <p className="text-[10px] text-gray-500 mb-1">{label}</p>}
      {payload.map((p: any, i: number) => (
        <p key={i} className="text-sm font-bold" style={{ color: p.color || '#fff' }}>
          {p.name}: {typeof p.value === 'number' ? p.value.toLocaleString() : p.value}
        </p>
      ))}
    </div>
  );
});

const EmptyState = memo(function EmptyState({ icon, message }: { icon: string; message: string }) {
  return (
    <div className="text-center py-20 text-gray-500">
      <span className="material-symbols-outlined text-[48px] mb-4 block">{icon}</span>
      <p className="text-sm">{message}</p>
    </div>
  );
});

const LoadingSpinner = memo(function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <span className="material-symbols-outlined text-[48px] text-[#00D4D4] animate-spin">refresh</span>
    </div>
  );
});

// ─── Overview Tab ────────────────────────────────────────────────────────
const OverviewTab = memo(function OverviewTab({
  stats, charts,
}: {
  stats: VisitorStats | null; charts: any;
}) {
  const topPages: { name: string; value: number }[] = charts?.topPages || [];
  const referrers: { name: string; value: number }[] = charts?.referralSources || [];
  const devices: { name: string; value: number }[] = charts?.devices || [];
  const daily: { name: string; value: number }[] = charts?.daily || [];
  const topDurations: { name: string; value: number }[] = charts?.topDurations || [];

  return (
    <div className="space-y-6">
      {/* KPI row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard title="방문자" value={formatNumber(stats?.today_visitors ?? 0)} change={stats?.visitor_change_pct} icon="people" color="#00D4D4" subtitle="전일 대비" />
        <KPICard title="평균 체류시간" value={stats?.avg_duration ? formatDuration(stats.avg_duration) : '0초'} icon="schedule" color="#3B82F6" />
        <KPICard title="이탈률" value={`${(stats?.bounce_rate ?? 0).toFixed(1)}%`} icon="exit_to_app" color="#EF4444" />
        <KPICard title="인기 페이지" value={stats?.top_page || '-'} icon="star" color="#F59E0B" />
      </div>

      {/* Daily trend full-width */}
      {daily.length > 0 && (
        <ChartCard title="일별 방문자 추이" icon="trending_up" className="col-span-full">
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={daily} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradVisitor" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#00D4D4" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#00D4D4" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" vertical={false} />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#555', fontSize: 10 }} />
              <YAxis axisLine={false} tickLine={false} tick={{ fill: '#555', fontSize: 10 }} />
              <RechartsTooltip content={<CustomTooltip />} />
              <Area type="monotone" dataKey="value" name="방문자" stroke="#00D4D4" strokeWidth={2} fillOpacity={1} fill="url(#gradVisitor)" />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Top pages */}
        <ChartCard title="인기 페이지 TOP 5" icon="web">
          {topPages.length > 0 ? (
            <div className="space-y-3">
              {topPages.slice(0, 5).map((p, i) => {
                const maxVal = topPages[0]?.value || 1;
                return (
                  <div key={i}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-400 truncate max-w-[200px]">{p.name}</span>
                      <span className="text-white font-bold">{p.value.toLocaleString()}</span>
                    </div>
                    <div className="h-1.5 bg-[#1a1a2e] rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-[#00D4D4]" style={{ width: `${(p.value / maxVal) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <EmptyState icon="web" message="페이지 데이터 없음" />}
        </ChartCard>

        {/* Referrers */}
        <ChartCard title="유입 경로" icon="link">
          {referrers.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={referrers} innerRadius={50} outerRadius={75} paddingAngle={4} dataKey="value" nameKey="name">
                  {referrers.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <RechartsTooltip content={<CustomTooltip />} />
                <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: '11px' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyState icon="link" message="유입 경로 데이터 없음" />}
        </ChartCard>

        {/* Devices */}
        <ChartCard title="디바이스 분포" icon="devices">
          {devices.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={devices} innerRadius={50} outerRadius={75} paddingAngle={4} dataKey="value" nameKey="name">
                  {devices.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <RechartsTooltip content={<CustomTooltip />} />
                <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: '11px' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyState icon="devices" message="디바이스 데이터 없음" />}
        </ChartCard>
      </div>

      {/* 시간대별 분포 + 페이지별 체류시간 2열 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Hourly distribution */}
        {charts?.hourly && charts.hourly.length > 0 && (
          <ChartCard title="시간대별 방문 분포" icon="schedule">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={charts.hourly} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#555', fontSize: 9 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#555', fontSize: 10 }} />
                <RechartsTooltip content={<CustomTooltip />} />
                <Bar dataKey="value" name="방문" fill="#3B82F6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {/* 페이지별 평균 체류시간 TOP 5 */}
        <ChartCard title="페이지별 평균 체류시간 TOP 5" icon="timer">
          {topDurations.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart
                data={topDurations}
                layout="vertical"
                margin={{ top: 0, right: 40, left: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" horizontal={false} />
                <XAxis
                  type="number"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#555', fontSize: 10 }}
                  tickFormatter={(v: number) => `${v}초`}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={110}
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#888', fontSize: 10 }}
                  tickFormatter={(v: string) => v.length > 15 ? v.slice(0, 13) + '…' : v}
                />
                <RechartsTooltip content={<CustomTooltip />} />
                <Bar dataKey="value" name="평균 체류시간(초)" fill="#8B5CF6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState icon="timer" message="체류시간 데이터 없음 (방문자가 페이지를 이탈하면 기록됩니다)" />}
        </ChartCard>
      </div>
    </div>
  );
});

// ─── Demographics Tab ────────────────────────────────────────────────────
const DemographicsTab = memo(function DemographicsTab({ days }: { days: number }) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/analytics/query?type=demographics&days=${days}`);
        const json = await res.json();
        setData(json);
      } catch {
        setData(null);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [days]);

  if (loading) return <LoadingSpinner />;

  const ageGroups: { name: string; value: number }[] = data?.ageGroups || [
    { name: '18-24', value: 0 }, { name: '25-34', value: 0 },
    { name: '35-44', value: 0 }, { name: '45-54', value: 0 },
    { name: '55+', value: 0 },
  ];
  const genderData: { name: string; value: number }[] = data?.gender || [
    { name: '남성', value: 0 }, { name: '여성', value: 0 }, { name: '미확인', value: 0 },
  ];
  const languages: { name: string; value: number }[] = data?.languages || [];
  const resolutions: { name: string; value: number }[] = data?.screenResolutions || [];
  const browsers: { name: string; value: number }[] = data?.browsers || [];
  const osList: { name: string; value: number }[] = data?.os || [];

  const connectionTypes: { name: string; value: number }[] = data?.connectionTypes || [];
  const touchPct: number = data?.touchSupportPct ?? 0;
  const cookiePct: number = data?.cookieEnabledPct ?? 0;

  const AGE_COLORS = ['#3B82F6', '#00D4D4', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
  const GENDER_COLORS = ['#3B82F6', '#EC4899', '#6B7280'];

  return (
    <div className="space-y-6">
      {/* Age + Gender pie charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="연령대 분포" icon="group">
          {ageGroups.some(a => a.value > 0) ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={ageGroups} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value" nameKey="name" label={(props) => `${props.name} ${(((props.percent as number) ?? 0) * 100).toFixed(0)}%`}>
                  {ageGroups.map((_, i) => <Cell key={i} fill={AGE_COLORS[i % AGE_COLORS.length]} />)}
                </Pie>
                <RechartsTooltip content={<CustomTooltip />} />
                <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: '11px' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyState icon="group" message="연령대 데이터 없음" />}
        </ChartCard>

        <ChartCard title="성별 분포" icon="wc">
          {genderData.some(g => g.value > 0) ? (
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={genderData} cx="50%" cy="50%" innerRadius={55} outerRadius={90} paddingAngle={3} dataKey="value" nameKey="name" label={(props) => `${props.name} ${(((props.percent as number) ?? 0) * 100).toFixed(0)}%`}>
                  {genderData.map((_, i) => <Cell key={i} fill={GENDER_COLORS[i % GENDER_COLORS.length]} />)}
                </Pie>
                <RechartsTooltip content={<CustomTooltip />} />
                <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: '11px' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyState icon="wc" message="성별 데이터 없음" />}
        </ChartCard>
      </div>

      {/* Language + Screen resolutions bar charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="언어 분포" icon="translate">
          {languages.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={languages.slice(0, 8)} layout="vertical" margin={{ left: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" horizontal={false} />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#555', fontSize: 10 }} />
                <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#aaa', fontSize: 11 }} width={55} />
                <RechartsTooltip content={<CustomTooltip />} />
                <Bar dataKey="value" name="사용자" fill="#8B5CF6" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState icon="translate" message="언어 데이터 없음" />}
        </ChartCard>

        <ChartCard title="화면 해상도" icon="aspect_ratio">
          {resolutions.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={resolutions.slice(0, 8)} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" horizontal={false} />
                <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#555', fontSize: 10 }} />
                <YAxis type="category" dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#aaa', fontSize: 11 }} width={75} />
                <RechartsTooltip content={<CustomTooltip />} />
                <Bar dataKey="value" name="사용자" fill="#F59E0B" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : <EmptyState icon="aspect_ratio" message="해상도 데이터 없음" />}
        </ChartCard>
      </div>

      {/* Browser + OS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <ChartCard title="브라우저 분포" icon="public">
          {browsers.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={browsers} innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value" nameKey="name">
                  {browsers.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <RechartsTooltip content={<CustomTooltip />} />
                <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: '11px' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyState icon="public" message="브라우저 데이터 없음" />}
        </ChartCard>

        <ChartCard title="운영체제 분포" icon="computer">
          {osList.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={osList} innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value" nameKey="name">
                  {osList.map((_, i) => <Cell key={i} fill={COLORS[(i + 2) % COLORS.length]} />)}
                </Pie>
                <RechartsTooltip content={<CustomTooltip />} />
                <Legend verticalAlign="bottom" wrapperStyle={{ fontSize: '11px' }} />
              </PieChart>
            </ResponsiveContainer>
          ) : <EmptyState icon="computer" message="OS 데이터 없음" />}
        </ChartCard>
      </div>

      {/* Connection type stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {connectionTypes.length > 0 && connectionTypes.map((ct, i) => (
          <KPICard key={i} title={`연결: ${ct.name}`} value={ct.value.toLocaleString()} icon="wifi" color={COLORS[i % COLORS.length]} />
        ))}
        <KPICard title="터치 지원" value={`${touchPct.toFixed(1)}%`} icon="touch_app" color="#EC4899" />
        <KPICard title="쿠키 허용" value={`${cookiePct.toFixed(1)}%`} icon="cookie" color="#10B981" />
      </div>
    </div>
  );
});

// ─── Heatmap Tab (확장: 클릭 히트맵 + 스크롤 맵 + Rage Click + Dead Click) ──
type HeatSubTab = 'click' | 'scroll' | 'rage' | 'dead';

const HEAT_SUBTABS: { id: HeatSubTab; label: string; icon: string; color: string }[] = [
  { id: 'click', label: '클릭 히트맵', icon: 'touch_app', color: '#00D4D4' },
  { id: 'scroll', label: '스크롤 맵', icon: 'swap_vert', color: '#3B82F6' },
  { id: 'rage', label: 'Rage Click', icon: 'sentiment_very_dissatisfied', color: '#EF4444' },
  { id: 'dead', label: 'Dead Click', icon: 'block', color: '#F59E0B' },
];

type DeviceFilter = 'all' | 'desktop' | 'mobile' | 'tablet' | '4k';
type VisualizationMode = 'heatmap' | 'markers';

const HeatmapTab = memo(function HeatmapTab({
  selectedPage, clickEvents, canvasRef, iframeRef, iframeLoaded, setIframeLoaded,
  iframeUrl, heatmapOpacity, setHeatmapOpacity, days,
}: {
  selectedPage: string;
  clickEvents: AnalyticsEvent[];
  canvasRef: React.RefObject<HTMLCanvasElement>;
  iframeRef: React.RefObject<HTMLIFrameElement>;
  iframeLoaded: boolean;
  setIframeLoaded: (v: boolean) => void;
  iframeUrl: string;
  heatmapOpacity: number;
  setHeatmapOpacity: (v: number) => void;
  days: number;
}) {
  const [subTab, setSubTab] = useState<HeatSubTab>('click');
  const [scrollData, setScrollData] = useState<{ depth: number; count: number; percentage: number }[]>([]);
  const [rageClicks, setRageClicks] = useState<{ x_pos: number; y_pos: number; element_info: string; page_url: string; count: number; last_occurred: string }[]>([]);
  const [deadClicks, setDeadClicks] = useState<AnalyticsEvent[]>([]);
  const [subLoading, setSubLoading] = useState(false);
  // 1-D: 기기 필터
  const [deviceFilter, setDeviceFilter] = useState<DeviceFilter>('all');
  // 1-E: 시각화 모드 (히트맵 vs 마커)
  const [vizMode, setVizMode] = useState<VisualizationMode>('heatmap');
  // 1-B: 툴팁
  const [tooltip, setTooltip] = useState<{ x: number; y: number; tag: string; text: string; count: number } | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);

  // 서브탭 변경 시 데이터 로드
  useEffect(() => {
    if (subTab === 'click') return;
    const load = async () => {
      setSubLoading(true);
      try {
        const pageParam = selectedPage ? `&page_url=${encodeURIComponent(selectedPage)}` : '';
        if (subTab === 'scroll') {
          const res = await fetch(`/api/analytics/query?action=scroll-depth&days=${days}${pageParam}`);
          const json = await res.json();
          setScrollData(json.scrollDepth || []);
        } else if (subTab === 'rage') {
          const res = await fetch(`/api/analytics/query?action=rage-clicks&days=${days}${pageParam}`);
          const json = await res.json();
          setRageClicks(json.rageClicks || []);
        } else if (subTab === 'dead') {
          const res = await fetch(`/api/analytics/query?action=dead-clicks&days=${days}${pageParam}`);
          const json = await res.json();
          setDeadClicks(json.deadClicks || []);
        }
      } catch { /* ignore */ }
      finally { setSubLoading(false); }
    };
    load();
  }, [subTab, selectedPage, days]);

  const avgScrollDepth = scrollData.length > 0
    ? scrollData.find(d => d.depth === 50)?.percentage ?? 0
    : 0;

  // 1-D: 기기 필터 적용 (4K: ≥3840px 포함)
  const filteredClickEvents = deviceFilter === 'all'
    ? clickEvents
    : clickEvents.filter(c => {
        const vw = c.viewport_width || 1920;
        if (deviceFilter === 'mobile') return vw < 768;
        if (deviceFilter === 'tablet') return vw >= 768 && vw < 1024;
        if (deviceFilter === '4k') return vw >= 3840;
        return vw >= 1024 && vw < 3840; // desktop (일반)
      });

  // 1-A + 1-E: Canvas 렌더링 (좌표 정규화 버그 수정 + 히트맵/마커 모드)
  useEffect(() => {
    if (!iframeLoaded) {
      const canvas = canvasRef.current;
      if (canvas) { const ctx = canvas.getContext('2d'); if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height); }
      return;
    }
    const canvas = canvasRef.current;
    if (!canvas) return;
    const filtered = filteredClickEvents.filter(c => c.x_pos != null && c.y_pos != null);
    if (filtered.length === 0) {
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rafId = requestAnimationFrame(() => {
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      if (vizMode === 'markers') {
        // 1-E: 마커 모드 — 각 클릭을 반투명 원으로 표시
        ctx.globalAlpha = 0.55;
        filtered.forEach(c => {
          // 1-A 수정: 각 이벤트 자신의 viewport 기준으로 정규화
          const ix = Math.round(((c.x_pos || 0) / (c.viewport_width || 1920)) * w);
          const iy = Math.round(((c.y_pos || 0) / (c.viewport_height || 1080)) * h);
          ctx.beginPath();
          ctx.arc(ix, iy, 6, 0, Math.PI * 2);
          ctx.fillStyle = '#00D4D4';
          ctx.fill();
          ctx.strokeStyle = 'rgba(0,212,212,0.3)';
          ctx.lineWidth = 1;
          ctx.stroke();
        });
        ctx.globalAlpha = 1;
      } else {
        // 히트맵 모드 (기본)
        const grid = new Float32Array(w * h);
        let maxVal = 0;
        filtered.forEach(c => {
          // 1-A 수정: maxVW/maxVH 공유 기준 제거 → 각 이벤트 자신의 viewport 기준으로 정규화
          const ix = Math.round(((c.x_pos || 0) / (c.viewport_width || 1920)) * w);
          const iy = Math.round(((c.y_pos || 0) / (c.viewport_height || 1080)) * h);
          for (let dy = -HEATMAP_RADIUS; dy <= HEATMAP_RADIUS; dy++) {
            for (let dx = -HEATMAP_RADIUS; dx <= HEATMAP_RADIUS; dx++) {
              const px = ix + dx, py = iy + dy;
              if (px < 0 || px >= w || py < 0 || py >= h) continue;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist > HEATMAP_RADIUS) continue;
              const val = 1 - dist / HEATMAP_RADIUS;
              const idx = py * w + px;
              grid[idx] += val;
              if (grid[idx] > maxVal) maxVal = grid[idx];
            }
          }
        });
        if (maxVal === 0) return;
        const imageData = ctx.createImageData(w, h);
        const d = imageData.data;
        for (let i = 0; i < grid.length; i++) {
          const v = grid[i] / maxVal;
          if (v < 0.01) continue;
          const pi = i * 4;
          let r: number, g: number, b: number;
          if (v < 0.25) { r = 0; g = 0; b = Math.round(128 + v * 4 * 127); }
          else if (v < 0.5) { const t = (v - 0.25) * 4; r = 0; g = Math.round(t * 255); b = Math.round(255 * (1 - t)); }
          else if (v < 0.75) { const t = (v - 0.5) * 4; r = Math.round(t * 255); g = 255; b = 0; }
          else { const t = (v - 0.75) * 4; r = 255; g = Math.round(255 * (1 - t)); b = 0; }
          d[pi] = r; d[pi + 1] = g; d[pi + 2] = b;
          d[pi + 3] = Math.round(Math.min(v * HEATMAP_MAX_ALPHA * 255, HEATMAP_MAX_ALPHA * 255));
        }
        ctx.putImageData(imageData, 0, 0);
      }
    });
    return () => cancelAnimationFrame(rafId);
  // filteredClickEvents는 참조가 매 렌더마다 바뀌므로 .length + deviceFilter + vizMode로 의존성 관리
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredClickEvents.length, iframeLoaded, heatmapOpacity, selectedPage, deviceFilter, vizMode]);

  return (
    <div className="space-y-4">
      {/* 서브탭 */}
      <div className="flex gap-2 bg-[#12121a] border border-[#1e1e2e] rounded-xl p-2">
        {HEAT_SUBTABS.map(t => (
          <button
            key={t.id}
            onClick={() => setSubTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
              subTab === t.id
                ? 'text-white shadow-md'
                : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
            }`}
            style={subTab === t.id ? { backgroundColor: `${t.color}22`, color: t.color, boxShadow: `0 0 12px ${t.color}33` } : {}}
          >
            <span className="material-symbols-outlined text-[15px]">{t.icon}</span>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── 클릭 히트맵 ── */}
      {subTab === 'click' && (
        <>
          {!selectedPage ? (
            <EmptyState icon="heat_map" message="히트맵을 보려면 위에서 페이지를 선택해주세요." />
          ) : (
            <>
              {/* 컨트롤바 */}
              <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-4 space-y-3">
                {/* 행 1: 투명도 + 클릭 수 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="text-xs text-gray-400 font-medium">투명도</span>
                    <input
                      type="range" min="0" max="100" value={heatmapOpacity}
                      onChange={e => setHeatmapOpacity(Number(e.target.value))}
                      className="w-[140px] h-2 bg-[#222] rounded-lg appearance-none cursor-pointer accent-[#00D4D4]"
                    />
                    <span className="text-[11px] font-mono text-[#00D4D4] w-8">{heatmapOpacity}%</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    클릭: <span className="text-[#00D4D4] font-bold">{filteredClickEvents.length}</span>개
                    {deviceFilter !== 'all' && <span className="text-gray-600 ml-1">/ 전체 {clickEvents.length}개</span>}
                  </div>
                </div>
                {/* 행 2: 기기 필터 + 시각화 모드 */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  {/* 1-D: 기기 필터 */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-gray-500 mr-1">기기</span>
                    {([
                      { id: 'all' as DeviceFilter, label: '전체', icon: 'devices' },
                      { id: 'desktop' as DeviceFilter, label: '데스크톱', icon: 'computer' },
                      { id: 'mobile' as DeviceFilter, label: '모바일', icon: 'smartphone' },
                      { id: 'tablet' as DeviceFilter, label: '태블릿', icon: 'tablet' },
                      { id: '4k' as DeviceFilter, label: '4K', icon: 'monitor' },
                    ] as const).map(d => (
                      <button
                        key={d.id}
                        onClick={() => setDeviceFilter(d.id)}
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                          deviceFilter === d.id
                            ? 'bg-[#00D4D4]/20 text-[#00D4D4] border border-[#00D4D4]/40'
                            : 'bg-[#1a1a2e] text-gray-500 border border-transparent hover:text-gray-300'
                        }`}
                      >
                        <span className="material-symbols-outlined text-[13px]">{d.icon}</span>
                        {d.label}
                      </button>
                    ))}
                  </div>
                  {/* 1-E: 시각화 모드 */}
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setVizMode('heatmap')}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                        vizMode === 'heatmap'
                          ? 'bg-orange-500/20 text-orange-400 border border-orange-500/40'
                          : 'bg-[#1a1a2e] text-gray-500 border border-transparent hover:text-gray-300'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[13px]">local_fire_department</span>
                      히트맵
                    </button>
                    <button
                      onClick={() => setVizMode('markers')}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all ${
                        vizMode === 'markers'
                          ? 'bg-[#00D4D4]/20 text-[#00D4D4] border border-[#00D4D4]/40'
                          : 'bg-[#1a1a2e] text-gray-500 border border-transparent hover:text-gray-300'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[13px]">room</span>
                      마커
                    </button>
                  </div>
                </div>
              </div>

              {/* 히트맵 + 오버레이 컨테이너 */}
              <div className="relative">
                <div
                  className="relative bg-[#111] border border-[#1e1e2e] rounded-xl overflow-hidden"
                  style={{ aspectRatio: `${PREVIEW_WIDTH}/${PREVIEW_HEIGHT}` }}
                >
                  {iframeUrl && (
                    <iframe
                      ref={iframeRef} src={iframeUrl}
                      className="absolute inset-0 w-full h-full border-0 pointer-events-none opacity-90"
                      onLoad={() => setIframeLoaded(true)}
                      title="Page Preview"
                      onError={() => setIframeLoaded(false)}
                    />
                  )}
                  <canvas
                    ref={canvasRef} width={PREVIEW_WIDTH} height={PREVIEW_HEIGHT}
                    className="absolute inset-0 w-full h-full"
                    style={{ opacity: heatmapOpacity / 100, mixBlendMode: vizMode === 'heatmap' ? 'screen' : 'normal', pointerEvents: 'none' }}
                  />
                  {/* 1-B: 툴팁 인터랙션 오버레이 */}
                  <div
                    ref={overlayRef}
                    className="absolute inset-0 w-full h-full"
                    style={{ cursor: 'crosshair' }}
                    onMouseMove={e => {
                      const rect = overlayRef.current?.getBoundingClientRect();
                      if (!rect) return;
                      const mx = (e.clientX - rect.left) / rect.width;
                      const my = (e.clientY - rect.top) / rect.height;
                      const TOOLTIP_RADIUS = 0.04; // 정규화 좌표 기준 반경
                      const nearby = filteredClickEvents.filter(c => {
                        const cx = (c.x_pos || 0) / (c.viewport_width || 1920);
                        const cy = (c.y_pos || 0) / (c.viewport_height || 1080);
                        return Math.abs(cx - mx) < TOOLTIP_RADIUS && Math.abs(cy - my) < TOOLTIP_RADIUS;
                      });
                      if (nearby.length > 0) {
                        const first = nearby[0];
                        setTooltip({
                          x: e.clientX - rect.left,
                          y: e.clientY - rect.top,
                          tag: first.element_tag || '알 수 없음',
                          text: first.element_text ? first.element_text.slice(0, 40) : '',
                          count: nearby.length,
                        });
                      } else {
                        setTooltip(null);
                      }
                    }}
                    onMouseLeave={() => setTooltip(null)}
                  />
                  {/* 1-B: 툴팁 렌더링 */}
                  {tooltip && (
                    <div
                      className="absolute z-50 pointer-events-none bg-[#0d0d14] border border-[#00D4D4]/40 rounded-lg px-3 py-2 shadow-xl text-xs"
                      style={{
                        left: tooltip.x + 12,
                        top: tooltip.y + 12,
                        transform: tooltip.x > PREVIEW_WIDTH * 0.7 ? 'translateX(-110%)' : undefined,
                        maxWidth: 200,
                      }}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="material-symbols-outlined text-[#00D4D4] text-[13px]">touch_app</span>
                        <span className="text-[#00D4D4] font-bold">{tooltip.count}번 클릭</span>
                      </div>
                      <div className="text-gray-400">
                        <span className="text-gray-500">태그: </span>
                        <span className="font-mono text-yellow-400">&lt;{tooltip.tag}&gt;</span>
                      </div>
                      {tooltip.text && (
                        <div className="text-gray-400 mt-0.5 truncate">
                          <span className="text-gray-500">텍스트: </span>
                          <span className="text-white">{tooltip.text}</span>
                        </div>
                      )}
                    </div>
                  )}
                  {!iframeLoaded && iframeUrl && (
                    <div className="absolute inset-0 flex items-center justify-center bg-[#111]">
                      <LoadingSpinner />
                    </div>
                  )}
                  {filteredClickEvents.length === 0 && iframeLoaded && (
                    <EmptyState icon="touch_app" message="이 페이지에 클릭 데이터가 없습니다." />
                  )}

                  {/* 1-C: 컬러 범례 */}
                  {filteredClickEvents.length > 0 && vizMode === 'heatmap' && (
                    <div className="absolute bottom-3 right-3 bg-[#0d0d14]/90 backdrop-blur-sm border border-[#1e1e2e] rounded-lg px-3 py-2 pointer-events-none">
                      <p className="text-[10px] text-gray-500 mb-1.5 font-medium">클릭 밀도</p>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-gray-500">낮음</span>
                        <div
                          className="w-[80px] h-2.5 rounded-full"
                          style={{
                            background: 'linear-gradient(to right, #0000cc, #0080ff, #00ff80, #ffff00, #ff8000, #ff0000)',
                          }}
                        />
                        <span className="text-[10px] text-gray-500">높음</span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {/* ── 스크롤 맵 ── */}
      {subTab === 'scroll' && (
        subLoading ? <LoadingSpinner /> : (
          <div className="space-y-4">
            {/* KPI */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[25, 50, 75, 100].map(depth => {
                const d = scrollData.find(s => s.depth === depth);
                return (
                  <div key={depth} className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-5">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[11px] text-gray-500 font-medium uppercase tracking-wider">{depth}% 도달</span>
                      <span className="text-[11px] font-mono" style={{ color: depth <= 25 ? '#00D4D4' : depth <= 50 ? '#3B82F6' : depth <= 75 ? '#8B5CF6' : '#EF4444' }}>
                        {d?.percentage ?? 0}%
                      </span>
                    </div>
                    <p className="text-2xl font-black text-white">{(d?.count ?? 0).toLocaleString()}</p>
                    <p className="text-[11px] text-gray-600 mt-1">세션</p>
                  </div>
                );
              })}
            </div>
            {/* 바 차트 */}
            <ChartCard title="스크롤 깊이 분포" icon="swap_vert"
              rightContent={<span className="text-xs text-gray-500">평균 도달 50%: <span className="text-[#3B82F6] font-bold">{avgScrollDepth}%</span></span>}
            >
              {scrollData.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={scrollData.map(d => ({ name: `${d.depth}%`, 세션수: d.count, 도달률: d.percentage }))} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" vertical={false} />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#555', fontSize: 11 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#555', fontSize: 10 }} />
                    <RechartsTooltip content={<CustomTooltip />} />
                    <Bar dataKey="세션수" radius={[4, 4, 0, 0]}>
                      {scrollData.map((d, i) => {
                        const colors = ['#00D4D4', '#3B82F6', '#8B5CF6', '#EF4444'];
                        return <Cell key={i} fill={colors[i % colors.length]} />;
                      })}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <EmptyState icon="swap_vert" message="스크롤 데이터가 없습니다. 사용자가 페이지를 스크롤하면 자동 기록됩니다." />
              )}
            </ChartCard>
            {/* 세로 시각화 */}
            {scrollData.length > 0 && (
              <ChartCard title="페이지 도달 시각화" icon="article">
                <div className="flex gap-6 items-end h-[200px] px-4 py-2">
                  {scrollData.map((d, i) => {
                    const colors = ['#00D4D4', '#3B82F6', '#8B5CF6', '#EF4444'];
                    const maxCount = Math.max(...scrollData.map(s => s.count), 1);
                    return (
                      <div key={i} className="flex flex-col items-center gap-2 flex-1">
                        <span className="text-xs font-bold text-white">{d.count}</span>
                        <div className="w-full rounded-t-md transition-all" style={{ height: `${(d.count / maxCount) * 140}px`, backgroundColor: colors[i], opacity: 1 - i * 0.15 }} />
                        <span className="text-[11px] text-gray-400">{d.depth}%</span>
                        <span className="text-[10px] font-bold" style={{ color: colors[i] }}>{d.percentage}%</span>
                      </div>
                    );
                  })}
                </div>
              </ChartCard>
            )}
          </div>
        )
      )}

      {/* ── Rage Click 목록 ── */}
      {subTab === 'rage' && (
        subLoading ? <LoadingSpinner /> : (
          <div className="space-y-4">
            <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-4 flex items-center gap-3">
              <span className="material-symbols-outlined text-red-400 text-[20px]">sentiment_very_dissatisfied</span>
              <div>
                <p className="text-sm font-bold text-white">Rage Click 탐지</p>
                <p className="text-xs text-gray-500">500ms 내 동일 위치 3회 이상 클릭 — UX 문제 지점을 나타냅니다</p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-2xl font-black text-red-400">{rageClicks.length}</p>
                <p className="text-[10px] text-gray-500">발생 지점</p>
              </div>
            </div>
            {rageClicks.length === 0 ? (
              <EmptyState icon="sentiment_very_dissatisfied" message="Rage Click 데이터가 없습니다. 사용자가 같은 위치를 빠르게 연타하면 기록됩니다." />
            ) : (
              <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#1e1e2e]">
                      <th className="text-left px-4 py-3 text-gray-500 font-medium">페이지</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-medium">좌표 (x, y)</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-medium">요소</th>
                      <th className="text-right px-4 py-3 text-gray-500 font-medium">횟수</th>
                      <th className="text-right px-4 py-3 text-gray-500 font-medium">마지막 발생</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rageClicks.map((r, i) => (
                      <tr key={i} className="border-b border-[#111] hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-3 text-gray-300 truncate max-w-[180px]">{r.page_url}</td>
                        <td className="px-4 py-3 font-mono text-gray-400">({r.x_pos}, {r.y_pos})</td>
                        <td className="px-4 py-3 text-gray-400 truncate max-w-[160px]">{r.element_info || '—'}</td>
                        <td className="px-4 py-3 text-right">
                          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-500/10 text-red-400 border border-red-500/20">
                            {r.count}회
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {r.last_occurred ? new Date(r.last_occurred).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      )}

      {/* ── Dead Click 목록 ── */}
      {subTab === 'dead' && (
        subLoading ? <LoadingSpinner /> : (
          <div className="space-y-4">
            <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-4 flex items-center gap-3">
              <span className="material-symbols-outlined text-amber-400 text-[20px]">block</span>
              <div>
                <p className="text-sm font-bold text-white">Dead Click 탐지</p>
                <p className="text-xs text-gray-500">클릭했지만 아무 반응이 없는 지점 — 클릭 가능해 보이지만 실제로는 아닌 UI 요소</p>
              </div>
              <div className="ml-auto text-right">
                <p className="text-2xl font-black text-amber-400">{deadClicks.length}</p>
                <p className="text-[10px] text-gray-500">Dead Click</p>
              </div>
            </div>
            {deadClicks.length === 0 ? (
              <EmptyState icon="block" message="Dead Click 데이터가 없습니다. 반응 없는 요소 클릭이 감지되면 자동 기록됩니다." />
            ) : (
              <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl overflow-hidden">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-[#1e1e2e]">
                      <th className="text-left px-4 py-3 text-gray-500 font-medium">페이지</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-medium">좌표 (x, y)</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-medium">요소 태그</th>
                      <th className="text-left px-4 py-3 text-gray-500 font-medium">텍스트</th>
                      <th className="text-right px-4 py-3 text-gray-500 font-medium">발생 시간</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deadClicks.map((e, i) => (
                      <tr key={i} className="border-b border-[#111] hover:bg-white/[0.02] transition-colors">
                        <td className="px-4 py-3 text-gray-300 truncate max-w-[180px]">{e.page_url}</td>
                        <td className="px-4 py-3 font-mono text-gray-400">({e.x_pos ?? '?'}, {e.y_pos ?? '?'})</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            {e.element_tag || '?'}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-400 truncate max-w-[160px]">{e.element_text || '—'}</td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          {e.created_at ? new Date(e.created_at).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )
      )}
    </div>
  );
});

// ─── Funnel Tab ──────────────────────────────────────────────────────────
const FunnelTab = memo(function FunnelTab({ days }: { days: number }) {
  const [funnels, setFunnels] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/analytics/query?type=funnels&days=${days}`);
        const json = await res.json();
        setFunnels(json.funnels || []);
      } catch {
        setFunnels([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [days]);

  if (loading) return <LoadingSpinner />;
  if (funnels.length === 0) return <EmptyState icon="filter_alt" message="설정된 퍼널이 없습니다. 퍼널을 생성하면 전환율을 추적할 수 있습니다." />;

  return (
    <div className="space-y-8">
      {funnels.map((funnel: any, fi: number) => {
        const steps: { name: string; count: number }[] = funnel.steps || [];
        const maxCount = steps[0]?.count || 1;

        return (
          <ChartCard key={fi} title={funnel.name || `퍼널 ${fi + 1}`} icon="filter_alt">
            <div className="space-y-2">
              {steps.map((step, si) => {
                const pct = safePercent(step.count, maxCount);
                const prevCount = si === 0 ? step.count : steps[si - 1].count;
                const dropOff = prevCount > 0 ? safePercent(prevCount - step.count, prevCount) : 0;
                const barWidth = Math.max(pct, 5);

                // gradient from green -> amber -> red
                const hue = (pct / 100) * 120; // 0=red, 120=green
                const barColor = `hsl(${hue}, 70%, 50%)`;

                return (
                  <div key={si} className="flex items-center gap-4">
                    <div className="w-6 h-6 rounded-full bg-[#1a1a2e] flex items-center justify-center text-[11px] font-bold text-gray-400 shrink-0">
                      {si + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="text-gray-300 font-medium truncate">{step.name}</span>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className="text-white font-bold">{step.count.toLocaleString()}</span>
                          <span className="font-bold" style={{ color: barColor }}>{pct}%</span>
                          {si > 0 && <span className="text-red-400 text-[11px]">-{dropOff}%</span>}
                        </div>
                      </div>
                      <div className="h-7 bg-[#0d0d14] rounded-lg overflow-hidden border border-[#1e1e2e]">
                        <div
                          className="h-full rounded-lg transition-all duration-700 flex items-center justify-end pr-2"
                          style={{ width: `${barWidth}%`, backgroundColor: barColor, opacity: 0.85 }}
                        >
                          {pct > 15 && <span className="text-[10px] font-bold text-white/90">{pct}%</span>}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Summary */}
            {steps.length >= 2 && (
              <div className="mt-4 pt-4 border-t border-[#1e1e2e] flex items-center gap-6">
                <div className="text-xs text-gray-500">
                  전체 전환율: <span className="text-[#00D4D4] font-bold text-sm">{safePercent(steps[steps.length - 1].count, steps[0].count)}%</span>
                </div>
                <div className="text-xs text-gray-500">
                  총 이탈: <span className="text-red-400 font-bold text-sm">{(steps[0].count - steps[steps.length - 1].count).toLocaleString()}</span>
                </div>
              </div>
            )}
          </ChartCard>
        );
      })}
    </div>
  );
});

// ─── Service Health Tab ──────────────────────────────────────────────────
const WebVitalGauge = memo(function WebVitalGauge({
  label, value, unit, goodThreshold, poorThreshold,
}: {
  label: string; value: number | undefined; unit: string; goodThreshold: number; poorThreshold: number;
}) {
  const val = value ?? 0;
  const status = val <= goodThreshold ? 'good' : val <= poorThreshold ? 'needs-improvement' : 'poor';
  const statusLabel = status === 'good' ? '좋음' : status === 'needs-improvement' ? '개선 필요' : '나쁨';
  const statusColor = status === 'good' ? '#10B981' : status === 'needs-improvement' ? '#F59E0B' : '#EF4444';

  // For RadialBarChart, represent as percentage of poor threshold
  const pctOfMax = Math.min((val / (poorThreshold * 1.5)) * 100, 100);
  const gaugeData = [{ name: label, value: pctOfMax, fill: statusColor }];

  return (
    <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-4 flex flex-col items-center">
      <div className="w-full" style={{ height: 140 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%" cy="50%"
            innerRadius="60%" outerRadius="90%"
            barSize={12}
            data={gaugeData}
            startAngle={180} endAngle={0}
          >
            <RadialBar dataKey="value" cornerRadius={6} background={{ fill: '#1a1a2e' }} />
          </RadialBarChart>
        </ResponsiveContainer>
      </div>
      <div className="text-center -mt-4">
        <p className="text-xl font-black text-white">{value !== undefined ? `${val.toFixed(val < 1 ? 3 : 1)}` : '-'}<span className="text-xs text-gray-500 ml-1">{unit}</span></p>
        <p className="text-[11px] font-bold mt-1" style={{ color: statusColor }}>{statusLabel}</p>
        <p className="text-[10px] text-gray-600 mt-0.5">{label}</p>
      </div>
    </div>
  );
});

const ServiceHealthTab = memo(function ServiceHealthTab({ days }: { days: number }) {
  const [health, setHealth] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/analytics/query?type=health&days=${days}`);
        const json = await res.json();
        setHealth(json);
      } catch {
        setHealth(null);
      } finally {
        setLoading(false);
      }
    };
    load();
    // Real-time polling for active users
    const interval = setInterval(load, 15000);
    return () => clearInterval(interval);
  }, [days]);

  if (loading && !health) return <LoadingSpinner />;

  const vitals: WebVitals = health?.webVitals || {};
  const jsErrors: { message: string; count: number; lastSeen: string }[] = health?.jsErrors || [];
  const errorRateTrend: { name: string; value: number }[] = health?.errorRateTrend || [];
  const activeUsers: number = health?.activeUsers ?? 0;
  const errorRate: number = health?.errorRate ?? 0;
  const avgResponseTime: number = health?.avgResponseTime ?? 0;
  const apiLatency: { name: string; value: number }[] = health?.apiLatencyTrend || [];

  return (
    <div className="space-y-6">
      {/* Real-time stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KPICard title="실시간 사용자" value={activeUsers.toLocaleString()} icon="person" color="#10B981" subtitle="현재 접속 중" />
        <KPICard title="에러율" value={`${errorRate.toFixed(2)}%`} icon="error" color="#EF4444" />
        <KPICard title="평균 응답시간" value={`${avgResponseTime.toFixed(0)}ms`} icon="speed" color="#F59E0B" />
        <KPICard title="가동시간" value={`${(health?.uptime ?? 99.9).toFixed(2)}%`} icon="check_circle" color="#00D4D4" />
      </div>

      {/* Web Vitals gauges */}
      <ChartCard title="Core Web Vitals" icon="speed">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <WebVitalGauge label="LCP" value={vitals.lcp} unit="s" goodThreshold={2.5} poorThreshold={4.0} />
          <WebVitalGauge label="FCP" value={vitals.fcp} unit="s" goodThreshold={1.8} poorThreshold={3.0} />
          <WebVitalGauge label="CLS" value={vitals.cls} unit="" goodThreshold={0.1} poorThreshold={0.25} />
          <WebVitalGauge label="TTFB" value={vitals.ttfb} unit="s" goodThreshold={0.8} poorThreshold={1.8} />
        </div>
      </ChartCard>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Error rate trend */}
        <ChartCard title="에러율 추이" icon="error">
          {errorRateTrend.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={errorRateTrend} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradError" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#EF4444" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#555', fontSize: 10 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#555', fontSize: 10 }} />
                <RechartsTooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="value" name="에러율 %" stroke="#EF4444" strokeWidth={2} fillOpacity={1} fill="url(#gradError)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <EmptyState icon="error" message="에러 데이터 없음" />}
        </ChartCard>

        {/* API response time */}
        <ChartCard title="API 응답시간 추이" icon="api">
          {apiLatency.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={apiLatency} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradApi" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F59E0B" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#F59E0B" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" vertical={false} />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#555', fontSize: 10 }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#555', fontSize: 10 }} unit="ms" />
                <RechartsTooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="value" name="응답시간 (ms)" stroke="#F59E0B" strokeWidth={2} fillOpacity={1} fill="url(#gradApi)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : <EmptyState icon="api" message="API 응답시간 데이터 없음" />}
        </ChartCard>
      </div>

      {/* JS Error table */}
      <ChartCard title="JS 에러 로그" icon="bug_report">
        {jsErrors.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e1e2e]">
                  <th className="text-left py-2 px-3 text-[11px] text-gray-500 font-medium">에러 메시지</th>
                  <th className="text-right py-2 px-3 text-[11px] text-gray-500 font-medium w-20">발생 횟수</th>
                  <th className="text-right py-2 px-3 text-[11px] text-gray-500 font-medium w-36">마지막 발생</th>
                </tr>
              </thead>
              <tbody>
                {jsErrors.slice(0, 20).map((err, i) => (
                  <tr key={i} className="border-b border-[#1a1a2e] hover:bg-[#1a1a2e] transition-colors">
                    <td className="py-2.5 px-3">
                      <p className="text-red-400 text-xs font-mono truncate max-w-[500px]">{err.message}</p>
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      <span className="text-white font-bold text-xs">{err.count.toLocaleString()}</span>
                    </td>
                    <td className="py-2.5 px-3 text-right text-gray-500 text-xs">
                      {err.lastSeen ? new Date(err.lastSeen).toLocaleString('ko-KR') : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <EmptyState icon="check_circle" message="JS 에러가 없습니다!" />}
      </ChartCard>
    </div>
  );
});

// ─── Recordings Tab (improved UI) ────────────────────────────────────────
const SessionRecordingsTab = memo(function SessionRecordingsTab({ activeFilter }: { activeFilter: DateFilter }) {
  const [recordings, setRecordings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/analytics/recordings?days=${activeFilter.days}`);
        const data = await res.json();
        setRecordings(data.recordings || []);
      } catch {
        setRecordings([]);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [activeFilter.days]);

  if (loading) return <LoadingSpinner />;
  if (recordings.length === 0) return <EmptyState icon="videocam" message="세션 녹화가 없습니다." />;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs text-gray-500">{recordings.length}개의 녹화</p>
      </div>
      {recordings.map((rec: any) => {
        const duration = Math.round((new Date(rec.end_time).getTime() - new Date(rec.start_time).getTime()) / 1000);
        const eventCount = Array.isArray(rec.events) ? rec.events.length : 0;

        return (
          <div
            key={rec.id}
            className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-4 hover:border-[#00D4D4]/40 transition-all group"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-lg bg-[#00D4D4]/10 flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[#00D4D4] text-[20px]">videocam</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white truncate">{rec.page_url}</p>
                  <div className="flex items-center gap-3 mt-1">
                    <span className="text-[11px] text-gray-500 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[12px]">fingerprint</span>
                      {rec.session_id?.slice(0, 8)}...
                    </span>
                    <span className="text-[11px] text-gray-500 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[12px]">schedule</span>
                      {formatDuration(duration)}
                    </span>
                    <span className="text-[11px] text-gray-500 flex items-center gap-1">
                      <span className="material-symbols-outlined text-[12px]">touch_app</span>
                      {eventCount}
                    </span>
                    <span className="text-[11px] text-gray-500">
                      {rec.created_at ? new Date(rec.created_at).toLocaleString('ko-KR') : ''}
                    </span>
                  </div>
                </div>
              </div>
              <button
                className="px-4 py-2 rounded-lg text-xs bg-[#00D4D4] text-black font-bold hover:bg-[#00b8b8] transition-all opacity-80 group-hover:opacity-100"
                onClick={() => window.open(`/admin/analytics/recordings/${rec.id}`, '_blank')}
              >
                재생
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
});

// ─── Editing Data Tab ────────────────────────────────────────────────────
const EditingDataTab = memo(function EditingDataTab({ days }: { days: number }) {
  const [loading, setLoading] = useState(true);
  const [actionStats, setActionStats] = useState<{
    total_actions: number; unique_sessions: number; avg_actions_per_session: number;
    action_breakdown: { action_type: string; count: number }[];
    hourly_activity: { hour: number; count: number }[];
    top_projects: { project_id: string; total_actions: number; total_duration: number; clip_count: number }[];
    media_type_distribution: { media_type: string; count: number }[];
    editing_efficiency: { avg_actions_per_minute: number; avg_editing_duration: number; total_exports: number };
    templates: { id: string; name: string; category: string; popularity_score: number; is_premium: boolean }[];
    daily_trend: { date: string; actions: number; sessions: number }[];
  } | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/analytics/query?action=editing_data&days=${days}`)
      .then(r => r.json())
      .then(data => { setActionStats(data); setLoading(false); })
      .catch(() => {
        // Generate demo data when API not available
        const actionTypes = ['clip_add', 'clip_trim_left', 'clip_trim_right', 'clip_split', 'clip_delete', 'subtitle_add', 'subtitle_edit', 'audio_add', 'audio_volume_change', 'effect_apply', 'export_complete', 'undo', 'redo'];
        const breakdown = actionTypes.map(t => ({ action_type: t, count: Math.floor(Math.random() * 500) + 10 }));
        const total = breakdown.reduce((s, b) => s + b.count, 0);
        setActionStats({
          total_actions: total,
          unique_sessions: Math.floor(total / 45),
          avg_actions_per_session: 45,
          action_breakdown: breakdown.sort((a, b) => b.count - a.count),
          hourly_activity: Array.from({ length: 24 }, (_, h) => ({ hour: h, count: Math.floor(Math.random() * 200) + (h >= 9 && h <= 22 ? 100 : 10) })),
          top_projects: Array.from({ length: 5 }, (_, i) => ({
            project_id: `proj_${String(i + 1).padStart(3, '0')}`,
            total_actions: Math.floor(Math.random() * 300) + 50,
            total_duration: Math.floor(Math.random() * 600) + 30,
            clip_count: Math.floor(Math.random() * 20) + 3,
          })),
          media_type_distribution: [
            { media_type: 'video', count: Math.floor(Math.random() * 300) + 100 },
            { media_type: 'audio', count: Math.floor(Math.random() * 150) + 30 },
            { media_type: 'image', count: Math.floor(Math.random() * 100) + 20 },
            { media_type: 'subtitle', count: Math.floor(Math.random() * 200) + 50 },
          ],
          editing_efficiency: {
            avg_actions_per_minute: +(Math.random() * 8 + 2).toFixed(1),
            avg_editing_duration: Math.floor(Math.random() * 1800) + 300,
            total_exports: Math.floor(Math.random() * 100) + 10,
          },
          templates: [
            { id: '1', name: '유튜브 브이로그 컷편집', category: 'vlog', popularity_score: 92, is_premium: true },
            { id: '2', name: '쇼츠 자동 자막', category: 'shorts', popularity_score: 88, is_premium: true },
            { id: '3', name: '튜토리얼 챕터 구성', category: 'tutorial', popularity_score: 75, is_premium: false },
            { id: '4', name: '광고 영상 15초 컷', category: 'commercial', popularity_score: 68, is_premium: true },
            { id: '5', name: '팟캐스트 오디오 편집', category: 'podcast', popularity_score: 55, is_premium: false },
          ],
          daily_trend: Array.from({ length: Math.max(days, 7) }, (_, i) => {
            const d = new Date(); d.setDate(d.getDate() - (Math.max(days, 7) - 1 - i));
            return { date: d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }), actions: Math.floor(Math.random() * 500) + 100, sessions: Math.floor(Math.random() * 30) + 5 };
          }),
        });
        setLoading(false);
      });
  }, [days]);

  if (loading) return <LoadingSpinner />;
  if (!actionStats) return <p className="text-gray-500 text-center py-10">데이터 없음</p>;

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
  );
});

// ─── YouTube Tab ─────────────────────────────────────────────────────────
const YouTubeTab = memo(function YouTubeTab({ days }: { days: number }) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<{
    channel: { id: string; title: string; thumbnailUrl: string; subscriberCount: number; videoCount: number; viewCount: number; customUrl?: string } | null;
    recentVideos: { id: string; title: string; thumbnailUrl: string; publishedAt: string; viewCount: number; likeCount: number; commentCount: number; duration: string }[];
    analytics: { videoId: string; views: number; estimatedMinutesWatched: number; averageViewPercentage: number; subscribersGained: number; estimatedRevenue?: number }[];
    demographics: { ageGroup: string; gender: string; viewerPercentage: number }[];
    avgViewsPerVideo: number;
    avgEngagementRate: number;
    totalRevenue: number;
  } | null>(null);
  const [searchFrame, setSearchFrame] = useState<string | null>(null);
  const [searchResult, setSearchResult] = useState<{ videoId: string; title: string; confidence: number } | null>(null);
  const [searching, setSearching] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetch(`/api/youtube?action=summary&days=${days}`)
      .then(r => {
        if (r.status === 403) throw new Error('NO_AUTH');
        if (!r.ok) throw new Error('API_ERROR');
        return r.json();
      })
      .then(d => { setData(d); setLoading(false); })
      .catch(err => {
        if (err.message === 'NO_AUTH') {
          setError('youtube_reauth');
        } else {
          // Demo data
          setData({
            channel: {
              id: 'demo', title: '내 채널', thumbnailUrl: '', subscriberCount: 1250, videoCount: 48, viewCount: 125000, customUrl: '@mychannel',
            },
            recentVideos: [
              { id: 'v1', title: '브이로그 편집 완성본', thumbnailUrl: '', publishedAt: new Date(Date.now() - 86400000 * 2).toISOString(), viewCount: 3200, likeCount: 180, commentCount: 24, duration: 'PT12M30S' },
              { id: 'v2', title: '쇼츠 자동 자막 테스트', thumbnailUrl: '', publishedAt: new Date(Date.now() - 86400000 * 5).toISOString(), viewCount: 8500, likeCount: 420, commentCount: 65, duration: 'PT0M58S' },
              { id: 'v3', title: '편집 강좌 #3 컷편집', thumbnailUrl: '', publishedAt: new Date(Date.now() - 86400000 * 8).toISOString(), viewCount: 1800, likeCount: 95, commentCount: 12, duration: 'PT8M15S' },
              { id: 'v4', title: '일상 브이로그 주말편', thumbnailUrl: '', publishedAt: new Date(Date.now() - 86400000 * 12).toISOString(), viewCount: 2100, likeCount: 130, commentCount: 18, duration: 'PT15M42S' },
              { id: 'v5', title: '음악 커버 영상', thumbnailUrl: '', publishedAt: new Date(Date.now() - 86400000 * 15).toISOString(), viewCount: 950, likeCount: 55, commentCount: 8, duration: 'PT4M20S' },
            ],
            analytics: [
              { videoId: 'v1', views: 3200, estimatedMinutesWatched: 12800, averageViewPercentage: 62, subscribersGained: 15, estimatedRevenue: 4.5 },
              { videoId: 'v2', views: 8500, estimatedMinutesWatched: 4250, averageViewPercentage: 85, subscribersGained: 45, estimatedRevenue: 12.3 },
              { videoId: 'v3', views: 1800, estimatedMinutesWatched: 7200, averageViewPercentage: 55, subscribersGained: 8, estimatedRevenue: 2.1 },
            ],
            demographics: [
              { ageGroup: 'age18-24', gender: 'male', viewerPercentage: 28 },
              { ageGroup: 'age18-24', gender: 'female', viewerPercentage: 18 },
              { ageGroup: 'age25-34', gender: 'male', viewerPercentage: 22 },
              { ageGroup: 'age25-34', gender: 'female', viewerPercentage: 15 },
              { ageGroup: 'age35-44', gender: 'male', viewerPercentage: 10 },
              { ageGroup: 'age35-44', gender: 'female', viewerPercentage: 7 },
            ],
            avgViewsPerVideo: 3310,
            avgEngagementRate: 4.2,
            totalRevenue: 18.9,
          });
        }
        setLoading(false);
      });
  }, [days]);

  const handleFrameSearch = async () => {
    if (!searchFrame) return;
    setSearching(true);
    try {
      const res = await fetch('/api/youtube', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'find_by_frame', frameBase64: searchFrame }),
      });
      const d = await res.json();
      setSearchResult(d.result);
    } catch {
      setSearchResult(null);
    }
    setSearching(false);
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(',')[1];
      setSearchFrame(base64);
    };
    reader.readAsDataURL(file);
  };

  const parseDuration = (iso: string) => {
    const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!m) return '0:00';
    const h = parseInt(m[1] || '0');
    const min = parseInt(m[2] || '0');
    const s = parseInt(m[3] || '0');
    if (h > 0) return `${h}:${String(min).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    return `${min}:${String(s).padStart(2, '0')}`;
  };

  if (loading) return <LoadingSpinner />;

  if (error === 'youtube_reauth') {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <span className="material-symbols-outlined text-[48px] text-red-400 mb-4">link_off</span>
        <h3 className="text-lg font-bold text-white mb-2">YouTube 연동이 필요합니다</h3>
        <p className="text-sm text-gray-400 mb-6 text-center max-w-md">
          YouTube 데이터에 접근하려면 로그아웃 후 다시 로그인하여 YouTube 접근 권한을 승인해주세요.
        </p>
        <a href="/api/auth/signout" className="px-5 py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm font-medium transition-colors">
          다시 로그인하기
        </a>
      </div>
    );
  }

  if (!data) return <p className="text-gray-500 text-center py-10">데이터 없음</p>;

  // Aggregate demographics for chart
  const ageGroupMap: Record<string, { male: number; female: number }> = {};
  data.demographics.forEach(d => {
    const label = d.ageGroup.replace('age', '');
    if (!ageGroupMap[label]) ageGroupMap[label] = { male: 0, female: 0 };
    if (d.gender === 'male') ageGroupMap[label].male += d.viewerPercentage;
    else ageGroupMap[label].female += d.viewerPercentage;
  });
  const demoChartData = Object.entries(ageGroupMap).map(([name, v]) => ({ name, male: +v.male.toFixed(1), female: +v.female.toFixed(1) }));

  return (
    <div className="space-y-6">
      {/* Channel Overview */}
      {data.channel && (
        <div className="bg-gradient-to-r from-red-500/10 via-[#12121a] to-[#12121a] border border-red-500/20 rounded-xl p-5">
          <div className="flex items-center gap-4">
            {data.channel.thumbnailUrl ? (
              <img src={data.channel.thumbnailUrl} alt="" className="w-14 h-14 rounded-full" />
            ) : (
              <div className="w-14 h-14 rounded-full bg-red-500/20 flex items-center justify-center">
                <span className="material-symbols-outlined text-red-400 text-[28px]">smart_display</span>
              </div>
            )}
            <div className="flex-1">
              <h3 className="text-lg font-bold text-white">{data.channel.title}</h3>
              {data.channel.customUrl && <p className="text-xs text-gray-400">{data.channel.customUrl}</p>}
            </div>
            <div className="grid grid-cols-3 gap-6 text-center">
              <div>
                <p className="text-xl font-black text-white">{formatNumber(data.channel.subscriberCount)}</p>
                <p className="text-[10px] text-gray-500">구독자</p>
              </div>
              <div>
                <p className="text-xl font-black text-white">{formatNumber(data.channel.videoCount)}</p>
                <p className="text-[10px] text-gray-500">동영상</p>
              </div>
              <div>
                <p className="text-xl font-black text-white">{formatNumber(data.channel.viewCount)}</p>
                <p className="text-[10px] text-gray-500">총 조회수</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-4 gap-4">
        <KPICard title="평균 조회수/영상" value={formatNumber(data.avgViewsPerVideo)} icon="visibility" color="#EF4444" />
        <KPICard title="참여율" value={`${data.avgEngagementRate}%`} icon="thumb_up" color="#F59E0B" subtitle="좋아요+댓글/조회수" />
        <KPICard title="추정 수익 (30일)" value={`$${data.totalRevenue.toFixed(2)}`} icon="payments" color="#10B981" />
        <KPICard title="영상 수" value={formatNumber(data.recentVideos.length)} icon="movie" color="#3B82F6" subtitle="최근 업로드" />
      </div>

      {/* Video List + Analytics */}
      <div className="grid grid-cols-3 gap-4">
        <div className="col-span-2">
          <ChartCard title="최근 영상 성과" icon="trending_up">
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {data.recentVideos.map((video, i) => {
                const a = data.analytics.find(an => an.videoId === video.id);
                return (
                  <div key={video.id} className="flex items-center gap-3 p-3 bg-[#0d0d14] rounded-lg hover:bg-[#161625] transition-colors">
                    <span className="text-xs text-gray-500 w-5 text-center font-mono">{i + 1}</span>
                    {video.thumbnailUrl ? (
                      <img src={video.thumbnailUrl} alt="" className="w-24 h-14 rounded object-cover bg-gray-800" />
                    ) : (
                      <div className="w-24 h-14 rounded bg-gray-800 flex items-center justify-center">
                        <span className="material-symbols-outlined text-gray-600">movie</span>
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white truncate">{video.title}</p>
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-gray-500">
                        <span>{new Date(video.publishedAt).toLocaleDateString('ko-KR')}</span>
                        <span>{parseDuration(video.duration)}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-right text-xs">
                      <div>
                        <p className="font-medium text-white">{formatNumber(video.viewCount)}</p>
                        <p className="text-[9px] text-gray-500">조회수</p>
                      </div>
                      <div>
                        <p className="font-medium text-white">{formatNumber(video.likeCount)}</p>
                        <p className="text-[9px] text-gray-500">좋아요</p>
                      </div>
                      <div>
                        <p className="font-medium text-white">{a ? `${a.averageViewPercentage}%` : '-'}</p>
                        <p className="text-[9px] text-gray-500">시청유지</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </ChartCard>
        </div>

        {/* Demographics */}
        <ChartCard title="시청자 인구통계" icon="group">
          {demoChartData.length > 0 ? (
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={demoChartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                  <XAxis dataKey="name" tick={{ fill: '#999', fontSize: 10 }} />
                  <YAxis tick={{ fill: '#666', fontSize: 9 }} unit="%" />
                  <RechartsTooltip content={<CustomTooltip />} />
                  <Legend />
                  <Bar dataKey="male" name="남성" fill="#3B82F6" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="female" name="여성" fill="#EC4899" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <p className="text-xs text-gray-500 text-center py-8">인구통계 데이터 없음</p>
          )}
        </ChartCard>
      </div>

      {/* AI Video Matching (Gemini Vision) */}
      <ChartCard title="AI 영상 매칭 (Gemini Vision)" icon="image_search"
        rightContent={<span className="text-[10px] text-gray-500">편집 영상의 프레임을 분석하여 YouTube 원본 영상을 자동으로 찾습니다</span>}
      >
        <div className="flex items-start gap-4">
          <div className="flex-1">
            <label className="block text-xs text-gray-400 mb-2">영상 프레임 이미지 업로드</label>
            <div className="flex items-center gap-3">
              <label className="cursor-pointer px-4 py-2 bg-[#1e1e2e] hover:bg-[#2a2a3e] border border-[#2a2a3e] rounded-lg text-sm text-white transition-colors">
                <span className="material-symbols-outlined text-[16px] mr-1 align-middle">upload_file</span>
                이미지 선택
                <input type="file" accept="image/*" className="hidden" onChange={handleFileSelect} />
              </label>
              <button
                onClick={handleFrameSearch}
                disabled={!searchFrame || searching}
                className="px-4 py-2 bg-[#00D4D4] hover:bg-[#00B8B8] disabled:bg-gray-700 disabled:text-gray-500 text-black rounded-lg text-sm font-medium transition-colors"
              >
                {searching ? (
                  <span className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                    분석 중...
                  </span>
                ) : 'YouTube에서 찾기'}
              </button>
            </div>
            {searchFrame && (
              <div className="mt-3 flex items-start gap-3">
                <img src={`data:image/jpeg;base64,${searchFrame}`} alt="프레임" className="w-40 h-24 rounded object-cover border border-[#2a2a3e]" />
                {searchResult && (
                  <div className="bg-[#0d0d14] rounded-lg p-3 flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="material-symbols-outlined text-green-400 text-[16px]">check_circle</span>
                      <p className="text-sm font-medium text-white">매칭 결과</p>
                      <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                        searchResult.confidence >= 0.7 ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        신뢰도 {Math.round(searchResult.confidence * 100)}%
                      </span>
                    </div>
                    <p className="text-xs text-gray-300">{searchResult.title}</p>
                    <a
                      href={`https://youtube.com/watch?v=${searchResult.videoId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-[#00D4D4] hover:underline mt-1 inline-block"
                    >
                      YouTube에서 보기 →
                    </a>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </ChartCard>

      {/* Cross-analysis hint */}
      <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <span className="material-symbols-outlined text-[#8B5CF6] text-[20px]">auto_awesome</span>
          <h3 className="text-sm font-bold text-white">편집 ↔ YouTube 교차 분석</h3>
          <span className="px-2 py-0.5 bg-[#8B5CF6]/15 text-[#8B5CF6] text-[9px] font-bold rounded-full">COMING SOON</span>
        </div>
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-[#0d0d14] rounded-lg p-4">
            <span className="material-symbols-outlined text-[#3B82F6] text-[24px] mb-2">analytics</span>
            <h4 className="text-xs font-medium text-white mb-1">컷 편집 → 조회수</h4>
            <p className="text-[10px] text-gray-500">컷 편집 스타일별 조회수 변화를 분석합니다. 어떤 편집 패턴이 성과가 높은지 자동으로 파악합니다.</p>
          </div>
          <div className="bg-[#0d0d14] rounded-lg p-4">
            <span className="material-symbols-outlined text-[#EC4899] text-[24px] mb-2">subtitles</span>
            <h4 className="text-xs font-medium text-white mb-1">자막 스타일 → 시청유지</h4>
            <p className="text-[10px] text-gray-500">자막 디자인/빈도가 시청자 유지율에 미치는 영향을 분석합니다.</p>
          </div>
          <div className="bg-[#0d0d14] rounded-lg p-4">
            <span className="material-symbols-outlined text-[#F59E0B] text-[24px] mb-2">monetization_on</span>
            <h4 className="text-xs font-medium text-white mb-1">편집 시간 → 수익</h4>
            <p className="text-[10px] text-gray-500">편집 노동 시간 대비 YouTube 수익률을 계산하여 최적의 편집 전략을 추천합니다.</p>
          </div>
        </div>
      </div>
    </div>
  );
});

// ─── Main Dashboard ──────────────────────────────────────────────────────
export default function AnalyticsDashboard() {
  const [mounted, setMounted] = useState(false);
  const [activeFilter, setActiveFilter] = useState<DateFilter>(DATE_FILTERS[1]);
  const [pages, setPages] = useState<string[]>([]);
  const [selectedPage, setSelectedPage] = useState('');
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [stats, setStats] = useState<VisitorStats | null>(null);
  const [charts, setCharts] = useState<any>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [heatmapOpacity, setHeatmapOpacity] = useState(60);

  useEffect(() => { setMounted(true); }, []);

  // 히트맵: 페이지 변경 시 iframe 로딩 상태 초기화
  useEffect(() => {
    setIframeLoaded(false);
  }, [selectedPage]);

  const fetchPages = useCallback(async () => {
    try {
      const res = await fetch(`/api/analytics/query?action=pages&days=${activeFilter.days}`);
      const data = await res.json();
      const pageList: string[] = data.pages || [];
      setPages(pageList.filter(p => !p.startsWith('/admin')));
      if (pageList.length > 0 && !selectedPage) setSelectedPage(pageList[0]);
    } catch (err) { console.error('Failed to fetch pages:', err); }
  }, [activeFilter.days, selectedPage]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/analytics/query?action=stats&days=${activeFilter.days}`);
      const data = await res.json();
      if (data && typeof data === 'object') setStats(data);
    } catch (err) { console.error('Failed to fetch stats:', err); }
  }, [activeFilter.days]);

  const fetchCharts = useCallback(async () => {
    try {
      const res = await fetch(`/api/analytics/query?action=charts&days=${activeFilter.days}`);
      const data = await res.json();
      if (data && typeof data === 'object') setCharts(data);
    } catch (err) { console.error('Failed to fetch charts:', err); }
  }, [activeFilter.days]);

  const fetchEvents = useCallback(async () => {
    if (!selectedPage) return;
    try {
      const params = new URLSearchParams({ page_url: selectedPage, days: String(activeFilter.days), limit: '10000' });
      const res = await fetch(`/api/analytics/query?${params}`);
      const data = await res.json();
      setEvents(data.events || []);
    } catch (err) { console.error('Failed to fetch events:', err); }
  }, [selectedPage, activeFilter.days]);

  const refreshAll = useCallback(() => {
    fetchPages(); fetchStats(); fetchCharts();
    if (selectedPage) fetchEvents();
  }, [fetchPages, fetchStats, fetchCharts, fetchEvents, selectedPage]);

  useEffect(() => {
    if (!mounted) return;
    const loadData = async () => {
      setDataLoading(true);
      try {
        await Promise.all([fetchPages(), fetchStats(), fetchCharts(), selectedPage ? fetchEvents() : Promise.resolve()]);
      } catch (err) { console.error('Failed to fetch data:', err); }
      finally { setDataLoading(false); }
    };
    const timeout = setTimeout(loadData, 100);
    const interval = setInterval(loadData, 30000);
    return () => { clearTimeout(timeout); clearInterval(interval); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, activeFilter.days, selectedPage]);

  // Heatmap rendering — canvas useEffect가 HeatmapTab 내부로 이동됨
  const clickEvents = events.filter(e => e.event_type === 'click' && e.x_pos != null && e.y_pos != null);

  const iframeUrl = selectedPage && typeof window !== 'undefined'
    ? `${window.location.origin}${selectedPage}?_analytics_preview=1` : '';

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-[#0d0d14] text-white">
      {/* Header */}
      <header className="border-b border-[#1e1e2e] px-6 py-3 flex items-center justify-between sticky top-0 bg-[#0d0d14]/95 backdrop-blur-sm z-50">
        <div className="flex items-center gap-3">
          <a href="/" className="text-gray-400 hover:text-white transition-colors">
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </a>
          <span className="material-symbols-outlined text-[#00D4D4] text-[24px]">analytics</span>
          <h1 className="text-lg font-semibold">분석 대시보드</h1>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/admin/experiments"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-[#12121a] border border-[#1e1e2e] text-gray-400 hover:text-[#00D4D4] hover:border-[#00D4D4]/30 transition-all"
          >
            <span className="material-symbols-outlined text-[14px]">science</span>
            A/B 테스트
          </a>
          {DATE_FILTERS.map(filter => (
            <button
              key={filter.days}
              onClick={() => setActiveFilter(filter)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeFilter.days === filter.days
                  ? 'bg-[#00D4D4] text-black'
                  : 'bg-[#12121a] border border-[#1e1e2e] text-gray-400 hover:text-white'
              }`}
            >
              {filter.label}
            </button>
          ))}
          <button
            onClick={refreshAll}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-[#12121a] border border-[#1e1e2e] text-gray-400 hover:text-white hover:border-[#2a2a3e] transition-all"
          >
            <span className={`material-symbols-outlined text-[16px] ${dataLoading ? 'animate-spin' : ''}`}>refresh</span>
            새로고침
          </button>
        </div>
      </header>

      <main className="p-6 max-w-[1400px] mx-auto">
        {/* Page selector */}
        {pages.length > 0 && (
          <div className="mb-5">
            <label className="block text-[11px] text-gray-600 mb-1.5 uppercase tracking-wider">페이지 필터</label>
            <select
              value={selectedPage}
              onChange={e => setSelectedPage(e.target.value)}
              className="bg-[#12121a] border border-[#1e1e2e] rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-[#00D4D4] text-white"
            >
              <option value="">전체 페이지</option>
              {pages.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
        )}

        {/* Tab navigation */}
        <div className="flex gap-1 mb-6 border-b border-[#1e1e2e] overflow-x-auto">
          {TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-[#00D4D4] text-[#00D4D4]'
                  : 'border-transparent text-gray-500 hover:text-gray-300'
              }`}
            >
              <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {dataLoading && activeTab === 'overview' ? (
          <LoadingSpinner />
        ) : activeTab === 'overview' ? (
          <OverviewTab stats={stats} charts={charts} />
        ) : activeTab === 'demographics' ? (
          <DemographicsTab days={activeFilter.days} />
        ) : activeTab === 'editing' ? (
          <EditingDataTab days={activeFilter.days} />
        ) : activeTab === 'youtube' ? (
          <YouTubeTab days={activeFilter.days} />
        ) : activeTab === 'heatmap' ? (
          <HeatmapTab
            selectedPage={selectedPage}
            clickEvents={clickEvents}
            canvasRef={canvasRef}
            iframeRef={iframeRef}
            iframeLoaded={iframeLoaded}
            setIframeLoaded={setIframeLoaded}
            iframeUrl={iframeUrl}
            heatmapOpacity={heatmapOpacity}
            setHeatmapOpacity={setHeatmapOpacity}
            days={activeFilter.days}
          />
        ) : activeTab === 'funnels' ? (
          <FunnelTab days={activeFilter.days} />
        ) : activeTab === 'health' ? (
          <ServiceHealthTab days={activeFilter.days} />
        ) : activeTab === 'recordings' ? (
          <SessionRecordingsTab activeFilter={activeFilter} />
        ) : null}
      </main>
    </div>
  );
}
