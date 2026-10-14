const socket = io();

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
let currentFilter = 'all';
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
    currentFilter = btn.getAttribute('data-filter') || 'all';
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
        ${allAdminPlayers.length === 0 ? 'Nessun partecipante registrato al momento.' : 'Nessun partecipante corrisponde ai filtri di ricerca.'}
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
        <span style="font-size: 0.85rem; color: rgba(255,255,255,0.7);">${q.timeLimit || 20}s</span>
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
}

// Estrazione ponderata dal Pool di 400 Domande
const btnGenWeighted = document.getElementById('btn-generate-weighted');
if (btnGenWeighted) {
  btnGenWeighted.addEventListener('click', async () => {
    if (confirm('Vuoi estrarre 20 nuove domande ponderate dall\'archivio? Le opzioni di risposta verranno rimescolate in modo casuale.')) {
      btnGenWeighted.disabled = true;
      btnGenWeighted.textContent = '⏳ Estrazione in corso...';
      try {
        const res = await fetch('/api/questions/generate-weighted', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ count: 20 })
        });
        const data = await res.json();
        if (data.success) {
          loadedQuestions = data.questions;
          renderQuestionsList();
          alert('🎉 Estratte con successo 20 domande ponderate bilanciate tra ERSU, Didattica, Servizi e Morgana!');
        }
      } catch (err) {
        alert('Errore durante l\'estrazione delle domande.');
      } finally {
        btnGenWeighted.disabled = false;
        btnGenWeighted.textContent = '🎲 Estrai Nuove 20 Domande Ponderate';
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
