"""
Traces the map legend of the Mythic Bastionland Blank Realm sheet (the twelve
terrains, four Holdings and six Landmarks) into the vector outlines the Blank
Realm skin is drawn from, and writes them to scripts/data/realm-sheet-art.json.
scripts/realm-placeholders.js draws them into every colour set.

The sheet prints each picture as a small scan, about 200 pixels across. Each
is enlarged four times, its ink found again with a clean, smooth edge, then
traced, so the outlines hold up however far a Realm Scene is zoomed. Holdings
and Landmarks also get a paper silhouette, filling the spaces their ink
encloses, so their walls stay paper-coloured on any terrain, and the middle of
those spaces, which is where the picture hangs in its hex.

Needs Python 3 with PyMuPDF, numpy and potracer (pip install pymupdf numpy
potracer). Run from the repository with the sheet's PDF:

    python scripts/realm-sheet-art.py path/to/Mythic_Bastionland_Blank_Realm.pdf
"""
import json
import sys
from collections import deque
from pathlib import Path

import fitz
import numpy as np
import potrace

OUT = Path(__file__).parent / "data" / "realm-sheet-art.json"

SOURCE = "Traced from the map legend of the Mythic Bastionland Blank Realm sheet, by Chris McDowall (Bastionland Press)."

# Each picture is enlarged this many times before it's traced.
SCALE = 4
# How far either side of half-inked an edge fades, when the ink is found again.
EDGE = 0.15

TERRAIN = 12
HOLDINGS = ["castle", "town", "fortress", "tower"]
LANDMARKS = ["dwelling", "sanctum", "monument", "hazard", "curse", "ruin"]

# Where the legend sits on the sheet's first page, as shares of the page. Along
# the bottom run the terrains in d12 order, then the Holdings; the Landmarks
# run down the right-hand half above them.
LEGEND_TOP = 0.83
HOLDINGS_LEFT = 0.68
LANDMARKS_LEFT = 0.5


def legend_pictures(page):
    """Each legend picture's image number, by the name its Realm picture carries."""
    width, height = page.rect.width, page.rect.height
    seen, pictures = set(), []
    for info in page.get_image_info(xrefs=True):
        if info["xref"] in seen:
            continue
        seen.add(info["xref"])
        x0, y0 = info["bbox"][0] / width, info["bbox"][1] / height
        pictures.append((x0, y0, info["xref"]))

    legend = [p for p in pictures if p[1] >= LEGEND_TOP]
    terrain = sorted((p for p in legend if p[0] < HOLDINGS_LEFT), key=lambda p: p[0])
    holdings = sorted((p for p in legend if p[0] >= HOLDINGS_LEFT), key=lambda p: p[0])
    landmarks = sorted((p for p in pictures if p[1] < LEGEND_TOP and p[0] >= LANDMARKS_LEFT), key=lambda p: p[1])
    if (len(terrain), len(holdings), len(landmarks)) != (TERRAIN, len(HOLDINGS), len(LANDMARKS)):
        sys.exit(f"This doesn't look like the Blank Realm sheet: found {len(terrain)} terrains, {len(holdings)} Holdings and {len(landmarks)} Landmarks.")

    names = [f"terrain-{n:02d}" for n in range(1, TERRAIN + 1)] + [f"holding-{s}" for s in HOLDINGS] + [f"landmark-{t}" for t in LANDMARKS]
    return dict(zip(names, [p[2] for p in terrain + holdings + landmarks]))


def coverage(rgb):
    """How much of its ink each pixel carries, from 0 on white paper to 1."""
    inked = (255 - rgb.min(axis=2)) / 255
    strong = rgb[inked >= inked.max() * 0.9]
    # Red ink is never as far from white as black is, so it's measured against its own colour.
    full = (255 - strong.mean(axis=0).min()) / 255
    return np.clip(inked / full, 0, 1)


def stretch(values, axis):
    """Enlarge along one axis by Keys' bicubic interpolation."""
    values = np.moveaxis(values, axis, 0)
    count = values.shape[0]
    position = (np.arange(count * SCALE) + 0.5) / SCALE - 0.5
    start = np.floor(position).astype(int)
    t = position - start
    t2, t3 = t * t, t * t * t
    weights = [-0.5 * t3 + t2 - 0.5 * t, 1.5 * t3 - 2.5 * t2 + 1, -1.5 * t3 + 2 * t2 + 0.5 * t, 0.5 * t3 - 0.5 * t2]
    shape = (-1,) + (1,) * (values.ndim - 1)
    out = sum(weight.reshape(shape) * values[np.clip(start - 1 + tap, 0, count - 1)] for tap, weight in enumerate(weights))
    return np.moveaxis(out, 0, axis)


def box_blur(values, radius, axis):
    values = np.moveaxis(values, axis, 0)
    padded = np.concatenate([np.repeat(values[:1], radius + 1, 0), values, np.repeat(values[-1:], radius, 0)])
    sums = np.cumsum(padded, axis=0)
    return np.moveaxis((sums[2 * radius + 1:] - sums[:-2 * radius - 1]) / (2 * radius + 1), 0, axis)


