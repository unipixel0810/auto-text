'use client';

import { useEffect, useState, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

function SuccessContent() {
    const searchParams = useSearchParams();
    const router = useRouter();
    const [status, setStatus] = useState<'loading' | 'success' | 'error'>('loading');
    const [errorMessage, setErrorMessage] = useState('');

    useEffect(() => {
        const paymentKey = searchParams.get('paymentKey');
        const orderId = searchParams.get('orderId');
        const amount = searchParams.get('amount');

        if (!paymentKey || !orderId || !amount) {
            setStatus('error');
            setErrorMessage('유효하지 않은 결제 정보입니다.');
            return;
        }

        const confirmPayment = async () => {
            try {
                const response = await fetch('/api/payment/toss/confirm', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        paymentKey,
                        orderId,
                        amount: Number(amount),
                    }),
                });

                if (response.ok) {
                    setStatus('success');
                } else {
                    const data = await response.json();
                    setStatus('error');
                    setErrorMessage(data.error || '결제 승인에 실패했습니다.');
                }
            } catch (err: any) {
                setStatus('error');
                setErrorMessage(err.message || '네트워크 오류가 발생했습니다.');
            }
        };

        confirmPayment();
    }, [searchParams]);

    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-8 max-w-md w-full shadow-2xl text-center">
            {status === 'loading' && (
                <div className="space-y-4">
                    <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
                    <h2 className="text-xl font-bold text-white">결제 승인 중...</h2>
                    <p className="text-sm text-gray-400">잠시만 기다려주세요.</p>
                </div>
            )}

            {status === 'success' && (
                <div className="space-y-6">
                    <div className="w-20 h-20 bg-green-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="material-icons text-5xl text-green-400">check_circle</span>
                    </div>
                    <h2 className="text-2xl font-bold text-white">결제가 완료되었습니다!</h2>
                    <p className="text-gray-400">
                        프리미엄 구독 (1시간) 혜택이 적용되었습니다.<br />
                        이제 제한 없이 AI 자막 생성을 이용하실 수 있습니다.
                    </p>
                    <button
                        onClick={() => router.push('/')}
                        className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl transition-colors mt-4 shadow-lg shadow-blue-500/20"
                    >
                        에디터로 돌아가기
                    </button>
                </div>
            )}

            {status === 'error' && (
                <div className="space-y-6">
                    <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
                        <span className="material-icons text-5xl text-red-400">error</span>
                    </div>
                    <h2 className="text-2xl font-bold text-white">결제 승인 실패</h2>
                    <p className="text-red-400 bg-red-500/10 py-3 px-4 rounded-lg text-sm">
                        {errorMessage}
                    </p>
                    <div className="flex gap-3 mt-4">
                        <Link href="/admin/payment" className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-white font-bold rounded-xl transition-colors">
                            다시 시도
                        </Link>
                        <button
                            onClick={() => router.push('/')}
                            className="flex-1 py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold rounded-xl transition-colors"
                        >
                            홈으로
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export default function SuccessPage() {
    return (
        <div className="min-h-screen bg-black flex items-center justify-center p-4">
            <Suspense fallback={<div className="text-white">Loading...</div>}>
                <SuccessContent />
            </Suspense>
        </div>
    );
}
