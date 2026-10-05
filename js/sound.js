/* =========================================================
 * sound.js —— WebAudio 合成音效（零素材依赖）
 * ========================================================= */
'use strict';

const SFX = {
  enabled: true,
  ctx: null,
  ensure() {
    try {
      if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      if (this.ctx.state === 'suspended') this.ctx.resume();
    } catch (e) { /* 无音频环境时静默 */ }
  },
  tone(f0, f1, dur, type, vol, delay) {
    if (!this.enabled) return;
    this.ensure();
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + (delay || 0);
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(f0, t0);
    if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(30, f1), t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol || 0.12, t0 + 0.015);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(this.ctx.destination);
    o.start(t0); o.stop(t0 + dur + 0.05);
  },
  play(name) {
    switch (name) {
      case 'click': this.tone(700, 700, 0.06, 'square', 0.06); break;
      case 'select': this.tone(520, 620, 0.07, 'sine', 0.1); break;
      case 'migrate': this.tone(520, 780, 0.12, 'sine', 0.14); break;
      case 'split': this.tone(600, 900, 0.09, 'triangle', 0.14); this.tone(900, 1200, 0.09, 'triangle', 0.1, 0.08); break;
      case 'alarm': this.tone(880, 880, 0.09, 'square', 0.1); this.tone(880, 880, 0.09, 'square', 0.1, 0.14); break;
      case 'down': this.tone(220, 55, 0.6, 'sawtooth', 0.16); break;
      case 'deny': this.tone(240, 180, 0.12, 'square', 0.1); break;
      case 'win': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, f, 0.16, 'sine', 0.13, i * 0.13)); break;
      case 'lose': this.tone(330, 165, 0.7, 'sawtooth', 0.14); break;
      case 'clash': // 攻城撞击：金属敲击+低吼
        this.tone(320, 90, 0.18, 'square', 0.14);
        this.tone(140, 60, 0.25, 'sawtooth', 0.1, 0.03);
        break;
      case 'heartbeat': // 紧张心跳：低频双跳
        this.tone(62, 44, 0.13, 'sine', 0.26);
        this.tone(54, 40, 0.17, 'sine', 0.2, 0.19);
        break;
    }
  },
};
