const socket = io();

// UI Elements
const screens = {
  lobby: document.getElementById('screen-lobby'),
  countdown: document.getElementById('screen-countdown'),
  question: document.getElementById('screen-question'),
  leaderboard: document.getElementById('screen-leaderboard'),
  finalReveal: document.getElementById('screen-final-reveal'),
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
  } else if (state.status === 'FINAL_REVEAL') {
    renderFinalReveal(state.leaderboard || [], state.finalRevealStep || 0, state.totalNonPodium || 0, false);
  } else if (state.status === 'PODIUM') {
    renderPodium(state.leaderboard || [], state.podiumStep || 0, false);
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
  document.getElementById('answers-badge').textContent = `Risposte: 0 / ${data.totalPlayers || 0}`;

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
  if (timeRemaining <= 5 && timeRemaining > 0) {
    timerDisplay.classList.add('danger');
    window.sounds.playTick();
  } else if (timeRemaining === 0) {
    timerDisplay.classList.remove('danger');
  }
});

// Answers Count Updated
socket.on('game:answersCountUpdated', ({ answeredCount, totalPlayers }) => {
  document.getElementById('answers-badge').textContent = `Risposte: ${answeredCount} / ${totalPlayers}`;
});

// Answer Revealed
socket.on('game:answerRevealed', ({ correctIndex, explanation, answerStats, leaderboard }) => {
  window.sounds.playCorrect();

  // Ferma e azzera il timer visivo immediatamente
  const timerDisplay = document.getElementById('timer-display');
  if (timerDisplay) {
    timerDisplay.textContent = '0';
    timerDisplay.classList.remove('danger');
  }

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

// Button next action (prossima domanda diretta)
const btnNextAction = document.getElementById('btn-next-action');
if (btnNextAction) {
  btnNextAction.addEventListener('click', () => {
    socket.emit('admin:nextQuestion');
  });
}

// Button mostra classifica (opzionale)
const btnShowLeaderboard = document.getElementById('btn-show-leaderboard');
if (btnShowLeaderboard) {
  btnShowLeaderboard.addEventListener('click', () => {
    socket.emit('admin:showLeaderboard');
  });
}

// Leaderboard Render Helper
function renderLeaderboard(leaderboard, isLastQuestion) {
  showScreen('leaderboard');
  const listEl = document.getElementById('leaderboard-list');
  listEl.innerHTML = '';

  const topPlayers = (leaderboard || []).slice(0, 10);

  // Se ci sono più di 5 squadre (es. fino a 10), attiva griglia a 2 colonne a tutta larghezza
  if (topPlayers.length > 5) {
    listEl.classList.add('grid-layout');
  } else {
    listEl.classList.remove('grid-layout');
  }

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
  if (btnNext) {
    if (isLastQuestion) {
      btnNext.textContent = '🏆 CLASSIFICA FINALE ➡️';
    } else {
      btnNext.textContent = 'PROSSIMA DOMANDA ➡️';
    }
  }
}

socket.on('game:leaderboard', ({ leaderboard, isLastQuestion }) => {
  renderLeaderboard(leaderboard, isLastQuestion);
});

document.getElementById('btn-next-question').addEventListener('click', () => {
  socket.emit('admin:next');
});

// Stato locale finale
let currentFinaleState = {
  leaderboard: [],
  finalRevealStep: 0,
  totalNonPodium: 0,
  podiumStep: 0
};

// Svelamento Progressivo Classifica Finale (posizioni N down to 4)
function renderFinalReveal(leaderboard, finalRevealStep, totalNonPodium, isLiveEvent = false) {
  currentFinaleState.leaderboard = leaderboard || [];
  currentFinaleState.finalRevealStep = finalRevealStep || 0;
  currentFinaleState.totalNonPodium = totalNonPodium || 0;

  showScreen('finalReveal');

  const nonPodium = (leaderboard || []).slice(3);
  const revealOrder = [...nonPodium].reverse();
  const subEl = document.getElementById('finale-status-sub');
  const actionBar = document.getElementById('finale-action-bar');
  const grid = document.getElementById('final-reveal-grid');

  if (grid) grid.innerHTML = '';

  if (finalRevealStep === 0) {
    if (subEl) subEl.textContent = 'Premi un tasto per iniziare lo svelamento delle posizioni...';
    if (actionBar) actionBar.style.display = 'none';
  } else if (finalRevealStep < totalNonPodium) {
    const nextRank = revealOrder[finalRevealStep] ? revealOrder[finalRevealStep].rank : 4;
    if (subEl) subEl.textContent = `Svelamento in corso... (${finalRevealStep}/${totalNonPodium}) • Prossima posizione: #${nextRank}`;
    if (actionBar) actionBar.style.display = 'none';
  } else {
    if (subEl) subEl.textContent = '👑 Posizioni svelate! Pronti per il Podio dei Vincitori!';
    if (actionBar) actionBar.style.display = 'flex';
  }

  const countToShow = Math.min(finalRevealStep, revealOrder.length);
  for (let i = 0; i < countToShow; i++) {
    const p = revealOrder[i];
    const card = document.createElement('div');
    card.className = 'final-reveal-card';
    if (i === finalRevealStep - 1) {
      card.classList.add('highlight');
    }
    const streakBadge = p.streak > 1 ? `<span class="streak-badge" style="font-size:0.85rem; padding:4px 8px;">🔥 x${p.streak}</span>` : '';
    card.innerHTML = `
      <div class="rank-badge">#${p.rank}</div>
      <div class="avatar">${p.avatar}</div>
      <div class="nick">${p.nickname}</div>
      ${streakBadge}
      <div class="score">${(p.score || 0).toLocaleString()} pt</div>
    `;
    if (grid) grid.appendChild(card);
  }

  if (isLiveEvent && finalRevealStep > 0) {
    window.sounds.playReveal();
  }
}

socket.on('game:finalReveal', ({ leaderboard, finalRevealStep, totalNonPodium }) => {
  renderFinalReveal(leaderboard, finalRevealStep, totalNonPodium, true);
});

const btnFinaleToPodium = document.getElementById('btn-finale-to-podium');
if (btnFinaleToPodium) {
  btnFinaleToPodium.addEventListener('click', () => {
    socket.emit('admin:advanceFinale');
  });
}

// Podium Render Helper con svelamento a step (3°, poi 2°, poi 1°)
function renderPodium(leaderboard, podiumStep = 0, isLiveEvent = false) {
  currentFinaleState.leaderboard = leaderboard || [];
  currentFinaleState.podiumStep = podiumStep;

  showScreen('podium');

  const p1 = (leaderboard || [])[0];
  const p2 = (leaderboard || [])[1];
  const p3 = (leaderboard || [])[2];

  const subEl = document.getElementById('podium-status-sub');
  if (podiumStep === 0) {
    if (subEl) subEl.textContent = 'In attesa di svelare il 3° Posto...';
  } else if (podiumStep === 1) {
    if (subEl) subEl.textContent = '🥉 3° Posto Svelato! In attesa del 2° Posto...';
  } else if (podiumStep === 2) {
    if (subEl) subEl.textContent = '🥈 2° Posto Svelato! In attesa del Vincitore Assoluto...';
  } else {
    if (subEl) subEl.textContent = '👑 ECCO I CAMPIONI ASSOLUTI DI UNIME LEVEL UP! 👑';
  }

  // 3° Posto (Bronzo)
  const step3 = document.getElementById('podium-step-3');
  const mystery3 = document.getElementById('podium-mystery-3');
  const content3 = document.getElementById('podium-content-3');
  if (podiumStep >= 1 && p3) {
    if (mystery3) mystery3.style.display = 'none';
    if (content3) content3.style.display = 'block';
    if (step3) {
      step3.classList.remove('mystery');
      step3.classList.add('revealed');
    }
    const av3 = document.getElementById('podium-avatar-3');
    const nm3 = document.getElementById('podium-name-3');
    const pt3 = document.getElementById('podium-pts-3');
    if (av3) av3.textContent = p3.avatar || '🥉';
    if (nm3) nm3.textContent = p3.nickname;
    if (pt3) pt3.textContent = `${(p3.score || 0).toLocaleString()} pt`;
    if (isLiveEvent && podiumStep === 1) {
      window.sounds.playBronze();
      if (typeof confetti === 'function') {
        confetti({ particleCount: 50, angle: 60, spread: 50, origin: { x: 0.8, y: 0.7 } });
      }
    }
  } else {
    if (mystery3) mystery3.style.display = 'flex';
    if (content3) content3.style.display = 'none';
    if (step3) {
      step3.classList.add('mystery');
      step3.classList.remove('revealed');
    }
  }

  // 2° Posto (Argento)
  const step2 = document.getElementById('podium-step-2');
  const mystery2 = document.getElementById('podium-mystery-2');
  const content2 = document.getElementById('podium-content-2');
  if (podiumStep >= 2 && p2) {
    if (mystery2) mystery2.style.display = 'none';
    if (content2) content2.style.display = 'block';
    if (step2) {
      step2.classList.remove('mystery');
      step2.classList.add('revealed');
    }
    const av2 = document.getElementById('podium-avatar-2');
    const nm2 = document.getElementById('podium-name-2');
    const pt2 = document.getElementById('podium-pts-2');
    if (av2) av2.textContent = p2.avatar || '🥈';
    if (nm2) nm2.textContent = p2.nickname;
    if (pt2) pt2.textContent = `${(p2.score || 0).toLocaleString()} pt`;
    if (isLiveEvent && podiumStep === 2) {
      window.sounds.playSilver();
      if (typeof confetti === 'function') {
        confetti({ particleCount: 65, angle: 120, spread: 50, origin: { x: 0.2, y: 0.7 } });
      }
    }
  } else {
    if (mystery2) mystery2.style.display = 'flex';
    if (content2) content2.style.display = 'none';
    if (step2) {
      step2.classList.add('mystery');
      step2.classList.remove('revealed');
    }
  }

  // 1° Posto (Oro - Vincitore)
  const step1 = document.getElementById('podium-step-1');
  const mystery1 = document.getElementById('podium-mystery-1');
  const content1 = document.getElementById('podium-content-1');
  if (podiumStep >= 3 && p1) {
    if (mystery1) mystery1.style.display = 'none';
    if (content1) content1.style.display = 'block';
    if (step1) {
      step1.classList.remove('mystery');
      step1.classList.add('revealed');
    }
    const av1 = document.getElementById('podium-avatar-1');
    const nm1 = document.getElementById('podium-name-1');
    const pt1 = document.getElementById('podium-pts-1');
    if (av1) av1.textContent = p1.avatar || '🥇';
    if (nm1) nm1.textContent = p1.nickname;
    if (pt1) pt1.textContent = `${(p1.score || 0).toLocaleString()} pt`;
    if (isLiveEvent && podiumStep === 3) {
      window.sounds.playPodiumFanfare();
      fireConfetti();
    }
  } else {
    if (mystery1) mystery1.style.display = 'flex';
    if (content1) content1.style.display = 'none';
    if (step1) {
      step1.classList.add('mystery');
      step1.classList.remove('revealed');
    }
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

socket.on('game:podium', ({ leaderboard, podiumStep }) => {
  renderPodium(leaderboard, podiumStep, true);
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
        socket.emit('admin:nextQuestion');
      } else {
        socket.emit('admin:revealNow');
      }
    } else if (screens.leaderboard.classList.contains('active')) {
      socket.emit('admin:nextQuestion');
    } else if (screens.finalReveal && screens.finalReveal.classList.contains('active')) {
      socket.emit('admin:advanceFinale');
    } else if (screens.podium && screens.podium.classList.contains('active')) {
      if (currentFinaleState.podiumStep < 3) {
        socket.emit('admin:advanceFinale');
      } else {
        fireConfetti();
      }
    }
  } else if (e.code === 'KeyC' || e.code === 'KeyL') {
    // Tasto rapido C (Classifica) o L (Leaderboard) durante lo show
    if (screens.question.classList.contains('active')) {
      const expBox = document.getElementById('explanation-box');
      if (expBox && expBox.style.display !== 'none') {
        socket.emit('admin:showLeaderboard');
      }
    }
  }
});

window.addEventListener('keyup', (e) => {
  if (e.code === 'Space' || e.key === ' ') {
    e.preventDefault();
    e.stopPropagation();
  }
});
