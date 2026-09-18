import { editRealm, getRealm, getRealmLook, realmUndoState, sceneGeometry, stepRealmHistory } from "../actions/realm.js";
import { wildernessRoll } from "../actions/wilderness.js";
import { loadArtIndex, mythEntry, seerEntry } from "../book-art/art-index.js";
import { t } from "../chat/cards.js";
import {
	HOLDING_STYLES,
	LANDMARK_TYPES,
	OMEN_COUNT,
	TERRAIN,
	featureAt,
	terrainAt,
	validateRealm
} from "../rules/realm.js";
import { realmTextures } from "../rules/realm-documents.js";
import {
	FEATURE_KINDS,
	barrierState,
	editFeature,
	nextBarrierState,
	paintTerrain,
	placeFeature,
	setBarrier,
	setOmen,
	setRevealed,
	unusedMythNumbers
} from "../rules/realm-edits.js";
import { DIRECTIONS, edgeKey, hexKey, neighbour } from "../rules/realm-geometry.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** @returns {string} The kind of feature in a hex, or "none". */
const kindHere = ({ holding, myth, landmark }) => (holding ? "holding" : myth ? "myth" : landmark ? "landmark" : "none");

/** @returns {number|undefined} A whole number from a form value, or undefined when there isn't one. */
const whole = (value) => (value === "" || value === null || !Number.isFinite(Number(value)) ? undefined : Math.trunc(Number(value)));

/**
 * The GM's window for one hex of a Realm: its terrain, the Holding, Myth or
 * Landmark in it, its Barriers, and a Wilderness Roll there. With the terrain
 * brush it shows the palette to paint with instead.
 */
export class RealmPanel extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		id: "bastionland-realm-panel",
		classes: [SYSTEM_ID, "bastionland", "bastionland-realm-panel-window"],
		tag: "form",
		position: { width: 340, height: "auto", top: 90, left: 110 },
		window: { icon: "fa-solid fa-map", resizable: false },
		form: { handler: RealmPanel.#onChangeForm, submitOnChange: true, closeOnSubmit: false },
		actions: {
			pickTerrain: RealmPanel.#onPickTerrain,
			rollMyth: RealmPanel.#onRollMyth,
			rollSeer: RealmPanel.#onRollSeer,
			omenStep: RealmPanel.#onOmenStep,
			toggleReveal: RealmPanel.#onToggleReveal,
			cycleBarrier: RealmPanel.#onCycleBarrier,
			undo: RealmPanel.#onUndo,
			redo: RealmPanel.#onRedo,
			wilderness: RealmPanel.#onWilderness,
		}
	};

	static PARTS = {
		panel: { template: templatePath("apps/realm-panel.hbs") }
	};

	/** The terrain the brush paints, 1-12. */
	static brush = 5;

	/** @type {string|null} */
	sceneId = null;

	/** @type {{col: number, row: number}|null} */
	hex = null;

	/** @type {"hex"|"terrain"} */
	mode = "hex";

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
			const textures = realmTextures(getRealmLook(scene));
			return Object.assign(context, {
				terrainMode: true,
				terrains: TERRAIN.map((key, index) => ({
					value: index + 1,
					label: t(`realm.terrain.${key}`),
					src: textures.terrain[index + 1].src,
					active: index + 1 === RealmPanel.brush
				}))
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
				seat: here.holding.seat
			},
			myth,
			landmark,
			barriers: DIRECTIONS.map((direction, index) => {
				const other = neighbour(g, hex, index);
				const edge = other ? edgeKey(hex, other) : "";
				const state = other ? barrierState(realm, edge) : "none";
				return { label: t(`realm.directions.${direction}`), edge, state, stateLabel: t(`realm.panel.barrier.${state}`), disabled: !other };
			}),
			problems: validateRealm(realm, g).filter((problem) => problem.key === hexKey(hex)).map((problem) => t(`realm.problems.${problem.reason}`))
		});
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

	/** @this {RealmPanel} */
	static #onPickTerrain(_event, target) {
		RealmPanel.brush = whole(target.dataset.terrain) ?? RealmPanel.brush;
		return this.render();
	}

	/**
	 * Roll the Myth's d6 and d12 on the Myths table (p27).
	 * @this {RealmPanel}
	 */
	static async #onRollMyth() {
		const d6 = await new Roll("1d6").evaluate();
		const d12 = await new Roll("1d12").evaluate();
		await this.#edit((realm, g) => {
			const { myth } = featureAt(realm, this.hex);
			return myth ? placeFeature(realm, g, this.hex, { kind: "myth", number: myth.number, d6: d6.total, d12: d12.total }) : realm;
		});
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
	static async #onCycleBarrier(_event, target) {
		const { edge } = target.dataset;
		if (!edge) return;
		await this.#edit((realm, g) => setBarrier(realm, g, edge, nextBarrierState(barrierState(realm, edge))));
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
}

/** @type {RealmPanel|null} */
let panel = null;

/**
 * Show the Hex panel for a hex, or the terrain palette.
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

/** Whether the panel is waiting for the GM to leave a field before drawing again. */
let drawOnBlur = false;

/**
 * Draw the panel again after its Realm changed. While the GM is typing in one
 * of its fields, that waits until they leave it: drawing the panel puts back
 * each field's saved value.
 * @param {string} sceneId
 */
export function refreshRealmPanel(sceneId) {
	if (!panel?.rendered || panel.sceneId !== sceneId) return;
	const field = document.activeElement;
	if (!panel.element.contains(field) || !field.matches('input:not([type="checkbox"])')) {
		panel.render();
		return;
	}
	if (drawOnBlur) return;
	drawOnBlur = true;
	field.addEventListener("blur", () => {
		drawOnBlur = false;
		if (panel?.rendered) panel.render();
	}, { once: true });
}
