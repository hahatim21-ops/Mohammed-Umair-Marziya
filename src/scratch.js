// Page 3: the complete landscape scratch card, shown full-width in the column,
// with a pearl scratch cover (and a sweeping sheen) over the inner oval only.
import { gsap } from 'gsap';
import layout from './layout.json';
import { asset, reduced, addTick, removeTick, sizeCanvas, vibrate, rand, COL_MAX } from './core.js';
import { Burst, Twinkles } from './fx.js';

const L = layout.pages['3'];
const MASK_W = 512; // fixed-resolution scratch mask: survives resize / rotation

export class ScratchPage {
  constructor() {
    this.n = 3;
    this.visible = false;
    this.revealed = false;
    this.tick = this.tick.bind(this);
    const el = (this.el = document.createElement('section'));
    el.className = 'page p3';
    el.id = 'page-3';
    el.dataset.page = 3;
    el.setAttribute('aria-label', 'Scratch to reveal the date');
    el.innerHTML = `
      <div class="card">
        <picture><source type="image/webp" srcset="${asset('page3.webp')}"><img class="art" alt="" src="${asset('page3.png')}" decoding="async"></picture>
        <div class="oval-glow"></div>
        <canvas class="foil" role="img" aria-label="Pearl cover. Scratch it to reveal the date."></canvas>
        <div class="foil-sheen" aria-hidden="true"></div>
      </div>
      <canvas class="sec-fx" aria-hidden="true"></canvas>
      <p class="sr-only">Scratch to reveal: 03rd &amp; 06th December 2026.</p>`;
    this.card = el.querySelector('.card');
    this.foil = el.querySelector('.foil');
    this.sheen = el.querySelector('.foil-sheen');
    this.glow = el.querySelector('.oval-glow');
    this.fxCanvas = el.querySelector('.sec-fx');
    this.g = this.fxCanvas.getContext('2d');
    this.fg = this.foil.getContext('2d');
    this.burst = new Burst();
    const P = (v) => v / 100;
    this.glints = reduced ? null : new Twinkles({ points: L.glints.map(([x, y]) => [P(x), P(y)]), rate: 0.9, size: [0.02, 0.035] });

    // foil + glow placement in % of the card (oval measured by tools/prepare_assets.py)
    const f = L.foil;
    for (const node of [this.foil, this.glow, this.sheen]) {
      Object.assign(node.style, { left: f.cx - f.rx + '%', top: f.cy - f.ry + '%', width: f.rx * 2 + '%', height: f.ry * 2 + '%' });
    }

    const ar = ((f.ry * L.img[1]) / (f.rx * L.img[0])); // foil h / w in pixels
    this.mw = MASK_W;
    this.mh = Math.round(MASK_W * ar);
    this.mask = document.createElement('canvas');
    this.mask.width = this.mw;
    this.mask.height = this.mh;
    this.mg = this.mask.getContext('2d');
    this.small = document.createElement('canvas');
    this.small.width = 64;
    this.small.height = Math.round(64 * ar);
    this.sg = this.small.getContext('2d', { willReadFrequently: true });
    this.brushR = 0.09 * this.mw * (L.oval.rx / f.rx); // 9% of the oval's width (radius)
    this.makeFoilTexture();
    this.bindPointer();
  }

