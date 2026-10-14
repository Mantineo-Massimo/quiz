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
  cors: { origin: '*' },
  pingInterval: 3000,
  pingTimeout: 4000
});

const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
let customPublicUrl = process.env.PUBLIC_URL || '';

// Database Persistente su Disco (sopravvive a riavvii, crash e ricaricamenti)
const db = require('./database');
const gameState = db.state;

// Sessioni autenticate attive in memoria (Admin / Host)
const validSessions = new Set();

// Parser leggero dei cookie HTTP
function parseCookies(req) {
  const list = {};
  const cookieHeader = req && req.headers && req.headers.cookie;
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.split('=');
    if (!name) return;
    const key = name.trim();
    list[key] = decodeURIComponent(rest.join('=').trim());
  });
  return list;
}

// Recupera la password amministratore configurata (.env o salvata in db.json)
function getAdminPassword() {
  return process.env.ADMIN_PASSWORD || db.state.adminPassword || 'unime2026';
}

function isValidSessionToken(token) {
  if (!token || typeof token !== 'string') return false;
  return validSessions.has(token);
}

function isAuthenticated(req) {
  const cookies = parseCookies(req);
  if (isValidSessionToken(cookies.auth_token)) return true;

  const authHeader = req.headers && req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim();
    if (isValidSessionToken(bearer)) return true;
  }
  return false;
}

// Middleware per pagine HTML riservate (/admin, /host)
function requireAuthPage(req, res, next) {
  if (isAuthenticated(req)) {
    return next();
  }
  const redirectTarget = encodeURIComponent(req.originalUrl || '/admin');
  return res.redirect(`/login?redirect=${redirectTarget}`);
}

// Middleware per API REST riservate (/api/accounts, /api/players, ecc.)
function requireAuthApi(req, res, next) {
  if (isAuthenticated(req)) {
    return next();
  }
  return res.status(401).json({ error: 'Accesso non autorizzato. Autenticazione richiesta.' });
}

app.use(express.json());

// Intercetta accessi diretti a file statici sensibili prima che vengano serviti liberamente
app.use((req, res, next) => {
  const normalizedPath = (req.path || '').toLowerCase();
  if (normalizedPath === '/admin.html' || normalizedPath === '/host.html') {
    if (!isAuthenticated(req)) {
      const target = normalizedPath === '/host.html' ? '/host' : '/admin';
      return res.redirect(`/login?redirect=${encodeURIComponent(target)}`);
    }
  }
  next();
});

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

// Calcolo Punti ad altissima precisione basato su correttezza, tempo di risposta al millisecondo e streak
function calculateScore(timeSpentMs, timeLimitMs, isCorrect, streak) {
  if (!isCorrect) return 0;
  // Tempo rimanente continuo: più veloce rispondi (timeSpentMs basso), più punti ottieni
  const ratio = Math.max(0, Math.min(1, 1 - (timeSpentMs / timeLimitMs)));
  const basePoints = 500;
  const speedBonus = Math.round(500 * ratio); // 0 .. 500 continui (senza pari merito banali)
  const streakBonus = Math.min((streak || 0) * 50, 250);
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
  const baseUrl = customPublicUrl || clientOrigin || detectedPublicUrl || localUrl;
  const playUrl = `${baseUrl.replace(/\/+$/, '')}/play`;

  try {
    const qrDataUrl = await QRCode.toDataURL(playUrl, {
      margin: 2,
      scale: 8,
      color: {
        dark: '#090e1a',
        light: '#ffffff'
      }
    });
    res.json({ ips, port: PORT, url: playUrl, baseUrl, qrDataUrl });
  } catch (err) {
    res.json({ ips, port: PORT, url: playUrl, baseUrl, qrDataUrl: '' });
  }
});

// Endpoints di Autenticazione & Sicurezza
app.get('/login', (req, res) => {
  if (isAuthenticated(req)) {
    const redirectTarget = req.query.redirect || '/admin';
    return res.redirect(redirectTarget);
  }
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/api/login', (req, res) => {
  const { password } = req.body || {};
  const currentPassword = getAdminPassword();

  if (password && password.trim() === currentPassword.trim()) {
    const token = crypto.randomBytes(32).toString('hex');
    validSessions.add(token);

    // Imposta cookie di sessione (validità 30 giorni, HttpOnly, SameSite Lax)
    res.setHeader('Set-Cookie', `auth_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000`);
    console.log('🔓 [Sicurezza] Accesso autenticato con successo (token generato).');
    return res.json({ success: true, token });
  }

  console.warn('⛔ [Sicurezza] Tentativo di accesso fallito: password errata.');
  return res.status(401).json({ error: 'Password non valida. Riprova.' });
});

