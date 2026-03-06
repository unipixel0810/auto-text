'use client';

import { useEffect, useRef } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { initTracker, destroyTracker, resetPageTracking } from '@/lib/analytics/tracker';
import { initABTests } from '@/lib/analytics/ab-test';
import { loadExperimentConfigs, applyExperimentsToPage } from '@/lib/analytics/ab-experiments';
import { getSessionRecorder } from '@/lib/analytics/recorder';

export default function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const prevPath = useRef(pathname);
  const configsLoaded = useRef(false);
  const recorderRef = useRef<ReturnType<typeof getSessionRecorder> | null>(null);

  const isPreview = searchParams.get('_analytics_preview') === '1';

  useEffect(() => {
    if (isPreview) return;

    // 실험 설정 로드 및 적용
    if (!configsLoaded.current) {
      loadExperimentConfigs().then(() => {
        configsLoaded.current = true;
        applyExperimentsToPage();
        initABTests();
      });
    } else {
      applyExperimentsToPage();
      initABTests();
    }

    initTracker();

    // 세션 녹화 시작
    if (typeof window !== 'undefined') {
      recorderRef.current = getSessionRecorder();
      recorderRef.current.start();
    }

    return () => {
      destroyTracker();
      // 세션 녹화 중지
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

      // 페이지 변경 시 실험 설정 적용 및 A/B 테스트 초기화 (약간의 지연 후 실행)
      const timer = setTimeout(() => {
        applyExperimentsToPage();
        initABTests();
      }, 200);
      return () => clearTimeout(timer);
    }
  }, [pathname, isPreview]);

  return <>{children}</>;
}
