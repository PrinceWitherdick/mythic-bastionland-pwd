import { attack } from "../actions/attack.js";
import { takeDamage } from "../actions/damage.js";
import { challengeToDuel } from "../actions/duel.js";
import { performFeat, showFeat } from "../actions/feats.js";
import { itemTags, postItem } from "../actions/items.js";
import { splitName } from "../rules/text.js";
import { rest, restoreVirtue, useRemedy } from "../actions/recovery.js";
import { rollSave } from "../actions/saves.js";
import { ArtPreviewMixin } from "../apps/art-preview.js";
import { dismissGambitMark } from "../chat/attack-card.js";
import { t } from "../chat/cards.js";
import { marksOn } from "../chat/gambit-marks.js";
import { DERIVED_CONDITIONS, FEATS, MARKED_CONDITIONS } from "../config.js";
import { VIRTUES } from "../rules/virtues.js";
import { SYSTEM_ID } from "../system-id.js";
import { BastionlandItemSheet } from "./BastionlandItemSheet.js";
import { ViewableMixin } from "./viewable.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/** Marks the labelled buttons a sheet hangs in its window header. */
const HEADER_BUTTON = "bastionland-header-button";

/**
 * @typedef {object} HeaderButton
 * @property {string} action    One of the sheet's actions.
 * @property {string} icon      Font Awesome classes.
 * @property {string} label
 * @property {string} [tooltip]
 * @property {boolean} [muted]  Drawn faded, for something not set up yet.
 */

/**
 * Whether a first render is Create Actor opening the blank actor it has just
 * made. Foundry opens a new actor's sheet the same way whether the actor came
 * from Create Actor or arrived whole from a compendium, so the render context
 * alone doesn't tell them apart. What does is what was asked for: the Create
 * Actor form sends a name, a type and a folder and nothing else, while an actor
 * that arrives whole brings its own system data, items and effects with it.
 * Offering the book's choices over one of those would paint over it.
 * @param {object} options The render options.
 * @returns {boolean}
 */
function isBlankNewActor(options) {
	if (options?.renderContext !== "createActor") return false;
	const data = options.renderData ?? {};
	return !data.system && !data.items?.length && !data.effects?.length;
}

/**
 * What the Knight, NPC and Structure sheets share: Saves, Feats, Attacks, Damage and
 * recovery, conditions, notes, the items a character carries, and a larger
 * copy of the actor's picture on hover. Controls marked `data-viewable` stay
 * live for someone who can only view the sheet.
 */
export class BastionlandActorSheet extends ViewableMixin(ArtPreviewMixin(HandlebarsApplicationMixin(ActorSheetV2))) {
	static DEFAULT_OPTIONS = {
		classes: [SYSTEM_ID, "bastionland", "bastionland-sheet"],
		window: { resizable: true },
		form: { submitOnChange: true },
		actions: {
			rollSave: BastionlandActorSheet.#onRollSave,
			performFeat: BastionlandActorSheet.#onPerformFeat,
			attack: BastionlandActorSheet.#onAttack,
			duel: BastionlandActorSheet.#onDuel,
			takeDamage: BastionlandActorSheet.#onTakeDamage,
			rest: BastionlandActorSheet.#onRest,
			restore: BastionlandActorSheet.#onRestore,
			toggleCondition: BastionlandActorSheet.#onToggleCondition,
			clearMark: BastionlandActorSheet.#onClearMark,
			createItem: BastionlandActorSheet.#onCreateItem,
			postItem: BastionlandActorSheet.#onPostItem,
			editItem: BastionlandActorSheet.#onEditItem,
			deleteItem: BastionlandActorSheet.#onDeleteItem,
			toggleEquipped: BastionlandActorSheet.#onToggleEquipped,
			useRemedy: BastionlandActorSheet.#onUseRemedy
		}
	};

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const actor = this.actor;
		const system = actor.system;

