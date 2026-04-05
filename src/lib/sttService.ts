/**
 * STT (Speech-to-Text) 서비스
 * OpenAI Whisper API를 사용한 음성 인식
 * 대용량 파일 지원 (최대 2GB)
 */

import type { WordTimestamp, STTResult, SentenceSegment } from './subtitleSplitter';
import type { MediaRange } from './geminiAudioService';

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

/** STT 엔진 선택 */
export type STTProvider = 'whisper' | 'gemini';

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

/** Vercel 서버리스 함수 payload 하드 제한 (4.5MB) — 여유 확보 위해 4MB 사용 */
const VERCEL_MAX_SIZE = 4 * 1024 * 1024;

/** Whisper API 최대 파일 크기 (25MB) */
const WHISPER_MAX_SIZE = 24 * 1024 * 1024;

/** 청크 크기 — 4MB (Vercel FUNCTION_PAYLOAD_TOO_LARGE 방지) */
const CHUNK_SIZE_BYTES = 4 * 1024 * 1024;

/** Whisper 네이티브 샘플레이트 — 16kHz로 다운샘플링하면 WAV 크기 ~3배 절약 */
const TARGET_SAMPLE_RATE = 16000;

/**
 * 오디오 청크 길이 (120초 = 2분)
 * 16kHz 모노 16bit WAV 기준: 120초 = 3.84MB (4MB 한도 내)
 * → 10분 영상도 5청크 이하로 처리 가능, 경계에서 단어 잘림 최소화
 */
const CHUNK_DURATION_SECONDS = 120;

/** 청크 간 겹침 (초) — 경계에서 단어가 잘리는 것을 방지 (5초로 증가: Whisper가 청크 끝 2-3초를 무시하는 경향 보완) */
const CHUNK_OVERLAP_SECONDS = 5;

/**
 * 두 문장의 겹침 텍스트를 제거하고 병합
 * 예: "기다림의 미" + "미학이다 정말" → "기다림의 미학이다 정말"
 */
function removeSentenceOverlap(textA: string, textB: string): string {
  // 가장 긴 겹침 찾기: textA의 끝부분이 textB의 시작부분과 일치하는 경우
  const maxOverlap = Math.min(textA.length, textB.length);
  let overlapLen = 0;
  for (let len = 1; len <= maxOverlap; len++) {
    const aSuffix = textA.slice(-len);
    const bPrefix = textB.slice(0, len);
    if (aSuffix === bPrefix) {
      overlapLen = len;
    }
  }
  if (overlapLen > 0) {
    return textA + textB.slice(overlapLen);
  }

  // 글자 단위 겹침이 없으면, 단어 단위로 시도
  // "기다림의 미" + "미학이다" → 마지막 글자 "미"가 다음 단어 시작과 겹침
  const aLastChar = textA.trim().slice(-1);
  const bFirstWord = textB.trim().split(/\s/)[0] || '';
  if (bFirstWord.startsWith(aLastChar) && aLastChar.length > 0) {
    // textA의 마지막 불완전 단어를 textB의 첫 단어로 교체
    const aWords = textA.trim().split(/\s/);
    const aLastWord = aWords[aWords.length - 1];
    if (bFirstWord.startsWith(aLastWord) && aLastWord.length < bFirstWord.length) {
      aWords[aWords.length - 1] = bFirstWord;
      const bRest = textB.trim().split(/\s/).slice(1).join(' ');
      return (aWords.join(' ') + (bRest ? ' ' + bRest : '')).trim();
    }
  }

  // 마지막 단어가 짧은 조각(1~2글자, 구두점 없음)이면 → 다음 문장 첫 단어에 붙여서 합침
  // 예: "정말 대" + "단하다 정말로" → "정말 대단하다 정말로"
  const aWords2 = textA.trim().split(/\s/);
  const aLast2 = aWords2[aWords2.length - 1];
  if (aLast2.length <= 2 && !/[.?!。？！,]/.test(aLast2)) {
    const bWords2 = textB.trim().split(/\s/);
    if (bWords2.length > 0) {
      aWords2[aWords2.length - 1] = aLast2 + bWords2[0];
      const bRest2 = bWords2.slice(1).join(' ');
      return (aWords2.join(' ') + (bRest2 ? ' ' + bRest2 : '')).trim();
    }
  }

  // 첫 단어가 짧은 조각(1~2글자)이면 → 이전 문장 마지막 단어에 붙이기
  // 예: "정말로 대단하" + "다 그렇지" → "정말로 대단하다 그렇지"
  const bWords3 = textB.trim().split(/\s/);
  const bFirst3 = bWords3[0];
  if (bFirst3 && bFirst3.length <= 2 && !/[.?!。？！]/.test(bFirst3)) {
    const aWords3 = textA.trim().split(/\s/);
    if (aWords3.length > 0) {
      aWords3[aWords3.length - 1] = aWords3[aWords3.length - 1] + bFirst3;
      const bRest3 = bWords3.slice(1).join(' ');
      return (aWords3.join(' ') + (bRest3 ? ' ' + bRest3 : '')).trim();
    }
  }

  // 겹침 없으면 단순 연결
  return (textA.trim() + ' ' + textB.trim()).trim();
}

/** 지원하는 최대 파일 크기 (제한 없음) */
const MAX_FILE_SIZE = Number.MAX_SAFE_INTEGER;

/** 병렬 처리 최대 동시 요청 수 */
const MAX_CONCURRENT = 3;

// ============================================
// 오디오 추출 (아이폰 HEVC 호환)
// ============================================

