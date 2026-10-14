// Web Audio API Sound Effects Synthesizer
class SoundManager {
  constructor() {
    this.ctx = null;
    this.muted = false;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    return this.muted;
  }

  playCountdown() {
    if (this.muted) return;
    this.init();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);

    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.2);
  }

  unlockAudio() {
    this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  playTickUrgent() {
    if (this.muted) return;
    this.init();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(880, now); // Nota più acuta e incalzante
    osc.frequency.exponentialRampToValueAtTime(1100, now + 0.06);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.08);
  }

  playTimeUp() {
    if (this.muted) return;
    this.init();
    const now = this.ctx.currentTime;
    // Gong / Buzzer perentorio sintetizzato
    const osc1 = this.ctx.createOscillator();
    const osc2 = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc1.type = 'triangle';
    osc1.frequency.setValueAtTime(140, now);
    osc1.frequency.exponentialRampToValueAtTime(70, now + 0.6);

    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(145, now);
    osc2.frequency.exponentialRampToValueAtTime(65, now + 0.6);

    gain.gain.setValueAtTime(0.3, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.65);

    osc1.connect(gain);
    osc2.connect(gain);
    gain.connect(this.ctx.destination);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + 0.65);
    osc2.stop(now + 0.65);
  }

  playQuestionStart() {
    if (this.muted) return;
    this.init();
    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const startTime = now + (i * 0.08);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.15, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.25);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.25);
    });
  }

  playCorrect() {
    if (this.muted) return;
    this.init();
    const now = this.ctx.currentTime;
    const notes = [587.33, 739.99, 880, 1174.66]; // D5, F#5, A5, D6
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const startTime = now + (i * 0.09);

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime);

      gain.gain.setValueAtTime(0.2, startTime);
      gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(startTime);
      osc.stop(startTime + 0.35);
    });
  }

  playWrong() {
    if (this.muted) return;
    this.init();
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(220, now);
    osc.frequency.linearRampToValueAtTime(110, now + 0.3);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + 0.35);
  }

  playPodiumFanfare() {
    if (this.muted) return;
    this.init();
    const now = this.ctx.currentTime;
    const fanfare = [
      { f: 523.25, d: 0.15 },
      { f: 523.25, d: 0.15 },
      { f: 523.25, d: 0.15 },
      { f: 659.25, d: 0.4 },
      { f: 783.99, d: 0.25 },
      { f: 1046.50, d: 0.7 }
    ];
    let offset = 0;
    fanfare.forEach(item => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const st = now + offset;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(item.f, st);

      gain.gain.setValueAtTime(0.22, st);
      gain.gain.exponentialRampToValueAtTime(0.001, st + item.d);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(st);
      osc.stop(st + item.d);
      offset += item.d + 0.04;
    });
  }

  playReveal() {
    if (this.muted) return;
    this.init();
    const now = this.ctx.currentTime;
    const notes = [440, 554.37, 659.25]; // A4, C#5, E5
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const st = now + (i * 0.07);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, st);
      gain.gain.setValueAtTime(0.18, st);
      gain.gain.exponentialRampToValueAtTime(0.001, st + 0.3);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(st);
      osc.stop(st + 0.3);
    });
  }

  playBronze() {
    if (this.muted) return;
    this.init();
    const now = this.ctx.currentTime;
    const notes = [349.23, 440, 523.25, 698.46]; // F4, A4, C5, F5
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const st = now + (i * 0.08);

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, st);
      gain.gain.setValueAtTime(0.2, st);
      gain.gain.exponentialRampToValueAtTime(0.001, st + 0.4);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(st);
      osc.stop(st + 0.4);
    });
  }

  playSilver() {
    if (this.muted) return;
    this.init();
    const now = this.ctx.currentTime;
    const notes = [392, 493.88, 587.33, 783.99]; // G4, B4, D5, G5
    notes.forEach((freq, i) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const st = now + (i * 0.08);

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, st);
      gain.gain.setValueAtTime(0.22, st);
      gain.gain.exponentialRampToValueAtTime(0.001, st + 0.45);

      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(st);
      osc.stop(st + 0.45);
    });
  }
}

window.sounds = new SoundManager();
