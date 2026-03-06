'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

interface TossPaymentModalProps {
    isOpen: boolean;
    onClose: () => void;
    price?: number;
}

export default function TossPaymentModal({ isOpen, onClose, price = 14800 }: TossPaymentModalProps) {
    const router = useRouter();

    if (!isOpen) return null;

    const handlePaymentClick = () => {
        // We navigate to a dedicated payment page for a cleaner Toss widget flow
        router.push(`/admin/payment?amount=${price}`);
    };

    return (
        <div className="fixed inset-0 bg-black/80 z-[200] flex items-center justify-center p-4">
            <div className="bg-gray-900 border border-gray-700 rounded-2xl p-6 w-[400px] max-w-full shadow-2xl relative">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-400 hover:text-white"
                >
                    <span className="material-icons">close</span>
                </button>

                <div className="text-center space-y-4 mb-6">
                    <div className="w-16 h-16 bg-blue-500/20 rounded-full flex items-center justify-center mx-auto mb-2">
                        <span className="material-icons text-3xl text-blue-400">timer_off</span>
                    </div>
                    <h2 className="text-xl font-bold text-white">무료 제공 시간이 만료되었습니다</h2>
                    <p className="text-sm text-gray-400">
                        베타 버전에서는 아이디 당 <strong className="text-primary">3분의 무료 자막 생성</strong>을 제공합니다.
                        더 많은 대본과 AI 자막 생성을 원하시면 프리미엄을 구독해주세요.
                    </p>
                </div>

                <div className="bg-black/50 border border-gray-800 rounded-xl p-4 mb-6">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-medium text-gray-300">프리미엄 구독 (1시간)</span>
                        <span className="text-lg font-bold text-white">{price.toLocaleString()}원</span>
                    </div>
                    <ul className="text-xs text-gray-400 space-y-2 mt-4">
                        <li className="flex items-center gap-2"><span className="material-icons text-xs text-green-400">check_circle</span> 60분 자막/음성인식 처리 용량 제공</li>
                        <li className="flex items-center gap-2"><span className="material-icons text-xs text-green-400">check_circle</span> Gemini 기반 AI 스타일 자막</li>
                        <li className="flex items-center gap-2"><span className="material-icons text-xs text-green-400">check_circle</span> 워터마크 없는 4K 고화질 추출</li>
                    </ul>
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 py-3 bg-gray-800 text-gray-300 rounded-xl text-sm font-medium hover:bg-gray-700 transition-colors"
                    >
                        다음에 할게요
                    </button>
                    <button
                        onClick={handlePaymentClick}
                        className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-sm font-medium hover:bg-blue-500 transition-colors shadow-lg shadow-blue-500/20"
                    >
                        결제하기
                    </button>
                </div>
            </div>
        </div>
    );
}
