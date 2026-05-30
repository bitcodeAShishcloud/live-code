# Deploying the Chat Backend (Free Hosting)

Vercel **cannot** host this chat backend because serverless functions don't keep
a persistent WebSocket open. Host the `server.js` backend on a platform that
supports long-running Node processes, and keep your frontend on Vercel.

## Why split frontend and backend?
- **Frontend** (index.html, styles.css, script.js) → stays on Vercel (static).
- **Backend** (server.js / Socket.io) → goes on a WebSocket-friendly host below.

---

## Recommended Free Hosts (WebSocket-friendly)

| Host | Free tier notes | Best for |
|------|-----------------|----------|
| **Render** | Free web service. Sleeps after ~15 min idle, wakes on next request (first hit is slow). Native WebSocket support. | Easiest setup — use the included `render.yaml`. |
| **Railway** | Free trial credits each month, push-to-deploy like Heroku. | Smoothest developer experience. |
| **Fly.io** | Generous free allowance, deploys containers globally, low latency. | Apps needing global/low-latency. |

All three support persistent WebSockets, which is what Socket.io needs.
Content was rephrased for compliance with licensing restrictions. Sources:
[Best Node.js Hosting 2026 (luckymedia.dev)](https://www.luckymedia.dev/guides/best-nodejs-hosting),
[Heroku alternatives 2026 (smashingapps.com)](https://www.smashingapps.com/heroku-alternatives-2026/),
[7 Best Node.js Hosting Platforms (runcloud.io)](https://runcloud.io/blog/best-node-js-hosting).

---

## Option A — Deploy to Render (easiest)

1. Push this project to a GitHub repo.
2. Go to [render.com](https://render.com) and sign in with GitHub.
3. Click **New +** → **Blueprint** → select your repo.
4. Render reads `render.yaml` and creates the service. Click **Apply**.
5. Wait for the build. You'll get a URL like `https://live-compiler-chat.onrender.com`.
6. Test it: open `https://<your-url>/health` — you should see `{"status":"ok",...}`.

## Option B — Deploy to Railway

1. Push to GitHub.
2. Go to [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**.
3. Railway auto-detects Node and runs `npm install` then `node server.js`.
4. Under **Settings → Networking**, generate a public domain.
5. Test `https://<your-url>/health`.

## Option C — Deploy to Fly.io

1. Install the CLI: [fly.io/docs/hands-on/install-flyctl](https://fly.io/docs/hands-on/install-flyctl/)
2. Run `fly launch` in this folder (it detects Node, creates a `fly.toml`).
3. Accept defaults; choose the free configuration.
4. Run `fly deploy`.
5. Test `https://<your-app>.fly.dev/health`.

---

## Connecting your Vercel frontend to the backend

Once the backend is live, tell the frontend where it is.

Open `index.html`, find this block near the bottom, and set your backend URL:

```html
<script>
    window.CHAT_SERVER_URL = "https://live-compiler-chat.onrender.com";
</script>
```

That's it. The client auto-detects:
- **localhost** → uses `http://localhost:3000` automatically (no config needed).
- **deployed** → uses `window.CHAT_SERVER_URL`.

---

## Lock down CORS (recommended for production)

By default the backend accepts any origin (`*`). To allow only your site, set an
environment variable on your host:

```
ALLOWED_ORIGINS=https://your-site.vercel.app
```

On Render you can uncomment the `ALLOWED_ORIGINS` lines in `render.yaml`, or add
it under the service's **Environment** tab.

---

## Quick local test

```bash
npm install
node server.js
```

Open the app, click **Collab → Create New Room**, enter a username, and the chat
status should turn green ("Connected"). Open a second browser tab, join with the
same room code, and messages should appear in both.

---

## Heads-up about Render's free tier sleep

Free Render services sleep after inactivity. The first request after sleeping
takes ~30-60s to wake up, so the very first chat connection may lag. After that
it's instant. Railway and Fly.io behave differently — see their dashboards.
