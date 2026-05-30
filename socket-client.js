// ==================== SOCKET.IO CLIENT FOR CHAT & WEBRTC ====================
// This file handles Socket.io connection, authentication, chat, and WebRTC signaling

// ==================== SERVER URL CONFIGURATION ====================
// The backend URL is auto-detected:
//   - On localhost/127.0.0.1  -> http://localhost:3000
//   - Anywhere else (deployed) -> value of window.CHAT_SERVER_URL
//
// To point the deployed frontend at your hosted backend, set this ONE line
// in index.html BEFORE socket-client.js loads, e.g.:
//   <script>window.CHAT_SERVER_URL = "https://your-app.onrender.com";</script>
function resolveServerUrl() {
    // Explicit override always wins
    if (typeof window !== 'undefined' && window.CHAT_SERVER_URL) {
        return window.CHAT_SERVER_URL;
    }

    const host = window.location.hostname;
    const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '';

    if (isLocal) {
        return 'http://localhost:3000';
    }

    // Deployed but no override provided. Warn loudly so it's easy to diagnose.
    console.warn(
        '[chat] No window.CHAT_SERVER_URL set. Chat cannot reach a backend on a ' +
        'deployed site. Add <script>window.CHAT_SERVER_URL="https://your-backend"' +
        '</script> before socket-client.js in index.html.'
    );
    return null;
}

const SERVER_URL = resolveServerUrl();

// Socket.io connection
let socket = null;
let isSocketConnected = false;
let currentUsername = null;
let currentRoomCode = null;
let roomUsers = [];
let unreadMessageCount = 0;

// WebRTC connections (peer-to-peer)
const peerConnections = new Map(); // socketId -> RTCPeerConnection
const dataChannels = new Map(); // socketId -> RTCDataChannel

// Configuration for WebRTC
const rtcConfiguration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ]
};

// ==================== SOCKET.IO CONNECTION ====================

