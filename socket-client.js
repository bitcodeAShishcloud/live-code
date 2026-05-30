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

    // ---- State ----------------------------------------------------------- //
    let socket = null;
    let connected = false;
    let currentUsername = null;
    let currentRoomCode = null;
    let roomUsers = [];
    let unreadCount = 0;

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
            setStatus("Connected. Enter a name and room to start.", "connected");
            // Re-join automatically after a reconnect.
            if (currentUsername && currentRoomCode) {
                socket.emit("authenticate", {
                    username: currentUsername,
                    roomCode: currentRoomCode,
                });
            }
        });

        socket.on("connect_error", () => {
            connected = false;
            setStatus("Cannot reach server. Is the backend running?", "disconnected");
        });

        socket.on("disconnect", () => {
            connected = false;
            setStatus("Disconnected from server.", "disconnected");
            cleanupAllPeers();
        });

        // ---- Auth & presence --------------------------------------------- //
        socket.on("authenticated", ({ roomCode, username, usersInRoom }) => {
            currentUsername = username;
            currentRoomCode = roomCode;
            roomUsers = usersInRoom || [];

            showChatInterface();
            const roomEl = $("chatCurrentRoom");
            if (roomEl) roomEl.textContent = roomCode;
            renderUsers(roomUsers);
            addMessage("System", `You joined room ${roomCode}`, "system");

            // Make sure the chat panel is visible to the user.
            if (!isChatPanelOpen() && typeof switchSidebarTab === "function") {
                switchSidebarTab("chat", true);
            }
        });

        socket.on("username-taken", ({ originalUsername, suggestions }) => {
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
            setStatus("Not connected yet. Please wait a moment.", "disconnected");
            return false;
        }
        if (!username || !roomCode) {
            setStatus("Username and room code are required.", "disconnected");
            return false;
        }
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
        if (socket && socket.connected) {
            // Disconnect then reconnect so the socket is fresh for the next room.
            socket.disconnect();
            setTimeout(connect, 300);
        }
        currentUsername = null;
        currentRoomCode = null;
        roomUsers = [];
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

    function addMessage(username, message, type, timestamp) {
        const box = $("chatMessages");
        if (!box) return;

        const time = timestamp
            ? new Date(timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
            : new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

        const wrap = document.createElement("div");
        wrap.className = `chat-message ${type}`;

        if (type === "system") {
            wrap.innerHTML = `
                <div class="message-content">
                    <span class="message-text">${escapeHtml(message)}</span>
                </div>`;
        } else if (type === "self") {
            // Own messages: no need to repeat your own name, just the time.
            wrap.innerHTML = `
                <div class="message-header">
                    <span class="message-time">${time}</span>
                </div>
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

        // Notify only for messages from others while the panel is closed.
        if (type === "other" && !isChatPanelOpen()) {
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
