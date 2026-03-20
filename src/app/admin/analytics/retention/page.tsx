'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { LoadingSpinner, EmptyState, ChartCard } from '@/components/analytics/shared';

type Granularity = 'day' | 'week' | 'month';

interface CohortRow {
  cohort: string;
  total: number;
  periods: number[];
}

const DAY_OPTIONS = [
  { label: '7일', days: 7 },
  { label: '30일', days: 30 },
  { label: '90일', days: 90 },
] as const;

const GRANULARITY_OPTIONS: { label: string; value: Granularity }[] = [
  { label: '일', value: 'day' },
  { label: '주', value: 'week' },
  { label: '월', value: 'month' },
];

/** Map retention % (0–100) to a green heatmap background color. */
function retentionColor(pct: number): string {
  if (pct >= 80) return 'rgba(0, 212, 212, 0.55)';
  if (pct >= 60) return 'rgba(0, 212, 212, 0.42)';
  if (pct >= 40) return 'rgba(0, 212, 212, 0.30)';
  if (pct >= 20) return 'rgba(0, 212, 212, 0.18)';
  if (pct > 0) return 'rgba(0, 212, 212, 0.08)';
  return 'transparent';
}

function periodLabel(granularity: Granularity): string {
  if (granularity === 'day') return '일';
  if (granularity === 'week') return '주';
  return '월';
}

export default function RetentionPage() {
  const [mounted, setMounted] = useState(false);
  const [days, setDays] = useState(30);
  const [granularity, setGranularity] = useState<Granularity>('week');
  const [cohorts, setCohorts] = useState<CohortRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { setMounted(true); }, []);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/analytics/query?action=retention&days=${days}&granularity=${granularity}`,
      );
      if (!res.ok) { console.error('Failed to fetch retention data:', res.status); setCohorts([]); return; }
      const json = await res.json();
      setCohorts(json.cohorts ?? []);
    } catch (err) {
      console.error('[Retention] fetch error:', err);
      setCohorts([]);
    } finally {
      setLoading(false);
    }
  }, [days, granularity]);

  useEffect(() => {
    if (!mounted) return;
    const timeout = setTimeout(fetchData, 100);
    return () => clearTimeout(timeout);
  }, [mounted, fetchData]);

  if (!mounted) return null;

  const maxPeriods = cohorts.reduce((max, c) => Math.max(max, c.periods.length), 0);
  const pLabel = periodLabel(granularity);

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-6 gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white">리텐션 분석</h1>
          <p className="text-sm text-gray-500 mt-1">코호트별 재방문율을 확인하세요</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Date range filter */}
          <div className="flex bg-[#12121a] border border-[#1e1e2e] rounded-lg overflow-hidden">
            {DAY_OPTIONS.map((opt) => (
              <button
                key={opt.days}
                onClick={() => setDays(opt.days)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  days === opt.days
                    ? 'bg-[#00D4D4] text-black'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Granularity toggle */}
          <div className="flex bg-[#12121a] border border-[#1e1e2e] rounded-lg overflow-hidden">
            {GRANULARITY_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setGranularity(opt.value)}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  granularity === opt.value
                    ? 'bg-[#00D4D4] text-black'
                    : 'text-gray-400 hover:text-white'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <LoadingSpinner />
      ) : cohorts.length === 0 ? (
        <EmptyState icon="group_off" message="리텐션 데이터가 없습니다" />
      ) : (
        <ChartCard title="리텐션 매트릭스" icon="grid_on" className="overflow-x-auto">
          <div className="min-w-[600px]">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[#1e1e2e]">
                  <th className="text-left py-2 px-3 text-gray-500 font-medium sticky left-0 bg-[#12121a] z-10">
                    코호트
                  </th>
                  <th className="text-right py-2 px-3 text-gray-500 font-medium">유저 수</th>
                  {Array.from({ length: maxPeriods }, (_, i) => (
                    <th key={i} className="text-center py-2 px-3 text-gray-500 font-medium whitespace-nowrap">
                      {i === 0 ? `${pLabel} 0` : `+${i}${pLabel}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {cohorts.map((row) => (
                  <tr key={row.cohort} className="border-b border-[#1e1e2e]/50 hover:bg-[#1a1a2a]">
                    <td className="py-2 px-3 text-gray-300 font-mono whitespace-nowrap sticky left-0 bg-[#12121a] z-10">
                      {row.cohort}
                    </td>
                    <td className="py-2 px-3 text-right text-gray-400 font-mono">{row.total}</td>
                    {Array.from({ length: maxPeriods }, (_, i) => {
                      const pct = row.periods[i] ?? 0;
                      return (
                        <td
                          key={i}
                          className="py-2 px-3 text-center font-mono"
                          style={{ backgroundColor: retentionColor(pct) }}
                        >
                          <span className={pct > 0 ? 'text-white' : 'text-gray-600'}>
                            {pct > 0 ? `${pct}%` : '-'}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ChartCard>
      )}
    </div>
  );
}