function connectToServer(serverUrl = SERVER_URL) {
    if (socket && socket.connected) {
        console.log('Already connected to server');
        return;
    }

    // No backend URL available (deployed without configuration)
    if (!serverUrl) {
        updateConnectionStatus('Chat server not configured for this site', 'disconnected');
        return;
    }

    // Guard: Socket.io client library must be loaded
    if (typeof io === 'undefined') {
        console.error('[chat] Socket.io client library not loaded.');
        updateConnectionStatus('Chat library failed to load', 'disconnected');
        return;
    }

    // Connect to Socket.io server
    socket = io(serverUrl, {
        transports: ['websocket', 'polling'],
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: Infinity,
        timeout: 20000
    });

    // Connection successful
    socket.on('connect', () => {
        console.log('✅ Connected to server:', socket.id);
        isSocketConnected = true;
        updateConnectionStatus('Connected to server', 'connected');
    });

    // Connection error
    socket.on('connect_error', (error) => {
        console.error('❌ Connection error:', error.message || error);
        isSocketConnected = false;
        updateConnectionStatus('Cannot reach chat server. Is the backend running?', 'disconnected');
    });

    // Disconnection
    socket.on('disconnect', (reason) => {
        console.log('⚠️ Disconnected from server:', reason);
        isSocketConnected = false;
        updateConnectionStatus('Disconnected from server', 'disconnected');
        
        // Clean up WebRTC connections
        cleanupAllPeerConnections();
    });

    // Reconnection attempt
    socket.on('reconnect_attempt', (attemptNumber) => {
        console.log(`🔄 Reconnection attempt ${attemptNumber}...`);
        updateConnectionStatus(`Reconnecting... (attempt ${attemptNumber})`, 'connecting');
    });

    // Reconnected
    socket.on('reconnect', () => {
        console.log('✅ Reconnected to server');
        isSocketConnected = true;
        updateConnectionStatus('Reconnected to server', 'connected');
        
        // Re-authenticate if we had a session
        if (currentUsername && currentRoomCode) {
            authenticateUser(currentUsername, currentRoomCode);
        }
    });

    // ==================== AUTHENTICATION EVENTS ====================

    socket.on('authenticated', ({ success, roomCode, username, usersInRoom }) => {
        if (success) {
            console.log(`✅ Authenticated as "${username}" in room "${roomCode}"`);
            currentUsername = username;
            currentRoomCode = roomCode;
            roomUsers = usersInRoom;
            
            updateConnectionStatus(`Connected as ${username}`, 'connected');
            showChatInterface();
            updateRoomUsersList(usersInRoom);

            // Show the active room code in the UI
            const roomEl = document.getElementById('chatCurrentRoom');
            if (roomEl) roomEl.textContent = roomCode;

            // Sync the username field with the (possibly auto-generated) name
            const authUsernameInput = document.getElementById('chatUsername');
            if (authUsernameInput) authUsernameInput.value = username;
            
            // Show system message
            addChatMessage('System', `You joined room ${roomCode}`, 'system');
            
            // Auto-open chat panel if not already open
            const chatPanel = document.getElementById('chatPanel');
            if (chatPanel && !chatPanel.classList.contains('active')) {
                if (typeof switchSidebarTab === 'function') {
                    switchSidebarTab('chat', true);
                }
            }
        }
    });

    socket.on('username-taken', ({ message, originalUsername, suggestions }) => {
        console.warn(`⚠️ Username "${originalUsername}" is already taken`);
        
        // Show suggestions to user
        const suggestionText = suggestions.join(', ');
        const choice = confirm(
            `Username "${originalUsername}" is already taken in this room.\n\n` +
            `Suggested alternatives:\n• ${suggestions.join('\n• ')}\n\n` +
            `Click OK to auto-select "${suggestions[0]}" or Cancel to enter a different name.`
        );
        
        if (choice) {
            // Auto-select first suggestion
            const selectedUsername = suggestions[0];
            console.log(`✅ Auto-selected username: ${selectedUsername}`);
            
            // Update UI if chat form is visible
            const usernameInput = document.getElementById('chatUsername');
            if (usernameInput) {
                usernameInput.value = selectedUsername;
            }
            
            // Retry authentication with new username
            if (currentRoomCode) {
                authenticateUser(selectedUsername, currentRoomCode);
            }
            
            // Show toast notification
            if (typeof showToast === 'function') {
                showToast(`Username changed to ${selectedUsername}`, 'info');
            }
        } else {
            // User wants to enter different name
            const newUsername = prompt(
                `Enter a different username:\n\nSuggestions: ${suggestionText}`,
                suggestions[0]
            );
            
            if (newUsername && newUsername.trim()) {
                const trimmedUsername = newUsername.trim();
                
                // Update UI
                const usernameInput = document.getElementById('chatUsername');
                if (usernameInput) {
                    usernameInput.value = trimmedUsername;
                }
                
                // Retry authentication
                if (currentRoomCode) {
                    authenticateUser(trimmedUsername, currentRoomCode);
                }
            } else {
                updateConnectionStatus('Authentication cancelled', 'error');
            }
        }
    });

    // ==================== CHAT EVENTS ====================

    socket.on('chat-message', ({ username, message, timestamp, socketId }) => {
        addChatMessage(username, message, socketId === socket.id ? 'self' : 'other', timestamp);
    });

    socket.on('user-joined', ({ username, usersInRoom, timestamp }) => {
        addChatMessage('System', `${username} joined the room`, 'system', timestamp);
        updateRoomUsersList(usersInRoom);
    });

    socket.on('user-left', ({ username, usersInRoom, timestamp }) => {
        addChatMessage('System', `${username} left the room`, 'system', timestamp);
        updateRoomUsersList(usersInRoom);
        
        // Clean up WebRTC connection for this user
        const socketIdToRemove = Array.from(peerConnections.keys()).find(id => {
            const user = roomUsers.find(u => u.socketId === id);
            return user && user.username === username;
        });
        
        if (socketIdToRemove) {
            cleanupPeerConnection(socketIdToRemove);
        }
    });

    socket.on('room-users', ({ users }) => {
        roomUsers = users;
        updateRoomUsersList(users);
    });

    // ==================== WEBRTC SIGNALING EVENTS ====================

    socket.on('webrtc-offer', async ({ offer, fromSocketId, fromUsername }) => {
        console.log(`📞 Received WebRTC offer from ${fromUsername}`);
        await handleWebRTCOffer(offer, fromSocketId, fromUsername);
    });

    socket.on('webrtc-answer', async ({ answer, fromSocketId, fromUsername }) => {
        console.log(`📞 Received WebRTC answer from ${fromUsername}`);
        await handleWebRTCAnswer(answer, fromSocketId);
    });

    socket.on('webrtc-ice-candidate', async ({ candidate, fromSocketId }) => {
        console.log(`🧊 Received ICE candidate from ${fromSocketId}`);
        await handleICECandidate(candidate, fromSocketId);
    });

    // ==================== CODE COLLABORATION EVENTS ====================

    socket.on('code-change', ({ fileId, content, fromUsername }) => {
        console.log(`📝 Code change from ${fromUsername} for file ${fileId}`);
        // Update the editor with the new code (integrate with your existing code)
        if (typeof handleRemoteCodeChange === 'function') {
            handleRemoteCodeChange(fileId, content, fromUsername);
        }
    });

    // ==================== ERROR EVENTS ====================

    socket.on('error', ({ message }) => {
        console.error('❌ Server error:', message);
        updateConnectionStatus(message, 'error');
    });
}

