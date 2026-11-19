// Background music: starts on the tassel pull (a user gesture), fades 0 -> 0.6 over 3 s, loops.
// Uses a Web Audio gain node for the fade (iOS ignores HTMLMediaElement.volume).
import { musicUrl } from './core.js';

const TARGET = 0.6;

export class Music {
  constructor(button) {
    this.btn = button;
    this.available = !!musicUrl;
    this.playing = false;
    this.userMuted = false;
    this.resumeOnShow = false;
    if (!this.available) return;
    const a = (this.audio = new Audio());
    a.loop = true;
    a.preload = 'auto';
    a.crossOrigin = 'anonymous';
    a.addEventListener('error', () => this.fail());
    a.src = musicUrl;
    button.addEventListener('click', () => this.toggle());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.resumeOnShow = this.playing;
        if (this.playing) this.pause(false);
      } else if (this.resumeOnShow && !this.userMuted) {
        this.play();
      }
    });
  }

  fail() {
    this.available = false;
    this.playing = false;
    if (this.btn) this.btn.hidden = true;
  }

  ensureGraph() {
    if (this.ctx || this.noGraph) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      const src = this.ctx.createMediaElementSource(this.audio);
      this.gain = this.ctx.createGain();
      this.gain.gain.value = 0;
      src.connect(this.gain).connect(this.ctx.destination);
    } catch (e) {
      this.noGraph = true;
      this.ctx = null;
    }
  }

  fadeTo(v, secs) {
    if (this.ctx && this.gain) {
      const now = this.ctx.currentTime;
      const g = this.gain.gain;
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(v, now + secs);
    } else if (this.audio) {
      const start = this.audio.volume;
      const t0 = performance.now();
      const step = () => {
        const k = Math.min(1, (performance.now() - t0) / (secs * 1000));
        this.audio.volume = start + (v - start) * k;
        if (k < 1) requestAnimationFrame(step);
      };
      step();
    }
  }

  // called from the tassel gesture
  start() {
    if (!this.available || this.userMuted) return;
    this.ensureGraph();
    if (!this.ctx) this.audio.volume = 0;
    this.play(3);
  }

  play(fade = 0.8) {
    if (!this.available) return;
    this.ensureGraph();
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    const p = this.audio.play();
    this.playing = true;
    this.render();
    this.fadeTo(TARGET, fade);
    if (p && p.catch) {
      p.catch(() => {
        // autoplay refused or file unusable
        this.playing = false;
        this.render();
      });
    }
  }

  pause(user = true) {
    if (!this.available) return;
    if (user) this.userMuted = true;
    this.playing = false;
    this.render();
    this.fadeTo(0, 0.35);
    clearTimeout(this._pt);
    this._pt = setTimeout(() => {
      if (!this.playing) this.audio.pause();
    }, 380);
  }

  toggle() {
    if (this.playing) this.pause(true);
    else {
      this.userMuted = false;
      this.play(1.2);
    }
  }

  reveal() {
    if (!this.available || !this.btn) return;
    this.btn.hidden = false;
    requestAnimationFrame(() => this.btn.classList.add('on'));
    this.render();
  }

  render() {
    if (!this.btn) return;
    this.btn.classList.toggle('playing', this.playing);
    this.btn.setAttribute('aria-pressed', String(this.playing));
    this.btn.setAttribute('aria-label', this.playing ? 'Mute music' : 'Play music');
  }
}
