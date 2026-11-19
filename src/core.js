// Shared helpers: environment flags, asset URLs, the frame ticker, small utils.

const files = import.meta.glob(
  ['../assets/generated/*.{webp,png,jpg}', '!../assets/generated/page?_1080.webp', '!../assets/generated/page?_720.webp'],
  { eager: true, query: '?url', import: 'default' }
);
const audioFiles = import.meta.glob('../assets/audio/music.mp3', { eager: true, query: '?url', import: 'default' });

export function asset(name) {
  const url = files['../assets/generated/' + name];
  if (!url) throw new Error('Missing generated asset: ' + name);
  return url;
}
export const musicUrl = Object.values(audioFiles)[0] || null;

export const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const webglOK =
  !reduced &&
  (() => {
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl') || c.getContext('experimental-webgl');
      const ok = !!gl;
      gl && gl.getExtension('WEBGL_lose_context')?.loseContext();
      return ok;
    } catch (e) {
      return false;
    }
  })();

// pages sit in one centred column, like a phone, at most this wide
export const COL_MAX = 520;

export const dpr = (cap = 2) => Math.min(window.devicePixelRatio || 1, cap);
export const vibrate = (ms) => {
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch (e) {
    /* not supported */
  }
};
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const rand = (a, b) => a + Math.random() * (b - a);

export function viewport() {
  // innerHeight follows the visible area (svh-like on iOS because the page itself never scrolls)
  return { w: window.innerWidth, h: window.innerHeight };
}

// ---------- one RAF loop that only runs while somebody is listening ----------
const subs = new Set();
let raf = 0;
let last = 0;
function loop(now) {
  raf = 0;
  if (!subs.size) return;
  const t = now / 1000;
  const dt = last ? Math.min(0.05, t - last) : 1 / 60;
  last = t;
  for (const fn of Array.from(subs)) fn(t, dt);
  raf = requestAnimationFrame(loop);
}
export function addTick(fn) {
  subs.add(fn);
  if (!raf) {
    last = 0;
    raf = requestAnimationFrame(loop);
  }
}
export function removeTick(fn) {
  subs.delete(fn);
}

// decode() can stay pending while a tab is hidden, so never wait on it for long
export function settleDecode(img, ms = 400) {
  const d = img.decode ? img.decode().catch(() => {}) : Promise.resolve();
  return Promise.race([d, new Promise((r) => setTimeout(r, ms))]);
}

export function imgReady(img) {
  if (img.complete && img.naturalWidth) return settleDecode(img);
  return new Promise((r) => {
    img.addEventListener('load', r, { once: true });
    img.addEventListener('error', r, { once: true });
  }).then(() => settleDecode(img));
}

export function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => settleDecode(img).then(() => resolve(img));
    img.onerror = () => reject(new Error('img ' + src));
    img.src = src;
  });
}

// smooth 1D value noise, used for flicker etc.
const P = new Float32Array(256).map(() => Math.random());
export function noise1(x) {
  const i = Math.floor(x);
  const f = x - i;
  const a = P[i & 255];
  const b = P[(i + 1) & 255];
  const u = f * f * (3 - 2 * f);
  return a + (b - a) * u;
}

export function sizeCanvas(canvas, w, h, cap = 2) {
  const d = dpr(cap);
  const W = Math.max(1, Math.round(w * d));
  const H = Math.max(1, Math.round(h * d));
  if (canvas.width !== W || canvas.height !== H) {
    canvas.width = W;
    canvas.height = H;
  }
  return d;
}
