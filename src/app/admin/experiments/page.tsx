'use client';

import { useState, useEffect, useCallback } from 'react';

// ── Types ──────────────────────────────────────────────
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

// ── Constants ──────────────────────────────────────────
const REFRESH_INTERVAL = 30_000; // 30초마다 자동 새로고침

export default function ExperimentsPage() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchResults = useCallback(async () => {
    try {
      const res = await fetch('/api/ab/results');
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
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="border-b border-gray-800 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">A/B 테스트 대시보드</h1>
            <p className="text-sm text-gray-400 mt-1">
              활성 실험 {experiments.length}개 | 총 노출 {totalImpressions.toLocaleString()}회
              {lastUpdated && (
                <span className="ml-2">
                  | 마지막 업데이트: {lastUpdated.toLocaleTimeString()}
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={fetchResults}
              className="px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-base">refresh</span>
              새로고침
            </button>
            <a
              href="/admin/analytics"
              className="px-3 py-1.5 text-sm bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
            >
              Analytics
            </a>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-6xl mx-auto px-6 py-8">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="animate-spin w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full" />
            <span className="ml-3 text-gray-400">데이터 로딩 중...</span>
          </div>
        ) : error && experiments.length === 0 ? (
          <div className="text-center py-20">
            <span className="material-symbols-outlined text-5xl text-gray-600">error</span>
            <p className="text-gray-400 mt-4">{error}</p>
            <p className="text-gray-500 text-sm mt-2">
              Supabase에 ab_events 테이블이 있는지 확인하세요.
            </p>
          </div>
        ) : experiments.length === 0 ? (
          <div className="text-center py-20">
            <span className="material-symbols-outlined text-5xl text-gray-600">science</span>
            <p className="text-gray-400 mt-4">아직 실험 데이터가 없습니다.</p>
            <p className="text-gray-500 text-sm mt-2">
              랜딩페이지에 <code className="bg-gray-800 px-1.5 py-0.5 rounded">data-ab-test</code> 속성을 추가하면 자동으로 추적이 시작됩니다.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {experiments.map((exp) => (
              <ExperimentCard key={exp.name} experiment={exp} />
            ))}
          </div>
        )}

        {/* 설계 가이드 */}
        <div className="mt-12 p-6 bg-gray-900/50 border border-gray-800 rounded-xl">
          <h3 className="text-lg font-semibold mb-3 flex items-center gap-2">
            <span className="material-symbols-outlined text-cyan-400">help</span>
            A/B 테스트 사용법
          </h3>
          <div className="text-sm text-gray-400 space-y-2">
            <p>1. HTML 요소에 <code className="bg-gray-800 px-1 rounded">data-ab-test=&quot;실험이름&quot;</code> 속성 추가</p>
            <p>2. B variant 텍스트: <code className="bg-gray-800 px-1 rounded">data-ab-variant-b=&quot;대체 텍스트&quot;</code></p>
            <p>3. 방문자는 쿠키로 A/B에 50:50 배정 (30일 유지)</p>
            <p>4. impression/click 이벤트가 자동 추적되어 이 대시보드에 표시됩니다.</p>
          </div>
        </div>
      </main>
    </div>
  );
}

// ── Experiment Card ────────────────────────────────────
function ExperimentCard({ experiment }: { experiment: Experiment }) {
  const { name, variants, pValue, isSignificant, winner, remainingN } = experiment;
  const { A, B } = variants;

  const maxCtr = Math.max(A.ctr, B.ctr, 0.01); // 0 나누기 방지

  return (
    <div className={`p-6 rounded-xl border ${
      isSignificant
        ? 'border-green-500/30 bg-green-500/5'
        : 'border-gray-800 bg-gray-900/50'
    }`}>
      {/* Title Row */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-cyan-400">science</span>
          <h2 className="text-lg font-semibold">{name}</h2>
          {isSignificant && (
            <span className="px-2 py-0.5 text-xs font-medium bg-green-500/20 text-green-400 rounded-full">
              통계적으로 유의미!
            </span>
          )}
        </div>
        <div className="text-right">
          <div className="text-sm text-gray-400">p-value</div>
          <div className={`text-lg font-mono font-bold ${
            pValue < 0.01 ? 'text-green-400' :
            pValue < 0.05 ? 'text-yellow-400' :
            'text-gray-400'
          }`}>
            {pValue.toFixed(4)}
          </div>
        </div>
      </div>

      {/* Variants Comparison */}
      <div className="grid grid-cols-2 gap-4">
        <VariantBox
          label="A (Control)"
          stats={A}
          isWinner={winner === 'A'}
          maxCtr={maxCtr}
          color="cyan"
        />
        <VariantBox
          label="B (Variant)"
          stats={B}
          isWinner={winner === 'B'}
          maxCtr={maxCtr}
          color="violet"
        />
      </div>

      {/* Significance Explanation + Remaining Sample */}
      <div className="mt-4 pt-3 border-t border-gray-800 text-sm text-gray-500 space-y-1">
        {isSignificant ? (
          <p className="text-green-400">
            {winner === 'A' ? 'A (Control)' : 'B (Variant)'} 승리!
            {' '}CTR 차이: {Math.abs(A.ctr - B.ctr).toFixed(2)}%p
            {pValue < 0.01 && ' (매우 강한 증거)'}
          </p>
        ) : (
          <p>
            아직 유의미한 차이 없음. 더 많은 데이터 필요.
            {A.impressions + B.impressions < 1000 && (
              <span className="text-yellow-500/70"> (최소 1,000 노출 권장)</span>
            )}
          </p>
        )}
        {!isSignificant && remainingN != null && remainingN > 0 && (
          <p className="text-yellow-400/80">
            결론을 내리려면 약 <span className="font-bold">{remainingN.toLocaleString()}명</span>이 더 필요합니다.
          </p>
        )}
      </div>
    </div>
  );
}

// ── Variant Box ────────────────────────────────────────
function VariantBox({ label, stats, isWinner, maxCtr, color }: {
  label: string;
  stats: VariantStats;
  isWinner: boolean;
  maxCtr: number;
  color: 'cyan' | 'violet';
}) {
  const barWidth = maxCtr > 0 ? (stats.ctr / maxCtr) * 100 : 0;
  const colorClass = color === 'cyan' ? 'bg-cyan-500' : 'bg-violet-500';
  const borderColor = isWinner ? 'border-green-500/50' : 'border-gray-700';

  return (
    <div className={`p-4 rounded-lg border ${borderColor} bg-gray-800/50 relative`}>
      {isWinner && (
        <div className="absolute -top-2 -right-2 w-6 h-6 bg-green-500 rounded-full flex items-center justify-center">
          <span className="material-symbols-outlined text-sm text-white">check</span>
        </div>
      )}
      <div className="text-sm font-medium text-gray-300 mb-3">{label}</div>

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-2 text-center mb-3">
        <div>
          <div className="text-xs text-gray-500">노출</div>
          <div className="text-lg font-bold">{stats.impressions.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">클릭</div>
          <div className="text-lg font-bold">{stats.clicks.toLocaleString()}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">전환</div>
          <div className="text-lg font-bold">{stats.conversions.toLocaleString()}</div>
        </div>
      </div>

      {/* CTR Bar */}
      <div className="mt-2">
        <div className="flex items-center justify-between text-xs mb-1">
          <span className="text-gray-500">CTR</span>
          <span className="font-mono font-bold text-white">{stats.ctr.toFixed(2)}%</span>
        </div>
        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
          <div
            className={`h-full ${colorClass} rounded-full transition-all duration-500`}
            style={{ width: `${barWidth}%` }}
          />
        </div>
        {/* 95% 신뢰구간 */}
        {stats.ci && stats.impressions > 0 && (
          <div className="text-[10px] text-gray-500 mt-1 font-mono">
            95% CI: [{stats.ci.lower.toFixed(2)}% ~ {stats.ci.upper.toFixed(2)}%]
          </div>
        )}
      </div>
    </div>
  );
}
