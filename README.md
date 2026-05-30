# Live Compiler Pro — Real-time Chat & Voice Backend

A Python (Flask-SocketIO) backend that powers the in-app **Chat** panel and
relays **WebRTC** voice signaling. Rooms are fully isolated: messages and calls
in one room never reach another.

## What you get

- **Sidebar chat** — open it from the chat icon (💬) in the activity bar.
- **Room isolation** — users only see messages/calls from their own room code.
- **Unread badge** — a red counter on the chat icon when the panel is closed.
- **Browser notifications** — desktop alerts for messages from other users.
- **Presence** — live list of who is in the room.
- **WebRTC signaling** — offer/answer/ICE relayed only between peers in the same room.

## Project layout

| File | Purpose |
|------|---------|
| `server.py` | Flask-SocketIO backend (chat, presence, WebRTC relay) |
| `requirements.txt` | Python dependencies |
| `socket-client.js` | Frontend Socket.IO client + chat UI logic |
| `index.html` / `styles.css` / `script.js` | The existing app, with the chat panel integrated |
| `test-connection.html` | Standalone page to smoke-test the backend |

## Run locally

1. Create / activate a virtual environment (one already exists in `.venv`):

   ```bash
   python -m venv .venv
   .venv\Scripts\activate        # Windows
   # source .venv/bin/activate   # macOS / Linux
   ```

2. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

3. Start the server:

   ```bash
   python server.py
   ```

   You should see `Listening on http://localhost:3000`.

4. Open the app at **http://localhost:3000** (the backend serves `index.html`),
   click the chat icon, enter a username, and create or join a room.

### Quick test

Open two browser windows on `http://localhost:3000`:

1. Window 1 → chat icon → enter "Alice" → **Create**. Copy the room code.
2. Window 2 → chat icon → enter "Bob" → paste the code → **Join**.
3. Chat between them. Open a third window in a *different* room to confirm
   messages stay isolated.

You can also open `test-connection.html` directly for an automated check.

## Configuration

Environment variables (all optional):

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Port to listen on |
| `HOST` | `0.0.0.0` | Bind address |
| `CORS_ORIGINS` | `*` | Allowed origins (set to your frontend URL in production) |

The frontend points at `http://localhost:3000` via the `SERVER_URL` constant at
the top of `socket-client.js`. Change it to your deployed backend URL for
production.

## HTTP endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Status plus active room/user counts |
| `GET /api/rooms` | Debug: list active rooms and their members |

## Deploying

Vercel serverless functions don't keep WebSocket connections open, so deploy the
backend to a host that supports long-lived processes:

- **Render**, **Railway**, **Fly.io**, or any VPS.
- Start command: `python server.py` (or run under `gunicorn` with an async worker).
- Set `CORS_ORIGINS` to your frontend origin and update `SERVER_URL` in
  `socket-client.js` to the deployed URL.

> The built-in server is fine for development and small groups. For heavier
> production traffic, run behind `gunicorn`/`uvicorn` with multiple workers and a
> shared message queue (e.g. Redis) so Socket.IO can scale horizontally.
