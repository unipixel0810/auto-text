'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { initTracker, destroyTracker, resetPageTracking } from '@/lib/analytics/tracker';

export default function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const prevPath = useRef(pathname);

  const isPreview = searchParams.get('_analytics_preview') === '1';

  useEffect(() => {
    if (isPreview) return;
    initTracker();
    return () => destroyTracker();
  }, [isPreview]);

  useEffect(() => {
    if (isPreview) return;
    if (prevPath.current !== pathname) {
      prevPath.current = pathname;
      resetPageTracking();
    }
  }, [pathname, isPreview]);

  return <>{children}</>;
}
