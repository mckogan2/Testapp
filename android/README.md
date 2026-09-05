# Poker Club Tracker — Android app

A native Android wrapper around the poker tracker web app
(originally hosted at https://poker-tracker-asaf.netlify.app/). It's a
single-Activity app that loads the page from a bundled local copy in a
`WebView`; the page itself still talks to Firestore directly over the
network exactly as it does in a browser, so live data sync, the admin
panel, and all charts work unchanged.

## Project layout

```
android/
  app/
    src/main/
      java/com/pokerclub/tracker/MainActivity.kt   -- WebView host
      assets/www/index.html                        -- the poker tracker app (bundled copy)
      res/                                          -- app name, theme, launcher icon
      AndroidManifest.xml
```

## Opening the project

1. Install [Android Studio](https://developer.android.com/studio) (this
   also gets you the Android SDK — you don't need to install it
   separately).
2. Open the `android/` folder as a project (not the repo root).
3. Let Gradle sync — Android Studio will prompt to install any missing
   SDK platform/build-tools automatically.
4. Run on a device or emulator (▶ button).

## Building from the command line

```bash
cd android
./gradlew assembleDebug
```

The debug APK ends up at `app/build/outputs/apk/debug/app-debug.apk`.
This requires the Android SDK to already be installed and either
`ANDROID_HOME` set or a `local.properties` file with `sdk.dir=...`
(Android Studio creates this for you automatically the first time you
open the project — it's git-ignored on purpose since the path is
machine-specific).

> **Note:** this project's Gradle files were authored and reviewed in a
> sandboxed environment without access to `dl.google.com` (Google's Maven
> repository, which hosts the Android Gradle Plugin and AndroidX
> libraries), so the build could not be compiled end-to-end before
> handing it off. The versions used (AGP 8.6.0, Kotlin 2.0.20, Gradle
> 8.9, appcompat 1.7.0, core-ktx 1.13.1, compileSdk/targetSdk 35) are all
> real, mutually-compatible released versions, but please flag it if
> Android Studio's first sync surfaces anything.

## Updating the app's content

The web app is bundled as a static asset, not fetched from Netlify at
runtime. To ship a newer version of the page:

1. Replace `app/src/main/assets/www/index.html` with the new file.
2. Bump `versionCode`/`versionName` in `app/build.gradle.kts`.
3. Rebuild.

Firebase config (`FIREBASE_CONFIG` inside the HTML) is unchanged from the
web version — same Firestore project, same data.

## Before publishing

A few things worth changing if this goes further than your own device:

- **`applicationId`** in `app/build.gradle.kts` (currently
  `com.pokerclub.tracker`) — pick something you control if you plan to
  publish on the Play Store; it can't be changed after your first
  release.
- **App icon** — `app/src/main/res/drawable/ic_launcher_foreground.xml`
  is a simple gold spade on the felt-green background used by the web
  app. Swap it (and `res/mipmap-anydpi-v26/ic_launcher.xml`) for
  something more polished via Android Studio's Image Asset tool if
  you'd like.
- **Admin password** — it's the same hardcoded password embedded in the
  HTML as on the website (not real security there either; anyone can
  read it out of the page source/APK).
- **Firestore security rules** — the app writes to Firestore with no
  authentication. Worth double-checking your Firestore rules restrict
  writes appropriately, independent of this Android wrapper.

## Why a WebView instead of a rewrite

The page already does all the real work (Chart.js rendering, Firestore
sync, the admin flows) and works well as-is; a full native rewrite would
mean maintaining two copies of the same logic. The wrapper's only jobs
are to host the page full-screen with an app icon/launcher entry, and to
supply native dialogs for the `alert()`/`confirm()`/`prompt()` calls the
page uses (admin login, delete confirmations) — a bare WebView shows no
UI for those unless the host app provides it, which is what
`MainActivity.kt`'s `WebChromeClient` override does.
