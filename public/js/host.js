const socket = io();

// UI Elements
const screens = {
  lobby: document.getElementById('screen-lobby'),
  countdown: document.getElementById('screen-countdown'),
  question: document.getElementById('screen-question'),
  leaderboard: document.getElementById('screen-leaderboard'),
  podium: document.getElementById('screen-podium')
};

function showScreen(name) {
  Object.keys(screens).forEach(key => {
    if (screens[key]) {
      screens[key].classList.toggle('active', key === name);
    }
  });
  window.scrollTo(0, 0);
}

// Ripristino stato completo su ricarica (Ctrl+F5)
socket.on('game:syncState', (state) => {
  if (state.status === 'LOBBY') {
    showScreen('lobby');
  } else if (state.status === 'COUNTDOWN') {
    showScreen('countdown');
  } else if (state.status === 'QUESTION' && state.currentQuestion) {
    showScreen('question');
    document.getElementById('category-badge').textContent = state.currentQuestion.category || 'UniMe';
    document.getElementById('question-index-badge').textContent = `DOMANDA ${state.currentQuestion.questionIndex + 1} / ${state.currentQuestion.totalQuestions}`;
    document.getElementById('question-text').textContent = state.currentQuestion.question;
    document.getElementById('timer-display').textContent = state.timeRemaining || state.currentQuestion.timeLimit;
    document.getElementById('explanation-box').style.display = 'none';
    const answeredCount = state.answeredCount || 0;
    const totalPlayers = state.playerCount || 0;
    document.getElementById('answers-badge').textContent = `Risposte: ${answeredCount} / ${totalPlayers}`;
    for (let i = 0; i < 4; i++) {
      const card = document.getElementById(`opt-${i}`);
      const text = document.getElementById(`opt-text-${i}`);
      const stats = document.getElementById(`opt-stats-${i}`);
      card.classList.remove('dimmed', 'correct');
      stats.style.display = 'none';
      if (text) text.textContent = state.currentQuestion.options[i] || '';
    }
  } else if (state.status === 'SHOW_ANSWER' && state.currentQuestion) {
    showScreen('question');
    document.getElementById('category-badge').textContent = state.currentQuestion.category || 'UniMe';
    document.getElementById('question-index-badge').textContent = `DOMANDA ${state.currentQuestion.questionIndex + 1} / ${state.currentQuestion.totalQuestions}`;
    document.getElementById('question-text').textContent = state.currentQuestion.question;
    document.getElementById('timer-display').textContent = '0';
    document.getElementById('answers-badge').textContent = 'Tempo Scaduto';
    for (let i = 0; i < 4; i++) {
      const card = document.getElementById(`opt-${i}`);
      const text = document.getElementById(`opt-text-${i}`);
      const stats = document.getElementById(`opt-stats-${i}`);
      if (text) text.textContent = state.currentQuestion.options[i] || '';
      if (i === state.correctIndex) {
        card.classList.add('correct');
        card.classList.remove('dimmed');
      } else {
        card.classList.add('dimmed');
        card.classList.remove('correct');
      }
      stats.style.display = 'block';
      stats.textContent = `👥 ${state.answerStats ? (state.answerStats[i] || 0) : 0}`;
    }
    document.getElementById('explanation-text-content').textContent = state.explanation || 'Ottima risposta!';
    document.getElementById('explanation-box').style.display = 'flex';
  } else if (state.status === 'LEADERBOARD') {
    renderLeaderboard(state.leaderboard || [], state.currentQuestionIndex >= state.totalQuestions - 1);
  } else if (state.status === 'PODIUM') {
    renderPodium(state.leaderboard || []);
  }
});

// Fullscreen & Audio controls
const btnFullscreen = document.getElementById('btn-fullscreen');
btnFullscreen.addEventListener('click', () => {
  btnFullscreen.blur();
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
});

const btnSound = document.getElementById('btn-sound');
btnSound.addEventListener('click', () => {
  const isMuted = window.sounds.toggleMute();
  btnSound.textContent = isMuted ? '🔇' : '🔊';
});

// Fetch Network Info & QR Code
async function loadNetworkInfo() {
  try {
    const origin = window.location.origin;
    const res = await fetch(`/api/network?origin=${encodeURIComponent(origin)}`);
    const data = await res.json();
    const qrImg = document.getElementById('qr-image');
    const urlText = document.getElementById('join-url-text');
    if (data.qrDataUrl) {
      qrImg.src = data.qrDataUrl;
    }
    urlText.textContent = data.url || origin;
  } catch (err) {
    console.error('Errore caricamento network:', err);
  }
}
loadNetworkInfo();

