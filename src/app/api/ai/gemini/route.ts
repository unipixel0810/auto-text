import { NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions, isAdmin } from '@/lib/auth';
import { createClient } from '@supabase/supabase-js';
import { GoogleGenerativeAI } from "@google/generative-ai";

export const maxDuration = 300; // Allow long execution on Vercel Pro/Enterprise or simply set higher limits

interface SubtitleTypeSpec {
    name: string;
    pct: number;
    desc: string;
    examples: string;
}

function buildCreativePrompt(
    genreLabel: string,
    transcriptJson: string,
    duration: number,
    targetCount: number,
    segments: string,
    config: {
        role: string;
        types: SubtitleTypeSpec[];
        tone: string;
        emojiRule: string;
    },
): string {
    const typeLines = config.types.map(t => {
        const count = Math.round(targetCount * (t.pct / 100));
        return `- "${t.name}" ${count}개 (${t.pct}%): ${t.desc}\n  · ${t.examples}`;
    }).join('\n');

    // 대본이 없는 빈 구간 찾기 (상황자막 배치 힌트)
    let silentGapsHint = '';
    try {
        const transcript = JSON.parse(transcriptJson) as { startTime: number; endTime: number }[];
        if (transcript.length > 0) {
            const gaps: string[] = [];
            // 영상 시작 ~ 첫 대본
            if (transcript[0].startTime > 2) {
                gaps.push(`  ${0}초 ~ ${Math.round(transcript[0].startTime)}초 (대사 없음)`);
            }
            // 대본 사이 빈 구간
            for (let gi = 0; gi < transcript.length - 1; gi++) {
                const gapStart = transcript[gi].endTime;
                const gapEnd = transcript[gi + 1].startTime;
                if (gapEnd - gapStart > 2) {
                    gaps.push(`  ${Math.round(gapStart)}초 ~ ${Math.round(gapEnd)}초 (대사 없음)`);
                }
            }
            // 마지막 대본 ~ 영상 끝
            const lastEnd = transcript[transcript.length - 1].endTime;
            if (duration - lastEnd > 2) {
                gaps.push(`  ${Math.round(lastEnd)}초 ~ ${Math.round(duration)}초 (대사 없음)`);
            }
            if (gaps.length > 0) {
                silentGapsHint = `\n[대사 없는 구간] — 이 구간에는 반드시 상황자막을 넣어주세요!\n${gaps.join('\n')}\n`;
            }
        }
    } catch { /* ignore */ }

    return `당신은 ${config.role}입니다.
오디오를 듣고 대본을 참고하여 [${genreLabel}] 스타일의 연출 자막을 만들어주세요.

★★★ 핵심 원칙 (반드시 지킬 것) ★★★
1. 대본(말자막)은 이미 별도로 존재합니다. 대본 내용을 절대 반복/요약하지 마세요!
2. ⛔ 절대 없는 내용을 지어내지 마세요! 오디오에서 실제로 들리는 내용만 기반으로 자막을 만드세요.
3. 대본은 음성인식(STT)으로 자동 생성되어 오류가 많습니다.
   대본에 이상한 내용이 있으면 무시하세요. 대본을 맹신하지 마세요!
4. 의미를 알 수 없거나 맥락에 맞지 않는 자막은 만들지 마세요.
5. 오디오에서 실제로 들리는 소리/말/분위기만 기반으로 판단하세요.
6. 목표 개수를 반드시 채워주세요! 영상 전체에 걸쳐 풍부하게 자막을 배치하세요.
7. ⛔ 절대 같은 내용의 자막을 반복하지 마세요! 비슷한 텍스트/같은 뜻의 자막이 2번 이상 나오면 안 됩니다.
8. 예능/상황/설명 3가지 유형을 골고루 섞어주세요. 한 유형만 몰리면 안 됩니다.

영상 길이: ${Math.round(duration)}초
목표: 약 ${targetCount}개
톤: ${config.tone}

[기존 대본] (참고용 — 대본과 같은 시간대에 겹쳐도 시스템이 자동 분리)
※ STT 자동생성이므로 오타/오인식이 있을 수 있음. 오디오를 직접 듣고 맥락을 파악하세요.
${transcriptJson}
${silentGapsHint}
[자막 유형 3가지]
${typeLines}

[배치 전략] (5개 구간에 고루 분산)
${segments}

[★ 중요: 상황자막 규칙 ★]
- 대사가 없는 구간(음악, 침묵, 효과음, 박수 등)에는 반드시 상황자막을 배치하세요!
- 오디오에서 들리는 소리를 묘사: [배경음악], [박수], [웃음], [탄성], [침묵], [효과음] 등
- 분위기/감정 묘사도 가능: [긴장감 고조], [잔잔한 분위기], [갑자기 조용해지는...] 등
- 대사 없는 구간이 3초 이상이면 해당 구간에 상황자막이 최소 1개는 있어야 합니다

[★ 품질 기준 ★]
- 대본에 이상한 말(맥락에 안 맞는 단어)이 있으면 STT 오류입니다. 무시하세요!
- 맥락이 불분명하면 상황자막(분위기/효과음 묘사)으로 대체하세요
- ★ 목표 개수를 반드시 채우세요! 자막이 풍부해야 영상이 재미있습니다 ★
- 대사 없는 구간에는 반드시 상황/예능 자막을 넣으세요
- 모든 구간에 빠짐없이 자막이 있어야 합니다

[일반 규칙]
- ★★★ 목표 개수를 반드시 채우세요! 자막이 풍부해야 영상이 재미있습니다 ★★★
- 각 자막 최소 3초 이상, 최대 5초 노출
- 자막끼리 시간 겹침 금지 (최소 1초 간격)
- 대본 텍스트 반복 금지
- 같은 내용/비슷한 내용의 자막 반복 금지 (한 번만!)
- 5~20자 적당한 길이
- 예능/상황/설명 3종류를 골고루 배분 (한 종류만 연속 3개 이상 금지)
- 대사 없는 모든 구간에 빠짐없이 자막 배치
- ${config.emojiRule}

[출력 형식]
반드시 JSON 배열만 출력. 다른 설명/마크다운 금지.
★★★ 모든 text는 반드시 한국어로만. ★★★
type은 "예능", "상황", "설명" 중 하나:
[
  {"start": 3.0, "end": 6.0, "text": "예시 자막", "type": "예능"},
  {"start": 12.0, "end": 15.0, "text": "[잔잔한 배경음악]", "type": "상황"},
  {"start": 25.0, "end": 28.0, "text": "핵심 정보", "type": "설명"}
]`;
}

