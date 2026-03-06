'use client';

import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';

function FailContent() {
    const searchParams = useSearchParams();
    const code = searchParams.get('code');
    const message = searchParams.get('message');

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 max-w-md w-full shadow-2xl text-center space-y-6">
            <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="material-icons text-5xl text-red-400">error</span>
            </div>
            <h2 className="text-2xl font-bold text-white">결제 실패</h2>
            <div className="text-left bg-black/50 border border-gray-800 p-4 rounded-xl space-y-2">
                <p className="text-sm text-gray-400 flex items-start gap-2">
                    <span className="font-semibold text-gray-300 w-16 shrink-0">에러 코드:</span>
                    <span className="break-all">{code || '알 수 없음'}</span>
                </p>
                <p className="text-sm text-gray-400 flex items-start gap-2">
                    <span className="font-semibold text-gray-300 w-16 shrink-0">에러 메시지:</span>
                    <span className="break-all">{message || '서버 통신 중 오류가 발생했습니다.'}</span>
                </p>
            </div>

            <div className="flex gap-3 mt-8">
                <Link
                    href="/admin/payment"
                    className="flex-1 py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-colors"
                >
                    다시 결제하기
                </Link>
                <Link
                    href="/"
                    className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-white font-bold rounded-xl transition-colors"
                >
                    홈으로 가기
                </Link>
            </div>
        </div>
    );
}

export default function FailPage() {
    return (
        <div className="min-h-screen bg-black flex items-center justify-center p-4">
            <Suspense fallback={<div className="text-white">Loading...</div>}>
                <FailContent />
            </Suspense>
        </div>
    );
}
