/**
 * IndexedDB storage for User-Owned Background Music tracks.
 * Safely persists audio Blobs locally without localStorage quota limits.
 */

const DB_NAME = 'novachat_music_db';
const DB_VERSION = 1;
const STORE_NAME = 'user_tracks';

export interface StoredAudioRecord {
  id: string;
  name: string;
  blob: Blob;
  mimeType: string;
  size: number;
  createdAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      return reject(new Error('IndexedDB is not supported in this environment.'));
    }

    const req = window.indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open music database'));
    req.onblocked = () => reject(new Error('IndexedDB access is blocked.'));
  });
}

/**
 * Save user-uploaded audio track into IndexedDB
 */
export async function saveUserAudioTrack(record: StoredAudioRecord): Promise<void> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(record);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error('Failed to save audio file to IndexedDB'));
      tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
    });
  } catch (err) {
    console.warn('Could not persist audio file in IndexedDB:', err);
    throw err;
  }
}

/**
 * Retrieve all user-uploaded audio tracks from IndexedDB
 */
export async function getAllUserAudioTracks(): Promise<StoredAudioRecord[]> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();

      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error || new Error('Failed to retrieve audio tracks'));
    });
  } catch (err) {
    console.warn('Could not read audio tracks from IndexedDB:', err);
    return [];
  }
}

/**
 * Delete a user track from IndexedDB
 */
export async function deleteUserAudioTrack(id: string): Promise<void> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);

      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error || new Error('Failed to delete track from IndexedDB'));
    });
  } catch (err) {
    console.warn('Could not delete audio track from IndexedDB:', err);
  }
}
