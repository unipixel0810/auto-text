'use client';

import React, { useState, useEffect, useCallback } from 'react';
import type { VisitorStats, DateFilter } from '@/lib/analytics/types';
import { DATE_FILTERS } from '@/lib/analytics/types';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, PieChart, Pie, Cell, BarChart, Bar, Legend,
} from 'recharts';
import {
  COLORS, formatDuration, formatNumber, KPICard, ChartCard, CustomTooltip,
  EmptyState, LoadingSpinner,
} from '@/components/analytics/shared';

export default function AnalyticsOverview() {
  const [mounted, setMounted] = useState(false);
  const [activeFilter, setActiveFilter] = useState<DateFilter>(DATE_FILTERS[1]);
  const [stats, setStats] = useState<VisitorStats | null>(null);
  const [charts, setCharts] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => { setMounted(true); }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [statsRes, chartsRes] = await Promise.all([
        fetch(`/api/analytics/query?action=stats&days=${activeFilter.days}`),
        fetch(`/api/analytics/query?action=charts&days=${activeFilter.days}`),
      ]);
      const [statsData, chartsData] = await Promise.all([statsRes.json(), chartsRes.json()]);
      if (statsData && typeof statsData === 'object') setStats(statsData);
      if (chartsData && typeof chartsData === 'object') setCharts(chartsData);
    } catch (err) {
      console.error('Failed to fetch overview data:', err);
    } finally {
      setLoading(false);
    }
  }, [activeFilter.days]);

  useEffect(() => {
    if (!mounted) return;
    const timeout = setTimeout(fetchData, 100);
    const interval = setInterval(fetchData, 30000);
    return () => { clearTimeout(timeout); clearInterval(interval); };
  }, [mounted, fetchData]);

  if (!mounted) return null;

  const topPages: { name: string; value: number }[] = charts?.topPages || [];
  const referrers: { name: string; value: number }[] = charts?.referralSources || [];
  const devices: { name: string; value: number }[] = charts?.devices || [];
  const daily: { name: string; value: number }[] = charts?.daily || [];
  const topDurations: { name: string; value: number }[] = charts?.topDurations || [];

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[#00D4D4] text-[22px]">dashboard</span>
          <h1 className="text-lg font-semibold">개요</h1>
        </div>
        <div className="flex items-center gap-2">
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
            onClick={fetchData}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-[#12121a] border border-[#1e1e2e] text-gray-400 hover:text-white hover:border-[#2a2a3e] transition-all"
          >
            <span className={`material-symbols-outlined text-[16px] ${loading ? 'animate-spin' : ''}`}>refresh</span>
          </button>
        </div>
      </div>

      {loading ? (
        <LoadingSpinner />
      ) : (
        <div className="space-y-6">
          {/* KPI row */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <KPICard title="방문자" value={formatNumber(stats?.today_visitors ?? 0)} change={stats?.visitor_change_pct} icon="people" color="#00D4D4" subtitle="전일 대비" />
            <KPICard title="평균 체류시간" value={stats?.avg_duration ? formatDuration(stats.avg_duration) : '0초'} icon="schedule" color="#3B82F6" />
            <KPICard title="이탈률" value={`${(stats?.bounce_rate ?? 0).toFixed(1)}%`} icon="exit_to_app" color="#EF4444" />
            <KPICard title="인기 페이지" value={stats?.top_page || '-'} icon="star" color="#F59E0B" />
          </div>

          {/* Daily trend */}
          {daily.length > 0 && (
            <ChartCard title="일별 방문자 추이" icon="trending_up">
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

          {/* Hourly + Duration */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
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

            <ChartCard title="페이지별 평균 체류시간 TOP 5" icon="timer">
              {topDurations.length > 0 ? (
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={topDurations} layout="vertical" margin={{ top: 0, right: 40, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" horizontal={false} />
                    <XAxis type="number" axisLine={false} tickLine={false} tick={{ fill: '#555', fontSize: 10 }} tickFormatter={(v: number) => `${v}초`} />
                    <YAxis type="category" dataKey="name" width={110} axisLine={false} tickLine={false} tick={{ fill: '#888', fontSize: 10 }} tickFormatter={(v: string) => v.length > 15 ? v.slice(0, 13) + '…' : v} />
                    <RechartsTooltip content={<CustomTooltip />} />
                    <Bar dataKey="value" name="평균 체류시간(초)" fill="#8B5CF6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <EmptyState icon="timer" message="체류시간 데이터 없음" />}
            </ChartCard>
          </div>
        </div>
      )}
    </div>
  );
}
