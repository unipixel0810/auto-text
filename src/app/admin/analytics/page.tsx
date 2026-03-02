'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { AnalyticsEvent, DateFilter, RageClickEntry, ScrollDepthData, VisitorStats } from '@/lib/analytics/types';
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

const HEATMAP_RADIUS = 30;
const HEATMAP_MAX_ALPHA = 0.7;
const PREVIEW_WIDTH = 1200;
const PREVIEW_HEIGHT = 750;

const COLORS = ['#00D4D4', '#3B82F6', '#8B5CF6', '#10B981', '#F59E0B', '#EF4444'];

export default function AnalyticsDashboard() {
  const [mounted, setMounted] = useState(false);
  const [activeFilter, setActiveFilter] = useState<DateFilter>(DATE_FILTERS[1]);
  const [pages, setPages] = useState<string[]>([]);
  const [selectedPage, setSelectedPage] = useState<string>('');
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [stats, setStats] = useState<VisitorStats | null>(null);
  const [charts, setCharts] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'summary' | 'heatmap' | 'scroll' | 'rage' | 'dead'>('summary');
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
      setPages(pageList);
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
      setStats(data);
    } catch (err) {
      console.error('Failed to fetch stats:', err);
    }
  }, [activeFilter.days]);

  const fetchCharts = useCallback(async () => {
    try {
      const res = await fetch(`/api/analytics/query?action=charts&days=${activeFilter.days}`);
      const data = await res.json();
      setCharts(data);
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

  const fetchData = useCallback(() => {
    fetchPages();
    fetchStats();
    fetchCharts();
    fetchEvents();
  }, [fetchPages, fetchStats, fetchCharts, fetchEvents]);

  useEffect(() => {
    fetchData();
  }, [activeFilter, selectedPage]);

  useEffect(() => {
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const clickEvents = events.filter(e => e.event_type === 'click' && e.x_pos != null && e.y_pos != null);
  const scrollEvents = events.filter(e => e.event_type === 'scroll');
  const rageEvents = events.filter(e => e.event_type === 'rage_click');
  const deadEvents = events.filter(e => e.event_type === 'dead_click');
  const pageViews = events.filter(e => e.event_type === 'page_view');
  const pageLeaves = events.filter(e => e.event_type === 'page_leave');

  const scrollDepthData: ScrollDepthData[] = [25, 50, 75, 100].map(depth => {
    const count = scrollEvents.filter(e => e.scroll_depth === depth).length;
    const total = Math.max(pageViews.length, 1);
    return { depth, count, percentage: Math.round((count / total) * 100) };
  });

  const rageClickList: RageClickEntry[] = (() => {
    const map = new Map<string, RageClickEntry>();
    rageEvents.forEach(e => {
      const key = `${Math.round((e.x_pos || 0) / 50)}_${Math.round((e.y_pos || 0) / 50)}`;
      const existing = map.get(key);
      if (existing) {
        existing.count++;
        if (e.created_at && e.created_at > existing.last_occurred) {
          existing.last_occurred = e.created_at;
        }
      } else {
        map.set(key, {
          x_pos: e.x_pos || 0,
          y_pos: e.y_pos || 0,
          element_info: `${e.element_tag || ''}${e.element_class ? '.' + e.element_class.split(' ')[0] : ''}`,
          page_url: e.page_url,
          count: 1,
          last_occurred: e.created_at || '',
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  })();

  const deadClickList = (() => {
    const map = new Map<string, { info: string; count: number; x: number; y: number; last: string }>();
    deadEvents.forEach(e => {
      const key = `${e.element_tag}_${(e.element_class || '').split(' ')[0]}`;
      const existing = map.get(key);
      if (existing) {
        existing.count++;
      } else {
        map.set(key, {
          info: `<${e.element_tag}> ${e.element_text || e.element_class || ''}`.trim(),
          count: 1,
          x: e.x_pos || 0,
          y: e.y_pos || 0,
          last: e.created_at || '',
        });
      }
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count).slice(0, 30);
  })();

  const drawHeatmapRef = useRef<() => void>();
  drawHeatmapRef.current = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    if (clickEvents.length === 0) return;

    const maxVW = Math.max(...clickEvents.map(c => c.viewport_width || 1920));
    const maxVH = Math.max(...clickEvents.map(c => c.viewport_height || 1080));

    const grid = new Float32Array(w * h);
    let maxVal = 0;

    clickEvents.forEach(c => {
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

  useEffect(() => {
    if (activeTab !== 'heatmap') return;
    const timer = setTimeout(() => {
      drawHeatmapRef.current?.();
    }, 100);
    return () => clearTimeout(timer);
  }, [activeTab, events, iframeLoaded, heatmapOpacity]);

  const iframeUrl = selectedPage
    ? `${window.location.origin}${selectedPage}?_analytics_preview=1`
    : '';

  const formatDuration = (seconds: number) => {
    if (seconds < 60) return `${seconds}초`;
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}분 ${s}초`;
  };

  if (!mounted) return null;

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white">
      {/* Header */}
      <header className="border-b border-[#222] px-6 py-3 flex items-center justify-between sticky top-0 bg-[#0d0d0d] z-50">
        <div className="flex items-center gap-3">
          <a href="/" className="text-gray-400 hover:text-white transition-colors">
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </a>
          <span className="material-symbols-outlined text-[#00D4D4] text-[24px]">analytics</span>
          <h1 className="text-lg font-semibold">방문자 분석 대시보드</h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-[#1a1a1a] rounded-lg p-1">
            {DATE_FILTERS.map(f => (
              <button
                key={f.value}
                onClick={() => setActiveFilter(f)}
                className={`px-4 py-1.5 rounded-md text-xs font-medium transition-all ${
                  activeFilter.value === f.value
                    ? 'bg-[#00D4D4] text-black shadow-[0_0_10px_rgba(0,212,212,0.4)]'
                    : 'text-gray-400 hover:text-white hover:bg-[#252525]'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
          <button
            onClick={fetchData}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs bg-[#1a1a1a] border border-[#222] text-gray-400 hover:text-white hover:border-[#444] transition-all active:scale-95"
          >
            <span className={`material-symbols-outlined text-[16px] ${loading ? 'animate-spin' : ''}`}>refresh</span>
            새로고침
          </button>
        </div>
      </header>

      <div className="flex h-[calc(100vh-57px)]">
        {/* Sidebar */}
        <aside className="w-64 border-r border-[#222] flex flex-col bg-[#0f0f0f]">
          <div className="p-5 border-b border-[#222]">
            <h2 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-3">페이지 필터</h2>
            <div className="space-y-1 max-h-[300px] overflow-y-auto custom-scrollbar pr-1">
              {pages.length === 0 ? (
                <div className="py-8 text-center text-gray-600">
                  <span className="material-symbols-outlined text-[24px] mb-1 opacity-20">cloud_off</span>
                  <p className="text-[10px]">수집된 페이지 없음</p>
                </div>
              ) : (
                pages.map(p => (
                  <button
                    key={p}
                    onClick={() => setSelectedPage(p)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-xs truncate transition-all border ${
                      selectedPage === p
                        ? 'bg-[#00D4D4]/10 text-[#00D4D4] border-[#00D4D4]/30 font-semibold'
                        : 'text-gray-400 hover:bg-[#1a1a1a] border-transparent'
                    }`}
                  >
                    {p === '/' ? 'Home (/) ' : p}
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="p-5 flex-1 overflow-y-auto space-y-4">
            <h2 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mb-1">실시간 요약</h2>
            <div className="space-y-2">
              <StatSidebarItem label="전체 이벤트" value={events.length.toLocaleString()} icon="hub" />
              <StatSidebarItem label="Rage Clicks" value={String(rageEvents.length)} icon="warning" color="#F87171" />
              <StatSidebarItem label="Dead Clicks" value={String(deadEvents.length)} icon="block" color="#FB923C" />
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex flex-col overflow-hidden bg-[#0d0d0d]">
          {/* Tabs */}
          <div className="px-8 pt-6 pb-4 flex items-center justify-between border-b border-[#222]/50">
            <div className="flex gap-1 bg-[#1a1a1a] border border-[#222] rounded-xl p-1 shadow-inner">
              {[
                { id: 'summary', label: '대시보드 요약', icon: 'dashboard' },
                { id: 'heatmap', label: '클릭 히트맵', icon: 'touch_app' },
                { id: 'scroll', label: '스크롤 맵', icon: 'swap_vert' },
                { id: 'rage', label: 'Rage Click', icon: 'warning' },
                { id: 'dead', label: 'Dead Click', icon: 'block' },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id as any)}
                  className={`flex items-center gap-2 px-5 py-2 rounded-lg text-xs font-semibold transition-all ${
                    activeTab === tab.id
                      ? 'bg-[#2a2a2a] text-[#00D4D4] shadow-md border border-[#333]'
                      : 'text-gray-500 hover:text-gray-300'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
                  {tab.label}
                </button>
              ))}
            </div>

            {activeTab === 'heatmap' && (
              <div className="flex items-center gap-4 px-4 py-2 bg-[#1a1a1a] rounded-lg border border-[#222]">
                <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">히트맵 농도</span>
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={heatmapOpacity}
                  onChange={e => setHeatmapOpacity(Number(e.target.value))}
                  className="w-32 h-1 accent-[#00D4D4] cursor-pointer"
                />
                <span className="text-[11px] font-mono text-[#00D4D4] w-8">{heatmapOpacity}%</span>
              </div>
            )}
          </div>

          <div className="flex-1 overflow-y-auto custom-scrollbar p-8">
            {/* KPI Summary Cards (Visible on Summary Tab) */}
            {activeTab === 'summary' && (
              <div className="space-y-8 animate-fade-in">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  <KPICard
                    title="오늘 방문자 수"
                    value={stats?.today_visitors.toLocaleString() || '0'}
                    change={stats?.visitor_change_pct}
                    icon="group"
                    color="#00D4D4"
                  />
                  <KPICard
                    title="평균 체류시간"
                    value={formatDuration(stats?.avg_duration || 0)}
                    subtitle="세션당 평균"
                    icon="timer"
                    color="#3B82F6"
                  />
                  <KPICard
                    title="이탈률"
                    value={`${stats?.bounce_rate || 0}%`}
                    subtitle="단일 페이지 방문"
                    icon="exit_to_app"
                    color="#F87171"
                  />
                  <KPICard
                    title="가장 많이 본 페이지"
                    value={stats?.top_page === '/' ? 'Home' : stats?.top_page || '/'}
                    subtitle="조회수 기준 TOP"
                    icon="trending_up"
                    color="#10B981"
                  />
                </div>

                {/* Charts Grid */}
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  {/* Visitor Trend Area Chart */}
                  <ChartCard title="일별 방문자 추이 (최근 30일)" icon="show_chart">
                    <ResponsiveContainer width="100%" height={300}>
                      <AreaChart data={charts?.visitorsTrend || []} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#00D4D4" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#00D4D4" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                        <XAxis
                          dataKey="name"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: '#666', fontSize: 10 }}
                          minTickGap={30}
                        />
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

                  {/* Hourly Distribution Bar Chart */}
                  <ChartCard title="시간대별 방문 분포" icon="schedule">
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={charts?.hourly || []} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#222" vertical={false} />
                        <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#666', fontSize: 9 }} />
                        <YAxis axisLine={false} tickLine={false} tick={{ fill: '#666', fontSize: 10 }} />
                        <RechartsTooltip content={<CustomTooltip />} />
                        <Bar dataKey="value" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  {/* Referral Pie Chart */}
                  <ChartCard title="유입 경로 비율" icon="source" className="h-full">
                    <div className="flex flex-col md:flex-row items-center h-full">
                      <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                          <Pie
                            data={charts?.referralSources || []}
                            innerRadius={60}
                            outerRadius={80}
                            paddingAngle={5}
                            dataKey="value"
                            nameKey="name"
                          >
                            {(charts?.referralSources || []).map((entry: any, index: number) => (
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
                    </div>
                  </ChartCard>

                  {/* Device Donut Chart */}
                  <ChartCard title="디바이스별 분류" icon="devices">
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie
                          data={charts?.deviceDist || []}
                          cx="50%"
                          cy="50%"
                          innerRadius={60}
                          outerRadius={80}
                          fill="#8884d8"
                          paddingAngle={8}
                          dataKey="value"
                        >
                          {charts?.deviceDist?.map((entry: any, index: number) => (
                            <Cell key={`cell-${index}`} fill={entry.name === 'desktop' ? '#3B82F6' : entry.name === 'mobile' ? '#00D4D4' : '#8B5CF6'} />
                          ))}
                        </Pie>
                        <RechartsTooltip content={<CustomTooltip />} />
                        <Legend verticalAlign="bottom" wrapperStyle={{ paddingTop: '20px', fontSize: '11px' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </ChartCard>

                  {/* Top Pages Horizontal Bar Chart */}
                  <ChartCard title="페이지별 평균 체류시간 TOP 5" icon="timer" className="xl:col-span-2">
                    <ResponsiveContainer width="100%" height={250}>
                      <BarChart
                        layout="vertical"
                        data={charts?.topDurations || []}
                        margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="#222" horizontal={false} />
                        <XAxis type="number" hide />
                        <YAxis
                          type="category"
                          dataKey="name"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fill: '#aaa', fontSize: 11 }}
                          width={140}
                        />
                        <RechartsTooltip content={<CustomTooltip unit="초" />} />
                        <Bar dataKey="value" fill="#10B981" radius={[0, 4, 4, 0]} barSize={20} />
                      </BarChart>
                    </ResponsiveContainer>
                  </ChartCard>
                </div>
              </div>
            )}

            {/* Heatmap Tab */}
            {activeTab === 'heatmap' && (
              <div className="space-y-4">
                <div
                  className="relative bg-[#111] rounded-2xl border border-[#222] overflow-hidden shadow-2xl mx-auto"
                  style={{ width: '100%', maxWidth: PREVIEW_WIDTH, aspectRatio: `${PREVIEW_WIDTH}/${PREVIEW_HEIGHT}` }}
                >
                  {selectedPage && (
                    <iframe
                      ref={iframeRef}
                      src={iframeUrl}
                      className="absolute inset-0 w-full h-full border-0 pointer-events-none opacity-90"
                      onLoad={() => setIframeLoaded(true)}
                      sandbox="allow-same-origin allow-scripts allow-popups allow-forms"
                      title="Page Preview"
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
                  {!iframeLoaded && selectedPage && (
                    <div className="absolute inset-0 flex items-center justify-center bg-[#111]">
                      <div className="text-center">
                        <span className="material-symbols-outlined text-[40px] text-[#00D4D4] animate-spin mb-3">refresh</span>
                        <p className="text-sm text-gray-500 font-medium">실시간 페이지 뷰 렌더링 중...</p>
                      </div>
                    </div>
                  )}
                  {clickEvents.length === 0 && iframeLoaded && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="bg-black/80 backdrop-blur-md rounded-2xl px-8 py-5 text-center border border-[#333]">
                        <span className="material-symbols-outlined text-[32px] text-gray-500 mb-2">touch_app</span>
                        <p className="text-sm text-gray-400 font-medium">수집된 클릭 데이터가 없습니다</p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between px-2">
                  <div className="flex items-center gap-6">
                    <LegendItem color="rgb(0,0,200)" label="낮음" />
                    <LegendItem color="rgb(0,200,0)" label="보통" />
                    <LegendItem color="rgb(255,255,0)" label="높음" />
                    <LegendItem color="rgb(255,0,0)" label="매우 높음" />
                  </div>
                  <p className="text-xs text-gray-600 italic flex items-center gap-1">
                    <span className="material-symbols-outlined text-[14px]">info</span>
                    실제 화면 위에 사용자의 실시간 클릭 지점이 합성되어 표시됩니다
                  </p>
                </div>
              </div>
            )}

            {/* Scroll/Rage/Dead tabs - previous logic wrapped in new containers ... */}
            {(activeTab === 'scroll' || activeTab === 'rage' || activeTab === 'dead') && (
              <div className="max-w-6xl mx-auto space-y-6">
                <div className="bg-[#1a1a1a] border border-[#222] rounded-2xl p-6 shadow-lg">
                  <h3 className="text-lg font-bold flex items-center gap-2 mb-6">
                    <span className="material-symbols-outlined text-[#00D4D4]">
                      {activeTab === 'scroll' ? 'swap_vert' : activeTab === 'rage' ? 'warning' : 'block'}
                    </span>
                    {activeTab === 'scroll' ? '스크롤 도달 범위' : activeTab === 'rage' ? '분노 클릭 (Rage Click)' : '무반응 클릭 (Dead Click)'}
                  </h3>
                  
                  {activeTab === 'scroll' && (
                    <div className="space-y-6">
                      {scrollDepthData.map(d => (
                        <div key={d.depth} className="bg-[#0d0d0d] border border-[#222] rounded-xl p-5 hover:border-[#333] transition-colors">
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-sm font-bold text-gray-300">{d.depth}% 도달</span>
                            <span className="text-xs font-mono text-[#00D4D4]">{d.count}회 방문 ({d.percentage}%)</span>
                          </div>
                          <div className="h-3 bg-[#1a1a1a] rounded-full overflow-hidden p-[2px]">
                            <div
                              className="h-full rounded-full transition-all duration-1000 ease-out"
                              style={{
                                width: `${d.percentage}%`,
                                background: `linear-gradient(90deg, #00D4D4, ${d.depth <= 50 ? '#3B82F6' : '#F87171'})`,
                                boxShadow: '0 0 10px rgba(0,212,212,0.3)'
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {activeTab === 'rage' && (
                    <div className="space-y-3">
                      {rageClickList.length === 0 ? (
                        <EmptyState icon="sentiment_satisfied" text="사용자가 분노한 순간이 아직 없습니다!" />
                      ) : (
                        rageClickList.map((r, i) => <IssueItem key={i} entry={r} type="rage" />)
                      )}
                    </div>
                  )}

                  {activeTab === 'dead' && (
                    <div className="space-y-3">
                      {deadClickList.length === 0 ? (
                        <EmptyState icon="check_circle" text="모든 클릭이 정상적으로 반응하고 있습니다." />
                      ) : (
                        deadClickList.map((d, i) => <IssueItem key={i} entry={d} type="dead" />)
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

// Sub-components
function KPICard({ title, value, change, icon, color, subtitle }: any) {
  const isPositive = change > 0;
  return (
    <div className="bg-[#1a1a1a] border border-[#222] rounded-2xl p-6 shadow-lg hover:border-[#333] transition-all group">
      <div className="flex items-start justify-between mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-[#0d0d0d] border border-[#222] text-gray-400 group-hover:text-white transition-colors" style={{ color: color }}>
          <span className="material-symbols-outlined">{icon}</span>
        </div>
        {change !== undefined && (
          <div className={`flex items-center gap-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full ${isPositive ? 'text-green-400 bg-green-400/10' : 'text-red-400 bg-red-400/10'}`}>
            <span className="material-symbols-outlined text-[14px]">{isPositive ? 'arrow_upward' : 'arrow_downward'}</span>
            {Math.abs(change)}%
          </div>
        )}
      </div>
      <p className="text-xs text-gray-500 font-semibold mb-1 uppercase tracking-wider">{title}</p>
      <p className="text-2xl font-bold text-white mb-1">{value}</p>
      {subtitle && <p className="text-[10px] text-gray-600">{subtitle}</p>}
    </div>
  );
}

function ChartCard({ title, icon, children, className }: any) {
  return (
    <div className={`bg-[#1a1a1a] border border-[#222] rounded-2xl p-6 shadow-lg ${className}`}>
      <div className="flex items-center gap-2 mb-6">
        <span className="material-symbols-outlined text-[20px] text-gray-500">{icon}</span>
        <h3 className="text-sm font-bold text-gray-300">{title}</h3>
      </div>
      <div className="w-full">
        {children}
      </div>
    </div>
  );
}

function CustomTooltip({ active, payload, label, unit = '' }: any) {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#1a1a1a] border border-[#333] rounded-lg p-3 shadow-xl backdrop-blur-md">
        <p className="text-[10px] text-gray-500 font-bold mb-1 uppercase">{label}</p>
        <p className="text-sm font-bold text-[#00D4D4]">
          {payload[0].value.toLocaleString()}{unit}
        </p>
      </div>
    );
  }
  return null;
}

function StatSidebarItem({ label, value, icon, color }: any) {
  return (
    <div className="bg-[#1a1a1a]/50 rounded-xl p-3 border border-[#222]/50 flex items-center gap-3">
      <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#0d0d0d] text-gray-500" style={{ color }}>
        <span className="material-symbols-outlined text-[18px]">{icon}</span>
      </div>
      <div>
        <p className="text-[9px] text-gray-600 font-bold uppercase">{label}</p>
        <p className="text-sm font-bold text-white leading-none">{value}</p>
      </div>
    </div>
  );
}

function IssueItem({ entry, type }: any) {
  const isRage = type === 'rage';
  return (
    <div className="bg-[#0d0d0d] border border-[#222] rounded-xl p-4 flex items-center gap-4 hover:border-[#333] transition-all">
      <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${isRage ? 'bg-red-400/10 text-red-400' : 'bg-orange-400/10 text-orange-400'}`}>
        <span className="material-symbols-outlined">{isRage ? 'warning' : 'block'}</span>
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-bold text-white truncate">{isRage ? entry.element_info : entry.info}</p>
        <p className="text-[10px] text-gray-500 mt-1">좌표: ({entry.x_pos || entry.x}, {entry.y_pos || entry.y})</p>
      </div>
      <div className="text-right">
        <p className={`text-sm font-black ${isRage ? 'text-red-400' : 'text-orange-400'}`}>{entry.count}회</p>
        {entry.last_occurred && <p className="text-[9px] text-gray-600 mt-0.5">{new Date(entry.last_occurred).toLocaleTimeString()}</p>}
      </div>
    </div>
  );
}

function LegendItem({ color, label }: any) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-3 h-3 rounded-full shadow-inner shadow-black/50" style={{ backgroundColor: color }} />
      <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">{label}</span>
    </div>
  );
}

function EmptyState({ icon, text }: any) {
  return (
    <div className="py-12 text-center">
      <span className="material-symbols-outlined text-[48px] text-gray-700 mb-3 opacity-20">{icon}</span>
      <p className="text-sm text-gray-600 font-medium">{text}</p>
    </div>
  );
}
