/**
 * STT (Speech-to-Text) 서비스
 * OpenAI Whisper API를 사용한 음성 인식
 * 대용량 파일 지원 (최대 2GB)
 */

import type { WordTimestamp, STTResult } from './subtitleSplitter';

// ============================================
// 타입 정의
// ============================================

export interface WhisperSegment {
  id: number;
  seek: number;
  start: number;
  end: number;
  text: string;
  tokens: number[];
  temperature: number;
  avg_logprob: number;
  compression_ratio: number;
  no_speech_prob: number;
}

export interface WhisperWord {
  word: string;
  start: number;
  end: number;
}

export interface WhisperResponse {
  task: string;
  language: string;
  duration: number;
  text: string;
  segments?: WhisperSegment[];
  words?: WhisperWord[];
}

export interface STTOptions {
  /** OpenAI API 키 (서버 API Route 사용 시 불필요) */
  apiKey?: string;
  /** 언어 코드 (기본값: 'ko') */
  language?: string;
  /** 응답 형식 */
  responseFormat?: 'json' | 'verbose_json';
  /** 타임스탬프 세분화 */
  timestampGranularities?: ('word' | 'segment')[];
}

// ============================================
// 상수
// ============================================

/** Vercel 서버리스 함수 제한 (3MB로 안전하게 - 모바일 호환) */
const VERCEL_MAX_SIZE = 3 * 1024 * 1024;

/** Whisper API 최대 파일 크기 (25MB) */
const WHISPER_MAX_SIZE = 25 * 1024 * 1024;

/** 오디오 청크 길이 (30초 - 모바일 호환) */
const CHUNK_DURATION_SECONDS = 30;

/** 지원하는 최대 파일 크기 (400GB) */
const MAX_FILE_SIZE = 400 * 1024 * 1024 * 1024;

// ============================================
// 오디오 추출 (아이폰 HEVC 호환)
// ============================================

/**
 * 비디오에서 오디오 추출
 * 아이폰 HEVC는 decodeAudioData 실패 → 원본 파일 직접 사용
 */
export async function extractAudioFromVideo(
  videoFile: File,
  onProgress?: (status: string) => void
): Promise<Blob> {
  const sizeMB = videoFile.size / 1024 / 1024;

  // 모바일 감지
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  const maxSize = isMobile ? 4 : VERCEL_MAX_SIZE / 1024 / 1024; // 모바일 4MB, PC는 청크 처리

  onProgress?.('오디오 준비 중...');

  // 아이폰/모바일: 파일 크기 체크 후 원본 사용 (Whisper가 비디오도 처리 가능)
  if (isMobile) {
    if (sizeMB > maxSize) {
      throw new Error(`모바일에서는 ${maxSize}MB 이하 영상만 가능합니다.\n현재: ${sizeMB.toFixed(1)}MB\n\n💡 해결방법:\n1. 캡컷 등으로 영상 압축\n2. PC에서 이용`);
    }
    onProgress?.(`파일 준비 완료 (${sizeMB.toFixed(1)}MB)`);
    return videoFile;
  }

  // PC: 오디오 추출 시도
  return new Promise((resolve, reject) => {
    onProgress?.('오디오 추출 준비 중...');

    const video = document.createElement('video');
    video.src = URL.createObjectURL(videoFile);
    video.muted = false;
    video.playsInline = true;

    // 타임아웃 설정 (10초)
    const timeout = setTimeout(() => {
      URL.revokeObjectURL(video.src);
      onProgress?.('오디오 추출 완료 (원본 사용)');
      resolve(videoFile);
    }, 10000);

    video.onloadedmetadata = async () => {
      try {
        clearTimeout(timeout);
        const duration = video.duration;
        onProgress?.(`영상 길이: ${Math.floor(duration / 60)}분 ${Math.floor(duration % 60)}초`);

        // AudioContext 생성 (16kHz)
        const audioContext = new AudioContext({ sampleRate: 16000 });

        onProgress?.('오디오 디코딩 중...');

        const response = await fetch(video.src);
        const arrayBuffer = await response.arrayBuffer();

        let audioBuffer: AudioBuffer;
        try {
          audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
        } catch {
          // 디코딩 실패 시 원본 파일 반환
          URL.revokeObjectURL(video.src);
          onProgress?.('오디오 추출 완료 (원본 사용)');
          resolve(videoFile);
          return;
        }

        onProgress?.('오디오 인코딩 중...');

        // WAV 형식으로 변환
        const wavBlob = audioBufferToWav(audioBuffer);

        URL.revokeObjectURL(video.src);
        onProgress?.(`오디오 추출 완료 (${(wavBlob.size / 1024).toFixed(0)}KB)`);
        resolve(wavBlob);

      } catch (error) {
        clearTimeout(timeout);
        URL.revokeObjectURL(video.src);
        // 실패 시 원본 파일 사용
        onProgress?.('오디오 추출 완료 (원본 사용)');
        resolve(videoFile);
      }
    };

    video.onerror = () => {
      clearTimeout(timeout);
      URL.revokeObjectURL(video.src);
      // 비디오 로드 실패해도 원본 파일 시도
      onProgress?.('오디오 추출 완료 (원본 사용)');
      resolve(videoFile);
    };
  });
}