  makeFoilTexture() {
    // mother-of-pearl: ivory base, soft pastel lustre, fine swirls, grain, darker rim
    const w = this.mw;
    const h = this.mh;
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = '#ece6e3';
    g.fillRect(0, 0, w, h);
    const tints = ['255,214,228', '210,224,255', '214,250,236', '255,243,214', '232,220,255', '255,255,255'];
    for (let i = 0; i < 26; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const r = rand(0.18, 0.5) * w;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const t = tints[i % tints.length];
      gr.addColorStop(0, `rgba(${t},${rand(0.35, 0.6)})`);
      gr.addColorStop(1, `rgba(${t},0)`);
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    }
    // nacre swirls
    g.lineCap = 'round';
    for (let i = 0; i < 70; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const r = rand(0.08, 0.45) * w;
      const a0 = Math.random() * Math.PI * 2;
      g.strokeStyle = Math.random() < 0.7 ? `rgba(255,255,255,${rand(0.12, 0.3)})` : `rgba(190,170,190,${rand(0.06, 0.14)})`;
      g.lineWidth = rand(1, 5);
      g.beginPath();
      g.arc(x, y, r, a0, a0 + rand(0.4, 1.4));
      g.stroke();
    }
    // fine grain
    const id = g.getImageData(0, 0, w, h);
    const d = id.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * 10;
      d[i] += n;
      d[i + 1] += n;
      d[i + 2] += n;
    }
    g.putImageData(id, 0, 0);
    // lustre highlight (upper left) + warm darkening towards the rim
    const hi = g.createRadialGradient(w * 0.36, h * 0.3, 0, w * 0.36, h * 0.3, w * 0.55);
    hi.addColorStop(0, 'rgba(255,255,255,0.45)');
    hi.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = hi;
    g.fillRect(0, 0, w, h);
    g.save();
    g.translate(w / 2, h / 2);
    g.scale(1, h / w);
    const v = g.createRadialGradient(0, -w * 0.03, w * 0.36, 0, 0, w * 0.5);
    v.addColorStop(0, 'rgba(70,45,10,0)');
    v.addColorStop(0.8, 'rgba(70,45,10,0.12)');
    v.addColorStop(1, 'rgba(70,45,10,0.42)');
    g.fillStyle = v;
    g.fillRect(-w / 2, -w / 2, w, w);
    g.restore();
    this.foilTex = c;
  }

  bindPointer() {
    let down = false;
    let last = null;
    let lastCheck = 0;
    const pos = (e) => {
      const r = this.foil.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * this.mw, y: ((e.clientY - r.top) / r.height) * this.mh, cx: e.clientX, cy: e.clientY };
    };
    this.foil.addEventListener('pointerdown', (e) => {
      if (this.revealed) return;
      down = true;
      try {
        this.foil.setPointerCapture(e.pointerId);
      } catch (err) {
        /* ignore */
      }
      if (!this.started) {
        this.started = true;
        gsap.to(this.sheen, { opacity: 0, duration: 0.4 });
      }
      last = pos(e);
      this.scratch(last, last);
      e.preventDefault();
    });
    this.foil.addEventListener('pointermove', (e) => {
      if (!down || this.revealed) return;
      const p = pos(e);
      this.scratch(last, p);
      last = p;
      const now = performance.now();
      if (now - lastCheck > 110) {
        lastCheck = now;
        this.check();
      }
    });
    const up = () => {
      if (!down) return;
      down = false;
      this.check();
    };
    this.foil.addEventListener('pointerup', up);
    this.foil.addEventListener('pointercancel', up);
  }

  scratch(a, b) {
    const g = this.mg;
    const r = this.brushR;
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(dist / (r * 0.3)));
    for (let i = 0; i <= steps; i++) {
      const x = a.x + ((b.x - a.x) * i) / steps;
      const y = a.y + ((b.y - a.y) * i) / steps;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      gr.addColorStop(0, 'rgba(0,0,0,1)');
      gr.addColorStop(0.6, 'rgba(0,0,0,0.9)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
    }
    this.dirty = true;
    if (!reduced) {
      const sr = this.el.getBoundingClientRect();
      this.burst.flakes((b.cx - sr.left) / sr.width, (b.cy - sr.top) / sr.height, 2);
    }
  }

  check() {
    if (this.revealed) return;
    const sg = this.sg;
    const W = this.small.width;
    const H = this.small.height;
    sg.clearRect(0, 0, W, H);
    sg.drawImage(this.mask, 0, 0, W, H);
    const d = sg.getImageData(0, 0, W, H).data;
    let inside = 0;
    let cleared = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const nx = (x + 0.5) / W - 0.5;
        const ny = (y + 0.5) / H - 0.5;
        if (nx * nx + ny * ny > 0.25) continue;
        inside++;
        if (d[(y * W + x) * 4 + 3] > 128) cleared++;
      }
    }
    if (cleared / inside >= 0.5) this.complete();
  }

  complete() {
    if (this.revealed) return;
    this.revealed = true;
    gsap.to(this.sheen, { opacity: 0, duration: 0.3 });
    vibrate([18, 40, 18]);
    gsap.to(this.foil, { opacity: 0, filter: reduced ? 'none' : 'blur(6px)', scale: reduced ? 1 : 1.03, duration: 0.8, ease: 'power2.out', onComplete: () => (this.foil.style.display = 'none') });
    gsap.timeline()
      .to(this.glow, { opacity: 1, duration: 0.35, ease: 'power2.out' }, 0.15)
      .to(this.glow, { opacity: 0.35, duration: 0.45, ease: 'sine.inOut' })
      .to(this.glow, { opacity: 0.9, duration: 0.45, ease: 'sine.inOut' })
      .to(this.glow, { opacity: 0, duration: 1.1, ease: 'power2.out' });
    if (!reduced) {
      const sr = this.el.getBoundingClientRect();
      const fr = this.foil.getBoundingClientRect();
      this.burst.confetti((fr.left + fr.width / 2 - sr.left) / sr.width, (fr.top + fr.height / 2 - sr.top) / sr.height, 150);
    }
  }

  resize(vw) {
    // whole card at the column width (like the portrait pages), never cropped
    const ar = L.img[0] / L.img[1];
    const cw = Math.min(vw, COL_MAX);
    const ch = cw / ar;
    this.el.style.height = ch + 'px';
    this.card.style.setProperty('--cw', cw + 'px');
    this.card.style.setProperty('--ch', ch + 'px');
    this.cw = cw;
    this.ch = ch;
    this.fw = (cw * L.foil.rx * 2) / 100;
    this.fh = (ch * L.foil.ry * 2) / 100;
    this.foilD = sizeCanvas(this.foil, this.fw, this.fh, 2);
    this.fxD = sizeCanvas(this.fxCanvas, cw, ch, 1.5);
    this.dirty = true;
    this.drawFoil();
  }

  drawFoil() {
    if (this.revealed && this.foil.style.display === 'none') return;
    const g = this.fg;
    const w = this.foil.width;
    const h = this.foil.height;
    if (w < 8 || h < 8) return;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, w, h);
    g.save();
    g.beginPath();
    g.ellipse(w / 2, h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
    g.clip();
    g.drawImage(this.foilTex, 0, 0, w, h);
    // thin dark-gold rim so the foil edge reads as a deliberate inlay
    g.lineWidth = Math.max(1.5, w * 0.008);
    g.strokeStyle = 'rgba(150,110,40,0.35)';
    g.beginPath();
    g.ellipse(w / 2, h / 2, w / 2 - g.lineWidth / 2, h / 2 - g.lineWidth / 2, 0, 0, Math.PI * 2);
    g.stroke();
    g.restore();
    // scratched areas
    g.globalCompositeOperation = 'destination-out';
    g.drawImage(this.mask, 0, 0, w, h);
    g.globalCompositeOperation = 'source-over';
    this.dirty = false;
  }

  setVisible(v) {
    if (v === this.visible) return;
    this.visible = v;
    this.el.classList.toggle('live', v);
    if (v) addTick(this.tick);
    else removeTick(this.tick);
  }

  tick(t, dt) {
    if (!this.revealed && this.dirty) this.drawFoil();
    const g = this.g;
    const busy = this.burst.active || this.glints;
    if (!busy && !this._fxDirty) return;
    g.setTransform(this.fxD, 0, 0, this.fxD, 0, 0);
    g.clearRect(0, 0, this.cw, this.ch);
    if (this.glints) {
      this.glints.update(dt);
      this.glints.draw(g, this.cw, this.ch);
    }
    this.burst.update(dt);
    this.burst.draw(g, this.cw, this.ch, t);
    this._fxDirty = this.burst.active;
  }

  play() {}
  reset() {} // the card stays revealed once scratched
  load() {
    const img = this.el.querySelector('img.art');
    const src = this.el.querySelector('source');
    // the browser picks webp; make sure we wait for whichever it chose
    return new Promise((res) => {
      if (img.complete && img.naturalWidth) return res();
      img.addEventListener('load', res, { once: true });
      img.addEventListener('error', res, { once: true });
    }).then(() => src);
  }
}
