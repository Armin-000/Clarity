const DB_NAME = 'clarity-accessibility';
const DB_VERSION = 1;
const STORE = 'state';
const CURRENT_KEY = 'current';
const SESSIONS_KEY = 'sessions';
const LEGACY_CURRENT = 'clarity.accessibility.current.v3';
const LEGACY_SESSIONS = 'clarity.accessibility.sessions.v3';

let dbPromise = null;
let saveTimer = null;
let pendingCurrent = null;
let pendingSessions = null;

function cloneFallback(value) {
  try { return structuredClone(value); } catch { return JSON.parse(JSON.stringify(value)); }
}

function localFallbackLoad() {
  try {
    const current = JSON.parse(localStorage.getItem(LEGACY_CURRENT) || 'null');
    const sessions = JSON.parse(localStorage.getItem(LEGACY_SESSIONS) || 'null');
    return { current, sessions: Array.isArray(sessions) ? sessions : null, backend: 'localstorage' };
  } catch {
    return { current: null, sessions: null };
  }
}

function localFallbackSave(current, sessions) {
  try {
    localStorage.setItem(LEGACY_CURRENT, JSON.stringify(current));
    const archive = Array.isArray(sessions) ? sessions.filter(item => item?.id !== current?.id) : [];
    localStorage.setItem(LEGACY_SESSIONS, JSON.stringify(archive));
    return true;
  } catch {
    return false;
  }
}

function openDb() {
  if (!('indexedDB' in globalThis)) return Promise.resolve(null);
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('IndexedDB nije dostupan.'));
  }).catch(error => {
    console.warn('[Clarity] IndexedDB nije dostupan; koristim rezervnu pohranu:', error);
    return null;
  });
  return dbPromise;
}

function txDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error('Pohrana nije uspjela.'));
    transaction.onabort = () => reject(transaction.error || new Error('Pohrana je prekinuta.'));
  });
}

export async function loadDurableState() {
  const db = await openDb();
  if (!db) return localFallbackLoad();
  const transaction = db.transaction(STORE, 'readonly');
  const store = transaction.objectStore(STORE);
  const currentRequest = store.get(CURRENT_KEY);
  const sessionsRequest = store.get(SESSIONS_KEY);
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve({
      current: currentRequest.result || null,
      sessions: Array.isArray(sessionsRequest.result) ? sessionsRequest.result : null,
      backend: 'indexeddb'
    });
    transaction.onerror = () => reject(transaction.error || new Error('Čitanje pohrane nije uspjelo.'));
    transaction.onabort = () => reject(transaction.error || new Error('Čitanje pohrane je prekinuto.'));
  });
}

export async function flushDurableState(current, sessions) {
  const db = await openDb();
  if (!db) return localFallbackSave(current, sessions);
  const transaction = db.transaction(STORE, 'readwrite');
  const store = transaction.objectStore(STORE);
  const archive = Array.isArray(sessions) ? sessions.filter(item => item?.id !== current?.id) : [];
  store.put(current, CURRENT_KEY);
  store.put(archive, SESSIONS_KEY);
  await txDone(transaction);
  return true;
}

export function queueDurableState(current, sessions, delay = 180) {
  pendingCurrent = current;
  pendingSessions = sessions;
  if (saveTimer) return;
  saveTimer = globalThis.setTimeout(async () => {
    saveTimer = null;
    const nextCurrent = pendingCurrent;
    const nextSessions = pendingSessions;
    pendingCurrent = null;
    pendingSessions = null;
    try {
      const ok = await flushDurableState(nextCurrent, nextSessions);
      if (!ok) console.warn('[Clarity] Pohrana razgovora nije uspjela; prostor preglednika možda je pun.');
    } catch (error) {
      console.warn('[Clarity] Razgovor nije spremljen:', error);
      localFallbackSave(cloneFallback(nextCurrent), cloneFallback(nextSessions));
    }
    if (pendingCurrent || pendingSessions) queueDurableState(pendingCurrent, pendingSessions, delay);
  }, Math.max(60, delay));
}

export async function clearDurableState() {
  const db = await openDb();
  if (!db) {
    try { localStorage.removeItem(LEGACY_CURRENT); localStorage.removeItem(LEGACY_SESSIONS); } catch {}
    return;
  }
  const transaction = db.transaction(STORE, 'readwrite');
  transaction.objectStore(STORE).clear();
  await txDone(transaction);
}
