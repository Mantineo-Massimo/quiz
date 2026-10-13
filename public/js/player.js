const socket = io();

// Views
const views = {
  join: document.getElementById('view-join'),
  waiting: document.getElementById('view-waiting'),
  question: document.getElementById('view-question'),
  answered: document.getElementById('view-answered'),
  result: document.getElementById('view-round-result'),
  gameOver: document.getElementById('view-game-over')
};

function showView(name) {
  Object.keys(views).forEach(key => {
    if (views[key]) {
      views[key].classList.toggle('active', key === name);
    }
  });
}

// State
let selectedAvatar = '🎓';
let playerNickname = '';
let isJoined = false;

// Persistent player ID generato una sola volta per dispositivo
let myPlayerId = '';
try {
  myPlayerId = localStorage.getItem('unime_quiz_pid');
  if (!myPlayerId) {
    myPlayerId = 'p_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    localStorage.setItem('unime_quiz_pid', myPlayerId);
  }
} catch (e) {
  myPlayerId = 'p_' + Date.now();
}

// Avatar Selector
const avatarBtns = document.querySelectorAll('.avatar-btn');
avatarBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    avatarBtns.forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
    selectedAvatar = btn.getAttribute('data-avatar');
    if (navigator.vibrate) navigator.vibrate(20);
  });
});

// Restore saved nickname if present
try {
  const savedNick = localStorage.getItem('unime_quiz_nick');
  const savedAvatar = localStorage.getItem('unime_quiz_avatar');
  if (savedNick) {
    document.getElementById('input-nickname').value = savedNick;
    playerNickname = savedNick;
  }
  if (savedAvatar) {
    selectedAvatar = savedAvatar;
    avatarBtns.forEach(b => {
      b.classList.toggle('selected', b.getAttribute('data-avatar') === savedAvatar);
    });
  }
} catch (e) {}

// Auto-riconnessione immediata se l'utente aveva già inserito il nickname (anche su Ctrl+F5)
socket.on('connect', () => {
  try {
    const savedNick = localStorage.getItem('unime_quiz_nick');
    if (savedNick && !isJoined) {
      socket.emit('player:join', {
        nickname: savedNick,
        avatar: selectedAvatar,
        playerId: myPlayerId
      });
    }
  } catch (e) {}
});

// Join Game
const btnJoin = document.getElementById('btn-join');
const inputNick = document.getElementById('input-nickname');

btnJoin.addEventListener('click', handleJoin);
inputNick.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleJoin();
});

function handleJoin() {
  const nick = inputNick.value.trim();
  if (!nick) {
    inputNick.focus();
    inputNick.style.borderColor = '#ef4444';
    return;
  }

  window.sounds.init();
  playerNickname = nick;
  try {
    localStorage.setItem('unime_quiz_nick', nick);
    localStorage.setItem('unime_quiz_avatar', selectedAvatar);
  } catch (e) {}

  socket.emit('player:join', { nickname: nick, avatar: selectedAvatar, playerId: myPlayerId });
}

socket.on('player:joined', ({ nickname, avatar, status, score, streak }) => {
  isJoined = true;

  // Mostra display LCD della pulsantiera
  const lcdDisplay = document.getElementById('lcd-display');
  if (lcdDisplay) {
    lcdDisplay.style.display = 'flex';
    document.getElementById('lcd-nickname').textContent = nickname;
    document.getElementById('lcd-avatar').textContent = avatar;
    document.getElementById('lcd-score-num').textContent = (score || 0).toLocaleString();
  }

  document.getElementById('my-avatar-display').textContent = avatar;
  document.getElementById('my-nick-display').textContent = `Pulsantiera: ${nickname}`;

  if (status === 'LOBBY' || status === 'COUNTDOWN' || status === 'LEADERBOARD') {
    showView('waiting');
  }
});

// Question Started
let currentTotalTime = 20;
socket.on('game:questionStarted', (data) => {
  if (!isJoined) return;
  showView('question');
  if (navigator.vibrate) navigator.vibrate([40, 60]);

  document.getElementById('player-cat-badge').textContent = data.category || 'UniMe';
  document.getElementById('player-q-counter').textContent = `Q: ${data.questionIndex + 1}/${data.totalQuestions}`;

  // Reset timer bar
  currentTotalTime = data.timeLimit || 20;
  const timerFill = document.getElementById('player-timer-fill');
  timerFill.style.transition = 'none';
  timerFill.style.width = '100%';
  setTimeout(() => {
    timerFill.style.transition = `width ${currentTotalTime}s linear`;
    timerFill.style.width = '0%';
  }, 50);

  // Set option texts
  for (let i = 0; i < 4; i++) {
    const optLabel = document.getElementById(`btn-opt-${i}-text`);
    if (optLabel) optLabel.textContent = data.options[i] || '';
  }
});