/**
 * 비디오에서 오디오 추출
 * FFmpeg WASM으로 오디오 트랙만 추출 (대용량 영상 → 작은 오디오 파일로 변환)
 * 실패 시 원본 파일 반환 (작은 파일은 WebAudio에서 처리 가능)
 */
export async function extractAudioFromVideo(
  videoFile: File,
  onProgress?: (status: string) => void
): Promise<Blob> {
  const sizeMB = videoFile.size / 1024 / 1024;

  onProgress?.(`파일 준비 완료 (${sizeMB.toFixed(1)}MB)`);
  // 원본 파일을 그대로 반환 (STT API가 청크 분할 + 오디오 추출 처리)
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
// 대용량 파일: video element + MediaRecorder로 유효한 오디오 청크 생성
// ============================================

async function captureAudioChunks(
  videoBlob: Blob,
  chunkDurationSeconds: number,
  onProgress?: (status: string) => void,
): Promise<{ blob: Blob; startTime: number; index: number; total: number; durationSeconds?: number }[]> {
  const url = URL.createObjectURL(videoBlob);
  const video = document.createElement('video');
  video.preload = 'auto';
  video.src = url;
  video.volume = 0;

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('비디오 로드 실패'));
  });

  const duration = video.duration;
  const numChunks = Math.ceil(duration / chunkDurationSeconds);
  const chunks: { blob: Blob; startTime: number; index: number; total: number; durationSeconds: number }[] = [];

  const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
    ? 'audio/webm;codecs=opus' : 'audio/webm';

  for (let i = 0; i < numChunks; i++) {
    const chunkStart = i * chunkDurationSeconds;
    const chunkEnd = Math.min(chunkStart + chunkDurationSeconds, duration);
    const chunkDur = chunkEnd - chunkStart;

    onProgress?.(`🎵 오디오 캡처 ${i + 1}/${numChunks} (${Math.round(chunkStart)}~${Math.round(chunkEnd)}초)`);

    const audioBlob = await new Promise<Blob>((resolve, reject) => {
      const stream = (video as any).captureStream() as MediaStream;
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length === 0) { reject(new Error('오디오 트랙 없음')); return; }

      const recorder = new MediaRecorder(new MediaStream(audioTracks), { mimeType });
      const parts: Blob[] = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) parts.push(e.data); };
      recorder.onstop = () => resolve(new Blob(parts, { type: mimeType }));
      recorder.onerror = (e) => reject(e);

      // 정확한 시간 기반 녹음 종료 (setTimeout 대신 timeupdate 사용)
      const onTimeUpdate = () => {
        if (video.currentTime >= chunkEnd - 0.05) {
          video.removeEventListener('timeupdate', onTimeUpdate);
          video.pause();
          if (recorder.state === 'recording') recorder.stop();
        }
      };

      video.currentTime = chunkStart;
      video.onseeked = () => {
        // seek 완료 후 약간 대기 → 오디오 버퍼 준비
        setTimeout(() => {
          video.addEventListener('timeupdate', onTimeUpdate);
          recorder.start(100); // 100ms 간격 데이터 수집
          video.play().catch(reject);
        }, 100);
      };

      // 안전장치: 최대 대기 시간 (chunkDur + 5초)
      setTimeout(() => {
        video.removeEventListener('timeupdate', onTimeUpdate);
        if (recorder.state === 'recording') {
          video.pause();
          recorder.stop();
        }
      }, (chunkDur + 5) * 1000);
    });

    chunks.push({ blob: audioBlob, startTime: chunkStart, index: i, total: numChunks, durationSeconds: chunkDur });
  }

  URL.revokeObjectURL(url);
  video.src = '';
  console.log(`[captureAudioChunks] ${numChunks}개 청크 캡처 완료 (총 ${Math.round(duration)}초)`);
  return chunks;
}

// ============================================
// 오디오 청크 분할
// ============================================

/**
 * 파일을 WebAudio API로 디코딩 후 시간 기반 WAV 청크로 분할
 * - 4MB 이하면 원본 파일 그대로 사용 (Vercel payload 한도 내)
 * - 초과 시 AudioContext로 디코딩 → 시간 구간별 WAV 슬라이스 → 각 청크 전송
 */