app.post('/api/logout', (req, res) => {
  const cookies = parseCookies(req);
  if (cookies.auth_token) {
    validSessions.delete(cookies.auth_token);
  }
  res.setHeader('Set-Cookie', 'auth_token=; Path=/; HttpOnly; SameSite=Lax; Expires=Thu, 01 Jan 1970 00:00:00 GMT');
  console.log('🚪 [Sicurezza] Sessione disconnessa.');
  return res.json({ success: true });
});

app.post('/api/change-password', requireAuthApi, (req, res) => {
  const { newPassword } = req.body || {};
  if (!newPassword || newPassword.trim().length < 4) {
    return res.status(400).json({ error: 'La nuova password deve contenere almeno 4 caratteri.' });
  }
  db.state.adminPassword = newPassword.trim();
  db.save();
  console.log('🔑 [Sicurezza] Nuova password di amministrazione impostata e salvata.');
  return res.json({ success: true, message: 'Password aggiornata con successo!' });
});

app.post('/api/set-url', requireAuthApi, (req, res) => {
  const { url } = req.body;
  customPublicUrl = url || '';
  const effectiveBase = customPublicUrl || `http://${getLocalIpAddresses()[0] || 'localhost'}:${PORT}`;
  const effectivePlayUrl = `${effectiveBase.replace(/\/+$/, '')}/play`;
  io.emit('network:updated', { url: effectivePlayUrl, baseUrl: effectiveBase });
  res.json({ success: true, url: customPublicUrl, playUrl: effectivePlayUrl });
});

app.get('/api/questions', (req, res) => {
  res.json(questions);
});

app.get('/api/questions/pool', (req, res) => {
  res.json(questionsManager.getPoolStats());
});

app.post('/api/questions/generate-weighted', requireAuthApi, (req, res) => {
  const targetCount = Math.min(Math.max(parseInt(req.body.count || 20, 10), 4), 40);
  questions = questionsManager.generateWeightedGameQuestions(targetCount);
  questionsManager.saveActiveQuestions(questions);
  console.log(`🎲 Generate ${questions.length} nuove domande ponderate con opzioni mescolate`);
  io.emit('game:questionsUpdated', questions);
  sendSyncState();
  res.json({ success: true, count: questions.length, questions });
});

app.post('/api/questions', requireAuthApi, (req, res) => {
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
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.get('/play', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'play.html'));
});

// Maxischermo Host protetto: solo chi ha la password può visualizzarlo
app.get('/host', requireAuthPage, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'host.html'));
});

