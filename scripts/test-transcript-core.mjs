import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const context = vm.createContext({ window: {} });
vm.runInContext(fs.readFileSync('build/modules/transcript-core.js', 'utf8'), context);
const { clean, primary, appendFinal, preview } = context.window.ClarityTranscriptCore;

assert.equal(clean('  šta   je   ovo?\n'), 'šta je ovo?');
assert.equal(clean('ovde sam, jel tako'), 'ovde sam, jel tako');
assert.equal(clean('gluhi ma, idemo'), 'gluhi ma, idemo');
assert.equal(clean('chat gpt ili Lyllo'), 'chat gpt ili Lyllo');
assert.equal(clean('iPhone  16'), 'iPhone 16');
assert.equal(clean(''), '');
assert.equal(primary([{ transcript: 'šta je ovo', confidence: 0.42 }, { transcript: 'što je ovo', confidence: 0.99 }]).text, 'šta je ovo');
assert.equal(primary([{ transcript: 'halo', confidence: 0 }]).confidence, 0);
assert.equal(primary([]).text, '');
assert.equal(appendFinal('Da', 'Da'), 'Da Da'); // Two utterances must not disappear.
assert.equal(appendFinal('Čekajte!', 'Šta?'), 'Čekajte! Šta?');
assert.equal(preview('Dobar dan,', 'dan, svima'), 'Dobar dan, dan, svima'); // No fuzzy rewriting.
assert.equal(preview('Dobar dan', 'Dobar dan svima'), 'Dobar dan svima');
assert.equal(preview('Dobar dan svima', 'dan svima, danas radimo'), 'Dobar dan svima dan svima, danas radimo');
assert.equal(preview('prva druga', 'prva druga treća'), 'prva druga treća');
assert.equal(preview('Danas ćemo', 'ćemo nastaviti'), 'Danas ćemo ćemo nastaviti'); // Never drop a lone repeated word.
console.log('Clarity transcript core: 16 checks OK');
