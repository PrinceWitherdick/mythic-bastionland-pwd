import { CITY_QUEST_HOOK, cityOmensSeen, resetCityQuest, rollCityOmen } from "../actions/city-quest.js";
import { awardGlory } from "../actions/glory.js";
import { editRealm, getRealm, isRealmScene } from "../actions/realm.js";
import { loadArtIndex, mythEntry } from "../book-art/art-index.js";
import { postCard, t } from "../chat/cards.js";
import { CITY_OMEN_COUNT, CITY_QUEST_END, cityQuestOver } from "../rules/city-quest.js";
import { OMEN_COUNT } from "../rules/realm.js";
import { setOmen } from "../rules/realm-edits.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { singletonOpener } from "./ui.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** Documents a Realm is read from, so a change to any of them may change its Myths. */
const REALM_DOCUMENT_HOOKS = Object.freeze(["createTile", "updateTile", "deleteTile", "updateScene"]);

/**
 * The Referee's tracker for the Omens of each Myth in a Realm (p27), and the
 * Omens of the City once the Company is worthy of the City Quest (p172). It
 * reads and writes the same Omen counts as the Realm's Hex panel and the
 * Wilderness Roll.
 */
export class MythsPanel extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		tag: "form",
		classes: [SYSTEM_ID, "bastionland", "bastionland-myths-window"],
		position: { width: 560, height: 760 },
		window: { title: "bastionland.myths.title", icon: "fa-solid fa-dragon", resizable: true },
		form: { handler: MythsPanel.#onChangeForm, submitOnChange: true, closeOnSubmit: false },
		actions: {
			omenStep: MythsPanel.#onOmenStep,
			nextOmen: MythsPanel.#onNextOmen,
			mythResolved: MythsPanel.#onMythResolved,
			rollCityOmen,
			resetCityQuest
		}
	};

	static PARTS = {
		panel: { template: templatePath("apps/myths-panel.hbs"), scrollable: [""] }
	};

	/** @type {string|null} The Realm Scene on show. */
	sceneId = null;

	/** @type {object|null|undefined} The art index: undefined until loaded, null if never imported. */
	#index;

	/** @type {[string, number][]} Hook ids to remove on close. */
	#hooks = [];

	/** @returns {Scene|null} The Realm on show: the one picked, the one on the canvas, or the first there is. */
	get scene() {
		const picked = game.scenes.get(this.sceneId);
		if (isRealmScene(picked)) return picked;
		return isRealmScene(canvas?.scene) ? canvas.scene : game.scenes.find(isRealmScene) ?? null;
	}

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		if (this.#index === undefined) this.#index = await loadArtIndex();
		const scene = this.scene;
		const realm = scene ? getRealm(scene)?.realm : null;
		const seen = cityOmensSeen();

		return Object.assign(context, {
			realms: game.scenes.filter(isRealmScene).map((candidate) => ({ id: candidate.id, name: candidate.name, selected: candidate.id === scene?.id })),
			myths: (realm?.myths ?? []).map((myth) => this.#mythContext(myth)),
			cityQuest: {
				seen: t("cityQuest.seen", { count: seen.length, end: CITY_QUEST_END }),
				omens: seen.map((omen) => ({ number: omen, text: this.#index?.cityQuest?.omens?.[omen - 1] ?? t("cityQuest.omen", { omen, count: CITY_OMEN_COUNT }) })),
				over: cityQuestOver(seen),
				empty: !seen.length,
				missingText: !this.#index?.cityQuest?.omens
			}
		});
	}

	/**
	 * @param {object} myth From the Realm.
	 * @returns {object} What the template shows for one Myth.
	 */
	#mythContext(myth) {
		const { name, page, entry } = mythEntry(this.#index, myth);
		return {
			number: myth.number,
			name,
			reference: t("realm.key.page", { page }),
			img: entry?.path ?? null,
			hidden: !myth.revealed,
			seen: t("realm.panel.omensSeen", { omen: myth.omen, count: OMEN_COUNT }),
			omens: Array.from({ length: OMEN_COUNT }, (_, index) => ({
				text: entry?.omens?.[index] ?? t("myths.omenNumber", { number: index + 1 }),
				seen: index < myth.omen,
				next: index === myth.omen
			})),
			noneSeen: myth.omen <= 0,
			complete: myth.omen >= OMEN_COUNT
		};
	}

	/** @override */
	async _onFirstRender(context, options) {
		await super._onFirstRender(context, options);
		// Redraw once a batch of Realm changes has landed, from this window or anywhere else.
		const redraw = foundry.utils.debounce(() => this.rendered && this.render(), 50);
		const onDocument = (document) => {
			const sceneId = document.documentName === "Scene" ? document.id : document.parent?.id;
			if (sceneId === this.scene?.id) redraw();
		};
		this.#hooks = [
			...REALM_DOCUMENT_HOOKS.map((name) => [name, Hooks.on(name, onDocument)]),
			[CITY_QUEST_HOOK, Hooks.on(CITY_QUEST_HOOK, redraw)]
		];
	}

	/** @override */
	_onClose(options) {
		super._onClose(options);
		for (const [name, id] of this.#hooks) Hooks.off(name, id);
		this.#hooks = [];
	}

	/**
	 * @param {HTMLElement} target
	 * @returns {object|null} The Myth a button belongs to, read afresh from the Realm.
	 */
	#mythFrom(target) {
		const number = Number(target.closest("[data-number]")?.dataset.number);
		const scene = this.scene;
		return (scene && getRealm(scene)?.realm.myths.find((myth) => myth.number === number)) ?? null;
	}

	/* -------------------------------------------- */
	/*  Actions                                     */
	/* -------------------------------------------- */

	/** @this {MythsPanel} */
	static #onChangeForm(_event, _form, formData) {
		const { scene } = formData.object;
		if (!scene || scene === this.sceneId) return;
		this.sceneId = scene;
		return this.render();
	}

	/** @this {MythsPanel} */
	static #onOmenStep(_event, target) {
		const myth = this.#mythFrom(target);
		const step = Number(target.dataset.step) || 0;
		if (!game.user.isGM || !myth) return;
		return editRealm(this.scene, (realm) => setOmen(realm, myth.number, myth.omen + step));
	}

	/**
	 * Count the Myth's next Omen as seen and show it to the GMs, as the Wilderness Roll would.
	 * @this {MythsPanel}
	 */
	static async #onNextOmen(_event, target) {
		const myth = this.#mythFrom(target);
		if (!game.user.isGM || !myth || myth.omen >= OMEN_COUNT) return;
		const omen = myth.omen + 1;
		await editRealm(this.scene, (realm) => setOmen(realm, myth.number, omen));
		const { name, page, entry } = mythEntry(this.#index, myth);
		await postCard(null, "omen", {
			title: `${myth.number}. ${name}`,
			tagline: t("realm.key.page", { page }),
			img: entry?.path ?? null,
			omen: t("realm.wilderness.omen", { omen, count: OMEN_COUNT }),
			text: entry?.omens?.[omen - 1] ?? null,
			hint: omen === OMEN_COUNT ? t("realm.wilderness.omensComplete") : null
		}, { mode: "gm" });
	}

	/** @this {MythsPanel} */
	static #onMythResolved() {
		return awardGlory("myth");
	}
}

/** Open the Myths tracker, bringing the window forward if it's already open. */
export const openMythsPanel = singletonOpener(MythsPanel);
