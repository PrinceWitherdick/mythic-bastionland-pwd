import { getHexRecord } from "../actions/hex-lore.js";
import { editRealm, getRealm, getRealmLook, realmUndoState, sceneGeometry, stepRealmHistory } from "../actions/realm.js";
import { wildernessRoll } from "../actions/wilderness.js";
import { loadArtIndex, mythEntry, seerEntry } from "../book-art/art-index.js";
import { t } from "../chat/cards.js";
import { createRandom, randomSeed } from "../rules/random.js";
import {
	HOLDING_COUNT,
	HOLDING_STYLES,
	LANDMARK_TYPES,
	LANDMARKS_PER_TYPE,
	OMEN_COUNT,
	REALM_BRUSHES,
	REALM_TOOL_ICONS,
	TERRAIN,
	barrierCount,
	featureAt,
	realmSeats,
	seatsInOrder,
	terrainAt,
	validateRealm
} from "../rules/realm.js";
import { realmTextures } from "../rules/realm-documents.js";
import {
	FEATURE_KINDS,
	barrierState,
	clearRiver,
	editFeature,
	paintTerrain,
	placeFeature,
	setOmen,
	setRevealed,
	unusedMythNumbers
} from "../rules/realm-edits.js";
import { rollFreeMyth } from "../rules/realm-myths.js";
import { directionNames, edgeKey, hexKey, neighbour } from "../rules/realm-geometry.js";
import { TERRAIN_MARKS, hidesTerrain } from "../rules/realm-map.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { openHexLore } from "./HexLore.js";
import { openMythChooser } from "./MythChooser.js";
import { openRealmAppearance } from "./RealmAppearance.js";
import { renderWhenIdle } from "./ui.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** One hex, in one column. */
const HEX_WIDTH = 340;

/** The whole palette, in two columns, so it stands beside the map rather than down the screen. */
const PAINT_WIDTH = 620;

/** @returns {string} The kind of feature in a hex, or "none". */
const kindHere = ({ holding, myth, landmark }) => (holding ? "holding" : myth ? "myth" : landmark ? "landmark" : "none");

/**
 * A swatch's count against what the book asks for: green once it's right, red
 * once there are too many, so a Realm says how its drawing is going as it
 * goes. A count with no number of its own, such as one style
 * of Holding among four Holdings, is never right or wrong on its own.
 * @param {number} count
 * @param {{min?: number|null, max: number}} asked
 * @returns {{count: number, met: boolean, over: boolean}}
 */
const counted = (count, { min = null, max }) => ({
	count,
	met: min !== null && count >= min && count <= max,
	over: count > max
});

/**
 * The line over a palette group: what it says, and whether the Realm has as
 * many as the rules ask for, or too many.
 * @param {string} text
 * @param {number} count
 * @param {{min?: number|null, max: number}} asked
 * @returns {{text: string, met: boolean, over: boolean}}
 */
const tallyLine = (text, count, asked) => {
	const { met, over } = counted(count, asked);
	return { text, met, over };
};

/**
 * "Designate one Holding as the Seat of Power" (p14): where it stands, or that
 * the Realm has none yet.
 * @returns {{text: string, met: boolean}}
 */
function seatLine(realm) {
	const seats = realmSeats(realm);
	const where = seats.map((seat) => t("realm.hex", seat.hex)).join(", ");
	if (seats.length > 1) {
		// Two Holdings claiming the Seat (p202), or more than the rules allow.
		const met = seatsInOrder(realm);
		return { text: t(met ? "realm.panel.seatDisputed" : "realm.panel.seatMany", { hexes: where }), met, over: !met };
	}
	return {
		text: seats.length ? t("realm.panel.seatAt", { hex: where }) : t("realm.panel.seatNone"),
		met: seats.length === 1
	};
}

/** @returns {number|undefined} A whole number from a form value, or undefined when there isn't one. */
const whole = (value) => (value === "" || value === null || !Number.isFinite(Number(value)) ? undefined : Math.trunc(Number(value)));

