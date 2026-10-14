const socket = io();

// Views
const views = {
  join: document.getElementById('view-join'),
  waiting: document.getElementById('view-waiting'),
  countdown: document.getElementById('view-countdown'),
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

// Rilevamento piattaforma iOS e supporto Fullscreen API
const isIOS = /iPhone|iPod/.test(navigator.userAgent) || (/iPad/.test(navigator.userAgent) && !window.MSStream);
const isStandalone = ('standalone' in window.navigator && window.navigator.standalone) || window.matchMedia('(display-mode: standalone)').matches;
const hasNativeFullscreen = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled || (document.documentElement && (document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen)));

const iosFsModal = document.getElementById('ios-fs-modal');
const btnCloseIosModal = document.getElementById('btn-close-ios-modal');

if (btnCloseIosModal && iosFsModal) {
  btnCloseIosModal.addEventListener('click', () => {
    iosFsModal.style.display = 'none';
  });
  const backdrop = iosFsModal.querySelector('.ios-fs-backdrop');
  if (backdrop) {
    backdrop.addEventListener('click', () => {
      iosFsModal.style.display = 'none';
    });
  }
}

function showIosFullscreenGuide() {
  if (iosFsModal) {
    iosFsModal.style.display = 'flex';
  }
}

// Fullscreen Automatico & Gestione Schermo
function requestPhoneFullscreen() {
  // Minimizza barra indirizzi Safari su iOS
  window.scrollTo(0, 1);

  if (hasNativeFullscreen) {
    const el = document.documentElement;
    if (!document.fullscreenElement && !document.webkitFullscreenElement) {
      if (el.requestFullscreen) {
        el.requestFullscreen().catch(() => {});
      } else if (el.webkitRequestFullscreen) {
        el.webkitRequestFullscreen();
      }
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
  if (isStandalone) {
    return; // Già a pieno schermo da Web App
  }

  if (isIOS && !hasNativeFullscreen) {
    // Su iPhone Safari: scrolla per minimizzare barre e mostra guida
    window.scrollTo(0, 1);
    showIosFullscreenGuide();
    return;
  }

  if (document.fullscreenElement || document.webkitFullscreenElement) {
    exitPhoneFullscreen();
  } else {
    requestPhoneFullscreen();
  }
}

// Aggancia pulsante schermo intero nell'header
const btnPlayerFs = document.getElementById('btn-player-fs');
if (btnPlayerFs) {
  if (isStandalone) {
    btnPlayerFs.textContent = '✓ Schermo Intero';
    btnPlayerFs.style.color = '#34d399';
    btnPlayerFs.style.borderColor = 'rgba(52, 211, 153, 0.4)';
  } else if (isIOS && !hasNativeFullscreen) {
    btnPlayerFs.textContent = '📱 Schermo Intero';
  }

  btnPlayerFs.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePhoneFullscreen();
  });
}

function updateFsButtonLabel() {
  if (btnPlayerFs && !isStandalone) {
    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    if (isIOS && !hasNativeFullscreen) {
      btnPlayerFs.textContent = '📱 Schermo Intero';
    } else {
      btnPlayerFs.textContent = isFs ? '✕ Riduci' : '⛶ Schermo Intero';
    }
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
let isUnime = true; // Default: studente UniMe

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

// Elementi Form Registrazione
const inputFirstname = document.getElementById('input-firstname');
const inputLastname = document.getElementById('input-lastname');
const inputPhone = document.getElementById('input-phone');
const inputEmail = document.getElementById('input-email');
const inputCountry = document.getElementById('input-country');
const selectRegion = document.getElementById('select-region');
const inputProvince = document.getElementById('input-province');
const inputCity = document.getElementById('input-city');
const btnUnimeYes = document.getElementById('btn-unime-yes');
const btnUnimeNo = document.getElementById('btn-unime-no');
const unimeConditionalFields = document.getElementById('unime-conditional-fields');
const inputMatricola = document.getElementById('input-matricola');
const selectDepartment = document.getElementById('select-department');
const selectCourse = document.getElementById('select-course');
const selectYear = document.getElementById('select-year');
const inputNick = document.getElementById('input-nickname');
const joinErrorBox = document.getElementById('join-error-box');
const joinErrorText = document.getElementById('join-error-text');

// Riepilogo Profilo in Sala d'Attesa
const summaryName = document.getElementById('summary-name');
const summaryUnimeInfo = document.getElementById('summary-unime-info');
const summaryGeoInfo = document.getElementById('summary-geo-info');
const summaryBadge = document.getElementById('summary-badge');

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

// Inizializza Regioni Italiane nel dropdown
function initRegionSelect() {
  if (!selectRegion) return;
  selectRegion.innerHTML = '';
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
    if (reg === 'Sicilia') opt.selected = true;
    selectRegion.appendChild(opt);
  });
}