// Players Grid in Lobby
const playersGrid = document.getElementById('players-grid');
const playerCountText = document.getElementById('player-count-text');

socket.on('host:playersUpdated', (players) => {
  playerCountText.textContent = `${players.length} Giocator${players.length === 1 ? 'e' : 'i'}`;
  playersGrid.innerHTML = '';
  players.forEach(p => {
    const tag = document.createElement('div');
    tag.className = 'player-tag';
    tag.innerHTML = `<span class="avatar">${p.avatar}</span> <span>${p.nickname}</span>`;
    playersGrid.appendChild(tag);
  });
});

// Start Quiz Button
const btnStartQuiz = document.getElementById('btn-start-quiz');
btnStartQuiz.addEventListener('click', () => {
  window.sounds.init();
  socket.emit('admin:startGame');
});

// Countdown
const countdownNumber = document.getElementById('countdown-number');
socket.on('game:countdown', ({ count }) => {
  showScreen('countdown');
  countdownNumber.textContent = count;
  window.sounds.playCountdown();
});

// Question Started
let currentQuestionData = null;
socket.on('game:questionStarted', (data) => {
  currentQuestionData = data;
  showScreen('question');
  window.sounds.playQuestionStart();

  document.getElementById('category-badge').textContent = data.category || 'UniMe';
  document.getElementById('question-index-badge').textContent = `Domanda ${data.questionIndex + 1} di ${data.totalQuestions}`;
  document.getElementById('question-text').textContent = data.question;

  document.getElementById('timer-display').textContent = data.timeLimit;
  document.getElementById('timer-display').classList.remove('danger');
  document.getElementById('answers-badge').textContent = 'Risposte: 0 in attesa';

  // Nascondi spiegazione e statistiche precedenti
  document.getElementById('explanation-box').style.display = 'none';

  // Ripristina le 4 opzioni
  for (let i = 0; i < 4; i++) {
    const card = document.getElementById(`opt-${i}`);
    const text = document.getElementById(`opt-text-${i}`);
    const stats = document.getElementById(`opt-stats-${i}`);

    card.classList.remove('dimmed', 'correct');
    stats.style.display = 'none';
    stats.textContent = '0';
    text.textContent = data.options[i] || '';
  }
});

// Timer Tick
socket.on('game:timerTick', ({ timeRemaining }) => {
  const timerDisplay = document.getElementById('timer-display');
  timerDisplay.textContent = timeRemaining;
  if (timeRemaining <= 5) {
    timerDisplay.classList.add('danger');
    window.sounds.playTick();
  }
});

// Answers Count Updated
socket.on('game:answersCountUpdated', ({ answeredCount, totalPlayers }) => {
  document.getElementById('answers-badge').textContent = `Risposte: ${answeredCount} / ${totalPlayers}`;
});

// Answer Revealed
socket.on('game:answerRevealed', ({ correctIndex, explanation, answerStats, leaderboard }) => {
  window.sounds.playCorrect();

  // Evidenzia opzione corretta e oscura le altre
  for (let i = 0; i < 4; i++) {
    const card = document.getElementById(`opt-${i}`);
    const stats = document.getElementById(`opt-stats-${i}`);

    if (i === correctIndex) {
      card.classList.add('correct');
    } else {
      card.classList.add('dimmed');
    }

    stats.style.display = 'block';
    stats.textContent = `👥 ${answerStats[i] || 0}`;
  }

  // Mostra box spiegazione/curiosità
  const expBox = document.getElementById('explanation-box');
  document.getElementById('explanation-text-content').textContent = explanation || 'Ottima risposta!';
  expBox.style.display = 'flex';
});

// Button next action (dopo risposta va a leaderboard)
document.getElementById('btn-next-action').addEventListener('click', () => {
  socket.emit('admin:next');
});

