import { hexLabel } from "../actions/hex-names.js";
import { editRealm, getRealm, realmUndoState } from "../actions/realm.js";
import { loadArtIndex, mythEntry, mythLookup, seerEntry } from "../book-art/art-index.js";
import { t } from "../chat/cards.js";
import { createRandom, randomSeed } from "../rules/random.js";
import {
	HOLDING_STYLES,
	LANDMARK_TYPES,
	OMEN_COUNT,
	TERRAIN,
	barriersAround,
	featureAt,
	terrainAt,
	validateRealm
} from "../rules/realm.js";
import {
	FEATURE_KINDS,
	editFeature,
	paintTerrain,
	placeFeature,
	setOmen,
	setRevealed,
	unusedMythNumbers
} from "../rules/realm-edits.js";
import { rollFreeMyth } from "../rules/realm-myths.js";
import { hexKey } from "../rules/realm-geometry.js";
import { keptFromMe } from "../actions/solo.js";
import { openMythChooser } from "./MythChooser.js";
import { inputDialog } from "./ui.js";

/**
 * Edit this hex, the GM's window opened from Edit hex in the title bar of Places
 * (HexEditor.js): the hex's terrain, the Holding, Myth or Landmark in it, and its Barriers. The paint palette lays
 * most of a Realm; this is where a Myth is placed and rolled, a Holding named,
 * a Sanctum's Seer rolled, and a Myth or Landmark hidden or revealed.
 */

/** @returns {string} The kind of feature in a hex, or "none". */
const kindHere = ({ holding, myth, landmark }) => (holding ? "holding" : myth ? "myth" : landmark ? "landmark" : "none");

/** @returns {number|undefined} A whole number from a form value, or undefined when there isn't one. */
const whole = (value) => (value === "" || value === null || !Number.isFinite(Number(value)) ? undefined : Math.trunc(Number(value)));

/** The fields of the window, each written on its own as it changes. */
export const HEX_EDIT_FIELDS = Object.freeze(["terrain", "kind", "seat", "disputed", "number", "d6", "d12", "seerD6", "seerD12", "style", "type", "holdingName"]);

/**
 * What the window shows for one hex.
 * @param {object} data
 * @param {Scene} data.scene
 * @param {object} data.realm The whole Realm.
 * @param {object} data.known The Realm as the Company knows it (realmKnown).
 * @param {object} data.g The Scene's geometry.
 * @param {{col: number, row: number}} data.hex
 * @param {object|null} data.index The art index, for the Myth's and Seer's names and pages.
 * @returns {object|null} Null without a hex.
 */
export function hexEditContext({ scene, realm, known, g, hex, index }) {
	if (!realm || !hex) return null;
	const { canUndo, canRedo } = realmUndoState(scene);
	// Played alone, the hex is shown as the Company knows it, and what stands in it isn't changed here,
	// since a hex that looks empty may still hold what's to be found.
	const solo = keptFromMe();
	const here = featureAt(known, hex);
	const terrain = terrainAt(realm, g, hex);
	const option = (value, label, selected) => ({ value, label, selected });

	let myth = null;
	if (here.myth) {
		const { name, page } = mythEntry(index, here.myth);
		myth = {
			numbers: [here.myth.number, ...unusedMythNumbers(realm)].sort((a, b) => a - b).map((number) => option(number, number, number === here.myth.number)),
			d6: here.myth.d6,
			d12: here.myth.d12,
			reference: t("realm.panel.reference", { name, page }),
			omens: t("realm.panel.omensSeen", { omen: here.myth.omen, count: OMEN_COUNT }),
			revealed: here.myth.revealed
		};
	}

	// The Landmark's name is the Lay of the Land's own box, so it isn't asked for twice.
	let landmark = null;
	if (here.landmark) {
		const { seer } = here.landmark;
		const reference = seer && seerEntry(index, seer);
		landmark = {
			types: LANDMARK_TYPES.map((type) => option(type, t(`realm.landmarks.${type}`), type === here.landmark.type)),
			sanctum: here.landmark.type === "sanctum",
			seer,
			reference: reference ? t("realm.panel.reference", { name: reference.name, page: reference.page }) : null,
			revealed: here.landmark.revealed
		};
	}

	return {
		solo,
		undoDisabled: !canUndo,
		redoDisabled: !canRedo,
		terrains: TERRAIN.map((key, number) => ({ value: number + 1, label: t(`realm.terrain.${key}`), active: number + 1 === terrain })),
		kinds: ["none", ...FEATURE_KINDS].map((value) => option(value, t(`realm.panel.kinds.${value}`), value === kindHere(here))),
		holding: here.holding && {
			styles: HOLDING_STYLES.map((style) => option(style, t(`realm.holdings.${style}`), style === here.holding.style)),
			name: here.holding.name,
			seat: here.holding.seat,
			// Another Holding may claim the Seat too (p202).
			disputed: Boolean(here.holding.disputed)
		},
		myth,
		landmark,
		// One line of the edges that are barred, rather than a chip per edge:
		// they are laid with the brush on the map, so the window only reports them.
		barriers: barriersAround(known, g, hex, { showHidden: true }).map(({ direction, revealed }) => {
			const state = revealed ? "revealed" : "hidden";
			return { label: t(`realm.directions.${direction}`), state, stateLabel: t(`realm.panel.barrier.${state}`) };
		}),
		noBarriers: t("realm.panel.barrier.none"),
		problems: solo ? [] : validateRealm(realm, g).filter((problem) => problem.key === hexKey(hex)).map((problem) => t(`realm.problems.${problem.reason}`))
	};
}

