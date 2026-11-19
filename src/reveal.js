// Text reveal timelines. Built fresh each time a page snaps into view so pixel
// distances match the current stage size; reset once the page is fully off screen.
import { gsap } from 'gsap';
import { reduced } from './core.js';

// opacity (not visibility) so sprites are decoded and rastered before their reveal starts
const FADE_FROM = { opacity: 0, visibility: 'visible', filter: 'blur(8px)', y: 14 };
const FADE_TO = { opacity: 1, filter: 'blur(0px)', y: 0, duration: 1.0, ease: 'power2.out' };

export function prepare(blocks) {
  for (const b of blocks) {
    gsap.killTweensOf(b.el);
    b.el.classList.remove('done');
    if (b.glyphs) b.glyphs.forEach((gl) => gsap.set(gl, { clearProps: 'transform' }));
    if (reduced) {
      gsap.set(b.el, { opacity: 0, visibility: 'visible', clearProps: 'filter,transform' });
      continue;
    }
    if (b.reveal === 'ink') {
      gsap.set(b.el, { opacity: 1, visibility: 'visible', '--ink': '-20%', filter: 'none', y: 0 });
      b.el.classList.add('ink');
    } else if (b.reveal === 'spacing') {
      gsap.set(b.el, { opacity: 0, visibility: 'visible', filter: 'blur(6px)', y: 0 });
    } else if (b.reveal === 'rise') {
      gsap.set(b.el, { opacity: 0, visibility: 'visible', filter: 'blur(8px)', y: 40, scale: 0.94 });
    } else {
      gsap.set(b.el, FADE_FROM);
    }
    if (b.shine) b.shine.classList.remove('run');
  }
}

// seq: [[id, atSeconds], ...]  (reveal style comes from layout.json)
export function play(blocks, seq, onDone) {
  const tl = gsap.timeline({
    onComplete: () => {
      // drop finished filters so the sprites don't keep their own compositing layers
      for (const b of blocks) if (b.reveal !== 'ink') gsap.set(b.el, { clearProps: 'filter' });
      onDone && onDone();
    },
  });
  const byId = Object.fromEntries(blocks.map((b) => [b.id, b]));
  for (const [id, at] of seq) {
    const b = byId[id];
    if (!b) continue;
    if (reduced) {
      tl.to(b.el, { opacity: 1, duration: 0.8, ease: 'power1.out' }, at * 0.6);
      continue;
    }
    if (b.reveal === 'ink') {
      tl.to(b.el, { '--ink': '118%', duration: 1.4, ease: 'power1.inOut', onComplete: () => b.el.classList.add('done') }, at);
    } else if (b.reveal === 'rise') {
      tl.to(b.el, { opacity: 1, filter: 'blur(0px)', y: 0, scale: 1, duration: 1.1, ease: 'back.out(1.5)' }, at);
    } else if (b.reveal === 'spacing') {
      // letter-spacing settles from wide to normal: each glyph slides in from its widened position
      const w = b.el.getBoundingClientRect().width;
      const n = b.glyphs.length;
      tl.to(b.el, { opacity: 1, filter: 'blur(0px)', duration: 1.0, ease: 'power2.out' }, at);
      b.glyphs.forEach((gl, i) => {
        const c = (i + 0.5) / n - 0.5;
        tl.fromTo(gl, { x: c * w * 0.22 }, { x: 0, duration: 1.6, ease: 'expo.out' }, at);
      });
    } else {
      tl.to(b.el, { ...FADE_TO, duration: b.faint ? 1.4 : 1.0 }, at);
    }
    if (b.shine) tl.add(() => b.shine.classList.add('run'), at + 0.9);
  }
  return tl;
}