/**
 * @typedef {object} RealmSwatch One button of the paint palette, as templates/apps/parts/realm-swatch.hbs draws it.
 * @property {number|string} [brush] What it takes up, as setRealmBrush takes it; the Seat of Power has none.
 * @property {string} [action] Its action, when it isn't pickBrush.
 * @property {string} label
 * @property {string} [src] Its picture.
 * @property {string} [icon] Its icon, where it has no picture.
 * @property {string|null} [mark] The tint a traced Realm shows that terrain in on the map.
 * @property {boolean} [wide] A row of its own across the palette.
 * @property {{count: number, met: boolean, over: boolean}} [tally] How many of it stand on the map.
 * @property {string} [tooltip]
 * @property {boolean} active
 */

/**
 * The swatches a Realm is painted from, by the brush each belongs to: every
 * terrain, the river, Barriers, each style of Holding with the Seat of Power
 * after them, and each kind of Landmark. The palette shows them all together;
 * Creating a Realm shows each set beside the step it draws.
 * @param {Scene} scene
 * @param {import("../rules/realm.js").Realm} realm
 * @param {string|null} brush The brush in hand, one of REALM_BRUSHES, or null while the paint tool isn't.
 * @returns {Record<string, RealmSwatch[]>} Keyed by REALM_BRUSHES.
 */
export function realmSwatches(scene, realm, brush) {
	const textures = realmTextures(getRealmLook(scene));
	// On a Realm traced over a picture the map shows each terrain as its own
	// tint, so the palette carries the same tint to read the map by.
	const marked = hidesTerrain(realm);
	return {
		terrain: TERRAIN.map((key, index) => ({
			brush: index + 1,
			label: `${index + 1}. ${t(`realm.terrain.${key}`)}`,
			src: textures.terrain[index + 1].src,
			mark: marked ? TERRAIN_MARKS[index] : null,
			active: brush === "terrain" && index + 1 === RealmPanel.terrain
		})),
		river: [{ brush: "river", label: t("realm.panel.river"), src: textures.river.straight.src, wide: true, active: brush === "river" }],
		// The Barrier brush works along the edges between hexes, so it has no picture of its own.
		barrier: [{ brush: "barrier", label: t("realm.brushes.barrier"), icon: REALM_TOOL_ICONS.barrier, wide: true, active: brush === "barrier" }],
		holding: [
			...HOLDING_STYLES.map((style) => ({
				brush: style,
				label: t(`realm.holdings.${style}`),
				src: textures.holding[style].src,
				// Four Holdings all told, in whatever mixture of styles, so no one style is a number to hit.
				tally: counted(realm.holdings.filter((holding) => holding.style === style).length, { max: HOLDING_COUNT }),
				active: brush === "holding" && style === RealmPanel.holding
			})),
			// One Holding is the Seat of Power, so the crown is a tick beside the styles, not a brush of its own.
			{ action: "toggleSeat", label: t("realm.key.seat"), src: textures.seat.src, wide: true, tooltip: t("realm.panel.seatHint"), active: RealmPanel.seat }
		],
		landmark: LANDMARK_TYPES.map((type) => ({
			brush: type,
			label: t(`realm.landmarks.${type}`),
			src: textures.landmark[type].src,
			tally: counted(realm.landmarks.filter((landmark) => landmark.type === type).length, LANDMARKS_PER_TYPE),
			active: brush === "landmark" && type === RealmPanel.landmark
		}))
	};
}

/**
 * How much river the Realm has, and the button that clears it.
 * @param {import("../rules/realm.js").Realm} realm
 * @returns {{none: boolean, length: string, clear: string}}
 */
export function riverState({ rivers }) {
	const count = new Set(rivers.flat().map(hexKey)).size;
	return {
		none: count === 0,
		length: !count ? t("realm.panel.noRiver") : rivers.length > 1 ? t("realm.panel.riversLength", { rivers: rivers.length, count }) : t("realm.panel.riverLength", { count }),
		clear: t(rivers.length > 1 ? "realm.panel.clearRivers" : "realm.panel.clearRiver")
	};
}

/**
 * @param {string} brush One of REALM_BRUSHES.
 * @returns {string} How to paint with it.
 */
export const brushHint = (brush) => t(`realm.panel.hints.${brush}`);