/**
 * Write the field that changed, and only that field: writing the whole form
 * could put back what an earlier change, still being saved, had changed.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 * @param {string} field One of HEX_EDIT_FIELDS.
 * @param {unknown} value
 * @returns {Promise<boolean>}
 */
export function writeHexField(scene, hex, field, value) {
	return editRealm(scene, (realm, g) => {
		switch (field) {
			case "terrain":
				return paintTerrain(realm, g, [hex], whole(value));
			case "kind":
				if (value === kindHere(featureAt(realm, hex))) return realm;
				return placeFeature(realm, g, hex, value === "none" ? null : { kind: value });
			case "seat":
				return editFeature(realm, g, hex, { seat: Boolean(value) });
			case "disputed":
				return editFeature(realm, g, hex, { disputed: Boolean(value) });
			case "number":
			case "d6":
			case "d12":
				return editFeature(realm, g, hex, { [field]: whole(value) });
			case "seerD6":
				return editFeature(realm, g, hex, { seer: { d6: whole(value) } });
			case "seerD12":
				return editFeature(realm, g, hex, { seer: { d12: whole(value) } });
			case "style":
			case "type":
				return editFeature(realm, g, hex, { [field]: value });
			case "holdingName":
				return editFeature(realm, g, hex, { name: value });
			default:
				return realm;
		}
	});
}

/**
 * Write one field of the window as it's changed.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 * @param {HTMLInputElement|HTMLSelectElement} field
 * @returns {Promise<boolean>|undefined} Undefined for a field that isn't the window's, or a player.
 */
export function writeHexEditField(scene, hex, field) {
	const { name } = field;
	if (!HEX_EDIT_FIELDS.includes(name) || !game.user.isGM) return;
	// Played alone, what stands in a hex isn't changed here: the Myths to move would give away the unfound.
	if (name === "kind" && keptFromMe()) return;
	const value = field.type === "checkbox" ? field.checked : field.value;
	return name === "kind" ? setHexKind(scene, hex, value) : writeHexField(scene, hex, name, value);
}

/**
 * Choose what stands in the hex. A Realm has six Myths, so once all six stand
 * on the map, choosing a Myth moves one here from another hex: the GM is
 * asked which, and it keeps its roll and the Omens seen.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 * @param {string} kind "none" or one of FEATURE_KINDS.
 * @returns {Promise<boolean>} Whether the hex changed, which it doesn't if the GM shuts the list.
 */
async function setHexKind(scene, hex, kind) {
	const realm = getRealm(scene)?.realm;
	if (kind !== "myth" || !realm || featureAt(realm, hex).myth || unusedMythNumbers(realm).length) return writeHexField(scene, hex, "kind", kind);
	const number = await pickMythToMove(scene, hex, realm);
	if (!number) return false;
	return editRealm(scene, (realm, g) => placeFeature(realm, g, hex, { kind: "myth", number }));
}

/**
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex Where the Myth is to go.
 * @param {object} realm
 * @returns {Promise<number|undefined>} The number of the Myth to move, or undefined if the list is shut.
 */