// Option Click (Dr. Why pad buttons)
const padButtons = document.querySelectorAll('.drwhy-pad-btn');
padButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const optIndex = parseInt(btn.getAttribute('data-opt'), 10);
    if (navigator.vibrate) navigator.vibrate([50, 50]);
    socket.emit('player:submitAnswer', { optionIndex: optIndex });
  });
});

socket.on('player:answerAck', () => {
  showView('answered');
});

// Round Result
socket.on('player:roundResult', ({ isCorrect, pointsEarned, totalScore, streak, rank, totalPlayers }) => {
  if (!isJoined) return;
  showView('result');

  // Aggiorna LCD
  document.getElementById('lcd-score-num').textContent = totalScore.toLocaleString();
  document.getElementById('lcd-rank-text').textContent = `POSIZIONE: #${rank} / ${totalPlayers}`;

  const resultBox = document.getElementById('result-box');
  const emoji = document.getElementById('result-emoji');
  const title = document.getElementById('result-status');
  const pts = document.getElementById('result-pts');
  const streakEl = document.getElementById('result-streak');
  const rankEl = document.getElementById('result-rank');

  resultBox.className = 'round-result-card ' + (isCorrect ? 'correct' : 'wrong');

  if (isCorrect) {
    window.sounds.playCorrect();
    emoji.textContent = '⚡';
    title.textContent = 'ESATTO!';
    title.style.color = '#22c55e';
    pts.textContent = `+${pointsEarned} Punti`;
    streakEl.textContent = streak > 1 ? `🔥 SERIE PERFETTA: ${streak} DI FILA!` : '';
  } else {
    window.sounds.playWrong();
    emoji.textContent = '❌';
    title.textContent = 'RISPOSTA ERRATA!';
    title.style.color = '#e11d48';
    pts.textContent = '+0 Punti';
    streakEl.textContent = 'Recupera con la prossima!';
  }

  rankEl.textContent = `TABELLONE: #${rank} su ${totalPlayers} (${totalScore.toLocaleString()} pt)`;
});

// Leaderboard / Waiting state
socket.on('game:leaderboard', () => {
  if (!isJoined) return;
  showView('waiting');
  document.getElementById('my-nick-display').textContent = 'Guarda il Tabellone!';
  document.querySelector('.waiting-sub').textContent = 'Punteggi e posizioni sul maxischermo...';
});

// Countdown state
socket.on('game:countdown', () => {
  if (!isJoined) return;
  showView('waiting');
  document.getElementById('my-nick-display').textContent = 'Dita sui pulsanti!';
  document.querySelector('.waiting-sub').textContent = 'La prossima domanda del Dr. Why sta per partire...';
});

// Podium / Game Over
socket.on('game:podium', ({ leaderboard }) => {
  if (!isJoined) return;
  showView('gameOver');

  const myRankInfo = leaderboard.find(p => p.nickname === playerNickname);
  const statsBox = document.getElementById('final-stats-box');

  if (myRankInfo) {
    statsBox.innerHTML = `
      <div style="font-size: 1.8rem; color: var(--accent-gold); margin-bottom: 6px;">#${myRankInfo.rank} CLASSIFICATO</div>
      <div>Punteggio Finale: <strong>${myRankInfo.score.toLocaleString()} pt</strong></div>
    `;
  }
});

// Reset to Lobby
socket.on('game:resetToLobby', () => {
  if (isJoined) {
    showView('waiting');
    document.getElementById('my-nick-display').textContent = 'Nuova Partita!';
    document.querySelector('.waiting-sub').textContent = 'In attesa dell\'avvio del Dr. Why...';
  } else {
    showView('join');
  }
});

// Kicked by Admin
socket.on('player:kicked', () => {
  isJoined = false;
  showView('join');
  alert('Pulsantiera disconnessa dall\'organizzatore.');
});
