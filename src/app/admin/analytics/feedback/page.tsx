'use client';

import { useState, useEffect, useCallback } from 'react';
import { KPICard, EmptyState, LoadingSpinner } from '@/components/analytics/shared';

const EMOTIONS = [
  { value: 1, emoji: '😡', label: '매우 불만' },
  { value: 2, emoji: '😞', label: '불만' },
  { value: 3, emoji: '😐', label: '보통' },
  { value: 4, emoji: '😊', label: '만족' },
  { value: 5, emoji: '🤩', label: '매우 만족' },
];

const CATEGORIES = [
  { id: 'all', label: '전체', icon: 'apps' },
  { id: 'ui', label: 'UI/디자인', icon: 'palette' },
  { id: 'feature', label: '기능', icon: 'build' },
  { id: 'speed', label: '속도', icon: 'speed' },
  { id: 'content', label: '콘텐츠', icon: 'article' },
  { id: 'other', label: '기타', icon: 'more_horiz' },
];

interface FeedbackItem {
  id: string;
  emotion: number;
  category: string;
  message: string | null;
  page_url: string;
  screenshot_url: string | null;
  session_id: string | null;
  resolved: boolean;
  created_at: string;
}

export default function FeedbackPage() {
  const [feedback, setFeedback] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchFeedback = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/feedback?category=${filter}&limit=200`);
      const data = await res.json();
      setFeedback(data.feedback || []);
    } catch { /* ignore */ }
    setLoading(false);
  }, [filter]);

  useEffect(() => { fetchFeedback(); }, [fetchFeedback]);

  const toggleResolved = async (id: string, current: boolean) => {
    await fetch('/api/feedback', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, resolved: !current }),
    });
    setFeedback(prev => prev.map(f => f.id === id ? { ...f, resolved: !current } : f));
  };

  const emotionCounts = [1, 2, 3, 4, 5].map(v => feedback.filter(f => f.emotion === v).length);
  const totalFeedback = feedback.length;

  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - now.getDay());
  weekStart.setHours(0, 0, 0, 0);
  const lastWeekStart = new Date(weekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);

  const thisWeek = feedback.filter(f => new Date(f.created_at) >= weekStart).length;
  const lastWeek = feedback.filter(f => {
    const d = new Date(f.created_at);
    return d >= lastWeekStart && d < weekStart;
  }).length;
  const weekDiff = thisWeek - lastWeek;
  const resolvedPct = totalFeedback > 0 ? Math.round((feedback.filter(f => f.resolved).length / totalFeedback) * 100) : 0;
  const avgEmotion = totalFeedback > 0 ? (feedback.reduce((s, f) => s + f.emotion, 0) / totalFeedback) : 0;

  return (
    <div className="p-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-[#00D4D4] text-[22px]">feedback</span>
          <h1 className="text-lg font-semibold">사용자 피드백</h1>
          <span className="text-xs text-gray-500 bg-[#1e1e2e] px-2 py-0.5 rounded-full">{totalFeedback}건</span>
        </div>
        <button
          onClick={fetchFeedback}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs bg-[#12121a] border border-[#1e1e2e] text-gray-400 hover:text-white transition-all"
        >
          <span className="material-symbols-outlined text-[14px]">refresh</span>
          새로고침
        </button>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        <KPICard title="총 피드백" value={String(totalFeedback)} icon="inbox" color="#00D4D4" />
        <KPICard title="이번 주" value={String(thisWeek)} change={lastWeek > 0 ? Math.round(((thisWeek - lastWeek) / lastWeek) * 100) : null} icon="calendar_today" color="#3B82F6" />
        <KPICard title="해결률" value={`${resolvedPct}%`} icon="check_circle" color="#10B981" />
        <KPICard title="평균 감정" value={avgEmotion > 0 ? `${avgEmotion.toFixed(1)} ${EMOTIONS[Math.round(avgEmotion) - 1]?.emoji || ''}` : '—'} icon="mood" color="#F59E0B" />
      </div>

      {/* 감정 분포 */}
      <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-5 mb-6">
        <h2 className="text-sm font-semibold mb-4">감정 분포</h2>
        <div className="flex items-center gap-6 justify-center">
          <svg viewBox="0 0 120 120" className="w-28 h-28">
            {(() => {
              const total = emotionCounts.reduce((a, b) => a + b, 0) || 1;
              const colors = ['#EF4444', '#F59E0B', '#6B7280', '#3B82F6', '#10B981'];
              let cumulative = 0;
              return emotionCounts.map((count, i) => {
                const pct = count / total;
                const startAngle = cumulative * 2 * Math.PI - Math.PI / 2;
                cumulative += pct;
                const endAngle = cumulative * 2 * Math.PI - Math.PI / 2;
                if (pct === 0) return null;
                const largeArc = pct > 0.5 ? 1 : 0;
                const x1 = 60 + 50 * Math.cos(startAngle);
                const y1 = 60 + 50 * Math.sin(startAngle);
                const x2 = 60 + 50 * Math.cos(endAngle);
                const y2 = 60 + 50 * Math.sin(endAngle);
                return (
                  <path
                    key={i}
                    d={pct >= 1
                      ? 'M 60 10 A 50 50 0 1 1 59.99 10 Z'
                      : `M 60 60 L ${x1} ${y1} A 50 50 0 ${largeArc} 1 ${x2} ${y2} Z`}
                    fill={colors[i]}
                    opacity={0.85}
                  />
                );
              });
            })()}
            <circle cx="60" cy="60" r="28" fill="#12121a" />
            <text x="60" y="64" textAnchor="middle" className="text-[14px] font-bold fill-white">{totalFeedback}</text>
          </svg>
          <div className="space-y-2">
            {EMOTIONS.map((e, i) => (
              <div key={e.value} className="flex items-center gap-2 text-xs">
                <span className="text-lg">{e.emoji}</span>
                <div className="w-20 h-1.5 bg-[#1e1e2e] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: `${totalFeedback > 0 ? (emotionCounts[i] / totalFeedback) * 100 : 0}%`,
                      backgroundColor: ['#EF4444', '#F59E0B', '#6B7280', '#3B82F6', '#10B981'][i],
                    }}
                  />
                </div>
                <span className="text-gray-500 w-5 text-right">{emotionCounts[i]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 카테고리 필터 */}
      <div className="flex gap-2 flex-wrap mb-4">
        {CATEGORIES.map(c => (
          <button
            key={c.id}
            onClick={() => setFilter(c.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              filter === c.id
                ? 'bg-[#00D4D4]/15 text-[#00D4D4] border border-[#00D4D4]/30'
                : 'text-gray-500 bg-[#12121a] border border-[#1e1e2e] hover:text-gray-300'
            }`}
          >
            <span className="material-symbols-outlined text-[14px]">{c.icon}</span>
            {c.label}
          </button>
        ))}
      </div>

      {/* 피드백 목록 */}
      {loading ? (
        <LoadingSpinner />
      ) : feedback.length === 0 ? (
        <EmptyState icon="inbox" message="아직 피드백이 없습니다." />
      ) : (
        <div className="space-y-2">
          {feedback.map(item => {
            const emo = EMOTIONS.find(e => e.value === item.emotion);
            const cat = CATEGORIES.find(c => c.id === item.category);
            const expanded = expandedId === item.id;
            const date = new Date(item.created_at);
            const timeStr = date.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' })
              + ' ' + date.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });

            return (
              <div
                key={item.id}
                className={`bg-[#12121a] border rounded-xl transition-all ${
                  item.resolved ? 'border-[#1e1e2e] opacity-60' : 'border-[#2a2a3e]'
                }`}
              >
                <div
                  className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
                  onClick={() => setExpandedId(expanded ? null : item.id)}
                >
                  <span className="text-xl">{emo?.emoji}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-2 py-0.5 bg-[#1e1e2e] rounded-md text-gray-400">
                        {cat?.label || item.category}
                      </span>
                      <span className="text-[10px] text-gray-600">{item.page_url}</span>
                    </div>
                    {item.message && (
                      <p className="text-xs text-gray-300 mt-1 truncate">{item.message}</p>
                    )}
                  </div>
                  <span className="text-[10px] text-gray-600 whitespace-nowrap">{timeStr}</span>
                  <button
                    onClick={e => { e.stopPropagation(); toggleResolved(item.id, item.resolved); }}
                    className={`p-1.5 rounded-lg transition-all ${
                      item.resolved
                        ? 'bg-emerald-500/15 text-emerald-400'
                        : 'bg-[#1e1e2e] text-gray-600 hover:text-gray-300'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[14px]">
                      {item.resolved ? 'check_circle' : 'radio_button_unchecked'}
                    </span>
                  </button>
                </div>

                {expanded && (
                  <div className="px-4 pb-4 border-t border-[#1e1e2e] pt-3 space-y-3">
                    {item.message && (
                      <div>
                        <p className="text-[10px] text-gray-600 mb-1">메시지</p>
                        <p className="text-xs text-gray-300 whitespace-pre-wrap">{item.message}</p>
                      </div>
                    )}
                    <div className="flex gap-4 text-[10px] text-gray-600">
                      <span>Session: {item.session_id || '-'}</span>
                      <span>Page: {item.page_url}</span>
                    </div>
                    {item.screenshot_url && (
                      <div>
                        <p className="text-[10px] text-gray-600 mb-1">스크린샷</p>
                        <img
                          src={item.screenshot_url}
                          alt="screenshot"
                          className="max-w-full max-h-[300px] rounded-lg border border-[#2a2a3e]"
                        />
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
