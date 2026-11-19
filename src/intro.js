// Page 1: preloader, the living curtain, the verlet pull-cord tassel and the opening sequence.
import { gsap } from 'gsap';
import layout from './layout.json';
import { asset, webglOK, reduced, addTick, removeTick, loadImage, sizeCanvas, vibrate, viewport, rand } from './core.js';
import { Living } from './living.js';
import { Motes, Burst, Butterflies } from './fx.js';
import { fitPortrait } from './pages.js';

const L = layout.pages['1'];
const SEGS = 14;
const PULL_PX = 70;

const NS = 'http://www.w3.org/2000/svg';
const TASSEL = `
<defs>
  <linearGradient id="gm" x1="0" y1="0" x2="1" y2="0">
    <stop offset="0" stop-color="#7a5a1c"/><stop offset=".22" stop-color="#e9cf7a"/><stop offset=".45" stop-color="#fff1bf"/>
    <stop offset=".62" stop-color="#c8a24a"/><stop offset=".85" stop-color="#8d6a24"/><stop offset="1" stop-color="#d9b862"/>
  </linearGradient>
  <linearGradient id="gf" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0" stop-color="#d6b25c"/><stop offset=".55" stop-color="#b48a35"/><stop offset="1" stop-color="#7d5c1e"/>
  </linearGradient>
  <linearGradient id="gr" x1="0" y1="0" x2="1" y2="1">
    <stop offset="0" stop-color="#f6e3a1"/><stop offset=".5" stop-color="#c8a24a"/><stop offset="1" stop-color="#8a6a26"/>
  </linearGradient>
  <filter id="ts" x="-50%" y="-20%" width="200%" height="150%"><feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#2b2310" flood-opacity=".45"/></filter>
</defs>
<path class="cord-shadow" fill="none" stroke="rgba(40,30,10,.28)" stroke-linecap="round"/>
<path class="cord" fill="none" stroke="url(#gr)" stroke-linecap="round"/>
<path class="cord-twist" fill="none" stroke="#8a6a26" stroke-linecap="butt" stroke-opacity=".75"/>
<path class="cord-hi" fill="none" stroke="#fff4c8" stroke-linecap="butt" stroke-opacity=".55"/>
<g class="tassel" filter="url(#ts)">
  <g class="tassel-art">
    <circle cx="0" cy="3" r="4.2" fill="none" stroke="url(#gm)" stroke-width="2.4"/>
    <path d="M-6 9 Q0 6 6 9 L7.5 14 Q0 12 -7.5 14 Z" fill="url(#gm)"/>
    <ellipse cx="0" cy="24" rx="11.5" ry="12" fill="url(#gm)"/>
    <path d="M-11 20 Q0 24 11 20 M-11.4 24 Q0 28 11.4 24 M-10.6 28.5 Q0 32 10.6 28.5" fill="none" stroke="#8a6a26" stroke-width="1" stroke-opacity=".7"/>
    <path d="M-10 20.6 Q0 24.3 10 20.6" fill="none" stroke="#fff3c4" stroke-width=".7" stroke-opacity=".8"/>
    <rect x="-10" y="35" width="20" height="5.5" rx="2" fill="url(#gm)"/>
    <path d="M-9 40 L-15 100 Q0 106 15 100 L9 40 Z" fill="url(#gf)"/>
    <g class="fringe" stroke="url(#gm)" stroke-width="1.15" stroke-linecap="round">
      <path d="M-8.5 41 L-14.5 99"/><path d="M-6.5 41 L-11 101"/><path d="M-4.5 41 L-7.5 102"/><path d="M-2.5 41 L-4 103"/>
      <path d="M-0.8 41 L-0.8 103.5"/><path d="M0.8 41 L1.6 103.5"/><path d="M2.5 41 L4.5 103"/><path d="M4.5 41 L8 102"/>
      <path d="M6.5 41 L11.5 101"/><path d="M8.5 41 L14.5 99"/>
    </g>
    <rect x="-11" y="47" width="22" height="4" rx="1.5" fill="url(#gm)" opacity=".95"/>
    <circle cx="0" cy="106" r="2.2" fill="url(#gm)"/>
  </g>
</g>`;

