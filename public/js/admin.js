const savedAdminToken = (function() {
  try { return sessionStorage.getItem('unime_admin_token') || ''; } catch(e){ return ''; }
})();
const socket = io({ auth: { token: savedAdminToken } });

socket.on('auth:unauthorized', () => {
  window.location.href = '/login?redirect=/admin';
});

// Tabs
const tabBtns = document.querySelectorAll('.tab-btn');
const panels = document.querySelectorAll('.admin-panel');

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    tabBtns.forEach(b => b.classList.remove('active'));
    panels.forEach(p => p.classList.remove('active'));

    btn.classList.add('active');
    const target = document.getElementById(btn.getAttribute('data-tab'));
    if (target) target.classList.add('active');
  });
});

// Live State Indicators & Hub
const statusText = document.getElementById('admin-status-text');
const qIndicator = document.getElementById('admin-q-indicator');
const answersIndicator = document.getElementById('admin-answers-indicator');

const hubPhaseBadge = document.getElementById('hub-phase-badge');
const hubActionTitle = document.getElementById('hub-action-title');
const hubActionDesc = document.getElementById('hub-action-desc');
const hubActionButtons = document.getElementById('hub-action-buttons');

const prompterSection = document.getElementById('admin-prompter-section');
const prompterCategory = document.getElementById('prompter-category-badge');
const prompterQNumber = document.getElementById('prompter-q-number');
const prompterQText = document.getElementById('prompter-question-text');
const prompterOptsList = document.getElementById('prompter-options-list');
const prompterExpBox = document.getElementById('prompter-explanation-box');
const prompterExpText = document.getElementById('prompter-explanation-text');

let lastState = null;

function renderPrompter(currentQ, currentIdx, totalQ) {
  if (!currentQ) {
    if (prompterSection) prompterSection.style.display = 'none';
    return;
  }
  if (prompterSection) prompterSection.style.display = 'block';
  if (prompterCategory) prompterCategory.textContent = currentQ.category || 'UniMe';
  if (prompterQNumber) prompterQNumber.textContent = `DOMANDA ${(currentIdx || 0) + 1} / ${totalQ || 15}`;
  if (prompterQText) prompterQText.textContent = currentQ.question || '';

  if (prompterOptsList && currentQ.options) {
    prompterOptsList.innerHTML = currentQ.options.map((opt, i) => {
      const isCorrect = (i === currentQ.correctIndex);
      return `
        <div class="prompter-opt-item ${isCorrect ? 'is-correct' : ''}">
          <span style="font-weight: 900; font-family: var(--font-mono);">${i + 1}.</span>
          <span style="flex: 1;">${opt}</span>
          ${isCorrect ? '<span style="font-size: 0.8rem; font-weight: 800; background: #10b981; color: #fff; padding: 2px 8px; border-radius: 6px;">CORRETTA ✅</span>' : ''}
        </div>
      `;
    }).join('');
  }

  if (prompterExpBox) {
    if (currentQ.explanation) {
      prompterExpBox.style.display = 'block';
      if (prompterExpText) prompterExpText.textContent = currentQ.explanation;
    } else {
      prompterExpBox.style.display = 'none';
    }
  }
}

