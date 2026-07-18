
# Create game.js - the full game engine
game_js = '''// ===================== eFOOTBALL ULTIMATE SOCCER =====================
// Full multiplayer game engine with WebSocket support

const TEAMS = [
  { id: 'bra', name: 'Brazil', flag: '🇧🇷', color: '#ffcc00', darkColor: '#009c3b' },
  { id: 'arg', name: 'Argentina', flag: '🇦🇷', color: '#75aadb', darkColor: '#ffffff' },
  { id: 'fra', name: 'France', flag: '🇫🇷', color: '#0055a4', darkColor: '#ef4135' },
  { id: 'ger', name: 'Germany', flag: '🇩🇪', color: '#ffce00', darkColor: '#000000' },
  { id: 'esp', name: 'Spain', flag: '🇪🇸', color: '#aa151b', darkColor: '#f1bf00' },
  { id: 'eng', name: 'England', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', color: '#ffffff', darkColor: '#cf081f' },
  { id: 'por', name: 'Portugal', flag: '🇵🇹', color: '#006600', darkColor: '#ff0000' },
  { id: 'ita', name: 'Italy', flag: '🇮🇹', color: '#009246', darkColor: '#ce2b37' },
  { id: 'ned', name: 'Netherlands', flag: '🇳🇱', color: '#ff4f00', darkColor: '#21468b' },
];

let gameState = {
  screen: 'main-menu',
  myTeam: null,
  opponentTeam: null,
  isHost: false,
  lobbyCode: null,
  ws: null,
  playerId: null,
  opponentId: null,
  matchStarted: false,
  myScore: 0,
  opponentScore: 0,
  timeRemaining: 300,
  period: 1,
  stamina: 100,
  keys: {},
  ball: { x: 400, y: 300, vx: 0, vy: 0, z: 0, vz: 0 },
  players: {},
  myPlayer: { x: 200, y: 300, vx: 0, vy: 0, team: 'home', hasBall: false },
  opponentPlayer: { x: 600, y: 300, vx: 0, vy: 0, team: 'away', hasBall: false },
  aiPlayers: [],
  goalScored: false,
  matchEnded: false,
  lastUpdate: 0,
  canvas: null,
  ctx: null,
  animationId: null,
  timerInterval: null,
  touchControls: { up: false, down: false, left: false, right: false, shoot: false, pass: false, sprint: false },
  particles: [],
  cameraShake: 0
};

// ===================== SCREEN NAVIGATION =====================

function showScreen(screenId) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(screenId).classList.add('active');
  gameState.screen = screenId;
  
  if (screenId === 'host-screen') renderTeamSelect('host-teams');
  if (screenId === 'join-screen') renderTeamSelect('join-teams');
  if (screenId === 'game-screen') initGameCanvas();
  if (screenId === 'main-menu') {
    stopGameLoop();
    cleanupConnection();
  }
}

function renderTeamSelect(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';
  TEAMS.forEach((team, i) => {
    const div = document.createElement('div');
    div.className = 'team-option' + (i === 0 ? ' selected' : '');
    div.innerHTML = `<span class="flag">${team.flag}</span><span class="name">${team.name}</span>`;
    div.onclick = () => {
      container.querySelectorAll('.team-option').forEach(t => t.classList.remove('selected'));
      div.classList.add('selected');
      gameState.myTeam = team;
    };
    container.appendChild(div);
  });
  if (!gameState.myTeam) gameState.myTeam = TEAMS[0];
}

// ===================== MULTIPLAYER / WEBSOCKET =====================

function generateCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function hostGame() {
  gameState.isHost = true;
  gameState.lobbyCode = generateCode();
  document.getElementById('host-code').classList.remove('hidden');
  document.getElementById('lobby-code').textContent = gameState.lobbyCode;
  
  // Try to connect to signaling server
  connectSignaling();
  
  // For demo: simulate opponent after 3 seconds if no real connection
  // In production, remove this and use real WebRTC/WebSocket
}

function joinGame() {
  const code = document.getElementById('join-code').value.trim().toUpperCase();
  if (code.length !== 6) {
    document.getElementById('join-status').textContent = 'Please enter a valid 6-character code';
    return;
  }
  gameState.isHost = false;
  gameState.lobbyCode = code;
  document.getElementById('join-status').textContent = 'Connecting to lobby...';
  
  connectSignaling();
}

// WebRTC Peer Connection for true P2P multiplayer over Wi-Fi/Hotspot
let peerConnection = null;
let dataChannel = null;
let signalingSocket = null;

const ICE_SERVERS = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

// For local network play (same Wi-Fi/hotspot), STUN is enough
// No TURN server needed since devices are on same network

function connectSignaling() {
  // Use a free public signaling server or implement your own
  // For GitHub Pages deployment, you need a separate signaling server
  // Options: Glitch, Render, Heroku, or your own VPS
  
  const SIGNALING_URL = 'wss://your-signaling-server.glitch.me'; // REPLACE THIS
  
  try {
    signalingSocket = new WebSocket(SIGNALING_URL);
    
    signalingSocket.onopen = () => {
      document.getElementById('conn-dot').classList.add('connected');
      document.getElementById('conn-text').textContent = 'Connected to matchmaking';
      
      signalingSocket.send(JSON.stringify({
        type: gameState.isHost ? 'create_lobby' : 'join_lobby',
        code: gameState.lobbyCode,
        team: gameState.myTeam
      }));
    };
    
    signalingSocket.onmessage = async (e) => {
      const data = JSON.parse(e.data);
      handleSignalingMessage(data);
    };
    
    signalingSocket.onerror = () => {
      // Fallback to local AI mode if no server
      document.getElementById('conn-text').textContent = 'Local Mode (vs AI)';
      if (gameState.isHost) {
        setTimeout(() => startMatch(true), 2000);
      }
    };
    
    signalingSocket.onclose = () => {
      if (gameState.matchStarted && !gameState.matchEnded) {
        document.getElementById('conn-lost').classList.remove('hidden');
      }
    };
  } catch(e) {
    console.log('Signaling failed, starting local mode');
    document.getElementById('conn-text').textContent = 'Local Mode (vs AI)';
    if (gameState.isHost) setTimeout(() => startMatch(true), 2000);
  }
}

async function handleSignalingMessage(data) {
  switch(data.type) {
    case 'lobby_created':
      console.log('Lobby created, waiting for opponent...');
      break;
      
    case 'player_joined':
      gameState.opponentTeam = data.team;
      gameState.opponentId = data.playerId;
      // Create offer
      await createPeerConnection(true);
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      signalingSocket.send(JSON.stringify({
        type: 'offer',
        code: gameState.lobbyCode,
        offer: offer
      }));
      break;
      
    case 'offer':
      gameState.opponentTeam = data.team;
      await createPeerConnection(false);
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);
      signalingSocket.send(JSON.stringify({
        type: 'answer',
        code: gameState.lobbyCode,
        answer: answer
      }));
      break;
      
    case 'answer':
      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
      break;
      
    case 'ice_candidate':
      if (peerConnection) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
      }
      break;
      
    case 'lobby_full':
      document.getElementById('join-status').textContent = 'Lobby is full!';
      break;
      
    case 'lobby_not_found':
      document.getElementById('join-status').textContent = 'Lobby not found. Check the code.';
      break;
  }
}

async function createPeerConnection(isHost) {
  peerConnection = new RTCPeerConnection(ICE_SERVERS);
  
  peerConnection.onicecandidate = (event) => {
    if (event.candidate && signalingSocket) {
      signalingSocket.send(JSON.stringify({
        type: 'ice_candidate',
        code: gameState.lobbyCode,
        candidate: event.candidate
      }));
    }
  };
  
  peerConnection.onconnectionstatechange = () => {
    if (peerConnection.connectionState === 'connected') {
      document.getElementById('conn-text').textContent = 'P2P Connected! Starting match...';
      setTimeout(() => startMatch(false), 1000);
    }
  };
  
  if (isHost) {
    dataChannel = peerConnection.createDataChannel('game', {
      ordered: true,
      maxRetransmits: 3
    });
    setupDataChannel();
  } else {
    peerConnection.ondatachannel = (event) => {
      dataChannel = event.channel;
      setupDataChannel();
    };
  }
}

function setupDataChannel() {
  dataChannel.onopen = () => {
    console.log('Data channel open!');
  };
  
  dataChannel.onmessage = (event) => {
    const data = JSON.parse(event.data);
    handleNetworkMessage(data);
  };
  
  dataChannel.onclose = () => {
    if (gameState.matchStarted && !gameState.matchEnded) {
      document.getElementById('conn-lost').classList.remove('hidden');
    }
  };
}

function handleNetworkMessage(data) {
  if (data.type === 'player_update') {
    gameState.opponentPlayer.x = data.x;
    gameState.opponentPlayer.y = data.y;
    gameState.opponentPlayer.vx = data.vx;
    gameState.opponentPlayer.vy = data.vy;
    gameState.opponentPlayer.hasBall = data.hasBall;
  }
  if (data.type === 'ball_sync') {
    // Only accept ball sync from non-host to prevent conflicts
    if (!gameState.isHost) {
      gameState.ball.x = data.x;
      gameState.ball.y = data.y;
      gameState.ball.vx = data.vx;
      gameState.ball.vy = data.vy;
      gameState.ball.z = data.z;
    }
  }
  if (data.type === 'goal') {
    if (data.team === 'home') gameState.myScore = data.score;
    else gameState.opponentScore = data.score;
    updateScoreboard();
    showGoalOverlay(data.team === gameState.myPlayer.team ? 'HOME' : 'AWAY');
  }
  if (data.type === 'match_end') {
    endMatch(data.winner);
  }
  if (data.type === 'reset_ball') {
    resetBallPosition();
  }
}

function sendGameData(data) {
  if (dataChannel && dataChannel.readyState === 'open') {
    dataChannel.send(JSON.stringify(data));
  }
}

function cleanupConnection() {
  if (dataChannel) { dataChannel.close(); dataChannel = null; }
  if (peerConnection) { peerConnection.close(); peerConnection = null; }
  if (signalingSocket) { signalingSocket.close(); signalingSocket = null; }
}

// ===================== GAME LOGIC =====================

const FIELD_WIDTH = 800;
const FIELD_HEIGHT = 500;
const GOAL_WIDTH = 100;
const GOAL_DEPTH = 40;
const PLAYER_SPEED = 3.5;
const SPRINT_SPEED = 5.5;
const BALL_FRICTION = 0.985;
const KICK_POWER = 9;
const PASS_POWER = 6;
const CHIP_POWER = 7;
const PLAYER_RADIUS = 12;
const BALL_RADIUS = 8;

function startMatch(isLocal) {
  showScreen('game-screen');
  gameState.matchStarted = true;
  gameState.myScore = 0;
  gameState.opponentScore = 0;
  gameState.timeRemaining = parseInt(document.getElementById('match-duration').value || 5) * 60;
  gameState.period = 1;
  gameState.stamina = 100;
  gameState.goalScored = false;
  gameState.matchEnded = false;
  gameState.particles = [];
  
  // Reset positions
  resetPositions();
  
  // Update UI
  const homeTeam = gameState.isHost ? gameState.myTeam : (gameState.opponentTeam || TEAMS[1]);
  const awayTeam = gameState.isHost ? (gameState.opponentTeam || TEAMS[1]) : gameState.myTeam;
  
  document.getElementById('home-name').textContent = homeTeam.name;
  document.getElementById('away-name').textContent = awayTeam.name;
  document.getElementById('home-icon').textContent = homeTeam.flag;
  document.getElementById('away-icon').textContent = awayTeam.flag;
  updateScoreboard();
  
  startGameLoop();
  startTimer();
}

function resetPositions() {
  gameState.ball = { x: FIELD_WIDTH/2, y: FIELD_HEIGHT/2, vx: 0, vy: 0, z: 0, vz: 0 };
  gameState.myPlayer = { 
    x: FIELD_WIDTH * 0.25, y: FIELD_HEIGHT/2, 
    vx: 0, vy: 0, 
    team: gameState.isHost ? 'home' : 'away',
    hasBall: gameState.isHost 
  };
  gameState.opponentPlayer = { 
    x: FIELD_WIDTH * 0.75, y: FIELD_HEIGHT/2, 
    vx: 0, vy: 0, 
    team: gameState.isHost ? 'away' : 'home',
    hasBall: !gameState.isHost 
  };
}

function resetBallPosition() {
  gameState.ball = { x: FIELD_WIDTH/2, y: FIELD_HEIGHT/2, vx: 0, vy: 0, z: 0, vz: 0 };
  gameState.myPlayer.hasBall = false;
  gameState.opponentPlayer.hasBall = false;
  gameState.goalScored = false;
}

function initGameCanvas() {
  const canvas = document.getElementById('game-canvas');
  if (!canvas) return;
  canvas.width = FIELD_WIDTH;
  canvas.height = FIELD_HEIGHT;
  gameState.canvas = canvas;
  gameState.ctx = canvas.getContext('2d');
  
  // Setup keyboard input
  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  
  // Mobile controls
  setupMobileControls();
}

function handleKeyDown(e) {
  gameState.keys[e.code] = true;
  if (['Space','ShiftLeft','ShiftRight','KeyE','KeyQ'].includes(e.code)) e.preventDefault();
}

function handleKeyUp(e) {
  gameState.keys[e.code] = false;
}

function setupMobileControls() {
  const btns = {
    'btn-up': 'up', 'btn-down': 'down', 'btn-left': 'left', 'btn-right': 'right',
    'btn-shoot': 'shoot', 'btn-pass': 'pass', 'btn-sprint': 'sprint'
  };
  Object.entries(btns).forEach(([id, action]) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('touchstart', (e) => { e.preventDefault(); gameState.touchControls[action] = true; });
    btn.addEventListener('touchend', (e) => { e.preventDefault(); gameState.touchControls[action] = false; });
    btn.addEventListener('mousedown', () => gameState.touchControls[action] = true);
    btn.addEventListener('mouseup', () => gameState.touchControls[action] = false);
    btn.addEventListener('mouseleave', () => gameState.touchControls[action] = false);
  });
}

function startGameLoop() {
  gameState.lastUpdate = performance.now();
  gameLoop();
}

function stopGameLoop() {
  if (gameState.animationId) {
    cancelAnimationFrame(gameState.animationId);
    gameState.animationId = null;
  }
  if (gameState.timerInterval) {
    clearInterval(gameState.timerInterval);
    gameState.timerInterval = null;
  }
  window.removeEventListener('keydown', handleKeyDown);
  window.removeEventListener('keyup', handleKeyUp);
}

function gameLoop() {
  if (!gameState.matchStarted || gameState.matchEnded) return;
  
  const now = performance.now();
  const dt = Math.min((now - gameState.lastUpdate) / 16.67, 3);
  gameState.lastUpdate = now;
  
  updatePlayer(dt);
  updateBall(dt);
  
  // Only host simulates opponent AI or processes opponent data
  if (!dataChannel || dataChannel.readyState !== 'open') {
    updateAI(dt);
  }
  
  checkGoals();
  updateStamina(dt);
  updateParticles(dt);
  
  if (gameState.cameraShake > 0) gameState.cameraShake -= dt;
  
  render();
  
  // Send network updates (throttled to ~20fps)
  if (now % 3 < 1) {
    sendGameData({
      type: 'player_update',
      x: gameState.myPlayer.x,
      y: gameState.myPlayer.y,
      vx: gameState.myPlayer.vx,
      vy: gameState.myPlayer.vy,
      hasBall: gameState.myPlayer.hasBall
    });
  }
  
  gameState.animationId = requestAnimationFrame(gameLoop);
}

function updatePlayer(dt) {
  const p = gameState.myPlayer;
  const k = gameState.keys;
  const t = gameState.touchControls;
  
  let dx = 0, dy = 0;
  if (k['KeyW'] || k['ArrowUp'] || t.up) dy -= 1;
  if (k['KeyS'] || k['ArrowDown'] || t.down) dy += 1;
  if (k['KeyA'] || k['ArrowLeft'] || t.left) dx -= 1;
  if (k['KeyD'] || k['ArrowRight'] || t.right) dx += 1;
  
  const sprinting = (k['ShiftLeft'] || k['ShiftRight'] || t.sprint) && gameState.stamina > 0;
  const speed = sprinting ? SPRINT_SPEED : PLAYER_SPEED;
  
  if (dx !== 0 || dy !== 0) {
    const len = Math.sqrt(dx*dx + dy*dy);
    p.vx = (dx/len) * speed;
    p.vy = (dy/len) * speed;
    if (sprinting) gameState.stamina = Math.max(0, gameState.stamina - 0.4 * dt);
  } else {
    p.vx *= 0.85;
    p.vy *= 0.85;
    gameState.stamina = Math.min(100, gameState.stamina + 0.25 * dt);
  }
  
  p.x += p.vx * dt;
  p.y += p.vy * dt;
  
  // Boundaries with goal openings
  const gTop = (FIELD_HEIGHT - GOAL_WIDTH) / 2;
  const gBottom = (FIELD_HEIGHT + GOAL_WIDTH) / 2;
  
  if (p.x < PLAYER_RADIUS) {
    if (p.y < gTop || p.y > gBottom) p.x = PLAYER_RADIUS;
  }
  if (p.x > FIELD_WIDTH - PLAYER_RADIUS) {
    if (p.y < gTop || p.y > gBottom) p.x = FIELD_WIDTH - PLAYER_RADIUS;
  }
  p.y = Math.max(PLAYER_RADIUS, Math.min(FIELD_HEIGHT - PLAYER_RADIUS, p.y));
  p.x = Math.max(PLAYER_RADIUS, Math.min(FIELD_WIDTH - PLAYER_RADIUS, p.x));
  
  // Ball interaction
  const b = gameState.ball;
  const dist = Math.sqrt((p.x - b.x)**2 + (p.y - b.y)**2);
  
  if (dist < PLAYER_RADIUS + BALL_RADIUS + 5) {
    // Push ball away if not trying to get it
    const angle = Math.atan2(b.y - p.y, b.x - p.x);
    const overlap = (PLAYER_RADIUS + BALL_RADIUS + 5) - dist;
    b.x += Math.cos(angle) * overlap * 0.5;
    b.y += Math.sin(angle) * overlap * 0.5;
    
    // Dribble
    if (Math.abs(p.vx) > 0.5 || Math.abs(p.vy) > 0.5) {
      b.vx = p.vx * 0.8;
      b.vy = p.vy * 0.8;
    }
  }
  
  // Shooting
  if ((k['Space'] || t.shoot) && !gameState.shootCooldown) {
    gameState.shootCooldown = true;
    const goalX = p.team === 'home' ? FIELD_WIDTH : 0;
    const goalY = FIELD_HEIGHT / 2;
    const angle = Math.atan2(goalY - p.y, goalX - p.x);
    const variance = (Math.random() - 0.5) * 0.3;
    b.vx = Math.cos(angle + variance) * KICK_POWER;
    b.vy = Math.sin(angle + variance) * KICK_POWER;
    b.z = 0; b.vz = 2;
    p.hasBall = false;
    createParticles(b.x, b.y, '#fff', 5);
    setTimeout(() => gameState.shootCooldown = false, 500);
  }
  
  // Passing
  if ((k['KeyE'] || t.pass) && !gameState.passCooldown) {
    gameState.passCooldown = true;
    b.vx = p.vx * 2.5 + (Math.random() - 0.5) * 2;
    b.vy = p.vy * 2.5 + (Math.random() - 0.5) * 2;
    p.hasBall = false;
    setTimeout(() => gameState.passCooldown = false, 300);
  }
  
  // Chip shot
  if (k['KeyQ'] && !gameState.chipCooldown) {
    gameState.chipCooldown = true;
    const goalX = p.team === 'home' ? FIELD_WIDTH : 0;
    const goalY = FIELD_HEIGHT / 2;
    const angle = Math.atan2(goalY - p.y, goalX - p.x);
    b.vx = Math.cos(angle) * CHIP_POWER * 0.8;
    b.vy = Math.sin(angle) * CHIP_POWER * 0.8;
    b.z = 0; b.vz = 10;
    p.hasBall = false;
    createParticles(b.x, b.y, '#ffdd00', 8);
    setTimeout(() => gameState.chipCooldown = false, 600);
  }
}

function updateBall(dt) {
  const b = gameState.ball;
  b.vx *= BALL_FRICTION;
  b.vy *= BALL_FRICTION;
  b.x += b.vx * dt;
  b.y += b.vy * dt;
  
  // Ball height physics
  b.z += b.vz * dt;
  b.vz -= 0.25 * dt;
  if (b.z < 0) { b.z = 0; b.vz *= -0.4; }
  
  // Wall bounces with goal detection
  const gTop = (FIELD_HEIGHT - GOAL_WIDTH) / 2;
  const gBottom = (FIELD_HEIGHT + GOAL_WIDTH) / 2;
  
  if (b.x < BALL_RADIUS) {
    if (b.y < gTop || b.y > gBottom || b.z > 30) {
      b.x = BALL_RADIUS; b.vx *= -0.7;
    }
  }
  if (b.x > FIELD_WIDTH - BALL_RADIUS) {
    if (b.y < gTop || b.y > gBottom || b.z > 30) {
      b.x = FIELD_WIDTH - BALL_RADIUS; b.vx *= -0.7;
    }
  }
  if (b.y < BALL_RADIUS) { b.y = BALL_RADIUS; b.vy *= -0.7; }
  if (b.y > FIELD_HEIGHT - BALL_RADIUS) { b.y = FIELD_HEIGHT - BALL_RADIUS; b.vy *= -0.7; }
  
  // Speed limit
  const speed = Math.sqrt(b.vx*b.vx + b.vy*b.vy);
  if (speed > 15) {
    b.vx = (b.vx/speed) * 15;
    b.vy = (b.vy/speed) * 15;
  }
}

function updateAI(dt) {
  const opp = gameState.opponentPlayer;
  const b = gameState.ball;
  
  // AI state machine
  const distToBall = Math.sqrt((b.x - opp.x)**2 + (b.y - opp.y)**2);
  const goalX = opp.team === 'home' ? FIELD_WIDTH : 0;
  const goalY = FIELD_HEIGHT / 2;
  
  if (distToBall < 150) {
    // Chase ball
    const angle = Math.atan2(b.y - opp.y, b.x - opp.x);
    opp.vx = Math.cos(angle) * PLAYER_SPEED * 0.9;
    opp.vy = Math.sin(angle) * PLAYER_SPEED * 0.9;
  } else {
    // Position between ball and own goal
    const targetX = (b.x + goalX) / 2;
    const targetY = (b.y + goalY) / 2;
    const angle = Math.atan2(targetY - opp.y, targetX - opp.x);
    const dist = Math.sqrt((targetX - opp.x)**2 + (targetY - opp.y)**2);
    if (dist > 30) {
      opp.vx = Math.cos(angle) * PLAYER_SPEED * 0.6;
      opp.vy = Math.sin(angle) * PLAYER_SPEED * 0.6;
    } else {
      opp.vx *= 0.8;
      opp.vy *= 0.8;
    }
  }
  
  opp.x += opp.vx * dt;
  opp.y += opp.vy * dt;
  opp.x = Math.max(PLAYER_RADIUS, Math.min(FIELD_WIDTH - PLAYER_RADIUS, opp.x));
  opp.y = Math.max(PLAYER_RADIUS, Math.min(FIELD_HEIGHT - PLAYER_RADIUS, opp.y));
  
  // AI ball interaction
  const dist = Math.sqrt((opp.x - b.x)**2 + (opp.y - b.y)**2);
  if (dist < PLAYER_RADIUS + BALL_RADIUS + 5) {
    const angle = Math.atan2(b.y - opp.y, b.x - opp.x);
    const overlap = (PLAYER_RADIUS + BALL_RADIUS + 5) - dist;
    b.x += Math.cos(angle) * overlap * 0.5;
    b.y += Math.sin(angle) * overlap * 0.5;
    
    // AI shooting decision
    const distToGoal = Math.abs(opp.x - goalX);
    if (distToGoal < 300 && Math.random() < 0.03) {
      const shootAngle = Math.atan2(goalY - opp.y, goalX - opp.x);
      const variance = (Math.random() - 0.5) * 0.4;
      b.vx = Math.cos(shootAngle + variance) * KICK_POWER;
      b.vy = Math.sin(shootAngle + variance) * KICK_POWER;
      b.z = 0; b.vz = Math.random() * 3;
      createParticles(b.x, b.y, '#fff', 5);
    }
  }
}

function checkGoals() {
  if (gameState.goalScored || gameState.matchEnded) return;
  const b = gameState.ball;
  const gTop = (FIELD_HEIGHT - GOAL_WIDTH) / 2;
  const gBottom = (FIELD_HEIGHT + GOAL_WIDTH) / 2;
  
  // Left goal (away team scores / home concedes)
  if (b.x < GOAL_DEPTH && b.y > gTop && b.y < gBottom && b.z < 35) {
    if (Math.abs(b.vx) > 1) {
      scoreGoal('away');
    }
  }
  // Right goal (home team scores / away concedes)
  if (b.x > FIELD_WIDTH - GOAL_DEPTH && b.y > gTop && b.y < gBottom && b.z < 35) {
    if (Math.abs(b.vx) > 1) {
      scoreGoal('home');
    }
  }
}

function scoreGoal(scoringTeam) {
  gameState.goalScored = true;
  gameState.cameraShake = 10;
  
  if (scoringTeam === 'home') gameState.myScore++;
  else gameState.opponentScore++;
  
  updateScoreboard();
  
  const scorerName = scoringTeam === gameState.myPlayer.team ? 
    (gameState.myTeam?.name || 'HOME') : (gameState.opponentTeam?.name || 'AWAY');
  showGoalOverlay(scorerName);
  
  // Create celebration particles
  const goalX = scoringTeam === 'home' ? FIELD_WIDTH : 0;
  for (let i = 0; i < 30; i++) {
    createParticles(goalX, FIELD_HEIGHT/2, scoringTeam === 'home' ? '#0066ff' : '#ff3333', 1);
  }
  
  sendGameData({
    type: 'goal',
    team: scoringTeam,
    score: scoringTeam === 'home' ? gameState.myScore : gameState.opponentScore
  });
  
  setTimeout(() => {
    resetBallPosition();
    sendGameData({ type: 'reset_ball' });
  }, 3000);
}

function showGoalOverlay(scorer) {
  const overlay = document.getElementById('goal-overlay');
  const text = document.getElementById('goal-scorer');
  text.textContent = scorer + ' SCORES!';
  overlay.classList.remove('hidden');
  setTimeout(() => overlay.classList.add('hidden'), 2500);
}

function updateScoreboard() {
  document.getElementById('score-home').textContent = gameState.myScore;
  document.getElementById('score-away').textContent = gameState.opponentScore;
}

function updateStamina(dt) {
  const bar = document.getElementById('stamina-bar');
  if (bar) bar.style.width = gameState.stamina + '%';
}

function startTimer() {
  gameState.timerInterval = setInterval(() => {
    if (gameState.matchEnded) return;
    gameState.timeRemaining--;
    
    const mins = Math.floor(gameState.timeRemaining / 60);
    const secs = gameState.timeRemaining % 60;
    const timerEl = document.getElementById('game-timer');
    if (timerEl) timerEl.textContent = String(mins).padStart(2, '0') + ':' + String(secs).padStart(2, '0');
    
    if (gameState.timeRemaining <= 0) {
      if (gameState.period === 1) {
        gameState.period = 2;
        gameState.timeRemaining = parseInt(document.getElementById('match-duration').value || 5) * 60;
        const periodEl = document.getElementById('game-period');
        if (periodEl) periodEl.textContent = '2nd Half';
        resetPositions();
      } else {
        endMatch();
      }
    }
  }, 1000);
}

function endMatch() {
  gameState.matchEnded = true;
  stopGameLoop();
  
  const overlay = document.getElementById('match-end');
  const finalScore = document.getElementById('final-score');
  const winnerText = document.getElementById('winner-text');
  
  if (finalScore) finalScore.textContent = gameState.myScore + ' - ' + gameState.opponentScore;
  
  let winnerTextStr = 'DRAW!';
  if (gameState.myScore > gameState.opponentScore) winnerTextStr = '🏆 YOU WIN!';
  if (gameState.myScore < gameState.opponentScore) winnerTextStr = '😢 YOU LOSE';
  
  if (winnerText) winnerText.textContent = winnerTextStr;
  if (overlay) overlay.classList.remove('hidden');
  
  sendGameData({
    type: 'match_end',
    winner: gameState.myScore > gameState.opponentScore ? 'home' : 
            gameState.myScore < gameState.opponentScore ? 'away' : 'draw'
  });
}

// ===================== PARTICLE SYSTEM =====================

function createParticles(x, y, color, count) {
  for (let i = 0; i < count; i++) {
    gameState.particles.push({
      x: x, y: y,
      vx: (Math.random() - 0.5) * 6,
      vy: (Math.random() - 0.5) * 6 - 2,
      life: 1.0,
      color: color,
      size: Math.random() * 4 + 2
    });
  }
}

function updateParticles(dt) {
  gameState.particles = gameState.particles.filter(p => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 0.1 * dt; // gravity
    p.life -= 0.02 * dt;
    return p.life > 0;
  });
}

// ===================== RENDERING =====================

function render() {
  const ctx = gameState.ctx;
  if (!ctx) return;
  const w = FIELD_WIDTH;
  const h = FIELD_HEIGHT;
  
  // Camera shake
  let shakeX = 0, shakeY = 0;
  if (gameState.cameraShake > 0) {
    shakeX = (Math.random() - 0.5) * gameState.cameraShake;
    shakeY = (Math.random() - 0.5) * gameState.cameraShake;
  }
  
  ctx.save();
  ctx.translate(shakeX, shakeY);
  
  // Field background
  const grass1 = '#2d8a2d';
  const grass2 = '#267a26';
  ctx.fillStyle = grass1;
  ctx.fillRect(0, 0, w, h);
  
  // Striped pattern
  ctx.fillStyle = grass2;
  const stripeWidth = 50;
  for (let i = 0; i < w; i += stripeWidth * 2) {
    ctx.fillRect(i, 0, stripeWidth, h);
  }
  
  // Field markings
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = 2.5;
  
  // Border
  ctx.strokeRect(2, 2, w-4, h-4);
  
  // Center line
  ctx.beginPath();
  ctx.moveTo(w/2, 0); ctx.lineTo(w/2, h);
  ctx.stroke();
  
  // Center circle
  ctx.beginPath();
  ctx.arc(w/2, h/2, 60, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(w/2, h/2, 4, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fill();
  
  // Penalty areas
  const paW = 120, paH = 200;
  ctx.strokeRect(0, (h-paH)/2, paW, paH);
  ctx.strokeRect(w-paW, (h-paH)/2, paW, paH);
  
  // Goal areas
  const gaW = 50, gaH = 120;
  ctx.strokeRect(0, (h-gaH)/2, gaW, gaH);
  ctx.strokeRect(w-gaW, (h-gaH)/2, gaW, gaH);
  
  // Corner arcs
  ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI/2); ctx.stroke();
  ctx.beginPath(); ctx.arc(w, 0, 15, Math.PI/2, Math.PI); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, h, 15, -Math.PI/2, 0); ctx.stroke();
  ctx.beginPath(); ctx.arc(w, h, 15, Math.PI, -Math.PI/2); ctx.stroke();
  
  // Goals
  const gTop = (h - GOAL_WIDTH) / 2;
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(-5, gTop, GOAL_DEPTH, GOAL_WIDTH);
  ctx.fillRect(w - GOAL_DEPTH + 5, gTop, GOAL_DEPTH, GOAL_WIDTH);
  
  // Goal net pattern
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= GOAL_WIDTH; i += 8) {
    ctx.beginPath(); ctx.moveTo(0, gTop + i); ctx.lineTo(GOAL_DEPTH, gTop + i); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w - GOAL_DEPTH, gTop + i); ctx.lineTo(w, gTop + i); ctx.stroke();
  }
  for (let i = 0; i <= GOAL_DEPTH; i += 8) {
    ctx.beginPath(); ctx.moveTo(i, gTop); ctx.lineTo(i, gTop + GOAL_WIDTH); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w - GOAL_DEPTH + i, gTop); ctx.lineTo(w - GOAL_DEPTH + i, gTop + GOAL_WIDTH); ctx.stroke();
  }
  
  // Draw particles
  gameState.particles.forEach(p => {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  
  // Draw ball shadow
  const b = gameState.ball;
  ctx.beginPath();
  ctx.ellipse(b.x, b.y + 5 + b.z * 0.3, 10 - b.z * 0.1, 5 - b.z * 0.05, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fill();
  
  // Draw ball
  const ballScale = 1 + b.z / 80;
  const ballY = b.y - b.z;
  
  ctx.beginPath();
  ctx.arc(b.x, ballY, BALL_RADIUS * ballScale, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.strokeStyle = '#222';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  
  // Ball pattern (pentagon)
  ctx.fillStyle = '#1a1a1a';
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const angle = (i * 2 * Math.PI / 5) - Math.PI/2;
    const px = b.x + Math.cos(angle) * 4 * ballScale;
    const py = ballY + Math.sin(angle) * 4 * ballScale;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  
  // Draw players
  drawPlayer(ctx, gameState.myPlayer, true);
  drawPlayer(ctx, gameState.opponentPlayer, false);
  
  // Ball indicator ring
  const p = gameState.myPlayer;
  const distToBall = Math.sqrt((p.x - b.x)**2 + (p.y - b.y)**2);
  if (distToBall < 40) {
    ctx.strokeStyle = 'rgba(255, 221, 0, 0.6)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(p.x, p.y, 20, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  
  ctx.restore();
}

function drawPlayer(ctx, p, isMe) {
  const teamColor = p.team === 'home' ? '#0066ff' : '#ff3333';
  const jerseyColor = isMe ? (gameState.myTeam?.color || teamColor) : (gameState.opponentTeam?.color || '#ff4444');
  const darkColor = isMe ? (gameState.myTeam?.darkColor || '#0044cc') : (gameState.opponentTeam?.darkColor || '#cc2222');
  
  // Shadow
  ctx.beginPath();
  ctx.ellipse(p.x, p.y + 14, 13, 6, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0,0,0,0.25)';
  ctx.fill();
  
  // Jersey body
  ctx.beginPath();
  ctx.arc(p.x, p.y, PLAYER_RADIUS, 0, Math.PI * 2);
  ctx.fillStyle = jerseyColor;
  ctx.fill();
  
  // Jersey stripe
  ctx.beginPath();
  ctx.arc(p.x, p.y, PLAYER_RADIUS, -0.5, 0.5);
  ctx.fillStyle = darkColor;
  ctx.fill();
  
  // Outline
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(p.x, p.y, PLAYER_RADIUS, 0, Math.PI * 2);
  ctx.stroke();
  
  // Number
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(isMe ? '10' : '7', p.x, p.y + 1);
  
  // Direction indicator
  const speed = Math.sqrt(p.vx*p.vx + p.vy*p.vy);
  if (speed > 0.5) {
    const angle = Math.atan2(p.vy, p.vx);
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.beginPath();
    ctx.moveTo(p.x + Math.cos(angle) * 16, p.y + Math.sin(angle) * 16);
    ctx.lineTo(p.x + Math.cos(angle - 0.6) * 10, p.y + Math.sin(angle - 0.6) * 10);
    ctx.lineTo(p.x + Math.cos(angle + 0.6) * 10, p.y + Math.sin(angle + 0.6) * 10);
    ctx.fill();
  }
  
  // Name tag
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(p.x - 25, p.y - 28, 50, 14);
  ctx.fillStyle = '#fff';
  ctx.font = '9px Inter';
  ctx.fillText(isMe ? 'YOU' : 'CPU', p.x, p.y - 21);
}

// ===================== INITIALIZATION =====================

// Check connection status
setTimeout(() => {
  const dot = document.getElementById('conn-dot');
  const text = document.getElementById('conn-text');
  if (navigator.onLine) {
    dot.classList.add('connected');
    text.textContent = 'Online - Ready for multiplayer';
  } else {
    text.textContent = 'Offline - Local play available';
  }
}, 500);

// Prevent zoom on mobile
document.addEventListener('gesturestart', (e) => e.preventDefault());
document.addEventListener('gesturechange', (e) => e.preventDefault());
document.addEventListener('gestureend', (e) => e.preventDefault());

console.log('⚽ eFootball Ultimate Soccer loaded!');
console.log('Controls: WASD = Move, SPACE = Shoot, SHIFT = Sprint, E = Pass, Q = Chip');
'''

with open('/mnt/agents/output/efootball-game/game.js', 'w') as f:
    f.write(game_js)

print("game.js created!")
