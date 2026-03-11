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

        // 보안 헤더 추가
        const response = NextResponse.next();
        response.headers.set('X-Frame-Options', 'DENY');
        response.headers.set('X-Content-Type-Options', 'nosniff');
        response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
        response.headers.set('X-XSS-Protection', '1; mode=block');
        response.headers.set('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()');

        return response;
    },
    {
        callbacks: {
            authorized: ({ token, req }) => {
                const { pathname } = req.nextUrl;

                // 로그인 없이 접근 가능한 공개 경로
                const publicPaths = ['/login', '/api/'];
                if (publicPaths.some(p => pathname.startsWith(p))) {
                    return true;
                }

                // landing 페이지는 공개
                if (pathname.startsWith('/landing')) {
                    return true;
                }

                // 나머지 모든 페이지 경로: 로그인 필수 (베타 정책 — Google 로그인만 허용)
                return !!token;
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
