// ==================== BACKEND SERVER ====================
// Node.js + Express + Socket.io Server
// Handles room-isolated chat and WebRTC signaling

const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

// Configure Socket.io with CORS
const io = socketIO(server, {
    cors: {
        origin: "*", // In production, specify your Vercel domain
        methods: ["GET", "POST"]
    }
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Store active rooms and users
const rooms = new Map(); // roomCode -> Set of socket IDs
const users = new Map(); // socket.id -> { username, roomCode }

// ==================== USERNAME GENERATION ====================
function generateUsernameVariations(originalUsername, existingUsers) {
    const suggestions = [];
    const existingUsernames = existingUsers.map(u => u.username.toLowerCase());
    
    // Cool adjectives for username generation
    const adjectives = [
        'Swift', 'Bright', 'Quick', 'Smart', 'Cool', 'Pro', 'Elite', 'Super',
        'Mega', 'Ultra', 'Prime', 'Alpha', 'Beta', 'Gamma', 'Delta', 'Omega',
        'Turbo', 'Hyper', 'Cyber', 'Digital', 'Quantum', 'Cosmic', 'Stellar',
        'Epic', 'Legendary', 'Master', 'Expert', 'Ninja', 'Wizard', 'Guru'
    ];
    
    // Try numbered variations first (Alice2, Alice3, etc.)
    for (let i = 2; i <= 5; i++) {
        const variation = `${originalUsername}${i}`;
        if (!existingUsernames.includes(variation.toLowerCase())) {
            suggestions.push(variation);
            if (suggestions.length >= 3) break;
        }
    }
    
    // If we need more suggestions, add adjective + original name
    if (suggestions.length < 3) {
        const shuffled = adjectives.sort(() => Math.random() - 0.5);
        for (const adj of shuffled) {
            const variation = `${adj}${originalUsername}`;
            if (!existingUsernames.includes(variation.toLowerCase()) && 
                !suggestions.includes(variation)) {
                suggestions.push(variation);
                if (suggestions.length >= 3) break;
            }
        }
    }
    
    // If still need more, try original + adjective
    if (suggestions.length < 3) {
        const shuffled = adjectives.sort(() => Math.random() - 0.5);
        for (const adj of shuffled) {
            const variation = `${originalUsername}${adj}`;
            if (!existingUsernames.includes(variation.toLowerCase()) && 
                !suggestions.includes(variation)) {
                suggestions.push(variation);
                if (suggestions.length >= 3) break;
            }
        }
    }
    
    // If still need more, add random numbers
    while (suggestions.length < 3) {
        const randomNum = Math.floor(Math.random() * 9000) + 1000; // 4-digit number
        const variation = `${originalUsername}${randomNum}`;
        if (!existingUsernames.includes(variation.toLowerCase()) && 
            !suggestions.includes(variation)) {
            suggestions.push(variation);
        }
    }
    
    return suggestions.slice(0, 3); // Return top 3 suggestions
}

// ==================== SOCKET.IO CONNECTION ====================
io.on('connection', (socket) => {
    console.log(`[${new Date().toISOString()}] New connection: ${socket.id}`);

    // ==================== USER AUTHENTICATION ====================
    socket.on('authenticate', ({ username, roomCode }) => {
        if (!username || !roomCode) {
            socket.emit('error', { message: 'Username and room code are required' });
            return;
        }

        // Validate room code format (12 characters)
        if (roomCode.length !== 12) {
            socket.emit('error', { message: 'Room code must be 12 characters' });
            return;
        }

        // Check if username is already taken in this room
        if (rooms.has(roomCode)) {
            const existingUsers = Array.from(rooms.get(roomCode))
                .map(id => users.get(id))
                .filter(Boolean);
            
            const usernameTaken = existingUsers.some(user => 
                user.username.toLowerCase() === username.toLowerCase()
            );
            
            if (usernameTaken) {
                // Generate unique username suggestions
                const suggestions = generateUsernameVariations(username, existingUsers);
                socket.emit('username-taken', { 
                    message: 'Username already taken in this room',
                    originalUsername: username,
                    suggestions: suggestions
                });
                return;
            }
        }

        // Store user info
        users.set(socket.id, { username, roomCode });

        // Join the Socket.io room
        socket.join(roomCode);

        // Add to room tracking
        if (!rooms.has(roomCode)) {
            rooms.set(roomCode, new Set());
        }
        rooms.get(roomCode).add(socket.id);

        // Get all users in this room
        const roomUsers = Array.from(rooms.get(roomCode))
            .map(id => users.get(id))
            .filter(Boolean);

        console.log(`[${new Date().toISOString()}] User "${username}" joined room "${roomCode}"`);

        // Notify the user they've joined successfully
        socket.emit('authenticated', {
            success: true,
            roomCode,
            username,
            usersInRoom: roomUsers
        });

        // Notify others in the room
        socket.to(roomCode).emit('user-joined', {
            username,
            usersInRoom: roomUsers,
            timestamp: new Date().toISOString()
        });

        // Send room user list to everyone
        io.to(roomCode).emit('room-users', { users: roomUsers });
    });

    // ==================== CHAT MESSAGING ====================
    socket.on('chat-message', ({ message }) => {
        const user = users.get(socket.id);
        
        if (!user) {
            socket.emit('error', { message: 'Not authenticated. Please set username and join a room.' });
            return;
        }

        if (!message || message.trim() === '') {
            return;
        }

        const chatData = {
            username: user.username,
            message: message.trim(),
            timestamp: new Date().toISOString(),
            socketId: socket.id
        };

        console.log(`[${new Date().toISOString()}] Chat in room "${user.roomCode}" from "${user.username}": ${message}`);

        // Broadcast to everyone in the room (including sender)
        io.to(user.roomCode).emit('chat-message', chatData);
    });

    // ==================== WEBRTC SIGNALING ====================
    
    // WebRTC Offer
    socket.on('webrtc-offer', ({ offer, targetSocketId }) => {
        const user = users.get(socket.id);
        
        if (!user) {
            socket.emit('error', { message: 'Not authenticated' });
            return;
        }

        console.log(`[${new Date().toISOString()}] WebRTC offer from ${user.username} to ${targetSocketId}`);

        // Send offer to specific peer in the same room
        socket.to(targetSocketId).emit('webrtc-offer', {
            offer,
            fromSocketId: socket.id,
            fromUsername: user.username
        });
    });

    // WebRTC Answer
    socket.on('webrtc-answer', ({ answer, targetSocketId }) => {
        const user = users.get(socket.id);
        
        if (!user) {
            socket.emit('error', { message: 'Not authenticated' });
            return;
        }

        console.log(`[${new Date().toISOString()}] WebRTC answer from ${user.username} to ${targetSocketId}`);

        // Send answer to specific peer
        socket.to(targetSocketId).emit('webrtc-answer', {
            answer,
            fromSocketId: socket.id,
            fromUsername: user.username
        });
    });

    // ICE Candidate
    socket.on('webrtc-ice-candidate', ({ candidate, targetSocketId }) => {
        const user = users.get(socket.id);
        
        if (!user) {
            socket.emit('error', { message: 'Not authenticated' });
            return;
        }

        console.log(`[${new Date().toISOString()}] ICE candidate from ${user.username} to ${targetSocketId}`);

        // Send ICE candidate to specific peer
        socket.to(targetSocketId).emit('webrtc-ice-candidate', {
            candidate,
            fromSocketId: socket.id
        });
    });

    // ==================== CODE COLLABORATION ====================
    socket.on('code-change', ({ fileId, content }) => {
        const user = users.get(socket.id);
        
        if (!user) {
            return;
        }

        // Broadcast code changes to others in the room (not to sender)
        socket.to(user.roomCode).emit('code-change', {
            fileId,
            content,
            fromUsername: user.username
        });
    });

    // ==================== DISCONNECTION ====================
    socket.on('disconnect', () => {
        const user = users.get(socket.id);
        
        if (user) {
            const { username, roomCode } = user;
            
            console.log(`[${new Date().toISOString()}] User "${username}" disconnected from room "${roomCode}"`);

            // Remove from room tracking
            if (rooms.has(roomCode)) {
                rooms.get(roomCode).delete(socket.id);
                
                // If room is empty, delete it
                if (rooms.get(roomCode).size === 0) {
                    rooms.delete(roomCode);
                    console.log(`[${new Date().toISOString()}] Room "${roomCode}" is now empty and removed`);
                } else {
                    // Get updated user list
                    const roomUsers = Array.from(rooms.get(roomCode))
                        .map(id => users.get(id))
                        .filter(Boolean);

                    // Notify others in the room
                    socket.to(roomCode).emit('user-left', {
                        username,
                        usersInRoom: roomUsers,
                        timestamp: new Date().toISOString()
                    });

                    // Update room user list
                    io.to(roomCode).emit('room-users', { users: roomUsers });
                }
            }

            // Remove user
            users.delete(socket.id);
        }

        console.log(`[${new Date().toISOString()}] Connection closed: ${socket.id}`);
    });

    // ==================== ERROR HANDLING ====================
    socket.on('error', (error) => {
        console.error(`[${new Date().toISOString()}] Socket error for ${socket.id}:`, error);
    });
});

// ==================== HTTP ROUTES ====================
app.get('/', (_req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Health check endpoint
app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        activeRooms: rooms.size,
        activeUsers: users.size,
        timestamp: new Date().toISOString()
    });
});

// Get room info (for debugging)
app.get('/api/rooms', (_req, res) => {
    const roomInfo = Array.from(rooms.entries()).map(([roomCode, socketIds]) => ({
        roomCode,
        userCount: socketIds.size,
        users: Array.from(socketIds).map(id => users.get(id)?.username).filter(Boolean)
    }));
    
    res.json({ rooms: roomInfo });
});

// ==================== SERVER START ====================
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📡 Socket.io server ready for connections`);
    console.log(`🔒 Room isolation enabled`);
    console.log(`💬 Chat and WebRTC signaling active`);
    console.log('='.repeat(60));
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM signal received: closing HTTP server');
    server.close(() => {
        console.log('HTTP server closed');
    });
});
