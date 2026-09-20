import { describe, expect, it } from "vitest";
import {
	PORTRAIT_ASPECT,
	boxFromDrag,
	boxToRect,
	defaultRect,
	frameStyle,
	hitTestBox,
	normalizeFrame,
	nudgeBox,
	portraitStyle,
	rectToBox,
	resizeBox,
	sameSrc
} from "../../module/rules/portrait-frame.js";

const close = (a, b) => expect(Math.abs(a - b)).toBeLessThan(1e-6);

describe("defaultRect", () => {
	it("takes the full width of a tall picture, from the top", () => {
		const [x0, y0, x1, y1] = defaultRect(465, 1094);
		expect([x0, y0, x1]).toEqual([0, 0, 1]);
		expect(y1).toBeCloseTo(465 / PORTRAIT_ASPECT / 1094, 3);
	});

	it("takes the full height of a wide picture, centred", () => {
		const [x0, y0, x1, y1] = defaultRect(1000, 400);
		expect([y0, y1]).toEqual([0, 1]);
		expect(x0 + x1).toBeCloseTo(1, 3);
		expect((x1 - x0) * 1000).toBeCloseTo(400 * PORTRAIT_ASPECT, -1);
	});
});

describe("stage boxes", () => {
	it("keep the portrait's shape", () => {
		const box = boxFromDrag(10, 10, 80, 300, 400, 600);
		close(box.w / box.h, PORTRAIT_ASPECT);
		const resized = resizeBox("se", box, 380, 20, 400, 600);
		close(resized.w / resized.h, PORTRAIT_ASPECT);
		expect(resized.left).toBe(box.left);
		expect(resized.top).toBe(box.top);
	});

	it("stay on the stage when resized past its edge", () => {
		const box = rectToBox([0.25, 0.25, 0.5, 0.5], 400, 600);
		const big = resizeBox("se", box, 2000, 2000, 400, 600);
		expect(big.left + big.w).toBeLessThanOrEqual(400 + 1e-9);
		expect(big.top + big.h).toBeLessThanOrEqual(600 + 1e-9);
	});

	it("round-trip through a rect", () => {
		const box = { left: 40, top: 60, w: 144, h: 204 };
		const back = rectToBox(boxToRect(box, 400, 600), 400, 600);
		close(back.left, 40);
		close(back.w, 144);
	});

	it("move, resize or draw by where the press lands", () => {
		const box = { left: 100, top: 100, w: 144, h: 204 };
		expect(hitTestBox(150, 150, box).mode).toBe("move");
		expect(hitTestBox(100, 100, box)).toEqual({ mode: "resize", corner: "nw" });
		expect(hitTestBox(10, 10, box).mode).toBe("draw");
	});

	it("nudge with the arrows and ignore other keys", () => {
		const box = { left: 100, top: 100, w: 144, h: 204 };
		expect(nudgeBox(box, "ArrowLeft", {}, 400, 600).left).toBe(98);
		expect(nudgeBox(box, "ArrowDown", { shift: true }, 400, 600).top).toBe(110);
		expect(nudgeBox(box, "Tab", {}, 400, 600)).toBeNull();
	});
});

describe("frameStyle", () => {
	it("scales and shifts the picture so the rect fills the box", () => {
		expect(frameStyle([0.25, 0.1, 0.75, 0.6])).toContain("width:200%;height:200%;left:-50%;top:-20%");
	});

	it("is empty for a rect with no area", () => {
		expect(frameStyle([0.5, 0.5, 0.5, 0.5])).toBe("");
	});
});

describe("portraitStyle", () => {
	const frame = { src: "knights/a.webp", rect: [0, 0, 1, 0.5] };

	it("frames the picture the frame was measured on, cache busters and all", () => {
		expect(portraitStyle("knights/a.webp?123", frame)).not.toBe("");
	});

	it("leaves a different picture to the usual crop", () => {
		expect(portraitStyle("knights/b.webp", frame)).toBe("");
	});

	it("ignores a malformed frame", () => {
		expect(portraitStyle("knights/a.webp", { img: "knights/a.webp", rect: [0, 0, 1, 1] })).toBe("");
		expect(normalizeFrame(null)).toBeNull();
		expect(sameSrc("./a%20b.webp", "a b.webp")).toBe(true);
	});
});
