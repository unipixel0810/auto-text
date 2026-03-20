'use client';

import React, { useEffect, useState, useMemo } from 'react';
import { KPICard, EmptyState, LoadingSpinner } from '@/components/analytics/shared';

const SUS_QUESTIONS = [
  '이 시스템을 자주 사용하고 싶다.',
  '이 시스템이 불필요하게 복잡하다고 느꼈다.',
  '이 시스템이 사용하기 쉽다고 생각한다.',
  '이 시스템을 사용하려면 전문가의 도움이 필요할 것 같다.',
  '이 시스템의 다양한 기능이 잘 통합되어 있다고 느꼈다.',
  '이 시스템에 일관성이 없는 부분이 너무 많다고 느꼈다.',
  '대부분의 사람들이 이 시스템 사용법을 빠르게 배울 수 있을 것이다.',
  '이 시스템이 사용하기에 매우 번거롭다고 느꼈다.',
  '이 시스템을 사용할 때 자신감이 있었다.',
  '이 시스템을 사용하기 전에 많은 것을 배워야 했다.',
];

interface SurveyResponse {
  id: string;
  nps_score: number;
  nps_reason: string | null;
  sus_answers: number[];
  sus_score: number;
  open_best: string | null;
  open_worst: string | null;
  open_change: string | null;
  open_feature: string | null;
  completed: boolean;
  created_at: string;
}

function getSUSGrade(score: number): { label: string; color: string } {
  if (score >= 80) return { label: 'A (우수)', color: '#22c55e' };
  if (score >= 68) return { label: 'B (양호)', color: '#84cc16' };
  if (score >= 51) return { label: 'C (보통)', color: '#eab308' };
  return { label: 'D (개선 필요)', color: '#ef4444' };
}

