// One intentionally small, platform-agnostic transcript core.
// The speech engine is the authority for words and punctuation.
(() => {
  'use strict';

  // Clean transport whitespace only; do not autocorrect, punctuate or rewrite speech.
  function clean(value) {
    return String(value ?? '').normalize('NFC').replace(/[\r\n\t]+/gu, ' ').replace(/\s+/gu, ' ').trim();
  }

  // Never rerank alternatives using guesses about grammar, dialect or context.
  function primary(result) {
    const choice = result?.[0];
    return {
      text: clean(choice?.transcript),
      confidence: Number.isFinite(choice?.confidence) && choice.confidence >= 0
        ? Math.max(0, Math.min(1, choice.confidence)) : 0
    };
  }

  // Distinct final events represent distinct speech, even if they contain the same words.
  function appendFinal(base, next) {
    return [clean(base), clean(next)].filter(Boolean).join(' ');
  }

  // A live interim can contain the end of the preceding final. Elide only exact
  // multi-word overlaps in the preview; never guess that similar words are equal.
  function preview(finalText, interimText) {
    const confirmed = clean(finalText);
    const partial = clean(interimText);
    if (!confirmed) return partial;
    if (!partial || confirmed === partial) return confirmed;
    if (partial.startsWith(`${confirmed} `)) return partial;
    if (confirmed.endsWith(` ${partial}`)) return confirmed;
    const a = confirmed.split(' ');
    const b = partial.split(' ');
    for (let count = Math.min(a.length, b.length, 12); count >= 2; count--) {
      if (a.slice(-count).join(' ') === b.slice(0, count).join(' ')) {
        return [confirmed, ...b.slice(count)].join(' ');
      }
    }
    return `${confirmed} ${partial}`;
  }

  window.ClarityTranscriptCore = Object.freeze({ clean, primary, appendFinal, preview });
})();
