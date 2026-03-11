'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';

const EMOTIONS = [
  { value: 1, emoji: '\ud83d\ude21', label: '\ub9e4\uc6b0 \ubd88\ub9cc' },
  { value: 2, emoji: '\ud83d\ude1e', label: '\ubd88\ub9cc' },
  { value: 3, emoji: '\ud83d\ude10', label: '\ubcf4\ud1b5' },
  { value: 4, emoji: '\ud83d\ude0a', label: '\ub9cc\uc871' },
  { value: 5, emoji: '\ud83e\udd29', label: '\ub9e4\uc6b0 \ub9cc\uc871' },
];

const CATEGORIES = [
  { id: 'all', label: '\uc804\uccb4', icon: 'apps' },
  { id: 'ui', label: 'UI/\ub514\uc790\uc778', icon: 'palette' },
  { id: 'feature', label: '\uae30\ub2a5', icon: 'build' },
  { id: 'speed', label: '\uc18d\ub3c4', icon: 'speed' },
  { id: 'content', label: '\ucf58\ud150\uce20', icon: 'article' },
  { id: 'other', label: '\uae30\ud0c0', icon: 'more_horiz' },
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

export default function FeedbackAdminPage() {
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

  // \uac10\uc815 \ubd84\ud3ec \uacc4\uc0b0
  const emotionCounts = [1, 2, 3, 4, 5].map(v => feedback.filter(f => f.emotion === v).length);
  const totalFeedback = feedback.length;

  // \uc774\ubc88 \uc8fc vs \uc9c0\ub09c \uc8fc
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

  return (
    <div className="min-h-screen bg-[#0a0a14] text-white">
      {/* \ud5e4\ub354 */}
      <header className="border-b border-[#1e1e2e] bg-[#0d0d1a]/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-[1200px] mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/analytics" className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
              <span className="material-symbols-outlined text-gray-400">arrow_back</span>
            </Link>
            <span className="material-symbols-outlined text-[#00D4D4]">feedback</span>
            <h1 className="text-lg font-bold">\uc0ac\uc6a9\uc790 \ud53c\ub4dc\ubc31</h1>
            <span className="text-[12px] text-gray-500 bg-[#1e1e2e] px-2 py-0.5 rounded-full">{totalFeedback}\uac74</span>
          </div>
          <button onClick={fetchFeedback} className="flex items-center gap-1 px-3 py-1.5 text-[12px] text-gray-400 bg-[#1e1e2e] hover:bg-[#2a2a3e] rounded-lg transition-colors">
            <span className="material-symbols-outlined text-[14px]">refresh</span>
            \uc0c8\ub85c\uace0\uce68
          </button>
        </div>
      </header>

      <main className="max-w-[1200px] mx-auto p-6 space-y-6">
        {/* \uc694\uc57d \uce74\ub4dc */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {/* \ucd1d \ud53c\ub4dc\ubc31 */}
          <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-4">
            <p className="text-[11px] text-gray-500 uppercase tracking-wider">\ucd1d \ud53c\ub4dc\ubc31</p>
            <p className="text-2xl font-bold mt-1">{totalFeedback}</p>
          </div>
          {/* \uc774\ubc88 \uc8fc */}
          <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-4">
            <p className="text-[11px] text-gray-500 uppercase tracking-wider">\uc774\ubc88 \uc8fc</p>
            <div className="flex items-end gap-2 mt-1">
              <p className="text-2xl font-bold">{thisWeek}</p>
              {weekDiff !== 0 && (
                <span className={`text-[12px] font-medium ${weekDiff > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                  {weekDiff > 0 ? '+' : ''}{weekDiff} vs \uc9c0\ub09c\uc8fc
                </span>
              )}
            </div>
          </div>
          {/* \ud574\uacb0\ub960 */}
          <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-4">
            <p className="text-[11px] text-gray-500 uppercase tracking-wider">\ud574\uacb0\ub960</p>
            <p className="text-2xl font-bold mt-1">
              {totalFeedback > 0 ? Math.round((feedback.filter(f => f.resolved).length / totalFeedback) * 100) : 0}%
            </p>
          </div>
          {/* \ud3c9\uade0 \uac10\uc815 */}
          <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-4">
            <p className="text-[11px] text-gray-500 uppercase tracking-wider">\ud3c9\uade0 \uac10\uc815</p>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-2xl">
                {totalFeedback > 0
                  ? EMOTIONS[Math.round(feedback.reduce((s, f) => s + f.emotion, 0) / totalFeedback) - 1]?.emoji || '\u2014'
                  : '\u2014'}
              </span>
              <span className="text-lg font-bold">
                {totalFeedback > 0 ? (feedback.reduce((s, f) => s + f.emotion, 0) / totalFeedback).toFixed(1) : '-'}
              </span>
            </div>
          </div>
        </div>

        {/* \uac10\uc815 \ubd84\ud3ec \ub3c4\ub11b \ucc28\ud2b8 */}
        <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl p-5">
          <h2 className="text-sm font-semibold mb-4">\uac10\uc815 \ubd84\ud3ec</h2>
          <div className="flex items-center gap-6 justify-center">
            {/* \ub3c4\ub11b svg */}
            <svg viewBox="0 0 120 120" className="w-32 h-32">
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
            {/* \ubc94\ub840 */}
            <div className="space-y-2">
              {EMOTIONS.map((e, i) => (
                <div key={e.value} className="flex items-center gap-2 text-[12px]">
                  <span className="text-[18px]">{e.emoji}</span>
                  <div className="w-24 h-2 bg-[#1e1e2e] rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${totalFeedback > 0 ? (emotionCounts[i] / totalFeedback) * 100 : 0}%`,
                        backgroundColor: ['#EF4444', '#F59E0B', '#6B7280', '#3B82F6', '#10B981'][i],
                      }}
                    />
                  </div>
                  <span className="text-gray-400 w-6 text-right">{emotionCounts[i]}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* \uce74\ud14c\uace0\ub9ac \ud544\ud130 */}
        <div className="flex gap-2 flex-wrap">
          {CATEGORIES.map(c => (
            <button
              key={c.id}
              onClick={() => setFilter(c.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-medium transition-all ${
                filter === c.id
                  ? 'bg-[#00D4D4]/15 text-[#00D4D4] border border-[#00D4D4]/30'
                  : 'text-gray-500 bg-[#12121a] border border-[#1e1e2e] hover:text-gray-300 hover:bg-[#1e1e2e]'
              }`}
            >
              <span className="material-symbols-outlined text-[14px]">{c.icon}</span>
              {c.label}
            </button>
          ))}
        </div>

        {/* \ud53c\ub4dc\ubc31 \ubaa9\ub85d */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <span className="material-symbols-outlined text-[32px] text-[#00D4D4] animate-spin">refresh</span>
          </div>
        ) : feedback.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-gray-600">
            <span className="material-symbols-outlined text-[48px] mb-3">inbox</span>
            <p className="text-sm">\uc544\uc9c1 \ud53c\ub4dc\ubc31\uc774 \uc5c6\uc2b5\ub2c8\ub2e4.</p>
          </div>
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
                    <span className="text-[24px]">{emo?.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] px-2 py-0.5 bg-[#1e1e2e] rounded-md text-gray-400">
                          {cat?.label || item.category}
                        </span>
                        <span className="text-[11px] text-gray-600">{item.page_url}</span>
                      </div>
                      {item.message && (
                        <p className="text-[13px] text-gray-300 mt-1 truncate">{item.message}</p>
                      )}
                    </div>
                    <span className="text-[11px] text-gray-600 whitespace-nowrap">{timeStr}</span>
                    <button
                      onClick={e => { e.stopPropagation(); toggleResolved(item.id, item.resolved); }}
                      className={`p-1.5 rounded-lg transition-all ${
                        item.resolved
                          ? 'bg-emerald-500/15 text-emerald-400'
                          : 'bg-[#1e1e2e] text-gray-600 hover:text-gray-300'
                      }`}
                      title={item.resolved ? '\ud574\uacb0\ub428' : '\ud574\uacb0 \uc548\ub428'}
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        {item.resolved ? 'check_circle' : 'radio_button_unchecked'}
                      </span>
                    </button>
                  </div>

                  {/* \ud655\uc7a5 \uc601\uc5ed */}
                  {expanded && (
                    <div className="px-4 pb-4 border-t border-[#1e1e2e] pt-3 space-y-3">
                      {item.message && (
                        <div>
                          <p className="text-[11px] text-gray-600 mb-1">\uba54\uc2dc\uc9c0</p>
                          <p className="text-sm text-gray-300 whitespace-pre-wrap">{item.message}</p>
                        </div>
                      )}
                      <div className="flex gap-4 text-[11px] text-gray-600">
                        <span>Session: {item.session_id || '-'}</span>
                        <span>Page: {item.page_url}</span>
                      </div>
                      {item.screenshot_url && (
                        <div>
                          <p className="text-[11px] text-gray-600 mb-1">\uc2a4\ud06c\ub9b0\uc0f7</p>
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
      </main>
    </div>
  );
}
