import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

// 관리자 이메일 목록 (환경변수에서 가져옴)
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);

export const authOptions: NextAuthOptions = {
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID || '',
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
            authorization: {
                params: {
                    scope: [
                        'openid',
                        'email',
                        'profile',
                        // YouTube 데이터 접근 (읽기 전용)
                        'https://www.googleapis.com/auth/youtube.readonly',
                        // YouTube Analytics (채널 소유자 데이터)
                        'https://www.googleapis.com/auth/yt-analytics.readonly',
                    ].join(' '),
                    access_type: 'offline',  // refresh_token 받기
                    prompt: 'consent',       // 항상 동의 화면 표시 (refresh_token 보장)
                },
            },
        }),
    ],
    pages: {
        signIn: '/login',
        error: '/login',
    },
    callbacks: {
        async jwt({ token, account, profile }) {
            if (account && profile) {
                token.email = profile.email;
                token.name = profile.name;
                token.picture = (profile as Record<string, unknown>).picture as string;
                token.isAdmin = ADMIN_EMAILS.includes(profile.email || '');
                // YouTube API 접근용 토큰 저장
                token.accessToken = account.access_token;
                token.refreshToken = account.refresh_token;
                token.accessTokenExpires = account.expires_at ? account.expires_at * 1000 : 0;
            }
            // 토큰 만료 체크 및 갱신
            if (token.accessTokenExpires && Date.now() < (token.accessTokenExpires as number)) {
                return token;
            }
            // 만료된 경우 refresh
            if (token.refreshToken) {
                try {
                    const response = await fetch('https://oauth2.googleapis.com/token', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                        body: new URLSearchParams({
                            client_id: process.env.GOOGLE_CLIENT_ID || '',
                            client_secret: process.env.GOOGLE_CLIENT_SECRET || '',
                            grant_type: 'refresh_token',
                            refresh_token: token.refreshToken as string,
                        }),
                    });
                    const refreshed = await response.json();
                    if (refreshed.access_token) {
                        token.accessToken = refreshed.access_token;
                        token.accessTokenExpires = Date.now() + refreshed.expires_in * 1000;
                    }
                } catch (err) {
                    console.error('[Auth] Token refresh failed:', err);
                }
            }
            return token;
        },
        async session({ session, token }) {
            if (session.user) {
                session.user.email = token.email as string;
                session.user.name = token.name as string;
                session.user.image = token.picture as string;
                (session.user as Record<string, unknown>).isAdmin = token.isAdmin;
                (session.user as Record<string, unknown>).accessToken = token.accessToken;
            }
            return session;
        },
    },
    secret: process.env.NEXTAUTH_SECRET || 'autotext-secret-key-change-in-production',
    session: {
        strategy: 'jwt',
        maxAge: 30 * 24 * 60 * 60, // 30일
    },
};

export function isAdmin(email?: string | null): boolean {
    if (!email) return false;
    return ADMIN_EMAILS.includes(email);
}