export async function splitAudioIntoChunks(
  audioBlob: Blob,
  chunkDurationSeconds: number = CHUNK_DURATION_SECONDS,
  onProgress?: (status: string) => void,
  mediaRanges?: MediaRange[],
): Promise<{ blob: Blob; startTime: number; index: number; total: number; durationSeconds?: number }[]> {
  const totalSize = audioBlob.size;
  console.log(`[STT 청크] 입력 파일: ${(totalSize / 1024 / 1024).toFixed(1)}MB, type=${audioBlob.type}`);

  // mediaRanges가 없고 4MB 이하면 분할 없이 그대로 사용
  if (!mediaRanges && totalSize <= CHUNK_SIZE_BYTES) {
    console.log('[STT 청크] 4MB 이하 → 원본 파일 직접 전송');
    return [{ blob: audioBlob, startTime: 0, index: 0, total: 1 }];
  }

  onProgress?.('🎵 오디오 디코딩 중...');

  // 대용량 파일은 한번에 arrayBuffer() 실패 → 청크 단위로 읽기
  let arrayBuffer: ArrayBuffer;
  try {
    if (totalSize > 200 * 1024 * 1024) {
      // 200MB 초과: 100MB씩 분할 읽기 후 합치기
      onProgress?.(`🎵 대용량 파일 읽는 중... (${Math.round(totalSize / 1024 / 1024)}MB)`);
      const READ_CHUNK = 100 * 1024 * 1024;
      const parts: ArrayBuffer[] = [];
      for (let offset = 0; offset < totalSize; offset += READ_CHUNK) {
        const slice = audioBlob.slice(offset, Math.min(offset + READ_CHUNK, totalSize));
        parts.push(await slice.arrayBuffer());
        const pct = Math.round(((offset + READ_CHUNK) / totalSize) * 100);
        onProgress?.(`🎵 파일 읽는 중... ${Math.min(pct, 100)}%`);
      }
      // 합치기
      const totalLen = parts.reduce((s, p) => s + p.byteLength, 0);
      const merged = new Uint8Array(totalLen);
      let pos = 0;
      for (const part of parts) {
        merged.set(new Uint8Array(part), pos);
        pos += part.byteLength;
      }
      arrayBuffer = merged.buffer;
      console.log(`[STT 청크] 분할 읽기 완료: ${parts.length}개 × 100MB → ${Math.round(totalLen / 1024 / 1024)}MB`);
    } else {
      arrayBuffer = await audioBlob.arrayBuffer();
    }
  } catch {
    // arrayBuffer 실패 → video element에서 오디오 캡처
    onProgress?.('🎵 대용량 파일 — 비디오에서 오디오 캡처 중...');
    console.log('[STT 청크] arrayBuffer 실패 → captureAudioChunks 사용');
    const chunks = await captureAudioChunks(audioBlob, chunkDurationSeconds, onProgress);
    return chunks;
  }
  const audioCtx = new AudioContext();
  let audioBuffer: AudioBuffer;
  let decodeFailed = false;
  try {
    audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
    console.log(`[STT 청크] AudioContext 디코딩 성공: ${audioBuffer.duration.toFixed(1)}초, ${audioBuffer.sampleRate}Hz, ${audioBuffer.numberOfChannels}ch`);
  } catch (decodeErr) {
    console.warn('[STT 청크] AudioContext 디코딩 실패:', decodeErr);
    decodeFailed = true;
    audioBuffer = null as any;
  }
  audioCtx.close();

  // 디코딩 실패 시 → captureAudioChunks로 폴백 (바이트 분할은 Gemini에서 에러)
  if (decodeFailed) {
    onProgress?.('⚠️ 오디오 디코딩 실패 — 비디오에서 직접 캡처합니다');
    console.log('[STT 청크] 디코딩 실패 → captureAudioChunks 폴백');
    return captureAudioChunks(audioBlob, chunkDurationSeconds, onProgress);
  }

  // ★ 디코딩된 오디오가 무음인지 확인 (첫 번째 채널의 진폭 체크)
  const channelData = audioBuffer.getChannelData(0);
  let maxAmplitude = 0;
  const sampleStep = Math.max(1, Math.floor(channelData.length / 10000)); // 10000개 샘플만 체크
  for (let i = 0; i < channelData.length; i += sampleStep) {
    const abs = Math.abs(channelData[i]);
    if (abs > maxAmplitude) maxAmplitude = abs;
  }
  console.log(`[STT 청크] 디코딩된 오디오 최대 진폭: ${maxAmplitude.toFixed(6)} (0=무음, 1=최대)`);

  // 진폭이 극히 낮으면 (사실상 무음) → 디코딩이 잘못된 것이므로 captureAudioChunks 폴백
  if (maxAmplitude < 0.001) {
    console.warn('[STT 청크] ⚠️ 디코딩 결과가 무음! captureAudioChunks 폴백');
    onProgress?.('⚠️ 오디오 디코딩 결과가 무음 — 비디오에서 직접 캡처합니다');
    return captureAudioChunks(audioBlob, chunkDurationSeconds, onProgress);
  }

  const totalDuration = audioBuffer.duration;
  const numChannels = 1; // 모노로 다운믹스

  // mediaRanges가 있으면 해당 구간만, 없으면 전체
  const ranges = mediaRanges && mediaRanges.length > 0
    ? mergeRanges(mediaRanges).map(r => {
        const clampedEnd = Math.min(totalDuration, r.end);
        if (r.end > totalDuration + 0.5) {
          console.warn(`[STT 청크] ⚠️ mediaRange end(${r.end.toFixed(1)})가 오디오 길이(${totalDuration.toFixed(1)})를 초과 → ${clampedEnd.toFixed(1)}으로 클램핑`);
        }
        return { start: Math.max(0, r.start), end: clampedEnd };
      })
    : [{ start: 0, end: totalDuration }];

  console.log(`[STT 청크] 분석 대상 구간: ${ranges.map(r => `${r.start.toFixed(1)}~${r.end.toFixed(1)}`).join(', ')} (오디오 총 ${totalDuration.toFixed(1)}초)`);

  // 각 range를 chunkDurationSeconds 단위로 분할 (겹침 적용)
  // ★ 마지막 청크가 10초 미만이면 이전 청크에 병합 (Whisper가 짧은 오디오 끝부분을 무시하는 문제 방지)
  const MIN_LAST_CHUNK_DURATION = 10;
  const chunkDefs: { start: number; end: number }[] = [];
  for (const range of ranges) {
    let t = range.start;
    while (t < range.end) {
      const chunkEnd = Math.min(t + chunkDurationSeconds + CHUNK_OVERLAP_SECONDS, range.end);
      chunkDefs.push({ start: t, end: chunkEnd });
      t += chunkDurationSeconds;
    }
    // 마지막 청크가 너무 짧으면 이전 청크에 합침
    if (chunkDefs.length >= 2) {
      const last = chunkDefs[chunkDefs.length - 1];
      if (last.end - last.start < MIN_LAST_CHUNK_DURATION) {
        chunkDefs[chunkDefs.length - 2].end = last.end;
        chunkDefs.pop();
        console.log(`[STT 청크] 마지막 짧은 청크(${(last.end - last.start).toFixed(1)}초) → 이전 청크에 병합`);
      }
    }
  }

  const totalChunks = chunkDefs.length;
  const totalRangeDur = ranges.reduce((s, r) => s + (r.end - r.start), 0);
  onProgress?.(totalChunks === 1
    ? `📦 전체 ${Math.round(totalRangeDur)}초를 단일 청크로 처리 중...`
    : `📦 ${Math.round(totalRangeDur)}초를 ${totalChunks}개 청크로 분할 중 (16kHz 다운샘플링)...`);

  const chunks: { blob: Blob; startTime: number; index: number; total: number; durationSeconds?: number }[] = [];

  for (let i = 0; i < totalChunks; i++) {
    const { start: chunkStart, end: chunkEnd } = chunkDefs[i];
    const chunkDur = chunkEnd - chunkStart;
    if (chunkDur <= 0) continue;

    // 16kHz로 다운샘플링하여 구간 추출 (WAV 크기 ~3배 절약)
    const targetSamples = Math.ceil(chunkDur * TARGET_SAMPLE_RATE);
    const offlineCtx = new OfflineAudioContext(numChannels, targetSamples, TARGET_SAMPLE_RATE);
    const bufferSource = offlineCtx.createBufferSource();
    bufferSource.buffer = audioBuffer;
    bufferSource.connect(offlineCtx.destination);
    bufferSource.start(0, chunkStart, chunkDur);
    const renderedBuffer = await offlineCtx.startRendering();

    // WAV 인코딩
    const wavBlob = audioBufferToWav(renderedBuffer);
    console.log(`[STT 청크] 청크 ${i + 1}/${totalChunks}: ${chunkStart.toFixed(1)}~${chunkEnd.toFixed(1)}초, WAV ${(wavBlob.size / 1024).toFixed(0)}KB`);
    chunks.push({ blob: wavBlob, startTime: chunkStart, index: i, total: totalChunks, durationSeconds: chunkDur });
  }

  onProgress?.(`✅ ${totalChunks}개 WAV 청크 준비 완료`);
  return chunks;
}