// Leaderboard Render Helper
function renderLeaderboard(leaderboard, isLastQuestion) {
  showScreen('leaderboard');
  const listEl = document.getElementById('leaderboard-list');
  listEl.innerHTML = '';

  const topPlayers = (leaderboard || []).slice(0, 8);
  topPlayers.forEach(p => {
    const row = document.createElement('div');
    row.className = `leaderboard-row rank-${p.rank}`;

    let medal = `#${p.rank}`;
    if (p.rank === 1) medal = '🥇';
    else if (p.rank === 2) medal = '🥈';
    else if (p.rank === 3) medal = '🥉';

    const streakBadge = p.streak > 1 ? `<span class="streak-badge">🔥 x${p.streak}</span>` : '';

    row.innerHTML = `
      <div class="rank-num">${medal}</div>
      <div class="avatar">${p.avatar}</div>
      <div class="player-name">${p.nickname}</div>
      ${streakBadge}
      <div class="score">${(p.score || 0).toLocaleString()} pt</div>
    `;
    listEl.appendChild(row);
  });

  const btnNext = document.getElementById('btn-next-question');
  if (isLastQuestion) {
    btnNext.textContent = '🏆 VAI AL PODIO FINALE!';
  } else {
    btnNext.textContent = 'PROSSIMA DOMANDA ➡️';
  }
}

socket.on('game:leaderboard', ({ leaderboard, isLastQuestion }) => {
  renderLeaderboard(leaderboard, isLastQuestion);
});

document.getElementById('btn-next-question').addEventListener('click', () => {
  socket.emit('admin:next');
});

// Podium Render Helper
function renderPodium(leaderboard) {
  showScreen('podium');
  const p1 = (leaderboard || [])[0];
  const p2 = (leaderboard || [])[1];
  const p3 = (leaderboard || [])[2];

  if (p1) {
    document.getElementById('podium-avatar-1').textContent = p1.avatar || '🥇';
    document.getElementById('podium-name-1').textContent = p1.nickname;
    document.getElementById('podium-pts-1').textContent = `${(p1.score || 0).toLocaleString()} pt`;
  }
  if (p2) {
    document.getElementById('podium-avatar-2').textContent = p2.avatar || '🥈';
    document.getElementById('podium-name-2').textContent = p2.nickname;
    document.getElementById('podium-pts-2').textContent = `${(p2.score || 0).toLocaleString()} pt`;
  }
  if (p3) {
    document.getElementById('podium-avatar-3').textContent = p3.avatar || '🥉';
    document.getElementById('podium-name-3').textContent = p3.nickname;
    document.getElementById('podium-pts-3').textContent = `${(p3.score || 0).toLocaleString()} pt`;
  }
}

function fireConfetti() {
  if (typeof confetti === 'function') {
    confetti({
      particleCount: 120,
      spread: 90,
      origin: { y: 0.6 }
    });
    setTimeout(() => {
      confetti({
        particleCount: 80,
        angle: 60,
        spread: 60,
        origin: { x: 0 }
      });
      confetti({
        particleCount: 80,
        angle: 120,
        spread: 60,
        origin: { x: 1 }
      });
    }, 400);
  }
}

socket.on('game:podium', ({ leaderboard }) => {
  renderPodium(leaderboard);
  window.sounds.playPodiumFanfare();
  fireConfetti();
});

document.getElementById('btn-confetti-more').addEventListener('click', () => {
  fireConfetti();
});

document.getElementById('btn-restart-game').addEventListener('click', () => {
  socket.emit('admin:resetLobby');
});

socket.on('game:resetToLobby', () => {
  showScreen('lobby');
});

// Rimuovi il focus da qualsiasi elemento cliccato per evitare attivazioni indesiderate con Spazio
document.addEventListener('click', () => {
  if (document.activeElement && typeof document.activeElement.blur === 'function') {
    document.activeElement.blur();
  }
});

// Avanzamento riservato all'Host tramite Spazio / Invio
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.key === ' ' || e.code === 'Enter') {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;

    // FONDAMENTALE: blocca il comportamento default del browser (scroll pagina o click su pulsante con focus)
    e.preventDefault();
    e.stopPropagation();

    // Rimuove immediatamente il focus attivo da qualsiasi pulsante
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      document.activeElement.blur();
    }

    if (screens.lobby.classList.contains('active')) {
      socket.emit('admin:startGame');
    } else if (screens.question.classList.contains('active')) {
      const expBox = document.getElementById('explanation-box');
      if (expBox.style.display !== 'none') {
        socket.emit('admin:next');
      } else {
        socket.emit('admin:revealNow');
      }
    } else if (screens.leaderboard.classList.contains('active')) {
      socket.emit('admin:next');
    }
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'Space' || e.key === ' ') {
    e.preventDefault();
    e.stopPropagation();
  }
});