function updateLiveStatus(state) {
  if (!state) return;
  lastState = state;

  updatePauseButtonUI(!!state.isPaused);

  const currentIdx = state.currentQuestionIndex || 0;
  const totalQ = state.totalQuestions || 15;
  const isLastQ = currentIdx >= totalQ - 1;

  if (state.status === 'LOBBY') {
    statusText.textContent = '🔵 LOBBY (In attesa)';
    statusText.style.color = 'var(--accent-gold)';
    qIndicator.textContent = '-';
    answersIndicator.textContent = '0 / 0';

    if (hubPhaseBadge) hubPhaseBadge.textContent = 'FASE: LOBBY D\'ATTESA';
    if (hubActionTitle) hubActionTitle.textContent = '🚀 Sei nella Lobby d\'Attesa';
    if (hubActionDesc) hubActionDesc.textContent = 'I partecipanti inquadrano il QR Code sullo schermo e scelgono avatar e nickname. Quando sei pronto per la prima domanda, avvia il gioco:';
    if (hubActionButtons) {
      hubActionButtons.innerHTML = `
        <button id="hub-btn-start" class="btn-hub-primary">
          🚀 AVVIA IL QUIZ (Inizia Domanda 1)
        </button>
      `;
      document.getElementById('hub-btn-start').onclick = () => {
        if (confirm('Vuoi avviare il quiz show partendo dalla prima domanda?')) {
          socket.emit('admin:startGame');
        }
      };
    }
    if (prompterSection) prompterSection.style.display = 'none';

  } else if (state.status === 'COUNTDOWN') {
    statusText.textContent = '⏳ COUNTDOWN 3.. 2.. 1..';
    statusText.style.color = '#38bdf8';
    if (hubPhaseBadge) hubPhaseBadge.textContent = 'FASE: COUNTDOWN IN CORSO';
    if (hubActionTitle) hubActionTitle.textContent = '⏳ Conto alla rovescia (3.. 2.. 1..)';
    if (hubActionDesc) hubActionDesc.textContent = 'La domanda sta per apparire su tutti gli schermi tra pochissimi istanti...';
    if (hubActionButtons) {
      hubActionButtons.innerHTML = `
        <div style="color: #38bdf8; font-weight: 700; padding: 12px 0;">⚡ Dita sui pulsanti, la domanda parte in automatico!</div>
      `;
    }

  } else if (state.status === 'QUESTION') {
    const timeRem = state.timeRemaining !== undefined ? state.timeRemaining : 20;
    statusText.textContent = `🟡 DOMANDA IN CORSO (${timeRem}s)`;
    statusText.style.color = '#eab308';
    qIndicator.textContent = `${currentIdx + 1} / ${totalQ}`;
    answersIndicator.textContent = `${state.answeredCount || 0} / ${state.playerCount || 0}`;

    if (hubPhaseBadge) hubPhaseBadge.textContent = `FASE: DOMANDA ${currentIdx + 1}/${totalQ}`;
    if (hubActionTitle) hubActionTitle.textContent = `⏱️ Domanda in corso (${timeRem}s rimasti)`;
    if (hubActionDesc) hubActionDesc.textContent = 'I partecipanti stanno rispondendo sul loro smartphone. Il tempo termina in automatico quando tutti rispondono. Se vuoi chiudere subito prima dello scadere del tempo:';
    if (hubActionButtons) {
      hubActionButtons.innerHTML = `
        <button id="hub-btn-reveal" class="btn-hub-primary" style="background: linear-gradient(135deg, #eab308 0%, #ca8a04 100%);">
          💡 SVELA RISPOSTA ADESSO (Interrompi Timer)
        </button>
      `;
      document.getElementById('hub-btn-reveal').onclick = () => socket.emit('admin:revealNow');
    }

    renderPrompter(state.currentQuestion, currentIdx, totalQ);

  } else if (state.status === 'SHOW_ANSWER') {
    statusText.textContent = '🟢 RISPOSTA SVELATA';
    statusText.style.color = '#10b981';
    answersIndicator.textContent = 'Completata';

    if (hubPhaseBadge) hubPhaseBadge.textContent = `FASE: RISPOSTA SVELATA (${currentIdx + 1}/${totalQ})`;
    if (hubActionTitle) hubActionTitle.textContent = '💡 Risposta e Curiosità a Schermo';
    if (hubActionDesc) hubActionDesc.textContent = 'Il maxischermo mostra l\'opzione corretta e la pillola UniMe. Scegli cosa fare adesso (la classifica NON apparirà se non la richiedi esplicitamente):';
    
    if (hubActionButtons) {
      hubActionButtons.innerHTML = `
        <button id="hub-btn-next-direct" class="btn-hub-primary">
          ➡️ PROSSIMA DOMANDA (Continua senza classifica)
        </button>
        <button id="hub-btn-show-lb" class="btn-hub-secondary">
          📊 MOSTRA CLASSIFICA AI GIOCATORI
        </button>
      `;
      document.getElementById('hub-btn-next-direct').onclick = () => socket.emit('admin:nextQuestion');
      document.getElementById('hub-btn-show-lb').onclick = () => socket.emit('admin:showLeaderboard');
    }

    renderPrompter(state.currentQuestion, currentIdx, totalQ);

  } else if (state.status === 'LEADERBOARD') {
    statusText.textContent = '🟣 CLASSIFICA MOSTRATA';
    statusText.style.color = '#a855f7';

    if (hubPhaseBadge) hubPhaseBadge.textContent = 'FASE: CLASSIFICA PUNTI';
    if (hubActionTitle) hubActionTitle.textContent = '📊 Tabellone Punti Visibile sul Maxischermo';
    if (hubActionDesc) hubActionDesc.textContent = isLastQ
      ? 'Questa era l\'ultima domanda! Clicca sotto per avviare il Gran Finale con lo svelamento progressivo e il podio!'
      : 'I partecipanti stanno guardando la classifica e i distacchi. Quando sei pronto a procedere con la prossima domanda:';

    if (hubActionButtons) {
      if (isLastQ) {
        hubActionButtons.innerHTML = `
          <button id="hub-btn-finale" class="btn-hub-primary" style="background: linear-gradient(135deg, #a855f7 0%, #7e22ce 100%);">
            🏆 VAI AL GRAN FINALE &amp; PODIO!
          </button>
        `;
        document.getElementById('hub-btn-finale').onclick = () => socket.emit('admin:nextQuestion');
      } else {
        hubActionButtons.innerHTML = `
          <button id="hub-btn-next-from-lb" class="btn-hub-primary">
            ➡️ PROSSIMA DOMANDA (Domanda ${currentIdx + 2}/${totalQ})
          </button>
        `;
        document.getElementById('hub-btn-next-from-lb').onclick = () => socket.emit('admin:nextQuestion');
      }
    }
    if (prompterSection) prompterSection.style.display = 'none';

  } else if (state.status === 'FINAL_REVEAL') {
    const step = state.finalRevealStep || 0;
    const total = state.totalNonPodium || 0;
    statusText.textContent = `👑 GRAN FINALE (${step}/${total} Svelati)`;
    statusText.style.color = 'var(--accent-gold)';

    if (hubPhaseBadge) hubPhaseBadge.textContent = 'FASE: GRAN FINALE';
    if (hubActionTitle) hubActionTitle.textContent = `👑 Svelamento Classifica Finale (${step}/${total})`;
    if (hubActionDesc) hubActionDesc.textContent = step < total
      ? `Stai svelando le posizioni dalla fine verso il podio. Clicca per mostrare la posizione #${total - step + 3}:`
      : 'Tutte le posizioni fino al 4° posto sono svelate! Clicca per passare al Podio dei primi 3!';

    if (hubActionButtons) {
      if (step < total) {
        hubActionButtons.innerHTML = `
          <button id="hub-btn-reveal-step" class="btn-hub-primary" style="background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%);">
            ⏭️ Svela Posizione #${total - step + 3}
          </button>
          <button id="hub-btn-skip-podium" class="btn-hub-secondary">
            ⚡ Salta subito al Podio
          </button>
        `;
        document.getElementById('hub-btn-reveal-step').onclick = () => socket.emit('admin:advanceFinale');
        document.getElementById('hub-btn-skip-podium').onclick = () => socket.emit('admin:skipToPodium');
      } else {
        hubActionButtons.innerHTML = `
          <button id="hub-btn-go-podium" class="btn-hub-primary" style="background: linear-gradient(135deg, #a855f7 0%, #7e22ce 100%);">
            👑 Passa al Podio dei Vincitori!
          </button>
        `;
        document.getElementById('hub-btn-go-podium').onclick = () => socket.emit('admin:advanceFinale');
      }
    }
    if (prompterSection) prompterSection.style.display = 'none';

  } else if (state.status === 'PODIUM') {
    const step = state.podiumStep || 0;
    statusText.textContent = `🏆 PODIO VINCITORI (${step}/3)`;
    statusText.style.color = 'var(--accent-gold)';

    if (hubPhaseBadge) hubPhaseBadge.textContent = 'FASE: PODIO FINALE';
    if (hubActionTitle) hubActionTitle.textContent = `🏆 Podio dei Primi 3 (${step}/3 svelati)`;
    
    let btnLabel = '🥉 Svela 3° Posto';
    if (step === 1) btnLabel = '🥈 Svela 2° Posto';
    else if (step === 2) btnLabel = '🥇 Svela 1° Posto (CAMPIONE UNIME!)';
    else if (step >= 3) btnLabel = '🎊 Lancia Altri Coriandoli!';

    if (hubActionDesc) hubActionDesc.textContent = step < 3
      ? 'Svela i primi 3 classificati uno alla volta con suspense e fanfare:'
      : 'Show concluso! Il podio è al completo con i campioni della serata.';

    if (hubActionButtons) {
      hubActionButtons.innerHTML = `
        <button id="hub-btn-podium-step" class="btn-hub-primary" style="background: linear-gradient(135deg, #f59e0b 0%, #b45309 100%);">
          ${btnLabel}
        </button>
        ${step < 3 ? '<button id="hub-btn-reveal-all-podium" class="btn-hub-secondary">⚡ Svela Tutti i 3 Insieme</button>' : ''}
      `;
      document.getElementById('hub-btn-podium-step').onclick = () => socket.emit('admin:advanceFinale');
      const btnAll = document.getElementById('hub-btn-reveal-all-podium');
      if (btnAll) btnAll.onclick = () => socket.emit('admin:revealAllPodium');
    }
    if (prompterSection) prompterSection.style.display = 'none';
  }
}

