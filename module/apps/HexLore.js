import { calendarLabel } from "../actions/calendar.js";
import { takeExplorationAct } from "../actions/exploration.js";
import {
	forgetHexSpark,
	getHexRecord,
	rollHexSpark,
	tellPlayersAboutHex,
	writeHexNote
} from "../actions/hex-lore.js";
import { getHexVisits, markHexVisited, visitsLabel } from "../actions/journey.js";
import { rollHexPerson, rollUpHolding } from "../actions/people.js";
import { getRealm, sceneGeometry } from "../actions/realm.js";
import { rollRefereeTable } from "../actions/referee-rolls.js";
import { cruiseFrom, hasRoad, setRoad } from "../actions/roads.js";
import { wildernessRoll } from "../actions/wilderness.js";
import { loadArtIndex, mythEntry, seerEntry } from "../book-art/art-index.js";
import { t } from "../chat/cards.js";
import { OMEN_COUNT, TERRAIN, featureAt, terrainAt } from "../rules/realm.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { openSparkTables } from "./SparkTables.js";
import { openBookFlip } from "./BookFlip.js";
import { openHexVisits } from "./HexVisits.js";
import { openWildernessHex } from "./WildernessHex.js";
import { renderWhenIdle } from "./ui.js";
import { realmKnown } from "../actions/solo.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * @param {{when?: object|null}} spark One kept in a hex.
 * @returns {string|null} When in the game it was rolled, as the hex's windows show it.
 */
export const sparkWhen = (spark) => (spark.when ? t("hexLore.when", { when: calendarLabel(spark.when) }) : null);

/**
 * What one hex holds (p19). A Hex is a whole country in little, and what
 * fills it is the Referee's to improvise, so this is where they roll the Spark
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
			rollTable: HexLore.#onRollTable,
			rollSet: HexLore.#onRollSet,
			forget: HexLore.#onForget,
			tell: HexLore.#onTell,
			wilderness: HexLore.#onWilderness,
			act: HexLore.#onAct,
			browse: HexLore.#onBrowse,
			flipBook: () => openBookFlip(),
			rollPerson: HexLore.#onRollPerson,
			rollHolding: HexLore.#onRollHolding,
			markVisited: HexLore.#onMarkVisited,
			forgetVisits: HexLore.#onForgetVisits,
			mood: HexLore.#onMood,
			cruise: HexLore.#onCruise
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

		const scene = this.scene;
		const entry = getRealm(scene);
		if (!entry || !this.hex) return Object.assign(context, { missing: true });

		const { realm } = entry;
		const hex = this.hex;
		const terrain = terrainAt(realm, sceneGeometry(scene), hex);
		const record = getHexRecord(scene, hex);
		const visits = getHexVisits(scene, hex);
		const pages = this.#index?.spark ?? [];

		let notice = null;
		if (!this.#index) notice = t("spark.noIndex");
		else if (!pages.length) notice = t("spark.noText");

		return Object.assign(context, {
			heading: t("realm.hex", hex),
			terrain: terrain ? t(`realm.terrain.${TERRAIN[terrain - 1]}`) : null,
			// Played alone, only what the Company has found here.
			features: this.#featuresHere(realmKnown(realm), hex),
			// A Holding's Local Mood is rolled as the Company arrives (p18).
			holding: Boolean(featureAt(realm, hex).holding),
			// A proper road runs through it, which a Cruise can take (p18).
			road: hasRoad(scene, hex),
			// Whether the Company has been here, as the GM Toolkit's Journey counts it.
			visited: Boolean(visits),
			visits: visits ? visitsLabel(visits) : t("hexLore.notVisited"),
			note: record?.note ?? "",
			// Newest first: the roll just made is the one being read.
			sparks: (record?.sparks ?? []).map((spark) => ({
				id: spark.id,
				table: spark.table,
				prompt: spark.prompt,
				when: sparkWhen(spark)
			})).reverse(),
			notice,
			pages: pages
				.map((page) => ({
					label: page.name || t(`spark.pages.${page.key}`),
					tables: (page.tables ?? []).map((table, index) => ({ value: `${page.key}:${index}`, name: table.name }))
				}))
				.filter(({ tables }) => tables.length)
		});
	}

	/**
	 * What the Realm already says stands in the hex, so the GM improvises around
	 * it rather than over it.
	 * @param {object} realm
	 * @param {{col: number, row: number}} hex
	 * @returns {string[]}
	 */
	#featuresHere(realm, hex) {
		const { holding, myth, landmark } = featureAt(realm, hex);
		const lines = [];
		if (holding) lines.push(holding.name || t(`realm.holdings.${holding.style}`));
		if (myth) {
			const { name, page } = mythEntry(this.#index, myth);
			const seen = t("realm.panel.omensSeen", { omen: myth.omen, count: OMEN_COUNT });
			lines.push(`${t("realm.panel.reference", { name, page })} — ${seen}`);
		}
		if (landmark) {
			const named = landmark.name || t(`realm.landmarks.${landmark.type}`);
			const seer = landmark.seer && seerEntry(this.#index, landmark.seer);
			lines.push(seer ? `${named} — ${t("realm.panel.reference", { name: seer.name, page: seer.page })}` : named);
		}
		return lines;
	}

	/* -------------------------------------------- */
	/*  Actions                                     */
	/* -------------------------------------------- */

	/**
	 * Only the note is a field, and it saves as it's typed.
	 * @this {HexLore}
	 */
	static async #onChangeForm(event, _form, formData) {
		if (!this.hex) return;
		if (event.target?.name === "road") return setRoad(this.scene, this.hex, Boolean(event.target.checked));
		if (event.target?.name !== "note") return;
		await writeHexNote(this.scene, this.hex, formData.object.note ?? "");
	}

	/** @this {HexLore} */
	static async #onRollTable() {
		const chosen = this.element.querySelector('[name="table"]')?.value ?? "";
		const [page, index] = chosen.split(":");
		if (!page || !index) return;
		await rollHexSpark({ scene: this.scene, hex: this.hex, page, index: Number(index) });
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

	/** @this {HexLore} */
	static #onRollSet() {
		return openWildernessHex({ scene: this.scene, hex: this.hex });
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
	static #onCruise() {
		return cruiseFrom({ scene: this.scene, hex: this.hex });
	}

	/** @this {HexLore} */
	static #onMood() {
		return rollRefereeTable("mood");
	}

	/** @this {HexLore} */
	static #onForgetVisits() {
		return openHexVisits({ scene: this.scene, hex: this.hex });
	}
}

/** @type {HexLore|null} */
let window_ = null;

/**
 * Show what a hex holds.
 * @param {object} options
 * @param {Scene} options.scene
 * @param {{col: number, row: number}} options.hex
 * @returns {HexLore}
 */
export function openHexLore({ scene, hex }) {
	window_ ??= new HexLore();
	window_.sceneId = scene.id;
	window_.hex = hex;
	window_.render({ force: true });
	return window_;
}

/**
 * Follow the GM to another hex, but only if they already have the window open.
 * Inspecting a hex shouldn't open a window they didn't ask for.
 * @param {object} options
 * @param {Scene} options.scene
 * @param {{col: number, row: number}} options.hex
 */
export function followHexLore({ scene, hex }) {
	if (!window_?.rendered) return;
	window_.sceneId = scene.id;
	window_.hex = hex;
	window_.render();
}

/**
 * Draw the window again after its hex changed, once the GM has finished typing.
 * @param {string} sceneId
 */
export function refreshHexLore(sceneId) {
	if (window_?.sceneId === sceneId) renderWhenIdle(window_);
}
