'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { LoadingSpinner, EmptyState, formatNumber } from '@/components/analytics/shared';

// ─── Types ──────────────────────────────────────────────────────────────
interface UserRow {
  visitor_id: string;
  first_seen: string;
  last_seen: string;
  total_sessions: number;
  total_events: number;
}

interface ActivityEvent {
  event_type: string;
  page_url: string;
  created_at: string;
  element_text?: string;
}

// ─── Constants ──────────────────────────────────────────────────────────
const PAGE_LIMIT = 50;

const EVENT_BADGE_COLORS: Record<string, string> = {
  click: '#3B82F6',
  page_view: '#10B981',
  scroll: '#8B5CF6',
  form_submit: '#F59E0B',
  error: '#EF4444',
  session_start: '#00D4D4',
};

const getBadgeColor = (type: string) => EVENT_BADGE_COLORS[type] ?? '#6B7280';

const truncateId = (id: string) => (id.length > 12 ? `${id.slice(0, 6)}...${id.slice(-4)}` : id);

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleDateString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
};

// ─── Page ───────────────────────────────────────────────────────────────
export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activityMap, setActivityMap] = useState<Record<string, ActivityEvent[]>>({});
  const [activityLoading, setActivityLoading] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_LIMIT));

  const fetchUsers = useCallback(async (p: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/analytics/query?action=users&page=${p}&limit=${PAGE_LIMIT}`);
      if (!res.ok) { console.error('Failed to fetch users:', res.status); setUsers([]); return; }
      const data = await res.json();
      setUsers(data?.users ?? []);
      setTotal(data?.total ?? 0);
    } catch (err) {
      console.error('Failed to fetch users:', err);
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(page); }, [page, fetchUsers]);

  const handleRowClick = async (visitorId: string) => {
    if (expandedId === visitorId) { setExpandedId(null); return; }
    setExpandedId(visitorId);
    if (activityMap[visitorId]) return;
    setActivityLoading(true);
    try {
      const res = await fetch(`/api/analytics/query?action=user_activity&visitor_id=${encodeURIComponent(visitorId)}`);
      if (!res.ok) { console.error('Failed to fetch user activity:', res.status); setActivityMap(prev => ({ ...prev, [visitorId]: [] })); return; }
      const data = await res.json();
      setActivityMap(prev => ({ ...prev, [visitorId]: data?.events ?? [] }));
    } catch (err) {
      console.error('Failed to fetch user activity:', err);
      setActivityMap(prev => ({ ...prev, [visitorId]: [] }));
    } finally {
      setActivityLoading(false);
    }
  };

  const filtered = search
    ? users.filter(u => u.visitor_id.toLowerCase().includes(search.toLowerCase()))
    : users;

  return (
    <div className="min-h-screen bg-[#0d0d14] text-white p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-[#00D4D4] text-2xl">group</span>
            <h1 className="text-xl font-bold">User Profiles</h1>
            <span className="text-xs text-gray-500 bg-[#12121a] px-2 py-0.5 rounded-full border border-[#1e1e2e]">
              {formatNumber(total)}명
            </span>
          </div>
          <input
            type="text"
            placeholder="Visitor ID 검색..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="bg-[#12121a] border border-[#1e1e2e] rounded-lg px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-[#00D4D4] focus:outline-none w-64"
          />
        </div>

        {/* Table */}
        {loading ? <LoadingSpinner /> : filtered.length === 0 ? (
          <EmptyState icon="person_off" message="방문자 데이터가 없습니다." />
        ) : (
          <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#1e1e2e] text-gray-500 text-[11px] uppercase tracking-wider">
                  <th className="text-left px-4 py-3">Visitor ID</th>
                  <th className="text-left px-4 py-3">첫 방문</th>
                  <th className="text-left px-4 py-3">마지막 방문</th>
                  <th className="text-right px-4 py-3">세션 수</th>
                  <th className="text-right px-4 py-3">이벤트 수</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(u => (
                  <React.Fragment key={u.visitor_id}>
                    <tr
                      onClick={() => handleRowClick(u.visitor_id)}
                      className={`border-b border-[#1e1e2e] cursor-pointer transition-colors hover:bg-[#1a1a28] ${expandedId === u.visitor_id ? 'bg-[#1a1a28]' : ''}`}
                    >
                      <td className="px-4 py-3 font-mono text-[#00D4D4]">{truncateId(u.visitor_id)}</td>
                      <td className="px-4 py-3 text-gray-400">{formatDate(u.first_seen)}</td>
                      <td className="px-4 py-3 text-gray-400">{formatDate(u.last_seen)}</td>
                      <td className="px-4 py-3 text-right">{formatNumber(u.total_sessions)}</td>
                      <td className="px-4 py-3 text-right">{formatNumber(u.total_events)}</td>
                    </tr>
                    {expandedId === u.visitor_id && (
                      <tr>
                        <td colSpan={5} className="bg-[#0d0d14] px-6 py-4">
                          <ActivityTimeline
                            events={activityMap[u.visitor_id]}
                            loading={activityLoading && !activityMap[u.visitor_id]}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {!loading && totalPages > 1 && (
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-3 py-1.5 text-xs rounded-lg border border-[#1e1e2e] bg-[#12121a] text-gray-400 hover:border-[#00D4D4] disabled:opacity-30 disabled:hover:border-[#1e1e2e] transition-colors"
            >
              이전
            </button>
            <span className="text-xs text-gray-500">{page} / {totalPages}</span>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="px-3 py-1.5 text-xs rounded-lg border border-[#1e1e2e] bg-[#12121a] text-gray-400 hover:border-[#00D4D4] disabled:opacity-30 disabled:hover:border-[#1e1e2e] transition-colors"
            >
              다음
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Activity Timeline ──────────────────────────────────────────────────
function ActivityTimeline({ events, loading }: { events?: ActivityEvent[]; loading: boolean }) {
  if (loading) return <div className="text-center py-4 text-gray-500 text-sm">로딩 중...</div>;
  if (!events || events.length === 0) return <EmptyState icon="timeline" message="활동 기록이 없습니다." />;

  return (
    <div className="relative pl-6 space-y-3 max-h-80 overflow-y-auto">
      <div className="absolute left-2 top-0 bottom-0 w-px bg-[#1e1e2e]" />
      {events.map((ev, i) => {
        const color = getBadgeColor(ev.event_type);
        return (
          <div key={i} className="relative flex items-start gap-3">
            <div className="absolute -left-[17px] top-1.5 w-2.5 h-2.5 rounded-full border-2" style={{ borderColor: color, backgroundColor: `${color}33` }} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded" style={{ color, backgroundColor: `${color}18` }}>
                  {ev.event_type}
                </span>
                <span className="text-[10px] text-gray-600">{formatDate(ev.created_at)}</span>
              </div>
              <p className="text-xs text-gray-400 truncate">{ev.page_url}</p>
              {ev.element_text && <p className="text-[10px] text-gray-600 truncate mt-0.5">{ev.element_text}</p>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