// Socket Sync Handlers
socket.on('game:syncState', (state) => {
  updateLiveStatus(state);
});

socket.on('game:timerTick', ({ timeRemaining }) => {
  if (lastState && lastState.status === 'QUESTION') {
    statusText.textContent = `🟡 DOMANDA IN CORSO (${timeRemaining}s)`;
    if (hubActionTitle) hubActionTitle.textContent = `⏱️ Domanda in corso (${timeRemaining}s rimasti)`;
  }
});

socket.on('game:timerTick', ({ timeRemaining, isPaused }) => {
  if (lastState && lastState.status === 'QUESTION') {
    statusText.textContent = isPaused ? `⏸️ IN PAUSA (${timeRemaining}s)` : `🟡 DOMANDA IN CORSO (${timeRemaining}s)`;
    if (hubActionTitle) {
      hubActionTitle.textContent = isPaused ? `⏸️ TIMER IN PAUSA (${timeRemaining}s rimasti)` : `⏱️ Domanda in corso (${timeRemaining}s rimasti)`;
    }
  }
  updatePauseButtonUI(!!isPaused);
});

socket.on('game:answersCountUpdated', ({ answeredCount, totalPlayers }) => {
  answersIndicator.textContent = `${answeredCount} / ${totalPlayers}`;
});

socket.on('game:answerRevealed', (data) => {
  if (lastState) {
    lastState.status = 'SHOW_ANSWER';
    updateLiveStatus({ ...lastState, ...data, status: 'SHOW_ANSWER' });
  }
});

socket.on('game:leaderboard', (data) => {
  if (lastState) {
    lastState.status = 'LEADERBOARD';
    updateLiveStatus({ ...lastState, ...data, status: 'LEADERBOARD' });
  }
});

socket.on('game:finalReveal', (data) => {
  updateLiveStatus({ status: 'FINAL_REVEAL', ...data });
});

socket.on('game:podium', (data) => {
  updateLiveStatus({ status: 'PODIUM', ...data });
});

socket.on('game:resetToLobby', () => {
  updateLiveStatus({ status: 'LOBBY', currentQuestionIndex: 0, playerCount: 0 });
});

// Comandi Manuali Rapidi
const btnNextQuestion = document.getElementById('admin-btn-next-question');
if (btnNextQuestion) {
  btnNextQuestion.addEventListener('click', () => {
    socket.emit('admin:nextQuestion');
  });
}

// Toggle Pausa Timer da Regia
const btnPauseToggle = document.getElementById('admin-btn-pause-toggle');
if (btnPauseToggle) {
  btnPauseToggle.addEventListener('click', () => {
    socket.emit('admin:togglePause');
  });
}

function updatePauseButtonUI(isPaused) {
  if (!btnPauseToggle) return;
  if (isPaused) {
    btnPauseToggle.textContent = '▶️ Riprendi Timer';
    btnPauseToggle.style.background = 'rgba(16, 185, 129, 0.25)';
    btnPauseToggle.style.borderColor = '#10b981';
    btnPauseToggle.style.color = '#34d399';
  } else {
    btnPauseToggle.textContent = '⏸️ Pausa / Congela Timer';
    btnPauseToggle.style.background = 'rgba(245, 158, 11, 0.25)';
    btnPauseToggle.style.borderColor = '#f59e0b';
    btnPauseToggle.style.color = '#f59e0b';
  }
}

socket.on('game:pauseToggled', ({ isPaused }) => {
  updatePauseButtonUI(isPaused);
});

// Simulatore Bot di Prova
const btnSpawnBots = document.getElementById('btn-spawn-bots');
if (btnSpawnBots) {
  btnSpawnBots.addEventListener('click', () => {
    socket.emit('admin:spawnBots', { count: 6 });
  });
}

const btnRemoveBots = document.getElementById('btn-remove-bots');
if (btnRemoveBots) {
  btnRemoveBots.addEventListener('click', () => {
    if (confirm('Vuoi rimuovere tutti i bot simulati dalla sessione?')) {
      socket.emit('admin:removeBots');
    }
  });
}

const btnShowLeaderboard = document.getElementById('admin-btn-show-leaderboard');
if (btnShowLeaderboard) {
  btnShowLeaderboard.addEventListener('click', () => {
    socket.emit('admin:showLeaderboard');
  });
}

const btnReveal = document.getElementById('admin-btn-reveal');
if (btnReveal) {
  btnReveal.addEventListener('click', () => {
    socket.emit('admin:revealNow');
  });
}

const btnPodium = document.getElementById('admin-btn-podium');
if (btnPodium) {
  btnPodium.addEventListener('click', () => {
    if (confirm('Vuoi passare subito alla fase Podio Finale?')) {
      socket.emit('admin:showPodium');
    }
  });
}

// Azioni di Emergenza
const btnResetLobby = document.getElementById('admin-btn-reset');
if (btnResetLobby) {
  btnResetLobby.addEventListener('click', () => {
    if (confirm('ATTENZIONE: Vuoi resettare la partita e tornare alla lobby iniziale? I punteggi verranno azzerati.')) {
      socket.emit('admin:resetLobby');
    }
  });
}

const btnClearAllPlayers = document.getElementById('admin-btn-clear-all');
if (btnClearAllPlayers) {
  btnClearAllPlayers.addEventListener('click', () => {
    if (confirm('ATTENZIONE CRITICA: Sei sicuro di voler cancellare TUTTE le squadre registrate dal database? Dovranno scansionare nuovamente il QR code.')) {
      socket.emit('admin:clearAllPlayers');
    }
  });
}

