// Canvas-2D ambient effects. Every system works in stage-relative units:
// positions are fractions (0..1) of the canvas, sizes are fractions of its width,
// so they line up with the artwork at any screen size.
import { noise1, rand } from './core.js';

// ---------------------------------------------------------------- sprites
function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}
const cache = {};
export function glowSprite(rgb = '255,214,140') {
  const key = 'glow' + rgb;
  if (cache[key]) return cache[key];
  const c = makeCanvas(128, 128);
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, `rgba(${rgb},1)`);
  gr.addColorStop(0.25, `rgba(${rgb},0.55)`);
  gr.addColorStop(0.6, `rgba(${rgb},0.14)`);
  gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  return (cache[key] = c);
}
export function starSprite() {
  if (cache.star) return cache.star;
  const c = makeCanvas(64, 64);
  const g = c.getContext('2d');
  g.translate(32, 32);
  const halo = g.createRadialGradient(0, 0, 0, 0, 0, 14);
  halo.addColorStop(0, 'rgba(255,250,230,0.95)');
  halo.addColorStop(1, 'rgba(255,230,170,0)');
  g.fillStyle = halo;
  g.beginPath();
  g.arc(0, 0, 14, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(255,252,240,0.95)';
  for (let i = 0; i < 2; i++) {
    g.save();
    g.rotate((i * Math.PI) / 2);
    g.beginPath();
    g.moveTo(0, -31);
    g.quadraticCurveTo(1.6, -1.6, 31, 0);
    g.quadraticCurveTo(1.6, 1.6, 0, 31);
    g.quadraticCurveTo(-1.6, 1.6, -31, 0);
    g.quadraticCurveTo(-1.6, -1.6, 0, -31);
    g.fill();
    g.restore();
  }
  return (cache.star = c);
}
export function dotSprite() {
  if (cache.dot) return cache.dot;
  const c = makeCanvas(32, 32);
  const g = c.getContext('2d');
  const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  gr.addColorStop(0, 'rgba(255,255,255,1)');
  gr.addColorStop(0.35, 'rgba(255,255,255,0.75)');
  gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr;
  g.fillRect(0, 0, 32, 32);
  return (cache.dot = c);
}
export function petalSprite(variant = 0) {
  const key = 'petal' + variant;
  if (cache[key]) return cache[key];
  const c = makeCanvas(48, 64);
  const g = c.getContext('2d');
  const tints = [
    ['#fffaf0', '#f3e2c4', '#e8cfa6'],
    ['#fff6ee', '#f2dccf', '#e3c1ad'],
    ['#f6f8fb', '#d9e3ec', '#b8c9d8'],
  ][variant % 3];
  const gr = g.createLinearGradient(0, 4, 0, 60);
  gr.addColorStop(0, tints[0]);
  gr.addColorStop(0.6, tints[1]);
  gr.addColorStop(1, tints[2]);
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(24, 60);
  g.bezierCurveTo(4, 46, 2, 18, 18, 6);
  g.quadraticCurveTo(24, 2, 30, 6);
  g.bezierCurveTo(46, 18, 44, 46, 24, 60);
  g.fill();
  g.strokeStyle = 'rgba(160,130,90,0.25)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(24, 56);
  g.quadraticCurveTo(23, 32, 25, 12);
  g.stroke();
  return (cache[key] = c);
}

// ---------------------------------------------------------------- systems
// Floating gold dust / motes
export class Motes {
  constructor({ count = 18, area = [0, 0, 1, 1], size = [0.004, 0.009], alpha = 0.8, rgb = '255,220,150', rise = 0.012 } = {}) {
    this.area = area;
    this.size = size;
    this.alpha = alpha;
    this.rise = rise;
    this.spr = glowSprite(rgb);
    this.p = Array.from({ length: count }, () => this.spawn(true));
  }
  spawn(initial) {
    const [x0, y0, x1, y1] = this.area;
    return {
      x: rand(x0, x1),
      y: initial ? rand(y0, y1) : y1 + 0.02,
      s: rand(this.size[0], this.size[1]),
      ph: rand(0, 100),
      v: rand(0.5, 1.2),
    };
  }
  update(dt, t) {
    for (const p of this.p) {
      p.y -= this.rise * p.v * dt;
      p.x += Math.sin(t * 0.4 + p.ph) * 0.004 * dt;
      if (p.y < this.area[1] - 0.03) Object.assign(p, this.spawn(false));
    }
  }
  draw(g, W, H, t) {
    g.globalCompositeOperation = 'lighter';
    for (const p of this.p) {
      const tw = 0.45 + 0.55 * noise1(t * 1.3 + p.ph);
      const s = p.s * W * 4;
      g.globalAlpha = this.alpha * tw;
      g.drawImage(this.spr, p.x * W - s / 2, p.y * H - s / 2, s, s);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }
}

// Petals drifting down
export class Petals {
  constructor({ rate = 0.25, area = [0.05, 0.95], max = 8, size = [0.022, 0.034], speed = 0.06, tints = [0, 1, 2] } = {}) {
    Object.assign(this, { rate, area, max, size, speed, tints });
    this.p = [];
    this.acc = rand(0, 0.6);
  }
  burst(n) {
    for (let i = 0; i < n; i++) this.p.push(this.spawn(rand(-0.25, -0.02)));
  }
  spawn(y = -0.04) {
    return {
      x: rand(this.area[0], this.area[1]),
      y,
      s: rand(this.size[0], this.size[1]),
      vy: this.speed * rand(0.7, 1.25),
      ph: rand(0, 6.28),
      sw: rand(0.015, 0.035),
      r: rand(0, 6.28),
      vr: rand(-1.2, 1.2),
      flip: rand(1.2, 2.6),
      spr: petalSprite(this.tints[Math.floor(Math.random() * this.tints.length)]),
    };
  }
  update(dt, t) {
    this.acc += dt * this.rate;
    while (this.acc >= 1) {
      this.acc -= 1;
      if (this.p.length < this.max) this.p.push(this.spawn());
    }
    for (const p of this.p) {
      p.y += p.vy * dt;
      p.x += Math.sin(t * 0.9 + p.ph) * p.sw * dt;
      p.r += p.vr * dt;
    }
    this.p = this.p.filter((p) => p.y < 1.08);
  }
  draw(g, W, H, t) {
    for (const p of this.p) {
      const s = p.s * W;
      const fl = Math.cos(t * p.flip + p.ph);
      g.save();
      g.translate(p.x * W, p.y * H);
      g.rotate(p.r);
      g.scale(1, 0.35 + 0.65 * Math.abs(fl));
      g.globalAlpha = 0.92;
      g.drawImage(p.spr, -s / 2, -s * 0.66, s, s * 1.33);
      g.restore();
    }
    g.globalAlpha = 1;
  }
}

// Candle / lantern glows with irregular flicker
export class Flames {
  constructor(points) {
    // points: [{x, y, r, k}] r = radius as fraction of width, k = intensity
    this.points = points.map((p, i) => ({ ...p, seed: i * 17.3 + rand(0, 10) }));
    this.core = glowSprite('255,236,190');
    this.warm = glowSprite('255,176,80');
  }
  update() {}
  draw(g, W, H, t) {
    g.globalCompositeOperation = 'lighter';
    for (const p of this.points) {
      const f = 0.55 * noise1(t * 7 + p.seed) + 0.3 * noise1(t * 17 + p.seed * 2) + 0.15 * noise1(t * 2.3 + p.seed);
      const sc = 0.88 + 0.24 * f;
      const R = p.r * W * sc;
      g.globalAlpha = p.k * (0.35 + 0.5 * f);
      g.drawImage(this.warm, p.x * W - R, p.y * H - R, R * 2, R * 2);
      const r2 = R * 0.38;
      g.globalAlpha = p.k * (0.45 + 0.55 * f);
      g.drawImage(this.core, p.x * W - r2, p.y * H - r2 * 1.25, r2 * 2, r2 * 2.5);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }
}

// Star glints that pop at random points (inside a box) or at fixed points
export class Twinkles {
  constructor({ box = null, points = null, rate = 1.2, size = [0.012, 0.022] } = {}) {
    Object.assign(this, { box, points, rate, size });
    this.p = [];
    this.acc = 0;
    this.spr = starSprite();
  }
  update(dt) {
    this.acc += dt * this.rate * rand(0.5, 1.5);
    while (this.acc >= 1) {
      this.acc -= 1;
      let x, y;
      if (this.points) {
        const q = this.points[Math.floor(Math.random() * this.points.length)];
        x = q[0] + rand(-0.006, 0.006);
        y = q[1] + rand(-0.006, 0.006);
      } else {
        const [x0, y0, x1, y1] = this.box;
        x = rand(x0, x1);
        y = rand(y0, y1);
      }
      this.p.push({ x, y, s: rand(this.size[0], this.size[1]), life: 0, dur: rand(0.5, 0.9), r: rand(0, 0.8) });
    }
    for (const p of this.p) p.life += dt;
    this.p = this.p.filter((p) => p.life < p.dur);
  }
  draw(g, W, H) {
    g.globalCompositeOperation = 'lighter';
    for (const p of this.p) {
      const k = Math.sin((p.life / p.dur) * Math.PI);
      const s = p.s * W * (0.4 + 0.8 * k);
      g.globalAlpha = 0.9 * k;
      g.save();
      g.translate(p.x * W, p.y * H);
      g.rotate(p.r);
      g.drawImage(this.spr, -s / 2, -s / 2, s, s);
      g.restore();
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }
}

// Page 5 fountain: jet droplets, overflow drops per tier, splashes, mist, sparkles
export class Fountain {
  constructor(f, imgW = 1080, imgH = 1920) {
    // all values arrive in % of the image
    this.sx = f.spout[0] / 100;
    this.sy = f.spout[1] / 100;
    this.tiers = f.tiers.map((t) => ({ y: t.y / 100, x0: t.x0 / 100, x1: t.x1 / 100 }));
    this.basin = { cx: f.basin.cx / 100, cy: f.basin.cy / 100, rx: f.basin.rx / 100, ry: f.basin.ry / 100 };
    this.imgW = imgW;
    this.imgH = imgH;
    this.p = [];
    this.mist = [];
    this.acc = 0;
    this.macc = 0;
    this.dot = dotSprite();
    this.star = starSprite();
    this.g = 1100 / imgH; // gravity in uv-y / s^2
  }
  // one image pixel in uv
  px(n) {
    return n / this.imgW;
  }
  py(n) {
    return n / this.imgH;
  }
  emit(kind, x, y, vx, vy, extra = {}) {
    this.p.push({ kind, x, y, vx, vy, life: 0, dur: extra.dur || 2, s: extra.s || rand(1.2, 2.2), a: extra.a ?? 0.85, floor: extra.floor ?? 2 });
  }
  update(dt) {
    const T = this.tiers;
    this.acc += dt;
    while (this.acc > 0.016) {
      this.acc -= 0.016;
      // jet from the finial: up a little, then fall onto the top bowl
      if (Math.random() < 0.75) this.emit('drop', this.sx + this.px(rand(-1.5, 1.5)), this.sy, this.px(rand(-28, 28)), -this.py(rand(150, 240)), { floor: T[0].y - this.py(2) });
      // overflow from each tier rim, falling to the next level
      for (let i = 0; i < T.length; i++) {
        const below = i + 1 < T.length ? T[i + 1].y : this.basin.cy - this.py(2);
        if (Math.random() < 0.55) {
          const side = Math.random() < 0.5 ? -1 : 1;
          const x = side < 0 ? T[i].x0 + this.px(rand(-3, 4)) : T[i].x1 + this.px(rand(-4, 3));
          this.emit('drop', x, T[i].y + this.py(rand(0, 4)), this.px(side * rand(4, 26)), this.py(rand(10, 50)), { floor: below, s: rand(1, 1.9), a: 0.7 });
        }
      }
    }
    // mist above the basin
    this.macc += dt * 7;
    while (this.macc > 1) {
      this.macc -= 1;
      const b = this.basin;
      this.mist.push({ x: b.cx + rand(-b.rx * 0.75, b.rx * 0.75), y: b.cy + rand(-this.py(6), this.py(4)), vy: -this.py(rand(5, 14)), vx: this.px(rand(-5, 5)), s: rand(14, 30), life: 0, dur: rand(2.2, 3.6) });
    }
    const g = this.g;
    const out = [];
    for (const p of this.p) {
      p.life += dt;
      p.vy += g * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      if (p.kind === 'drop' && p.y >= p.floor && p.vy > 0) {
        // splash: a few tiny droplets bounce from the rim / surface
        for (let k = 0; k < 2; k++) out.push({ kind: 'splash', x: p.x, y: p.floor, vx: this.px(rand(-30, 30)), vy: -this.py(rand(40, 90)), life: 0, dur: rand(0.25, 0.45), s: rand(0.8, 1.4), a: 0.75, floor: 2 });
        if (Math.random() < 0.08) out.push({ kind: 'spark', x: p.x, y: p.floor, vx: 0, vy: 0, life: 0, dur: 0.45, s: rand(5, 9), a: 0.8, floor: 2 });
        continue;
      }
      if (p.life < p.dur && p.y < 1.02) out.push(p);
    }
    this.p = out.length > 700 ? out.slice(out.length - 700) : out;
    for (const m of this.mist) {
      m.life += dt;
      m.y += m.vy * dt;
      m.x += m.vx * dt;
    }
    this.mist = this.mist.filter((m) => m.life < m.dur);
  }
  draw(g, W, H) {
    const k = W / this.imgW; // CSS px per image px
    g.globalCompositeOperation = 'lighter';
    for (const m of this.mist) {
      const a = Math.sin((m.life / m.dur) * Math.PI) * 0.09;
      const s = m.s * k * (1 + m.life * 0.4);
      g.globalAlpha = a;
      g.drawImage(this.dot, m.x * W - s, m.y * H - s, s * 2, s * 2);
    }
    for (const p of this.p) {
      if (p.kind === 'spark') {
        const kk = Math.sin((p.life / p.dur) * Math.PI);
        const s = p.s * k * 2 * kk;
        g.globalAlpha = p.a * kk;
        g.drawImage(this.star, p.x * W - s / 2, p.y * H - s / 2, s, s);
        continue;
      }
      const s = Math.max(1.2, p.s * k * 2.2);
      g.globalAlpha = p.a * (p.kind === 'splash' ? 1 - p.life / p.dur : 1);
      g.drawImage(this.dot, p.x * W - s / 2, p.y * H - s / 2, s, s);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }
}

// One-shot bursts: confetti + petals (page 3), gold flakes (scratching), rising sparks (monogram)
export class Burst {
  constructor() {
    this.p = [];
    this.dot = glowSprite('255,214,120');
  }
  get active() {
    return this.p.length > 0;
  }
  confetti(cx, cy, n = 140) {
    const golds = ['#d9b45a', '#f1d98e', '#b8902f', '#e8c76f', '#fff1c4'];
    for (let i = 0; i < n; i++) {
      const a = rand(0, Math.PI * 2);
      const sp = rand(0.18, 0.6);
      const isPetal = Math.random() < 0.35;
      this.p.push({
        kind: isPetal ? 'petal' : 'conf',
        x: cx, y: cy,
        vx: Math.cos(a) * sp * 0.9,
        vy: Math.sin(a) * sp * 0.6 - 0.32,
        g: isPetal ? 0.16 : 0.32, drag: isPetal ? 1.4 : 1.1,
        r: rand(0, 6.28), vr: rand(-8, 8),
        w: isPetal ? rand(0.022, 0.032) : rand(0.008, 0.014),
        h: rand(0.4, 0.7),
        c: golds[i % golds.length],
        spr: isPetal ? petalSprite(i % 2) : null,
        life: 0, dur: rand(2.8, 4.2),
      });
    }
  }
  flakes(x, y, n = 3) {
    for (let i = 0; i < n; i++) {
      this.p.push({ kind: 'flake', x, y, vx: rand(-0.12, 0.12), vy: rand(-0.18, -0.02), g: 0.55, drag: 1.2, r: rand(0, 6.28), vr: rand(-10, 10), w: rand(0.004, 0.008), h: rand(0.5, 1), c: Math.random() < 0.5 ? '#f3dc8e' : '#c8a24a', life: 0, dur: rand(0.6, 1.1) });
    }
  }
  rise(points, spread = 0.0) {
    for (const [x, y] of points) {
      this.p.push({ kind: 'spark', x: x + rand(-spread, spread), y, vx: rand(-0.02, 0.02), vy: rand(-0.12, -0.04), g: -0.05, drag: 0.4, r: 0, vr: 0, w: rand(0.006, 0.014), h: 1, life: 0, dur: rand(0.7, 1.4), ph: rand(0, 6) });
    }
  }
  update(dt) {
    for (const p of this.p) {
      p.life += dt;
      p.vx -= p.vx * p.drag * dt;
      p.vy += p.g * dt - p.vy * p.drag * 0.35 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.r += p.vr * dt;
    }
    this.p = this.p.filter((p) => p.life < p.dur && p.y < 1.2);
  }
  draw(g, W, H, t) {
    for (const p of this.p) {
      const fade = 1 - Math.max(0, (p.life - p.dur * 0.6) / (p.dur * 0.4));
      if (p.kind === 'spark') {
        g.globalCompositeOperation = 'lighter';
        const s = p.w * W * (1.4 + 0.6 * Math.sin(t * 12 + p.ph));
        g.globalAlpha = fade * 0.95;
        g.drawImage(this.dot, p.x * W - s, p.y * H - s, s * 2, s * 2);
        g.globalCompositeOperation = 'source-over';
        continue;
      }
      g.save();
      g.translate(p.x * W, p.y * H);
      g.rotate(p.r);
      g.globalAlpha = fade;
      if (p.kind === 'petal') {
        const s = p.w * W;
        g.scale(1, 0.4 + 0.6 * Math.abs(Math.cos(p.r * 0.7)));
        g.drawImage(p.spr, -s / 2, -s * 0.66, s, s * 1.33);
      } else {
        const w = p.w * W;
        g.scale(1, Math.cos(p.r * 1.3));
        g.fillStyle = p.c;
        g.fillRect(-w / 2, (-w * p.h) / 2, w, w * p.h);
      }
      g.restore();
    }
    g.globalAlpha = 1;
  }
}