// Inizializza Dipartimenti UniMe
function initDepartmentSelect() {
  if (!selectDepartment) return;
  selectDepartment.innerHTML = '<option value="">-- Seleziona Dipartimento --</option>';
  const depts = window.departmentsData ? Object.keys(window.departmentsData) : [];
  depts.forEach(dept => {
    const opt = document.createElement('option');
    opt.value = dept;
    opt.textContent = dept;
    selectDepartment.appendChild(opt);
  });
}

// Listener Selezione Dipartimento -> Popola Corsi di Laurea
if (selectDepartment) {
  selectDepartment.addEventListener('change', () => {
    const dept = selectDepartment.value;
    selectCourse.innerHTML = '<option value="">-- Seleziona Corso di Laurea --</option>';
    selectYear.innerHTML = '<option value="">-- Prima seleziona il Corso di Laurea --</option>';
    selectYear.disabled = true;

    if (dept && window.departmentsData && window.departmentsData[dept]) {
      const courses = window.departmentsData[dept];
      courses.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c;
        opt.textContent = c;
        selectCourse.appendChild(opt);
      });
      selectCourse.disabled = false;
    } else {
      selectCourse.disabled = true;
    }
  });
}

// Listener Selezione Corso di Laurea -> Popola Anni Dinamici
if (selectCourse) {
  selectCourse.addEventListener('change', () => {
    const course = selectCourse.value;
    selectYear.innerHTML = '<option value="">-- Seleziona Anno di Corso --</option>';

    if (course) {
      const years = window.getCourseYears ? window.getCourseYears(course) : ['1° Anno', '2° Anno', '3° Anno', 'Fuori Corso'];
      years.forEach(yr => {
        const opt = document.createElement('option');
        opt.value = yr;
        opt.textContent = yr;
        selectYear.appendChild(opt);
      });
      selectYear.disabled = false;
    } else {
      selectYear.disabled = true;
    }
  });
}

// Toggle Studente UniMe SÌ / NO
if (btnUnimeYes && btnUnimeNo) {
  btnUnimeYes.addEventListener('click', () => {
    isUnime = true;
    btnUnimeYes.classList.add('active');
    btnUnimeNo.classList.remove('active');
    if (unimeConditionalFields) unimeConditionalFields.style.display = 'flex';
  });

  btnUnimeNo.addEventListener('click', () => {
    isUnime = false;
    btnUnimeNo.classList.add('active');
    btnUnimeYes.classList.remove('active');
    if (unimeConditionalFields) unimeConditionalFields.style.display = 'none';
  });
}

