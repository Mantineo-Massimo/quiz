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
}

// Fullscreen & Audio controls
const btnFullscreen = document.getElementById('btn-fullscreen');
btnFullscreen.addEventListener('click', () => {
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
    const res = await fetch('/api/network');
    const data = await res.json();
    const qrImg = document.getElementById('qr-image');
    const urlText = document.getElementById('join-url-text');
    if (data.qrDataUrl) {
      qrImg.src = data.qrDataUrl;
    }
    urlText.textContent = data.url;
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

// Leaderboard
socket.on('game:leaderboard', ({ leaderboard, isLastQuestion }) => {
  showScreen('leaderboard');
  const listEl = document.getElementById('leaderboard-list');
  listEl.innerHTML = '';

  const topPlayers = leaderboard.slice(0, 5);
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
      <div class="score">${p.score.toLocaleString()} pt</div>
    `;
    listEl.appendChild(row);
  });

  const btnNext = document.getElementById('btn-next-question');
  if (isLastQuestion) {
    btnNext.textContent = '🏆 VAI AL PODIO FINALE! (Spazio)';
  } else {
    btnNext.textContent = 'PROSSIMA DOMANDA ➡️ (Spazio)';
  }
});

document.getElementById('btn-next-question').addEventListener('click', () => {
  socket.emit('admin:next');
});

// Podium
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
  showScreen('podium');
  window.sounds.playPodiumFanfare();
  fireConfetti();

  const p1 = leaderboard[0];
  const p2 = leaderboard[1];
  const p3 = leaderboard[2];

  if (p1) {
    document.getElementById('podium-avatar-1').textContent = p1.avatar || '🥇';
    document.getElementById('podium-name-1').textContent = p1.nickname;
    document.getElementById('podium-pts-1').textContent = `${p1.score.toLocaleString()} pt`;
  }
  if (p2) {
    document.getElementById('podium-avatar-2').textContent = p2.avatar || '🥈';
    document.getElementById('podium-name-2').textContent = p2.nickname;
    document.getElementById('podium-pts-2').textContent = `${p2.score.toLocaleString()} pt`;
  }
  if (p3) {
    document.getElementById('podium-avatar-3').textContent = p3.avatar || '🥉';
    document.getElementById('podium-name-3').textContent = p3.nickname;
    document.getElementById('podium-pts-3').textContent = `${p3.score.toLocaleString()} pt`;
  }
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

// Scorciatoie da tastiera per l'Host (Spazio / Invio)
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'Enter') {
    // Evita se si sta scrivendo in un input
    if (e.target.tagName === 'INPUT') return;

    if (screens.lobby.classList.contains('active')) {
      socket.emit('admin:startGame');
    } else if (screens.question.classList.contains('active')) {
      const expBox = document.getElementById('explanation-box');
      if (expBox.style.display !== 'none') {
        socket.emit('admin:next');
      } else {
        // Se si preme spazio durante la domanda, rivela subito
        socket.emit('admin:revealNow');
      }
    } else if (screens.leaderboard.classList.contains('active')) {
      socket.emit('admin:next');
    }
  }
});
