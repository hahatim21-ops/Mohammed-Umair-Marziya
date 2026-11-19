#!/usr/bin/env python3
"""
One-time asset preparation for the Mohammed Umar & Marziya invitation.

Reads   assets/original/*   (never modified)
Writes  assets/generated/*  (web assets)
        assets/generated/masters/*  (lossless masters, not shipped)
        assets/generated/debug/*    (overlays + diff proofs, not shipped)
        src/layout.json             (every position, as % of its image)

Run:  python tools/prepare_assets.py
Needs: Pillow, opencv-python-headless, numpy
"""
from __future__ import annotations

import json
import shutil
from pathlib import Path

import cv2
import numpy as np
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
ORIG = ROOT / "assets" / "original"
GEN = ROOT / "assets" / "generated"
MASTERS = GEN / "masters"
DEBUG = GEN / "debug"
LAYOUT = ROOT / "src" / "layout.json"

W, H = 1080, 1920

# ---------------------------------------------------------------------------
# Measured layout (image pixels). Boxes are generous; the script tightens them.
#   reveal: fade | ink | rise | spacing
# ---------------------------------------------------------------------------
PAGES = {
    1: dict(file="1_MUM.JPEG", blocks=[]),
    2: dict(
        file="2_MUM.JPEG",
        blocks=[
            dict(id="bismillah", box=(390, 366, 732, 458), reveal="fade", shimmer=True),
            dict(id="inname", box=(250, 474, 830, 547), reveal="fade"),
            dict(id="blessings", box=(274, 566, 792, 700), reveal="fade"),
            dict(id="hosts", box=(224, 728, 832, 852), reveal="fade"),
            dict(id="groom", box=(256, 868, 864, 1050), reveal="ink", k=61),
            dict(id="amp", box=(500, 1058, 590, 1148), reveal="fade", k=61),
            dict(id="bride", box=(304, 1164, 746, 1360), reveal="ink", k=61),
            dict(id="parents", box=(328, 1366, 782, 1408), reveal="fade"),
            dict(id="credit", box=(448, 1434, 662, 1476), reveal="fade", faint=True),
        ],
    ),
    4: dict(
        file="4_MUM.jpeg",
        blocks=[
            dict(id="title", box=(228, 198, 878, 448), reveal="ink", k=61,
                 exclude=[(240, 186, 320, 226), (705, 186, 800, 226), (840, 186, 900, 226), (868, 398, 900, 430)]),
            dict(id="day", box=(280, 496, 424, 642), reveal="rise", k=91),
            dict(id="sup", box=(432, 500, 498, 534), reveal="fade"),
            dict(id="year", box=(720, 536, 818, 574), reveal="fade"),
            dict(id="month", box=(432, 562, 792, 644), reveal="fade", k=61),
            dict(id="isha", box=(266, 692, 808, 742), reveal="spacing"),
            dict(id="venue", box=(210, 778, 866, 830), reveal="fade"),
            dict(id="credit", box=(586, 934, 821, 978), reveal="fade", faint=True),
        ],
    ),
    5: dict(
        file="5_MUM.JPEG",
        blocks=[
            dict(id="title", box=(228, 552, 852, 774), reveal="ink", k=61),
            dict(id="day", box=(196, 796, 380, 952), reveal="rise", k=91),
            dict(id="sup", box=(396, 806, 460, 842), reveal="fade"),
            dict(id="year", box=(738, 876, 846, 922), reveal="fade"),
            dict(id="month", box=(386, 870, 760, 970), reveal="fade", k=61),
            dict(id="time", box=(248, 1024, 818, 1080), reveal="fade"),
            dict(id="venue", box=(202, 1126, 864, 1250), reveal="fade"),
            dict(id="credit", box=(316, 1760, 552, 1800), reveal="fade", faint=True),
        ],
    ),
    6: dict(
        file="6_MUM.JPEG",
        blocks=[
            dict(id="title", box=(376, 620, 704, 730), reveal="ink", k=61),
            dict(id="names1", box=(202, 812, 878, 940), reveal="fade"),
            dict(id="names2", box=(152, 1020, 928, 1076), reveal="fade"),
            dict(id="names3", box=(348, 1088, 732, 1144), reveal="fade"),
            dict(id="credit", box=(368, 1454, 606, 1494), reveal="fade", faint=True),
        ],
    ),
}

MONOGRAM_BOX = (312, 742, 770, 1144)  # page 1 "MU"

# Points of interest (image px) -> converted to % in layout.json
POI = {
    1: dict(
        tassel=dict(x=860, y=0, length=0.50),  # anchor at 79.6% x, top edge; rope end ~50% H
        pearls=[(175, 860), (905, 860)],
    ),
    2: dict(
        candles=[(452, 152), (502, 116), (620, 122), (672, 150), (560, 108)],
        lanterns=[(143, 1712), (937, 1772)],
        lanternGlow=[(140, 1700, 120), (930, 1760, 120)],
        chandelier=(425, 85, 700, 365),
    ),
    4: dict(
        arch=(350, 1120, 728, 1565),  # inner opening
        raysOrigin=(540, 1060),
    ),
    5: dict(
        spout=(538, 1306),
        tiers=[dict(y=1384, x0=499, x1=577), dict(y=1437, x0=453, x1=619)],
        basin=dict(cx=538, cy=1544, rx=214, ry=16),
        pool=dict(cx=538, cy=1540, rx=120, ry=9),
        floor=dict(cx=538, cy=1650, rx=230, ry=34),
    ),
    6: dict(
        floor=(0, 1680, 1080, 1920),
        lace=(760, 1520, 965, 1725),
    ),
}