// Aggiorna card riepilogo in Sala d'Attesa
function updateProfileSummaryCard(profile) {
  if (!profile) return;
  if (summaryName) {
    const displayName = `${profile.firstName || ''} ${profile.lastName || ''}`.trim() || profile.nickname || 'Matricola';
    summaryName.textContent = `${profile.avatar || '🎓'} ${displayName} (${profile.nickname || 'Squadra'})`;
  }
  if (summaryUnimeInfo) {
    if (profile.isUnime) {
      const shortDept = window.getDepartmentShortName ? window.getDepartmentShortName(profile.department) : (profile.department || '');
      summaryUnimeInfo.textContent = `🏛️ UniMe: ${shortDept} • ${profile.course || ''} (${profile.academicYear || ''}) • Matr. ${profile.matricola || 'N/D'}`;
    } else {
      summaryUnimeInfo.textContent = `🌍 Partecipante Esterno / Futuro Studente`;
    }
  }
  if (summaryGeoInfo) {
    const provStr = profile.province ? `(${profile.province})` : '';
    summaryGeoInfo.textContent = `📍 ${profile.city || ''} ${provStr}, ${profile.region || ''} • 📞 ${profile.phone || ''} • ✉️ ${profile.email || ''}`;
  }
}

// Carica e ripristina registrazione da localStorage
function loadSavedRegistration() {
  initRegionSelect();
  initDepartmentSelect();

  try {
    const raw = localStorage.getItem('unime_quiz_registration');
    if (raw) {
      const reg = JSON.parse(raw);
      if (inputFirstname && reg.firstName) inputFirstname.value = reg.firstName;
      if (inputLastname && reg.lastName) inputLastname.value = reg.lastName;
      if (inputPhone && reg.phone) inputPhone.value = reg.phone;
      if (inputEmail && reg.email) inputEmail.value = reg.email;
      if (inputCountry && reg.country) inputCountry.value = reg.country;
      if (selectRegion && reg.region) selectRegion.value = reg.region;
      if (inputProvince && reg.province) inputProvince.value = reg.province;
      if (inputCity && reg.city) inputCity.value = reg.city;

      isUnime = (reg.isUnime !== false);
      if (btnUnimeYes && btnUnimeNo) {
        btnUnimeYes.classList.toggle('active', isUnime);
        btnUnimeNo.classList.toggle('active', !isUnime);
      }
      if (unimeConditionalFields) {
        unimeConditionalFields.style.display = isUnime ? 'flex' : 'none';
      }

      if (inputMatricola && reg.matricola) inputMatricola.value = reg.matricola;
      if (selectDepartment && reg.department) {
        selectDepartment.value = reg.department;
        selectDepartment.dispatchEvent(new Event('change'));
        if (selectCourse && reg.course) {
          selectCourse.value = reg.course;
          selectCourse.dispatchEvent(new Event('change'));
          if (selectYear && reg.academicYear) {
            selectYear.value = reg.academicYear;
          }
        }
      }

      if (inputNick && reg.nickname) {
        inputNick.value = reg.nickname;
        playerNickname = reg.nickname;
      }

      if (reg.avatar) {
        selectedAvatar = reg.avatar;
        avatarBtns.forEach(b => {
          b.classList.toggle('selected', b.getAttribute('data-avatar') === reg.avatar);
        });
      }

      updateProfileSummaryCard(reg);
    } else {
      // Compatibilità con sessioni precedenti
      const legacyNick = localStorage.getItem('unime_quiz_nick');
      const legacyAvatar = localStorage.getItem('unime_quiz_avatar');
      if (legacyNick && inputNick) inputNick.value = legacyNick;
      if (legacyAvatar) {
        selectedAvatar = legacyAvatar;
        avatarBtns.forEach(b => {
          b.classList.toggle('selected', b.getAttribute('data-avatar') === legacyAvatar);
        });
      }
    }
  } catch (e) {
    console.error('Errore ripristino dati utente:', e);
  }
}

// Inizializza subito i dropdown
loadSavedRegistration();

// Funzione di Registrazione/Riconnessione robusta della pulsantiera
function syncPlayerWithServer() {
  try {
    const raw = localStorage.getItem('unime_quiz_registration');
    if (raw) {
      const reg = JSON.parse(raw);
      reg.playerId = myPlayerId;
      playerNickname = reg.nickname || playerNickname;
      selectedAvatar = reg.avatar || selectedAvatar;
      updateProfileSummaryCard(reg);
      document.getElementById('my-nick-display').textContent = `Pulsantiera: ${reg.nickname}`;
      socket.emit('player:join', reg);
    } else {
      const savedNick = localStorage.getItem('unime_quiz_nick') || playerNickname;
      const savedAvatar = localStorage.getItem('unime_quiz_avatar') || selectedAvatar;
      if (savedNick) {
        playerNickname = savedNick;
        selectedAvatar = savedAvatar;
        document.getElementById('my-nick-display').textContent = `Pulsantiera: ${savedNick}`;
        socket.emit('player:join', {
          nickname: savedNick,
          avatar: savedAvatar,
          playerId: myPlayerId
        });
      }
    }
  } catch (e) {
    console.error('Errore durante sync con il server:', e);
  }
}

