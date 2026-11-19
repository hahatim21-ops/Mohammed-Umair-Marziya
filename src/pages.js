// Portrait pages (2, 4, 5, 6): column sizing, living WebGL plate, text sprites, ambient FX.
import layout from './layout.json';
import { asset, webglOK, reduced, addTick, removeTick, loadImage, imgReady, sizeCanvas, dpr, COL_MAX } from './core.js';
import { Living } from './living.js';
import { Motes, Petals, Flames, Twinkles, Fountain } from './fx.js';
import * as reveal from './reveal.js';

// reveal order + start times (seconds); styles (fade / ink / rise / spacing) live in layout.json
export const SEQ = {
  2: [['bismillah', 0], ['inname', 0.6], ['blessings', 0.95], ['hosts', 1.3], ['groom', 1.75], ['amp', 2.85], ['bride', 3.1], ['parents', 4.25], ['credit', 4.7]],
  4: [['title', 0], ['day', 1.15], ['sup', 1.5], ['month', 1.65], ['year', 1.9], ['isha', 2.25], ['venue', 2.85], ['credit', 3.3]],
  5: [['title', 0], ['day', 1.15], ['sup', 1.5], ['month', 1.65], ['year', 1.9], ['time', 2.3], ['venue', 2.7], ['credit', 3.15]],
  6: [['title', 0], ['names1', 1.05], ['names2', 1.45], ['names3', 1.8], ['credit', 2.25]],
};

// screen-reader transcript of each artwork (wording exactly as printed)
const TEXT = {
  2: 'Bismillah ir-Rahman ir-Rahim. In the name of Allah, the most beneficient, the most merciful. With the blessings of Late Mr Aboobaker Memon & Mrs Rukaiya Memon. Mrs Taskeen & Mr Farooq Memon cordially invite you to the Walima of Mohammed Umar & Marziya (D/O Saba & Faisal Motiwala).',
  4: 'Nikah. 03rd December 2026. After Namaz e Isha. Masjid e Akash, Agripada.',
  5: 'Walima. 06th December 2026. 9:00 PM onwards. Islam Gymkhana Ground, Marine Drive.',
  6: 'Regards, Mrs Salma & Mr Abdul Hameed Maklai. Fariha & Abdulwahid Memon. Usman Memon.',
};

const pctBox = (el, b) => {
  el.style.left = b.x + '%';
  el.style.top = b.y + '%';
  el.style.width = b.w + '%';
  el.style.height = b.h + '%';
};

export function makeBlocks(container, blocks) {
  return blocks.map((b) => {
    const el = document.createElement('div');
    el.className = 'blk hidden';
    pctBox(el, b);
    const img = document.createElement('img');
    img.alt = '';
    img.decoding = 'async';
    img.src = asset(b.src);
    el.appendChild(img);
    const out = { id: b.id, el, img, reveal: b.reveal, faint: !!b.faint };
    if (b.shimmer) {
      const s = document.createElement('div');
      s.className = 'shine';
      const url = `url("${asset(b.src)}")`;
      s.style.webkitMaskImage = url;
      s.style.maskImage = url;
      el.appendChild(s);
      out.shine = s;
    }
    if (b.reveal === 'spacing' && b.glyphs && !reduced) {
      el.classList.add('split');
      out.glyphs = b.glyphs.map(([a, z]) => {
        const g = document.createElement('div');
        g.className = 'glyph';
        g.style.left = a + '%';
        g.style.width = z - a + '%';
        const gi = document.createElement('img');
        gi.alt = '';
        gi.src = asset(b.src);
        gi.style.left = (-a / (z - a)) * 100 + '%';
        gi.style.width = (100 / (z - a)) * 100 + '%';
        g.appendChild(gi);
        el.appendChild(g);
        return g;
      });
    }
    container.appendChild(el);
    return out;
  });
}

// Fit the 9:16 art: full height, clipped equally on the sides on tall phones,
// but never so much that any text block would be cut.
export function fitPortrait(page, vw, vh) {
  const [iw, ih] = page.img;
  const ar = iw / ih;
  let sw = vh * ar;
  const span = page.textSpan || [10, 90];
  const d = Math.max(50 - span[0], span[1] - 50) / 100 + 0.025; // half-width needed, incl. margin
  const maxW = vw / (2 * d);
  if (sw > maxW) sw = maxW;
  return { sw, sh: sw / ar };
}

