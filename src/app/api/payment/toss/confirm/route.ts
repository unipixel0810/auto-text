import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(req: Request) {
    try {
        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const { paymentKey, orderId, amount } = body;

        if (!paymentKey || !orderId || !amount) {
            return NextResponse.json({ error: 'Missing payment details' }, { status: 400 });
        }

        const tossSecretKey = process.env.TOSS_SECRET_KEY!;
        // Toss requires secret key to be base64 encoded with a colon appended e.g. "secretKey:"
        const encryptedSecretKey = Buffer.from(`${tossSecretKey}:`).toString('base64');

        // Verify payment with Toss server
        const response = await fetch('https://api.tosspayments.com/v1/payments/confirm', {
            method: 'POST',
            headers: {
                Authorization: `Basic ${encryptedSecretKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                paymentKey,
                orderId,
                amount,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            return NextResponse.json({ error: errorData.message || 'Payment verification failed' }, { status: response.status });
        }

        // Add 1 hour (3600 seconds) to the user's quota
        const email = session.user.email;
        const { data: usage, error: fetchError } = await supabase
            .from('user_usages')
            .select('total_allowed_seconds')
            .eq('email', email)
            .single();

        if (fetchError) {
            console.error("Failed to fetch user usage during payment:", fetchError);
            return NextResponse.json({ error: 'Failed to update quota' }, { status: 500 });
        }

        const newAllowedSeconds = (usage?.total_allowed_seconds || 180) + 3600;

        const { error: updateError } = await supabase
            .from('user_usages')
            .update({ total_allowed_seconds: newAllowedSeconds })
            .eq('email', email);

        if (updateError) {
            console.error("Failed to update user quota:", updateError);
            return NextResponse.json({ error: 'Failed to update quota' }, { status: 500 });
        }

        return NextResponse.json({ success: true, addedSeconds: 3600 });
    } catch (error: any) {
        console.error('Payment Confirmation Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
