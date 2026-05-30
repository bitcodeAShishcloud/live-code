"""
Live Compiler Pro - Real-time Collaboration Backend
====================================================

A Socket.IO server that provides:
  * Room-isolated text chat
  * WebRTC signaling relay (offer / answer / ICE candidates)
  * Live presence (who is in a room)

Rooms are fully isolated: a message or signal sent inside room "ABC" is only
ever delivered to sockets that joined room "ABC".

Run locally:
    python server.py

Tech stack: Flask + Flask-SocketIO (eventlet async worker).
"""

from __future__ import annotations

import logging
import os
import random
import string
from dataclasses import dataclass, field
from datetime import datetime, timezone
from threading import Lock
from typing import Optional

from flask import Flask, jsonify, send_from_directory
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room, leave_room

# --------------------------------------------------------------------------- #
# Configuration
# --------------------------------------------------------------------------- #

HOST = os.environ.get("HOST", "0.0.0.0")
PORT = int(os.environ.get("PORT", "3000"))
# Comma separated list of allowed origins, or "*" for any (dev only).
CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*")
ROOM_CODE_LENGTH = 12
STATIC_DIR = os.path.dirname(os.path.abspath(__file__))

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("collab")


# --------------------------------------------------------------------------- #
# In-memory data model
# --------------------------------------------------------------------------- #


@dataclass
class User:
    """A single connected client."""

    sid: str
    username: str
    room_code: str


@dataclass
class Room:
    """A chat/collaboration room. Holds the users currently inside it."""

    code: str
    users: dict[str, User] = field(default_factory=dict)  # sid -> User

    def usernames(self) -> set[str]:
        return {u.username for u in self.users.values()}

    def public_user_list(self) -> list[dict[str, str]]:
        """Serializable list of users, safe to send to clients."""
        return [{"sid": u.sid, "username": u.username} for u in self.users.values()]


class RoomRegistry:
    """
    Thread-safe store of all rooms and users.

    A single lock guards every mutation. Operations are short and in-memory,
    so contention is negligible while correctness is guaranteed.
    """

    def __init__(self) -> None:
        self._lock = Lock()
        self._rooms: dict[str, Room] = {}
        self._users: dict[str, User] = {}  # sid -> User (fast reverse lookup)

    # -- queries ----------------------------------------------------------- #

    def get_user(self, sid: str) -> Optional[User]:
        return self._users.get(sid)

    def get_room(self, code: str) -> Optional[Room]:
        return self._rooms.get(code)

    def is_username_taken(self, room_code: str, username: str) -> bool:
        with self._lock:
            room = self._rooms.get(room_code)
            return bool(room and username.lower() in {u.lower() for u in room.usernames()})

    def stats(self) -> dict[str, int]:
        with self._lock:
            return {
                "active_rooms": len(self._rooms),
                "active_users": len(self._users),
            }

    def room_snapshot(self) -> list[dict]:
        with self._lock:
            return [
                {"room_code": code, "user_count": len(room.users),
                 "users": [u.username for u in room.users.values()]}
                for code, room in self._rooms.items()
            ]

    # -- mutations --------------------------------------------------------- #

    def add_user(self, sid: str, username: str, room_code: str) -> Room:
        """Register a user inside a room, creating the room if needed."""
        with self._lock:
            room = self._rooms.setdefault(room_code, Room(code=room_code))
            user = User(sid=sid, username=username, room_code=room_code)
            room.users[sid] = user
            self._users[sid] = user
            return room

    def remove_user(self, sid: str) -> tuple[Optional[User], Optional[Room]]:
        """
        Remove a user by socket id.

        Returns (user, room) where room is the room they were in (now updated),
        or (None, None) if the socket was not tracked. Empty rooms are deleted.
        """
        with self._lock:
            user = self._users.pop(sid, None)
            if user is None:
                return None, None

            room = self._rooms.get(user.room_code)
            if room is not None:
                room.users.pop(sid, None)
                if not room.users:
                    del self._rooms[user.room_code]
            return user, room


