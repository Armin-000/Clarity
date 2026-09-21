# Clarity Windows native speech wrapper

Web UI se vrti u WebView2, a `window.chrome.webview.postMessage` bridge koristi `Windows.Media.SpeechRecognition.SpeechRecognizer`. Partial tekst dolazi kroz `HypothesisGenerated`, final kroz `ContinuousRecognitionSession.ResultGenerated`.

## Važno
Microsoftov `Windows.Media.SpeechRecognition` za desktop aplikacije zahtijeva **MSIX package identity**. Zato projekt treba pakirati kao MSIX prije produkcijskog korištenja. `Package.appxmanifest.example` sadrži minimalni microphone capability primjer; Visual Studio može napraviti pravi packaging projekt/certifikat.

Nema Whispera, LLM-a niti Clarity STT servera.
