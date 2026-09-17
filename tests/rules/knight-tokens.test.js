import { describe, expect, it } from "vitest";
import { spreads } from "../../module/rules/book-art.js";
import { KNIGHT_FACES, TOKEN_SIDE, portraitTokens, tokenCrop } from "../../module/rules/knight-tokens.js";

describe("KNIGHT_FACES", () => {
	it("places a face inside every Knight's portrait", () => {
		expect(Object.keys(KNIGHT_FACES).sort()).toEqual(spreads().map((spread) => spread.roll));
		for (const [x, y] of Object.values(KNIGHT_FACES)) {
			expect(x).toBeGreaterThanOrEqual(0);
			expect(x).toBeLessThanOrEqual(1);
			expect(y).toBeGreaterThanOrEqual(0);
			expect(y).toBeLessThanOrEqual(1);
		}
	});
});

describe("tokenCrop", () => {
	const portrait = { width: 466, height: 1095 };
	const side = Math.round(portrait.width * TOKEN_SIDE);

	it("centres a square on the Knight's face", () => {
		const [x, y] = KNIGHT_FACES["1-01"];
		const crop = tokenCrop(portrait, "1-01");
		expect(crop.size).toBe(side);
		expect(crop.x + crop.size / 2).toBeCloseTo(x * portrait.width, 0);
		expect(crop.y + crop.size / 2).toBeCloseTo(y * portrait.height, 0);
	});

	it("keeps the square inside the picture when the face is near an edge", () => {
		expect(tokenCrop(portrait, "5-12").x).toBe(0);
		expect(tokenCrop(portrait, "5-08").y).toBe(0);
		expect(tokenCrop(portrait, "3-06").x).toBe(portrait.width - side);
	});

	it("aims near the top of a portrait whose face wasn't measured", () => {
		expect(tokenCrop({ width: 100, height: 300 }, "9-99")).toEqual({ x: 20, y: 60, size: 60 });
	});

	it("fits a picture shorter than the square", () => {
		expect(tokenCrop({ width: 400, height: 100 }, "1-01")).toMatchObject({ y: 0, size: 100 });
	});
});

describe("portraitTokens", () => {
	it("maps each saved portrait to its saved token", () => {
		const knights = [
			{ roll: "1-01", path: "art/knights/1-01.webp", token: "art/knight-tokens/1-01.webp" },
			{ roll: "1-02", path: "art/knights/1-02.webp", token: null },
			{ roll: "1-03", path: null, token: null }
		];
		expect([...portraitTokens(knights)]).toEqual([["art/knights/1-01.webp", "art/knight-tokens/1-01.webp"]]);
		expect(portraitTokens(undefined).size).toBe(0);
	});
});
