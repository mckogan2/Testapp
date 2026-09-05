# Family Grocery List — Android app

A native Android wrapper around the family shopping-list web app (the
🛒 קניות משפחה page). Single-Activity `WebView` host, page bundled as a
local asset; the page itself keeps talking to the same Firebase Realtime
Database directly over the network (plain `fetch()`/`EventSource`, no
Firebase SDK involved) exactly as it does in a browser.

## Project layout

```
android/
  app/
    src/main/
      java/com/familygrocery/list/MainActivity.kt   -- WebView host
      assets/www/index.html                         -- the app (bundled copy)
      res/                                           -- app name, theme, launcher icon
      AndroidManifest.xml
```

## Opening the project

1. Install [Android Studio](https://developer.android.com/studio).
2. Open the `android/` folder as a project (not the repo root).
3. Let Gradle sync — it'll prompt to install any missing SDK
   platform/build-tools.
4. Run on a device or emulator.

## Building from the command line

```bash
cd android
./gradlew assembleDebug
```

APK lands at `app/build/outputs/apk/debug/app-debug.apk`. Requires the
Android SDK and either `ANDROID_HOME` set or a `local.properties` with
`sdk.dir=...` (Android Studio creates this automatically; it's
git-ignored since the path is machine-specific).

> **Note:** as with the poker tracker app in this repo, this project was
> authored in a sandbox without access to `dl.google.com` (Google's Maven
> repo, hosting AGP/AndroidX), so the build could not be compiled
> end-to-end there. Versions used: AGP 8.6.0, Kotlin 2.0.20, Gradle 8.9,
> appcompat 1.7.0, core-ktx 1.13.1, androidx.webkit 1.12.1,
> compileSdk/targetSdk 35 — all real, mutually-compatible released
> versions, but flag anything Android Studio's first sync surfaces.

## Why WebViewAssetLoader instead of a plain file:// URL

The page's "copy to WhatsApp" buttons use `navigator.clipboard.writeText()`,
which requires a secure context. A bare `file://` WebView origin doesn't
reliably count as one, which would silently break that feature. Instead,
`MainActivity` serves the bundled asset through
[`WebViewAssetLoader`](https://developer.android.com/reference/androidx/webkit/WebViewAssetLoader)
over a virtual `https://appassets.androidplatform.net/` origin — still a
fully local, bundled page, just treated as `https` by the WebView so
Clipboard and other secure-context-gated web APIs work normally. (The
poker tracker app in this repo doesn't need this since it has no such
API calls, so it loads via plain `file://`.)

## Updating the app's content

Replace `app/src/main/assets/www/index.html` with the new file, bump
`versionCode`/`versionName` in `app/build.gradle.kts`, rebuild. The
`FAMILY_KEY`/`DB_URL` constants inside the HTML point at the same
Firebase Realtime Database as the web version — unchanged.

## Before publishing

- **`applicationId`** (`com.familygrocery.list`) — pick your own if you
  plan to publish; can't change after first release.
- **App icon** — a simple cream shopping basket on the page's own
  dark-green theme color; swap via Android Studio's Image Asset tool for
  something more polished if you like.
- **Realtime Database rules** — the app reads/writes with no
  authentication, same as the web version. Worth checking your Firebase
  rules restrict access appropriately (this is independent of the
  Android wrapper).
