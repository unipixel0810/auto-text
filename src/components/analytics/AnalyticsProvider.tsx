'use client';

import { useEffect, useRef } from 'react';
import { usePathname } from 'next/navigation';
import { initTracker, destroyTracker, resetPageTracking } from '@/lib/analytics/tracker';

export default function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const prevPath = useRef(pathname);

  useEffect(() => {
    initTracker();
    return () => destroyTracker();
  }, []);

  useEffect(() => {
    if (prevPath.current !== pathname) {
      prevPath.current = pathname;
      resetPageTracking();
    }
  }, [pathname]);

  return <>{children}</>;
}