// Players management & Anagrafica Partecipanti
const adminPlayersList = document.getElementById('admin-players-list');
const adminPlayerCount = document.getElementById('admin-player-count');
const statTotalPlayers = document.getElementById('stat-total-players');
const statConnectedPlayers = document.getElementById('stat-connected-players');
const statUnimePlayers = document.getElementById('stat-unime-players');
const statExternalPlayers = document.getElementById('stat-external-players');
const playerSearchInput = document.getElementById('admin-player-search');
const filterButtons = document.querySelectorAll('.admin-filter-btn');

let allAdminPlayers = [];
let currentFilter = 'connected';
let searchQuery = '';

if (playerSearchInput) {
  playerSearchInput.addEventListener('input', (e) => {
    searchQuery = e.target.value.toLowerCase().trim();
    renderAdminPlayers();
  });
}

filterButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    filterButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentFilter = btn.getAttribute('data-filter') || 'connected';
    renderAdminPlayers();
  });
});

function updatePlayerStats() {
  const total = allAdminPlayers.length;
  const connected = allAdminPlayers.filter(p => p.connected).length;
  const unime = allAdminPlayers.filter(p => p.isUnime).length;
  const external = total - unime;

  if (adminPlayerCount) adminPlayerCount.textContent = connected;
  if (statTotalPlayers) statTotalPlayers.textContent = total;
  if (statConnectedPlayers) statConnectedPlayers.textContent = connected;
  if (statUnimePlayers) statUnimePlayers.textContent = unime;
  if (statExternalPlayers) statExternalPlayers.textContent = external;
}

function renderAdminPlayers() {
  if (!adminPlayersList) return;
  adminPlayersList.innerHTML = '';

  updatePlayerStats();

  // Applica filtri
  let filtered = allAdminPlayers.filter(p => {
    if (currentFilter === 'connected' && !p.connected) return false;
    if (currentFilter === 'unime' && !p.isUnime) return false;
    if (currentFilter === 'external' && p.isUnime) return false;

    if (searchQuery) {
      const matchText = [
        p.nickname || '',
        p.firstName || '',
        p.lastName || '',
        p.email || '',
        p.phone || '',
        p.matricola || '',
        p.department || '',
        p.course || '',
        p.city || '',
        p.province || ''
      ].join(' ').toLowerCase();

      if (!matchText.includes(searchQuery)) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    adminPlayersList.innerHTML = `
      <div style="color: rgba(255,255,255,0.6); padding: 24px; text-align: center; background: rgba(0,0,0,0.25); border-radius: 14px;">
        ${allAdminPlayers.length === 0 ? 'Nessun partecipante nella sessione al momento.' : (currentFilter === 'connected' ? 'Nessun partecipante attualmente connesso / online.' : 'Nessun partecipante corrisponde ai filtri di ricerca.')}
      </div>
    `;
    return;
  }

  filtered.forEach(p => {
    const card = document.createElement('div');
    card.className = 'player-admin-card';

    // Status Badge
    let statusBadge = '';
    if (!p.connected) {
      statusBadge = '<span style="font-size: 0.72rem; background: rgba(100, 116, 139, 0.2); color: #94a3b8; border: 1px solid rgba(100, 116, 139, 0.4); border-radius: 6px; padding: 2px 6px;">⚪ Offline</span>';
    } else if (p.waitingRoom) {
      statusBadge = '<span style="font-size: 0.72rem; background: rgba(245, 158, 11, 0.2); color: #fbbf24; border: 1px solid rgba(245, 158, 11, 0.4); border-radius: 6px; padding: 2px 6px;">⏳ In Attesa</span>';
    } else {
      statusBadge = '<span style="font-size: 0.72rem; background: rgba(16, 185, 129, 0.2); color: #34d399; border: 1px solid rgba(16, 185, 129, 0.4); border-radius: 6px; padding: 2px 6px;">⚡ In Gara</span>';
    }

    // Badge UniMe / Esterno
    let unimeBadge = '';
    if (p.isUnime) {
      const shortDept = window.getDepartmentShortName ? window.getDepartmentShortName(p.department) : (p.department || 'UniMe');
      unimeBadge = `
        <span class="badge-unime-pill">
          🎓 ${shortDept} • ${p.course || 'CdL'} (${p.academicYear || 'Anno'}) • Matr. ${p.matricola || 'N/D'}
        </span>
      `;
    } else {
      unimeBadge = '<span class="badge-external-pill">🌍 Partecipante Esterno</span>';
    }

    const realName = (p.firstName || p.lastName) ? `${p.firstName || ''} ${p.lastName || ''}`.trim() : '';

    card.innerHTML = `
      <div class="player-admin-card-top">
        <div class="player-admin-info-main">
          <span style="font-size: 2rem;">${p.avatar || '🎓'}</span>
          <div>
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <strong style="font-size: 1.15rem; color: #fff;">${p.nickname}</strong>
              ${realName ? `<span style="color: #cbd5e1; font-size: 0.9rem;">(${realName})</span>` : ''}
              ${statusBadge}
              <span style="font-size: 0.85rem; color: var(--unime-gold); font-weight: 800; margin-left: 4px;">🏆 ${p.score || 0} pt</span>
            </div>
            <div style="margin-top: 4px;">
              ${unimeBadge}
            </div>
          </div>
        </div>

        <button class="btn btn-glass" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.4); padding: 6px 12px; font-size: 0.82rem;" onclick="kickPlayer('${p.id}')">
          ❌ Espelli
        </button>
      </div>

      <div class="player-admin-meta">
        <div>
          <strong>📞 Telefono:</strong> ${p.phone ? `<a href="tel:${p.phone}">${p.phone}</a>` : 'Non indicato'}
        </div>
        <div>
          <strong>✉️ Email:</strong> ${p.email ? `<a href="mailto:${p.email}">${p.email}</a>` : 'Non indicata'}
        </div>
        <div>
          <strong>📍 Residenza:</strong> ${p.city || ''} ${p.province ? `(${p.province})` : ''}, ${p.region || ''} (${p.country || 'Italia'})
        </div>
        <div>
          <strong>🔥 Serie Corrette:</strong> ${p.streak || 0} consecutivi
        </div>
      </div>
    `;

    adminPlayersList.appendChild(card);
  });
}

socket.on('admin:playersUpdated', (players) => {
  allAdminPlayers = players || [];
  renderAdminPlayers();
});

socket.on('host:playersUpdated', (activePlayers) => {
  if (allAdminPlayers.length === 0) {
    allAdminPlayers = activePlayers || [];
  } else {
    // Sincronizza stato di connessione
    const activeMap = new Set(activePlayers.map(p => p.id));
    allAdminPlayers.forEach(p => {
      p.connected = activeMap.has(p.id);
      const activeObj = activePlayers.find(a => a.id === p.id);
      if (activeObj) {
        p.score = activeObj.score;
        p.streak = activeObj.streak;
        p.waitingRoom = activeObj.waitingRoom;
      }
    });
  }
  renderAdminPlayers();
});

window.kickPlayer = function(playerId) {
  if (confirm('Espellere questo partecipante dal quiz?')) {
    socket.emit('admin:kickPlayer', { playerId });
  }
};

// ==========================================
// 🗂️ GESTIONE ARCHIVIO STORICO ACCOUNT
// ==========================================
const adminAccountCount = document.getElementById('admin-account-count');
const adminAccountsList = document.getElementById('admin-accounts-list');
const adminAccountSearch = document.getElementById('admin-account-search');
const accountFilterButtons = document.querySelectorAll('.admin-account-filter-btn');

const modalEditAccount = document.getElementById('modal-edit-account');
const modalEditBackdrop = document.getElementById('modal-edit-backdrop');
const btnCloseEditModal = document.getElementById('btn-close-edit-modal');
const btnCancelEdit = document.getElementById('btn-cancel-edit');
const btnSaveEditAccount = document.getElementById('btn-save-edit-account');

const editAccountId = document.getElementById('edit-account-id');
const editFirstname = document.getElementById('edit-firstname');
const editLastname = document.getElementById('edit-lastname');
const editNickname = document.getElementById('edit-nickname');
const editAvatar = document.getElementById('edit-avatar');
const editPhone = document.getElementById('edit-phone');
const editEmail = document.getElementById('edit-email');
const editCity = document.getElementById('edit-city');
const editProvince = document.getElementById('edit-province');
const editRegion = document.getElementById('edit-region');
const editCountry = document.getElementById('edit-country');
const editIsUnime = document.getElementById('edit-is-unime');
const editUnimeFields = document.getElementById('edit-unime-fields');
const editMatricola = document.getElementById('edit-matricola');
const editDepartment = document.getElementById('edit-department');
const editCourse = document.getElementById('edit-course');
const editYear = document.getElementById('edit-year');

let allHistoricalAccounts = [];
let accountCurrentFilter = 'all';
let accountSearchQuery = '';

// Inizializza Regioni e Dipartimenti nel modal di modifica
function initEditModalDropdowns() {
  if (editRegion) {
    editRegion.innerHTML = '';
    const regions = window.italianRegions || [
      "Sicilia", "Calabria", "Lazio", "Lombardia", "Campania", "Puglia",
      "Piemonte", "Veneto", "Emilia-Romagna", "Toscana", "Sardegna", "Liguria",
      "Marche", "Abruzzo", "Friuli-Venezia Giulia", "Trentino-Alto Adige",
      "Umbria", "Basilicata", "Molise", "Valle d'Aosta", "Altro / Estero"
    ];
    regions.forEach(reg => {
      const opt = document.createElement('option');
      opt.value = reg;
      opt.textContent = reg;
      editRegion.appendChild(opt);
    });
  }

  if (editDepartment) {
    editDepartment.innerHTML = '<option value="">-- Seleziona Dipartimento --</option>';
    const depts = window.departmentsData ? Object.keys(window.departmentsData) : [];
    depts.forEach(d => {
      const opt = document.createElement('option');
      opt.value = d;
      opt.textContent = d;
      editDepartment.appendChild(opt);
    });
  }
}

initEditModalDropdowns();

if (editDepartment) {
  editDepartment.addEventListener('change', () => {
    const dept = editDepartment.value;
    editCourse.innerHTML = '<option value="">-- Seleziona Corso di Laurea --</option>';
    editYear.innerHTML = '<option value="">-- Prima seleziona il Corso di Laurea --</option>';
    editYear.disabled = true;

    if (dept && window.departmentsData && window.departmentsData[dept]) {
      const courses = window.departmentsData[dept];
      courses.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        editCourse.appendChild(opt);
      });
      editCourse.disabled = false;
    } else {
      editCourse.disabled = true;
    }
  });
}

