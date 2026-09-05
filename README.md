# Notification Test App

The simplest possible test case for browser notifications: a single static
HTML page with no build step and no backend.

## What it does

1. Click **Enable Notifications** — the browser asks for notification
   permission (uses the [Notifications API](https://developer.mozilla.org/en-US/docs/Web/API/Notifications_API)).
2. Once granted, click **Send Test Notification** to fire a native OS/browser
   notification.

## Running it

Just open `index.html` in a browser, or serve it locally:

```bash
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

Notification permission requires either `localhost` or HTTPS — it will not
work over plain HTTP on a non-localhost origin.

## Hosting

Since it's a single static file, you can host it anywhere for free:

- **GitHub Pages**: enable Pages for this repo (Settings → Pages → deploy
  from branch), pointing at the branch/folder containing `index.html`.
- **Netlify / Vercel**: drag-and-drop deploy of this folder.
