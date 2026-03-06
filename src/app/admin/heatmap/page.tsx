'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/**
 * /admin/heatmap → /admin/analytics로 리다이렉트
 * (기획서 명세: 관리자 페이지 /admin/heatmap)
 */
export default function HeatmapRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/admin/analytics');
  }, [router]);

  return (
    <div className="min-h-screen bg-[#0d0d0d] flex items-center justify-center">
      <div className="text-center">
        <span className="material-symbols-outlined text-[48px] text-[#00D4D4] animate-spin">refresh</span>
        <p className="text-gray-400 mt-4 text-sm">리다이렉트 중...</p>
      </div>
    </div>
  );
}
