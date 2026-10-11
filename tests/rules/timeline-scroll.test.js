import { describe, expect, it } from "vitest";
import {
	SCRUB_MAX, ZOOM_MAX, ZOOM_MIN, anchoredScroll, centredScroll, clampScale, gutterFor, nearestStop, scrollForValue, scrubTicks, stepZoom, tickShares, valueForScroll, wheelNotches
} from "../../module/rules/timeline-scroll.js";

describe("zoom", () => {
	it("keeps the zoom in its range, and nonsense at whole", () => {
		expect(clampScale(10)).toBe(ZOOM_MAX);
		expect(clampScale(0.01)).toBe(ZOOM_MIN);
		expect(clampScale("x")).toBe(1);
	});

	it("counts a wheel's notches, in as positive, a trackpad's as a share of one", () => {
		expect(wheelNotches({ deltaY: -100 })).toBe(1);
		expect(wheelNotches({ deltaY: 30 })).toBeCloseTo(-0.3);
		expect(wheelNotches({ deltaY: 3, deltaMode: 1 })).toBe(-1);
		expect(wheelNotches({ deltaY: 0 })).toBe(0);
	});

	it("steps by its notches, and stops at the ends", () => {
		expect(stepZoom(1, 1)).toBeCloseTo(1.08);
		expect(stepZoom(ZOOM_MAX, 1)).toBe(ZOOM_MAX);
	});

	it("keeps the point under the pointer where it was", () => {
		// The point 300px in, under a pointer 200px across, is 600px in at twice the size: scroll 400.
		expect(anchoredScroll({ scroll: 100, pointer: 200, from: 1, to: 2 })).toBe(400);
	});
});

describe("the room past the edges", () => {
	it("is a share of the box, capped at the screen", () => {
		expect(gutterFor({ width: 800, height: 400 }, { width: 600, height: 1000 }, 0.75)).toEqual({ x: 450, y: 300 });
	});
});

describe("the scrubber", () => {
	it("centres a Season, or lays one longer than the view against its start", () => {
		expect(centredScroll({ scroll: 0, viewStart: 0, viewSize: 100, spanStart: 400, spanSize: 50 })).toBe(375);
		expect(centredScroll({ scroll: 0, viewStart: 0, viewSize: 100, spanStart: 400, spanSize: 500, inset: 10 })).toBe(390);
	});

	it("runs one straight line from the first Season to the last", () => {
		const targets = [100, null, 300, 500];
		expect(scrollForValue(targets, SCRUB_MAX / 2)).toBe(300);
		expect(valueForScroll(targets, 500)).toBe(SCRUB_MAX);
		expect(valueForScroll(targets, 0)).toBe(0);
		expect(tickShares(targets)).toEqual([0, null, 0.5, 1]);
		expect(scrollForValue([null], 0)).toBe(null);
	});

	it("names the Season nearest the thumb, the later of two at one place past halfway", () => {
		expect(nearestStop([0, 100, 100], 900)).toBe(2);
		expect(nearestStop([0, 0, 100], 100)).toBe(0);
		expect(scrubTicks([1, 2, 3])).toEqual([0, 0.5, 1]);
	});
});
