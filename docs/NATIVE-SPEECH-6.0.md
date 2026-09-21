# Clarity 6.0 — Native System Speech architecture

## Cilj

Jedan Clarity UI i jedan JavaScript ugovor, bez vlastitog STT modela ili centralnog speech servera.

```text
Clarity UI
   |
ClaritySpeechRecognition
   |
   +-- Android -> android.speech.SpeechRecognizer
   +-- iOS/macOS -> SFSpeechRecognizer
   +-- Windows -> Windows.Media.SpeechRecognition.SpeechRecognizer
   +-- Web -> Web Speech fallback
```

## JS ugovor

`build/clarity-speech-bridge.js` normalizira native događaje u Web-Speech-like API koji postojeći `app.js` već razumije:

- `start`
- `speechstart`
- `partial`
- `final`
- `speechend`
- `error`
- `end`

Svaki događaj ima `id` recognition sesije. Time zakašnjeli callback stare sesije ne može pisati u novu sesiju.

## Android

`native/android` koristi sistemski `SpeechRecognizer` i `RecognitionListener`.

- `onPartialResults` -> `partial`
- `onResults` -> `final`
- `onBeginningOfSpeech` -> `speechstart`
- `onEndOfSpeech` -> `speechend`
- `onError` -> normalizirani Clarity error

Ne forsira on-device paket i ne bira određenog vendor recognizera; koristi sistemski default. Time se daje prednost dostupnosti na Samsung/Pixel/Xiaomi uređajima. Android sam može odabrati lokalnu ili mrežnu implementaciju.

## Apple

`native/apple` koristi `SFSpeechRecognizer` + `SFSpeechAudioBufferRecognitionRequest` + `AVAudioEngine`.

`shouldReportPartialResults = true`, `requiresOnDeviceRecognition = false`. Clarity ne preuzima vlastiti model; Appleov sistem odlučuje kako izvršiti recognition za hr-HR.

## Windows

`native/windows` koristi `SpeechRecognizer` i `ContinuousRecognitionSession`.

- `HypothesisGenerated` -> `partial`
- `ResultGenerated` -> `final`
- `Completed` -> `end`

Za Windows produkciju Microsoft zahtijeva package identity (MSIX) za `Windows.Media.SpeechRecognition`.

## Session lifecycle

Korisnik vidi samo:

```text
START -> govori koliko želi -> KRAJ
```

Ispod toga platforma smije završavati kraće recognition sesije:

```text
session 1 -> final -> end
session 2 -> partial -> final -> end
session 3 -> ...
```

Dok je Clarityjev `shouldListen=true`, JS automatski otvara sljedeću sesiju i zadržava isti odlomak.

## Watchdog

Clarity razlikuje:

- Start zahtjev koji nikad nije postao aktivan
- aktivni recognizer bez događaja
- normalan `no-speech`
- mrežni/service error
- korisnički Stop

Native permission dialog dobiva duži start timeout (20 s) kako ga watchdog ne bi restartao dok korisnik odlučuje o mikrofonu.

## Audio ownership

U native načinu Clarity ne pokreće browser `getUserMedia()` audio meter paralelno sa sistemskim recognizerom. Time sistemski speech servis ostaje jedini vlasnik capture puta.

## Što ova verzija namjerno NE radi

- nema Whisper
- nema Qwen
- nema GPT/LLM korekciju
- nema Deepgram
- nema vlastiti STT backend
- ne šalje audio Clarity serveru radi transkripcije
- ne prevodi govor

## Minimalni test matrix prije produkcije

Android:
- Samsung Galaxy S/A serija
- Google Pixel
- Xiaomi/Redmi
- Start -> 10 min govora -> Kraj -> Start
- zaključavanje/otključavanje ekrana
- poziv/notifikacija koja privremeno uzme mikrofon

Apple:
- iPhone i iPad na aktualnom iOS-u
- Mac s ugrađenim i vanjskim mikrofonom
- odbijeno pa naknadno odobreno dopuštenje

Windows:
- MSIX packaged build
- hr-HR speech language dostupan
- ugrađeni i USB mikrofon

Web fallback:
- Chrome/Edge/Safari gdje Web Speech postoji
- prikaz jasne greške gdje ga browser ne izlaže
