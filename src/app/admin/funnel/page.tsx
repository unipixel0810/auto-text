'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { FUNNEL_STEPS } from '@/lib/analytics/funnel';

/* ───────── 타입 ───────── */

interface FunnelEvent {
  step_name: string;
  session_id: string;
  created_at: string;
}

type DateRange = 1 | 7 | 30;

/* ───────── 메인 ───────── */

export default function FunnelPage() {
  const [events, setEvents] = useState<FunnelEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<DateRange>(30);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/funnel?days=${days}`)
      .then(r => r.json())
      .then(d => setEvents(d.events || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [days]);

  const funnelData = useMemo(() => {
    // 세션별로 도달한 단계 수집
    const sessionSteps = new Map<string, Set<string>>();
    for (const e of events) {
      if (!sessionSteps.has(e.session_id)) {
        sessionSteps.set(e.session_id, new Set());
      }
      sessionSteps.get(e.session_id)!.add(e.step_name);
    }

    // 각 단계별 고유 세션 수 (해당 단계에 도달한 세션)
    const stepCounts = FUNNEL_STEPS.map(step => {
      let count = 0;
      sessionSteps.forEach(steps => {
        if (steps.has(step.name)) count++;
      });
      return { ...step, count };
    });

    const maxCount = stepCounts[0]?.count || 1;

    // 이탈률 계산
    const withDropoff = stepCounts.map((step, idx) => {
      const prev = idx === 0 ? step.count : stepCounts[idx - 1].count;
      const dropoff = prev > 0 ? ((prev - step.count) / prev) * 100 : 0;
      const pct = maxCount > 0 ? (step.count / maxCount) * 100 : 0;
      return { ...step, dropoff, pct };
    });

    // 가장 큰 이탈 구간 찾기
    let maxDropoffIdx = -1;
    let maxDropoffVal = 0;
    withDropoff.forEach((s, i) => {
      if (i > 0 && s.dropoff > maxDropoffVal) {
        maxDropoffVal = s.dropoff;
        maxDropoffIdx = i;
      }
    });

    return { steps: withDropoff, totalSessions: sessionSteps.size, maxDropoffIdx };
  }, [events]);

  const overallConversion = funnelData.steps.length >= 2 && funnelData.steps[0].count > 0
    ? ((funnelData.steps[funnelData.steps.length - 1].count / funnelData.steps[0].count) * 100).toFixed(1)
    : '0';

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a12] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#00D4D4] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a12] p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-2xl font-bold text-white">전환 퍼널</h1>
            <p className="text-sm text-gray-500 mt-1">랜딩 → 가입 전환 흐름 분석</p>
          </div>
          <div className="flex items-center gap-2">
            {/* 날짜 필터 */}
            {([1, 7, 30] as DateRange[]).map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  days === d
                    ? 'bg-[#00D4D4]/10 text-[#00D4D4] border border-[#00D4D4]/30'
                    : 'text-gray-500 border border-[#2a2a3e] hover:text-gray-300 hover:bg-white/5'
                }`}
              >
                {d === 1 ? '오늘' : `${d}일`}
              </button>
            ))}
            <a
              href="/admin/analytics"
              className="ml-2 px-4 py-2 border border-[#2a2a3e] text-gray-400 text-sm rounded-lg hover:bg-white/5 transition-all"
            >
              대시보드
            </a>
          </div>
        </div>

        {/* KPI 요약 */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <KPICard label="총 세션" value={funnelData.totalSessions} suffix="개" />
          <KPICard label="첫 단계 도달" value={funnelData.steps[0]?.count || 0} suffix="명" />
          <KPICard label="최종 전환" value={funnelData.steps[funnelData.steps.length - 1]?.count || 0} suffix="명" />
          <KPICard
            label="전체 전환율"
            value={parseFloat(overallConversion)}
            suffix="%"
            color={parseFloat(overallConversion) >= 10 ? '#22c55e' : parseFloat(overallConversion) >= 5 ? '#eab308' : '#ef4444'}
          />
        </div>

        {funnelData.totalSessions === 0 ? (
          <div className="bg-[#12121a] border border-[#2a2a3e] rounded-2xl p-16 text-center">
            <span className="material-symbols-outlined text-[48px] text-gray-600">filter_alt</span>
            <p className="text-gray-500 mt-4">선택한 기간에 퍼널 데이터가 없습니다.</p>
          </div>
        ) : (
          <>
            {/* 깔때기 시각화 */}
            <div className="bg-[#12121a] border border-[#2a2a3e] rounded-2xl p-6 sm:p-8">
              <h2 className="text-sm font-semibold text-white mb-6">전환 깔때기</h2>
              <div className="space-y-0">
                {funnelData.steps.map((step, idx) => {
                  const isMaxDropoff = idx === funnelData.maxDropoffIdx;
                  const widthPct = Math.max(step.pct, 8);
                  const barColor = isMaxDropoff ? '#ef4444' : '#00D4D4';
                  const barBg = isMaxDropoff ? 'rgba(239,68,68,0.15)' : 'rgba(0,212,212,0.1)';

                  return (
                    <div key={step.name}>
                      {/* 이탈률 표시 (두 번째 단계부터) */}
                      {idx > 0 && (
                        <div className="flex items-center justify-center py-1.5">
                          <div className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium ${
                            isMaxDropoff
                              ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                              : 'bg-[#0d0d14] text-gray-500'
                          }`}>
                            <span className="material-symbols-outlined text-[13px]">
                              {isMaxDropoff ? 'warning' : 'arrow_downward'}
                            </span>
                            이탈 {step.dropoff.toFixed(1)}%
                            {isMaxDropoff && <span className="text-[10px]">(최대 이탈 구간)</span>}
                          </div>
                        </div>
                      )}

                      {/* 깔때기 바 */}
                      <div className="flex items-center gap-4">
                        <div className="w-28 sm:w-36 shrink-0 text-right">
                          <p className="text-[12px] text-gray-400 font-medium">{step.label}</p>
                        </div>
                        <div className="flex-1 relative">
                          <div
                            className="h-12 rounded-lg flex items-center transition-all duration-700 relative overflow-hidden"
                            style={{
                              width: `${widthPct}%`,
                              backgroundColor: barBg,
                              border: `1px solid ${barColor}30`,
                            }}
                          >
                            {/* 그라디언트 채움 */}
                            <div
                              className="absolute inset-0 rounded-lg opacity-30"
                              style={{
                                background: `linear-gradient(90deg, ${barColor}40, ${barColor}10)`,
                              }}
                            />
                            <span className="relative z-10 ml-3 text-sm font-bold" style={{ color: barColor }}>
                              {step.count}
                            </span>
                          </div>
                        </div>
                        <div className="w-16 shrink-0 text-right">
                          <span className="text-[13px] font-semibold" style={{ color: barColor }}>
                            {step.pct.toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 단계별 상세 테이블 */}
            <div className="bg-[#12121a] border border-[#2a2a3e] rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-[#1e1e2e]">
                <h2 className="text-sm font-semibold text-white">단계별 상세</h2>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#1e1e2e] text-gray-500 text-[11px] uppercase tracking-wider">
                    <th className="text-left px-6 py-3">단계</th>
                    <th className="text-right px-6 py-3">도달 수</th>
                    <th className="text-right px-6 py-3">도달률</th>
                    <th className="text-right px-6 py-3">이탈률</th>
                    <th className="text-right px-6 py-3">전환율 (이전 단계)</th>
                  </tr>
                </thead>
                <tbody>
                  {funnelData.steps.map((step, idx) => {
                    const isMaxDropoff = idx === funnelData.maxDropoffIdx;
                    const prevCount = idx === 0 ? step.count : funnelData.steps[idx - 1].count;
                    const conversionFromPrev = prevCount > 0 ? ((step.count / prevCount) * 100).toFixed(1) : '-';

                    return (
                      <tr
                        key={step.name}
                        className={`border-b border-[#1e1e2e]/50 ${isMaxDropoff ? 'bg-red-500/5' : ''}`}
                      >
                        <td className="px-6 py-3">
                          <div className="flex items-center gap-2">
                            <span className={`w-6 h-6 rounded-md flex items-center justify-center text-[11px] font-bold ${
                              isMaxDropoff ? 'bg-red-500/20 text-red-400' : 'bg-[#00D4D4]/10 text-[#00D4D4]'
                            }`}>
                              {idx + 1}
                            </span>
                            <span className="text-gray-300">{step.label}</span>
                          </div>
                        </td>
                        <td className="px-6 py-3 text-right text-white font-medium">{step.count}</td>
                        <td className="px-6 py-3 text-right text-gray-400">{step.pct.toFixed(1)}%</td>
                        <td className="px-6 py-3 text-right">
                          {idx === 0 ? (
                            <span className="text-gray-600">-</span>
                          ) : (
                            <span className={isMaxDropoff ? 'text-red-400 font-semibold' : 'text-gray-400'}>
                              {step.dropoff.toFixed(1)}%
                            </span>
                          )}
                        </td>
                        <td className="px-6 py-3 text-right">
                          {idx === 0 ? (
                            <span className="text-gray-600">-</span>
                          ) : (
                            <span className="text-gray-400">{conversionFromPrev}%</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ───────── 서브 컴포넌트 ───────── */

function KPICard({ label, value, suffix, color }: { label: string; value: number; suffix?: string; color?: string }) {
  return (
    <div className="bg-[#12121a] border border-[#2a2a3e] rounded-2xl p-5">
      <p className="text-[11px] text-gray-500 uppercase tracking-wider">{label}</p>
      <p className="text-3xl font-bold mt-1" style={{ color: color || '#ffffff' }}>
        {value}{suffix && <span className="text-lg text-gray-500 ml-0.5">{suffix}</span>}
      </p>
    </div>
  );
}