if (socket.connected) {
  syncPlayerWithServer();
}
// Ri-sincronizza sempre su ogni connessione o riconnessione socket
socket.on('connect', syncPlayerWithServer);

// Controllo visibilità pulsante Cambio Nome Squadra/Profilo:
// SI PUÒ CAMBIARE SOLO QUANDO LA PARTITA NON È INIZIATA (LOBBY) O CHI È IN SALA D'ATTESA
function updateEditTeamVisibility(canEdit) {
  const btn = document.getElementById('btn-edit-team');
  if (btn) {
    btn.style.display = canEdit ? 'inline-block' : 'none';
  }
}

// Funzione di visualizzazione robusta della domanda corrente (usata sia su reconnect sia su broadcast)
function renderActiveQuestion(qData, hasAnswered = false, playerAnswer = undefined) {
  if (!qData) return;
  isJoined = true;
  answerSubmitted = !!hasAnswered;

  updateEditTeamVisibility(false);

  // Aggiorna stato LCD
  const lcdBadge = document.getElementById('lcd-status-badge');
  if (lcdBadge) {
    lcdBadge.textContent = 'IN GARA';
    lcdBadge.style.color = 'var(--accent-gold)';
  }

  // Categoria e contatore
  const catEl = document.getElementById('player-cat-badge');
  if (catEl) catEl.textContent = qData.category || 'UniMe';
  const qCountEl = document.getElementById('player-q-counter');
  if (qCountEl) qCountEl.textContent = `Q: ${(qData.questionIndex !== undefined ? qData.questionIndex + 1 : 1)}/${qData.totalQuestions || 20}`;

  // Reset timer badge e barra
  currentTotalTime = qData.timeLimit || 20;
  const timerBadge = document.getElementById('player-timer-badge');
  if (timerBadge) {
    timerBadge.textContent = `⏱️ ${currentTotalTime}s`;
    timerBadge.classList.remove('danger');
  }

  const timerFill = document.getElementById('player-timer-fill');
  if (timerFill) {
    timerFill.style.transition = 'none';
    timerFill.style.width = '100%';
    setTimeout(() => {
      timerFill.style.transition = `width ${currentTotalTime}s linear`;
      timerFill.style.width = '0%';
    }, 50);
  }

  // Popola i testi delle 4 opzioni sui bottoni arcade
  if (Array.isArray(qData.options)) {
    for (let i = 0; i < 4; i++) {
      const optLabel = document.getElementById(`btn-opt-${i}-text`);
      if (optLabel) optLabel.textContent = qData.options[i] || '';
    }
  }

  // Reset classi sui bottoni
  const padButtons = document.querySelectorAll('.arcade-pad-btn');
  padButtons.forEach(btn => {
    btn.classList.remove('selected');
    btn.style.pointerEvents = hasAnswered ? 'none' : 'auto';
  });

  if (hasAnswered) {
    showView('answered');
    if (playerAnswer !== undefined && playerAnswer !== null) {
      const chosenBtn = document.querySelector(`.arcade-pad-btn[data-opt="${playerAnswer}"]`);
      if (chosenBtn) chosenBtn.classList.add('selected');
    }
  } else {
    showView('question');
    if (navigator.vibrate) navigator.vibrate([40, 60]);
  }
}

// Join & Registrazione Partecipante
const btnJoin = document.getElementById('btn-join');

btnJoin.addEventListener('click', handleJoin);

