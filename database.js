const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'db.json');

const defaultState = {
  status: 'LOBBY', // 'LOBBY' | 'COUNTDOWN' | 'QUESTION' | 'SHOW_ANSWER' | 'LEADERBOARD' | 'FINAL_REVEAL' | 'PODIUM'
  currentQuestionIndex: 0,
  timeRemaining: 20,
  finalRevealStep: 0,
  podiumStep: 0,
  adminPassword: process.env.ADMIN_PASSWORD || 'unime2026',
  players: {}, // playerId -> giocatori nella partita/sessione attiva
  accounts: {}, // playerId -> archivio storico permanente di tutti i giocatori registrati in passato
  answersCurrentQuestion: {}, // playerId -> optionIndex
  answerStats: [0, 0, 0, 0]
};

class Database {
  constructor() {
    this.state = this.load();
  }

  load() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        
        // Carica archivio storico accounts
        const loadedAccounts = parsed.accounts || {};

        // Al caricamento, resetta connected a false per i giocatori attivi.
        // Se la partita era in LOBBY, non mantenere giocatori offline nella stanza d'attesa attiva.
        const loadedPlayers = {};
        if (parsed.players) {
          for (const [pid, p] of Object.entries(parsed.players)) {
            if (parsed.status !== 'LOBBY') {
              loadedPlayers[pid] = { ...p, connected: false };
            }
            // Sincronizza sempre nell'archivio storico permanente
            if (!loadedAccounts[pid]) {
              loadedAccounts[pid] = { ...p, connected: false };
            }
          }
        }

        console.log(`📦 Database caricato: ${Object.keys(loadedAccounts).length} account registrati nello storico (${Object.keys(loadedPlayers).length} attivi).`);

        return {
          ...defaultState,
          ...parsed,
          adminPassword: parsed.adminPassword || process.env.ADMIN_PASSWORD || 'unime2026',
          finalRevealStep: parsed.finalRevealStep || 0,
          podiumStep: parsed.podiumStep || 0,
          players: loadedPlayers,
          accounts: loadedAccounts,
          answersCurrentQuestion: parsed.answersCurrentQuestion || {},
          answerStats: parsed.answerStats || [0, 0, 0, 0]
        };
      }
    } catch (e) {
      console.error('⚠️ Errore lettura db.json, ripristino default:', e);
    }
    return JSON.parse(JSON.stringify(defaultState));
  }

  save() {
    try {
      const dataToSave = {
        status: this.state.status,
        currentQuestionIndex: this.state.currentQuestionIndex,
        timeRemaining: this.state.timeRemaining,
        finalRevealStep: this.state.finalRevealStep || 0,
        podiumStep: this.state.podiumStep || 0,
        adminPassword: this.state.adminPassword || process.env.ADMIN_PASSWORD || 'unime2026',
        players: this.state.players,
        accounts: this.state.accounts,
        answersCurrentQuestion: this.state.answersCurrentQuestion,
        answerStats: this.state.answerStats
      };
      // Scrittura atomica per evitare file corrotto
      const tmpFile = `${DB_FILE}.tmp`;
      fs.writeFileSync(tmpFile, JSON.stringify(dataToSave, null, 2), 'utf8');
      fs.renameSync(tmpFile, DB_FILE);
    } catch (e) {
      console.error('❌ Errore salvataggio db.json:', e);
    }
  }

  // Registra o aggiorna un account nell'archivio storico
  upsertAccount(data) {
    if (!data || !data.id) return null;
    const pid = data.id;
    const existing = this.state.accounts[pid] || {};

    const updatedAccount = {
      ...existing,
      ...data,
      id: pid,
      updatedAt: new Date().toISOString(),
      createdAt: existing.createdAt || data.createdAt || new Date().toISOString()
    };

    this.state.accounts[pid] = updatedAccount;

    // Sincronizza anche nel giocatore di sessione se presente
    if (this.state.players[pid]) {
      this.state.players[pid] = {
        ...this.state.players[pid],
        ...data,
        id: pid,
        score: this.state.players[pid].score, // mantieni punteggio partita
        streak: this.state.players[pid].streak,
        connected: this.state.players[pid].connected
      };
    }

    this.save();
    return updatedAccount;
  }

  // Elimina definitivamente un account sia dallo storico che dalla partita
  deleteAccount(pid) {
    let deleted = false;
    if (this.state.accounts && this.state.accounts[pid]) {
      delete this.state.accounts[pid];
      deleted = true;
    }
    if (this.state.players && this.state.players[pid]) {
      delete this.state.players[pid];
      deleted = true;
    }
    if (this.state.answersCurrentQuestion && this.state.answersCurrentQuestion[pid] !== undefined) {
      delete this.state.answersCurrentQuestion[pid];
    }
    if (deleted) {
      this.save();
    }
    return deleted;
  }

  reset() {
    this.state.status = 'LOBBY';
    this.state.currentQuestionIndex = 0;
    this.state.timeRemaining = 20;
    this.state.finalRevealStep = 0;
    this.state.podiumStep = 0;
    this.state.answersCurrentQuestion = {};
    this.state.answerStats = [0, 0, 0, 0];
    for (const p of Object.values(this.state.players)) {
      p.score = 0;
      p.streak = 0;
      p.lastPointsEarned = 0;
      p.lastAnswer = null;
    }
    this.save();
  }

  // Svuota i giocatori dalla partita attiva (gli account storici RIMANGONO intatti!)
  clearPlayers() {
    this.state.players = {};
    this.state.finalRevealStep = 0;
    this.state.podiumStep = 0;
    this.state.answersCurrentQuestion = {};
    this.state.answerStats = [0, 0, 0, 0];
    this.save();
  }
}

module.exports = new Database();
