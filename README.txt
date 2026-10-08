CLARITY 6.1.0 — SIMPLE LIVE TRANSCRIPTION

Clarity transcribes speech as it arrives. It does not use a local LLM, Whisper,
post-processing grammar corrections, forced punctuation or heuristic reranking.
The words in the transcript come from the speech-recognition service selected
by the platform; only technical whitespace is normalized.

LIVE PATH
  User taps Start -> OS/browser speech recognition -> partial text ->
  confirmed text -> local saved conversation on Stop.

  - Android native: android.speech.SpeechRecognizer
  - Apple native: SFSpeechRecognizer
  - Windows native: Windows.Media.SpeechRecognition.SpeechRecognizer
  - Web: SpeechRecognition / webkitSpeechRecognition where supported
  - HR (hr-HR) and EN (en-US) are selectable.

Web Speech may rely on a cloud speech service provided by the browser and may
not behave consistently across Android browsers. It is not an offline STT API.

IMPORTANT 6.1 CHANGES
  - No parallel getUserMedia call or independent audio meter.
  - Browser speech starts directly from the Start click, before screen wake lock.
  - Android browser sessions use continuous=false and controlled restarts.
  - Only the first STT result is used, with no dictionary/mode rewrite.
  - Temporary text is live-only until final (or the user manually stops).
  - Confirmed text is preserved if the speech service reports an error.
  - Automatic speaker recognition and loud sound alerts are not active in this
    transcription-only mode; the UI does not pretend these features work.
  - Mode tabs label the conversation; they do not change captured audio.

RUN
  npm run dev             Web server (http://localhost:8768)
  npm test                Source checks, native bridge, transcript-core tests
  npm run sync:native     Copy build/ assets to Android / Apple / Windows shells
  npm run verify:native   Check native bridge/project assets
  npm run build           Source/build structural verification

OPTIONAL BROWSER MOCK (requires Python Playwright + Chromium)
  python3 scripts/mock-browser-smoke.py
This is a simulated Web Speech event test, NOT a physical Android microphone
or real speech recognition quality test.

Deployment uses build/ as the web root. All native assets are copied from it.
Test on physical Android Chrome and Edge with a real HTTPS deployment; a device
must have an available and permitted speech-recognition service for the chosen
language. More detail: docs/SIMPLE-LIVE-6.1.md.

LOCAL PREVIEW (Mac): npm run dev -> http://localhost:5173
PHONE PREVIEW (HTTPS + terminal QR):
  1. brew install cloudflared qrencode
  2. npm run preview:phone
  3. Scan QR on Android/iPhone; press Ctrl+C to stop.
  Documentation: docs/PHONE-PREVIEW.md