# Motion regions. type: ell (cx,cy,rx,ry) | poly [(x,y)...] | rect (x0,y0,x1,y1)
# anchor: point where the cluster attaches (motion fades to 0 there), reach: px to full motion
# v: strength 0..1, test: apply colour/detail test
MOTION = {
    1: dict(
        R=[
            dict(ell=(150, 150, 260, 300), anchor=(0, 0), reach=260, v=1.0),
            dict(ell=(930, 150, 260, 300), anchor=(1080, 0), reach=260, v=1.0),
            dict(ell=(60, 330, 80, 120), anchor=(40, 200), reach=160, v=0.8),
            dict(ell=(1000, 280, 90, 120), anchor=(1040, 150), reach=160, v=0.8),
            dict(ell=(35, 830, 85, 240), anchor=(0, 760), reach=220, v=0.8),
            dict(ell=(1045, 850, 85, 240), anchor=(1080, 760), reach=220, v=0.8),
            dict(ell=(100, 1770, 230, 250), anchor=(0, 1920), reach=280, v=0.9),
            dict(ell=(980, 1750, 230, 280), anchor=(1080, 1920), reach=280, v=0.9),
            # pearl strings (gentle swing from their ends)
            dict(ell=(170, 855, 130, 55), anchor=(60, 790), reach=200, v=0.55),
            dict(ell=(910, 855, 130, 55), anchor=(1020, 790), reach=200, v=0.55),
        ],
        B=[dict(rect=(0, 0, 1080, 1835), vy=True, v=1.0, test=False)],
    ),
    2: dict(
        R=[
            dict(ell=(130, 90, 270, 230), anchor=(0, 0), reach=240, v=1.0),
            dict(ell=(560, 20, 560, 80), anchor=(560, -80), reach=140, v=0.7),
            dict(ell=(980, 180, 180, 340), anchor=(1080, 0), reach=260, v=1.0),
            dict(ell=(300, 330, 110, 170), anchor=(280, 200), reach=180, v=0.9),
            dict(ell=(880, 650, 120, 190), anchor=(990, 560), reach=200, v=0.9),
            dict(ell=(120, 620, 110, 220), anchor=(60, 470), reach=220, v=0.7),
            dict(ell=(140, 1110, 230, 220), anchor=(100, 1260), reach=220, v=1.0),
            dict(ell=(960, 1460, 190, 250), anchor=(1080, 1520), reach=240, v=1.0),
            dict(ell=(80, 1790, 160, 200), anchor=(0, 1920), reach=220, v=0.9),
            dict(ell=(300, 1665, 120, 95), anchor=(300, 1740), reach=120, v=0.7),
            dict(ell=(290, 1470, 130, 110), anchor=(300, 1560), reach=150, v=0.5),
        ],
        # never move: lanterns and the chandelier (they flicker / twinkle instead)
        solid=[(60, 1540, 222, 1860), (850, 1600, 1015, 1895), (418, 55, 702, 372)],
        B=[
            dict(poly=[(0, 0), (330, 0), (300, 150), (230, 330), (130, 470), (40, 520), (0, 520)], vy=True, v=1.0, test=False),
            dict(poly=[(0, 450), (90, 470), (70, 800), (60, 1100), (0, 1150)], vy=True, v=0.8, test=False),
            dict(poly=[(1080, 380), (1010, 600), (990, 900), (1000, 1300), (1080, 1420)], vy=True, v=0.9, test=False),
        ],
    ),
    4: dict(
        R=[
            dict(ell=(110, 260, 310, 420), anchor=(-40, 120), reach=300, v=1.0),
            dict(ell=(960, 330, 260, 480), anchor=(1120, 120), reach=300, v=1.0),
            dict(ell=(540, 1150, 330, 210), anchor=(540, 1360), reach=260, v=0.45),
            dict(ell=(260, 1350, 90, 260), anchor=(300, 1560), reach=260, v=0.4),
            dict(ell=(820, 1350, 90, 260), anchor=(780, 1560), reach=260, v=0.4),
            dict(ell=(125, 1150, 120, 90), anchor=(125, 1230), reach=110, v=0.8),
            dict(ell=(955, 1150, 120, 90), anchor=(955, 1230), reach=110, v=0.8),
            dict(ell=(120, 1660, 230, 300), anchor=(0, 1920), reach=300, v=0.9),
            dict(ell=(960, 1660, 230, 300), anchor=(1080, 1920), reach=300, v=0.9),
        ],
        B=[dict(ell=(540, 120, 520, 230), v=0.28, test=False)],
    ),
    5: dict(
        R=[
            dict(ell=(110, 330, 260, 480), anchor=(-40, 80), reach=320, v=1.0),
            dict(ell=(970, 330, 260, 480), anchor=(1120, 80), reach=320, v=1.0),
            dict(ell=(60, 1080, 150, 190), anchor=(0, 1180), reach=170, v=0.85),
            dict(ell=(1020, 1080, 150, 190), anchor=(1080, 1180), reach=170, v=0.85),
            dict(ell=(70, 1700, 170, 260), anchor=(0, 1920), reach=260, v=0.9),
            dict(ell=(1010, 1700, 170, 260), anchor=(1080, 1920), reach=260, v=0.9),
            dict(ell=(385, 1565, 85, 60), anchor=(385, 1610), reach=80, v=0.6),
            dict(ell=(690, 1565, 85, 60), anchor=(690, 1610), reach=80, v=0.6),
            dict(ell=(160, 1525, 80, 60), anchor=(160, 1580), reach=80, v=0.6),
            dict(ell=(910, 1525, 80, 60), anchor=(910, 1580), reach=80, v=0.6),
            dict(ell=(222, 1455, 32, 110), anchor=(222, 1560), reach=200, v=0.35),
            dict(ell=(858, 1445, 32, 110), anchor=(858, 1550), reach=200, v=0.35),
        ],
        G=[
            dict(ell=(538, 1318, 9, 20), v=1.0, test=False),
            dict(poly=[(492, 1384), (522, 1384), (522, 1436), (500, 1436)], v=1.0, test=False),
            dict(poly=[(554, 1384), (586, 1384), (578, 1436), (554, 1436)], v=1.0, test=False),
            dict(poly=[(440, 1436), (482, 1436), (470, 1540), (438, 1540)], v=1.0, test=False),
            dict(poly=[(596, 1436), (636, 1436), (640, 1540), (606, 1540)], v=1.0, test=False),
            dict(ell=(538, 1541, 190, 11), v=1.0, test=False),
        ],
    ),
    6: dict(
        R=[
            dict(ell=(110, 330, 260, 480), anchor=(-40, 80), reach=320, v=1.0),
            dict(ell=(970, 330, 260, 480), anchor=(1120, 80), reach=320, v=1.0),
            dict(ell=(50, 1050, 110, 220), anchor=(0, 1100), reach=200, v=0.8),
            dict(ell=(1030, 1050, 110, 220), anchor=(1080, 1100), reach=200, v=0.8),
            dict(ell=(120, 1430, 120, 110), anchor=(115, 1520), reach=130, v=0.9),
            dict(ell=(955, 1430, 110, 110), anchor=(960, 1520), reach=130, v=0.9),
            dict(ell=(680, 1590, 110, 80), anchor=(680, 1660), reach=100, v=0.7),
            dict(ell=(170, 1600, 80, 60), anchor=(170, 1650), reach=80, v=0.5),
        ],
        B=[dict(poly=[(830, 1560), (900, 1560), (960, 1640), (970, 1720), (740, 1725), (800, 1660)], vy=True, v=1.0, test=False)],
    ),
}