/**
 * The GM's window for one hex of a Realm: its terrain, the Holding, Myth or
 * Landmark in it, its Barriers, and a Wilderness Roll there. With the paint
 * tool in hand it shows the palette to paint the Realm with instead: every
 * terrain, the river, Barriers, each style of Holding and each kind of
 * Landmark, in two columns so the palette isn't taller than the screen.
 */
export class RealmPanel extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		id: "bastionland-realm-panel",
		classes: [SYSTEM_ID, "bastionland", "bastionland-realm-panel-window"],
		tag: "form",
		position: { width: HEX_WIDTH, height: "auto", top: 90, left: 110 },
		window: { icon: "fa-solid fa-map", resizable: true },
		form: { handler: RealmPanel.#onChangeForm, submitOnChange: true, closeOnSubmit: false },
		actions: {
			pickBrush: RealmPanel.#onPickBrush,
			toggleSeat: RealmPanel.#onToggleSeat,
			rollMyth: RealmPanel.#onRollMyth,
			chooseMyth: RealmPanel.#onChooseMyth,
			rollSeer: RealmPanel.#onRollSeer,
			omenStep: RealmPanel.#onOmenStep,
			toggleReveal: RealmPanel.#onToggleReveal,
			undo: RealmPanel.#onUndo,
			redo: RealmPanel.#onRedo,
			wilderness: RealmPanel.#onWilderness,
			lore: RealmPanel.#onLore,
			clearRiver: RealmPanel.#onClearRiver,
			appearance: RealmPanel.#onAppearance
		}
	};

	static PARTS = {
		panel: { template: templatePath("apps/realm-panel.hbs") }
	};

	/** What the paint tool lays, one of REALM_BRUSHES. */
	static brush = "terrain";

	/** The terrain the terrain brush paints, 1-12. */
	static terrain = 5;

	/** The Landmark the Landmark brush places. */
	static landmark = LANDMARK_TYPES[0];

	/** The Holding the Holding brush places. */
	static holding = HOLDING_STYLES[0];

	/** Whether the next Holding placed is the Seat of Power. It goes off again once one is. */
	static seat = false;

	/** @type {string|null} */
	sceneId = null;

	/** @type {{col: number, row: number}|null} */
	hex = null;

	/** @type {"hex"|"terrain"} */
	mode = "hex";

	/** Which of the two the window was last sized for. */
	#shown = null;

	#index;

	/** @override */
	get title() {
		return t("realm.panel.title");
	}

	/** @returns {Scene|null} */
	get scene() {
		return game.scenes.get(this.sceneId) ?? null;
	}

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		if (this.#index === undefined) this.#index = await loadArtIndex();

		const scene = this.scene;
		const entry = getRealm(scene);
		if (!entry) return Object.assign(context, { missing: true });
		const g = sceneGeometry(scene);
		const { realm } = entry;
		const { canUndo, canRedo } = realmUndoState(scene);
		Object.assign(context, { undoDisabled: !canUndo, redoDisabled: !canRedo });

		if (this.mode === "terrain" || !this.hex) {
			const brush = RealmPanel.brush;
			const swatches = realmSwatches(scene, realm, brush);
			const painted = realm.terrain.filter(Boolean).length;
			// How many Barriers the rules ask this Realm for, which is both the least and the most.
			const barriers = barrierCount(realm);
			const landmarks = swatches.landmark.map((swatch) => swatch.tally);
			return Object.assign(context, {
				terrainMode: true,
				// Only the brush in hand says how to use it, so the palette keeps one line of instructions.
				hint: [brushHint(brush), ...(brush === "terrain" ? [t("realm.panel.hints.beside")] : [])].join(" "),
				// A count of the painted hexes, so the Terrain has a line of its own like the rest.
				terrainTally: tallyLine(
					t("realm.panel.terrainTally", { count: painted, target: realm.terrain.length }),
					painted,
					{ min: realm.terrain.length, max: realm.terrain.length }
				),
				swatches,
				river: { active: brush === "river", ...riverState(realm) },
				barrierTally: tallyLine(
					t("realm.panel.barrierTally", { count: realm.barriers.length, target: barriers }),
					realm.barriers.length,
					{ min: barriers, max: barriers }
				),
				holdingTally: tallyLine(
					t("realm.panel.holdingTally", { count: realm.holdings.length, target: HOLDING_COUNT }),
					realm.holdings.length,
					{ min: HOLDING_COUNT, max: HOLDING_COUNT }
				),
				seatTally: seatLine(realm),
				// The line over the Landmarks is green once every kind is right, as the Holdings' line is.
				landmarkTally: {
					text: t("realm.panel.landmarkTally", LANDMARKS_PER_TYPE),
					met: landmarks.every((landmark) => landmark.met),
					over: landmarks.some((landmark) => landmark.over)
				}
			});
		}

		const hex = this.hex;
		const here = featureAt(realm, hex);
		const terrain = terrainAt(realm, g, hex);
		const option = (value, label, selected) => ({ value, label, selected });

		let myth = null;
		if (here.myth) {
			const { name, page } = mythEntry(this.#index, here.myth);
			myth = {
				numbers: [here.myth.number, ...unusedMythNumbers(realm)].sort((a, b) => a - b).map((number) => option(number, number, number === here.myth.number)),
				d6: here.myth.d6,
				d12: here.myth.d12,
				reference: t("realm.panel.reference", { name, page }),
				omens: t("realm.panel.omensSeen", { omen: here.myth.omen, count: OMEN_COUNT }),
				revealed: here.myth.revealed
			};
		}

		let landmark = null;
		if (here.landmark) {
			const { seer } = here.landmark;
			const reference = seer && seerEntry(this.#index, seer);
			landmark = {
				types: LANDMARK_TYPES.map((type) => option(type, t(`realm.landmarks.${type}`), type === here.landmark.type)),
				name: here.landmark.name,
				sanctum: here.landmark.type === "sanctum",
				seer,
				reference: reference ? t("realm.panel.reference", { name: reference.name, page: reference.page }) : null,
				revealed: here.landmark.revealed
			};
		}

		return Object.assign(context, {
			hexMode: true,
			heading: t("realm.hex", hex),
			terrains: TERRAIN.map((key, index) => ({ value: index + 1, label: t(`realm.terrain.${key}`), active: index + 1 === terrain })),
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
			// they are laid with the brush on the map, so the panel only reports them.
			barriers: directionNames(g).map((direction, index) => {
				const other = neighbour(g, hex, index);
				const state = other ? barrierState(realm, edgeKey(hex, other)) : "none";
				return { label: t(`realm.directions.${direction}`), state, stateLabel: t(`realm.panel.barrier.${state}`) };
			}).filter(({ state }) => state !== "none"),
			noBarriers: t("realm.panel.barrier.none"),
			// So the GM can see at a glance which hexes they have already written up.
			written: Boolean(getHexRecord(scene, hex)),
			problems: validateRealm(realm, g).filter((problem) => problem.key === hexKey(hex)).map((problem) => t(`realm.problems.${problem.reason}`))
		});
	}

	/**
	 * The palette stands in two columns, so it needs a width the one-hex panel
	 * doesn't. Set here, where the window is sure to be on screen, and only as
	 * the panel changes from one to the other, so a size the GM has dragged the
	 * window to is left alone until they pick up another tool.
	 * @override
	 */
	async _onRender(context, options) {
		await super._onRender(context, options);
		this.#hangAppearanceButton(Boolean(context.terrainMode));
		if (this.#shown === this.mode) return;
		this.#shown = this.mode;
		this.setPosition({ width: this.mode === "terrain" ? PAINT_WIDTH : HEX_WIDTH, height: "auto" });
	}

	/**
	 * The palette's way to Realm Appearance, a labelled button in the window
	 * header left of Foundry's own controls, as the sheets hang theirs. The
	 * one-hex panel has none.
	 * @param {boolean} shown
	 */
	#hangAppearanceButton(shown) {
		const header = this.element?.querySelector(".window-header");
		if (!header) return;
		const hung = header.querySelector(".bastionland-header-button[data-action=appearance]");
		if (!shown) return hung?.remove();
		if (hung) return;
		const doc = header.ownerDocument;
		const button = doc.createElement("button");
		button.type = "button";
		button.className = "header-control bastionland-header-button";
		button.dataset.action = "appearance";
		const glyph = doc.createElement("i");
		glyph.className = "fa-solid fa-palette";
		glyph.inert = true;
		const text = doc.createElement("span");
		text.textContent = t("realm.panel.appearance");
		button.append(glyph, text);
		const controls = header.querySelector("[data-action=toggleControls], [data-action=close]");
		if (controls) controls.before(button);
		else header.append(button);
	}

	/**
	 * A window the GM has dragged to a height of its own scrolls inside that
	 * height, rather than being held to the height an auto-sized one may have.
	 * @override
	 */
	_onPosition(position) {
		super._onPosition(position);
		this.element?.classList.toggle("is-sized", Number.isFinite(position.height));
	}

	/**
	 * @param {(realm: object, g: object) => object} edit
	 * @returns {Promise<boolean>}
	 */
	#edit(edit) {
		return this.hex ? editRealm(this.scene, edit) : Promise.resolve(false);
	}

	/* -------------------------------------------- */
	/*  Actions                                     */
	/* -------------------------------------------- */

	/**
	 * Write the field that changed, and only that field: writing the whole form
	 * could put back what an earlier change, still being saved, had changed.
	 * @this {RealmPanel}
	 */
	static async #onChangeForm(event, _form, formData) {
		const field = event.target?.name;
		if (this.mode !== "hex" || !field) return;
		const value = formData.object[field];
		const hex = this.hex;
		await this.#edit((realm, g) => {
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
				case "name":
					return editFeature(realm, g, hex, { [field]: value });
				default:
					return realm;
			}
		});
	}

	/**
	 * Take up a brush from the palette: a terrain by its number, the river,
	 * Barriers, or a Landmark by its type.
	 * @this {RealmPanel}
	 */
	static #onPickBrush(_event, target) {
		const { brush } = target.dataset;
		setRealmBrush(/^\d+$/.test(brush) ? Number(brush) : brush);
	}

	/**
	 * Tick the Seat of Power, so the next Holding placed is the Realm's Seat.
	 * Ticking it takes up the Holding brush, since that's what it's for.
	 * @this {RealmPanel}
	 */
	static #onToggleSeat() {
		toggleRealmSeat();
	}

	/**
	 * Roll the Myth's d6 and d12 on the Myths table (p27). A Realm never holds
	 * the same Myth twice, so a Myth it already has, the one in this hex
	 * included, is rolled again. The d6 and d12 fields beside the die still set
	 * any roll by hand.
	 * @this {RealmPanel}
	 */
	static async #onRollMyth() {
		const roll = rollFreeMyth(createRandom(randomSeed()), getRealm(this.scene)?.realm?.myths);
		if (!roll) return;
		await this.#edit((realm, g) => {
			const { myth } = featureAt(realm, this.hex);
			return myth ? placeFeature(realm, g, this.hex, { kind: "myth", number: myth.number, d6: roll.d6, d12: roll.d12 }) : realm;
		});
	}

	/**
	 * Open the Realm's Myths on the one in this hex, to roll it again against
	 * the Myths the Realm already holds, or to choose another for it by hand.
	 * @this {RealmPanel}
	 */
	static #onChooseMyth() {
		const scene = this.scene;
		const realm = scene ? getRealm(scene)?.realm : null;
		const myth = realm && this.hex ? featureAt(realm, this.hex).myth : null;
		if (myth) openMythChooser({ scene, number: myth.number });
	}

	/**
	 * Roll which Seer lives at a Sanctum, on the Knights table (p26).
	 * @this {RealmPanel}
	 */
	static async #onRollSeer() {
		const d6 = await new Roll("1d6").evaluate();
		const d12 = await new Roll("1d12").evaluate();
		await this.#edit((realm, g) => {
			const { landmark } = featureAt(realm, this.hex);
			return landmark ? placeFeature(realm, g, this.hex, { kind: "landmark", type: landmark.type, seer: { d6: d6.total, d12: d12.total } }) : realm;
		});
	}

	/** @this {RealmPanel} */
	static async #onOmenStep(_event, target) {
		const step = whole(target.dataset.step) ?? 0;
		await this.#edit((realm) => {
			const { myth } = featureAt(realm, this.hex);
			return myth ? setOmen(realm, myth.number, myth.omen + step) : realm;
		});
	}

	/** @this {RealmPanel} */
	static async #onToggleReveal() {
		await this.#edit((realm) => {
			const { myth, landmark } = featureAt(realm, this.hex);
			const hidden = myth ?? landmark;
			return hidden ? setRevealed(realm, this.hex, !hidden.revealed) : realm;
		});
	}

	/** @this {RealmPanel} */
	static #onUndo() {
		return stepRealmHistory(this.scene, "undo");
	}

	/** @this {RealmPanel} */
	static #onRedo() {
		return stepRealmHistory(this.scene, "redo");
	}

	/** @this {RealmPanel} */
	static #onWilderness() {
		return wildernessRoll({ scene: this.scene, hex: this.hex });
	}

	/** @this {RealmPanel} */
	static #onLore() {
		return openHexLore({ scene: this.scene, hex: this.hex });
	}

	/** @this {RealmPanel} */
	static #onClearRiver() {
		return editRealm(this.scene, clearRiver);
	}

	/**
	 * Open Realm Appearance from the palette, so the look of the Realm being
	 * painted can be changed without leaving the map for the settings.
	 * @this {RealmPanel}
	 */
	static #onAppearance() {
		return openRealmAppearance();
	}
}