export async function POST(req: Request) {
    try {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
        const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
        // Supabase는 usage 추적용 — 미설정이면 추적 없이 진행
        const supabase = (supabaseUrl && supabaseServiceKey)
            ? createClient(supabaseUrl, supabaseServiceKey)
            : null;

        // 세션 없이도 사용 가능 (베타 오픈 정책)
        const session = await getServerSession(authOptions);
        const email = session?.user?.email || null;

        // 로그인한 사용자만 usage 추적 (비로그인은 무제한 베타 허용)
        let usage: Record<string, number> | null = null;
        let skipUsageTracking = !email || !supabase;
        let isUserAdmin = email ? isAdmin(email) : false;

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

            if (!skipUsageTracking && usage && !isUserAdmin) {
                if (usage.used_seconds >= usage.total_allowed_seconds) {
                    return NextResponse.json({ error: 'Payment Required. Quota Exceeded.' }, { status: 402 });
                }
            }
        }

        let body;
        try {
            body = await req.json();
        } catch (parseErr: any) {
            console.error('[Gemini] Request body JSON 파싱 실패:', parseErr.message);
            return NextResponse.json({ error: `Request body 파싱 실패: ${parseErr.message}` }, { status: 400 });
        }
        const { base64Audio, mimeType, duration, chunkStartTime = 0, totalDuration, mode, customPrompt = '', transcriptData } = body;

        console.log(`[Gemini] 요청: mode=${mode}, duration=${duration}s, chunk=${chunkStartTime}s, audioLen=${base64Audio?.length ?? 0}, transcript=${transcriptData?.length ?? 0}개`);

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
        // fallback 모델 목록 (v1beta 엔드포인트 사용)
        const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.0-flash'];

        let prompt: string;

        if (mode === 'creative' && transcriptData) {
            // Creative subtitle mode: 장르별 연출 자막 생성
            const transcriptJson = JSON.stringify(transcriptData, null, 2);
            const transcriptCount = transcriptData ? transcriptData.length : 0;
            // AI 80% 비율 — 대본의 4배(80/20), 최소 3초당 1개
            const targetCount = Math.max(Math.ceil(transcriptCount * 4), 8, Math.round(duration / 3));
            const segmentSize = Math.round(duration / 5);
            const segments = Array.from({ length: 5 }, (_, i) => `  구간${i + 1}: ${i * segmentSize}초 ~ ${(i + 1) * segmentSize}초`).join('\n');

            const userStyle = customPrompt
                ? `\n\n[사용자 요청 스타일]\n${customPrompt}\n위 스타일 요청을 최대한 반영하여 자막을 생성하세요.`
                : '';

            prompt = buildCreativePrompt('기본', transcriptJson, duration, targetCount, segments, {
                role: 'MBC·KBS·SBS 40년차 예능 수석 작가이자 "나 혼자 산다", "놀면 뭐하니", "워크맨" 시즌 1~5 전체 자막 연출 총괄 PD',
                types: [
                    {
                        name: '예능', pct: 35,
                        desc: '시청자의 속마음을 대신 외치는 리액션. 공감되는 한마디. 웃음 유발. 시청자가 "ㅋㅋㅋ 이거 내 생각인데" 할 만한 자막',
                        examples: '"아니 이게 됩니다?? 🤯", "ㅋㅋㅋ 표정 실화", "살짝 소름...", "완전 내 얘기잖아", "이건 좀 아닌데요 선생님", "멈춰!!! ✋"',
                    },
                    {
                        name: '상황', pct: 30,
                        desc: '드라마틱한 분위기 내레이션. 효과음·배경·감정 묘사. 장면 전환 시 긴장감 조성. 시청자가 화면에 더 몰입하게 만드는 자막',
                        examples: '"[이때까지만 해도 아무도 몰랐다...]", "[긴장감 MAX]", "[♪ 감동 BGM ♪]", "[갑분싸]", "[침묵이 흐르고...]", "[세상 진지]"',
                    },
                    {
                        name: '설명', pct: 35,
                        desc: '핵심 정보를 한눈에. 숫자·팩트·전문용어를 쉽게 풀어서. 시청자가 "아~ 그런 거구나" 할 수 있게. ★포인트 강조★',
                        examples: '"무려 3배 차이!!", "쉽게 말해, 대박이라는 뜻", "★이게 바로 핵심★", "참고: ~한 이유는...", "꿀팁 등장 📝"',
                    },
                ],
                tone: '예능감 넘치면서도 시청자가 영상에 완전히 몰입하게 만드는 프로 편집',
                emojiRule: '이모지는 예능자막에서 1~2개 정도만 포인트로. 상황/설명에서는 거의 안 씀',
            }) + userStyle;
        } else {
            // Default mode: transcribe everything with style annotation
            prompt = `당신은 전문 유튜브 영상 편집자이자 자막 제작자입니다.
첨부된 오디오 파일을 듣고, 화자의 말을 그대로 받아적으면서 적절한 위치에 자막을 분할하여 스타일을 지정해주세요.

[핵심 규칙]
1. 오디오에서 실제로 들리는 말만 받아적으세요.
2. ⛔ 절대로 들리지 않는 내용을 지어내지 마세요! 배경음악이나 무음 구간에서 내용을 만들어내면 안 됩니다.
3. 각 자막은 화면에 표시하기 적절한 길이로 분리하세요 (1~2문장 이내).
4. 말이 안 들리거나 불확실한 구간은 건너뛰세요. 정확성이 가장 중요합니다.
5. 각 자막에는 내용에 따라 다음 3가지 스타일 중 하나를 지정하세요:
   - "예능자막": 감정표현, 리액션, 웃음, 강조점 등 유머러스하거나 강조가 필요한 부분
   - "설명자막": 객관적 정보, 해설, 상황 설명 등 전달력이 중요한 부분
   - "상황자막": 배경음악, 효과음, 분위기 등 주변 상황 묘사 또는 일반 대화

[출력 형식]
반드시 아래 JSON 배열 형식으로만 출력하고 다른 설명은 넣지 마세요.
★★★ 모든 text는 반드시 한국어로만 작성하세요. 영어를 절대 섞지 마세요. ★★★
[
  {
    "start_time": 0.0,
    "end_time": 2.5,
    "text": "안녕하세요! 오늘은 새로운 편집 기법을 배워볼게요.",
    "style_type": "예능자막"
  }
]`;
        }

        // 모델 순회 + 503/429 재시도
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
                                mimeType: mimeType,
                                data: base64Audio
                            }
                        }
                    ]);
                    success = true;
                    break;
                } catch (retryErr: any) {
                    lastError = retryErr;
                    const is503or429 = retryErr?.status === 503 || retryErr?.status === 429 ||
                        retryErr?.message?.includes('503') || retryErr?.message?.includes('429') ||
                        retryErr?.message?.includes('high demand') || retryErr?.message?.includes('Service Unavailable');
                    if (is503or429 && attempt < RETRY_DELAYS.length) {
                        console.warn(`[Gemini] ${modelName} ${retryErr.status || '503/429'}, ${RETRY_DELAYS[attempt] / 1000}초 후 재시도 (${attempt + 1}/${RETRY_DELAYS.length})`);
                        await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
                        continue;
                    }
                    console.warn(`[Gemini] ${modelName} 실패, 다음 모델 시도:`, retryErr.message);
                    break; // 다음 모델로
                }
            }
            if (success) break;
        }

        if (!result) {
            throw lastError || new Error('모든 Gemini 모델이 실패했습니다.');
        }

        const responseText = result.response.text();
        if (!responseText) {
            throw new Error("AI returned an empty response.");
        }
        
        // JSON 추출 및 정리
        let cleanedText = responseText
            .replace(/```json\n?/g, '').replace(/```\n?/g, '') // 마크다운 코드블록 제거
            .trim();

        const jsonMatch = cleanedText.match(/\[\s*\{[\s\S]*\}\s*\]/);

        let parsedResult = [];
        if (jsonMatch) {
            let jsonStr = jsonMatch[0];
            // AI가 흔히 만드는 JSON 오류 수정
            jsonStr = jsonStr
                .replace(/,\s*([}\]])/g, '$1')          // trailing comma 제거
                .replace(/([{,]\s*)(\w+)\s*:/g, '$1"$2":') // unquoted key → quoted
                .replace(/:\s*'([^']*)'/g, ': "$1"')    // single quotes → double quotes
                .replace(/\n/g, ' ');                     // 줄바꿈 제거
            try {
                parsedResult = JSON.parse(jsonStr);
            } catch (pErr) {
                console.error("JSON parsing error:", pErr, "Cleaned JSON:", jsonStr.slice(0, 500));
                // 2차 시도: 개별 객체 파싱
                const objectMatches = jsonStr.matchAll(/\{[^{}]+\}/g);
                const fallbackResults: any[] = [];
                for (const m of objectMatches) {
                    try { fallbackResults.push(JSON.parse(m[0])); } catch { /* skip */ }
                }
                if (fallbackResults.length > 0) {
                    console.log(`[Gemini] Fallback parsing: ${fallbackResults.length}개 자막 복구`);
                    parsedResult = fallbackResults;
                } else {
                    throw new Error("Failed to parse AI response as valid JSON.");
                }
            }
        } else {
            console.error("Gemini failed to return JSON format. Raw output:", responseText.slice(0, 500));
            throw new Error("AI response did not contain a valid JSON array.");
        }

        // Successfully generated. Update usage (로그인 사용자만).
        if (email && !skipUsageTracking && usage && !isUserAdmin && supabase) {
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
