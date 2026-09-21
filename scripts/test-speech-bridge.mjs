import fs from 'node:fs';
import vm from 'node:vm';

const calls = [];
const window = {
  ClarityAndroidSpeech: {
    start(config, id) { calls.push(['start', JSON.parse(config), id]); },
    stop(config, id) { calls.push(['stop', JSON.parse(config), id]); },
    abort(config, id) { calls.push(['abort', JSON.parse(config), id]); }
  }
};
const context = vm.createContext({ window, console });
vm.runInContext(fs.readFileSync('build/clarity-speech-bridge.js', 'utf8'), context);

if (!window.ClaritySpeechBridge?.isNative || window.ClaritySpeechBridge.kind !== 'android') throw new Error('Android native bridge nije detektiran.');
const Recognition = window.ClaritySpeechRecognition;
const r = new Recognition();
r.lang = 'hr-HR';
r.interimResults = true;
r.maxAlternatives = 4;
const events = [];
r.onstart = () => events.push('start');
r.onspeechstart = () => events.push('speechstart');
r.onresult = event => events.push(`${event.results[0].isFinal ? 'final' : 'partial'}:${event.results[0][0].transcript}`);
r.onspeechend = () => events.push('speechend');
r.onend = () => events.push('end');
r.start();
const id = calls[0]?.[2];
if (!id || calls[0][0] !== 'start' || calls[0][1].language !== 'hr-HR' || calls[0][1].maxAlternatives !== 4) throw new Error('start() nije pravilno proslijeđen native hostu.');
for (const payload of [
  { id, type: 'start' },
  { id, type: 'speechstart' },
  { id, type: 'partial', transcript: 'Dobar dan', confidence: 0.8 },
  { id, type: 'final', transcript: 'Dobar dan svima', confidence: 0.9 },
  { id, type: 'speechend' },
  { id, type: 'end' }
]) window.ClarityNativeSpeechDispatch(payload);

const expected = ['start','speechstart','partial:Dobar dan','final:Dobar dan svima','speechend','end'];
if (JSON.stringify(events) !== JSON.stringify(expected)) throw new Error(`Native događaji nisu pravilno normalizirani: ${JSON.stringify(events)}`);
console.log('ClaritySpeech bridge event test OK');