export class PortraitPage {
  constructor(pnum) {
    this.n = pnum;
    this.L = layout.pages[String(pnum)];
    this.visible = false;
    this.played = false;
    this.tl = null;
    this.gl = null;
    this.fx = [];
    this.tick = this.tick.bind(this);

    const el = (this.el = document.createElement('section'));
    el.className = `page portrait p${pnum}`;
    el.id = `page-${pnum}`;
    el.dataset.page = pnum;
    el.setAttribute('aria-label', ['', '', 'Invitation', '', 'Nikah', 'Walima', 'Regards'][pnum]);
    el.innerHTML = `<div class="stage"><div class="stage-inner"><img class="plate" alt="" decoding="async"><canvas class="gl" aria-hidden="true"></canvas></div></div><p class="sr-only"></p>`;
    el.querySelector('.sr-only').textContent = TEXT[pnum] || '';
    this.stage = el.querySelector('.stage');
    this.inner = el.querySelector('.stage-inner');
    this.plateEl = el.querySelector('.plate');
    this.canvas = el.querySelector('canvas.gl');
    this.addAmbient();
    this.blocks = makeBlocks(this.inner, this.L.blocks);
    this.fxCanvas = document.createElement('canvas');
    this.fxCanvas.className = 'fx';
    this.fxCanvas.setAttribute('aria-hidden', 'true');
    this.inner.appendChild(this.fxCanvas);
    this.g = this.fxCanvas.getContext('2d');
    if (pnum === 2) {
      this.bloom = document.createElement('div');
      this.bloom.className = 'bloom';
      this.inner.appendChild(this.bloom);
      this.dim = document.createElement('div');
      this.dim.className = 'dim';
      this.inner.appendChild(this.dim);
    }
    reveal.prepare(this.blocks);
  }

  addAmbient() {
    const L = this.L;
    const add = (cls, box) => {
      const d = document.createElement('div');
      d.className = 'amb ' + cls;
      Object.assign(d.style, { left: box[0] + '%', top: box[1] + '%', width: box[2] + '%', height: box[3] + '%' });
      this.inner.appendChild(d);
      return d;
    };
    if (reduced) return;
    if (this.n === 4) {
      const [x0, y0, x1] = L.arch;
      const w = (x1 - x0) * 1.9;
      add('rays', [(x0 + x1) / 2 - w / 2, y0 + 1.5, w, 100 - y0 - 1.5]);
    }
    if (this.n === 5) {
      const f = L.fountain.floor;
      add('floorglow', [f.cx - f.rx, f.cy - f.ry, f.rx * 2, f.ry * 2]);
    }
    if (this.n === 6) {
      const [x0, y0, x1, y1] = L.floor;
      const d = add('dapple', [x0, y0, x1 - x0, y1 - y0]);
      d.innerHTML = '<i></i><i></i>';
    }
  }

  buildFx() {
    if (reduced) return;
    const L = this.L;
    const P = (v) => v / 100;
    if (this.n === 2) {
      const cand = L.candles.map(([x, y]) => ({ x: P(x), y: P(y), r: 0.03, k: 0.75 }));
      const lan = L.lanternGlow.map(([x, y, r]) => ({ x: P(x), y: P(y), r: P(r) * 0.9, k: 0.55 }));
      this.fx.push(new Flames([...cand, ...lan]));
      const [a, b, c, d] = L.chandelier;
      this.fx.push(new Twinkles({ box: [P(a), P(b), P(c), P(d)], rate: 2.2, size: [0.012, 0.024] }));
      this.fx.push(new Motes({ count: 10, area: [0.12, 0.2, 0.88, 0.95], size: [0.003, 0.007], alpha: 0.55, rise: 0.008 }));
    }
    if (this.n === 4) this.fx.push(new Petals({ rate: 0.12, max: 3, speed: 0.045, area: [0.1, 0.9] }));
    if (this.n === 5) {
      this.fx.push(new Fountain(L.fountain, L.img[0], L.img[1]));
      this.fx.push(new Petals({ rate: 0.18, max: 4, speed: 0.05, area: [0.05, 0.95] }));
    }
    if (this.n === 6) {
      this.petals = new Petals({ rate: 0.1, max: 4, speed: 0.035, area: [0.05, 0.95] });
      this.fx.push(this.petals);
    }
  }

