
server_code = '''const WebSocket = require('ws');
const http = require('http');
const fs = require('fs');
const path = require('path');

// ==================== CONFIG ====================
const PORT = process.env.PORT || 3000;
const TICK_RATE = 20; // 20Hz server tick
const BALL_SYNC_RATE = 10; // 10Hz ball sync

// ==================== STATE ====================
const rooms = new Map(); // roomCode -> Room
const clients = new Map(); // ws -> { playerId, roomCode }

class Room {
  constructor(code, hostId) {
    this.code = code;
    this.hostId = hostId;
    this.guestId = null;
    this.hostTeam = 0; // host is always home (0)
    this.guestTeam = 1; // guest is always away (1)
    this.teams = [null, null];
    this.formations = ['433', '433'];
    this.duration = 3;
    this.hostReady = false;
    this.guestReady = false;
    this.gameState = 'lobby'; // lobby, playing, ended
    this.ball = { x: 0.5, y: 0.5, vx: 0, vy: 0, z: 0, vz: 0 };
    this.score = [0, 0];
    this.matchTime = 0;
    this.lastTick = Date.now();
    this.tickInterval = null;
    this.inputs = {};
  }

  addGuest(guestId) {
    this.guestId = guestId;
    this.broadcast({ type: 'player_joined', playerId: guestId });
  }

  setTeam(playerId, teamIndex) {
    if (playerId === this.hostId) {
      this.teams[0] = teamIndex;
      this.broadcast({ type: 'opponent_team', teamIndex, from: 'host' });
    } else {
      this.teams[1] = teamIndex;
      this.broadcast({ type: 'opponent_team', teamIndex, from: 'guest' });
    }
  }

  setReady(playerId) {
    if (playerId === this.hostId) this.hostReady = true;
    else this.guestReady = true;
    this.broadcast({ type: 'opponent_ready', playerId });
  }

  startMatch() {
    if (!this.hostReady || !this.guestReady) return false;
    this.gameState = 'playing';
    this.matchTime = 0;
    this.score = [0, 0];
    this.broadcast({
      type: 'match_start',
      teams: this.teams,
      formations: this.formations,
      duration: this.duration
    });
    this.startGameLoop();
    return true;
  }

  startGameLoop() {
    if (this.tickInterval) clearInterval(this.tickInterval);
    this.tickInterval = setInterval(() => {
      this.gameTick();
    }, 1000 / TICK_RATE);
  }

  gameTick() {
    if (this.gameState !== 'playing') return;
    
    const now = Date.now();
    const dt = (now - this.lastTick) / 1000;
    this.lastTick = now;
    this.matchTime += dt;
    
    // Simple ball physics on server for authority
    this.ball.x += this.ball.vx * dt;
    this.ball.y += this.ball.vy * dt;
    this.ball.z += this.ball.vz * dt;
    this.ball.vz -= 15 * dt;
    if (this.ball.z <= 0) { this.ball.z = 0; this.ball.vz *= -0.5; }
    this.ball.vx *= 0.98;
    this.ball.vy *= 0.98;
    
    // Boundaries
    if (this.ball.x < 0 || this.ball.x > 1) {
      this.ball.vx *= -0.8;
      this.ball.x = Math.max(0.01, Math.min(0.99, this.ball.x));
    }
    if (this.ball.y < 0 || this.ball.y > 1) {
      if (!(this.ball.x > 0.42 && this.ball.x < 0.58)) {
        this.ball.vy *= -0.8;
        this.ball.y = Math.max(0.01, Math.min(0.99, this.ball.y));
      }
    }
    
    // Goal detection (server authority)
    if (this.ball.x > 0.42 && this.ball.x < 0.58) {
      if (this.ball.y <= 0.03) {
        this.score[0]++;
        this.broadcast({ type: 'goal', scoringTeam: 0 });
        this.resetBall(1);
      } else if (this.ball.y >= 0.97) {
        this.score[1]++;
        this.broadcast({ type: 'goal', scoringTeam: 1 });
        this.resetBall(0);
      }
    }
    
    // Match end
    if (this.matchTime >= this.duration * 60) {
      this.gameState = 'ended';
      this.broadcast({ type: 'match_end' });
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
    
    // Ball sync to clients
    this.broadcast({
      type: 'ball_sync',
      ball: { x: this.ball.x, y: this.ball.y, vx: this.ball.vx, vy: this.ball.vy, z: this.ball.z }
    });
  }

  resetBall(team) {
    this.ball = { x: 0.5, y: team === 0 ? 0.55 : 0.45, vx: 0, vy: 0, z: 0, vz: 0 };
  }

  handleInput(playerId, data) {
    // Relay input to other player
    const otherId = playerId === this.hostId ? this.guestId : this.hostId;
    const otherWs = findClientById(otherId);
    if (otherWs && otherWs.readyState === WebSocket.OPEN) {
      otherWs.send(JSON.stringify({ type: 'input', playerId, data }));
    }
  }

  broadcast(msg) {
    [this.hostId, this.guestId].forEach(pid => {
      if (!pid) return;
      const client = findClientById(pid);
      if (client && client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(msg));
      }
    });
  }

  removePlayer(playerId) {
    if (this.hostId === playerId) this.hostId = null;
    if (this.guestId === playerId) this.guestId = null;
    this.broadcast({ type: 'player_left', playerId });
    if (this.tickInterval) {
      clearInterval(this.tickInterval);
      this.tickInterval = null;
    }
  }

  isEmpty() {
    return !this.hostId && !this.guestId;
  }
}

function findClientById(playerId) {
  for (const [ws, info] of clients) {
    if (info.playerId === playerId) return ws;
  }
  return null;
}

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  if (rooms.has(code)) return generateRoomCode();
  return code;
}

function generatePlayerId() {
  return 'p_' + Math.random().toString(36).substr(2, 9);
}

// ==================== HTTP SERVER ====================
const server = http.createServer((req, res) => {
  // Serve the game client
  if (req.url === '/' || req.url === '/index.html') {
    const filePath = path.join(__dirname, 'efootball_online.html');
    if (fs.existsSync(filePath)) {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(fs.readFileSync(filePath));
    } else {
      res.writeHead(404);
      res.end('Game client not found. Place efootball_online.html in the same folder.');
    }
  } else {
    res.writeHead(404);
    res.end('Not found');
  }
});

// ==================== WEBSOCKET SERVER ====================
const wss = new WebSocket.Server({ server });

wss.on('connection', (ws) => {
  const playerId = generatePlayerId();
  clients.set(ws, { playerId, roomCode: null });
  
  console.log(`Player connected: ${playerId}`);

  ws.on('message', (message) => {
    try {
      const msg = JSON.parse(message);
      handleMessage(ws, playerId, msg);
    } catch (e) {
      console.error('Invalid message:', e);
    }
  });

  ws.on('close', () => {
    const info = clients.get(ws);
    if (info && info.roomCode) {
      const room = rooms.get(info.roomCode);
      if (room) {
        room.removePlayer(playerId);
        if (room.isEmpty()) {
          rooms.delete(info.roomCode);
          console.log(`Room ${info.roomCode} deleted`);
        }
      }
    }
    clients.delete(ws);
    console.log(`Player disconnected: ${playerId}`);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err);
  });
});

function handleMessage(ws, playerId, msg) {
  switch (msg.type) {
    case 'create_room': {
      const code = generateRoomCode();
      const room = new Room(code, playerId);
      rooms.set(code, room);
      clients.get(ws).roomCode = code;
      ws.send(JSON.stringify({ type: 'room_created', roomCode: code, playerId }));
      console.log(`Room created: ${code} by ${playerId}`);
      break;
    }

    case 'join_room': {
      const room = rooms.get(msg.roomCode);
      if (!room) {
        ws.send(JSON.stringify({ type: 'error', message: 'Room not found' }));
        return;
      }
      if (room.guestId) {
        ws.send(JSON.stringify({ type: 'error', message: 'Room is full' }));
        return;
      }
      room.addGuest(playerId);
      clients.get(ws).roomCode = msg.roomCode;
      ws.send(JSON.stringify({ type: 'joined_room', roomCode: msg.roomCode, playerId }));
      console.log(`Player ${playerId} joined room ${msg.roomCode}`);
      break;
    }

    case 'select_team': {
      const info = clients.get(ws);
      const room = rooms.get(info.roomCode);
      if (room) room.setTeam(playerId, msg.teamIndex);
      break;
    }

    case 'ready': {
      const info = clients.get(ws);
      const room = rooms.get(info.roomCode);
      if (room) {
        room.setReady(playerId);
        // Auto-start if both ready
        if (room.hostReady && room.guestReady) {
          room.startMatch();
        }
      }
      break;
    }

    case 'start_match': {
      const info = clients.get(ws);
      const room = rooms.get(info.roomCode);
      if (room && room.hostId === playerId) {
        room.teams = msg.teams;
        room.formations = msg.formations;
        room.duration = msg.duration;
        room.startMatch();
      }
      break;
    }

    case 'input': {
      const info = clients.get(ws);
      const room = rooms.get(info.roomCode);
      if (room && room.gameState === 'playing') {
        room.handleInput(playerId, msg.data);
      }
      break;
    }

    case 'goal': {
      const info = clients.get(ws);
      const room = rooms.get(info.roomCode);
      if (room && room.gameState === 'playing') {
        // Validate goal on server side
        if (msg.scoringTeam === 0 || msg.scoringTeam === 1) {
          room.score[msg.scoringTeam]++;
          room.broadcast({ type: 'goal', scoringTeam: msg.scoringTeam });
          room.resetBall(1 - msg.scoringTeam);
        }
      }
      break;
    }

    case 'ping': {
      ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      break;
    }
  }
}

// ==================== START ====================
server.listen(PORT, () => {
  console.log(`
========================================
  eFootball Pro Server
========================================
  HTTP:  http://localhost:${PORT}
  WS:    ws://localhost:${PORT}

  Place 'efootball_online.html' in this
  folder to serve the game client.

  Players connect via WiFi/Hotspot using
  the server IP address.

  To find your IP, run: ipconfig (Win)
  or: ifconfig / ip addr (Mac/Linux)
========================================
  `);
});
'''

with open('/mnt/agents/output/server.js', 'w', encoding='utf-8') as f:
    f.write(server_code)

print(f"Server saved: {len(server_code)} chars")