registry = RoomRegistry()


# --------------------------------------------------------------------------- #
# Helpers
# --------------------------------------------------------------------------- #


def now_iso() -> str:
    """Current UTC time as an ISO-8601 string."""
    return datetime.now(timezone.utc).isoformat()


def generate_room_code() -> str:
    """Generate a random uppercase alphanumeric room code."""
    alphabet = string.ascii_uppercase + string.digits
    return "".join(random.choices(alphabet, k=ROOM_CODE_LENGTH))


def suggest_usernames(base: str, taken: set[str], count: int = 3) -> list[str]:
    """Propose alternative usernames when the desired one is taken."""
    taken_lower = {t.lower() for t in taken}
    suggestions: list[str] = []
    n = 2
    while len(suggestions) < count:
        candidate = f"{base}{n}"
        if candidate.lower() not in taken_lower:
            suggestions.append(candidate)
        n += 1
    return suggestions


# --------------------------------------------------------------------------- #
# Flask + Socket.IO app
# --------------------------------------------------------------------------- #

app = Flask(__name__, static_folder=None)
CORS(app, resources={r"/*": {"origins": CORS_ORIGINS}})

socketio = SocketIO(
    app,
    cors_allowed_origins=CORS_ORIGINS,
    # "threading" mode works out of the box on modern Python (3.12/3.13) and
    # uses simple-websocket for the WebSocket transport. No monkey-patching.
    async_mode="threading",
    logger=False,
    engineio_logger=False,
)


# --------------------------------------------------------------------------- #
# HTTP routes
# --------------------------------------------------------------------------- #


@app.route("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")


@app.route("/health")
def health():
    return jsonify({"status": "ok", "timestamp": now_iso(), **registry.stats()})


@app.route("/api/rooms")
def api_rooms():
    """Debug endpoint: list active rooms and their occupants."""
    return jsonify({"rooms": registry.room_snapshot()})


@app.route("/<path:filename>")
def static_files(filename: str):
    """Serve the frontend assets (script.js, styles.css, etc.)."""
    return send_from_directory(STATIC_DIR, filename)


# --------------------------------------------------------------------------- #
# Socket.IO event handlers
# --------------------------------------------------------------------------- #


@socketio.on("connect")
def on_connect():
    from flask import request
    log.info("Socket connected: %s", request.sid)


@socketio.on("authenticate")
def on_authenticate(data: dict):
    """
    Client requests to join a room with a username.

    Expected payload: { "username": str, "roomCode": str }
    """
    from flask import request

    sid = request.sid
    username = (data or {}).get("username", "").strip()
    room_code = (data or {}).get("roomCode", "").strip().upper()

    # --- validation --------------------------------------------------------
    if not username or not room_code:
        emit("error", {"message": "Username and room code are required."})
        return

    if len(room_code) != ROOM_CODE_LENGTH:
        emit("error", {"message": f"Room code must be {ROOM_CODE_LENGTH} characters."})
        return

    # --- duplicate username guard -----------------------------------------
    if registry.is_username_taken(room_code, username):
        room = registry.get_room(room_code)
        taken = room.usernames() if room else set()
        emit("username-taken", {
            "message": f'Username "{username}" is already taken in this room.',
            "originalUsername": username,
            "suggestions": suggest_usernames(username, taken),
        })
        return

    # --- join --------------------------------------------------------------
    room = registry.add_user(sid, username, room_code)
    join_room(room_code)

    log.info('User "%s" joined room "%s" (%d in room)',
             username, room_code, len(room.users))

    users = room.public_user_list()

    # Confirm to the joining user.
    emit("authenticated", {
        "success": True,
        "roomCode": room_code,
        "username": username,
        "usersInRoom": users,
    })

    # Tell everyone else in the room that someone arrived.
    emit("user-joined", {
        "username": username,
        "usersInRoom": users,
        "timestamp": now_iso(),
    }, room=room_code, include_self=False)

    # Broadcast the fresh user list to the whole room.
    emit("room-users", {"users": users}, room=room_code)