# ---------------------------------------------------------------------------
def load(name: str) -> np.ndarray:
    return np.array(Image.open(ORIG / name).convert("RGB"))


def save_webp(arr: np.ndarray, path: Path, quality=88, lossless=False):
    im = Image.fromarray(arr)
    if lossless:
        im.save(path, "WEBP", lossless=True, quality=80, method=4, exact=False)
    else:
        im.save(path, "WEBP", quality=quality, method=6)


def lum(a: np.ndarray) -> np.ndarray:
    a = a.astype(np.float32)
    return 0.299 * a[..., 0] + 0.587 * a[..., 1] + 0.114 * a[..., 2]


def pct(v, total):
    return round(100.0 * v / total, 4)


# ---------------------------------------------------------------------------
# A. Text detection + clean plate
# ---------------------------------------------------------------------------
def detect_block(img: np.ndarray, blk: dict):
    """Return (candidate mask full-size bool, text colour RGB) for one block."""
    x0, y0, x1, y1 = blk["box"]
    pad = 60
    X0, Y0, X1, Y1 = max(0, x0 - pad), max(0, y0 - pad), min(W, x1 + pad), min(H, y1 + pad)
    reg = img[Y0:Y1, X0:X1]
    k = blk.get("k", 31)
    bg = cv2.medianBlur(reg, k).astype(np.float32)
    o = reg.astype(np.float32)
    dl = lum(bg) - lum(o)  # >0 where darker than local background
    inside = np.zeros(dl.shape, bool)
    inside[y0 - Y0 : y1 - Y0, x0 - X0 : x1 - X0] = True
    for (ex0, ey0, ex1, ey1) in blk.get("exclude", []):
        inside[max(0, ey0 - Y0) : max(0, ey1 - Y0), max(0, ex0 - X0) : max(0, ex1 - X0)] = False

    core = inside & (dl > max(30.0, np.percentile(dl[inside], 97) * 0.6))
    T = np.median(o[core], axis=0) if core.sum() > 20 else o[inside][np.argmin(lum(o[inside]))]

    v = o - bg
    t = T[None, None, :] - bg
    cos = (v * t).sum(-1) / (np.linalg.norm(v, axis=-1) * np.linalg.norm(t, axis=-1) + 1e-3)
    thr = blk.get("thr", 16.0)
    cand = inside & (dl > thr) & (cos > blk.get("cos", 0.82))
    # chroma test: luminance removed, the ink must shift colour the same way the text colour does.
    # (rejects olive leaves next to navy / brown script, which pass the plain darkness test)
    def chroma(a):
        return a - lum(a)[..., None]
    ct = chroma(T[None, None, :]) - chroma(bg)
    cv_ = chroma(o) - chroma(bg)
    nt = np.linalg.norm(ct, axis=-1)
    nv = np.linalg.norm(cv_, axis=-1)
    ccos = (ct * cv_).sum(-1) / (nt * nv + 1e-3)
    chroma_bad = (nt > 12) & (nv > 7) & (ccos < blk.get("ccos", 0.45))
    cand &= ~chroma_bad
    cand = cand.astype(np.uint8)
    # fill holes inside thick strokes (median may have eaten stroke cores)
    closed = cv2.morphologyEx(cand, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
    cnts, _ = cv2.findContours(closed, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_NONE)
    filled = closed.copy()
    cv2.drawContours(filled, cnts, -1, 1, thickness=cv2.FILLED)
    # only accept filled holes that are text-coloured-ish or small
    holes = (filled > 0) & (closed == 0)
    hole_ok = holes & ((dl > 6) | (cv2.erode(filled, np.ones((7, 7), np.uint8)) > 0))
    cand = (closed > 0) | hole_ok
    # remove specks
    n, lab, stats, _ = cv2.connectedComponentsWithStats(cand.astype(np.uint8), 8)
    keep = np.zeros_like(cand)
    for i in range(1, n):
        if stats[i, cv2.CC_STAT_AREA] >= blk.get("minarea", 6):
            keep |= lab == i
    full = np.zeros((H, W), bool)
    full[Y0:Y1, X0:X1] = keep & inside
    # "protect": clearly non-ink detail (leaves, petals) the dilation must not inpaint
    prot = np.zeros((H, W), bool)
    prot[Y0:Y1, X0:X1] = chroma_bad & (np.abs(dl) > 10) & ~keep
    return full, T, prot


def clean_text(img: np.ndarray, blocks: list[dict]):
    owner = np.zeros((H, W), np.int32)  # 0 = none, i+1 = block i
    cands, colours = [], []
    for blk in blocks:
        m, T, prot = detect_block(img, blk)
        cands.append(m)
        protect = prot if not cands[:-1] else (protect | prot)
        colours.append(T)
    union = np.zeros((H, W), bool)
    for m in cands:
        union |= m
    # resolve overlaps through connected components
    n, lab, stats, _ = cv2.connectedComponentsWithStats(union.astype(np.uint8), 8)
    for i in range(1, n):
        comp = lab == i
        best, bestc = 0, -1
        for bi, blk in enumerate(blocks):
            x0, y0, x1, y1 = blk["box"]
            c = int(comp[y0:y1, x0:x1].sum())
            if c > bestc:
                best, bestc = bi, c
        owner[comp] = best + 1
    dil = blocks and max(b.get("dilate", 3) for b in blocks)
    inpaint_mask = cv2.dilate(union.astype(np.uint8), cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (2 * dil + 1, 2 * dil + 1)))
    # keep neighbouring foliage untouched (but never protect the text itself)
    inpaint_mask[protect & ~union] = 0
    bgr = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)
    clean = cv2.inpaint(bgr, inpaint_mask * 255, 6, cv2.INPAINT_TELEA)
    clean = cv2.cvtColor(clean, cv2.COLOR_BGR2RGB)
    # second pass: inpaint again from the first result to soften Telea streaks on big strokes
    big = cv2.erode(inpaint_mask, np.ones((5, 5), np.uint8))
    if big.any():
        soft = cv2.GaussianBlur(clean, (0, 0), 2.0)
        bm = cv2.GaussianBlur(big.astype(np.float32), (0, 0), 1.5)[..., None]
        clean = (clean * (1 - bm) + soft * bm).astype(np.uint8)
        clean[inpaint_mask == 0] = img[inpaint_mask == 0]
    # ownership for every inpainted pixel (nearest text component)
    src = np.where(union, 0, 255).astype(np.uint8)
    _, labels = cv2.distanceTransformWithLabels(src, cv2.DIST_L2, 5, labelType=cv2.DIST_LABEL_PIXEL)
    # map label -> owner of that seed pixel
    seed_owner = np.zeros(labels.max() + 1, np.int32)
    ys, xs = np.nonzero(union)
    seed_owner[labels[ys, xs]] = owner[ys, xs]
    region_owner = np.where(inpaint_mask > 0, seed_owner[labels], 0)
    return clean, region_owner, colours, inpaint_mask


