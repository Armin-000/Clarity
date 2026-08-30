CLARITY 3.5.2 — ACCESSIBILITY + LEGAL INFORMATION
=====================================================

RUNNING ON MAC
1. Delete or move the old Clarity folder.
2. Extract this ZIP into a completely new folder.
3. Right-click START-CLARITY-MAC.command.
4. Select Open.
5. Clarity will automatically open in Google Chrome.
6. Click “Start Listening” and allow microphone access.

STOPPING
- Run STOP-CLARITY-MAC.command.

WHAT'S NEW
- restored the original Clarity design with a dark sidebar
- Conversation, Work, Doctor, and Lecture as separate operating modes
- real-time Croatian transcription
- large full-screen display of the latest sentence
- quick messages you can show to the other person
- personal notes within a conversation
- highlighting important words such as “urgent”, “watch out”, and “fire”
- visual volume meter and sudden loud-sound warning
- local conversation history
- copy, edit, download, and delete transcripts
- larger text, high contrast, and reduced animations
- option to keep the screen awake during conversations
- personal dictionary for names and technical terms in supported browsers

IMPORTANT
- Do not use npm install.
- Do not use node_modules.
- Do not use esbuild.
- Do not use Python or a local Whisper model.
- Node.js is used only for a small local server and requires no package installation.
- For the best Croatian dictation experience, use the latest Google Chrome and an internet connection.

KEYBOARD SHORTCUTS
- Ctrl + Space: start or stop listening
- F: large display
- Esc: close the currently open view or panel


FIXES IN 3.0.1
- Removed the experimental SpeechRecognition phrases feature that caused phrases-not-supported errors.
- The personal dictionary now safely corrects text locally after dictation.
- The loud-sound warning is disabled by default and no longer triggers during normal speech.

FIXES IN 3.0.2
- Removed the Speaker 1 / Speaker 2 block from the bottom footer.
- Restored the original bottom dock: status on the left, summary, duration, and a large microphone button on the right.
- Removed the extra volume meter from the footer; visual volume remains in the right-side panel.
- Updated the help section in the right-side panel to match the new footer.

FIXES IN 3.0.3
- The bottom dock is now permanently fixed to the bottom of the window.
- Long conversations no longer increase the height of the entire application.
- Only the transcript and the right-side panel have their own scrolling.
- Fixed the same issue on smaller screens.

- The version remains on port 8768 to preserve existing local conversations and settings.
- The launcher can detect and stop an older Clarity version running on the same port.

FIXES IN 3.0.6
- Fixed the EADDRINUSE issue when an older Clarity instance was still holding port 8768.
- The launcher now cleanly stops the old Clarity server and force-stops it when necessary.
- If port 8768 is used by another application, Clarity automatically selects the first available port up to 8798.
- The selected port is saved so the STOP script always terminates the correct process.
- The Node server now closes Chrome keep-alive connections so the port no longer remains locked.

FIXES IN 3.0.6
- The bottom dock no longer stretches across the entire screen width.
- The dock is centered and lifted slightly from the bottom, similar to the macOS Dock.
- Added transparent glass styling, background blur, rounded corners, and a soft shadow.
- Buttons rise slightly on hover without excessive animation.
- The dock remains in its own fixed row, so long conversations cannot push it downward.
- It has also been adapted for small screens without covering the transcript.

NEW IN 3.1.0 — AUTOMATIC SPEAKERS AND CLEARER SPEECH
- Removed manual name selection for Speaker 1 and Speaker 2.
- Clarity now automatically learns and distinguishes up to 6 voices based on pitch, spectral shape, energy, and other audio characteristics.
- Sentences such as “Ja sam Marko”, “Zovem se Marko”, “Moje ime je Ana”, and “Bok svima, ovdje je Ana” automatically rename the corresponding speaker.
- Speaker profiles belong only to the current conversation; no audio recordings are stored.
- The microphone now uses a broader input profile for multiple participants, automatic gain control, and speech processing.
- Added a speech audio chain: high-pass filtering for low-frequency rumble, mild presence enhancement, and dynamic compression for quieter or more distant speech.
- When the browser supports SpeechRecognition.start(audioTrack), dictation can use the same processed signal that Clarity analyzes.
- Older browsers automatically fall back to standard SpeechRecognition.start().
- Transcription now supports Speaker 1–6 with different color labels.
- Important: one microphone and the Web Speech API cannot reliably separate two people speaking at exactly the same time; it works best when speakers alternate at least briefly.

