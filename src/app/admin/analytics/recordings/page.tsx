'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { LoadingSpinner, EmptyState, formatDuration } from '@/components/analytics/shared';
import { DATE_FILTERS } from '@/lib/analytics/types';

const PAGE_SIZE = 20;

interface Recording {
  id: string;
  session_id: string;
  page_url: string;
  start_time: string;
  end_time: string;
  events_count: number;
}

export default function RecordingsPage() {
  const router = useRouter();
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [dateFilter, setDateFilter] = useState(DATE_FILTERS[1]);
  const [page, setPage] = useState(0);

  const fetchRecordings = useCallback(async (pageNum: number, append: boolean) => {
    append ? setLoadingMore(true) : setLoading(true);
    try {
      const res = await fetch(
        `/api/analytics/recordings?days=${dateFilter.days}&offset=${pageNum * PAGE_SIZE}&limit=${PAGE_SIZE}`
      );
      if (!res.ok) { console.error('Failed to fetch recordings:', res.status); return; }
      const data = await res.json();
      const items: Recording[] = data.recordings ?? [];
      setRecordings((prev) => (append ? [...prev, ...items] : items));
      setHasMore(items.length >= PAGE_SIZE);
    } catch (err) { console.error('Failed to fetch recordings:', err); }
    append ? setLoadingMore(false) : setLoading(false);
  }, [dateFilter]);

  useEffect(() => {
    setPage(0);
    fetchRecordings(0, false);
  }, [fetchRecordings]);

  const loadMore = () => {
    const next = page + 1;
    setPage(next);
    fetchRecordings(next, true);
  };

  const getDuration = (start: string, end: string) => {
    const sec = Math.round((new Date(end).getTime() - new Date(start).getTime()) / 1000);
    return formatDuration(Math.max(sec, 0));
  };

  if (loading) return <div className="min-h-screen bg-[#0d0d14] p-6"><LoadingSpinner /></div>;

  return (
    <div className="min-h-screen bg-[#0d0d14] p-6 text-white">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black">Session Recordings</h1>
          <p className="text-sm text-gray-500 mt-1">세션 녹화 목록</p>
        </div>
        <div className="flex gap-1 bg-[#12121a] border border-[#1e1e2e] rounded-lg p-1">
          {DATE_FILTERS.map((f) => (
            <button key={f.value} onClick={() => setDateFilter(f)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${dateFilter.value === f.value ? 'bg-[#00D4D4] text-black' : 'text-gray-400 hover:text-white'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {recordings.length === 0 ? (
        <EmptyState icon="videocam_off" message="녹화된 세션이 없습니다" />
      ) : (
        <div className="bg-[#12121a] border border-[#1e1e2e] rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] text-gray-500 uppercase tracking-wider border-b border-[#1e1e2e]">
                <th className="px-4 py-3">Session ID</th>
                <th className="px-4 py-3">Page URL</th>
                <th className="px-4 py-3">Start Time</th>
                <th className="px-4 py-3">Duration</th>
                <th className="px-4 py-3">Events</th>
                <th className="px-4 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e1e2e]">
              {recordings.map((rec) => (
                <tr key={rec.id} className="hover:bg-[#1a1a2e] transition-colors">
                  <td className="px-4 py-3 font-mono text-xs text-[#00D4D4]">{rec.session_id.slice(0, 8)}</td>
                  <td className="px-4 py-3 text-gray-300 truncate max-w-[280px]">{rec.page_url}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{new Date(rec.start_time).toLocaleString('ko-KR')}</td>
                  <td className="px-4 py-3 text-gray-400 text-xs">{getDuration(rec.start_time, rec.end_time)}</td>
                  <td className="px-4 py-3 text-white font-bold">{rec.events_count}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => router.push(`/admin/analytics/recordings/${rec.id}`)}
                      className="flex items-center gap-1 px-3 py-1 rounded-lg bg-[#00D4D4]/10 text-[#00D4D4] text-xs font-bold hover:bg-[#00D4D4]/20 transition-colors">
                      <span className="material-symbols-outlined text-[14px]">play_arrow</span>
                      Play
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {hasMore && (
            <div className="flex justify-center py-4 border-t border-[#1e1e2e]">
              <button onClick={loadMore} disabled={loadingMore}
                className="px-6 py-2 rounded-lg bg-[#1e1e2e] text-gray-400 text-xs font-bold hover:bg-[#2a2a3e] hover:text-white transition-colors disabled:opacity-50">
                {loadingMore ? 'Loading...' : 'Load More'}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
