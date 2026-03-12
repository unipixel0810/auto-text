'use client';

import React, { useState, useEffect } from 'react';
import { DATE_FILTERS } from '@/lib/analytics/types';
import {
  ChartCard, EmptyState, LoadingSpinner, safePercent,
} from '@/components/analytics/shared';

export default function FunnelsPage() {
  const [days, setDays] = useState(30);
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

  return (
    <div className="min-h-screen bg-[#0d0d14] text-white">
      <header className="border-b border-[#1e1e2e] px-6 py-3 flex items-center justify-between sticky top-0 bg-[#0d0d14]/95 backdrop-blur-sm z-50">
        <div className="flex items-center gap-3">
          <a href="/admin/analytics" className="text-gray-400 hover:text-white transition-colors">
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </a>
          <span className="material-symbols-outlined text-[#00D4D4] text-[24px]">filter_alt</span>
          <h1 className="text-lg font-semibold">퍼널</h1>
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

      <main className="p-6 max-w-[1400px] mx-auto">
        {loading ? <LoadingSpinner /> : funnels.length === 0 ? (
          <EmptyState icon="filter_alt" message="설정된 퍼널이 없습니다. 퍼널을 생성하면 전환율을 추적할 수 있습니다." />
        ) : (
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

                      const hue = (pct / 100) * 120;
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
                                <span className="text-white font-bold">{(step.count ?? 0).toLocaleString()}</span>
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

                  {steps.length >= 2 && (
                    <div className="mt-4 pt-4 border-t border-[#1e1e2e] flex items-center gap-6">
                      <div className="text-xs text-gray-500">
                        전체 전환율: <span className="text-[#00D4D4] font-bold text-sm">{safePercent(steps[steps.length - 1].count, steps[0].count)}%</span>
                      </div>
                      <div className="text-xs text-gray-500">
                        총 이탈: <span className="text-red-400 font-bold text-sm">{((steps[0]?.count ?? 0) - (steps[steps.length - 1]?.count ?? 0)).toLocaleString()}</span>
                      </div>
                    </div>
                  )}
                </ChartCard>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