# ---------------------------------------------------------------------------
# B. Sprites by un-mixing against the clean plate
# ---------------------------------------------------------------------------
def unmix(orig: np.ndarray, clean: np.ndarray, region: np.ndarray, T: np.ndarray, dead=2.5):
    O = orig.astype(np.float32)
    C = clean.astype(np.float32)
    D = O - C
    t = T[None, None, :] - C
    a_proj = (D * t).sum(-1) / ((t * t).sum(-1) + 1e-3)
    a_proj = np.clip(a_proj, 0, 1)
    pos = np.where(D > 0, D / np.maximum(255.0 - C, 1.0), 0)
    neg = np.where(D < 0, -D / np.maximum(C, 1.0), 0)
    a_min = np.maximum(pos, neg).max(-1)
    # smooth ramp instead of a hard threshold: tiny differences fade out
    mag = np.abs(D).max(-1)
    ramp = np.clip((mag - dead) / 4.0, 0, 1)
    a = np.maximum(a_proj * ramp, a_min * (mag > dead))
    a = np.clip(a, 0, 1) * region
    col = np.where(a[..., None] > 1e-4, C + D / np.maximum(a[..., None], 1e-4), C)
    col = np.clip(col, 0, 255)
    return a, col


def export_sprites(pnum, orig, clean, region_owner, colours, blocks):
    out = []
    comp = clean.astype(np.float32).copy()
    for bi, blk in enumerate(blocks):
        region = (region_owner == bi + 1).astype(np.float32)
        if region.sum() == 0:
            print(f"  ! page {pnum} block {blk['id']} empty")
            continue
        a, col = unmix(orig, clean, region, colours[bi])
        ys, xs = np.nonzero(a > 0)
        x0, x1 = max(0, xs.min() - 2), min(W, xs.max() + 3)
        y0, y1 = max(0, ys.min() - 2), min(H, ys.max() + 3)
        rgba = np.dstack([np.round(col[y0:y1, x0:x1]), np.round(a[y0:y1, x0:x1] * 255)]).astype(np.uint8)
        name = f"page{pnum}_{blk['id']}.webp"
        save_webp(rgba, GEN / name, lossless=True)
        # composite using the *decoded* file to prove the round trip
        dec = np.array(Image.open(GEN / name).convert("RGBA")).astype(np.float32)
        al = dec[..., 3:4] / 255.0
        comp[y0:y1, x0:x1] = dec[..., :3] * al + comp[y0:y1, x0:x1] * (1 - al)
        entry = dict(
            id=blk["id"],
            src=name,
            x=pct(x0, W), y=pct(y0, H), w=pct(x1 - x0, W), h=pct(y1 - y0, H),
            reveal=blk["reveal"],
        )
        if blk.get("shimmer"):
            entry["shimmer"] = True
        if blk.get("faint"):
            entry["faint"] = True
        if blk["reveal"] == "spacing":
            entry["glyphs"] = glyph_slices(rgba[..., 3])
        out.append(entry)
    return out, comp