def enlarged_ink(rgb):
    """The picture's ink, enlarged, as a mask. Twice over, a box blur rounds off the steps its pixels leave."""
    ink = stretch(stretch(coverage(rgb), 1), 0)
    for _ in range(2):
        ink = box_blur(box_blur(ink, SCALE // 2, 1), SCALE // 2, 0)
    return ink > 0.5


def silhouette(ink):
    """The ink and every space it encloses: whatever can't be reached from the picture's edge without crossing ink."""
    height, width = ink.shape
    outside = np.zeros_like(ink)
    queue = deque()
    for y, x in [(y, x) for x in range(width) for y in (0, height - 1)] + [(y, x) for y in range(height) for x in (0, width - 1)]:
        if not ink[y, x] and not outside[y, x]:
            outside[y, x] = True
            queue.append((y, x))
    while queue:
        y, x = queue.popleft()
        for ny, nx in ((y + 1, x), (y - 1, x), (y, x + 1), (y, x - 1)):
            if 0 <= ny < height and 0 <= nx < width and not ink[ny, nx] and not outside[ny, nx]:
                outside[ny, nx] = True
                queue.append((ny, nx))
    solid = ~outside
    # Pulled in a little, so no paper shows past the ink's outer edge.
    for _ in range(SCALE // 2):
        solid[1:, :] &= solid[:-1, :]
        solid[:-1, :] &= solid[1:, :]
        solid[:, 1:] &= solid[:, :-1]
        solid[:, :-1] &= solid[:, 1:]
    return solid


def middle(mask):
    """The middle of what the mask covers, in the picture's own pixels."""
    rows, columns = np.nonzero(mask)
    place = lambda values: round(float(values.min() + values.max() + 1) / (2 * SCALE), 1)
    return [place(columns), place(rows)]


def number(value):
    text = f"{value:.1f}".rstrip("0").rstrip(".")
    if text in ("", "-0"):
        return "0"
    return text.replace("0.", ".", 1) if text.startswith(("0.", "-0.")) else text


def numbers(values):
    text = ""
    for value in values:
        part = number(value)
        text += part if not text or part.startswith("-") else f" {part}"
    return text


def trace(mask, turdsize):
    """An SVG path of the mask's outlines, in the picture's own pixels, with relative commands to keep it short."""
    # potracer traces the pixels that are false.
    curves = potrace.Bitmap(~mask).trace(turdsize=turdsize, turnpolicy=potrace.POTRACE_TURNPOLICY_MINORITY, alphamax=1.0, opticurve=True, opttolerance=0.2)
    place = lambda point: (round(point.x / SCALE, 1), round(point.y / SCALE, 1))
    d = ""
    for curve in curves:
        at = place(curve.start_point)
        d += f"M{numbers(at)}"
        for segment in curve.segments:
            end = place(segment.end_point)
            if segment.is_corner:
                corner = place(segment.c)
                d += f"l{numbers((corner[0] - at[0], corner[1] - at[1], end[0] - corner[0], end[1] - corner[1]))}"
            else:
                c1, c2 = place(segment.c1), place(segment.c2)
                d += f"c{numbers((c1[0] - at[0], c1[1] - at[1], c2[0] - at[0], c2[1] - at[1], end[0] - at[0], end[1] - at[1]))}"
            at = end
        d += "z"
    return d


def main():
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    document = fitz.open(sys.argv[1])
    art = {"$source": SOURCE}
    for name, xref in legend_pictures(document[0]).items():
        picture = fitz.Pixmap(document, xref)
        if picture.colorspace is None or picture.colorspace.n != 3 or picture.alpha:
            picture = fitz.Pixmap(fitz.csRGB, picture)
        rgb = np.frombuffer(picture.samples, np.uint8).reshape(picture.height, picture.width, 3).astype(float)
        ink = enlarged_ink(rgb)
        entry = {"width": picture.width, "height": picture.height, "ink": trace(ink, turdsize=8)}
        if not name.startswith("terrain"):
            solid = silhouette(ink)
            enclosed = solid & ~ink
            # A mark that encloses nothing needs no paper behind it.
            if enclosed.sum() > SCALE ** 2 * 20:
                entry["paper"] = trace(solid, turdsize=40)
                # Holdings and most Landmarks are drawn casting a shadow down and to the
                # right. A shadow is solid ink enclosing nothing, so the spaces the ink
                # does enclose say where the building itself stands, and it is that, not
                # the shadow with it, that belongs in the middle of a hex.
                entry["middle"] = middle(enclosed)
            else:
                entry["middle"] = middle(ink)
        art[name] = entry
        print(f"{name}: {len(entry['ink']) + len(entry.get('paper', ''))} characters")
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(art, indent="\t") + "\n", encoding="utf-8", newline="\n")
    print(f"Wrote {OUT}")


if __name__ == "__main__":
    main()
