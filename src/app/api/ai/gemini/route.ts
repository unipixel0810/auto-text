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

        const isUserAdmin = isAdmin(email);
        if (!skipUsageTracking && usage && !isUserAdmin) {
            if (usage.used_seconds >= usage.total_allowed_seconds) {
                return NextResponse.json({ error: 'Payment Required. Quota Exceeded.' }, { status: 402 });
            }
        }

        const body = await req.json();
        const { base64Audio, mimeType, duration, mode, transcriptData } = body;

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
            // Creative subtitle mode: generate entertainment/situation/explanation subtitles
            // that do NOT overlap with the existing transcript
            const transcriptJson = JSON.stringify(transcriptData, null, 2);
            const targetCount = Math.max(20, Math.round(duration / 2.5));
            const targetSeconds = Math.round(duration * 0.6);
            prompt = `당신은 한국 최고의 유튜브 예능 편집자입니다. 나영석 PD 스타일의 자막 연출을 해주세요.
첨부된 오디오를 분석하고, 아래 [기존 대본]을 참고하여 **대본에 없는** 연출 자막을 대량으로 만들어주세요.

영상 길이: ${Math.round(duration)}초
★★★ 필수 목표: 최소 ${targetCount}개, 총 ${targetSeconds}초 이상 분량 (전체의 60%) ★★★

[기존 대본] (이미 화면에 표시됨)
${transcriptJson}

[규칙 — 반드시 지켜야 합니다]
1. ★★★ 시간이 겹치면 안 됩니다! ★★★ AI 자막의 시간 구간(start_time ~ end_time)이 기존 대본의 시간 구간과 절대 겹치면 안 됩니다. 대본이 없는 빈 시간대에 AI 자막을 넣으세요. 대본이 있는 시간에는 대본이 우선이고, 대본이 없는 구간에 AI 자막을 채워 넣으세요.
2. 대본 텍스트를 절대 반복하지 마세요. 같은 내용의 말을 쓰면 안 됩니다.
3. 3가지 유형을 **골고루 섞어서** 만드세요 (비율 예능 50% : 상황 25% : 설명 25%):

   ★ "예능자막" (가장 많이! 재미를 최우선):
   - 화자의 말에 대한 과장된 리액션: "헐ㅋㅋㅋ 진심?!", "아니 이게 말이 돼?!", "소름 돋았다..."
   - 감정 극대화: "감동의 눈물 한 바가지 ㅠㅠ", "분노 게이지 MAX", "당황 x 100"
   - 효과음/밈: "띠용?!", "두둥!", "삐빅- 거짓말 탐지", "⚡충격⚡"
   - 시청자 대변: "(시청자 심정) 그래서 결론이 뭔데...", "나만 이해 안 되는 건가?"
   - 상황 비틀기: 반전, 아이러니, 웃긴 요약, 츳코미(ツッコミ)

   ★ "상황자막" (분위기 연출):
   - BGM 묘사: "♪ 긴장감 폭발 BGM ♪", "♬ 슬픈 피아노 선율 ♬"
   - 효과음: "[ 적막 ]", "[ 웅성웅성 ]", "[ 심장 쿵쿵 ]"
   - 시간/장소: "— 3시간 뒤 —", "그로부터 10초 후..."
   - 분위기 전환: "[ 갑분싸 ]", "[ 훈훈 모드 ON ]"

   ★ "설명자막" (정보 보충):
   - 전문용어 해설, 맥락 보충, 팩트체크
   - 핵심 요약: "요약: ~한 상황", "참고로 ~입니다"

4. ★★★ 핵심: ${targetCount}개 이상 반드시 만들어야 합니다! 적게 만들면 안 됩니다! ★★★
5. 대본이 없는 빈 구간에 집중적으로 배치하세요. 대본 사이사이 빈틈을 AI 자막으로 가득 채우세요!
6. 각 자막은 1~4초 길이로, 짧고 임팩트 있게 만드세요.
7. 재미없으면 실패입니다. 시청자가 "ㅋㅋㅋ" 할 수 있도록 센스 있게 만드세요.

[출력 형식]
반드시 아래 JSON 배열만 출력하세요. 다른 설명/마크다운 금지:
[
  {"start_time": 0.5, "end_time": 2.5, "text": "ㅋㅋㅋ 이 표정 실화?!", "style_type": "예능자막"},
  {"start_time": 3.0, "end_time": 5.0, "text": "♪ 두근두근 BGM ♪", "style_type": "상황자막"},
  {"start_time": 6.0, "end_time": 8.5, "text": "여기서 말하는 건 쉽게 말해 ~라는 뜻", "style_type": "설명자막"}
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

        const result = await model.generateContent([
            prompt,
            {
                inlineData: {
                    mimeType: mimeType,
                    data: base64Audio
                }
            }
        ]);

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

        // Successfully generated. Update usage.
        if (!skipUsageTracking && usage && !isUserAdmin) {
            await supabase
                .from('user_usages')
                .update({ used_seconds: usage.used_seconds + durationSeconds })
                .eq('email', email);
        }

        return NextResponse.json(parsedResult);
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
