# 🎯 UniMe Level Up: L'interactive info show per le matricole

Lo show quiz interattivo per le matricole dell'**Università degli Studi di Messina (UniMe)**, organizzato dalle associazioni universitarie **Morgana** e **O.R.U.M.**.

Permette a un pubblico da **5 a 50+ spettatori** di partecipare in tempo reale rispondendo dal proprio smartphone inquadrando semplicemente un QR code proiettato sullo schermo.

---

## 🚀 Come avviare il Quiz

Apri il terminale nella cartella del progetto ed esegui:

```bash
npm start
```

Il terminale mostrerà i link pronti:
- 🖥️ **Schermo Proiettore (Maxischermo)**: `http://localhost:3000/host`
- 📱 **Link Partecipanti (Smartphone)**: `http://<IL_TUO_IP>:3000` *(generato in automatico nel QR Code)*
- ⚙️ **Pannello Regia & Domande**: `http://localhost:3000/admin`

---

## 🖥️ Setup dell'Evento (1 PC + 1 Schermo/Proiettore)

1. Collega il PC al videoproiettore o alla TV della sala (cavo HDMI o duplicazione schermo).
2. Sullo schermo proiettato apri il browser all'indirizzo:
   👉 **`http://localhost:3000/host`**
3. Premi **F11** sulla tastiera (o clicca l'icona ⛶ in alto a destra) per attivare la modalità a **Schermo Intero**.
4. I partecipanti non devono scaricare nulla: aprono la fotocamera del telefono, inquadrano il QR Code gigante, scelgono un avatar, inseriscono il proprio nickname ed entrano subito nella sala d'attesa!

---

## 🎮 Comandi e Conduzione del Gioco

Puoi condurre il quiz in due modi semplicissimi:

### 1. Direttamente dalla tastiera del PC
- **Barra Spaziatrice** o **Invio**:
  - Dalla Lobby ➔ **Avvia il Quiz** (countdown 3.. 2.. 1..)
  - Durante la domanda ➔ **Svela la risposta** (si chiude in automatico anche se tutti rispondono prima dello scadere del timer)
  - Con la risposta svelata ➔ **Mostra la Classifica Top 5**
  - Dalla Classifica ➔ **Passa alla Prossima Domanda** (o al **Podio Finale** alla 15ª domanda)

### 2. Dal Pannello Regia (`/admin`)
Puoi aprire `http://localhost:3000/admin` su una seconda scheda del PC oppure **dal tuo smartphone** personale collegato alla stessa rete per girare liberamente nella sala con il microfono e controllare:
- Avvio e passaggio domande
- Espulsione in tempo reale di eventuali partecipanti con nickname inappropriati
- Modifica delle domande al volo

---

## 📶 Connettività & Wi-Fi degli Spettatori

Ci sono 3 modalità pratiche per la connessione:
1. **Wi-Fi dell'aula o dell'ateneo (Consigliato)**: Il server rileva automaticamente l'IP locale e genera il QR Code pronto.
2. **Hotspot dal cellulare**: Se la rete dell'aula è instabile, accendi l'hotspot dello smartphone e connetti il PC. Il QR Code utilizzerà l'IP dell'hotspot.
3. **Tunnel Pubblico Internet (Opzionale)**: Se i partecipanti usano la loro rete dati 4G/5G indipendente dal Wi-Fi della stanza, puoi creare un link pubblico in un attimo digitando:
   ```bash
   npx localtunnel --port 3000
   ```
   e incollare il link generato nella sezione *Rete & QR Code* del pannello `/admin`. Il QR Code sullo schermo si aggiornerà istantaneamente!

---

## 📝 Personalizzazione Domande

Tutte le domande sono salvate in formato JSON in `questions.json`.
Puoi modificarle direttamente dal file oppure tramite l'editor grafico nel pannello `/admin`.

Ogni domanda supporta:
- `category`: Categoria (es. *"Storia di UniMe"*, *"Campus & Poli"*, *"Miti & Stretto"*)
- `question`: Testo della domanda
- `timeLimit`: Secondi di tempo (default 20s)
- `options`: Le 4 opzioni di risposta
- `correctIndex`: Indice da 0 a 3 della risposta corretta
- `explanation`: Box *"Curiosità UniMe"* visualizzato sullo schermo dopo la risposta!
