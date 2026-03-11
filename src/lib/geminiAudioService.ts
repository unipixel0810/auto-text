/**
 * Gemini API - Audio-based Korean subtitle generation
 * Extracts audio from video, sends to Gemini 2.0 Flash for subtitle generation
 *
 * 대용량 파일 지원: 오디오를 90초 WAV 청크로 분할 후 순차 전송
 * Vercel payload 한도 4.5MB → 90s × 16kHz × 16bit mono ≈ 2.88MB raw → base64 ≈ 3.84MB ✅
 */

export interface GeminiSubtitleResult {
  start_time: number;
  end_time: number;
  text: string;
  style_type: '예능자막' | '설명자막' | '상황자막' | '예능' | '상황' | '설명' | '맥락';
}

export interface TranscriptDataForAI {
  startTime: number;
  endTime: number;
  text: string;
}

/** 청크 단위: 90초 */
const CHUNK_DURATION_SECONDS = 90;

/** WAV 다운샘플 레이트: 16kHz (90s → ~2.88MB raw) */
const TARGET_SAMPLE_RATE = 16000;

// ============================================
// WAV 유틸리티
// ============================================

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
}

/**
 * AudioBuffer → PCM 16bit mono WAV ArrayBuffer
 * sampleRate를 TARGET_SAMPLE_RATE로 다운샘플
 */
function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = 1; // mono
  const sampleRate = Math.min(buffer.sampleRate, TARGET_SAMPLE_RATE);
  const format = 1; // PCM
  const bitsPerSample = 16;

  const channelData = buffer.getChannelData(0);
  const ratio = buffer.sampleRate / sampleRate;
  const newLength = Math.floor(channelData.length / ratio);
  const samples = new Int16Array(newLength);

  for (let i = 0; i < newLength; i++) {
    const idx = Math.floor(i * ratio);
    const s = Math.max(-1, Math.min(1, channelData[idx]));
    samples[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }

  const byteRate = sampleRate * numChannels * bitsPerSample / 8;
  const blockAlign = numChannels * bitsPerSample / 8;
  const dataSize = samples.length * 2;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;

  const wavBuf = new ArrayBuffer(totalSize);
  const view = new DataView(wavBuf);

  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(offset, samples[i], true);
    offset += 2;
  }

  return wavBuf;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.slice(i, i + chunkSize);
    binary += String.fromCharCode.apply(null, Array.from(chunk));
  }
  return btoa(binary);
}

// ============================================
// 오디오 청크 분할
// ============================================

interface AudioChunk {
  base64: string;
  mimeType: string;
  startTime: number;
  endTime: number;
}

/**
 * 비디오 파일의 오디오를 CHUNK_DURATION_SECONDS 단위 WAV 청크 배열로 추출
 * 각 청크는 base64 인코딩 + startTime/endTime 포함
 */
async function extractAudioChunks(
  videoFile: File,
  onProgress?: (percent: number, message: string) => void
): Promise<{ chunks: AudioChunk[]; totalDuration: number }> {
  // 1. 전체 오디오 디코딩
  onProgress?.(5, '오디오 디코딩 중...');
  const arrayBuffer = await videoFile.arrayBuffer();

  let audioBuffer: AudioBuffer;
  let totalDuration: number;

  try {
    const audioContext = new AudioContext();
    try {
      audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
      totalDuration = audioBuffer.duration;
    } finally {
      audioContext.close();
    }
  } catch (decodeErr) {
    // 디코딩 실패 → 원본 파일을 단일 청크로 fallback
    console.warn('[Gemini] AudioContext 디코딩 실패, 원본 파일로 fallback:', decodeErr);
    const base64 = arrayBufferToBase64(arrayBuffer);
    return {
      chunks: [{
        base64,
        mimeType: videoFile.type || 'video/mp4',
        startTime: 0,
        endTime: 60,
      }],
      totalDuration: 60,
    };
  }

  const totalChunks = Math.ceil(totalDuration / CHUNK_DURATION_SECONDS);
  const sampleRate = audioBuffer.sampleRate;

  onProgress?.(10, `${totalChunks}개 청크로 분할 중...`);

  const chunks: AudioChunk[] = [];

  for (let i = 0; i < totalChunks; i++) {
    const chunkStart = i * CHUNK_DURATION_SECONDS;
    const chunkEnd = Math.min(chunkStart + CHUNK_DURATION_SECONDS, totalDuration);
    const chunkDur = chunkEnd - chunkStart;

    const startSample = Math.floor(chunkStart * sampleRate);
    const endSample = Math.floor(chunkEnd * sampleRate);
    const numSamples = endSample - startSample;

    // OfflineAudioContext로 구간 렌더링
    const offlineCtx = new OfflineAudioContext(1, numSamples, sampleRate);
    const bufferSource = offlineCtx.createBufferSource();
    bufferSource.buffer = audioBuffer;
    bufferSource.connect(offlineCtx.destination);
    bufferSource.start(0, chunkStart, chunkDur);
    const rendered = await offlineCtx.startRendering();

    // WAV 인코딩 (16kHz 다운샘플 포함)
    const wavBuf = audioBufferToWav(rendered);
    const base64 = arrayBufferToBase64(wavBuf);

    chunks.push({
      base64,
      mimeType: 'audio/wav',
      startTime: chunkStart,
      endTime: chunkEnd,
    });

    // 분할 진행률: 10% ~ 25%
    const splitPct = 10 + Math.round(((i + 1) / totalChunks) * 15);
    onProgress?.(splitPct, `청크 ${i + 1}/${totalChunks} 준비 완료`);
  }

  return { chunks, totalDuration };
}

