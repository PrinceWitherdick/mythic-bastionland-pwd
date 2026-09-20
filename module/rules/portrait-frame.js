/**
 * The part of a Knight's picture their sheet shows, ported from Stonetop's
 * portrait framer. The sheet's portrait box is taller than it is wide, so the
 * frame keeps that shape rather than Stonetop's square.
 *
 * Stored as data on the actor, never cut to a file, so a player may frame
 * their own Knight without upload rights and `actor.img` stays the whole
 * picture for everything else that reads it:
 *
 *     flags[SYSTEM_ID].portraitFrame = { src, rect: [x0, y0, x1, y1] }
 *
 * The rect is in fractions of the picture named by `src`. A frame measured on
 * one picture is never applied to another: change the picture and the sheet
 * goes back to its usual top crop until the new one is framed.
 *
 * Everything here is pure, so it can be tested without Foundry.
 */

/** The sheet portrait's box, width over height (144 by 204 pixels). */
export const PORTRAIT_ASPECT = 144 / 204;

/** The smallest frame, as a share of the stage's shorter side. A drag smaller than this was a click. */
export const MIN_SHARE = 0.08;

/** Below this span the percentages grow absurd. */
const MIN_SPAN = 0.01;

/** Corner grab radius in stage pixels, capped against the box so a small box is mostly middle. */
const GRIP_MAX = 16;

const clamp01 = (n) => (n < 0 ? 0 : n > 1 ? 1 : n);
const round = (n, places) => Math.round(n * 10 ** places) / 10 ** places;

/**
 * `[x0, y0, x1, y1]` clamped into [0, 1] and rounded to 3 places, or null if
 * that leaves no usable rect.
 * @param {unknown} rect
 * @returns {number[]|null}
 */
export function normalizeRect(rect) {
	if (!Array.isArray(rect) || rect.length !== 4) return null;
	const nums = rect.map(Number);
	if (!nums.every(Number.isFinite)) return null;
	const out = nums.map((n) => round(clamp01(n), 3));
	if (out[2] - out[0] < MIN_SPAN || out[3] - out[1] < MIN_SPAN) return null;
	return out;
}

/**
 * The frame as it may be stored, or null.
 * @param {unknown} frame
 * @returns {{src: string, rect: number[]}|null}
 */
export function normalizeFrame(frame) {
	if (!frame || typeof frame !== "object" || Array.isArray(frame)) return null;
	if (typeof frame.src !== "string" || !frame.src.trim()) return null;
	const rect = normalizeRect(frame.rect);
	return rect && { src: frame.src, rect };
}

/** Rect equality, forgiving float noise from the stage round trip. */
export function rectEq(a, b) {
	if (!Array.isArray(a) || !Array.isArray(b) || a.length !== 4 || b.length !== 4) return false;
	return a.every((n, i) => Math.abs(Number(n) - Number(b[i])) < 1e-9);
}

/**
 * Do two paths name the same picture? Query strings are ignored, since cache
 * busters (Tokenizer adds one) shouldn't lose a frame.
 */
export function sameSrc(a, b) {
	const norm = (v) => {
		if (typeof v !== "string" || !v.trim()) return null;
		let s = v.trim().split("#")[0].split("?")[0];
		if (s.startsWith("./")) s = s.slice(2);
		try {
			s = decodeURIComponent(s);
		} catch {
			// A malformed escape: compare it as written.
		}
		return s;
	};
	const x = norm(a);
	return x !== null && x === norm(b);
}

/**
 * The inline style that paints `rect` in a box of the frame's own shape, or ""
 * for an unusable rect. The picture's own size cancels out, so nothing needs
 * measuring when the sheet draws.
 * @param {unknown} rect
 * @returns {string}
 */
export function frameStyle(rect) {
	const r = normalizeRect(rect);
	if (!r) return "";
	const [x0, y0, x1, y1] = r;
	const fw = x1 - x0;
	const fh = y1 - y0;
	const pct = (n) => `${Number(n.toFixed(4))}%`;
	return "position:absolute;object-fit:fill;object-position:0 0;max-width:none;max-height:none;"
		+ `width:${pct(100 / fw)};height:${pct(100 / fh)};left:${pct((-100 * x0) / fw)};top:${pct((-100 * y0) / fh)}`;
}

/**
 * The style to draw a portrait with: framed when the frame was measured on this
 * picture, otherwise "" for the sheet's usual crop.
 * @param {string} img
 * @param {unknown} frame
 * @returns {string}
 */
export function portraitStyle(img, frame) {
	const f = normalizeFrame(frame);
	return f && sameSrc(f.src, img) ? frameStyle(f.rect) : "";
}

/**
 * Where a frame starts: what the sheet shows unframed, the widest box of the
 * portrait's shape, centred across and held to the top.
 * @param {number} pw The picture's width.
 * @param {number} ph Its height.
 * @returns {number[]|null}
 */
export function defaultRect(pw, ph) {
	if (!(pw > 0) || !(ph > 0)) return null;
	const w = Math.min(pw, ph * PORTRAIT_ASPECT);
	const h = w / PORTRAIT_ASPECT;
	const x0 = (pw - w) / 2 / pw;
	return normalizeRect([x0, 0, x0 + w / pw, h / ph]);
}

