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

Given the Realm Sheets as well, it also traces the other pictures of each
terrain that their example Realm is drawn with, into
scripts/data/realm-sheet-variants.json, so that a Realm's hexes needn't all
look alike. Only hexes whose picture sits whole inside them are taken, and
groups of hexes drawn as one picture across their shared edges, each hex's
part running right up to the edges it shares, to be laid together whole.

Needs Python 3 with PyMuPDF, numpy and potracer (pip install pymupdf numpy
potracer). Run from the repository with the sheet's PDF, and the Realm
Sheets' if wanted:

    python scripts/realm-sheet-art.py path/to/Mythic_Bastionland_Blank_Realm.pdf [path/to/Mythic_Bastionland_Realm_Sheets.pdf]
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

TERRAIN = ["marsh", "heath", "crag", "peaks", "forest", "valley", "hills", "meadow", "bog", "lake", "glade", "plains"]
HOLDINGS = ["castle", "town", "fortress", "tower"]
LANDMARKS = ["dwelling", "sanctum", "monument", "hazard", "curse", "ruin"]

# Where the legend sits on the sheet's first page, as shares of the page. Along
# the bottom run the terrains in d12 order, then the Holdings; the Landmarks
# run down the right-hand half above them.
LEGEND_TOP = 0.83
HOLDINGS_LEFT = 0.68
LANDMARKS_LEFT = 0.5

VARIANTS_OUT = Path(__file__).parent / "data" / "realm-sheet-variants.json"

VARIANTS_SOURCE = "Traced from the example Realm on the Mythic Bastionland Realm Sheets, by Chris McDowall (Bastionland Press)."

# The example Realm's hexes, as column,row on its map, whose picture of their
# terrain lies whole inside them: none with a river, a Holding or a lake's
# shore, and none drawn across into the next hex. Each Lake and Valley there
# has a river or spills over, so those keep only the legend's picture.
VARIANTS = {
    "marsh": ["9,8", "10,8", "11,8"],
    "heath": ["6,1", "6,2", "6,3", "7,1", "7,2", "8,1", "8,2", "10,6", "11,6", "11,7"],
    "crag": ["9,11", "10,11", "10,12"],
    "peaks": ["1,4", "1,5", "1,6", "2,4", "2,5", "2,6", "9,1", "10,1", "11,1", "3,7", "6,12", "7,12"],
    "forest": ["1,2", "4,8", "3,9"],
    "hills": ["6,6", "6,7", "9,5", "9,6"],
    "meadow": ["9,3", "9,4", "10,3", "10,4", "10,10", "12,10", "11,11", "12,11"],
    "bog": ["12,8", "8,9", "9,9", "10,9", "11,9", "12,9", "9,10", "11,10"],
    "glade": ["4,1", "4,3", "3,4", "10,5", "11,5", "12,5"],
    "plains": ["6,4", "5,6", "7,5", "8,5", "7,6", "8,6", "6,9", "4,11", "4,12", "9,7"],
}

# Groups of the example Realm's hexes, as column,row, drawn as one picture of
# their terrain across the edges they share, as a forest's trees or a ridge of
# crags run on from hex to hex. None has a river or a Holding.
GROUPS = {
    "marsh": [["9,8", "10,8"], ["10,7", "11,8"]],
    "heath": [["12,6", "12,7"]],
    "crag": [["9,11", "10,11", "11,12", "12,12"]],
    "peaks": [["11,1", "12,1", "11,2", "12,2"], ["1,8", "2,8", "1,9", "2,9", "1,10", "1,11"]],
    "forest": [["1,1", "2,1", "3,1", "2,2", "2,3"], ["1,2", "1,3"], ["4,8", "4,9", "3,9"]],
    "hills": [["7,3", "8,3", "7,4", "8,4", "9,5"], ["4,5", "3,6", "4,6", "5,7"]],
    "meadow": [["10,3", "10,4"]],
    "glade": [["3,2", "3,3"], ["3,4", "4,3", "4,4"], ["12,4", "12,5"]],
}