if (editCourse) {
  editCourse.addEventListener('change', () => {
    const course = editCourse.value;
    editYear.innerHTML = '<option value="">-- Seleziona Anno di Corso --</option>';

    if (course) {
      const years = window.getCourseYears ? window.getCourseYears(course) : ['1° Anno', '2° Anno', '3° Anno', 'Fuori Corso'];
      years.forEach(yr => {
        const opt = document.createElement('option');
        opt.value = yr;
        opt.textContent = yr;
        editYear.appendChild(opt);
      });
      editYear.disabled = false;
    } else {
      editYear.disabled = true;
    }
  });
}

if (editIsUnime) {
  editIsUnime.addEventListener('change', () => {
    if (editUnimeFields) {
      editUnimeFields.style.display = editIsUnime.checked ? 'flex' : 'none';
    }
  });
}

function closeEditModal() {
  if (modalEditAccount) modalEditAccount.style.display = 'none';
}

if (btnCloseEditModal) btnCloseEditModal.addEventListener('click', closeEditModal);
if (btnCancelEdit) btnCancelEdit.addEventListener('click', closeEditModal);
if (modalEditBackdrop) modalEditBackdrop.addEventListener('click', closeEditModal);

if (adminAccountSearch) {
  adminAccountSearch.addEventListener('input', (e) => {
    accountSearchQuery = e.target.value.toLowerCase().trim();
    renderAdminAccounts();
  });
}

accountFilterButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    accountFilterButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    accountCurrentFilter = btn.getAttribute('data-filter') || 'all';
    renderAdminAccounts();
  });
});