/** 겹치는 미디어 구간 병합 */
function mergeRanges(ranges: MediaRange[]): MediaRange[] {
  if (ranges.length <= 1) return ranges;
  const sorted = [...ranges].sort((a, b) => a.start - b.start);
  const merged: MediaRange[] = [{ ...sorted[0] }];
  for (let i = 1; i < sorted.length; i++) {
    const last = merged[merged.length - 1];
    if (sorted[i].start <= last.end + 0.1) {
      last.end = Math.max(last.end, sorted[i].end);
    } else {
      merged.push({ ...sorted[i] });
    }
  }
  return merged;
}

// ============================================
// Whisper API 호출
// ============================================

/**
 * OpenAI Whisper API로 음성 인식 수행 (서버 API Route 사용)
 */
export async function transcribeWithWhisper(
  audioFile: File | Blob,
  options: STTOptions,
  /** 실제 청크 길이(초) — 서버 quota 추적에 사용 */
  durationHint?: number,
): Promise<WhisperResponse> {
  const formData = new FormData();

  // 파일 추가
  if (audioFile instanceof File) {
    formData.append('file', audioFile);
  } else {
    formData.append('file', audioFile, 'audio.wav');
  }

  // 실제 청크 길이를 서버에 전달 (quota 과다 차감 방지)
  formData.append('duration', Math.ceil(durationHint ?? CHUNK_DURATION_SECONDS).toString());
  // 언어 코드 전달 (서버에서 OpenAI에 language 파라미터로 전송)
  if (options.language) {
    formData.append('language', options.language);
  }

  // 서버 API Route 호출 (API 키는 서버에서 관리)
  const response = await fetch('/api/ai/stt', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    if (response.status === 402) {
      throw new Error('PAYMENT_REQUIRED');
    }
    // 상태 코드별 친절한 메시지
    const statusMessages: Record<number, string> = {
      413: '파일 크기가 너무 큽니다 (20MB 이하로 시도해주세요)',
      504: '서버 응답 시간 초과 — 영상을 짧게 잘라 다시 시도해주세요',
      503: '서버가 일시적으로 과부하 상태입니다. 잠시 후 다시 시도해주세요',
      500: '서버 내부 오류가 발생했습니다. 잠시 후 다시 시도해주세요',
    };
    const bodyText = await response.text().catch(() => '');
    console.error('[STT] 응답 오류:', response.status, bodyText);
    let detail = '';
    try {
      const parsed = JSON.parse(bodyText);
      detail = parsed.error || parsed.message || '';
    } catch {
      detail = bodyText;
    }
    const fallback = statusMessages[response.status] || `HTTP ${response.status} 오류`;
    throw new Error(`음성 인식 오류: ${detail || fallback}`);
  }

  const bodyText2 = await response.text();
  console.log('[STT] 응답 본문 (앞 200자):', bodyText2.slice(0, 200));
  let data: any;
  try {
    data = JSON.parse(bodyText2);
  } catch {
    throw new Error(`음성 인식 오류: 서버 응답을 파싱할 수 없습니다 (${bodyText2.slice(0, 100)})`);
  }
  if (data.error) {
    if (data.error.includes('Payment Required')) {
      throw new Error('PAYMENT_REQUIRED');
    }
    throw new Error(`음성 인식 오류: ${data.error}`);
  }

  return data;
}

/**
 * Gemini API로 음성 인식 수행 (서버 API Route 사용)
 * Whisper와 동일한 WhisperResponse 형식을 반환
 */