export class Intro {
  constructor({ onOpenStart, onOpened, music, page2 }) {
    this.root = document.getElementById('intro');
    this.stageEl = document.getElementById('curtain-stage');
    this.plateEl = this.stageEl.querySelector('.plate');
    this.canvas = this.stageEl.querySelector('canvas.gl');
    this.fxCanvas = this.stageEl.querySelector('canvas.fx');
    this.g = this.fxCanvas.getContext('2d');
    this.monoEl = this.stageEl.querySelector('.mono');
    this.svg = this.stageEl.querySelector('svg.rope');
    this.btn = this.stageEl.querySelector('.tassel-btn');
    this.hint = this.stageEl.querySelector('.hint');
    this.pre = document.getElementById('preloader');
    this.music = music;
    this.page2 = page2;
    this.onOpenStart = onOpenStart;
    this.onOpened = onOpened;
    this.opened = false;
    this.ready = false;
    this.retract = 0;
    this.tick = this.tick.bind(this);
    this.dust = reduced ? null : new Motes({ count: 26, area: [0.04, 0.05, 0.96, 0.98], size: [0.003, 0.008], alpha: 0.7, rise: 0.01 });
    this.burst = new Burst();
    // butterflies around the flower garlands at the curtain corners
    this.flutter = reduced ? null : new Butterflies({ homes: [[0.2, 0.1], [0.8, 0.12], [0.18, 0.88]], radius: 0.05 });

    const m = L.blocks[0];
    Object.assign(this.monoEl.style, { left: m.x + '%', top: m.y + '%', width: m.w + '%', height: m.h + '%' });
    const monoUrl = asset(m.src);
    this.monoEl.querySelector('img').src = monoUrl;
    const shine = this.monoEl.querySelector('.shine');
    shine.style.webkitMaskImage = shine.style.maskImage = `url("${monoUrl}")`;
    this.shine = shine;
    this.root.querySelector('.fill').style.backgroundImage = `url("${asset('page1_blur.webp')}")`;

    // preloader monogram
    const preImg = this.pre.querySelector('.pre-mono img');
    const preShine = this.pre.querySelector('.pre-mono .shine');
    this.pre.querySelector('.pre-mono').style.setProperty('--mono-ar', String((m.w * L.img[0]) / (m.h * L.img[1])));
    preImg.onload = () => preImg.classList.add('in');
    preImg.src = monoUrl;
    preShine.style.webkitMaskImage = preShine.style.maskImage = `url("${monoUrl}")`;
    this.bar = this.pre.querySelector('.pre-line i');

    this.svg.innerHTML = TASSEL;
    this.cord = this.svg.querySelector('.cord');
    this.cordShadow = this.svg.querySelector('.cord-shadow');
    this.twist = this.svg.querySelector('.cord-twist');
    this.twistHi = this.svg.querySelector('.cord-hi');
    this.tassel = this.svg.querySelector('.tassel');
  }

  progress(f) {
    this.bar.style.transform = `scaleX(${Math.max(0.02, Math.min(1, f))})`;
  }

  async load() {
    const plateUrl = asset(`page1_clean_${this.sw * Math.min(devicePixelRatio || 1, 2) > 760 ? 1080 : 720}.webp`);
    this.plateEl.src = plateUrl;
    const [plate, mask] = await Promise.all([loadImage(plateUrl), webglOK ? loadImage(asset('page1_motion.png')).catch(() => null) : null]);
    this.plateImg = plate;
    this.maskImg = mask;
    // sample monogram pixels for the dissolve
    try {
      const img = await loadImage(asset(L.blocks[0].src));
      const c = document.createElement('canvas');
      const step = 7;
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const g = c.getContext('2d', { willReadFrequently: true });
      g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      const pts = [];
      for (let y = 0; y < c.height; y += step) for (let x = 0; x < c.width; x += step) if (d[(y * c.width + x) * 4 + 3] > 140) pts.push([x / c.width, y / c.height]);
      this.monoPts = pts;
    } catch (e) {
      this.monoPts = [];
    }
  }