function handleJoin() {
  requestPhoneFullscreen();

  // Reset errori visivi
  if (joinErrorBox) joinErrorBox.style.display = 'none';
  document.querySelectorAll('.form-input, .form-select').forEach(el => el.classList.remove('invalid'));

  const firstName = inputFirstname ? inputFirstname.value.trim() : '';
  const lastName = inputLastname ? inputLastname.value.trim() : '';
  const phone = inputPhone ? inputPhone.value.trim() : '';
  const email = inputEmail ? inputEmail.value.trim() : '';
  const country = inputCountry ? inputCountry.value.trim() : 'Italia';
  const region = selectRegion ? selectRegion.value : '';
  const province = inputProvince ? inputProvince.value.trim() : '';
  const city = inputCity ? inputCity.value.trim() : '';

  // Validazione campi obbligatori
  const errors = [];
  if (!firstName) { errors.push('Nome'); if (inputFirstname) inputFirstname.classList.add('invalid'); }
  if (!lastName) { errors.push('Cognome'); if (inputLastname) inputLastname.classList.add('invalid'); }
  if (!phone || phone.length < 6) { errors.push('Telefono valido'); if (inputPhone) inputPhone.classList.add('invalid'); }
  if (!email || !email.includes('@') || !email.includes('.')) { errors.push('Email valida'); if (inputEmail) inputEmail.classList.add('invalid'); }
  if (!country) { errors.push('Stato'); if (inputCountry) inputCountry.classList.add('invalid'); }
  if (!region) { errors.push('Regione'); if (selectRegion) selectRegion.classList.add('invalid'); }
  if (!province) { errors.push('Provincia'); if (inputProvince) inputProvince.classList.add('invalid'); }
  if (!city) { errors.push('Città'); if (inputCity) inputCity.classList.add('invalid'); }

  let matricola = '';
  let department = '';
  let course = '';
  let academicYear = '';

  if (isUnime) {
    matricola = inputMatricola ? inputMatricola.value.trim() : '';
    department = selectDepartment ? selectDepartment.value : '';
    course = selectCourse ? selectCourse.value : '';
    academicYear = selectYear ? selectYear.value : '';

    if (!matricola) { errors.push('Matricola'); if (inputMatricola) inputMatricola.classList.add('invalid'); }
    if (!department) { errors.push('Dipartimento'); if (selectDepartment) selectDepartment.classList.add('invalid'); }
    if (!course) { errors.push('Corso di Laurea'); if (selectCourse) selectCourse.classList.add('invalid'); }
    if (!academicYear) { errors.push('Anno di Corso'); if (selectYear) selectYear.classList.add('invalid'); }
  }

  if (errors.length > 0) {
    if (joinErrorBox && joinErrorText) {
      joinErrorText.textContent = `Compila i seguenti campi: ${errors.join(', ')}`;
      joinErrorBox.style.display = 'flex';
      joinErrorBox.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    return;
  }

  // Nome visualizzato sul maxischermo
  let customNick = inputNick ? inputNick.value.trim() : '';
  if (!customNick) {
    customNick = `${firstName} ${lastName.charAt(0)}.`.slice(0, 16);
    if (inputNick) inputNick.value = customNick;
  }
  playerNickname = customNick;

  const registrationData = {
    playerId: myPlayerId,
    nickname: customNick,
    avatar: selectedAvatar,
    firstName,
    lastName,
    phone,
    email,
    country,
    region,
    province,
    city,
    isUnime,
    matricola,
    department,
    course,
    academicYear
  };

  try {
    localStorage.setItem('unime_quiz_registration', JSON.stringify(registrationData));
    localStorage.setItem('unime_quiz_nick', customNick);
    localStorage.setItem('unime_quiz_avatar', selectedAvatar);
  } catch (e) {}

  updateProfileSummaryCard(registrationData);
  window.sounds.init();

  socket.emit('player:join', registrationData);
}

// Consenti di cambiare dati o nickname (permesso in LOBBY o SALA D'ATTESA)
const btnEditTeam = document.getElementById('btn-edit-team');
if (btnEditTeam) {
  btnEditTeam.addEventListener('click', () => {
    showView('join');
    if (inputFirstname) inputFirstname.focus();
  });
}


socket.on('player:accountUpdated', (updated) => {
  if (updated) {
    try {
      localStorage.setItem('unime_quiz_registration', JSON.stringify(updated));
      localStorage.setItem('unime_quiz_nick', updated.nickname);
      localStorage.setItem('unime_quiz_avatar', updated.avatar);
    } catch (e) {}
    updateProfileSummaryCard(updated);
    playerNickname = updated.nickname;
    selectedAvatar = updated.avatar;
    document.getElementById('my-nick-display').textContent = `Pulsantiera: ${updated.nickname}`;
    const lcdNick = document.getElementById('lcd-nickname');
    const lcdAvatar = document.getElementById('lcd-avatar');
    if (lcdNick) lcdNick.textContent = updated.nickname;
    if (lcdAvatar) lcdAvatar.textContent = updated.avatar;
  }
});

socket.on('player:joined', (data) => {
  isJoined = true;

  // Mostra display LCD della pulsantiera
  const lcdDisplay = document.getElementById('lcd-display');
  if (lcdDisplay) {
    lcdDisplay.style.display = 'flex';
    document.getElementById('lcd-nickname').textContent = data.nickname;
    document.getElementById('lcd-avatar').textContent = data.avatar;
  }

  document.getElementById('my-avatar-display').textContent = data.avatar;
  document.getElementById('my-nick-display').textContent = `Pulsantiera: ${data.nickname}`;

  // Se il giocatore si è unito a partita in corso, mostragli la sala d'attesa!
  if (data.isWaitingRoom || data.status === 'WAITING_ROOM') {
    showView('waiting');
    updateEditTeamVisibility(true); // IN SALA D'ATTESA SI PUÒ CAMBIARE IL NOME SQUADRA
    const nickDisplay = document.getElementById('my-nick-display');
    const waitingSub = document.querySelector('.waiting-sub');
    const lcdBadge = document.getElementById('lcd-status-badge');
    if (nickDisplay) nickDisplay.textContent = 'Sala d\'Attesa! ⏳';
    if (waitingSub) {
      waitingSub.innerHTML = 'Partita attualmente in corso.<br><strong>Entrerai in gara non appena parte la prossima domanda!</strong> Dita pronte ⚡';
    }
    if (lcdBadge) {
      lcdBadge.textContent = 'SALA D\'ATTESA';
      lcdBadge.style.color = 'var(--accent-gold)';
    }
    return;
  }

  const lcdBadge = document.getElementById('lcd-status-badge');
  if (lcdBadge) {
    lcdBadge.textContent = 'IN GARA';
    lcdBadge.style.color = 'var(--accent-gold)';
  }

  if (data.status === 'LOBBY') {
    showView('waiting');
    updateEditTeamVisibility(true); // NELLA LOBBY SI PUÒ CAMBIARE IL NOME SQUADRA
  } else if (data.status === 'COUNTDOWN') {
    updateEditTeamVisibility(false); // PARTITA INIZIATA: NON SI PUÒ CAMBIARE
    showView('countdown');
  } else if (data.status === 'QUESTION') {
    updateEditTeamVisibility(false); // PARTITA INIZIATA: NON SI PUÒ CAMBIARE
    if (data.currentQuestion) {
      renderActiveQuestion(data.currentQuestion, data.playerAnswer !== undefined, data.playerAnswer);
    } else if (data.playerAnswer !== undefined) {
      answerSubmitted = true;
      showView('answered');
    } else {
      answerSubmitted = false;
      showView('question');
    }
  } else if (data.status === 'SHOW_ANSWER') {
    updateEditTeamVisibility(false);
    showView('answered');
  } else if (data.status === 'LEADERBOARD') {
    updateEditTeamVisibility(false);
    showView('waiting');
    document.getElementById('my-nick-display').textContent = 'Guarda il Maxischermo!';
    document.querySelector('.waiting-sub').textContent = 'Classifica proiettata in sala...';
  } else if (data.status === 'FINAL_REVEAL') {
    updateEditTeamVisibility(false);
    showView('waiting');
    document.getElementById('my-nick-display').textContent = 'Guarda il Maxischermo!';
    document.querySelector('.waiting-sub').textContent = 'Svelamento classifica finale in corso...';
  } else if (data.status === 'PODIUM') {
    updateEditTeamVisibility(false);
    showView('gameOver');
  }
});

// Question Started
let currentTotalTime = 20;
let answerSubmitted = false;

socket.on('game:questionStarted', (data) => {
  renderActiveQuestion(data, false);
});

// Timer Tick live sullo smartphone
socket.on('game:timerTick', ({ timeRemaining }) => {
  const timerBadge = document.getElementById('player-timer-badge');
  if (timerBadge) {
    timerBadge.textContent = `⏱️ ${timeRemaining}s`;
    if (timeRemaining <= 5 && timeRemaining > 0) {
      timerBadge.classList.add('danger');
    } else {
      timerBadge.classList.remove('danger');
    }
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
    // Invia sempre sia optionIndex sia playerId persistente
    socket.emit('player:submitAnswer', { optionIndex: optIndex, playerId: myPlayerId });
    showView('answered');
  });
});

