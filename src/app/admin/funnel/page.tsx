'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';

/* ───────── 타입 ───────── */

type TriggerType = 'page_view' | 'click' | 'custom';

interface FunnelStep {
  name: string;
  label: string;
  order: number;
  trigger?: TriggerType;
  url_pattern?: string;   // page_view: URL 경로 (예: /landing, /pricing)
  css_selector?: string;  // click: CSS 선택자 (예: #cta-button, .signup-btn)
}

interface FunnelDefinition {
  id: string;
  name: string;
  description: string;
  steps: FunnelStep[];
  is_active: boolean;
  created_at: string;
}

interface FunnelEvent {
  step_name: string;
  session_id: string;
  created_at: string;
}

type DateRange = 1 | 7 | 30;

/** 기본 퍼널 (기존 하드코딩) */
const DEFAULT_STEPS: FunnelStep[] = [
  { name: 'landing_visit', label: '랜딩페이지 방문', order: 1 },
  { name: 'cta_click', label: 'CTA 버튼 클릭', order: 2 },
  { name: 'signup_form_open', label: '가입 폼 열림', order: 3 },
  { name: 'email_input', label: '이메일 입력', order: 4 },
  { name: 'signup_complete', label: '가입 완료', order: 5 },
];

const DEFAULT_FUNNEL: FunnelDefinition = {
  id: '__default__',
  name: '기본 전환 퍼널',
  description: '랜딩 → 가입 전환 흐름',
  steps: DEFAULT_STEPS,
  is_active: true,
  created_at: '',
};

/* ───────── 메인 ───────── */

