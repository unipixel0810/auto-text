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
★ 당신의 자막 하나가 영상의 조회수를 10배 올립니다. ★

## STEP 1: 대본 완전 분석
대본과 오디오를 듣고 아래를 파악하세요:
1) 이 영상의 핵심 주제는?
2) 화자의 감정 흐름 (시작 → 전환점 → 클라이맥스 → 마무리)
3) 시청자가 "ㅋㅋㅋ" 할 포인트, "와..." 할 포인트, "헐" 할 포인트

## ★★★ 예능 PD 모드 — 핵심 원칙 ★★★
- 연출 자막 80% 이상! 대본 반복/요약 = 0%!
1. ★ 자막은 반드시 1줄! 최대 12자 이내! ★ (14자 초과 = 실격)
2. ★ 대본 맥락에 100% 맞는 자막만! ★
3. 없는 내용 지어내기 금지! 오디오에서 실제로 들리는 내용만!
4. 대본은 STT 자동생성이라 오류가 있음. 오디오를 직접 듣고 판단!
5. 같은 내용/비슷한 뜻/같은 말투 반복 절대 금지!
6. 목표 개수를 반드시 채우세요!

영상 길이: ${Math.round(duration)}초
목표: 약 ${targetCount}개
톤: ${config.tone}

[기존 대본] (참고용 — 시스템이 자동 분리)
${transcriptJson}
${silentGapsHint}
[자막 유형]
${typeLines}

[배치 전략] (5개 구간에 고루 분산)
${segments}

[상황자막 규칙]
- 대사 없는 구간에는 반드시 상황자막 배치
- 오디오 소리 묘사: [배경음악], [박수], [웃음] 등
- 3초 이상 빈 구간에 최소 1개

[규칙]
- ★ 자막 = 무조건 1줄, 최대 12자! 짧고 강렬하게! ★
- 목표 개수 반드시 충족
- 각 자막 1~3초 노출
- 자막끼리 시간 겹침 금지 (최소 0.5초 간격)
- 대본과 관련 없는 엉뚱한 자막 절대 금지
- 같은 패턴/말투 반복 금지! 매번 다른 스타일로!
- ${config.emojiRule}

[출력 형식]
반드시 JSON 배열만 출력. 다른 설명/마크다운 금지.
★★★ 모든 text는 반드시 한국어로만. ★★★
type은 "예능", "상황", "설명", "맥락" 중 하나:
[
  {"start": 3.0, "end": 5.0, "text": "아니 진짜??", "type": "예능"},
  {"start": 12.0, "end": 14.0, "text": "[반전 주의]", "type": "상황"},
  {"start": 25.0, "end": 27.0, "text": "★핵심★", "type": "설명"},
  {"start": 35.0, "end": 37.0, "text": "참고로 이건...", "type": "맥락"}
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
        let email: string | null = null;
        try {
            const session = await getServerSession(authOptions);
            email = session?.user?.email || null;
        } catch { /* 인증 실패해도 계속 진행 */ }

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
        const GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite'];

        let prompt: string;

        if (mode === 'creative' && transcriptData) {
            // Creative subtitle mode: 장르별 연출 자막 생성
            const transcriptJson = JSON.stringify(transcriptData, null, 2);
            const transcriptCount = transcriptData ? transcriptData.length : 0;
            // AI 50%+ 비율 — 대본의 3배, 최소 2초당 1개 (풍부하게)
            const targetCount = Math.max(Math.ceil(transcriptCount * 3), 10, Math.round(duration / 2));
            const segmentSize = Math.round(duration / 5);
            const segments = Array.from({ length: 5 }, (_, i) => `  구간${i + 1}: ${i * segmentSize}초 ~ ${(i + 1) * segmentSize}초`).join('\n');

            const userStyle = customPrompt
                ? `\n\n[사용자 요청 스타일]\n${customPrompt}\n위 스타일 요청을 최대한 반영하여 자막을 생성하세요.`
                : '';

            prompt = buildCreativePrompt('기본', transcriptJson, duration, targetCount, segments, {
                role: 'MBC/tvN 간판 예능 PD 출신 유튜브 자막 연출 디렉터. 자막 하나로 조회수를 10배 올리는 전설의 PD',
                types: [
                    {
                        name: '예능', pct: 40,
                        desc: '시청자 속마음 + 공감 폭발! 매번 전혀 다른 말투/패턴으로. 반복 = 실격!',
                        examples: '"아니 이게 된다고??", "잠깐 뭐라고??", "나만 이렇게 느끼나", "편집자 웃참 실패", "댓글란 예상: ㅋㅋㅋ", "이건 인정...", "와 진짜 소름", "구독 안 누르면 손해"',
                    },
                    {
                        name: '상황', pct: 25,
                        desc: 'PD의 연출 무기. 침묵/전환/반전 순간을 드라마틱하게! 침묵 구간(1.5초+)에 반드시 배치!',
                        examples: '"[그리고 3초 후...]", "[이때까지만 해도...]", "[긴장감 MAX]", "[반전 주의보]", "[갑자기 조용...]", "[여기서부터 실화]", "[잠깐! 놓치면 안 됨]"',
                    },
                    {
                        name: '설명', pct: 20,
                        desc: '핵심 포인트를 짧고 강렬하게. 시청자가 스크린샷 찍을 만한 한 줄',
                        examples: '"★오늘의 핵심★", "여기가 포인트", "한줄요약: 역대급", "이거 진짜 중요"',
                    },
                    {
                        name: '맥락', pct: 15,
                        desc: '시청자가 알면 더 재미있는 TMI/비하인드',
                        examples: '"참고로 이거 첫 도전", "아는 사람만 아는 포인트", "사실 여기서...", "편집하다 발견"',
                    },
                ],
                tone: 'MBC 예능 PD급 센스! 유머/위트/반전. 매번 완전히 다른 패턴/말투. 같은 표현 반복 절대 금지. 대본 반복/요약 = 실격!',
                emojiRule: '이모지 사용하지 마세요. 깔끔한 텍스트로만',
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
