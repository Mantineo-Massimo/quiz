const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const os = require('os');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;
let customPublicUrl = process.env.PUBLIC_URL || '';

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Carica domande da file
const questionsPath = path.join(__dirname, 'questions.json');
let questions = [];
try {
  questions = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));
} catch (e) {
  console.error('Errore lettura questions.json:', e);
}

// Funzione per trovare gli indirizzi IP locali
function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addresses = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address);
      }
    }
  }
  return addresses;
}

// Database Persistente su Disco (sopravvive a riavvii, crash e ricaricamenti)
const db = require('./database');
const gameState = db.state;

// Calcolo Punti basato su correttezza, velocità e serie (streak)
function calculateScore(timeRemaining, timeLimit, isCorrect, streak) {
  if (!isCorrect) return 0;
  const ratio = Math.max(0, Math.min(1, timeRemaining / timeLimit));
  const basePoints = 500;
  const speedBonus = Math.round(500 * ratio);
  const streakBonus = Math.min(streak * 50, 250);
  return basePoints + speedBonus + streakBonus;
}

// Genera Classifica aggiornata
function getLeaderboard() {
  const list = Object.values(gameState.players).map(p => ({
    id: p.id,
    nickname: p.nickname,
    avatar: p.avatar,
    score: p.score || 0,
    streak: p.streak || 0,
    lastPointsEarned: p.lastPointsEarned || 0,
    connected: !!p.connected
  }));
  list.sort((a, b) => b.score - a.score);
  return list.map((p, idx) => ({ ...p, rank: idx + 1 }));
}

// API Endpoints
app.get('/api/network', async (req, res) => {
  const protocol = req.headers['x-forwarded-proto'] || (req.secure ? 'https' : 'http');
  const hostHeader = req.headers['x-forwarded-host'] || req.headers.host;
  
  let detectedPublicUrl = '';
  if (hostHeader && !hostHeader.includes('localhost') && !hostHeader.includes('127.0.0.1') && !hostHeader.startsWith('10.') && !hostHeader.startsWith('192.168.')) {
    detectedPublicUrl = `${protocol}://${hostHeader}`;
  }

  const ips = getLocalIpAddresses();
  const primaryIp = ips[0] || 'localhost';
  const localUrl = `http://${primaryIp}:${PORT}`;
  
  const clientOrigin = req.query.origin;
  const url = customPublicUrl || clientOrigin || detectedPublicUrl || localUrl;

  try {
    const qrDataUrl = await QRCode.toDataURL(url, {
      margin: 2,
      scale: 8,
      color: {
        dark: '#090e1a',
        light: '#ffffff'
      }
    });
    res.json({ ips, port: PORT, url, qrDataUrl });
  } catch (err) {
    res.json({ ips, port: PORT, url, qrDataUrl: '' });
  }
});

app.post('/api/set-url', (req, res) => {
  const { url } = req.body;
  customPublicUrl = url || '';
  io.emit('network:updated', { url: customPublicUrl || `http://${getLocalIpAddresses()[0] || 'localhost'}:${PORT}` });
  res.json({ success: true, url: customPublicUrl });
});

app.get('/api/questions', (req, res) => {
  res.json(questions);
});

app.post('/api/questions', (req, res) => {
  if (Array.isArray(req.body)) {
    questions = req.body;
    try {
      fs.writeFileSync(questionsPath, JSON.stringify(questions, null, 2), 'utf8');
      res.json({ success: true, count: questions.length });
    } catch (e) {
      res.status(500).json({ error: 'Errore salvataggio' });
    }
  } else {
    res.status(400).json({ error: 'Formato non valido' });
  }
});