async function pickMythToMove(scene, hex, realm) {
	const index = await loadArtIndex();
	const data = await inputDialog({
		title: t("realm.panel.moveMyth.title"),
		icon: "fa-solid fa-dragon",
		template: "move-myth",
		context: {
			intro: t("realm.panel.moveMyth.intro", { hex: hexLabel(hex, scene) }),
			myths: realm.myths.map((myth) => ({
				id: myth.number,
				name: mythLookup(index, myth).name,
				detail: t("realm.panel.moveMyth.from", { number: myth.number, hex: hexLabel(myth.hex, scene) })
			}))
		},
		ok: { label: t("realm.panel.moveMyth.ok"), icon: "fa-solid fa-dragon" }
	});
	return whole(data?.myth);
}

/**
 * Roll the Myth's d6 and d12 on the Myths table (p27). A Realm never holds
 * the same Myth twice, so a Myth it already has, the one in this hex
 * included, is rolled again. The d6 and d12 fields beside the die still set
 * any roll by hand.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 */
export async function rollHexMyth(scene, hex) {
	const roll = rollFreeMyth(createRandom(randomSeed()), getRealm(scene)?.realm?.myths);
	if (!roll) return;
	await editRealm(scene, (realm, g) => {
		const { myth } = featureAt(realm, hex);
		return myth ? placeFeature(realm, g, hex, { kind: "myth", number: myth.number, d6: roll.d6, d12: roll.d12 }) : realm;
	});
}

/**
 * Open the Realm's Myths on the one in this hex, to roll it again against
 * the Myths the Realm already holds, or to choose another for it by hand.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 */
export function chooseHexMyth(scene, hex) {
	const realm = scene ? getRealm(scene)?.realm : null;
	const myth = realm && hex ? featureAt(realm, hex).myth : null;
	if (myth) openMythChooser({ scene, number: myth.number });
}

/** The Sanctums whose Seer is being rolled, by Scene and hex, so a second click doesn't roll twice. */
const seersRolling = new Set();

/**
 * Roll which Seer lives at a Sanctum, on the Knights table (p26).
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 */
export async function rollHexSeer(scene, hex) {
	const key = `${scene.id}:${hexKey(hex)}`;
	if (seersRolling.has(key)) return;
	seersRolling.add(key);
	try {
		const d6 = await new Roll("1d6").evaluate();
		const d12 = await new Roll("1d12").evaluate();
		await editRealm(scene, (realm, g) => {
			const { landmark } = featureAt(realm, hex);
			return landmark ? placeFeature(realm, g, hex, { kind: "landmark", type: landmark.type, seer: { d6: d6.total, d12: d12.total } }) : realm;
		});
	} finally {
		seersRolling.delete(key);
	}
}

/**
 * One more Omen of the Myth in this hex seen, or one fewer.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 * @param {string|number} step
 */
export async function stepHexOmen(scene, hex, step) {
	const by = whole(step) ?? 0;
	await editRealm(scene, (realm) => {
		const { myth } = featureAt(realm, hex);
		return myth ? setOmen(realm, myth.number, myth.omen + by) : realm;
	});
}

/**
 * Reveal the Myth or Landmark in this hex to the players, or hide it again.
 * @param {Scene} scene
 * @param {{col: number, row: number}} hex
 */
export async function toggleHexReveal(scene, hex) {
	await editRealm(scene, (realm) => {
		const { myth, landmark } = featureAt(realm, hex);
		const hidden = myth ?? landmark;
		return hidden ? setRevealed(realm, hex, !hidden.revealed) : realm;
	});
}

/**
 * The Myth and Landmark buttons Edit this hex and the Lay of the Land share,
 * each handed the hex shown and the button pressed.
 * @type {Record<string, (at: {scene: Scene, hex: {col: number, row: number}}, target: HTMLElement) => unknown>}
 */
export const HEX_FEATURE_ACTIONS = Object.freeze({
	// Which Seer lives at the Sanctum here (p26).
	rollSeer: ({ scene, hex }) => rollHexSeer(scene, hex),
	// One more Omen of the Myth here met, or one fewer (p18).
	omenStep: ({ scene, hex }, target) => stepHexOmen(scene, hex, target.dataset.step),
	toggleReveal: ({ scene, hex }) => toggleHexReveal(scene, hex)
});