def glyph_slices(alpha: np.ndarray):
    """Split a single-line sprite into glyph columns -> list of [start%, end%]."""
    colsum = (alpha > 24).sum(0)
    on = colsum > 0
    w = len(on)
    slices, s = [], None
    for x in range(w):
        if on[x] and s is None:
            s = x
        if not on[x] and s is not None:
            slices.append([s, x]); s = None
    if s is not None:
        slices.append([s, w])
    # merge slivers (accents / tight kerning) into neighbours
    merged = []
    for a, b in slices:
        if merged and (a - merged[-1][1] <= 1 or b - a < 4):
            merged[-1][1] = b
        else:
            merged.append([a, b])
    # cut points halfway between glyphs so slices tile the sprite
    cuts = [0]
    for i in range(1, len(merged)):
        cuts.append((merged[i - 1][1] + merged[i][0]) // 2)
    cuts.append(w)
    return [[pct(cuts[i], w), pct(cuts[i + 1], w)] for i in range(len(cuts) - 1)]


# ---------------------------------------------------------------------------
# D. Curtain monogram: column-wise vertical interpolation
# ---------------------------------------------------------------------------
def clean_monogram(img: np.ndarray):
    x0, y0, x1, y1 = MONOGRAM_BOX
    reg = img[y0:y1, x0:x1].astype(np.float32)
    R, G, B = reg[..., 0], reg[..., 1], reg[..., 2]
    L = lum(reg)
    bgL = cv2.medianBlur(img[y0 - 40 : y1 + 40, x0 - 40 : x1 + 40], 41)[40:-40, 40:-40]
    bgL = lum(bgL)
    # navy / slate ink: blue >= green (velvet is green-dominant) and darker than surroundings
    ink = ((B - G) > -6) & ((bgL - L) > 10)
    ink |= ((B - G) > 6)
    ink = ink.astype(np.uint8)
    n, lab, st, _ = cv2.connectedComponentsWithStats(ink, 8)
    keep = np.zeros_like(ink)
    for i in range(1, n):
        if st[i, cv2.CC_STAT_AREA] >= 12:
            keep[lab == i] = 1
    mask = cv2.dilate(keep, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (7, 7)))  # ~3px
    # swallow the hairline knock-out gaps where the U crosses the M (they are mixed, greyish pixels)
    mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (13, 13)))
    full = np.zeros((H, W), np.uint8)
    full[y0:y1, x0:x1] = mask

    clean = img.copy().astype(np.float32)
    for x in range(x0, x1):
        col = full[:, x]
        y = y0 - 1
        while y < y1 + 1:
            if col[y]:
                ya = y
                while y < H and col[y]:
                    y += 1
                yb = y  # first clean pixel below
                top = np.median(img[max(0, ya - 7) : ya - 1, x].astype(np.float32), axis=0)
                bot = np.median(img[yb + 1 : min(H, yb + 7), x].astype(np.float32), axis=0)
                n_ = yb - ya
                tt = (np.arange(n_, dtype=np.float32) + 1) / (n_ + 1)
                clean[ya:yb, x] = top[None] * (1 - tt[:, None]) + bot[None] * tt[:, None]
            y += 1
    clean = clean.astype(np.uint8)
    # restore a touch of velvet grain lost by interpolation (vertical-streak noise, seeded)
    rng = np.random.default_rng(7)
    grain = (rng.normal(0, 1.6, (1, W)) + rng.normal(0, 0.9, (H, W))).astype(np.float32)
    grain = cv2.GaussianBlur(grain, (1, 9), 0)[..., None]  # vertical streaks, like velvet pile
    m3 = cv2.GaussianBlur(full.astype(np.float32), (0, 0), 1.0)[..., None]
    clean = np.clip(clean.astype(np.float32) + grain * m3, 0, 255).astype(np.uint8)
    clean[full == 0] = img[full == 0]
    ink_px = img[y0:y1, x0:x1][keep > 0].astype(np.float32)
    T = np.percentile(ink_px, 10, axis=0)
    return clean, full, T


# ---------------------------------------------------------------------------
# E. Motion masks
# ---------------------------------------------------------------------------
_GRID = None


def region_field(r: dict):
    global _GRID
    if _GRID is None:
        _GRID = np.mgrid[0:H, 0:W].astype(np.float32)
    yy, xx = _GRID
    f = np.zeros((H, W), np.float32)
    if "ell" in r:
        cx, cy, rx, ry = r["ell"]
        d = np.sqrt(((xx - cx) / rx) ** 2 + ((yy - cy) / ry) ** 2)
        f = np.clip((1.0 - d) / 0.35, 0, 1)
        f = f * f * (3 - 2 * f)
    elif "poly" in r:
        m = np.zeros((H, W), np.uint8)
        cv2.fillPoly(m, [np.array(r["poly"], np.int32)], 1)
        f = m.astype(np.float32)
    elif "rect" in r:
        x0, y0, x1, y1 = r["rect"]
        f[y0:y1, x0:x1] = 1
    if "anchor" in r:
        ax, ay = r["anchor"]
        d = np.sqrt((xx - ax) ** 2 + (yy - ay) ** 2) / r.get("reach", 200)
        f *= np.clip(d, 0, 1) ** 0.9
    if r.get("vy"):  # fabric: hangs from the top, moves more lower down
        f *= 0.35 + 0.65 * (yy / H)
    return f * r.get("v", 1.0)


