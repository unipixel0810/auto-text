/**
 * IndexedDB 기반 미디어 파일 저장소
 * 페이지 이동/새로고침 후에도 미디어 파일(Blob)을 복원할 수 있도록 저장합니다.
 */

const DB_NAME = 'autotext_media';
const DB_VERSION = 1;
const STORE_NAME = 'blobs';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** 미디어 Blob 저장 (key = projectId:clipUrl 등 고유 식별자) */
export async function saveMediaBlob(key: string, blob: Blob, name: string, mimeType: string): Promise<void> {
  // 500MB 초과 파일은 IndexedDB 저장 건너뜀 (저장 불가 + NotReadableError 방지)
  if (blob.size > 500 * 1024 * 1024) return;
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put({ key, blob, name, mimeType, savedAt: Date.now() });
    req.onerror = (e) => e.preventDefault();
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = (e) => { e.preventDefault(); reject(tx.error); };
    });
    db.close();
  } catch {
    // 저장 실패 무시
  }
}

/** 미디어 Blob 불러오기 → 새 Blob URL 생성 */
export async function loadMediaBlob(key: string): Promise<{ url: string; file: File; name: string } | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const result = await new Promise<any>((resolve, reject) => {
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!result || !result.blob) return null;
    const url = URL.createObjectURL(result.blob);
    const file = new File([result.blob], result.name, { type: result.mimeType });
    return { url, file, name: result.name };
  } catch (e) {
    console.warn('[MediaStorage] Failed to load blob:', e);
    return null;
  }
}

/** 프로젝트의 모든 미디어 키 목록 불러오기 */
export async function listMediaKeys(projectPrefix: string): Promise<string[]> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const keys: string[] = [];
    await new Promise<void>((resolve, reject) => {
      const req = store.openCursor();
      req.onsuccess = () => {
        const cursor = req.result;
        if (cursor) {
          if (typeof cursor.key === 'string' && cursor.key.startsWith(projectPrefix)) {
            keys.push(cursor.key);
          }
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = () => reject(req.error);
    });
    db.close();
    return keys;
  } catch (e) {
    console.warn('[MediaStorage] Failed to list keys:', e);
    return [];
  }
}

/** 특정 프로젝트의 미디어 모두 삭제 */
export async function clearProjectMedia(projectPrefix: string): Promise<void> {
  try {
    const keys = await listMediaKeys(projectPrefix);
    if (keys.length === 0) return;
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    for (const key of keys) {
      store.delete(key);
    }
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (e) {
    console.warn('[MediaStorage] Failed to clear project media:', e);
  }
}
