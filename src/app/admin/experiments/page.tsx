'use client';

import { useState, useEffect, useCallback } from 'react';
import type { ABAnalysisResult } from '@/app/api/ai/analyze-ab/route';

interface VariantData {
  impressions: number;
  clicks: number;
  ctr: number;
}

interface ExperimentResult {
  name: string;
  status?: 'running' | 'paused' | 'completed';
  trafficAllocation?: number;
  variants: {
    A: VariantData;
    B: VariantData;
  };
  pValue: number;
  isSignificant: boolean;
  winner: 'A' | 'B' | 'Draw';
  startDate?: string;
  targetSampleSize?: number;
}

interface DailyTrend {
  date: string;
  a_impressions: number;
  a_clicks: number;
  b_impressions: number;
  b_clicks: number;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; ring: string }> = {
  running: { label: '진행중', color: 'text-green-400', bg: 'bg-green-500/10', ring: 'ring-green-500/30' },
  paused: { label: '일시정지', color: 'text-yellow-400', bg: 'bg-yellow-500/10', ring: 'ring-yellow-500/30' },
  completed: { label: '완료', color: 'text-blue-400', bg: 'bg-blue-500/10', ring: 'ring-blue-500/30' },
};

// 베이지안 A/B 테스트: Beta(a,b) 샘플링으로 P(B>A) 근사
function betaSample(alpha: number, beta: number): number {
  // Johnk's method 근사
  let x = 0, y = 0;
  while (x + y === 0 || x + y > 1) {
    const u = Math.random();
    const v = Math.random();
    x = Math.pow(u, 1 / alpha);
    y = Math.pow(v, 1 / beta);
  }
  return x / (x + y);
}

function bayesianProbBWins(aClicks: number, aImpressions: number, bClicks: number, bImpressions: number): number {
  const aAlpha = aClicks + 1, aBeta = Math.max(aImpressions - aClicks + 1, 1);
  const bAlpha = bClicks + 1, bBeta = Math.max(bImpressions - bClicks + 1, 1);
  let bWins = 0;
  const N = 5000;
  for (let i = 0; i < N; i++) {
    if (betaSample(bAlpha, bBeta) > betaSample(aAlpha, aBeta)) bWins++;
  }
  return (bWins / N) * 100;
}