socket.on('player:answerAck', () => {
  answerSubmitted = true;
  showView('answered');
});

// Round Result: i giocatori vedono solo che la risposta è stata registrata o se il tempo è scaduto
socket.on('player:roundResult', ({ isCorrect, selectedOption }) => {
  if (!isJoined) return;
  showView('answered');

  const aTitle = document.getElementById('answered-title');
  const aSub = document.getElementById('answered-subtitle');
  if (selectedOption !== undefined && selectedOption !== null) {
    if (aTitle) aTitle.textContent = 'RISPOSTA REGISTRATA! ⚡';
    if (aSub) aSub.innerHTML = 'Risposta ricevuta in tempo.<br>Guarda il maxischermo per la soluzione!';
  } else {
    if (aTitle) aTitle.textContent = 'TEMPO SCADUTO! ⌛';
    if (aSub) aSub.innerHTML = 'Nessuna risposta inviata in tempo.<br>Occhio al maxischermo!';
  }

  const timerBadge = document.getElementById('player-timer-badge');
  if (timerBadge) {
    timerBadge.textContent = '⏱️ 0s';
    timerBadge.classList.remove('danger');
  }

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

socket.on('game:finalReveal', () => {
  if (!isJoined) return;
  showView('waiting');
  document.getElementById('my-nick-display').textContent = 'Guarda il Maxischermo!';
  document.querySelector('.waiting-sub').textContent = 'Svelamento classifica finale in corso...';
});

// Countdown state (Timer iniziale visibile a tutto schermo sullo smartphone)
socket.on('game:countdown', ({ count }) => {
  if (!isJoined) return;
  showView('countdown');
  const countEl = document.getElementById('phone-countdown-number');
  if (countEl) {
    countEl.textContent = count;
    countEl.style.animation = 'none';
    void countEl.offsetWidth; // trigger reflow
    countEl.style.animation = 'giantPop 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275)';
  }
  if (window.sounds) window.sounds.playCountdown();
  if (navigator.vibrate) navigator.vibrate(60);
});

// Podium / Game Over
socket.on('game:podium', () => {
  if (!isJoined) return;
  showView('gameOver');
});

// Reset to Lobby
socket.on('game:resetToLobby', () => {
  updateEditTeamVisibility(true);
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

// Notifica immediata di disconnessione quando si chiude o si naviga via dalla pagina
function notifyLeavePage() {
  if (socket && socket.connected) {
    try {
      socket.emit('player:leave', { playerId: myPlayerId });
      socket.disconnect();
    } catch (e) {}
  }
}
window.addEventListener('beforeunload', notifyLeavePage);
window.addEventListener('pagehide', notifyLeavePage);