// Pagine principali
app.get('/host', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'host.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Helper: invia syncState completo a un socket o a tutti
function sendSyncState(target) {
  const currentQ = questions[gameState.currentQuestionIndex];
  const leaderboard = getLeaderboard();
  const payload = {
    status: gameState.status,
    currentQuestionIndex: gameState.currentQuestionIndex,
    totalQuestions: questions.length,
    playerCount: Object.values(gameState.players).length,
    timeRemaining: gameState.timeRemaining,
    currentQuestion: currentQ ? {
      questionIndex: gameState.currentQuestionIndex,
      totalQuestions: questions.length,
      category: currentQ.category,
      question: currentQ.question,
      options: currentQ.options,
      timeLimit: currentQ.timeLimit || 20
    } : null,
    correctIndex: currentQ ? currentQ.correctIndex : 0,
    explanation: currentQ ? (currentQ.explanation || '') : '',
    answerStats: gameState.answerStats || [0, 0, 0, 0],
    answeredCount: Object.keys(gameState.answersCurrentQuestion || {}).length,
    leaderboard
  };

  if (target && typeof target.emit === 'function') {
    target.emit('game:syncState', payload);
  } else {
    io.emit('game:syncState', payload);
  }
}

// Timer Gestione Domande
function startQuestionTimer() {
  if (gameState.timerInterval) clearInterval(gameState.timerInterval);

  const currentQ = questions[gameState.currentQuestionIndex];
  const timeLimit = currentQ ? currentQ.timeLimit || 20 : 20;

  if (!gameState.timeRemaining || gameState.timeRemaining <= 0) {
    gameState.timeRemaining = timeLimit;
  }

  gameState.timerInterval = setInterval(() => {
    gameState.timeRemaining -= 1;
    io.emit('game:timerTick', { timeRemaining: gameState.timeRemaining, timeLimit });

    if (gameState.timeRemaining <= 0) {
      clearInterval(gameState.timerInterval);
      gameState.timerInterval = null;
      revealAnswer();
    }
  }, 1000);
}

function revealAnswer() {
  if (gameState.timerInterval) {
    clearInterval(gameState.timerInterval);
    gameState.timerInterval = null;
  }
  gameState.status = 'SHOW_ANSWER';
  gameState.timeRemaining = 0;

  const currentQ = questions[gameState.currentQuestionIndex];
  if (!currentQ) return;

  // Calcolo punti e serie per ogni giocatore
  for (const pid of Object.keys(gameState.players)) {
    const player = gameState.players[pid];
    const playerAnswer = gameState.answersCurrentQuestion[pid];
    const isCorrect = (playerAnswer !== undefined && playerAnswer === currentQ.correctIndex);

    if (isCorrect) {
      player.streak = (player.streak || 0) + 1;
      const pts = calculateScore(player.lastAnswerTime || 0, currentQ.timeLimit || 20, true, player.streak);
      player.score = (player.score || 0) + pts;
      player.lastPointsEarned = pts;
    } else {
      player.streak = 0;
      player.lastPointsEarned = 0;
    }
  }

  const leaderboard = getLeaderboard();
  db.save(); // SALVA IMMEDIATAMENTE NEL DATABASE PERSISTENTE

  // Invia a host e schermi i dati di svelamento
  io.emit('game:answerRevealed', {
    correctIndex: currentQ.correctIndex,
    explanation: currentQ.explanation,
    answerStats: gameState.answerStats,
    leaderboard
  });

  // Notifica specifica a ciascun giocatore nella sua stanza dedicata
  for (const pid of Object.keys(gameState.players)) {
    const player = gameState.players[pid];
    const playerAnswer = gameState.answersCurrentQuestion[pid];
    const isCorrect = (playerAnswer !== undefined && playerAnswer === currentQ.correctIndex);
    const playerRank = leaderboard.find(p => p.id === player.id)?.rank || 1;

    io.to(pid).emit('player:roundResult', {
      isCorrect,
      selectedOption: playerAnswer,
      correctIndex: currentQ.correctIndex,
      pointsEarned: player.lastPointsEarned,
      totalScore: player.score,
      streak: player.streak,
      rank: playerRank,
      totalPlayers: leaderboard.length
    });
  }
}

function startCountdown() {
  gameState.status = 'COUNTDOWN';
  db.save();

  let count = 3;
  io.emit('game:countdown', { count });

  const interval = setInterval(() => {
    count -= 1;
    if (count > 0) {
      io.emit('game:countdown', { count });
    } else {
      clearInterval(interval);
      launchQuestion();
    }
  }, 1000);
}

function launchQuestion() {
  gameState.status = 'QUESTION';
  gameState.answersCurrentQuestion = {};
  gameState.answerStats = [0, 0, 0, 0];

  const currentQ = questions[gameState.currentQuestionIndex];
  if (!currentQ) {
    showPodium();
    return;
  }

  gameState.timeRemaining = currentQ.timeLimit || 20;
  db.save(); // SALVA NEL DATABASE

  // Notifica host e giocatori
  io.emit('game:questionStarted', {
    questionIndex: gameState.currentQuestionIndex,
    totalQuestions: questions.length,
    category: currentQ.category,
    question: currentQ.question,
    options: currentQ.options,
    timeLimit: gameState.timeRemaining
  });

  startQuestionTimer();
}

function showLeaderboard() {
  if (gameState.timerInterval) clearInterval(gameState.timerInterval);
  gameState.status = 'LEADERBOARD';
  db.save(); // SALVA NEL DATABASE

  const leaderboard = getLeaderboard();
  io.emit('game:leaderboard', {
    leaderboard,
    currentQuestionIndex: gameState.currentQuestionIndex,
    totalQuestions: questions.length,
    isLastQuestion: gameState.currentQuestionIndex >= questions.length - 1
  });
}

function showPodium() {
  if (gameState.timerInterval) clearInterval(gameState.timerInterval);
  gameState.status = 'PODIUM';
  db.save(); // SALVA NEL DATABASE

  const leaderboard = getLeaderboard();
  io.emit('game:podium', { leaderboard });
}

// Mappa socket.id -> playerId
const socketToPlayerId = {};

// Socket.io Handlers
io.on('connection', (socket) => {
  // Sync completo immediato a chiunque si colleghi (Host, Admin, Player ricaricati)
  sendSyncState(socket);
  socket.emit('host:playersUpdated', Object.values(gameState.players));

  // Giocatore si registra o si riconnette
  socket.on('player:join', ({ nickname, avatar, playerId }) => {
    const cleanNick = (nickname || 'Matricola').trim().slice(0, 16);
    const pid = playerId || `p_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    socketToPlayerId[socket.id] = pid;
    socket.join(pid); // FONDAMENTALE: unisce alla stanza del suo playerId

    let player = gameState.players[pid];
    if (player) {
      // Giocatore già nel DB: mantieni punteggio, serie e stato!
      player.socketId = socket.id;
      player.connected = true;
      if (nickname) player.nickname = cleanNick;
      if (avatar) player.avatar = avatar;
    } else {
      // Nuovo partecipante
      player = {
        id: pid,
        socketId: socket.id,
        nickname: cleanNick,
        avatar: avatar || '🎓',
        score: 0,
        streak: 0,
        connected: true,
        lastAnswer: null,
        lastAnswerTime: 0,
        lastPointsEarned: 0
      };
      gameState.players[pid] = player;
    }

    db.save(); // PERSISTE SUBITO SU DISCO

    const leaderboard = getLeaderboard();
    const rankInfo = leaderboard.find(p => p.id === pid);
    const currentQ = questions[gameState.currentQuestionIndex];
    const playerAns = gameState.answersCurrentQuestion ? gameState.answersCurrentQuestion[pid] : undefined;
    const isCorrect = (currentQ && playerAns !== undefined && playerAns === currentQ.correctIndex);

    // Invia lo stato completo al giocatore
    socket.emit('player:joined', {
      id: pid,
      nickname: player.nickname,
      avatar: player.avatar,
      status: gameState.status,
      score: player.score,
      streak: player.streak,
      rank: rankInfo ? rankInfo.rank : 1,
      totalPlayers: leaderboard.length,
      playerAnswer: playerAns,
      isCorrect: isCorrect,
      pointsEarned: player.lastPointsEarned
    });

    // Se c'è una domanda in corso, inviala con il tempo rimanente esatto
    if (gameState.status === 'QUESTION' && currentQ) {
      socket.emit('game:questionStarted', {
        questionIndex: gameState.currentQuestionIndex,
        totalQuestions: questions.length,
        category: currentQ.category,
        question: currentQ.question,
        options: currentQ.options,
        timeLimit: gameState.timeRemaining || currentQ.timeLimit || 20
      });
      if (playerAns !== undefined) {
        socket.emit('player:answerAck', { optionIndex: playerAns });
      }
    }

    // Notifica host e regia dell'elenco aggiornato
    io.emit('host:playersUpdated', Object.values(gameState.players));
  });

  // Giocatore invia risposta
  socket.on('player:submitAnswer', ({ optionIndex }) => {
    if (gameState.status !== 'QUESTION') return;
    const pid = socketToPlayerId[socket.id];
    if (!pid) return;

    if (!gameState.answersCurrentQuestion) gameState.answersCurrentQuestion = {};
    if (gameState.answersCurrentQuestion[pid] !== undefined) return; // Ha già risposto

    const player = gameState.players[pid];
    if (!player) return;

    gameState.answersCurrentQuestion[pid] = optionIndex;
    player.lastAnswer = optionIndex;
    player.lastAnswerTime = gameState.timeRemaining;

    if (optionIndex >= 0 && optionIndex < 4) {
      if (!gameState.answerStats) gameState.answerStats = [0, 0, 0, 0];
      gameState.answerStats[optionIndex]++;
    }

    db.save(); // PERSISTE RISPOSTA SUBITO SU DISCO

    const answeredCount = Object.keys(gameState.answersCurrentQuestion).length;
    const totalPlayers = Object.values(gameState.players).filter(p => p.connected).length;

    socket.emit('player:answerAck', { optionIndex });
    io.emit('game:answersCountUpdated', { answeredCount, totalPlayers });

    // Se tutti i partecipanti attivi hanno risposto, svela subito
    if (answeredCount >= totalPlayers && totalPlayers > 0) {
      revealAnswer();
    }
  });

  // Comandi Host / Admin
  socket.on('admin:startGame', () => {
    db.reset();
    startCountdown();
  });

  socket.on('admin:next', () => {
    if (gameState.status === 'SHOW_ANSWER') {
      showLeaderboard();
    } else if (gameState.status === 'LEADERBOARD') {
      if (gameState.currentQuestionIndex < questions.length - 1) {
        gameState.currentQuestionIndex++;
        startCountdown();
      } else {
        showPodium();
      }
    }
  });

  socket.on('admin:revealNow', () => {
    if (gameState.status === 'QUESTION') {
      revealAnswer();
    }
  });

  socket.on('admin:showPodium', () => {
    showPodium();
  });

  socket.on('admin:resetLobby', () => {
    if (gameState.timerInterval) clearInterval(gameState.timerInterval);
    db.reset();
    io.emit('game:resetToLobby');
    io.emit('host:playersUpdated', Object.values(gameState.players));
    sendSyncState();
  });

  socket.on('admin:clearAllPlayers', () => {
    if (gameState.timerInterval) clearInterval(gameState.timerInterval);
    db.clearPlayers();
    io.emit('game:resetToLobby');
    io.emit('host:playersUpdated', []);
    sendSyncState();
  });

  socket.on('admin:kickPlayer', ({ playerId }) => {
    if (gameState.players[playerId]) {
      delete gameState.players[playerId];
      if (gameState.answersCurrentQuestion) delete gameState.answersCurrentQuestion[playerId];
      db.save();
      io.to(playerId).emit('player:kicked');
      io.emit('host:playersUpdated', Object.values(gameState.players));
      sendSyncState();
    }
  });

  // Disconnessione socket (NON cancella il giocatore dal DB: preserva punti e streak!)
  socket.on('disconnect', () => {
    const pid = socketToPlayerId[socket.id];
    if (pid && gameState.players[pid]) {
      gameState.players[pid].connected = false;
      delete socketToPlayerId[socket.id];
      db.save();
      io.emit('host:playersUpdated', Object.values(gameState.players));
    }
  });
});

// Ripresa sicura se il server si riavvia durante una domanda
if (gameState.status === 'QUESTION') {
  if (gameState.timeRemaining > 0) {
    startQuestionTimer();
  } else {
    revealAnswer();
  }
}

server.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIpAddresses();
  console.log(`\n======================================================`);
  console.log(`🎯 UNIME LEVEL UP: L'interactive info show per le matricole`);
  console.log(`🏛️ Organizzato da Morgana & O.R.U.M. • Porta ${PORT}`);
  console.log(`💾 Database: db.json attivo con persistenza stato completa`);
  console.log(`🖥️  SCHERMO PRINCIPALE (Host): http://localhost:${PORT}/host`);
  console.log(`📱 PARTECIPANTI (Mobile):      http://${ips[0] || 'localhost'}:${PORT}`);
  console.log(`⚙️  REGIA / ADMIN:             http://localhost:${PORT}/admin`);
  console.log(`======================================================\n`);
});
