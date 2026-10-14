// Dati Ufficiali Dipartimenti e Corsi di Laurea Università degli Studi di Messina (UniMe)
const departmentsData = {
  "Dipartimento di Civiltà Antiche e Moderne (DICAM)": [
    "Archeologia e Storia dell'Arte (L-1)",
    "Beni Archeologici: Territorio, Insediamenti, Cultura Materiale (L-1) - Noto",
    "Civiltà Letteraria dell'Italia Medievale e Moderna (LM-14)",
    "Comunicazione Digitale e Linguaggi del Giornalismo (LM-19 R)",
    "Filosofia (L-5 R)",
    "Filosofia Contemporanea (LM-78 R)",
    "Lettere (L-10 R)",
    "Lingue, Letterature Straniere e Tecniche della Mediazione Linguistica (L-11 R)",
    "Lingue, Letterature Straniere e Tecniche della Mediazione Linguistica (L-11/L-12 R)",
    "Mediazione Linguistica (L-12 R)",
    "Scienze Dell’informazione: Tecniche Giornalistiche e Social Media (L-20 R)",
    "Scienze Storiche: Società, Culture e Istituzioni d'Europa (LM-84 R)",
    "Tradizione Classica e Archeologia del Mediterraneo (LM-2 R)",
    "Tradizione Classica e Archeologia del Mediterraneo (LM-2/LM-15 R)",
    "Traduzione, Didattica e Relazioni Culturali per le Lingue e le Letterature Moderne (LM-37 R)"
  ],
  "Dipartimento di Economia": [
    "Big Data per le Scienze Economiche (L-33 R)",
    "Consulenza e Gestione di Impresa (LM-77 R)",
    "Digital Transformation e Innovation Management (LM-77 R)",
    "Economia Aziendale (L-18 R)",
    "Economia, Banca e Finanza (L-33 R)",
    "Management d'Impresa (L-18 R)",
    "Metodi Quantitativi per l'Economia e la Finanza (LM-56 R)"
  ],
  "Dipartimento di Giurisprudenza": [
    "Consulente del Lavoro e Scienze dei Servizi Giuridici (L-14 R) - Messina",
    "Consulente del Lavoro e Scienze dei Servizi Giuridici (L-14 R) - Siracusa",
    "Diritto dell'Innovazione e della Sostenibilità (LM/SC-GI R)",
    "Giurisprudenza (LMG/01 R) - Messina",
    "Giurisprudenza (LMG/01 R) - Siracusa",
    "Transnational and European Legal Studies (L-14 R)"
  ],
  "Dipartimento di Ingegneria": [
    "Bioingegneria (LM-21 R)",
    "Engineering in Computer Science (LM-32)",
    "Heritage Innovation Engineering (L-23 R)",
    "Ingegneria Biomedica (L-8 R)",
    "Ingegneria Civile (L-7 R)",
    "Ingegneria Civile (LM-23 R)",
    "Ingegneria Elettronica e Informatica (L-8 R)",
    "Ingegneria Elettronica per l'Industria (LM-29)",
    "Ingegneria Gestionale (L-9 R)",
    "Ingegneria Gestionale (LM-31)",
    "Ingegneria Industriale (L-9 R)",
    "Ingegneria Meccanica (LM-33)",
    "Scienze e Logistica del Trasporto Marittimo ed Aereo (LM-72 R)",
    "Scienze e Tecnologie della Navigazione (L-28 R)"
  ],
  "Dipartimento di Medicina Clinica e Sperimentale (DIMED)": [
    "Fisioterapia (L/SNT2)",
    "Infermieristica (Abilitante alla Professione Sanitaria di Infermiere) (L/SNT1) - Siracusa",
    "Infermieristica (L/SNT1)",
    "Infermieristica (L/SNT1) - Messina",
    "Infermieristica (L/SNT1) - Messina, Siracusa",
    "Infermieristica (L/SNT1) - Siracusa",
    "Medicina e Chirurgia - MEDBIOTECH (LM-41 R)",
    "Medicina e Chirurgia (LM-41 R)",
    "Psicologia Clinica e della Salute nel Ciclo di Vita (Abilitante alla Professione di Psicologo) (LM-51 R)",
    "Scienze e Tecniche Psicologiche Cliniche e Preventive (L-24 R)",
    "Scienze e Tecniche Psicologiche Cliniche e Preventive (L-24 R) - Messina",
    "Tecniche di Neurofisiopatologia (L/SNT3)"
  ],
  "Dipartimento di Patologia Umana dell'Adulto e dell'Età Evolutiva \"Gaetano Barresi\"": [
    "Infermieristica Pediatrica (L/SNT1)",
    "Logopedia (L/SNT2)",
    "Medicina e Chirurgia (LM-41 R)",
    "Ostetricia (L/SNT1)",
    "Scienze Infermieristiche e Ostetriche - Profilo Infermieristico (LM/SNT1)",
    "Scienze Infermieristiche e Ostetriche (LM/SNT1)",
    "Scienze Riabilitative delle Professioni Sanitarie (LM/SNT2)",
    "Tecniche Audioprotesiche (L/SNT3)",
    "Terapia della Neuro e Psicomotricità dell'Età Evolutiva (L/SNT2)"
  ],
  "Dipartimento di Scienze Biomediche, Odontoiatriche e delle Immagini Morfologiche e Funzionali (BIOMORF)": [
    "Biotecnologie (L-2 R)",
    "Biotecnologie Mediche (LM-9 R)",
    "Medicine and Surgery (LM-41 R)",
    "Odontoiatria e Protesi Dentaria (LM-46 R)",
    "Ortottica ed Assistenza Oftalmologica (L/SNT2)",
    "Scienze delle Professioni Sanitarie Tecniche Diagnostiche (LM/SNT3)",
    "Scienze e Tecniche delle Attività Motorie Preventive e Adattate (LM-67 R)",
    "Scienze Gastronomiche (L-26 R) - Messina",
    "Scienze Gastronomiche (L-26 R) - Noto",
    "Scienze Motorie, Sport e Salute (L-22 R)",
    "Tecnica della Riabilitazione Psichiatrica (L/SNT2)",
    "Tecniche della Prevenzione nell'Ambiente e nei Luoghi di Lavoro (L/SNT4)",
    "Tecniche di Laboratorio Biomedico (L/SNT3)",
    "Tecniche di Radiologia Medica, per Immagini e Radioterapia (L/SNT3)"
  ],
  "Dipartimento di Scienze Chimiche, Biologiche, Farmaceutiche e Ambientali (CHIBIOFARAM)": [
    "Biologia della Salute delle Tecnologie Applicate e della Nutrizione (LM-6 R)",
    "Biologia ed Ecologia dell'Ambiente Marino Costiero (LM-6 R)",
    "Chimica (L-27 R)",
    "Chimica (LM-54 R)",
    "Chimica e Tecnologia Farmaceutiche (LM-13 R)",
    "Farmacia (LM-13 R)",
    "Marine Biology and Blue Biotechnologies (L-13 R)",
    "Scienze Ambientali Marine e Terrestri (L-32 R)",
    "Scienze Biologiche (L-13 R)",
    "Scienze dell'Alimentazione e Nutrizione Umana (LM-61 R)",
    "Scienze Nutraceutiche e Alimenti Funzionali (L-29 R)"
  ],
  "Dipartimento di Scienze Cognitive, Psicologiche, Pedagogiche e degli Studi Culturali (COSPECS)": [
    "Cognitive Science and Theory of Communication (LM-55 R)",
    "Cognitive Science and Theory of Communication (LM-55/LM-92 R)",
    "Discipline delle Arti, della Musica e dello Spettacolo (L-3 R)",
    "Psicologia e Neuroscienze Cognitive (LM-51 R) - Noto",
    "Scienze del Turismo, della Cultura e dell'Impresa (L-15 R)",
    "Scienze dell'Informazione: Tecniche Giornalistiche e Social Media (L-20 R)",
    "Scienze della Comunicazione (L-20 R) - Messina",
    "Scienze della Comunicazione (L-20 R) - Noto",
    "Scienze della Formazione e della Comunicazione (L-19 R) - Messina",
    "Scienze della Formazione e della Comunicazione (L-19 R) - Noto",
    "Scienze della Formazione e della Comunicazione (L-19/L-20) - Messina",
    "Scienze della Formazione e della Comunicazione (L-19/L-20) - Noto",
    "Scienze della Formazione Primaria (LM-85 BIS)",
    "Scienze e Tecniche Psicologiche (L-24 R) - Messina",
    "Scienze e Tecniche Psicologiche (L-24 R) - Noto",
    "Scienze Pedagogiche (LM-85 R)",
    "Servizio Sociale, Politiche Sociali e Studi Sociologici e Ricerca Sociale (LM-87 R)",
    "Servizio Sociale, Politiche Sociali e Studi Sociologici e Ricerca Sociale (LM-87/LM-88 R)",
    "Turismo e Spettacolo (LM-49 R)",
    "Turismo e Spettacolo (LM-49/LM-65 R)"
  ],
  "Dipartimento di Scienze Matematiche e Informatiche, Scienze Fisiche e Scienze della Terra (MIFT)": [
    "Data Science (LM Data)",
    "Fisica (L-30 R)",
    "Geophysical Sciences for Seismic Risk (LM-79 R)",
    "Informatica (L-31 R)",
    "Matematica (L-35 R)",
    "Matematica (LM-40 R)",
    "Physics (LM-17 R)"
  ],
  "Dipartimento di Scienze Politiche e Giuridiche (SCIPOG)": [
    "Diritto delle Nuove Tecnologie (L-14 R)",
    "Global Security Studies (LM-52 R)",
    "Relazioni Internazionali (LM-52 R)",
    "Scienze del Servizio Sociale (L-39 R)",
    "Scienze dell'Amministrazione e dell'Organizzazione (L-16 R) - Messina",
    "Scienze dell'Amministrazione e dell'Organizzazione (L-16 R) - Siracusa",
    "Scienze delle Pubbliche Amministrazioni (LM-63 R)",
    "Scienze Politiche e delle Relazioni Internazionali (L-36 R)",
    "Scienze Politiche, Amministrazione e Servizi (L-16 R) - Messina",
    "Scienze Politiche, Amministrazione e Servizi (L-16 R) - Siracusa"
  ],
  "Dipartimento di Scienze Veterinarie": [
    "Biotecnologie Veterinarie (LM-9 R)",
    "Medicina Veterinaria (LM-42 R)",
    "Scienze e Tecnologie Agrarie per la Transizione Ecologica (L-25 R)",
    "Scienze, Tecnologie e Sicurezza delle Produzioni Animali (L-38 R)",
    "Sicurezza, Qualità e Sostenibilità delle Produzioni Animali (LM-86 R)"
  ],
  "Semestre Filtro": [
    "Canale A",
    "Canale B",
    "Canale C",
    "Canale D"
  ]
};

