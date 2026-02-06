/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // FFmpeg.wasm을 위한 헤더 설정 (SharedArrayBuffer 지원)
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Cross-Origin-Opener-Policy',
            value: 'same-origin',
          },
          {
            key: 'Cross-Origin-Embedder-Policy',
            value: 'require-corp',
          },
        ],
      },
    ];
  },
  // 웹팩 설정 - FFmpeg WASM 지원
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      path: false,
    };
    return config;
  },
};

module.exports = nextConfig;
