import fs from 'node:fs';
import path from 'node:path';
const root = path.resolve('build');
const required = ['index.html','app.js','app.css','manifest.webmanifest','favicon.svg','sw.js'];
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
if (!js.includes('window.SpeechRecognition || window.webkitSpeechRecognition')) throw new Error('Web Speech API adapter nije pronađen.');
if (!js.includes("deleteButton.addEventListener('click'")) throw new Error('Brisanje razgovora nije povezano.');
if (!js.includes("remove.addEventListener('click'")) throw new Error('Brisanje rečenice nije povezano.');
if (!js.includes('CORE_CROATIAN_PHRASES') || !js.includes("'gluhima'")) throw new Error('Hrvatski contextual vocabulary nije pronađen.');
if (!js.includes('applyContextualBias(instance)')) throw new Error('Contextual phrase bias nije povezan na recognizer.');
if (!js.includes('instance.continuous = !IS_IOS_WEBKIT')) throw new Error('Recognition nema stabilni desktop/iOS continuous profil.');
if (!js.includes('finishManualStop') || !js.includes('FINALIZE_FALLBACK_MS')) throw new Error('Mobilni Kraj→Start lifecycle fallback nije pronađen.');
if (!js.includes('navigator.serviceWorker.getRegistrations()')) throw new Error('Legacy service-worker cleanup nije pronađen.');
if (!js.includes('beginManualParagraph()') || !js.includes('finalizeManualParagraph(true)')) throw new Error('Start/Kraj granica odlomka nije pronađena.');
if (!html.includes('<span>Start</span>')) throw new Error('Start/Kraj gumb nema vidljivu oznaku Start.');
console.log('Clarity Web 5.1.1: build verification OK');
