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
            // /admin 경로만 인증 검사
            authorized: ({ token, req }) => {
                const { pathname } = req.nextUrl;
                // /admin 경로: 로그인 필수
                if (pathname.startsWith('/admin')) {
                    return !!token;
                }
                // 다른 경로: 통과 (로그인 없이도 접근 가능)
                return true;
            },
        },
    }
);

export const config = {
    matcher: [
        '/admin/:path*',
        '/api/admin/:path*',
    ],
};