  plateUrl() {
    const big = (this.sw || 400) * dpr(2) > 760;
    return asset(`page${this.n}_clean_${big ? 1080 : 720}.webp`);
  }

  // load plate + mask + sprites
  load() {
    if (this._loading) return this._loading;
    const url = this.plateUrl();
    this.plateEl.src = url;
    const tasks = [loadImage(url).then((img) => (this.plateImg = img))];
    if (webglOK) tasks.push(loadImage(asset(`page${this.n}_motion.png`)).then((img) => (this.maskImg = img)));
    for (const b of this.blocks) tasks.push(imgReady(b.img));
    this._loading = Promise.all(tasks).catch((e) => console.warn(e.message));
    return this._loading;
  }

  initGL() {
    if (this.gl || !webglOK || !this.plateImg || !this.maskImg) return;
    try {
      const L = this.L;
      const b = L.fountain ? L.fountain.pool : null;
      this.gl = new Living(this.canvas, this.plateImg, this.maskImg, {
        imgW: L.img[0],
        imgH: L.img[1],
        water: this.n === 5,
        drift: this.n === 4,
        basin: b ? [b.cx / 100, b.cy / 100, b.rx / 100, b.ry / 100] : null,
        onLost: () => {
          this.canvas.classList.remove('ready');
          this.plateEl.style.visibility = '';
        },
      });
      this.gl.resize(this.sw, this.sh);
      this.gl.render(0);
      this.canvas.classList.add('ready');
      // the canvas is opaque and draws the plate itself: don't make the compositor raster it twice
      setTimeout(() => {
        if (this.gl && !this.gl.lost) this.plateEl.style.visibility = 'hidden';
      }, 450);
    } catch (e) {
      this.gl = null;
    }
  }

  resize(vw) {
    // the whole card at the column width, never cropped; the section is exactly that tall
    const [iw, ih] = this.L.img;
    const sw = Math.min(vw, COL_MAX);
    const sh = (sw * ih) / iw;
    this.el.style.height = sh + 'px';
    this.sw = sw;
    this.sh = sh;
    this.stage.style.setProperty('--sw', sw + 'px');
    this.stage.style.setProperty('--sh', sh + 'px');
    if (this.gl) this.gl.resize(sw, sh);
    this.fxD = sizeCanvas(this.fxCanvas, sw, sh, 1.5);
  }

  // load + upload textures ahead of time (idle), so entering the page never hitches
  prewarm() {
    return this.load().then(() => {
      this.initGL();
      if (!this.fx.length) this.buildFx();
    });
  }

  setVisible(v) {
    if (v === this.visible) return;
    this.visible = v;
    this.el.classList.toggle('live', v);
    if (v) {
      this.load().then(() => {
        if (!this.visible) return;
        this.initGL();
        if (!this.fx.length) this.buildFx();
        addTick(this.tick);
      });
    } else {
      removeTick(this.tick);
    }
  }

  tick(t, dt) {
    if (this.gl) this.gl.render(t);
    const g = this.g;
    if (!this.fx.length) return;
    const W = this.sw;
    const H = this.sh;
    g.setTransform(this.fxD, 0, 0, this.fxD, 0, 0);
    g.clearRect(0, 0, W, H);
    for (const f of this.fx) {
      f.update(dt, t);
      f.draw(g, W, H, t);
    }
  }

  play() {
    if (this.played) return;
    this.played = true;
    this.load().then(() => {
      if (!this.played) return;
      this.tl && this.tl.kill();
      this.tl = reveal.play(this.blocks, SEQ[this.n], () => {
        if (this.n === 6 && this.petals) {
          // finale: petals drift down slowly
          this.petals.rate = 0.9;
          this.petals.max = 14;
          this.petals.burst(5);
        }
      });
    });
  }

  reset() {
    if (!this.played) return;
    this.played = false;
    this.tl && this.tl.kill();
    this.tl = null;
    reveal.prepare(this.blocks);
    if (this.n === 6 && this.petals) {
      this.petals.rate = 0.1;
      this.petals.max = 4;
    }
  }
}
