// Procedural sound: running water that follows total flow, mill hum, and tactile clicks. No audio files.
export class Sound {
  constructor() { this.ctx = null; this.enabled = true; }
  start() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = (this.ctx = new AC());
    this.master = ctx.createGain(); this.master.gain.value = this.enabled ? 0.8 : 0; this.master.connect(ctx.destination);
    // Water: looped noise through a band-pass filter.
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    let b = 0;
    for (let i = 0; i < len; i++) { b = 0.97 * b + 0.03 * (Math.random() * 2 - 1); d[i] = b * 4; }
    const src = ctx.createBufferSource(); src.buffer = buf; src.loop = true;
    this.waterFilter = ctx.createBiquadFilter(); this.waterFilter.type = 'bandpass'; this.waterFilter.frequency.value = 700; this.waterFilter.Q.value = 0.8;
    this.waterGain = ctx.createGain(); this.waterGain.gain.value = 0;
    src.connect(this.waterFilter).connect(this.waterGain).connect(this.master);
    src.start();
    // Mill hum.
    this.hum = ctx.createOscillator(); this.hum.type = 'triangle'; this.hum.frequency.value = 80;
    this.humGain = ctx.createGain(); this.humGain.gain.value = 0;
    this.hum.connect(this.humGain).connect(this.master); this.hum.start();
  }
  setEnabled(v) { this.enabled = v; if (this.master) this.master.gain.value = v ? 0.8 : 0; }
  // Called every frame with the current flow picture.
  ambient(totalFlow, millFlow, overspeed) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.waterGain.gain.setTargetAtTime(Math.min(0.35, totalFlow * 0.06), t, 0.15);
    this.waterFilter.frequency.setTargetAtTime(500 + Math.min(1500, totalFlow * 220), t, 0.2);
    this.humGain.gain.setTargetAtTime(Math.min(0.08, millFlow * 0.03), t, 0.2);
    this.hum.frequency.setTargetAtTime(60 + millFlow * 40 + (overspeed ? 40 : 0), t, 0.2);
  }
  blip(freq, dur = 0.08, type = 'sine', vol = 0.25, slide = 0) {
    if (!this.ctx || !this.enabled) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  }
  pick() { this.blip(520, 0.07, 'triangle', 0.2, 1.4); }
  drop() { this.blip(330, 0.12, 'triangle', 0.3, 0.6); this.blip(110, 0.1, 'sine', 0.3); }
  back() { this.blip(260, 0.1, 'sine', 0.15, 0.7); }
  rotate() { this.blip(700, 0.05, 'square', 0.08); }
  tick(open) { this.blip(900 + open * 600, 0.03, 'square', 0.05); }
  press() { this.blip(440, 0.06, 'triangle', 0.25); }
  grab() { this.blip(600, 0.05, 'triangle', 0.15); }
  solved() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.blip(f, 0.35, 'triangle', 0.22), i * 110)); }
  millOk() { this.blip(784, 0.15, 'sine', 0.15); this.blip(1175, 0.2, 'sine', 0.1); }
}
