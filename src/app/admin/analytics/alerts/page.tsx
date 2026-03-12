'use client';

import { useState } from 'react';
import { KPICard, EmptyState, formatNumber } from '@/components/analytics/shared';
import { DATE_FILTERS } from '@/lib/analytics/types';

const METRICS = ['bounce_rate', 'error_rate', 'visitors', 'avg_session_duration'] as const;
const OPERATORS = ['>', '<', '>=', '<='] as const;
const WINDOWS = ['1h', '2h', '6h', '12h', '24h'] as const;

interface AlertRule {
  id: string;
  metric: string;
  operator: string;
  threshold: number;
  window: string;
  active: boolean;
}

interface AlertEvent {
  id: string;
  ruleId: string;
  ruleName: string;
  metric: string;
  value: number;
  timestamp: string;
}

let idCounter = 0;
const nextId = () => `rule_${++idCounter}_${Date.now()}`;

export default function AlertsPage() {
  const [days, setDays] = useState<number>(30);
  const [rules, setRules] = useState<AlertRule[]>([]);
  const [history, setHistory] = useState<AlertEvent[]>([]);

  const [metric, setMetric] = useState<string>('bounce_rate');
  const [operator, setOperator] = useState<string>('>');
  const [threshold, setThreshold] = useState<number>(50);
  const [window, setWindow] = useState<string>('1h');

  const addRule = () => {
    const rule: AlertRule = {
      id: nextId(),
      metric,
      operator,
      threshold,
      window,
      active: true,
    };
    setRules([rule, ...rules]);
  };

  const toggleRule = (id: string) => {
    setRules(rules.map((r) => (r.id === id ? { ...r, active: !r.active } : r)));
  };

  const deleteRule = (id: string) => {
    setRules(rules.filter((r) => r.id !== id));
    setHistory(history.filter((h) => h.ruleId !== id));
  };

  const conditionLabel = (r: AlertRule) =>
    `${r.metric} ${r.operator} ${r.threshold} (${r.window})`;

  return (
    <div className="min-h-screen bg-[#0d0d14] text-white p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-bold">Alerts & Anomaly Detection</h1>
          <span className="bg-[#1e1e2e] text-gray-400 text-xs px-2 py-1 rounded">
            Notifications 준비 중
          </span>
        </div>
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KPICard title="Active Rules" value={String(rules.filter((r) => r.active).length)} icon="toggle_on" color="#10B981" />
        <KPICard title="Total Rules" value={String(rules.length)} icon="rule" color="#3B82F6" />
        <KPICard title="Triggered Alerts" value={formatNumber(history.length)} icon="notifications_active" color="#EF4444" />
      </div>

      {/* Create Rule */}
      <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-5 space-y-4">
        <h2 className="text-lg font-semibold">Create Alert Rule</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <select
            value={metric}
            onChange={(e) => setMetric(e.target.value)}
            className="bg-[#0d0d14] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm"
          >
            {METRICS.map((m) => <option key={m} value={m}>{m.replace(/_/g, ' ')}</option>)}
          </select>
          <select
            value={operator}
            onChange={(e) => setOperator(e.target.value)}
            className="bg-[#0d0d14] border border-[#1e1e2e] rounded-lg px-2 py-2 text-sm w-20"
          >
            {OPERATORS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
          <input
            type="number"
            value={threshold}
            onChange={(e) => setThreshold(Number(e.target.value))}
            className="bg-[#0d0d14] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm w-24"
          />
          <select
            value={window}
            onChange={(e) => setWindow(e.target.value)}
            className="bg-[#0d0d14] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm"
          >
            {WINDOWS.map((w) => <option key={w} value={w}>{w}</option>)}
          </select>
          <button
            onClick={addRule}
            className="bg-[#00D4D4] text-black px-4 py-2 rounded-lg text-sm font-semibold"
          >
            저장
          </button>
        </div>
      </div>

      {/* Active Rules */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Active Rules</h2>
        {rules.length === 0 && <EmptyState icon="notifications_off" message="등록된 알림 규칙이 없습니다" />}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rules.map((r) => (
            <div key={r.id} className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-4">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-sm font-medium text-[#00D4D4]">
                    {r.metric.replace(/_/g, ' ')}
                  </span>
                  <div className="text-xs text-gray-400 mt-1">{conditionLabel(r)}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleRule(r.id)}
                    className={`text-xs px-2 py-1 rounded ${
                      r.active
                        ? 'bg-green-500/20 text-green-400'
                        : 'bg-gray-500/20 text-gray-400'
                    }`}
                  >
                    {r.active ? 'Active' : 'Paused'}
                  </button>
                  <button
                    onClick={() => deleteRule(r.id)}
                    className="text-red-400 text-xs hover:underline"
                  >삭제</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Alert History */}
      <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-5 space-y-3">
        <h2 className="text-lg font-semibold">Alert History</h2>
        {history.length === 0 && <EmptyState icon="history" message="트리거된 알림이 없습니다" />}
        {history.length > 0 && (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-gray-400 text-left text-xs">
                <th className="pb-2">Time</th>
                <th className="pb-2">Rule</th>
                <th className="pb-2">Metric</th>
                <th className="pb-2">Value</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.id} className="border-t border-[#1e1e2e]">
                  <td className="py-2 text-gray-400 text-xs">
                    {new Date(h.timestamp).toLocaleString('ko-KR')}
                  </td>
                  <td className="py-2">{h.ruleName}</td>
                  <td className="py-2 text-[#00D4D4]">{h.metric.replace(/_/g, ' ')}</td>
                  <td className="py-2 font-mono">{h.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
