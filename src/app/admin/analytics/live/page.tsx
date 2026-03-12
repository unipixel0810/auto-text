'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { LoadingSpinner, EmptyState } from '@/components/analytics/shared';
import { DATE_FILTERS } from '@/lib/analytics/types';

const EVENT_TYPE_COLORS: Record<string, string> = {
  page_view: '#10B981',
  click: '#3B82F6',
  scroll: '#8B5CF6',
  error: '#EF4444',
  cta_click: '#F59E0B',
  rage_click: '#EC4899',
  dead_click: '#6366F1',
  page_leave: '#6B7280',
  form_interaction: '#00D4D4',
  performance: '#A78BFA',
};

const ALL_EVENT_TYPES = Object.keys(EVENT_TYPE_COLORS);

interface LiveEvent {
  event_type: string;
  page_url: string;
  page_title?: string;
  element_text?: string;
  session_id: string;
  created_at: string;
}

export default function LiveEventsPage() {
  const [events, setEvents] = useState<LiveEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [paused, setPaused] = useState(false);
  const [enabledTypes, setEnabledTypes] = useState<Set<string>>(new Set(ALL_EVENT_TYPES));
  const [dateFilter, setDateFilter] = useState(DATE_FILTERS[0]);
  const eventTimestamps = useRef<number[]>([]);

  const fetchEvents = useCallback(async () => {
    const since = new Date(Date.now() - Math.max(dateFilter.days, 1) * 86_400_000).toISOString();
    try {
      const res = await fetch(`/api/analytics/query?action=live&since=${since}&limit=50`);
      const data = await res.json();
      if (data.events) {
        setEvents(data.events);
        eventTimestamps.current.push(Date.now());
        eventTimestamps.current = eventTimestamps.current.filter((t) => Date.now() - t < 60_000);
      }
    } catch { /* silently retry on next tick */ }
    setLoading(false);
  }, [dateFilter]);

  useEffect(() => {
    fetchEvents();
    if (paused) return;
    const id = setInterval(fetchEvents, 3000);
    return () => clearInterval(id);
  }, [fetchEvents, paused]);

  const toggleType = (type: string) => {
    setEnabledTypes((prev) => {
      const next = new Set(prev);
      next.has(type) ? next.delete(type) : next.add(type);
      return next;
    });
  };

  const eventsPerMinute = eventTimestamps.current.filter((t) => Date.now() - t < 60_000).length;
  const filtered = events.filter((e) => enabledTypes.has(e.event_type));

  const formatTime = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
  };

  if (loading) return <div className="min-h-screen bg-[#0d0d14] p-6"><LoadingSpinner /></div>;

  return (
    <div className="min-h-screen bg-[#0d0d14] p-6 text-white">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black">Real-time Event Stream</h1>
          <p className="text-sm text-gray-500 mt-1">실시간 이벤트 모니터링</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">{eventsPerMinute} events/min</span>
          <div className="flex gap-1 bg-[#12121a] border border-[#1e1e2e] rounded-lg p-1">
            {DATE_FILTERS.map((f) => (
              <button key={f.value} onClick={() => setDateFilter(f)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${dateFilter.value === f.value ? 'bg-[#00D4D4] text-black' : 'text-gray-400 hover:text-white'}`}>
                {f.label}
              </button>
            ))}
          </div>
          <button onClick={() => setPaused((p) => !p)}
            className={`px-4 py-1.5 rounded-lg text-xs font-bold transition-colors ${paused ? 'bg-[#00D4D4] text-black' : 'bg-red-500/20 text-red-400 border border-red-500/30'}`}>
            {paused ? 'Resume' : 'Pause'}
          </button>
        </div>
      </div>

      {/* Event type filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        {ALL_EVENT_TYPES.map((type) => (
          <label key={type} className="flex items-center gap-1.5 cursor-pointer select-none">
            <input type="checkbox" checked={enabledTypes.has(type)} onChange={() => toggleType(type)}
              className="accent-[#00D4D4] w-3.5 h-3.5" />
            <span className="text-xs font-medium" style={{ color: EVENT_TYPE_COLORS[type] }}>{type}</span>
          </label>
        ))}
      </div>

      {/* Event list */}
      {filtered.length === 0 ? (
        <EmptyState icon="stream" message="이벤트가 없습니다" />
      ) : (
        <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl overflow-hidden">
          <div className="max-h-[70vh] overflow-y-auto divide-y divide-[#1e1e2e]">
            {filtered.map((evt, i) => (
              <div key={`${evt.created_at}-${i}`} className="flex items-center gap-4 px-4 py-2.5 hover:bg-[#1a1a2e] transition-colors">
                <span className="text-xs text-gray-500 font-mono w-16 shrink-0">{formatTime(evt.created_at)}</span>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0"
                  style={{ backgroundColor: `${EVENT_TYPE_COLORS[evt.event_type] ?? '#6B7280'}22`, color: EVENT_TYPE_COLORS[evt.event_type] ?? '#6B7280' }}>
                  {evt.event_type}
                </span>
                <span className="text-xs text-gray-300 truncate flex-1">{evt.page_url}</span>
                {evt.element_text && (
                  <span className="text-xs text-gray-500 truncate max-w-[160px]">&ldquo;{evt.element_text}&rdquo;</span>
                )}
                <span className="text-[10px] text-gray-600 font-mono shrink-0">{evt.session_id.slice(0, 8)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