function renderAdminAccounts() {
  if (!adminAccountsList) return;
  adminAccountsList.innerHTML = '';

  if (adminAccountCount) adminAccountCount.textContent = allHistoricalAccounts.length;

  let filtered = allHistoricalAccounts.filter(acc => {
    if (accountCurrentFilter === 'unime' && !acc.isUnime) return false;
    if (accountCurrentFilter === 'external' && acc.isUnime) return false;

    if (accountSearchQuery) {
      const searchStr = [
        acc.nickname || '',
        acc.firstName || '',
        acc.lastName || '',
        acc.email || '',
        acc.phone || '',
        acc.matricola || '',
        acc.department || '',
        acc.course || '',
        acc.city || '',
        acc.province || ''
      ].join(' ').toLowerCase();

      if (!searchStr.includes(accountSearchQuery)) return false;
    }
    return true;
  });

  if (filtered.length === 0) {
    adminAccountsList.innerHTML = `
      <div style="color: rgba(255,255,255,0.6); padding: 24px; text-align: center; background: rgba(0,0,0,0.25); border-radius: 14px;">
        ${allHistoricalAccounts.length === 0 ? 'Nessun account memorizzato nello storico.' : 'Nessun account trovato per i criteri di ricerca.'}
      </div>
    `;
    return;
  }

  filtered.forEach(acc => {
    const card = document.createElement('div');
    card.className = 'player-admin-card';

    // UniMe Badge
    let unimeBadge = '';
    if (acc.isUnime) {
      const shortDept = window.getDepartmentShortName ? window.getDepartmentShortName(acc.department) : (acc.department || 'UniMe');
      unimeBadge = `
        <span class="badge-unime-pill">
          🎓 ${shortDept} • ${acc.course || 'CdL'} (${acc.academicYear || 'Anno'}) • Matr. ${acc.matricola || 'N/D'}
        </span>
      `;
    } else {
      unimeBadge = '<span class="badge-external-pill">🌍 Partecipante Esterno</span>';
    }

    const realName = (acc.firstName || acc.lastName) ? `${acc.firstName || ''} ${acc.lastName || ''}`.trim() : 'Nome non specificato';
    const regDate = acc.createdAt ? new Date(acc.createdAt).toLocaleDateString('it-IT') : 'Data n/d';

    card.innerHTML = `
      <div class="player-admin-card-top">
        <div class="player-admin-info-main">
          <span style="font-size: 2.2rem;">${acc.avatar || '🎓'}</span>
          <div>
            <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
              <strong style="font-size: 1.2rem; color: #fff;">${acc.nickname || 'Nickname'}</strong>
              <span style="color: #cbd5e1; font-size: 0.95rem; font-weight: 600;">(${realName})</span>
              <span style="font-size: 0.72rem; color: #94a3b8; font-family: var(--font-mono); margin-left: 6px;">ID: ${acc.id}</span>
            </div>
            <div style="margin-top: 4px;">
              ${unimeBadge}
            </div>
          </div>
        </div>

        <div style="display: flex; gap: 8px;">
          <button class="btn btn-glass" style="color: var(--accent-gold); border-color: rgba(245, 158, 11, 0.4); padding: 8px 14px; font-size: 0.85rem;" onclick="openEditAccount('${acc.id}')">
            ✏️ Modifica
          </button>
          <button class="btn btn-glass" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.4); padding: 8px 14px; font-size: 0.85rem;" onclick="deleteAccount('${acc.id}')">
            🗑️ Elimina
          </button>
        </div>
      </div>

      <div class="player-admin-meta">
        <div>
          <strong>📞 Telefono:</strong> ${acc.phone ? `<a href="tel:${acc.phone}">${acc.phone}</a>` : 'Non indicato'}
        </div>
        <div>
          <strong>✉️ Email:</strong> ${acc.email ? `<a href="mailto:${acc.email}">${acc.email}</a>` : 'Non indicata'}
        </div>
        <div>
          <strong>📍 Residenza:</strong> ${acc.city || ''} ${acc.province ? `(${acc.province})` : ''}, ${acc.region || ''} (${acc.country || 'Italia'})
        </div>
        <div>
          <strong>📅 Registrato il:</strong> ${regDate}
        </div>
      </div>
    `;

    adminAccountsList.appendChild(card);
  });
}

// Apertura Modal Modifica Account
window.openEditAccount = function(accountId) {
  const acc = allHistoricalAccounts.find(a => a.id === accountId);
  if (!acc) return;

  editAccountId.value = acc.id;
  editFirstname.value = acc.firstName || '';
  editLastname.value = acc.lastName || '';
  editNickname.value = acc.nickname || '';
  editAvatar.value = acc.avatar || '🎓';
  editPhone.value = acc.phone || '';
  editEmail.value = acc.email || '';
  editCity.value = acc.city || '';
  editProvince.value = acc.province || '';
  editCountry.value = acc.country || 'Italia';

  if (editRegion && acc.region) editRegion.value = acc.region;

  editIsUnime.checked = (acc.isUnime !== false);
  if (editUnimeFields) {
    editUnimeFields.style.display = editIsUnime.checked ? 'flex' : 'none';
  }

  editMatricola.value = acc.matricola || '';

  if (editDepartment && acc.department) {
    editDepartment.value = acc.department;
    editDepartment.dispatchEvent(new Event('change'));
    if (editCourse && acc.course) {
      editCourse.value = acc.course;
      editCourse.dispatchEvent(new Event('change'));
      if (editYear && acc.academicYear) {
        editYear.value = acc.academicYear;
      }
    }
  }

  modalEditAccount.style.display = 'flex';
};

// Salvataggio Modifiche Account
if (btnSaveEditAccount) {
  btnSaveEditAccount.addEventListener('click', () => {
    const id = editAccountId.value;
    if (!id) return;

    const isUni = editIsUnime.checked;

    const updatedData = {
      id,
      firstName: editFirstname.value.trim(),
      lastName: editLastname.value.trim(),
      nickname: editNickname.value.trim() || `${editFirstname.value.trim()} ${editLastname.value.trim()}`,
      avatar: editAvatar.value.trim() || '🎓',
      phone: editPhone.value.trim(),
      email: editEmail.value.trim(),
      city: editCity.value.trim(),
      province: editProvince.value.trim(),
      region: editRegion.value,
      country: editCountry.value.trim() || 'Italia',
      isUnime: isUni,
      matricola: isUni ? editMatricola.value.trim() : '',
      department: isUni ? editDepartment.value : '',
      course: isUni ? editCourse.value : '',
      academicYear: isUni ? editYear.value : ''
    };

    socket.emit('admin:updateAccount', updatedData);
    closeEditModal();
  });
}

// Eliminazione definitiva account
window.deleteAccount = function(accountId) {
  const acc = allHistoricalAccounts.find(a => a.id === accountId);
  const nameLabel = acc ? `${acc.firstName} ${acc.lastName} (${acc.nickname})` : accountId;
  if (confirm(`ATTENZIONE: Sei sicuro di voler eliminare DEFINITIVAMENTE l'account di:\n${nameLabel}?\n\nQuesta operazione cancellerà tutti i suoi dati dal database e disconnetterà il partecipante se connesso.`)) {
    socket.emit('admin:deleteAccount', { accountId });
  }
};

socket.on('admin:accountsUpdated', (accounts) => {
  allHistoricalAccounts = accounts || [];
  renderAdminAccounts();
});

