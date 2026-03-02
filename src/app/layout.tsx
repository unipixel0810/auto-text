import type { Metadata } from 'next';
import './globals.css';
import AnalyticsProvider from '@/components/analytics/AnalyticsProvider';

export const metadata: Metadata = {
  title: '자막 추천 시스템 | Subtitle Recommender',
  description: 'AI 기반 자막 유형 추천 시스템 - 예능, 상황, 설명 자막을 자동으로 분류합니다.',
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
      </head>
      <body className="min-h-screen bg-editor-bg antialiased overflow-hidden">
        <AnalyticsProvider>
          {children}
        </AnalyticsProvider>
      </body>
    </html>
  );
}
