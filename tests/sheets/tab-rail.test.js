import { describe, expect, it } from "vitest";
import { anchorBottom, railHangsLeft } from "../../module/sheets/tab-rail.js";

describe("railHangsLeft", () => {
	it("keeps the rail on the right while it fits there", () => {
		expect(railHangsLeft({ left: 100, right: 960 }, 46, 1920)).toBe(false);
	});

	it("moves the rail left when the window is against the right of the screen", () => {
		expect(railHangsLeft({ left: 1060, right: 1920 }, 46, 1920)).toBe(true);
		expect(railHangsLeft({ left: 1040, right: 1900 }, 46, 1920)).toBe(true);
	});

	it("stays right when the left has even less room", () => {
		expect(railHangsLeft({ left: 10, right: 1000 }, 46, 1020)).toBe(false);
	});
});

describe("anchorBottom", () => {
	/** A box drawn at `rect`, laid out `offsetHeight` tall. */
	const box = (rect, offsetHeight, extra = {}) => ({ getBoundingClientRect: () => rect, offsetHeight, ...extra });

	it("measures the header's bottom from the frame's top, less the window's scale", () => {
		const frame = box({ top: 100, height: 500 }, 1000);
		const page = { scrollTop: 0, parentElement: frame };
		const header = box({ bottom: 250, height: 80 }, 80, { parentElement: page });
		expect(anchorBottom(frame, header)).toBe(300);
	});

	it("puts back what the page has been scrolled, as drawn at the page's zoom", () => {
		const frame = box({ top: 100, height: 1000 }, 1000);
		const page = box({ height: 600 }, 500, { scrollTop: 40, parentElement: frame });
		const header = box({ bottom: 250, height: 80 }, 80, { parentElement: page });
		expect(anchorBottom(frame, header)).toBe(198);
	});

	it("waits while the header isn't shown", () => {
		const frame = box({ top: 0, height: 1000 }, 1000);
		expect(anchorBottom(frame, box({ bottom: 0, height: 0 }, 0, { parentElement: frame }))).toBeNull();
	});
});
