'use client';

import React, { useEffect, useState, useMemo } from 'react';

/* ───────── 상수 ───────── */

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

/* ───────── 메인 ───────── */

export default function SurveyResultsPage() {
  const [responses, setResponses] = useState<SurveyResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'nps' | 'sus' | 'open'>('overview');

  useEffect(() => {
    fetch('/api/survey')
      .then(r => r.json())
      .then(d => setResponses(d.responses || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const stats = useMemo(() => {
    if (responses.length === 0) return null;

    // NPS
    const promoters = responses.filter(r => r.nps_score >= 9).length;
    const detractors = responses.filter(r => r.nps_score <= 6).length;
    const npsScore = Math.round(((promoters - detractors) / responses.length) * 100);

    // NPS 분포
    const npsDistribution = Array(11).fill(0);
    responses.forEach(r => npsDistribution[r.nps_score]++);

    // SUS
    const susScores = responses.map(r => r.sus_score);
    const susAvg = susScores.reduce((a, b) => a + b, 0) / susScores.length;

    // SUS 문항별 평균
    const susPerQuestion = Array(10).fill(0).map((_, qIdx) => {
      const sum = responses.reduce((acc, r) => acc + (r.sus_answers?.[qIdx] || 0), 0);
      return sum / responses.length;
    });

    // 완료율
    const completed = responses.filter(r => r.completed).length;

    return {
      total: responses.length,
      completed,
      completionRate: Math.round((completed / responses.length) * 100),
      npsScore,
      promoters,
      detractors,
      passives: responses.length - promoters - detractors,
      npsDistribution,
      susAvg,
      susPerQuestion,
    };
  }, [responses]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a12] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#00D4D4] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a12] p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* 헤더 */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">설문조사 결과</h1>
            <p className="text-sm text-gray-500 mt-1">베타 테스트 설문 응답 분석</p>
          </div>
          <a
            href="/admin/analytics"
            className="px-4 py-2 border border-[#2a2a3e] text-gray-400 text-sm rounded-xl hover:bg-white/5 transition-all"
          >
            대시보드로 돌아가기
          </a>
        </div>

        {/* 탭 */}
        <div className="flex gap-1 bg-[#12121a] border border-[#2a2a3e] rounded-xl p-1 w-fit">
          {[
            { id: 'overview' as const, label: '요약', icon: 'dashboard' },
            { id: 'nps' as const, label: 'NPS', icon: 'thumb_up' },
            { id: 'sus' as const, label: 'SUS', icon: 'analytics' },
            { id: 'open' as const, label: '자유 의견', icon: 'chat' },
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? 'bg-[#00D4D4]/10 text-[#00D4D4]'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </div>

        {responses.length === 0 ? (
          <div className="bg-[#12121a] border border-[#2a2a3e] rounded-2xl p-16 text-center">
            <span className="material-symbols-outlined text-[48px] text-gray-600">poll</span>
            <p className="text-gray-500 mt-4">아직 설문 응답이 없습니다.</p>
            <p className="text-[12px] text-gray-600 mt-1">/survey 링크를 공유하여 응답을 수집하세요.</p>
          </div>
        ) : stats && (
          <>
            {/* ───── 요약 탭 ───── */}
            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* KPI 카드 */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <KPICard label="총 응답자" value={stats.total} suffix="명" />
                  <KPICard label="완료율" value={stats.completionRate} suffix="%" />
                  <KPICard
                    label="NPS 점수"
                    value={stats.npsScore}
                    color={stats.npsScore >= 50 ? '#22c55e' : stats.npsScore >= 0 ? '#eab308' : '#ef4444'}
                  />
                  <KPICard
                    label="SUS 점수"
                    value={Math.round(stats.susAvg * 10) / 10}
                    color={stats.susAvg >= 68 ? '#22c55e' : stats.susAvg >= 51 ? '#eab308' : '#ef4444'}
                  />
                </div>

                {/* NPS + SUS 요약 */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* NPS 요약 */}
                  <div className="bg-[#12121a] border border-[#2a2a3e] rounded-2xl p-6 space-y-4">
                    <h3 className="text-sm font-semibold text-white">NPS 분포</h3>
                    <div className="flex items-end gap-1 h-24">
                      {stats.npsDistribution.map((count, i) => {
                        const maxCount = Math.max(...stats.npsDistribution, 1);
                        const height = (count / maxCount) * 100;
                        const color = i <= 6 ? '#ef4444' : i <= 8 ? '#eab308' : '#22c55e';
                        return (
                          <div key={i} className="flex-1 flex flex-col items-center gap-1">
                            <span className="text-[9px] text-gray-500">{count || ''}</span>
                            <div
                              className="w-full rounded-t transition-all duration-500"
                              style={{ height: `${Math.max(height, 2)}%`, backgroundColor: color, opacity: count ? 1 : 0.2 }}
                            />
                            <span className="text-[9px] text-gray-600">{i}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex justify-between text-[11px]">
                      <span className="text-red-400">비추천 {stats.detractors}명</span>
                      <span className="text-yellow-400">중립 {stats.passives}명</span>
                      <span className="text-green-400">추천 {stats.promoters}명</span>
                    </div>
                  </div>

                  {/* SUS 요약 */}
                  <div className="bg-[#12121a] border border-[#2a2a3e] rounded-2xl p-6 space-y-4">
                    <h3 className="text-sm font-semibold text-white">SUS 점수 분포</h3>
                    <div className="flex items-center justify-center">
                      <div className="relative w-32 h-32">
                        <svg viewBox="0 0 128 128" className="w-full h-full -rotate-90">
                          <circle cx="64" cy="64" r="56" fill="none" stroke="#1e1e2e" strokeWidth="10" />
                          <circle
                            cx="64" cy="64" r="56"
                            fill="none"
                            stroke={stats.susAvg >= 68 ? '#22c55e' : stats.susAvg >= 51 ? '#eab308' : '#ef4444'}
                            strokeWidth="10"
                            strokeDasharray={`${(stats.susAvg / 100) * 351.86} 351.86`}
                            strokeLinecap="round"
                          />
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                          <span className="text-2xl font-bold text-white">{stats.susAvg.toFixed(1)}</span>
                          <span className="text-[10px] text-gray-500">/ 100</span>
                        </div>
                      </div>
                    </div>
                    <p className="text-center text-[12px] text-gray-500">
                      등급: {getSUSGrade(stats.susAvg).label} | 업계 평균: 68점
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ───── NPS 탭 ───── */}
            {activeTab === 'nps' && (
              <div className="space-y-6">
                {/* 큰 NPS 점수 */}
                <div className="bg-[#12121a] border border-[#2a2a3e] rounded-2xl p-8 text-center">
                  <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-2">Net Promoter Score</p>
                  <p
                    className="text-7xl font-black"
                    style={{ color: stats.npsScore >= 50 ? '#22c55e' : stats.npsScore >= 0 ? '#eab308' : '#ef4444' }}
                  >
                    {stats.npsScore}
                  </p>
                  <p className="text-sm text-gray-500 mt-2">
                    {stats.npsScore >= 70 ? '최고 수준' : stats.npsScore >= 50 ? '우수' : stats.npsScore >= 0 ? '개선 필요' : '위험'}
                  </p>
                  <div className="flex justify-center gap-8 mt-6 text-sm">
                    <div className="text-center">
                      <p className="text-2xl font-bold text-green-400">{stats.promoters}</p>
                      <p className="text-[11px] text-gray-500">추천자 (9-10)</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-yellow-400">{stats.passives}</p>
                      <p className="text-[11px] text-gray-500">중립 (7-8)</p>
                    </div>
                    <div className="text-center">
                      <p className="text-2xl font-bold text-red-400">{stats.detractors}</p>
                      <p className="text-[11px] text-gray-500">비추천자 (0-6)</p>
                    </div>
                  </div>
                </div>

                {/* 히스토그램 */}
                <div className="bg-[#12121a] border border-[#2a2a3e] rounded-2xl p-6 space-y-4">
                  <h3 className="text-sm font-semibold text-white">NPS 점수 분포 히스토그램</h3>
                  <div className="flex items-end gap-2 h-40">
                    {stats.npsDistribution.map((count, i) => {
                      const maxCount = Math.max(...stats.npsDistribution, 1);
                      const height = (count / maxCount) * 100;
                      const color = i <= 6 ? '#ef4444' : i <= 8 ? '#eab308' : '#22c55e';
                      return (
                        <div key={i} className="flex-1 flex flex-col items-center gap-1">
                          <span className="text-[11px] text-gray-400 font-medium">{count}</span>
                          <div
                            className="w-full rounded-t-lg transition-all duration-700"
                            style={{ height: `${Math.max(height, 4)}%`, backgroundColor: color, opacity: count ? 1 : 0.15 }}
                          />
                          <span className="text-[11px] text-gray-500 font-medium">{i}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* NPS 이유 목록 */}
                <div className="bg-[#12121a] border border-[#2a2a3e] rounded-2xl p-6 space-y-4">
                  <h3 className="text-sm font-semibold text-white">점수를 준 이유</h3>
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {responses
                      .filter(r => r.nps_reason)
                      .map(r => (
                        <div key={r.id} className="flex items-start gap-3 bg-[#0d0d14] rounded-xl p-3">
                          <span className={`shrink-0 w-8 h-8 rounded-lg flex items-center justify-center text-sm font-bold text-white ${
                            r.nps_score <= 6 ? 'bg-red-500/30' : r.nps_score <= 8 ? 'bg-yellow-500/30' : 'bg-green-500/30'
                          }`}>
                            {r.nps_score}
                          </span>
                          <p className="text-sm text-gray-300">{r.nps_reason}</p>
                        </div>
                      ))}
                    {!responses.some(r => r.nps_reason) && (
                      <p className="text-sm text-gray-600 text-center py-4">이유를 작성한 응답이 없습니다.</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ───── SUS 탭 ───── */}
            {activeTab === 'sus' && (
              <div className="space-y-6">
                {/* SUS 평균 */}
                <div className="bg-[#12121a] border border-[#2a2a3e] rounded-2xl p-8 text-center">
                  <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-2">System Usability Scale</p>
                  <p
                    className="text-7xl font-black"
                    style={{ color: getSUSGrade(stats.susAvg).color }}
                  >
                    {stats.susAvg.toFixed(1)}
                  </p>
                  <p className="text-sm mt-2" style={{ color: getSUSGrade(stats.susAvg).color }}>
                    등급: {getSUSGrade(stats.susAvg).label}
                  </p>
                  <div className="max-w-md mx-auto mt-4">
                    <div className="h-3 bg-[#1e1e2e] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-1000"
                        style={{ width: `${stats.susAvg}%`, backgroundColor: getSUSGrade(stats.susAvg).color }}
                      />
                    </div>
                    <div className="flex justify-between text-[9px] text-gray-600 mt-1">
                      <span>0</span>
                      <span className="text-yellow-500/50">51</span>
                      <span className="text-green-500/50">68</span>
                      <span className="text-green-500/50">80</span>
                      <span>100</span>
                    </div>
                  </div>
                </div>

                {/* 문항별 평균 */}
                <div className="bg-[#12121a] border border-[#2a2a3e] rounded-2xl p-6 space-y-4">
                  <h3 className="text-sm font-semibold text-white">문항별 평균 점수</h3>
                  <div className="space-y-3">
                    {SUS_QUESTIONS.map((q, idx) => {
                      const avg = stats.susPerQuestion[idx];
                      const isPositive = idx % 2 === 0;
                      // 긍정 문항: 높을수록 좋음, 부정 문항: 낮을수록 좋음
                      const goodScore = isPositive ? avg >= 3.5 : avg <= 2.5;
                      const barColor = goodScore ? '#22c55e' : avg >= 2.5 && avg <= 3.5 ? '#eab308' : '#ef4444';
                      return (
                        <div key={idx} className="space-y-1">
                          <div className="flex items-start gap-2">
                            <span className="text-[#00D4D4] text-[12px] font-semibold shrink-0">{idx + 1}.</span>
                            <p className="text-[12px] text-gray-400 flex-1">{q}</p>
                            <span className="text-sm font-bold text-white shrink-0">{avg.toFixed(1)}</span>
                          </div>
                          <div className="h-1.5 bg-[#1e1e2e] rounded-full overflow-hidden ml-5">
                            <div
                              className="h-full rounded-full transition-all duration-700"
                              style={{ width: `${(avg / 5) * 100}%`, backgroundColor: barColor }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 개별 SUS 점수 */}
                <div className="bg-[#12121a] border border-[#2a2a3e] rounded-2xl p-6 space-y-4">
                  <h3 className="text-sm font-semibold text-white">응답자별 SUS 점수</h3>
                  <div className="flex flex-wrap gap-2">
                    {responses.map(r => (
                      <div
                        key={r.id}
                        className="px-3 py-1.5 rounded-lg text-sm font-medium border"
                        style={{
                          borderColor: getSUSGrade(r.sus_score).color + '40',
                          color: getSUSGrade(r.sus_score).color,
                          backgroundColor: getSUSGrade(r.sus_score).color + '10',
                        }}
                      >
                        {r.sus_score.toFixed(0)}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* ───── 오픈 질문 탭 ───── */}
            {activeTab === 'open' && (
              <div className="space-y-6">
                {[
                  { title: '가장 좋았던 기능', field: 'open_best' as const, icon: 'thumb_up', color: '#22c55e' },
                  { title: '가장 불편했던 점', field: 'open_worst' as const, icon: 'thumb_down', color: '#ef4444' },
                  { title: '바꾸고 싶은 것', field: 'open_change' as const, icon: 'swap_horiz', color: '#eab308' },
                  { title: '추가 희망 기능', field: 'open_feature' as const, icon: 'add_circle', color: '#00D4D4' },
                ].map(section => {
                  const answers = responses.filter(r => r[section.field]).map(r => ({
                    id: r.id,
                    text: r[section.field] as string,
                    nps: r.nps_score,
                    date: r.created_at,
                  }));
                  return (
                    <div key={section.field} className="bg-[#12121a] border border-[#2a2a3e] rounded-2xl p-6 space-y-4">
                      <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px]" style={{ color: section.color }}>{section.icon}</span>
                        <h3 className="text-sm font-semibold text-white">{section.title}</h3>
                        <span className="text-[11px] text-gray-600 ml-auto">{answers.length}건</span>
                      </div>
                      {answers.length === 0 ? (
                        <p className="text-sm text-gray-600 text-center py-4">응답이 없습니다.</p>
                      ) : (
                        <div className="space-y-2 max-h-64 overflow-y-auto">
                          {answers.map(a => (
                            <div key={a.id} className="flex items-start gap-3 bg-[#0d0d14] rounded-xl p-3">
                              <span className={`shrink-0 w-7 h-7 rounded-md flex items-center justify-center text-[11px] font-bold text-white ${
                                a.nps <= 6 ? 'bg-red-500/30' : a.nps <= 8 ? 'bg-yellow-500/30' : 'bg-green-500/30'
                              }`}>
                                {a.nps}
                              </span>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm text-gray-300">{a.text}</p>
                                <p className="text-[10px] text-gray-600 mt-1">
                                  {new Date(a.date).toLocaleDateString('ko-KR')}
                                </p>
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

function getSUSGrade(score: number): { label: string; color: string } {
  if (score >= 80) return { label: 'A (우수)', color: '#22c55e' };
  if (score >= 68) return { label: 'B (양호)', color: '#84cc16' };
  if (score >= 51) return { label: 'C (보통)', color: '#eab308' };
  return { label: 'D (개선 필요)', color: '#ef4444' };
}
