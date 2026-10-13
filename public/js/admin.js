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

// Control Actions
document.getElementById('admin-btn-start').addEventListener('click', () => {
  if (confirm('Sei sicuro di voler avviare il quiz azzerando i punteggi?')) {
    socket.emit('admin:startGame');
  }
});

document.getElementById('admin-btn-reveal').addEventListener('click', () => {
  socket.emit('admin:revealNow');
});

document.getElementById('admin-btn-next').addEventListener('click', () => {
  socket.emit('admin:next');
});

document.getElementById('admin-btn-podium').addEventListener('click', () => {
  if (confirm('Vuoi mostrare il podio finale?')) {
    socket.emit('admin:showPodium');
  }
});

document.getElementById('admin-btn-reset').addEventListener('click', () => {
  if (confirm('Vuoi resettare la partita e tornare alla lobby iniziale?')) {
    socket.emit('admin:resetLobby');
  }
});

// Players management
const adminPlayersList = document.getElementById('admin-players-list');
const adminPlayerCount = document.getElementById('admin-player-count');

socket.on('host:playersUpdated', (players) => {
  adminPlayerCount.textContent = players.length;
  adminPlayersList.innerHTML = '';

  if (players.length === 0) {
    adminPlayersList.innerHTML = '<div style="color: rgba(255,255,255,0.6); padding: 10px;">Nessun giocatore connesso al momento.</div>';
    return;
  }

  players.forEach(p => {
    const row = document.createElement('div');
    row.className = 'player-admin-row';
    row.innerHTML = `
      <div style="display: flex; align-items: center; gap: 12px;">
        <span style="font-size: 1.6rem;">${p.avatar}</span>
        <div>
          <strong style="font-size: 1.1rem; color: #fff;">${p.nickname}</strong>
          <span style="font-size: 0.85rem; color: var(--unime-gold); margin-left: 8px;">(${p.score} pt)</span>
        </div>
      </div>
      <button class="btn btn-glass" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.4); padding: 6px 12px; font-size: 0.85rem;" onclick="kickPlayer('${p.id}')">
        ❌ Espelli
      </button>
    `;
    adminPlayersList.appendChild(row);
  });
});

window.kickPlayer = function(playerId) {
  if (confirm('Espellere questo giocatore?')) {
    socket.emit('admin:kickPlayer', { playerId });
  }
};

// Questions Management
let loadedQuestions = [];

async function loadQuestions() {
  try {
    const res = await fetch('/api/questions');
    loadedQuestions = await res.json();
    document.getElementById('admin-q-count').textContent = loadedQuestions.length;
    renderQuestionsList();
  } catch (e) {
    console.error('Errore caricamento domande:', e);
  }
}

function renderQuestionsList() {
  const container = document.getElementById('admin-questions-list');
  container.innerHTML = '';

  loadedQuestions.forEach((q, idx) => {
    const item = document.createElement('div');
    item.className = 'question-item';
    item.innerHTML = `
      <div class="question-item-header">
        <span style="font-weight: 800; color: var(--unime-gold);">#${idx + 1} • ${q.category}</span>
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
