import { domainArmsView, knightChangesArms } from "../actions/domain-arms.js";
import { worldDomains } from "../actions/dominion.js";
import { realmHoldings } from "../actions/homecoming.js";
import { REALM_LOOK_HOOK, REALM_PREVIEW_HOOK, isDrawingRealm, isRealmScene, realmLookShown, tileCentreOn } from "../actions/realm.js";
import { holdingRulers } from "../rules/dominion.js";
import { holdingArmsMarks, holdingArmsOf } from "../rules/holding-arms.js";
import { isKnight } from "../rules/knight-types.js";
import { realmFlag } from "../rules/realm-documents.js";
import { SYSTEM_ID } from "../system-id.js";
import { marksLayer } from "./marks-layer.js";
import { drawShield } from "./shield-graphics.js";

/**
 * The arms each Holding flies on the Realm map: the shield of the Knight
 * ruling it through their Domain, at the top right of its icon, as a lord's
 * banner flew over the gate. Drawn on every client, players' and the
 * Referee's alike, unless the Realm's look switches them off.
 */

/** Under what the Company saw from afar and where it has been, over the Realm's Tiles. */
const redraw = marksLayer(950);

/** Counts draws, so pictures still loading for one that's been overtaken are dropped. */
let draws = 0;

/**
 * @param {Scene} scene
 * @returns {import("../rules/holding-arms.js").HoldingTile[]} The Holdings' Tiles, not their Seats' crowns, each
 *   boxed from its top-left corner. A Tile's x and y are read through tileCentreOn, since on v14 they're the
 *   point its picture is anchored on, its middle, and on v13 its corner.
 */
const holdingTiles = (scene) => scene.tiles
	.filter((tile) => realmFlag(tile)?.kind === "holding")
	.map(tileCentreOn(scene))
	.map((tile) => ({
		id: tile._id,
		x: tile.x - tile.width / 2,
		y: tile.y - tile.height / 2,
		width: tile.width,
		height: tile.height,
		alpha: tile.alpha,
		hidden: Boolean(tile.hidden)
	}));

/**
 * @param {Scene} scene
 * @returns {(id: string) => import("../rules/holding-arms.js").HoldingArms|null} The arms a Holding of that
 *   Scene flies: those of the first Domain ruling it that has any.
 */
function armsOn(scene) {
	const [realms, domains] = [realmHoldings(), worldDomains()];
	// A Domain ruling several Holdings works its arms out once a draw.
	const armsOf = new Map();
	const arms = (domain) => {
		if (!armsOf.has(domain)) armsOf.set(domain, holdingArmsOf(domainArmsView(domain)));
		return armsOf.get(domain);
	};
	return (id) => {
		for (const domain of holdingRulers(realms, domains, scene.id, id)) {
			const flown = arms(domain);
			if (flown) return flown;
		}
		return null;
	};
}

/**
 * Draw the arms on the Realm on the canvas again, after the Scene was drawn,
 * its Holdings or look changed, or a Domain or Knight did. Anywhere else, there are none.
 * @returns {Promise<void>}
 */
export async function drawHoldingArms() {
	if (!canvas?.ready || !canvas.interface) return;
	const draw = ++draws;
	try {
		const scene = canvas.scene;
		// Players don't see a Realm while it's drawn by hand.
		const shown = isRealmScene(scene) && (game.user.isGM || !isDrawingRealm(scene)) && realmLookShown(scene).arms;
		const marks = shown ? holdingArmsMarks({ tiles: holdingTiles(scene), armsFor: armsOn(scene), isGM: game.user.isGM }) : [];
		const srcs = [...new Set(marks.map((mark) => mark.src))];
		const textures = new Map(await Promise.all(srcs.map(async (src) => [src, await foundry.canvas.loadTexture(src)])));
		if (draw !== draws) return;
		const drawn = marks.filter((mark) => textures.get(mark.src));
		// Keyed by each picture's loaded texture rather than its src, which for heraldry is a whole painting written out.
		const key = drawn.map(({ src, ...mark }) => ({ ...mark, texture: textures.get(src).baseTexture?.uid ?? src }));
		redraw(drawn.length ? JSON.stringify(key) : "", (layer) => {
			for (const mark of drawn) {
				const shield = layer.addChild(new PIXI.Container());
				shield.alpha = mark.alpha;
				drawShield(shield, textures.get(mark.src), mark.badge, { fit: mark.fit });
			}
		});
	} catch (error) {
		console.error(`${SYSTEM_ID} | Couldn't draw the arms flown on the Realm's Holdings`, error);
	}
}

/** What, changed on a Domain, can change the arms its Holding flies. */
const DOMAIN_CHANGES = Object.freeze(["name", "img", "system.holding", "system.ruler", "system.arms", "system.armsKnight"]);

/**
 * @param {Actor} actor
 * @returns {boolean} Whether it can fly arms on a Holding, or give them.
 */
const bearsArms = (actor) => actor?.type === "domain" || isKnight(actor);

/** The debounced draw, made on first use. */
let drawSoon = null;

/**
 * Draw the arms again shortly, so several changes at once, such as a Holding
 * granted with its Domain founded, or a look saved and its Scene redrawn, draw once.
 */
export function drawHoldingArmsSoon() {
	drawSoon ??= foundry.utils.debounce(drawHoldingArms, 50);
	drawSoon();
}

/** Keep the arms in step with the Domains and Knights, and the Realm's look. Called during init. */
export function registerHoldingArmsHooks() {
	Hooks.on("updateActor", (actor, changes) => {
		const touches = actor.type === "domain" ? DOMAIN_CHANGES.some((path) => foundry.utils.hasProperty(changes, path))
			: isKnight(actor) && knightChangesArms(changes);
		if (touches) drawHoldingArmsSoon();
	});
	for (const name of ["createActor", "deleteActor"]) {
		Hooks.on(name, (actor) => {
			if (bearsArms(actor)) drawHoldingArmsSoon();
		});
	}
	for (const name of [REALM_LOOK_HOOK, REALM_PREVIEW_HOOK]) {
		Hooks.on(name, (sceneId) => {
			if (sceneId && sceneId === canvas?.scene?.id) drawHoldingArmsSoon();
		});
	}
}
