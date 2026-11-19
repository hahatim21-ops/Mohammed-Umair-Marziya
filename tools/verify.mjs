// End-to-end visual + behaviour check with Playwright.
//   node tools/verify.mjs [baseUrl]      (default http://localhost:5173)
// Writes screenshots + short recordings to verify/ and prints a pass/fail report.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const BASE = process.argv[2] || 'http://localhost:5173';
const OUT = path.resolve('verify');
fs.mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: '390x844', width: 390, height: 844, mobile: true },
  { name: '360x800', width: 360, height: 800, mobile: true },
  { name: '430x932', width: 430, height: 932, mobile: true },
  { name: '1440x900', width: 1440, height: 900, mobile: false },
];
const results = [];
const check = (vp, name, ok, info = '') => {
  results.push({ vp, name, ok, info });
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${vp}] ${name}${info ? '  — ' + info : ''}`);
};
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function newPage(browser, vp, record) {
  const ctx = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.mobile ? 2 : 1,
    isMobile: vp.mobile,
    hasTouch: vp.mobile,
    recordVideo: record ? { dir: path.join(OUT, 'video-tmp'), size: { width: vp.width, height: vp.height } } : undefined,
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(BASE, { waitUntil: 'load' });
  await page.waitForSelector('#preloader.done', { timeout: 30000 });
  await wait(1200);
  return { ctx, page, errors };
}

async function tasselCenter(page) {
  return page.$eval('.tassel-btn', (b) => {
    const r = b.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + 30 };
  });
}

async function dragTassel(page, dy = 140) {
  const c = await tasselCenter(page);
  await page.mouse.move(c.x, c.y);
  await page.mouse.down();
  for (let i = 1; i <= 14; i++) {
    await page.mouse.move(c.x + Math.sin(i) * 3, c.y + (dy * i) / 14);
    await wait(16);
  }
  await page.mouse.up();
}

async function pageMetrics(page) {
  return page.evaluate(() => {
    const sc = document.getElementById('scroller');
    const secs = [...sc.querySelectorAll('section.page')].map((s) => {
      const r = s.getBoundingClientRect();
      return { top: r.top + sc.scrollTop, h: r.height, id: s.id };
    });
    return { h: sc.clientHeight, top: sc.scrollTop, secs, vw: innerWidth, vh: innerHeight };
  });
}

// wait until the snap animation has finished (scrollTop stable for ~600 ms)
async function settle(page, maxMs = 4000) {
  let last = -1;
  let stable = 0;
  for (let t = 0; t < maxMs; t += 100) {
    await wait(100);
    const top = await page.evaluate(() => document.getElementById('scroller').scrollTop);
    stable = Math.abs(top - last) < 0.5 ? stable + 1 : 0;
    last = top;
    if (stable >= 6 && t >= 600) return;
  }
}

async function scrollToPage(page, i) {
  await page.evaluate((i) => {
    const inv = window.__invite;
    inv.scrollToY(inv.pages[i].el.offsetTop, true);
  }, i);
  await wait(250);
}

async function run(vp, browser) {
  const tag = vp.name;
  const { ctx, page, errors } = await newPage(browser, vp, true);
  await page.screenshot({ path: path.join(OUT, `${tag}-1-curtain-closed.png`) });

  // pull the tassel
  await dragTassel(page, 150);
  await wait(900);
  await page.screenshot({ path: path.join(OUT, `${tag}-2-curtain-opening.png`) });
  await page.screenshot({ path: path.join(OUT, `${tag}-2b-curtain-opening.png`) });
  await page.waitForSelector('#intro', { state: 'detached', timeout: 8000 }).then(
    () => check(tag, 'tassel drag opens the invitation', true),
    () => check(tag, 'tassel drag opens the invitation', false)
  );
  await wait(5600);
  await page.screenshot({ path: path.join(OUT, `${tag}-3-page2.png`) });

  // pages never overlap & each is exactly one viewport tall
  const m = await pageMetrics(page);
  const overlapOk = m.secs.every((s, i) => Math.abs(s.h - m.h) < 1.5 && Math.abs(s.top - i * m.h) < 1.5);
  check(tag, 'five pages, one viewport each, no overlap', overlapOk && m.secs.length === 5, m.secs.map((s) => Math.round(s.top)).join(','));

  // no text sprite clipped horizontally (portrait pages)
  const clipped = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('section.portrait .blk').forEach((b) => {
      const r = b.getBoundingClientRect();
      if (r.left < -0.5 || r.right > innerWidth + 0.5) out.push(b.closest('section').id + ':' + Math.round(r.left) + '..' + Math.round(r.right));
    });
    return out;
  });
  check(tag, 'no text clipped at the sides', clipped.length === 0, clipped.join(' '));

  // one swipe / wheel / key = one page
  if (vp.mobile) {
    const cdp = await ctx.newCDPSession(page);
    // a real finger swipe: touchStart, 20 moves over ~320 ms, touchEnd
    const swipe = async (fromY, toY) => {
      const x = Math.round(vp.width / 2);
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y: fromY }] });
      for (let i = 1; i <= 20; i++) {
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x, y: Math.round(fromY + ((toY - fromY) * i) / 20) }] });
        await wait(16);
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await settle(page);
    };
    // NB: CDP touches carry no fling velocity, so the drag must pass the halfway point;
    // on a real phone a short flick does the same thanks to scroll-snap-stop: always.
    await swipe(Math.round(vp.height * 0.8), Math.round(vp.height * 0.22));
    let mm = await pageMetrics(page);
    check(tag, 'one swipe moves exactly one page', Math.abs(mm.top - mm.h) < 2, `scrollTop=${Math.round(mm.top)} h=${mm.h}`);
    await swipe(Math.round(vp.height * 0.2), Math.round(vp.height * 0.78));
    mm = await pageMetrics(page);
    check(tag, 'swipe back returns one page', Math.abs(mm.top) < 2, `scrollTop=${Math.round(mm.top)}`);
  } else {
    await page.mouse.move(vp.width / 2, vp.height / 2);
    await page.mouse.wheel(0, 100); // one wheel notch
    await settle(page);
    let mm = await pageMetrics(page);
    check(tag, 'one wheel step moves exactly one page', Math.abs(mm.top - mm.h) < 2, `scrollTop=${Math.round(mm.top)}`);
    // a long trackpad-style burst still moves only one page
    for (let i = 0; i < 25; i++) {
      await page.mouse.wheel(0, Math.max(3, Math.round(60 * Math.pow(0.88, i)))); // decaying inertia
      await wait(16);
    }
    await wait(1200);
    mm = await pageMetrics(page);
    check(tag, 'a trackpad burst moves exactly one page', Math.abs(mm.top - 2 * mm.h) < 2, `scrollTop=${Math.round(mm.top)}`);
    await page.keyboard.press('ArrowUp');
    await wait(1100);
    await page.keyboard.press('ArrowUp');
    await wait(1100);
    mm = await pageMetrics(page);
    check(tag, 'ArrowUp steps back one page per press', Math.abs(mm.top) < 2, `scrollTop=${Math.round(mm.top)}`);
    await page.keyboard.press('PageDown');
    await wait(1100);
    mm = await pageMetrics(page);
    check(tag, 'PageDown moves one page', Math.abs(mm.top - mm.h) < 2, `scrollTop=${Math.round(mm.top)}`);
  }

  // page 3 complete + uncropped
  await scrollToPage(page, 1);
  await wait(900);
  await page.screenshot({ path: path.join(OUT, `${tag}-4-page3-before.png`) });
  const card = await page.evaluate(() => {
    const c = document.querySelector('.card').getBoundingClientRect();
    const s = document.getElementById('page-3').getBoundingClientRect();
    return { l: c.left, r: c.right, t: c.top - s.top, b: c.bottom - s.top, w: c.width, h: c.height, vw: innerWidth, sh: s.height };
  });
  const arOk = Math.abs(card.w / card.h - 1671 / 941) < 0.01;
  const inside = card.l >= -0.5 && card.r <= card.vw + 0.5 && card.t >= -0.5 && card.b <= card.sh + 0.5;
  check(tag, 'page 3 shows the complete, undistorted card', arOk && inside, `${Math.round(card.w)}x${Math.round(card.h)} at ${Math.round(card.l)},${Math.round(card.t)}`);

  // scratch
  const foil = await page.$eval('.foil', (f) => {
    const r = f.getBoundingClientRect();
    return { x: r.left, y: r.top, w: r.width, h: r.height };
  });
  await page.mouse.move(foil.x + foil.w * 0.2, foil.y + foil.h * 0.15);
  await page.mouse.down();
  for (let row = 0; row < 9; row++) {
    const y = foil.y + foil.h * (0.12 + row * 0.095);
    const xs = row % 2 ? [0.85, 0.15] : [0.15, 0.85];
    for (let k = 0; k <= 8; k++) {
      const x = foil.x + foil.w * (xs[0] + ((xs[1] - xs[0]) * k) / 8);
      await page.mouse.move(x, y);
      await wait(12);
    }
  }
  await page.mouse.up();
  await wait(450);
  await page.screenshot({ path: path.join(OUT, `${tag}-5-page3-confetti.png`) });
  await wait(1600);
  await page.screenshot({ path: path.join(OUT, `${tag}-6-page3-revealed.png`) });
  const revealed = await page.evaluate(() => window.__invite.pages[1].revealed && getComputedStyle(document.querySelector('.foil')).display === 'none');
  check(tag, 'scratching reveals the date', revealed);

  for (const [i, name] of [[2, '7-page4'], [3, '8-page5'], [4, '9-page6']]) {
    await scrollToPage(page, i);
    await wait(i === 4 ? 4200 : 4600);
    await page.screenshot({ path: path.join(OUT, `${tag}-${name}.png`) });
  }
  // scroll back to page 3: still revealed
  await scrollToPage(page, 1);
  await wait(600);
  const still = await page.evaluate(() => window.__invite.pages[1].revealed);
  check(tag, 'scratch card stays revealed when coming back', still);

  // music button: hidden when no music.mp3, otherwise toggles
  const music = await page.evaluate(() => {
    const b = document.querySelector('.music');
    return { hidden: b.hidden, available: window.__invite.music.available };
  });
  if (!music.available) check(tag, 'music button hidden (no music.mp3)', music.hidden);
  else {
    const before = await page.evaluate(() => window.__invite.music.playing);
    await page.click('.music');
    await wait(500);
    const after = await page.evaluate(() => window.__invite.music.playing);
    await page.click('.music');
    await wait(500);
    const again = await page.evaluate(() => window.__invite.music.playing);
    check(tag, 'music button toggles', before !== after && after !== again, `${before} -> ${after} -> ${again}`);
  }

  check(tag, 'no console errors', errors.length === 0, errors.slice(0, 3).join(' | '));
  const video = page.video();
  await ctx.close();
  if (video) {
    const p = await video.path();
    fs.renameSync(p, path.join(OUT, `${tag}-recording.webm`));
  }
}

async function tapTest(browser) {
  const vp = VIEWPORTS[0];
  const { ctx, page } = await newPage(browser, vp, false);
  const c = await tasselCenter(page);
  await page.touchscreen.tap(c.x, c.y);
  const ok = await page.waitForSelector('#intro', { state: 'detached', timeout: 8000 }).then(() => true, () => false);
  check(vp.name, 'a plain tap on the tassel opens it', ok);
  await ctx.close();
  // keyboard
  const k = await newPage(browser, VIEWPORTS[3], false);
  await k.page.focus('.tassel-btn');
  await k.page.keyboard.press('Enter');
  const ok2 = await k.page.waitForSelector('#intro', { state: 'detached', timeout: 8000 }).then(() => true, () => false);
  check('1440x900', 'Enter on the focused tassel opens it', ok2);
  await k.ctx.close();
}

const browser = await chromium.launch({ args: ['--enable-gpu', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const only = process.env.VP;
for (const vp of VIEWPORTS) if (!only || only === vp.name) await run(vp, browser);
if (!only) await tapTest(browser);
await browser.close();
fs.rmSync(path.join(OUT, 'video-tmp'), { recursive: true, force: true });
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(results, null, 2));
process.exit(failed.length ? 1 : 0);
