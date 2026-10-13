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

// Fullscreen Automatico & Gestione Schermo
function requestPhoneFullscreen() {
  const el = document.documentElement;
  if (!document.fullscreenElement && !document.webkitFullscreenElement) {
    if (el.requestFullscreen) {
      el.requestFullscreen().catch(() => {});
    } else if (el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
    } else if (el.msRequestFullscreen) {
      el.msRequestFullscreen();
    }
  }
}

function exitPhoneFullscreen() {
  if (document.exitFullscreen) {
    document.exitFullscreen().catch(() => {});
  } else if (document.webkitExitFullscreen) {
    document.webkitExitFullscreen();
  }
}

function togglePhoneFullscreen() {
  if (document.fullscreenElement || document.webkitFullscreenElement) {
    exitPhoneFullscreen();
  } else {
    requestPhoneFullscreen();
  }
}

// Aggancia pulsante schermo intero nell'header
const btnPlayerFs = document.getElementById('btn-player-fs');
if (btnPlayerFs) {
  btnPlayerFs.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePhoneFullscreen();
  });
}

function updateFsButtonLabel() {
  if (btnPlayerFs) {
    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    btnPlayerFs.textContent = isFs ? '✕ Riduci' : '⛶ Schermo Intero';
  }
}
document.addEventListener('fullscreenchange', updateFsButtonLabel);
document.addEventListener('webkitfullscreenchange', updateFsButtonLabel);

// Al primissimo tocco ovunque sullo schermo attiva lo schermo intero per non squadrare la grafica
let hasAttemptedAutoFs = false;
function onFirstUserInteraction() {
  if (!hasAttemptedAutoFs) {
    hasAttemptedAutoFs = true;
    requestPhoneFullscreen();
  }
}
window.addEventListener('touchstart', onFirstUserInteraction, { passive: true });
window.addEventListener('click', onFirstUserInteraction, { passive: true });

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
    requestPhoneFullscreen();
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

// Funzione di Auto-riconnessione immediata della pulsantiera
function tryAutoJoin() {
  try {
    const savedNick = localStorage.getItem('unime_quiz_nick');
    if (savedNick && !isJoined) {
      // Mostra subito la schermata di attesa/pulsantiera evitando il form di login
      document.getElementById('my-nick-display').textContent = `Pulsantiera: ${savedNick}`;
      showView('waiting');

      socket.emit('player:join', {
        nickname: savedNick,
        avatar: selectedAvatar,
        playerId: myPlayerId
      });
    }
  } catch (e) {}
}

if (socket.connected) {
  tryAutoJoin();
}
socket.on('connect', tryAutoJoin);

// Join Game
const btnJoin = document.getElementById('btn-join');
const inputNick = document.getElementById('input-nickname');

btnJoin.addEventListener('click', handleJoin);
inputNick.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleJoin();
});

function handleJoin() {
  requestPhoneFullscreen();
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

// Consenti di cambiare nickname se lo desidera
const btnEditTeam = document.getElementById('btn-edit-team');
if (btnEditTeam) {
  btnEditTeam.addEventListener('click', () => {
    showView('join');
    inputNick.focus();
  });
}

socket.on('player:joined', (data) => {
  isJoined = true;

  // Mostra display LCD della pulsantiera (senza punteggio)
  const lcdDisplay = document.getElementById('lcd-display');
  if (lcdDisplay) {
    lcdDisplay.style.display = 'flex';
    document.getElementById('lcd-nickname').textContent = data.nickname;
    document.getElementById('lcd-avatar').textContent = data.avatar;
  }

  document.getElementById('my-avatar-display').textContent = data.avatar;
  document.getElementById('my-nick-display').textContent = `Pulsantiera: ${data.nickname}`;

  if (data.status === 'LOBBY' || data.status === 'COUNTDOWN') {
    showView('waiting');
  } else if (data.status === 'QUESTION') {
    if (data.playerAnswer !== undefined) {
      answerSubmitted = true;
      showView('answered');
    } else {
      answerSubmitted = false;
      showView('question');
    }
  } else if (data.status === 'SHOW_ANSWER') {
    // I giocatori vedono solo la risposta inviata, senza punteggi sul telefono
    showView('answered');
  } else if (data.status === 'LEADERBOARD') {
    showView('waiting');
    document.getElementById('my-nick-display').textContent = 'Guarda il Maxischermo!';
    document.querySelector('.waiting-sub').textContent = 'Classifica proiettata in sala...';
  } else if (data.status === 'PODIUM') {
    showView('gameOver');
  }
});

// Question Started
let currentTotalTime = 20;
let answerSubmitted = false;

socket.on('game:questionStarted', (data) => {
  if (!isJoined) return;
  answerSubmitted = false;
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

// Option Click (Pulsanti risposta arcade)
const padButtons = document.querySelectorAll('.arcade-pad-btn');
padButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    if (answerSubmitted) return;
    answerSubmitted = true;
    const optIndex = parseInt(btn.getAttribute('data-opt'), 10);
    if (navigator.vibrate) navigator.vibrate([50, 50]);
    socket.emit('player:submitAnswer', { optionIndex: optIndex });
    showView('answered');
  });
});

socket.on('player:answerAck', () => {
  answerSubmitted = true;
  showView('answered');
});

// Round Result
// Round Result: i giocatori vedono solo che la risposta è stata inviata, niente punteggi
socket.on('player:roundResult', ({ isCorrect }) => {
  if (!isJoined) return;
  showView('answered');
  if (isCorrect) {
    window.sounds.playCorrect();
  } else {
    window.sounds.playWrong();
  }
});

// Leaderboard / Waiting state
socket.on('game:leaderboard', () => {
  if (!isJoined) return;
  showView('waiting');
  document.getElementById('my-nick-display').textContent = 'Guarda il Maxischermo!';
  document.querySelector('.waiting-sub').textContent = 'Classifica proiettata in sala...';
});

// Countdown state
socket.on('game:countdown', () => {
  if (!isJoined) return;
  showView('waiting');
  document.getElementById('my-nick-display').textContent = 'Dita sui pulsanti!';
  document.querySelector('.waiting-sub').textContent = 'La prossima domanda sta per partire...';
});

// Podium / Game Over
socket.on('game:podium', () => {
  if (!isJoined) return;
  showView('gameOver');
});

// Reset to Lobby
socket.on('game:resetToLobby', () => {
  if (isJoined) {
    showView('waiting');
    document.getElementById('my-nick-display').textContent = 'Nuova Partita!';
    document.querySelector('.waiting-sub').textContent = 'In attesa dell\'avvio del quiz show...';
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
