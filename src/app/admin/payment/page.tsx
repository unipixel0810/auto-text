'use client';

import { useEffect, useState } from 'react';
import { loadPaymentWidget, PaymentWidgetInstance } from '@tosspayments/payment-widget-sdk';
import { useSession } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';

const clientKey = process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY!;

export default function PaymentPage() {
    const { data: session } = useSession();
    const router = useRouter();
    const searchParams = useSearchParams();

    const [paymentWidget, setPaymentWidget] = useState<PaymentWidgetInstance | null>(null);
    const [price, setPrice] = useState(14800);

    useEffect(() => {
        const amount = searchParams.get('amount');
        if (amount) {
            setPrice(Number(amount));
        }
    }, [searchParams]);

    useEffect(() => {
        (async () => {
            // "비회원 결제" 혹은 "고객 키"를 지정하여 위젯 초기화 (여기선 이메일이나 임의의 ID 사용 가능)
            const customerKey = session?.user?.email ? encodeURIComponent(session.user.email) : 'ANONYMOUS';
            const widget = await loadPaymentWidget(clientKey, customerKey);
            setPaymentWidget(widget);
        })();
    }, [session]);

    useEffect(() => {
        if (paymentWidget) {
            paymentWidget.renderPaymentMethods('#payment-widget', { value: price });
            paymentWidget.renderAgreement('#agreement');
        }
    }, [paymentWidget, price]);

    const handlePayment = async () => {
        if (!paymentWidget) return;

        const orderId = `order_${new Date().getTime()}`;

        try {
            await paymentWidget.requestPayment({
                orderId: orderId,
                orderName: '프리미엄 1시간 구독권',
                successUrl: `${window.location.origin}/admin/payment/success`,
                failUrl: `${window.location.origin}/admin/payment/fail`,
                customerEmail: session?.user?.email || undefined,
                customerName: session?.user?.name || undefined,
            });
        } catch (error) {
            console.error(error);
        }
    };

    return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-black">
            <div className="bg-gray-900 rounded-xl p-6 w-full max-w-[600px] shadow-2xl border border-gray-800">
                <h1 className="text-2xl font-bold text-white mb-6 text-center">프리미엄 1시간 요금 결제</h1>

                {/* Toss Widgets will render here */}
                <div id="payment-widget" className="bg-white rounded-lg p-2 mb-4" />
                <div id="agreement" className="bg-white rounded-lg p-2 mb-6" />

                <button
                    onClick={handlePayment}
                    className="w-full py-4 rounded-xl font-bold text-lg bg-blue-600 text-white hover:bg-blue-500 transition-colors"
                >
                    {price.toLocaleString()}원 결제하기
                </button>
                <div className="mt-4 text-center">
                    <button onClick={() => router.back()} className="text-gray-400 text-sm hover:text-white transition-colors">
                        돌아가기
                    </button>
                </div>
            </div>
        </div>
    );
}
