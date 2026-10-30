import { beforeEach, describe, expect, it, vi } from "vitest";
import { holdingArmsBadge } from "../../module/rules/holding-arms.js";
import { REALM_FLAG } from "../../module/rules/realm.js";
import { SYSTEM_ID } from "../../module/system-id.js";

/** Just enough of a PIXI display object to be drawn into and thrown away. */
class FakeDisplay {
	children = [];
	destroyed = false;
	eventMode = "auto";
	zIndex = 0;
	alpha = 1;
	x = 0;
	y = 0;
	position = { set: (x, y) => { this.x = x; this.y = y; } };
	addChild(child) {
		this.children.push(child);
		child.parent = this;
		return child;
	}
	removeChildren() {
		return this.children.splice(0);
	}
	destroy() {
		this.destroyed = true;
	}
}

class FakeGraphics extends FakeDisplay {
	beginFill() {}
	endFill() {}
	moveTo() {}
	lineTo() {}
	quadraticCurveTo() {}
	bezierCurveTo() {}
	closePath() {}
}

class FakeSprite extends FakeDisplay {
	constructor(texture) {
		super();
		this.texture = texture;
	}
}

/** Each picture's load, held back until a test lets it go. */
let loads;
globalThis.PIXI = { Container: FakeDisplay, Graphics: FakeGraphics, Sprite: FakeSprite };
globalThis.foundry = {
	canvas: {
		loadTexture: (src) => new Promise((resolve) => loads.push({ src, resolve: (texture = { src, width: 10, height: 10 }) => resolve(texture) }))
	}
};

/** What the world holds: which Scene is a Realm, the look it shows, and each Domain's arms. */
let isRealm;
let drawing;
let look;
let domains;

vi.mock("../../module/actions/realm.js", () => ({
	REALM_LOOK_HOOK: "look",
	REALM_PREVIEW_HOOK: "preview",
	// Each Tile's source data, its x and y at its middle, as v14 places a Tile the system draws.
	tileCentreOn: () => ({ id, ...data }) => ({ _id: id, ...data }),
	isRealmScene: () => isRealm,
	isDrawingRealm: () => drawing,
	realmLookShown: () => look
}));
vi.mock("../../module/actions/homecoming.js", () => ({ realmHoldings: () => [] }));
vi.mock("../../module/actions/dominion.js", () => ({ worldDomains: () => domains }));
vi.mock("../../module/actions/domain-arms.js", () => ({ domainArmsView: (domain) => domain.shown, knightChangesArms: () => false }));

const { drawHoldingArms } = await import("../../module/canvas/holding-arms.js");

/** A Realm Tile of a kind, 80 pixels square, placed by its middle: its icon spans 100 to 180 each way. */
const tile = (id, kind, more = {}) => ({ id, x: 140, y: 140, width: 80, height: 80, alpha: 1, hidden: false, flags: { [SYSTEM_ID]: { [REALM_FLAG]: { kind } } }, ...more });

/** A Domain given a Holding of the Scene in view. */
const domain = (holdingId, shown) => ({ name: holdingId, system: { holding: `Scene.s1.Tile.${holdingId}` }, shown });

/** Let every picture still loading finish, and the draws waiting on them. */
async function finishLoads() {
	await Promise.resolve();
	while (loads.length) loads.shift().resolve();
	await new Promise((resolve) => setTimeout(resolve, 0));
}

const layer = () => canvas.interface.children[0];

beforeEach(() => {
	loads = [];
	isRealm = true;
	drawing = false;
	look = { arms: true };
	domains = [domain("castle", { heraldry: "arms.webp", bearer: "Sir A" }), domain("tower", { heraldry: "", bearer: "Sir B" })];
	globalThis.game = { user: { isGM: false } };
	globalThis.canvas = {
		ready: true,
		interface: new FakeDisplay(),
		scene: { id: "s1", tiles: [tile("castle", "holding"), tile("crown", "seat"), tile("tower", "holding"), tile("town", "holding")] }
	};
});

describe("drawHoldingArms", () => {
	it("flies a shield over each Holding a Domain with painted arms rules", async () => {
		const drawn = drawHoldingArms();
		await finishLoads();
		await drawn;
		expect(layer().eventMode).toBe("none");
		expect(layer().children).toHaveLength(1);
		const [shield] = layer().children;
		const sprite = shield.children.find((child) => child instanceof FakeSprite);
		expect(sprite.texture.src).toBe("arms.webp");
		// Its shield is masked to the field.
		expect(sprite.mask).toBeInstanceOf(FakeGraphics);
	});

	it("sets the shield at the icon's top right, though the Tile is placed by its middle", async () => {
		const drawn = drawHoldingArms();
		await finishLoads();
		await drawn;
		const sprite = layer().children[0].children.find((child) => child instanceof FakeSprite);
		const { painting } = holdingArmsBadge({ x: 100, y: 100, width: 80, height: 80 });
		expect([sprite.x, sprite.y, sprite.width, sprite.height]).toEqual([painting.x, painting.y, painting.width, painting.height]);
		// Hanging just past the icon's right edge, not half an icon beyond it.
		expect(sprite.x + sprite.width).toBeLessThan(200);
		expect(sprite.y).toBeLessThan(120);
	});

	it("fades with its Holding, and keeps a hidden one from the players", async () => {
		canvas.scene.tiles[0].alpha = 0.5;
		let drawn = drawHoldingArms();
		await finishLoads();
		await drawn;
		expect(layer().children[0].alpha).toBe(0.5);
		canvas.scene.tiles[0].hidden = true;
		drawn = drawHoldingArms();
		await finishLoads();
		await drawn;
		expect(layer().children).toHaveLength(0);
	});

	it("shows none where the look switches them off, off a Realm, or to players while it's drawn by hand", async () => {
		for (const set of [() => (look = { arms: false }), () => (isRealm = false), () => (drawing = true)]) {
			look = { arms: true };
			[isRealm, drawing] = [true, false];
			set();
			const drawn = drawHoldingArms();
			await finishLoads();
			await drawn;
			expect(layer()?.children ?? []).toHaveLength(0);
		}
	});

	it("draws the shields again rather than on top", async () => {
		for (let i = 0; i < 2; i++) {
			const drawn = drawHoldingArms();
			await finishLoads();
			await drawn;
		}
		expect(canvas.interface.children).toHaveLength(1);
		expect(layer().children).toHaveLength(1);
	});

	it("drops a draw overtaken while its pictures were loading", async () => {
		const first = drawHoldingArms();
		await Promise.resolve();
		look = { arms: false };
		const second = drawHoldingArms();
		await finishLoads();
		await Promise.all([first, second]);
		expect(layer()?.children ?? []).toHaveLength(0);
	});

	it("leaves out a picture that wouldn't load", async () => {
		const drawn = drawHoldingArms();
		await Promise.resolve();
		loads.shift().resolve(null);
		await drawn;
		expect(layer()?.children ?? []).toHaveLength(0);
	});
});