def detail_test(img: np.ndarray):
    f = img.astype(np.float32)
    L = lum(f)
    mu = cv2.blur(L, (9, 9))
    sd = np.sqrt(np.maximum(cv2.blur(L * L, (9, 9)) - mu * mu, 0))
    hsv = cv2.cvtColor(img, cv2.COLOR_RGB2HSV).astype(np.float32)
    sat = hsv[..., 1] / 255.0
    t = np.maximum(np.clip(sd / 9.0, 0, 1), np.clip((sat - 0.16) * 4, 0, 1))
    return cv2.GaussianBlur(t, (0, 0), 3)


def build_motion(pnum: int, img: np.ndarray, text_boxes: list[tuple]):
    spec = MOTION.get(pnum, {})
    test = detail_test(img)
    chans = []
    for ch in "RGB":
        acc = np.zeros((H, W), np.float32)
        for r in spec.get(ch, []):
            f = region_field(r)
            if r.get("test", True):
                f *= test
            acc = np.maximum(acc, f)
        acc = cv2.GaussianBlur(acc, (0, 0), 9 if ch != "B" else 14)
        chans.append(acc)
    # keep every channel away from text (and solid objects): hard zero in boxes, feathered outside
    ex = np.zeros((H, W), np.float32)
    text_boxes = list(text_boxes) + list(spec.get("solid", []))
    for (x0, y0, x1, y1) in text_boxes:
        ex[max(0, y0 - 14) : y1 + 14, max(0, x0 - 14) : x1 + 14] = 1
    ex = np.maximum(ex, cv2.GaussianBlur(ex, (0, 0), 10))
    hard = np.zeros((H, W), bool)
    for (x0, y0, x1, y1) in text_boxes:
        hard[max(0, y0 - 6) : y1 + 6, max(0, x0 - 6) : x1 + 6] = True
    out = []
    for c in chans:
        c = c * (1 - ex)
        c[hard] = 0
        out.append(np.clip(c, 0, 1))
    rgb = (np.dstack(out) * 255).astype(np.uint8)
    full = rgb
    small = cv2.resize(rgb, (360, 640), interpolation=cv2.INTER_AREA)
    Image.fromarray(small).save(GEN / f"page{pnum}_motion.png", optimize=True)
    # debug overlay
    ov = (img.astype(np.float32) * 0.45 + full.astype(np.float32) * 0.55).astype(np.uint8)
    for (x0, y0, x1, y1) in text_boxes:
        cv2.rectangle(ov, (x0, y0), (x1, y1), (255, 255, 255), 2)
    Image.fromarray(ov).resize((540, 960)).save(DEBUG / f"page{pnum}_motion_overlay.jpg", quality=85)
    return full


# ---------------------------------------------------------------------------
def responsive(pnum: int, img: np.ndarray, clean: np.ndarray | None):
    for w in (1080, 720):
        h = round(w * 16 / 9)
        save_webp(cv2.resize(img, (w, h), interpolation=cv2.INTER_AREA), GEN / f"page{pnum}_{w}.webp", quality=86)
        if clean is not None:
            save_webp(cv2.resize(clean, (w, h), interpolation=cv2.INTER_AREA), GEN / f"page{pnum}_clean_{w}.webp", quality=88)
    if clean is not None:
        save_webp(clean, GEN / f"page{pnum}_clean.webp", quality=88)
    blur_bg(img, GEN / f"page{pnum}_blur.webp")


