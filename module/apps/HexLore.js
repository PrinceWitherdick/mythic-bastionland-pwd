import { takeExplorationAct } from "../actions/exploration.js";
import {
	forgetHexSpark,
	getHexRecord,
	hexFeatureLines,
	sparkWhen,
	tellPlayersAboutHex,
	writeHexNote
} from "../actions/hex-lore.js";
import { getHexSharedRecord, partyNoteView, toldLabel } from "../actions/hex-shared.js";
import { hexJournalsOn, openHexJournal } from "../actions/hex-journals.js";
import { getHexVisits, markHexVisited, visitsLabel } from "../actions/journey.js";
import { renameLandmark, rerollLandmarkName } from "../actions/landmarks.js";
import { rollHexPerson, rollUpHolding } from "../actions/people.js";
import { getRealm, isDrawingRealm, sceneGeometry, stepRealmHistory } from "../actions/realm.js";
import { rollRefereeTable } from "../actions/referee-rolls.js";
import { wildernessRoll } from "../actions/wilderness.js";
import { loadArtIndex } from "../book-art/art-index.js";
import { t } from "../chat/cards.js";
import { TERRAIN, featureAt, terrainAt } from "../rules/realm.js";
import { hexKey } from "../rules/realm-geometry.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { WILD_PAGE, openSparkTables, refreshSparkKeep } from "./SparkTables.js";
import { openBookFlip } from "./BookFlip.js";
import { HEX_FORGET_ACTIONS, hexForgetContext } from "./hex-forget.js";
import { HEX_EDIT_FIELDS, chooseHexMyth, hexEditContext, rollHexMyth, rollHexSeer, stepHexOmen, toggleHexReveal, writeHexField } from "./hex-edit.js";
import { renderWhenIdle } from "./ui.js";
import { realmKnown } from "../actions/solo.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * What one hex holds (p19). A Hex is broad and varied, and what fills it
 * is the Referee's to improvise, so this is where they roll the Spark
 * Tables for it and write down what they made of it. Everything rolled stays
 * in the hex, so a Company coming back finds the hex they left.
 */
