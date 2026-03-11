'use client';

import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function LoginContent() {
    const searchParams = useSearchParams();
    const error = searchParams.get('error');
    const callbackUrl = searchParams.get('callbackUrl') || '/';

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-950 flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                {/* Logo / Brand */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/30 mb-4">
                        <span className="material-icons text-3xl text-white">movie_edit</span>
                    </div>
                    <h1 className="text-3xl font-bold text-white tracking-tight">AutoText</h1>
                    <p className="text-gray-400 mt-2 text-sm">AI 자막 추천 · 영상 편집 시스템</p>
                </div>

                {/* Login Card */}
                <div className="bg-gray-900/80 backdrop-blur-xl border border-gray-800 rounded-2xl p-8 shadow-2xl">
                    {/* 베타 배지 */}
                    <div className="flex items-center justify-center gap-2 mb-5">
                        <span className="bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 text-[10px] font-bold px-2.5 py-1 rounded-full tracking-widest uppercase">Beta</span>
                        <span className="text-gray-500 text-xs">무료 베타 서비스</span>
                    </div>

                    <h2 className="text-xl font-semibold text-white mb-1">시작하기</h2>
                    <p className="text-gray-400 text-sm mb-6">YouTube(Google) 계정으로 무료로 이용하세요</p>

                    {error && (
                        <div className="bg-red-900/30 border border-red-800 text-red-300 px-4 py-3 rounded-lg text-sm mb-4 flex items-center gap-2">
                            <span className="material-icons text-sm">error</span>
                            {error === 'OAuthAccountNotLinked'
                                ? '이미 다른 방법으로 가입된 이메일입니다.'
                                : error === 'AccessDenied'
                                    ? '접근이 거부되었습니다.'
                                    : '로그인 중 오류가 발생했습니다.'}
                        </div>
                    )}

                    <button
                        onClick={() => signIn('google', { callbackUrl })}
                        className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-gray-800 font-medium py-3.5 px-6 rounded-xl transition-all active:scale-[0.98] shadow-lg hover:shadow-xl"
                    >
                        {/* Google 로고 */}
                        <svg className="w-5 h-5 shrink-0" viewBox="0 0 24 24">
                            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                        </svg>
                        <span>YouTube(Google) 계정으로 계속하기</span>
                    </button>

                    {/* 베타 혜택 안내 */}
                    <div className="mt-5 bg-cyan-950/30 border border-cyan-800/30 rounded-xl p-4">
                        <p className="text-cyan-300 text-[11px] font-semibold mb-2 flex items-center gap-1.5">
                            <span className="material-icons text-sm">auto_awesome</span>
                            베타 기간 무료 혜택
                        </p>
                        <ul className="space-y-1">
                            {['AI 자막 자동 생성', 'AI 음성(TTS) 생성', '영상 편집 타임라인', '클라우드 프로젝트 저장'].map(item => (
                                <li key={item} className="text-gray-400 text-[11px] flex items-center gap-1.5">
                                    <span className="material-icons text-[10px] text-cyan-400">check_circle</span>
                                    {item}
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="mt-5 pt-5 border-t border-gray-800">
                        <p className="text-gray-500 text-xs text-center leading-relaxed">
                            로그인하면 <span className="text-gray-400">이용약관</span> 및 <span className="text-gray-400">개인정보처리방침</span>에 동의하는 것으로 간주합니다.
                        </p>
                    </div>
                </div>

                {/* Footer */}
                <p className="text-gray-600 text-xs text-center mt-6">
                    © 2026 AutoText. All rights reserved.
                </p>
            </div>
        </div>
    );
}

export default function LoginPage() {
    return (
        <Suspense fallback={
            <div className="min-h-screen bg-gray-950 flex items-center justify-center">
                <div className="animate-spin w-8 h-8 border-2 border-cyan-400 border-t-transparent rounded-full" />
            </div>
        }>
            <LoginContent />
        </Suspense>
    );
}