  resize() {
    const { w, h } = viewport();
    const { sw, sh } = fitPortrait(L, w, h);
    this.sw = sw;
    this.sh = sh;
    this.stageEl.style.setProperty('--sw', sw + 'px');
    this.stageEl.style.setProperty('--sh', sh + 'px');
    if (this.gl) this.gl.resize(sw, sh);
    this.fxD = sizeCanvas(this.fxCanvas, sw, sh, 1.5);
    this.svg.setAttribute('viewBox', `0 0 ${sw} ${sh}`);
    // rope geometry in stage px; it reaches ~55% of the screen height including the tassel
    const vh = h;
    const top = (sh - vh) / 2; // stage may be shorter than the screen only when shrunk
    this.anchor = { x: (L.tassel.x / 100) * sw, y: Math.max(-8, top - 8) };
    this.tasselH = Math.min(vh * 0.1, 110);
    this.tScale = this.tasselH / 106;
    // the cord itself reaches ~55% of the screen; the tassel hangs below it
    const ropeLen = Math.max(80, vh * 0.55 - this.anchor.y - (sh - vh) / 2);
    this.visL = (sw - w) / 2; // stage x of the screen's left edge (stage is clipped on tall phones)
    this.visW = w;
    this.hintW = 0;
    this.rest = ropeLen / SEGS;
    this.cordW = Math.max(2.4, Math.min(4, sw * 0.0075));
    this.cord.setAttribute('stroke-width', this.cordW);
    this.cordShadow.setAttribute('stroke-width', this.cordW + 1.5);
    this.twist.setAttribute('stroke-width', this.cordW * 0.55);
    this.twist.setAttribute('stroke-dasharray', `${this.cordW * 0.9} ${this.cordW * 1.5}`);
    this.twistHi.setAttribute('stroke-width', this.cordW * 0.3);
    this.twistHi.setAttribute('stroke-dasharray', `${this.cordW * 0.6} ${this.cordW * 1.8}`);
    this.twistHi.setAttribute('stroke-dashoffset', this.cordW * 1.1);
    if (!this.pts) {
      this.pts = [];
      for (let i = 0; i <= SEGS; i++) {
        const y = this.anchor.y + i * this.rest;
        this.pts.push({ x: this.anchor.x, y, px: this.anchor.x, py: y });
      }
    } else {
      this.pts[0].x = this.pts[0].px = this.anchor.x;
      this.pts[0].y = this.pts[0].py = this.anchor.y;
    }
    this.restEndY = this.anchor.y + ropeLen;
    this.draw();
  }

  initGL() {
    if (!webglOK || !this.maskImg || this.gl) return;
    try {
      this.gl = new Living(this.canvas, this.plateImg, this.maskImg, { transparent: true, imgW: L.img[0], imgH: L.img[1] });
      this.gl.resize(this.sw, this.sh);
      this.gl.render(0);
      this.canvas.classList.add('ready');
      // the canvas draws the plate itself (and must become see-through when the curtain opens)
      this.plateEl.style.visibility = 'hidden';
    } catch (e) {
      this.gl = null;
    }
  }

  show() {
    this.initGL();
    this.ready = true;
    this.pre.classList.add('done');
    this.lastInteract = performance.now() / 1000;
    this.bindPointer();
    addTick(this.tick);
    gsap.fromTo(this.hint, { autoAlpha: 0 }, { autoAlpha: 1, duration: 1, delay: 0.9 });
    // first shine shortly after the curtain appears
    this.nextShine = performance.now() / 1000 + 2.2;
  }

