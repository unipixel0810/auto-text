import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

// 관리자 이메일 목록
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);

export default withAuth(
    function middleware(req) {
        const { pathname } = req.nextUrl;
        const token = req.nextauth.token;

        // /admin/* 경로: 관리자만 접근 가능
        if (pathname.startsWith('/admin')) {
            if (!token?.email || !ADMIN_EMAILS.includes(token.email as string)) {
                // 관리자가 아니면 메인 페이지로 리다이렉트
                return NextResponse.redirect(new URL('/', req.url));
            }
        }

        // 보안 헤더 강화 (개인정보 보호 + 해킹 방지)
        const response = NextResponse.next();

        // 클릭재킹 방지
        response.headers.set('X-Frame-Options', 'DENY');
        // MIME 스니핑 방지
        response.headers.set('X-Content-Type-Options', 'nosniff');
        // 리퍼러 정보 최소화 (개인정보 보호)
        response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
        // XSS 방지
        response.headers.set('X-XSS-Protection', '1; mode=block');
        // 권한 정책 (불필요한 브라우저 기능 차단)
        response.headers.set('Permissions-Policy', 'camera=(), microphone=(self), geolocation=(), payment=(), usb=(), bluetooth=()');
        // HTTPS 강제 (HSTS) — 1년
        response.headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        // 다운로드 공격 방지
        response.headers.set('X-Download-Options', 'noopen');
        // DNS 프리페치 차단 (정보 유출 방지)
        response.headers.set('X-DNS-Prefetch-Control', 'off');

        return response;
    },
    {
        callbacks: {
            authorized: ({ token, req }) => {
                const { pathname } = req.nextUrl;

                // 모든 경로 공개 — 누구나 로그인 없이 접근 가능 (베타 오픈)
                // /admin 경로만 로그인 필수
                if (pathname.startsWith('/admin')) {
                    return !!token;
                }
                return true;
            },
        },
    }
);

export const config = {
    matcher: [
        /*
         * 아래 경로 제외하고 모든 요청에 미들웨어 적용:
         * - _next/static (정적 파일)
         * - _next/image (이미지 최적화)
         * - favicon.ico
         * - 공개 이미지/폰트 파일
         */
        '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|woff|woff2|ttf|ico)$).*)',
    ],
};
