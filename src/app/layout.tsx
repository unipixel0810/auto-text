import type { Metadata } from 'next';
import './globals.css';

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
    <html lang="ko">
      <body className="min-h-screen bg-gray-950 antialiased">
        {children}
      </body>
    </html>
  );
}