export async function transcribeWithGemini(
  audioFile: File | Blob,
  options: STTOptions,
  durationHint?: number,
): Promise<WhisperResponse> {
  const formData = new FormData();

  if (audioFile instanceof File) {
    formData.append('file', audioFile);
  } else {
    formData.append('file', audioFile, 'audio.wav');
  }

  formData.append('duration', Math.ceil(durationHint ?? CHUNK_DURATION_SECONDS).toString());
  if (options.language) {
    formData.append('language', options.language);
  }

  const response = await fetch('/api/ai/stt-gemini', {
    method: 'POST',
    body: formData,
  });

  if (!response.ok) {
    if (response.status === 402) {
      throw new Error('PAYMENT_REQUIRED');
    }
    const bodyText = await response.text().catch(() => '');
    console.error('[Gemini STT] 응답 오류:', response.status, bodyText);
    let detail = '';
    try {
      const parsed = JSON.parse(bodyText);
      detail = parsed.error || parsed.message || '';
    } catch {
      detail = bodyText;
    }
    throw new Error(`Gemini 음성 인식 오류: ${detail || `HTTP ${response.status}`}`);
  }

  const bodyText = await response.text();
  console.log('[Gemini STT] 응답 본문 (앞 200자):', bodyText.slice(0, 200));
  let data: any;
  try {
    data = JSON.parse(bodyText);
  } catch {
    throw new Error(`Gemini 음성 인식 오류: 서버 응답 파싱 실패`);
  }
  if (data.error) {
    if (data.error.includes('Payment Required')) {
      throw new Error('PAYMENT_REQUIRED');
    }
    throw new Error(`Gemini 음성 인식 오류: ${data.error}`);
  }

  return data;
}

// ============================================
// 결과 변환 및 병합
// ============================================

/**
 * Whisper 타임스탬프 보정값 (초)
 * Whisper는 실제 음성 시작보다 ~200ms 늦게 타임스탬프를 잡는 경향이 있음
 * 음수 = 자막을 더 일찍 표시
 */
const WHISPER_TIMING_OFFSET = -0.1;

/**
 * Whisper 환청(hallucination) 필터
 * 무음/배경음악 구간에서 Whisper가 자주 만들어내는 문구들
 * 한국어 Whisper는 특히 배경음악 구간에서 뉴스 앵커 멘트, 유튜브 인사말,
 * 또는 완전히 무관한 내용을 지어내는 경향이 강함
 */
const HALLUCINATION_PHRASES = new Set([
  // 유튜브/방송 인사말 (실제 대화에선 안 나오는 문구만)
  '구독과 좋아요', '좋아요와 구독',
  '구독과 좋아요 부탁드립니다',
  '구독 좋아요 알림설정', '좋아요 구독 알림설정',
  '영상이 도움이 되셨다면', '채널 구독 부탁드립니다',
  // 방송사/뉴스 (실제 대화 아닌 환청)
  'MBC 뉴스데스크', 'KBS 뉴스9',
  // 영어 환청
  'Thank you for watching', 'Please subscribe', 'Like and subscribe',
  // 자막 관련
  '자막 제공', '한글자막', '자막 제작', '자막 협찬',
  // Whisper가 무음에서 자주 만드는 문장
  '시청해주셔서 감사합니다', '시청해 주셔서 감사합니다',
  '오늘도 시청해주셔서 감사합니다',
  '다음 영상에서 만나요', '다음에 또 만나요',
]);

/**
 * 환청 패턴 (정규식) — 부분 일치 검사용
 * Whisper가 반복적으로 생성하는 패턴
 */
const HALLUCINATION_PATTERNS = [
  /^(.{1,4})\1{2,}$/,           // 같은 짧은 문구가 3번 이상 반복 ("네네네네", "아아아아")
  /구독.*좋아요|좋아요.*구독/,    // 구독+좋아요 조합
  /시청.*감사|감사.*시청/,        // 시청+감사 조합
  /^[.!?,\s]+$/,                 // 구두점만으로 이루어진 텍스트
  /^\s*$/,                       // 빈 텍스트
];

/** 세그먼트가 환청인지 판별 — 실제 음성을 최대한 보존하도록 관대하게 설정 */
function isHallucination(segment: WhisperSegment): boolean {
  const trimmed = segment.text.trim().replace(/[.!?,。？！，\s]/g, '');
  // 빈 텍스트
  if (trimmed.length === 0) return true;
  // 1) no_speech_prob: 90% 이상 확실히 음성 없음일 때만 필터
  if (segment.no_speech_prob >= 0.9) return true;
  // 2) 알려진 환청 문구와 정확히 일치
  if (HALLUCINATION_PHRASES.has(trimmed)) return true;
  // 3) 환청 패턴 (정규식) 부분 일치
  if (HALLUCINATION_PATTERNS.some(p => p.test(trimmed))) return true;
  // 4) 압축률이 극단적으로 높고 no_speech_prob도 높은 세그먼트 (반복 텍스트)
  // 압축률만으로 필터하면 한국어에서 정상 반복 발화("네 네 알겠습니다")도 걸림
  if (segment.compression_ratio > 4.0 && segment.no_speech_prob > 0.3) return true;
  // 5) no_speech_prob + compression + logprob 모두 나쁠 때만 (복합 조건)
  if (segment.no_speech_prob > 0.7 && segment.compression_ratio > 2.5 && segment.avg_logprob < -1.5) return true;
  // 6) 30초 이상 세그먼트인데 no_speech_prob가 매우 높은 경우
  if (segment.end - segment.start > 30 && segment.no_speech_prob > 0.5) return true;
  return false;
}

/**
 * STT 응답을 STTResult 형식으로 변환
 * @param provider Gemini는 환청 필터/타이밍 오프셋을 건너뜀
 */
