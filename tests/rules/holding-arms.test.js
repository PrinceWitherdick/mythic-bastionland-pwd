import { describe, expect, it } from "vitest";
import { ARMS_SHARE, HIDDEN_ALPHA, holdingArmsBadge, holdingArmsMarks, holdingArmsOf } from "../../module/rules/holding-arms.js";
import { ICON_SCALE } from "../../module/rules/realm-documents.js";

/** A Holding's Tile, 80 pixels square, as on a Realm of 100-pixel hexes. */
const tile = (id, more = {}) => ({ id, x: 0, y: 0, width: 80, height: 80, alpha: 1, hidden: false, ...more });

const painted = { src: "arms.webp", fit: "fill" };

describe("holdingArmsOf", () => {
	it("flies a Domain's heraldry as painted, its picture cut to the shield, and nothing unpainted", () => {
		expect(holdingArmsOf({ heraldry: "h.webp", bearer: "Sir A" })).toEqual({ src: "h.webp", fit: "fill" });
		expect(holdingArmsOf({ picture: "p.webp" })).toEqual({ src: "p.webp", fit: "cover" });
		expect(holdingArmsOf({ heraldry: "", bearer: "Sir A" })).toBeNull();
		expect(holdingArmsOf(null)).toBeNull();
	});
});

describe("holdingArmsMarks", () => {
	const armsFor = (id) => (id === "ruled" || id === "hidden" ? painted : null);
	const tiles = [tile("ruled"), tile("free"), tile("hidden", { hidden: true })];

	it("shows arms only on Holdings a Domain with arms rules", () => {
		const marks = holdingArmsMarks({ tiles, armsFor, isGM: false });
		expect(marks.map((mark) => mark.id)).toEqual(["ruled"]);
		expect(marks[0]).toMatchObject({ src: "arms.webp", fit: "fill", alpha: 1 });
	});

	it("shows the Referee a hidden Holding's arms faintly, and the players none", () => {
		const marks = holdingArmsMarks({ tiles, armsFor, isGM: true });
		expect(marks.map((mark) => mark.id)).toEqual(["ruled", "hidden"]);
		expect(marks[1].alpha).toBe(HIDDEN_ALPHA);
	});

	it("fades with its Holding", () => {
		const [mark] = holdingArmsMarks({ tiles: [tile("ruled", { alpha: 0.4 })], armsFor, isGM: false });
		expect(mark.alpha).toBeCloseTo(0.4);
	});
});

describe("holdingArmsBadge", () => {
	it("sits at the icon's top right, clear of a Seat's crown", () => {
		const size = 100;
		const side = size * ICON_SCALE.holding;
		const icon = { x: -side / 2, y: -side / 2, width: side, height: side };
		const badge = holdingArmsBadge(icon);
		expect(badge.height).toBeCloseTo(side * ARMS_SHARE);
		expect(badge.outline.x + badge.width).toBeGreaterThan(icon.x + icon.width);
		// The crown is centred over the hex's middle; the shield starts right of it.
		const crownRight = (size * ICON_SCALE.seat) / 2;
		expect(badge.outline.x).toBeGreaterThan(crownRight);
	});
});
