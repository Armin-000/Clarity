import fs from 'node:fs';
import path from 'node:path';

const required = [
  'build/clarity-speech-bridge.js',
  'native/android/app/src/main/java/com/codarox/clarity/ClaritySpeechBridge.kt',
  'native/android/app/src/main/java/com/codarox/clarity/MainActivity.kt',
  'native/apple/iOS/ClarityIOSSpeechBridge.swift',
  'native/apple/macOS/ClarityMacSpeechBridge.swift',
  'native/windows/Clarity.Windows/MainWindow.xaml.cs'
];
for (const file of required) {
  if (!fs.existsSync(path.resolve(file)) || fs.statSync(path.resolve(file)).size === 0) throw new Error(`Nedostaje ${file}`);
}
const bridge = fs.readFileSync('build/clarity-speech-bridge.js','utf8');
const app = fs.readFileSync('build/app.js','utf8');
const html = fs.readFileSync('build/index.html','utf8');
if (!bridge.includes('ClarityAndroidSpeech') || !bridge.includes('claritySpeech') || !bridge.includes('chrome.webview')) throw new Error('Cross-platform bridge nije potpun.');
if (!app.includes('window.ClaritySpeechRecognition')) throw new Error('app.js ne koristi ClaritySpeech abstraction.');
if (!app.includes('window.__clarityNativeSpeech ? false : !IS_IOS_WEBKIT')) throw new Error('Native recognition mora koristiti kratke OS sesije.');
if (!html.includes('clarity-speech-bridge.js')) throw new Error('Bridge se ne učitava prije app.js.');
if (/type="module" src="\.\/app\.js/.test(html)) throw new Error('Native shell koristi classic bundled app.js radi pouzdanog lokalnog učitavanja.');
console.log('Clarity Native System Speech 6.0.0: native bridge verification OK');
