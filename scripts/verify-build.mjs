import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve('build');
const required = ['index.html','app.js','clarity-speech-bridge.js','modules/transcript-core.js','app.css','manifest.webmanifest','favicon.svg','sw.js'];
for (const name of required) {
  const file = path.join(root, name);
  if (!fs.existsSync(file) || fs.statSync(file).size === 0) throw new Error(`Nedostaje build/${name}`);
}
const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
const js = fs.readFileSync(path.join(root,'app.js'),'utf8');
for (const id of ['recordButton','clearButton','sessionList','settingsPanel','transcriptStream']) {
  if (!html.includes(`id="${id}"`)) throw new Error(`Nedostaje DOM element #${id}`);
}
if (/Prepoznao sam govornika|Imena se prepoznaju automatski|ime se dodjeljuje automatski/.test(html + js)) {
  throw new Error('Automatsko imenovanje govornika nije potpuno uklonjeno iz produkcijskog toka.');
}
if (!js.includes('window.ClaritySpeechRecognition || window.SpeechRecognition || window.webkitSpeechRecognition')) throw new Error('ClaritySpeech/native + Web Speech fallback adapter nije pronađen.');
if (!js.includes("deleteButton.addEventListener('click'")) throw new Error('Brisanje razgovora nije povezano.');
if (!js.includes("remove.addEventListener('click'")) throw new Error('Brisanje rečenice nije povezano.');
if (!html.includes('modules/transcript-core.js')) throw new Error('Transcription core nije učitan prije app.js.');
if (!js.includes('return Transcript.clean(value)')) throw new Error('STT tekst mora ostati bez korekcija.');
if (!js.includes('return Transcript.primary(result)')) throw new Error('Mora se koristiti prva STT alternativa.');
if (!js.includes('instance.maxAlternatives = 1')) throw new Error('Ne koristi više STT alternativa.');
if (!js.includes("!/Android/i.test(navigator.userAgent)")) throw new Error('Android ne smije forsirati continuous API.');
const listening = js.slice(js.indexOf('  function startListening()'), js.indexOf('  function createAndStartRecognition()'));
if (/await |startAudioMeter\(/.test(listening)) throw new Error('Start ne smije čekati drugi mikrofon ili wake lock.');
if (!js.includes('recognitionFinalResultIndexes.has(index)')) throw new Error('Ponovljene STT final evente treba preskočiti po session/indexu.');
if (!js.includes('finishManualStop') || !js.includes('FINALIZE_FALLBACK_MS')) throw new Error('Mobilni Kraj→Start lifecycle fallback nije pronađen.');
if (!js.includes('navigator.serviceWorker.getRegistrations()')) throw new Error('Legacy service-worker cleanup nije pronađen.');
if (!js.includes('beginManualParagraph()') || !js.includes('finalizeManualParagraph(true)')) throw new Error('Start/Kraj granica odlomka nije pronađena.');
if (!html.includes('<span>Start</span>')) throw new Error('Start/Kraj gumb nema vidljivu oznaku Start.');
if (!html.includes('clarity-speech-bridge.js')) throw new Error('ClaritySpeech bridge nije učitan.');
console.log('Clarity 6.1.0 Simple Live: build verification OK');
