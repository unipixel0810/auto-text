import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, isAdmin } from '@/lib/auth';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from "@google/generative-ai";

export const maxDuration = 300; // Allow long execution on Vercel Pro/Enterprise or simply set higher limits

export async function POST(req: Request) {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
        if (!supabaseUrl || !supabaseServiceKey) {
            return NextResponse.json({ error: 'Supabase configuration missing' }, { status: 500 });
        }
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // 세션 없이도 사용 가능 (베타 오픈 정책)
        const session = await getServerSession(authOptions);
        const email = session?.user?.email || null;

        // 로그인한 사용자만 usage 추적 (비로그인은 무제한 베타 허용)
        let usage: Record<string, number> | null = null;
        let skipUsageTracking = !email;
        let isUserAdmin = email ? isAdmin(email) : false;

        if (email) {
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

            if (!skipUsageTracking && usage && !isUserAdmin) {
                if (usage.used_seconds >= usage.total_allowed_seconds) {
                    return NextResponse.json({ error: 'Payment Required. Quota Exceeded.' }, { status: 402 });
                }
            }
        }

        const body = await req.json();
        const { base64Audio, mimeType, duration, chunkStartTime = 0, totalDuration, mode, transcriptData } = body;

        if (!base64Audio || !mimeType) {
            return NextResponse.json({ error: 'Missing audio data' }, { status: 400 });
        }

        const durationSeconds = duration ? Math.ceil(parseFloat(duration)) : 60;
        if (!skipUsageTracking && usage && !isUserAdmin) {
            if ((usage.used_seconds + durationSeconds) > usage.total_allowed_seconds) {
                return NextResponse.json({ error: 'Payment Required. Not enough quota for this audio.' }, { status: 402 });
            }
        }

        const geminiKey = process.env.GEMINI_API_KEY;
        if (!geminiKey) {
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        const genAI = new GoogleGenerativeAI(geminiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" }, { apiVersion: "v1" });

        let prompt: string;

        if (mode === 'creative' && transcriptData) {
            // Creative subtitle mode: generate 4 types of dynamic subtitles
            const transcriptJson = JSON.stringify(transcriptData, null, 2);
            // 밀도 조절: 7~12초에 1개 → 분당 약 5~8개
            const targetCount = Math.max(8, Math.round(duration / 10));
            // 영상 구간을 5등분
            const segmentSize = Math.round(duration / 5);
            const segments = Array.from({ length: 5 }, (_, i) => `  구간${i + 1}: ${i * segmentSize}초 ~ ${(i + 1) * segmentSize}초`).join('\n');
            // 유형별 비율: 예능15 상황15 설명20 맥락10 (나머지 40%는 생성하지 않음 — 대본이 커버)
            const countEntertain = Math.round(targetCount * 0.25);
            const countSituation = Math.round(targetCount * 0.25);
            const countExplain = Math.round(targetCount * 0.3);
            const countContext = targetCount - countEntertain - countSituation - countExplain;
            prompt = `당신은 한국 최고의 유튜브 예능 편집자입니다.
첨부된 오디오를 분석하고, 아래 [기존 대본]을 참고하여 **대본에 없는** 연출 자막을 만들어주세요.

★★★ 핵심 원칙: 적게, 임팩트 있게! ★★★
모든 말을 자막으로 만들지 마세요. 핵심 메시지와 결정적 순간에만 배치합니다.

영상 길이: ${Math.round(duration)}초
목표: 약 ${targetCount}개 (과하게 많이 만들지 말 것!)

[기존 대본] (이미 화면에 표시됨 — 이 시간대와 절대 겹치면 안 됨)
${transcriptJson}

[규칙 — 반드시 지켜야 합니다]
1. ★★★ 시간이 겹치면 안 됩니다! ★★★ AI 자막의 start~end가 기존 대본 구간과 절대 겹치면 안 됩니다.
2. 대본 텍스트를 절대 반복하지 마세요.
3. ★★★ 유형 비율 ★★★
   - "예능" ${countEntertain}개 (25%): 감정 폭발, 반전 등 **결정적 순간에만** 크게 한 번
   - "상황" ${countSituation}개 (25%): 분위기 전환, 씬 변화 시에만 은은하게
   - "설명" ${countExplain}개 (30%): 정보 전달이 필요한 구간만 가독성 좋게
   - "맥락" ${countContext}개 (20%): 배경·전후 연결이 필요한 곳만

4. 5개 구간에 고루 분산 (각 구간 최소 1개):
${segments}

5. ★★★ 가독성 규칙 ★★★
   - 각 자막 최소 **2초 이상** 노출
   - 자막끼리 시간이 겹치면 절대 안 됨 (동시 2줄 금지)
   - 10~25자 적당한 길이, 너무 길면 끊어서 배치
   - 이모지는 예능 자막에서만 가끔 사용

[출력 형식]
반드시 아래 JSON 배열만 출력하세요. 다른 설명/마크다운 금지.
type 값은 반드시 "예능", "상황", "설명", "맥락" 중 하나:
[
  {"start": 12.0, "end": 14.5, "text": "이 표정 실화?!", "type": "예능"},
  {"start": 25.0, "end": 27.0, "text": "[분위기 급반전]", "type": "상황"},
  {"start": 40.0, "end": 43.0, "text": "핵심: 가격이 144% 올랐다", "type": "설명"},
  {"start": 55.0, "end": 57.5, "text": "사실 이건 3년 전부터 시작된 일", "type": "맥락"}
]`;
        } else {
            // Default mode: transcribe everything with style annotation
            prompt = `당신은 전문 유튜브 영상 편집자이자 자막 제작자입니다.
첨부된 오디오 파일을 듣고, 화자의 말을 그대로 받아적으면서 적절한 위치에 자막을 분할하여 스타일을 지정해주세요.

[규칙]
1. audio 화자의 말을 누락 없이 모두 적으세요.
2. 각 자막은 화면에 표시하기 적절한 길이로 분리하세요 (1~2문장 이내).
3. 각 자막에는 내용에 따라 다음 3가지 스타일 중 하나를 지정하세요:
   - "예능자막": 감정표현, 리액션, 웃음, 강조점 등 유머러스하거나 강조가 필요한 부분
   - "설명자막": 객관적 정보, 해설, 상황 설명 등 전달력이 중요한 부분
   - "상황자막": 배경음악, 효과음, 분위기 등 주변 상황 묘사 또는 일반 대화

[출력 형식]
반드시 아래 JSON 배열 형식으로만 출력하고 다른 설명은 넣지 마세요:
[
  {
    "start_time": 0.0,
    "end_time": 2.5,
    "text": "안녕하세요! 오늘은 새로운 편집 기법을 배워볼게요.",
    "style_type": "예능자막"
  }
]`;
        }

        // 503/429 재시도 (최대 3회, exponential backoff)
        const RETRY_DELAYS = [2000, 5000, 10000];
        let result;
        for (let attempt = 0; ; attempt++) {
            try {
                result = await model.generateContent([
                    prompt,
                    {
                        inlineData: {
                            mimeType: mimeType,
                            data: base64Audio
                        }
                    }
                ]);
                break; // 성공 시 루프 탈출
            } catch (retryErr: any) {
                const is503or429 = retryErr?.status === 503 || retryErr?.status === 429 ||
                    retryErr?.message?.includes('503') || retryErr?.message?.includes('429') ||
                    retryErr?.message?.includes('high demand') || retryErr?.message?.includes('Service Unavailable');
                if (is503or429 && attempt < RETRY_DELAYS.length) {
                    console.warn(`[Gemini] ${retryErr.status || '503/429'} 응답, ${RETRY_DELAYS[attempt] / 1000}초 후 재시도 (${attempt + 1}/${RETRY_DELAYS.length})`);
                    await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
                    continue;
                }
                throw retryErr; // 재시도 불가능한 에러
            }
        }

        const responseText = result.response.text();
        if (!responseText) {
            throw new Error("AI returned an empty response.");
        }
        
        const jsonMatch = responseText.match(/\[\s*\{[\s\S]*\}\s*\]/);

        let parsedResult = [];
        if (jsonMatch) {
            try {
                parsedResult = JSON.parse(jsonMatch[0]);
            } catch (pErr) {
                console.error("JSON parsing error:", pErr, "Raw response:", responseText);
                throw new Error("Failed to parse AI response as valid JSON.");
            }
        } else {
            console.error("Gemini failed to return JSON format. Raw output:", responseText);
            throw new Error("AI response did not contain a valid JSON array.");
        }

        // Successfully generated. Update usage (로그인 사용자만).
        if (email && !skipUsageTracking && usage && !isUserAdmin) {
            await supabase
                .from('user_usages')
                .update({ used_seconds: usage.used_seconds + durationSeconds })
                .eq('email', email);
        }

        // chunkStartTime 오프셋 적용: 각 청크 응답의 타임스탬프를 전체 영상 기준으로 보정
        const offsetSeconds = typeof chunkStartTime === 'number' ? chunkStartTime : 0;
        const corrected = offsetSeconds === 0
            ? parsedResult
            : parsedResult.map((item: any) => ({
                ...item,
                start_time: (item.start_time ?? item.start ?? 0) + offsetSeconds,
                end_time: (item.end_time ?? item.end ?? 0) + offsetSeconds,
                start: (item.start ?? item.start_time ?? 0) + offsetSeconds,
                end: (item.end ?? item.end_time ?? 0) + offsetSeconds,
            }));

        return NextResponse.json(corrected);
    } catch (error: any) {
        console.error('Gemini API Error Detail:', {
            message: error.message,
            stack: error.stack,
            cause: error.cause
        });
        
        // Provide more helpful error messages for known issues
        let status = 500;
        let errorMessage = error.message || 'Internal Server Error';
        
        if (errorMessage.includes('not found') || errorMessage.includes('404')) {
            errorMessage = `AI Model Not Found (404). Please verify GEMINI_API_KEY and model availability. (${errorMessage})`;
        } else if (errorMessage.includes('API key')) {
            errorMessage = 'API Key Error. Please check your Gemini API key configuration.';
        }

        return NextResponse.json({ error: errorMessage }, { status });
    }
}