# The six ways out of a hex in axial steps, clockwise from south-east, as
# module/rules/realm-geometry.js has them.
STEPS = [(1, 0), (0, 1), (-1, 1), (-1, 0), (0, -1), (1, -1)]

# The example map's flat-topped hexes on the players' sheet (the second page,
# which has no red ink), in that page's pixels: the middle of the first hex,
# how far apart columns and rows stand, and a hex's size. Even columns stand
# half a row lower.
MAP_FIRST = (204.5, 191.4)
MAP_STEP = (141, 156.8)
MAP_HEX = (188, 157)
# How far inside its outline a hex is cut out, leaving the printed grid behind.
MAP_INSET = 5
# Ink that reaches a hex's edge and is less than this share of its ink is a
# neighbour's picture poking in, and is left out.
NEIGHBOUR_SHARE = 0.12


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
    if (len(terrain), len(holdings), len(landmarks)) != (len(TERRAIN), len(HOLDINGS), len(LANDMARKS)):
        sys.exit(f"This doesn't look like the Blank Realm sheet: found {len(terrain)} terrains, {len(holdings)} Holdings and {len(landmarks)} Landmarks.")

    names = [f"terrain-{t}" for t in TERRAIN] + [f"holding-{s}" for s in HOLDINGS] + [f"landmark-{t}" for t in LANDMARKS]
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


def enlarged_ink(inked):
    """The picture's ink, from its coverage, enlarged, as a mask. Twice over, a box blur rounds off the steps its pixels leave."""
    ink = stretch(stretch(inked, 1), 0)
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


def rgb_of(document, xref):
    picture = fitz.Pixmap(document, xref)
    if picture.colorspace is None or picture.colorspace.n != 3 or picture.alpha:
        picture = fitz.Pixmap(fitz.csRGB, picture)
    return np.frombuffer(picture.samples, np.uint8).reshape(picture.height, picture.width, 3).astype(float)


def inside_hex(width, height, middle, inset):
    """Which pixels of a box lie inside the flat-topped hex standing in it at `middle`, pulled in by `inset`."""
    ys, xs = np.mgrid[0:height, 0:width] + 0.5
    across, down = np.abs(xs - middle[0]), np.abs(ys - middle[1])
    half_height = MAP_HEX[1] / 2 - inset
    half_width = MAP_HEX[0] / 2 - inset * 2 / np.sqrt(3)
    return (down <= half_height) & (across <= half_width - down * half_width / (2 * half_height))


