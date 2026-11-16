import { beforeAll, describe, expect, it } from "vitest";
import { BLOG_LANDMARKS, BLOG_LANDMARK_TYPES, LANDMARK_VARIANTS, validateRealm } from "../../module/rules/realm.js";
import { hexKey } from "../../module/rules/realm-geometry.js";
import { generateRealm } from "../../module/rules/realm-generator.js";
import { g, seeds } from "./realm-seeds.js";

// Apart from realm-generator.test.js so the two roll their Realms side by side.

describe("generateRealm with the blog's Landmarks", () => {
	const blogSeeds = seeds.slice(0, 12);
	// Rolled as the file's tests start, not as they're gathered, so a filter that skips them skips this too.
	let pairs;
	beforeAll(() => {
		pairs = blogSeeds.map((seed) => ({
			plain: generateRealm({ seed, geometry: g }),
			blog: generateRealm({ seed, geometry: g, blogLandmarks: true })
		}));
	});

	it("rolls the same book Realm as without them, with theirs added after the book's", () => {
		for (const { plain, blog } of pairs) {
			expect({ ...blog, landmarks: blog.landmarks.slice(0, plain.landmarks.length) }).toEqual(plain);
			expect(blog.landmarks.slice(plain.landmarks.length).every((landmark) => BLOG_LANDMARK_TYPES.includes(landmark.type))).toBe(true);
		}
	});

	it("rolls as many of each as the post has, each sort of Grotto, Fountain and Willow once", () => {
		for (const { blog } of pairs) {
			for (const [type, { count }] of Object.entries(BLOG_LANDMARKS)) {
				const placed = blog.landmarks.filter((landmark) => landmark.type === type);
				expect(placed).toHaveLength(count);
				if (LANDMARK_VARIANTS[type]) expect(placed.map((landmark) => landmark.variant).sort()).toEqual([...LANDMARK_VARIANTS[type]].sort());
			}
		}
	});

	it("pairs the two Ponds, hides every one, and leaves the Realm valid with one thing to a hex", () => {
		for (const { blog } of pairs) {
			const ponds = blog.landmarks.filter((landmark) => landmark.type === "pond");
			expect(ponds.map((pond) => pond.pair)).toEqual([1, 1]);
			expect(blog.landmarks.every((landmark) => !landmark.revealed)).toBe(true);
			expect(validateRealm(blog, g)).toEqual([]);
		}
	});

	it("stands its Bridges on the river", () => {
		for (const { blog } of pairs) {
			const river = new Set(blog.rivers.flat().map(hexKey));
			for (const bridge of blog.landmarks.filter((landmark) => landmark.type === "bridge")) expect(river.has(hexKey(bridge.hex))).toBe(true);
		}
	});

	it("rolls the same blog Landmarks from the same seed", () => {
		expect(generateRealm({ seed: "blog", geometry: g, blogLandmarks: true })).toEqual(generateRealm({ seed: "blog", geometry: g, blogLandmarks: true }));
	});

	it("rolls none in a custom Realm set up with no Landmarks", () => {
		const setup = { ignoreRules: true, landmarks: { min: 0, max: 0 } };
		for (const seed of blogSeeds.slice(0, 4)) expect(generateRealm({ seed, setup, blogLandmarks: true }).landmarks).toEqual([]);
	});

	it("rolls fewer on a smaller map, keeping the Ponds in pairs", () => {
		const setup = { ignoreRules: true, cols: 6, rows: 6 };
		for (const seed of blogSeeds.slice(0, 4)) {
			const realm = generateRealm({ seed, setup, blogLandmarks: true });
			const blog = realm.landmarks.filter((landmark) => BLOG_LANDMARK_TYPES.includes(landmark.type));
			const total = Object.values(BLOG_LANDMARKS).reduce((sum, { count }) => sum + count, 0);
			expect(blog.length).toBeGreaterThan(0);
			expect(blog.length).toBeLessThan(total);
			for (const [type, { count }] of Object.entries(BLOG_LANDMARKS)) expect(blog.filter((landmark) => landmark.type === type).length).toBeLessThanOrEqual(count);
			expect(blog.filter((landmark) => landmark.type === "pond").length % 2).toBe(0);
		}
	});

	it("never leaves a Pond alone when the hexes run out", () => {
		// The book's Landmarks crowded in till one or three Wilderness hexes are left for the blog's.
		const crowded = (left) => ({
			ignoreRules: true,
			landmarks: { min: 3, max: 4, types: { dwelling: 23 - left, sanctum: 22, monument: 22, hazard: 22, curse: 22, ruin: 22 } }
		});
		let ponds = 0;
		let short = 0;
		for (const left of [1, 3]) {
			for (const seed of seeds) {
				const plain = generateRealm({ seed, setup: crowded(left) });
				const free = 144 - plain.holdings.length - plain.myths.length - plain.landmarks.length;
				const realm = generateRealm({ seed, setup: crowded(left), blogLandmarks: true });
				const blog = realm.landmarks.filter((landmark) => BLOG_LANDMARK_TYPES.includes(landmark.type));
				// Every hex left is filled, but where a Pond would have stood alone.
				if (free <= 3) short += 1;
				expect(blog.length).toBeLessThanOrEqual(free);
				expect(blog.length).toBeGreaterThanOrEqual(Math.min(free, 1));
				const paired = blog.filter((landmark) => landmark.type === "pond");
				expect(paired.length % 2).toBe(0);
				ponds += paired.length;
				expect(validateRealm(realm, g)).toEqual([]);
			}
		}
		expect(short).toBeGreaterThan(0);
		// Some still find room for both.
		expect(ponds).toBeGreaterThan(0);
		// A hundred and sixty Realms rolled: given time while the whole suite runs at once.
	}, 30000);

	it("rolls none where the Landmarks are left to draw by hand", () => {
		const realm = generateRealm({ seed: "blog", geometry: g, blogLandmarks: true, setup: { roll: { landmarks: false } } });
		expect(realm.landmarks).toEqual([]);
	});
});