NEW IN 3.2.0 — STABLE MULTI-SPEAKER CONVERSATIONS
- Fixed a critical bug from 3.1.0 where every new introduction renamed the same Speaker 1 profile.
- If an already named speaker is called Ekrem and the next person says “Ja sam Armin”, Clarity now creates Speaker 2 instead of renaming Ekrem to Armin.
- A new unique introduction can automatically create Speaker 3, 4, 5, or 6.
- If the same person introduces themselves again using the same name, Clarity returns them to the existing profile instead of creating a duplicate.
- Added repair logic for older 3.1.0 conversations: if all transcript rows ended up assigned to the same speaker ID but different introductions exist in the text, the session attempts to split them into separate speakers when loaded.
- “Ekran” in a clear self-introduction sentence can be locally corrected to “Ekrem” using a limited dictionary of common names and phonetically tolerant matching.
- SpeechRecognition now requests up to 5 alternatives and prefers alternatives that appear to contain a real name during introductions.
- Automatically recognized names are no longer saved to the global personal dictionary. This prevents a mistake such as “Ekran” from becoming permanent.
- Speaker analysis no longer depends on Chrome's onspeechstart/onspeechend events; a custom audio VAD continuously detects speech segments.
- Reduced speaker-switching hysteresis so people can alternate more naturally without remaining stuck to the previous voice for several seconds.
- Added a watchdog for long listening sessions. After extended silence, or if the microphone detects speech but dictation produces no result, only SpeechRecognition is automatically refreshed without stopping the entire session.
- SpeechRecognition is proactively refreshed during long sessions while the microphone is silent, reducing cases where Chrome remains active but stops transcribing.
- For stability, standard SpeechRecognition.start() is used again; the experimental start(audioTrack) is no longer used for dictation. The processed WebAudio signal is still used for VAD, the audio meter, and speaker differentiation.
- Speaker analysis prefers a mono channel because it provides a more stable acoustic profile when the same person moves around the microphone.
- Voice profiles now use additional features: pitch variation, low/mid/high frequency ratios, and spectral flatness, in addition to pitch, centroid, ZCR, and rolloff.
- Fixed duplicate-result protection: two different people can now say the same short word consecutively, such as “Da.”, without the second speaker being removed.
- After returning to Clarity from another browser tab or window, dictation is automatically checked and restarted if necessary.
- The limitation remains the same: one microphone plus browser SpeechRecognition cannot reliably separate two people saying different words at exactly the same time. True overlapping speech requires a dedicated local STT/diarization model.

NEW IN 3.3.0 — SMART CONVERSATION PROFILES
- Conversation, Work, Doctor, and Lecture modes are no longer only visual labels; each profile changes the actual behavior of dictation, VAD, speaker handling, and contextual vocabulary.
- WORK expects a one-on-one conversation and limits automatic speaker creation to two profiles so background noise or short interruptions do not create Speaker 3/4.
- WORK adds extra context for business-related terms such as project, deadline, contract, offer, invoice, price, delivery, and priority.
- DOCTOR expects a one-on-one conversation, requests up to 10 alternatives, and uses medical context for therapy, dosages, medication, findings, referrals, blood pressure, and related terms.
- DOCTOR uses a stricter confidence threshold. Sentences containing medication, dosages, or measurement units are marked for review at a lower level of uncertainty instead of hiding uncertainty.
- During a doctor conversation, Clarity attempts to identify which profile most likely belongs to the doctor based on instructional and treatment-related language; this is only an assistive inference and does not replace confirmation from the doctor.
- LECTURE uses a far-field audio profile: lower threshold for distant speech, stronger dynamic compression, increased presence enhancement, and longer VAD hangover so a quiet or distant lecturer is not cut off too early.
- voiceIsolation is intentionally not used in Lecture mode because it could suppress distant speech as background noise.
- When the browser supports the current SpeechRecognition.start(audioTrack), Lecture mode can provide the processed far-field signal to dictation; if the browser rejects it, Clarity automatically continues using the standard microphone input.
- LECTURE attempts to identify the dominant lecturer based on the amount and continuity of speech, while short student interruptions remain separate profiles.
- Current versions of Chrome support Web Speech contextual biasing. Clarity uses it for profile-specific and personal vocabulary when available and automatically falls back to standard dictation when unsupported.
- Changing the operating mode while the microphone is active automatically rebuilds the audio chain and SpeechRecognition configuration so the new profile takes effect immediately.

