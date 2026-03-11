import { NextResponse } from 'next/server';
import OpenAI from 'openai';

export const maxDuration = 60;

// 지원 음성 목록
export const VOICES = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const;
export type Voice = typeof VOICES[number];

export async function POST(req: Request) {
  try {
    const { text, voice = 'nova', speed = 1.0 } = await req.json();

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return NextResponse.json({ error: 'text required' }, { status: 400 });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: 'OPENAI_API_KEY not configured' }, { status: 500 });
    }

    const openai = new OpenAI({ apiKey });

    // 텍스트에서 특수 기호 정리 (자막 묘사 기호 제거)
    const cleanText = text
      .replace(/[\[\]♪♬🎵🎶]/g, '')
      .replace(/^\s*[-—]\s*/, '')
      .trim();

    if (!cleanText) {
      return NextResponse.json({ error: 'text is empty after cleaning' }, { status: 400 });
    }

    const mp3 = await openai.audio.speech.create({
      model: 'tts-1',
      voice: (VOICES.includes(voice as Voice) ? voice : 'nova') as Voice,
      input: cleanText,
      speed: Math.min(4.0, Math.max(0.25, Number(speed) || 1.0)),
    });

    const buffer = Buffer.from(await mp3.arrayBuffer());

    return new Response(buffer, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(buffer.byteLength),
        'Cache-Control': 'no-store',
      },
    });
  } catch (err: any) {
    console.error('TTS error:', err);
    return NextResponse.json(
      { error: err?.message || 'TTS generation failed' },
      { status: 500 }
    );
  }
}