// ============================================
// Gemini API 호출 (단일 청크)
// ============================================

async function callGeminiForChunk(
  chunk: AudioChunk,
  totalDuration: number,
  mode: 'default' | 'creative',
  transcriptData: TranscriptDataForAI[] | undefined,
  signal?: AbortSignal
): Promise<GeminiSubtitleResult[]> {
  const chunkDuration = chunk.endTime - chunk.startTime;

  // creative 모드에서는 해당 청크 구간의 transcriptData만 필터링
  let filteredTranscript = transcriptData;
  if (transcriptData && mode === 'creative') {
    filteredTranscript = transcriptData.filter(
      t => t.endTime > chunk.startTime && t.startTime < chunk.endTime
    ).map(t => ({
      ...t,
      startTime: t.startTime - chunk.startTime,
      endTime: t.endTime - chunk.startTime,
    }));
  }

  const response = await fetch('/api/ai/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      base64Audio: chunk.base64,
      mimeType: chunk.mimeType,
      duration: chunkDuration,
      chunkStartTime: chunk.startTime,
      totalDuration,
      mode,
      transcriptData: filteredTranscript,
    }),
    signal,
  });

  if (!response.ok) {
    if (response.status === 402) {
      throw new Error('PAYMENT_REQUIRED');
    }
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(err?.error || `Gemini API 호출 실패 (${response.status})`);
  }

  const data = await response.json();

  if (data.error) {
    if (response.status === 402 || data.error.includes('Payment Required')) {
      throw new Error('PAYMENT_REQUIRED');
    }
    throw new Error(data.error);
  }

  // route.ts에서 이미 chunkStartTime 오프셋을 적용한 타임스탬프가 반환됨
  const subtitles: GeminiSubtitleResult[] = (data as any[]).map((item: any) => ({
    start_time: item.start_time ?? item.start ?? 0,
    end_time: item.end_time ?? item.end ?? 0,
    text: item.text ?? '',
    style_type: item.style_type ?? item.type ?? '상황',
  }));

  return subtitles;
}

// ============================================
// 메인 함수
// ============================================

/**
 * Generate Korean subtitles from video audio using Gemini API
 * 10분+ 영상 지원: 90초 청크로 분할 → 순차 호출 → 타임스탬프 병합
 */
export async function generateSubtitlesFromAudio(
  videoFile: File,
  _apiKey: string, // No longer used directly here
  onProgress?: (percent: number, message: string) => void,
  signal?: AbortSignal,
  options?: { mode?: 'default' | 'creative'; transcriptData?: TranscriptDataForAI[]; duration?: number },
): Promise<GeminiSubtitleResult[]> {

  // 1. 오디오 청크 추출
  const { chunks, totalDuration } = await extractAudioChunks(videoFile, onProgress);

  const mode = options?.mode || 'default';
  const transcriptData = options?.transcriptData;

  const allResults: GeminiSubtitleResult[] = [];
  const totalChunks = chunks.length;

  // 2. 각 청크 순차 처리
  for (let i = 0; i < totalChunks; i++) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError');
    }

    const chunk = chunks[i];
    // 진행률: 25% ~ 90% 구간을 청크 수로 균등 분배
    const pctStart = 25 + Math.round((i / totalChunks) * 65);
    const pctEnd = 25 + Math.round(((i + 1) / totalChunks) * 65);

    onProgress?.(
      pctStart,
      totalChunks === 1
        ? '서버로 전송 중...'
        : `구간 ${i + 1}/${totalChunks} 처리 중... (${Math.round(chunk.startTime / 60)}분 ~ ${Math.round(chunk.endTime / 60)}분)`
    );

    const chunkResults = await callGeminiForChunk(
      chunk,
      totalDuration,
      mode,
      transcriptData,
      signal
    );

    allResults.push(...chunkResults);

    onProgress?.(pctEnd, `구간 ${i + 1}/${totalChunks} 완료`);
  }

  // 3. 시간순 정렬
  allResults.sort((a, b) => a.start_time - b.start_time);

  onProgress?.(100, '자막 생성 완료!');

  return allResults;
}
