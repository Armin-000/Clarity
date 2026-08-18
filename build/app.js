(() => {
  'use strict';
  // Clarity 3.5.1 — stabilno slušanje + pristupačnost + pravne informacije.

  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const STORAGE = {
    preferences: 'clarity.accessibility.preferences.v3.0.2',
    sessions: 'clarity.accessibility.sessions.v3',
    current: 'clarity.accessibility.current.v3',
    engineNoticeDismissed: 'clarity.accessibility.engineNoticeDismissed.v1'
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
      vad: { noiseMultiplier: 2.25, bias: .0012, min: .0062, max: .028, hangover: 280 },
      audio: { highPass: 78, presenceHz: 2700, presenceGain: 2.4, compressorThreshold: -34, compressorRatio: 3.2, compressorAttack: .004, compressorRelease: .18, gain: 1.08, noiseSuppression: true, echoCancellation: true, voiceIsolation: true, processedTrack: false },
      phrases: ['pozdrav', 'hvala', 'molim', 'dogovor', 'termin'],
      tips: [
        ['Razlikuje više glasova', 'Clarity automatski stvara profile Govornik 1, 2, 3… i pamti ih tijekom razgovora.'],
        ['Imena se prepoznaju automatski', 'Predstavljanje poput “Ja sam Marko” povezuje ime s glasom bez ručnog odabira.'],
        ['Najbolje radi pri izmjeni govora', 'Ako ljudi govore istodobno preko iste mikrofonije, prijepis može biti manje precizan.']
      ]
    },
    work: {
      label: 'Posao',
      description: 'Optimizirano za razgovor 1-na-1 između korisnika i klijenta, poslodavca ili kolege.',
      status: 'Posao · 1-na-1 · dva glasovna profila',
      speakerLimit: 2,
      maxAlternatives: 7,
      reviewConfidence: .68,
      phraseBoost: 3.4,
      vad: { noiseMultiplier: 2.1, bias: .0010, min: .0058, max: .026, hangover: 300 },
      audio: { highPass: 82, presenceHz: 2750, presenceGain: 2.8, compressorThreshold: -35, compressorRatio: 3.4, compressorAttack: .004, compressorRelease: .19, gain: 1.10, noiseSuppression: true, echoCancellation: true, voiceIsolation: true, processedTrack: false },
      phrases: ['klijent', 'poslodavac', 'projekt', 'rok', 'ugovor', 'ponuda', 'račun', 'cijena', 'sastanak', 'isporuka', 'zadatak', 'prioritet', 'dogovor', 'termin', 'plaća', 'budžet', 'faktura'],
      tips: [
        ['Dva glavna govornika', 'Profil očekuje razgovor u četiri oka i namjerno ograničava automatsko stvaranje lažnih dodatnih govornika.'],
        ['Poslovni pojmovi imaju prednost', 'Rokovi, projekti, cijene, ugovori i nazivi iz osobnog rječnika dobivaju dodatni kontekst pri prepoznavanju.'],
        ['Odluke ostaju čitljive', 'Niža sigurnost prepoznavanja označava se za provjeru prije nego što se na prijepis osloniš.']
      ]
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
      vad: { noiseMultiplier: 2.05, bias: .0010, min: .0056, max: .025, hangover: 320 },
      audio: { highPass: 80, presenceHz: 2850, presenceGain: 3.0, compressorThreshold: -36, compressorRatio: 3.6, compressorAttack: .004, compressorRelease: .20, gain: 1.12, noiseSuppression: true, echoCancellation: true, voiceIsolation: true, processedTrack: false },
      phrases: ['liječnik', 'doktor', 'terapija', 'lijek', 'lijekovi', 'doza', 'tableta', 'tablete', 'kapsula', 'miligram', 'miligrama', 'mililitar', 'mililitara', 'jednom dnevno', 'dva puta dnevno', 'tri puta dnevno', 'recept', 'uputnica', 'nalaz', 'dijagnoza', 'simptomi', 'krvni tlak', 'temperatura', 'alergija', 'antibiotik', 'kontrola', 'pregled', 'krvna slika', 'šećer u krvi'],
      criticalTerms: ['terapija', 'lijek', 'lijekovi', 'doza', 'tableta', 'tablete', 'kapsula', 'miligram', 'miligrama', 'mililitar', 'mililitara', 'recept', 'dijagnoza', 'antibiotik', 'alergija', 'krvni tlak', 'šećer u krvi'],
      tips: [
        ['Liječnički govor ima prioritet', 'Clarity traži više mogućih prijepisa i koristi medicinski kontekst kako bi odabrao uvjerljiviju varijantu.'],
        ['Doze i terapija se strože provjeravaju', 'Rečenice s lijekovima, dozama ili mjernim jedinicama označavaju se već pri manjoj sumnji.'],
        ['Ne skriva nesigurnost', 'Ako prepoznavanje nije dovoljno sigurno, Clarity će tražiti da važan detalj provjeriš umjesto da se pretvara da je siguran.']
      ]
    },
    lecture: {
      label: 'Predavanje',
      description: 'Far-field profil za profesora ili predavača koji govori s veće udaljenosti; čuva tiši govor i traži detaljniji prijepis.',
      status: 'Predavanje · far-field · dominantni predavač',
      speakerLimit: 4,
      maxAlternatives: 10,
      reviewConfidence: .67,
      phraseBoost: 3.2,
      vad: { noiseMultiplier: 1.55, bias: .00065, min: .0038, max: .020, hangover: 430 },
      audio: { highPass: 92, presenceHz: 2600, presenceGain: 4.0, compressorThreshold: -45, compressorRatio: 5.0, compressorAttack: .006, compressorRelease: .28, gain: 1.48, noiseSuppression: false, echoCancellation: true, voiceIsolation: false, processedTrack: false },
      phrases: ['profesor', 'predavač', 'predavanje', 'ispit', 'kolokvij', 'seminar', 'definicija', 'primjer', 'objašnjenje', 'važno', 'zapamtite', 'poglavlje', 'formula', 'zadataka'],
      tips: [
        ['Pojačan udaljeni govor', 'Kompresija i osjetljiviji VAD čuvaju tiši glas predavača koji dolazi s druge strane učionice.'],
        ['Traži dominantnog predavača', 'Govornik koji kontinuirano daje većinu sadržaja označava se kao predavač, dok kratke upadice studenata ostaju odvojene.'],
        ['Pauza ne prekida slušanje', 'Tišina sama više ne pokreće restart. Clarity obnavlja diktiranje samo kada stvarno čuje govor bez rezultata.']
      ]
    }
  };

  const defaultPreferences = {
    mode: 'social',
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
    vocabulary: ['Rijeka', 'Zagreb', 'AlphaWave']
  };

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
    toast: $('toast')
  };

  const MAX_AUTO_SPEAKERS = 6;
  const VOICE_FEATURE_INTERVAL_MS = 80;
  const SPEAKER_HYSTERESIS_MS = 700;
  const RECOGNITION_WATCHDOG_INTERVAL_MS = 800;
  const RECOGNITION_START_TIMEOUT_MS = 6000;
  const RECOGNITION_AUDIO_STALL_MS = 3600;
  const RECOGNITION_RECOVERY_DELAY_MS = 320;
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

  // Mali lokalni rječnik čestih imena koristi se samo unutar rečenica predstavljanja.
  // Ne mijenja običan govor i ne sprema automatski pogrešno prepoznata imena u postavke.
  const KNOWN_GIVEN_NAMES = [
    'Adnan','Adriana','Adrijana','Ajla','Aleksandar','Aleksandra','Alen','Alena','Alma','Almir','Amar','Amela','Amina','Amna','Armen','Azra',
    'Ana','Anamarija','Andrea','Andrej','Andrija','Anela','Anes','Anita','Ante','Anton','Antonio','Antonija',
    'Armin','Barbara','Borna','Boris','Branimir','Branko','Bruna','Bruno','Damir','Danijel','Danijela','Dario',
    'Darko','David','Davor','Dejan','Denis','Dino','Domagoj','Dora','Dorotea','Dražen','Dubravko','Dženan','Edin','Edita','Ema','Emil','Emin','Emina','Emir','Enis','Ermin',
    'Erik','Erna','Esma','Eva','Evelin','Faris','Faruk','Filip','Fran','Frane','Gabrijel','Gabrijela','Goran','Hamza','Hana','Harun',
    'Helena','Hrvoje','Ibrahim','Igor','Ilija','Ismail','Ismet','Iva','Ivan','Ivana','Ivano','Ivica','Ivona','Jakov','Jasmin','Jasmina','Jelena','Josip',
    'Josipa','Jovana','Juraj','Karlo','Katarina','Kenan','Krešimir','Kristijan','Kristina','Lamija','Lana','Laura','Lejla','Leon','Leona','Lovro','Luka','Lucija',
    'Maja','Magdalena','Marin','Marina','Maria','Mario','Marija','Marko','Martin','Martina','Matea','Matej','Mateo','Matija','Melina','Melisa','Merima','Mia','Milan','Milica','Mirza',
    'Mile','Milena','Mirela','Mirna','Mislav','Mladen','Nedim','Nejla','Nejra','Nermin','Nermina','Nika','Nikola','Nikolina','Nina','Noa','Paola','Paula','Petar','Petra',
    'Roko','Sabina','Samir','Sandra','Sanja','Sara','Selma','Senad','Slaven','Sonja','Stipe','Stjepan','Tamara','Tanja','Tarik','Tea','Tin','Tina','Tomislav','Una',
    'Vedran','Viktor','Viktorija','Zoran','Zvonimir','Željko','Željka','Ekrem'
  ];


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
    [/\bništo\b/giu, 'ništa'], [/\bništ\b/giu, 'ništa'], [/\bnešta\b/giu, 'nešto'],
    [/\buvjek\b/giu, 'uvijek'], [/\bvjerovatno\b/giu, 'vjerojatno'], [/\bvjerovatni\b/giu, 'vjerojatni'], [/\bvjerovatna\b/giu, 'vjerojatna'],
    [/\bsumljam\b/giu, 'sumnjam'], [/\bsumlja\b/giu, 'sumnja'], [/\bsumljivo\b/giu, 'sumnjivo'],
    [/\bsljedeči\b/giu, 'sljedeći'], [/\bslijedeći\b/giu, 'sljedeći'], [/\bslijedeća\b/giu, 'sljedeća'], [/\bslijedeće\b/giu, 'sljedeće'],
    [/\bčovijek\b/giu, 'čovjek'], [/\bčovijeka\b/giu, 'čovjeka'], [/\brijeć\b/giu, 'riječ'], [/\brijeći\b/giu, 'riječi'],
    [/\bhtjeo\b/giu, 'htio'], [/\bhtjela bi\b/giu, 'htjela bih'], [/\bhtjeo bi\b/giu, 'htio bih'],
    [/\bda li\b/giu, 'je li'], [/\bs obzirom da\b/giu, 's obzirom na to da']
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
  let sessions = loadJson(STORAGE.sessions, []);
  let current = loadJson(STORAGE.current, null) || createEmptySession(preferences.mode);
  current = sanitizeSession(current);
  let activeSpeaker = current.segments.filter(item => item.type === 'speech').at(-1)?.speaker || 1;
  let doctorSpeakerId = null;
  let lectureSpeakerId = null;
  let speakerRoleEvidence = new Map();
  let contextualBiasDisabled = false;
  let processedRecognitionDisabled = false;
  let recognition = null;
  let recognitionGeneration = 0;
  let recognitionWatchdogTimer = null;
  let recognitionLastEventAt = 0;
  let recognitionLastResultAt = 0;
  let recognitionLastFinalAt = 0;
  let recognitionStartedAt = 0;
  let recognitionStartAttemptAt = 0;
  let recognitionLastEndAt = 0;
  let recognitionRapidEndCount = 0;
  let shouldListen = false;
  let isListening = false;
  let restartTimer = null;
  let interimCommitTimer = null;
  let interimChangedAt = 0;
  let utteranceSerial = 0;
  let utteranceStartedAt = 0;
  let lastProvisionalSegment = null;
  let elapsedTimer = null;
  let toastTimer = null;
  let interimText = '';
  let lastFinalText = '';
  let lastFinalAt = 0;
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
    next.fontScale = clamp(Number(next.fontScale) || 1, .9, 1.55);
    next.soundThreshold = clamp(Number(next.soundThreshold) || 94, 75, 98);
    next.speakerOne = cleanLabel(next.speakerOne, 'Govornik 1');
    next.speakerTwo = cleanLabel(next.speakerTwo, 'Govornik 2');
    next.urgentWords = normalizeStringList(next.urgentWords, defaultPreferences.urgentWords);
    next.vocabulary = normalizeStringList(next.vocabulary, defaultPreferences.vocabulary);
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
    repairCollapsedNamedSpeakers(next);
    return next;
  }

  function repairCollapsedNamedSpeakers(session) {
    const speech = session.segments.filter(item => item.type === 'speech');
    if (speech.length < 2) return;

    const usedIds = new Set(speech.map(item => item.speaker));
    const introductions = speech
      .map(segment => ({ segment, details: detectIntroducedNameDetails(segment.text) }))
      .filter(item => item.details?.name);
    const distinctNames = [...new Set(introductions.map(item => normalizeNameKey(item.details.name)))];

    // Popravljamo samo poznati 3.1.0 kvar: svi redci su završili na istom speaker ID-u,
    // a u tekstu postoje najmanje dva različita jasna predstavljanja.
    if (usedIds.size !== 1 || distinctNames.length < 2) return;

    const nameToId = new Map();
    const rebuiltProfiles = [];
    let activeId = 1;

    for (const segment of speech) {
      const details = detectIntroducedNameDetails(segment.text);
      if (details?.name) {
        const key = normalizeNameKey(details.name);
        if (!nameToId.has(key) && nameToId.size < MAX_AUTO_SPEAKERS) {
          const id = nameToId.size + 1;
          nameToId.set(key, id);
          const profile = createSpeakerProfile(id, null, details.name);
          profile.detectedName = details.name;
          profile.label = details.name;
          rebuiltProfiles.push(profile);
        }
        activeId = nameToId.get(key) || activeId;
        segment.text = normalizeRecognizedText(applyIntroducedNameCorrection(segment.text), true);
      }
      segment.speaker = activeId;
    }

    if (rebuiltProfiles.length >= 2) {
      session.speakers = rebuiltProfiles;
    }
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
      provisional: false
    };
  }

  function sanitizeSpeakerProfile(profile) {
    if (!profile || typeof profile !== 'object') return null;
    const id = clamp(Math.round(Number(profile.id) || 1), 1, MAX_AUTO_SPEAKERS);
    const voice = profile.voice && typeof profile.voice === 'object' ? profile.voice : {};
    return {
      id,
      label: cleanLabel(profile.label, `Govornik ${id}`),
      detectedName: cleanLabel(profile.detectedName, ''),
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
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Private browsing or storage full. */ }
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function normalizeRecognizedText(value, finalize = true) {
    let text = String(value || '').normalize('NFC').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!text) return '';

    const corrections = [
      [/\bpoždrav\b/giu, 'pozdrav'],
      [/\bpo\s+zdrav\b/giu, 'pozdrav']
    ];
    for (const [pattern, replacement] of corrections) {
      text = text.replace(pattern, match => preserveInitialCase(match, replacement));
    }

    text = normalizeToCroatianStandard(text);
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
    for (const pattern of NON_CROATIAN_ALTERNATIVE_MARKERS) {
      pattern.lastIndex = 0;
      const matches = source.match(pattern);
      if (matches?.length) score -= Math.min(.24, matches.length * .055);
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
    const profile = current?.speakers?.find(item => item.id === id);
    if (profile?.label) return profile.label;
    if (id === 1 && preferences.speakerOne !== 'Govornik 1') return preferences.speakerOne;
    if (id === 2 && preferences.speakerTwo !== 'Govornik 2') return preferences.speakerTwo;
    return `Govornik ${id}`;
  }

  function createSpeakerProfile(id, feature = null, label = '') {
    const safeId = clamp(Math.round(Number(id) || 1), 1, MAX_AUTO_SPEAKERS);
    return {
      id: safeId,
      label: cleanLabel(label, `Govornik ${safeId}`),
      detectedName: '',
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

  function normalizeNameKey(value) {
    return String(value || '')
      .normalize('NFD')
      .replace(/\p{M}+/gu, '')
      .toLocaleLowerCase('hr-HR')
      .replace(/[^\p{L}'’\- ]+/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function namesMatch(a, b) {
    return Boolean(a && b && normalizeNameKey(a) === normalizeNameKey(b));
  }

  function findSpeakerByDetectedName(name) {
    if (!name) return null;
    return current.speakers.find(profile => profile.detectedName && namesMatch(profile.detectedName, name)) || null;
  }

  function resolveSpeaker(feature, text = '') {
    const now = Date.now();
    const introducedName = detectIntroducedName(text);
    if (!Array.isArray(current.speakers)) current.speakers = [];

    // Ako se ista osoba ponovno predstavi istim imenom, ime je snažniji signal od
    // kratkotrajnog kolebanja akustičkog profila.
    const namedProfile = findSpeakerByDetectedName(introducedName);
    if (namedProfile) {
      if (feature?.quality >= .2) updateSpeakerProfile(namedProfile, feature);
      activeSpeaker = namedProfile.id;
      lastSpeakerDecisionAt = now;
      maybeApplyIntroducedName(namedProfile.id, text);
      renderSpeakerLabels();
      return namedProfile.id;
    }

    const activeProfile = current.speakers.find(item => item.id === activeSpeaker);

    // Ključna zaštita: novo, različito predstavljanje nikad ne smije preimenovati
    // već imenovanog govornika. Otvori novi profil čak i ako je akustički uzorak slab.
    if (introducedName && activeProfile?.detectedName && !namesMatch(activeProfile.detectedName, introducedName)) {
      const nextId = nextAvailableSpeakerId();
      if (nextId) {
        const fresh = ensureSpeakerProfile(nextId, feature?.quality >= .2 ? feature : null);
        activeSpeaker = fresh.id;
        lastSpeakerDecisionAt = now;
        maybeApplyIntroducedName(fresh.id, text);
        renderSpeakerLabels();
        return fresh.id;
      }
    }

    if (!feature || feature.quality < .2) {
      const fallback = ensureSpeakerProfile(activeSpeaker || 1);
      maybeApplyIntroducedName(fallback.id, text);
      return fallback.id;
    }

    if (!current.speakers.length) {
      const first = ensureSpeakerProfile(1, feature);
      activeSpeaker = first.id;
      lastSpeakerDecisionAt = now;
      maybeApplyIntroducedName(first.id, text);
      return first.id;
    }

    // Profil nastao samo iz imena ili migracije još nema akustički potpis.
    // Prvi kvalitetni govorni odsječak treba naučiti taj profil, a ne otvoriti novi zbog distance = Infinity.
    const activeForLearning = current.speakers.find(item => item.id === activeSpeaker);
    if (activeForLearning && (activeForLearning.samples || 0) === 0) {
      updateSpeakerProfile(activeForLearning, feature);
      activeSpeaker = activeForLearning.id;
      lastSpeakerDecisionAt = now;
      maybeApplyIntroducedName(activeForLearning.id, text);
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

    // Ako prethodni govornik još nema ime, novo predstavljanje može otvoriti novi profil
    // samo kada se i glas dovoljno razlikuje. Time "Bok... ja sam Armin" iste osobe ostaje zajedno.
    if (introducedName && currentActiveProfile && !currentActiveProfile.detectedName &&
        gapSincePreviousFinal > 650 && nearestDistance > .9) {
      const nextId = nextAvailableSpeakerId();
      if (nextId) chosen = ensureSpeakerProfile(nextId, feature);
    } else if (currentActiveProfile &&
               now - lastSpeakerDecisionAt < (preferences.mode === 'lecture' ? 980 : preferences.mode === 'doctor' ? 760 : SPEAKER_HYSTERESIS_MS) &&
               activeDistance <= Math.max(1.12, nearestDistance + .18)) {
      // Kratka histereza drži jednu rečenicu na istom profilu, ali više ne blokira
      // brzu izmjenu ljudi tijekom nekoliko sekundi.
      chosen = currentActiveProfile;
    } else {
      const newSpeakerThreshold = preferences.mode === 'lecture'
        ? (current.speakers.length === 1 ? 1.46 : 1.58)
        : preferences.mode === 'doctor' || preferences.mode === 'work'
          ? (current.speakers.length === 1 ? 1.26 : 1.40)
          : (current.speakers.length === 1 ? 1.32 : 1.44);
      const enoughSeparation = nearestDistance > newSpeakerThreshold;
      const turnBoundary = gapSincePreviousFinal > 320 || activeDistance > newSpeakerThreshold + .18;
      const shouldCreate = enoughSeparation && turnBoundary && feature.quality >= .34 &&
        current.speakers.length < modeSpeakerLimit();
      if (shouldCreate) {
        const nextId = nextAvailableSpeakerId();
        if (nextId) chosen = ensureSpeakerProfile(nextId, feature);
      }
    }

    // Novi profil već sadrži prvi uzorak; postojeći profil tek sada uči novi uzorak.
    if ((chosen.samples || 0) === 0 ||
        !(chosen.samples === 1 && chosen.lastSeenAt && now - chosen.lastSeenAt < 120)) {
      updateSpeakerProfile(chosen, feature);
    }
    activeSpeaker = chosen.id;
    lastSpeakerDecisionAt = now;
    maybeApplyIntroducedName(chosen.id, text);
    renderSpeakerLabels();
    return chosen.id;
  }

  function maybeApplyIntroducedName(speakerId, text) {
    const name = detectIntroducedName(text);
    if (!name) return false;
    const profile = ensureSpeakerProfile(speakerId);

    // Nikad ne prepisuj već potvrđeno ime drugim predstavljanjem. resolveSpeaker()
    // će za novo ime otvoriti drugi profil ako ima slobodnog mjesta.
    if (profile.detectedName && !namesMatch(profile.detectedName, name)) return false;
    if (profile.detectedName && namesMatch(profile.detectedName, name)) return true;

    profile.detectedName = name;
    profile.label = name;

    // Namjerno NE spremamo automatski prepoznato ime u globalni rječnik.
    // U 3.1.0 je pogreška poput "Ekran" time postajala trajna i forsirala iduće rezultate.
    persistCurrent();
    renderSpeakerLabels();
    renderTranscript();
    showToast(`Prepoznao sam govornika: ${name}.`, 2600);
    return true;
  }

  function introductionPatterns() {
    return [
      /(?:^|[^\p{L}])(?:ja\s+sam|zovem\s+se|ja\s+se\s+zovem|moje\s+ime\s+je)\s+([\p{L}][\p{L}'’\-]{1,24})(?:\s+([\p{L}][\p{L}'’\-]{1,24}))?/iu,
      /(?:^|[^\p{L}])(?:bok|pozdrav|ćao|cao|hej|dobar\s+dan|dobra\s+večer)\s*(?:svima\s+)?(?:ovdje\s+je|ovdje\s+sam)\s+([\p{L}][\p{L}'’\-]{1,24})(?:\s+([\p{L}][\p{L}'’\-]{1,24}))?/iu
    ];
  }

  function detectIntroducedNameDetails(text) {
    const source = String(text || '').normalize('NFC').replace(/[.!?,;:]+/g, ' ').replace(/\s+/g, ' ').trim();
    if (!source) return null;
    const stop = new Set(['i','pa','ali','da','koji','koja','koje','ovdje','tu','danas','sada','sad','dobro','super','opet','sam','je','se','smo','ste','iz','sa','s','od','u','na','za','kod','preko','među','između']);
    for (const pattern of introductionPatterns()) {
      const match = source.match(pattern);
      if (!match?.[1]) continue;
      const rawParts = [match[1], match[2]]
        .filter(Boolean)
        .filter(part => !stop.has(part.toLocaleLowerCase('hr-HR')));
      if (!rawParts.length) continue;

      const corrected = correctLikelyGivenName(rawParts[0]);
      const correctedFirst = corrected?.name || capitalizeNamePart(rawParts[0]);
      const nameParts = [correctedFirst, ...rawParts.slice(1).map(capitalizeNamePart)].slice(0, 2);
      return {
        name: nameParts.join(' '),
        rawName: rawParts.slice(0, 2).join(' '),
        rawFirst: rawParts[0],
        correctedFirst,
        correctionScore: corrected?.score || 0,
        corrected: Boolean(corrected && !namesMatch(corrected.name, rawParts[0]))
      };
    }
    return null;
  }

  function detectIntroducedName(text) {
    return detectIntroducedNameDetails(text)?.name || '';
  }

  function isCanonicalGivenName(value) {
    const key = normalizeNameKey(value);
    return KNOWN_GIVEN_NAMES.some(name => normalizeNameKey(name) === key);
  }

  function nameCandidates() {
    const custom = (preferences?.vocabulary || [])
      .filter(item => /^[\p{L}'’\-]{2,25}$/u.test(String(item || '').trim()));
    return [...new Set([...KNOWN_GIVEN_NAMES, ...custom])];
  }

  function nameSubstitutionCost(a, b) {
    if (a === b) return 0;
    const vowels = new Set(['a','e','i','o','u']);
    if (vowels.has(a) && vowels.has(b)) return .36;
    const softPairs = new Set(['mn','nm','bp','pb','dt','td','gk','kg','sz','zs','fv','vf','rl','lr','cj','jc']);
    if (softPairs.has(`${a}${b}`)) return .46;
    return 1;
  }

  function weightedNameDistance(a, b) {
    const left = normalizeNameKey(a);
    const right = normalizeNameKey(b);
    if (!left) return right.length;
    if (!right) return left.length;
    const previous = Array.from({ length: right.length + 1 }, (_v, i) => i);
    for (let i = 1; i <= left.length; i += 1) {
      const currentRow = [i];
      for (let j = 1; j <= right.length; j += 1) {
        currentRow[j] = Math.min(
          currentRow[j - 1] + 1,
          previous[j] + 1,
          previous[j - 1] + nameSubstitutionCost(left[i - 1], right[j - 1])
        );
      }
      for (let j = 0; j < currentRow.length; j += 1) previous[j] = currentRow[j];
    }
    return previous[right.length];
  }

  function correctLikelyGivenName(value) {
    const raw = capitalizeNamePart(value);
    if (!raw || raw.length < 3) return null;

    const exact = nameCandidates().find(candidate => namesMatch(candidate, raw));
    if (exact) return { name: exact, score: 1 };

    // Korisnički rječnik prihvaćamo za točno podudaranje, ali fuzzy korekciju
    // radimo samo prema ugrađenom popisu imena da stručni pojmovi ne postanu "ime".
    const ranked = KNOWN_GIVEN_NAMES
      .map(candidate => {
        const distance = weightedNameDistance(raw, candidate);
        const score = 1 - distance / Math.max(normalizeNameKey(raw).length, normalizeNameKey(candidate).length, 1);
        return { name: candidate, score };
      })
      .sort((a, b) => b.score - a.score);

    const best = ranked[0];
    const second = ranked[1];
    if (!best) return null;
    const margin = best.score - (second?.score || 0);
    return best.score >= .78 && margin >= .055 ? best : null;
  }

  function applyIntroducedNameCorrection(text) {
    const details = detectIntroducedNameDetails(text);
    if (!details?.corrected || !details.rawFirst) return text;
    const pattern = new RegExp(`(^|[^\\p{L}])(${escapeRegex(details.rawFirst)})(?=$|[^\\p{L}])`, 'iu');
    return String(text).replace(pattern, (_match, prefix) => `${prefix}${details.correctedFirst}`);
  }

  function modePhraseList() {
    const data = activeModeProfile();
    const canonicalTerms = SYSTEM_CANONICAL_TERMS.map(entry => entry.canonical);
    const values = [...(data.phrases || []), ...canonicalTerms, ...(preferences.vocabulary || [])];
    return [...new Set(values.map(value => String(value || '').normalize('NFC').trim()).filter(Boolean))].slice(0, 120);
  }

  function phraseOccurs(text, phrase) {
    const source = normalizeNameKey(text);
    const key = normalizeNameKey(phrase);
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

  function applyContextualBias(instance) {
    if (contextualBiasDisabled || !instance || !('phrases' in instance) || typeof window.SpeechRecognitionPhrase !== 'function') return false;
    try {
      const data = activeModeProfile();
      const phrases = modePhraseList().map(phrase => new window.SpeechRecognitionPhrase(phrase, clamp(data.phraseBoost || 2, 0, 10)));
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
    const candidates = [];
    for (let index = 0; index < Math.min(Number(result?.length) || 0, activeModeProfile().maxAlternatives || 5); index += 1) {
      const alternative = result[index];
      const rawTranscript = String(alternative?.transcript || '').normalize('NFC').trim();
      const text = normalizeRecognizedText(rawTranscript, false);
      if (!text) continue;
      const details = detectIntroducedNameDetails(text);
      const confidence = Number.isFinite(alternative?.confidence) && alternative.confidence > 0 ? alternative.confidence : .5;
      let score = confidence + recognitionCroatianScore(rawTranscript);

      // Kod predstavljanja preferiraj alternativu koja sadrži stvarno poznato ime.
      // To pomaže kada Chrome npr. vrati "Ekran" kao prvi, a "Ekrem" kao drugu alternativu.
      if (details) {
        if (isCanonicalGivenName(details.rawFirst)) score += .36;
        else if (details.corrected) score += .15 * details.correctionScore;
      }
      score += modeAlternativeBonus(text);
      candidates.push({
        text: applyIntroducedNameCorrection(text),
        confidence,
        score
      });
    }

    if (!candidates.length) return { text: '', confidence: .78 };
    candidates.sort((a, b) => b.score - a.score);
    return candidates[0];
  }

  function capitalizeNamePart(value) {
    const text = String(value || '').toLocaleLowerCase('hr-HR');
    return text.split(/([\-'’])/).map(part => /^[\p{L}]/u.test(part)
      ? part.charAt(0).toLocaleUpperCase('hr-HR') + part.slice(1)
      : part).join('');
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
    if (!feature || feature.rms < .006) return;
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

  function beginUtterance(now = Date.now()) {
    // Chromeov onspeechstart i naš VAD mogu javiti isti početak nekoliko stotina ms
    // razmaka. Ne stvaramo novu rečenicu dvaput za isti govorni nalet.
    if (utteranceStartedAt && now - utteranceStartedAt < 700) return;
    sealProvisionalSegment();
    utteranceSerial += 1;
    utteranceStartedAt = now;
    interimChangedAt = now;
    if (shouldListen && !recognition && !restartTimer) {
      scheduleRecognitionStart(80, 'Čujem govor — pokrećem diktiranje…');
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
      persistCurrent(true);
      renderSpeakerLabels();
      renderTranscript();
      return existing;
    }

    const segment = addSegment(normalized, confidence, speakerId, 'speech');
    if (!segment) return null;
    segment.provisional = true;
    lastProvisionalSegment = { id: segment.id, serial: utteranceSerial, createdAt: now, text: segment.text };
    persistCurrent(true);
    renderTranscript();
    return segment;
  }

  function scheduleInterimCommit(delay = INTERIM_STABLE_COMMIT_MS) {
    cancelInterimCommit();
    if (!shouldListen || !interimText) return;
    interimCommitTimer = window.setTimeout(() => {
      interimCommitTimer = null;
      if (!shouldListen || !interimText) return;
      const now = Date.now();
      const stableFor = now - interimChangedAt;
      const voiceStillMoving = audioVadActive && now - lastAudioVoiceAt < 450;

      // Dok osoba još govori, pričekaj da parcijalni tekst bude dovoljno dugo stabilan.
      // Nakon lokalno prepoznate pauze spremi ga brže da korisnik ne mora čekati Chromeov
      // završni rezultat koji ponekad kasni nekoliko sekundi.
      if (voiceStillMoving && stableFor < INTERIM_MAX_WAIT_MS) {
        scheduleInterimCommit(420);
        return;
      }
      upsertProvisionalSegment(interimText, .58);
    }, Math.max(120, delay));
  }

  function commitFinalRecognition(text, confidence, speakerId) {
    cancelInterimCommit();
    const normalized = normalizeRecognizedText(text, true);
    if (!normalized) return null;
    const now = Date.now();
    const provisional = lastProvisionalSegment && current.segments.find(item => item.id === lastProvisionalSegment.id);
    const similarity = provisional ? recognitionTextSimilarity(provisional.text, normalized) : 0;
    const canReplace = provisional && now - lastProvisionalSegment.createdAt < 9000 &&
      (lastProvisionalSegment.serial === utteranceSerial || similarity >= .52);

    if (canReplace) {
      provisional.text = normalized;
      provisional.confidence = clamp(Number(confidence) || .75, 0, 1);
      provisional.speaker = speakerId;
      provisional.provisional = false;
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
    return addSegment(normalized, confidence, speakerId, 'speech');
  }

  function updateAudioVoiceActivity(feature, now = Date.now()) {
    if (!feature || !Number.isFinite(feature.rms)) return;

    // Procjena pozadinske buke uči samo dok nismo u govornom naletu.
    if (!audioVadActive && feature.rms < Math.max(.025, noiseFloorRms * 2.2)) {
      noiseFloorRms = clamp(noiseFloorRms * .985 + feature.rms * .015, .0025, .018);
    }

    const vad = activeModeProfile().vad || modeData.social.vad;
    const speechThreshold = clamp(noiseFloorRms * vad.noiseMultiplier + vad.bias, vad.min, vad.max);
    const voiceShape = feature.pitchConfidence >= .16 || feature.zcr < .19 || feature.highRatio < .58;
    const isVoiceFrame = feature.rms >= speechThreshold && voiceShape;

    if (isVoiceFrame) {
      if (!audioVadActive) {
        audioVadActive = true;
        audioVadSilenceStartedAt = 0;
        pendingVoiceFeature = null;
        lastAudioVoiceStartAt = now;
        beginUtterance(now);
        resetVoiceAccumulator();
      }
      lastAudioVoiceAt = now;
      audioVadSilenceStartedAt = 0;
      accumulateVoiceFeature(feature);
      return;
    }

    if (!audioVadActive) return;
    if (!audioVadSilenceStartedAt) audioVadSilenceStartedAt = now;

    // Kratke pauze unutar riječi/rečenice ostaju isti govorni nalet.
    if (now - audioVadSilenceStartedAt < (vad.hangover || 280)) return;

    const snapshot = snapshotVoiceFeature();
    if (snapshot?.quality >= .2) pendingVoiceFeature = snapshot;
    resetVoiceAccumulator();
    audioVadActive = false;
    audioVadSilenceStartedAt = 0;
    if (interimText) scheduleInterimCommit(420);
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

  function persistCurrent(saveToHistory = false) {
    current.mode = preferences.mode;
    saveJson(STORAGE.current, current);
    if (saveToHistory && current.segments.length) {
      const copy = structuredCloneSafe(current);
      sessions = [copy, ...sessions.filter(item => item.id !== copy.id)].slice(0, 20);
      saveJson(STORAGE.sessions, sessions);
      renderSessions();
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

      bindSessionSwipe(row, openButton);
      openButton.addEventListener('click', event => {
        if (row.dataset.suppressClick === 'true') {
          event.preventDefault();
          row.dataset.suppressClick = 'false';
          return;
        }
        if (row.classList.contains('swipe-open')) {
          event.preventDefault();
          closeSwipeRow(row);
          return;
        }
        openSession(session.id);
      });
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
      const row = document.querySelector(`.session-swipe-row[data-session-id="${CSS.escape(id)}"]`);
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
      processedRecognitionDisabled = false;
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

  function renderTranscript() {
    const hasContent = current.segments.length > 0 || Boolean(interimText);
    dom.emptyTranscript.hidden = hasContent;
    dom.transcriptStream.hidden = !current.segments.length;
    dom.transcriptStream.textContent = '';

    for (const segment of current.segments) {
      const article = document.createElement('article');
      article.className = 'segment';
      article.dataset.id = segment.id;
      article.dataset.speaker = String(segment.speaker);
      if (segment.type === 'note') article.classList.add('note');
      if (segment.provisional) article.classList.add('provisional');
      if (segment.confidence < segmentReviewThreshold(segment) && segment.type === 'speech') article.classList.add('low-confidence');
      if (containsUrgentWord(segment.text)) article.classList.add('urgent');

      const meta = document.createElement('div');
      meta.className = 'segment-meta';
      const dot = document.createElement('span');
      dot.className = 'speaker-dot';
      const speaker = document.createElement('span');
      speaker.textContent = segment.type === 'note' ? 'Bilješka' : speakerName(segment.speaker);
      meta.append(dot, speaker);
      if (preferences.timestamps) {
        const time = document.createElement('time');
        time.textContent = formatTime(segment.createdAt);
        meta.append(time);
      }

      const paragraph = document.createElement('p');
      renderHighlightedText(paragraph, segment.text);

      const actions = document.createElement('div');
      actions.className = 'segment-actions';
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.append(createSvg('i-edit'), document.createTextNode('Uredi'));
      edit.addEventListener('click', () => beginEditingSegment(segment.id, paragraph));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.append(createSvg('i-trash'), document.createTextNode('Ukloni'));
      remove.addEventListener('click', () => removeSegment(segment.id));
      actions.append(edit, remove);

      article.append(meta, paragraph);
      if (segment.provisional && segment.type === 'speech') {
        const note = document.createElement('span');
        note.className = 'confidence-note';
        note.textContent = 'Privremeni prijepis — Clarity još provjerava završetak rečenice.';
        article.append(note);
      } else if (segment.confidence < .62 && segment.type === 'speech') {
        const note = document.createElement('span');
        note.className = 'confidence-note';
        note.textContent = 'Moguće netočno prepoznata rečenica — klikni “Uredi”.';
        article.append(note);
      }
      article.append(actions);
      dom.transcriptStream.append(article);
    }

    dom.interimSegment.hidden = !interimText;
    dom.interimSegment.dataset.speaker = String(activeSpeaker);
    dom.interimSpeaker.textContent = speakerName(activeSpeaker);
    dom.interimText.textContent = interimText;
    updateActionButtons();
    updateLargeView();

    if (preferences.autoScroll && hasContent) {
      requestAnimationFrame(() => {
        dom.transcriptView.scrollTop = dom.transcriptView.scrollHeight;
      });
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

  function addSegment(text, confidence = .8, speaker = activeSpeaker, type = 'speech') {
    const normalized = normalizeRecognizedText(text, true);
    if (!normalized) return;

    const now = Date.now();
    const speakerId = clamp(Math.round(Number(speaker) || 1), 1, MAX_AUTO_SPEAKERS);
    const simplified = normalized.toLocaleLowerCase('hr-HR').replace(/[.!?…]+$/, '');
    const previousSimplified = lastFinalText.toLocaleLowerCase('hr-HR').replace(/[.!?…]+$/, '');
    const previousSpeech = current.segments.filter(item => item.type === 'speech').at(-1);

    // Zaštita od dvostrukog Chrome final-resulta vrijedi samo za ISTOG govornika.
    // U razgovoru dvije osobe smiju jedna za drugom reći npr. "Da." bez gubitka druge rečenice.
    if (type === 'speech' && simplified === previousSimplified &&
        previousSpeech?.speaker === speakerId && now - lastFinalAt < 2200) return null;

    const segment = {
      id: createId(type === 'note' ? 'note' : 'line'),
      text: normalized,
      createdAt: now,
      confidence: clamp(Number(confidence) || .75, 0, 1),
      speaker: speakerId,
      type
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
    processedRecognitionDisabled = false;
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

    const blocks = [...document.querySelectorAll('.context-panel .context-block')];
    (data.tips || []).slice(0, blocks.length).forEach((tip, index) => {
      const strong = blocks[index].querySelector('strong');
      const paragraph = blocks[index].querySelector('p');
      if (strong) strong.textContent = tip[0];
      if (paragraph) paragraph.textContent = tip[1];
    });

    if (!shouldListen && !isListening) {
      dom.dockSubstatus.textContent = `Hrvatski · hr-HR · ${data.status}`;
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
        detail.textContent = profile.detectedName ? `Govornik ${profile.id} · ime prepoznato automatski` : `Govornik ${profile.id} · glas prepoznat automatski`;
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
    stopElapsedTimer();
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
    dom.statusDot.classList.toggle('listening', status === 'listening');
    dom.statusDot.classList.toggle('error', status === 'error');
    dom.recordButton.classList.toggle('active', status === 'listening');
    dom.recordButton.setAttribute('aria-label', status === 'listening' ? 'Zaustavi slušanje' : 'Pokreni slušanje');
    dom.recordButton.innerHTML = `<svg><use href="#${status === 'listening' ? 'i-stop' : 'i-mic'}"/></svg>`;

    const statusText = {
      listening: 'Slušam',
      preparing: 'Pripremam mikrofon',
      paused: 'Pauzirano',
      error: 'Prekinuto'
    }[status] || 'Pauzirano';
    dom.dockStatus.textContent = statusText;
    dom.dockSubstatus.textContent = message || `Hrvatski · hr-HR · ${activeModeProfile().status}`;
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
    if (hasResult) recognitionLastResultAt = now;
  }

  function startRecognitionWatchdog() {
    if (recognitionWatchdogTimer) return;
    recognitionWatchdogTimer = window.setInterval(() => {
      if (!shouldListen) return;
      const now = Date.now();

      // 1) Ako objekt nije uspio ni prijeći u onstart, ne ostavljamo UI zauvijek u
      // "Pripremam mikrofon" stanju.
      if (recognition && !isListening && recognitionStartAttemptAt && now - recognitionStartAttemptAt > RECOGNITION_START_TIMEOUT_MS) {
        softRestartRecognition('Diktiranje se nije pokrenulo — pokušavam ponovno…', 500);
        return;
      }

      // 2) Ako je prethodna sesija završila bez onenda/restarta, ponovno je podigni.
      if (!recognition && !restartTimer) {
        scheduleRecognitionStart(120, 'Nastavljam slušanje…');
        return;
      }
      if (!recognition || !isListening) return;

      // 3) Najvažnije: NE rotiramo servis samo zato što je nastala tišina. Upravo je
      // to u 3.4.0 moglo presjeći početak nove rečenice. Oporavak radimo samo kada naš
      // audio VAD potvrdi da je osoba govorila, a Web Speech za taj nalet nije vratio
      // čak ni parcijalni rezultat.
      const voiceObservedAfterStart = lastAudioVoiceAt > recognitionStartedAt || lastSpeechActivityAt > recognitionStartedAt;
      const noResultSinceStart = recognitionLastResultAt <= recognitionStartedAt;
      const utteranceWithoutResult = utteranceStartedAt > recognitionLastResultAt || (voiceObservedAfterStart && noResultSinceStart);
      const vadVoiceEnded = !audioVadActive && lastAudioVoiceAt && now - lastAudioVoiceAt > 650;
      const chromeVoiceEnded = !speechIsActive && lastSpeechActivityAt && now - lastSpeechActivityAt > 650;
      const voiceEnded = vadVoiceEnded || chromeVoiceEnded;
      const waitedLongEnough = utteranceStartedAt && now - utteranceStartedAt > RECOGNITION_AUDIO_STALL_MS;

      if (utteranceWithoutResult && voiceEnded && waitedLongEnough) {
        softRestartRecognition('Čuo sam govor bez prijepisa — odmah ponovno povezujem diktiranje…', RECOGNITION_RECOVERY_DELAY_MS);
      } else if (audioVadActive && utteranceWithoutResult && now - utteranceStartedAt > RECOGNITION_AUDIO_STALL_MS) {
        // Ne prekidaj osobu usred rečenice. Samo pokaži da je zvuk primljen; oporavak
        // će se dogoditi na prvoj prirodnoj pauzi ako rezultat i dalje ne stigne.
        updateStatus('listening', 'Čujem govor · čekam prijepis…');
      }
    }, RECOGNITION_WATCHDOG_INTERVAL_MS);
  }

  function stopRecognitionWatchdog() {
    if (recognitionWatchdogTimer) clearInterval(recognitionWatchdogTimer);
    recognitionWatchdogTimer = null;
  }

  function scheduleRecognitionStart(delay = 180, message = 'Nastavljam slušanje…') {
    if (!shouldListen) return;
    clearTimeout(restartTimer);
    restartTimer = window.setTimeout(() => {
      restartTimer = null;
      if (shouldListen && !recognition) createAndStartRecognition();
    }, Math.max(80, delay));
    updateStatus('preparing', message);
  }

  function softRestartRecognition(message = 'Osvježavam slušanje…', delay = RECOGNITION_RECOVERY_DELAY_MS) {
    if (!shouldListen) return;
    clearTimeout(restartTimer);
    restartTimer = null;

    // Ako imamo parcijalni tekst, prvo ga sačuvaj kao privremeni segment. Stara verzija
    // ga je mogla izgubiti pozivom abort() baš u trenutku kada Chrome kasni s finalom.
    if (interimText) upsertProvisionalSegment(interimText, .56);
    cancelInterimCommit();

    recognitionGeneration += 1;
    const oldRecognition = recognition;
    recognition = null;
    isListening = false;
    recognitionStartAttemptAt = 0;
    try { oldRecognition?.abort(); } catch { /* već zaustavljeno */ }

    scheduleRecognitionStart(delay, message);
  }

  async function startListening() {
    if (isListening || shouldListen) return;
    hideStatusBanner();

    if (!SpeechRecognition) {
      updateStatus('error', 'Preglednik ne podržava diktiranje');
      showStatusBanner('Ovaj preglednik ne podržava prepoznavanje govora. Otvori Clarity u aktualnom Google Chromeu.');
      return;
    }

    shouldListen = true;
    recognitionLastEventAt = Date.now();
    recognitionLastResultAt = Date.now();
    recognitionLastFinalAt = 0;
    recognitionStartAttemptAt = 0;
    recognitionRapidEndCount = 0;
    cancelInterimCommit();
    updateStatus('preparing', 'Dopusti pristup mikrofonu');
    dom.engineNotice.hidden = true;
    await startAudioMeter();
    await requestWakeLock();
    startRecognitionWatchdog();
    createAndStartRecognition();
  }

  function createAndStartRecognition() {
    if (!shouldListen) return;
    clearTimeout(restartTimer);
    restartTimer = null;

    const generation = ++recognitionGeneration;
    const instance = new SpeechRecognition();
    recognition = instance;
    recognitionStartAttemptAt = Date.now();
    instance.lang = 'hr-HR';
    instance.continuous = true;
    instance.interimResults = true;
    instance.maxAlternatives = activeModeProfile().maxAlternatives || 5;
    applyContextualBias(instance);

    const isCurrent = () => shouldListen && generation === recognitionGeneration && recognition === instance;

    instance.onstart = () => {
      if (!isCurrent()) return;
      isListening = true;
      recognitionStartedAt = Date.now();
      recognitionStartAttemptAt = 0;
      recognitionLastResultAt = recognitionStartedAt;
      touchRecognitionActivity(false);
      updateStatus('listening');
      startElapsedTimer();
    };

    instance.onspeechstart = () => {
      if (!isCurrent()) return;
      speechIsActive = true;
      lastSpeechActivityAt = Date.now();
      beginUtterance(lastSpeechActivityAt);
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
      if (interimText) scheduleInterimCommit(380);
    };

    instance.onresult = event => {
      if (!isCurrent()) return;
      touchRecognitionActivity(true);
      let nextInterim = '';
      let sawFinal = false;

      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        if (result.isFinal) {
          sawFinal = true;
          recognitionLastFinalAt = Date.now();
          const selected = selectBestRecognitionAlternative(result);
          const text = selected.text;
          if (!text) continue;

          const feature = (audioVadActive ? snapshotVoiceFeature() : null) || pendingVoiceFeature;
          const detectedSpeaker = resolveSpeaker(feature, text);
          if (!audioVadActive) pendingVoiceFeature = null;
          commitFinalRecognition(text, selected.confidence, detectedSpeaker);
        } else {
          // I za parcijalni rezultat pregledaj dostupne alternative; time hrvatski izraz
          // može biti prikazan točnije i prije nego Chrome pošalje finalni rezultat.
          const selected = selectBestRecognitionAlternative(result);
          const raw = normalizeRecognizedText(selected.text || result[0]?.transcript || '', false);
          if (raw) nextInterim += `${applyIntroducedNameCorrection(raw)} `;
        }
      }

      const normalizedInterim = normalizeRecognizedText(nextInterim, false);
      if (normalizedInterim && normalizedInterim !== interimText) interimChangedAt = Date.now();
      if (normalizedInterim) {
        interimText = normalizedInterim;
        scheduleInterimCommit(INTERIM_STABLE_COMMIT_MS);
      } else if (sawFinal) {
        interimText = '';
        cancelInterimCommit();
      }
      renderTranscript();
    };

    instance.onerror = event => {
      if (generation !== recognitionGeneration) return;
      const code = event.error || 'unknown';
      touchRecognitionActivity(false);
      if (code === 'aborted' && !shouldListen) return;
      if (code === 'no-speech') {
        // Tišina nije kvar. Ne abortiramo servis; onend će ga po potrebi ponovno podići.
        dom.soundStateText.textContent = 'Čekam nastavak govora';
        return;
      }
      if (code === 'phrases-not-supported') {
        contextualBiasDisabled = true;
        if (shouldListen) softRestartRecognition('Nastavljam bez kontekstualnog rječnika…', 180);
        return;
      }

      const errors = {
        'not-allowed': 'Chrome nema dopuštenje za mikrofon. Otvori postavke stranice u Chromeu i dopusti mikrofon.',
        'service-not-allowed': 'Usluga diktiranja nije dopuštena u pregledniku.',
        'audio-capture': 'Mikrofon nije pronađen ili ga koristi druga aplikacija.',
        'network': 'Diktiranje je privremeno izgubilo mrežnu vezu. Clarity će pokušati ponovno.',
        'language-not-supported': 'Preglednik trenutačno ne podržava hrvatski diktat.'
      };
      const message = errors[code] || `Diktiranje je prijavilo problem: ${code}.`;
      showStatusBanner(message);

      const fatal = ['not-allowed', 'service-not-allowed', 'audio-capture', 'language-not-supported'].includes(code);
      if (fatal) {
        shouldListen = false;
        isListening = false;
        stopRecognitionWatchdog();
        stopElapsedTimer();
        updateStatus('error', message);
        stopAudioMeter();
        releaseWakeLock();
      } else if (code === 'network' && shouldListen) {
        softRestartRecognition('Ponovno povezujem diktiranje…', 900);
      }
    };

    instance.onend = () => {
      if (generation !== recognitionGeneration || recognition !== instance) return;
      recognition = null;
      isListening = false;
      recognitionStartAttemptAt = 0;
      touchRecognitionActivity(false);

      const now = Date.now();
      const sessionLength = recognitionStartedAt ? now - recognitionStartedAt : 0;
      const endedVeryQuickly = sessionLength > 0 && sessionLength < 1800;
      if (endedVeryQuickly && now - recognitionLastEndAt < 4000) recognitionRapidEndCount += 1;
      else if (endedVeryQuickly) recognitionRapidEndCount = 1;
      else recognitionRapidEndCount = 0;
      recognitionLastEndAt = now;

      if (shouldListen) {
        const delay = Math.min(1400, 140 + recognitionRapidEndCount * 180);
        scheduleRecognitionStart(delay, 'Nastavljam slušanje…');
      } else {
        updateStatus('paused');
      }
    };

    try {
      // Stabilnost ima prednost nad eksperimentalnim start(audioTrack) putem.
      // AudioContext i dalje obrađuje signal za VAD i profile govornika, ali Chromeov
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
    shouldListen = false;
    isListening = false;
    stopRecognitionWatchdog();
    clearTimeout(restartTimer);
    restartTimer = null;
    cancelInterimCommit();
    if (interimText) upsertProvisionalSegment(interimText, .56);
    sealProvisionalSegment();
    interimText = '';

    recognitionGeneration += 1;
    const oldRecognition = recognition;
    recognition = null;
    try { oldRecognition?.abort(); } catch { /* already stopped */ }

    stopElapsedTimer();
    stopAudioMeter();
    releaseWakeLock();
    updateStatus('paused');
    persistCurrent(true);
    renderTranscript();
  }

  function toggleListening() {
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
    const threshold = Math.max(90, preferences.soundThreshold);
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

  function stopAudioMeter() {
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

  function newSession() {
    if (shouldListen || isListening) stopListening();
    persistCurrent(true);
    current = createEmptySession(preferences.mode);
    interimText = '';
    activeSpeaker = 1;
    lastFinalText = '';
    lastFinalAt = 0;
    lastSpeakerDecisionAt = 0;
    resetModeSpeakerRoles();
    contextualBiasDisabled = false;
    processedRecognitionDisabled = false;
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
    activeSpeaker = current.segments.filter(item => item.type === 'speech').at(-1)?.speaker || 1;
    lastFinalText = current.segments.filter(item => item.type === 'speech').at(-1)?.text || '';
    lastFinalAt = 0;
    lastSpeakerDecisionAt = 0;
    resetModeSpeakerRoles();
    contextualBiasDisabled = false;
    processedRecognitionDisabled = false;
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
    current.segments.pop();
    persistCurrent(true);
    renderTranscript();
    showToast('Zadnja stavka je uklonjena.');
  }

  function clearCurrent() {
    if (!current.segments.length) return;
    if (!window.confirm('Obrisati cijeli aktivni prijepis?')) return;
    current.segments = [];
    current.speakers = [];
    activeSpeaker = 1;
    lastFinalText = '';
    lastFinalAt = 0;
    lastSpeakerDecisionAt = 0;
    resetModeSpeakerRoles();
    contextualBiasDisabled = false;
    processedRecognitionDisabled = false;
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

  function openPanel(panel) {
    closePanels();
    activePanel = panel;
    dom.panelScrim.hidden = false;
    panel.hidden = false;
    panel.querySelector('button, input, textarea')?.focus({ preventScroll: true });
  }

  function closePanels() {
    dom.panelScrim.hidden = true;
    [dom.settingsPanel, dom.summaryPanel, dom.mobileSessionsPanel].forEach(panel => { panel.hidden = true; });
    activePanel = null;
  }

  function openCenterModal(modal) {
    modal.hidden = false;
    modal.querySelector('button, input, textarea')?.focus({ preventScroll: true });
  }

  function closeCenterModals() {
    dom.quickMessageModal.hidden = true;
    dom.noteModal.hidden = true;
  }

  function openLegalModal(modal) {
    if (!modal) return;
    closePanels();
    closeCenterModals();
    dom.privacyPolicyModal.hidden = true;
    dom.impressumModal.hidden = true;
    modal.hidden = false;
    modal.querySelector('button')?.focus({ preventScroll: true });
  }

  function closeLegalModals() {
    dom.privacyPolicyModal.hidden = true;
    dom.impressumModal.hidden = true;
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
    updateLargeView();
    dom.largeView.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function hideLargeView() {
    dom.largeView.hidden = true;
    document.body.style.overflow = '';
  }

  function showMessageDisplay(message) {
    const text = String(message || '').trim();
    if (!text) return;
    closeCenterModals();
    dom.messageDisplayText.textContent = text;
    dom.messageDisplay.hidden = false;
    document.body.style.overflow = 'hidden';
  }

  function hideMessageDisplay() {
    dom.messageDisplay.hidden = true;
    document.body.style.overflow = '';
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
      const typing = ['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
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

      // Chrome može suspendirati Web Speech dok je kartica/prozor u pozadini.
      // Po povratku ne čekamo da korisnik otkrije da mikrofon više ne zapisuje.
      if (!recognition || !isListening) {
        clearTimeout(restartTimer);
        restartTimer = window.setTimeout(() => {
          restartTimer = null;
          if (shouldListen && (!recognition || !isListening)) createAndStartRecognition();
        }, 120);
      }
    });
    window.addEventListener('online', () => {
      hideStatusBanner();
      if (shouldListen) softRestartRecognition('Veza je vraćena — obnavljam diktiranje…', 180);
    });
    window.addEventListener('offline', () => showStatusBanner('Nema internetske veze. Diktiranje preglednika može prestati raditi dok se veza ne vrati.'));
    window.addEventListener('beforeunload', () => {
      persistCurrent(true);
      stopListening();
    });
  }

  function initialize() {
    bindEvents();
    applyPreferences();
    renderAll();
    dom.engineNotice.hidden = Boolean(loadJson(STORAGE.engineNoticeDismissed, false));
    savePreferences();
    persistCurrent();

    if (!SpeechRecognition) {
      dom.recordButton.disabled = true;
      dom.emptyStartButton.disabled = true;
      showStatusBanner('Za diktiranje otvori ovu aplikaciju u aktualnom Google Chromeu. Ostale funkcije i dalje rade.');
      updateStatus('error', 'Diktiranje nije podržano');
    }

  }

  initialize();
})();
