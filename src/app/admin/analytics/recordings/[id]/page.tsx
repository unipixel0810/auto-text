'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams } from 'next/navigation';
import type { RecordedEvent } from '@/lib/analytics/recorder';

export default function SessionPlayerPage() {
  const params = useParams();
  const recordingId = params.id as string;
  const [recording, setRecording] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const animationFrameRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedTimeRef = useRef<number>(0);

  useEffect(() => {
    const fetchRecording = async () => {
      try {
        const res = await fetch(`/api/analytics/recordings/${recordingId}`);
        const data = await res.json();
        setRecording(data.recording);
      } catch (err) {
        console.error('Failed to fetch recording:', err);
      } finally {
        setLoading(false);
      }
    };
    if (recordingId) {
      fetchRecording();
    }
  }, [recordingId]);

  useEffect(() => {
    if (!isPlaying || !recording) return;

    const events = recording.events || [];
    if (events.length === 0) return;

    const totalDuration = events[events.length - 1]?.timestamp || 0;
    startTimeRef.current = Date.now() - pausedTimeRef.current * playbackSpeed;

    const play = () => {
      const elapsed = (Date.now() - startTimeRef.current) / playbackSpeed;
      const newTime = Math.min(elapsed, totalDuration);
      setCurrentTime(newTime);

      // 현재 시간에 해당하는 이벤트 재생
      const eventsToPlay = events.filter(
        (e: RecordedEvent) => e.timestamp <= newTime && e.timestamp > pausedTimeRef.current
      );

      eventsToPlay.forEach((event: RecordedEvent) => {
        replayEvent(event);
      });

      pausedTimeRef.current = newTime;

      if (newTime < totalDuration) {
        animationFrameRef.current = requestAnimationFrame(play);
      } else {
        setIsPlaying(false);
        setCurrentTime(totalDuration);
      }
    };

    animationFrameRef.current = requestAnimationFrame(play);

    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying, playbackSpeed, recording]);

  const replayEvent = (event: RecordedEvent) => {
    const iframe = iframeRef.current;
    if (!iframe || !iframe.contentWindow) return;

    try {
      const win = iframe.contentWindow;
      const doc = win.document;

      switch (event.type) {
        case 'click':
          if (event.data.x !== undefined && event.data.y !== undefined) {
            const element = doc.elementFromPoint(event.data.x, event.data.y);
            if (element) {
              element.dispatchEvent(new MouseEvent('click', {
                bubbles: true,
                cancelable: true,
                clientX: event.data.x,
                clientY: event.data.y,
              }));
            }
          }
          break;
        case 'scroll':
          if (event.data.scrollX !== undefined && event.data.scrollY !== undefined) {
            win.scrollTo(event.data.scrollX, event.data.scrollY);
          }
          break;
        case 'input':
          // 입력 이벤트는 재생하지 않음 (보안상의 이유)
          break;
        case 'navigation':
          // 네비게이션은 재생하지 않음
          break;
        case 'mouse_move':
          // 마우스 이동은 시각적 표시만
          break;
        default:
          break;
      }
    } catch (error) {
      // Cross-origin 오류 무시
      console.warn('[SessionPlayer] Cannot replay event:', error);
    }
  };

  const handlePlayPause = () => {
    if (isPlaying) {
      setIsPlaying(false);
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    } else {
      setIsPlaying(true);
    }
  };

  const handleSeek = (time: number) => {
    setCurrentTime(time);
    pausedTimeRef.current = time;
    setIsPlaying(false);
  };

  const totalDuration = recording?.events?.length > 0
    ? recording.events[recording.events.length - 1].timestamp
    : 0;

  const formatTime = (ms: number) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] text-white flex items-center justify-center">
        <span className="material-symbols-outlined text-[48px] text-[#00D4D4] animate-spin">refresh</span>
      </div>
    );
  }

  if (!recording) {
    return (
      <div className="min-h-screen bg-[#0d0d0d] text-white flex items-center justify-center">
        <div className="text-center">
          <span className="material-symbols-outlined text-[48px] text-gray-500 mb-4">error</span>
          <p className="text-gray-400">세션 녹화를 찾을 수 없습니다.</p>
        </div>
      </div>
    );
  }

  const iframeUrl = typeof window !== 'undefined'
    ? `${window.location.origin}${recording.page_url}?_analytics_preview=1`
    : '';

  return (
    <div className="min-h-screen bg-[#0d0d0d] text-white">
      <header className="border-b border-[#222] px-6 py-4 flex items-center justify-between sticky top-0 bg-[#0d0d0d] z-50">
        <div className="flex items-center gap-3">
          <a href="/admin/analytics" className="text-gray-400 hover:text-white transition-colors">
            <span className="material-symbols-outlined text-[20px]">arrow_back</span>
          </a>
          <span className="material-symbols-outlined text-[#00D4D4] text-[24px]">videocam</span>
          <h1 className="text-lg font-semibold">세션 녹화 재생</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-500">
            {recording.page_url} • {recording.session_id.slice(0, 8)}...
          </span>
        </div>
      </header>

      <main className="p-8">
        {/* 재생 컨트롤 */}
        <div className="bg-[#1a1a1a] border border-[#222] rounded-xl p-4 mb-6">
          <div className="flex items-center gap-4 mb-4">
            <button
              onClick={handlePlayPause}
              className="flex items-center justify-center w-12 h-12 rounded-lg bg-[#00D4D4] text-black hover:bg-[#00b8b8] transition-all"
            >
              <span className="material-symbols-outlined text-[24px]">
                {isPlaying ? 'pause' : 'play_arrow'}
              </span>
            </button>

            <div className="flex-1">
              <input
                type="range"
                min="0"
                max={totalDuration}
                value={currentTime}
                onChange={(e) => handleSeek(Number(e.target.value))}
                className="w-full h-2 bg-[#222] rounded-lg appearance-none cursor-pointer accent-[#00D4D4]"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>{formatTime(currentTime)}</span>
                <span>{formatTime(totalDuration)}</span>
              </div>
            </div>

            <select
              value={playbackSpeed}
              onChange={(e) => {
                setPlaybackSpeed(Number(e.target.value));
                setIsPlaying(false);
              }}
              className="bg-black border border-[#333] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[#00D4D4]"
            >
              <option value="0.5">0.5x</option>
              <option value="1">1x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2x</option>
            </select>
          </div>

          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span>이벤트: {recording.events?.length || 0}개</span>
            <span>지속시간: {formatTime(totalDuration)}</span>
            <span>시작: {new Date(recording.start_time).toLocaleString('ko-KR')}</span>
          </div>
        </div>

        {/* 재생 영역 */}
        <div className="relative bg-[#111] border border-[#222] rounded-xl overflow-hidden" style={{ aspectRatio: '16/9' }}>
          {iframeUrl && (
            <iframe
              ref={iframeRef}
              src={iframeUrl}
              className="absolute inset-0 w-full h-full border-0"
              sandbox="allow-same-origin allow-scripts allow-popups allow-forms allow-modals"
              title="Session Replay"
            />
          )}
        </div>
      </main>
    </div>
  );
}