  // ---------------------------------------------------------------- rope physics
  step(dt, t) {
    const pts = this.pts;
    const N = pts.length;
    const sub = 2;
    const h = Math.min(dt, 1 / 30) / sub;
    const grav = 2600;
    for (let s = 0; s < sub; s++) {
      for (let i = 1; i < N; i++) {
        const p = pts[i];
        const vx = (p.x - p.px) * 0.985;
        const vy = (p.y - p.py) * 0.985;
        p.px = p.x;
        p.py = p.y;
        p.x += vx;
        p.y += vy + grav * h * h;
      }
      if (!this.drag && !reduced) {
        // idle pendulum sway
        const end = pts[N - 1];
        // a tiny velocity nudge (verlet integrates it), keeping the swing to a few px
        end.x += Math.sin(t * 1.3) * 0.0065 + Math.sin(t * 0.61) * 0.0025;
      }
      if (this.drag) {
        const end = pts[N - 1];
        end.x = end.px = this.drag.x;
        end.y = end.py = this.drag.y;
      }
      const stiff = this.drag ? 0.55 : 1;
      for (let it = 0; it < 12; it++) {
        for (let i = 0; i < N - 1; i++) {
          const a = pts[i];
          const b = pts[i + 1];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.hypot(dx, dy) || 0.0001;
          const diff = ((d - this.rest) / d) * stiff;
          const aFixed = i === 0;
          const bFixed = this.drag && i + 1 === N - 1;
          if (aFixed && bFixed) continue;
          if (aFixed) {
            b.x -= dx * diff;
            b.y -= dy * diff;
          } else if (bFixed) {
            a.x += dx * diff;
            a.y += dy * diff;
          } else {
            a.x += dx * diff * 0.5;
            a.y += dy * diff * 0.5;
            b.x -= dx * diff * 0.5;
            b.y -= dy * diff * 0.5;
          }
        }
        pts[0].x = this.anchor.x;
        pts[0].y = this.anchor.y;
      }
    }
  }

