import { describe, expect, it } from "vitest";
import { GLIDE_MAX_SPEED, GLIDE_WINDOW_MS, glideStep, throwVelocity, worthGliding } from "../../module/rules/glide.js";

describe("throwing the chart", () => {
	it("reads the speed off the end of the drag", () => {
		const trail = [{ t: 0, x: 0, y: 0 }, { t: 100, x: 50, y: 0 }, { t: 140, x: 70, y: 10 }, { t: 160, x: 90, y: 20 }];
		const velocity = throwVelocity(trail, 160);
		expect(velocity.x).toBeCloseTo(40 / 60);
		expect(velocity.y).toBeCloseTo(20 / 60);
	});

	it("throws nothing after a pause, or from too short a trail", () => {
		const trail = [{ t: 0, x: 0, y: 0 }, { t: 20, x: 40, y: 0 }];
		expect(throwVelocity(trail, 20 + GLIDE_WINDOW_MS + 1)).toEqual({ x: 0, y: 0 });
		expect(throwVelocity([{ t: 0, x: 0, y: 0 }], 0)).toEqual({ x: 0, y: 0 });
		expect(throwVelocity([], 0)).toEqual({ x: 0, y: 0 });
		expect(throwVelocity([{ t: 5, x: 0, y: 0 }, { t: 5, x: 9, y: 0 }], 5)).toEqual({ x: 0, y: 0 });
	});

	it("takes no throw faster than its limit, in the same direction", () => {
		const velocity = throwVelocity([{ t: 0, x: 0, y: 0 }, { t: 1, x: 300, y: 400 }], 1);
		expect(Math.hypot(velocity.x, velocity.y)).toBeCloseTo(GLIDE_MAX_SPEED);
		expect(velocity.y / velocity.x).toBeCloseTo(4 / 3);
	});

	it("slows to a stop, a short way for a small chart", () => {
		let velocity = { x: GLIDE_MAX_SPEED, y: 0 };
		let travelled = 0;
		let frames = 0;
		while (worthGliding(velocity)) {
			const step = glideStep(velocity, 1000 / 60);
			travelled += step.dx;
			velocity = step.velocity;
			frames++;
		}
		// The hardest throw carries it well under half the relationship map's reach, and settles inside half a second.
		expect(travelled).toBeGreaterThan(100);
		expect(travelled).toBeLessThan(400);
		expect(frames).toBeLessThan(30);
	});

	it("slows by the time passed, not by the frames drawn", () => {
		const once = glideStep({ x: 1, y: 0 }, 1000 / 30).velocity.x;
		const twice = glideStep(glideStep({ x: 1, y: 0 }, 1000 / 60).velocity, 1000 / 60).velocity.x;
		expect(once).toBeCloseTo(twice);
		// A browser away for a long while doesn't jump the chart.
		expect(glideStep({ x: 1, y: 0 }, 5000).dx).toBe(64);
		expect(glideStep({ x: 1, y: 0 }, -5).dx).toBe(0);
	});
});
