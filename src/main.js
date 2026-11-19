import 'lenis/dist/lenis.css';
import './style.css';
import Lenis from 'lenis';
import { gsap } from 'gsap';
import { viewport, reduced, asset, COL_MAX } from './core.js';
import { PortraitPage } from './pages.js';
import { ScratchPage } from './scratch.js';
import { Intro } from './intro.js';
import { Music } from './music.js';

const scroller = document.getElementById('scroller');
const music = new Music(document.querySelector('.music'));

// ---------------------------------------------------------------- pages 2-6, one continuous column
const col = document.createElement('div');
col.className = 'col';
scroller.appendChild(col);
const pages = [new PortraitPage(2), new ScratchPage(), new PortraitPage(4), new PortraitPage(5), new PortraitPage(6)];
for (const p of pages) col.appendChild(p.el);
const page2 = pages[0];

let introDone = false;

// ---------------------------------------------------------------- smooth, continuous scrolling (Lenis)
// wheel / trackpad glide with easing; touch stays native (momentum), nothing snaps.
const lenis = reduced
  ? null
  : new Lenis({ wrapper: scroller, content: col, lerp: 0.1, smoothWheel: true, syncTouch: false, autoRaf: false });
if (lenis) {
  lenis.stop();
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
}
const scrollY = () => (lenis ? lenis.scroll : scroller.scrollTop);
function scrollToY(y, immediate = false) {
  if (lenis) lenis.scrollTo(y, { immediate, lerp: 0.1 });
  else scroller.scrollTo({ top: y, behavior: 'auto' });
}

// keyboard: arrows / page keys / space glide by most of a screen
window.addEventListener('keydown', (e) => {
  if (!introDone) return;
  if (e.target && (e.target.closest('input,textarea') || (e.target.closest('button') && (e.key === ' ' || e.key === 'Enter')))) return;
  const h = scroller.clientHeight;
  const step = { ArrowDown: 0.25, ArrowUp: -0.25, PageDown: 0.85, PageUp: -0.85 }[e.key] ?? (e.key === ' ' ? (e.shiftKey ? -0.85 : 0.85) : 0);
  if (step) {
    e.preventDefault();
    scrollToY(scrollY() + step * h);
  } else if (e.key === 'Home' || e.key === 'End') {
    e.preventDefault();
    scrollToY(e.key === 'Home' ? 0 : col.offsetHeight);
  }
});

// ---------------------------------------------------------------- blurred backdrop beside the column (wide screens)
const backdrop = document.createElement('div');
backdrop.className = 'backdrop';
backdrop.setAttribute('aria-hidden', 'true');
const bds = pages.map((p) => {
  const d = document.createElement('div');
  d.style.backgroundImage = `url("${asset(`page${p.n}_blur.webp`)}")`;
  backdrop.appendChild(d);
  return d;
});
document.body.insertBefore(backdrop, scroller);
let bdOn = -1;
function updateBackdrop() {
  const mid = scroller.clientHeight / 2;
  let k = 0;
  for (let i = 0; i < pages.length; i++) if (pages[i].el.getBoundingClientRect().top <= mid) k = i;
  if (k === bdOn) return;
  bdOn = k;
  bds.forEach((d, i) => d.classList.toggle('on', i === k));
}
updateBackdrop();
if (lenis) lenis.on('scroll', updateBackdrop);
else scroller.addEventListener('scroll', updateBackdrop, { passive: true });

// ---------------------------------------------------------------- visibility + reveals
// pages start animating a little before they scroll in, so nothing "switches on" in view
const io = new IntersectionObserver(
  (entries) => {
    for (const en of entries) {
      const page = pages.find((p) => p.el === en.target);
      if (page && (introDone || page === page2)) page.setVisible(en.isIntersecting && (introDone || opening));
    }
  },
  { root: scroller, rootMargin: '35% 0px', threshold: 0 }
);
// text reveals play once, as the card scrolls into view
const playIo = new IntersectionObserver(
  (entries) => {
    for (const en of entries) {
      const page = pages.find((p) => p.el === en.target);
      if (page && introDone && en.intersectionRatio >= 0.3) page.play();
    }
  },
  { root: scroller, threshold: [0, 0.3] }
);
pages.forEach((p) => {
  io.observe(p.el);
  playIo.observe(p.el);
});

// ---------------------------------------------------------------- layout
function layoutAll() {
  const { w, h } = viewport();
  if (w < 50 || h < 50) return; // hidden / not laid out yet
  document.documentElement.style.setProperty('--app-h', h + 'px');
  document.documentElement.style.setProperty('--col', Math.min(w, COL_MAX) + 'px');
  for (const p of pages) p.resize(w, h);
  if (intro && !introDone) intro.resize();
  if (lenis) lenis.resize();
  updateBackdrop();
}
let rzT = 0;
function onResize() {
  clearTimeout(rzT);
  rzT = setTimeout(layoutAll, 120);
}
window.addEventListener('resize', onResize);
window.addEventListener('orientationchange', onResize);

// ---------------------------------------------------------------- intro / preload
let opening = false;
const intro = new Intro({
  music,
  page2,
  onOpenStart: () => {
    opening = true;
    page2.setVisible(true);
  },
  onOpened: () => {
    introDone = true;
    document.body.classList.remove('locked');
    if (lenis) lenis.start();
    music.reveal();
    page2.play();
    // pick up whatever the observer already knows
    const m = window.innerHeight * 0.35;
    for (const p of pages) {
      const r = p.el.getBoundingClientRect();
      p.setVisible(r.bottom > -m && r.top < window.innerHeight + m);
    }
  },
});

async function boot() {
  layoutAll();
  intro.progress(0.05);
  let done = 0;
  const step = () => intro.progress(0.1 + (0.9 * ++done) / 4);
  const fontReady = document.fonts ? Promise.race([document.fonts.ready, new Promise((r) => setTimeout(r, 2500))]) : Promise.resolve();
  // pages 1-3 fully before the curtain shows
  await Promise.all([
    intro.load().then(step),
    page2.load().then(step),
    pages[1].load().then(step),
    fontReady.then(step),
  ]);
  // let the monogram finish drawing in on very fast connections
  const minShow = new Promise((r) => setTimeout(r, reduced ? 200 : 1600));
  await minShow;
  intro.show();
  // warm up page 2 now, then pages 4-6 in the background, one per idle slot
  const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 1500 }) : setTimeout(fn, 300));
  const queue = [page2, pages[2], pages[3], pages[4]];
  const next = () => {
    const p = queue.shift();
    if (p) idle(() => p.prewarm().then(next));
  };
  next();
}
boot();

if (import.meta.env.DEV) window.__invite = { intro, pages, music, lenis, scrollToY };
