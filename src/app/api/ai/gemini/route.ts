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
            const targetCount = Math.max(20, Math.round(duration / 2.5));
            const targetSeconds = Math.round(duration * 0.6);
            // 영상 구간을 5등분하여 각 구간에서 고루 배치하도록 안내
            const segmentSize = Math.round(duration / 5);
            const segments = Array.from({ length: 5 }, (_, i) => `  구간${i + 1}: ${i * segmentSize}초 ~ ${(i + 1) * segmentSize}초`).join('\n');
            // 각 유형별 목표 개수 (예능40 상황20 설명20 맥락20)
            const countEntertain = Math.round(targetCount * 0.4);
            const countSituation = Math.round(targetCount * 0.2);
            const countExplain = Math.round(targetCount * 0.2);
            const countContext = targetCount - countEntertain - countSituation - countExplain;
            prompt = `당신은 한국 최고의 유튜브 예능 편집자입니다. 나영석 PD 스타일의 자막 연출을 해주세요.
첨부된 오디오를 분석하고, 아래 [기존 대본]을 참고하여 **대본에 없는** 연출 자막을 대량으로 만들어주세요.

영상 길이: ${Math.round(duration)}초
★★★ 필수 목표: 정확히 ${targetCount}개, 총 ${targetSeconds}초 이상 분량 ★★★

[기존 대본] (이미 화면에 표시됨 — 이 시간대와 절대 겹치면 안 됨)
${transcriptJson}

[규칙 — 반드시 지켜야 합니다]
1. ★★★ 시간이 겹치면 안 됩니다! ★★★ AI 자막의 start~end가 기존 대본 구간과 절대 겹치면 안 됩니다.
2. 대본 텍스트를 절대 반복하지 마세요.
3. ★★★ 유형 비율을 정확히 지키세요 ★★★
   - "예능" ${countEntertain}개 (40%): 감정·리액션·웃음 포인트
   - "상황" ${countSituation}개 (20%): 행동묘사·BGM·효과음
   - "설명" ${countExplain}개 (20%): 정보·팩트·수치 강조
   - "맥락" ${countContext}개 (20%): 배경·전후 연결

4. ★★★ 5개 구간에 고루 분산하세요 (각 구간에 최소 3개 이상) ★★★
${segments}
   → 각 구간에 예능/상황/설명/맥락이 골고루 섞여야 합니다!
   → 앞부분에만 몰리거나 뒷부분에만 몰리면 실패입니다.

   ★ type "예능" — 감정·리액션·웃음 포인트 과장:
   - 과장된 리액션: "앗! ㅋㅋㅋ", "헐 진심?!", "아니 이게 말이 돼?!"
   - 감정 극대화: "멘붕 온 과일장수", "분노 게이지 MAX", "당황 x 100"
   - 밈/효과음 텍스트: "띠용?!", "두둥!", "삐빅- 거짓말 탐지", "⚡충격⚡"
   - 시청자 대변: "(시청자 심정) 그래서 결론이 뭔데...", "나만 이해 안 되는 건가?"
   - 상황 비틀기: 반전, 아이러니, 츳코미

   ★ type "상황" — 현재 벌어지는 행동/심각한 상태 묘사:
   - 행동 묘사: "[다급하게 박스를 뒤지는 손길]", "[고개를 절레절레 흔드는 중]"
   - BGM 묘사: "♪ 긴장감 폭발 BGM ♪", "♬ 슬픈 피아노 선율 ♬"
   - 효과음 텍스트: "[ 적막 ]", "[ 웅성웅성 ]", "[ 심장 쿵쿵 ]"
   - 분위기 전환: "[ 갑분싸 ]", "[ 훈훈 모드 ON ]"
   - 시간/장소: "— 3시간 뒤 —", "그로부터 10초 후..."

   ★ type "설명" — 정보 전달, 팩트 체크, 수치 강조:
   - 수치/팩트: "💡 사과 가격 144% 폭등!", "참고: 국내 생산량 역대 최저"
   - 전문용어 해설: "※ 여기서 '숏커버링'이란 공매도 청산을 뜻함"
   - 핵심 요약: "요약: ~한 상황"

   ★ type "맥락" — 앞뒤 상황을 이어주는 배경 지식:
   - 배경 정보: "내년부터 미국산 감귤류 관세 철폐"
   - 전후 연결: "사실 이 이야기는 3년 전부터 시작된 것"
   - 숨은 의미: "이 말의 진짜 뜻은...", "업계에서는 이를 두고..."
   - 비하인드: "참고로 이 장면 촬영에만 8시간 걸렸다고"

5. 각 자막은 1~4초 길이로, 짧고 임팩트 있게 만드세요.
6. 재미없으면 실패입니다. 시청자가 "ㅋㅋㅋ" 할 수 있도록 센스 있게 만드세요.

[출력 형식]
반드시 아래 JSON 배열만 출력하세요. 다른 설명/마크다운 금지.
type 값은 반드시 "예능", "상황", "설명", "맥락" 중 하나:
[
  {"start": 0.5, "end": 2.5, "text": "ㅋㅋㅋ 이 표정 실화?!", "type": "예능"},
  {"start": 3.0, "end": 5.0, "text": "[다급하게 뛰어가는 중]", "type": "상황"},
  {"start": 6.0, "end": 8.5, "text": "💡 사과 가격 144% 폭등!", "type": "설명"},
  {"start": 9.0, "end": 11.0, "text": "내년부터 미국산 감귤류 관세 철폐", "type": "맥락"}
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
