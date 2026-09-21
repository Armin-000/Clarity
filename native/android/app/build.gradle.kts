plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.codarox.clarity"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.codarox.clarity"
        minSdk = 26
        targetSdk = 35
        versionCode = 60000
        versionName = "6.0.0"
    }

    buildFeatures { buildConfig = true }
}

dependencies {
    implementation("androidx.webkit:webkit:1.12.1")
}
