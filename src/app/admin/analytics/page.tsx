'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { AnalyticsEvent, DateFilter, VisitorStats } from '@/lib/analytics/types';
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
} from 'recharts';

const COLORS = ['#00D4D4', '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444'];
const HEATMAP_RADIUS = 30;
const HEATMAP_MAX_ALPHA = 0.7;
const PREVIEW_WIDTH = 1200;
const PREVIEW_HEIGHT = 750;

const formatDuration = (seconds: number) => {
  if (seconds < 60) return `${seconds}초`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}분 ${s}초`;
};

export default function AnalyticsDashboard() {
  const [mounted, setMounted] = useState(false);
  const [activeFilter, setActiveFilter] = useState<DateFilter>(DATE_FILTERS[1]);
  const [pages, setPages] = useState<string[]>([]);
  const [selectedPage, setSelectedPage] = useState<string>('');
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [stats, setStats] = useState<VisitorStats | null>(null);
  const [charts, setCharts] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [dataLoading, setDataLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'summary' | 'heatmap' | 'scroll' | 'rage' | 'dead' | 'recordings'>('summary');
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeLoaded, setIframeLoaded] = useState(false);
  const [heatmapOpacity, setHeatmapOpacity] = useState(60);

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchPages = useCallback(async () => {
    try {
      const res = await fetch(`/api/analytics/query?action=pages&days=${activeFilter.days}`);
      const data = await res.json();
      const pageList: string[] = data.pages || [];
      setPages(pageList.filter(p => !p.startsWith('/admin')));
      if (pageList.length > 0 && !selectedPage) {
        setSelectedPage(pageList[0]);
      }
    } catch (err) {
      console.error('Failed to fetch pages:', err);
    }
  }, [activeFilter.days, selectedPage]);

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch(`/api/analytics/query?action=stats&days=${activeFilter.days}`);
      const data = await res.json();
      if (data && typeof data === 'object') {
        setStats(data);
      }
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  }, [activeFilter.days]);

  const fetchCharts = useCallback(async () => {
    try {
      const res = await fetch(`/api/analytics/query?action=charts&days=${activeFilter.days}`);
      const data = await res.json();
      if (data && typeof data === 'object') {
        setCharts(data);
      }
    } catch (err) {
      console.error('Failed to fetch charts:', err);
    }
  }, [activeFilter.days]);

  const fetchEvents = useCallback(async () => {
    if (!selectedPage) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page_url: selectedPage,
        days: String(activeFilter.days),
        limit: '10000',
      });
      const res = await fetch(`/api/analytics/query?${params}`);
      const data = await res.json();
      setEvents(data.events || []);
    } catch (err) {
      console.error('Failed to fetch events:', err);
    } finally {
      setLoading(false);
    }
  }, [selectedPage, activeFilter.days]);

  useEffect(() => {
    if (!mounted) return;

    const loadData = async () => {
      setDataLoading(true);
      try {
        await Promise.all([
          fetchPages(),
          fetchStats(),
          fetchCharts(),
          selectedPage ? fetchEvents() : Promise.resolve(),
        ]);
      } catch (err) {
        console.error('Failed to fetch data:', err);
      } finally {
        setDataLoading(false);
      }
    };

    const timeoutId = setTimeout(loadData, 100);
    const interval = setInterval(loadData, 30000);

    return () => {
      clearTimeout(timeoutId);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted, activeFilter.days, selectedPage]);

  const clickEvents = events.filter(e => e.event_type === 'click' && e.x_pos != null && e.y_pos != null);
  const scrollEvents = events.filter(e => e.event_type === 'scroll');
  const rageEvents = events.filter(e => e.event_type === 'rage_click');
  const deadEvents = events.filter(e => e.event_type === 'dead_click');
  const pageViews = events.filter(e => e.event_type === 'page_view');

  // 히트맵 그리기 (안정화된 버전)
  useEffect(() => {
    if (activeTab !== 'heatmap' || !iframeLoaded) {
      // 탭이 변경되거나 iframe이 로드되지 않았으면 캔버스 클리어
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
      }
      return;
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const filteredClicks = clickEvents.filter(c => c.x_pos != null && c.y_pos != null);
    if (filteredClicks.length === 0) {
      // 클릭 이벤트가 없으면 캔버스 클리어
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // requestAnimationFrame으로 렌더링 최적화
    const renderFrame = () => {
      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      const maxVW = Math.max(...filteredClicks.map(c => c.viewport_width || 1920), 1920);
      const maxVH = Math.max(...filteredClicks.map(c => c.viewport_height || 1080), 1080);

      const grid = new Float32Array(w * h);
      let maxVal = 0;

      filteredClicks.forEach(c => {
        const nx = ((c.x_pos || 0) / maxVW) * w;
        const ny = ((c.y_pos || 0) / maxVH) * h;
        const ix = Math.round(nx);
        const iy = Math.round(ny);

        for (let dy = -HEATMAP_RADIUS; dy <= HEATMAP_RADIUS; dy++) {
          for (let dx = -HEATMAP_RADIUS; dx <= HEATMAP_RADIUS; dx++) {
            const px = ix + dx;
            const py = iy + dy;
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
      const data = imageData.data;

      for (let i = 0; i < grid.length; i++) {
        const v = grid[i] / maxVal;
        if (v < 0.01) continue;

        const pi = i * 4;
        let r: number, g: number, b: number;

        if (v < 0.25) {
          r = 0; g = 0; b = Math.round(128 + v * 4 * 127);
        } else if (v < 0.5) {
          const t = (v - 0.25) * 4;
          r = 0; g = Math.round(t * 255); b = Math.round(255 * (1 - t));
        } else if (v < 0.75) {
          const t = (v - 0.5) * 4;
          r = Math.round(t * 255); g = 255; b = 0;
        } else {
          const t = (v - 0.75) * 4;
          r = 255; g = Math.round(255 * (1 - t)); b = 0;
        }

        const alpha = Math.min(v * HEATMAP_MAX_ALPHA * 255, HEATMAP_MAX_ALPHA * 255);
        data[pi] = r;
        data[pi + 1] = g;
        data[pi + 2] = b;
        data[pi + 3] = Math.round(alpha);
      }

      ctx.putImageData(imageData, 0, 0);
    };

    const rafId = requestAnimationFrame(renderFrame);
    return () => cancelAnimationFrame(rafId);
  }, [activeTab, clickEvents.length, iframeLoaded, heatmapOpacity, selectedPage]);

  const iframeUrl = selectedPage && typeof window !== 'undefined'
    ? `${window.location.origin}${selectedPage}?_analytics_preview=1`
    : '';

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white">
      <header className="border-b border-[#222] px-6 py-3 flex items-center justify-between sticky top-0 bg-[#0d0d0d] z-50">
        <div className="flex items-center gap-3">
          <a href="/" className="text-gray-400 hover:text-white transition-colors">
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </a>
          <span className="material-symbols-outlined text-[#00D4D4] text-[24px]">analytics</span>
          <h1 className="text-lg font-semibold">방문자 분석 대시보드</h1>
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/admin/experiments"
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs bg-[#1a1a1a] border border-[#222] text-gray-400 hover:text-[#00D4D4] hover:border-[#00D4D4]/30 transition-all"
          >
            <span className="material-symbols-outlined text-[14px]">science</span>
            A/B 테스트
          </a>
          {DATE_FILTERS.map(filter => (
            <button
              key={filter.days}
              onClick={() => setActiveFilter(filter)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${activeFilter.days === filter.days
                ? 'bg-[#00D4D4] text-black'
                : 'bg-[#1a1a1a] border border-[#222] text-gray-400 hover:text-white'
                }`}
            >
              {filter.label}
            </button>
          ))}
          <button
            onClick={() => {
              fetchPages();
              fetchStats();
              fetchCharts();
              if (selectedPage) fetchEvents();
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-[#1a1a1a] border border-[#222] text-gray-400 hover:text-white hover:border-[#444] transition-all"
          >
            <span className={`material-symbols-outlined text-[16px] ${dataLoading ? 'animate-spin' : ''}`}>refresh</span>
            새로고침
          </button>
        </div>
      </header>

      <main className="p-8 max-w-7xl mx-auto">
        {/* 페이지 선택 */}
        {pages.length > 0 && (
          <div className="mb-6">
            <label className="block text-xs text-gray-500 mb-2">페이지 필터</label>
            <select
              value={selectedPage}
              onChange={(e) => setSelectedPage(e.target.value)}
              className="bg-black border border-[#333] rounded-lg px-4 py-2 text-sm focus:outline-none focus:border-[#00D4D4]"
            >
              <option value="">전체 페이지</option>
              {pages.map(page => (
                <option key={page} value={page}>{page}</option>
              ))}
            </select>
          </div>
        )}

        {/* 실시간 요약 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <KPICard
            title="전체 이벤트"
            value={events.length.toLocaleString()}
            icon="hub"
            color="#00D4D4"
          />
          <KPICard
            title="RAGE CLICKS"
            value={rageEvents.length.toLocaleString()}
            icon="warning"
            color="#EF4444"
          />
          <KPICard
            title="DEAD CLICKS"
            value={deadEvents.length.toLocaleString()}
            icon="cancel"
            color="#F59E0B"
          />
        </div>

        {/* 탭 네비게이션 */}
        <div className="flex gap-2 mb-6 border-b border-[#222]">
          {[
            { id: 'summary', label: '대시보드 요약', icon: 'dashboard' },
            { id: 'heatmap', label: '클릭 히트맵', icon: 'heat_map' },
            { id: 'scroll', label: '스크롤 맵', icon: 'vertical_align_bottom' },
            { id: 'rage', label: 'Rage Click', icon: 'warning' },
            { id: 'dead', label: 'Dead Click', icon: 'cancel' },
            { id: 'recordings', label: '세션 녹화', icon: 'videocam' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeTab === tab.id
                ? 'border-[#00D4D4] text-[#00D4D4]'
                : 'border-transparent text-gray-400 hover:text-white'
                }`}
            >
              <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {/* 콘텐츠 영역 */}
        {dataLoading ? (
          <div className="flex items-center justify-center py-20">
            <span className="material-symbols-outlined text-[48px] text-[#00D4D4] animate-spin">refresh</span>
          </div>
        ) : activeTab === 'summary' ? (
          <SummaryTab stats={stats} charts={charts} />
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
          />
        ) : activeTab === 'scroll' ? (
          <ScrollMapTab scrollEvents={scrollEvents} selectedPage={selectedPage} />
        ) : activeTab === 'rage' ? (
          <RageClickTab rageEvents={rageEvents} />
        ) : activeTab === 'recordings' ? (
          <SessionRecordingsTab activeFilter={activeFilter} />
        ) : (
          <DeadClickTab deadEvents={deadEvents} />
        )}
      </main>
    </div>
  );
}

function SummaryTab({ stats, charts }: { stats: VisitorStats | null; charts: any }) {
  return (
    <div className="space-y-6">
      {/* 요약 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KPICard
          title="오늘 방문자"
          value={stats?.today_visitors ? stats.today_visitors.toLocaleString() : '0'}
          change={stats?.visitor_change_pct}
          icon="people"
          color="#00D4D4"
        />
        <KPICard
          title="평균 체류시간"
          value={stats?.avg_duration ? formatDuration(stats.avg_duration) : '0초'}
          icon="schedule"
          color="#3B82F6"
        />
        <KPICard
          title="이탈률"
          value={stats?.bounce_rate ? `${stats.bounce_rate.toFixed(1)}%` : '0%'}
          icon="trending_down"
          color="#EF4444"
        />
        <KPICard
          title="가장 많이 본 페이지"
          value={stats?.top_page || '-'}
          icon="web"
          color="#10B981"
        />
      </div>

      {/* 차트 섹션 */}
      {charts && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* 일별 방문자 추이 */}
          {charts.daily && charts.daily.length > 0 && (
            <ChartCard title="일별 방문자 추이" icon="trending_up">
              <ResponsiveContainer width="100%" height={300}>
                <AreaChart data={charts.daily} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#00D4D4" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#00D4D4" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#666', fontSize: 9 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#666', fontSize: 10 }} />
                  <RechartsTooltip content={<CustomTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="value"
                    stroke="#00D4D4"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorValue)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* 유입 경로 비율 */}
          {charts.referralSources && charts.referralSources.length > 0 && (
            <ChartCard title="유입 경로 비율" icon="source">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={charts.referralSources}
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    nameKey="name"
                  >
                    {charts.referralSources.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip content={<CustomTooltip />} />
                  <Legend
                    verticalAlign="middle"
                    align="right"
                    layout="vertical"
                    wrapperStyle={{ paddingLeft: '20px', fontSize: '11px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* 디바이스 분포 */}
          {charts.devices && charts.devices.length > 0 && (
            <ChartCard title="디바이스 분포" icon="devices">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={charts.devices}
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                    nameKey="name"
                  >
                    {charts.devices.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <RechartsTooltip content={<CustomTooltip />} />
                  <Legend
                    verticalAlign="middle"
                    align="right"
                    layout="vertical"
                    wrapperStyle={{ paddingLeft: '20px', fontSize: '11px' }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* 시간대별 방문 분포 */}
          {charts.hourly && charts.hourly.length > 0 && (
            <ChartCard title="시간대별 방문 분포" icon="schedule">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={charts.hourly} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#666', fontSize: 9 }} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: '#666', fontSize: 10 }} />
                  <RechartsTooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}

          {/* 페이지별 체류시간 TOP 5 */}
          {charts.topPages && charts.topPages.length > 0 && (
            <ChartCard title="페이지별 체류시간 TOP 5" icon="web">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={charts.topPages}
                  layout="vertical"
                  margin={{ top: 10, right: 10, left: 100, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#222" horizontal={false} />
                  <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#666', fontSize: 9 }} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#666', fontSize: 9 }}
                    width={90}
                  />
                  <RechartsTooltip content={<CustomTooltip />} />
                  <Bar dataKey="value" fill="#10B981" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>
          )}
        </div>
      )}
    </div>
  );
}

function RageClickTab({ rageEvents }: { rageEvents: AnalyticsEvent[] }) {
  const grouped = rageEvents.reduce((acc, e) => {
    const key = `${Math.round((e.x_pos || 0) / 50)}_${Math.round((e.y_pos || 0) / 50)}`;
    if (!acc[key]) {
      acc[key] = { ...e, count: 0 };
    }
    acc[key].count++;
    return acc;
  }, {} as Record<string, AnalyticsEvent & { count: number }>);

  const sorted = Object.values(grouped).sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-4">
      {sorted.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <span className="material-symbols-outlined text-[48px] mb-4">warning</span>
          <p>Rage Click 이벤트가 없습니다.</p>
        </div>
      ) : (
        sorted.map((entry, idx) => (
          <div key={idx} className="bg-[#1a1a1a] border border-[#222] rounded-xl p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm font-bold text-red-400 mb-1">
                  {entry.element_tag || 'Unknown'} - {entry.count}회 클릭
                </p>
                <p className="text-xs text-gray-500 mb-2">{entry.page_url}</p>
                <p className="text-[10px] text-gray-600">
                  좌표: ({entry.x_pos || 0}, {entry.y_pos || 0})
                </p>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function DeadClickTab({ deadEvents }: { deadEvents: AnalyticsEvent[] }) {
  const grouped = deadEvents.reduce((acc, e) => {
    const key = `${e.element_tag}_${(e.element_class || '').split(' ')[0]}`;
    if (!acc[key]) {
      acc[key] = { ...e, count: 0 };
    }
    acc[key].count++;
    return acc;
  }, {} as Record<string, AnalyticsEvent & { count: number }>);

  const sorted = Object.values(grouped).sort((a, b) => b.count - a.count).slice(0, 30);

  return (
    <div className="space-y-4">
      {sorted.length === 0 ? (
        <div className="text-center py-20 text-gray-400">
          <span className="material-symbols-outlined text-[48px] mb-4">cancel</span>
          <p>Dead Click 이벤트가 없습니다.</p>
        </div>
      ) : (
        sorted.map((entry, idx) => (
          <div key={idx} className="bg-[#1a1a1a] border border-[#222] rounded-xl p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <p className="text-sm font-bold text-orange-400 mb-1">
                  &lt;{entry.element_tag}&gt; {entry.element_text || entry.element_class || ''} - {entry.count}회
                </p>
                <p className="text-xs text-gray-500 mb-2">{entry.page_url}</p>
                <p className="text-[10px] text-gray-600">
                  좌표: ({entry.x_pos || 0}, {entry.y_pos || 0})
                </p>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function KPICard({ title, value, change, icon, color, subtitle }: any) {
  return (
    <div className="bg-[#1a1a1a] border border-[#222] rounded-xl p-6">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs text-gray-500 font-medium">{title}</span>
        <span className="material-symbols-outlined text-[20px]" style={{ color }}>
          {icon}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <p className="text-2xl font-black text-white">{value}</p>
        {change !== undefined && change !== null && (
          <span className={`text-xs font-bold ${change >= 0 ? 'text-green-400' : 'text-red-400'}`}>
            {change >= 0 ? '+' : ''}{change.toFixed(1)}%
          </span>
        )}
      </div>
      {subtitle && <p className="text-xs text-gray-500 mt-1">{subtitle}</p>}
    </div>
  );
}

function ChartCard({ title, icon, children, className }: any) {
  return (
    <div className={`bg-[#1a1a1a] border border-[#222] rounded-xl p-6 ${className || ''}`}>
      <div className="flex items-center gap-2 mb-4">
        <span className="material-symbols-outlined text-[18px] text-[#00D4D4]">{icon}</span>
        <h3 className="text-sm font-bold text-white">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function HeatmapTab({
  selectedPage,
  clickEvents,
  canvasRef,
  iframeRef,
  iframeLoaded,
  setIframeLoaded,
  iframeUrl,
  heatmapOpacity,
  setHeatmapOpacity,
}: {
  selectedPage: string;
  clickEvents: AnalyticsEvent[];
  canvasRef: React.RefObject<HTMLCanvasElement>;
  iframeRef: React.RefObject<HTMLIFrameElement>;
  iframeLoaded: boolean;
  setIframeLoaded: (loaded: boolean) => void;
  iframeUrl: string;
  heatmapOpacity: number;
  setHeatmapOpacity: (opacity: number) => void;
}) {
  if (!selectedPage) {
    return (
      <div className="text-center py-20 text-gray-400">
        <span className="material-symbols-outlined text-[48px] mb-4">heat_map</span>
        <p>히트맵을 보려면 위에서 페이지를 선택해주세요.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 히트맵 컨트롤 */}
      <div className="flex items-center justify-between bg-[#1a1a1a] border border-[#222] rounded-xl p-4">
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-400 font-medium">히트맵 투명도</span>
          <input
            type="range"
            min="0"
            max="100"
            value={heatmapOpacity}
            onChange={e => setHeatmapOpacity(Number(e.target.value))}
            className="flex-1 max-w-[200px] h-2 bg-[#222] rounded-lg appearance-none cursor-pointer accent-[#00D4D4]"
          />
          <span className="text-[11px] font-mono text-[#00D4D4] w-8">{heatmapOpacity}%</span>
        </div>
        <div className="text-xs text-gray-500">
          클릭 이벤트: <span className="text-[#00D4D4] font-bold">{clickEvents.length}</span>개
        </div>
      </div>

      {/* 히트맵 미리보기 */}
      <div className="relative bg-[#111] border border-[#222] rounded-xl overflow-hidden" style={{ aspectRatio: `${PREVIEW_WIDTH}/${PREVIEW_HEIGHT}` }}>
        {iframeUrl && (
          <iframe
            ref={iframeRef}
            src={iframeUrl}
            className="absolute inset-0 w-full h-full border-0 pointer-events-none opacity-90"
            onLoad={() => setIframeLoaded(true)}
            title="Page Preview"
            onError={() => {
              console.error('[Analytics] Iframe load error');
              setIframeLoaded(false);
            }}
          />
        )}
        <canvas
          ref={canvasRef}
          width={PREVIEW_WIDTH}
          height={PREVIEW_HEIGHT}
          className="absolute inset-0 w-full h-full"
          style={{
            opacity: heatmapOpacity / 100,
            mixBlendMode: 'screen',
            pointerEvents: 'none',
          }}
        />
        {!iframeLoaded && iframeUrl && (
          <div className="absolute inset-0 flex items-center justify-center bg-[#111]">
            <div className="text-center">
              <span className="material-symbols-outlined text-[40px] text-[#00D4D4] animate-spin mb-3">refresh</span>
              <p className="text-sm text-gray-500 font-medium">페이지 로딩 중...</p>
            </div>
          </div>
        )}
        {clickEvents.length === 0 && iframeLoaded && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <span className="material-symbols-outlined text-[48px] text-gray-600 mb-3">touch_app</span>
              <p className="text-sm text-gray-500 font-medium">이 페이지에 클릭 데이터가 없습니다.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ScrollMapTab({ scrollEvents, selectedPage }: { scrollEvents: AnalyticsEvent[]; selectedPage: string }) {
  if (!selectedPage) {
    return (
      <div className="text-center py-20 text-gray-400">
        <span className="material-symbols-outlined text-[48px] mb-4">vertical_align_bottom</span>
        <p>스크롤 맵을 보려면 위에서 페이지를 선택해주세요.</p>
      </div>
    );
  }

  // 스크롤 깊이별 통계 계산
  const depthStats = [0, 25, 50, 75, 100].map(depth => {
    const reached = scrollEvents.filter(e => (e.scroll_depth || 0) >= depth);
    return {
      depth,
      count: reached.length,
      percentage: scrollEvents.length > 0 ? (reached.length / scrollEvents.length) * 100 : 0,
    };
  });

  const avgDepth = scrollEvents.length > 0
    ? scrollEvents.reduce((sum, e) => sum + (e.scroll_depth || 0), 0) / scrollEvents.length
    : 0;

  const maxCount = Math.max(...depthStats.map(s => s.count), 1);

  return (
    <div className="space-y-6">
      {/* 통계 카드 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-[#1a1a1a] border border-[#222] rounded-xl p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500 font-medium">평균 스크롤 깊이</span>
            <span className="material-symbols-outlined text-[20px] text-[#00D4D4]">trending_up</span>
          </div>
          <p className="text-2xl font-black text-white">{avgDepth.toFixed(1)}%</p>
        </div>
        <div className="bg-[#1a1a1a] border border-[#222] rounded-xl p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500 font-medium">전체 스크롤 이벤트</span>
            <span className="material-symbols-outlined text-[20px] text-[#3B82F6]">scrollable</span>
          </div>
          <p className="text-2xl font-black text-white">{scrollEvents.length.toLocaleString()}</p>
        </div>
        <div className="bg-[#1a1a1a] border border-[#222] rounded-xl p-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-gray-500 font-medium">100% 도달률</span>
            <span className="material-symbols-outlined text-[20px] text-[#10B981]">check_circle</span>
          </div>
          <p className="text-2xl font-black text-white">
            {depthStats[4].percentage.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* 스크롤 맵 시각화 */}
      <div className="bg-[#1a1a1a] border border-[#222] rounded-xl p-6">
        <div className="flex items-center gap-2 mb-6">
          <span className="material-symbols-outlined text-[18px] text-[#00D4D4]">vertical_align_bottom</span>
          <h3 className="text-sm font-bold text-white">스크롤 깊이 분포</h3>
        </div>

        <div className="space-y-3">
          {depthStats.slice(1).reverse().map((stat, idx) => {
            const depth = stat.depth;
            const prevDepth = idx === depthStats.length - 2 ? 0 : depthStats[depthStats.length - 2 - idx - 1]?.depth || 0;
            const intensity = stat.count / maxCount;

            // 색상 계산: 파란색(낮음) → 노란색(중간) → 빨간색(높음)
            let r = 0, g = 0, b = 0;
            if (intensity < 0.33) {
              const t = intensity / 0.33;
              r = 0;
              g = Math.round(t * 100);
              b = Math.round(100 + t * 155);
            } else if (intensity < 0.66) {
              const t = (intensity - 0.33) / 0.33;
              r = Math.round(t * 255);
              g = 255;
              b = Math.round(255 * (1 - t));
            } else {
              const t = (intensity - 0.66) / 0.34;
              r = 255;
              g = Math.round(255 * (1 - t));
              b = 0;
            }

            return (
              <div key={depth} className="relative">
                <div className="flex items-center gap-4 mb-2">
                  <span className="text-xs text-gray-400 font-mono w-16 text-right">
                    {prevDepth}% - {depth}%
                  </span>
                  <div className="flex-1 relative h-8 bg-[#0d0d0d] rounded-lg overflow-hidden border border-[#222]">
                    <div
                      className="absolute inset-0 transition-all duration-500"
                      style={{
                        width: `${stat.percentage}%`,
                        backgroundColor: `rgba(${r}, ${g}, ${b}, ${0.6 + intensity * 0.4})`,
                        boxShadow: `0 0 20px rgba(${r}, ${g}, ${b}, 0.5)`,
                      }}
                    />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-xs font-bold text-white drop-shadow-lg">
                        {stat.count}명 ({stat.percentage.toFixed(1)}%)
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* 범례 */}
        <div className="mt-6 pt-6 border-t border-[#222]">
          <div className="flex items-center gap-4">
            <span className="text-xs text-gray-500">색상 강도:</span>
            <div className="flex-1 h-4 bg-gradient-to-r from-blue-500 via-yellow-500 to-red-500 rounded" />
            <span className="text-xs text-gray-500">낮음 → 높음</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SessionRecordingsTab({ activeFilter }: { activeFilter: DateFilter }) {
  const [recordings, setRecordings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRecording, setSelectedRecording] = useState<string | null>(null);

  useEffect(() => {
    const fetchRecordings = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/analytics/recordings?days=${activeFilter.days}`);
        const data = await res.json();
        setRecordings(data.recordings || []);
      } catch (err) {
        console.error('Failed to fetch recordings:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchRecordings();
  }, [activeFilter.days]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="material-symbols-outlined text-[48px] text-[#00D4D4] animate-spin">refresh</span>
      </div>
    );
  }

  if (recordings.length === 0) {
    return (
      <div className="text-center py-20 text-gray-400">
        <span className="material-symbols-outlined text-[48px] mb-4">videocam</span>
        <p>세션 녹화가 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {recordings.map((recording: any) => {
        const duration = Math.round((new Date(recording.end_time).getTime() - new Date(recording.start_time).getTime()) / 1000);
        const eventCount = Array.isArray(recording.events) ? recording.events.length : 0;

        return (
          <div
            key={recording.id}
            className="bg-[#1a1a1a] border border-[#222] rounded-xl p-4 hover:border-[#00D4D4]/50 transition-colors cursor-pointer"
            onClick={() => setSelectedRecording(selectedRecording === recording.id ? null : recording.id)}
          >
            <div className="flex items-start justify-between">
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-2">
                  <span className="material-symbols-outlined text-[#00D4D4] text-[20px]">videocam</span>
                  <p className="text-sm font-bold text-white">{recording.page_url}</p>
                </div>
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span>세션: {recording.session_id.slice(0, 8)}...</span>
                  <span>지속시간: {formatDuration(duration)}</span>
                  <span>이벤트: {eventCount}개</span>
                  <span>{new Date(recording.created_at).toLocaleString('ko-KR')}</span>
                </div>
              </div>
              <button
                className="px-3 py-1.5 rounded-lg text-xs bg-[#00D4D4] text-black font-bold hover:bg-[#00b8b8] transition-all"
                onClick={(e) => {
                  e.stopPropagation();
                  window.open(`/admin/analytics/recordings/${recording.id}`, '_blank');
                }}
              >
                재생
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CustomTooltip({ active, payload }: any) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-[#1a1a1a] border border-[#333] rounded-lg px-3 py-2 shadow-xl">
      <p className="text-xs text-gray-400 mb-1">{payload[0].name}</p>
      <p className="text-sm font-bold text-white">{payload[0].value}</p>
    </div>
  );
}