def neighbours_ink(ink, edge):
    """The pieces of ink that reach the edge but are too small to be the hex's own picture."""
    height, width = ink.shape
    seen = np.zeros_like(ink)
    poking = np.zeros_like(ink)
    total = ink.sum()
    for start in zip(*np.nonzero(ink & edge)):
        if seen[start]:
            continue
        seen[start] = True
        piece, queue = [start], deque([start])
        while queue:
            y, x = queue.popleft()
            for ny in (y - 1, y, y + 1):
                for nx in (x - 1, x, x + 1):
                    if 0 <= ny < height and 0 <= nx < width and ink[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        piece.append((ny, nx))
                        queue.append((ny, nx))
        if len(piece) < total * NEIGHBOUR_SHARE:
            for at in piece:
                poking[at] = True
    return poking


def axial(place):
    """A column,row on the example map as axial steps, even columns standing half a row lower."""
    column, row = map(int, place.split(","))
    return column - 1, row - 1 - (column - 1) // 2


def direction(place, other):
    """The way from one hex to its neighbour, as an index into STEPS, or None when they aren't neighbours."""
    (q, r), (q2, r2) = axial(place), axial(other)
    step = (q2 - q, r2 - r)
    return STEPS.index(step) if step in STEPS else None


def sides(width, height, middle):
    """Which of its six edges each pixel of a hex's box lies toward, by direction: the edge between corners k and k+1."""
    ys, xs = np.mgrid[0:height, 0:width] + 0.5
    angle = np.degrees(np.arctan2(ys - middle[1], xs - middle[0])) % 360
    corner = np.degrees(np.arctan2(MAP_HEX[1] / 2, MAP_HEX[0] / 4))
    return np.digitize(angle, [corner, 180 - corner, 180, 180 + corner, 360 - corner])


def cut_hex(rgb, place, joined=()):
    """A hex's coverage cut out of the map, and where its middle falls in that. Toward the
    edges in `joined` its picture runs on into the next hex, so it is kept right up to them."""
    width, height = MAP_HEX
    column, row = map(int, place.split(","))
    x = MAP_FIRST[0] + MAP_STEP[0] * (column - 1)
    y = MAP_FIRST[1] + MAP_STEP[1] * (row - 1) + (MAP_STEP[1] / 2 if column % 2 == 0 else 0)
    left, top = round(x - width / 2), round(y - height / 2)
    inked = coverage(rgb[top:top + height, left:left + width])
    middle = (x - left, y - top)
    facing = np.isin(sides(width, height, middle), list(joined))
    keep = inside_hex(width, height, middle, MAP_INSET) | (inside_hex(width, height, middle, 0) & facing)
    # The edge is a thin band just inside where the hex is cut.
    edge = keep & ~inside_hex(width, height, middle, MAP_INSET + 3) & ~facing
    inked[~keep | neighbours_ink(keep & (inked > 0.3), edge)] = 0
    return inked, middle


def example_hexes(document):
    """The coverage of each picked hex on the example map, cut out of the map, with the name its picture carries,
    its place, and where its middle falls for those drawn as one with their neighbours."""
    page = document[1]
    images = page.get_images(full=True)
    if len(images) != 1:
        sys.exit("This doesn't look like the Realm Sheets: their second page should be one picture of the map.")
    rgb = rgb_of(document, images[0][0])
    for terrain in TERRAIN:
        for number, place in enumerate(VARIANTS.get(terrain, []), start=2):
            inked, _ = cut_hex(rgb, place)
            yield f"terrain-{terrain}-{number}", place, None, inked
    for terrain in TERRAIN:
        number = 0
        for group in GROUPS.get(terrain, []):
            for place in group:
                number += 1
                joined = [side for side in (direction(place, other) for other in group) if side is not None]
                inked, middle = cut_hex(rgb, place, joined)
                yield f"terrain-{terrain}-joined-{number}", place, middle, inked


def trace_variants(path):
    document = fitz.open(path)
    # A hex's height is how far apart rows stand, and its width across its corners four thirds of how far apart columns do.
    art = {"$source": VARIANTS_SOURCE, "$hexHeight": MAP_STEP[1], "$hexWidth": round(MAP_STEP[0] * 4 / 3, 1)}
    for name, place, middle, inked in example_hexes(document):
        height, width = inked.shape
        # Where it stood, so pictures that stood side by side can be laid side by side again.
        entry = {"place": place, "width": width, "height": height, "ink": trace(enlarged_ink(inked), turdsize=8)}
        if middle is not None:
            # A picture drawn on into its neighbours must meet theirs exactly, so it hangs by its hex's middle.
            entry = {"place": place, "middle": [round(middle[0], 1), round(middle[1], 1)], **entry}
        art[name] = entry
        print(f"{name}: {len(art[name]['ink'])} characters")
    VARIANTS_OUT.write_text(json.dumps(art, indent="\t") + "\n", encoding="utf-8", newline="\n")
    print(f"Wrote {VARIANTS_OUT}")


def main():
    if len(sys.argv) not in (2, 3):
        sys.exit(__doc__)
    document = fitz.open(sys.argv[1])
    art = {"$source": SOURCE}
    for name, xref in legend_pictures(document[0]).items():
        rgb = rgb_of(document, xref)
        ink = enlarged_ink(coverage(rgb))
        entry = {"width": rgb.shape[1], "height": rgb.shape[0], "ink": trace(ink, turdsize=8)}
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
    if len(sys.argv) == 3:
        trace_variants(sys.argv[2])


if __name__ == "__main__":
    main()
