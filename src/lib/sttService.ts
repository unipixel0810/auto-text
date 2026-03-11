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

/** Vercel 서버리스 함수 제한 (20MB — Next.js body 기본 파싱 한도) */
const VERCEL_MAX_SIZE = 20 * 1024 * 1024;

/** Whisper API 최대 파일 크기 (25MB) */
const WHISPER_MAX_SIZE = 24 * 1024 * 1024; // 24MB로 여유 확보

/** 청크 크기 — 20MB (Vercel 업로드 한도 이하) */
const CHUNK_SIZE_BYTES = 20 * 1024 * 1024;

/** 오디오 청크 길이 (30초) */
const CHUNK_DURATION_SECONDS = 30;

/** 지원하는 최대 파일 크기 (제한 없음) */
const MAX_FILE_SIZE = Number.MAX_SAFE_INTEGER;

/** 병렬 처리 최대 동시 요청 수 */
const MAX_CONCURRENT = 3;

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
  onProgress?.(`파일 준비 완료 (${sizeMB.toFixed(1)}MB) — 청크 분할 방식으로 처리합니다`);
  // 전체 파일을 메모리에 올리지 않고 원본을 그대로 반환
  // 청크 분할은 splitAudioIntoChunks에서 처리
  return videoFile;
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
/**
 * 파일을 크기 기반으로 청크 분할 (메모리 효율 — 전체 디코딩 없음)
 * Whisper는 원본 비디오/오디오 파일도 처리 가능하므로 파일 슬라이스로 분할
 */
export async function splitAudioIntoChunks(
  audioBlob: Blob,
  chunkDurationSeconds: number = CHUNK_DURATION_SECONDS,
  onProgress?: (status: string) => void
): Promise<{ blob: Blob; startTime: number; index: number; total: number }[]> {
  const totalSize = audioBlob.size;

  // 20MB 이하면 분할 없이 그대로 사용
  if (totalSize <= CHUNK_SIZE_BYTES) {
    return [{ blob: audioBlob, startTime: 0, index: 0, total: 1 }];
  }

  onProgress?.('대용량 파일 청크 분할 중...');

  // 파일을 20MB 단위로 슬라이스 (메모리에 전체 올리지 않음)
  const chunks: { blob: Blob; startTime: number; index: number; total: number }[] = [];
  let offset = 0;
  let chunkIndex = 0;
  const totalChunks = Math.ceil(totalSize / CHUNK_SIZE_BYTES);

  // 파일 1MB당 약 1분 오디오로 추정 (mp4 기준 ~1Mbps)
  const estimatedTotalSeconds = (totalSize / (1024 * 1024)) * 60;
  const secondsPerByte = estimatedTotalSeconds / totalSize;

  while (offset < totalSize) {
    const chunkSize = Math.min(CHUNK_SIZE_BYTES, totalSize - offset);
    const chunkBlob = audioBlob.slice(offset, offset + chunkSize);
    const estimatedStartTime = offset * secondsPerByte;
    chunks.push({
      blob: chunkBlob,
      startTime: estimatedStartTime,
      index: chunkIndex,
      total: totalChunks,
    });
    offset += chunkSize;
    chunkIndex++;
  }

  onProgress?.(`총 ${totalChunks}개 청크로 분할 완료`);
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

    // 4. 각 청크에 대해 Whisper API 호출 (병렬 처리, 최대 MAX_CONCURRENT 동시)
    const results: STTResult[] = new Array(chunks.length);

    for (let batchStart = 0; batchStart < chunks.length; batchStart += MAX_CONCURRENT) {
      const batch = chunks.slice(batchStart, batchStart + MAX_CONCURRENT);
      onProgress?.(`🎤 음성 인식 중... (${batchStart + 1}~${Math.min(batchStart + MAX_CONCURRENT, chunks.length)}/${chunks.length})`);

      await Promise.all(
        batch.map(async (chunk) => {
          const whisperResponse = await transcribeWithWhisper(chunk.blob, {
            apiKey,
            language: 'ko',
            responseFormat: 'verbose_json',
            timestampGranularities: ['word', 'segment'],
          });
          results[chunk.index] = convertWhisperToSTTResult(whisperResponse, chunk.startTime);
        })
      );

      // API 레이트 리밋 방지 (배치 사이 딜레이)
      if (batchStart + MAX_CONCURRENT < chunks.length) {
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