export default function FunnelPage() {
  const [funnels, setFunnels] = useState<FunnelDefinition[]>([DEFAULT_FUNNEL]);
  const [selectedFunnelId, setSelectedFunnelId] = useState<string>('__default__');
  const [events, setEvents] = useState<FunnelEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState<DateRange>(30);
  const [showBuilder, setShowBuilder] = useState(false);
  const [editingFunnel, setEditingFunnel] = useState<FunnelDefinition | null>(null);

  const selectedFunnel = funnels.find(f => f.id === selectedFunnelId) || DEFAULT_FUNNEL;

  // 퍼널 목록 로드
  const loadFunnels = useCallback(async () => {
    try {
      const res = await fetch('/api/funnels');
      const data = await res.json();
      setFunnels([DEFAULT_FUNNEL, ...(data.funnels || [])]);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadFunnels(); }, [loadFunnels]);

  // 이벤트 로드
  useEffect(() => {
    setLoading(true);
    fetch(`/api/funnel?days=${days}`)
      .then(r => r.json())
      .then(d => setEvents(d.events || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [days]);

  // 퍼널 데이터 계산
  const funnelData = useMemo(() => {
    const steps = selectedFunnel.steps;
    const stepNames = new Set(steps.map(s => s.name));

    const sessionSteps = new Map<string, Set<string>>();
    for (const e of events) {
      if (!stepNames.has(e.step_name)) continue;
      if (!sessionSteps.has(e.session_id)) {
        sessionSteps.set(e.session_id, new Set());
      }
      sessionSteps.get(e.session_id)!.add(e.step_name);
    }

    const stepCounts = steps.map(step => {
      let count = 0;
      sessionSteps.forEach(s => { if (s.has(step.name)) count++; });
      return { ...step, count };
    });

    const maxCount = stepCounts[0]?.count || 1;

    const withDropoff = stepCounts.map((step, idx) => {
      const prev = idx === 0 ? step.count : stepCounts[idx - 1].count;
      const dropoff = prev > 0 ? ((prev - step.count) / prev) * 100 : 0;
      const pct = maxCount > 0 ? (step.count / maxCount) * 100 : 0;
      return { ...step, dropoff, pct };
    });

    let maxDropoffIdx = -1;
    let maxDropoffVal = 0;
    withDropoff.forEach((s, i) => {
      if (i > 0 && s.dropoff > maxDropoffVal) {
        maxDropoffVal = s.dropoff;
        maxDropoffIdx = i;
      }
    });

    return { steps: withDropoff, totalSessions: sessionSteps.size, maxDropoffIdx };
  }, [events, selectedFunnel]);

  const overallConversion = funnelData.steps.length >= 2 && funnelData.steps[0].count > 0
    ? ((funnelData.steps[funnelData.steps.length - 1].count / funnelData.steps[0].count) * 100).toFixed(1)
    : '0';

  // 퍼널 삭제
  const handleDeleteFunnel = async (id: string) => {
    if (id === '__default__') return;
    if (!confirm('이 퍼널을 삭제하시겠습니까?')) return;
    await fetch(`/api/funnels/${id}`, { method: 'DELETE' });
    if (selectedFunnelId === id) setSelectedFunnelId('__default__');
    loadFunnels();
  };

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
            <p className="text-sm text-gray-500 mt-1">{selectedFunnel.description || '퍼널 분석'}</p>
          </div>
          <div className="flex items-center gap-2">
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

        {/* 퍼널 선택 + 생성 */}
        <div className="bg-[#12121a] border border-[#2a2a3e] rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-white">퍼널 선택</h2>
            <button
              onClick={() => { setEditingFunnel(null); setShowBuilder(true); }}
              className="flex items-center gap-1.5 px-4 py-2 bg-[#00D4D4]/10 text-[#00D4D4] border border-[#00D4D4]/30 rounded-lg text-sm font-medium hover:bg-[#00D4D4]/20 transition-all"
            >
              <span className="material-symbols-outlined text-[16px]">add</span>
              새 퍼널
            </button>
          </div>
          <div className="flex flex-wrap gap-2">
            {funnels.map(f => (
              <div key={f.id} className="flex items-center gap-0">
                <button
                  onClick={() => setSelectedFunnelId(f.id)}
                  className={`px-4 py-2.5 text-sm font-medium transition-all ${
                    selectedFunnelId === f.id
                      ? 'bg-[#00D4D4]/10 text-[#00D4D4] border border-[#00D4D4]/30'
                      : 'text-gray-400 border border-[#2a2a3e] hover:text-gray-200 hover:bg-white/5'
                  } ${f.id === '__default__' ? 'rounded-lg' : 'rounded-l-lg border-r-0'}`}
                >
                  {f.name}
                  <span className="ml-2 text-[11px] text-gray-600">{f.steps.length}단계</span>
                </button>
                {f.id !== '__default__' && (
                  <div className="flex">
                    <button
                      onClick={() => { setEditingFunnel(f); setShowBuilder(true); }}
                      className="px-2 py-2.5 text-gray-500 border border-[#2a2a3e] hover:text-[#00D4D4] hover:bg-white/5 transition-all text-[13px]"
                      title="편집"
                    >
                      <span className="material-symbols-outlined text-[16px]">edit</span>
                    </button>
                    <button
                      onClick={() => handleDeleteFunnel(f.id)}
                      className="px-2 py-2.5 text-gray-500 border border-[#2a2a3e] border-l-0 rounded-r-lg hover:text-red-400 hover:bg-red-500/5 transition-all text-[13px]"
                      title="삭제"
                    >
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
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
                      <div className="flex items-center gap-4">
                        <div className="w-28 sm:w-36 shrink-0 text-right">
                          <p className="text-[12px] text-gray-400 font-medium">{step.label}</p>
                        </div>
                        <div className="flex-1 relative">
                          <div
                            className="h-12 rounded-lg flex items-center transition-all duration-700 relative overflow-hidden"
                            style={{ width: `${widthPct}%`, backgroundColor: barBg, border: `1px solid ${barColor}30` }}
                          >
                            <div
                              className="absolute inset-0 rounded-lg opacity-30"
                              style={{ background: `linear-gradient(90deg, ${barColor}40, ${barColor}10)` }}
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
                      <tr key={step.name} className={`border-b border-[#1e1e2e]/50 ${isMaxDropoff ? 'bg-red-500/5' : ''}`}>
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

      {/* 퍼널 빌더 모달 */}
      {showBuilder && (
        <FunnelBuilderModal
          funnel={editingFunnel}
          onClose={() => setShowBuilder(false)}
          onSaved={() => { setShowBuilder(false); loadFunnels(); }}
        />
      )}
    </div>
  );
}

/* ───────── 퍼널 빌더 모달 ───────── */

function FunnelBuilderModal({
  funnel,
  onClose,
  onSaved,
}: {
  funnel: FunnelDefinition | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEditing = !!funnel;
  const [name, setName] = useState(funnel?.name || '');
  const [description, setDescription] = useState(funnel?.description || '');
  const [steps, setSteps] = useState<FunnelStep[]>(
    funnel?.steps || [
      { name: '', label: '', order: 1, trigger: 'page_view', url_pattern: '' },
      { name: '', label: '', order: 2, trigger: 'page_view', url_pattern: '' },
    ]
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const addStep = () => {
    setSteps(prev => [...prev, { name: '', label: '', order: prev.length + 1, trigger: 'page_view', url_pattern: '' }]);
  };

  const removeStep = (idx: number) => {
    if (steps.length <= 2) return;
    setSteps(prev => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i + 1 })));
  };

  const updateStep = (idx: number, field: keyof FunnelStep, value: string) => {
    setSteps(prev => prev.map((s, i) => {
      if (i !== idx) return s;
      const updated = { ...s, [field]: value };
      // trigger 변경 시 자동으로 name 생성
      if (field === 'trigger') {
        updated.url_pattern = '';
        updated.css_selector = '';
      }
      if (field === 'url_pattern' && !s.name) {
        updated.name = `pageview_${value.replace(/\//g, '_').replace(/^_/, '')}`;
      }
      if (field === 'css_selector' && !s.name) {
        updated.name = `click_${value.replace(/[^a-zA-Z0-9]/g, '_')}`;
      }
      return updated;
    }));
  };

  const moveStep = (idx: number, direction: -1 | 1) => {
    const target = idx + direction;
    if (target < 0 || target >= steps.length) return;
    setSteps(prev => {
      const next = [...prev];
      [next[idx], next[target]] = [next[target], next[idx]];
      return next.map((s, i) => ({ ...s, order: i + 1 }));
    });
  };

  const handleSave = async () => {
    if (!name.trim()) { setError('퍼널 이름을 입력하세요.'); return; }

    // Auto-generate name for page_view / click triggers
    const finalSteps = steps.map(s => {
      const trigger = s.trigger || 'custom';
      let stepName = s.name;
      if (trigger === 'page_view' && s.url_pattern) {
        stepName = stepName || `pageview_${s.url_pattern.replace(/\//g, '_').replace(/^_/, '')}`;
      } else if (trigger === 'click' && s.css_selector) {
        stepName = stepName || `click_${s.css_selector.replace(/[^a-zA-Z0-9]/g, '_')}`;
      }
      return { ...s, name: stepName };
    });

    const emptyStep = finalSteps.find(s => {
      const trigger = s.trigger || 'custom';
      if (!s.label.trim()) return true;
      if (trigger === 'page_view' && !s.url_pattern?.trim()) return true;
      if (trigger === 'click' && !s.css_selector?.trim()) return true;
      if (trigger === 'custom' && !s.name.trim()) return true;
      return false;
    });
    if (emptyStep) { setError('모든 단계의 필수 필드를 입력하세요.'); return; }

    setSaving(true);
    setError('');

    try {
      const body = { name: name.trim(), description: description.trim(), steps: finalSteps };

      if (isEditing) {
        await fetch(`/api/funnels/${funnel.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } else {
        await fetch('/api/funnels', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      }
      onSaved();
    } catch {
      setError('저장에 실패했습니다.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-[#12121a] border border-[#2a2a3e] rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* 헤더 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#1e1e2e]">
          <h2 className="text-lg font-bold text-white">
            {isEditing ? '퍼널 편집' : '새 퍼널 만들기'}
          </h2>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* 기본 정보 */}
          <div className="space-y-3">
            <div>
              <label className="block text-[11px] text-gray-500 uppercase tracking-wider mb-1.5">퍼널 이름</label>
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                placeholder="예: 구매 전환 퍼널"
                className="w-full px-4 py-2.5 bg-[#0a0a12] border border-[#2a2a3e] rounded-lg text-white text-sm placeholder-gray-600 focus:outline-none focus:border-[#00D4D4]/50"
              />
            </div>
            <div>
              <label className="block text-[11px] text-gray-500 uppercase tracking-wider mb-1.5">설명 (선택)</label>
              <input
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="예: 랜딩 → 결제 전환 흐름"
                className="w-full px-4 py-2.5 bg-[#0a0a12] border border-[#2a2a3e] rounded-lg text-white text-sm placeholder-gray-600 focus:outline-none focus:border-[#00D4D4]/50"
              />
            </div>
          </div>

          {/* 단계 목록 */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="text-[11px] text-gray-500 uppercase tracking-wider">퍼널 단계</label>
              <button
                onClick={addStep}
                className="text-[12px] text-[#00D4D4] hover:text-[#00D4D4]/80 font-medium flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-[14px]">add</span>
                단계 추가
              </button>
            </div>
            <div className="space-y-3">
              {steps.map((step, idx) => {
                const trigger = step.trigger || 'custom';
                return (
                  <div key={idx} className="bg-[#0a0a12] border border-[#1e1e2e] rounded-lg p-3 group">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="w-6 h-6 shrink-0 rounded-md bg-[#00D4D4]/10 text-[#00D4D4] flex items-center justify-center text-[11px] font-bold">
                        {idx + 1}
                      </span>

                      {/* 트리거 타입 선택 */}
                      <div className="flex gap-1">
                        {([
                          { key: 'page_view', icon: 'language', tip: '페이지 방문' },
                          { key: 'click', icon: 'ads_click', tip: '요소 클릭' },
                          { key: 'custom', icon: 'code', tip: '커스텀 이벤트' },
                        ] as const).map(t => (
                          <button
                            key={t.key}
                            onClick={() => updateStep(idx, 'trigger', t.key)}
                            title={t.tip}
                            className={`px-2 py-1 rounded text-[10px] font-medium flex items-center gap-1 transition-all ${
                              trigger === t.key
                                ? 'bg-[#00D4D4]/15 text-[#00D4D4] border border-[#00D4D4]/30'
                                : 'text-gray-500 border border-transparent hover:text-gray-300'
                            }`}
                          >
                            <span className="material-symbols-outlined text-[13px]">{t.icon}</span>
                            {t.tip}
                          </button>
                        ))}
                      </div>

                      <div className="flex-1" />

                      {/* 순서 이동 + 삭제 */}
                      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => moveStep(idx, -1)} disabled={idx === 0}
                          className="p-1 text-gray-500 hover:text-white disabled:opacity-20">
                          <span className="material-symbols-outlined text-[14px]">arrow_upward</span>
                        </button>
                        <button onClick={() => moveStep(idx, 1)} disabled={idx === steps.length - 1}
                          className="p-1 text-gray-500 hover:text-white disabled:opacity-20">
                          <span className="material-symbols-outlined text-[14px]">arrow_downward</span>
                        </button>
                        <button onClick={() => removeStep(idx)} disabled={steps.length <= 2}
                          className="p-1 text-gray-500 hover:text-red-400 disabled:opacity-20">
                          <span className="material-symbols-outlined text-[14px]">close</span>
                        </button>
                      </div>
                    </div>

                    {/* 트리거별 입력 필드 */}
                    <div className="flex gap-2">
                      {trigger === 'page_view' && (
                        <input
                          value={step.url_pattern || ''}
                          onChange={e => updateStep(idx, 'url_pattern', e.target.value)}
                          placeholder="URL 경로 (예: /landing, /pricing)"
                          className="flex-1 px-3 py-2 bg-[#12121a] border border-[#2a2a3e] rounded-lg text-white text-sm placeholder-gray-600 focus:outline-none focus:border-[#00D4D4]/50 font-mono text-[12px]"
                        />
                      )}
                      {trigger === 'click' && (
                        <input
                          value={step.css_selector || ''}
                          onChange={e => updateStep(idx, 'css_selector', e.target.value)}
                          placeholder="CSS 선택자 (예: #cta-btn, .signup-btn)"
                          className="flex-1 px-3 py-2 bg-[#12121a] border border-[#2a2a3e] rounded-lg text-white text-sm placeholder-gray-600 focus:outline-none focus:border-[#00D4D4]/50 font-mono text-[12px]"
                        />
                      )}
                      {trigger === 'custom' && (
                        <input
                          value={step.name}
                          onChange={e => updateStep(idx, 'name', e.target.value)}
                          placeholder="이벤트 키 (예: signup_complete)"
                          className="flex-1 px-3 py-2 bg-[#12121a] border border-[#2a2a3e] rounded-lg text-white text-sm placeholder-gray-600 focus:outline-none focus:border-[#00D4D4]/50 font-mono text-[12px]"
                        />
                      )}
                      <input
                        value={step.label}
                        onChange={e => updateStep(idx, 'label', e.target.value)}
                        placeholder="표시 이름"
                        className="flex-1 px-3 py-2 bg-[#12121a] border border-[#2a2a3e] rounded-lg text-white text-sm placeholder-gray-600 focus:outline-none focus:border-[#00D4D4]/50"
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 미리보기 */}
          {steps.filter(s => s.label).length >= 2 && (
            <div className="bg-[#0a0a12] border border-[#1e1e2e] rounded-lg p-4">
              <p className="text-[11px] text-gray-500 uppercase tracking-wider mb-2">미리보기</p>
              <div className="flex items-center gap-1 flex-wrap">
                {steps.filter(s => s.label).map((step, idx, arr) => (
                  <React.Fragment key={idx}>
                    <span className="text-sm text-gray-300">{step.label}</span>
                    {idx < arr.length - 1 && (
                      <span className="material-symbols-outlined text-[14px] text-gray-600">arrow_forward</span>
                    )}
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-4 py-2">{error}</p>
          )}
        </div>

        {/* 하단 버튼 */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[#1e1e2e]">
          <button
            onClick={onClose}
            className="px-5 py-2.5 text-sm text-gray-400 border border-[#2a2a3e] rounded-lg hover:bg-white/5 transition-all"
          >
            취소
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-5 py-2.5 text-sm font-medium bg-[#00D4D4] text-black rounded-lg hover:bg-[#00D4D4]/90 transition-all disabled:opacity-50"
          >
            {saving ? '저장 중...' : isEditing ? '수정' : '생성'}
          </button>
        </div>
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
