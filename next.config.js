/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // FFmpeg.wasm + Security 헤더 설정
  async headers() {
    return [
      // ── 히트맵 iframe 미리보기 전용: X-Frame-Options 없이, COEP 완화 ──
      // _analytics_preview=1 쿼리 파라미터가 있는 요청은 같은 출처 iframe 허용
      {
        source: '/:path*',
        has: [{ type: 'query', key: '_analytics_preview', value: '1' }],
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          // require-corp 대신 unsafe-none으로 낮춰서 iframe 내 리소스 로드 허용
          { key: 'Cross-Origin-Embedder-Policy', value: 'unsafe-none' },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      // ── 일반 페이지: FFmpeg WASM 지원 + 보안 헤더 (iframe 차단) ──
      {
        source: '/:path*',
        headers: [
          // FFmpeg SharedArrayBuffer 지원
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'require-corp',
          },
          // 보안 헤더
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
          {
            key: 'Referrer-Policy',
            value: 'strict-origin-when-cross-origin',
          },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(self), geolocation=()',
          },
        ],
      },
    ];
  },
  // Turbopack: root를 명시해서 한글 폴더명 경로 문제 우회
  turbopack: {
    root: __dirname,
  },
};

module.exports = nextConfig;
