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

        if (usageError && usageError.code === 'PGRST116') {
            const { data: newUsage, error: insertError } = await supabase
                .from('user_usages')
                .insert([{ email }])
                .select()
                .single();
            if (insertError) throw insertError;
            usage = newUsage;
        } else if (usageError) {
            throw usageError;
        }

        if (!usage) {
            return NextResponse.json({ error: 'Failed to access usage data' }, { status: 500 });
        }

        const isUserAdmin = isAdmin(email);
        if (!isUserAdmin && usage.used_seconds >= usage.total_allowed_seconds) {
            return NextResponse.json({ error: 'Payment Required. Quota Exceeded.' }, { status: 402 });
        }

        const body = await req.json();
        const { base64Audio, mimeType, duration } = body;

        if (!base64Audio || !mimeType) {
            return NextResponse.json({ error: 'Missing audio data' }, { status: 400 });
        }

        const durationSeconds = duration ? Math.ceil(parseFloat(duration)) : 60;
        if (!isUserAdmin && (usage.used_seconds + durationSeconds) > usage.total_allowed_seconds) {
            return NextResponse.json({ error: 'Payment Required. Not enough quota for this audio.' }, { status: 402 });
        }

        const geminiKey = process.env.GEMINI_API_KEY;
        if (!geminiKey) {
            return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
        }

        const genAI = new GoogleGenerativeAI(geminiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro-latest" });

        const prompt = `당신은 전문 유튜브 영상 편집자이자 자막 제작자입니다.
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
        const jsonMatch = responseText.match(/\[\s*\{[\s\S]*\}\s*\]/);

        let parsedResult = [];
        if (jsonMatch) {
            parsedResult = JSON.parse(jsonMatch[0]);
        } else {
            console.error("Gemini failed to return JSON:", responseText);
            throw new Error("Failed to parse AI response");
        }

        // Successfully generated. Update usage.
        if (!isUserAdmin) {
            await supabase
                .from('user_usages')
                .update({ used_seconds: usage.used_seconds + durationSeconds })
                .eq('email', email);
        }

        return NextResponse.json(parsedResult);
    } catch (error: any) {
        console.error('Gemini API Error:', error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
