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
   Required both for `sendDigest`'s Cloud Scheduler trigger and for 2nd
   gen functions generally. For a family-sized app you'll almost
   certainly stay within the free quota (so ~$0/month), but a billing
   account/card does need to be on file.

   > These are deliberately **2nd gen** functions. 1st gen deploys fail
   > on this project with an opaque `GetDefaultServiceAccount`
   > permission error, because 1st gen depends on the legacy Cloud Build
   > default service account that newer Firebase projects no longer get.
   > No amount of IAM role granting fixes that — 2nd gen (Cloud Run
   > backed) is the supported path.
3. **Deploy the functions.** The reliable way is
   [Google Cloud Shell](https://shell.cloud.google.com/?project=family-grocery-list-bd6e3)
   — a browser terminal on a Google-hosted VM, so nothing is installed or
   cloned on your own machine, and you're authenticated as the project
   owner (which matters, see below):

   ```bash
   git clone https://github.com/mckogan2/Testapp.git
   cd Testapp && git checkout claude/android-app-grocery-list
   cd functions && npm install && cd ..
   unset GOOGLE_CLOUD_QUOTA_PROJECT
   firebase deploy --only functions --project family-grocery-list-bd6e3
   ```

   `unset GOOGLE_CLOUD_QUOTA_PROJECT` is required: Cloud Shell sets that
   variable and the Firebase CLI can't upload function source while it
   is set.

   There is also `.github/workflows/deploy-functions.yml`, which deploys
   via a service account key stored in the `FIREBASE_SERVICE_ACCOUNT_KEY`
   repo secret. That path only works for redeploys of an already-working
   setup — a service account with Editor cannot do the *first* deploy,
   because initial provisioning requires modifying the project's IAM
   policy, which Editor deliberately cannot do.

### One-time project provisioning (already done, recorded for reference)

This project was missing several service-agent bindings that Google
normally creates automatically, so the first deploy needed all of the
following. Fresh projects usually need none of this; it's written down
in case it ever has to be reproduced.

```bash
# App Engine app — Cloud Functions stages source in an appspot.com bucket
gcloud app create --region=us-central

# Cloud Functions service agent: create the staging bucket
gcloud projects add-iam-policy-binding family-grocery-list-bd6e3 \
  --member=serviceAccount:service-334568458433@gcf-admin-robot.iam.gserviceaccount.com \
  --role=roles/cloudfunctions.serviceAgent

# Artifact Registry: create + push the gcf-artifacts repo
gcloud projects add-iam-policy-binding family-grocery-list-bd6e3 \
  --member=serviceAccount:service-334568458433@gcf-admin-robot.iam.gserviceaccount.com \
  --role=roles/artifactregistry.admin
gcloud projects add-iam-policy-binding family-grocery-list-bd6e3 \
  --member=serviceAccount:334568458433-compute@developer.gserviceaccount.com \
  --role=roles/artifactregistry.admin
```

The Eventarc/Pub/Sub bindings (`roles/iam.serviceAccountTokenCreator`,
`roles/run.invoker`, `roles/eventarc.eventReceiver`) were created
automatically by the CLI, because the deploy ran as project owner. On
the very first 2nd gen deploy Eventarc also needs a few minutes to
propagate — a deploy that fails with "it may take a few minutes before
all necessary permissions are propagated" just needs re-running.

Once deployed, checking/unchecking an item on any device (app or the
website) logs the change; after up to 3 minutes of accumulated changes,
every registered device gets one push summarizing them.

**Why this shape:** `pendingChanges`/`deviceTokens` live under
`/notifyState/{familyKey}`, not under `/families/{familyKey}` — the
page's `saveToDB()` overwrites that whole node (`checked`,
`customItems`, `lastPurchaseTime`, `eventLists` together) on every
single save, which would silently wipe out any bookkeeping stored
alongside it. `/notifyState` is a sibling path the page never touches.