NEW IN 3.4.0 — CROATIAN PRECISION
- SpeechRecognition remains locked to hr-HR.
- Added a local layer that conservatively converts common Serbian/Bosnian variants into standard Croatian, for example ovde -> ovdje, tačno -> točno, and takođe -> također.
- Added safe spelling corrections for common mistakes such as neznam -> ne znam, nemogu -> ne mogu, and samnom -> sa mnom.
- Added canonical names Lyllo and ChatGPT with multiple common phonetic/ASR variants.
- The personal dictionary now attempts to phonetically match an approximately recognized single-word proper name with the exact spelling entered by the user.
- When selecting between multiple SpeechRecognition alternatives, Clarity gives a slight preference to Croatian variants and penalizes obvious non-Croatian lexical variants.
- Canonical names are included in contextual phrase biasing when the browser supports it.

IMPORTANT FOR SPECIAL NAMES
- Pronunciation alone does not determine spelling. The same sound can be written as Lilo, Lylo, or Lyllo.
- Therefore, Clarity uses the personal dictionary/canonical spelling for unusual names instead of randomly guessing the letters.

NEW IN 3.5.2 — STABLE LISTENING
- Removed periodic SpeechRecognition rotation triggered only by silence because it could cut off the beginning of a new sentence.
- The watchdog now reacts to an actual failure: VAD detected speech, but dictation did not return even a partial result.
- If Chrome delays the final result, stable partial text is temporarily saved after a natural pause and later replaced by the final result.
- During recovery, partial text is saved first and only then is SpeechRecognition restarted.
- Added a start timeout and adaptive backoff for quickly terminated Chrome sessions to prevent parallel or repeated restart loops.
- Lecture mode no longer uses the experimental SpeechRecognition.start(audioTrack); VAD/far-field analysis remains active, but dictation uses the more stable standard input.
- Croatian Precision adds safe corrections such as ništo -> ništa, nešta -> nešto, uvjek -> uvijek, sumljam -> sumnjam, htjeo -> htio, and da li -> je li.
- Fixed older regex characters in the logic used to recognize doctor-related speech.

NEW IN 3.5.2 — ACCESSIBILITY + LEGAL INFORMATION
- Swapped the sidebar footer order so “Postavke pristupačnosti” is now in the previous privacy-note position.
- Matched “Postavke pristupačnosti” and “Povijest ostaje na uređaju” to the same width, minimum height, padding, and alignment.
- Added permanent “Politika privatnosti” and “Impressum” links in the sidebar footer.
- Added the same legal access inside Settings so it remains easy to reach on mobile layouts.
- Added accessible modal views for Privacy Policy and Impressum with Escape/backdrop closing.
- Privacy wording now accurately distinguishes local transcript storage from browser-provided Web Speech / SpeechRecognition processing.
- Added assistive-tool and transcription-accuracy disclaimers, plus a reminder to complete business registration/contact details before commercial publication.

LICENSE
-------
Clarity is proprietary software and is NOT released under an open-source license.
You may run, test, evaluate, inspect, and review it for non-commercial purposes.
Selling, monetizing, redistributing, rebranding, publishing modified copies, or using substantial protected parts in another commercial product requires prior written permission from the copyright holder.
See LICENSE.md for the complete terms.


PUBLIC WEB / SEARCH DISCOVERY
-----------------------------
Production URL: https://clarity.codarox.com/

The public build includes search-discovery files:
- /robots.txt
- /sitemap.xml
- /llms.txt

The HTML includes canonical, index/follow, Open Graph, Twitter, and JSON-LD metadata for Clarity as a Croatian accessibility web application. See docs/SEO.md for Search Console and Cloudflare notes.
