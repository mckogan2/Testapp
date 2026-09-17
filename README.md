# Sleep Tracker

A simple, single-page PWA (no build step, no backend) for logging when you
go to sleep and wake up, so you can start building a real picture of your
sleep over time.

## What it does

- **Manual logging** — tap **😴 Going to sleep**, then **☀️ I'm awake** when
  you get up. That creates a "night" record with bedtime, wake time, and
  duration.
- **Automatic gap suggestions** — while the app is open, it notices your
  last touch/scroll/keypress. If it sees a quiet gap of 3+ hours starting in
  the evening or overnight, it offers to log that as a night (you can
  confirm, adjust the times, or dismiss it).
- **Manual backfill/edit** — add a past night by hand, or edit/delete any
  logged night.
- **History + stats** — a 7-night rolling average and a small bar view of
  recent nights.

All data is stored in `localStorage` on your device only — there's no
server and nothing is sent anywhere.

### A real limitation, stated plainly

This is a browser app, not a native one: it can only see activity while the
page is open and visible. It can't sense your phone while it's locked or
while you're in another app. The automatic suggestion is a proxy ("you
stopped touching this page for a while, overnight") — useful, but not a
substitute for actually confirming with the sleep/wake buttons. If a
native app or wearable API becomes worth wiring in later, this is the
piece to swap out; the data model (`bedtime`/`wake`/`source` per night)
doesn't need to change for that.

## Data model

Each logged night is stored under the `sleepTracker.nights` key as:

```json
{ "id": "...", "bedtime": "ISO-8601", "wake": "ISO-8601", "source": "manual|auto" }
```

This is intentionally plain so future analysis (sleep cycles, circadian
timing, sleep debt, etc.) can be built as a layer that reads this list
without changing how nights are captured.

## Running it

Just open `index.html` in a browser, or serve it locally:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`. For the best experience on your phone,
add it to your home screen (Safari: Share → Add to Home Screen; Chrome:
menu → Add to Home screen) so it opens full-screen like a normal app.

## Hosting

Since it's static files, you can host it anywhere for free:

- **GitHub Pages**: enabled via `.github/workflows/deploy-pages.yml` on
  push to this branch.
- **Netlify / Vercel**: drag-and-drop deploy of this folder.
