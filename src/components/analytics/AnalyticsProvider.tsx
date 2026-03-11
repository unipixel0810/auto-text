'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { initTracker, destroyTracker, resetPageTracking } from '@/lib/analytics/tracker';
import { initABTests } from '@/lib/analytics/ab-test';
import { getSessionRecorder } from '@/lib/analytics/recorder';

export default function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const prevPath = useRef(pathname);
  const recorderRef = useRef<ReturnType<typeof getSessionRecorder> | null>(null);

  const isPreview = searchParams.get('_analytics_preview') === '1';

  useEffect(() => {
    if (isPreview) return;

    initTracker();

    // A/B 테스트 초기화 — [data-ab-test] 속성 요소 자동 감지 (DOM 렌더링 대기)
    const abTimer = setTimeout(() => initABTests(), 300);

    // 세션 녹화 시작
    if (typeof window !== 'undefined') {
      recorderRef.current = getSessionRecorder();
      recorderRef.current.start();
    }

    return () => {
      clearTimeout(abTimer);
      destroyTracker();
      if (recorderRef.current) {
        recorderRef.current.stop();
      }
    };
  }, [isPreview]);

  useEffect(() => {
    if (isPreview) return;
    if (prevPath.current !== pathname) {
      prevPath.current = pathname;
      resetPageTracking();

      // 페이지 변경 시 세션 녹화 재시작
      if (recorderRef.current) {
        recorderRef.current.stop().catch(err => console.debug('[Analytics] Recorder stop error:', err)).then(() => {
          recorderRef.current = getSessionRecorder();
          recorderRef.current.start();
        });
      }

      // 페이지 변경 시 A/B 테스트 재초기화 (DOM 렌더링 대기)
      const abTimer = setTimeout(() => initABTests(), 300);
      return () => clearTimeout(abTimer);
    }
  }, [pathname, isPreview]);

  return <>{children}</>;
}