/**
 * Restituisce una sigla o nome breve e leggibile per il dipartimento
 */
function getDepartmentShortName(deptFullName) {
  if (!deptFullName) return '';
  const acronymMatch = deptFullName.match(/\(([^)]+)\)/);
  if (acronymMatch) return acronymMatch[1];
  if (deptFullName.includes("Economia")) return "Economia";
  if (deptFullName.includes("Giurisprudenza")) return "Giurisprudenza";
  if (deptFullName.includes("Ingegneria")) return "Ingegneria";
  if (deptFullName.includes("Veterinarie") || deptFullName.includes("Veterinaria")) return "Scienze Veterinarie";
  if (deptFullName.includes("Barresi")) return "Patologia Umana";
  if (deptFullName.includes("Filtro") || deptFullName.includes("Semestre")) return "Semestre Filtro";
  return deptFullName.replace(/^Dipartimento di\s+/i, "").trim();
}

/**
 * Calcola la lista degli anni accademici possibili in base alla tipologia di corso:
 * - Ciclo Unico (Medicina/Odontoiatria 6 anni; Giurisprudenza/Farmacia/Veterinaria/Formazione Primaria 5 anni): da 1 a 5/6 + Fuori Corso
 * - Magistrali Biennali (LM-...): da 1 a 2 + Fuori Corso
 * - Triennali (L-...): da 1 a 3 + Fuori Corso
 * - Semestre Filtro: 1° Anno, Fuori Corso
 */
