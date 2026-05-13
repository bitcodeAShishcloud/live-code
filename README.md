# Live Compiler Pro 🚀

A powerful live code editor with real-time collaboration and integrated chat.

## Features ✨

### Code Editor
- 🎨 Multi-language support (HTML, CSS, JavaScript, Python, JSON, Markdown)
- 🔄 Live preview with auto-refresh
- 💻 CodeMirror 6 integration
- 🎯 Syntax highlighting
- 📝 Code formatting (Prettier)
- 🌓 Dark/Light theme

### Live Collaboration
- 👥 Real-time code sharing via WebRTC (P2P)
- 🔒 Room-based isolation with 12-character codes
- 🔄 Automatic synchronization
- 💬 **Integrated chat** - automatically connects when joining collaboration

### Chat System
- 💬 Real-time messaging via Socket.io
- 🔔 Notification badges for new messages
- 👤 Username uniqueness with smart suggestions
- 🔒 Room isolation - messages never cross rooms
- 📱 Browser notifications support
- 👥 Online user list
- ⚡ Auto-connects with collaboration rooms

### Additional Features
- 📦 Import/Export files
- 🗂️ Multiple file management
- 📱 Responsive design
- 🎨 Code snippets library
- 🔍 Console with JavaScript execution

## Quick Start 🚀

### 1. Install Dependencies
```bash
npm install
```

### 2. Start Backend Server
```bash
node server.js
```

You should see:
```
============================================================
🚀 Server running on http://localhost:3000
📡 Socket.io server ready for connections
🔒 Room isolation enabled
💬 Chat and WebRTC signaling active
============================================================
```

### 3. Open Application
Open `index.html` in your browser or deploy to your hosting platform.

## How to Use Chat 💬

### Method 1: Via Live Collaboration (Recommended)

1. Click **"Collab"** button in header
2. Click **"Create New Room"** or **"Join Room"**
3. Enter your **username** when prompted
4. ✅ Chat connects automatically!
5. ✅ Chat panel opens automatically!
6. Start coding and chatting together!

### Method 2: Via Chat Panel Directly

1. Click **chat icon (💬)** in left activity bar
2. Enter your **username**
3. Enter **room code** (or click "Create" to generate one)
4. Click **"Join"** or **"Create"**
5. Start chatting!

## Username Uniqueness 👤

The system enforces unique usernames per room:

- If you try to use a taken username, you'll get **3 smart suggestions**
- Examples: `Alice2`, `SwiftAlice`, `AlicePro`
- One-click to auto-select or enter a custom name
- Case-insensitive matching (Alice = alice = ALICE)

## Room Isolation 🔒

- Each room has a unique **12-character code**
- Messages and code sync are **completely isolated**
- Same username can exist in different rooms
- Rooms exist as long as the host is connected

## Project Structure 📁

```
├── index.html              # Main application
├── styles.css              # All styles (including chat)
├── script.js               # Main app logic + chat helpers
├── server.js               # Backend server (Socket.io)
├── socket-client.js        # Chat client integration
├── package.json            # Dependencies
├── .env.example            # Environment variables template
├── .gitignore              # Git ignore rules
└── README.md               # This file
```

## Configuration ⚙️

### Backend Server URL
Default: `http://localhost:3000`

To change for production:
1. Edit `socket-client.js`
2. Update `SERVER_URL` constant
3. Deploy backend to your server

### Port Configuration
Default: `3000`

To change:
```bash
# Via environment variable
PORT=8080 node server.js

# Or edit server.js
const PORT = process.env.PORT || 3000;
```

## API Endpoints 🔌

### Health Check
```
GET /health
```
Returns server status and active room/user counts.

### Room Info (Debug)
```
GET /api/rooms
```
Returns list of active rooms with user counts.

## Technologies Used 🛠️

### Frontend
- HTML5, CSS3, JavaScript (ES6+)
- CodeMirror 6 (code editor)
- Socket.io Client (chat)
- PeerJS (WebRTC for code sharing)
- Font Awesome (icons)

### Backend
- Node.js
- Express
- Socket.io (real-time chat)
- CORS enabled

## Browser Support 🌐

- ✅ Chrome/Edge (recommended)
- ✅ Firefox
- ✅ Safari
- ✅ Opera

## Deployment 🚀

### Frontend (Vercel/Netlify)
1. Deploy `index.html` and assets
2. Update `SERVER_URL` in `socket-client.js`

### Backend (Heroku/Railway/Render)
1. Deploy `server.js` with `package.json`
2. Set `PORT` environment variable
3. Enable WebSocket support
4. Update CORS settings if needed

## Troubleshooting 🐛

### "Failed to connect to server"
**Solution:** Make sure backend is running (`node server.js`)

### "Username already taken"
**Solution:** Select one of the suggested alternatives or enter a different name

### Chat not visible
**Solution:** Click chat icon (💬) in left activity bar

### Messages not appearing
**Solution:** Verify both users are in the same room (check user list)

### Room code not working
**Solution:** Ensure code is exactly 12 characters and host is still connected

## Security 🔒

- ✅ HTML escaping prevents XSS attacks
- ✅ Input validation on server and client
- ✅ Room codes are hard to guess (62^12 combinations)
- ✅ No message persistence (in-memory only)
- ✅ CORS configured for production

## Performance 📊

- Handles 100+ concurrent users
- Room-based architecture scales well
- Efficient Map data structures
- WebRTC for P2P code sharing (no server load)
- Socket.io for reliable chat delivery

## Contributing 🤝

This is a personal project, but suggestions are welcome!

## License 📄

Built with ❤️ by Ashish Gupta

## Links 🔗

- Portfolio: [https://bitcodeashishcloud.github.io/Ashish-Gupta/](https://bitcodeashishcloud.github.io/Ashish-Gupta/)
- GitHub: [https://github.com/bitcodeAShishcloud](https://github.com/bitcodeAShishcloud)
- LinkedIn: [https://www.linkedin.com/in/ashish-gupta-037973259/](https://www.linkedin.com/in/ashish-gupta-037973259/)

---

**Need help?** Check `START_HERE.txt` for detailed setup instructions.

**Happy coding!** 🚀