/** @type {RealmPanel|null} */
let panel = null;

/**
 * Show the Hex panel for a hex, or the palette the Realm is painted from.
 * @param {object} options
 * @param {Scene} options.scene
 * @param {{col: number, row: number}|null} [options.hex]
 * @param {"hex"|"terrain"} [options.mode]
 * @returns {RealmPanel}
 */
export function openRealmPanel({ scene, hex = null, mode = "hex" }) {
	panel ??= new RealmPanel();
	panel.sceneId = scene.id;
	panel.hex = hex;
	panel.mode = mode;
	panel.render({ force: true });
	return panel;
}

/**
 * Pick what the paint tool lays. A terrain or a Landmark type takes up that
 * brush as well as choosing what it lays, so one click of a swatch is enough.
 * @param {number|string} brush A terrain, 1-12; a Landmark type, such as "sanctum";
 *   or one of REALM_BRUSHES, which keeps the terrain or Landmark last chosen.
 */
export function setRealmBrush(brush) {
	// A terrain, Landmark type or Holding style names the brush it belongs to as well as itself.
	const chooses = Number.isInteger(brush) ? "terrain"
		: LANDMARK_TYPES.includes(brush) ? "landmark"
			: HOLDING_STYLES.includes(brush) ? "holding" : null;
	if (chooses) {
		RealmPanel[chooses] = brush;
		RealmPanel.brush = chooses;
	} else if (REALM_BRUSHES.includes(brush)) {
		RealmPanel.brush = brush;
	}
	if (panel?.rendered && panel.mode === "terrain") panel.render();
	canvas.realm?.redrawTool();
}