export class HexLore extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		id: "bastionland-hex-lore",
		classes: [SYSTEM_ID, "bastionland", "bastionland-hex-lore-window"],
		tag: "form",
		position: { width: 460, height: "auto", top: 90, left: 470 },
		window: { icon: "fa-solid fa-feather", resizable: true },
		form: { handler: HexLore.#onChangeForm, submitOnChange: true, closeOnSubmit: false },
		actions: {
			rollSet: HexLore.#onRollSet,
			forget: HexLore.#onForget,
			tell: HexLore.#onTell,
			wilderness: HexLore.#onWilderness,
			act: HexLore.#onAct,
			browse: HexLore.#onBrowse,
			flipBook: () => openBookFlip(),
			rerollLandmark: HexLore.#onRerollLandmark,
			rollPerson: HexLore.#onRollPerson,
			rollHolding: HexLore.#onRollHolding,
			markVisited: HexLore.#onMarkVisited,
			// Forget what's kept here: each takes this window's hex.
			...Object.fromEntries(Object.entries(HEX_FORGET_ACTIONS).map(([action, forget]) => [action, function (_event, target) {
				return forget(this.scene, this.hex, target);
			}])),
			mood: HexLore.#onMood,
			journal: HexLore.#onJournal,
			rollMyth: HexLore.#onRollMyth,
			chooseMyth: HexLore.#onChooseMyth,
			rollSeer: HexLore.#onRollSeer,
			omenStep: HexLore.#onOmenStep,
			toggleReveal: HexLore.#onToggleReveal,
			undo: HexLore.#onUndo,
			redo: HexLore.#onRedo
		}
	};

	static PARTS = {
		lore: { template: templatePath("apps/hex-lore.hbs"), scrollable: [".bastionland-hex-lore__rolls"] }
	};

	/** @type {string|null} */
	sceneId = null;

	/** @type {{col: number, row: number}|null} */
	hex = null;

	/** @type {object|null|undefined} The art index: undefined until loaded, null if never imported. */
	#index;

	/** A person or a Holding is still being rolled, so a second click doesn't roll it twice. */
	#rolling = false;

	/** @type {{key: string, myth: string, page: number}|null} The page the Landmark's name was last flipped to, and in which hex. */
	#prompted = null;

	/** @type {boolean|null} Whether the GM left Edit this hex open or shut; null until they first fold it. */
	#editOpen = null;

	/** Whether the GM left Forget what's kept here open. */
	#forgetOpen = false;

	/** @override */
	async _onRender(context, options) {
		await super._onRender(context, options);
		// The folds stay as the GM left them, however often the window is drawn again.
		// A fold drawn open fires a toggle of its own, which isn't the GM's doing.
		const keepFold = (selector, drawnOpen, remember) => {
			const fold = this.element.querySelector(selector);
			let shown = Boolean(drawnOpen);
			fold?.addEventListener("toggle", () => {
				if (fold.open === shown) return;
				shown = fold.open;
				remember(fold.open);
			});
		};
		keepFold("[data-hex-edit]", context.edit?.open, (open) => (this.#editOpen = open));
		keepFold("[data-hex-forget]", context.forget?.open, (open) => (this.#forgetOpen = open));
		// Rolls on the Spark Tables are kept in the hex this is open on.
		refreshSparkKeep();
	}

	/** @override */
	_onClose(options) {
		super._onClose(options);
		// Rolls on the Spark Tables go back to the Company's hex.
		refreshSparkKeep();
	}

	/** @override */
	get title() {
		return this.hex ? t("hexLore.titleHex", { hex: t("realm.hex", this.hex) }) : t("hexLore.title");
	}

	/** @returns {Scene|null} */
	get scene() {
		return game.scenes.get(this.sceneId) ?? null;
	}

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		if (this.#index === undefined) this.#index = await loadArtIndex();
		// Opened from the GM Toolkit's pen, to forget what's kept here.
		if (options.forget) this.#forgetOpen = true;

		const scene = this.scene;
		const entry = getRealm(scene);
		if (!entry || !this.hex) return Object.assign(context, { missing: true });

		const { realm } = entry;
		// Played alone, only what the Company has found here.
		const known = realmKnown(realm);
		const g = sceneGeometry(scene);
		const hex = this.hex;
		const terrain = terrainAt(realm, g, hex);
		const record = getHexRecord(scene, hex);
		const visits = getHexVisits(scene, hex);
		const shared = getHexSharedRecord(scene, hex);
		const pages = this.#index?.spark ?? [];
		const landmark = featureAt(known, hex).landmark;
		const prompted = this.#prompted?.key === hexKey(hex) ? this.#prompted : null;
		// The hex itself is the GM's to change: open while the Realm is being drawn, and shut in play.
		const edit = game.user.isGM ? hexEditContext({ scene, realm, known, g, hex, index: this.#index }) : null;
		if (edit) edit.open = this.#editOpen ?? isDrawingRealm(scene);
		const forget = game.user.isGM ? { ...hexForgetContext(scene, hex), open: this.#forgetOpen } : null;

		let notice = null;
		if (!this.#index) notice = t("spark.noIndex");
		else if (!pages.length) notice = t("spark.noText");

		return Object.assign(context, {
			heading: t("realm.hex", hex),
			terrain: terrain ? t(`realm.terrain.${TERRAIN[terrain - 1]}`) : null,
			features: hexFeatureLines(scene, known, g, hex, this.#index),
			// A Holding's Local Mood is rolled as the Company arrives (p18).
			holding: Boolean(featureAt(realm, hex).holding),
			// A Landmark's name, which a random page's prompt for its type can fill (p14).
			landmark: landmark
				? {
					type: t(`realm.landmarks.${landmark.type}`),
					name: landmark.name ?? "",
					from: prompted ? t("hexLore.landmark.from", { myth: prompted.myth, page: prompted.page }) : null
				}
				: null,
			// Whether the Company has been here, as the GM Toolkit's Journey counts it.
			visited: Boolean(visits),
			visits: visits ? visitsLabel(visits) : t("hexLore.notVisited"),
			note: record?.note ?? "",
			// Anything kept here has a Journal entry, where the setting makes them.
			journal: Boolean(record) && hexJournalsOn(),
			// The players' own note, and how often they've been told of the hex, beside the GM's.
			party: partyNoteView(shared?.party),
			told: toldLabel(shared),
			// Newest first: the roll just made is the one being read.
			sparks: (record?.sparks ?? []).map((spark) => ({
				id: spark.id,
				table: spark.table,
				prompt: spark.prompt,
				when: sparkWhen(spark)
			})).reverse(),
			notice,
			edit,
			forget
		});
	}

	/* -------------------------------------------- */
	/*  Actions                                     */
	/* -------------------------------------------- */

	/**
	 * The note, the Landmark's name and the fields of Edit this hex, each saved as it's changed.
	 * @this {HexLore}
	 */
	static async #onChangeForm(event, _form, formData) {
		if (!this.hex) return;
		const field = event.target?.name;
		if (field === "note") await writeHexNote(this.scene, this.hex, formData.object.note ?? "");
		else if (field === "landmarkName") await renameLandmark(this.scene, this.hex, (formData.object.landmarkName ?? "").trim());
		else if (HEX_EDIT_FIELDS.includes(field) && game.user.isGM) await writeHexField(this.scene, this.hex, field, formData.object[field]);
	}

	/** @this {HexLore} */
	static #onRollMyth() {
		return rollHexMyth(this.scene, this.hex);
	}

	/** @this {HexLore} */
	static #onChooseMyth() {
		return chooseHexMyth(this.scene, this.hex);
	}

	/** @this {HexLore} */
	static #onRollSeer() {
		return rollHexSeer(this.scene, this.hex);
	}

	/** @this {HexLore} */
	static #onOmenStep(_event, target) {
		return stepHexOmen(this.scene, this.hex, target.dataset.step);
	}

	/** @this {HexLore} */
	static #onToggleReveal() {
		return toggleHexReveal(this.scene, this.hex);
	}

	/** @this {HexLore} */
	static #onUndo() {
		return stepRealmHistory(this.scene, "undo");
	}

	/** @this {HexLore} */
	static #onRedo() {
		return stepRealmHistory(this.scene, "redo");
	}

	/**
	 * Name the Landmark here from the prompt a random page prints for its type (p14, p179).
	 * @this {HexLore}
	 */
	static async #onRerollLandmark() {
		const hex = this.hex;
		const named = await this.#rollOnce(() => rerollLandmarkName(this.scene, hex));
		if (!named) return;
		this.#prompted = { key: hexKey(hex), myth: named.myth, page: named.page };
		// The Realm's change draws the window again; this shows where the name came from even if it didn't change.
		this.render();
	}

	/**
	 * Roll every People table for someone met here, and keep them in the hex (p200, p202).
	 * @this {HexLore}
	 */
	static #onRollPerson() {
		return this.#rollOnce(() => rollHexPerson({ scene: this.scene, hex: this.hex }));
	}

	/**
	 * Roll up the Holding here, a few of its people and the Myths they've heard of (p181).
	 * @this {HexLore}
	 */
	static #onRollHolding() {
		return this.#rollOnce(() => rollUpHolding({ scene: this.scene, hex: this.hex }));
	}

	/**
	 * @param {() => Promise<unknown>} roll
	 * @returns {Promise<unknown>}
	 */
	async #rollOnce(roll) {
		if (this.#rolling || !this.hex) return null;
		this.#rolling = true;
		try {
			return await roll();
		} finally {
			this.#rolling = false;
		}
	}

	/**
	 * Roll this hex on the wilderness tables, on the Spark Tables' Wilderness Hex
	 * page, which keeps what's taken in the hex this window is open on.
	 * @this {HexLore}
	 */
	static #onRollSet() {
		return openSparkTables({ page: WILD_PAGE });
	}

	/** @this {HexLore} */
	static async #onForget(_event, target) {
		const { spark } = target.dataset;
		if (spark) await forgetHexSpark(this.scene, this.hex, spark);
	}

	/** @this {HexLore} */
	static #onTell() {
		const note = this.element.querySelector('[name="note"]')?.value;
		return tellPlayersAboutHex({ scene: this.scene, hex: this.hex, note });
	}

	/** @this {HexLore} */
	static #onWilderness() {
		return wildernessRoll({ scene: this.scene, hex: this.hex });
	}

	/**
	 * Gathering Folklore, searching, or what a vantage point shows, whichever
	 * the button names (p19).
	 * @this {HexLore}
	 */
	static #onAct(_event, target) {
		return takeExplorationAct(target.dataset.act, { scene: this.scene, hex: this.hex });
	}

	/** @this {HexLore} */
	static #onBrowse() {
		return openSparkTables();
	}

	/** @this {HexLore} */
	static #onMarkVisited() {
		return markHexVisited(this.scene, this.hex);
	}

	/** @this {HexLore} */
	static #onMood() {
		return rollRefereeTable("mood");
	}

	/** @this {HexLore} */
	static #onJournal() {
		return openHexJournal(this.scene, this.hex);
	}
}

/** @type {HexLore|null} */
let window_ = null;

/**
 * Show what a hex holds.
 * @param {object} options
 * @param {Scene} options.scene
 * @param {{col: number, row: number}} options.hex
 * @param {boolean} [options.forget] Open Forget what's kept here as well.
 * @returns {HexLore}
 */
export function openHexLore({ scene, hex, forget = false }) {
	window_ ??= new HexLore();
	window_.sceneId = scene.id;
	window_.hex = hex;
	window_.render({ force: true, forget });
	return window_;
}

/**
 * Draw the window again after its hex changed, once the GM has finished typing.
 * @param {string} sceneId
 */
export function refreshHexLore(sceneId) {
	if (window_?.sceneId === sceneId) renderWhenIdle(window_);
}
