package com.codarox.clarity

import android.Manifest
import android.app.Activity
import android.os.Bundle
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.webkit.WebViewAssetLoader

class MainActivity : Activity() {
    private lateinit var webView: WebView
    private lateinit var speechBridge: ClaritySpeechBridge
    private val microphoneRequestCode = 6101

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        webView = WebView(this)
        setContentView(webView)

        val assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        webView.settings.javaScriptEnabled = true
        webView.settings.domStorageEnabled = true
        webView.settings.mediaPlaybackRequiresUserGesture = false
        webView.webChromeClient = WebChromeClient()
        webView.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(view: WebView?, request: android.webkit.WebResourceRequest?) =
                request?.url?.let(assetLoader::shouldInterceptRequest)
        }

        speechBridge = ClaritySpeechBridge(this, webView) { requestMicrophone() }
        webView.addJavascriptInterface(speechBridge, "ClarityAndroidSpeech")
        webView.loadUrl("https://appassets.androidplatform.net/clarity/index.html")
    }

    private fun requestMicrophone() {
        requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO), microphoneRequestCode)
    }

    override fun onRequestPermissionsResult(requestCode: Int, permissions: Array<out String>, grantResults: IntArray) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode == microphoneRequestCode) {
            speechBridge.onPermissionResult(grantResults.firstOrNull() == android.content.pm.PackageManager.PERMISSION_GRANTED)
        }
    }

    override fun onDestroy() {
        speechBridge.destroy()
        webView.removeJavascriptInterface("ClarityAndroidSpeech")
        webView.destroy()
        super.onDestroy()
    }
}