/**
 * Tick the Seat of Power, or untick it. Ticking it takes up the Holding brush,
 * since that's what it's for.
 */
export function toggleRealmSeat() {
	RealmPanel.seat = !RealmPanel.seat;
	setRealmBrush("holding");
}

/**
 * Untick the Seat of Power once the Seat has been placed, so the next Holding
 * doesn't quietly take the crown off the one before it.
 * @param {boolean} on
 */
export function setRealmSeat(on) {
	if (RealmPanel.seat === on) return;
	RealmPanel.seat = on;
	if (panel?.rendered && panel.mode === "terrain") panel.render();
	// Creating a Realm shows the tick as well.
	canvas.realm?.redrawTool();
}

/**
 * Close the palette, while Creating a Realm lays each part of it beside the
 * step it draws. The Hex panel stays: the Myths are set there.
 * @returns {Promise<unknown>}
 */
export function closeRealmPalette() {
	return panel?.rendered && panel.mode === "terrain" ? panel.close({ animate: false }) : Promise.resolve();
}

/**
 * Draw the panel again after its Realm changed, once the GM has finished
 * typing in whichever of its fields they're in.
 * @param {string} sceneId
 */
export function refreshRealmPanel(sceneId) {
	if (panel?.sceneId === sceneId) renderWhenIdle(panel);
}