  draw() {
    const pts = this.pts;
    if (!pts) return;
    const R = this.retract;
    const P = pts.map((p, i) => {
      if (!R) return p;
      // retract: everything rushes up past the top edge
      const lift = R * (this.restEndY + this.tasselH + 40);
      return { x: p.x + (this.anchor.x - p.x) * R, y: p.y - lift * (0.4 + (0.6 * i) / SEGS) };
    });
    // smooth path through points (Catmull-Rom -> cubic Bezier)
    let d = `M${P[0].x.toFixed(1)} ${P[0].y.toFixed(1)}`;
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[Math.max(0, i - 1)];
      const p1 = P[i];
      const p2 = P[i + 1];
      const p3 = P[Math.min(P.length - 1, i + 2)];
      const c1x = p1.x + (p2.x - p0.x) / 6;
      const c1y = p1.y + (p2.y - p0.y) / 6;
      const c2x = p2.x - (p3.x - p1.x) / 6;
      const c2y = p2.y - (p3.y - p1.y) / 6;
      d += `C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
    }
    this.cord.setAttribute('d', d);
    this.twist.setAttribute('d', d);
    this.twistHi.setAttribute('d', d);
    this.cordShadow.setAttribute('d', d);
    this.cordShadow.setAttribute('transform', 'translate(2.5 3)');
    const e = P[P.length - 1];
    const q = P[P.length - 2];
    const ang = (Math.atan2(e.y - q.y, e.x - q.x) * 180) / Math.PI - 90;
    this.tassel.setAttribute('transform', `translate(${e.x.toFixed(1)} ${e.y.toFixed(1)}) rotate(${ang.toFixed(1)}) scale(${this.tScale.toFixed(3)})`);
    this.endX = e.x;
    this.endY = e.y;
    this.btn.style.transform = `translate3d(${(e.x - 38).toFixed(1)}px, ${(e.y - 14).toFixed(1)}px, 0)`;
    // keep the hint fully on screen
    const hw = this.hintW || (this.hintW = this.hint.offsetWidth || 120);
    const lo = Math.max(0, this.visL) + hw / 2 + 12;
    const hi = Math.max(0, this.visL) + Math.min(this.sw, this.visW) - hw / 2 - 12;
    const hx = Math.min(hi, Math.max(lo, e.x));
    this.hint.style.transform = `translate3d(${hx.toFixed(1)}px, ${(e.y + this.tasselH + 14).toFixed(1)}px, 0) translateX(-50%)`;
  }

  // ---------------------------------------------------------------- interaction
  bindPointer() {
    const btn = this.btn;
    const toStage = (e) => {
      const r = this.stageEl.getBoundingClientRect();
      return { x: ((e.clientX - r.left) / r.width) * this.sw, y: ((e.clientY - r.top) / r.height) * this.sh };
    };
    btn.addEventListener('pointerdown', (e) => {
      if (this.opened) return;
      e.preventDefault();
      try {
        btn.setPointerCapture(e.pointerId);
      } catch (err) {
        /* ignore */
      }
      const p = toStage(e);
      this.down = { x: p.x, y: p.y, t: performance.now(), ox: this.endX - p.x, oy: this.endY - p.y, moved: 0 };
      this.lastInteract = performance.now() / 1000;
    });
    btn.addEventListener('pointermove', (e) => {
      if (!this.down || this.opened) return;
      const p = toStage(e);
      const dx = p.x - this.down.x;
      const dy = p.y - this.down.y;
      this.down.moved = Math.max(this.down.moved, Math.hypot(dx, dy));
      if (this.down.moved > 6) {
        // follow the finger; downward travel stretches the rope a little further
        this.drag = { x: p.x + this.down.ox, y: Math.max(this.anchor.y + 30, p.y + this.down.oy) };
        if (dy > PULL_PX) this.open(); // past ~70px the cord catches
      }
    });
    const up = () => {
      if (!this.down) return;
      const tap = this.down.moved < 8 && performance.now() - this.down.t < 450;
      this.down = null;
      this.drag = null;
      this.lastInteract = performance.now() / 1000;
      if (tap) this.open();
    };
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', () => {
      this.down = null;
      this.drag = null;
    });
    btn.addEventListener('click', (e) => {
      // keyboard (Enter / Space) arrives as a click with detail 0
      if (e.detail === 0) this.open();
    });
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        this.open();
      }
    });
  }

  tug() {
    // small invitation to pull
    const end = this.pts[this.pts.length - 1];
    end.py -= 5.5;
    end.px += 1.5;
  }

  tick(t, dt) {
    if (!this.opened || this.retract < 1) {
      if (!this.opened && !reduced) {
        if (t - this.lastInteract > 6 && !this.down) {
          this.tug();
          this.lastInteract = t;
        }
      }
      this.step(dt, t);
      this.draw();
    }
    if (this.gl) this.gl.render(t);
    if (!reduced && t > this.nextShine && !this.opened) {
      this.shine.classList.remove('run');
      void this.shine.offsetWidth;
      this.shine.classList.add('run');
      this.nextShine = t + 5 + Math.random();
    }
    const g = this.g;
    g.setTransform(this.fxD, 0, 0, this.fxD, 0, 0);
    g.clearRect(0, 0, this.sw, this.sh);
    if (this.dust) {
      this.dust.update(dt, t);
      this.dust.draw(g, this.sw, this.sh, t);
    }
    if (this.flutter && !this.opened) {
      this.flutter.update(dt, t);
      this.flutter.draw(g, this.sw, this.sh);
    }
    this.burst.update(dt);
    this.burst.draw(g, this.sw, this.sh, t);
  }

  // ---------------------------------------------------------------- opening
  open() {
    if (this.opened || !this.ready) return;
    this.opened = true;
    this.drag = null;
    this.down = null;
    vibrate(15);
    this.music && this.music.start();
    this.btn.blur();
    this.btn.disabled = true;
    this.onOpenStart && this.onOpenStart();
    const p2 = this.page2;

    if (reduced) {
      gsap.to(this.root, { autoAlpha: 0, duration: 0.9, ease: 'power1.inOut', onComplete: () => this.finish() });
      gsap.delayedCall(0.5, () => this.onOpened && this.onOpened());
      return;
    }

    const tl = gsap.timeline({ onComplete: () => this.finish() });
    this.root.classList.add('opening');
    // 1-2: cord snaps up and retracts
    tl.to(this, { retract: 1, duration: 0.55, ease: 'power3.in', onUpdate: () => this.draw() }, 0);
    tl.to(this.hint, { autoAlpha: 0, duration: 0.2 }, 0);
    // 3: monogram glows, then dissolves into rising gold particles
    tl.to(this.monoEl, { filter: 'brightness(1.7) drop-shadow(0 0 14px rgba(255,214,130,0.95))', duration: 0.35, ease: 'power2.out' }, 0.1);
    tl.add(() => {
      const m = L.blocks[0];
      const pts = (this.monoPts || []).map(([x, y]) => [(m.x + x * m.w) / 100, (m.y + y * m.h) / 100]);
      this.burst.rise(pts, 0.002);
    }, 0.45);
    tl.to(this.monoEl, { autoAlpha: 0, filter: 'brightness(2.2) blur(5px)', y: -10, duration: 0.8, ease: 'power2.in' }, 0.45);
    // 4: curtain halves gather outward (shader), fabric wave swells then settles
    const st = { o: 0 };
    tl.to(st, {
      o: 1,
      duration: 2.05,
      ease: 'power3.inOut',
      onUpdate: () => {
        if (this.gl) {
          this.gl.open = st.o;
          this.gl.fabric = 1 + 4.5 * Math.sin(Math.PI * st.o);
        } else {
          this.domSplit(st.o);
        }
      },
    }, 0.85);
    // 5: page 2 behind it - warm bloom, scale 1.06 -> 1, brightness 0.85 -> 1
    if (p2) {
      // brightness 0.85 -> 1 via a fading dim layer (cheaper than a CSS filter over a WebGL canvas)
      tl.fromTo(p2.inner, { scale: 1.06 }, { scale: 1, duration: 2.1, ease: 'expo.out', clearProps: 'transform' }, 0.95);
      if (p2.dim) tl.fromTo(p2.dim, { opacity: 0.15 }, { opacity: 0, duration: 2.1, ease: 'expo.out' }, 0.95);
      if (p2.bloom) tl.fromTo(p2.bloom, { opacity: 0 }, { opacity: 0.9, duration: 0.8, ease: 'power2.out' }, 1.0).to(p2.bloom, { opacity: 0, duration: 1.3, ease: 'power2.inOut' }, 1.9);
    }
    tl.add(() => this.onOpened && this.onOpened(), 2.55);
  }

  // no-WebGL fallback: split two DOM halves of the clean plate
  domSplit(o) {
    if (!this.halves) {
      this.plateEl.style.visibility = 'hidden';
      this.halves = ['left', 'right'].map((side) => {
        const d = document.createElement('div');
        Object.assign(d.style, {
          position: 'absolute', top: 0, bottom: 0, width: '50%', [side]: 0,
          backgroundImage: `url("${this.plateEl.src}")`, backgroundSize: '200% 100%', backgroundPosition: side === 'left' ? '0 0' : '100% 0',
          transformOrigin: side === 'left' ? '0 50%' : '100% 50%',
        });
        this.stageEl.insertBefore(d, this.plateEl.nextSibling);
        return d;
      });
    }
    const [l, r] = this.halves;
    const sx = 1 - 0.82 * o;
    l.style.transform = `perspective(900px) translateX(${-6 * o}%) rotateY(${12 * o}deg) scaleX(${sx})`;
    r.style.transform = `perspective(900px) translateX(${6 * o}%) rotateY(${-12 * o}deg) scaleX(${sx})`;
    l.style.filter = r.style.filter = `brightness(${1 - 0.25 * o})`;
  }

  finish() {
    removeTick(this.tick);
    if (this.gl) this.gl.destroy();
    this.root.remove();
  }
}
