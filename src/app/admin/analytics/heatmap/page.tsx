'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import type { AnalyticsEvent } from '@/lib/analytics/types';
import { DATE_FILTERS } from '@/lib/analytics/types';
import { ALL_TRACKABLE_PAGES, HEATMAP_RADIUS, HEATMAP_MAX_ALPHA, PREVIEW_WIDTH, PREVIEW_HEIGHT } from '@/lib/analytics/constants';
import {
  ChartCard, CustomTooltip, EmptyState, LoadingSpinner,
} from '@/components/analytics/shared';
import {
  ResponsiveContainer, BarChart, Bar, Cell,
  CartesianGrid, XAxis, YAxis,
  Tooltip as RechartsTooltip,
} from 'recharts';

type HeatSubTab = 'click' | 'scroll' | 'rage' | 'dead';

const HEAT_SUBTABS: { id: HeatSubTab; label: string; icon: string; color: string }[] = [
  { id: 'click', label: '클릭 히트맵', icon: 'touch_app', color: '#00D4D4' },
  { id: 'scroll', label: '스크롤 맵', icon: 'swap_vert', color: '#3B82F6' },
  { id: 'rage', label: 'Rage Click', icon: 'sentiment_very_dissatisfied', color: '#EF4444' },
  { id: 'dead', label: 'Dead Click', icon: 'block', color: '#F59E0B' },
];

type DeviceFilter = 'all' | 'desktop' | 'mobile' | 'tablet' | '4k';
type VisualizationMode = 'heatmap' | 'markers';

