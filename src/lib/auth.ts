import type { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';

// 관리자 이메일 목록 (환경변수에서 가져옴)
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || '').split(',').map(e => e.trim()).filter(Boolean);

export const authOptions: NextAuthOptions = {
    providers: [
        GoogleProvider({
            clientId: process.env.GOOGLE_CLIENT_ID || '',
            clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
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
            }
            return token;
        },
        async session({ session, token }) {
            if (session.user) {
                session.user.email = token.email as string;
                session.user.name = token.name as string;
                session.user.image = token.picture as string;
                (session.user as Record<string, unknown>).isAdmin = token.isAdmin;
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