// ==================== AUTHENTICATION ====================

function authenticateUser(username, roomCode) {
    if (!socket || !socket.connected) {
        updateConnectionStatus('Not connected to server. Please wait...', 'error');
        return false;
    }

    if (!username || !roomCode) {
        updateConnectionStatus('Username and room code are required', 'error');
        return false;
    }

    // Store room code for potential retry
    currentRoomCode = roomCode;
    
    socket.emit('authenticate', { username, roomCode });
    return true;
}

// ==================== CHAT FUNCTIONS ====================

function sendChatMessage(message) {
    if (!socket || !socket.connected) {
        updateConnectionStatus('Not connected to server', 'error');
        return false;
    }

    if (!currentUsername || !currentRoomCode) {
        updateConnectionStatus('Not authenticated. Please join a room first.', 'error');
        return false;
    }

    if (!message || message.trim() === '') {
        return false;
    }

    socket.emit('chat-message', { message: message.trim() });
    return true;
}

function addChatMessage(username, message, type = 'other', timestamp = null) {
    const chatMessages = document.getElementById('chatMessages');
    if (!chatMessages) return;

    const messageDiv = document.createElement('div');
    messageDiv.className = `chat-message ${type}`;

    const time = timestamp ? new Date(timestamp).toLocaleTimeString() : new Date().toLocaleTimeString();

    if (type === 'system') {
        messageDiv.innerHTML = `
            <div class="message-content system">
                <span class="message-time">${time}</span>
                <span class="message-text">${escapeHtml(message)}</span>
            </div>
        `;
    } else {
        messageDiv.innerHTML = `
            <div class="message-header">
                <span class="message-username">${escapeHtml(username)}</span>
                <span class="message-time">${time}</span>
            </div>
            <div class="message-content">
                <span class="message-text">${escapeHtml(message)}</span>
            </div>
        `;
    }

    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    
    // Update notification badge if chat panel is not active
    const chatPanel = document.getElementById('chatPanel');
    if (chatPanel && !chatPanel.classList.contains('active') && type !== 'self') {
        unreadMessageCount++;
        updateChatNotificationBadge();
        
        // Show browser notification if supported
        if ('Notification' in window && Notification.permission === 'granted') {
            new Notification('New Message', {
                body: `${username}: ${message}`,
                icon: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><text y=".9em" font-size="90">💬</text></svg>'
            });
        }
    }
}

function updateChatNotificationBadge() {
    const chatBtn = document.getElementById('activityChatBtn');
    if (!chatBtn) return;
    
    let badge = chatBtn.querySelector('.notification-badge');
    
    if (unreadMessageCount > 0) {
        if (!badge) {
            badge = document.createElement('span');
            badge.className = 'notification-badge';
            chatBtn.appendChild(badge);
        }
        badge.textContent = unreadMessageCount > 99 ? '99+' : unreadMessageCount;
        badge.style.display = 'flex';
    } else if (badge) {
        badge.style.display = 'none';
    }
}

function clearChatNotifications() {
    unreadMessageCount = 0;
    updateChatNotificationBadge();
}

// ==================== WEBRTC FUNCTIONS ====================

async function initiateWebRTCCall(targetSocketId) {
    if (!socket || !socket.connected) {
        console.error('Not connected to server');
        return;
    }

    try {
        // Create peer connection
        const peerConnection = createPeerConnection(targetSocketId);
        
        // Create data channel for additional communication
        const dataChannel = peerConnection.createDataChannel('collaboration');
        setupDataChannel(dataChannel, targetSocketId);
        
        // Create offer
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        
        // Send offer to peer via Socket.io
        socket.emit('webrtc-offer', {
            offer: offer,
            targetSocketId: targetSocketId
        });
        
        console.log(`📞 Sent WebRTC offer to ${targetSocketId}`);
    } catch (error) {
        console.error('Error initiating WebRTC call:', error);
    }
}

async function handleWebRTCOffer(offer, fromSocketId, fromUsername) {
    try {
        // Create peer connection
        const peerConnection = createPeerConnection(fromSocketId);
        
        // Set remote description
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        
        // Create answer
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        
        // Send answer back via Socket.io
        socket.emit('webrtc-answer', {
            answer: answer,
            targetSocketId: fromSocketId
        });
        
        console.log(`📞 Sent WebRTC answer to ${fromUsername}`);
    } catch (error) {
        console.error('Error handling WebRTC offer:', error);
    }
}

