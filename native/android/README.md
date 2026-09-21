# Clarity Android native speech wrapper

Ovaj wrapper ne koristi Whisper, LLM niti Clarity STT server. Web UI komunicira s `android.speech.SpeechRecognizer` kroz `ClarityAndroidSpeech` bridge.

## Pokretanje
1. Otvori `native/android` u Android Studiju.
2. Dopusti Gradle sync.
3. Pokreni na fizičkom Samsung/Pixel/Xiaomi uređaju.
4. Na prvi Start dopusti mikrofon.

Web UI je ugrađen u `app/src/main/assets/clarity`. Nakon promjene glavnog `build/` direktorija ponovno kopiraj njegov sadržaj u taj direktorij prije izrade APK-a.

Android `SpeechRecognizer` namjerno se koristi u kratkim sistemskim sesijama. Clarityjev JS nakon `end` automatski otvara sljedeću sesiju dok je korisnikov Start aktivan.
