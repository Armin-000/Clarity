(() => {
  'use strict';

  const BrowserSpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  const bridgeKind = (() => {
    if (window.ClarityAndroidSpeech && typeof window.ClarityAndroidSpeech.start === 'function') return 'android';
    if (window.webkit?.messageHandlers?.claritySpeech) return 'apple';
    if (window.chrome?.webview?.postMessage) return 'windows';
    return null;
  })();

  const listeners = new Map();
  let nextId = 1;

  function dispatchToNative(message) {
    const payload = { ...message };
    if (bridgeKind === 'android') {
      window.ClarityAndroidSpeech[payload.action](JSON.stringify(payload.config || {}), String(payload.id));
      return;
    }
    if (bridgeKind === 'apple') {
      window.webkit.messageHandlers.claritySpeech.postMessage(payload);
      return;
    }
    if (bridgeKind === 'windows') {
      window.chrome.webview.postMessage(payload);
    }
  }

  function makeResult(transcript, confidence, isFinal) {
    const alternative = {
      transcript: String(transcript || ''),
      confidence: Number.isFinite(Number(confidence)) ? Number(confidence) : 0
    };
    const result = [alternative];
    result.isFinal = Boolean(isFinal);
    return result;
  }

  class NativeSpeechRecognition {
    constructor() {
      this.lang = 'hr-HR';
      this.continuous = false;
      this.interimResults = true;
      this.maxAlternatives = 3;
      this.grammars = null;
      this._id = String(nextId++);
      this._active = false;
      listeners.set(this._id, this);
    }

    static async available({ langs } = {}) {
      const language = Array.isArray(langs) && langs[0] ? langs[0] : 'hr-HR';
      return bridgeKind ? 'available' : (BrowserSpeechRecognition?.available ? BrowserSpeechRecognition.available({ langs: [language] }) : 'unavailable');
    }

    start() {
      if (this._active) return;
      this._active = true;
      dispatchToNative({
        action: 'start',
        id: this._id,
        config: {
          language: this.lang || 'hr-HR',
          interimResults: this.interimResults !== false,
          maxAlternatives: Math.max(1, Number(this.maxAlternatives) || 3)
        }
      });
    }

    stop() {
      if (!this._active) return;
      dispatchToNative({ action: 'stop', id: this._id, config: {} });
    }

    abort() {
      if (!this._active) return;
      dispatchToNative({ action: 'abort', id: this._id, config: {} });
    }

    _emit(payload) {
      const type = payload?.type;
      if (!type) return;
      if (type === 'start') {
        this.onstart?.({ type: 'start' });
        return;
      }
      if (type === 'speechstart') {
        this.onspeechstart?.({ type: 'speechstart' });
        return;
      }
      if (type === 'speechend') {
        this.onspeechend?.({ type: 'speechend' });
        return;
      }
      if (type === 'partial' || type === 'final') {
        const result = makeResult(payload.transcript, payload.confidence, type === 'final');
        this.onresult?.({ resultIndex: 0, results: [result] });
        return;
      }
      if (type === 'error') {
        this.onerror?.({ error: payload.error || 'unknown', message: payload.message || '' });
        return;
      }
      if (type === 'end') {
        this._active = false;
        this.onend?.({ type: 'end' });
      }
    }
  }

  window.ClarityNativeSpeechDispatch = payload => {
    try {
      const data = typeof payload === 'string' ? JSON.parse(payload) : payload;
      const instance = listeners.get(String(data?.id || ''));
      instance?._emit(data);
    } catch (error) {
      console.error('[ClaritySpeech] Neispravan native događaj:', error);
    }
  };

  if (bridgeKind === 'windows' && window.chrome?.webview?.addEventListener) {
    window.chrome.webview.addEventListener('message', event => window.ClarityNativeSpeechDispatch(event.data));
  }

  window.ClaritySpeechBridge = {
    kind: bridgeKind || (BrowserSpeechRecognition ? 'web' : 'none'),
    isNative: Boolean(bridgeKind),
    isAvailable: Boolean(bridgeKind || BrowserSpeechRecognition)
  };
  window.__clarityNativeSpeech = Boolean(bridgeKind);
  window.ClaritySpeechRecognition = bridgeKind ? NativeSpeechRecognition : BrowserSpeechRecognition;
})();
