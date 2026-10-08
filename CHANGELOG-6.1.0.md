# Clarity 6.1.0 — Simple Live Transcription

- Use system/browser speech-to-text as the only microphone owner.
- Remove the separate `getUserMedia()` audio meter and processing chain.
- Display the first STT alternative without word substitutions, language
  standardization, AI polishing, forced capitalization or punctuation.
- Move transport-only transcript handling into `modules/transcript-core.js`.
- Start recognition directly on the user gesture; request wake lock separately.
- Use short recognition sessions on Android web and native platforms.
- Add backoff and stop conditions to retries; preserve confirmed text on errors.
- Avoid counting a duplicate final result for the same recognition result index.
- Prevent UI claims of acoustic speaker identification or medical refinement.
- Keep local conversation persistence and existing native bridges intact.
- Add text-focused tests and a mocked browser smoke test.

Note: Reconnection and real microphone behavior depend on the device speech
provider. Test physically on Android before publishing.