/**
 * The picture scaled evenly to fit the editor, so a box of the portrait's
 * shape in stage pixels is that shape in the picture too.
 */
export function stageFor(pw, ph, { maxW = 520, maxH = 560, maxUpscale = 4, minSide = 160 } = {}) {
	if (!(pw > 0) || !(ph > 0)) return null;
	const fit = Math.min(maxW / pw, maxH / ph);
	const scale = Math.max(Math.min(fit, maxUpscale), Math.min(fit, minSide / Math.min(pw, ph)));
	return { w: Math.round(pw * scale), h: Math.round(ph * scale) };
}

/**
 * Rect to stage box. The height comes from the width and the shape, which
 * quietly corrects a rect rounding pulled out of true.
 */
export function rectToBox(rect, w, h) {
	const r = normalizeRect(rect);
	if (!r) return null;
	const bw = (r[2] - r[0]) * w;
	return { left: r[0] * w, top: r[1] * h, w: bw, h: bw / PORTRAIT_ASPECT };
}

/** Stage box to rect. */
export function boxToRect(box, w, h) {
	if (!box || !(w > 0) || !(h > 0)) return null;
	return [box.left / w, box.top / h, (box.left + box.w) / w, (box.top + box.h) / h];
}

/** A box of `bw` wide at the given corner, in the portrait's shape. */
const sized = (bw, left, top) => ({ left, top, w: bw, h: bw / PORTRAIT_ASPECT });

/** The widest a box may be on this stage. */
const maxWidth = (w, h) => Math.min(w, h * PORTRAIT_ASPECT);

/** The narrowest. */
const minWidth = (w, h) => Math.min(Math.min(w, h) * MIN_SHARE, maxWidth(w, h));

/**
 * Which gesture a press starts: resize from a corner, move from inside, or
 * draw a new box from outside.
 */
export function hitTestBox(x, y, box) {
	if (!box) return { mode: "draw" };
	const g = Math.min(GRIP_MAX, Math.min(box.w, box.h) * 0.3);
	const corners = [
		["nw", box.left, box.top],
		["ne", box.left + box.w, box.top],
		["sw", box.left, box.top + box.h],
		["se", box.left + box.w, box.top + box.h]
	];
	for (const [corner, cx, cy] of corners) {
		if (Math.abs(x - cx) <= g && Math.abs(y - cy) <= g) return { mode: "resize", corner };
	}
	if (x >= box.left && x <= box.left + box.w && y >= box.top && y <= box.top + box.h) {
		return { mode: "move", dx: x - box.left, dy: y - box.top };
	}
	return { mode: "draw" };
}

/** Slide a box back onto the stage without resizing it. */
export function clampBox(box, w, h) {
	if (!box) return null;
	return {
		...box,
		left: Math.min(Math.max(box.left, 0), w - box.w),
		top: Math.min(Math.max(box.top, 0), h - box.h)
	};
}

/** For each grip: the pinned corner, and which way the box grows from it. */
const ANCHORS = { se: [0, 0, 1, 1], nw: [1, 1, -1, -1], ne: [0, 1, 1, -1], sw: [1, 0, -1, 1] };

/** Resize from a corner, keeping the opposite corner where it is. */
export function resizeBox(corner, box, x, y, w, h) {
	const anchor = ANCHORS[corner];
	if (!anchor || !box) return box;
	const [ax0, ay0, sx, sy] = anchor;
	const ax = box.left + ax0 * box.w;
	const ay = box.top + ay0 * box.h;
	const room = Math.min(sx > 0 ? w - ax : ax, (sy > 0 ? h - ay : ay) * PORTRAIT_ASPECT);
	let bw = Math.max(sx * (x - ax), sy * (y - ay) * PORTRAIT_ASPECT);
	bw = Math.min(Math.max(bw, minWidth(w, h)), room);
	const bh = bw / PORTRAIT_ASPECT;
	return sized(bw, sx > 0 ? ax : ax - bw, sy > 0 ? ay : ay - bh);
}

/** A box drawn from an empty press, turning round when the drag goes up or left. */
export function boxFromDrag(x0, y0, x, y, w, h) {
	const bw = Math.min(Math.max(Math.abs(x - x0), Math.abs(y - y0) * PORTRAIT_ASPECT), maxWidth(w, h));
	const bh = bw / PORTRAIT_ASPECT;
	return clampBox(sized(bw, x < x0 ? x0 - bw : x0, y < y0 ? y0 - bh : y0), w, h);
}

/**
 * Arrow keys move the box, + and - resize it about its middle. Null for any
 * other key, so Tab and Escape still reach the window.
 */
export function nudgeBox(box, key, { shift = false } = {}, w, h) {
	if (!box) return null;
	const step = shift ? 10 : 2;
	const move = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[key];
	if (move) return clampBox({ ...box, left: box.left + move[0], top: box.top + move[1] }, w, h);
	const grow = { "+": step, "=": step, "-": -step, _: -step }[key];
	if (grow === undefined) return null;
	const bw = Math.min(Math.max(box.w + grow, minWidth(w, h)), maxWidth(w, h));
	const bh = bw / PORTRAIT_ASPECT;
	return clampBox(sized(bw, box.left - (bw - box.w) / 2, box.top - (bh - box.h) / 2), w, h);
}
