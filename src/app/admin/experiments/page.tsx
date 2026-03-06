'use client';

import { useState, useEffect, useCallback } from 'react';

interface ExperimentResult {
  name: string;
  variants: {
    A: { impressions: number; clicks: number; ctr: number };
    B: { impressions: number; clicks: number; ctr: number };
  };
  pValue: number;
  isSignificant: boolean;
  winner: 'A' | 'B' | 'Draw';
}

export default function ExperimentsDashboard() {
  const [experiments, setExperiments] = useState<ExperimentResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [aiAnalysis, setAiAnalysis] = useState<Record<string, string>>({});
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [supabaseConfigured, setSupabaseConfigured] = useState<boolean>(true);

  const fetchResults = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/analytics/query?action=ab-results');
      if (!res.ok) {
        throw new Error(`HTTP error! status: ${res.status}`);
      }
      const data = await res.json();
      if (data.error) {
        console.error('API error:', data.error);
        if (data.error.includes('Supabase configuration is missing')) {
          setSupabaseConfigured(false);
        }
        setExperiments([]);
      } else {
        setSupabaseConfigured(true);
        setExperiments(data.experiments || []);
      }
    } catch (err) {
      console.error('Failed to fetch experiment results:', err);
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
      // In a real app, you would send the data to Gemini/GPT
      const prompt = `
        A/B Test Results for "${exp.name}":
        Variant A (Control): ${exp.variants.A.impressions} views, ${exp.variants.A.clicks} clicks (${exp.variants.A.ctr.toFixed(2)}% CTR)
        Variant B (Test): ${exp.variants.B.impressions} views, ${exp.variants.B.clicks} clicks (${exp.variants.B.ctr.toFixed(2)}% CTR)
        P-Value: ${exp.pValue}
        Statistical Significance: ${exp.isSignificant ? 'Yes' : 'No'}
        
        Please provide a concise analysis and recommendation.
      `;

      const res = await fetch('/api/ai/analyze-ab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt }),
      });

      const data = await res.json();
      setAiAnalysis(prev => ({ ...prev, [exp.name]: data.analysis }));
    } catch (err) {
      console.error('AI analysis failed:', err);
      setAiAnalysis(prev => ({ ...prev, [exp.name]: 'AI 분석을 가져오는 데 실패했습니다.' }));
    } finally {
      setAnalyzing(null);
    }
  };

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white">
      <header className="border-b border-[#222] px-6 py-4 flex items-center justify-between sticky top-0 bg-[#0d0d0d] z-50">
        <div className="flex items-center gap-3">
          <a href="/admin/analytics" className="text-gray-400 hover:text-white transition-colors">
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </a>
          <span className="material-symbols-outlined text-[#00D4D4] text-[24px]">science</span>
          <h1 className="text-lg font-semibold">A/B 테스트 대시보드</h1>
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

      <main className="p-8 max-w-6xl mx-auto">
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
        ) : experiments.length === 0 ? (
          <div className="text-center py-20 bg-[#1a1a1a] rounded-2xl border border-[#222]">
            <span className="material-symbols-outlined text-[48px] text-gray-600 mb-4">analytics</span>
            <p className="text-gray-400">활성화된 실험이 없습니다.</p>
            <p className="text-xs text-gray-600 mt-2">랜딩페이지 요소에 data-ab-test 속성을 추가하여 실험을 시작하세요.</p>
          </div>
        ) : (
          <div className="grid gap-8">
            {experiments.map(exp => (
              <div key={exp.name} className="bg-[#1a1a1a] border border-[#222] rounded-2xl overflow-hidden shadow-xl">
                <div className="bg-[#222] px-6 py-4 flex items-center justify-between">
                  <h3 className="font-bold text-[#00D4D4] flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px]">biotech</span>
                    {exp.name}
                  </h3>
                  {exp.isSignificant && (
                    <span className="bg-[#00D4D4]/20 text-[#00D4D4] text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-tighter ring-1 ring-[#00D4D4]/30">
                      통계적으로 유의미!
                    </span>
                  )}
                </div>

                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-8">
                  {/* Stats Table */}
                  <div className="space-y-4">
                    <div className="grid grid-cols-4 text-[10px] font-bold text-gray-500 uppercase tracking-widest px-2">
                      <div className="col-span-1">Variant</div>
                      <div className="text-right">Views</div>
                      <div className="text-right">Clicks</div>
                      <div className="text-right text-[#00D4D4]">CTR (%)</div>
                    </div>

                    <VariantRow
                      label="A (Control)"
                      stats={exp.variants.A}
                      isWinner={exp.winner === 'A'}
                    />
                    <VariantRow
                      label="B (Test)"
                      stats={exp.variants.B}
                      isWinner={exp.winner === 'B'}
                    />

                    <div className="pt-4 border-t border-[#333] flex items-center justify-between text-[11px] text-gray-500 font-mono">
                      <span>p-value: {exp.pValue}</span>
                      <span>Confidence: {((1 - exp.pValue) * 100).toFixed(1)}%</span>
                    </div>
                  </div>

                  {/* AI Analysis Section */}
                  <div className="bg-black/30 rounded-xl p-6 border border-[#222] flex flex-col h-full">
                    <div className="flex items-center justify-between mb-4">
                      <h4 className="text-xs font-bold text-gray-400 flex items-center gap-2">
                        <span className="material-symbols-outlined text-[16px]">psychology</span>
                        AI 인사이트 분석
                      </h4>
                      <button
                        onClick={() => runAiAnalysis(exp)}
                        disabled={analyzing === exp.name}
                        className="text-[10px] bg-[#00D4D4] text-black px-2 py-1 rounded font-bold hover:bg-[#00b8b8] disabled:opacity-50"
                      >
                        {analyzing === exp.name ? '분석 중...' : 'AI 분석하기'}
                      </button>
                    </div>

                    <div className="flex-1 text-sm text-gray-300 leading-relaxed italic">
                      {aiAnalysis[exp.name] ? (
                        <p>{aiAnalysis[exp.name]}</p>
                      ) : (
                        <p className="text-gray-600 text-center py-8">결과 데이터를 기반으로 최적의 인사이트를 제안합니다.</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function VariantRow({ label, stats, isWinner }: { label: string, stats: any, isWinner: boolean }) {
  return (
    <div className={`grid grid-cols-4 items-center px-3 py-4 rounded-xl border transition-all ${isWinner ? 'bg-[#00D4D4]/5 border-[#00D4D4]/30 shadow-[0_0_15px_rgba(0,212,212,0.05)]' : 'bg-black/20 border-transparent'
      }`}>
      <div className="font-bold text-sm">
        {label}
        {isWinner && <span className="ml-2 text-[10px] text-[#00D4D4]">Winner 🏆</span>}
      </div>
      <div className="text-right text-sm text-gray-400 font-mono">{stats.impressions.toLocaleString()}</div>
      <div className="text-right text-sm text-gray-400 font-mono">{stats.clicks.toLocaleString()}</div>
      <div className={`text-right font-black text-base font-mono ${isWinner ? 'text-[#00D4D4]' : 'text-gray-300'}`}>
        {stats.ctr.toFixed(2)}%
      </div>
    </div>
  );
}
