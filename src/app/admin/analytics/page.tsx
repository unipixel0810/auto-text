'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { AnalyticsEvent, DateFilter, RageClickEntry, ScrollDepthData } from '@/lib/analytics/types';
import { DATE_FILTERS } from '@/lib/analytics/types';

const HEATMAP_RADIUS = 20;
const HEATMAP_MAX_ALPHA = 0.85;

export default function AnalyticsDashboard() {
  const [activeFilter, setActiveFilter] = useState<DateFilter>(DATE_FILTERS[1]);
  const [pages, setPages] = useState<string[]>([]);
  const [selectedPage, setSelectedPage] = useState<string>('');
  const [events, setEvents] = useState<AnalyticsEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'heatmap' | 'scroll' | 'rage' | 'dead'>('heatmap');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const selectedPageRef = useRef(selectedPage);
  selectedPageRef.current = selectedPage;

  const fetchPages = useCallback(async () => {
    try {
      const res = await fetch(`/api/analytics/query?action=pages&days=${activeFilter.days}`);
      const data = await res.json();
      const pageList: string[] = data.pages || [];
      setPages(pageList);
      if (pageList.length > 0 && !selectedPageRef.current) {
        setSelectedPage(pageList[0]);
      }
    } catch (err) {
      console.error('Failed to fetch pages:', err);
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
    const timer = setTimeout(fetchPages, 500);
    return () => clearTimeout(timer);
  }, [fetchPages]);
  useEffect(() => { fetchEvents(); }, [fetchEvents]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchPages();
      fetchEvents();
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchPages, fetchEvents]);

  const clickEvents = events.filter(e => e.event_type === 'click' && e.x_pos != null && e.y_pos != null);
  const scrollEvents = events.filter(e => e.event_type === 'scroll');
  const rageEvents = events.filter(e => e.event_type === 'rage_click');
  const deadEvents = events.filter(e => e.event_type === 'dead_click');
  const pageViews = events.filter(e => e.event_type === 'page_view');
  const pageLeaves = events.filter(e => e.event_type === 'page_leave');

  const avgDwell = pageLeaves.length > 0
    ? Math.round(pageLeaves.reduce((s, e) => s + (e.time_on_page || 0), 0) / pageLeaves.length)
    : 0;

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

  useEffect(() => {
    if (activeTab !== 'heatmap' || !canvasRef.current) return;
    drawHeatmap(canvasRef.current, clickEvents);
  }, [activeTab, clickEvents.length, events]);

  function drawHeatmap(canvas: HTMLCanvasElement, clicks: AnalyticsEvent[]) {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, w, h);

    if (clicks.length === 0) {
      ctx.fillStyle = '#666';
      ctx.font = '14px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('클릭 데이터가 없습니다', w / 2, h / 2);
      return;
    }

    const maxVW = Math.max(...clicks.map(c => c.viewport_width || 1920));
    const maxVH = Math.max(...clicks.map(c => c.viewport_height || 1080));

    const grid = new Float32Array(w * h);
    let maxVal = 0;

    clicks.forEach(c => {
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

    const imageData = ctx.getImageData(0, 0, w, h);
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

      const alpha = Math.min(v * HEATMAP_MAX_ALPHA, HEATMAP_MAX_ALPHA);
      data[pi] = Math.round(r * alpha + data[pi] * (1 - alpha));
      data[pi + 1] = Math.round(g * alpha + data[pi + 1] * (1 - alpha));
      data[pi + 2] = Math.round(b * alpha + data[pi + 2] * (1 - alpha));
      data[pi + 3] = 255;
    }

    ctx.putImageData(imageData, 0, 0);
  }

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white">
      <header className="border-b border-[#222] px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <a href="/" className="text-gray-400 hover:text-white transition-colors">
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </a>
          <span className="material-symbols-outlined text-[#00D4D4] text-[24px]">analytics</span>
          <h1 className="text-lg font-semibold">사용자 행동 분석</h1>
          <span className="text-xs text-gray-500 ml-2">Analytics Dashboard</span>
        </div>
        <div className="flex items-center gap-2">
          {DATE_FILTERS.map(f => (
            <button
              key={f.value}
              onClick={() => setActiveFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeFilter.value === f.value
                  ? 'bg-[#00D4D4] text-black'
                  : 'bg-[#1a1a1a] text-gray-400 hover:bg-[#252525] hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </header>

      <div className="flex h-[calc(100vh-65px)]">
        {/* Sidebar */}
        <aside className="w-56 border-r border-[#222] p-4 overflow-y-auto">
          <h2 className="text-xs font-semibold text-gray-500 uppercase mb-3">페이지 목록</h2>
          {pages.length === 0 ? (
            <p className="text-xs text-gray-600">데이터 수집 중...</p>
          ) : (
            <div className="space-y-1">
              {pages.map(p => (
                <button
                  key={p}
                  onClick={() => setSelectedPage(p)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-xs truncate transition-all ${
                    selectedPage === p
                      ? 'bg-[#00D4D4]/10 text-[#00D4D4] border border-[#00D4D4]/30'
                      : 'text-gray-400 hover:bg-[#1a1a1a] hover:text-white'
                  }`}
                >
                  {p || '/'}
                </button>
              ))}
            </div>
          )}

          <div className="mt-6 space-y-3">
            <div className="bg-[#1a1a1a] rounded-lg p-3">
              <p className="text-[10px] text-gray-500 uppercase">총 이벤트</p>
              <p className="text-xl font-bold text-white">{events.length.toLocaleString()}</p>
            </div>
            <div className="bg-[#1a1a1a] rounded-lg p-3">
              <p className="text-[10px] text-gray-500 uppercase">페이지뷰</p>
              <p className="text-xl font-bold text-[#00D4D4]">{pageViews.length}</p>
            </div>
            <div className="bg-[#1a1a1a] rounded-lg p-3">
              <p className="text-[10px] text-gray-500 uppercase">평균 체류시간</p>
              <p className="text-xl font-bold text-white">{avgDwell}초</p>
            </div>
            <div className="bg-[#1a1a1a] rounded-lg p-3">
              <p className="text-[10px] text-gray-500 uppercase">Rage Clicks</p>
              <p className="text-xl font-bold text-red-400">{rageEvents.length}</p>
            </div>
            <div className="bg-[#1a1a1a] rounded-lg p-3">
              <p className="text-[10px] text-gray-500 uppercase">Dead Clicks</p>
              <p className="text-xl font-bold text-orange-400">{deadEvents.length}</p>
            </div>
          </div>
        </aside>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-6">
          {/* Tabs */}
          <div className="flex gap-1 mb-6 bg-[#1a1a1a] rounded-xl p-1 w-fit">
            {([
              { id: 'heatmap', label: '클릭 히트맵', icon: 'touch_app' },
              { id: 'scroll', label: '스크롤 맵', icon: 'swap_vert' },
              { id: 'rage', label: 'Rage Click', icon: 'warning' },
              { id: 'dead', label: 'Dead Click', icon: 'block' },
            ] as const).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                  activeTab === tab.id
                    ? 'bg-[#00D4D4] text-black'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          {loading && (
            <div className="flex items-center gap-2 mb-4 text-gray-400 text-sm">
              <span className="material-symbols-outlined animate-spin text-[16px]">refresh</span>
              데이터 로딩 중...
            </div>
          )}

          {/* Heatmap Tab */}
          {activeTab === 'heatmap' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold">
                  클릭 히트맵
                  <span className="text-gray-500 ml-2 font-normal">
                    {clickEvents.length}개 클릭
                  </span>
                </h3>
              </div>
              <div className="bg-[#111] rounded-xl border border-[#222] overflow-hidden">
                <canvas
                  ref={canvasRef}
                  width={960}
                  height={540}
                  className="w-full"
                  style={{ imageRendering: 'auto' }}
                />
              </div>
              <div className="flex items-center gap-4 mt-3 text-[10px] text-gray-500">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-sm" style={{ background: 'rgb(0,0,255)' }} />
                  낮음
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-sm" style={{ background: 'rgb(0,255,0)' }} />
                  보통
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-sm" style={{ background: 'rgb(255,255,0)' }} />
                  높음
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-sm" style={{ background: 'rgb(255,0,0)' }} />
                  매우 높음
                </div>
              </div>
            </div>
          )}

          {/* Scroll Depth Tab */}
          {activeTab === 'scroll' && (
            <div>
              <h3 className="text-sm font-semibold mb-4">
                스크롤 깊이 분포
                <span className="text-gray-500 ml-2 font-normal">
                  {scrollEvents.length}개 이벤트
                </span>
              </h3>
              <div className="space-y-4">
                {scrollDepthData.map(d => (
                  <div key={d.depth} className="bg-[#1a1a1a] rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">{d.depth}% 도달</span>
                      <span className="text-xs text-gray-400">{d.count}회 ({d.percentage}%)</span>
                    </div>
                    <div className="h-3 bg-[#111] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-700"
                        style={{
                          width: `${d.percentage}%`,
                          background: d.depth <= 25
                            ? '#00D4D4'
                            : d.depth <= 50
                              ? '#4ADE80'
                              : d.depth <= 75
                                ? '#FACC15'
                                : '#F87171',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-6 bg-[#1a1a1a] rounded-xl p-4">
                <h4 className="text-xs font-semibold text-gray-400 mb-3">스크롤 퍼널</h4>
                <div className="flex items-end gap-3 h-40">
                  {scrollDepthData.map(d => (
                    <div key={d.depth} className="flex-1 flex flex-col items-center gap-1">
                      <span className="text-[10px] text-gray-500">{d.percentage}%</span>
                      <div
                        className="w-full rounded-t-lg transition-all duration-700"
                        style={{
                          height: `${Math.max(d.percentage, 3)}%`,
                          background: `linear-gradient(to top, #00D4D4, ${
                            d.depth <= 50 ? '#00D4D480' : '#F8717180'
                          })`,
                        }}
                      />
                      <span className="text-[10px] text-gray-400">{d.depth}%</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Rage Click Tab */}
          {activeTab === 'rage' && (
            <div>
              <h3 className="text-sm font-semibold mb-4">
                Rage Click 발생 지점
                <span className="text-gray-500 ml-2 font-normal">
                  {rageClickList.length}개 지점
                </span>
              </h3>
              {rageClickList.length === 0 ? (
                <div className="bg-[#1a1a1a] rounded-xl p-8 text-center">
                  <span className="material-symbols-outlined text-[40px] text-gray-600 mb-2">sentiment_satisfied</span>
                  <p className="text-sm text-gray-500">Rage Click이 감지되지 않았습니다</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {rageClickList.map((r, i) => (
                    <div
                      key={i}
                      className="bg-[#1a1a1a] rounded-xl p-4 flex items-center gap-4 border border-[#222] hover:border-red-500/30 transition-colors"
                    >
                      <div className="w-10 h-10 rounded-lg bg-red-500/10 flex items-center justify-center flex-shrink-0">
                        <span className="material-symbols-outlined text-red-400 text-[20px]">warning</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate">
                          {r.element_info || '(알 수 없음)'}
                        </p>
                        <p className="text-[10px] text-gray-500 mt-0.5">
                          좌표: ({r.x_pos}, {r.y_pos})
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-red-400">{r.count}회</p>
                        <p className="text-[10px] text-gray-500">
                          {r.last_occurred ? new Date(r.last_occurred).toLocaleString('ko-KR') : ''}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Dead Click Tab */}
          {activeTab === 'dead' && (
            <div>
              <h3 className="text-sm font-semibold mb-4">
                Dead Click 발생 지점
                <span className="text-gray-500 ml-2 font-normal">
                  {deadClickList.length}개 요소
                </span>
              </h3>
              <p className="text-xs text-gray-500 mb-4">
                사용자가 클릭했지만 반응이 없었던 요소들입니다. 인터랙티브 요소로 변경하거나 시각적 피드백을 추가하세요.
              </p>
              {deadClickList.length === 0 ? (
                <div className="bg-[#1a1a1a] rounded-xl p-8 text-center">
                  <span className="material-symbols-outlined text-[40px] text-gray-600 mb-2">check_circle</span>
                  <p className="text-sm text-gray-500">Dead Click이 감지되지 않았습니다</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {deadClickList.map((d, i) => (
                    <div
                      key={i}
                      className="bg-[#1a1a1a] rounded-xl p-4 flex items-center gap-4 border border-[#222] hover:border-orange-500/30 transition-colors"
                    >
                      <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center flex-shrink-0">
                        <span className="material-symbols-outlined text-orange-400 text-[20px]">block</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-mono truncate">{d.info}</p>
                        <p className="text-[10px] text-gray-500 mt-0.5">
                          좌표: ({d.x}, {d.y})
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-orange-400">{d.count}회</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
