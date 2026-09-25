// Clarity durable storage is bundled here so native WebViews do not depend on ES-module file loading.
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

async function loadDurableState() {
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

async function flushDurableState(current, sessions) {
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

function queueDurableState(current, sessions, delay = 180) {
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

async function clearDurableState() {
  const db = await openDb();
  if (!db) {
    try { localStorage.removeItem(LEGACY_CURRENT); localStorage.removeItem(LEGACY_SESSIONS); } catch {}
    return;
  }
  const transaction = db.transaction(STORE, 'readwrite');
  transaction.objectStore(STORE).clear();
  await txDone(transaction);
}


(() => {
  'use strict';
  // Clarity 6.0.0 Native System Speech — jedan ClaritySpeech API iznad Android/Apple/Windows sistemskog diktiranja i web fallbacka.

  const SpeechRecognition = window.ClaritySpeechRecognition || window.SpeechRecognition || window.webkitSpeechRecognition;
  const SPEECH_BACKEND = window.ClaritySpeechBridge?.kind || (SpeechRecognition ? 'web' : 'none');
  const IS_IOS_WEBKIT = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const MOBILE_STOP_RELEASE_MS = 260;
  const FINALIZE_FALLBACK_MS = 1400;
  const STORAGE = {
    preferences: 'clarity.accessibility.preferences.v3.0.2',
    sessions: 'clarity.accessibility.sessions.v3',
    current: 'clarity.accessibility.current.v3',
    engineNoticeDismissed: 'clarity.accessibility.engineNoticeDismissed.v1',
    aiSafeModeMigrated: 'clarity.accessibility.aiSafeModeMigrated.v3.9.0'
  };

  const modeData = {
    social: {
      label: 'Razgovor',
      description: 'Uravnotežen način za svakodnevni razgovor i više ljudi u istoj prostoriji.',
      status: 'Uravnotežen profil · više govornika',
      speakerLimit: 6,
      maxAlternatives: 5,
      reviewConfidence: .62,
      phraseBoost: 2.2,
      vad: { noiseMultiplier: 1.68, bias: .00055, min: .0032, max: .024, hangover: 390 },
      audio: { highPass: 72, presenceHz: 2700, presenceGain: 3.1, compressorThreshold: -40, compressorRatio: 4.0, compressorAttack: .003, compressorRelease: .22, gain: 1.28, noiseSuppression: true, echoCancellation: true, voiceIsolation: true, processedTrack: false },
      phrases: ['pozdrav', 'hvala', 'molim', 'dogovor', 'termin']
    },
    work: {
      label: 'Posao',
      description: 'Optimizirano za razgovor 1-na-1 između korisnika i klijenta, poslodavca ili kolege.',
      status: 'Posao · 1-na-1 · dva glasovna profila',
      speakerLimit: 2,
      maxAlternatives: 7,
      reviewConfidence: .68,
      phraseBoost: 3.4,
      vad: { noiseMultiplier: 1.62, bias: .00050, min: .0030, max: .023, hangover: 400 },
      audio: { highPass: 76, presenceHz: 2750, presenceGain: 3.3, compressorThreshold: -41, compressorRatio: 4.2, compressorAttack: .003, compressorRelease: .23, gain: 1.32, noiseSuppression: true, echoCancellation: true, voiceIsolation: true, processedTrack: false },
      phrases: ['klijent', 'poslodavac', 'projekt', 'rok', 'ugovor', 'ponuda', 'račun', 'cijena', 'sastanak', 'isporuka', 'zadatak', 'prioritet', 'dogovor', 'termin', 'plaća', 'budžet', 'faktura']
    },
    doctor: {
      label: 'Liječnik',
      description: 'Sigurniji 1-na-1 profil za pregled: terapija, lijekovi, doze, nalazi i liječničke upute dobivaju dodatnu provjeru.',
      status: 'Liječnik · pojačana provjera važnih detalja',
      speakerLimit: 2,
      maxAlternatives: 10,
      reviewConfidence: .76,
      criticalConfidence: .88,
      phraseBoost: 4.8,
      vad: { noiseMultiplier: 1.60, bias: .00048, min: .0029, max: .022, hangover: 410 },
      audio: { highPass: 74, presenceHz: 2850, presenceGain: 3.4, compressorThreshold: -42, compressorRatio: 4.4, compressorAttack: .003, compressorRelease: .24, gain: 1.34, noiseSuppression: true, echoCancellation: true, voiceIsolation: true, processedTrack: false },
      phrases: ['liječnik', 'doktor', 'terapija', 'lijek', 'lijekovi', 'doza', 'tableta', 'tablete', 'kapsula', 'miligram', 'miligrama', 'mililitar', 'mililitara', 'jednom dnevno', 'dva puta dnevno', 'tri puta dnevno', 'recept', 'uputnica', 'nalaz', 'dijagnoza', 'simptomi', 'krvni tlak', 'temperatura', 'alergija', 'antibiotik', 'kontrola', 'pregled', 'krvna slika', 'šećer u krvi'],
      criticalTerms: ['terapija', 'lijek', 'lijekovi', 'doza', 'tableta', 'tablete', 'kapsula', 'miligram', 'miligrama', 'mililitar', 'mililitara', 'recept', 'dijagnoza', 'antibiotik', 'alergija', 'krvni tlak', 'šećer u krvi']
    },
    lecture: {
      label: 'Predavanje',
      description: 'Far-field profil za profesora ili predavača koji govori s veće udaljenosti; čuva tiši govor i traži detaljniji prijepis.',
      status: 'Predavanje · far-field · dominantni predavač',
      speakerLimit: 4,
      maxAlternatives: 10,
      reviewConfidence: .67,
      phraseBoost: 3.2,
      vad: { noiseMultiplier: 1.34, bias: .00032, min: .0021, max: .018, hangover: 500 },
      audio: { highPass: 82, presenceHz: 2600, presenceGain: 4.3, compressorThreshold: -48, compressorRatio: 5.4, compressorAttack: .005, compressorRelease: .30, gain: 1.68, noiseSuppression: false, echoCancellation: true, voiceIsolation: false, processedTrack: false },
      phrases: ['profesor', 'predavač', 'predavanje', 'ispit', 'kolokvij', 'seminar', 'definicija', 'primjer', 'objašnjenje', 'važno', 'zapamtite', 'poglavlje', 'formula', 'zadataka']
    }
  };

  // Riječi koje su posebno važne za Clarityjev kontekst pristupačnosti.
  // Ako preglednik podržava SpeechRecognitionPhrase, ove fraze dobivaju dodatni
  // prioritet pri prepoznavanju, ali Clarity i dalje koristi speech engine uređaja/browsera.
  const CORE_CROATIAN_PHRASES = [
    'gluh', 'gluha', 'gluhi', 'gluhe', 'gluhima', 'gluhih', 'gluhog', 'gluhom',
    'gluhoća', 'gluhoće', 'gluhoćom', 'nagluha', 'nagluhi', 'nagluhe', 'nagluhima',
    'nagluhe osobe', 'gluhe osobe', 'gluhim osobama', 'nagluhim osobama',
    'oštećenje sluha', 'oštećenja sluha', 'problemi sa slušanjem', 'problem sa slušanjem',
    'slušni aparat', 'slušni aparati', 'slušno pomagalo', 'slušna pomagala',
    'kohlearni implantat', 'kohlearni implantati', 'umjetna pužnica',
    'transkripcija', 'prijepis', 'govornik', 'razgovor', 'hrvatski jezik',
    'pomoći gluhima', 'pomoći nagluhima', 'namijenjeno gluhima i nagluhima'
  ];

  const defaultPreferences = {
    mode: 'social',
    speechLanguage: 'hr-HR',
    fontScale: 1,
    highContrast: false,
    reduceMotion: false,
    autoScroll: true,
    timestamps: true,
    soundAlerts: false,
    soundThreshold: 94,
    wakeLock: true,
    speakerOne: 'Govornik 1',
    speakerTwo: 'Govornik 2',
    urgentWords: ['hitno', 'pazi', 'oprez', 'stani', 'pomoć', 'požar', 'alarm', 'opasnost'],
    vocabulary: ['Rijeka', 'Zagreb', 'AlphaWave'],
    // Legacy preference keys are retained only so old saved settings remain readable.
    // Clarity 6 Native System Speech does not load or run an additional STT/AI model.
    aiRefine: false,
    aiModel: 'auto',
    // Po zadanom čuvamo ono što je osoba stvarno rekla. Standardizacija je opcionalna.
    standardizeCroatian: false
  };

  // Legacy refinement queue constants remain for backwards-compatible state only.
  const AI_MAX_QUEUE = 30;
  const AI_FALLBACK_CONFIDENCE = .74;
  const AI_MIN_SPEECH_SECONDS = .62;
  const AI_MIN_FALLBACK_WORDS = 2;

  const $ = id => document.getElementById(id);
  const dom = {
    newSessionButton: $('newSessionButton'),
    sessionList: $('sessionList'),
    settingsButton: $('settingsButton'),
    activeModeLabel: $('activeModeLabel'),
    modeSwitcher: $('modeSwitcher'),
    undoButton: $('undoButton'),
    copyButton: $('copyButton'),
    downloadButton: $('downloadButton'),
    clearButton: $('clearButton'),
    mobileSessionsButton: $('mobileSessionsButton'),
    mobileSettingsButton: $('mobileSettingsButton'),
    statusBanner: $('statusBanner'),
    statusBannerText: $('statusBannerText'),
    closeStatusButton: $('closeStatusButton'),
    engineNotice: $('engineNotice'),
    closeEngineNoticeButton: $('closeEngineNoticeButton'),
    loudSoundAlert: $('loudSoundAlert'),
    dismissSoundAlert: $('dismissSoundAlert'),
    emptyTranscript: $('emptyTranscript'),
    emptyStartButton: $('emptyStartButton'),
    demoButton: $('demoButton'),
    transcriptView: document.querySelector('.transcript-view'),
    transcriptStream: $('transcriptStream'),
    interimSegment: $('interimSegment'),
    interimSpeaker: $('interimSpeaker'),
    interimText: $('interimText'),
    contextTitle: $('contextTitle'),
    contextDescription: $('contextDescription'),
    voiceLanguageSwitcher: $('voiceLanguageSwitcher'),
    voiceLanguageName: $('voiceLanguageName'),
    largeViewButton: $('largeViewButton'),
    quickMessageButton: $('quickMessageButton'),
    addNoteButton: $('addNoteButton'),
    soundStateText: $('soundStateText'),
    miniSoundMeter: $('miniSoundMeter'),
    statusDot: $('statusDot'),
    dockStatus: $('dockStatus'),
    dockSubstatus: $('dockSubstatus'),
    summaryButton: $('summaryButton'),
    elapsed: $('elapsed'),
    recordButton: $('recordButton'),
    panelScrim: $('panelScrim'),
    settingsPanel: $('settingsPanel'),
    summaryPanel: $('summaryPanel'),
    mobileSessionsPanel: $('mobileSessionsPanel'),
    mobileNewSessionButton: $('mobileNewSessionButton'),
    mobileSessionList: $('mobileSessionList'),
    summaryList: $('summaryList'),
    speakerProfilesList: $('speakerProfilesList'),
    fontScaleInput: $('fontScaleInput'),
    soundAlertsInput: $('soundAlertsInput'),
    soundThresholdInput: $('soundThresholdInput'),
    keywordForm: $('keywordForm'),
    keywordInput: $('keywordInput'),
    keywordList: $('keywordList'),
    vocabularyForm: $('vocabularyForm'),
    vocabularyInput: $('vocabularyInput'),
    vocabularyList: $('vocabularyList'),
    highContrastInput: $('highContrastInput'),
    reduceMotionInput: $('reduceMotionInput'),
    autoScrollInput: $('autoScrollInput'),
    timestampsInput: $('timestampsInput'),
    wakeLockInput: $('wakeLockInput'),
    aiRefineInput: $('aiRefineInput'),
    aiModelSelect: $('aiModelSelect'),
    standardizeCroatianInput: $('standardizeCroatianInput'),
    aiStatusPill: $('aiStatusPill'),
    resetSettingsButton: $('resetSettingsButton'),
    largeView: $('largeView'),
    closeLargeViewButton: $('closeLargeViewButton'),
    largeViewSpeaker: $('largeViewSpeaker'),
    largeViewStatus: $('largeViewStatus'),
    largeViewText: $('largeViewText'),
    largeViewClock: $('largeViewClock'),
    quickMessageModal: $('quickMessageModal'),
    customMessageForm: $('customMessageForm'),
    customMessageInput: $('customMessageInput'),
    messageDisplay: $('messageDisplay'),
    messageDisplayText: $('messageDisplayText'),
    closeMessageDisplayButton: $('closeMessageDisplayButton'),
    noteModal: $('noteModal'),
    noteForm: $('noteForm'),
    noteInput: $('noteInput'),
    privacyPolicyModal: $('privacyPolicyModal'),
    impressumModal: $('impressumModal'),
    toast: $('toast'),
    appVersion: $('appVersion')
  };

  const MAX_AUTO_SPEAKERS = 6;
  const VOICE_FEATURE_INTERVAL_MS = 80;
  const SPEAKER_HYSTERESIS_MS = 700;
  const RECOGNITION_WATCHDOG_INTERVAL_MS = 1000;
  const RECOGNITION_START_TIMEOUT_MS = window.__clarityNativeSpeech ? 20000 : 5500;
  const RECOGNITION_RECOVERY_DELAY_MS = 120;
  const RECOGNITION_STALE_EVENT_MS = 18000;
  const RECOGNITION_REARM_DELAY_MS = 90;
  const INTERIM_STABLE_COMMIT_MS = 900;
  const INTERIM_MAX_WAIT_MS = 2600;

  function activeModeProfile() {
    return modeData[preferences?.mode] || modeData.social;
  }

  function activeSessionModeProfile() {
    return modeData[current?.mode] || activeModeProfile();
  }

  function modeSpeakerLimit() {
    return clamp(Number(activeSessionModeProfile().speakerLimit) || MAX_AUTO_SPEAKERS, 1, MAX_AUTO_SPEAKERS);
  }

  function neuralVadConfig() {
    const mode = preferences?.mode || 'social';
    const configs = {
      social: { positiveSpeechThreshold: .36, negativeSpeechThreshold: .23, redemptionMs: 620, preSpeechPadMs: 900, minSpeechMs: 300 },
      work: { positiveSpeechThreshold: .35, negativeSpeechThreshold: .22, redemptionMs: 640, preSpeechPadMs: 900, minSpeechMs: 300 },
      doctor: { positiveSpeechThreshold: .34, negativeSpeechThreshold: .21, redemptionMs: 700, preSpeechPadMs: 950, minSpeechMs: 320 },
      lecture: { positiveSpeechThreshold: .30, negativeSpeechThreshold: .18, redemptionMs: 900, preSpeechPadMs: 1050, minSpeechMs: 340 }
    };
    return { model: 'v5', ...(configs[mode] || configs.social) };
  }

  // Kanonski nazivi kod kojih sam izgovor nije dovoljan da odredi pravopis.
  // Ovi aliasi ne mijenjaju značenje rečenice; samo vraćaju dogovoreni zapis naziva.
  const SYSTEM_CANONICAL_TERMS = [
    {
      canonical: 'Lyllo',
      aliases: ['lilo', 'lillo', 'lylo', 'lyllo', 'ljilo', 'lilu', 'lilo']
    },
    {
      canonical: 'ChatGPT',
      aliases: [
        'chatgpt', 'chat gpt', 'catgpt', 'cat gpt', 'čatgpt', 'čat gpt', 'četgpt', 'čet gpt',
        'chat g p t', 'cat g p t', 'čat g p t', 'chat dži pi ti', 'čat dži pi ti', 'čet dži pi ti',
        'chat džipiti', 'čat džipiti', 'čet džipiti', 'chat đipiti', 'čat đipiti'
      ]
    }
  ];

  // Konzervativne pretvorbe koje često nastanu kada hr-HR servis vrati srpsku/bosansku
  // leksičku varijantu umjesto hrvatskog standarda. Namjerno izbjegavamo agresivno
  // prepisivanje cijele rečenice kako ne bismo promijenili značenje govornika.
  const CROATIAN_STANDARD_REPLACEMENTS = [
    [/\bovde\b/giu, 'ovdje'], [/\bgde\b/giu, 'gdje'], [/\bnegde\b/giu, 'negdje'], [/\bnigde\b/giu, 'nigdje'],
    [/\btačno\b/giu, 'točno'], [/\btačna\b/giu, 'točna'], [/\btačan\b/giu, 'točan'], [/\btačne\b/giu, 'točne'], [/\btačni\b/giu, 'točni'],
    [/\bnetačno\b/giu, 'netočno'], [/\bnetačna\b/giu, 'netočna'], [/\buopšte\b/giu, 'uopće'], [/\bopšte\b/giu, 'opće'],
    [/\btakođe\b/giu, 'također'], [/\bsledeći\b/giu, 'sljedeći'], [/\bsledeća\b/giu, 'sljedeća'], [/\bsledeće\b/giu, 'sljedeće'],
    [/\bsledećeg\b/giu, 'sljedećeg'], [/\bsledećih\b/giu, 'sljedećih'], [/\bsledeću\b/giu, 'sljedeću'],
    [/\bćao\b/giu, 'bok'], [/\bcao\b/giu, 'bok'], [/\bdobro\s+veče\b/giu, 'dobra večer'],
    [/\bšta\b/giu, 'što'], [/\bko\b/giu, 'tko'],
    [/\blekar\b/giu, 'liječnik'], [/\blekara\b/giu, 'liječnika'], [/\blekaru\b/giu, 'liječniku'], [/\blekarom\b/giu, 'liječnikom'], [/\blekari\b/giu, 'liječnici'],
    [/\blekovi\b/giu, 'lijekovi'], [/\blekove\b/giu, 'lijekove'], [/\blekova\b/giu, 'lijekova'], [/\blek\b/giu, 'lijek'],
    [/\bapoteka\b/giu, 'ljekarna'], [/\bapoteci\b/giu, 'ljekarni'],
    [/\bopština\b/giu, 'općina'], [/\bpreduzeće\b/giu, 'poduzeće'], [/\bpreduzeća\b/giu, 'poduzeća'],
    [/\buslov\b/giu, 'uvjet'], [/\buslovi\b/giu, 'uvjeti'], [/\bporodica\b/giu, 'obitelj'], [/\bporodice\b/giu, 'obitelji'],
    [/\bhiljada\b/giu, 'tisuća'], [/\bhiljade\b/giu, 'tisuće'], [/\bhiljadu\b/giu, 'tisuću'],
    [/\bsaobraćaj\b/giu, 'promet'], [/\bsaobraćaja\b/giu, 'prometa'], [/\bsaobraćaju\b/giu, 'prometu'],
    [/\bračunar\b/giu, 'računalo'], [/\bračunara\b/giu, 'računala'], [/\bračunaru\b/giu, 'računalu'], [/\bračunari\b/giu, 'računala'], [/\bštampač\b/giu, 'pisač'],
    [/\bvazduh\b/giu, 'zrak'], [/\bsprat\b/giu, 'kat'], [/\bspratu\b/giu, 'katu'], [/\bsprata\b/giu, 'kata'],
    [/\bpeškir\b/giu, 'ručnik'], [/\bpeškira\b/giu, 'ručnika'], [/\bpeškirom\b/giu, 'ručnikom'],
    [/\bšolja\b/giu, 'šalica'], [/\bšolju\b/giu, 'šalicu'], [/\bšolje\b/giu, 'šalice'],
    [/\bkašika\b/giu, 'žlica'], [/\bšargarepa\b/giu, 'mrkva'], [/\bpasulj\b/giu, 'grah'], [/\bpirinač\b/giu, 'riža'],
    [/\bhemija\b/giu, 'kemija'], [/\bistorija\b/giu, 'povijest'], [/\bmuzika\b/giu, 'glazba'], [/\bfudbal\b/giu, 'nogomet'],
    [/\bvoz\b/giu, 'vlak'], [/\bbioskop\b/giu, 'kino'],
    [/\bbezbedan\b/giu, 'siguran'], [/\bbezbedna\b/giu, 'sigurna'], [/\bbezbedno\b/giu, 'sigurno'],
    [/\bjanuar\b/giu, 'siječanj'], [/\bjanuara\b/giu, 'siječnja'], [/\bjanuaru\b/giu, 'siječnju'],
    [/\bfebruar\b/giu, 'veljača'], [/\bfebruara\b/giu, 'veljače'], [/\bfebruaru\b/giu, 'veljači'],
    [/\bmart\b/giu, 'ožujak'], [/\bmarta\b/giu, 'ožujka'], [/\bmartu\b/giu, 'ožujku'],
    [/\bapril\b/giu, 'travanj'], [/\baprila\b/giu, 'travnja'], [/\baprilu\b/giu, 'travnju'],
    [/\bjun\b/giu, 'lipanj'], [/\bjuna\b/giu, 'lipnja'], [/\bjunu\b/giu, 'lipnju'],
    [/\bjul\b/giu, 'srpanj'], [/\bjula\b/giu, 'srpnja'], [/\bjulu\b/giu, 'srpnju'],
    [/\bavgust\b/giu, 'kolovoz'], [/\bavgusta\b/giu, 'kolovoza'], [/\bavgustu\b/giu, 'kolovozu'],
    [/\bseptembar\b/giu, 'rujan'], [/\bseptembra\b/giu, 'rujna'], [/\bseptembru\b/giu, 'rujnu'],
    [/\boktobar\b/giu, 'listopad'], [/\boktobra\b/giu, 'listopada'], [/\boktobru\b/giu, 'listopadu'],
    [/\bnovembar\b/giu, 'studeni'], [/\bnovembra\b/giu, 'studenoga'], [/\bnovembru\b/giu, 'studenom'],
    [/\bdecembar\b/giu, 'prosinac'], [/\bdecembra\b/giu, 'prosinca'], [/\bdecembru\b/giu, 'prosincu'],
    [/\bneznam\b/giu, 'ne znam'], [/\bnemogu\b/giu, 'ne mogu'], [/\bnebi\b/giu, 'ne bi'],
    [/\bsamnom\b/giu, 'sa mnom'], [/\bstobom\b/giu, 's tobom'], [/\bjel\b/giu, 'je li']
  ];

  // Česte fonetske/ASR pogreške koje su nedvosmislene u hrvatskom standardu.
  // Ovaj sloj radi samo nad cijelim riječima ili vrlo sigurnim frazama kako ne bi
  // "ispravljao" sadržaj koji je govornik stvarno rekao.
  const CROATIAN_ASR_TYPO_REPLACEMENTS = [
    // Česta segmentacija hr-HR diktata: "gluhima" se zna vratiti kao "gluhi ma".
    [/\bglu\s*hi\s+ma\b/giu, 'gluhima'], [/\bgluh\s+i\s+ma\b/giu, 'gluhima'],
    [/\bnagluhi\s+ma\b/giu, 'nagluhima'], [/\bnaglu\s+hi\s+ma\b/giu, 'nagluhima'],
    [/\bništo\b/giu, 'ništa'], [/\bništ\b/giu, 'ništa'], [/\bnešta\b/giu, 'nešto'],
    [/\buvjek\b/giu, 'uvijek'], [/\bvjerovatno\b/giu, 'vjerojatno'], [/\bvjerovatni\b/giu, 'vjerojatni'], [/\bvjerovatna\b/giu, 'vjerojatna'],
    [/\bsumljam\b/giu, 'sumnjam'], [/\bsumlja\b/giu, 'sumnja'], [/\bsumljivo\b/giu, 'sumnjivo'],
    [/\bsljedeči\b/giu, 'sljedeći'], [/\bslijedeći\b/giu, 'sljedeći'], [/\bslijedeća\b/giu, 'sljedeća'], [/\bslijedeće\b/giu, 'sljedeće'],
    [/\bčovijek\b/giu, 'čovjek'], [/\bčovijeka\b/giu, 'čovjeka'], [/\brijeć\b/giu, 'riječ'], [/\brijeći\b/giu, 'riječi'],
    [/\bhtjeo\b/giu, 'htio'], [/\bhtjela bi\b/giu, 'htjela bih'], [/\bhtjeo bi\b/giu, 'htio bih']
  ];

  const CROATIAN_UNICODE_BOUNDARY_REPLACEMENTS = [
    ['ćao', 'bok'], ['šta', 'što'], ['štampač', 'pisač'], ['šolja', 'šalica'], ['šolju', 'šalicu'], ['šolje', 'šalice'], ['šargarepa', 'mrkva'],
    ['čovijek', 'čovjek'], ['čovijeka', 'čovjeka'], ['rijeć', 'riječ'], ['rijeći', 'riječi']
  ];

  const NON_CROATIAN_ALTERNATIVE_MARKERS = [
    /\b(?:ovde|gde|negde|nigde|tačno|netačno|uopšte|opšte|takođe|sledeć[iae]|ćao|cao|šta|lekar|lekovi?|apoteka|opština|preduzeće|uslovi?|porodica|hiljad[aeu]|saobraćaj|računar|štampač|vazduh|sprat|peškir|šolja|kašika|šargarepa|pasulj|pirinač|hemija|istorija|muzika|fudbal|voz|bioskop|bezbedn[ao]|januar|februar|mart|april|jun|jul|avgust|septembar|oktobar|novembar|decembar)\b/giu
  ];

  let preferences = loadJson(STORAGE.preferences, defaultPreferences);
  preferences = sanitizePreferences(preferences);
  // 3.9.0 presentation engine uvijek kreće bez Whisper dorade.
  // Model nije dio live puta jer prioritet imaju stabilnost i čisti browser/cloud captions.
  preferences.aiRefine = false;
  saveJson(STORAGE.aiSafeModeMigrated, true);
  saveJson(STORAGE.preferences, preferences);
  let sessions = loadJson(STORAGE.sessions, []);
  let current = loadJson(STORAGE.current, null) || createEmptySession(preferences.mode);
  current = sanitizeSession(current);
  let activeSpeaker = current.segments.filter(item => item.type === 'speech').at(-1)?.speaker || 1;
  let doctorSpeakerId = null;
  let lectureSpeakerId = null;
  let speakerRoleEvidence = new Map();
  let contextualBiasDisabled = false;
  let browserRecognitionDisabled = false;
  let browserOnDeviceRecognition = false;
  let browserOnDeviceChecked = false;
  let recognition = null;
  let recognitionGeneration = 0;
  let recognitionWatchdogTimer = null;
  let recognitionLastEventAt = 0;
  let recognitionLastResultAt = 0;
  let recognitionStartedAt = 0;
  let recognitionStartAttemptAt = 0;
  let recognitionLastEndAt = 0;
  let recognitionRapidEndCount = 0;
  let recognitionRecoveryCount = 0;
  let recognitionCycleSawFinal = false;
  let recognitionCycleSawResult = false;
  let recognitionCycleInterim = '';
  let recognitionCycleStartedAt = 0;
  let shouldListen = false;
  let isListening = false;
  let isFinalizing = false;
  let finalizeFallbackTimer = null;
  let lastManualStopAt = 0;
  let restartTimer = null;
  let interimCommitTimer = null;
  let interimChangedAt = 0;
  let utteranceSerial = 0;
  let chromeUtteranceSerial = 0;
  let recognitionResultSerials = new Map();
  let utteranceStartedAt = 0;
  let lastProvisionalSegment = null;
  let elapsedTimer = null;
  let toastTimer = null;
  let interimText = '';
  let lastFinalText = '';
  let lastFinalAt = 0;
  let manualParagraph = null;
  let audioStream = null;
  let audioContext = null;
  let analyser = null;
  let audioFrame = null;
  let processedAudioDestination = null;
  let processedAudioTrack = null;
  let audioGraphNodes = [];
  let timeDomainData = null;
  let frequencyData = null;
  let voiceAccumulator = createVoiceAccumulator();
  let pendingVoiceFeature = null;
  let lastVoiceFeatureAt = 0;
  let lastSpeakerDecisionAt = 0;
  let audioVadActive = false;
  let audioVadSilenceStartedAt = 0;
  let noiseFloorRms = .0045;
  let lastAudioVoiceAt = 0;
  let lastAudioVoiceStartAt = 0;
  let previousSoundLevel = 0;
  let loudFrames = 0;
  let speechIsActive = false;
  let lastSpeechActivityAt = 0;
  let lastSoundAlertAt = 0;
  let wakeLock = null;
  let activePanel = null;
  let openSwipeRow = null;
  let speechGainNode = null;
  let neuralVadReady = false;
  let neuralVadSpeaking = false;
  let neuralVadSerial = 0;
  let neuralVadSpeechProbability = 0;
  let neuralVadLastSpeechAt = 0;
  let neuralVadStartPromise = null;
  let neuralVadDisposeTimer = null;
  let aiTranscriber = null;
  let aiState = 'idle'; // idle | loading | ready | working | error
  let aiQueue = [];
  let aiQueueRunning = false;
  let aiQueueDepth = 0;
  let aiFailureCount = 0;
  let aiRetryAfter = 0;
  let aiRetryTimer = null;
  let transcriptEpoch = 0;
  let ignoredAiSerials = new Set();
  let sessionRenderTimer = null;
  let lastModalTrigger = null;
  const whisperEngine = { modelKey: '', get: async () => null, reset() {} };
  const neuralVadEngine = { start: async () => false, pause() {}, dispose: async () => {} };

  function createId(prefix = 'item') {
    if (window.crypto?.randomUUID) return `${prefix}-${window.crypto.randomUUID()}`;
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  }

  function createEmptySession(mode) {
    return {
      id: createId('session'),
      mode: modeData[mode] ? mode : 'social',
      createdAt: Date.now(),
      durationSeconds: 0,
      segments: [],
      speakers: []
    };
  }

  function sanitizePreferences(value) {
    const next = { ...defaultPreferences, ...(value && typeof value === 'object' ? value : {}) };
    next.mode = modeData[next.mode] ? next.mode : 'social';
    next.speechLanguage = ['hr-HR', 'en-US'].includes(next.speechLanguage) ? next.speechLanguage : 'hr-HR';
    next.fontScale = clamp(Number(next.fontScale) || 1, .9, 1.55);
    next.soundThreshold = clamp(Number(next.soundThreshold) || 94, 75, 98);
    next.speakerOne = cleanLabel(next.speakerOne, 'Govornik 1');
    next.speakerTwo = cleanLabel(next.speakerTwo, 'Govornik 2');
    next.urgentWords = normalizeStringList(next.urgentWords, defaultPreferences.urgentWords);
    next.vocabulary = normalizeStringList(next.vocabulary, defaultPreferences.vocabulary);
    next.aiRefine = false;
    next.aiModel = ['auto', 'base', 'small', 'turbo'].includes(next.aiModel) ? next.aiModel : 'auto';
    next.standardizeCroatian = Boolean(next.standardizeCroatian);
    return next;
  }

  function sanitizeSession(value) {
    if (!value || typeof value !== 'object') return createEmptySession(preferences.mode);
    const next = {
      id: typeof value.id === 'string' ? value.id : createId('session'),
      mode: modeData[value.mode] ? value.mode : preferences.mode,
      createdAt: Number(value.createdAt) || Date.now(),
      durationSeconds: Math.max(0, Number(value.durationSeconds) || 0),
      segments: Array.isArray(value.segments) ? value.segments.map(sanitizeSegment).filter(Boolean) : [],
      speakers: Array.isArray(value.speakers) ? value.speakers.map(sanitizeSpeakerProfile).filter(Boolean) : []
    };

    // Migracija starih razgovora: zadrži postojeće oznake Govornik 1 / 2,
    // ali od sada dopusti proizvoljan broj automatski prepoznatih govornika.
    const usedSpeakerIds = [...new Set(next.segments.filter(item => item.type === 'speech').map(item => item.speaker))];
    for (const id of usedSpeakerIds) {
      if (!next.speakers.some(profile => profile.id === id)) {
        const legacy = id === 1 ? preferences.speakerOne : id === 2 ? preferences.speakerTwo : `Govornik ${id}`;
        next.speakers.push(createSpeakerProfile(id, null, cleanLabel(legacy, `Govornik ${id}`)));
      }
    }
    next.speakers.sort((a, b) => a.id - b.id);
    return next;
  }



  function sanitizeSegment(segment) {
    if (!segment || typeof segment !== 'object' || !String(segment.text || '').trim()) return null;
    const speaker = clamp(Math.round(Number(segment.speaker) || 1), 1, MAX_AUTO_SPEAKERS);
    return {
      id: typeof segment.id === 'string' ? segment.id : createId('line'),
      text: normalizeRecognizedText(segment.text, false),
      createdAt: Number(segment.createdAt) || Date.now(),
      confidence: clamp(Number(segment.confidence) || .75, 0, 1),
      speaker,
      type: segment.type === 'note' ? 'note' : 'speech',
      provisional: false,
      utteranceSerial: Number.isFinite(Number(segment.utteranceSerial)) ? Number(segment.utteranceSerial) : null,
      aiRefined: Boolean(segment.aiRefined),
      aiFallback: Boolean(segment.aiFallback),
      requiresReview: Boolean(segment.requiresReview),
      aiSuggestion: String(segment.aiSuggestion || '').slice(0, 1200),
      originalText: String(segment.originalText || '').slice(0, 1200),
      userEdited: Boolean(segment.userEdited)
    };
  }

  function sanitizeSpeakerProfile(profile) {
    if (!profile || typeof profile !== 'object') return null;
    const id = clamp(Math.round(Number(profile.id) || 1), 1, MAX_AUTO_SPEAKERS);
    const voice = profile.voice && typeof profile.voice === 'object' ? profile.voice : {};
    return {
      id,
      label: `Govornik ${id}`,
      samples: Math.max(0, Math.round(Number(profile.samples) || 0)),
      lastSeenAt: Math.max(0, Number(profile.lastSeenAt) || 0),
      voice: {
        pitch: positiveNumberOrNull(voice.pitch),
        pitchStd: positiveNumberOrNull(voice.pitchStd),
        centroid: positiveNumberOrNull(voice.centroid),
        zcr: positiveNumberOrNull(voice.zcr),
        lowRatio: positiveNumberOrNull(voice.lowRatio),
        midRatio: positiveNumberOrNull(voice.midRatio),
        highRatio: positiveNumberOrNull(voice.highRatio),
        flatness: positiveNumberOrNull(voice.flatness),
        rolloff: positiveNumberOrNull(voice.rolloff)
      }
    };
  }

  function positiveNumberOrNull(value) {
    if (value == null || value === '') return null;
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : null;
  }

  function normalizeStringList(value, fallback) {
    if (!Array.isArray(value)) return [...fallback];
    const unique = [];
    for (const item of value) {
      const text = String(item || '').normalize('NFC').trim().replace(/\s+/g, ' ');
      if (!text || unique.some(existing => existing.toLocaleLowerCase('hr-HR') === text.toLocaleLowerCase('hr-HR'))) continue;
      unique.push(text.slice(0, 60));
    }
    return unique.length ? unique.slice(0, 40) : [...fallback];
  }

  function cleanLabel(value, fallback) {
    const text = String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ').slice(0, 30);
    return text || fallback;
  }

  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : structuredCloneSafe(fallback);
    } catch {
      return structuredCloneSafe(fallback);
    }
  }

  function structuredCloneSafe(value) {
    try { return structuredClone(value); } catch { return JSON.parse(JSON.stringify(value)); }
  }

  function saveJson(key, value) {
    if (key === STORAGE.current || key === STORAGE.sessions) {
      // Razgovori mogu narasti na tisuće segmenata; IndexedDB je asinkron i ne blokira UI.
      const nextCurrent = key === STORAGE.current ? value : current;
      const nextSessions = key === STORAGE.sessions ? value : sessions;
      queueDurableState(nextCurrent, nextSessions);
      return true;
    }
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function activeSpeechLanguage() {
    return preferences?.speechLanguage === 'en-US' ? 'en-US' : 'hr-HR';
  }

  function activeSpeechLanguageMeta() {
    return activeSpeechLanguage() === 'en-US'
      ? { code: 'en-US', short: 'EN', name: 'English' }
      : { code: 'hr-HR', short: 'HR', name: 'Hrvatski' };
  }

  function normalizeRecognizedText(value, finalize = true) {
    let text = String(value || '').normalize('NFC').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text) return '';

    if (activeSpeechLanguage() === 'en-US') {
      text = cleanupCroatianPunctuation(text);
      if (finalize) {
        text = text.charAt(0).toLocaleUpperCase('en-US') + text.slice(1);
        if (!/[.!?…]$/.test(text) && text.length > 1) text += '.';
      }
      return text;
    }

    const corrections = [
      [/\bpoždrav\b/giu, 'pozdrav'],
      [/\bpo\s+zdrav\b/giu, 'pozdrav'],
      [/\bbog(?=\s+svima\b)/giu, 'bok'],
      [/\bovde(?=\s+(?:je|sam)\b)/giu, 'ovdje']
    ];
    for (const [pattern, replacement] of corrections) {
      text = text.replace(pattern, match => preserveInitialCase(match, replacement));
    }

    if (preferences?.standardizeCroatian) text = normalizeToCroatianStandard(text);
    text = applyCroatianAsrCorrections(text);
    text = applyCanonicalTerms(text);
    text = applyPersonalVocabularyPhonetics(text);

    // Nakon fonetskog sloja još jednom vraćamo točan zapis i velika/mala slova
    // svakog izraza iz osobnog rječnika.
    if (preferences?.vocabulary?.length) {
      for (const phrase of preferences.vocabulary) {
        const pattern = new RegExp(`(^|[^\p{L}\p{N}])(${escapeRegex(phrase)})(?=$|[^\p{L}\p{N}])`, 'giu');
        text = text.replace(pattern, (_match, prefix) => `${prefix}${phrase}`);
      }
    }

    text = cleanupCroatianPunctuation(text);
    if (finalize) {
      text = text.charAt(0).toLocaleUpperCase('hr-HR') + text.slice(1);
      if (!/[.!?…]$/.test(text) && text.length > 1) text += '.';
    }
    return text;
  }

  function replaceWholePhrase(text, source, replacement) {
    const escaped = escapeRegex(String(source || '').trim()).replace(/\\s\+/g, '\\s+');
    if (!escaped) return text;
    const pattern = new RegExp(`(^|[^\p{L}\p{N}])(${escaped})(?=$|[^\p{L}\p{N}])`, 'giu');
    return String(text).replace(pattern, (_match, prefix, found) => `${prefix}${preserveInitialCase(found, replacement)}`);
  }

  function normalizeToCroatianStandard(value) {
    let text = String(value || '');
    // JS-ov \b nije pouzdan na početku riječi koja počinje slovom č/ć/š/ž/đ,
    // pa za takve hrvatske/južnoslavenske riječi koristimo Unicode granice riječi.
    for (const [source, replacement] of CROATIAN_UNICODE_BOUNDARY_REPLACEMENTS) {
      text = replaceWholePhrase(text, source, replacement);
    }
    for (const [pattern, replacement] of CROATIAN_STANDARD_REPLACEMENTS) {
      text = text.replace(pattern, match => preserveInitialCase(match, replacement));
    }
    return text;
  }

  function applyCroatianAsrCorrections(value) {
    let text = String(value || '');
    for (const [pattern, replacement] of CROATIAN_ASR_TYPO_REPLACEMENTS) {
      text = text.replace(pattern, match => preserveInitialCase(match, replacement));
    }
    return applyCroatianContextCorrections(text);
  }

  function applyCroatianContextCorrections(value) {
    let text = String(value || '');

    // Instrumental/dativ množine nakon determinatora: "svim gluhi" je tipičan ASR
    // rez kada je izgovoreno "svim gluhima". Ovo je dovoljno usko da ne mijenja
    // normalnu upotrebu riječi "gluhi" u drugim rečenicama.
    text = text.replace(/\b(svim|tim|ovim|onim)\s+gluhi\b/giu, (_match, prefix) => `${prefix} gluhima`);
    text = text.replace(/\b(svim|tim|ovim|onim)\s+nagluhi\b/giu, (_match, prefix) => `${prefix} nagluhima`);
    text = text.replace(/\b(pomoći|pomoci|pomognem|pomogneš|pomogne|pomognemo|pomognete|pomognu|pomažem|pomažeš|pomaže|pomažemo|pomažete|pomažu)\s+(svim\s+)?gluhi\b/giu,
      (_match, verb, determiner = '') => `${verb} ${determiner}gluhima`);
    text = text.replace(/\b(namijenjeno|namijenjen|namijenjena|namijenjene|namijenjeni)\s+(svim\s+)?gluhi\b/giu,
      (_match, word, determiner = '') => `${word} ${determiner}gluhima`);

    // "glupima" je valjana hrvatska riječ pa je nikada ne mijenjamo globalno.
    // Ispravljamo je samo kada ista rečenica jasno govori o sluhu/gluhoći.
    const hearingContext = /\b(?:sluh\p{L}*|slušan\p{L}*|gluhoć\p{L}*|gluh\p{L}*|nagluh\p{L}*|slušni\p{L}*|kohlear\p{L}*|pužnic\p{L}*)\b/iu.test(text);
    if (hearingContext) {
      text = text.replace(/\bglupima\b/giu, match => preserveInitialCase(match, 'gluhima'));
    }

    return text;
  }

  function cleanupCroatianPunctuation(value) {
    return String(value || '')
      .replace(/\s+([,.;:!?])/g, '$1')
      .replace(/([,;:])(?=[^\s])/g, '$1 ')
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  function phoneticVocabularyKey(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLocaleLowerCase('hr-HR')
      .replace(/dž/g, 'dz')
      .replace(/đ/g, 'dj')
      .replace(/ph/g, 'f')
      .replace(/w/g, 'v')
      .replace(/y/g, 'i')
      .replace(/q/g, 'k')
      .replace(/x/g, 'ks')
      .replace(/[^a-z0-9]/g, '')
      .replace(/(.)\1+/g, '$1');
  }

  function simpleEditDistance(a, b) {
    const left = String(a || '');
    const right = String(b || '');
    if (left === right) return 0;
    if (!left) return right.length;
    if (!right) return left.length;
    const row = Array.from({ length: right.length + 1 }, (_v, index) => index);
    for (let i = 1; i <= left.length; i += 1) {
      let previousDiagonal = row[0];
      row[0] = i;
      for (let j = 1; j <= right.length; j += 1) {
        const old = row[j];
        row[j] = Math.min(row[j] + 1, row[j - 1] + 1, previousDiagonal + (left[i - 1] === right[j - 1] ? 0 : 1));
        previousDiagonal = old;
      }
    }
    return row[right.length];
  }

  function applyCanonicalTerms(value) {
    let text = String(value || '');
    for (const entry of SYSTEM_CANONICAL_TERMS) {
      for (const alias of [entry.canonical, ...(entry.aliases || [])]) {
        text = replaceWholePhrase(text, alias, entry.canonical);
      }
    }
    return text;
  }

  function isLikelyProperVocabularyTerm(term) {
    const text = String(term || '').trim();
    if (!text || text.includes(' ')) return false;
    return /^[\p{L}\p{N}'’\-]{2,32}$/u.test(text) &&
      (/[A-ZČĆŽŠĐ]/u.test(text) || /[wyqx]/iu.test(text));
  }

  function applyPersonalVocabularyPhonetics(value) {
    const candidates = (preferences?.vocabulary || [])
      .filter(isLikelyProperVocabularyTerm)
      .map(canonical => ({ canonical, key: phoneticVocabularyKey(canonical) }))
      .filter(item => item.key.length >= 3);
    if (!candidates.length) return String(value || '');

    return String(value || '').replace(/[\p{L}\p{N}'’\-]{2,32}/gu, token => {
      const tokenKey = phoneticVocabularyKey(token);
      if (!tokenKey) return token;
      let best = null;
      for (const candidate of candidates) {
        if (candidate.key[0] !== tokenKey[0]) continue;
        const distance = simpleEditDistance(tokenKey, candidate.key);
        const maxLen = Math.max(tokenKey.length, candidate.key.length);
        const allowed = maxLen <= 4 ? 0 : maxLen <= 7 ? 1 : 2;
        if (distance > allowed) continue;
        const score = 1 - distance / Math.max(1, maxLen);
        if (!best || score > best.score) best = { ...candidate, score };
      }
      return best && best.score >= .78 ? best.canonical : token;
    });
  }

  function recognitionCroatianScore(rawText) {
    const source = String(rawText || '');
    let score = 0;

    // Kad je uključen vjerni prijepis, ne kažnjavamo kolokvijalnu/dijalektnu riječ samo
    // zato što nije književni standard. Standardizacija je zasebna, izričita opcija.
    if (preferences?.standardizeCroatian) {
      for (const pattern of NON_CROATIAN_ALTERNATIVE_MARKERS) {
        pattern.lastIndex = 0;
        const matches = source.match(pattern);
        if (matches?.length) score -= Math.min(.24, matches.length * .055);
      }
    }

    const lowered = source.toLocaleLowerCase('hr-HR');
    for (const entry of SYSTEM_CANONICAL_TERMS) {
      if ([entry.canonical, ...(entry.aliases || [])].some(alias => lowered.includes(String(alias).toLocaleLowerCase('hr-HR')))) {
        score += .075;
      }
    }
    return score;
  }

  function preserveInitialCase(source, replacement) {
    const first = source.trim().charAt(0);
    return first === first.toLocaleUpperCase('hr-HR')
      ? replacement.charAt(0).toLocaleUpperCase('hr-HR') + replacement.slice(1)
      : replacement;
  }

  function speakerName(number) {
    const id = clamp(Math.round(Number(number) || 1), 1, MAX_AUTO_SPEAKERS);
    return `Govornik ${id}`;
  }

  function createSpeakerProfile(id, feature = null, label = '') {
    const safeId = clamp(Math.round(Number(id) || 1), 1, MAX_AUTO_SPEAKERS);
    return {
      id: safeId,
      label: cleanLabel(label, `Govornik ${safeId}`),
      samples: feature ? 1 : 0,
      lastSeenAt: Date.now(),
      voice: feature ? featureToVoiceMean(feature) : {
        pitch: null, pitchStd: null, centroid: null, zcr: null,
        lowRatio: null, midRatio: null, highRatio: null, flatness: null, rolloff: null
      }
    };
  }

  function ensureSpeakerProfile(id, feature = null) {
    if (!Array.isArray(current.speakers)) current.speakers = [];
    let profile = current.speakers.find(item => item.id === id);
    if (!profile) {
      profile = createSpeakerProfile(id, feature);
      current.speakers.push(profile);
      current.speakers.sort((a, b) => a.id - b.id);
    }
    return profile;
  }

  function featureToVoiceMean(feature) {
    return {
      pitch: positiveNumberOrNull(feature?.pitch),
      pitchStd: positiveNumberOrNull(feature?.pitchStd),
      centroid: positiveNumberOrNull(feature?.centroid),
      zcr: positiveNumberOrNull(feature?.zcr),
      lowRatio: positiveNumberOrNull(feature?.lowRatio),
      midRatio: positiveNumberOrNull(feature?.midRatio),
      highRatio: positiveNumberOrNull(feature?.highRatio),
      flatness: positiveNumberOrNull(feature?.flatness),
      rolloff: positiveNumberOrNull(feature?.rolloff)
    };
  }

  function updateSpeakerProfile(profile, feature) {
    if (!profile || !feature) return;
    const previousSamples = Math.max(0, profile.samples || 0);
    // Sporije učenje nakon prvih nekoliko uzoraka sprječava da kratki šum promijeni profil glasa.
    const alpha = previousSamples < 3 ? .42 : previousSamples < 10 ? .22 : .11;
    const next = featureToVoiceMean(feature);
    for (const key of ['pitch', 'pitchStd', 'centroid', 'zcr', 'lowRatio', 'midRatio', 'highRatio', 'flatness', 'rolloff']) {
      if (next[key] == null) continue;
      profile.voice[key] = profile.voice[key] == null ? next[key] : profile.voice[key] * (1 - alpha) + next[key] * alpha;
    }
    profile.samples = previousSamples + 1;
    profile.lastSeenAt = Date.now();
  }

  function voiceDistance(feature, profile) {
    if (!feature || !profile?.voice) return Number.POSITIVE_INFINITY;
    let score = 0;
    let weight = 0;
    const add = (delta, w) => { if (Number.isFinite(delta)) { score += delta * delta * w; weight += w; } };

    if (feature.pitch && profile.voice.pitch) add(Math.log2(feature.pitch / profile.voice.pitch) / .34, 1.55);
    if (feature.pitchStd != null && profile.voice.pitchStd != null) add((feature.pitchStd - profile.voice.pitchStd) / 38, .48);
    if (feature.centroid != null && profile.voice.centroid != null) add((feature.centroid - profile.voice.centroid) / 760, 1.15);
    if (feature.zcr != null && profile.voice.zcr != null) add((feature.zcr - profile.voice.zcr) / .045, .65);
    if (feature.lowRatio != null && profile.voice.lowRatio != null) add((feature.lowRatio - profile.voice.lowRatio) / .13, .62);
    if (feature.midRatio != null && profile.voice.midRatio != null) add((feature.midRatio - profile.voice.midRatio) / .16, .55);
    if (feature.highRatio != null && profile.voice.highRatio != null) add((feature.highRatio - profile.voice.highRatio) / .12, .8);
    if (feature.flatness != null && profile.voice.flatness != null) add((feature.flatness - profile.voice.flatness) / .075, .5);
    if (feature.rolloff != null && profile.voice.rolloff != null) add((feature.rolloff - profile.voice.rolloff) / 1150, .78);
    return weight ? Math.sqrt(score / weight) : Number.POSITIVE_INFINITY;
  }

  function nextAvailableSpeakerId(limit = modeSpeakerLimit()) {
    const safeLimit = clamp(Number(limit) || MAX_AUTO_SPEAKERS, 1, MAX_AUTO_SPEAKERS);
    return Array.from({ length: safeLimit }, (_value, index) => index + 1)
      .find(id => !current.speakers.some(profile => profile.id === id)) || null;
  }

  function normalizePhraseKey(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/\p{M}+/gu, '')
      .toLocaleLowerCase('hr-HR')
      .replace(/[^\p{L}'’\- ]+/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  }





  function resolveSpeaker(feature, _text = '') {
    const now = Date.now();
    if (!Array.isArray(current.speakers)) current.speakers = [];

    if (!feature || feature.quality < .2) {
      return ensureSpeakerProfile(activeSpeaker || 1).id;
    }

    if (!current.speakers.length) {
      const first = ensureSpeakerProfile(1, feature);
      activeSpeaker = first.id;
      lastSpeakerDecisionAt = now;
      renderSpeakerLabels();
      return first.id;
    }

    const activeForLearning = current.speakers.find(item => item.id === activeSpeaker);
    if (activeForLearning && (activeForLearning.samples || 0) === 0) {
      updateSpeakerProfile(activeForLearning, feature);
      activeSpeaker = activeForLearning.id;
      lastSpeakerDecisionAt = now;
      renderSpeakerLabels();
      return activeForLearning.id;
    }

    const ranked = current.speakers
      .map(profile => ({ profile, distance: voiceDistance(feature, profile) }))
      .sort((a, b) => a.distance - b.distance);
    let chosen = ranked[0]?.profile || current.speakers[0];
    const nearestDistance = ranked[0]?.distance ?? Number.POSITIVE_INFINITY;
    const currentActiveProfile = current.speakers.find(item => item.id === activeSpeaker);
    const activeDistance = currentActiveProfile ? voiceDistance(feature, currentActiveProfile) : Number.POSITIVE_INFINITY;
    const gapSincePreviousFinal = lastFinalAt ? now - lastFinalAt : Number.POSITIVE_INFINITY;

    if (currentActiveProfile &&
        now - lastSpeakerDecisionAt < (preferences.mode === 'lecture' ? 980 : preferences.mode === 'doctor' ? 760 : SPEAKER_HYSTERESIS_MS) &&
        activeDistance <= Math.max(1.12, nearestDistance + .18)) {
      chosen = currentActiveProfile;
    } else {
      const newSpeakerThreshold = preferences.mode === 'lecture'
        ? (current.speakers.length === 1 ? 1.46 : 1.58)
        : preferences.mode === 'doctor' || preferences.mode === 'work'
          ? (current.speakers.length === 1 ? 1.62 : 1.72)
          : (current.speakers.length === 1 ? 1.70 : 1.82);
      const enoughSeparation = nearestDistance > newSpeakerThreshold;
      const turnBoundary = gapSincePreviousFinal > 520 || activeDistance > newSpeakerThreshold + .28;
      const shouldCreate = enoughSeparation && turnBoundary && feature.quality >= .34 &&
        current.speakers.length < modeSpeakerLimit();
      if (shouldCreate) {
        const nextId = nextAvailableSpeakerId();
        if (nextId) chosen = ensureSpeakerProfile(nextId, feature);
      }
    }

    if ((chosen.samples || 0) === 0 ||
        !(chosen.samples === 1 && chosen.lastSeenAt && now - chosen.lastSeenAt < 120)) {
      updateSpeakerProfile(chosen, feature);
    }
    activeSpeaker = chosen.id;
    lastSpeakerDecisionAt = now;
    renderSpeakerLabels();
    return chosen.id;
  }





















  function modePhraseList() {
    const data = activeModeProfile();
    const canonicalTerms = SYSTEM_CANONICAL_TERMS.map(entry => entry.canonical);
    const values = [...CORE_CROATIAN_PHRASES, ...(data.phrases || []), ...canonicalTerms, ...(preferences.vocabulary || [])];
    return [...new Set(values.map(value => String(value || '').normalize('NFC').trim()).filter(Boolean))].slice(0, 120);
  }

  function phraseOccurs(text, phrase) {
    const source = normalizePhraseKey(text);
    const key = normalizePhraseKey(phrase);
    return Boolean(key && (` ${source} `).includes(` ${key} `));
  }

  function modeAlternativeBonus(text) {
    const data = activeModeProfile();
    let hits = 0;
    for (const phrase of data.phrases || []) {
      if (phraseOccurs(text, phrase)) hits += phrase.includes(' ') ? 1.35 : 1;
    }
    let bonus = Math.min(.18, hits * .035);
    if (preferences.mode === 'doctor' && /\b\d+(?:[.,]\d+)?\s*(?:mg|ml|g|kg|mmhg|°?c)\b/iu.test(text)) bonus += .06;
    if (preferences.mode === 'lecture' && String(text).trim().split(/\s+/).length >= 10) bonus += .025;
    return bonus;
  }

  function coreCroatianPhraseBonus(text) {
    let hits = 0;
    for (const phrase of CORE_CROATIAN_PHRASES) {
      if (phraseOccurs(text, phrase)) hits += phrase.includes(' ') ? 1.4 : 1;
    }
    return Math.min(.26, hits * .055);
  }

  function applyContextualBias(instance) {
    if (activeSpeechLanguage() !== 'hr-HR') return false;
    if (contextualBiasDisabled || !instance || !('phrases' in instance) || typeof window.SpeechRecognitionPhrase !== 'function') return false;
    try {
      const data = activeModeProfile();
      const phrases = modePhraseList().map(phrase => {
        const isCore = CORE_CROATIAN_PHRASES.some(core => normalizePhraseKey(core) === normalizePhraseKey(phrase));
        const boost = isCore ? Math.max(6.5, data.phraseBoost || 2) : (data.phraseBoost || 2);
        return new window.SpeechRecognitionPhrase(phrase, clamp(boost, 0, 10));
      });
      if (instance.phrases && typeof instance.phrases.splice === 'function') {
        instance.phrases.splice(0, instance.phrases.length, ...phrases);
      } else {
        instance.phrases = phrases;
      }
      return true;
    } catch {
      contextualBiasDisabled = true;
      return false;
    }
  }

  function isDoctorCriticalText(text) {
    if (preferences.mode !== 'doctor') return false;
    const data = modeData.doctor;
    if (/\b\d+(?:[.,]\d+)?\s*(?:mg|ml|g|kg|mmhg|°?c)\b/iu.test(text)) return true;
    return (data.criticalTerms || []).some(term => phraseOccurs(text, term));
  }

  function segmentReviewThreshold(segment) {
    const data = activeSessionModeProfile();
    if (segment?.type !== 'speech') return 0;
    if (current.mode === 'doctor' && isDoctorCriticalText(segment.text)) return data.criticalConfidence || .88;
    return data.reviewConfidence || .62;
  }

  function updateModeSpeakerRole(speakerId, text) {
    if (!speakerId || !text) return;
    const words = String(text).trim().split(/\s+/).filter(Boolean).length;
    const evidence = speakerRoleEvidence.get(speakerId) || { doctor: 0, lectureWords: 0, lectureTurns: 0 };

    if (current.mode === 'doctor') {
      const clinicianPatterns = [
        /\b(?:propisat|propisujem|preporučujem|uzimajte|uzmi|terapija|doza|nalaz|pregled|kontrola|uputnica|recept|dijagnoza|trebate|dođite|javite se|izmjerit ćemo|poslušat ću)\b/iu,
        /\b(?:jednom|dva|tri)\s+puta\s+dnevno\b/iu,
        /\b\d+(?:[.,]\d+)?\s*(?:mg|ml|mmhg)\b/iu
      ];
      evidence.doctor += clinicianPatterns.reduce((sum, pattern) => sum + (pattern.test(text) ? 1 : 0), 0);
      speakerRoleEvidence.set(speakerId, evidence);
      const ranked = [...speakerRoleEvidence.entries()].sort((a, b) => (b[1].doctor || 0) - (a[1].doctor || 0));
      if ((ranked[0]?.[1].doctor || 0) >= 2 && (ranked[0]?.[1].doctor || 0) >= (ranked[1]?.[1].doctor || 0) + 1) doctorSpeakerId = ranked[0][0];
    } else if (current.mode === 'lecture') {
      evidence.lectureWords += words;
      evidence.lectureTurns += 1;
      speakerRoleEvidence.set(speakerId, evidence);
      const ranked = [...speakerRoleEvidence.entries()].sort((a, b) => (b[1].lectureWords || 0) - (a[1].lectureWords || 0));
      const leader = ranked[0];
      const runner = ranked[1];
      if ((leader?.[1].lectureWords || 0) >= 24 && (leader?.[1].lectureTurns || 0) >= 2 &&
          (leader?.[1].lectureWords || 0) >= Math.max(16, (runner?.[1].lectureWords || 0) * 1.35)) {
        lectureSpeakerId = leader[0];
      }
    }
  }

  function resetModeSpeakerRoles() {
    doctorSpeakerId = null;
    lectureSpeakerId = null;
    speakerRoleEvidence = new Map();
  }

  function selectBestRecognitionAlternative(result) {
    if (!result?.length) return { text: '', confidence: .0, score: .0, index: 0 };

    const limit = Math.min(result.length, clamp(activeModeProfile().maxAlternatives || 3, 1, 5));
    let best = null;
    for (let index = 0; index < limit; index += 1) {
      const alternative = result[index];
      const rawTranscript = String(alternative?.transcript || '').normalize('NFC').trim();
      if (!rawTranscript) continue;
      const text = normalizeRecognizedText(rawTranscript, false);
      const hasConfidence = Number.isFinite(alternative?.confidence) && alternative.confidence > 0;
      const confidence = hasConfidence ? clamp(alternative.confidence, 0, 1) : Math.max(.55, .78 - index * .045);
      const languageBonus = activeSpeechLanguage() === 'hr-HR' ? coreCroatianPhraseBonus(text) + recognitionCroatianScore(text) : 0;
      const score = confidence + modeAlternativeBonus(text) + languageBonus;
      const candidate = { text, confidence, score, index };
      if (!best || candidate.score > best.score + .012 || (Math.abs(candidate.score - best.score) <= .012 && index < best.index)) best = candidate;
    }
    return best || { text: '', confidence: .0, score: .0, index: 0 };
  }



  function plainSpeechText(value) {
    return normalizeRecognizedText(value, false).replace(/[.!?…]+$/u, '').trim();
  }

  function comparableSpeechToken(value) {
    return String(value || '')
      .toLocaleLowerCase('hr-HR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9čćžšđ]+/giu, '');
  }

  function mergeSpeechChunks(baseText, nextText) {
    const base = plainSpeechText(baseText);
    const next = plainSpeechText(nextText);
    if (!base) return next;
    if (!next) return base;

    const baseWords = base.split(/\s+/).filter(Boolean);
    const nextWords = next.split(/\s+/).filter(Boolean);
    const baseComparable = baseWords.map(comparableSpeechToken);
    const nextComparable = nextWords.map(comparableSpeechToken);

    // Browser pri internom restartu ponekad ponovno pošalje zadnjih nekoliko riječi.
    // Tražimo preklapanje kraja prethodnog i početka novog chunka i dodajemo samo novo.
    const maxOverlap = Math.min(16, baseWords.length, nextWords.length);
    for (let overlap = maxOverlap; overlap >= 1; overlap -= 1) {
      let equal = true;
      for (let i = 0; i < overlap; i += 1) {
        if (baseComparable[baseComparable.length - overlap + i] !== nextComparable[i]) {
          equal = false;
          break;
        }
      }
      if (equal) return [...baseWords, ...nextWords.slice(overlap)].join(' ');
    }

    // Potpuno ponovljen kratki final nakon restarta ne dodaj dvaput.
    const baseTail = baseWords.slice(-Math.min(12, baseWords.length)).join(' ');
    if (recognitionTextSimilarity(baseTail, next) >= .93) return base;
    return `${base} ${next}`.replace(/\s+/g, ' ').trim();
  }

  function beginManualParagraph() {
    manualParagraph = {
      startedAt: Date.now(),
      finalText: '',
      interimText: '',
      speaker: null,
      confidences: []
    };
    interimText = '';
    recognitionCycleInterim = '';
    renderTranscript();
  }

  function manualParagraphLiveText(nextInterim = '') {
    if (!manualParagraph) return plainSpeechText(nextInterim);
    return mergeSpeechChunks(manualParagraph.finalText, nextInterim || manualParagraph.interimText || '');
  }

  function appendManualParagraphFinal(text, confidence = .75, speakerId = activeSpeaker) {
    if (!manualParagraph) beginManualParagraph();
    const chunk = plainSpeechText(text);
    if (!chunk) return null;
    manualParagraph.finalText = mergeSpeechChunks(manualParagraph.finalText, chunk);
    manualParagraph.interimText = '';
    if (!manualParagraph.speaker) manualParagraph.speaker = clamp(Math.round(Number(speakerId) || 1), 1, MAX_AUTO_SPEAKERS);
    manualParagraph.confidences.push(clamp(Number(confidence) || .75, 0, 1));
    interimText = manualParagraphLiveText('');
    renderTranscript();
    return null;
  }

  function finalizeManualParagraph(includeInterim = true) {
    if (!manualParagraph) return null;
    let combined = manualParagraph.finalText;
    if (includeInterim) {
      const tail = recognitionCycleInterim || manualParagraph.interimText || '';
      combined = mergeSpeechChunks(combined, tail);
    }
    const paragraph = manualParagraph;
    manualParagraph = null;
    interimText = '';
    recognitionCycleInterim = '';
    cancelInterimCommit();

    const text = normalizeRecognizedText(combined, true);
    if (!text) {
      renderTranscript();
      return null;
    }
    const confidence = paragraph.confidences.length
      ? paragraph.confidences.reduce((sum, value) => sum + value, 0) / paragraph.confidences.length
      : .62;
    return addSegment(text, confidence, paragraph.speaker || activeSpeaker, 'speech', {
      utteranceSerial: ++utteranceSerial,
      manualBoundary: true
    });
  }

  function discardManualParagraph() {
    manualParagraph = null;
    interimText = '';
    recognitionCycleInterim = '';
    cancelInterimCommit();
    renderTranscript();
  }

  function createVoiceAccumulator() {
    return {
      frames: 0, pitchFrames: 0, pitch: 0, pitchSq: 0, pitchConfidence: 0,
      centroid: 0, zcr: 0, lowRatio: 0, midRatio: 0, highRatio: 0,
      flatness: 0, rolloff: 0, rms: 0
    };
  }

  function resetVoiceAccumulator() {
    voiceAccumulator = createVoiceAccumulator();
  }

  function accumulateVoiceFeature(feature) {
    if (!feature || feature.rms < .003) return;
    voiceAccumulator.frames += 1;
    voiceAccumulator.centroid += feature.centroid;
    voiceAccumulator.zcr += feature.zcr;
    voiceAccumulator.lowRatio += feature.lowRatio;
    voiceAccumulator.midRatio += feature.midRatio;
    voiceAccumulator.highRatio += feature.highRatio;
    voiceAccumulator.flatness += feature.flatness;
    voiceAccumulator.rolloff += feature.rolloff;
    voiceAccumulator.rms += feature.rms;
    if (feature.pitch && feature.pitchConfidence > .34) {
      voiceAccumulator.pitchFrames += 1;
      voiceAccumulator.pitch += feature.pitch;
      voiceAccumulator.pitchSq += feature.pitch * feature.pitch;
      voiceAccumulator.pitchConfidence += feature.pitchConfidence;
    }
  }

  function snapshotVoiceFeature() {
    const a = voiceAccumulator;
    if (!a.frames) return null;
    const voicedRatio = a.pitchFrames / a.frames;
    const pitchMean = a.pitchFrames ? a.pitch / a.pitchFrames : null;
    const pitchVariance = a.pitchFrames && pitchMean != null
      ? Math.max(0, a.pitchSq / a.pitchFrames - pitchMean * pitchMean)
      : null;
    return {
      pitch: pitchMean,
      pitchStd: pitchVariance == null ? null : Math.sqrt(pitchVariance),
      pitchConfidence: a.pitchFrames ? a.pitchConfidence / a.pitchFrames : 0,
      centroid: a.centroid / a.frames,
      zcr: a.zcr / a.frames,
      lowRatio: a.lowRatio / a.frames,
      midRatio: a.midRatio / a.frames,
      highRatio: a.highRatio / a.frames,
      flatness: a.flatness / a.frames,
      rolloff: a.rolloff / a.frames,
      rms: a.rms / a.frames,
      quality: clamp(.22 + Math.min(1, a.frames / 7) * .34 + voicedRatio * .26 + Math.min(1, (a.rms / a.frames) / .045) * .18, 0, 1)
    };
  }

  function beginUtterance(now = Date.now(), forceNew = false) {
    // browserov onspeechstart i naš VAD često prijave isti početak. VAD ipak smije
    // otvoriti novu rečenicu odmah nakon stvarne pauze, čak i kod brzog razgovora.
    if (!forceNew && utteranceStartedAt && now - utteranceStartedAt < 700) return;
    if (forceNew && utteranceStartedAt && now - utteranceStartedAt < 140) return;
    sealProvisionalSegment();
    utteranceSerial += 1;
    utteranceStartedAt = now;
    interimChangedAt = now;
    if (shouldListen && SpeechRecognition && !browserRecognitionDisabled && !recognition && !restartTimer) {
      scheduleRecognitionStart(60, 'Čujem govor — pokrećem diktiranje…');
    }
  }

  function sealProvisionalSegment() {
    if (!lastProvisionalSegment) return;
    const segment = current?.segments?.find(item => item.id === lastProvisionalSegment.id);
    if (segment) {
      segment.provisional = false;
      persistCurrent(true);
    }
    lastProvisionalSegment = null;
  }

  function recognitionTextSimilarity(a, b) {
    const normalize = value => String(value || '')
      .toLocaleLowerCase('hr-HR')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim()
      .replace(/\s+/g, ' ');
    const left = normalize(a);
    const right = normalize(b);
    if (!left || !right) return 0;
    if (left === right) return 1;
    if (left.includes(right) || right.includes(left)) return Math.min(left.length, right.length) / Math.max(left.length, right.length);
    const compactLeft = left.replace(/\s+/g, '');
    const compactRight = right.replace(/\s+/g, '');
    const distance = simpleEditDistance(compactLeft, compactRight);
    return 1 - distance / Math.max(compactLeft.length, compactRight.length, 1);
  }

  function cancelInterimCommit() {
    if (interimCommitTimer) clearTimeout(interimCommitTimer);
    interimCommitTimer = null;
  }

  function upsertProvisionalSegment(text, confidence = .58) {
    const normalized = normalizeRecognizedText(text, true);
    if (!normalized) return null;
    const now = Date.now();
    const feature = (audioVadActive ? snapshotVoiceFeature() : null) || pendingVoiceFeature;
    const speakerId = resolveSpeaker(feature, normalized);
    const existing = lastProvisionalSegment && current.segments.find(item => item.id === lastProvisionalSegment.id);

    if (existing && lastProvisionalSegment.serial === utteranceSerial && now - lastProvisionalSegment.createdAt < 12000) {
      existing.text = normalized;
      existing.confidence = Math.max(existing.confidence || 0, confidence);
      existing.speaker = speakerId;
      existing.provisional = true;
      lastProvisionalSegment.text = normalized;
      lastProvisionalSegment.createdAt = now;
      interimText = '';
      persistCurrent(false);
      renderSpeakerLabels();
      renderTranscript();
      return existing;
    }

    const segment = addSegment(normalized, confidence, speakerId, 'speech');
    if (!segment) return null;
    segment.provisional = true;
    lastProvisionalSegment = { id: segment.id, serial: utteranceSerial, createdAt: now, text: segment.text };
    persistCurrent(false);
    renderTranscript();
    return segment;
  }

  function scheduleInterimCommit(_delay = INTERIM_STABLE_COMMIT_MS) {
    // 3.9.0: interim je isključivo live caption. Nikad ga ne pretvaramo u trajni red.
    // Time izbjegavamo fragmente poput "Naravno", "Stoga" ili pola rečenice
    // kada browser nekoliko stotina ms kasnije pošalje ispravan finalni rezultat.
    cancelInterimCommit();
  }

  function commitFinalRecognition(text, confidence, speakerId, serial = utteranceSerial) {
    cancelInterimCommit();
    if (manualParagraph) return appendManualParagraphFinal(text, confidence, speakerId);
    const normalized = normalizeRecognizedText(text, true);
    if (!normalized) return null;
    const now = Date.now();

    const aiFallbackSegment = [...current.segments].reverse()
      .find(item => item.type === 'speech' && item.aiFallback && item.utteranceSerial === serial && now - item.createdAt < 15000);
    if (aiFallbackSegment && !aiFallbackSegment.userEdited) {
      // Migracija iz 3.7/3.8: ako u aktivnoj sesiji postoji stari AI-only red,
      // prvi pravi browser final ga potpuno zamjenjuje umjesto da čuva AI tekst.
      aiFallbackSegment.originalText = aiFallbackSegment.text;
      aiFallbackSegment.text = normalized;
      aiFallbackSegment.confidence = clamp(Number(confidence) || .75, 0, 1);
      aiFallbackSegment.speaker = speakerId || aiFallbackSegment.speaker;
      aiFallbackSegment.aiFallback = false;
      aiFallbackSegment.aiRefined = false;
      aiFallbackSegment.aiSuggestion = '';
      aiFallbackSegment.requiresReview = false;
      aiFallbackSegment.provisional = false;
      lastFinalText = normalized;
      lastFinalAt = now;
      persistCurrent(true);
      renderTranscript();
      return aiFallbackSegment;
    }

    const provisional = lastProvisionalSegment && current.segments.find(item => item.id === lastProvisionalSegment.id);
    const similarity = provisional ? recognitionTextSimilarity(provisional.text, normalized) : 0;
    const canReplace = provisional && now - lastProvisionalSegment.createdAt < 9000 &&
      (lastProvisionalSegment.serial === serial || similarity >= .52);

    if (canReplace) {
      provisional.text = normalized;
      provisional.confidence = clamp(Number(confidence) || .75, 0, 1);
      provisional.speaker = speakerId;
      provisional.provisional = false;
      provisional.utteranceSerial = serial;
      lastFinalText = normalized;
      lastFinalAt = now;
      updateModeSpeakerRole(speakerId, normalized);
      lastProvisionalSegment = null;
      interimText = '';
      persistCurrent(true);
      renderSpeakerLabels();
      renderTranscript();
      if (containsUrgentWord(normalized)) showToast('Važna riječ je označena u prijepisu.', 3200);
      return provisional;
    }

    sealProvisionalSegment();
    return addSegment(normalized, confidence, speakerId, 'speech', { utteranceSerial: serial });
  }

  function updateAudioVoiceActivity(feature, now = Date.now()) {
    if (!feature || !Number.isFinite(feature.rms)) return;

    // Pozadinsku buku učimo samo iz stvarno tihih kadrova. Brže prilagođavanje prema
    // nižoj razini čuva tih i udaljen govor, ali sporije raste kako klima/buka ne bi
    // odjednom postala novi prag za govor.
    if (!audioVadActive && feature.rms < Math.max(.020, noiseFloorRms * 2.0)) {
      const alpha = feature.rms < noiseFloorRms ? .045 : .010;
      noiseFloorRms = clamp(noiseFloorRms * (1 - alpha) + feature.rms * alpha, .0018, .016);
    }

    const vad = activeModeProfile().vad || modeData.social.vad;
    const startThreshold = clamp(noiseFloorRms * vad.noiseMultiplier + vad.bias, vad.min, vad.max);
    const continueThreshold = Math.max(vad.min * .72, startThreshold * .68);
    const threshold = audioVadActive ? continueThreshold : startThreshold;

    // Ne oslanjamo se samo na pitch: šapat, brzi suglasnici i tihi udaljeni govor
    // često nemaju stabilan fundamentalni ton. Spektralna raspodjela i ZCR daju
    // tolerantniji signal bez toga da svaki šum postane govor.
    const voiceShape =
      feature.pitchConfidence >= .10 ||
      (feature.zcr < .30 && feature.midRatio > .10) ||
      (feature.flatness < .68 && feature.highRatio < .76);
    const isVoiceFrame = feature.rms >= threshold && voiceShape;

    if (isVoiceFrame) {
      if (!audioVadActive) {
        audioVadActive = true;
        audioVadSilenceStartedAt = 0;
        pendingVoiceFeature = null;
        lastAudioVoiceStartAt = now;
        if (!neuralVadReady) beginUtterance(now, true);
        resetVoiceAccumulator();
      }
      lastAudioVoiceAt = now;
      audioVadSilenceStartedAt = 0;
      accumulateVoiceFeature(feature);
      return;
    }

    if (!audioVadActive) return;
    if (!audioVadSilenceStartedAt) audioVadSilenceStartedAt = now;

    // Prirodne kratke pauze i udasi ostaju u istoj rečenici. Profil predavanja ima
    // nešto duži hangover, dok razgovor i dalje može brzo prebaciti na drugu osobu.
    if (now - audioVadSilenceStartedAt < (vad.hangover || 390)) return;

    const snapshot = snapshotVoiceFeature();
    if (snapshot?.quality >= .16) pendingVoiceFeature = snapshot;
    resetVoiceAccumulator();
    audioVadActive = false;
    audioVadSilenceStartedAt = 0;
    if (interimText) scheduleInterimCommit(300);
  }

  function extractVoiceFeature(timeData, freqData, sampleRate) {
    if (!timeData?.length || !freqData?.length || !sampleRate) return null;
    let rmsSum = 0;
    let crossings = 0;
    let previous = timeData[0] || 0;
    for (let i = 0; i < timeData.length; i += 1) {
      const value = timeData[i];
      rmsSum += value * value;
      if (i && ((value >= 0) !== (previous >= 0))) crossings += 1;
      previous = value;
    }
    const rms = Math.sqrt(rmsSum / timeData.length);
    const zcr = crossings / Math.max(1, timeData.length - 1);

    const binHz = sampleRate / (freqData.length * 2);
    let magnitudeSum = 0;
    let weighted = 0;
    let lowMagnitude = 0;
    let midMagnitude = 0;
    let highMagnitude = 0;
    let logMagnitudeSum = 0;
    let magnitudeCount = 0;
    const bins = [];
    for (let i = 1; i < freqData.length; i += 1) {
      const hz = i * binHz;
      if (hz < 90 || hz > 6500) continue;
      const magnitude = Math.pow(10, freqData[i] / 20);
      if (!Number.isFinite(magnitude) || magnitude <= 0) continue;
      magnitudeSum += magnitude;
      weighted += magnitude * hz;
      if (hz < 500) lowMagnitude += magnitude;
      else if (hz < 2500) midMagnitude += magnitude;
      else highMagnitude += magnitude;
      logMagnitudeSum += Math.log(Math.max(magnitude, 1e-12));
      magnitudeCount += 1;
      bins.push([hz, magnitude]);
    }
    const centroid = magnitudeSum ? weighted / magnitudeSum : 0;
    const lowRatio = magnitudeSum ? lowMagnitude / magnitudeSum : 0;
    const midRatio = magnitudeSum ? midMagnitude / magnitudeSum : 0;
    const highRatio = magnitudeSum ? highMagnitude / magnitudeSum : 0;
    const arithmeticMean = magnitudeCount ? magnitudeSum / magnitudeCount : 0;
    const geometricMean = magnitudeCount ? Math.exp(logMagnitudeSum / magnitudeCount) : 0;
    const flatness = arithmeticMean ? clamp(geometricMean / arithmeticMean, 0, 1) : 0;
    let rolloff = centroid;
    if (magnitudeSum) {
      const target = magnitudeSum * .85;
      let cumulative = 0;
      for (const [hz, magnitude] of bins) {
        cumulative += magnitude;
        if (cumulative >= target) { rolloff = hz; break; }
      }
    }

    const pitchResult = estimatePitch(timeData, sampleRate, rms);
    return {
      rms,
      zcr,
      centroid,
      lowRatio,
      midRatio,
      highRatio,
      flatness,
      rolloff,
      pitch: pitchResult.pitch,
      pitchConfidence: pitchResult.confidence
    };
  }

  function estimatePitch(buffer, sampleRate, rms) {
    if (rms < .008) return { pitch: null, confidence: 0 };
    const minLag = Math.max(2, Math.floor(sampleRate / 420));
    const maxLag = Math.min(buffer.length - 2, Math.floor(sampleRate / 70));
    let bestLag = 0;
    let bestCorrelation = 0;

    // Korak 2 smanjuje CPU opterećenje bez primjetnog gubitka za klasifikaciju govornika.
    for (let lag = minLag; lag <= maxLag; lag += 2) {
      let sum = 0;
      let normA = 0;
      let normB = 0;
      const limit = buffer.length - lag;
      for (let i = 0; i < limit; i += 2) {
        const a = buffer[i];
        const b = buffer[i + lag];
        sum += a * b;
        normA += a * a;
        normB += b * b;
      }
      const correlation = sum / Math.sqrt(Math.max(1e-10, normA * normB));
      if (correlation > bestCorrelation) {
        bestCorrelation = correlation;
        bestLag = lag;
      }
    }
    return bestCorrelation >= .38 && bestLag
      ? { pitch: sampleRate / bestLag, confidence: clamp((bestCorrelation - .32) / .68, 0, 1) }
      : { pitch: null, confidence: bestCorrelation };
  }

  function formatTime(timestamp) {
    return new Intl.DateTimeFormat('hr-HR', { hour: '2-digit', minute: '2-digit' }).format(timestamp);
  }

  function formatDate(timestamp) {
    return new Intl.DateTimeFormat('hr-HR', { day: '2-digit', month: 'short' }).format(timestamp);
  }

  function formatElapsed(seconds) {
    const safe = Math.max(0, Number(seconds) || 0);
    return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
  }

  function containsUrgentWord(text) {
    const lower = String(text).toLocaleLowerCase('hr-HR');
    return preferences.urgentWords.some(word => {
      const pattern = new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegex(word.toLocaleLowerCase('hr-HR'))}([^\\p{L}\\p{N}]|$)`, 'u');
      return pattern.test(lower);
    });
  }

  function renderHighlightedText(element, text) {
    element.textContent = '';
    const words = preferences.urgentWords.filter(Boolean).sort((a, b) => b.length - a.length);
    if (!words.length) {
      element.textContent = text;
      return;
    }
    const pattern = new RegExp(`(${words.map(escapeRegex).join('|')})`, 'giu');
    let cursor = 0;
    for (const match of text.matchAll(pattern)) {
      if (match.index > cursor) element.append(document.createTextNode(text.slice(cursor, match.index)));
      const mark = document.createElement('mark');
      mark.textContent = match[0];
      element.append(mark);
      cursor = match.index + match[0].length;
    }
    if (cursor < text.length) element.append(document.createTextNode(text.slice(cursor)));
  }

  function scheduleSessionsRender() {
    if (sessionRenderTimer) return;
    sessionRenderTimer = window.setTimeout(() => {
      sessionRenderTimer = null;
      renderSessions();
    }, 320);
  }

  function persistCurrent(saveToHistory = false) {
    current.mode = preferences.mode;
    saveJson(STORAGE.current, current);
    if (saveToHistory && current.segments.length) {
      // Aktivni razgovor držimo kao isti objekt u memoriji. Stara verzija je pri svakoj
      // rečenici sinkrono klonirala cijeli transcript, što je nakon stotina redaka
      // postajalo sve skuplje i moglo usporiti live prijepis.
      sessions = [current, ...sessions.filter(item => item.id !== current.id)].slice(0, 20);
      saveJson(STORAGE.sessions, sessions);
      scheduleSessionsRender();
    }
  }

  function getSessionTitle(session) {
    const first = session.segments.find(segment => segment.type === 'speech')?.text || session.segments[0]?.text;
    if (first) return first.length > 37 ? `${first.slice(0, 37)}…` : first;
    return `${modeData[session.mode]?.label || 'Razgovor'} · ${formatDate(session.createdAt)}`;
  }

  function renderSessions() {
    renderSessionList(dom.sessionList, false);
    renderSessionList(dom.mobileSessionList, true);
  }

  function renderSessionList(container, mobile) {
    if (openSwipeRow?.isConnected) closeSwipeRow(openSwipeRow);
    openSwipeRow = null;
    container.textContent = '';
    if (!sessions.length) {
      const p = document.createElement('p');
      p.className = 'empty-history';
      p.textContent = 'Još nema spremljenih razgovora.';
      container.append(p);
      return;
    }

    for (const session of sessions) {
      const row = document.createElement('div');
      row.className = 'session-swipe-row';
      row.dataset.sessionId = session.id;

      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'session-delete-action';
      deleteButton.setAttribute('aria-label', `Obriši razgovor: ${getSessionTitle(session)}`);
      deleteButton.title = 'Obriši razgovor';
      const deleteLabel = document.createElement('span');
      deleteLabel.textContent = 'Obriši';
      deleteButton.append(createSvg('i-trash'), deleteLabel);

      const openButton = document.createElement('button');
      openButton.type = 'button';
      openButton.className = 'session-open-button';
      openButton.classList.toggle('active', session.id === current.id);
      openButton.title = mobile ? 'Povuci ulijevo za brisanje' : 'Otvori razgovor';

      if (mobile) {
        const textWrap = document.createElement('span');
        const strong = document.createElement('strong');
        const small = document.createElement('small');
        strong.textContent = getSessionTitle(session);
        small.textContent = `${modeData[session.mode]?.label || 'Razgovor'} · ${formatDate(session.createdAt)}`;
        textWrap.append(strong, small);
        openButton.append(textWrap, createSvg('i-chevron'));
      } else {
        const title = document.createElement('span');
        title.className = 'session-title';
        title.textContent = getSessionTitle(session);
        const meta = document.createElement('span');
        meta.className = 'session-meta';
        meta.textContent = `${modeData[session.mode]?.label || 'Razgovor'} · ${formatDate(session.createdAt)}`;
        openButton.append(title, meta);
      }

      openButton.addEventListener('click', () => openSession(session.id));
      deleteButton.addEventListener('click', event => {
        event.stopPropagation();
        deleteSession(session.id);
      });

      row.append(deleteButton, openButton);
      container.append(row);
    }
  }

  function bindSessionSwipe(row, openButton) {
    let startX = 0;
    let startY = 0;
    let startOffset = 0;
    let dragging = false;
    let horizontalGesture = false;
    const maxReveal = 88;

    openButton.addEventListener('pointerdown', event => {
      if (event.pointerType === 'mouse' && event.button !== 0) return;
      startX = event.clientX;
      startY = event.clientY;
      startOffset = row.classList.contains('swipe-open') ? -maxReveal : 0;
      dragging = true;
      horizontalGesture = false;
      row.dataset.suppressClick = 'false';
    });

    openButton.addEventListener('pointermove', event => {
      if (!dragging) return;
      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;

      if (!horizontalGesture) {
        if (Math.abs(deltaY) > Math.abs(deltaX) && Math.abs(deltaY) > 7) {
          dragging = false;
          return;
        }
        if (Math.abs(deltaX) < 7) return;
        horizontalGesture = true;
        if (openSwipeRow && openSwipeRow !== row) closeSwipeRow(openSwipeRow);
        openButton.setPointerCapture?.(event.pointerId);
      }

      event.preventDefault();
      const offset = clamp(startOffset + deltaX, -maxReveal, 0);
      row.style.setProperty('--swipe-offset', `${offset}px`);
      row.classList.add('is-swiping');
      row.dataset.suppressClick = 'true';
    });

    const finishSwipe = event => {
      if (!dragging && !horizontalGesture) return;
      dragging = false;
      row.classList.remove('is-swiping');
      if (!horizontalGesture) return;
      const deltaX = event.clientX - startX;
      const finalOffset = clamp(startOffset + deltaX, -maxReveal, 0);
      if (finalOffset <= -44) openSwipe(row);
      else closeSwipeRow(row);
      window.setTimeout(() => { row.dataset.suppressClick = 'false'; }, 0);
    };

    openButton.addEventListener('pointerup', finishSwipe);
    openButton.addEventListener('pointercancel', () => {
      dragging = false;
      horizontalGesture = false;
      row.classList.remove('is-swiping');
      if (row.classList.contains('swipe-open')) openSwipe(row);
      else closeSwipeRow(row);
    });
  }

  function openSwipe(row) {
    if (openSwipeRow && openSwipeRow !== row) closeSwipeRow(openSwipeRow);
    row.classList.add('swipe-open');
    row.style.setProperty('--swipe-offset', '-88px');
    openSwipeRow = row;
  }

  function closeSwipeRow(row) {
    if (!row) return;
    row.classList.remove('swipe-open', 'is-swiping');
    row.style.setProperty('--swipe-offset', '0px');
    if (openSwipeRow === row) openSwipeRow = null;
  }

  function deleteSession(id) {
    const session = sessions.find(item => item.id === id);
    if (!session) return;
    const title = getSessionTitle(session);
    if (!window.confirm(`Obrisati razgovor „${title}“ iz povijesti? Ovu radnju nije moguće poništiti.`)) {
      const row = [...document.querySelectorAll('.session-swipe-row')].find(item => item.dataset.sessionId === id);
      closeSwipeRow(row);
      return;
    }

    sessions = sessions.filter(item => item.id !== id);
    saveJson(STORAGE.sessions, sessions);

    if (current.id === id) {
      if (shouldListen || isListening) stopListening();
      current = createEmptySession(preferences.mode);
      interimText = '';
      activeSpeaker = 1;
      lastFinalText = '';
      lastFinalAt = 0;
      lastSpeakerDecisionAt = 0;
      resetModeSpeakerRoles();
      contextualBiasDisabled = false;
      resetVoiceAccumulator();
      pendingVoiceFeature = null;
      saveJson(STORAGE.current, current);
      renderAll();
      closePanels();
    } else {
      renderSessions();
    }
    showToast('Razgovor je obrisan iz povijesti.');
  }

  function createSvg(symbolId) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    use.setAttribute('href', `#${symbolId}`);
    svg.append(use);
    return svg;
  }

  function segmentRenderKey(segment) {
    return [
      segment.text,
      segment.speaker,
      segment.type,
      segment.provisional ? 1 : 0,
      Number(segment.confidence || 0).toFixed(3),
      segment.aiRefined ? 1 : 0,
      segment.aiFallback ? 1 : 0,
      segment.requiresReview ? 1 : 0,
      segment.aiSuggestion || '',
      preferences.timestamps ? 1 : 0,
      speakerName(segment.speaker),
      preferences.urgentWords.join('|')
    ].join('¦');
  }

  function createSegmentArticle(segment) {
    const article = document.createElement('article');
    article.className = 'segment';
    article.dataset.id = segment.id;

    const meta = document.createElement('div');
    meta.className = 'segment-meta';
    const dot = document.createElement('span');
    dot.className = 'speaker-dot';
    const speaker = document.createElement('span');
    speaker.className = 'segment-speaker-name';
    meta.append(dot, speaker);

    const paragraph = document.createElement('p');
    paragraph.className = 'segment-text';

    const note = document.createElement('span');
    note.className = 'confidence-note segment-review-note';
    note.hidden = true;

    const suggestion = document.createElement('span');
    suggestion.className = 'confidence-note ai-suggestion-note';
    suggestion.hidden = true;

    const actions = document.createElement('div');
    actions.className = 'segment-actions';
    const edit = document.createElement('button');
    edit.type = 'button';
    edit.append(createSvg('i-edit'), document.createTextNode('Uredi'));
    edit.addEventListener('click', () => beginEditingSegment(article.dataset.id, paragraph));
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.append(createSvg('i-trash'), document.createTextNode('Ukloni'));
    remove.addEventListener('click', () => removeSegment(article.dataset.id));
    actions.append(edit, remove);

    article.append(meta, paragraph, note, suggestion, actions);
    return article;
  }

  function patchSegmentArticle(article, segment) {
    const key = segmentRenderKey(segment);
    if (article.dataset.renderKey === key) return article;
    article.dataset.renderKey = key;
    article.dataset.id = segment.id;
    article.dataset.speaker = String(segment.speaker);
    article.className = 'segment';
    if (segment.type === 'note') article.classList.add('note');
    if (segment.provisional) article.classList.add('provisional');
    if (segment.confidence < segmentReviewThreshold(segment) && segment.type === 'speech') article.classList.add('low-confidence');
    if (containsUrgentWord(segment.text)) article.classList.add('urgent');
    if (segment.requiresReview) article.classList.add('needs-review');

    const meta = article.querySelector('.segment-meta');
    const speaker = article.querySelector('.segment-speaker-name');
    speaker.textContent = segment.type === 'note' ? 'Bilješka' : speakerName(segment.speaker);
    meta.querySelectorAll('.ai-badge, time').forEach(node => node.remove());

    if (preferences.timestamps) {
      const time = document.createElement('time');
      time.textContent = formatTime(segment.createdAt);
      meta.append(time);
    }

    renderHighlightedText(article.querySelector('.segment-text'), segment.text);

    const reviewNote = article.querySelector('.segment-review-note');
    reviewNote.hidden = true;
    reviewNote.textContent = '';
    if (segment.provisional && segment.type === 'speech') {
      reviewNote.hidden = false;
      reviewNote.textContent = 'Privremeni prijepis…';
    } else if (current.mode === 'doctor' && isDoctorCriticalText(segment.text) && segment.confidence < segmentReviewThreshold(segment)) {
      reviewNote.hidden = false;
      reviewNote.textContent = 'Provjeri važan medicinski detalj.';
    }

    const suggestion = article.querySelector('.ai-suggestion-note');
    suggestion.hidden = true;
    suggestion.textContent = '';

    return article;
  }

  function renderTranscript() {
    const hasContent = current.segments.length > 0 || Boolean(interimText);
    dom.emptyTranscript.hidden = hasContent;
    dom.transcriptStream.hidden = !current.segments.length;

    const existing = new Map(
      [...dom.transcriptStream.querySelectorAll(':scope > .segment[data-id]')]
        .map(article => [article.dataset.id, article])
    );
    const desiredArticles = current.segments.map(segment => {
      const article = existing.get(segment.id) || createSegmentArticle(segment);
      return patchSegmentArticle(article, segment);
    });

    const existingIds = [...dom.transcriptStream.children].map(node => node.dataset?.id || '');
    const desiredIds = current.segments.map(segment => segment.id);
    const isAppendOnly = existingIds.length <= desiredIds.length &&
      existingIds.every((id, index) => id === desiredIds[index]);

    if (isAppendOnly) {
      for (let index = existingIds.length; index < desiredArticles.length; index += 1) {
        dom.transcriptStream.append(desiredArticles[index]);
      }
    } else {
      dom.transcriptStream.replaceChildren(...desiredArticles);
    }

    dom.interimSegment.hidden = !interimText;
    dom.interimSegment.dataset.speaker = String(activeSpeaker);
    dom.interimSpeaker.textContent = speakerName(activeSpeaker);
    dom.interimText.textContent = interimText;
    updateActionButtons();
    updateLargeView();

    if (preferences.autoScroll && hasContent) {
      const distanceFromBottom = dom.transcriptView.scrollHeight - dom.transcriptView.scrollTop - dom.transcriptView.clientHeight;
      if (distanceFromBottom < 240 || current.segments.length <= 2) {
        requestAnimationFrame(() => {
          dom.transcriptView.scrollTop = dom.transcriptView.scrollHeight;
        });
      }
    }
  }

  function beginEditingSegment(id, paragraph) {
    const segment = current.segments.find(item => item.id === id);
    if (!segment) return;
    paragraph.textContent = segment.text;
    paragraph.contentEditable = 'true';
    paragraph.setAttribute('role', 'textbox');
    paragraph.focus();
    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(paragraph);
    selection?.removeAllRanges();
    selection?.addRange(range);

    const finish = () => {
      paragraph.removeEventListener('blur', finish);
      paragraph.contentEditable = 'false';
      const next = normalizeRecognizedText(paragraph.textContent, true);
      if (next) segment.text = next;
      segment.userEdited = true;
      segment.aiRefined = false;
      persistCurrent(true);
      renderTranscript();
      showToast('Rečenica je spremljena.');
    };
    paragraph.addEventListener('blur', finish, { once: true });
    paragraph.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault();
        paragraph.blur();
      }
      if (event.key === 'Escape') {
        paragraph.textContent = segment.text;
        paragraph.blur();
      }
    });
  }

  function removeSegment(id) {
    const removed = current.segments.find(item => item.id === id);
    if (removed?.type === 'speech' && removed.utteranceSerial != null) {
      ignoredAiSerials.add(`${current.id}:${removed.utteranceSerial}`);
    }
    current.segments = current.segments.filter(item => item.id !== id);
    persistCurrent(true);
    renderTranscript();
    showToast('Rečenica je uklonjena.');
  }

  function updateActionButtons() {
    const enabled = current.segments.length > 0;
    dom.undoButton.disabled = !enabled;
    dom.copyButton.disabled = !enabled;
    dom.downloadButton.disabled = !enabled;
    dom.clearButton.disabled = !enabled;
  }

  function addSegment(text, confidence = .8, speaker = activeSpeaker, type = 'speech', options = {}) {
    const normalized = normalizeRecognizedText(text, true);
    if (!normalized) return;

    const now = Date.now();
    const speakerId = clamp(Math.round(Number(speaker) || 1), 1, MAX_AUTO_SPEAKERS);
    const simplified = normalized.toLocaleLowerCase('hr-HR').replace(/[.!?…]+$/, '');
    const previousSimplified = lastFinalText.toLocaleLowerCase('hr-HR').replace(/[.!?…]+$/, '');
    const previousSpeech = current.segments.filter(item => item.type === 'speech').at(-1);

    // Zaštita od dvostrukog browser final-resulta vrijedi samo za ISTOG govornika.
    // U razgovoru dvije osobe smiju jedna za drugom reći npr. "Da." bez gubitka druge rečenice.
    if (type === 'speech' && !options.manualBoundary && simplified === previousSimplified &&
        previousSpeech?.speaker === speakerId && now - lastFinalAt < 2200) return null;

    const segment = {
      id: createId(type === 'note' ? 'note' : 'line'),
      text: normalized,
      createdAt: now,
      confidence: clamp(Number(confidence) || .75, 0, 1),
      speaker: speakerId,
      type,
      utteranceSerial: type === 'speech' ? (options.utteranceSerial ?? utteranceSerial) : null,
      aiRefined: Boolean(options.aiRefined),
      aiFallback: Boolean(options.aiFallback),
      requiresReview: Boolean(options.requiresReview),
      aiSuggestion: String(options.aiSuggestion || ''),
      originalText: String(options.originalText || ''),
      userEdited: false
    };
    current.segments.push(segment);
    if (type === 'speech') {
      lastFinalText = normalized;
      lastFinalAt = now;
      updateModeSpeakerRole(speakerId, normalized);
    }
    interimText = '';
    persistCurrent(true);
    renderSpeakerLabels();
    renderTranscript();

    if (containsUrgentWord(normalized)) {
      showToast('Važna riječ je označena u prijepisu.', 3200);
      if (!dom.largeView.hidden) dom.largeView.classList.add('urgent');
    }
    return segment;
  }

  function setMode(mode) {
    if (!modeData[mode]) return;
    const wasListening = shouldListen || isListening;
    preferences.mode = mode;
    current.mode = mode;
    contextualBiasDisabled = false;
    resetModeSpeakerRoles();
    savePreferences();
    renderMode();
    persistCurrent();

    // Promjena profila mijenja i mikrofon/VAD. Ako upravo slušamo, ponovno izgradi
    // audio lanac i SpeechRecognition kako bi novi profil odmah stvarno vrijedio.
    if (wasListening) {
      stopListening();
      window.setTimeout(() => startListening(), 220);
    }
  }

  function renderMode() {
    const data = modeData[preferences.mode];
    dom.activeModeLabel.textContent = data.label;
    dom.contextTitle.textContent = data.label;
    dom.contextDescription.textContent = data.description;
    dom.modeSwitcher.querySelectorAll('button').forEach(button => {
      const active = button.dataset.mode === preferences.mode;
      button.classList.toggle('active', active);
      button.setAttribute('aria-selected', String(active));
    });

    renderSpeechLanguage();

    if (!shouldListen && !isListening) {
      const language = activeSpeechLanguageMeta();
      dom.dockSubstatus.textContent = `${language.name} · ${language.code} · ${data.status}`;
    }
  }

  function renderSpeechLanguage() {
    const language = activeSpeechLanguageMeta();
    if (dom.voiceLanguageName) dom.voiceLanguageName.textContent = language.name;
    dom.voiceLanguageSwitcher?.querySelectorAll('button[data-speech-language]').forEach(button => {
      const active = button.dataset.speechLanguage === language.code;
      button.classList.toggle('active', active);
      button.setAttribute('aria-checked', String(active));
    });
  }

  function setSpeechLanguage(language) {
    if (!['hr-HR', 'en-US'].includes(language) || language === activeSpeechLanguage()) return;
    preferences.speechLanguage = language;
    contextualBiasDisabled = false;
    browserOnDeviceChecked = false;
    browserOnDeviceRecognition = false;
    savePreferences();
    renderSpeechLanguage();

    const meta = activeSpeechLanguageMeta();
    if (shouldListen || isListening) {
      softRestartRecognition(`${meta.name} · ${meta.code} · mijenjam Voice jezik…`, 180);
    } else {
      updateStatus('paused', `${meta.name} · ${meta.code} · ${activeModeProfile().status}`);
    }
  }

  function renderSpeakerLabels() {
    dom.interimSpeaker.textContent = speakerName(activeSpeaker);
    if (!dom.speakerProfilesList) return;
    dom.speakerProfilesList.textContent = '';
    const profiles = [...(current.speakers || [])].sort((a, b) => a.id - b.id);
    if (!profiles.length) {
      const empty = document.createElement('p');
      empty.className = 'speaker-profile-empty';
      empty.textContent = 'Govornici će se pojaviti automatski čim razgovor započne.';
      dom.speakerProfilesList.append(empty);
      return;
    }
    for (const profile of profiles) {
      const row = document.createElement('div');
      row.className = 'speaker-profile';
      row.dataset.speaker = String(profile.id);
      if (profile.id === activeSpeaker && shouldListen) row.classList.add('active');
      const dot = document.createElement('span');
      dot.className = 'speaker-dot';
      const info = document.createElement('div');
      const name = document.createElement('strong');
      name.textContent = profile.label;
      const detail = document.createElement('span');
      if (current.mode === 'doctor' && profile.id === doctorSpeakerId) {
        detail.textContent = `Govornik ${profile.id} · vjerojatno liječnik · prioritetan sadržaj`;
      } else if (current.mode === 'lecture' && profile.id === lectureSpeakerId) {
        detail.textContent = `Govornik ${profile.id} · dominantni predavač`;
      } else {
        detail.textContent = `Govornik ${profile.id} · glasovni profil`;
      }
      info.append(name, detail);
      row.append(dot, info);
      dom.speakerProfilesList.append(row);
    }
  }

  function savePreferences() {
    preferences = sanitizePreferences(preferences);
    saveJson(STORAGE.preferences, preferences);
    applyPreferences();
  }

  function applyPreferences() {
    document.documentElement.dataset.contrast = preferences.highContrast ? 'high' : 'normal';
    document.documentElement.dataset.motion = preferences.reduceMotion ? 'reduced' : 'full';
    document.documentElement.style.setProperty('--transcript-scale', String(preferences.fontScale));
    dom.fontScaleInput.value = String(preferences.fontScale);
    dom.soundAlertsInput.checked = Boolean(preferences.soundAlerts);
    dom.soundThresholdInput.value = String(preferences.soundThreshold);
    dom.highContrastInput.checked = Boolean(preferences.highContrast);
    dom.reduceMotionInput.checked = Boolean(preferences.reduceMotion);
    dom.autoScrollInput.checked = Boolean(preferences.autoScroll);
    dom.timestampsInput.checked = Boolean(preferences.timestamps);
    dom.wakeLockInput.checked = Boolean(preferences.wakeLock);
    dom.aiRefineInput.checked = Boolean(preferences.aiRefine);
    dom.aiModelSelect.value = preferences.aiModel;
    dom.aiModelSelect.disabled = !preferences.aiRefine;
    if (dom.standardizeCroatianInput) dom.standardizeCroatianInput.checked = Boolean(preferences.standardizeCroatian);
    renderSpeechLanguage();
    updateAiStatus(preferences.aiRefine ? aiState : 'idle');
    renderSpeakerLabels();
    renderWordList(dom.keywordList, preferences.urgentWords, removeUrgentWord);
    renderWordList(dom.vocabularyList, preferences.vocabulary, removeVocabularyWord);
    renderTranscript();
  }

  function renderWordList(container, words, onRemove) {
    container.textContent = '';
    for (const word of words) {
      const chip = document.createElement('span');
      chip.append(document.createTextNode(word));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.setAttribute('aria-label', `Ukloni ${word}`);
      remove.textContent = '×';
      remove.addEventListener('click', () => onRemove(word));
      chip.append(remove);
      container.append(chip);
    }
  }

  function removeUrgentWord(word) {
    preferences.urgentWords = preferences.urgentWords.filter(item => item !== word);
    savePreferences();
  }

  function removeVocabularyWord(word) {
    preferences.vocabulary = preferences.vocabulary.filter(item => item !== word);
    savePreferences();
  }

  function startElapsedTimer() {
    if (elapsedTimer) return;
    elapsedTimer = window.setInterval(() => {
      current.durationSeconds += 1;
      dom.elapsed.textContent = formatElapsed(current.durationSeconds);
      if (current.durationSeconds % 5 === 0) persistCurrent();
    }, 1000);
  }

  function stopElapsedTimer() {
    if (elapsedTimer) window.clearInterval(elapsedTimer);
    elapsedTimer = null;
  }

  function updateStatus(status, message = '') {
    const finishing = status === 'finishing';
    // Korisnički Start/Kraj je iznad kratkih internih stanja browser recognizera.
    // Čak i dok se mikrofon priprema ili recognition automatski reconnecta, Start
    // ostaje aktivan i korisnik uvijek može namjerno pritisnuti Kraj.
    const userCaptureActive = !finishing && (shouldListen || isListening || status === 'listening');
    dom.statusDot.classList.toggle('listening', userCaptureActive || finishing);
    dom.statusDot.classList.toggle('error', status === 'error');
    dom.recordButton.classList.toggle('active', userCaptureActive);
    dom.recordButton.disabled = finishing;
    dom.recordButton.setAttribute('aria-label', userCaptureActive ? 'Završi ovaj odlomak' : finishing ? 'Spremam odlomak' : 'Pokreni novi odlomak');
    const recordLabel = userCaptureActive ? 'Kraj' : finishing ? 'Spremam' : 'Start';
    dom.recordButton.innerHTML = `<svg><use href="#${userCaptureActive || finishing ? 'i-stop' : 'i-mic'}"/></svg><span>${recordLabel}</span>`;

    const statusText = {
      listening: 'Slušam',
      preparing: 'Pripremam mikrofon',
      finishing: 'Završavam…',
      paused: 'Pauzirano',
      error: 'Prekinuto'
    }[status] || 'Pauzirano';
    dom.dockStatus.textContent = statusText;
    const language = activeSpeechLanguageMeta();
    dom.dockSubstatus.textContent = message || `${language.name} · ${language.code} · ${activeModeProfile().status}`;
  }

  function showStatusBanner(message) {
    dom.statusBannerText.textContent = message;
    dom.statusBanner.hidden = false;
  }

  function hideStatusBanner() {
    dom.statusBanner.hidden = true;
    dom.statusBannerText.textContent = '';
  }

  function dismissEngineNotice() {
    dom.engineNotice.hidden = true;
    saveJson(STORAGE.engineNoticeDismissed, true);
  }

  function touchRecognitionActivity(hasResult = false) {
    const now = Date.now();
    recognitionLastEventAt = now;
    if (hasResult) {
      recognitionLastResultAt = now;
      recognitionRecoveryCount = Math.max(0, recognitionRecoveryCount - 1);
    }
  }

  function startRecognitionWatchdog() {
    if (recognitionWatchdogTimer) return;
    recognitionWatchdogTimer = window.setInterval(() => {
      if (!shouldListen || browserRecognitionDisabled || !SpeechRecognition) return;
      const now = Date.now();

      if (recognition && !isListening && recognitionStartAttemptAt &&
          now - recognitionStartAttemptAt > RECOGNITION_START_TIMEOUT_MS) {
        recognitionRecoveryCount += 1;
        softRestartRecognition('Ponovno povezujem live titlove…', 240);
        return;
      }

      if (!recognition && !restartTimer) {
        scheduleRecognitionStart(RECOGNITION_REARM_DELAY_MS, '');
        return;
      }
      if (!recognition || !isListening) return;

      // VAD više NIKADA ne prekida aktivnu recognition sesiju nakon jedne rečenice.
      // Watchdog intervenira samo kod očitog zaglavljenja: govor je nedavno postojao,
      // ali Web Speech vrlo dugo nije poslao nijedan event/result.
      const heardRecentVoice = Math.max(lastAudioVoiceAt, neuralVadLastSpeechAt, lastSpeechActivityAt) > recognitionStartedAt;
      const staleFor = now - Math.max(recognitionLastEventAt, recognitionLastResultAt, recognitionStartedAt);
      const naturalPause = !(neuralVadReady ? neuralVadSpeaking : audioVadActive) && !speechIsActive;
      if (heardRecentVoice && staleFor > RECOGNITION_STALE_EVENT_MS && naturalPause) {
        recognitionRecoveryCount += 1;
        softRestartRecognition('Obnavljam live titlove…', 180);
      }
    }, RECOGNITION_WATCHDOG_INTERVAL_MS);
  }

  function stopRecognitionWatchdog() {
    if (recognitionWatchdogTimer) clearInterval(recognitionWatchdogTimer);
    recognitionWatchdogTimer = null;
  }

  function scheduleRecognitionStart(delay = RECOGNITION_REARM_DELAY_MS, message = '') {
    if (!shouldListen || browserRecognitionDisabled || !SpeechRecognition) return;
    clearTimeout(restartTimer);
    restartTimer = window.setTimeout(() => {
      restartTimer = null;
      if (shouldListen && !recognition) createAndStartRecognition();
    }, Math.max(60, delay));
    if (message) updateStatus('preparing', message);
    else updateStatus('listening', `Hrvatski · ${SPEECH_BACKEND === 'web' ? 'web speech' : 'sistemski speech servis'}`);
  }

  function softRestartRecognition(message = 'Osvježavam slušanje…', delay = RECOGNITION_RECOVERY_DELAY_MS) {
    if (!shouldListen || browserRecognitionDisabled || !SpeechRecognition) return;
    clearTimeout(restartTimer);
    restartTimer = null;

    // Interni restart NE završava korisnikov odlomak. Sve već potvrđene riječi
    // ostaju u istom live odlomku sve dok korisnik namjerno ne pritisne Kraj.
    if (manualParagraph && recognitionCycleInterim) {
      manualParagraph.interimText = recognitionCycleInterim;
    }
    interimText = manualParagraphLiveText('');
    recognitionCycleInterim = '';
    cancelInterimCommit();
    renderTranscript();

    recognitionGeneration += 1;
    const oldRecognition = recognition;
    recognition = null;
    isListening = false;
    recognitionStartAttemptAt = 0;
    try { oldRecognition?.abort(); } catch { /* već zaustavljeno */ }

    scheduleRecognitionStart(delay, message);
  }

  async function detectOnDeviceRecognition() {
    if (browserOnDeviceChecked || !SpeechRecognition) return browserOnDeviceRecognition;
    browserOnDeviceChecked = true;
    browserOnDeviceRecognition = false;

    // Novi Chromium može imati lokalni dictation paket. Koristimo ga samo ako je
    // hrvatski paket već instaliran; ništa ne preuzimamo bez korisnikove odluke.
    if (typeof SpeechRecognition.available !== 'function') return false;
    try {
      const availability = await Promise.race([
        SpeechRecognition.available({ langs: [activeSpeechLanguage()], processLocally: true, quality: 'dictation' }),
        new Promise(resolve => window.setTimeout(() => resolve('timeout'), 900))
      ]);
      browserOnDeviceRecognition = availability === 'available';
    } catch {
      browserOnDeviceRecognition = false;
    }
    return browserOnDeviceRecognition;
  }

  function canUseLocalAiListening() {
    // Presentation-safe build zahtijeva browserov hr-HR SpeechRecognition kao primarni kanal.
    // Lokalni Whisper nije dovoljno pouzdan da samostalno proizvodi redove prijepisa.
    return false;
  }

  function degradeToLocalAiOnly(_message) {
    return false;
  }

  async function startNeuralVad() {
    if (!audioStream) return false;
    if (neuralVadDisposeTimer) { clearTimeout(neuralVadDisposeTimer); neuralVadDisposeTimer = null; }
    if (neuralVadStartPromise) return neuralVadStartPromise;
    neuralVadStartPromise = (async () => {
      try {
        neuralVadReady = false;
        await neuralVadEngine.start(audioStream, {
          config: neuralVadConfig(),
          callbacks: {
            onSpeechStart: () => {
              if (!shouldListen) return;
              const now = Date.now();
              neuralVadSpeaking = true;
              neuralVadLastSpeechAt = now;
              lastAudioVoiceAt = now;
              lastAudioVoiceStartAt = now;
              if (speechIsActive && chromeUtteranceSerial && utteranceStartedAt && now - utteranceStartedAt < 1400) {
                neuralVadSerial = chromeUtteranceSerial;
              } else {
                beginUtterance(now, true);
                neuralVadSerial = utteranceSerial;
              }
            },
            onSpeechRealStart: () => {
              const now = Date.now();
              neuralVadSpeaking = true;
              neuralVadLastSpeechAt = now;
              lastAudioVoiceAt = now;
            },
            onFrameProcessed: probabilities => {
              const probability = Number(probabilities?.isSpeech) || 0;
              neuralVadSpeechProbability = clamp(probability, 0, 1);
              if (probability >= .28) {
                const now = Date.now();
                neuralVadLastSpeechAt = now;
                lastAudioVoiceAt = now;
              }
            },
            onVADMisfire: () => {
              neuralVadSpeaking = false;
              neuralVadSpeechProbability = 0;
            },
            onSpeechEnd: pcm => {
              const now = Date.now();
              neuralVadSpeaking = false;
              neuralVadSpeechProbability = 0;
              neuralVadLastSpeechAt = now;
              lastAudioVoiceAt = now;
              const serial = neuralVadSerial || utteranceSerial;
              neuralVadSerial = 0;
              const feature = (audioVadActive ? snapshotVoiceFeature() : null) || pendingVoiceFeature;
              if (preferences.aiRefine) enqueueAiPcm(pcm, serial, feature, current.id, transcriptEpoch);
              if (interimText) scheduleInterimCommit(220);
            }
          }
        });
        neuralVadReady = true;
        return true;
      } catch (error) {
        neuralVadReady = false;
        neuralVadSpeaking = false;
        console.warn('[Clarity] Neuralni VAD nije dostupan; ostajem na browser diktiranju i pomoćnom VAD-u:', error);
        return false;
      } finally {
        neuralVadStartPromise = null;
      }
    })();
    return neuralVadStartPromise;
  }

  function stopNeuralVad(flush = false) {
    neuralVadReady = false;
    neuralVadSpeaking = false;
    neuralVadSerial = 0;
    neuralVadSpeechProbability = 0;
    neuralVadLastSpeechAt = 0;
    if (neuralVadDisposeTimer) { clearTimeout(neuralVadDisposeTimer); neuralVadDisposeTimer = null; }
    if (flush) {
      neuralVadEngine.pause();
      neuralVadDisposeTimer = window.setTimeout(() => {
        neuralVadDisposeTimer = null;
        neuralVadEngine.dispose().catch(() => {});
      }, 240);
    } else {
      neuralVadEngine.dispose().catch(() => {});
    }
  }

  function clearFinalizeFallback() {
    if (finalizeFallbackTimer) window.clearTimeout(finalizeFallbackTimer);
    finalizeFallbackTimer = null;
  }

  function finishManualStop(message = 'Odlomak je spremljen · pritisni Start za novi odlomak', abortRecognizer = false) {
    clearFinalizeFallback();
    shouldListen = false;
    isFinalizing = false;
    isListening = false;
    recognitionStartAttemptAt = 0;

    if (abortRecognizer && recognition) {
      const staleRecognition = recognition;
      recognitionGeneration += 1;
      recognition = null;
      try { staleRecognition.abort(); } catch { /* već zaustavljeno */ }
    } else if (!recognition) {
      recognitionGeneration += 1;
    }

    if (manualParagraph && recognitionCycleInterim) {
      appendManualParagraphFinal(recognitionCycleInterim, .58, manualParagraph.speaker || activeSpeaker);
    }
    recognitionCycleInterim = '';
    if (manualParagraph) manualParagraph.interimText = '';
    interimText = manualParagraphLiveText('');
    cancelInterimCommit();
    finalizeManualParagraph(true);
    lastManualStopAt = Date.now();
    persistCurrent(true);
    renderTranscript();
    updateStatus('paused', message);
  }

  async function startListening() {
    if (isListening || shouldListen) return;

    // Mobilni WebKit ponekad ne dovrši prethodni stop() lifecycle. Novi korisnički
    // Start uvijek dobiva čistu recognition sesiju umjesto da ostane blokiran.
    clearFinalizeFallback();
    if (isFinalizing || recognition) {
      const staleRecognition = recognition;
      recognitionGeneration += 1;
      recognition = null;
      isFinalizing = false;
      isListening = false;
      try { staleRecognition?.abort(); } catch { /* već završeno */ }
    }

    hideStatusBanner();

    if (!SpeechRecognition && !canUseLocalAiListening()) {
      updateStatus('error', 'Diktiranje nije dostupno');
      showStatusBanner('Ovaj preglednik ne izlaže podržani speech-recognition servis za hrvatski jezik. Pokušaj s aktualnim browserom, Edgeom ili Safarijem na svom uređaju.');
      return;
    }

    beginManualParagraph();
    shouldListen = true;
    browserRecognitionDisabled = !SpeechRecognition;
    recognitionLastEventAt = Date.now();
    recognitionLastResultAt = Date.now();
    recognitionStartAttemptAt = 0;
    recognitionRapidEndCount = 0;
    recognitionRecoveryCount = 0;
    cancelInterimCommit();
    updateStatus('preparing', 'Dopusti pristup mikrofonu');
    dom.engineNotice.hidden = true;
    // iOS/WebKit dobiva mikrofon isključivo kroz SpeechRecognition. Paralelni
    // getUserMedia + Web Speech lifecycle nakon Kraj → Start može ostaviti mikrofon zaključan.
    if (!window.__clarityNativeSpeech && !IS_IOS_WEBKIT) await startAudioMeter();
    else dom.soundStateText.textContent = 'Mikrofon uređaja · native speech';
    // Presentation engine: audio meter ostaje lokalno radi indikatora i speaker heuristike,
    // ali Silero/Whisper se NE pokreću u live putu. Jedan engine = manje utrka i prekida.
    neuralVadReady = false;
    neuralVadSpeaking = false;
    await requestWakeLock();
    browserOnDeviceRecognition = false;

    if (!SpeechRecognition) {
      shouldListen = false;
      browserRecognitionDisabled = false;
      discardManualParagraph();
      stopElapsedTimer();
      updateStatus('error', 'Live diktiranje nije dostupno');
      showStatusBanner('Na ovom pregledniku live diktiranje trenutačno nije dostupno. Pokušaj s drugim aktualnim preglednikom koji podržava Web Speech API.');
      return;
    }

    startElapsedTimer();
    startRecognitionWatchdog();

    // WebKitu daj kratak trenutak da fizički otpusti prethodnu speech sesiju.
    if (IS_IOS_WEBKIT && !window.__clarityNativeSpeech && lastManualStopAt) {
      const remaining = MOBILE_STOP_RELEASE_MS - (Date.now() - lastManualStopAt);
      if (remaining > 0) await new Promise(resolve => window.setTimeout(resolve, remaining));
      if (!shouldListen) return;
    }
    createAndStartRecognition();
  }

  function createAndStartRecognition() {
    if (!shouldListen || browserRecognitionDisabled || !SpeechRecognition) return;
    clearTimeout(restartTimer);
    restartTimer = null;

    const generation = ++recognitionGeneration;
    const instance = new SpeechRecognition();
    recognition = instance;
    recognitionResultSerials = new Map();
    recognitionStartAttemptAt = Date.now();
    instance.lang = activeSpeechLanguage();
    // Za prezentacije biramo stabilniji browser/cloud put. processLocally je eksperimentalan.
    // Ne forsiramo cloud ni lokalni način: preglednik/platforma bira svoj dostupni speech engine.
    // Jedan korisnički Start predstavlja jedan odlomak. Browser smije interno
    // završiti/restartati recognition sesiju, ali Clarity taj događaj ne tretira kao Kraj.
    // iOS/WebKit je stabilniji sa svježim kratkim recognition ciklusima.
    // Clarity ih i dalje spaja u isti korisnički Start→Kraj odlomak.
    instance.continuous = window.__clarityNativeSpeech ? false : !IS_IOS_WEBKIT;
    instance.interimResults = true;
    instance.maxAlternatives = clamp(activeModeProfile().maxAlternatives || 3, 1, 5);
    // Ako browser podržava contextual biasing, hrvatski Clarity rječnik dobiva prioritet.
    // Na browserima bez te mogućnosti ovo je samo no-op i recognition radi normalno.
    applyContextualBias(instance);

    const isCurrent = () => (shouldListen || isFinalizing) && generation === recognitionGeneration && recognition === instance;

    instance.onstart = () => {
      if (!isCurrent()) return;
      isFinalizing = false;
      isListening = true;
      recognitionStartedAt = Date.now();
      recognitionCycleStartedAt = recognitionStartedAt;
      recognitionCycleSawFinal = false;
      recognitionCycleSawResult = false;
      recognitionCycleInterim = '';
      recognitionStartAttemptAt = 0;
      recognitionLastResultAt = recognitionStartedAt;
      touchRecognitionActivity(false);
      const language = activeSpeechLanguageMeta();
      updateStatus('listening', window.__clarityNativeSpeech
        ? `${language.name} · ${language.code} · native speech servis uređaja`
        : `${language.name} · ${language.code} · web speech servis`);
      startElapsedTimer();
    };

    instance.onspeechstart = () => {
      if (!isCurrent()) return;
      speechIsActive = true;
      lastSpeechActivityAt = Date.now();
      if (neuralVadReady && neuralVadSpeaking && neuralVadSerial) {
        chromeUtteranceSerial = neuralVadSerial;
      } else {
        beginUtterance(lastSpeechActivityAt);
        chromeUtteranceSerial = utteranceSerial;
      }
      touchRecognitionActivity(false);
      loudFrames = 0;
      dom.soundStateText.textContent = 'Govor je prepoznat';
    };

    instance.onspeechend = () => {
      if (!isCurrent()) return;
      speechIsActive = false;
      lastSpeechActivityAt = Date.now();
      touchRecognitionActivity(false);
      loudFrames = 0;
      dom.soundStateText.textContent = 'Čekam nastavak govora';
      // Interim ostaje samo live prikaz; ne spremamo ga kao trajnu rečenicu prije browser finala.
    };

    instance.onresult = event => {
      if (!isCurrent()) return;
      touchRecognitionActivity(true);
      recognitionCycleSawResult = true;
      let nextInterim = '';
      let sawFinal = false;

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        let resultSerial = recognitionResultSerials.get(index);
        if (!resultSerial) {
          resultSerial = chromeUtteranceSerial || utteranceSerial;
          if (!resultSerial) resultSerial = ++utteranceSerial;
          recognitionResultSerials.set(index, resultSerial);
        }
        if (result.isFinal) {
          sawFinal = true;
          recognitionCycleSawFinal = true;
          const selected = selectBestRecognitionAlternative(result);
          const text = selected.text;
          if (!text) continue;

          const feature = (audioVadActive ? snapshotVoiceFeature() : null) || pendingVoiceFeature;
          const detectedSpeaker = resolveSpeaker(feature, text);
          if (!audioVadActive) pendingVoiceFeature = null;
          commitFinalRecognition(text, selected.confidence, detectedSpeaker, resultSerial);
        } else {
          // I za parcijalni rezultat pregledaj dostupne alternative; time hrvatski izraz
          // može biti prikazan točnije i prije nego browser pošalje finalni rezultat.
          const selected = selectBestRecognitionAlternative(result);
          const raw = normalizeRecognizedText(selected.text || result[0]?.transcript || '', false);
          if (raw) nextInterim += `${raw} `;
        }
      }

      const normalizedInterim = normalizeRecognizedText(nextInterim, false);
      const previousLive = interimText;
      if (manualParagraph) {
        manualParagraph.interimText = normalizedInterim;
        recognitionCycleInterim = normalizedInterim;
        interimText = manualParagraphLiveText(normalizedInterim);
        if (interimText && interimText !== previousLive) interimChangedAt = Date.now();
        if (sawFinal && !normalizedInterim) cancelInterimCommit();
      } else {
        if (normalizedInterim && normalizedInterim !== interimText) interimChangedAt = Date.now();
        if (normalizedInterim) {
          interimText = normalizedInterim;
          recognitionCycleInterim = normalizedInterim;
        } else if (sawFinal) {
          interimText = '';
          recognitionCycleInterim = '';
          cancelInterimCommit();
        }
      }
      renderTranscript();
    };

    instance.onerror = event => {
      if (generation !== recognitionGeneration) return;
      const code = event.error || 'unknown';
      touchRecognitionActivity(false);
      if (code === 'aborted' && !shouldListen) return;
      if (code === 'no-speech') {
        // Jedna kratka sesija može završiti bez govora; onend odmah otvara sljedeću.
        dom.soundStateText.textContent = 'Slušam…';
        return;
      }
      if (code === 'phrases-not-supported') {
        contextualBiasDisabled = true;
        if (shouldListen) softRestartRecognition('Nastavljam bez kontekstualnog rječnika…', 180);
        return;
      }
      if (code === 'language-not-supported' && browserOnDeviceRecognition) {
        // Lokalni paket može nestati nakon browser updatea. Odmah se vrati na
        // standardni browser kanal umjesto da prekine cijeli razgovor.
        browserOnDeviceRecognition = false;
        if (shouldListen) {
          const language = activeSpeechLanguageMeta();
          softRestartRecognition(`Lokalni ${language.name} diktat nije dostupan — nastavljam standardnim browser diktiranjem…`, 220);
        }
        return;
      }

      const errors = {
        'not-allowed': 'Preglednik nema dopuštenje za mikrofon. U postavkama ove stranice dopusti pristup mikrofonu.',
        'service-not-allowed': 'Usluga diktiranja nije dopuštena u pregledniku.',
        'audio-capture': 'Mikrofon nije pronađen ili ga koristi druga aplikacija.',
        'network': 'Diktiranje je privremeno izgubilo mrežnu vezu. Clarity će pokušati ponovno.',
        'language-not-supported': `Preglednik trenutačno ne podržava ${activeSpeechLanguageMeta().name} diktat.`
      };
      const message = errors[code] || `Diktiranje je prijavilo problem: ${code}.`;
      showStatusBanner(message);

      const fatal = ['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported'].includes(code);
      if (fatal) {
        if (!degradeToLocalAiOnly(message)) {
          shouldListen = false;
          isListening = false;
          discardManualParagraph();
          stopRecognitionWatchdog();
          stopElapsedTimer();
          updateStatus('error', message);
          stopAudioMeter(false);
          releaseWakeLock();
        }
      } else if (code === 'network' && shouldListen) {
        // Mrežni kvar ne zaustavlja lokalni AI kanal. Web Speech pokušavamo vratiti u pozadini.
        softRestartRecognition('Ponovno povezujem live titlove…', 700);
      }
    };

    instance.onend = () => {
      if (generation !== recognitionGeneration || recognition !== instance) return;
      recognition = null;
      isListening = false;
      recognitionStartAttemptAt = 0;
      touchRecognitionActivity(false);

      const now = Date.now();
      const sessionLength = recognitionCycleStartedAt ? now - recognitionCycleStartedAt : 0;
      const endedVeryQuickly = sessionLength > 0 && sessionLength < 550;
      if (endedVeryQuickly && now - recognitionLastEndAt < 3500) recognitionRapidEndCount += 1;
      else if (endedVeryQuickly) recognitionRapidEndCount = 1;
      else recognitionRapidEndCount = 0;
      recognitionLastEndAt = now;

      if (isFinalizing) {
        // Desktop/browser stop je završio normalno. Fallback timer se poništava,
        // odlomak se sprema, a sljedeći Start dobiva novu recognition instancu.
        clearFinalizeFallback();
        isFinalizing = false;
        shouldListen = false;
        finalizeManualParagraph(true);
        lastManualStopAt = Date.now();
        persistCurrent(true);
        renderTranscript();
        updateStatus('paused', 'Odlomak je spremljen · pritisni Start za novi odlomak');
        return;
      }

      // Neočekivani kraj aktivne sesije ne znači kraj korisnikova odlomka.
      // Dok je Start aktivan, automatski se otvara svježa browser/platform sesija.
      if (!recognitionCycleSawFinal) {
        // Neki browseri zatvore internu recognition sesiju bez isFinal događaja.
        // To NIJE korisnikov Kraj: sačuvaj čujni partial u istom odlomku i restartaj.
        if (manualParagraph && recognitionCycleInterim) {
          appendManualParagraphFinal(recognitionCycleInterim, .58, manualParagraph.speaker || activeSpeaker);
        }
        recognitionCycleInterim = '';
        if (manualParagraph) manualParagraph.interimText = '';
        interimText = manualParagraphLiveText('');
        cancelInterimCommit();
        renderTranscript();
      }

      if (shouldListen) {
        const delay = recognitionRapidEndCount >= 3
          ? Math.min(700, RECOGNITION_REARM_DELAY_MS + recognitionRapidEndCount * 90)
          : RECOGNITION_REARM_DELAY_MS;
        scheduleRecognitionStart(delay, '');
      } else {
        updateStatus('paused');
      }
    };

    try {
      // Stabilnost ima prednost nad eksperimentalnim start(audioTrack) putem.
      // AudioContext i dalje obrađuje signal za VAD i profile govornika, ali browserov
      // SpeechRecognition koristi svoj standardni ulaz mikrofona.
      instance.start();
    } catch (error) {
      if (generation !== recognitionGeneration) return;
      recognition = null;
      isListening = false;
      recognitionStartAttemptAt = 0;
      const message = error instanceof Error ? error.message : 'Slušanje se nije moglo pokrenuti.';
      showStatusBanner(message);
      if (shouldListen) scheduleRecognitionStart(700, 'Ponovno pokrećem diktiranje…');
    }
  }

  function stopListening() {
    if (isFinalizing) return;

    shouldListen = false;
    browserRecognitionDisabled = false;
    stopRecognitionWatchdog();
    clearTimeout(restartTimer);
    restartTimer = null;
    cancelInterimCommit();
    stopNeuralVad(true);
    stopElapsedTimer();
    stopAudioMeter(true);
    releaseWakeLock();

    const activeRecognition = recognition;

    // iPhone/iPad: stop() zna ostaviti Web Speech servis u poluzatvorenom stanju
    // pa novi Start ne napravi ništa. Kraj je zato čvrsta korisnička granica:
    // sačuvaj zadnji partial, abortaj staru instancu i odmah oslobodi novi Start.
    if (IS_IOS_WEBKIT && !window.__clarityNativeSpeech) {
      finishManualStop('Odlomak je spremljen · pritisni Start za novi odlomak', true);
      return;
    }

    if (activeRecognition) {
      isFinalizing = true;
      isListening = false;
      updateStatus('finishing', 'Speech servis dovršava zadnju riječ i sprema odlomak…');
      try {
        activeRecognition.stop();
        clearFinalizeFallback();
        finalizeFallbackTimer = window.setTimeout(() => {
          if (!isFinalizing) return;
          // Neki browseri nikad ne pošalju onend nakon stop(). Ne blokiraj sljedeći Start.
          finishManualStop('Odlomak je spremljen · pritisni Start za novi odlomak', true);
        }, FINALIZE_FALLBACK_MS);
      } catch {
        finishManualStop('Odlomak je spremljen · pritisni Start za novi odlomak', true);
      }
      return;
    }

    finishManualStop('Pritisni Start za novi odlomak', false);
  }

  function toggleListening() {
    if (isFinalizing) return;
    if (shouldListen || isListening) stopListening();
    else startListening();
  }

  async function startAudioMeter() {
    if (!navigator.mediaDevices?.getUserMedia || audioStream) return;
    try {
      const supported = navigator.mediaDevices.getSupportedConstraints?.() || {};
      const audioProfile = activeModeProfile().audio || modeData.social.audio;
      const audioConstraints = {
        echoCancellation: audioProfile.echoCancellation !== false,
        noiseSuppression: audioProfile.noiseSuppression !== false,
        autoGainControl: true,
        // Mono daje stabilniji akustički potpis govornika; stereo prostorne promjene
        // inače mogu izgledati kao potpuno nova osoba.
        channelCount: { ideal: 1 },
        sampleRate: { ideal: 48000 },
        sampleSize: { ideal: 16 }
      };
      if (supported.latency) audioConstraints.latency = { ideal: preferences.mode === 'lecture' ? .02 : .01 };
      if (supported.voiceIsolation) audioConstraints.voiceIsolation = Boolean(audioProfile.voiceIsolation);

      audioStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      audioContext = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
      await audioContext.resume?.();
      const source = audioContext.createMediaStreamSource(audioStream);

      // Govorni lanac: ukloni duboko brujanje, lagano istakni područje razumljivosti
      // i kompresijom podigni tiši govor bez agresivnog pojačavanja vrhova.
      const highPass = audioContext.createBiquadFilter();
      highPass.type = 'highpass';
      highPass.frequency.value = audioProfile.highPass;
      highPass.Q.value = .7;
      const presence = audioContext.createBiquadFilter();
      presence.type = 'peaking';
      presence.frequency.value = audioProfile.presenceHz;
      presence.Q.value = .72;
      presence.gain.value = audioProfile.presenceGain;
      const compressor = audioContext.createDynamicsCompressor();
      compressor.threshold.value = audioProfile.compressorThreshold;
      compressor.knee.value = 24;
      compressor.ratio.value = audioProfile.compressorRatio;
      compressor.attack.value = audioProfile.compressorAttack;
      compressor.release.value = audioProfile.compressorRelease;
      const speechGain = audioContext.createGain();
      speechGain.gain.value = audioProfile.gain;
      speechGainNode = speechGain;

      analyser = audioContext.createAnalyser();
      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = .42;
      source.connect(highPass);
      highPass.connect(presence);
      presence.connect(compressor);
      compressor.connect(speechGain);
      speechGain.connect(analyser);
      processedAudioDestination = null;
      processedAudioTrack = null;
      if (audioProfile.processedTrack) {
        processedAudioDestination = audioContext.createMediaStreamDestination();
        speechGain.connect(processedAudioDestination);
        processedAudioTrack = processedAudioDestination.stream.getAudioTracks()[0] || null;
      }

      // Whisper/Silero dobivaju klon izvornog browser-obrađenog mikrofona, bez ovog
      // dodatnog EQ/compressor lanca. Ovaj lanac služi samo mjeraču i profilu glasa.
      audioGraphNodes = [source, highPass, presence, compressor, speechGain, ...(processedAudioDestination ? [processedAudioDestination] : [])];

      timeDomainData = new Float32Array(analyser.fftSize);
      frequencyData = new Float32Array(analyser.frequencyBinCount);
      const meterData = new Uint8Array(analyser.fftSize);

      const draw = timestamp => {
        if (!analyser) return;
        analyser.getByteTimeDomainData(meterData);
        let sum = 0;
        for (const value of meterData) {
          const centered = (value - 128) / 128;
          sum += centered * centered;
        }
        const rms = Math.sqrt(sum / meterData.length);
        const level = clamp(Math.round(rms * 500), 0, 100);
        updateSoundMeters(level);
        detectSuddenSound(level);
        previousSoundLevel = previousSoundLevel * .78 + level * .22;

        if (timestamp - lastVoiceFeatureAt >= VOICE_FEATURE_INTERVAL_MS) {
          analyser.getFloatTimeDomainData(timeDomainData);
          analyser.getFloatFrequencyData(frequencyData);
          const feature = extractVoiceFeature(timeDomainData, frequencyData, audioContext.sampleRate);
          updateAudioVoiceActivity(feature, Date.now());
          lastVoiceFeatureAt = timestamp;
        }
        audioFrame = requestAnimationFrame(draw);
      };
      draw(performance.now());
    } catch (error) {
      dom.soundStateText.textContent = 'Mjerač zvuka nije dostupan';
      if (audioStream) audioStream.getTracks().forEach(track => track.stop());
      audioStream = null;
      if (audioContext) {
        try { await audioContext.close(); } catch { /* nije otvoren */ }
      }
      audioContext = null;
      analyser = null;
      speechGainNode = null;
      // SpeechRecognition može i dalje koristiti vlastiti ulaz mikrofona.
    }
  }

  function updateSoundMeters(level) {
    const bars = [];
    const miniBars = [...dom.miniSoundMeter.children];
    const paint = (items, maxHeight) => {
      items.forEach((bar, index) => {
        const threshold = ((index + 1) / items.length) * 100;
        const active = level >= threshold - 10;
        const normalized = active ? clamp(level / 100, .25, 1) : .16;
        bar.style.height = `${Math.max(3, Math.round(maxHeight * normalized * ((index + 2) / (items.length + 1))))}px`;
        bar.style.background = active ? (level > preferences.soundThreshold ? '#e2a65f' : '#67d5bd') : '';
      });
    };
    paint(bars, 24);
    paint(miniBars, 18);
    dom.soundStateText.textContent = preferences.mode === 'lecture' ? (level < 6 ? 'Tražim udaljeni govor' : level < 24 ? 'Udaljeni govor' : level < 65 ? 'Predavač je jasan' : 'Vrlo glasno') : (level < 8 ? 'Tiho' : level < 35 ? 'Govor u blizini' : level < 70 ? 'Jasan zvuk' : 'Vrlo glasno');
  }

  function detectSuddenSound(level) {
    if (!preferences.soundAlerts || !shouldListen) {
      loudFrames = 0;
      return;
    }

    const now = Date.now();
    const speechRecentlyActive = speechIsActive || now - lastSpeechActivityAt < 900;
    const threshold = clamp(Number(preferences.soundThreshold) || 94, 75, 98);
    const clearlyAboveBackground = level - previousSoundLevel >= 16 || level >= 97;
    const qualifies = !speechRecentlyActive && level >= threshold && clearlyAboveBackground;

    // Require roughly half a second of sustained loud sound. Normal speech and a single
    // microphone spike should not show an accessibility warning.
    loudFrames = qualifies ? loudFrames + 1 : Math.max(0, loudFrames - 2);
    if (loudFrames >= 30 && now - lastSoundAlertAt > 15000) {
      lastSoundAlertAt = now;
      loudFrames = 0;
      dom.loudSoundAlert.hidden = false;
      window.setTimeout(() => { dom.loudSoundAlert.hidden = true; }, 7000);
    }
  }

  function stopAudioMeter(preservePendingAi = false) {
    if (!preservePendingAi) stopNeuralVad();
    speechGainNode = null;
    if (audioFrame) cancelAnimationFrame(audioFrame);
    audioFrame = null;
    analyser = null;
    for (const node of audioGraphNodes) {
      try { node.disconnect?.(); } catch { /* već odspojeno */ }
    }
    audioGraphNodes = [];
    processedAudioTrack?.stop?.();
    processedAudioTrack = null;
    processedAudioDestination = null;
    if (audioStream) audioStream.getTracks().forEach(track => track.stop());
    audioStream = null;
    if (audioContext) audioContext.close().catch(() => {});
    audioContext = null;
    timeDomainData = null;
    frequencyData = null;
    resetVoiceAccumulator();
    pendingVoiceFeature = null;
    lastVoiceFeatureAt = 0;
    audioVadActive = false;
    audioVadSilenceStartedAt = 0;
    noiseFloorRms = .0045;
    lastAudioVoiceAt = 0;
    lastAudioVoiceStartAt = 0;
    previousSoundLevel = 0;
    loudFrames = 0;
    speechIsActive = false;
    lastSpeechActivityAt = 0;
    updateSoundMeters(0);
    dom.soundStateText.textContent = 'Mikrofon miruje';
  }

  // ——— Legacy refinement compatibility path (disabled; no model is loaded in Clarity 6) ———
  //
  // Ovaj stari compatibility blok ostaje zbog spremljenih postavki starijih verzija.
  // whisperEngine ispod je namjerno null-stub; nijedan dodatni model se ne učitava niti izvršava.

  function preferredAiModelKey() {
    if (['base', 'small', 'turbo'].includes(preferences.aiModel)) return preferences.aiModel;
    const cores = Number(navigator.hardwareConcurrency) || 4;
    const memory = Number(navigator.deviceMemory) || 4;
    const hasWebGpu = Boolean(navigator.gpu);
    if (hasWebGpu && cores >= 10 && memory >= 8) return 'turbo';
    return cores >= 6 ? 'small' : 'base';
  }

  function updateAiStatus(state, percent) {
    aiState = state;
    if (!dom.aiStatusPill) return;
    const pill = dom.aiStatusPill;
    if (!preferences.aiRefine || state === 'idle') {
      pill.hidden = true;
      return;
    }
    pill.hidden = false;
    pill.classList.toggle('loading', state === 'loading');
    pill.classList.toggle('working', state === 'working');
    pill.classList.toggle('error', state === 'error' || state === 'unsupported');

    if (state === 'loading') {
      pill.textContent = `AI model se priprema… ${clamp(Math.round(percent || 0), 0, 100)}%`;
    } else if (state === 'working') {
      pill.textContent = aiQueueDepth > 1 ? `Lokalna dorada · red ${aiQueueDepth}` : 'Lokalna dorada prijepisa…';
    } else if (state === 'unsupported' || state === 'error') {
      pill.textContent = 'Lokalna AI dorada trenutačno nije dostupna';
    } else {
      pill.textContent = 'Lokalna AI dorada spremna';
    }
  }

  async function ensureAiTranscriber() {
    if (!preferences.aiRefine) return null;
    const now = Date.now();
    if (now < aiRetryAfter) return null;
    const preferred = preferredAiModelKey();
    if (aiTranscriber && whisperEngine.modelKey === preferred) return aiTranscriber;
    updateAiStatus('loading', 0);
    try {
      aiTranscriber = await whisperEngine.get(preferred, percent => updateAiStatus('loading', percent));
      if (!aiTranscriber && preferred === 'turbo') {
        aiTranscriber = await whisperEngine.get('small', percent => updateAiStatus('loading', percent));
      }
      if (!aiTranscriber) {
        aiRetryAfter = Date.now() + 1200;
        return null;
      }
      aiFailureCount = 0;
      aiRetryAfter = 0;
      updateAiStatus('ready');
      return aiTranscriber;
    } catch (error) {
      // Large v3 Turbo je mnogo zahtjevniji. Ako memorija/WebGPU nisu dovoljni,
      // automatski se vrati na Small umjesto da izgubi lokalni kanal.
      if (preferred === 'turbo') {
        try {
          whisperEngine.reset();
          aiTranscriber = await whisperEngine.get('small', percent => updateAiStatus('loading', percent));
          if (aiTranscriber) {
            aiFailureCount = 0;
            aiRetryAfter = 0;
            updateAiStatus('ready');
            showStatusBanner('Najveći AI model nije stao u dostupne resurse; Clarity je nastavio s Whisper Small modelom.');
            return aiTranscriber;
          }
        } catch (fallbackError) {
          console.warn('[Clarity] Whisper Small fallback također nije dostupan:', fallbackError);
        }
      }
      aiTranscriber = null;
      aiFailureCount = Math.min(aiFailureCount + 1, 6);
      const delay = Math.min(60000, 2500 * (2 ** (aiFailureCount - 1)));
      aiRetryAfter = Date.now() + delay;
      updateAiStatus('unsupported');
      console.warn(`[Clarity] Lokalni AI model trenutačno nije dostupan; novi pokušaj za ${Math.round(delay / 1000)} s:`, error);
      return null;
    }
  }

  function pcmSpeechStats(pcm) {
    if (!(pcm instanceof Float32Array) || !pcm.length) return { duration: 0, rms: 0, peak: 0 };
    let sum = 0;
    let peak = 0;
    for (let i = 0; i < pcm.length; i += 1) {
      const value = Number.isFinite(pcm[i]) ? pcm[i] : 0;
      sum += value * value;
      peak = Math.max(peak, Math.abs(value));
    }
    return {
      duration: pcm.length / 16000,
      rms: Math.sqrt(sum / pcm.length),
      peak
    };
  }

  function aiTranscriptAssessment(text, pcm) {
    const normalized = normalizeRecognizedText(String(text || ''), true);
    const stats = pcmSpeechStats(pcm);
    const words = normalized.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu) || [];
    const lower = normalized.toLocaleLowerCase('hr-HR');
    const shortAllowed = new Set(['da','ne','bok','hvala','molim','dobro','okej','ok','stani','pomoć','test']);
    for (const phrase of modePhraseList()) {
      const key = String(phrase || '').toLocaleLowerCase('hr-HR').trim();
      if (key && !key.includes(' ')) shortAllowed.add(key);
    }
    for (const phrase of preferences.vocabulary || []) {
      const key = String(phrase || '').toLocaleLowerCase('hr-HR').trim();
      if (key && !key.includes(' ')) shortAllowed.add(key);
    }
    const obviousNoise = /(?:^|\s)[\[(<].{0,32}[\])>]?(?:$|\s)|\b(?:music|applause|laughter|laughs|silence|splash|noise|background)\b/iu.test(normalized);
    const repeated = words.length >= 4 && new Set(words.map(word => word.toLocaleLowerCase('hr-HR'))).size <= Math.ceil(words.length * .35);
    const tooShort = stats.duration < AI_MIN_SPEECH_SECONDS;
    const weakSignal = stats.rms < .0014 || stats.peak < .012;
    const singleWordRejected = words.length < AI_MIN_FALLBACK_WORDS && !shortAllowed.has(lower.replace(/[.!?]+$/g, '').trim());
    const mostlySymbols = normalized && normalized.replace(/[\p{L}\p{N}]/gu, '').length > normalized.length * .55;
    const plausible = Boolean(normalized) && !tooShort && !weakSignal && !obviousNoise && !repeated && !singleWordRejected && !mostlySymbols;
    return { plausible, normalized, words, stats, obviousNoise, repeated, singleWordRejected };
  }

  function extractCriticalTokens(text) {
    const value = String(text || '').toLocaleLowerCase('hr-HR');
    const tokens = value.match(/\b\d+(?:[.,]\d+)?\s*(?:mg|g|kg|ml|l|mmol|cm|mm|%|puta|dnevno|sati?|minuta?|eura?|€)?\b/giu) || [];
    return tokens.map(token => token.replace(/\s+/g, '').replace(',', '.'));
  }

  function criticalTokensMatch(left, right) {
    const a = extractCriticalTokens(left);
    const b = extractCriticalTokens(right);
    return a.length === b.length && a.every((token, index) => token === b[index]);
  }

  function applyAiRefinement(serial, text, _voiceFeature = null, sessionId = current.id, epoch = transcriptEpoch, assessment = null) {
    if (!text || current.id !== sessionId || transcriptEpoch !== epoch) return;
    if (ignoredAiSerials.has(`${sessionId}:${serial}`)) return;
    const judged = assessment || aiTranscriptAssessment(text, new Float32Array(16000));
    if (!judged.plausible) return;

    // 3.8.1: lokalni AI NIKADA ne smije sam stvoriti novu rečenicu.
    // Ako browser nije proizveo segment, rezultat se tiho odbacuje.
    const segment = [...current.segments].reverse()
      .find(item => item.type === 'speech' && item.utteranceSerial === serial);
    if (!segment || segment.userEdited || segment.provisional) return;

    const normalizedAi = judged.normalized;
    const similarity = recognitionTextSimilarity(segment.text, normalizedAi);
    if (!criticalTokensMatch(segment.text, normalizedAi)) return;

    const chromeCroatian = recognitionCroatianScore(segment.text);
    const aiCroatian = recognitionCroatianScore(normalizedAi);
    const chromeWords = String(segment.text).trim().split(/\s+/).filter(Boolean).length;
    const aiWords = String(normalizedAi).trim().split(/\s+/).filter(Boolean).length;
    const lengthRatio = Math.min(chromeWords, aiWords) / Math.max(chromeWords, aiWords, 1);

    // AI je sada samo vrlo konzervativan, nevidljiv korektor. Mora biti gotovo ista
    // rečenica, slične duljine i jezično barem jednako uvjerljiva kao browser.
    if (similarity < .90 || lengthRatio < .82 || aiCroatian < chromeCroatian) return;

    if (recognitionTextSimilarity(segment.text, normalizedAi) < .995) {
      segment.originalText = segment.originalText || segment.text;
      segment.text = normalizedAi;
      segment.aiRefined = true; // interna metrika; ne prikazuje se kao badge
      segment.aiFallback = false;
      segment.requiresReview = false;
      segment.aiSuggestion = '';
      persistCurrent(true);
      renderTranscript();
    }
  }

  function enqueueAiPcm(pcm, serial, voiceFeature = null, sessionId = current.id, epoch = transcriptEpoch) {
    if (!preferences.aiRefine || !(pcm instanceof Float32Array) || !pcm.length || !serial) return;
    const stats = pcmSpeechStats(pcm);
    if (stats.duration < .52) return;

    aiQueue.push({ pcm: new Float32Array(pcm), serial, voiceFeature, sessionId, epoch, stats });
    if (aiQueue.length > AI_MAX_QUEUE) {
      // Ako uređaj zaostaje, prvo preskoči AI provjeru reda koji već ima browser final;
      // nikad prvo ne bacaj govor koji postoji samo u lokalnom AI kanalu.
      const droppable = aiQueue.findIndex(task => current.segments.some(segment =>
        segment.type === 'speech' && segment.utteranceSerial === task.serial && !segment.provisional));
      aiQueue.splice(droppable >= 0 ? droppable : 0, 1);
    }
    aiQueueDepth = aiQueue.length + (aiQueueRunning ? 1 : 0);
    drainAiQueue();
  }

  async function drainAiQueue() {
    if (aiQueueRunning || !preferences.aiRefine) return;
    aiQueueRunning = true;
    try {
      while (aiQueue.length && preferences.aiRefine) {
        const task = aiQueue.shift();
        aiQueueDepth = aiQueue.length + 1;
        updateAiStatus('working');
        try {
          const transcriber = await ensureAiTranscriber();
          if (!transcriber) break;
          updateAiStatus('working');
          const output = await transcriber(task.pcm, {
            language: 'croatian',
            task: 'transcribe',
            chunk_length_s: 30,
            return_timestamps: false,
            max_new_tokens: 160
          });
          const text = normalizeRecognizedText(String(output?.text || ''), true);
          const assessment = aiTranscriptAssessment(text, task.pcm);
          if (assessment.plausible) {
            applyAiRefinement(task.serial, assessment.normalized, task.voiceFeature, task.sessionId, task.epoch, assessment);
          }
        } catch (error) {
          console.warn('[Clarity] Lokalna AI obrada rečenice nije uspjela:', error);
        }
      }
    } finally {
      aiQueueRunning = false;
      aiQueueDepth = aiQueue.length;
      updateAiStatus(aiTranscriber ? 'ready' : (aiRetryAfter > Date.now() ? 'unsupported' : 'idle'));
      if (aiQueue.length && preferences.aiRefine) {
        clearTimeout(aiRetryTimer);
        const wait = Math.max(0, aiRetryAfter - Date.now());
        if (wait > 0) {
          aiRetryTimer = window.setTimeout(() => {
            aiRetryTimer = null;
            drainAiQueue();
          }, wait + 40);
        } else {
          queueMicrotask(drainAiQueue);
        }
      }
    }
  }

  async function requestWakeLock() {
    if (!preferences.wakeLock || !navigator.wakeLock || document.visibilityState !== 'visible') return;
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener('release', () => { wakeLock = null; });
    } catch {
      wakeLock = null;
    }
  }

  async function releaseWakeLock() {
    if (!wakeLock) return;
    try { await wakeLock.release(); } catch { /* already released */ }
    wakeLock = null;
  }

  function resetTranscriptRuntimeForSession() {
    transcriptEpoch += 1;
    ignoredAiSerials = new Set();
    aiQueue = [];
    aiQueueDepth = 0;
    clearTimeout(aiRetryTimer);
    aiRetryTimer = null;
    utteranceSerial = 0;
    chromeUtteranceSerial = 0;
    recognitionResultSerials = new Map();
    utteranceStartedAt = 0;
    lastProvisionalSegment = null;
    neuralVadSerial = 0;
    neuralVadSpeaking = false;
    neuralVadSpeechProbability = 0;
  }

  function newSession() {
    if (shouldListen || isListening) stopListening();
    persistCurrent(true);
    current = createEmptySession(preferences.mode);
    resetTranscriptRuntimeForSession();
    interimText = '';
    activeSpeaker = 1;
    lastFinalText = '';
    lastFinalAt = 0;
    lastSpeakerDecisionAt = 0;
    resetModeSpeakerRoles();
    contextualBiasDisabled = false;
    resetVoiceAccumulator();
    pendingVoiceFeature = null;
    saveJson(STORAGE.current, current);
    renderAll();
    closePanels();
    showToast('Otvoren je novi razgovor.');
  }

  function openSession(id) {
    const found = sessions.find(item => item.id === id);
    if (!found) return;
    if (shouldListen || isListening) stopListening();
    persistCurrent(true);
    current = sanitizeSession(structuredCloneSafe(found));
    resetTranscriptRuntimeForSession();
    activeSpeaker = current.segments.filter(item => item.type === 'speech').at(-1)?.speaker || 1;
    lastFinalText = current.segments.filter(item => item.type === 'speech').at(-1)?.text || '';
    lastFinalAt = 0;
    lastSpeakerDecisionAt = 0;
    resetModeSpeakerRoles();
    contextualBiasDisabled = false;
    resetVoiceAccumulator();
    pendingVoiceFeature = null;
    preferences.mode = current.mode;
    savePreferences();
    saveJson(STORAGE.current, current);
    renderAll();
    closePanels();
  }

  function undoLast() {
    if (!current.segments.length) return;
    const removed = current.segments.pop();
    if (removed?.type === 'speech' && removed.utteranceSerial != null) {
      ignoredAiSerials.add(`${current.id}:${removed.utteranceSerial}`);
    }
    persistCurrent(true);
    renderTranscript();
    showToast('Zadnja stavka je uklonjena.');
  }

  function clearCurrent() {
    if (!current.segments.length) return;
    if (!window.confirm('Obrisati cijeli aktivni prijepis?')) return;
    current.segments = [];
    current.speakers = [];
    resetTranscriptRuntimeForSession();
    activeSpeaker = 1;
    lastFinalText = '';
    lastFinalAt = 0;
    lastSpeakerDecisionAt = 0;
    resetModeSpeakerRoles();
    contextualBiasDisabled = false;
    resetVoiceAccumulator();
    pendingVoiceFeature = null;
    current.durationSeconds = 0;
    sessions = sessions.filter(item => item.id !== current.id);
    saveJson(STORAGE.sessions, sessions);
    persistCurrent(false);
    renderAll();
    showToast('Aktivni prijepis je obrisan.');
  }

  async function copyTranscript() {
    if (!current.segments.length) return;
    const text = transcriptAsText(false);
    try {
      await navigator.clipboard.writeText(text);
      showToast('Prijepis je kopiran.');
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      document.body.append(area);
      area.select();
      document.execCommand('copy');
      area.remove();
      showToast('Prijepis je kopiran.');
    }
  }

  function transcriptAsText(includeHeader = true) {
    const lines = current.segments.map(segment => {
      const label = segment.type === 'note' ? 'Bilješka' : speakerName(segment.speaker);
      const time = preferences.timestamps ? `[${formatTime(segment.createdAt)}] ` : '';
      return `${time}${label}: ${segment.text}`;
    });
    if (!includeHeader) return lines.join('\n\n');
    const header = [
      'CLARITY — PRIJEPIS RAZGOVORA',
      `Način: ${modeData[current.mode]?.label || 'Razgovor'}`,
      `Datum: ${new Intl.DateTimeFormat('hr-HR', { dateStyle: 'long', timeStyle: 'short' }).format(current.createdAt)}`,
      `Trajanje: ${formatElapsed(current.durationSeconds)}`,
      '',
      '----------------------------------------',
      ''
    ];
    return [...header, ...lines].join('\n');
  }

  function downloadTranscript() {
    if (!current.segments.length) return;
    const blob = new Blob([transcriptAsText(true)], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const date = new Date(current.createdAt).toISOString().slice(0, 10);
    link.href = url;
    link.download = `clarity-prijepis-${date}.txt`;
    document.body.append(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    showToast('Prijepis je preuzet.');
  }

  function runDemo() {
    const examples = {
      social: [
        ['Nađemo se u subotu oko sedam, ali javim ti još točno mjesto.', 1],
        ['Može, samo mi pošalji poruku ranije jer možda budem u Rijeci.', 2],
        ['Dogovoreno. Pazi, ulaz je privremeno zatvoren zbog radova.', 1]
      ],
      work: [
        ['Nova verzija sučelja ide na pregled u četvrtak prijepodne.', 1],
        ['Armin treba provjeriti mobilnu navigaciju i kontrast gumba prije slanja.', 2],
        ['Ivan će nakon toga potvrditi možemo li objaviti verziju u petak.', 1]
      ],
      doctor: [
        ['Novi program slušnog aparata koristite tri dana u mirnijem okruženju.', 1],
        ['Ako govor i dalje zvuči prigušeno, zapišite kada se to događa.', 1],
        ['Kontrola je sljedeći utorak u deset sati. Hitno se javite ako osjetite bol.', 1]
      ],
      lecture: [
        ['Pristupačnost nije dodatak sučelju nego dio načina na koji proizvod radi.', 1],
        ['Važan primjer je prikaz povratne informacije bez oslanjanja samo na boju.', 1],
        ['Zaključak je da se odluke o pristupačnosti donose tijekom dizajna.', 1]
      ]
    };
    const now = Date.now();
    current.segments = examples[preferences.mode].map((item, index) => ({
      id: createId('demo'),
      text: item[0],
      createdAt: now + index * 15000,
      confidence: index === 1 ? .59 : .92,
      speaker: item[1],
      type: 'speech'
    }));
    current.speakers = [...new Set(current.segments.map(item => item.speaker))].map(id => createSpeakerProfile(id));
    current.createdAt = now;
    current.durationSeconds = 42;
    persistCurrent(true);
    renderAll();
  }

  function buildSummary() {
    const segments = current.segments.filter(item => item.type === 'speech');
    if (!segments.length) return ['Još nema dovoljno teksta za pregled razgovora.'];
    const urgent = segments.filter(item => containsUrgentWord(item.text)).slice(-2);
    const recent = segments.slice(-5);
    const selected = [...urgent, ...recent].filter((item, index, list) => list.findIndex(other => other.id === item.id) === index).slice(-5);
    return selected.map(item => `${speakerName(item.speaker)}: ${item.text}`);
  }

  function openSummary() {
    dom.summaryList.textContent = '';
    buildSummary().forEach((item, index) => {
      const li = document.createElement('li');
      const number = document.createElement('span');
      number.textContent = String(index + 1).padStart(2, '0');
      const p = document.createElement('p');
      p.textContent = item;
      li.append(number, p);
      dom.summaryList.append(li);
    });
    openPanel(dom.summaryPanel);
  }

  function rememberFocusReturn() {
    const active = document.activeElement;
    if (active instanceof HTMLElement && active !== document.body) lastModalTrigger = active;
  }

  function restoreFocusReturn() {
    const target = lastModalTrigger;
    lastModalTrigger = null;
    if (target?.isConnected) {
      try { target.focus({ preventScroll: true }); } catch { /* element više nije fokusabilan */ }
    }
  }

  function focusableElements(root) {
    if (!root) return [];
    return [...root.querySelectorAll(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    )].filter(element => !element.hidden && element.getClientRects().length > 0);
  }

  function activeFocusTrapRoot() {
    const roots = [
      dom.messageDisplay,
      dom.largeView,
      dom.privacyPolicyModal,
      dom.impressumModal,
      dom.quickMessageModal,
      dom.noteModal,
      activePanel
    ];
    return roots.find(root => root && !root.hidden) || null;
  }

  function trapFocus(event) {
    if (event.key !== 'Tab') return;
    const root = activeFocusTrapRoot();
    if (!root) return;
    const focusable = focusableElements(root);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (!root.contains(active)) {
      event.preventDefault();
      first.focus();
      return;
    }
    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function openPanel(panel) {
    if (!activePanel) rememberFocusReturn();
    closePanels(false);
    activePanel = panel;
    dom.panelScrim.hidden = false;
    panel.hidden = false;
    panel.querySelector('button, input, textarea, select')?.focus({ preventScroll: true });
  }

  function closePanels(restoreFocus = true) {
    dom.panelScrim.hidden = true;
    [dom.settingsPanel, dom.summaryPanel, dom.mobileSessionsPanel].forEach(panel => { panel.hidden = true; });
    activePanel = null;
    if (restoreFocus) restoreFocusReturn();
  }

  function openCenterModal(modal) {
    rememberFocusReturn();
    modal.hidden = false;
    modal.querySelector('button, input, textarea, select')?.focus({ preventScroll: true });
  }

  function closeCenterModals(restoreFocus = true) {
    dom.quickMessageModal.hidden = true;
    dom.noteModal.hidden = true;
    if (restoreFocus) restoreFocusReturn();
  }

  function openLegalModal(modal) {
    if (!modal) return;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    closePanels(false);
    closeCenterModals(false);
    lastModalTrigger = trigger;
    dom.privacyPolicyModal.hidden = true;
    dom.impressumModal.hidden = true;
    modal.hidden = false;
    modal.querySelector('button, a[href]')?.focus({ preventScroll: true });
  }

  function closeLegalModals(restoreFocus = true) {
    dom.privacyPolicyModal.hidden = true;
    dom.impressumModal.hidden = true;
    if (restoreFocus) restoreFocusReturn();
  }

  function updateLargeView() {
    const last = current.segments[current.segments.length - 1];
    const liveText = interimText || last?.text || 'Pokreni slušanje i zadnja izgovorena rečenica prikazat će se ovdje.';
    const speaker = interimText ? activeSpeaker : last?.speaker || activeSpeaker;
    dom.largeViewText.textContent = liveText;
    dom.largeViewSpeaker.textContent = last?.type === 'note' && !interimText ? 'Bilješka' : speakerName(speaker);
    dom.largeViewStatus.textContent = interimText ? 'Govor se još zapisuje' : isListening ? 'Zadnja dovršena rečenica' : 'Zadnja rečenica';
    dom.largeView.classList.toggle('urgent', containsUrgentWord(liveText));
    dom.largeViewClock.textContent = formatTime(Date.now());
  }

  function showLargeView() {
    rememberFocusReturn();
    updateLargeView();
    dom.largeView.hidden = false;
    document.body.style.overflow = 'hidden';
    dom.closeLargeViewButton?.focus({ preventScroll: true });
  }

  function hideLargeView() {
    dom.largeView.hidden = true;
    document.body.style.overflow = '';
    restoreFocusReturn();
  }

  function showMessageDisplay(message) {
    const text = String(message || '').trim();
    if (!text) return;
    const trigger = lastModalTrigger || (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    closeCenterModals(false);
    lastModalTrigger = trigger;
    dom.messageDisplayText.textContent = text;
    dom.messageDisplay.hidden = false;
    document.body.style.overflow = 'hidden';
    dom.closeMessageDisplayButton?.focus({ preventScroll: true });
  }

  function hideMessageDisplay() {
    dom.messageDisplay.hidden = true;
    document.body.style.overflow = '';
    restoreFocusReturn();
  }

  function showToast(message, duration = 2200) {
    clearTimeout(toastTimer);
    dom.toast.textContent = message;
    dom.toast.hidden = false;
    toastTimer = window.setTimeout(() => { dom.toast.hidden = true; }, duration);
  }

  function renderAll() {
    preferences.mode = current.mode;
    renderMode();
    renderSpeakerLabels();
    renderSessions();
    renderTranscript();
    dom.elapsed.textContent = formatElapsed(current.durationSeconds);
    updateStatus(isListening ? 'listening' : 'paused');
  }

  function addListItem(listName, value) {
    const text = String(value || '').normalize('NFC').trim().replace(/\s+/g, ' ').slice(0, 60);
    if (!text) return false;
    const list = preferences[listName];
    if (list.some(item => item.toLocaleLowerCase('hr-HR') === text.toLocaleLowerCase('hr-HR'))) return false;
    list.push(text);
    preferences[listName] = list.slice(0, 40);
    savePreferences();
    return true;
  }

  function bindEvents() {
    dom.newSessionButton.addEventListener('click', newSession);
    dom.mobileNewSessionButton.addEventListener('click', newSession);
    dom.emptyStartButton.addEventListener('click', startListening);
    dom.recordButton.addEventListener('click', toggleListening);
    dom.demoButton.addEventListener('click', runDemo);
    dom.modeSwitcher.addEventListener('click', event => {
      const button = event.target.closest('button[data-mode]');
      if (button) setMode(button.dataset.mode);
    });
    dom.voiceLanguageSwitcher?.addEventListener('click', event => {
      const button = event.target.closest('button[data-speech-language]');
      if (button) setSpeechLanguage(button.dataset.speechLanguage);
    });

    dom.undoButton.addEventListener('click', undoLast);
    dom.copyButton.addEventListener('click', copyTranscript);
    dom.downloadButton.addEventListener('click', downloadTranscript);
    dom.clearButton.addEventListener('click', clearCurrent);
    dom.closeStatusButton.addEventListener('click', hideStatusBanner);
    dom.closeEngineNoticeButton.addEventListener('click', dismissEngineNotice);
    dom.dismissSoundAlert.addEventListener('click', () => { dom.loudSoundAlert.hidden = true; });

    dom.settingsButton.addEventListener('click', () => openPanel(dom.settingsPanel));
    dom.mobileSettingsButton.addEventListener('click', () => openPanel(dom.settingsPanel));
    dom.mobileSessionsButton.addEventListener('click', () => openPanel(dom.mobileSessionsPanel));
    dom.summaryButton.addEventListener('click', openSummary);
    dom.panelScrim.addEventListener('click', closePanels);
    document.querySelectorAll('.close-panel').forEach(button => button.addEventListener('click', closePanels));

    dom.largeViewButton.addEventListener('click', showLargeView);
    dom.closeLargeViewButton.addEventListener('click', hideLargeView);
    dom.quickMessageButton.addEventListener('click', () => openCenterModal(dom.quickMessageModal));
    dom.addNoteButton.addEventListener('click', () => openCenterModal(dom.noteModal));
    document.querySelectorAll('.close-center-modal').forEach(button => button.addEventListener('click', closeCenterModals));
    [dom.quickMessageModal, dom.noteModal].forEach(modal => modal.addEventListener('click', event => {
      if (event.target === modal) closeCenterModals();
    }));

    document.querySelectorAll('[data-legal-modal]').forEach(button => {
      button.addEventListener('click', () => openLegalModal($(button.dataset.legalModal)));
    });
    document.querySelectorAll('.close-legal-modal').forEach(button => button.addEventListener('click', closeLegalModals));
    [dom.privacyPolicyModal, dom.impressumModal].forEach(modal => modal.addEventListener('click', event => {
      if (event.target === modal) closeLegalModals();
    }));

    dom.quickMessageModal.querySelectorAll('[data-message]').forEach(button => {
      button.addEventListener('click', () => showMessageDisplay(button.dataset.message));
    });
    dom.customMessageForm.addEventListener('submit', event => {
      event.preventDefault();
      showMessageDisplay(dom.customMessageInput.value);
      dom.customMessageInput.value = '';
    });
    dom.messageDisplay.addEventListener('click', hideMessageDisplay);
    dom.closeMessageDisplayButton.addEventListener('click', event => {
      event.stopPropagation();
      hideMessageDisplay();
    });

    dom.noteForm.addEventListener('submit', event => {
      event.preventDefault();
      const note = dom.noteInput.value.trim();
      if (!note) return;
      addSegment(note, 1, activeSpeaker, 'note');
      dom.noteInput.value = '';
      closeCenterModals();
      showToast('Bilješka je dodana.');
    });

    dom.fontScaleInput.addEventListener('input', () => {
      preferences.fontScale = Number(dom.fontScaleInput.value);
      savePreferences();
    });
    dom.soundAlertsInput.addEventListener('change', () => {
      preferences.soundAlerts = dom.soundAlertsInput.checked;
      savePreferences();
    });
    dom.soundThresholdInput.addEventListener('input', () => {
      preferences.soundThreshold = Number(dom.soundThresholdInput.value);
      savePreferences();
    });
    dom.highContrastInput.addEventListener('change', () => {
      preferences.highContrast = dom.highContrastInput.checked;
      savePreferences();
    });
    dom.reduceMotionInput.addEventListener('change', () => {
      preferences.reduceMotion = dom.reduceMotionInput.checked;
      savePreferences();
    });
    dom.autoScrollInput.addEventListener('change', () => {
      preferences.autoScroll = dom.autoScrollInput.checked;
      savePreferences();
    });
    dom.timestampsInput.addEventListener('change', () => {
      preferences.timestamps = dom.timestampsInput.checked;
      savePreferences();
    });
    dom.wakeLockInput.addEventListener('change', () => {
      preferences.wakeLock = dom.wakeLockInput.checked;
      savePreferences();
      if (preferences.wakeLock && shouldListen) requestWakeLock();
      if (!preferences.wakeLock) releaseWakeLock();
    });
    dom.aiRefineInput.addEventListener('change', () => {
      preferences.aiRefine = dom.aiRefineInput.checked;
      savePreferences();
      if (!preferences.aiRefine) {
        stopNeuralVad();
        aiQueue = [];
        aiQueueDepth = 0;
        aiFailureCount = 0;
        aiRetryAfter = 0;
        clearTimeout(aiRetryTimer);
        aiRetryTimer = null;
        updateAiStatus('idle');
      } else if (shouldListen) {
        startNeuralVad();
        ensureAiTranscriber();
      }
    });
    dom.aiModelSelect.addEventListener('change', () => {
      const next = ['auto', 'base', 'small', 'turbo'].includes(dom.aiModelSelect.value)
        ? dom.aiModelSelect.value
        : 'auto';
      if (next === preferences.aiModel) return;
      preferences.aiModel = next;
      whisperEngine.reset();
      aiTranscriber = null;
      aiQueue = [];
      aiQueueDepth = 0;
      aiFailureCount = 0;
      aiRetryAfter = 0;
      clearTimeout(aiRetryTimer);
      aiRetryTimer = null;
      updateAiStatus('idle');
      savePreferences();
      if (preferences.aiRefine && shouldListen) ensureAiTranscriber();
    });
    dom.standardizeCroatianInput?.addEventListener('change', () => {
      preferences.standardizeCroatian = dom.standardizeCroatianInput.checked;
      savePreferences();
      showToast(preferences.standardizeCroatian
        ? 'Standardizacija hrvatskog uključena je za nove rečenice.'
        : 'Vjerni prijepis uključen je za nove rečenice.');
    });

    dom.keywordForm.addEventListener('submit', event => {
      event.preventDefault();
      if (addListItem('urgentWords', dom.keywordInput.value)) dom.keywordInput.value = '';
    });
    dom.vocabularyForm.addEventListener('submit', event => {
      event.preventDefault();
      if (addListItem('vocabulary', dom.vocabularyInput.value)) {
        dom.vocabularyInput.value = '';
      }
    });
    dom.resetSettingsButton.addEventListener('click', () => {
      if (!window.confirm('Vratiti sve postavke na početne vrijednosti?')) return;
      preferences = structuredCloneSafe(defaultPreferences);
      current.mode = preferences.mode;
      savePreferences();
      renderAll();
      showToast('Postavke su vraćene.');
    });

    document.addEventListener('keydown', event => {
      trapFocus(event);
      if (event.defaultPrevented) return;
      const typing = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
      if (event.key === 'Escape') {
        if (!dom.messageDisplay.hidden) hideMessageDisplay();
        else if (!dom.largeView.hidden) hideLargeView();
        else if (!dom.privacyPolicyModal.hidden || !dom.impressumModal.hidden) closeLegalModals();
        else if (!dom.quickMessageModal.hidden || !dom.noteModal.hidden) closeCenterModals();
        else if (activePanel) closePanels();
        return;
      }
      if (typing) return;
      if (event.key.toLocaleLowerCase('hr-HR') === 'f') showLargeView();
      if (event.ctrlKey && event.code === 'Space') {
        event.preventDefault();
        toggleListening();
      }
    });

    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || !shouldListen) return;
      if (preferences.wakeLock) requestWakeLock();

      // Preglednik može suspendirati Web Speech dok je kartica/prozor u pozadini.
      // Po povratku ne čekamo da korisnik otkrije da mikrofon više ne zapisuje.
      if (!browserRecognitionDisabled && SpeechRecognition && (!recognition || !isListening)) {
        clearTimeout(restartTimer);
        restartTimer = window.setTimeout(() => {
          restartTimer = null;
          if (shouldListen && !browserRecognitionDisabled && (!recognition || !isListening)) createAndStartRecognition();
        }, 120);
      }
    });
    window.addEventListener('online', () => {
      hideStatusBanner();
      if (shouldListen && SpeechRecognition && !browserRecognitionDisabled) {
        softRestartRecognition('Veza je vraćena — obnavljam live diktiranje…', 180);
      }
    });
    window.addEventListener('offline', () => {
      showStatusBanner('Nema internetske veze. Speech servis preglednika može privremeno stati dok se veza ne vrati.');
    });
    window.addEventListener('pagehide', () => {
      persistCurrent(true);
      flushDurableState(current, sessions).catch(() => {});
    });
    window.addEventListener('beforeunload', () => {
      if (shouldListen || isListening) stopListening();
    });
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
    // 5.1.1: tijekom aktivnog razvoja ne registriramo offline shell. Stari mobilni
    // service worker može inače satima držati prethodni app.js/app.css nakon deploya.
    window.addEventListener('load', async () => {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map(registration => registration.unregister()));
        if ('caches' in window) {
          const keys = await caches.keys();
          await Promise.all(keys.filter(key => key.startsWith('clarity-web-')).map(key => caches.delete(key)));
        }
      } catch (error) {
        console.warn('[Clarity] Stari service worker/cache nije se mogao ukloniti:', error);
      }
    }, { once: true });
  }

  async function hydrateDurableState() {
    const legacyCurrent = current;
    const legacySessions = sessions;
    try {
      const durable = await loadDurableState();
      const hasDurableCurrent = durable?.current && typeof durable.current === 'object';
      const hasDurableSessions = Array.isArray(durable?.sessions);

      if (hasDurableCurrent) current = sanitizeSession(durable.current);
      else current = sanitizeSession(legacyCurrent);

      if (hasDurableSessions) sessions = durable.sessions.map(sanitizeSession).slice(0, 20);
      else sessions = Array.isArray(legacySessions) ? legacySessions.map(sanitizeSession).slice(0, 20) : [];

      if (current.segments.length) {
        sessions = [current, ...sessions.filter(item => item.id !== current.id)].slice(0, 20);
      }

      // Jednokratna migracija iz stare sinkrone localStorage pohrane.
      if (!hasDurableCurrent || !hasDurableSessions) {
        await flushDurableState(current, sessions);
      }
      if (durable?.backend === 'indexeddb') {
        localStorage.removeItem(STORAGE.current);
        localStorage.removeItem(STORAGE.sessions);
      }
    } catch (error) {
      console.warn('[Clarity] Nije moguće učitati IndexedDB; zadržavam kompatibilnu pohranu:', error);
      current = sanitizeSession(legacyCurrent);
      sessions = Array.isArray(legacySessions) ? legacySessions.map(sanitizeSession).slice(0, 20) : [];
    }

    activeSpeaker = current.segments.filter(item => item.type === 'speech').at(-1)?.speaker || 1;
    lastFinalText = current.segments.filter(item => item.type === 'speech').at(-1)?.text || '';
    lastFinalAt = 0;
    preferences.mode = current.mode;
    resetModeSpeakerRoles();
    resetVoiceAccumulator();
    pendingVoiceFeature = null;
  }

  async function loadAppVersion() {
    if (!dom.appVersion) return;
    try {
      const response = await fetch('./clarity-health.json', { cache: 'no-store' });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const health = await response.json();
      dom.appVersion.textContent = health.version ? `Clarity ${health.version}` : 'Clarity';
    } catch {
      dom.appVersion.textContent = 'Clarity';
    }
  }

  async function initialize() {
    await hydrateDurableState();
    bindEvents();
  registerServiceWorker();
    applyPreferences();
    renderAll();
    loadAppVersion();
    dom.engineNotice.hidden = Boolean(loadJson(STORAGE.engineNoticeDismissed, false));
    savePreferences();
    persistCurrent();

    if (!SpeechRecognition) {
      if (canUseLocalAiListening()) {
        showStatusBanner('Live hrvatski diktat nije dostupan u ovom pregledniku. Za ovu verziju koristi aktualni Google browser.');
        updateStatus('paused', 'Koristi aktualni Google browser za hrvatski diktat');
      } else {
        dom.recordButton.disabled = true;
        dom.emptyStartButton.disabled = true;
        showStatusBanner('Za diktiranje otvori ovu aplikaciju u aktualnom Google browseru. Lokalna pohrana i ostale funkcije i dalje rade.');
        updateStatus('error', 'Diktiranje nije podržano');
      }
    }
  }

  initialize().catch(error => {
    console.error('[Clarity] Pokretanje aplikacije nije uspjelo:', error);
    showStatusBanner('Clarity se nije mogao potpuno pokrenuti. Osvježi stranicu ili ponovno pokreni aplikaciju.');
  });
})();
