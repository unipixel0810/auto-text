import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, isAdmin } from '@/lib/auth';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from "@google/generative-ai";

export const maxDuration = 120;

/**
 * Gemini 기반 STT API
 * Whisper와 동일한 응답 형식(WhisperResponse)을 반환하여 클라이언트 호환성 유지
 */
export async function POST(req: Request) {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
        const supabase = (supabaseUrl && supabaseServiceKey)
            ? createClient(supabaseUrl, supabaseServiceKey)
            : null;

        let email: string | null = null;
        try {
            const session = await getServerSession(authOptions);
            email = session?.user?.email || null;
        } catch {
            // 인증 실패해도 STT는 계속 진행
        }

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

        const durationStr = formData.get('duration') as string;
        const durationSeconds = durationStr ? Math.ceil(parseFloat(durationStr)) : 60;
        const language = (formData.get('language') as string) || 'ko';

        if (email && !skipUsageTracking && usage && !isAdmin(email) && supabase) {
            if ((usage.used_seconds + durationSeconds) > usage.total_allowed_seconds) {
                return NextResponse.json({ error: 'Payment Required. Not enough quota for this audio.' }, { status: 402 });
            }
        }

        const geminiKey = process.env.GEMINI_API_KEY;
        if (!geminiKey) {
            return NextResponse.json({ error: 'Gemini API key not configured' }, { status: 500 });
        }

        // 오디오 파일을 base64로 변환
        const arrayBuffer = await file.arrayBuffer();
        const base64Audio = Buffer.from(arrayBuffer).toString('base64');
        const mimeType = file.type || 'audio/wav';

        const genAI = new GoogleGenerativeAI(geminiKey);
        const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];

        const langLabel = language === 'ko' ? '한국어' : language === 'en' ? 'English' : language;

        const prompt = `당신은 정밀한 음성 인식(STT) 전문가입니다.
첨부된 오디오 파일의 모든 음성을 정확하게 받아적으세요.

[핵심 규칙]
1. 오디오에서 들리는 모든 말을 빠짐없이 받아적으세요. 한 마디도 놓치지 마세요.
2. 배경음악, 효과음, 무음 구간은 무시하세요. 사람의 말만 받아적으세요.
3. 들리지 않는 내용을 절대 지어내지 마세요 (환청 금지).
4. ★★★ 타이밍 정확도가 가장 중요합니다 ★★★
   - 각 단어와 세그먼트의 시작/끝 시간을 실제 발화 시점과 정확히 맞춰주세요.
   - 오디오를 재생하면서 각 단어가 실제로 들리는 정확한 시점을 초(소수점 2자리)로 기록하세요.
   - 말하기 시작하는 순간 = start, 말이 끝나는 순간 = end.
5. 자연스러운 문장/발화 단위로 세그먼트를 나누세요 (1~2문장 이내, 최대 10초).
6. 단어별 시작/끝 시간도 함께 제공하세요. 각 단어의 시작/끝이 실제 발음과 일치해야 합니다.
7. 언어: ${langLabel}

[출력 형식]
반드시 아래 JSON 형식으로만 출력하세요. 다른 설명은 넣지 마세요.
{
  "text": "전체 텍스트를 한 줄로",
  "segments": [
    {
      "start": 0.00,
      "end": 3.50,
      "text": "세그먼트 텍스트",
      "no_speech_prob": 0.0
    }
  ],
  "words": [
    { "word": "단어", "start": 0.00, "end": 0.50 }
  ]
}

★ segments와 words 둘 다 반드시 포함하세요.
★ 시간은 오디오 시작(0.00초)부터의 절대 시간입니다. 절대로 다른 기준점을 쓰지 마세요.
★ no_speech_prob는 해당 세그먼트가 음성이 아닐 확률 (0.0~1.0)입니다. 확실한 음성이면 0.0.
★ 세그먼트 간에 빈 구간(무음)이 있으면 그대로 비워두세요. 연속으로 이어붙이지 마세요.`;

        // 모델 순회 + 재시도
        const RETRY_DELAYS = [2000, 5000, 10000];
        let result;
        let lastError: any = null;

        for (const modelName of GEMINI_MODELS) {
            const model = genAI.getGenerativeModel({ model: modelName }, { apiVersion: "v1beta" });
            let success = false;

            for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
                try {
                    result = await model.generateContent([
                        prompt,
                        {
                            inlineData: {
                                mimeType,
                                data: base64Audio,
                            },
                        },
                    ]);
                    success = true;
                    break;
                } catch (retryErr: any) {
                    lastError = retryErr;
                    const isRetryable = retryErr?.status === 503 || retryErr?.status === 429 ||
                        retryErr?.message?.includes('503') || retryErr?.message?.includes('429');
                    if (isRetryable && attempt < RETRY_DELAYS.length) {
                        console.warn(`[Gemini STT] ${modelName} ${retryErr.status || '503/429'}, ${RETRY_DELAYS[attempt] / 1000}초 후 재시도`);
                        await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
                        continue;
                    }
                    console.warn(`[Gemini STT] ${modelName} 실패:`, retryErr.message);
                    break;
                }
            }
            if (success) break;
        }

        if (!result) {
            throw lastError || new Error('모든 Gemini 모델 STT 실패');
        }

        const responseText = result.response.text();
        if (!responseText) {
            throw new Error('Gemini STT: 빈 응답');
        }

        // JSON 추출 (여러 패턴 시도)
        let cleanedText = responseText
            .replace(/```json\n?/g, '').replace(/```\n?/g, '')
            .trim();
        console.log('[Gemini STT] 응답 원문 (앞 500자):', cleanedText.slice(0, 500));

        // 패턴 1: segments 포함 JSON
        let jsonMatch = cleanedText.match(/\{[\s\S]*"segments"[\s\S]*\}/);
        // 패턴 2: text 포함 JSON
        if (!jsonMatch) jsonMatch = cleanedText.match(/\{[\s\S]*"text"[\s\S]*\}/);
        // 패턴 3: words 포함 JSON
        if (!jsonMatch) jsonMatch = cleanedText.match(/\{[\s\S]*"words"[\s\S]*\}/);
        if (jsonMatch) cleanedText = jsonMatch[0];

        let parsed: any;
        try {
            parsed = JSON.parse(cleanedText);
        } catch {
            // JSON 파싱 실패 → 텍스트 응답을 단일 세그먼트로 변환
            console.warn('[Gemini STT] JSON 파싱 실패, 텍스트 응답으로 폴백:', cleanedText.slice(0, 200));
            const plainText = cleanedText.replace(/[{}\[\]"]/g, '').trim();
            if (plainText.length > 0) {
                parsed = {
                    text: plainText,
                    segments: [{ start: 0, end: 10, text: plainText, no_speech_prob: 0 }],
                    words: plainText.split(/\s+/).map((w: string, i: number) => ({ word: w, start: i * 0.5, end: (i + 1) * 0.5 })),
                };
            } else {
                throw new Error('Gemini STT 응답이 비어있습니다');
            }
        }

        // WhisperResponse 형식으로 변환
        const whisperCompatible = {
            task: 'transcribe',
            language: language,
            duration: durationSeconds,
            text: parsed.text || '',
            segments: (parsed.segments || []).map((s: any, i: number) => ({
                id: i,
                seek: 0,
                start: s.start ?? 0,
                end: s.end ?? 0,
                text: s.text || '',
                tokens: [],
                temperature: 0,
                avg_logprob: -0.3,
                compression_ratio: 1.5,
                no_speech_prob: s.no_speech_prob ?? 0.0,
            })),
            words: (parsed.words || []).map((w: any) => ({
                word: w.word || '',
                start: w.start ?? 0,
                end: w.end ?? 0,
            })),
        };

        // 유효성 검증: segments나 words가 비어있으면 text에서 생성
        if (whisperCompatible.segments.length === 0 && whisperCompatible.text) {
            whisperCompatible.segments = [{
                id: 0, seek: 0, start: 0, end: durationSeconds,
                text: whisperCompatible.text, tokens: [],
                temperature: 0, avg_logprob: -0.3, compression_ratio: 1.5, no_speech_prob: 0.0,
            }];
        }

        console.log(`[Gemini STT] 결과: text="${whisperCompatible.text.slice(0, 100)}...", segments=${whisperCompatible.segments.length}, words=${whisperCompatible.words.length}`);

        // Usage 업데이트
        if (email && !skipUsageTracking && usage && !isAdmin(email) && supabase) {
            await supabase
                .from('user_usages')
                .update({ used_seconds: usage.used_seconds + durationSeconds })
                .eq('email', email);
        }

        return NextResponse.json(whisperCompatible);
    } catch (error: any) {
        console.error('Gemini STT API Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
