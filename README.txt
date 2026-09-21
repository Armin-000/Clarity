CLARITY 6.0.0 — NATIVE SYSTEM SPEECH

Clarity je hrvatska live-transcription aplikacija koja sada koristi jedan ClaritySpeech API iznad sistemskog speech-recognition servisa uređaja.

Glavne odluke
-------------
- Nema Whispera, Qwena, LLM-a, Deepgrama niti Clarity STT servera.
- Android native koristi android.speech.SpeechRecognizer.
- iPhone/iPad/macOS koriste Apple Speech framework (SFSpeechRecognizer).
- Windows native adapter koristi Windows.Media.SpeechRecognition.SpeechRecognizer.
- Obična web verzija zadržava Web Speech API samo kao kompatibilni fallback.
- Jezik je hr-HR.
- Native Start/Kraj koristi sistemske recognition sesije, a Clarity ih spaja u jedan korisnički odlomak.
- Native način ne otvara paralelni browser getUserMedia audio-meter dok sistemski recognizer drži mikrofon.
- Povijest i postavke ostaju lokalno u Clarity aplikaciji.

Web pokretanje
-------------
npm install
npm run dev

Otvori: http://localhost:8768

Sinkronizacija UI-a u native wrappere
-------------------------------------
npm run sync:native

Provjera
--------
npm test
npm run verify:native

Native projekti
---------------
Android: native/android
Apple iOS + macOS: native/apple
Windows: native/windows/Clarity.Windows

Važno
-----
Clarity ne donosi vlastiti speech-to-text model. Točnost hrvatskog prijepisa ovisi o sistemskom speech-recognition servisu koji je instaliran/dostupan na konkretnom uređaju. Native bridge standardizira lifecycle, partial/final događaje, restart sesija i ponašanje UI-a, ali ne može učiniti Apple/Google/Microsoft recognition modele identičnima.