export function convertWhisperToSTTResult(
  whisperResponse: WhisperResponse,
  timeOffset: number = 0,
  provider: STTProvider = 'whisper',
): STTResult {
  const words: WordTimestamp[] = [];
  const isGemini = provider === 'gemini';

  // Gemini도 약간 늦게 잡는 경향 → -0.3s 보정 (captureStream 지연 포함)
  const GEMINI_TIMING_OFFSET = -0.3;
  const timingOffset = isGemini ? GEMINI_TIMING_OFFSET : WHISPER_TIMING_OFFSET;

  // 디버그: 응답 요약
  const totalSegments = whisperResponse.segments?.length ?? 0;
  const totalWords = whisperResponse.words?.length ?? 0;
  console.log(`[STT 변환] ${provider} 응답: text="${whisperResponse.text?.slice(0, 80)}...", segments=${totalSegments}, words=${totalWords}, duration=${whisperResponse.duration}초, offset=${timeOffset}초`);

  // 환청 세그먼트 시간 구간 수집 (Gemini는 환청이 거의 없으므로 스킵)
  const hallucinationRanges: { start: number; end: number }[] = [];
  if (!isGemini && whisperResponse.segments) {
    let filteredCount = 0;
    for (const seg of whisperResponse.segments) {
      if (isHallucination(seg)) {
        hallucinationRanges.push({ start: seg.start, end: seg.end });
        filteredCount++;
        console.log(`[STT 필터] 환청 제거: "${seg.text.trim()}" (no_speech=${seg.no_speech_prob.toFixed(3)}, logprob=${seg.avg_logprob.toFixed(3)}, compress=${seg.compression_ratio.toFixed(2)})`);
      }
    }
    console.log(`[STT 필터] 환청 필터: ${totalSegments}개 중 ${filteredCount}개 제거, ${totalSegments - filteredCount}개 유지`);
  }

  /** 특정 단어가 환청 구간에 속하는지 확인 — 단어의 중간점(midpoint) 기준으로 판단하여 경계 단어 보존 */
  const isWordInHallucinationRange = (wordStart: number, wordEnd: number) => {
    const mid = (wordStart + wordEnd) / 2;
    return hallucinationRanges.some(r => mid >= r.start && mid <= r.end);
  };

  // 단어별 타임스탬프가 있는 경우
  let hallucinationDropCount = 0;
  if (whisperResponse.words && whisperResponse.words.length > 0) {
    for (const word of whisperResponse.words) {
      // 환청 구간의 단어는 제외 (Gemini는 스킵)
      if (!isGemini && isWordInHallucinationRange(word.start, word.end)) { hallucinationDropCount++; continue; }
      words.push({
        word: word.word.trim(),
        startTime: Math.max(0, word.start + timeOffset + timingOffset),
        endTime: word.end + timeOffset + timingOffset,
        confidence: 1,
      });
    }
  }
  // 세그먼트만 있는 경우
  else if (whisperResponse.segments && whisperResponse.segments.length > 0) {
    for (const segment of whisperResponse.segments) {
      if (!isGemini && isHallucination(segment)) continue;
      const segmentWords = segment.text.trim().split(/\s+/).filter(w => w.length > 0);
      const segmentDuration = segment.end - segment.start;
      const wordDuration = segmentDuration / segmentWords.length;

      segmentWords.forEach((word, index) => {
        words.push({
          word,
          startTime: Math.max(0, segment.start + timeOffset + (index * wordDuration) + timingOffset),
          endTime: segment.start + timeOffset + ((index + 1) * wordDuration) + timingOffset,
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
        startTime: Math.max(0, timeOffset + index * wordDuration + timingOffset),
        endTime: timeOffset + (index + 1) * wordDuration + timingOffset,
        confidence: 1,
      });
    });
  }

  // 세그먼트(문장 단위)를 sentences로 전달 — Gemini는 환청 필터 스킵
  const sentences = whisperResponse.segments
    ?.filter(s => s.text.trim().length > 0 && (isGemini || !isHallucination(s)))
    .map(s => ({
      text: s.text.trim(),
      startTime: Math.max(0, s.start + timeOffset + timingOffset),
      endTime: s.end + timeOffset + timingOffset,
    }));

  const result: STTResult = {
    fullText: whisperResponse.text,
    words,
    sentences: sentences && sentences.length > 0 ? sentences : undefined,
    duration: whisperResponse.duration,
    language: whisperResponse.language,
  };
  console.log(`[STT 변환] 최종 결과: words=${words.length}개 (환청 제거: ${hallucinationDropCount}개), sentences=${sentences?.length ?? 0}개, fullText="${whisperResponse.text?.slice(0, 60)}..."`);
  return result;
}

/**
 * 여러 청크의 STT 결과 병합 (겹침 구간 중복 제거)
 */
export function mergeSTTResults(results: STTResult[]): STTResult {
  if (results.length === 0) {
    return { fullText: '', words: [], duration: 0 };
  }

  if (results.length === 1) {
    return results[0];
  }

  // 모든 단어를 시간순 정렬 후 중복 제거
  const allWords = results.flatMap(r => r.words);
  allWords.sort((a, b) => a.startTime - b.startTime);

  // 겹침 구간의 중복 단어 제거: 시간이 거의 같고(0.3초 이내) 텍스트가 같으면 중복
  const deduped: WordTimestamp[] = [];
  for (const w of allWords) {
    const last = deduped[deduped.length - 1];
    if (last && Math.abs(w.startTime - last.startTime) < 0.3 && w.word === last.word) {
      // 중복 — 더 높은 confidence 값을 유지
      if ((w.confidence ?? 0) > (last.confidence ?? 0)) {
        deduped[deduped.length - 1] = w;
      }
      continue;
    }
    deduped.push(w);
  }

  // 청크 경계에서 잘린 단어 조각 병합
  // 예: ["무", "리인데"] → ["무리인데"]
  // ★ 한국어는 1글자 독립 단어가 많으므로 (나, 해, 줘, 좀, 왜 등),
  //    시간 갭이 거의 0이고 (0.05초 미만) 한쪽이 1글자일 때만 합침
  const cleaned: WordTimestamp[] = [];
  for (const w of deduped) {
    const last = cleaned[cleaned.length - 1];
    if (last) {
      const gap = w.startTime - last.endTime;
      const lastLen = last.word.length;
      const wLen = w.word.length;
      // 시간 갭이 0.05초 미만이고, 한쪽이 1글자 조각이면 합침 (청크 경계에서만 발생)
      if (gap < 0.05 && gap >= -0.05 && (lastLen === 1 || wLen === 1)) {
        cleaned[cleaned.length - 1] = {
          word: last.word + w.word,
          startTime: last.startTime,
          endTime: w.endTime,
          confidence: Math.min(last.confidence ?? 1, w.confidence ?? 1),
        };
        continue;
      }
    }
    cleaned.push(w);
  }

  // sentences도 병합 (시간순 정렬)
  const allSentences = results
    .flatMap(r => r.sentences ?? [])
    .sort((a, b) => a.startTime - b.startTime);

  // 겹침 구간 중복 문장 제거 (시작 시간이 0.3초 이내이고 텍스트가 같으면 중복)
  const dedupedSentences: typeof allSentences = [];
  for (const s of allSentences) {
    const last = dedupedSentences[dedupedSentences.length - 1];
    if (last && Math.abs(s.startTime - last.startTime) < 0.3 && s.text === last.text) continue;
    dedupedSentences.push(s);
  }

  // 청크 경계에서 잘린 문장 병합
  // 조건: 이전 문장의 endTime과 다음 문장의 startTime이 CHUNK_OVERLAP 범위 내에서 겹치면
  // → 텍스트 겹침 여부를 기준으로 합칠지 결정
  const joinedSentences: typeof dedupedSentences = [];
  for (const s of dedupedSentences) {
    const last = joinedSentences[joinedSentences.length - 1];
    if (last) {
      const timeOverlap = last.endTime - s.startTime;
      // 청크 겹침 구간(~3초) 이내인지 확인
      if (timeOverlap > -0.5 && timeOverlap < CHUNK_OVERLAP_SECONDS + 1) {
        // 실제 텍스트 겹침이 있는지 확인 (글자/단어가 겹치면 잘린 것)
        const lastText = last.text.trim();
        const sText = s.text.trim();
        // 접미사-접두사 겹침 확인
        let hasTextOverlap = false;
        for (let len = 1; len <= Math.min(lastText.length, sText.length, 10); len++) {
          if (lastText.slice(-len) === sText.slice(0, len)) {
            hasTextOverlap = true;
            break;
          }
        }
        // 마지막 단어의 일부가 다음 문장 첫 단어의 시작과 겹치는지 (글자 단위)
        const lastWords = lastText.split(/\s/);
        const sWords = sText.split(/\s/);
        const lastWord = lastWords[lastWords.length - 1];
        const firstWord = sWords[0];
        if (firstWord && lastWord && firstWord.startsWith(lastWord.slice(-1)) && lastWord.length <= 3) {
          hasTextOverlap = true;
        }
        // 문장 부호(.?!)로 확실히 끝나면 합치지 않음 (한국어 종결어미 '다','요' 등은 무시)
        const endsWithPunctuation = /[.?!。？！]$/.test(lastText);

        if (hasTextOverlap || (!endsWithPunctuation && timeOverlap > 0)) {
          const merged = removeSentenceOverlap(last.text, s.text);
          joinedSentences[joinedSentences.length - 1] = {
            text: merged,
            startTime: last.startTime,
            endTime: s.endTime,
          };
          continue;
        }
      }
    }
    joinedSentences.push({ ...s });
  }

  // joinedSentences를 사용
  const finalSentences = joinedSentences;

  console.log(`[STT 병합] 단어: 전체 ${allWords.length}개 → 중복 제거 ${deduped.length}개 → 조각 병합 ${cleaned.length}개`);
  console.log(`[STT 병합] 문장: 전체 ${allSentences.length}개 → 중복 제거 ${dedupedSentences.length}개 → 경계 병합 ${finalSentences.length}개`);

  const merged: STTResult = {
    fullText: cleaned.map(w => w.word).join(' '),
    words: cleaned,
    sentences: finalSentences.length > 0 ? finalSentences : undefined,
    duration: Math.max(...results.map(r => r.duration + (r.words[0]?.startTime ?? 0))),
    language: results[0].language,
  };

  return merged;
}

// ============================================
// STT 결과 캐시 (재시도 시 완료된 청크 건너뛰기)
// ============================================
const _sttChunkCache: Map<string, STTResult> = new Map();

function getChunkCacheKey(chunkIndex: number, startTime: number): string {
  return `chunk_${chunkIndex}_${startTime.toFixed(2)}`;
}

// ============================================
// 통합 함수 (대용량 지원 + 이어서 분석)
// ============================================

/**
 * 비디오 파일에서 음성 인식 수행 (전체 파이프라인, 대용량 지원)
 * 이전에 성공한 청크는 캐시에서 재사용 — 에러 후 재시도 시 처음부터 다시 하지 않음
 */
export async function transcribeVideo(
  videoFile: File,
  apiKey: string,
  onProgress?: (status: string) => void,
  mediaRanges?: MediaRange[],
  provider: STTProvider = 'gemini',
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
      audioBlob = videoFile;
    }

    // 3. 청크 분할 (mediaRanges가 있으면 해당 구간만 — 토큰 절약)
    onProgress?.('📦 파일 처리 중...');
    const chunks = await splitAudioIntoChunks(audioBlob, CHUNK_DURATION_SECONDS, onProgress, mediaRanges);

    // 4. 각 청크에 대해 STT API 호출 (캐시된 결과 재사용)
    const providerLabel = provider === 'gemini' ? 'Gemini' : 'Whisper';
    console.log(`[STT] 엔진: ${providerLabel}`);
    const results: STTResult[] = new Array(chunks.length);

    // 캐시에서 이미 완료된 청크 복원
    let cachedCount = 0;
    for (const chunk of chunks) {
      const key = getChunkCacheKey(chunk.index, chunk.startTime);
      const cached = _sttChunkCache.get(key);
      if (cached) {
        results[chunk.index] = cached;
        cachedCount++;
      }
    }
    if (cachedCount > 0) {
      console.log(`[STT] 캐시에서 ${cachedCount}/${chunks.length}개 청크 복원 — 나머지만 분석`);
      onProgress?.(`♻️ ${cachedCount}/${chunks.length}개 청크 캐시 복원 — 나머지 분석 중...`);
    }

    // Gemini는 동시 요청 수를 줄임 (rate limit이 더 엄격)
    const concurrent = provider === 'gemini' ? Math.min(MAX_CONCURRENT, 2) : MAX_CONCURRENT;

    // 미완료 청크만 필터
    const pendingChunks = chunks.filter(c => results[c.index] == null);
    const totalSec = Math.round(chunks.reduce((sum, c) => sum + (c.durationSeconds ?? CHUNK_DURATION_SECONDS), 0));

    for (let batchStart = 0; batchStart < pendingChunks.length; batchStart += concurrent) {
      const batch = pendingChunks.slice(batchStart, batchStart + concurrent);
      const doneSoFar = cachedCount + batchStart;
      const pct = Math.round((doneSoFar / chunks.length) * 100);
      // 현재 분석 중인 시간 구간 표시
      const currentChunk = batch[0];
      const chunkStart = currentChunk?.startTime ?? 0;
      const chunkEnd = chunkStart + (currentChunk?.durationSeconds ?? CHUNK_DURATION_SECONDS);
      const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
      onProgress?.(`🎤 음성 인식 ${pct}% — ${fmtTime(chunkStart)}~${fmtTime(chunkEnd)} / 총 ${fmtTime(totalSec)}`);

      await Promise.all(
        batch.map(async (chunk) => {
          try {
            const sttFn = provider === 'gemini' ? transcribeWithGemini : transcribeWithWhisper;
            const whisperResponse = await sttFn(chunk.blob, {
              apiKey,
              language: 'ko',
              responseFormat: 'verbose_json',
              timestampGranularities: ['word', 'segment'],
            }, chunk.durationSeconds);
            const result = convertWhisperToSTTResult(whisperResponse, chunk.startTime, provider);
            results[chunk.index] = result;
            // 성공한 청크를 캐시에 저장
            _sttChunkCache.set(getChunkCacheKey(chunk.index, chunk.startTime), result);
          } catch (chunkErr: any) {
            console.warn(`[STT] 청크 ${chunk.index + 1}/${chunks.length} 실패 (건너뜀):`, chunkErr.message);
          }
        })
      );

      // API 레이트 리밋 방지 (배치 사이 딜레이 — Gemini는 더 길게)
      if (batchStart + concurrent < pendingChunks.length) {
        const delay = provider === 'gemini' ? 1000 : 500;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // 5. 결과 병합 (실패한 청크 제외)
    const validResults = results.filter(r => r != null);
    const failedCount = chunks.length - validResults.length;
    if (failedCount > 0) {
      console.warn(`[STT] ${failedCount}/${chunks.length}개 청크 실패 — 성공한 ${validResults.length}개로 진행`);
      onProgress?.(`⚠️ ${failedCount}개 구간 실패, ${validResults.length}개 성공 — 병합 중...`);
    } else {
      onProgress?.('🔗 결과 병합 중...');
    }
    if (validResults.length === 0) {
      throw new Error('모든 음성 인식 청크가 실패했습니다');
    }
    const mergedResult = mergeSTTResults(validResults);

    // ★ duration을 mediaRanges의 실제 끝까지 보정 (클립 end 지점까지 분석 보장)
    if (mediaRanges && mediaRanges.length > 0) {
      const rangeEnd = Math.max(...mediaRanges.map(r => r.end));
      if (rangeEnd > mergedResult.duration) {
        mergedResult.duration = rangeEnd;
      }
    }

    console.log(`[STT 최종] 병합 결과: words=${mergedResult.words.length}개, sentences=${mergedResult.sentences?.length ?? 0}개, duration=${mergedResult.duration}초`);
    console.log(`[STT 최종] fullText (앞 200자): "${mergedResult.fullText.slice(0, 200)}"`);

    // ★ 결과가 비어있으면 경고 (디버깅용)
    if (mergedResult.words.length === 0) {
      console.warn('[STT 최종] ⚠️ 음성 인식 결과가 비어있습니다! 오디오에 음성이 있는지 확인하세요.');
      onProgress?.('⚠️ 음성을 감지하지 못했습니다. 오디오 트랙을 확인해주세요.');
    } else {
      onProgress?.(`✅ 음성 인식 완료! (${mergedResult.words.length}개 단어 감지)`);
    }
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
