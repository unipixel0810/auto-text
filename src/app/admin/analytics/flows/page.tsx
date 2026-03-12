'use client';

import { useState, useEffect, useCallback } from 'react';
import { KPICard, ChartCard, EmptyState, LoadingSpinner, formatNumber } from '@/components/analytics/shared';
import { DATE_FILTERS } from '@/lib/analytics/types';

const ENTRY_PAGES = ['/', '/landing', '/projects', '/login'] as const;
const DEPTH_OPTIONS = [3, 5, 8] as const;

interface FlowNode {
  id: string;
  label: string;
  step: number;
}

interface FlowLink {
  source: string;
  target: string;
  value: number;
}

interface FlowData {
  nodes: FlowNode[];
  links: FlowLink[];
  totalSessions: number;
}

export default function FlowsPage() {
  const [entryPage, setEntryPage] = useState<string>('/');
  const [depth, setDepth] = useState<number>(5);
  const [days, setDays] = useState<number>(30);
  const [data, setData] = useState<FlowData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFlows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        action: 'flows',
        entry_page: entryPage,
        depth: String(depth),
        days: String(days),
      });
      const res = await fetch(`/api/analytics/query?${params}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: FlowData = await res.json();
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : '데이터를 불러올 수 없습니다');
    } finally {
      setLoading(false);
    }
  }, [entryPage, depth, days]);

  useEffect(() => { fetchFlows(); }, [fetchFlows]);

  const stepColumns = data
    ? Array.from({ length: depth }, (_, i) => ({
        step: i,
        nodes: data.nodes
          .filter((n) => n.step === i)
          .sort((a, b) => {
            const aVal = data.links
              .filter((l) => l.target === a.id || l.source === a.id)
              .reduce((s, l) => s + l.value, 0);
            const bVal = data.links
              .filter((l) => l.target === b.id || l.source === b.id)
              .reduce((s, l) => s + l.value, 0);
            return bVal - aVal;
          }),
      }))
    : [];

  const uniquePaths = data ? new Set(data.links.map((l) => `${l.source}-${l.target}`)).size : 0;
  const avgPathLength = data && data.totalSessions > 0
    ? (data.links.reduce((s, l) => s + l.value, 0) / data.totalSessions).toFixed(1)
    : '0';

  const transitions = data
    ? data.links
        .slice()
        .sort((a, b) => b.value - a.value)
        .slice(0, 30)
    : [];

  const maxTransitionValue = transitions.length > 0 ? transitions[0].value : 1;

  const labelMap = data
    ? Object.fromEntries(data.nodes.map((n) => [n.id, n.label]))
    : {};

  return (
    <div className="min-h-screen bg-[#0d0d14] text-white p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold">User Flows / Path Analysis</h1>
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={entryPage}
            onChange={(e) => setEntryPage(e.target.value)}
            className="bg-[#12121a] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm"
          >
            {ENTRY_PAGES.map((p) => (
              <option key={p} value={p}>Entry: {p}</option>
            ))}
          </select>
          <select
            value={depth}
            onChange={(e) => setDepth(Number(e.target.value))}
            className="bg-[#12121a] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm"
          >
            {DEPTH_OPTIONS.map((d) => (
              <option key={d} value={d}>Depth: {d}</option>
            ))}
          </select>
          <select
            value={days}
            onChange={(e) => setDays(Number(e.target.value))}
            className="bg-[#12121a] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm"
          >
            {DATE_FILTERS.map((f) => (
              <option key={f.value} value={f.value}>{f.label}</option>
            ))}
          </select>
        </div>
      </div>

      {loading && <LoadingSpinner />}
      {error && <EmptyState icon="error" message={error} />}

      {data && !loading && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <KPICard title="Total Sessions" value={formatNumber(data.totalSessions)} icon="people" color="#00D4D4" />
            <KPICard title="Unique Transitions" value={formatNumber(uniquePaths)} icon="swap_horiz" color="#3B82F6" />
            <KPICard title="Avg Path Length" value={String(avgPathLength)} icon="route" color="#8B5CF6" />
          </div>

          <ChartCard title="Step-based Flow" icon="account_tree">
            <div className="overflow-x-auto">
              <div className="flex gap-4 min-w-[600px] py-4">
                {stepColumns.map((col) => (
                  <div key={col.step} className="flex-1 min-w-[140px] space-y-2">
                    <div className="text-xs text-gray-400 font-semibold text-center mb-2">
                      Step {col.step}
                    </div>
                    {col.nodes.slice(0, 8).map((node) => {
                      const count = data.links
                        .filter((l) => l.target === node.id || (col.step === 0 && l.source === node.id))
                        .reduce((s, l) => s + l.value, 0);
                      return (
                        <div
                          key={node.id}
                          className="bg-[#1a1a2e] border border-[#1e1e2e] rounded-lg p-2 text-xs"
                        >
                          <div className="truncate font-medium text-[#00D4D4]">{node.label}</div>
                          <div className="text-gray-400 mt-1">{formatNumber(count)}</div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </ChartCard>

          <ChartCard title="Top Transitions (From → To)" icon="swap_horiz">
            <div className="space-y-2">
              {transitions.map((t, i) => (
                <div key={i} className="flex items-center gap-3 text-sm">
                  <span className="w-6 text-gray-500 text-right">{i + 1}</span>
                  <span className="truncate w-32 text-gray-300">{labelMap[t.source] ?? t.source}</span>
                  <span className="text-gray-500">→</span>
                  <span className="truncate w-32 text-gray-300">{labelMap[t.target] ?? t.target}</span>
                  <div className="flex-1 h-5 bg-[#1e1e2e] rounded overflow-hidden">
                    <div
                      className="h-full bg-[#00D4D4] rounded"
                      style={{ width: `${(t.value / maxTransitionValue) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-400 w-16 text-right">{formatNumber(t.value)}</span>
                </div>
              ))}
              {transitions.length === 0 && <EmptyState icon="swap_horiz" message="전환 데이터가 없습니다" />}
            </div>
          </ChartCard>
        </>
      )}
    </div>
  );
}
