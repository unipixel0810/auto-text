import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, isAdmin } from '@/lib/auth';
import { createClient } from '@supabase/supabase-js';

// 16kHz 다운샘플링된 2분 WAV 청크 (~3.84MB) 수용
// Vercel 하드 리밋(4.5MB)은 별도이므로 이 설정은 self-host/로컬 환경에서 유효
export const maxDuration = 120; // 서버리스 함수 타임아웃 (초)

export async function POST(req: Request) {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
        // Supabase는 usage 추적용 — 미설정이면 추적 없이 진행
        const supabase = (supabaseUrl && supabaseServiceKey)
            ? createClient(supabaseUrl, supabaseServiceKey)
            : null;

        // 세션 없이도 사용 가능 (베타 오픈 정책)
        let email: string | null = null;
        try {
            const session = await getServerSession(authOptions);
            email = session?.user?.email || null;
        } catch { /* 인증 실패해도 계속 진행 */ }

        // 로그인한 사용자만 usage 추적 (비로그인은 무제한 베타 허용)
        let usage: Record<string, number> | null = null;
        let skipUsageTracking = !email || !supabase;

        if (email && supabase) {
            let { data: usageData, error: usageError } = await supabase
                .from('user_usages')
                .select('*')
                .eq('email', email)
                .single();

            if (usageError && usageError.code === 'PGRST116') {
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
            } else {
                usage = usageData;
            }

            // 관리자 또는 usage 체크
            const isUserAdmin = isAdmin(email);
            if (!skipUsageTracking && usage && !isUserAdmin) {
                if (usage.used_seconds >= usage.total_allowed_seconds) {
                    return NextResponse.json({ error: 'Payment Required. Quota Exceeded.' }, { status: 402 });
                }
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

        if (email && !skipUsageTracking && usage && !isAdmin(email) && supabase) {
            if ((usage.used_seconds + durationSeconds) > usage.total_allowed_seconds) {
                return NextResponse.json({ error: 'Payment Required. Not enough quota for this audio.' }, { status: 402 });
            }
        }

        // Call OpenAI directly from server
        const openAiKey = process.env.OPENAI_API_KEY;
        if (!openAiKey) {
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        // 클라이언트에서 전달한 언어 코드 (기본: ko)
        const language = (formData.get('language') as string) || 'ko';

        // Construct standard FormData for OpenAI
        const openAiFormData = new FormData();
        openAiFormData.append('file', file);
        openAiFormData.append('model', 'whisper-1');
        openAiFormData.append('response_format', 'verbose_json');
        openAiFormData.append('timestamp_granularities[]', 'word');
        openAiFormData.append('language', language);
        // prompt 힌트: Whisper 환청(hallucination) 억제 + 한국어 컨텍스트
        openAiFormData.append('prompt', '이것은 한국어 영상의 음성입니다. 자연스러운 대화체로 정확히 받아쓰세요.');

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
            let errMsg = errText;
            try {
                const parsedErr = JSON.parse(errText);
                errMsg = parsedErr.error?.message || parsedErr.error || errText;
            } catch {
                // errText가 JSON이 아니면 그대로 사용
            }
            // OpenAI 413: 파일 크기 초과
            if (response.status === 413) {
                return NextResponse.json({ error: '파일이 너무 큽니다. 25MB 이하로 분할해 다시 시도해주세요.' }, { status: 413 });
            }
            throw new Error(`OpenAI STT 오류 (${response.status}): ${errMsg}`);
        }

        const data = await response.json();

        // Successfully generated. Update usage (로그인 사용자만).
        if (email && !skipUsageTracking && usage && !isAdmin(email) && supabase) {
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