export default function ExperimentsDashboard() {
  const [experiments, setExperiments] = useState<ExperimentResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiAnalysis, setAiAnalysis] = useState<Record<string, ABAnalysisResult | string>>({});
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [applyingWinner, setApplyingWinner] = useState<string | null>(null);
  const [supabaseConfigured, setSupabaseConfigured] = useState<boolean>(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [expandedExperiment, setExpandedExperiment] = useState<string | null>(null);

  const fetchResults = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch('/api/analytics/query?action=ab-results');
      if (!res.ok) {
        throw new Error(`서버 오류가 발생했습니다. (HTTP ${res.status})`);
      }
      const data = await res.json();
      if (data.error) {
        console.error('API error:', data.error);
        if (data.error.includes('Supabase configuration is missing')) {
          setSupabaseConfigured(false);
        } else {
          // Supabase 설정 외의 다른 오류 (테이블 없음, RLS 차단, 쿼리 실패 등)
          setFetchError(data.error);
        }
        setExperiments([]);
      } else {
        setSupabaseConfigured(true);
        const exps = (data.experiments || []).map((exp: ExperimentResult) => ({
          ...exp,
          status: exp.status || 'running',
          trafficAllocation: exp.trafficAllocation ?? 50,
          targetSampleSize: exp.targetSampleSize ?? 1000,
        }));
        setExperiments(exps);
      }
    } catch (err) {
      console.error('Failed to fetch experiment results:', err);
      setFetchError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
      setExperiments([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchResults();
  }, [fetchResults]);

  const runAiAnalysis = async (exp: ExperimentResult) => {
    setAnalyzing(exp.name);
    try {
      const lift = computeLift(exp);
      const prompt = `
        A/B 테스트 결과 "${exp.name}":
        변형 A (컨트롤): ${exp.variants.A.impressions}회 노출, ${exp.variants.A.clicks}회 클릭 (CTR ${exp.variants.A.ctr.toFixed(2)}%)
        변형 B (테스트): ${exp.variants.B.impressions}회 노출, ${exp.variants.B.clicks}회 클릭 (CTR ${exp.variants.B.ctr.toFixed(2)}%)
        P-Value: ${exp.pValue}
        통계적 유의성: ${exp.isSignificant ? '예' : '아니오'}
        효과 크기 (리프트): ${lift.toFixed(2)}%

        한국어로 간결한 분석과 권장사항을 제공해주세요.
      `;

      const res = await fetch('/api/ai/analyze-ab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      const data = await res.json();
      setAiAnalysis(prev => ({ ...prev, [exp.name]: data.structured ?? data.analysis }));
    } catch (err) {
      console.error('AI analysis failed:', err);
      setAiAnalysis(prev => ({ ...prev, [exp.name]: 'AI 분석을 가져오는 데 실패했습니다.' }));
    } finally {
      setAnalyzing(null);
    }
  };

  const handlePause = async (expName: string) => {
    try {
      await fetch('/api/ab-experiments/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: expName, status: 'paused' }),
      });
      setExperiments(prev =>
        prev.map(e => e.name === expName ? { ...e, status: 'paused' as const } : e)
      );
    } catch (err) {
      console.error('Failed to pause experiment:', err);
    }
  };

  const handleResume = async (expName: string) => {
    try {
      await fetch('/api/ab-experiments/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: expName, status: 'running' }),
      });
      setExperiments(prev =>
        prev.map(e => e.name === expName ? { ...e, status: 'running' as const } : e)
      );
    } catch (err) {
      console.error('Failed to resume experiment:', err);
    }
  };

  const handleEnd = async (expName: string) => {
    if (!confirm(`"${expName}" 실험을 종료하시겠습니까? 종료 후 데이터 수집이 중단됩니다.`)) return;
    try {
      await fetch('/api/ab-experiments/update-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: expName, status: 'completed' }),
      });
      setExperiments(prev =>
        prev.map(e => e.name === expName ? { ...e, status: 'completed' as const } : e)
      );
    } catch (err) {
      console.error('Failed to end experiment:', err);
    }
  };

  const handleApplyWinner = async (expName: string, winner: 'A' | 'B') => {
    if (!confirm(`"${expName}" 실험의 승자 변형 ${winner}를 적용하시겠습니까?\n이후 모든 사용자가 변형 ${winner}를 보게 됩니다.`)) return;
    setApplyingWinner(expName);
    try {
      const res = await fetch('/api/ab-experiments/apply-winner', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: expName, winner }),
      });
      if (res.ok) {
        setExperiments(prev =>
          prev.map(e => e.name === expName ? { ...e, status: 'completed' as const } : e)
        );
        alert(`변형 ${winner}가 성공적으로 적용되었습니다.`);
      } else {
        alert('승자 적용에 실패했습니다. API를 확인해주세요.');
      }
    } catch (err) {
      console.error('Failed to apply winner:', err);
      alert('오류가 발생했습니다.');
    } finally {
      setApplyingWinner(null);
    }
  };

  const computeLift = (exp: ExperimentResult): number => {
    const ctrA = exp.variants.A.ctr;
    const ctrB = exp.variants.B.ctr;
    if (ctrA === 0) return ctrB > 0 ? 100 : 0;
    return ((ctrB - ctrA) / ctrA) * 100;
  };

  const computeConfidenceInterval = (exp: ExperimentResult): { lower: number; upper: number } => {
    const pA = exp.variants.A.ctr / 100;
    const pB = exp.variants.B.ctr / 100;
    const nA = exp.variants.A.impressions || 1;
    const nB = exp.variants.B.impressions || 1;
    const diff = pB - pA;
    const se = Math.sqrt((pA * (1 - pA)) / nA + (pB * (1 - pB)) / nB);
    const z = 1.96; // 95% CI
    return {
      lower: Math.round((diff - z * se) * 10000) / 100,
      upper: Math.round((diff + z * se) * 10000) / 100,
    };
  };

  const getSampleProgress = (exp: ExperimentResult): number => {
    const total = exp.variants.A.impressions + exp.variants.B.impressions;
    const target = exp.targetSampleSize || 1000;
    return Math.min(100, Math.round((total / target) * 100));
  };

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white">
      <header className="border-b border-[#222] px-6 py-4 flex items-center justify-between sticky top-0 bg-[#0d0d0d]/95 backdrop-blur-sm z-50">
        <div className="flex items-center gap-3">
          <a href="/admin/analytics" className="text-gray-400 hover:text-white transition-colors">
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </a>
          <span className="material-symbols-outlined text-[#00D4D4] text-[24px]">science</span>
          <h1 className="text-lg font-semibold">A/B 테스트 대시보드</h1>
          {experiments.length > 0 && (
            <span className="text-xs text-gray-500 ml-2">
              {experiments.filter(e => e.status === 'running').length}개 진행중
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <a
            href="/admin/experiments/create"
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs bg-[#00D4D4] text-black font-bold hover:bg-[#00b8b8] transition-all"
          >
            <span className="material-symbols-outlined text-[16px]">add</span>
            새 실험 생성
          </a>
          <button
            onClick={fetchResults}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs bg-[#1a1a1a] border border-[#222] text-gray-400 hover:text-white hover:border-[#444] transition-all"
          >
            <span className={`material-symbols-outlined text-[16px] ${loading ? 'animate-spin' : ''}`}>refresh</span>
            새로고침
          </button>
        </div>
      </header>

      <main className="p-8 max-w-7xl mx-auto">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-4">
            <span className="material-symbols-outlined text-[48px] text-[#00D4D4] animate-spin">refresh</span>
            <p className="text-gray-500 text-sm animate-pulse">실험 데이터를 불러오는 중...</p>
          </div>
        ) : !supabaseConfigured ? (
          <div className="text-center py-16 bg-[#2a1a1a] rounded-2xl border border-red-900/30 px-6">
            <span className="material-symbols-outlined text-[48px] text-red-500 mb-4">database_off</span>
            <h2 className="text-xl font-bold text-white mb-2">Supabase 설정이 필요합니다</h2>
            <p className="text-gray-400 text-sm mb-6 max-w-md mx-auto">
              A/B 테스트 데이터를 저장하고 불러오려면 Supabase 데이터베이스 연결이 필요합니다.
              <code className="bg-black/50 px-2 py-1 rounded mx-1">.env.local</code> 파일에 설정을 추가해주세요.
            </p>
            <a
              href="https://supabase.com"
              target="_blank"
              className="inline-flex items-center gap-2 text-[#00D4D4] hover:underline text-sm font-medium"
            >
              Supabase 공식 문서 확인하기
              <span className="material-symbols-outlined text-[16px]">open_in_new</span>
            </a>
          </div>
        ) : fetchError ? (
          <div className="text-center py-16 bg-[#1a1a1a] rounded-2xl border border-orange-900/30 px-6">
            <span className="material-symbols-outlined text-[48px] text-orange-500 mb-4">warning</span>
            <h2 className="text-xl font-bold text-white mb-2">데이터를 불러오지 못했습니다</h2>
            <p className="text-gray-400 text-sm mb-4 max-w-lg mx-auto">
              Supabase 연결 또는 테이블 설정을 확인해주세요.
            </p>
            <pre className="text-orange-400 text-xs font-mono bg-black/40 px-4 py-3 rounded-lg mb-4 max-w-lg mx-auto text-left whitespace-pre-wrap break-all">
              {fetchError}
            </pre>
            <p className="text-gray-600 text-xs mb-4">
              <code className="bg-black/50 px-1.5 py-0.5 rounded">ab_experiments</code> 및 <code className="bg-black/50 px-1.5 py-0.5 rounded">ab_events</code> 테이블이 Supabase에 존재하고 RLS 정책이 올바른지 확인하세요.
            </p>
            <button
              onClick={fetchResults}
              className="inline-flex items-center gap-2 text-[#00D4D4] hover:underline text-sm font-medium"
            >
              <span className="material-symbols-outlined text-[16px]">refresh</span>
              다시 시도
            </button>
          </div>
        ) : experiments.length === 0 ? (
          <div className="text-center py-20 bg-[#1a1a1a] rounded-2xl border border-[#222]">
            <span className="material-symbols-outlined text-[48px] text-gray-600 mb-4">analytics</span>
            <p className="text-gray-400">활성화된 실험이 없습니다.</p>
            <p className="text-xs text-gray-600 mt-2">새 실험을 생성하거나 랜딩페이지 요소에 data-ab-test 속성을 추가하여 실험을 시작하세요.</p>
          </div>
        ) : (
          <div className="grid gap-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <SummaryCard
                icon="science"
                label="전체 실험"
                value={experiments.length}
                color="#00D4D4"
              />
              <SummaryCard
                icon="play_circle"
                label="진행중"
                value={experiments.filter(e => e.status === 'running').length}
                color="#4ade80"
              />
              <SummaryCard
                icon="check_circle"
                label="유의미한 결과"
                value={experiments.filter(e => e.isSignificant).length}
                color="#a78bfa"
              />
              <SummaryCard
                icon="trending_up"
                label="평균 리프트"
                value={`${(experiments.reduce((s, e) => s + computeLift(e), 0) / Math.max(experiments.length, 1)).toFixed(1)}%`}
                color="#f59e0b"
              />
            </div>

            {/* Experiment Cards */}
            {experiments.map(exp => {
              const lift = computeLift(exp);
              const ci = computeConfidenceInterval(exp);
              const sampleProgress = getSampleProgress(exp);
              const statusConfig = STATUS_CONFIG[exp.status || 'running'];
              const isExpanded = expandedExperiment === exp.name;

              const bayesianProb = bayesianProbBWins(
                exp.variants.A.clicks, exp.variants.A.impressions,
                exp.variants.B.clicks, exp.variants.B.impressions
              );

              return (
                <div key={exp.name} className="bg-[#1a1a1a] border border-[#222] rounded-2xl overflow-hidden shadow-xl">
                  {/* Header */}
                  <div className="bg-[#161616] px-6 py-4 flex items-center justify-between border-b border-[#222]">
                    <div className="flex items-center gap-3">
                      <span className="material-symbols-outlined text-[18px] text-[#00D4D4]">biotech</span>
                      <h3 className="font-bold text-white">{exp.name}</h3>
                      <span className={`${statusConfig.bg} ${statusConfig.color} text-[10px] font-bold px-2.5 py-0.5 rounded-full ring-1 ${statusConfig.ring}`}>
                        {statusConfig.label}
                      </span>
                      {exp.isSignificant && (
                        <span className="bg-purple-500/10 text-purple-400 text-[10px] font-bold px-2.5 py-0.5 rounded-full ring-1 ring-purple-500/30">
                          통계적으로 유의미
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-gray-500 font-mono mr-2">
                        트래픽: {exp.trafficAllocation || 50}/{100 - (exp.trafficAllocation || 50)}
                      </span>
                      {exp.status === 'running' && (
                        <button
                          onClick={() => handlePause(exp.name)}
                          className="text-[10px] px-3 py-1.5 rounded-lg bg-yellow-500/10 text-yellow-400 font-bold hover:bg-yellow-500/20 ring-1 ring-yellow-500/20 transition-all"
                        >
                          일시정지
                        </button>
                      )}
                      {exp.status === 'paused' && (
                        <button
                          onClick={() => handleResume(exp.name)}
                          className="text-[10px] px-3 py-1.5 rounded-lg bg-green-500/10 text-green-400 font-bold hover:bg-green-500/20 ring-1 ring-green-500/20 transition-all"
                        >
                          재개
                        </button>
                      )}
                      {exp.status !== 'completed' && (
                        <button
                          onClick={() => handleEnd(exp.name)}
                          className="text-[10px] px-3 py-1.5 rounded-lg bg-red-500/10 text-red-400 font-bold hover:bg-red-500/20 ring-1 ring-red-500/20 transition-all"
                        >
                          실험 종료
                        </button>
                      )}
                      <button
                        onClick={() => setExpandedExperiment(isExpanded ? null : exp.name)}
                        className="text-gray-500 hover:text-white transition-colors ml-1"
                      >
                        <span className="material-symbols-outlined text-[18px]">
                          {isExpanded ? 'expand_less' : 'expand_more'}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Main Content */}
                  <div className="p-6">
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                      {/* Variant Comparison */}
                      <div className="lg:col-span-2 space-y-4">
                        {/* Stats Table */}
                        <div className="grid grid-cols-5 text-[10px] font-bold text-gray-500 uppercase tracking-widest px-3">
                          <div>변형</div>
                          <div className="text-right">노출수</div>
                          <div className="text-right">클릭수</div>
                          <div className="text-right text-[#00D4D4]">CTR (%)</div>
                          <div className="text-right">전환</div>
                        </div>

                        <VariantRow
                          label="A (컨트롤)"
                          stats={exp.variants.A}
                          isWinner={exp.winner === 'A'}
                          allocation={exp.trafficAllocation || 50}
                        />
                        <VariantRow
                          label="B (테스트)"
                          stats={exp.variants.B}
                          isWinner={exp.winner === 'B'}
                          allocation={100 - (exp.trafficAllocation || 50)}
                        />

                        {/* Lift and Confidence */}
                        <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-3">
                          <div className="bg-black/30 rounded-xl p-4 border border-[#222]">
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">효과 크기 (리프트)</p>
                            <p className={`text-xl font-black font-mono ${lift > 0 ? 'text-green-400' : lift < 0 ? 'text-red-400' : 'text-gray-400'}`}>
                              {lift > 0 ? '+' : ''}{lift.toFixed(2)}%
                            </p>
                          </div>
                          <div className="bg-black/30 rounded-xl p-4 border border-[#222]">
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">신뢰구간 (95%)</p>
                            <p className="text-sm font-mono text-gray-300">
                              [{ci.lower.toFixed(2)}%, {ci.upper.toFixed(2)}%]
                            </p>
                          </div>
                          <div className="bg-black/30 rounded-xl p-4 border border-[#222]">
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">P-Value</p>
                            <p className="text-sm font-mono text-gray-300">
                              {exp.pValue}
                              <span className="text-[10px] text-gray-600 ml-2">
                                ({((1 - exp.pValue) * 100).toFixed(1)}%)
                              </span>
                            </p>
                          </div>
                          <div className="bg-black/30 rounded-xl p-4 border border-[#222]">
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1">P(B&gt;A) 베이지안</p>
                            <p className={`text-xl font-black font-mono ${bayesianProb >= 95 ? 'text-green-400' : bayesianProb >= 80 ? 'text-yellow-400' : 'text-gray-400'}`}>
                              {bayesianProb.toFixed(1)}%
                            </p>
                          </div>
                        </div>

                        {/* Apply Winner Button */}
                        {(exp.isSignificant || bayesianProb >= 95) && exp.winner !== 'Draw' && exp.status !== 'completed' && (
                          <div className="mt-3 flex justify-end">
                            <button
                              onClick={() => handleApplyWinner(exp.name, exp.winner as 'A' | 'B')}
                              disabled={applyingWinner === exp.name}
                              className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs bg-purple-500/10 text-purple-400 font-bold hover:bg-purple-500/20 ring-1 ring-purple-500/30 transition-all disabled:opacity-50"
                            >
                              <span className="material-symbols-outlined text-[14px]">trophy</span>
                              {applyingWinner === exp.name ? '적용 중...' : `변형 ${exp.winner} 승자 적용`}
                            </button>
                          </div>
                        )}

                        {/* Sample Size Progress */}
                        <div className="bg-black/30 rounded-xl p-4 border border-[#222]">
                          <div className="flex items-center justify-between mb-2">
                            <p className="text-[10px] text-gray-500 uppercase tracking-wider">표본 크기 진행도</p>
                            <p className="text-[10px] text-gray-400 font-mono">
                              {(exp.variants.A.impressions + exp.variants.B.impressions).toLocaleString()} / {(exp.targetSampleSize || 1000).toLocaleString()}
                            </p>
                          </div>
                          <div className="w-full bg-[#222] rounded-full h-2">
                            <div
                              className="h-2 rounded-full transition-all duration-500"
                              style={{
                                width: `${sampleProgress}%`,
                                backgroundColor: sampleProgress >= 100 ? '#4ade80' : sampleProgress >= 50 ? '#00D4D4' : '#f59e0b',
                              }}
                            />
                          </div>
                          <p className="text-[10px] text-gray-600 mt-1">
                            {sampleProgress >= 100
                              ? '충분한 표본이 수집되었습니다'
                              : `통계적 유의성을 위해 ${100 - sampleProgress}% 더 필요합니다`}
                          </p>
                        </div>
                      </div>

                      {/* AI Analysis Section */}
                      <div className="bg-black/30 rounded-xl p-5 border border-[#222] flex flex-col">
                        <div className="flex items-center justify-between mb-4">
                          <h4 className="text-xs font-bold text-gray-400 flex items-center gap-2">
                            <span className="material-symbols-outlined text-[16px]">psychology</span>
                            AI 인사이트 분석
                          </h4>
                          <button
                            onClick={() => runAiAnalysis(exp)}
                            disabled={analyzing === exp.name}
                            className="text-[10px] bg-[#00D4D4] text-black px-3 py-1.5 rounded-lg font-bold hover:bg-[#00b8b8] disabled:opacity-50 transition-all"
                          >
                            {analyzing === exp.name ? '분석 중...' : 'AI 분석하기'}
                          </button>
                        </div>

                        <div className="flex-1 overflow-y-auto">
                          {aiAnalysis[exp.name] ? (
                            typeof aiAnalysis[exp.name] === 'object' ? (
                              <AIResultCard result={aiAnalysis[exp.name] as ABAnalysisResult} />
                            ) : (
                              <p className="text-sm text-gray-300 whitespace-pre-wrap">{aiAnalysis[exp.name] as string}</p>
                            )
                          ) : (
                            <div className="flex flex-col items-center justify-center py-8 text-center">
                              <span className="material-symbols-outlined text-[32px] text-gray-700 mb-2">auto_awesome</span>
                              <p className="text-gray-600 text-xs">AI 분석 버튼을 클릭하여<br />데이터 기반 인사이트를 확인하세요</p>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Expanded: Daily Trend Chart */}
                    {isExpanded && (
                      <div className="mt-6 bg-black/30 rounded-xl p-5 border border-[#222]">
                        <h4 className="text-xs font-bold text-gray-400 mb-4 flex items-center gap-2">
                          <span className="material-symbols-outlined text-[16px]">show_chart</span>
                          일별 트렌드 (최근 7일)
                        </h4>
                        <DailyTrendChart experiment={exp} />
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

const VERDICT_CONFIG: Record<string, { color: string; bg: string; ring: string; icon: string }> = {
  'B 채택 권장':    { color: 'text-green-400',  bg: 'bg-green-500/10',  ring: 'ring-green-500/30',  icon: 'thumb_up' },
  'A 유지 권장':    { color: 'text-yellow-400', bg: 'bg-yellow-500/10', ring: 'ring-yellow-500/30', icon: 'thumb_down' },
  '데이터 부족':    { color: 'text-gray-400',   bg: 'bg-gray-500/10',  ring: 'ring-gray-500/30',  icon: 'hourglass_empty' },
  '무의미한 차이':  { color: 'text-blue-400',   bg: 'bg-blue-500/10',  ring: 'ring-blue-500/30',  icon: 'remove' },
};
const CONFIDENCE_CONFIG: Record<string, { color: string }> = {
  '높음(95%+)':    { color: 'text-green-400' },
  '중간(80-95%)': { color: 'text-yellow-400' },
  '낮음(80% 미만)': { color: 'text-red-400' },
};
const PRIORITY_CONFIG: Record<string, { color: string; bg: string }> = {
  '즉시': { color: 'text-red-400',    bg: 'bg-red-500/10' },
  '단기': { color: 'text-yellow-400', bg: 'bg-yellow-500/10' },
  '장기': { color: 'text-blue-400',   bg: 'bg-blue-500/10' },
};

function AIResultCard({ result }: { result: ABAnalysisResult }) {
  const vc = VERDICT_CONFIG[result.verdict] ?? VERDICT_CONFIG['데이터 부족'];
  const cc = CONFIDENCE_CONFIG[result.confidence] ?? { color: 'text-gray-400' };
  return (
    <div className="space-y-3 text-xs">
      {/* Verdict + Confidence */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`flex items-center gap-1 px-2.5 py-1 rounded-full font-bold ring-1 ${vc.bg} ${vc.color} ${vc.ring}`}>
          <span className="material-symbols-outlined text-[13px]">{vc.icon}</span>
          {result.verdict}
        </span>
        <span className={`font-mono text-[10px] ${cc.color}`}>신뢰도: {result.confidence}</span>
      </div>
      {/* Summary */}
      <p className="text-gray-300 leading-relaxed">{result.summary}</p>
      {/* Insights */}
      {result.insights?.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">인사이트</p>
          <ul className="space-y-1">
            {result.insights.map((ins, i) => (
              <li key={i} className="flex gap-2 text-gray-400">
                <span className="text-[#00D4D4] mt-0.5 shrink-0">•</span>
                <span>{ins}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {/* Actions */}
      {result.actions?.length > 0 && (
        <div>
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1.5">액션 아이템</p>
          <div className="space-y-1.5">
            {result.actions.map((act, i) => {
              const pc = PRIORITY_CONFIG[act.priority] ?? { color: 'text-gray-400', bg: 'bg-gray-500/10' };
              return (
                <div key={i} className="flex gap-2 items-start">
                  <span className={`shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded ${pc.bg} ${pc.color}`}>{act.priority}</span>
                  <div className="min-w-0">
                    <p className="text-gray-300">{act.action}</p>
                    <p className="text-[10px] text-gray-500">{act.expected_impact}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      {/* Next Test */}
      {result.next_test && (
        <div className="mt-2 pt-2 border-t border-[#222]">
          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">다음 테스트 제안</p>
          <p className="text-gray-400 italic">{result.next_test}</p>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ icon, label, value, color }: { icon: string; label: string; value: string | number; color: string }) {
  return (
    <div className="bg-[#1a1a1a] border border-[#222] rounded-xl p-4 flex items-center gap-4">
      <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}15` }}>
        <span className="material-symbols-outlined text-[20px]" style={{ color }}>{icon}</span>
      </div>
      <div>
        <p className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</p>
        <p className="text-xl font-bold text-white">{value}</p>
      </div>
    </div>
  );
}

function VariantRow({ label, stats, isWinner, allocation }: { label: string; stats: VariantData; isWinner: boolean; allocation: number }) {
  return (
    <div className={`grid grid-cols-5 items-center px-3 py-4 rounded-xl border transition-all ${
      isWinner ? 'bg-[#00D4D4]/5 border-[#00D4D4]/30 shadow-[0_0_15px_rgba(0,212,212,0.05)]' : 'bg-black/20 border-transparent'
    }`}>
      <div className="font-bold text-sm flex items-center gap-2">
        {label}
        {isWinner && <span className="text-[9px] text-[#00D4D4] bg-[#00D4D4]/10 px-1.5 py-0.5 rounded-full font-bold">Winner</span>}
      </div>
      <div className="text-right text-sm text-gray-400 font-mono">{stats.impressions.toLocaleString()}</div>
      <div className="text-right text-sm text-gray-400 font-mono">{stats.clicks.toLocaleString()}</div>
      <div className={`text-right font-black text-base font-mono ${isWinner ? 'text-[#00D4D4]' : 'text-gray-300'}`}>
        {stats.ctr.toFixed(2)}%
      </div>
      <div className="text-right text-[10px] text-gray-500 font-mono">
        {allocation}% 트래픽
      </div>
    </div>
  );
}

function DailyTrendChart({ experiment }: { experiment: ExperimentResult }) {
  // Generate simulated daily data based on total counts
  // In production, this would come from the API with daily breakdowns
  const days = 7;
  const totalA = experiment.variants.A.impressions;
  const totalB = experiment.variants.B.impressions;
  const clicksA = experiment.variants.A.clicks;
  const clicksB = experiment.variants.B.clicks;

  const dailyData: DailyTrend[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(Date.now() - i * 86400000);
    const dateStr = `${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const weight = 0.8 + Math.random() * 0.4;
    dailyData.push({
      date: dateStr,
      a_impressions: Math.round((totalA / days) * weight),
      a_clicks: Math.round((clicksA / days) * weight),
      b_impressions: Math.round((totalB / days) * weight),
      b_clicks: Math.round((clicksB / days) * weight),
    });
  }

  const maxVal = Math.max(
    ...dailyData.map(d => Math.max(d.a_impressions, d.b_impressions)),
    1
  );

  return (
    <div>
      <div className="flex gap-6 mb-3">
        <div className="flex items-center gap-2 text-[10px]">
          <div className="w-3 h-3 rounded-sm bg-[#00D4D4]" />
          <span className="text-gray-400">A 노출</span>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <div className="w-3 h-3 rounded-sm bg-[#a78bfa]" />
          <span className="text-gray-400">B 노출</span>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <div className="w-3 h-3 rounded-sm bg-[#00D4D4]/40" />
          <span className="text-gray-400">A 클릭</span>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          <div className="w-3 h-3 rounded-sm bg-[#a78bfa]/40" />
          <span className="text-gray-400">B 클릭</span>
        </div>
      </div>
      <div className="flex items-end gap-1 h-32">
        {dailyData.map((d, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-0.5">
            <div className="w-full flex gap-0.5" style={{ height: '100px' }}>
              <div className="flex-1 flex flex-col justify-end gap-[1px]">
                <div
                  className="w-full bg-[#00D4D4] rounded-t-sm opacity-80"
                  style={{ height: `${(d.a_impressions / maxVal) * 100}%` }}
                  title={`A 노출: ${d.a_impressions}`}
                />
              </div>
              <div className="flex-1 flex flex-col justify-end gap-[1px]">
                <div
                  className="w-full bg-[#a78bfa] rounded-t-sm opacity-80"
                  style={{ height: `${(d.b_impressions / maxVal) * 100}%` }}
                  title={`B 노출: ${d.b_impressions}`}
                />
              </div>
            </div>
            <span className="text-[9px] text-gray-600 mt-1">{d.date}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
