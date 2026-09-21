package com.codarox.clarity

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.webkit.JavascriptInterface
import android.webkit.WebView
import org.json.JSONObject

class ClaritySpeechBridge(
    private val activity: Activity,
    private val webView: WebView,
    private val requestPermission: (String) -> Unit
) {
    private var recognizer: SpeechRecognizer? = null
    private var activeId: String? = null
    private var pendingStart: Pair<String, JSONObject>? = null
    private var ended = true

    @JavascriptInterface
    fun start(configJson: String, id: String) {
        activity.runOnUiThread {
            val config = runCatching { JSONObject(configJson) }.getOrDefault(JSONObject())
            if (activity.checkSelfPermission(Manifest.permission.RECORD_AUDIO) != PackageManager.PERMISSION_GRANTED) {
                pendingStart = id to config
                requestPermission(id)
                return@runOnUiThread
            }
            startInternal(id, config)
        }
    }

    @JavascriptInterface
    fun stop(configJson: String, id: String) {
        activity.runOnUiThread {
            if (activeId == id) runCatching { recognizer?.stopListening() }
        }
    }

    @JavascriptInterface
    fun abort(configJson: String, id: String) {
        activity.runOnUiThread {
            if (activeId == id) {
                runCatching { recognizer?.cancel() }
                finish(id)
            }
        }
    }

    fun onPermissionResult(granted: Boolean) {
        val pending = pendingStart
        pendingStart = null
        if (pending == null) return
        if (!granted) {
            emit(pending.first, "error", error = "not-allowed", message = "Dopuštenje za mikrofon nije odobreno.")
            emit(pending.first, "end")
            return
        }
        startInternal(pending.first, pending.second)
    }

    fun destroy() {
        activity.runOnUiThread {
            runCatching { recognizer?.cancel() }
            runCatching { recognizer?.destroy() }
            recognizer = null
            activeId = null
            ended = true
        }
    }

    private fun startInternal(id: String, config: JSONObject) {
        if (!SpeechRecognizer.isRecognitionAvailable(activity)) {
            emit(id, "error", error = "service-not-allowed", message = "Na uređaju nije dostupan sistemski speech recognizer.")
            emit(id, "end")
            return
        }

        runCatching { recognizer?.cancel() }
        runCatching { recognizer?.destroy() }
        recognizer = SpeechRecognizer.createSpeechRecognizer(activity)
        activeId = id
        ended = false

        val language = config.optString("language", "hr-HR").ifBlank { "hr-HR" }
        val maxAlternatives = config.optInt("maxAlternatives", 3).coerceIn(1, 5)
        val interim = config.optBoolean("interimResults", true)

        recognizer?.setRecognitionListener(object : RecognitionListener {
            override fun onReadyForSpeech(params: Bundle?) = emitIfCurrent(id, "start")
            override fun onBeginningOfSpeech() = emitIfCurrent(id, "speechstart")
            override fun onRmsChanged(rmsdB: Float) = Unit
            override fun onBufferReceived(buffer: ByteArray?) = Unit
            override fun onEndOfSpeech() = emitIfCurrent(id, "speechend")

            override fun onError(error: Int) {
                if (activeId != id) return
                val mapped = when (error) {
                    SpeechRecognizer.ERROR_AUDIO -> "audio-capture"
                    SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "not-allowed"
                    SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT -> "network"
                    SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "no-speech"
                    SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "aborted"
                    SpeechRecognizer.ERROR_SERVER, SpeechRecognizer.ERROR_SERVER_DISCONNECTED -> "network"
                    else -> "unknown"
                }
                emit(id, "error", error = mapped, message = "Android SpeechRecognizer greška: $error")
                finish(id)
            }

            override fun onResults(results: Bundle?) {
                if (activeId != id) return
                val text = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
                val confidence = results?.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES)?.firstOrNull()?.toDouble() ?: 0.0
                if (text.isNotBlank()) emit(id, "final", transcript = text, confidence = confidence)
                finish(id)
            }

            override fun onPartialResults(partialResults: Bundle?) {
                if (!interim || activeId != id) return
                val text = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull().orEmpty()
                val confidence = partialResults?.getFloatArray(SpeechRecognizer.CONFIDENCE_SCORES)?.firstOrNull()?.toDouble() ?: 0.0
                if (text.isNotBlank()) emit(id, "partial", transcript = text, confidence = confidence)
            }

            override fun onEvent(eventType: Int, params: Bundle?) = Unit
        })

        val intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE, language)
            putExtra(RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, language)
            putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, interim)
            putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, maxAlternatives)
            putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, activity.packageName)
        }

        runCatching { recognizer?.startListening(intent) }.onFailure {
            emit(id, "error", error = "service-not-allowed", message = it.message ?: "Speech recognizer se nije mogao pokrenuti.")
            finish(id)
        }
    }

    private fun finish(id: String) {
        if (activeId != id || ended) return
        ended = true
        emit(id, "end")
        runCatching { recognizer?.destroy() }
        recognizer = null
        activeId = null
    }

    private fun emitIfCurrent(id: String, type: String) {
        if (activeId == id && !ended) emit(id, type)
    }

    private fun emit(
        id: String,
        type: String,
        transcript: String? = null,
        confidence: Double? = null,
        error: String? = null,
        message: String? = null
    ) {
        val payload = JSONObject().put("id", id).put("type", type)
        transcript?.let { payload.put("transcript", it) }
        confidence?.let { payload.put("confidence", it) }
        error?.let { payload.put("error", it) }
        message?.let { payload.put("message", it) }
        val js = "window.ClarityNativeSpeechDispatch(${JSONObject.quote(payload.toString())})"
        webView.post { webView.evaluateJavascript(js, null) }
    }
}