export default function HeatmapPage() {
  const [days, setDays] = useState(30);
  const [pages, setPages] = useState<string[]>([]);
  const [selectedPage, setSelectedPage] = useState('');
  const [clickEvents, setClickEvents] = useState<AnalyticsEvent[]>([]);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [heatmapOpacity, setHeatmapOpacity] = useState(60);
  const [initialLoading, setInitialLoading] = useState(true);

  const [subTab, setSubTab] = useState<HeatSubTab>('click');
  const [scrollData, setScrollData] = useState<{ depth: number; count: number; percentage: number }[]>([]);
  const [rageClicks, setRageClicks] = useState<{ x_pos: number; y_pos: number; element_info: string; page_url: string; count: number; last_occurred: string }[]>([]);
  const [deadClicks, setDeadClicks] = useState<AnalyticsEvent[]>([]);
  const [subLoading, setSubLoading] = useState(false);
  const [deviceFilter, setDeviceFilter] = useState<DeviceFilter>('all');
  const [vizMode, setVizMode] = useState<VisualizationMode>('heatmap');
  const [tooltip, setTooltip] = useState<{ x: number; y: number; tag: string; text: string; count: number } | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [bgReady, setBgReady] = useState(false);
  const [bgSrc, setBgSrc] = useState('');

  // Fetch pages
  const fetchPages = useCallback(async () => {
    try {
      const res = await fetch(`/api/analytics/query?action=pages&days=${days}`);
      if (!res.ok) { console.error('Failed to fetch pages:', res.status); return; }
      const data = await res.json();
      const analyticsPages: string[] = (data.pages || []).filter((p: string) => !p.startsWith('/admin'));
      const staticPaths = ALL_TRACKABLE_PAGES.map(p => p.path);
      const merged = [...staticPaths];
      analyticsPages.forEach((p: string) => { if (!merged.includes(p)) merged.push(p); });
      setPages(merged);
      if (!selectedPage && merged.length > 0) setSelectedPage(merged[0]);
    } catch {
      const staticPaths = ALL_TRACKABLE_PAGES.map(p => p.path);
      setPages(staticPaths);
      if (!selectedPage && staticPaths.length > 0) setSelectedPage(staticPaths[0]);
    }
  }, [days, selectedPage]);

  // Fetch click events for selected page
  const fetchEvents = useCallback(async () => {
    if (!selectedPage) return;
    try {
      const params = new URLSearchParams({ page_url: selectedPage, days: String(days), limit: '10000', event_type: 'click' });
      const res = await fetch(`/api/analytics/query?${params}`);
      if (!res.ok) { console.error('Failed to fetch click events:', res.status); setClickEvents([]); return; }
      const data = await res.json();
      const allEvents: AnalyticsEvent[] = data.events || [];
      setClickEvents(allEvents.filter(e => e.event_type === 'click' && e.x_pos != null && e.y_pos != null));
    } catch (err) {
      console.error('Failed to fetch click events:', err);
      setClickEvents([]);
    }
  }, [selectedPage, days]);

  // Initial load
  useEffect(() => {
    const load = async () => {
      setInitialLoading(true);
      await fetchPages();
      setInitialLoading(false);
    };
    load();
  }, [fetchPages]);

  // Fetch events when selectedPage changes
  useEffect(() => {
    if (selectedPage) fetchEvents();
  }, [selectedPage, fetchEvents]);

  // 페이지 변경 시 정적 스크린샷 파일 로드
  useEffect(() => {
    setBgReady(false);
    setBgSrc('');
    if (!selectedPage) return;
    // pageUrl → 파일명 변환: /landing → landing.png, / → home.png
    const clean = selectedPage.replace(/^\//, '') || 'home';
    const filename = clean.replace(/[/\\?#:*"<>|]/g, '_') + '.png';
    setBgSrc(`/screenshots/${filename}`);
  }, [selectedPage]);

  // Sub-tab data loading
  useEffect(() => {
    if (subTab === 'click') return;
    const load = async () => {
      setSubLoading(true);
      try {
        const pageParam = selectedPage ? `&page_url=${encodeURIComponent(selectedPage)}` : '';
        if (subTab === 'scroll') {
          const res = await fetch(`/api/analytics/query?action=scroll-depth&days=${days}${pageParam}`);
          if (!res.ok) { console.error('Failed to fetch scroll data:', res.status); return; }
          const json = await res.json();
          setScrollData(json.scrollDepth || []);
        } else if (subTab === 'rage') {
          const res = await fetch(`/api/analytics/query?action=rage-clicks&days=${days}${pageParam}`);
          if (!res.ok) { console.error('Failed to fetch rage clicks:', res.status); return; }
          const json = await res.json();
          setRageClicks(json.rageClicks || []);
        } else if (subTab === 'dead') {
          const res = await fetch(`/api/analytics/query?action=dead-clicks&days=${days}${pageParam}`);
          if (!res.ok) { console.error('Failed to fetch dead clicks:', res.status); return; }
          const json = await res.json();
          setDeadClicks(json.deadClicks || []);
        }
      } catch (err) { console.error('Failed to fetch sub-tab data:', err); }
      finally { setSubLoading(false); }
    };
    load();
  }, [subTab, selectedPage, days]);

  const avgScrollDepth = scrollData.length > 0
    ? scrollData.find(d => d.depth === 50)?.percentage ?? 0
    : 0;

  // Device filter
  const filteredClickEvents = deviceFilter === 'all'
    ? clickEvents
    : clickEvents.filter(c => {
        const vw = c.viewport_width || 1920;
        if (deviceFilter === 'mobile') return vw < 768;
        if (deviceFilter === 'tablet') return vw >= 768 && vw < 1024;
        if (deviceFilter === '4k') return vw >= 3840;
        return vw >= 1024 && vw < 3840; // desktop
      });

  const hasBackground = !!selectedPage && bgReady;

  // Canvas rendering
  useEffect(() => {
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

    const maxAlpha = hasBackground ? 1.0 : HEATMAP_MAX_ALPHA;

    const rafId = requestAnimationFrame(() => {
      const w = canvas.width, h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      if (vizMode === 'markers') {
        ctx.globalAlpha = hasBackground ? 0.9 : 0.55;
        filtered.forEach(c => {
          const ix = Math.round(((c.x_pos || 0) / (c.viewport_width || 1920)) * w);
          const iy = Math.round(((c.y_pos || 0) / (c.viewport_height || 1080)) * h);
          ctx.beginPath();
          ctx.arc(ix, iy, hasBackground ? 8 : 6, 0, Math.PI * 2);
          ctx.fillStyle = hasBackground ? 'rgba(0,212,212,0.85)' : '#00D4D4';
          ctx.fill();
          ctx.beginPath();
          ctx.arc(ix, iy, hasBackground ? 14 : 10, 0, Math.PI * 2);
          ctx.strokeStyle = hasBackground ? 'rgba(0,212,212,0.45)' : 'rgba(0,212,212,0.3)';
          ctx.lineWidth = hasBackground ? 2 : 1;
          ctx.stroke();
        });
        ctx.globalAlpha = 1;
      } else {
        const grid = new Float32Array(w * h);
        let maxVal = 0;
        filtered.forEach(c => {
          const ix = Math.round(((c.x_pos || 0) / (c.viewport_width || 1920)) * w);
          const iy = Math.round(((c.y_pos || 0) / (c.viewport_height || 1080)) * h);
          const radius = hasBackground ? HEATMAP_RADIUS * 1.3 : HEATMAP_RADIUS;
          for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
              const px = ix + Math.round(dx), py = iy + Math.round(dy);
              if (px < 0 || px >= w || py < 0 || py >= h) continue;
              const dist = Math.sqrt(dx * dx + dy * dy);
              if (dist > radius) continue;
              const val = 1 - dist / radius;
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
          d[pi + 3] = Math.round(Math.min(v * maxAlpha * 255, maxAlpha * 255));
        }
        ctx.putImageData(imageData, 0, 0);
      }
    });
    return () => cancelAnimationFrame(rafId);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredClickEvents.length, heatmapOpacity, selectedPage, deviceFilter, vizMode, hasBackground]);

  if (initialLoading) return (
    <div className="min-h-screen bg-[#0d0d14] text-white">
      <Header days={days} setDays={setDays} />
      <main className="p-6 max-w-[1400px] mx-auto"><LoadingSpinner /></main>
    </div>
  );

  return (
    <div className="min-h-screen bg-[#0d0d14] text-white">
      <Header days={days} setDays={setDays} />

      <main className="p-6 max-w-[1400px] mx-auto">
        <div className="space-y-4">
          {/* Page selector */}
          <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-4">
            <label className="block text-[11px] text-gray-500 mb-2 uppercase tracking-wider font-medium">
              분석할 페이지 선택
            </label>
            <select
              value={selectedPage}
              onChange={e => setSelectedPage(e.target.value)}
              className="w-full bg-[#0d0d1a] border border-[#2a2a3e] rounded-lg px-4 py-2.5 text-sm text-white focus:outline-none focus:border-[#00D4D4] transition-colors"
            >
              <option value="">페이지를 선택하세요</option>
              {pages.map(p => {
                const meta = ALL_TRACKABLE_PAGES.find(tp => tp.path === p);
                return <option key={p} value={p}>{meta ? `${meta.label}  (${p})` : p}</option>;
              })}
            </select>
          </div>

          {/* Sub-tabs */}
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

          {/* Click Heatmap */}
          {subTab === 'click' && (
            <>
              {!selectedPage ? (
                <EmptyState icon="heat_map" message="위에서 페이지를 선택하면 히트맵이 표시됩니다." />
              ) : (
                <>
                  {/* Control bar */}
                  <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-4 space-y-3">
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
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      {/* Device filter */}
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
                      {/* Visualization mode */}
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

                  {/* Heatmap + overlay container */}
                  <div className="relative">
                    {selectedPage && (
                      <div className="mb-2 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-gray-500">분석 페이지:</span>
                          <a
                            href={selectedPage}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[11px] text-[#00D4D4] hover:underline font-mono"
                          >
                            {selectedPage}
                            <span className="material-symbols-outlined text-[12px]">open_in_new</span>
                          </a>
                        </div>
                        <span className={`text-[11px] flex items-center gap-1 ${bgReady ? 'text-emerald-400' : 'text-yellow-400'}`}>
                          <span className="material-symbols-outlined text-[13px]">
                            {bgReady ? 'check_circle' : 'autorenew'}
                          </span>
                          {bgReady ? '실제 페이지 배경' : '로딩 중...'}
                        </span>
                      </div>
                    )}
                    <div
                      className="relative border border-[#1e1e2e] rounded-xl overflow-hidden"
                      style={{
                        aspectRatio: `${PREVIEW_WIDTH}/${PREVIEW_HEIGHT}`,
                        background: 'linear-gradient(135deg, #0d0d1a 0%, #111122 40%, #0a0a14 100%)',
                      }}
                    >
                      {selectedPage && bgSrc && (
                        <img
                          src={bgSrc}
                          alt="페이지 배경"
                          className="absolute inset-0 w-full h-full object-cover border-0"
                          style={{ opacity: bgReady ? 0.7 : 0, pointerEvents: 'none', transition: 'opacity 0.3s' }}
                          onLoad={() => setBgReady(true)}
                          onError={() => setBgReady(false)}
                        />
                      )}
                      {selectedPage && !bgReady && (
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                          <div className="flex items-center gap-2 text-gray-500 text-xs">
                            <span className="material-symbols-outlined text-[16px] animate-spin">autorenew</span>
                            페이지 미리보기 로딩 중...
                          </div>
                        </div>
                      )}
                      {hasBackground && (
                        <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.25)', pointerEvents: 'none' }} />
                      )}
                      {!hasBackground && (
                        <div
                          className="absolute inset-0 opacity-10"
                          style={{
                            backgroundImage: 'linear-gradient(rgba(0,212,212,0.15) 1px, transparent 1px), linear-gradient(90deg, rgba(0,212,212,0.15) 1px, transparent 1px)',
                            backgroundSize: '40px 40px',
                          }}
                        />
                      )}
                      <canvas
                        ref={canvasRef} width={PREVIEW_WIDTH} height={PREVIEW_HEIGHT}
                        className="absolute inset-0 w-full h-full"
                        style={{
                          opacity: hasBackground
                            ? Math.min((heatmapOpacity / 100) * 1.4, 1)
                            : heatmapOpacity / 100,
                          mixBlendMode: vizMode === 'heatmap'
                            ? (hasBackground ? 'normal' : 'screen')
                            : 'normal',
                          pointerEvents: 'none',
                          filter: hasBackground ? 'saturate(1.4) contrast(1.1)' : 'none',
                        }}
                      />
                      {/* Tooltip interaction overlay */}
                      <div
                        ref={overlayRef}
                        className="absolute inset-0 w-full h-full"
                        style={{ cursor: 'crosshair' }}
                        onMouseMove={e => {
                          const rect = overlayRef.current?.getBoundingClientRect();
                          if (!rect) return;
                          const mx = (e.clientX - rect.left) / rect.width;
                          const my = (e.clientY - rect.top) / rect.height;
                          const TOOLTIP_RADIUS = 0.04;
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
                      {/* Tooltip rendering */}
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
                      {filteredClickEvents.length === 0 && (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 pointer-events-none">
                          <span className="material-symbols-outlined text-[48px] text-gray-700">touch_app</span>
                          <p className="text-gray-500 text-sm">이 페이지에 클릭 데이터가 없습니다.</p>
                          <p className="text-gray-600 text-xs">실제 사용자가 방문하면 히트맵이 자동으로 표시됩니다.</p>
                        </div>
                      )}

                      {/* Color legend */}
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

          {/* Scroll Map */}
          {subTab === 'scroll' && (
            subLoading ? <LoadingSpinner /> : (
              <div className="space-y-4">
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
                          {scrollData.map((_, i) => {
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

          {/* Rage Click */}
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

          {/* Dead Click */}
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
        <span className="material-symbols-outlined text-[#00D4D4] text-[24px]">heat_map</span>
        <h1 className="text-lg font-semibold">히트맵</h1>
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
