const fs = require('fs');
const path = require('path');

const DB_FILE = path.join(__dirname, 'db.json');

const defaultState = {
  status: 'LOBBY', // 'LOBBY' | 'COUNTDOWN' | 'QUESTION' | 'SHOW_ANSWER' | 'LEADERBOARD' | 'FINAL_REVEAL' | 'PODIUM'
  currentQuestionIndex: 0,
  timeRemaining: 20,
  finalRevealStep: 0,
  podiumStep: 0,
  players: {}, // playerId -> { id, nickname, avatar, score, streak, connected, lastAnswer, lastAnswerTime, lastPointsEarned }
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
        console.log(`📦 Database caricato: ${Object.keys(parsed.players || {}).length} giocatori registrati.`);

        // Al caricamento, resetta connected a false per evitare conteggi fantasma prima della riconnessione dei socket
        const loadedPlayers = {};
        if (parsed.players) {
          for (const [pid, p] of Object.entries(parsed.players)) {
            loadedPlayers[pid] = { ...p, connected: false };
          }
        }

        return {
          ...defaultState,
          ...parsed,
          finalRevealStep: parsed.finalRevealStep || 0,
          podiumStep: parsed.podiumStep || 0,
          players: loadedPlayers,
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
        players: this.state.players,
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
