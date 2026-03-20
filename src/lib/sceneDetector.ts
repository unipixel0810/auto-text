/**
 * 장면 전환 감지 — Canvas 프레임 비교 (클라이언트 전용, API 토큰 불필요)
 *
 * 2-pass 알고리즘:
 * 1단계: 전체 프레임 RMSE 수집
 * 2단계: 중앙값 + 표준편차 기반으로 "통계적 이상치"만 장면 전환으로 판정
 *
 * → 움직임 많은 영상도, 정적 영상도 자동 적응
 */

const SAMPLE_INTERVAL = 0.5;
const THUMB_W = 160;
const THUMB_H = 90;
const MIN_SCENE_GAP = 2.0;  // 최소 장면 간격 (초)

function frameRMSE(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let sum = 0;
  const len = a.length;
  for (let i = 0; i < len; i += 4) {
    const dr = a[i] - b[i];
    const dg = a[i + 1] - b[i + 1];
    const db = a[i + 2] - b[i + 2];
    sum += dr * dr + dg * dg + db * db;
  }
  return Math.sqrt(sum / (len / 4 * 3));
}

function median(arr: number[]): number {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function stddev(arr: number[], avg: number): number {
  const variance = arr.reduce((s, v) => s + (v - avg) ** 2, 0) / arr.length;
  return Math.sqrt(variance);
}

export async function detectSceneChanges(
  videoUrl: string,
  duration: number,
  trimStart: number = 0,
): Promise<number[]> {
  // ====== 1단계: 전체 프레임 RMSE 수집 ======
  const allFrameData = await collectFrameRMSE(videoUrl, duration, trimStart);

  if (allFrameData.length === 0) return [];

  const rmseValues = allFrameData.map(f => f.rmse);
  const med = median(rmseValues);
  const avg = rmseValues.reduce((s, v) => s + v, 0) / rmseValues.length;
  const sd = stddev(rmseValues, avg);

  // 동적 임계값: 중앙값 + 1.5 * 표준편차 (최소 60)
  const dynamicThreshold = Math.max(60, med + 1.5 * sd);

  console.log(`[SceneDetect] 통계: 중앙값=${med.toFixed(1)}, 평균=${avg.toFixed(1)}, 표준편차=${sd.toFixed(1)}, 임계값=${dynamicThreshold.toFixed(1)}`);

  // ====== 2단계: 임계값 초과 프레임만 장면 전환 ======
  const sceneChanges: number[] = [];
  let lastSceneTime = -MIN_SCENE_GAP * 2;

  for (const frame of allFrameData) {
    if (frame.rmse > dynamicThreshold && frame.time - lastSceneTime >= MIN_SCENE_GAP) {
      sceneChanges.push(frame.time);
      lastSceneTime = frame.time;
    }
  }

  // 디버그 로그
  const sorted = [...allFrameData].sort((a, b) => b.rmse - a.rmse);
  console.log(`[SceneDetect] 완료 — ${sceneChanges.length}개 장면 전환 감지 (총 ${allFrameData.length}프레임)`);
  console.log(`[SceneDetect] 상위 10:`, sorted.slice(0, 10).map(r => `${r.time.toFixed(1)}s=${r.rmse.toFixed(1)}`).join(', '));
  console.log(`[SceneDetect] 감지된 위치:`, sceneChanges.map(t => `${t.toFixed(1)}s`).join(', '));

  return sceneChanges;
}

/** 1단계: 비디오 전체를 스캔하여 프레임 간 RMSE 배열 수집 */
function collectFrameRMSE(
  videoUrl: string,
  duration: number,
  trimStart: number,
): Promise<{ time: number; rmse: number }[]> {
  return new Promise((resolve, reject) => {
    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.preload = 'auto';

    const canvas = document.createElement('canvas');
    canvas.width = THUMB_W;
    canvas.height = THUMB_H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) { reject(new Error('Canvas 2D context not available')); return; }

    const results: { time: number; rmse: number }[] = [];
    let prevFrame: Uint8ClampedArray | null = null;
    let currentTime = trimStart;
    const endTime = trimStart + duration;

    const captureFrame = () => {
      ctx.drawImage(video, 0, 0, THUMB_W, THUMB_H);
      return ctx.getImageData(0, 0, THUMB_W, THUMB_H).data;
    };

    const processFrame = () => {
      const frame = captureFrame();
      const timelinePos = currentTime - trimStart;

      if (prevFrame) {
        const rmse = frameRMSE(prevFrame, frame);
        results.push({ time: timelinePos, rmse });
      }

      prevFrame = frame;
      currentTime += SAMPLE_INTERVAL;

      if (currentTime < endTime) {
        video.currentTime = currentTime;
      } else {
        cleanup();
        resolve(results);
      }
    };

    const onSeeked = () => processFrame();
    const onError = () => { cleanup(); reject(new Error('Video load error')); };

    const cleanup = () => {
      video.removeEventListener('seeked', onSeeked);
      video.removeEventListener('error', onError);
      video.src = '';
      video.load();
    };

    video.addEventListener('seeked', onSeeked);
    video.addEventListener('error', onError);
    video.addEventListener('loadeddata', () => {
      video.currentTime = currentTime;
    }, { once: true });

    video.src = videoUrl;
  });
}