function getCourseYears(courseName) {
  if (!courseName) {
    return ['1° Anno', '2° Anno', '3° Anno', 'Fuori Corso'];
  }

  // Medicina e Odontoiatria: Ciclo unico a 6 anni
  if (/LM-41|LM-46/i.test(courseName)) {
    return ['1° Anno', '2° Anno', '3° Anno', '4° Anno', '5° Anno', '6° Anno', 'Fuori Corso'];
  }

  // Magistrali a ciclo unico a 5 anni:
  // LMG/01 (Giurisprudenza), LM-13 (Farmacia/CTF), LM-42 (Veterinaria), LM-85 BIS (Scienze Formazione Primaria)
  if (/LMG\/01|LM-13|LM-42|LM-85\s*BIS/i.test(courseName)) {
    return ['1° Anno', '2° Anno', '3° Anno', '4° Anno', '5° Anno', 'Fuori Corso'];
  }

  // Magistrali biennali (LM-..., LM/..., LM Data)
  if (/LM[-\/]|LM\s*Data/i.test(courseName)) {
    return ['1° Anno', '2° Anno', 'Fuori Corso'];
  }

  // Semestre Filtro
  if (/Canale/i.test(courseName)) {
    return ['1° Anno', 'Fuori Corso'];
  }

  // Lauree triennali (L-..., L/...) e default
  return ['1° Anno', '2° Anno', '3° Anno', 'Fuori Corso'];
}

// Lista Regioni Italiane per suggerimento rapido
const italianRegions = [
  "Sicilia", "Calabria", "Lazio", "Lombardia", "Campania", "Puglia",
  "Piemonte", "Veneto", "Emilia-Romagna", "Toscana", "Sardegna", "Liguria",
  "Marche", "Abruzzo", "Friuli-Venezia Giulia", "Trentino-Alto Adige",
  "Umbria", "Basilicata", "Molise", "Valle d'Aosta", "Altro / Estero"
];

// Esportazione per browser e per Node.js
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    departmentsData,
    getDepartmentShortName,
    getCourseYears,
    italianRegions
  };
} else {
  window.departmentsData = departmentsData;
  window.getDepartmentShortName = getDepartmentShortName;
  window.getCourseYears = getCourseYears;
  window.italianRegions = italianRegions;
}
