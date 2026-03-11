import type { Metadata } from 'next';
import { Suspense } from 'react';
import './globals.css';
import AnalyticsProvider from '@/components/analytics/AnalyticsProvider';
import AuthProvider from '@/components/auth/AuthProvider';
import FeedbackWidget from '@/components/feedback/FeedbackWidget';

export const metadata: Metadata = {
  title: 'AutoText | AI 자막 자동 생성',
  description: 'AI 기반 자막 자동 생성 및 추천 시스템 - 예능, 상황, 설명 자막을 자동으로 생성합니다.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ko" className="dark">
      <head>
        <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap" rel="stylesheet" />
        <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@300;400;500;600;700;800;900&family=Nanum+Gothic:wght@400;700;800&family=Nanum+Myeongjo:wght@400;700;800&family=Black+Han+Sans&family=Jua&family=Do+Hyeon&family=Gothic+A1:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen bg-editor-bg antialiased">
        <AuthProvider>
          <Suspense fallback={null}>
            <AnalyticsProvider>
              {children}
              <FeedbackWidget />
            </AnalyticsProvider>
          </Suspense>
        </AuthProvider>
      </body>
    </html>
  );
}
