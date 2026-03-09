import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, isAdmin } from '@/lib/auth';
import { createClient } from '@supabase/supabase-js';

export async function POST(req: Request) {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
        if (!supabaseUrl || !supabaseServiceKey) {
            return NextResponse.json({ error: 'Supabase configuration missing' }, { status: 500 });
        }
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        const session = await getServerSession(authOptions);
        if (!session?.user?.email) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const email = session.user.email;

        // Check Usage
        let { data: usage, error: usageError } = await supabase
            .from('user_usages')
            .select('*')
            .eq('email', email)
            .single();

        let skipUsageTracking = false;

        if (usageError && usageError.code === 'PGRST116') {
            // No record, create one
            const { data: newUsage, error: insertError } = await supabase
                .from('user_usages')
                .insert([{ email }])
                .select()
                .single();
            if (insertError) {
                console.warn('Skipping usage tracking (insert failed):', insertError);
                skipUsageTracking = true;
            } else {
                usage = newUsage;
            }
        } else if (usageError) {
            console.warn('Skipping usage tracking (fetch failed):', usageError);
            skipUsageTracking = true;
        }

        // Admin override or usage check
        const isUserAdmin = isAdmin(email);
        if (!skipUsageTracking && usage && !isUserAdmin) {
            if (usage.used_seconds >= usage.total_allowed_seconds) {
                return NextResponse.json({ error: 'Payment Required. Quota Exceeded.' }, { status: 402 });
            }
        }

        const formData = await req.formData();
        const file = formData.get('file') as File;
        if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

        // Calculate simple cost (e.g. assume 10MB file = approx 60 seconds if we don't know exact duration yet)
        // A robust solution parses audio duration. Here we use an estimate or track strictly post-processing, 
        // but for safety in serverless, we'll charge a flat rate per API call or by byte size if duration isn't sent.
        // Let's get duration from the client if provided, else default 60s
        const durationStr = formData.get('duration') as string;
        const durationSeconds = durationStr ? Math.ceil(parseFloat(durationStr)) : 60;

        if (!skipUsageTracking && usage && !isUserAdmin) {
            if ((usage.used_seconds + durationSeconds) > usage.total_allowed_seconds) {
                return NextResponse.json({ error: 'Payment Required. Not enough quota for this audio.' }, { status: 402 });
            }
        }

        // Call OpenAI directly from server
        const openAiKey = process.env.OPENAI_API_KEY;
        if (!openAiKey) {
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        // Construct standard FormData for OpenAI
        const openAiFormData = new FormData();
        openAiFormData.append('file', file);
        openAiFormData.append('model', 'whisper-1');
        openAiFormData.append('response_format', 'verbose_json');
        openAiFormData.append('timestamp_granularities[]', 'word');

        const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${openAiKey}`,
            },
            body: openAiFormData,
        });

        if (!response.ok) {
            const errText = await response.text();
            console.error("OpenAI STT Full Error Response:", errText);
            try {
                const parsedErr = JSON.parse(errText);
                throw new Error(`OpenAI STT error: ${parsedErr.error?.message || errText}`);
            } catch {
                throw new Error(`OpenAI STT error: ${errText}`);
            }
        }

        const data = await response.json();

        // Successfully generated. Update usage.
        if (!skipUsageTracking && usage && !isUserAdmin) {
            await supabase
                .from('user_usages')
                .update({ used_seconds: usage.used_seconds + durationSeconds })
                .eq('email', email);
        }

        return NextResponse.json(data);
    } catch (error: any) {
        console.error('STT API Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
