'use client';

import { SessionProvider, useSession, signIn, signOut } from 'next-auth/react';
import type { Session } from 'next-auth';

interface AuthProviderProps {
    children: React.ReactNode;
    session?: Session | null;
}

export default function AuthProvider({ children, session }: AuthProviderProps) {
    return (
        <SessionProvider session={session}>
            {children}
        </SessionProvider>
    );
}

// 인증 상태 훅
export function useAuth() {
    const { data: session, status } = useSession();

    return {
        user: session?.user ?? null,
        isAuthenticated: status === 'authenticated',
        isLoading: status === 'loading',
        isAdmin: (session?.user as Record<string, unknown>)?.isAdmin === true,
        signIn: () => signIn('google'),
        signOut: () => signOut({ callbackUrl: '/login' }),
    };
}
