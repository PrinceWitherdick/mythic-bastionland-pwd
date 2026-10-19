import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = join(import.meta.dirname, "..", "..");
const css = readFileSync(join(root, "styles", "mythic-bastionland.css"), "utf8");

/** The one rule both buttons held against a Realm's map are drawn by. */
const rule = /button\.bastionland-realm-drawing__finish,\s*button\.bastionland-company-button \{([\s\S]*?)\n\}/.exec(css);

describe("the buttons held against a Realm's map", () => {
	it("are Finish under the map and Place the Company over it, drawn alike", () => {
		expect(rule, "the shared rule for both map buttons").not.toBeNull();
		expect(rule[1]).toMatch(/position: fixed;/);
	});

	it("never animate to where the map has gone", () => {
		// Foundry's own `button` rule is `transition: 0.5s`, which is every property,
		// so each left and top set as the canvas pans would be slid to over half a second.
		expect(rule[1]).toMatch(/\n\ttransition: none;/);
	});
});

describe("Place the Company", () => {
	// Its own rule, not the one it shares with Finish, where it follows a comma.
	const own = /(?<!,)\nbutton\.bastionland-company-button \{([\s\S]*?)\n\}/.exec(css);
	const ring = /\nbutton\.bastionland-company-button::after \{([\s\S]*?)\n\}/.exec(css);
	const frames = /@keyframes bastionland-company-call \{([\s\S]*?)\n\}/.exec(css);

	it("is filled in rubric and calls with a ring, so it isn't missed", () => {
		expect(own, "Place the Company's own rule").not.toBeNull();
		expect(own[1]).toMatch(/background: var\(--bastionland-rubric\);/);
		expect(ring, "the ring's rule").not.toBeNull();
		expect(ring[1]).toMatch(/animation: bastionland-company-call /);
	});

	/*
	 * The ring swelled as a box-shadow, which the browser repaints every frame
	 * for as long as the Company is off the map. A layer that only grows and
	 * fades is moved by the compositor instead.
	 */
	it("moves only its ring, by growing and fading it", () => {
		expect(frames, "the ring's keyframes").not.toBeNull();
		const animated = new Set([...frames[1].matchAll(/^\t\t([\w-]+):/gm)].map((match) => match[1]));
		expect([...animated].sort()).toEqual(["opacity", "scale"]);
		expect(own[1]).not.toMatch(/animation/);
	});

	it("holds still for those who ask for less motion", () => {
		expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{\n\tbutton\.bastionland-company-button::after \{\n\t\tcontent: none;/);
	});
});