export default function SurveyResultsPage() {
  const [responses, setResponses] = useState<SurveyResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'nps' | 'sus' | 'open'>('overview');

  useEffect(() => {
    fetch('/api/survey')
      .then(r => {
        if (!r.ok) { console.error('Failed to fetch survey:', r.status); return null; }
        return r.json();
      })
      .then(d => { if (d) setResponses(d?.responses ?? []); })
      .catch((err) => { console.error('Failed to fetch survey:', err); })
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    if (responses.length === 0) return null;
    const promoters = responses.filter(r => r.nps_score >= 9).length;
    const detractors = responses.filter(r => r.nps_score <= 6).length;
    const npsScore = Math.round(((promoters - detractors) / responses.length) * 100);
    const npsDistribution = Array(11).fill(0);
    responses.forEach(r => npsDistribution[r.nps_score]++);
    const susScores = responses.map(r => r.sus_score);
    const susAvg = susScores.reduce((a, b) => a + b, 0) / susScores.length;
    const susPerQuestion = Array(10).fill(0).map((_, qIdx) => {
      const sum = responses.reduce((acc, r) => acc + (r.sus_answers?.[qIdx] || 0), 0);
      return sum / responses.length;
    });
    const completed = responses.filter(r => r.completed).length;
    return {
      total: responses.length, completed,
      completionRate: Math.round((completed / responses.length) * 100),
      npsScore, promoters, detractors,
      passives: responses.length - promoters - detractors,
      npsDistribution, susAvg, susPerQuestion,
    };
  }, [responses]);

  if (loading) return <div className="p-6"><LoadingSpinner /></div>;

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[#00D4D4] text-[22px]">quiz</span>
          <h1 className="text-lg font-semibold">설문조사 결과</h1>
          <span className="text-xs text-gray-500">베타 테스트 설문 분석</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#12121a] border border-[#1e1e2e] rounded-xl p-1 w-fit mb-6">
        {[
          { id: 'overview' as const, label: '요약', icon: 'dashboard' },
          { id: 'nps' as const, label: 'NPS', icon: 'thumb_up' },
          { id: 'sus' as const, label: 'SUS', icon: 'analytics' },
          { id: 'open' as const, label: '자유 의견', icon: 'chat' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-[#00D4D4]/10 text-[#00D4D4]'
                : 'text-gray-500 hover:text-gray-300'
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">{tab.icon}</span>
            {tab.label}
          </button>
        ))}
      </div>

      {responses.length === 0 ? (
        <EmptyState icon="poll" message="아직 설문 응답이 없습니다. /survey 링크를 공유하세요." />
      ) : stats && (
        <>
          {/* Overview Tab */}
          {activeTab === 'overview' && (
            <div className="space-y-6">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <KPICard title="총 응답자" value={`${stats.total}명`} icon="people" color="#00D4D4" />
                <KPICard title="완료율" value={`${stats.completionRate}%`} icon="check_circle" color="#3B82F6" />
                <KPICard title="NPS 점수" value={String(stats.npsScore)} icon="thumb_up" color={stats.npsScore >= 50 ? '#22c55e' : stats.npsScore >= 0 ? '#eab308' : '#ef4444'} />
                <KPICard title="SUS 점수" value={stats.susAvg.toFixed(1)} icon="analytics" color={stats.susAvg >= 68 ? '#22c55e' : stats.susAvg >= 51 ? '#eab308' : '#ef4444'} />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* NPS 분포 */}
                <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-5 space-y-4">
                  <h3 className="text-sm font-semibold text-white">NPS 분포</h3>
                  <div className="flex items-end gap-1 h-20">
                    {stats.npsDistribution.map((count: number, i: number) => {
                      const maxCount = Math.max(...stats.npsDistribution, 1);
                      const height = (count / maxCount) * 100;
                      const color = i <= 6 ? '#ef4444' : i <= 8 ? '#eab308' : '#22c55e';
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                          <span className="text-[8px] text-gray-600">{count || ''}</span>
                          <div className="w-full rounded-t" style={{ height: `${Math.max(height, 2)}%`, backgroundColor: color, opacity: count ? 1 : 0.2 }} />
                          <span className="text-[8px] text-gray-600">{i}</span>
                        </div>
                      );
                    })}
                  </div>
                  <div className="flex justify-between text-[10px]">
                    <span className="text-red-400">비추천 {stats.detractors}명</span>
                    <span className="text-yellow-400">중립 {stats.passives}명</span>
                    <span className="text-green-400">추천 {stats.promoters}명</span>
                  </div>
                </div>

                {/* SUS 게이지 */}
                <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-5 space-y-4">
                  <h3 className="text-sm font-semibold text-white">SUS 점수</h3>
                  <div className="flex items-center justify-center">
                    <div className="relative w-28 h-28">
                      <svg viewBox="0 0 128 128" className="w-full h-full -rotate-90">
                        <circle cx="64" cy="64" r="56" fill="none" stroke="#1e1e2e" strokeWidth="10" />
                        <circle cx="64" cy="64" r="56" fill="none" stroke={getSUSGrade(stats.susAvg).color} strokeWidth="10"
                          strokeDasharray={`${(stats.susAvg / 100) * 351.86} 351.86`} strokeLinecap="round" />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-xl font-bold text-white">{stats.susAvg.toFixed(1)}</span>
                        <span className="text-[9px] text-gray-500">/ 100</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-center text-[11px] text-gray-500">
                    등급: {getSUSGrade(stats.susAvg).label} | 업계 평균: 68점
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* NPS Tab */}
          {activeTab === 'nps' && (
            <div className="space-y-6">
              <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-6 text-center">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Net Promoter Score</p>
                <p className="text-5xl font-black" style={{ color: stats.npsScore >= 50 ? '#22c55e' : stats.npsScore >= 0 ? '#eab308' : '#ef4444' }}>
                  {stats.npsScore}
                </p>
                <div className="flex justify-center gap-8 mt-4 text-sm">
                  <div className="text-center">
                    <p className="text-xl font-bold text-green-400">{stats.promoters}</p>
                    <p className="text-[10px] text-gray-500">추천 (9-10)</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-bold text-yellow-400">{stats.passives}</p>
                    <p className="text-[10px] text-gray-500">중립 (7-8)</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xl font-bold text-red-400">{stats.detractors}</p>
                    <p className="text-[10px] text-gray-500">비추천 (0-6)</p>
                  </div>
                </div>
              </div>

              <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-5 space-y-3">
                <h3 className="text-sm font-semibold">점수를 준 이유</h3>
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {responses.filter(r => r.nps_reason).map(r => (
                    <div key={r.id} className="flex items-start gap-3 bg-[#0d0d14] rounded-lg p-3">
                      <span className={`shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-[11px] font-bold text-white ${
                        r.nps_score <= 6 ? 'bg-red-500/30' : r.nps_score <= 8 ? 'bg-yellow-500/30' : 'bg-green-500/30'
                      }`}>{r.nps_score}</span>
                      <p className="text-xs text-gray-300">{r.nps_reason}</p>
                    </div>
                  ))}
                  {!responses.some(r => r.nps_reason) && (
                    <p className="text-xs text-gray-600 text-center py-4">이유를 작성한 응답이 없습니다.</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* SUS Tab */}
          {activeTab === 'sus' && (
            <div className="space-y-6">
              <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-6 text-center">
                <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">System Usability Scale</p>
                <p className="text-5xl font-black" style={{ color: getSUSGrade(stats.susAvg).color }}>
                  {stats.susAvg.toFixed(1)}
                </p>
                <p className="text-xs mt-2" style={{ color: getSUSGrade(stats.susAvg).color }}>
                  등급: {getSUSGrade(stats.susAvg).label}
                </p>
                <div className="max-w-sm mx-auto mt-4">
                  <div className="h-2.5 bg-[#1e1e2e] rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-1000"
                      style={{ width: `${stats.susAvg}%`, backgroundColor: getSUSGrade(stats.susAvg).color }} />
                  </div>
                </div>
              </div>

              <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-5 space-y-3">
                <h3 className="text-sm font-semibold">문항별 평균</h3>
                {SUS_QUESTIONS.map((q, idx) => {
                  const avg = stats.susPerQuestion[idx];
                  const isPositive = idx % 2 === 0;
                  const goodScore = isPositive ? avg >= 3.5 : avg <= 2.5;
                  const barColor = goodScore ? '#22c55e' : avg >= 2.5 && avg <= 3.5 ? '#eab308' : '#ef4444';
                  return (
                    <div key={idx} className="space-y-1">
                      <div className="flex items-start gap-2">
                        <span className="text-[#00D4D4] text-[11px] font-semibold shrink-0">{idx + 1}.</span>
                        <p className="text-[11px] text-gray-400 flex-1">{q}</p>
                        <span className="text-xs font-bold text-white shrink-0">{avg.toFixed(1)}</span>
                      </div>
                      <div className="h-1.5 bg-[#1e1e2e] rounded-full overflow-hidden ml-4">
                        <div className="h-full rounded-full" style={{ width: `${(avg / 5) * 100}%`, backgroundColor: barColor }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Open Tab */}
          {activeTab === 'open' && (
            <div className="space-y-6">
              {[
                { title: '가장 좋았던 기능', field: 'open_best' as const, icon: 'thumb_up', color: '#22c55e' },
                { title: '가장 불편했던 점', field: 'open_worst' as const, icon: 'thumb_down', color: '#ef4444' },
                { title: '바꾸고 싶은 것', field: 'open_change' as const, icon: 'swap_horiz', color: '#eab308' },
                { title: '추가 희망 기능', field: 'open_feature' as const, icon: 'add_circle', color: '#00D4D4' },
              ].map(section => {
                const answers = responses.filter(r => r[section.field]).map(r => ({
                  id: r.id, text: r[section.field] as string, nps: r.nps_score, date: r.created_at,
                }));
                return (
                  <div key={section.field} className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-5 space-y-3">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[16px]" style={{ color: section.color }}>{section.icon}</span>
                      <h3 className="text-sm font-semibold">{section.title}</h3>
                      <span className="text-[10px] text-gray-600 ml-auto">{answers.length}건</span>
                    </div>
                    {answers.length === 0 ? (
                      <p className="text-xs text-gray-600 text-center py-4">응답 없음</p>
                    ) : (
                      <div className="space-y-2 max-h-56 overflow-y-auto">
                        {answers.map(a => (
                          <div key={a.id} className="flex items-start gap-3 bg-[#0d0d14] rounded-lg p-3">
                            <span className={`shrink-0 w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold text-white ${
                              a.nps <= 6 ? 'bg-red-500/30' : a.nps <= 8 ? 'bg-yellow-500/30' : 'bg-green-500/30'
                            }`}>{a.nps}</span>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs text-gray-300">{a.text}</p>
                              <p className="text-[9px] text-gray-600 mt-1">{new Date(a.date).toLocaleDateString('ko-KR')}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}