@socketio.on("chat-message")
def on_chat_message(data: dict):
    """Relay a chat message to everyone in the sender's room."""
    from flask import request

    user = registry.get_user(request.sid)
    if user is None:
        emit("error", {"message": "You must join a room before chatting."})
        return

    message = (data or {}).get("message", "").strip()
    if not message:
        return

    log.info('[%s] %s: %s', user.room_code, user.username, message)

    emit("chat-message", {
        "username": user.username,
        "message": message,
        "timestamp": now_iso(),
        "socketId": user.sid,
    }, room=user.room_code)  # include_self=True (default) so sender sees it too


# -- WebRTC signaling relay ------------------------------------------------- #
# These handlers simply forward signaling data to a specific target socket,
# but only after confirming both peers are known. Rooms keep peers isolated.


@socketio.on("webrtc-offer")
def on_webrtc_offer(data: dict):
    _relay_signal("webrtc-offer", data, payload_key="offer")


@socketio.on("webrtc-answer")
def on_webrtc_answer(data: dict):
    _relay_signal("webrtc-answer", data, payload_key="answer")


@socketio.on("webrtc-ice-candidate")
def on_webrtc_ice(data: dict):
    _relay_signal("webrtc-ice-candidate", data, payload_key="candidate")


def _relay_signal(event: str, data: dict, payload_key: str) -> None:
    """
    Shared logic for the three WebRTC signaling events.

    Forwards `data[payload_key]` to `data["targetSocketId"]`, tagging it with
    the sender's identity. Refuses to relay across different rooms.
    """
    from flask import request

    sender = registry.get_user(request.sid)
    if sender is None:
        emit("error", {"message": "Not authenticated."})
        return

    target_sid = (data or {}).get("targetSocketId")
    target = registry.get_user(target_sid) if target_sid else None

    # Both peers must exist and live in the same room.
    if target is None or target.room_code != sender.room_code:
        emit("error", {"message": "Invalid signaling target."})
        return

    emit(event, {
        payload_key: data.get(payload_key),
        "fromSocketId": sender.sid,
        "fromUsername": sender.username,
    }, room=target_sid)


@socketio.on("code-change")
def on_code_change(data: dict):
    """Broadcast an editor change to other members of the room."""
    from flask import request

    user = registry.get_user(request.sid)
    if user is None:
        return

    emit("code-change", {
        "fileId": (data or {}).get("fileId"),
        "content": (data or {}).get("content"),
        "fromUsername": user.username,
    }, room=user.room_code, include_self=False)


@socketio.on("disconnect")
def on_disconnect():
    """Clean up when a socket drops; notify the room they left."""
    from flask import request

    user, room = registry.remove_user(request.sid)
    if user is None:
        log.info("Socket disconnected: %s", request.sid)
        return

    log.info('User "%s" left room "%s"', user.username, user.room_code)

    # If the room still has members, tell them about the departure.
    if room is not None and room.users:
        users = room.public_user_list()
        emit("user-left", {
            "username": user.username,
            "usersInRoom": users,
            "timestamp": now_iso(),
        }, room=user.room_code)
        emit("room-users", {"users": users}, room=user.room_code)


# --------------------------------------------------------------------------- #
# Entrypoint
# --------------------------------------------------------------------------- #


def main() -> None:
    log.info("=" * 56)
    log.info("Live Compiler Pro collaboration server")
    log.info("Listening on http://%s:%d", HOST, PORT)
    log.info("Room isolation: ON   |   WebRTC signaling: ON")
    log.info("=" * 56)
    # allow_unsafe_werkzeug=True lets the built-in server run on hosts like
    # Render (it otherwise refuses to start outside debug mode). Fine for the
    # threading async mode used here; for heavy traffic put it behind gunicorn.
    socketio.run(
        app,
        host=HOST,
        port=PORT,
        allow_unsafe_werkzeug=True,
    )


if __name__ == "__main__":
    main()