def blur_bg(img: np.ndarray, path: Path, darken=0.78):
    h, w = img.shape[:2]
    small = cv2.resize(img, (max(8, w // 10), max(8, h // 10)), interpolation=cv2.INTER_AREA)
    small = cv2.GaussianBlur(small, (0, 0), 4)
    small = np.clip(small.astype(np.float32) * darken, 0, 255).astype(np.uint8)
    save_webp(small, path, quality=70)


def diff_proof(pnum: int, orig: np.ndarray, comp: np.ndarray):
    d = np.abs(orig.astype(np.float32) - comp.astype(np.float32))
    mx, p999, mean = float(d.max()), float(np.percentile(d.max(-1), 99.9)), float(d.mean())
    vis = np.clip(d.max(-1) * 10, 0, 255).astype(np.uint8)
    Image.fromarray(vis).resize((540, 960)).save(DEBUG / f"page{pnum}_diff_x10.png")
    print(f"  page {pnum}: clean+sprites vs original  max={mx:.1f}  p99.9={p999:.2f}  mean={mean:.4f} (0-255)")
    return dict(max=mx, p999=p999, mean=mean)


def debug_masks(pnum, img, mask):
    ov = img.copy()
    ov[mask > 0] = (255, 0, 80)
    Image.fromarray(ov).save(DEBUG / f"page{pnum}_textmask.jpg", quality=88)


# ---------------------------------------------------------------------------
# Page 3: scratch card oval
# ---------------------------------------------------------------------------
def measure_oval(img: np.ndarray):
    x0, y0, x1, y1 = 600, 280, 1070, 790
    hsv = cv2.cvtColor(img, cv2.COLOR_RGB2HSV).astype(np.float32)
    # cast rays from the oval's centre to the first gold-rim pixel (skip the top/bottom ornaments)
    cx, cy = 835.0, 521.0
    pts = []
    for deg in np.arange(0, 360, 2.0):
        th = np.radians(deg)
        off_vertical = abs(np.degrees(np.arctan2(abs(np.cos(th)), abs(np.sin(th)))))
        if off_vertical < 30:
            continue
        for r in range(120, 260):
            x = int(round(cx + r * np.cos(th)))
            y = int(round(cy + r * np.sin(th)))
            h_, s_, v_ = hsv[y, x]
            if 8 <= h_ <= 35 and s_ > 95 and v_ > 120:
                pts.append((x, y))
                break
    pts = np.array(pts, np.float32)
    (ex, ey), (ew, eh), ang = cv2.fitEllipse(pts)
    # express as axis-aligned radii
    a, b = ew / 2, eh / 2
    th = np.radians(ang)
    rx = float(np.hypot(a * np.cos(th), b * np.sin(th)))
    ry = float(np.hypot(a * np.sin(th), b * np.cos(th)))
    # date text pixels (navy) for margin check
    full = img.astype(np.float32)
    R_, G_, B_ = full[..., 0], full[..., 1], full[..., 2]
    navy = (lum(full) < 120) & (B_ > R_ + 25)
    ys, xs = np.nonzero(navy[y0:y1, x0:x1])
    ys = ys + y0; xs = xs + x0
    rr = np.sqrt(((xs - ex) / rx) ** 2 + ((ys - ey) / ry) ** 2)
    sel = rr < 1.0
    date_box = (int(xs[sel].min()), int(ys[sel].min()), int(xs[sel].max()), int(ys[sel].max()))
    print(f"  page 3 oval: c=({ex:.1f},{ey:.1f}) r=({rx:.1f},{ry:.1f}) angle={ang:.1f}; date text max radius={rr[sel].max():.3f}; date box={date_box}")
    # debug
    ov = img.copy()
    cv2.ellipse(ov, (int(ex), int(ey)), (int(rx), int(ry)), 0, 0, 360, (255, 0, 80), 2)
    cv2.ellipse(ov, (int(ex), int(ey)), (int(rx + 5), int(ry + 5)), 0, 0, 360, (0, 255, 80), 1)
    cv2.rectangle(ov, date_box[:2], date_box[2:], (0, 120, 255), 1)
    Image.fromarray(ov[260:830, 560:1110]).save(DEBUG / "page3_oval.png")
    return ex, ey, rx, ry, date_box, float(rr[sel].max())


# ---------------------------------------------------------------------------
def og_and_icons(p1: np.ndarray, p1_clean: np.ndarray):
    # 1200x630: blurred curtain backdrop + centred curtain crop + monogram
    bg = cv2.resize(p1_clean, (1200, 2133))[700:1330]
    bg = cv2.GaussianBlur(bg, (0, 0), 18)
    bg = np.clip(bg.astype(np.float32) * 0.92, 0, 255).astype(np.uint8)
    crop = p1[560:1330]  # 1080x770 band around the monogram
    crop = cv2.resize(crop, (round(1080 * 630 / 770), 630), interpolation=cv2.INTER_AREA)
    cw = crop.shape[1]
    x = (1200 - cw) // 2
    canvas = bg.copy()
    # feathered horizontal blend of the crop
    fade = np.ones(cw, np.float32)
    ramp = 90
    fade[:ramp] = np.linspace(0, 1, ramp)
    fade[-ramp:] = np.linspace(1, 0, ramp)
    canvas[:, x : x + cw] = (crop * fade[None, :, None] + canvas[:, x : x + cw] * (1 - fade[None, :, None])).astype(np.uint8)
    Image.fromarray(canvas).save(GEN / "og-image.jpg", quality=86, optimize=True, progressive=True)

    mono = Image.open(GEN / "page1_monogram.webp").convert("RGBA")
    for size, name in ((64, "favicon-64.png"), (180, "apple-touch-icon.png"), (32, "favicon-32.png")):
        bgc = Image.new("RGBA", (size, size), (247, 237, 220, 255))
        m = mono.copy()
        m.thumbnail((int(size * 0.82), int(size * 0.82)), Image.LANCZOS)
        bgc.alpha_composite(m, ((size - m.width) // 2, (size - m.height) // 2))
        bgc.save(GEN / name)


# ---------------------------------------------------------------------------
def main():
    GEN.mkdir(parents=True, exist_ok=True)
    MASTERS.mkdir(exist_ok=True)
    DEBUG.mkdir(exist_ok=True)
    layout = dict(
        _note="All x/y/w/h values are % of the page image. Generated by tools/prepare_assets.py.",
        pages={},
    )
    proofs = {}

    # ---------------- page 1
    print("page 1 (curtain)")
    p1 = load(PAGES[1]["file"])
    p1_clean, mono_mask, T = clean_monogram(p1)
    Image.fromarray(p1_clean).save(MASTERS / "page1_clean.png")
    debug_masks(1, p1, mono_mask)
    region = (cv2.dilate(mono_mask, np.ones((3, 3), np.uint8)) > 0).astype(np.float32)
    a, col = unmix(p1, p1_clean, region, T)
    ys, xs = np.nonzero(a > 0)
    bx0, bx1, by0, by1 = xs.min() - 2, xs.max() + 3, ys.min() - 2, ys.max() + 3
    rgba = np.dstack([np.round(col[by0:by1, bx0:bx1]), np.round(a[by0:by1, bx0:bx1] * 255)]).astype(np.uint8)
    save_webp(rgba, GEN / "page1_monogram.webp", lossless=True)
    dec = np.array(Image.open(GEN / "page1_monogram.webp")).astype(np.float32)
    comp = p1_clean.astype(np.float32).copy()
    al = dec[..., 3:4] / 255
    comp[by0:by1, bx0:bx1] = dec[..., :3] * al + comp[by0:by1, bx0:bx1] * (1 - al)
    proofs[1] = diff_proof(1, p1, comp)
    responsive(1, p1, p1_clean)
    build_motion(1, p1, [(bx0, by0, bx1, by1)])
    poi = POI[1]
    layout["pages"]["1"] = dict(
        img=[W, H],
        blocks=[dict(id="monogram", src="page1_monogram.webp", x=pct(bx0, W), y=pct(by0, H), w=pct(bx1 - bx0, W), h=pct(by1 - by0, H), reveal="fade")],
        tassel=dict(x=pct(poi["tassel"]["x"], W), y=0, length=poi["tassel"]["length"] * 100),
        pearls=[[pct(x, W), pct(y, H)] for x, y in poi["pearls"]],
    )

    # ---------------- text pages
    for pnum in (2, 4, 5, 6):
        print(f"page {pnum}")
        img = load(PAGES[pnum]["file"])
        blocks = PAGES[pnum]["blocks"]
        clean, owner, colours, inpaint_mask = clean_text(img, blocks)
        Image.fromarray(clean).save(MASTERS / f"page{pnum}_clean.png")
        debug_masks(pnum, img, inpaint_mask)
        entries, comp = export_sprites(pnum, img, clean, owner, colours, blocks)
        proofs[pnum] = diff_proof(pnum, img, comp)
        responsive(pnum, img, clean)
        tight = []
        for e in entries:
            tight.append((round(e["x"] * W / 100), round(e["y"] * H / 100), round((e["x"] + e["w"]) * W / 100), round((e["y"] + e["h"]) * H / 100)))
        build_motion(pnum, img, tight)
        xs_ = [t[0] for t in tight] + [t[2] for t in tight]
        page = dict(img=[W, H], blocks=entries, textSpan=[pct(min(xs_), W), pct(max(xs_), W)])
        poi = POI.get(pnum, {})
        if pnum == 2:
            page["candles"] = [[pct(x, W), pct(y, H)] for x, y in poi["candles"]]
            page["lanterns"] = [[pct(x, W), pct(y, H)] for x, y in poi["lanterns"]]
            page["lanternGlow"] = [[pct(x, W), pct(y, H), pct(r, W)] for x, y, r in poi["lanternGlow"]]
            x0, y0, x1, y1 = poi["chandelier"]
            page["chandelier"] = [pct(x0, W), pct(y0, H), pct(x1, W), pct(y1, H)]
        if pnum == 4:
            x0, y0, x1, y1 = poi["arch"]
            page["arch"] = [pct(x0, W), pct(y0, H), pct(x1, W), pct(y1, H)]
            page["raysOrigin"] = [pct(poi["raysOrigin"][0], W), pct(poi["raysOrigin"][1], H)]
        if pnum == 5:
            page["fountain"] = dict(
                spout=[pct(poi["spout"][0], W), pct(poi["spout"][1], H)],
                tiers=[dict(y=pct(t["y"], H), x0=pct(t["x0"], W), x1=pct(t["x1"], W)) for t in poi["tiers"]],
                basin={k: (pct(v, W) if k in ("cx", "rx") else pct(v, H)) for k, v in poi["basin"].items()},
                pool={k: (pct(v, W) if k in ("cx", "rx") else pct(v, H)) for k, v in poi["pool"].items()},
                floor={k: (pct(v, W) if k in ("cx", "rx") else pct(v, H)) for k, v in poi["floor"].items()},
            )
        if pnum == 6:
            x0, y0, x1, y1 = poi["floor"]
            page["floor"] = [pct(x0, W), pct(y0, H), pct(x1, W), pct(y1, H)]
            x0, y0, x1, y1 = poi["lace"]
            page["lace"] = [pct(x0, W), pct(y0, H), pct(x1, W), pct(y1, H)]
        layout["pages"][str(pnum)] = page

    # page 1 text span = monogram box
    layout["pages"]["1"]["textSpan"] = [pct(bx0, W), pct(bx1, W)]

    # ---------------- page 3
    print("page 3 (scratch card)")
    p3 = load("3_MUM.PNG")
    h3, w3 = p3.shape[:2]
    Image.fromarray(p3).save(GEN / "page3.webp", "WEBP", quality=94, method=6)
    shutil.copyfile(ORIG / "3_MUM.PNG", GEN / "page3.png")
    blur_bg(p3, GEN / "page3_blur.webp", darken=0.85)
    ex, ey, rx, ry, dbox, maxr = measure_oval(p3)
    foil_rx, foil_ry = rx + 4, ry + 4
    layout["pages"]["3"] = dict(
        img=[w3, h3],
        oval=dict(cx=pct(ex, w3), cy=pct(ey, h3), rx=pct(rx, w3), ry=pct(ry, h3)),
        foil=dict(cx=pct(ex, w3), cy=pct(ey, h3), rx=pct(foil_rx, w3), ry=pct(foil_ry, h3)),
        dateBox=[pct(dbox[0], w3), pct(dbox[1], h3), pct(dbox[2], w3), pct(dbox[3], h3)],
        dateMaxRadius=round(maxr * rx / foil_rx, 4),
        glints=[[pct(835, w3), pct(282, h3)], [pct(600, w3), pct(512, h3)], [pct(1052, w3), pct(512, h3)], [pct(836, w3), pct(778, h3)], [pct(835, w3), pct(205, h3)]],
    )

    og_and_icons(p1, p1_clean)
    layout["proofs"] = proofs
    LAYOUT.parent.mkdir(parents=True, exist_ok=True)
    LAYOUT.write_text(json.dumps(layout, indent=2))
    print("wrote", LAYOUT.relative_to(ROOT))
    total = sum(f.stat().st_size for f in GEN.glob("*") if f.is_file())
    print(f"generated web assets: {total/1e6:.2f} MB")


if __name__ == "__main__":
    main()
