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

// Carica e gestisce le domande da archivio ponderato
const questionsManager = require('./questionsManager');
const questionsPath = path.join(__dirname, 'questions.json');
let questions = questionsManager.loadOrGenerateActiveQuestions(20);

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

// Genera Classifica aggiornata (SOLO giocatori connessi e attivi nel gioco)
function getLeaderboard() {
  const list = Object.values(gameState.players)
    .filter(p => p.connected && !p.waitingRoom)
    .map(p => ({
      id: p.id,
      nickname: p.nickname,
      avatar: p.avatar,
      score: p.score || 0,
      streak: p.streak || 0,
      lastPointsEarned: p.lastPointsEarned || 0,
      connected: true
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

app.get('/api/questions/pool', (req, res) => {
  res.json(questionsManager.getPoolStats());
});

app.post('/api/questions/generate-weighted', (req, res) => {
  const targetCount = Math.min(Math.max(parseInt(req.body.count || 20, 10), 4), 40);
  questions = questionsManager.generateWeightedGameQuestions(targetCount);
  questionsManager.saveActiveQuestions(questions);
  console.log(`🎲 Generate ${questions.length} nuove domande ponderate con opzioni mescolate`);
  io.emit('game:questionsUpdated', questions);
  sendSyncState();
  res.json({ success: true, count: questions.length, questions });
});

app.post('/api/questions', (req, res) => {
  if (Array.isArray(req.body)) {
    questions = req.body;
    try {
      questionsManager.saveActiveQuestions(questions);
      io.emit('game:questionsUpdated', questions);
      sendSyncState();
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

// Helper per inviare la lista dei giocatori SOLO attualmente connessi (lobby & regia)
function emitPlayersUpdated() {
  const activePlayers = Object.values(gameState.players).filter(p => p.connected);
  io.emit('host:playersUpdated', activePlayers);
}

// Helper: invia syncState completo a un socket o a tutti
function sendSyncState(target) {
  const currentQ = questions[gameState.currentQuestionIndex];
  const leaderboard = getLeaderboard();
  const activePlayers = Object.values(gameState.players).filter(p => p.connected && !p.waitingRoom);
  const payload = {
    status: gameState.status,
    currentQuestionIndex: gameState.currentQuestionIndex,
    totalQuestions: questions.length,
    playerCount: activePlayers.length,
    connectedCount: activePlayers.length,
    timeRemaining: gameState.timeRemaining,
    currentQuestion: currentQ ? {
      questionIndex: gameState.currentQuestionIndex,
      totalQuestions: questions.length,
      category: currentQ.category,
      question: currentQ.question,
      options: currentQ.options,
      correctIndex: currentQ.correctIndex,
      explanation: currentQ.explanation,
      timeLimit: currentQ.timeLimit || 20
    } : null,
    correctIndex: currentQ ? currentQ.correctIndex : 0,
    explanation: currentQ ? (currentQ.explanation || '') : '',
    answerStats: gameState.answerStats || [0, 0, 0, 0],
    answeredCount: Object.keys(gameState.answersCurrentQuestion || {}).length,
    finalRevealStep: gameState.finalRevealStep || 0,
    podiumStep: gameState.podiumStep || 0,
    totalNonPodium: Math.max(0, leaderboard.length - 3),
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

  // Notifica subito a tutti che il tempo è a 0
  io.emit('game:timerTick', { timeRemaining: 0, timeLimit: currentQ.timeLimit || 20 });

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
  sendSyncState();

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
    startFinale();
    return;
  }

  // Ammetti in gara tutti i giocatori che erano in sala d'attesa per questa nuova domanda!
  let admittedCount = 0;
  for (const pid of Object.keys(gameState.players)) {
    const p = gameState.players[pid];
    if (p.waitingRoom) {
      p.waitingRoom = false;
      admittedCount++;
    }
  }
  if (admittedCount > 0) {
    console.log(`🎉 Ammessi ${admittedCount} giocatori dalla sala d'attesa alla Domanda ${gameState.currentQuestionIndex + 1}!`);
  }

  gameState.timeRemaining = currentQ.timeLimit || 20;
  db.save(); // SALVA NEL DATABASE

  // Conta i giocatori attivi e connessi nel gioco
  const activePlayers = Object.values(gameState.players).filter(p => p.connected && !p.waitingRoom);
  const totalPlayers = Math.max(1, activePlayers.length);

  // Notifica host e giocatori
  io.emit('game:questionStarted', {
    questionIndex: gameState.currentQuestionIndex,
    totalQuestions: questions.length,
    category: currentQ.category,
    question: currentQ.question,
    options: currentQ.options,
    timeLimit: gameState.timeRemaining,
    totalPlayers
  });

  io.emit('game:answersCountUpdated', { answeredCount: 0, totalPlayers });

  startQuestionTimer();
  sendSyncState();
  if (admittedCount > 0) emitPlayersUpdated();
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
  sendSyncState();
}

function startFinale() {
  if (gameState.timerInterval) clearInterval(gameState.timerInterval);
  const leaderboard = getLeaderboard();
  const nonPodiumCount = Math.max(0, leaderboard.length - 3);

  if (nonPodiumCount > 0) {
    gameState.status = 'FINAL_REVEAL';
    gameState.finalRevealStep = 0;
    gameState.podiumStep = 0;
    db.save();
    io.emit('game:finalReveal', {
      leaderboard,
      finalRevealStep: gameState.finalRevealStep,
      totalNonPodium: nonPodiumCount
    });
  } else {
    gameState.status = 'PODIUM';
    gameState.finalRevealStep = 0;
    gameState.podiumStep = 0;
    db.save();
    io.emit('game:podium', {
      leaderboard,
      podiumStep: gameState.podiumStep
    });
  }
  sendSyncState();
}

// Mappa socket.id -> playerId
const socketToPlayerId = {};

// Socket.io Handlers
io.on('connection', (socket) => {
  // Sync completo immediato a chiunque si colleghi (Host, Admin, Player ricaricati)
  sendSyncState(socket);
  socket.emit('host:playersUpdated', Object.values(gameState.players).filter(p => p.connected));

  // Giocatore si registra o si riconnette
  socket.on('player:join', ({ nickname, avatar, playerId }) => {
    const cleanNick = (nickname || 'Matricola').trim().slice(0, 16);
    let pid = playerId || `p_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    // Cerca se esiste già per playerId
    let player = gameState.players[pid];

    // Se non trovato per ID, cerca se esiste già registrato con lo stesso nickname (recupero sessione post-chiusura)
    if (!player && cleanNick) {
      const existing = Object.values(gameState.players).find(
        p => p.nickname.toLowerCase() === cleanNick.toLowerCase()
      );
      if (existing) {
        player = existing;
        pid = existing.id;
        console.log(`🔄 Sessione recuperata via nickname: '${cleanNick}' -> ID: ${pid}`);
      }
    }

    socketToPlayerId[socket.id] = pid;
    socket.join(pid); // Unisce alla stanza del suo playerId

    const isGameInProgress = gameState.status !== 'LOBBY';

    if (player) {
      // Giocatore già nel DB: riconnessione di giocatore esistente!
      player.socketId = socket.id;
      player.connected = true;

      // Il nome squadra si può cambiare SOLO se la partita non è iniziata o se il giocatore è in sala d'attesa!
      const canChangeName = (gameState.status === 'LOBBY' || player.waitingRoom);
      if (nickname && canChangeName) {
        player.nickname = cleanNick;
      }
      if (avatar && canChangeName) {
        player.avatar = avatar;
      }
    } else {
      // Nuovo partecipante! Se la partita è già iniziata, mettilo in sala d'attesa fino alla prossima domanda
      const isWaiting = isGameInProgress;
      player = {
        id: pid,
        socketId: socket.id,
        nickname: cleanNick,
        avatar: avatar || '🎓',
        score: 0,
        streak: 0,
        connected: true,
        waitingRoom: isWaiting,
        lastAnswer: null,
        lastAnswerTime: 0,
        lastPointsEarned: 0
      };
      gameState.players[pid] = player;
      console.log(`👤 Nuovo giocatore ${cleanNick} (${pid}) - ${isWaiting ? 'IN SALA D\'ATTESA (partita in corso)' : 'IN LOBBY'}`);
    }

    db.save(); // PERSISTE SUBITO SU DISCO
    emitPlayersUpdated();
    sendSyncState();

    const leaderboard = getLeaderboard();
    const rankInfo = leaderboard.find(p => p.id === pid);
    const currentQ = questions[gameState.currentQuestionIndex];
    const playerAns = gameState.answersCurrentQuestion ? gameState.answersCurrentQuestion[pid] : undefined;
    const isCorrect = (currentQ && playerAns !== undefined && playerAns === currentQ.correctIndex);

    // Se il giocatore è in sala d'attesa, notificalo subito e non inviare la domanda corrente!
    if (player.waitingRoom) {
      socket.emit('player:joined', {
        id: pid,
        nickname: player.nickname,
        avatar: player.avatar,
        status: 'WAITING_ROOM',
        isWaitingRoom: true,
        canChangeTeamName: true,
        currentQuestionIndex: gameState.currentQuestionIndex,
        totalQuestions: questions.length,
        score: 0,
        streak: 0,
        rank: 0,
        totalPlayers: leaderboard.length
      });
      return; // Stop: non mandare game:questionStarted!
    }

    const currentQData = (gameState.status === 'QUESTION' && currentQ) ? {
      questionIndex: gameState.currentQuestionIndex,
      totalQuestions: questions.length,
      category: currentQ.category,
      question: currentQ.question,
      options: currentQ.options,
      timeLimit: gameState.timeRemaining || currentQ.timeLimit || 20
    } : null;

    // Invia lo stato completo al giocatore ammesso in gara
    socket.emit('player:joined', {
      id: pid,
      nickname: player.nickname,
      avatar: player.avatar,
      status: gameState.status,
      isWaitingRoom: false,
      canChangeTeamName: (gameState.status === 'LOBBY'),
      score: player.score,
      streak: player.streak,
      rank: rankInfo ? rankInfo.rank : 1,
      totalPlayers: leaderboard.length,
      playerAnswer: playerAns,
      isCorrect: isCorrect,
      pointsEarned: player.lastPointsEarned,
      currentQuestion: currentQData
    });

    // Se c'è una domanda in corso per un giocatore già ammesso, inviala subito
    if (currentQData) {
      socket.emit('game:questionStarted', {
        ...currentQData,
        totalPlayers: leaderboard.length
      });
      if (playerAns !== undefined) {
        socket.emit('player:answerAck', { optionIndex: playerAns });
      }
    }
  });

  // Giocatore invia risposta
  socket.on('player:submitAnswer', ({ optionIndex, playerId }) => {
    if (gameState.status !== 'QUESTION') {
      console.log(`[submitAnswer] Risposta rifiutata per stato ${gameState.status}`);
      return;
    }
    const pid = playerId || socketToPlayerId[socket.id];
    if (!pid) {
      console.warn('[submitAnswer] Nessun playerId associabile al socket:', socket.id);
      return;
    }

    // Assicura associazione socket -> playerId e appartenenza alla stanza
    socketToPlayerId[socket.id] = pid;
    socket.join(pid);

    let player = gameState.players[pid];
    if (!player) return;

    // Chi è in sala d'attesa non partecipa alla domanda in corso
    if (player.waitingRoom) return;

    player.connected = true;

    if (!gameState.answersCurrentQuestion) gameState.answersCurrentQuestion = {};
    if (gameState.answersCurrentQuestion[pid] !== undefined) {
      // Ha già risposto: rimanda ack senza duplicare
      socket.emit('player:answerAck', { optionIndex: gameState.answersCurrentQuestion[pid] });
      return;
    }

    gameState.answersCurrentQuestion[pid] = optionIndex;
    player.lastAnswer = optionIndex;
    player.lastAnswerTime = gameState.timeRemaining;

    if (optionIndex >= 0 && optionIndex < 4) {
      if (!gameState.answerStats) gameState.answerStats = [0, 0, 0, 0];
      gameState.answerStats[optionIndex]++;
    }

    db.save(); // PERSISTE RISPOSTA SUBITO SU DISCO

    // Conta giocatori attivi (connessi e NON in sala d'attesa)
    const activePlayers = Object.values(gameState.players).filter(p => p.connected && !p.waitingRoom);
    const totalPlayers = Math.max(1, activePlayers.length);
    const answeredCount = Object.keys(gameState.answersCurrentQuestion).length;

    console.log(`[Risposta OK] ${player.nickname} (${pid}) -> Opzione ${optionIndex}. Progresso: ${answeredCount}/${totalPlayers}`);

    socket.emit('player:answerAck', { optionIndex });
    io.emit('game:answersCountUpdated', { answeredCount, totalPlayers });

    // Se tutti i partecipanti attivi hanno risposto, termina subito il tempo e svela la risposta!
    if (answeredCount >= totalPlayers && totalPlayers > 0) {
      console.log(`[Tutti hanno risposto] ${answeredCount}/${totalPlayers} risposte ricevute. Termino il tempo e svelo la risposta!`);
      revealAnswer();
    }
  });

  // Comandi Host / Admin
  socket.on('admin:startGame', () => {
    db.reset();
    for (const pid of Object.keys(gameState.players)) {
      gameState.players[pid].waitingRoom = false;
    }
    emitPlayersUpdated();
    startCountdown();
  });

  // Funzione per avanzare direttamente alla prossima domanda senza passare dalla classifica
  function advanceToNextQuestion() {
    if (gameState.currentQuestionIndex < questions.length - 1) {
      gameState.currentQuestionIndex++;
      startCountdown();
    } else {
      startFinale();
    }
  }

  socket.on('admin:nextQuestion', () => {
    advanceToNextQuestion();
  });

  socket.on('admin:showLeaderboard', () => {
    showLeaderboard();
  });

  socket.on('admin:next', () => {
    if (gameState.status === 'SHOW_ANSWER') {
      advanceToNextQuestion();
    } else if (gameState.status === 'LEADERBOARD') {
      advanceToNextQuestion();
    } else if (gameState.status === 'FINAL_REVEAL' || gameState.status === 'PODIUM') {
      advanceFinale();
    }
  });

  socket.on('admin:revealNow', () => {
    if (gameState.status === 'QUESTION') {
      revealAnswer();
    }
  });

  function advanceFinale() {
    const leaderboard = getLeaderboard();
    const nonPodiumCount = Math.max(0, leaderboard.length - 3);

    if (gameState.status === 'FINAL_REVEAL') {
      if (gameState.finalRevealStep < nonPodiumCount) {
        gameState.finalRevealStep++;
        db.save();
        io.emit('game:finalReveal', {
          leaderboard,
          finalRevealStep: gameState.finalRevealStep,
          totalNonPodium: nonPodiumCount
        });
      } else {
        // Passa al podio dei primi 3!
        gameState.status = 'PODIUM';
        gameState.podiumStep = 0;
        db.save();
        io.emit('game:podium', {
          leaderboard,
          podiumStep: gameState.podiumStep
        });
      }
      sendSyncState();
    } else if (gameState.status === 'PODIUM') {
      if (gameState.podiumStep < 3) {
        gameState.podiumStep++;
        db.save();
        io.emit('game:podium', {
          leaderboard,
          podiumStep: gameState.podiumStep
        });
        sendSyncState();
      }
    }
  }

  socket.on('admin:advanceFinale', () => {
    advanceFinale();
  });

  socket.on('admin:skipToPodium', () => {
    const leaderboard = getLeaderboard();
    gameState.status = 'PODIUM';
    gameState.podiumStep = 0;
    db.save();
    io.emit('game:podium', {
      leaderboard,
      podiumStep: gameState.podiumStep
    });
    sendSyncState();
  });

  socket.on('admin:revealAllPodium', () => {
    const leaderboard = getLeaderboard();
    gameState.status = 'PODIUM';
    gameState.podiumStep = 3;
    db.save();
    io.emit('game:podium', {
      leaderboard,
      podiumStep: 3
    });
    sendSyncState();
  });

  socket.on('admin:showPodium', () => {
    startFinale();
  });

  socket.on('admin:resetLobby', () => {
    if (gameState.timerInterval) clearInterval(gameState.timerInterval);
    db.reset();
    for (const p of Object.values(gameState.players)) {
      p.waitingRoom = false;
    }
    io.emit('game:resetToLobby');
    emitPlayersUpdated();
    sendSyncState();
  });

  socket.on('admin:generateWeightedQuestions', ({ count } = {}) => {
    const targetCount = Math.min(Math.max(parseInt(count || 20, 10), 4), 40);
    questions = questionsManager.generateWeightedGameQuestions(targetCount);
    questionsManager.saveActiveQuestions(questions);
    console.log(`🎲 [Socket Admin] Generate ${questions.length} nuove domande ponderate con opzioni mescolate`);
    io.emit('game:questionsUpdated', questions);
    sendSyncState();
  });

  socket.on('admin:clearAllPlayers', () => {
    if (gameState.timerInterval) clearInterval(gameState.timerInterval);
    db.clearPlayers();
    io.emit('game:resetToLobby');
    emitPlayersUpdated();
    sendSyncState();
  });

  socket.on('admin:kickPlayer', ({ playerId }) => {
    if (gameState.players[playerId]) {
      delete gameState.players[playerId];
      if (gameState.answersCurrentQuestion) delete gameState.answersCurrentQuestion[playerId];
      db.save();
      io.to(playerId).emit('player:kicked');
      emitPlayersUpdated();
      sendSyncState();
    }
  });

  // Disconnessione socket
  socket.on('disconnect', () => {
    const pid = socketToPlayerId[socket.id];
    delete socketToPlayerId[socket.id];
    if (pid && gameState.players[pid]) {
      // Disconnette solo se questo socket è quello registrato per il giocatore
      if (gameState.players[pid].socketId === socket.id) {
        gameState.players[pid].connected = false;
      }
      db.save();
      emitPlayersUpdated();
      sendSyncState();

      // Se c'è una domanda in corso, ricalcola i partecipanti e controlla se tutti gli attivi hanno risposto
      if (gameState.status === 'QUESTION') {
        const activePlayers = Object.values(gameState.players).filter(p => p.connected && !p.waitingRoom);
        const answeredCount = Object.keys(gameState.answersCurrentQuestion || {}).length;
        io.emit('game:answersCountUpdated', { answeredCount, totalPlayers: activePlayers.length });
        if (answeredCount >= activePlayers.length && activePlayers.length > 0) {
          revealAnswer();
        }
      }
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
