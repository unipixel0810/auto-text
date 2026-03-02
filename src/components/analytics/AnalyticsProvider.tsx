'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { initTracker, destroyTracker, resetPageTracking } from '@/lib/analytics/tracker';
import { initABTests } from '@/lib/analytics/ab-test';

export default function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const prevPath = useRef(pathname);

  const isPreview = searchParams.get('_analytics_preview') === '1';

  useEffect(() => {
    if (isPreview) return;
    initTracker();
    initABTests(); // A/B 테스트 초기화 추가
    return () => destroyTracker();
  }, [isPreview]);

  useEffect(() => {
    if (isPreview) return;
    if (prevPath.current !== pathname) {
      prevPath.current = pathname;
      resetPageTracking();
      // 페이지 변경 시 A/B 테스트도 다시 초기화
      setTimeout(() => initABTests(), 100);
    }
  }, [pathname, isPreview]);

  return <>{children}</>;
}
