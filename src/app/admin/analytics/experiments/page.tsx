'use client';

import { useState, useEffect, useCallback } from 'react';
import { KPICard, EmptyState, LoadingSpinner } from '@/components/analytics/shared';

interface VariantStats {
  impressions: number;
  clicks: number;
  conversions: number;
  ctr: number;
  ci?: { lower: number; upper: number };
}

interface Experiment {
  name: string;
  variants: { A: VariantStats; B: VariantStats };
  pValue: number;
  isSignificant: boolean;
  winner: 'A' | 'B' | 'Draw';
  remainingN?: number;
}

const REFRESH_INTERVAL = 30_000;

export default function ExperimentsPage() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchResults = useCallback(async () => {
    try {
      const res = await fetch('/api/ab/results');
      if (!res.ok) {
        console.error('Failed to fetch AB results:', res.status);
        setError(`HTTP ${res.status}`);
        return;
      }
      const data = await res.json();
      if (data.error && !data.experiments) {
        setError(data.error);
        return;
      }
      setExperiments(data.experiments || []);
      setError(data.error || null);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchResults();
    const interval = setInterval(fetchResults, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [fetchResults]);

  const totalImpressions = experiments.reduce(
    (sum, e) => sum + e.variants.A.impressions + e.variants.B.impressions, 0
  );

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[#00D4D4] text-[22px]">science</span>
          <h1 className="text-lg font-semibold">A/B 테스트</h1>
          <span className="text-xs text-gray-500 ml-2">
            활성 {experiments.length}개 | 노출 {totalImpressions.toLocaleString()}회
            {lastUpdated && <span> | {lastUpdated.toLocaleTimeString()}</span>}
          </span>
        </div>
        <button
          onClick={fetchResults}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-[#12121a] border border-[#1e1e2e] text-gray-400 hover:text-white hover:border-[#2a2a3e] transition-all"
        >
          <span className={`material-symbols-outlined text-[16px] ${loading ? 'animate-spin' : ''}`}>refresh</span>
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KPICard title="활성 실험" value={String(experiments.length)} icon="science" color="#00D4D4" />
        <KPICard title="총 노출" value={totalImpressions.toLocaleString()} icon="visibility" color="#3B82F6" />
        <KPICard title="유의미 결과" value={String(experiments.filter(e => e.isSignificant).length)} icon="check_circle" color="#10B981" />
        <KPICard title="진행 중" value={String(experiments.filter(e => !e.isSignificant).length)} icon="pending" color="#F59E0B" />
      </div>

      {/* Content */}
      {loading ? (
        <LoadingSpinner />
      ) : error && experiments.length === 0 ? (
        <EmptyState icon="error" message={error} />
      ) : experiments.length === 0 ? (
        <div className="text-center py-16">
          <EmptyState icon="science" message="아직 실험 데이터가 없습니다." />
          <p className="text-gray-600 text-xs mt-2">
            HTML 요소에 <code className="bg-[#1e1e2e] px-1.5 py-0.5 rounded">data-ab-test</code> 속성을 추가하면 자동 추적됩니다.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {experiments.map((exp) => (
            <ExperimentCard key={exp.name} experiment={exp} />
          ))}
        </div>
      )}

      {/* 사용법 가이드 */}
      <div className="mt-8 bg-[#12121a] border border-[#1e1e2e] rounded-xl p-5">
        <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <span className="material-symbols-outlined text-[#00D4D4] text-[16px]">help</span>
          A/B 테스트 사용법
        </h3>
        <div className="text-xs text-gray-500 space-y-1.5">
          <p>1. HTML 요소에 <code className="bg-[#0d0d14] px-1 rounded">data-ab-test=&quot;실험이름&quot;</code> 속성 추가</p>
          <p>2. B variant 텍스트: <code className="bg-[#0d0d14] px-1 rounded">data-ab-variant-b=&quot;대체 텍스트&quot;</code></p>
          <p>3. 방문자는 쿠키로 A/B에 50:50 배정 (30일 유지)</p>
          <p>4. impression/click 이벤트가 자동 추적되어 이 대시보드에 표시됩니다.</p>
        </div>
      </div>
    </div>
  );
}

function ExperimentCard({ experiment }: { experiment: Experiment }) {
  const { name, variants, pValue, isSignificant, winner, remainingN } = experiment;
  const { A, B } = variants;
  const maxCtr = Math.max(A.ctr, B.ctr, 0.01);

  return (
    <div className={`bg-[#12121a] border rounded-xl p-5 ${
      isSignificant ? 'border-green-500/30' : 'border-[#1e1e2e]'
    }`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[#00D4D4] text-[16px]">science</span>
          <h2 className="text-sm font-bold">{name}</h2>
          {isSignificant && (
            <span className="px-2 py-0.5 text-[10px] font-bold bg-green-500/20 text-green-400 rounded-full">
              유의미!
            </span>
          )}
        </div>
        <div className="text-right">
          <div className="text-[10px] text-gray-500">p-value</div>
          <div className={`text-sm font-mono font-bold ${
            pValue < 0.01 ? 'text-green-400' : pValue < 0.05 ? 'text-yellow-400' : 'text-gray-400'
          }`}>
            {pValue.toFixed(4)}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <VariantBox label="A (Control)" stats={A} isWinner={winner === 'A'} maxCtr={maxCtr} color="#00D4D4" />
        <VariantBox label="B (Variant)" stats={B} isWinner={winner === 'B'} maxCtr={maxCtr} color="#8B5CF6" />
      </div>

      <div className="mt-3 pt-3 border-t border-[#1e1e2e] text-xs text-gray-500">
        {isSignificant ? (
          <p className="text-green-400">
            {winner === 'A' ? 'A (Control)' : 'B (Variant)'} 승리! CTR 차이: {Math.abs(A.ctr - B.ctr).toFixed(2)}%p
          </p>
        ) : (
          <p>
            아직 유의미한 차이 없음.
            {(A.impressions + B.impressions) < 1000 && <span className="text-yellow-500/70"> (최소 1,000 노출 권장)</span>}
          </p>
        )}
        {!isSignificant && remainingN != null && remainingN > 0 && (
          <p className="text-yellow-400/80 mt-1">
            결론까지 약 <span className="font-bold">{remainingN.toLocaleString()}명</span> 추가 필요
          </p>
        )}
      </div>
    </div>
  );
}

function VariantBox({ label, stats, isWinner, maxCtr, color }: {
  label: string; stats: VariantStats; isWinner: boolean; maxCtr: number; color: string;
}) {
  const barWidth = maxCtr > 0 ? (stats.ctr / maxCtr) * 100 : 0;

  return (
    <div className={`p-4 rounded-lg border ${isWinner ? 'border-green-500/40' : 'border-[#1e1e2e]'} bg-[#0d0d14] relative`}>
      {isWinner && (
        <div className="absolute -top-2 -right-2 w-5 h-5 bg-green-500 rounded-full flex items-center justify-center">
          <span className="material-symbols-outlined text-[12px] text-white">check</span>
        </div>
      )}
      <div className="text-xs font-medium text-gray-400 mb-3">{label}</div>
      <div className="grid grid-cols-3 gap-2 text-center mb-3">
        <div>
          <div className="text-[10px] text-gray-600">노출</div>
          <div className="text-sm font-bold">{(stats.impressions ?? 0).toLocaleString()}</div>
        </div>
        <div>
          <div className="text-[10px] text-gray-600">클릭</div>
          <div className="text-sm font-bold">{(stats.clicks ?? 0).toLocaleString()}</div>
        </div>
        <div>
          <div className="text-[10px] text-gray-600">전환</div>
          <div className="text-sm font-bold">{(stats.conversions ?? 0).toLocaleString()}</div>
        </div>
      </div>
      <div>
        <div className="flex justify-between text-[10px] mb-1">
          <span className="text-gray-600">CTR</span>
          <span className="font-mono font-bold text-white">{(stats.ctr ?? 0).toFixed(2)}%</span>
        </div>
        <div className="h-1.5 bg-[#1e1e2e] rounded-full overflow-hidden">
          <div className="h-full rounded-full transition-all duration-500" style={{ width: `${barWidth}%`, backgroundColor: color }} />
        </div>
        {stats.ci && stats.impressions > 0 && (
          <div className="text-[9px] text-gray-600 mt-1 font-mono">
            95% CI: [{stats.ci.lower.toFixed(2)}% ~ {stats.ci.upper.toFixed(2)}%]
          </div>
        )}
      </div>
    </div>
  );
}
