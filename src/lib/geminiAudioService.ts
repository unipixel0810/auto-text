/**
 * Gemini API - Audio-based Korean subtitle generation
 * Extracts audio from video, sends to Gemini 2.0 Flash for subtitle generation
 */

export interface GeminiSubtitleResult {
  start_time: number;
  end_time: number;
  text: string;
  style_type: '요약자막' | '예능자막' | '설명자막';
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
  apiKey: string,
  onProgress?: (percent: number, message: string) => void,
): Promise<GeminiSubtitleResult[]> {
  onProgress?.(5, '오디오 추출 중...');

  const { base64, mimeType } = await extractAudioBase64(videoFile);

  onProgress?.(30, 'Gemini API 호출 중...');

  const prompt = `Analyze this video audio and generate Korean subtitles.
Create subtitles every 2-3 seconds.
Mix these styles appropriately:
- 요약자막: key point summary, white text + black outline
- 예능자막: fun/emphasis style, yellow text + black bg, large font
- 설명자막: explanation style, cyan text + dark bg
Each subtitle must include: start_time, end_time, text, style_type

Output ONLY a JSON array:
[{"start_time": 0.0, "end_time": 2.5, "text": "자막 텍스트", "style_type": "요약자막"}]`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            {
              inline_data: {
                mime_type: mimeType,
                data: base64,
              },
            },
            { text: prompt },
          ],
        }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 8192,
        },
      }),
    },
  );

  onProgress?.(70, '응답 처리 중...');

  if (!response.ok) {
    const err = await response.json().catch(() => ({ error: { message: response.statusText } }));
    throw new Error(err?.error?.message || 'Gemini API 호출 실패. API 키를 확인해주세요.');
  }

  const data = await response.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

  // Extract JSON from response
  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    throw new Error('Gemini 응답에서 자막 데이터를 찾을 수 없습니다.');
  }

  const subtitles: GeminiSubtitleResult[] = JSON.parse(jsonMatch[0]);

  onProgress?.(100, '자막 생성 완료!');

  return subtitles;
}
