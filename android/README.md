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

## Push notifications (digest of item changes, every 3 minutes)

Two pieces work together:

- **This app** registers its FCM token to
  `/notifyState/{familyKey}/deviceTokens` in the Realtime Database on
  every launch, and shows whatever notification it receives
  (`GroceryMessagingService.kt`).
- **`functions/index.js`** (Cloud Functions, at the repo root, not under
  `android/`) watches the same database for item toggles, logs each one,
  and every 3 minutes turns any that piled up into a single push —
  emptying the log if there's nothing new, so quiet periods send
  nothing.

None of this works until you complete the setup below — it's Firebase
console/CLI work only you can do (needs your Google account):

1. **Register the Android app in Firebase console** — the project is
   assumed to be `family-grocery-list-bd6e3` (inferred from the database
   URL already in the page; confirm it in the console, and fix
   `.firebaserc` at the repo root if it's wrong). Project settings → Add
   app → Android → package name `com.familygrocery.list` → register →
   download `google-services.json` → place it at
   `android/app/google-services.json` (this repo doesn't have it — the
   build fails without it, with a clear "File google-services.json is
   missing" error). It's not a secret credential (Google's own docs say
   it's fine to commit), so either commit it directly or keep it as a
   CI secret if you'd rather not.
2. **Enable the Blaze (pay-as-you-go) plan** on that Firebase project.
   This is required for `sendDigest`'s scheduled trigger specifically —
   any Cloud Scheduler–based function needs Blaze, regardless of how
   little it runs. For a family-sized app you'll almost certainly stay
   within the free quota (so ~$0/month), but a billing account/card does
   need to be on file.
3. **Deploy the functions.** Two ways:
   - **From your own machine** (needs an interactive Firebase login,
     which isn't possible from CI or this sandbox):
     ```bash
     npm install -g firebase-tools
     firebase login
     cd functions && npm install && cd ..
     firebase deploy --only functions
     ```
   - **Automatically via CI** (`.github/workflows/deploy-functions.yml`)
     — deploys on every push to `functions/**` using a service account
     instead of an interactive login, so no computer/CLI needed. One-time
     setup, done entirely in a browser:
     1. In [Google Cloud Console](https://console.cloud.google.com/iam-admin/serviceaccounts)
        (project `family-grocery-list-bd6e3`), create a service account
        (e.g. `github-actions-deploy`), grant it the **Editor** role,
        then Keys → Add key → Create new key → JSON. This downloads a
        `.json` file.
     2. In the GitHub repo → Settings → Secrets and variables → Actions
        → New repository secret. Name it `FIREBASE_SERVICE_ACCOUNT_KEY`,
        paste the entire contents of that JSON file as the value.
     3. Push (or re-run the workflow manually from the Actions tab) —
        it deploys both functions automatically from then on.

Once deployed, checking/unchecking an item on any device (app or the
website) logs the change; after up to 3 minutes of accumulated changes,
every registered device gets one push summarizing them.

**Why this shape:** `pendingChanges`/`deviceTokens` live under
`/notifyState/{familyKey}`, not under `/families/{familyKey}` — the
page's `saveToDB()` overwrites that whole node (`checked`,
`customItems`, `lastPurchaseTime`, `eventLists` together) on every
single save, which would silently wipe out any bookkeeping stored
alongside it. `/notifyState` is a sibling path the page never touches.