// Caricamento iniziale account via REST API
async function loadInitialAccounts() {
  try {
    const token = sessionStorage.getItem('unime_admin_token') || '';
    const headers = token ? { 'Authorization': `Bearer ${token}` } : {};
    const res = await fetch('/api/accounts', { headers });
    if (res.ok) {
      allHistoricalAccounts = await res.json();
      renderAdminAccounts();
    }
  } catch (e) {
    console.error('Errore caricamento iniziale account:', e);
  }
}
loadInitialAccounts();

// Questions Management
let loadedQuestions = [];

async function loadQuestions() {
  try {
    const res = await fetch('/api/questions');
    loadedQuestions = await res.json();
    const countEl = document.getElementById('admin-q-count');
    if (countEl) countEl.textContent = loadedQuestions.length;
    const countDisplay = document.getElementById('admin-q-count-display');
    if (countDisplay) countDisplay.textContent = loadedQuestions.length;
    renderQuestionsList();
  } catch (e) {
    console.error('Errore caricamento domande:', e);
  }
}

function renderQuestionsList() {
  const container = document.getElementById('admin-questions-list');
  container.innerHTML = '';

  const countDisplay = document.getElementById('admin-q-count-display');
  if (countDisplay) countDisplay.textContent = loadedQuestions.length;

  loadedQuestions.forEach((q, idx) => {
    const item = document.createElement('div');
    item.className = 'question-item';
    const macroBadge = q.macroArea ? `<span style="font-size: 0.75rem; background: rgba(59, 130, 246, 0.2); color: #93c5fd; border: 1px solid rgba(59, 130, 246, 0.4); border-radius: 4px; padding: 2px 6px; margin-right: 6px;">${q.macroArea}</span>` : '';
    item.innerHTML = `
      <div class="question-item-header">
        <div>
          ${macroBadge}
          <span style="font-weight: 800; color: var(--unime-gold);">#${idx + 1} • ${q.category}</span>
        </div>
        <div style="display: flex; align-items: center; gap: 10px;">
          <span style="font-size: 0.85rem; color: rgba(255,255,255,0.7);">${q.timeLimit || 20}s</span>
          <button class="btn btn-glass btn-edit-question" data-index="${idx}" style="padding: 4px 12px; font-size: 0.82rem; background: rgba(245, 158, 11, 0.2); border-color: #f59e0b; color: #fbbf24; font-weight: 700; cursor: pointer;">
            ✏️ Modifica
          </button>
        </div>
      </div>
      <div style="font-size: 1.05rem; font-weight: 700; margin-bottom: 10px; color: #fff;">${q.question}</div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; font-size: 0.9rem;">
        ${q.options.map((opt, i) => `
          <div style="padding: 6px 10px; border-radius: 8px; background: ${i === q.correctIndex ? 'rgba(34, 197, 94, 0.25)' : 'rgba(255,255,255,0.06)'}; border: 1px solid ${i === q.correctIndex ? '#22c55e' : 'rgba(255,255,255,0.1)'};">
            ${i === q.correctIndex ? '✅ ' : ''}${opt}
          </div>
        `).join('')}
      </div>
      ${q.explanation ? `<div style="margin-top: 8px; font-size: 0.85rem; color: rgba(255,255,255,0.7); font-style: italic;">💡 ${q.explanation}</div>` : ''}
    `;
    container.appendChild(item);
  });

  // Listener per pulsanti Modifica
  container.querySelectorAll('.btn-edit-question').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const idx = parseInt(btn.getAttribute('data-index'), 10);
      openEditQuestionModal(idx);
    });
  });
}

// Modal Modifica Singola Domanda
const modalEditQuestion = document.getElementById('modal-edit-question');
const modalEditQBackdrop = document.getElementById('modal-edit-q-backdrop');
const btnCloseEditQModal = document.getElementById('btn-close-edit-q-modal');
const btnCancelEditQ = document.getElementById('btn-cancel-edit-q');
const formEditQuestion = document.getElementById('form-edit-question');

function openEditQuestionModal(idx) {
  const q = loadedQuestions[idx];
  if (!q) return;

  document.getElementById('edit-q-index').value = idx;
  const titleEl = document.getElementById('modal-q-title');
  if (titleEl) titleEl.textContent = `Modifica Domanda #${idx + 1}`;

  document.getElementById('edit-q-text').value = q.question || '';
  document.getElementById('edit-q-macro').value = q.macroArea || '';
  document.getElementById('edit-q-cat').value = q.category || '';

  for (let i = 0; i < 4; i++) {
    const inputOpt = document.getElementById(`edit-q-opt-${i}`);
    if (inputOpt) inputOpt.value = (q.options && q.options[i] !== undefined) ? q.options[i] : '';
  }

  const correctIdx = (typeof q.correctIndex === 'number' && q.correctIndex >= 0 && q.correctIndex <= 3) ? q.correctIndex : 0;
  const radio = document.getElementById(`edit-q-radio-${correctIdx}`);
  if (radio) radio.checked = true;

  document.getElementById('edit-q-explanation').value = q.explanation || '';
  document.getElementById('edit-q-timer').value = q.timeLimit || 20;

  if (modalEditQuestion) modalEditQuestion.style.display = 'flex';
}

function closeEditQuestionModal() {
  if (modalEditQuestion) modalEditQuestion.style.display = 'none';
}

if (btnCloseEditQModal) btnCloseEditQModal.addEventListener('click', closeEditQuestionModal);
if (btnCancelEditQ) btnCancelEditQ.addEventListener('click', closeEditQuestionModal);
if (modalEditQBackdrop) modalEditQBackdrop.addEventListener('click', closeEditQuestionModal);

