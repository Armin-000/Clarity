# Clarity 6.1 — Simple Live Transcription

## Scope

The interface, local conversations (IndexedDB + localStorage fallback), HR/EN
selection and Android/Apple/Windows native bridges are retained. The active
transcription path is deliberately smaller:

```text
Start (user gesture)
  -> one ClaritySpeechRecognition / platform speech service
  -> partial caption (temporary)
  -> final caption (confirmed, not rewritten)
  -> save locally when the user presses Kraj/Stop
```

## Implementation

- `build/clarity-speech-bridge.js`: adapter for platform-specific recognition
  events (`partial`, `final`, `error`, `end`). No duplicate microphone.
- `build/modules/transcript-core.js`: small pure operations: whitespace-only
  `clean()`, the recognizer's `primary()` result, `appendFinal()` and `preview()`.
- `build/app.js`: speech-session lifecycle, UI and local conversation storage.
  Web recognition starts synchronously from the user's Start action.
- `build/modules/storage.mjs` and the bundled durable storage in `app.js`:
  existing local-storage compatibility. Existing saved conversations remain.

The old AI/speaker-analysis compatibility code is not part of the active
transcription path. It is not a background service or fallback. The additional
audio analyzer and its `getUserMedia()` call were removed. Disabled settings
and older stored preferences remain for compatibility with existing clients;
follow-up cleanup can remove these completely after validating deployments.

### Recognition behavior

1. Set language `hr-HR` or `en-US` and `interimResults=true`.
2. Use only the first transcript supplied by the recognizer. No alternative
   ranking, personal word replacement, automatic dialect correction, forced
   capitalization, forced period, AI rewrite or speaker attribution.
3. Track final result indices per recognition session; ignore repeated delivery
   of the *same* result index without deleting separate repeated words.
4. Keep temporary results visible. Do not silently elevate the last temporary
   transcript to a confirmed result when the engine unexpectedly ends. Manual
   Stop can preserve the final temporary fragment as unverified last text.
5. Auto-reconnect following a normal session end, with progressively longer
   delays when starts repeatedly fail. Silence by itself is not treated as a
   stuck recognizer. Do not restart repeatedly on permission-denied errors.
6. Browser session `continuous`: false on Android/iOS, true on desktop web,
   false in native bridges. Browser support may ignore this setting.
7. The microphone-active indicator starts only on the recognizer's `onstart`;
   while connecting the user sees a preparing state and can still tap Stop.

### Known trade-offs

- This is not one identical STT model across Android/iPhone/desktop. The native
  and browser engines still differ. Audio remains at the platform speech
  service's discretion, and browser recognition may need an Internet connection.
- The app never promises that the recognition engine outputs a verbatim perfect
  transcript. It only stops rewriting results **after** recognition.
- Live signal-level meter, loud sound warnings, and acoustic speaker separation
  are disabled to avoid capturing the microphone twice on the web. If these are
  reintroduced, they should be an explicit separate opt-in feature with a
  carefully designed capture architecture.
- Do not rely on automated medical transcription for medication doses or other
  safety-critical facts without confirmation from the speaker.

## Test checklist

Run:

```sh
npm test
npm run build
npm run sync:native
npm run verify:native
```

Optional mocked-browser events:

```sh
python3 scripts/mock-browser-smoke.py
```

Real-device validation required before deployment:

- Android Chrome / Edge on **HTTPS**: grant microphone permission, press Start,
  verify interim and final text, normal pauses and repeating Kraj → Start.
- Android with microphone denied: readable message; no infinite restart.
- Android without Croatian speech support / offline: meaningful error, not a
  fake "Listening" state or indefinite spinner.
- iPhone Safari: first Start; repeated Stop → Start; HR/EN switch.
- Desktop browser: streaming, long speech, Stop saving a final fragment.
- Check existing conversations and manual editing remain intact.

The automated browser test uses a **fake** `SpeechRecognition` API with Android,
iPhone and desktop user-agent strings. It cannot prove real-device audio or
Google speech-service behavior.
