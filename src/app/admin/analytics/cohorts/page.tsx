'use client';

import { useState, useEffect, useCallback } from 'react';
import { KPICard, EmptyState, LoadingSpinner, formatNumber } from '@/components/analytics/shared';
import { DATE_FILTERS } from '@/lib/analytics/types';

const EVENT_TYPES = ['click', 'page_view', 'cta_click', 'scroll', 'form_submit', 'signup'] as const;
const OPERATORS = ['>=', '<=', '=='] as const;
const TIME_WINDOWS = [7, 14, 30] as const;

interface CohortRule {
  eventType: string;
  operator: string;
  value: number;
  timeWindow: number;
}

interface Cohort {
  id: string;
  name: string;
  rules: CohortRule[];
  memberCount: number;
  createdAt: string;
}

interface CohortMember {
  userId: string;
  eventCount: number;
  lastSeen: string;
}

export default function CohortsPage() {
  const [days, setDays] = useState<number>(30);
  const [cohorts, setCohorts] = useState<Cohort[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [rules, setRules] = useState<CohortRule[]>([
    { eventType: 'page_view', operator: '>=', value: 1, timeWindow: 30 },
  ]);

  const [selectedCohort, setSelectedCohort] = useState<string | null>(null);
  const [members, setMembers] = useState<CohortMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);

  const fetchCohorts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/cohorts');
      if (!res.ok) { console.error('Failed to fetch cohorts:', res.status); setCohorts([]); return; }
      const json = await res.json();
      setCohorts(Array.isArray(json) ? json : []);
    } catch (err) {
      console.error('Failed to fetch cohorts:', err);
      setCohorts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCohorts(); }, [fetchCohorts]);

  const addRule = () => {
    setRules([...rules, { eventType: 'click', operator: '>=', value: 1, timeWindow: 30 }]);
  };

  const updateRule = (idx: number, patch: Partial<CohortRule>) => {
    setRules(rules.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const removeRule = (idx: number) => {
    if (rules.length <= 1) return;
    setRules(rules.filter((_, i) => i !== idx));
  };

  const saveCohort = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const res = await fetch('/api/cohorts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: name.trim(), rules }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setName('');
      setRules([{ eventType: 'page_view', operator: '>=', value: 1, timeWindow: 30 }]);
      fetchCohorts();
    } catch {
      setError('코호트 저장에 실패했습니다');
    } finally {
      setSaving(false);
    }
  };

  const deleteCohort = async (id: string) => {
    try {
      const res = await fetch(`/api/cohorts/${id}`, { method: 'DELETE' });
      if (!res.ok) { console.error('Failed to delete cohort:', res.status); setError('삭제에 실패했습니다'); return; }
      setCohorts(cohorts.filter((c) => c.id !== id));
      if (selectedCohort === id) { setSelectedCohort(null); setMembers([]); }
    } catch (err) {
      console.error('Failed to delete cohort:', err);
      setError('삭제에 실패했습니다');
    }
  };

  const fetchMembers = async (id: string) => {
    setSelectedCohort(id);
    setMembersLoading(true);
    try {
      const res = await fetch(`/api/cohorts/${id}/members`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json: CohortMember[] = await res.json();
      setMembers(json);
    } catch {
      setMembers([]);
    } finally {
      setMembersLoading(false);
    }
  };

  const ruleLabel = (r: CohortRule) =>
    `${r.eventType} ${r.operator} ${r.value} (${r.timeWindow}d)`;

  return (
    <div className="min-h-screen bg-[#0d0d14] text-white p-6 space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <h1 className="text-2xl font-bold">Behavioral Cohorts</h1>
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

      {error && <div className="text-red-400 text-sm bg-red-400/10 rounded-lg p-3">{error}</div>}

      {/* Create Cohort */}
      <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-5 space-y-4">
        <h2 className="text-lg font-semibold">Create Cohort</h2>
        <input
          type="text"
          placeholder="코호트 이름"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full bg-[#0d0d14] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm"
        />
        {rules.map((rule, idx) => (
          <div key={idx} className="flex items-center gap-2 flex-wrap">
            <select
              value={rule.eventType}
              onChange={(e) => updateRule(idx, { eventType: e.target.value })}
              className="bg-[#0d0d14] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm"
            >
              {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
            <select
              value={rule.operator}
              onChange={(e) => updateRule(idx, { operator: e.target.value })}
              className="bg-[#0d0d14] border border-[#1e1e2e] rounded-lg px-2 py-2 text-sm w-20"
            >
              {OPERATORS.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
            <input
              type="number"
              min={0}
              value={rule.value}
              onChange={(e) => updateRule(idx, { value: Number(e.target.value) })}
              className="bg-[#0d0d14] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm w-20"
            />
            <select
              value={rule.timeWindow}
              onChange={(e) => updateRule(idx, { timeWindow: Number(e.target.value) })}
              className="bg-[#0d0d14] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm"
            >
              {TIME_WINDOWS.map((w) => <option key={w} value={w}>{w}일</option>)}
            </select>
            {rules.length > 1 && (
              <button onClick={() => removeRule(idx)} className="text-red-400 text-sm hover:underline">삭제</button>
            )}
          </div>
        ))}
        <div className="flex gap-3">
          <button onClick={addRule} className="text-[#00D4D4] text-sm hover:underline">+ 조건 추가</button>
          <button
            onClick={saveCohort}
            disabled={saving || !name.trim()}
            className="bg-[#00D4D4] text-black px-4 py-2 rounded-lg text-sm font-semibold disabled:opacity-40"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      </div>

      {/* Saved Cohorts */}
      <div className="space-y-4">
        <h2 className="text-lg font-semibold">Saved Cohorts</h2>
        {loading && <LoadingSpinner />}
        {!loading && cohorts.length === 0 && <EmptyState icon="groups" message="저장된 코호트가 없습니다" />}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {cohorts.map((c) => (
            <div
              key={c.id}
              className={`bg-[#12121a] border rounded-xl p-4 cursor-pointer transition ${
                selectedCohort === c.id ? 'border-[#00D4D4]' : 'border-[#1e1e2e]'
              }`}
              onClick={() => fetchMembers(c.id)}
            >
              <div className="flex justify-between items-start">
                <h3 className="font-semibold text-sm">{c.name}</h3>
                <button
                  onClick={(e) => { e.stopPropagation(); deleteCohort(c.id); }}
                  className="text-red-400 text-xs hover:underline"
                >삭제</button>
              </div>
              <div className="text-xs text-gray-400 mt-2 space-y-1">
                {c.rules.map((r, i) => <div key={i}>{ruleLabel(r)}</div>)}
              </div>
              <div className="flex justify-between mt-3 text-xs">
                <span className="text-[#00D4D4]">{formatNumber(c.memberCount)}명</span>
                <span className="text-gray-500">{new Date(c.createdAt).toLocaleDateString('ko-KR')}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Members Panel */}
      {selectedCohort && (
        <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-5 space-y-3">
          <h2 className="text-lg font-semibold">Members</h2>
          {membersLoading && <LoadingSpinner />}
          {!membersLoading && members.length === 0 && <EmptyState icon="person_off" message="멤버가 없습니다" />}
          {members.length > 0 && (
            <table className="w-full text-sm">
              <thead><tr className="text-gray-400 text-left text-xs">
                <th className="pb-2">User ID</th><th className="pb-2">Events</th><th className="pb-2">Last Seen</th>
              </tr></thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.userId} className="border-t border-[#1e1e2e]">
                    <td className="py-2 font-mono text-xs">{m.userId}</td>
                    <td className="py-2">{formatNumber(m.eventCount)}</td>
                    <td className="py-2 text-gray-400">{new Date(m.lastSeen).toLocaleDateString('ko-KR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  );
}
