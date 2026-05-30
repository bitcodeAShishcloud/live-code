// ==================== REAL-TIME CHAT & WEBRTC CLIENT ====================
// Connects to the Python (Flask-SocketIO) backend and drives the chat panel
// that lives in the sidebar. Also relays WebRTC signaling for voice calls.
//
// This file owns ALL chat behaviour: connection, auth, messaging, presence,
// notifications, and the UI helpers the chat panel calls via onclick.
// ========================================================================

(function () {
    "use strict";

    // ---- Configuration --------------------------------------------------- //
    // The backend also serves this page, so default to the same origin.
    // When the file is opened directly (file://) fall back to localhost.
    const SERVER_URL =
        window.location.protocol === "file:"
            ? "http://localhost:3000"
            : window.location.origin;

    const ROOM_CODE_LENGTH = 12;

    // Keys for persisting the chat session across page refreshes.
    // sessionStorage is per-tab, so two tabs can be two different users.
    const SESSION_KEY = "collabChatSession";
    const MESSAGES_KEY = "collabChatMessages";
    const MAX_SAVED_MESSAGES = 100;

    // ---- State ----------------------------------------------------------- //
    let socket = null;
    let connected = false;
    let currentUsername = null;
    let currentRoomCode = null;
    let roomUsers = [];
    let unreadCount = 0;
    // True while we are auto-rejoining after a refresh (suppresses some UI).
    let isRestoring = false;
    let restoreRetried = false;
    // Tracks the room/user we are actually authenticated as (set by the server
    // "authenticated" event). Used to make authenticate() idempotent so the
    // PeerJS collab flow and the chat restore don't double-join.
    let authedUsername = null;
    let authedRoomCode = null;

    // WebRTC peer connections keyed by remote socket id.
    const peerConnections = new Map();
    const rtcConfig = {
        iceServers: [
            { urls: "stun:stun.l.google.com:19302" },
            { urls: "stun:stun1.l.google.com:19302" },
        ],
    };

    // ---- Small DOM utilities --------------------------------------------- //
    const $ = (id) => document.getElementById(id);

    function escapeHtml(text) {
        const div = document.createElement("div");
        div.textContent = text == null ? "" : String(text);
        return div.innerHTML;
    }

    function isChatPanelOpen() {
        const panel = $("chatPanel");
        return !!(panel && panel.classList.contains("active"));
    }

    // ===================================================================== //
    // Session persistence (survives page refresh via sessionStorage)
    // ===================================================================== //

    function saveSession() {
        try {
            if (currentUsername && currentRoomCode) {
                sessionStorage.setItem(
                    SESSION_KEY,
                    JSON.stringify({ username: currentUsername, roomCode: currentRoomCode })
                );
            }
        } catch (_) {
            /* storage may be unavailable (private mode) */
        }
    }

    function loadSession() {
        try {
            const raw = sessionStorage.getItem(SESSION_KEY);
            return raw ? JSON.parse(raw) : null;
        } catch (_) {
            return null;
        }
    }

    function clearSession() {
        try {
            sessionStorage.removeItem(SESSION_KEY);
            sessionStorage.removeItem(MESSAGES_KEY);
        } catch (_) {
            /* ignore */
        }
    }

    // Persist a single chat/system message so it can be re-rendered on refresh.
    function persistMessage(entry) {
        try {
            const list = JSON.parse(sessionStorage.getItem(MESSAGES_KEY) || "[]");
            list.push(entry);
            // Keep only the most recent N messages.
            const trimmed = list.slice(-MAX_SAVED_MESSAGES);
            sessionStorage.setItem(MESSAGES_KEY, JSON.stringify(trimmed));
        } catch (_) {
            /* ignore */
        }
    }

    function loadMessages() {
        try {
            return JSON.parse(sessionStorage.getItem(MESSAGES_KEY) || "[]");
        } catch (_) {
            return [];
        }
    }

    // Re-render saved messages into the chat box (without re-persisting them).
    function restoreMessages() {
        const saved = loadMessages();
        for (const m of saved) {
            addMessage(m.username, m.message, m.type, m.timestamp, true);
        }
    }

    // ===================================================================== //
    // Connection
    // ===================================================================== //

    function connect() {
        if (socket && socket.connected) return;
        if (typeof io === "undefined") {
            setStatus("Socket.IO library failed to load.", "disconnected");
            return;
        }

        socket = io(SERVER_URL, {
            transports: ["websocket", "polling"],
            reconnection: true,
            reconnectionDelay: 1000,
            reconnectionAttempts: 10,
        });

        registerSocketHandlers();
    }

    function registerSocketHandlers() {
        socket.on("connect", () => {
            connected = true;
            // If we already have an active session in memory, re-join it.
            if (currentUsername && currentRoomCode) {
                socket.emit("authenticate", {
                    username: currentUsername,
                    roomCode: currentRoomCode,
                });
                return;
            }
            // On a fresh page load, try to restore a saved session (refresh case).
            const saved = loadSession();
            if (saved && saved.username && saved.roomCode) {
                isRestoring = true;
                setStatus("Rejoining your room...", "connected");
                socket.emit("authenticate", {
                    username: saved.username,
                    roomCode: saved.roomCode,
                });
            } else {
                setStatus("Connected. Enter a name and room to start.", "connected");
            }
        });

        socket.on("connect_error", () => {
            connected = false;
            setStatus("Cannot reach server. Is the backend running?", "disconnected");
        });

        socket.on("disconnect", () => {
            connected = false;
            authedUsername = null;
            authedRoomCode = null;
            setStatus("Disconnected from server.", "disconnected");
            cleanupAllPeers();
        });

        // ---- Auth & presence --------------------------------------------- //
        socket.on("authenticated", ({ roomCode, username, usersInRoom }) => {
            currentUsername = username;
            currentRoomCode = roomCode;
            authedUsername = username;
            authedRoomCode = roomCode;
            roomUsers = usersInRoom || [];

            // Persist so a refresh can rejoin automatically.
            saveSession();

            showChatInterface();
            const roomEl = $("chatCurrentRoom");
            if (roomEl) roomEl.textContent = roomCode;
            renderUsers(roomUsers);

            if (isRestoring) {
                // Coming back from a refresh: re-render saved messages instead
                // of showing a fresh "you joined" line.
                isRestoring = false;
                restoreRetried = false;
                const box = $("chatMessages");
                if (box) box.innerHTML = "";
                restoreMessages();
                addMessage("System", `Reconnected to room ${roomCode}`, "system");
            } else {
                addMessage("System", `You joined room ${roomCode}`, "system");
            }

            // Make sure the chat panel is visible to the user.
            if (!isChatPanelOpen() && typeof switchSidebarTab === "function") {
                switchSidebarTab("chat", true);
            }
        });

        socket.on("username-taken", ({ originalUsername, suggestions }) => {
            // During an auto-restore (refresh), don't nag the user with a prompt.
            // The previous socket may still be lingering on the server; retry
            // once with a suggested name, otherwise fall back to manual entry.
            if (isRestoring) {
                const pick = (suggestions && suggestions[0]) || `${originalUsername}2`;
                if (!restoreRetried) {
                    restoreRetried = true;
                    authenticate(pick, currentRoomCode);
                } else {
                    isRestoring = false;
                    restoreRetried = false;
                    clearSession();
                    showAuthForm();
                    setStatus("Couldn't rejoin automatically. Please join again.", "disconnected");
                }
                return;
            }

            const list = (suggestions || []).join(", ");
            const pick = suggestions && suggestions[0];
            const ok = window.confirm(
                `Username "${originalUsername}" is already taken in this room.\n\n` +
                `Suggestions: ${list}\n\n` +
                `OK = use "${pick}", Cancel = type a different name.`
            );
            const usernameInput = $("chatUsername");
            if (ok && pick) {
                if (usernameInput) usernameInput.value = pick;
                authenticate(pick, currentRoomCode);
            } else {
                const custom = window.prompt("Enter a different username:", pick || "");
                if (custom && custom.trim()) {
                    if (usernameInput) usernameInput.value = custom.trim();
                    authenticate(custom.trim(), currentRoomCode);
                } else {
                    setStatus("Join cancelled. Pick another name.", "disconnected");
                }
            }
        });

        socket.on("room-users", ({ users }) => {
            roomUsers = users || [];
            renderUsers(roomUsers);
        });

        socket.on("user-joined", ({ username, usersInRoom, timestamp }) => {
            roomUsers = usersInRoom || roomUsers;
            renderUsers(roomUsers);
            addMessage("System", `${username} joined the room`, "system", timestamp);
        });

        socket.on("user-left", ({ username, usersInRoom, timestamp }) => {
            roomUsers = usersInRoom || roomUsers;
            renderUsers(roomUsers);
            addMessage("System", `${username} left the room`, "system", timestamp);
        });

        // ---- Chat -------------------------------------------------------- //
        socket.on("chat-message", ({ username, message, timestamp, socketId }) => {
            const mine = socket && socketId === socket.id;
            addMessage(username, message, mine ? "self" : "other", timestamp);
        });

        // ---- WebRTC signaling -------------------------------------------- //
        socket.on("webrtc-offer", async ({ offer, fromSocketId }) => {
            await handleOffer(offer, fromSocketId);
        });
        socket.on("webrtc-answer", async ({ answer, fromSocketId }) => {
            await handleAnswer(answer, fromSocketId);
        });
        socket.on("webrtc-ice-candidate", async ({ candidate, fromSocketId }) => {
            await handleIce(candidate, fromSocketId);
        });

        // ---- Code collaboration ------------------------------------------ //
        socket.on("code-change", ({ fileId, content, fromUsername }) => {
            if (typeof handleRemoteCodeChange === "function") {
                handleRemoteCodeChange(fileId, content, fromUsername);
            }
        });

        // ---- Errors ------------------------------------------------------ //
        socket.on("error", ({ message }) => {
            setStatus(message || "Server error.", "disconnected");
            if (typeof showToast === "function") showToast(message, "error");
        });
    }

    // ===================================================================== //
    // Auth & chat actions
    // ===================================================================== //

    function authenticate(username, roomCode) {
        if (!socket || !socket.connected) {
            // Remember intent so the "connect" handler can complete the join.
            if (username && roomCode) {
                currentUsername = username;
                currentRoomCode = roomCode;
            }
            setStatus("Connecting... will join when ready.", "");
            connect();
            return false;
        }
        if (!username || !roomCode) {
            setStatus("Username and room code are required.", "disconnected");
            return false;
        }
        // Idempotent: ignore a duplicate join for the same room+user. This stops
        // the PeerJS collab reconnect and the chat restore from double-joining.
        if (authedUsername === username && authedRoomCode === roomCode) {
            return true;
        }
        currentUsername = username;
        currentRoomCode = roomCode;
        socket.emit("authenticate", { username, roomCode });
        return true;
    }

    function sendMessage(message) {
        const text = (message || "").trim();
        if (!text) return false;
        if (!socket || !socket.connected || !currentRoomCode) {
            setStatus("Join a room before sending messages.", "disconnected");
            return false;
        }
        socket.emit("chat-message", { message: text });
        return true;
    }

    function sendCodeChange(fileId, content) {
        if (socket && socket.connected && currentRoomCode) {
            socket.emit("code-change", { fileId, content });
        }
    }

    function leaveRoom() {
        cleanupAllPeers();
        // Clear persisted session so a refresh doesn't rejoin.
        clearSession();
        if (socket && socket.connected) {
            // Disconnect then reconnect so the socket is fresh for the next room.
            socket.disconnect();
            setTimeout(connect, 300);
        }
        currentUsername = null;
        currentRoomCode = null;
        authedUsername = null;
        authedRoomCode = null;
        roomUsers = [];
        isRestoring = false;
        restoreRetried = false;
        const box = $("chatMessages");
        if (box) box.innerHTML = "";
        showAuthForm();
        clearNotifications();
        setStatus("You left the room.", "disconnected");
    }

    // ===================================================================== //
    // Chat UI rendering
    // ===================================================================== //

    function setStatus(message, type) {
        const el = $("chatConnectionStatus");
        if (!el) return;
        el.className = `chat-connection-status ${type || ""}`.trim();
        el.innerHTML = `<i class="fas fa-circle"></i><span>${escapeHtml(message)}</span>`;
    }

    function showAuthForm() {
        const auth = $("chatAuthForm");
        const ui = $("chatInterface");
        if (auth) auth.style.display = "flex";
        if (ui) ui.style.display = "none";
    }

    function showChatInterface() {
        const auth = $("chatAuthForm");
        const ui = $("chatInterface");
        if (auth) auth.style.display = "none";
        if (ui) ui.style.display = "flex";
    }

    function addMessage(username, message, type, timestamp, skipPersist) {
        const box = $("chatMessages");
        if (!box) return;

        const ts = timestamp || new Date().toISOString();
        const time = new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

        const wrap = document.createElement("div");
        wrap.className = `chat-message ${type}`;

        if (type === "system") {
            wrap.innerHTML = `
                <div class="message-content">
                    <span class="message-text">${escapeHtml(message)}</span>
                </div>`;
        } else {
            wrap.innerHTML = `
                <div class="message-header">
                    <span class="message-username">${escapeHtml(username)}</span>
                    <span class="message-time">${time}</span>
                </div>
                <div class="message-content">
                    <span class="message-text">${escapeHtml(message)}</span>
                </div>`;
        }

        box.appendChild(wrap);
        box.scrollTop = box.scrollHeight;

        // Persist real messages (chat from self/others) so a refresh can restore
        // them. System lines are transient and are not saved.
        if (!skipPersist && (type === "self" || type === "other")) {
            persistMessage({ username, message, type, timestamp: ts });
        }

        // Notify only for messages from others while the panel is closed.
        if (type === "other" && !skipPersist && !isChatPanelOpen()) {
            unreadCount += 1;
            renderBadge();
            maybeBrowserNotify(username, message);
        }
    }

    function renderUsers(users) {
        const list = $("chatUsersList");
        const count = $("chatUserCount");
        if (count) count.textContent = users.length;
        if (!list) return;

        list.innerHTML = users
            .map((u) => {
                const isMe = u.username === currentUsername;
                return `
                    <div class="chat-user-item ${isMe ? "current" : ""}">
                        <i class="fas fa-circle"></i>
                        <span>${escapeHtml(u.username)}${isMe ? " (you)" : ""}</span>
                    </div>`;
            })
            .join("");
    }

    // ===================================================================== //
    // Notifications
    // ===================================================================== //

    function renderBadge() {
        const btn = $("activityChatBtn");
        if (!btn) return;
        let badge = btn.querySelector(".notification-badge");
        if (unreadCount > 0) {
            if (!badge) {
                badge = document.createElement("span");
                badge.className = "notification-badge";
                btn.appendChild(badge);
            }
            badge.textContent = unreadCount > 99 ? "99+" : String(unreadCount);
            badge.style.display = "flex";
        } else if (badge) {
            badge.style.display = "none";
        }
    }

    function clearNotifications() {
        unreadCount = 0;
        renderBadge();
    }

    function maybeBrowserNotify(username, message) {
        if (!("Notification" in window) || Notification.permission !== "granted") return;
        // Don't notify if the tab is focused and chat is open.
        if (document.hasFocus() && isChatPanelOpen()) return;
        try {
            new Notification(`${username} in room ${currentRoomCode || ""}`.trim(), {
                body: message,
                icon:
                    "data:image/svg+xml," +
                    "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'>" +
                    "<text y='.9em' font-size='90'>💬</text></svg>",
            });
        } catch (_) {
            /* notifications are best-effort */
        }
    }

    // ===================================================================== //
    // WebRTC signaling
    // ===================================================================== //

    function createPeer(remoteSid) {
        const pc = new RTCPeerConnection(rtcConfig);

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit("webrtc-ice-candidate", {
                    candidate: event.candidate,
                    targetSocketId: remoteSid,
                });
            }
        };

        pc.onconnectionstatechange = () => {
            if (pc.connectionState === "connected") {
                addMessage("System", "Voice connection established.", "system");
            } else if (["disconnected", "failed", "closed"].includes(pc.connectionState)) {
                cleanupPeer(remoteSid);
            }
        };

        pc.ontrack = (event) => {
            let audio = document.getElementById(`audio-${remoteSid}`);
            if (!audio) {
                audio = document.createElement("audio");
                audio.id = `audio-${remoteSid}`;
                audio.autoplay = true;
                document.body.appendChild(audio);
            }
            audio.srcObject = event.streams[0];
        };

        peerConnections.set(remoteSid, pc);
        return pc;
    }

    async function startCall(remoteSid) {
        if (!socket || !socket.connected) return;
        const pc = createPeer(remoteSid);
        try {
            const offer = await pc.createOffer({ offerToReceiveAudio: true });
            await pc.setLocalDescription(offer);
            socket.emit("webrtc-offer", { offer, targetSocketId: remoteSid });
        } catch (err) {
            console.error("Failed to start call:", err);
            cleanupPeer(remoteSid);
        }
    }

    async function handleOffer(offer, fromSid) {
        const pc = createPeer(fromSid);
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit("webrtc-answer", { answer, targetSocketId: fromSid });
        } catch (err) {
            console.error("Failed to handle offer:", err);
            cleanupPeer(fromSid);
        }
    }

    async function handleAnswer(answer, fromSid) {
        const pc = peerConnections.get(fromSid);
        if (!pc) return;
        try {
            await pc.setRemoteDescription(new RTCSessionDescription(answer));
        } catch (err) {
            console.error("Failed to handle answer:", err);
        }
    }

    async function handleIce(candidate, fromSid) {
        const pc = peerConnections.get(fromSid);
        if (!pc || !candidate) return;
        try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (err) {
            console.error("Failed to add ICE candidate:", err);
        }
    }

    function cleanupPeer(remoteSid) {
        const pc = peerConnections.get(remoteSid);
        if (pc) {
            pc.close();
            peerConnections.delete(remoteSid);
        }
        const audio = document.getElementById(`audio-${remoteSid}`);
        if (audio) audio.remove();
    }

    function cleanupAllPeers() {
        for (const sid of Array.from(peerConnections.keys())) cleanupPeer(sid);
    }

    // ===================================================================== //
    // Public API + onclick handlers (used by index.html chat panel)
    // ===================================================================== //

    function generateRoomCode() {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
        let code = "";
        for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        return code;
    }

    // Exposed as globals so inline onclick="..." in index.html keeps working.
    window.handleChatCreate = function () {
        const username = ($("chatUsername").value || "").trim();
        if (!username) {
            if (typeof showToast === "function") showToast("Please enter a username", "error");
            return;
        }
        const roomCode = generateRoomCode();
        $("chatRoomCode").value = roomCode;
        authenticate(username, roomCode);
    };

    window.handleChatJoin = function () {
        const username = ($("chatUsername").value || "").trim();
        const roomCode = ($("chatRoomCode").value || "").trim().toUpperCase();
        if (!username) {
            if (typeof showToast === "function") showToast("Please enter a username", "error");
            return;
        }
        if (roomCode.length !== ROOM_CODE_LENGTH) {
            if (typeof showToast === "function")
                showToast(`Room code must be ${ROOM_CODE_LENGTH} characters`, "error");
            return;
        }
        authenticate(username, roomCode);
    };

    window.handleChatSend = function () {
        const input = $("chatMessageInput");
        if (input && sendMessage(input.value)) input.value = "";
    };

    window.handleChatInputKeyPress = function (event) {
        if (event.key === "Enter") {
            event.preventDefault();
            window.handleChatSend();
        }
    };

    window.handleChatLeave = function () {
        if (window.confirm("Leave this room?")) {
            const u = $("chatUsername");
            const r = $("chatRoomCode");
            const m = $("chatMessages");
            if (u) u.value = "";
            if (r) r.value = "";
            if (m) m.innerHTML = "";
            leaveRoom();
        }
    };

    window.copyChatRoomCode = function () {
        const code = $("chatCurrentRoom").textContent;
        if (code && code !== "-") {
            navigator.clipboard
                .writeText(code)
                .then(() => typeof showToast === "function" && showToast("Room code copied!", "success"))
                .catch(() => typeof showToast === "function" && showToast("Copy failed", "error"));
        }
    };

    window.toggleChatUsers = function () {
        const list = $("chatUsersList");
        const toggle = document.querySelector(".chat-section-toggle");
        if (list) list.classList.toggle("collapsed");
        if (toggle) toggle.classList.toggle("collapsed");
    };

    // Structured client used by script.js (switchSidebarTab clears notifications).
    window.socketClient = {
        connect,
        authenticate,
        sendMessage,
        sendCodeChange,
        leaveRoom,
        startCall,
        isConnected: () => connected,
        getCurrentUser: () => ({ username: currentUsername, roomCode: currentRoomCode }),
        getRoomUsers: () => roomUsers,
        clearNotifications,
    };

    // ---- Bootstrap ------------------------------------------------------- //
    document.addEventListener("DOMContentLoaded", () => {
        showAuthForm();
        setStatus("Connecting...", "");
        connect();
        if ("Notification" in window && Notification.permission === "default") {
            Notification.requestPermission();
        }
    });
})();