		return Object.assign(context, {
			actor,
			system,
			systemFields: system.schema.fields,
			// A Structure has none.
			virtues: (system.virtues ? VIRTUES : []).map((key) => ({
				key,
				abbr: t(`virtues.${key}.abbr`),
				tail: t(`virtues.${key}.tail`),
				label: t(`virtues.${key}.label`),
				hint: t(`virtues.${key}.hint`),
				value: system.virtues[key].value,
				max: system.virtues[key].max,
				recovery: t(`recovery.${key}`),
				rollLabel: t("sheet.rollSave", { virtue: t(`virtues.${key}.label`) }),
				restoreLabel: t("recovery.restore", { virtue: t(`virtues.${key}.label`) })
			})),
			conditions: [
				...MARKED_CONDITIONS.map((key) => ({ key, toggle: true })),
				...DERIVED_CONDITIONS.map((key) => ({ key, toggle: false }))
			].map((condition) => ({
				...condition,
				active: system.conditions[condition.key],
				label: t(`conditions.${condition.key}.label`),
				hint: t(`conditions.${condition.key}.hint`)
			})).concat(marksOn(actor).map((mark) => ({
				key: mark.key,
				dismiss: true,
				label: mark.label,
				hint: mark.hint,
				messageId: mark.messageId,
				index: mark.index
			}))),
			feats: FEATS.filter(({ key }) => system.knowsFeat(key)).map(({ key, virtue }) => ({
				key,
				name: t(`feats.${key}.name`),
				summary: t(`feats.${key}.summary`),
				cost: t("feats.saveOrFatigue", { virtue: t(`virtues.${virtue}.abbr`) })
			})),
			// Foundry's placeholder has nothing worth enlarging, so it gets no data-name and no preview.
			hasArt: Boolean(actor.img) && actor.img !== Actor.implementation.DEFAULT_ICON,
			enrichedNotes: await this._enrich(system.notes)
		});
	}

	/** @override */
	async _onFirstRender(context, options) {
		await super._onFirstRender(context, options);
		if (isBlankNewActor(options) && this.isEditable) this._chooseFromBook();
	}

	/**
	 * Offer the book's choices for an actor Create Actor has just made. Sheets
	 * with a chooser open it.
	 */
	_chooseFromBook() {}

	/**
	 * Labelled buttons for the window header, left of Foundry's own controls,
	 * for what's done to the sheet itself rather than in play, such as filling
	 * it in from the book.
	 * @returns {HeaderButton[]}
	 */
	_headerButtons() {
		return [];
	}

	/** @override */
	async _onRender(context, options) {
		await super._onRender(context, options);
		this.refreshHeaderButtons();
	}

	/**
	 * Hang the header buttons afresh, since which are offered, and what they
	 * read, follows the actor, and on a Knight's sheet the Domain they rule.
	 */
	refreshHeaderButtons() {
		const header = this.element?.querySelector(".window-header");
		if (!header) return;
		const doc = header.ownerDocument;
		header.querySelectorAll(`.${HEADER_BUTTON}`).forEach((button) => button.remove());
		const controls = header.querySelector("[data-action=toggleControls], [data-action=close]");
		for (const { action, icon, label, tooltip, muted } of this._headerButtons()) {
			const button = doc.createElement("button");
			button.type = "button";
			button.className = `header-control ${HEADER_BUTTON}`;
			button.classList.toggle(`${HEADER_BUTTON}--muted`, Boolean(muted));
			button.dataset.action = action;
			if (tooltip) button.dataset.tooltip = tooltip;
			const glyph = doc.createElement("i");
			glyph.className = icon;
			glyph.inert = true;
			const text = doc.createElement("span");
			text.textContent = label;
			button.append(glyph, text);
			if (controls) controls.before(button);
			else header.append(button);
		}
	}

	/**
	 * @param {string} html
	 * @returns {Promise<string>}
	 */
	_enrich(html) {
		return foundry.applications.ux.TextEditor.implementation.enrichHTML(html, {
			secrets: this.actor.isOwner,
			relativeTo: this.actor
		});
	}

	/**
	 * Owned items flattened into what a sheet row needs, in sort order.
	 * @param {...string} types Item types to include. None includes every item.
	 */
	_prepareItems(...types) {
		const items = this.actor.items.contents
			.filter((item) => !types.length || types.includes(item.type))
			.sort((a, b) => a.sort - b.sort);
		return Promise.all(items.map(async (item) => ({
			id: item.id,
			name: item.name,
			...splitName(item.name),
			img: item.img,
			type: item.type,
			tags: itemTags(item),
			equippable: typeof item.system.equipped === "boolean",
			equipped: item.system.equipped,
			// Armour's toggle is a shield, as the Armour total is: on when the piece counts toward it right now.
			equipIcon: item.type === "armour" ? "fa-shield-halved" : "fa-hand-fist",
			equipLabel: item.type === "armour" ? t(item.system.equipped ? "sheet.armourOn" : "sheet.armourOff") : t("sheet.equip"),
			remedyLabel: item.system.remedy ? t("remedy.use", { virtue: t(`virtues.${item.system.remedy}.abbr`) }) : null,
			description: await this._enrich(item.system.description)
		})));
	}

	/**
	 * @param {HTMLElement} target
	 * @returns {Item|undefined}
	 */
	#itemFrom(target) {
		return this.actor.items.get(target.closest("[data-item-id]")?.dataset.itemId);
	}

	/* -------------------------------------------- */
	/*  Actions                                     */
	/* -------------------------------------------- */

	/** @this {BastionlandActorSheet} */
	static #onRollSave(_event, target) {
		return rollSave(this.actor, target.dataset.virtue);
	}

	/** @this {BastionlandActorSheet} */
	static #onPerformFeat(_event, target) {
		const { feat } = target.dataset;
		// Only someone who can act for the actor makes the Save. A viewer shows the Feat.
		return this.isEditable ? performFeat(this.actor, feat) : showFeat(this.actor, feat);
	}

	/** @this {BastionlandActorSheet} */
	static #onAttack() {
		return attack(this.actor);
	}

	/** @this {BastionlandActorSheet} */
	static #onDuel() {
		return challengeToDuel(this.actor);
	}

	/** @this {BastionlandActorSheet} */
	static #onTakeDamage() {
		return takeDamage(this.actor);
	}

	/** @this {BastionlandActorSheet} */
	static #onRest() {
		return rest(this.actor);
	}

	/** @this {BastionlandActorSheet} */
	static #onRestore(_event, target) {
		return restoreVirtue(this.actor, target.dataset.virtue);
	}

	/** @this {BastionlandActorSheet} */
	static #onToggleCondition(_event, target) {
		const key = target.dataset.condition;
		if (!MARKED_CONDITIONS.includes(key)) return;
		return this.actor.update({ [`system.${key}`]: !this.actor.system[key] });
	}

	/**
	 * Clear a landed Gambit's mark once it has run its course, for a fight that
	 * was never a Combat and so has no turn order to lapse it.
	 * @this {BastionlandActorSheet}
	 */
	static #onClearMark(_event, target) {
		const { message, gambit } = target.dataset;
		return dismissGambitMark(this.actor, message, Number(gambit));
	}

	/** @this {BastionlandActorSheet} */
	static #onCreateItem(_event, target) {
		BastionlandItemSheet.openNew(this.actor, target.dataset.type);
	}

	/** @this {BastionlandActorSheet} */
	static #onPostItem(_event, target) {
		return postItem(this.actor, this.#itemFrom(target));
	}

	/** @this {BastionlandActorSheet} */
	static #onEditItem(_event, target) {
		this.#itemFrom(target)?.sheet.render({ force: true });
	}

	/** @this {BastionlandActorSheet} */
	static #onDeleteItem(_event, target) {
		return this.#itemFrom(target)?.deleteDialog();
	}

	/** @this {BastionlandActorSheet} */
	static #onToggleEquipped(_event, target) {
		const item = this.#itemFrom(target);
		return item?.update({ "system.equipped": !item.system.equipped });
	}

	/** @this {BastionlandActorSheet} */
	static #onUseRemedy(_event, target) {
		return useRemedy(this.actor, this.#itemFrom(target));
	}
}

