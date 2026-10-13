const fs = require('fs');
const path = require('path');

const POOL_PATH = path.join(__dirname, 'questions_pool.json');
const ACTIVE_PATH = path.join(__dirname, 'questions.json');

// Fisher-Yates shuffle
function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Carica il pool completo di domande
function loadPool() {
  try {
    if (fs.existsSync(POOL_PATH)) {
      const data = fs.readFileSync(POOL_PATH, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('Errore caricamento questions_pool.json:', err);
  }
  return [];
}

/**
 * Estrae un set ponderato di domande per la partita (default max 20)
 * distribuite equamente tra le 4 Macro Aree:
 * 1. ERSU Messina (Posti Letto, Borse di Studio, Mensa)
 * 2. Didattica & Guide UniMe (Esami, Appelli, CFU, Dipartimenti)
 * 3. Servizi, Mobilità & Ateneo (Email/AI, ATM, CUS Sport, Storia UniMe)
 * 4. Associazione Morgana & O.R.U.M. (Storia, Eventi, Battaglie, Digitale)
 *
 * Per ciascuna domanda, le 4 opzioni (A, B, C, D) vengono MESCOLATE IN MODO CASUALE,
 * riallineando correctIndex alla nuova posizione della risposta corretta.
 */
function generateWeightedGameQuestions(targetCount = 20) {
  const pool = loadPool();
  if (!pool || pool.length === 0) {
    console.warn('Pool di domande vuoto o non trovato.');
    return [];
  }

  // Raggruppa per macroArea
  const byMacro = {};
  pool.forEach(q => {
    const macro = q.macroArea || 'Altro';
    if (!byMacro[macro]) byMacro[macro] = [];
    byMacro[macro].push(q);
  });

  const macroKeys = Object.keys(byMacro);
  const selectedRaw = [];

  if (macroKeys.length === 0) {
    return [];
  }

  // Quante domande per macro-area (es. 20 / 4 = 5 ciascuna)
  const basePerMacro = Math.floor(targetCount / macroKeys.length);
  let remainder = targetCount % macroKeys.length;

  for (const macro of macroKeys) {
    const targetThisMacro = basePerMacro + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder--;

    // Raggruppa per sottocategoria per garantire varietà interna
    const byCategory = {};
    byMacro[macro].forEach(q => {
      if (!byCategory[q.category]) byCategory[q.category] = [];
      byCategory[q.category].push(q);
    });

    const catKeys = Object.keys(byCategory);
    const chosenFromMacro = [];

    // Mescola ogni categoria
    for (const ck of catKeys) {
      byCategory[ck] = shuffle(byCategory[ck]);
    }

    // Round-robin tra le sottocategorie
    let catIdx = 0;
    while (chosenFromMacro.length < targetThisMacro) {
      const currentCat = catKeys[catIdx % catKeys.length];
      if (byCategory[currentCat].length > 0) {
        chosenFromMacro.push(byCategory[currentCat].pop());
      } else {
        // Se una categoria è esaurita, cerca nelle altre
        const anyAvail = catKeys.find(c => byCategory[c].length > 0);
        if (anyAvail) {
          chosenFromMacro.push(byCategory[anyAvail].pop());
        } else {
          break; // finite tutte in questa macro
        }
      }
      catIdx++;
    }

    selectedRaw.push(...chosenFromMacro);
  }

  // Se mancano ancora domande per arrivare al target, prendi a caso dal pool rimanente
  if (selectedRaw.length < targetCount) {
    const selectedIds = new Set(selectedRaw.map(q => q.id));
    const remainingPool = shuffle(pool.filter(q => !selectedIds.has(q.id)));
    while (selectedRaw.length < targetCount && remainingPool.length > 0) {
      selectedRaw.push(remainingPool.pop());
    }
  }

  // Mescola l'ordine delle 20 domande della partita
  const shuffledQuestions = shuffle(selectedRaw);

  // Per ciascuna domanda: MESCOLAMENTO CASUALE DELLE 4 OPZIONI
  const finalized = shuffledQuestions.slice(0, targetCount).map((q, idx) => {
    const correctText = q.correctText || q.options[q.correctIndex];
    // Mescola le opzioni A, B, C, D
    const shuffledOptions = shuffle(q.options);
    const newCorrectIndex = shuffledOptions.indexOf(correctText);

    return {
      id: idx + 1,
      poolId: q.id,
      macroArea: q.macroArea,
      category: q.category,
      question: q.question,
      options: shuffledOptions,
      correctIndex: newCorrectIndex,
      correctText: correctText,
      timeLimit: q.timeLimit || 20,
      explanation: q.explanation || `Risposta corretta: ${correctText}`
    };
  });

  return finalized;
}

/**
 * Salva il set di domande attivo su disco (questions.json)
 */
function saveActiveQuestions(questions) {
  try {
    fs.writeFileSync(ACTIVE_PATH, JSON.stringify(questions, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('Errore scrittura questions.json:', err);
    return false;
  }
}

/**
 * Carica le domande attive o ne genera 20 nuove ponderate se il file non esiste o è vuoto
 */
function loadOrGenerateActiveQuestions(count = 20) {
  try {
    if (fs.existsSync(ACTIVE_PATH)) {
      const data = fs.readFileSync(ACTIVE_PATH, 'utf8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('questions.json non valido, ne genero uno nuovo dal pool ponderato.');
  }

  const generated = generateWeightedGameQuestions(count);
  saveActiveQuestions(generated);
  return generated;
}

/**
 * Statistiche del pool per pannello admin
 */
function getPoolStats() {
  const pool = loadPool();
  const byMacro = {};
  pool.forEach(q => {
    byMacro[q.macroArea] = (byMacro[q.macroArea] || 0) + 1;
  });
  return {
    totalQuestions: pool.length,
    macroAreas: byMacro
  };
}

module.exports = {
  loadPool,
  generateWeightedGameQuestions,
  saveActiveQuestions,
  loadOrGenerateActiveQuestions,
  getPoolStats,
  shuffle
};