async function handleWebRTCAnswer(answer, fromSocketId) {
    try {
        const peerConnection = peerConnections.get(fromSocketId);
        if (!peerConnection) {
            console.error('No peer connection found for', fromSocketId);
            return;
        }
        
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        console.log(`✅ WebRTC connection established with ${fromSocketId}`);
    } catch (error) {
        console.error('Error handling WebRTC answer:', error);
    }
}

async function handleICECandidate(candidate, fromSocketId) {
    try {
        const peerConnection = peerConnections.get(fromSocketId);
        if (!peerConnection) {
            console.error('No peer connection found for', fromSocketId);
            return;
        }
        
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch (error) {
        console.error('Error handling ICE candidate:', error);
    }
}

function createPeerConnection(socketId) {
    // Create new RTCPeerConnection
    const peerConnection = new RTCPeerConnection(rtcConfiguration);
    
    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
            socket.emit('webrtc-ice-candidate', {
                candidate: event.candidate,
                targetSocketId: socketId
            });
        }
    };
    
    // Handle connection state changes
    peerConnection.onconnectionstatechange = () => {
        console.log(`WebRTC connection state with ${socketId}:`, peerConnection.connectionState);
        
        if (peerConnection.connectionState === 'connected') {
            addChatMessage('System', `Voice call connected`, 'system');
        } else if (peerConnection.connectionState === 'disconnected' || 
                   peerConnection.connectionState === 'failed') {
            addChatMessage('System', `Voice call disconnected`, 'system');
            cleanupPeerConnection(socketId);
        }
    };
    
    // Handle data channel (for receiving)
    peerConnection.ondatachannel = (event) => {
        setupDataChannel(event.channel, socketId);
    };
    
    // Store peer connection
    peerConnections.set(socketId, peerConnection);
    
    return peerConnection;
}

function setupDataChannel(dataChannel, socketId) {
    dataChannel.onopen = () => {
        console.log(`Data channel opened with ${socketId}`);
    };
    
    dataChannel.onmessage = (event) => {
        console.log(`Data channel message from ${socketId}:`, event.data);
        // Handle data channel messages (e.g., for code sync)
    };
    
    dataChannel.onclose = () => {
        console.log(`Data channel closed with ${socketId}`);
    };
    
    dataChannels.set(socketId, dataChannel);
}

function cleanupPeerConnection(socketId) {
    const peerConnection = peerConnections.get(socketId);
    if (peerConnection) {
        peerConnection.close();
        peerConnections.delete(socketId);
    }
    
    const dataChannel = dataChannels.get(socketId);
    if (dataChannel) {
        dataChannel.close();
        dataChannels.delete(socketId);
    }
}

function cleanupAllPeerConnections() {
    peerConnections.forEach((pc, socketId) => {
        cleanupPeerConnection(socketId);
    });
}

// ==================== CODE COLLABORATION ====================

function sendCodeChange(fileId, content) {
    if (!socket || !socket.connected) {
        return;
    }
    
    socket.emit('code-change', { fileId, content });
}

// ==================== UI HELPER FUNCTIONS ====================
// NOTE: updateConnectionStatus(), showChatInterface(), updateRoomUsersList(),
// and showChatAuthForm() live in script.js because they reference the actual
// chat panel element IDs in index.html. We rely on those here to avoid having
// two conflicting versions fighting over the DOM.

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ==================== DISCONNECT ====================

function disconnectFromRoom() {
    if (socket && socket.connected) {
        socket.disconnect();
    }
    
    cleanupAllPeerConnections();
    
    currentUsername = null;
    currentRoomCode = null;
    roomUsers = [];
    
    // Return to the auth form (defined in script.js)
    if (typeof showChatAuthForm === 'function') {
        showChatAuthForm();
    }
    updateConnectionStatus('Disconnected', 'disconnected');
}

// ==================== EXPORT FUNCTIONS ====================
// Make functions available globally
window.socketClient = {
    connect: connectToServer,
    authenticate: authenticateUser,
    sendMessage: sendChatMessage,
    sendCodeChange: sendCodeChange,
    disconnect: disconnectFromRoom,
    initiateCall: initiateWebRTCCall,
    isConnected: () => isSocketConnected,
    getCurrentUser: () => ({ username: currentUsername, roomCode: currentRoomCode }),
    getRoomUsers: () => roomUsers,
    clearNotifications: clearChatNotifications
};

// Auto-connect to server on page load
document.addEventListener('DOMContentLoaded', () => {
    connectToServer(SERVER_URL);
    
    // Request notification permission
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
});
