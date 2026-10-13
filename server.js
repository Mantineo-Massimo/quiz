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

// Carica domande
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

// Stato di Gioco Globale
const gameState = {
  status: 'LOBBY', // 'LOBBY' | 'COUNTDOWN' | 'QUESTION' | 'SHOW_ANSWER' | 'LEADERBOARD' | 'PODIUM'
  currentQuestionIndex: 0,
  timeRemaining: 20,
  timerInterval: null,
  players: {}, // socketId -> { id, nickname, avatar, score, streak, lastAnswer: null, lastAnswerTime: 0, lastPointsEarned: 0 }
  answersCurrentQuestion: {}, // socketId -> optionIndex
  answerStats: [0, 0, 0, 0]
};

// Calcolo Punti basato su correttezza, velocità e streak
function calculateScore(timeRemaining, timeLimit, isCorrect, streak) {
  if (!isCorrect) return 0;
  const ratio = Math.max(0, Math.min(1, timeRemaining / timeLimit));
  const basePoints = 500;
  const speedBonus = Math.round(500 * ratio);
  const streakBonus = Math.min(streak * 50, 250);
  return basePoints + speedBonus + streakBonus;
}

// Genera Classifica
function getLeaderboard() {
  const list = Object.values(gameState.players).map(p => ({
    id: p.id,
    nickname: p.nickname,
    avatar: p.avatar,
    score: p.score,
    streak: p.streak,
    lastPointsEarned: p.lastPointsEarned
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

// Timer Gestione Domande
function startQuestionTimer() {
  if (gameState.timerInterval) clearInterval(gameState.timerInterval);

  const currentQ = questions[gameState.currentQuestionIndex];
  const timeLimit = currentQ ? currentQ.timeLimit || 20 : 20;
  gameState.timeRemaining = timeLimit;

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

  const currentQ = questions[gameState.currentQuestionIndex];
  if (!currentQ) return;

  // Calcolo punti e streak per ogni giocatore
  for (const socketId of Object.keys(gameState.players)) {
    const player = gameState.players[socketId];
    const playerAnswer = gameState.answersCurrentQuestion[socketId];
    const isCorrect = (playerAnswer !== undefined && playerAnswer === currentQ.correctIndex);

    if (isCorrect) {
      player.streak = (player.streak || 0) + 1;
      const pts = calculateScore(player.lastAnswerTime, currentQ.timeLimit || 20, true, player.streak);
      player.score += pts;
      player.lastPointsEarned = pts;
    } else {
      player.streak = 0;
      player.lastPointsEarned = 0;
    }
  }

  const leaderboard = getLeaderboard();

  // Invia a tutti i dati di svelamento
  io.emit('game:answerRevealed', {
    correctIndex: currentQ.correctIndex,
    explanation: currentQ.explanation,
    answerStats: gameState.answerStats,
    leaderboard
  });

  // Notifica specifica a ogni giocatore se ha indovinato
  for (const socketId of Object.keys(gameState.players)) {
    const player = gameState.players[socketId];
    const playerAnswer = gameState.answersCurrentQuestion[socketId];
    const isCorrect = (playerAnswer !== undefined && playerAnswer === currentQ.correctIndex);
    const playerRank = leaderboard.find(p => p.id === player.id)?.rank || 1;

    io.to(socketId).emit('player:roundResult', {
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

  // Notifica host e player
  io.emit('game:questionStarted', {
    questionIndex: gameState.currentQuestionIndex,
    totalQuestions: questions.length,
    category: currentQ.category,
    question: currentQ.question,
    options: currentQ.options,
    timeLimit: currentQ.timeLimit || 20
  });

  startQuestionTimer();
}

function showLeaderboard() {
  if (gameState.timerInterval) clearInterval(gameState.timerInterval);
  gameState.status = 'LEADERBOARD';
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
  const leaderboard = getLeaderboard();
  io.emit('game:podium', { leaderboard });
}

// Mappa socket.id -> playerId
const socketToPlayerId = {};

// Socket.io handlers
io.on('connection', (socket) => {
  // Sync stato corrente al nuovo arrivato
  const currentQ = questions[gameState.currentQuestionIndex];
  socket.emit('game:syncState', {
    status: gameState.status,
    currentQuestionIndex: gameState.currentQuestionIndex,
    totalQuestions: questions.length,
    playerCount: Object.values(gameState.players).length,
    timeRemaining: gameState.timeRemaining,
    currentQuestion: (gameState.status === 'QUESTION' && currentQ) ? {
      questionIndex: gameState.currentQuestionIndex,
      totalQuestions: questions.length,
      category: currentQ.category,
      question: currentQ.question,
      options: currentQ.options,
      timeLimit: currentQ.timeLimit || 20
    } : null
  });

  // Invia SEMPRE l'elenco dei giocatori a chiunque si colleghi (incluso l'host che fa Ctrl+F5)
  socket.emit('host:playersUpdated', Object.values(gameState.players));

  // Giocatore si registra o si riconnette
  socket.on('player:join', ({ nickname, avatar, playerId }) => {
    const cleanNick = (nickname || 'Matricola').trim().slice(0, 16);
    const pid = playerId || `p_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    socketToPlayerId[socket.id] = pid;

    if (gameState.players[pid]) {
      // Riconnessione dello stesso giocatore (es. Ctrl+F5): mantieni punti e serie!
      const existing = gameState.players[pid];
      existing.socketId = socket.id;
      existing.connected = true;
      if (nickname) existing.nickname = cleanNick;
      if (avatar) existing.avatar = avatar;

      socket.emit('player:joined', {
        id: pid,
        nickname: existing.nickname,
        avatar: existing.avatar,
        status: gameState.status,
        score: existing.score,
        streak: existing.streak
      });
    } else {
      // Nuovo giocatore
      gameState.players[pid] = {
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

      socket.emit('player:joined', {
        id: pid,
        nickname: cleanNick,
        avatar: gameState.players[pid].avatar,
        status: gameState.status,
        score: 0,
        streak: 0
      });
    }

    // Se c'è una domanda in corso, inviala subito al giocatore riconnesso
    if (gameState.status === 'QUESTION' && currentQ) {
      socket.emit('game:questionStarted', {
        questionIndex: gameState.currentQuestionIndex,
        totalQuestions: questions.length,
        category: currentQ.category,
        question: currentQ.question,
        options: currentQ.options,
        timeLimit: gameState.timeRemaining || currentQ.timeLimit || 20
      });
      // Se aveva già risposto
      if (gameState.answersCurrentQuestion[pid] !== undefined) {
        socket.emit('player:answerAck');
      }
    }

    // Notifica host e admin
    io.emit('host:playersUpdated', Object.values(gameState.players));
  });

  // Giocatore invia risposta
  socket.on('player:submitAnswer', ({ optionIndex }) => {
    if (gameState.status !== 'QUESTION') return;
    const pid = socketToPlayerId[socket.id];
    if (!pid) return;

    if (gameState.answersCurrentQuestion[pid] !== undefined) return; // già risposto

    const player = gameState.players[pid];
    if (!player) return;

    gameState.answersCurrentQuestion[pid] = optionIndex;
    player.lastAnswer = optionIndex;
    player.lastAnswerTime = gameState.timeRemaining;

    if (optionIndex >= 0 && optionIndex < 4) {
      gameState.answerStats[optionIndex]++;
    }

    const answeredCount = Object.keys(gameState.answersCurrentQuestion).length;
    const totalPlayers = Object.values(gameState.players).filter(p => p.connected).length;

    socket.emit('player:answerAck', { optionIndex });
    io.emit('game:answersCountUpdated', { answeredCount, totalPlayers });

    // Se tutti i giocatori connessi hanno risposto, chiudi subito
    if (answeredCount >= totalPlayers && totalPlayers > 0) {
      revealAnswer();
    }
  });

  // Comandi Host / Admin
  socket.on('admin:startGame', () => {
    gameState.currentQuestionIndex = 0;
    // Resetta punteggi
    for (const p of Object.values(gameState.players)) {
      p.score = 0;
      p.streak = 0;
      p.lastPointsEarned = 0;
    }
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
    gameState.status = 'LOBBY';
    gameState.currentQuestionIndex = 0;
    for (const p of Object.values(gameState.players)) {
      p.score = 0;
      p.streak = 0;
      p.lastPointsEarned = 0;
    }
    io.emit('game:resetToLobby');
    io.emit('host:playersUpdated', Object.values(gameState.players));
  });

  socket.on('admin:kickPlayer', ({ playerId }) => {
    if (gameState.players[playerId]) {
      const sockId = gameState.players[playerId].socketId;
      delete gameState.players[playerId];
      delete gameState.answersCurrentQuestion[playerId];
      if (sockId) io.to(sockId).emit('player:kicked');
      io.emit('host:playersUpdated', Object.values(gameState.players));
    }
  });

  // Disconnessione (NON cancella il punteggio, segna solo offline per consentire il reconnect!)
  socket.on('disconnect', () => {
    const pid = socketToPlayerId[socket.id];
    if (pid && gameState.players[pid]) {
      gameState.players[pid].connected = false;
      delete socketToPlayerId[socket.id];
      // Notifica solo aggiornamento presenze senza azzerare
      io.emit('host:playersUpdated', Object.values(gameState.players));
    }
  });
});

server.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIpAddresses();
  console.log(`\n======================================================`);
  console.log(`🎯 UNIME QUIZ NIGHT (Morgana & ORUM) ATTIVO SU PORTA ${PORT}`);
  console.log(`🖥️  SCHERMO PRINCIPALE (Host): http://localhost:${PORT}/host`);
  console.log(`📱 PARTECIPANTI (Mobile):      http://${ips[0] || 'localhost'}:${PORT}`);
  console.log(`⚙️  REGIA / ADMIN:             http://localhost:${PORT}/admin`);
  console.log(`======================================================\n`);
});