if (formEditQuestion) {
  formEditQuestion.addEventListener('submit', async (e) => {
    e.preventDefault();
    const idx = parseInt(document.getElementById('edit-q-index').value, 10);
    if (isNaN(idx) || !loadedQuestions[idx]) return;

    const newQuestionText = document.getElementById('edit-q-text').value.trim();
    const macroArea = document.getElementById('edit-q-macro').value.trim();
    const category = document.getElementById('edit-q-cat').value.trim();
    const options = [
      document.getElementById('edit-q-opt-0').value.trim(),
      document.getElementById('edit-q-opt-1').value.trim(),
      document.getElementById('edit-q-opt-2').value.trim(),
      document.getElementById('edit-q-opt-3').value.trim()
    ];

    const correctRadio = document.querySelector('input[name="edit-q-correct"]:checked');
    const correctIndex = correctRadio ? parseInt(correctRadio.value, 10) : 0;
    const explanation = document.getElementById('edit-q-explanation').value.trim();
    const timeLimit = parseInt(document.getElementById('edit-q-timer').value, 10) || 20;

    // Aggiorna l'oggetto domanda in memoria
    loadedQuestions[idx].question = newQuestionText;
    if (macroArea) loadedQuestions[idx].macroArea = macroArea;
    if (category) loadedQuestions[idx].category = category;
    loadedQuestions[idx].options = options;
    loadedQuestions[idx].correctIndex = correctIndex;
    loadedQuestions[idx].correctText = options[correctIndex];
    loadedQuestions[idx].timeLimit = timeLimit;
    loadedQuestions[idx].explanation = explanation || `Risposta corretta: ${options[correctIndex]}`;

    // Salva immediatamente su questions.json tramite API
    try {
      const res = await fetch('/api/questions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loadedQuestions)
      });
      const data = await res.json();
      if (data.success) {
        closeEditQuestionModal();
        renderQuestionsList();
        alert(`✅ Domanda #${idx + 1} aggiornata e salvata con successo!`);
      } else {
        alert('Errore nel salvataggio della domanda.');
      }
    } catch (err) {
      console.error(err);
      alert('Errore di connessione durante il salvataggio.');
    }
  });
}

// Estrazione ponderata dal Pool di 400 Domande
const btnGenWeighted = document.getElementById('btn-generate-weighted');
if (btnGenWeighted) {
  btnGenWeighted.addEventListener('click', async () => {
    if (confirm('Vuoi estrarre 10 nuove domande ponderate dall\'archivio? Le opzioni di risposta verranno rimescolate in modo casuale.')) {
      btnGenWeighted.disabled = true;
      btnGenWeighted.textContent = '⏳ Estrazione in corso...';
      try {
        const res = await fetch('/api/questions/generate-weighted', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ count: 10 })
        });
        const data = await res.json();
        if (data.success) {
          loadedQuestions = data.questions;
          renderQuestionsList();
          alert('🎉 Estratte con successo 10 domande ponderate bilanciate!');
        }
      } catch (err) {
        alert('Errore durante l\'estrazione delle domande.');
      } finally {
        btnGenWeighted.disabled = false;
        btnGenWeighted.textContent = '🎲 Estrai Nuove 10 Domande Ponderate';
      }
    }
  });
}

socket.on('game:questionsUpdated', (newQuestions) => {
  loadedQuestions = newQuestions;
  const countEl = document.getElementById('admin-q-count');
  if (countEl) countEl.textContent = loadedQuestions.length;
  renderQuestionsList();
});

document.getElementById('btn-save-questions').addEventListener('click', async () => {
  try {
    const res = await fetch('/api/questions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(loadedQuestions)
    });
    const d = await res.json();
    if (d.success) alert('Domande salvate con successo!');
  } catch (err) {
    alert('Errore salvataggio domande.');
  }
});

// Network URL configuration
async function loadNetworkTab() {
  try {
    const res = await fetch('/api/network');
    const data = await res.json();
    document.getElementById('input-custom-url').value = data.url;
    if (data.qrDataUrl) {
      document.getElementById('admin-qr-preview').src = data.qrDataUrl;
    }
  } catch (err) {}
}

document.getElementById('btn-update-url').addEventListener('click', async () => {
  const newUrl = document.getElementById('input-custom-url').value.trim();
  try {
    const res = await fetch('/api/set-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: newUrl })
    });
    const data = await res.json();
    if (data.success) {
      alert('URL aggiornato! Il QR Code sullo schermo host si aggiornerà automaticamente.');
      loadNetworkTab();
    }
  } catch (e) {
    alert('Errore aggiornamento URL');
  }
});

loadQuestions();
loadNetworkTab();

// Gestione Logout Admin
const btnAdminLogout = document.getElementById('btn-admin-logout');
if (btnAdminLogout) {
  btnAdminLogout.addEventListener('click', async () => {
    try {
      await fetch('/api/logout', { method: 'POST' });
      sessionStorage.removeItem('unime_admin_token');
    } catch(e){}
    window.location.href = '/login?redirect=/admin';
  });
}

// Gestione Cambio Password di Amministrazione
const formChangePwd = document.getElementById('form-change-password');
const inputNewPwd = document.getElementById('input-new-password');
const inputConfirmPwd = document.getElementById('input-confirm-password');
const pwdChangeMsg = document.getElementById('pwd-change-msg');
const btnSaveNewPwd = document.getElementById('btn-save-new-password');

if (formChangePwd) {
  formChangePwd.addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPwd = (inputNewPwd ? inputNewPwd.value : '').trim();
    const confirmPwd = (inputConfirmPwd ? inputConfirmPwd.value : '').trim();

    function showPwdMsg(text, type) {
      if (!pwdChangeMsg) return;
      pwdChangeMsg.textContent = text;
      pwdChangeMsg.style.display = 'block';
      if (type === 'success') {
        pwdChangeMsg.style.background = 'rgba(16, 185, 129, 0.15)';
        pwdChangeMsg.style.color = '#34d399';
        pwdChangeMsg.style.border = '1px solid rgba(16, 185, 129, 0.3)';
      } else {
        pwdChangeMsg.style.background = 'rgba(239, 68, 68, 0.15)';
        pwdChangeMsg.style.color = '#fca5a5';
        pwdChangeMsg.style.border = '1px solid rgba(239, 68, 68, 0.3)';
      }
    }

    if (!newPwd || newPwd.length < 4) {
      showPwdMsg('La password deve contenere almeno 4 caratteri.', 'error');
      return;
    }
    if (newPwd !== confirmPwd) {
      showPwdMsg('Le due password non coincidono. Riprova.', 'error');
      return;
    }

    btnSaveNewPwd.disabled = true;
    btnSaveNewPwd.textContent = '⏳ Salvataggio...';

    try {
      const res = await fetch('/api/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPassword: newPwd })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        showPwdMsg('✅ Password aggiornata con successo! Sarà valida per i prossimi accessi.', 'success');
        if (inputNewPwd) inputNewPwd.value = '';
        if (inputConfirmPwd) inputConfirmPwd.value = '';
      } else {
        showPwdMsg('❌ ' + (data.error || 'Errore durante l\'aggiornamento'), 'error');
      }
    } catch (err) {
      showPwdMsg('❌ Errore di connessione al server.', 'error');
    } finally {
      btnSaveNewPwd.disabled = false;
      btnSaveNewPwd.textContent = '💾 Aggiorna Password';
    }
  });
}