/**
 * AudioBuffer를 WAV Blob으로 변환
 */
function audioBufferToWav(buffer: AudioBuffer): Blob {
  const numChannels = 1; // 모노로 변환
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;

  // 모노로 다운믹스
  const channelData = buffer.getChannelData(0);
  const samples = new Int16Array(channelData.length);

  for (let i = 0; i < channelData.length; i++) {
    const s = Math.max(-1, Math.min(1, channelData[i]));
    samples[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
  }

  const dataLength = samples.length * 2;
  const bufferLength = 44 + dataLength;
  const arrayBuffer = new ArrayBuffer(bufferLength);
  const view = new DataView(arrayBuffer);

  // WAV 헤더 작성
  writeString(view, 0, 'RIFF');
  view.setUint32(4, bufferLength - 8, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bitDepth / 8, true);
  view.setUint16(32, numChannels * bitDepth / 8, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataLength, true);

  // 오디오 데이터 작성
  const offset = 44;
  for (let i = 0; i < samples.length; i++) {
    view.setInt16(offset + i * 2, samples[i], true);
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

// ============================================
// 오디오 청크 분할
// ============================================

/**
 * 오디오 Blob을 청크로 분할 (시간 기반)
 */
export async function splitAudioIntoChunks(
  audioBlob: Blob,
  chunkDurationSeconds: number = CHUNK_DURATION_SECONDS,
  onProgress?: (status: string) => void
): Promise<{ blob: Blob; startTime: number }[]> {
  // 파일이 4MB 이하면 분할 불필요 (Vercel 제한)
  if (audioBlob.size <= VERCEL_MAX_SIZE) {
    return [{ blob: audioBlob, startTime: 0 }];
  }

  onProgress?.('대용량 파일 분할 중...');

  // AudioContext로 오디오 로드
  const audioContext = new AudioContext();
  const arrayBuffer = await audioBlob.arrayBuffer();

  let audioBuffer: AudioBuffer;
  try {
    audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
  } catch {
    // 디코딩 실패 시 크기 기반 분할
    return splitBySize(audioBlob, WHISPER_MAX_SIZE);
  }

  const duration = audioBuffer.duration;
  const chunks: { blob: Blob; startTime: number }[] = [];
  const numChunks = Math.ceil(duration / chunkDurationSeconds);

  for (let i = 0; i < numChunks; i++) {
    const startTime = i * chunkDurationSeconds;
    const endTime = Math.min((i + 1) * chunkDurationSeconds, duration);
    const chunkDuration = endTime - startTime;

    onProgress?.(`청크 ${i + 1}/${numChunks} 생성 중...`);

    // 청크 AudioBuffer 생성
    const startSample = Math.floor(startTime * audioBuffer.sampleRate);
    const endSample = Math.floor(endTime * audioBuffer.sampleRate);
    const chunkLength = endSample - startSample;

    const chunkBuffer = audioContext.createBuffer(
      1, // 모노
      chunkLength,
      audioBuffer.sampleRate
    );

    const sourceData = audioBuffer.getChannelData(0);
    const destData = chunkBuffer.getChannelData(0);

    for (let j = 0; j < chunkLength; j++) {
      destData[j] = sourceData[startSample + j] || 0;
    }

    const wavBlob = audioBufferToWav(chunkBuffer);
    chunks.push({ blob: wavBlob, startTime });
  }

  await audioContext.close();
  return chunks;
}

/**
 * 크기 기반 분할 (오디오 디코딩 실패 시 폴백)
 */
function splitBySize(blob: Blob, maxSize: number): { blob: Blob; startTime: number }[] {
  const chunks: { blob: Blob; startTime: number }[] = [];
  let offset = 0;
  let chunkIndex = 0;

  while (offset < blob.size) {
    const chunkSize = Math.min(maxSize, blob.size - offset);
    const chunk = blob.slice(offset, offset + chunkSize);
    chunks.push({ blob: chunk, startTime: chunkIndex * 600 }); // 추정 시간
    offset += chunkSize;
    chunkIndex++;
  }

  return chunks;
}

// ============================================
// Whisper API 호출
// ============================================

/**
 * OpenAI Whisper API로 음성 인식 수행 (서버 API Route 사용)
 */
export async function transcribeWithWhisper(
  audioFile: File | Blob,
  options: STTOptions
): Promise<WhisperResponse> {
  const formData = new FormData();

  // 파일 추가
  if (audioFile instanceof File) {
    formData.append('file', audioFile);
  } else {
    formData.append('file', audioFile, 'audio.wav');
  }

  // Calculate approximate duration to send to backend for quota tracking
  // A chunk is typically up to CHUNK_DURATION_SECONDS
  formData.append('duration', CHUNK_DURATION_SECONDS.toString());

  // 서버 API Route 호출 (API 키는 서버에서 관리)
  const response = await fetch('/api/ai/stt', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    if (response.status === 402) {
      throw new Error('PAYMENT_REQUIRED');
    }
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(`음성 인식 오류: ${error.error || response.statusText}`);
  }

  const data = await response.json();
  if (data.error) {
    if (response.status === 402 || data.error.includes('Payment Required')) {
      throw new Error('PAYMENT_REQUIRED');
    }
    throw new Error(data.error);
  }

  return data;
}

// ============================================
// 결과 변환 및 병합
// ============================================

/**
 * Whisper 응답을 STTResult 형식으로 변환
 */
export function convertWhisperToSTTResult(
  whisperResponse: WhisperResponse,
  timeOffset: number = 0
): STTResult {
  const words: WordTimestamp[] = [];

  // 단어별 타임스탬프가 있는 경우
  if (whisperResponse.words && whisperResponse.words.length > 0) {
    for (const word of whisperResponse.words) {
      words.push({
        word: word.word.trim(),
        startTime: word.start + timeOffset,
        endTime: word.end + timeOffset,
        confidence: 1,
      });
    }
  }
  // 세그먼트만 있는 경우
  else if (whisperResponse.segments && whisperResponse.segments.length > 0) {
    for (const segment of whisperResponse.segments) {
      const segmentWords = segment.text.trim().split(/\s+/).filter(w => w.length > 0);
      const segmentDuration = segment.end - segment.start;
      const wordDuration = segmentDuration / segmentWords.length;

      segmentWords.forEach((word, index) => {
        words.push({
          word,
          startTime: segment.start + timeOffset + (index * wordDuration),
          endTime: segment.start + timeOffset + ((index + 1) * wordDuration),
          confidence: 1 - segment.no_speech_prob,
        });
      });
    }
  }
  // 전체 텍스트만 있는 경우
  else {
    const allWords = whisperResponse.text.trim().split(/\s+/).filter(w => w.length > 0);
    const wordDuration = whisperResponse.duration / allWords.length;

    allWords.forEach((word, index) => {
      words.push({
        word,
        startTime: timeOffset + index * wordDuration,
        endTime: timeOffset + (index + 1) * wordDuration,
        confidence: 1,
      });
    });
  }

  return {
    fullText: whisperResponse.text,
    words,
    duration: whisperResponse.duration,
    language: whisperResponse.language,
  };
}

/**
 * 여러 청크의 STT 결과 병합
 */
export function mergeSTTResults(results: STTResult[]): STTResult {
  if (results.length === 0) {
    return { fullText: '', words: [], duration: 0 };
  }

  if (results.length === 1) {
    return results[0];
  }

  const merged: STTResult = {
    fullText: results.map(r => r.fullText).join(' '),
    words: results.flatMap(r => r.words),
    duration: results.reduce((sum, r) => sum + r.duration, 0),
    language: results[0].language,
  };

  return merged;
}

// ============================================
// 통합 함수 (대용량 지원)
// ============================================

/**
 * 비디오 파일에서 음성 인식 수행 (전체 파이프라인, 대용량 지원)
 */
export async function transcribeVideo(
  videoFile: File,
  apiKey: string,
  onProgress?: (status: string) => void
): Promise<STTResult> {
  try {
    // 1. 파일 크기 체크
    const sizeCheck = checkFileSize(videoFile);
    if (!sizeCheck.valid) {
      throw new Error(sizeCheck.message);
    }

    // 2. 오디오 추출
    onProgress?.('🎵 오디오 추출 중...');
    let audioBlob: Blob;

    try {
      audioBlob = await extractAudioFromVideo(videoFile, onProgress);
    } catch {
      // 오디오 추출 실패 시 원본 파일 사용
      audioBlob = videoFile;
    }

    // 3. 청크 분할 (대용량 파일)
    onProgress?.('📦 파일 처리 중...');
    const chunks = await splitAudioIntoChunks(audioBlob, CHUNK_DURATION_SECONDS, onProgress);

    // 4. 각 청크에 대해 Whisper API 호출
    const results: STTResult[] = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      onProgress?.(`🎤 음성 인식 중... (${i + 1}/${chunks.length})`);

      const whisperResponse = await transcribeWithWhisper(chunk.blob, {
        apiKey,
        language: 'ko',
        responseFormat: 'verbose_json',
        timestampGranularities: ['word', 'segment'],
      });

      const result = convertWhisperToSTTResult(whisperResponse, chunk.startTime);
      results.push(result);

      // API 레이트 리밋 방지
      if (i < chunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // 5. 결과 병합
    onProgress?.('🔗 결과 병합 중...');
    const mergedResult = mergeSTTResults(results);

    onProgress?.('✅ 음성 인식 완료!');
    return mergedResult;

  } catch (error) {
    console.error('STT 오류:', error);
    throw error;
  }
}

// ============================================
// 파일 크기 체크
// ============================================

/**
 * 파일 크기가 제한 내인지 확인 (2GB)
 */
export function checkFileSize(file: File): { valid: boolean; message?: string } {
  if (file.size > MAX_FILE_SIZE) {
    return {
      valid: false,
      message: `파일 크기가 너무 큽니다. (최대 2GB, 현재 ${(file.size / (1024 * 1024 * 1024)).toFixed(2)}GB)`,
    };
  }
  return { valid: true };
}

/**
 * 예상 처리 시간 계산
 */
export function estimateProcessingTime(fileSize: number): string {
  const sizeMB = fileSize / (1024 * 1024);

  if (sizeMB < 25) {
    return '약 30초 ~ 1분';
  } else if (sizeMB < 100) {
    return '약 1 ~ 3분';
  } else if (sizeMB < 500) {
    return '약 3 ~ 10분';
  } else {
    return '약 10 ~ 30분';
  }
}
