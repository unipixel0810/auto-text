/**
 * Gemini API - Audio-based Korean subtitle generation
 * Extracts audio from video, sends to Gemini 2.0 Flash for subtitle generation
 */

export interface GeminiSubtitleResult {
  start_time: number;
  end_time: number;
  text: string;
  style_type: '요약자막' | '예능자막' | '설명자막' | '상황자막';
}

export interface TranscriptDataForAI {
  startTime: number;
  endTime: number;
  text: string;
}

/**
 * Extract audio from a video file as base64
 */
async function extractAudioBase64(videoFile: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.src = URL.createObjectURL(videoFile);

    video.onloadedmetadata = async () => {
      try {
        const audioContext = new AudioContext();
        const arrayBuffer = await videoFile.arrayBuffer();
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

        // Encode to WAV
        const wavBuffer = audioBufferToWav(audioBuffer);
        const base64 = arrayBufferToBase64(wavBuffer);

        URL.revokeObjectURL(video.src);
        audioContext.close();
        resolve({ base64, mimeType: 'audio/wav' });
      } catch (err) {
        // Fallback: send the raw file as-is
        const arrayBuffer = await videoFile.arrayBuffer();
        const base64 = arrayBufferToBase64(arrayBuffer);
        URL.revokeObjectURL(video.src);
        resolve({ base64, mimeType: videoFile.type || 'video/mp4' });
      }
    };

    video.onerror = () => {
      URL.revokeObjectURL(video.src);
      // Fallback: send raw file
      videoFile.arrayBuffer().then(buf => {
        resolve({ base64: arrayBufferToBase64(buf), mimeType: videoFile.type || 'video/mp4' });
      }).catch(reject);
    };
  });
}

function audioBufferToWav(buffer: AudioBuffer): ArrayBuffer {
  const numChannels = 1; // mono
  const sampleRate = Math.min(buffer.sampleRate, 16000); // downsample for smaller size
  const format = 1; // PCM
  const bitsPerSample = 16;

  // Get mono channel data
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

  const buffer2 = new ArrayBuffer(totalSize);
  const view = new DataView(buffer2);

  // WAV header
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

  // Write samples
  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(offset, samples[i], true);
    offset += 2;
  }

  return buffer2;
}

function writeString(view: DataView, offset: number, str: string) {
  for (let i = 0; i < str.length; i++) {
    view.setUint8(offset + i, str.charCodeAt(i));
  }
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

/**
 * Generate Korean subtitles from video audio using Gemini API
 */
export async function generateSubtitlesFromAudio(
  videoFile: File,
  _apiKey: string, // No longer used directly here
  onProgress?: (percent: number, message: string) => void,
  signal?: AbortSignal,
  options?: { mode?: 'default' | 'creative'; transcriptData?: TranscriptDataForAI[] },
): Promise<GeminiSubtitleResult[]> {
  onProgress?.(5, '오디오 추출 중...');

  const { base64, mimeType } = await extractAudioBase64(videoFile);

  // Approximate duration. In a real app we'd get this from the video element metadata.
  const duration = 60;

  onProgress?.(30, '서버로 전송 중...');

  const response = await fetch('/api/ai/gemini', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      base64Audio: base64,
      mimeType,
      duration,
      mode: options?.mode || 'default',
      transcriptData: options?.transcriptData,
    }),
    signal,
  });

  onProgress?.(70, '응답 처리 중...');

  if (!response.ok) {
    if (response.status === 402) {
      throw new Error('PAYMENT_REQUIRED');
    }
    const err = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(err?.error || 'Gemini API 호출 실패.');
  }

  const data = await response.json();

  if (data.error) {
    if (response.status === 402 || data.error.includes('Payment Required')) {
      throw new Error('PAYMENT_REQUIRED');
    }
    throw new Error(data.error);
  }

  const subtitles: GeminiSubtitleResult[] = data;

  onProgress?.(100, '자막 생성 완료!');

  return subtitles;
}
