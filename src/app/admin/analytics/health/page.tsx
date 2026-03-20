'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { BarChart, Bar, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { KPICard, ChartCard, CustomTooltip, LoadingSpinner, EmptyState, formatNumber } from '@/components/analytics/shared';
import { DATE_FILTERS } from '@/lib/analytics/types';

const VITAL_THRESHOLDS: Record<string, { good: number; poor: number; unit: string }> = {
  lcp: { good: 2500, poor: 4000, unit: 'ms' },
  fcp: { good: 1800, poor: 3000, unit: 'ms' },
  cls: { good: 0.1, poor: 0.25, unit: '' },
  ttfb: { good: 800, poor: 1800, unit: 'ms' },
};

const vitalColor = (key: string, value: number) => {
  const t = VITAL_THRESHOLDS[key];
  if (!t) return '#6B7280';
  if (value <= t.good) return '#10B981';
  if (value <= t.poor) return '#F59E0B';
  return '#EF4444';
};

const vitalLabel = (key: string, value: number) => {
  const t = VITAL_THRESHOLDS[key];
  if (!t) return '';
  if (value <= t.good) return 'Good';
  if (value <= t.poor) return 'Needs Improvement';
  return 'Poor';
};

interface HealthData {
  activeUsers: number;
  errorRate: number;
  avgResponseTime: number;
  uptime: number;
  webVitals: { lcp: number; fcp: number; cls: number; ttfb: number };
  jsErrors: { message: string; count: number; lastSeen: string }[];
  errorTrend: { date: string; errors: number }[];
  apiLatency: { date: string; latency: number }[];
}

export default function HealthPage() {
  const [data, setData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateFilter, setDateFilter] = useState(DATE_FILTERS[1]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/analytics/query?action=health&days=${dateFilter.days}`);
      if (!res.ok) { console.error('Failed to fetch health data:', res.status); return; }
      const json = await res.json();
      setData(json);
    } catch (err) { console.error('Failed to fetch health data:', err); }
    setLoading(false);
  }, [dateFilter]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading || !data) return <div className="min-h-screen bg-[#0d0d14] p-6"><LoadingSpinner /></div>;

  const vitals = data.webVitals;

  return (
    <div className="min-h-screen bg-[#0d0d14] p-6 text-white">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black">Service Health</h1>
          <p className="text-sm text-gray-500 mt-1">서비스 상태 모니터링</p>
        </div>
        <div className="flex gap-1 bg-[#12121a] border border-[#1e1e2e] rounded-lg p-1">
          {DATE_FILTERS.map((f) => (
            <button key={f.value} onClick={() => setDateFilter(f)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${dateFilter.value === f.value ? 'bg-[#00D4D4] text-black' : 'text-gray-400 hover:text-white'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <KPICard title="Active Users" value={formatNumber(data.activeUsers)} icon="group" color="#00D4D4" />
        <KPICard title="Error Rate" value={`${data.errorRate.toFixed(2)}%`} icon="error" color="#EF4444" />
        <KPICard title="Avg Response Time" value={`${data.avgResponseTime}ms`} icon="speed" color="#F59E0B" />
        <KPICard title="Uptime" value={`${data.uptime.toFixed(2)}%`} icon="check_circle" color="#10B981" />
      </div>

      {/* Web Vitals */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {(['lcp', 'fcp', 'cls', 'ttfb'] as const).map((key) => {
          const val = vitals[key] ?? 0;
          const color = vitalColor(key, val);
          const label = vitalLabel(key, val);
          const unit = VITAL_THRESHOLDS[key].unit;
          return (
            <div key={key} className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-5">
              <p className="text-[11px] text-gray-500 font-medium uppercase tracking-wider mb-2">{key.toUpperCase()}</p>
              <p className="text-2xl font-black" style={{ color }}>{key === 'cls' ? val.toFixed(3) : Math.round(val)}{unit}</p>
              <span className="text-[10px] font-bold mt-1 inline-block" style={{ color }}>{label}</span>
            </div>
          );
        })}
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <ChartCard title="Error Trend" icon="trending_up">
          {data.errorTrend.length === 0 ? <EmptyState icon="check_circle" message="에러 없음" /> : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={data.errorTrend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                <XAxis dataKey="date" tick={{ fill: '#6B7280', fontSize: 11 }} />
                <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Bar dataKey="errors" name="Errors" fill="#EF4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="API Latency" icon="network_check">
          {data.apiLatency.length === 0 ? <EmptyState icon="check_circle" message="데이터 없음" /> : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={data.apiLatency}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e2e" />
                <XAxis dataKey="date" tick={{ fill: '#6B7280', fontSize: 11 }} />
                <YAxis tick={{ fill: '#6B7280', fontSize: 11 }} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="latency" name="Latency (ms)" stroke="#00D4D4" fill="#00D4D4" fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* JS Errors Table */}
      <ChartCard title="JS Errors" icon="bug_report">
        {data.jsErrors.length === 0 ? <EmptyState icon="check_circle" message="JS 에러 없음" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] text-gray-500 uppercase tracking-wider border-b border-[#1e1e2e]">
                  <th className="pb-2 pr-4">Message</th>
                  <th className="pb-2 pr-4 w-24">Count</th>
                  <th className="pb-2 w-40">Last Seen</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1e1e2e]">
                {data.jsErrors.map((err, i) => (
                  <tr key={i} className="hover:bg-[#1a1a2e]">
                    <td className="py-2 pr-4 text-red-400 font-mono text-xs truncate max-w-[400px]">{err.message}</td>
                    <td className="py-2 pr-4 text-white font-bold">{err.count}</td>
                    <td className="py-2 text-gray-500 text-xs">{new Date(err.lastSeen).toLocaleString('ko-KR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </ChartCard>
    </div>
  );
}