// Pannello Regia protetto: solo chi ha la password può accedere
app.get('/admin', requireAuthPage, (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// API Archivio Storico Account (Permanenti) - Protette
app.get('/api/accounts', requireAuthApi, (req, res) => {
  res.json(Object.values(gameState.accounts || {}));
});

app.post('/api/accounts/:id', requireAuthApi, (req, res) => {
  const { id } = req.params;
  const updated = db.upsertAccount({ ...req.body, id });
  if (updated) {
    emitPlayersUpdated();
    io.to(id).emit('player:accountUpdated', updated);
    res.json({ success: true, account: updated });
  } else {
    res.status(404).json({ error: 'Account non trovato' });
  }
});

app.delete('/api/accounts/:id', requireAuthApi, (req, res) => {
  const { id } = req.params;
  const deleted = db.deleteAccount(id);
  if (deleted) {
    io.to(id).emit('player:accountDeleted');
    emitPlayersUpdated();
    sendSyncState();
    res.json({ success: true, id });
  } else {
    res.status(404).json({ error: 'Account non trovato' });
  }
});

// Export CSV Archivio Completo Account o Partita Corrente (Riservato Admin)
app.get('/api/accounts/export-csv', requireAuthApi, (req, res) => {
  const accounts = Object.values(gameState.accounts || {});
  
  const headers = [
    'ID', 'Nome', 'Cognome', 'Nickname Gioco', 'Telefono', 'Email',
    'Stato', 'Regione', 'Provincia', 'Città',
    'Iscritto UniMe', 'Matricola', 'Dipartimento', 'Corso di Laurea', 'Anno di Corso',
    'Avatar', 'Data Registrazione', 'Ultimo Aggiornamento'
  ];

  function escapeCsv(val) {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  }

  const rows = accounts.map(a => [
    escapeCsv(a.id),
    escapeCsv(a.firstName || ''),
    escapeCsv(a.lastName || ''),
    escapeCsv(a.nickname || ''),
    escapeCsv(a.phone || ''),
    escapeCsv(a.email || ''),
    escapeCsv(a.country || 'Italia'),
    escapeCsv(a.region || ''),
    escapeCsv(a.province || ''),
    escapeCsv(a.city || ''),
    escapeCsv(a.isUnime ? 'SÌ' : 'NO'),
    escapeCsv(a.matricola || ''),
    escapeCsv(a.department || ''),
    escapeCsv(a.course || ''),
    escapeCsv(a.academicYear || ''),
    escapeCsv(a.avatar || ''),
    escapeCsv(a.createdAt || ''),
    escapeCsv(a.updatedAt || '')
  ].join(','));

  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
  const filename = `archivio_account_unime_${new Date().toISOString().slice(0, 10)}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csvContent);
});

// API Partecipanti Attivi nella Sessione (Riservato Admin)
app.get('/api/players', requireAuthApi, (req, res) => {
  res.json(Object.values(gameState.players));
});

app.get('/api/players/export-csv', requireAuthApi, (req, res) => {
  const players = Object.values(gameState.players);
  
  const headers = [
    'ID', 'Nome', 'Cognome', 'Nickname Gioco', 'Telefono', 'Email',
    'Stato', 'Regione', 'Provincia', 'Città',
    'Iscritto UniMe', 'Matricola', 'Dipartimento', 'Corso di Laurea', 'Anno di Corso',
    'Punteggio Quiz', 'Streak Max', 'Connesso', 'Avatar', 'Data Registrazione'
  ];

  function escapeCsv(val) {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  }

  const rows = players.map(p => [
    escapeCsv(p.id),
    escapeCsv(p.firstName || ''),
    escapeCsv(p.lastName || ''),
    escapeCsv(p.nickname || ''),
    escapeCsv(p.phone || ''),
    escapeCsv(p.email || ''),
    escapeCsv(p.country || 'Italia'),
    escapeCsv(p.region || ''),
    escapeCsv(p.province || ''),
    escapeCsv(p.city || ''),
    escapeCsv(p.isUnime ? 'SÌ' : 'NO'),
    escapeCsv(p.matricola || ''),
    escapeCsv(p.department || ''),
    escapeCsv(p.course || ''),
    escapeCsv(p.academicYear || ''),
    escapeCsv(p.score || 0),
    escapeCsv(p.streak || 0),
    escapeCsv(p.connected ? 'SÌ' : 'NO'),
    escapeCsv(p.avatar || ''),
    escapeCsv(p.registeredAt || '')
  ].join(','));

  const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
  const filename = `partecipanti_unime_level_up_${new Date().toISOString().slice(0, 10)}.csv`;

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csvContent);
});

// Helper per inviare la lista dei giocatori (Lobby maxischermo & Regia completa)
function emitPlayersUpdated() {
  const allPlayers = Object.values(gameState.players);
  const activePlayers = allPlayers.filter(p => p.connected);
  const allAccounts = Object.values(gameState.accounts || {});
  io.emit('host:playersUpdated', activePlayers);
  io.emit('admin:playersUpdated', allPlayers);
  io.emit('admin:accountsUpdated', allAccounts);
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
    isPaused: !!gameState.isPaused,
    expectedVotersCount: gameState.expectedVotersCount || 0,
    leaderboard
  };

  if (target && typeof target.emit === 'function') {
    target.emit('game:syncState', payload);
  } else {
    io.emit('game:syncState', payload);
  }
}

// Gestione Bot di Prova e Simulazione
let botTimeouts = [];
function clearBotTimeouts() {
  botTimeouts.forEach(t => clearTimeout(t));
  botTimeouts = [];
}

const BOT_PRESETS = [
  { name: 'MatricolaBot 🎓', avatar: '🤖', dept: 'Dipartimento di Ingegneria', course: 'Ingegneria Informatica' },
  { name: 'Esse3Bot 💻', avatar: '🦁', dept: 'Dipartimento di Economia', course: 'Economia Aziendale' },
  { name: 'MensaErsuBot 🍝', avatar: '🍕', dept: 'Dipartimento di Giurisprudenza', course: 'Giurisprudenza' },
  { name: 'MorganaBot 🏛️', avatar: '⚡', dept: 'Dipartimento di Scienze Politiche e Giuridiche', course: 'Scienze Politiche' },
  { name: 'OrumBot 📚', avatar: '🦉', dept: 'Dipartimento di Civiltà Antiche e Moderne', course: 'Lettere' },
  { name: 'CusSportBot ⚽', avatar: '🏆', dept: 'Dipartimento di Scienze Biomediche, Odontoiatriche', course: 'Scienze Motorie' }
];

function spawnBots(count = 6) {
  const chosen = BOT_PRESETS.slice(0, count);
  chosen.forEach((b, idx) => {
    const botId = `bot_${idx + 1}`;
    const botData = {
      id: botId,
      nickname: b.name,
      avatar: b.avatar,
      firstName: b.name.split(' ')[0],
      lastName: 'Bot',
      phone: '333000000' + idx,
      email: `bot${idx + 1}@studenti.unime.it`,
      isUnime: true,
      matricola: `50000${idx + 1}`,
      department: b.dept,
      course: b.course,
      academicYear: '1° Anno',
      score: 0,
      streak: 0,
      connected: true,
      waitingRoom: false,
      isBot: true,
      registeredAt: new Date().toISOString()
    };
    gameState.players[botId] = botData;
    db.upsertAccount(botData);
  });
  db.save();
  emitPlayersUpdated();
  sendSyncState();
  console.log(`🤖 [Bot Simulator] Generati ${chosen.length} Bot di Prova nella sessione.`);
}

function removeBots() {
  clearBotTimeouts();
  let count = 0;
  for (const pid of Object.keys(gameState.players)) {
    if (gameState.players[pid].isBot) {
      delete gameState.players[pid];
      if (gameState.answersCurrentQuestion) delete gameState.answersCurrentQuestion[pid];
      count++;
    }
  }
  for (const pid of Object.keys(gameState.accounts || {})) {
    if (gameState.accounts[pid].isBot) {
      delete gameState.accounts[pid];
    }
  }
  db.save();
  emitPlayersUpdated();
  sendSyncState();
  console.log(`🤖 [Bot Simulator] Rimossi ${count} Bot di Prova.`);
}

// Timer Gestione Domande con supporto Pausa
function startQuestionTimer() {
  if (gameState.timerInterval) clearInterval(gameState.timerInterval);

  const currentQ = questions[gameState.currentQuestionIndex];
  const timeLimit = currentQ ? currentQ.timeLimit || 20 : 20;

  if (!gameState.timeRemaining || gameState.timeRemaining <= 0) {
    gameState.timeRemaining = timeLimit;
  }

  gameState.timerInterval = setInterval(() => {
    if (gameState.isPaused) {
      // Se il timer è in pausa per spiegazioni del presentatore, non decrementare
      return;
    }

    gameState.timeRemaining -= 1;
    io.emit('game:timerTick', { 
      timeRemaining: gameState.timeRemaining, 
      timeLimit, 
      isPaused: !!gameState.isPaused 
    });

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
  clearBotTimeouts();

  gameState.status = 'SHOW_ANSWER';
  gameState.timeRemaining = 0;
  gameState.isPaused = false;

  const currentQ = questions[gameState.currentQuestionIndex];
  if (!currentQ) return;

  const timeLimitMs = (currentQ.timeLimit || 20) * 1000;

  // Notifica subito a tutti che il tempo è terminato
  io.emit('game:timerTick', { timeRemaining: 0, timeLimit: currentQ.timeLimit || 20, isPaused: false });

  // Calcolo punti ad alta precisione con millisecondi, serie e penalità malus per chi sbaglia
  const PENALTY_WRONG_ANSWER = 200; // Punti persi per risposta errata

  for (const pid of Object.keys(gameState.players)) {
    const player = gameState.players[pid];
    const playerAnswer = gameState.answersCurrentQuestion[pid];
    const isCorrect = (playerAnswer !== undefined && playerAnswer === currentQ.correctIndex);

    if (isCorrect) {
      player.streak = (player.streak || 0) + 1;
      const responseMs = player.lastAnswerTimeMs !== undefined ? player.lastAnswerTimeMs : timeLimitMs;
      const pts = calculateScore(responseMs, timeLimitMs, true, player.streak);
      player.score = (player.score || 0) + pts;
      player.lastPointsEarned = pts;
    } else {
      player.streak = 0;
      if (playerAnswer !== undefined) {
        // Ha risposto in modo errato: perde punti (minimo 0 per fair play)
        const penalty = -PENALTY_WRONG_ANSWER;
        player.score = Math.max(0, (player.score || 0) + penalty);
        player.lastPointsEarned = penalty;
        console.log(`❌ [Malus Errore] ${player.nickname} (${pid}) ha sbagliato: -${PENALTY_WRONG_ANSWER} punti (Totale: ${player.score})`);
      } else {
        // Tempo scaduto senza aver toccato pulsanti
        player.lastPointsEarned = 0;
      }
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
  clearBotTimeouts();
  gameState.status = 'COUNTDOWN';
  gameState.isPaused = false;
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
  clearBotTimeouts();
  gameState.status = 'QUESTION';
  gameState.answersCurrentQuestion = {};
  gameState.answerStats = [0, 0, 0, 0];
  gameState.isPaused = false;
  gameState.questionStartTime = Date.now();

  const currentQ = questions[gameState.currentQuestionIndex];
  if (!currentQ) {
    startFinale();
    return;
  }

  // Calibrazione tempo: se la domanda è molto lunga, dai almeno 25s di tempo
  const totalLength = (currentQ.question || '').length + (currentQ.options || []).join('').length;
  if (!currentQ.timeLimit && totalLength > 160) {
    currentQ.timeLimit = 25;
  }

  // Ammetti in gara tutti i giocatori che erano in sala d'attesa per questa nuova domanda
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
  gameState.timeLimitMs = gameState.timeRemaining * 1000;

  // Conta i giocatori ammessi e registrati per questa manche
  const activePlayers = Object.values(gameState.players).filter(p => p.connected && !p.waitingRoom);
  const totalPlayers = Math.max(1, activePlayers.length);
  gameState.expectedVotersCount = totalPlayers;

  db.save(); // SALVA NEL DATABASE

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

  // Se ci sono bot attivi, pianifica le loro risposte realistiche scaglionate
  const activeBots = Object.values(gameState.players).filter(p => p.isBot && p.connected && !p.waitingRoom);
  if (activeBots.length > 0) {
    activeBots.forEach(bot => {
      // Tempo di reazione casuale tra 2.2s e (timeLimit - 2)s
      const maxDelay = Math.max(4000, (gameState.timeRemaining - 2.5) * 1000);
      const delayMs = Math.floor(2200 + Math.random() * (maxDelay - 2200));
      const t = setTimeout(() => {
        if (gameState.status === 'QUESTION' && !gameState.answersCurrentQuestion[bot.id]) {
          // 75% probabilità risposta corretta
          const pickCorrect = Math.random() < 0.75;
          const choice = pickCorrect ? currentQ.correctIndex : Math.floor(Math.random() * 4);
          processPlayerAnswer(bot.id, choice);
        }
      }, delayMs);
      botTimeouts.push(t);
    });
  }
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

// Middleware Socket.IO per autenticare connessioni di amministrazione e host
io.use((socket, next) => {
  const cookies = parseCookies(socket.request);
  const token = socket.handshake.auth?.token || cookies.auth_token;
  socket.data.isAdmin = isValidSessionToken(token);
  next();
});

// Helper per verificare autorizzazione admin sui comandi Socket.IO
function isAuthorizedAdminSocket(socket, actionName = 'comando admin') {
  if (socket.data && socket.data.isAdmin) return true;
  // Controllo secondario per token inviato nell'auth payload o cookie aggiornato
  const cookies = parseCookies(socket.request);
  const token = socket.handshake.auth?.token || cookies.auth_token;
  if (isValidSessionToken(token)) {
    socket.data.isAdmin = true;
    return true;
  }
  console.warn(`🔒 [Sicurezza Socket] Rifiutato ${actionName} da client non autorizzato (${socket.id}).`);
  socket.emit('auth:unauthorized', { error: 'Azione non consentita: autenticazione riservata.' });
  return false;
}

// Socket.io Handlers
io.on('connection', (socket) => {
  // Sync completo immediato a chiunque si colleghi (Host, Admin, Player ricaricati)
  sendSyncState(socket);
  socket.emit('host:playersUpdated', Object.values(gameState.players).filter(p => p.connected));
  socket.emit('admin:playersUpdated', Object.values(gameState.players));

  // Giocatore si registra o si riconnette
  socket.on('player:join', (data = {}) => {
    const {
      nickname, avatar, playerId,
      firstName, lastName, phone, email,
      country, region, province, city,
      isUnime, matricola, department, course, academicYear
    } = data;

    const fallbackNick = `${firstName || ''} ${lastName || ''}`.trim() || 'Matricola';
    const cleanNick = (nickname || fallbackNick).trim().slice(0, 16);
    let pid = playerId || `p_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    // Cerca se esiste già per playerId
    let player = gameState.players[pid];

    // Se non trovato per ID, cerca se esiste già registrato con email o nickname (recupero sessione)
    if (!player) {
      if (email) {
        const byEmail = Object.values(gameState.players).find(
          p => p.email && p.email.toLowerCase() === email.toLowerCase().trim()
        );
        if (byEmail) {
          player = byEmail;
          pid = byEmail.id;
          console.log(`🔄 Sessione recuperata via email: '${email}' -> ID: ${pid}`);
        }
      }
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
    }

    socketToPlayerId[socket.id] = pid;
    socket.join(pid); // Unisce alla stanza del suo playerId

    const isGameInProgress = gameState.status !== 'LOBBY';

    if (player) {
      // Giocatore già nel DB: riconnessione o aggiornamento dati
      player.socketId = socket.id;
      player.connected = true;

      // Il nome squadra si può cambiare SOLO se la partita non è iniziata o se il giocatore è in sala d'attesa!
      const canChangeName = (gameState.status === 'LOBBY' || player.waitingRoom);
      if (nickname && canChangeName) player.nickname = cleanNick;
      if (avatar && canChangeName) player.avatar = avatar;

      if (firstName) player.firstName = firstName.trim();
      if (lastName) player.lastName = lastName.trim();
      if (phone) player.phone = phone.trim();
      if (email) player.email = email.trim();
      if (country) player.country = country.trim();
      if (region) player.region = region.trim();
      if (province) player.province = province.trim();
      if (city) player.city = city.trim();
      if (isUnime !== undefined) player.isUnime = !!isUnime;
      if (matricola !== undefined) player.matricola = matricola.trim();
      if (department !== undefined) player.department = department.trim();
      if (course !== undefined) player.course = course.trim();
      if (academicYear !== undefined) player.academicYear = academicYear.trim();
    } else {
      // Nuovo partecipante! Se la partita è già iniziata, mettilo in sala d'attesa fino alla prossima domanda
      const isWaiting = isGameInProgress;
      player = {
        id: pid,
        socketId: socket.id,
        nickname: cleanNick,
        avatar: avatar || '🎓',
        firstName: (firstName || '').trim(),
        lastName: (lastName || '').trim(),
        phone: (phone || '').trim(),
        email: (email || '').trim(),
        country: (country || 'Italia').trim(),
        region: (region || '').trim(),
        province: (province || '').trim(),
        city: (city || '').trim(),
        isUnime: (isUnime !== undefined) ? !!isUnime : true,
        matricola: (matricola || '').trim(),
        department: (department || '').trim(),
        course: (course || '').trim(),
        academicYear: (academicYear || '').trim(),
        registeredAt: new Date().toISOString(),
        score: 0,
        streak: 0,
        connected: true,
        waitingRoom: isWaiting,
        lastAnswer: null,
        lastAnswerTime: 0,
        lastPointsEarned: 0
      };
      gameState.players[pid] = player;
      console.log(`👤 Nuovo giocatore registrato: ${cleanNick} (${player.firstName} ${player.lastName} - ${player.isUnime ? 'UniMe ' + player.department : 'Esterno'}) [${pid}]`);
    }

    db.upsertAccount(player);
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

  // Funzione unificata per processare la risposta con tempo al millisecondo
  function processPlayerAnswer(pid, optionIndex, socketInstance = null) {
    if (gameState.status !== 'QUESTION') {
      console.log(`[submitAnswer] Risposta rifiutata per stato ${gameState.status}`);
      return;
    }

    const player = gameState.players[pid];
    if (!player || player.waitingRoom) return;

    player.connected = true;

    if (!gameState.answersCurrentQuestion) gameState.answersCurrentQuestion = {};
    if (gameState.answersCurrentQuestion[pid] !== undefined) {
      // Ha già risposto: rimanda ack senza duplicare
      if (socketInstance) {
        socketInstance.emit('player:answerAck', { optionIndex: gameState.answersCurrentQuestion[pid] });
      } else {
        io.to(pid).emit('player:answerAck', { optionIndex: gameState.answersCurrentQuestion[pid] });
      }
      return;
    }

    const timeSpentMs = Math.max(0, Date.now() - (gameState.questionStartTime || Date.now()));
    gameState.answersCurrentQuestion[pid] = optionIndex;
    player.lastAnswer = optionIndex;
    player.lastAnswerTimeMs = timeSpentMs;
    player.lastAnswerTime = Math.max(0, gameState.timeRemaining);

    if (optionIndex >= 0 && optionIndex < 4) {
      if (!gameState.answerStats) gameState.answerStats = [0, 0, 0, 0];
      gameState.answerStats[optionIndex]++;
    }

    db.save(); // PERSISTE RISPOSTA SUBITO SU DISCO

    // Conta giocatori attivi (connessi e NON in sala d'attesa)
    const activePlayers = Object.values(gameState.players).filter(p => p.connected && !p.waitingRoom);
    const totalPlayers = Math.max(1, activePlayers.length);
    const answeredCount = Object.keys(gameState.answersCurrentQuestion).length;

    console.log(`[Risposta OK] ${player.nickname} (${pid}) -> Opzione ${optionIndex} in ${timeSpentMs}ms. (${answeredCount}/${totalPlayers})`);

    if (socketInstance) {
      socketInstance.emit('player:answerAck', { optionIndex });
    } else {
      io.to(pid).emit('player:answerAck', { optionIndex });
    }

    io.emit('game:answersCountUpdated', { answeredCount, totalPlayers });

    // Chiudi anticipatamente SOLO se tutti i votanti attesi registrati alla manche hanno risposto
    const expectedCount = gameState.expectedVotersCount || totalPlayers;
    if (answeredCount >= expectedCount && expectedCount > 0) {
      console.log(`[Tutti hanno risposto] ${answeredCount}/${expectedCount} risposte ricevute. Termino il tempo e svelo la risposta!`);
      revealAnswer();
    }
  }

  // Giocatore invia risposta
  socket.on('player:submitAnswer', ({ optionIndex, playerId }) => {
    const pid = playerId || socketToPlayerId[socket.id];
    if (!pid) {
      console.warn('[submitAnswer] Nessun playerId associabile al socket:', socket.id);
      return;
    }

    // Assicura associazione socket -> playerId e appartenenza alla stanza
    socketToPlayerId[socket.id] = pid;
    socket.join(pid);

    processPlayerAnswer(pid, optionIndex, socket);
  });

  // Pausa / Freeze del timer da Regia
  socket.on('admin:togglePause', () => {
    if (!isAuthorizedAdminSocket(socket, 'admin:togglePause')) return;
    if (gameState.status === 'QUESTION') {
      gameState.isPaused = !gameState.isPaused;
      console.log(`⏸️ [Admin Socket] Timer domanda ${gameState.isPaused ? 'SOSPESO IN PAUSA' : 'RIPRESO'}`);
      const currentQ = questions[gameState.currentQuestionIndex];
      io.emit('game:timerTick', { 
        timeRemaining: gameState.timeRemaining, 
        timeLimit: currentQ ? currentQ.timeLimit || 20 : 20, 
        isPaused: gameState.isPaused 
      });
      io.emit('game:pauseToggled', { isPaused: gameState.isPaused });
      sendSyncState();
    }
  });

  // Simulatore Bot di Prova per test maxischermo
  socket.on('admin:spawnBots', ({ count } = {}) => {
    if (!isAuthorizedAdminSocket(socket, 'admin:spawnBots')) return;
    spawnBots(count || 6);
  });

  socket.on('admin:removeBots', () => {
    if (!isAuthorizedAdminSocket(socket, 'admin:removeBots')) return;
    removeBots();
  });

  // Comandi Host / Admin (Riservati agli operatori autenticati)
  socket.on('admin:startGame', () => {
    if (!isAuthorizedAdminSocket(socket, 'admin:startGame')) return;
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
    if (!isAuthorizedAdminSocket(socket, 'admin:nextQuestion')) return;
    advanceToNextQuestion();
  });

  socket.on('admin:showLeaderboard', () => {
    if (!isAuthorizedAdminSocket(socket, 'admin:showLeaderboard')) return;
    showLeaderboard();
  });

  socket.on('admin:next', () => {
    if (!isAuthorizedAdminSocket(socket, 'admin:next')) return;
    if (gameState.status === 'SHOW_ANSWER') {
      advanceToNextQuestion();
    } else if (gameState.status === 'LEADERBOARD') {
      advanceToNextQuestion();
    } else if (gameState.status === 'FINAL_REVEAL' || gameState.status === 'PODIUM') {
      advanceFinale();
    }
  });

  socket.on('admin:revealNow', () => {
    if (!isAuthorizedAdminSocket(socket, 'admin:revealNow')) return;
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
    if (!isAuthorizedAdminSocket(socket, 'admin:advanceFinale')) return;
    advanceFinale();
  });

  socket.on('admin:skipToPodium', () => {
    if (!isAuthorizedAdminSocket(socket, 'admin:skipToPodium')) return;
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
    if (!isAuthorizedAdminSocket(socket, 'admin:revealAllPodium')) return;
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
    if (!isAuthorizedAdminSocket(socket, 'admin:showPodium')) return;
    startFinale();
  });

  socket.on('admin:resetLobby', () => {
    if (!isAuthorizedAdminSocket(socket, 'admin:resetLobby')) return;
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
    if (!isAuthorizedAdminSocket(socket, 'admin:generateWeightedQuestions')) return;
    const targetCount = Math.min(Math.max(parseInt(count || 20, 10), 4), 40);
    questions = questionsManager.generateWeightedGameQuestions(targetCount);
    questionsManager.saveActiveQuestions(questions);
    console.log(`🎲 [Socket Admin] Generate ${questions.length} nuove domande ponderate con opzioni mescolate`);
    io.emit('game:questionsUpdated', questions);
    sendSyncState();
  });

  socket.on('admin:clearAllPlayers', () => {
    if (!isAuthorizedAdminSocket(socket, 'admin:clearAllPlayers')) return;
    if (gameState.timerInterval) clearInterval(gameState.timerInterval);
    db.clearPlayers();
    io.emit('game:resetToLobby');
    emitPlayersUpdated();
    sendSyncState();
  });

  socket.on('admin:kickPlayer', ({ playerId }) => {
    if (!isAuthorizedAdminSocket(socket, 'admin:kickPlayer')) return;
    if (gameState.players[playerId]) {
      delete gameState.players[playerId];
      if (gameState.answersCurrentQuestion) delete gameState.answersCurrentQuestion[playerId];
      db.save();
      io.to(playerId).emit('player:kicked');
      emitPlayersUpdated();
      sendSyncState();
    }
  });

  // Gestione Account permanente (Modifica & Cancellazione - Solo Admin)
  socket.on('admin:updateAccount', (accountData) => {
    if (!isAuthorizedAdminSocket(socket, 'admin:updateAccount')) return;
    if (!accountData || !accountData.id) return;
    const updated = db.upsertAccount(accountData);
    if (updated) {
      console.log(`✏️ [Admin Socket] Account ${updated.id} (${updated.nickname}) modificato con successo.`);
      io.to(updated.id).emit('player:accountUpdated', updated);
      emitPlayersUpdated();
      sendSyncState();
    }
  });

  socket.on('admin:deleteAccount', ({ accountId }) => {
    if (!isAuthorizedAdminSocket(socket, 'admin:deleteAccount')) return;
    if (!accountId) return;
    console.log(`🗑️ [Admin Socket] Eliminazione account definitivo: ${accountId}`);
    const deleted = db.deleteAccount(accountId);
    if (deleted) {
      io.to(accountId).emit('player:accountDeleted');
      emitPlayersUpdated();
      sendSyncState();
    }
  });

  // Gestore unificato disconnessione / uscita giocatore
  function handlePlayerDisconnect(socketInstance) {
    const pid = socketToPlayerId[socketInstance.id];
    delete socketToPlayerId[socketInstance.id];

    if (pid && gameState.players[pid]) {
      // Disconnette se questo socket era quello associato al giocatore
      if (gameState.players[pid].socketId === socketInstance.id) {
        gameState.players[pid].connected = false;

        // Se siamo in LOBBY (la partita non è ancora iniziata),
        // chiudere la pagina significa abbandonare la stanza d'attesa.
        // Rimuoviamo il giocatore dalla lobby attiva (il suo account resta salvato nello storico 'accounts').
        if (gameState.status === 'LOBBY') {
          delete gameState.players[pid];
          console.log(`👋 [Lobby] Giocatore ${pid} ha chiuso la pagina ed è uscito dalla stanza d'attesa.`);
        }
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
  }

  // Notifica immediata di chiusura/navigazione pagina dal browser
  socket.on('player:leave', () => {
    handlePlayerDisconnect(socket);
  });

  // Disconnessione socket (chiusura finestra, caduta rete, timeout)
  socket.on('disconnect', () => {
    handlePlayerDisconnect(socket);
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
