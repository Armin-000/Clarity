# Clarity Apple native speech wrapper

Koristi Apple `Speech` framework (`SFSpeechRecognizer`) i `AVAudioEngine`. Nema Whispera, LLM-a ni Clarity STT servera.

## Xcode projekt
Projekt je opisan s `project.yml` za XcodeGen:

```bash
brew install xcodegen
cd native/apple
xcodegen generate
open ClarityNative.xcodeproj
```

Odaberi `ClarityIOS` za iPhone/iPad ili `ClarityMac` za macOS. Web UI je ugrađen u `Resources/clarity`.
