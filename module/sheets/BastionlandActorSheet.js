import { attack } from "../actions/attack.js";
import { takeDamage } from "../actions/damage.js";
import { challengeToDuel } from "../actions/duel.js";
import { performFeat, showFeat } from "../actions/feats.js";
import { armourConditionText, itemTags, postItem, quantityText } from "../actions/items.js";
import { armourCounts, armourWorn, displacedArmour, SITUATION_CONDITIONS } from "../rules/armour.js";
import { countAfter, isAtHand, isCounted, isUsedUp } from "../rules/restock.js";
import { comparePropertyPlace, samePropertyPlace } from "../rules/property-tab.js";
import { splitName } from "../rules/text.js";
import { rest, restoreVirtue, useRemedy } from "../actions/recovery.js";
import { rollSave } from "../actions/saves.js";
import { ArtPreviewMixin } from "../apps/art-preview.js";
import { dismissGambitMark } from "../chat/attack-card.js";
import { t } from "../chat/cards.js";
import { marksOn } from "../chat/gambit-marks.js";
import { DERIVED_CONDITIONS, FEATS, MARKED_CONDITIONS, PROPERTY_TYPES } from "../config.js";
import { VIRTUES } from "../rules/virtues.js";
import { SYSTEM_ID } from "../system-id.js";
import { BastionlandItemSheet } from "./BastionlandItemSheet.js";
import { ViewableMixin } from "./viewable.js";
import { afflictionLabel, cureAffliction, sufferAffliction } from "../actions/afflictions.js";

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
 * What the Knight, NPC and Structure sheets share: Saves, Feats, Attacks, Damage and
 * recovery, conditions, notes, the items a character carries, and a larger
 * copy of the actor's picture on hover. Controls marked `data-viewable` stay
 * live for someone who can only view the sheet.
 */
export class BastionlandActorSheet extends ViewableMixin(ArtPreviewMixin(HandlebarsApplicationMixin(ActorSheetV2))) {
	/** Whether the sheet lists owned things in their Property place rather than their own order. */
	static PROPERTY_ORDER = false;

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
			sufferAffliction: BastionlandActorSheet.#onSufferAffliction,
			cureAffliction: BastionlandActorSheet.#onCureAffliction,
			createItem: BastionlandActorSheet.#onCreateItem,
			postItem: BastionlandActorSheet.#onPostItem,
			editItem: BastionlandActorSheet.#onEditItem,
			toggleEquipped: BastionlandActorSheet.#onToggleEquipped,
			toggleHolds: BastionlandActorSheet.#onToggleHolds,
			adjustCount: BastionlandActorSheet.#onAdjustCount,
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
			}))).concat((system.afflictions ?? []).map((affliction) => ({
				key: affliction.id,
				affliction: true,
				label: afflictionLabel(affliction),
				hint: t("afflictions.hint"),
				cureHint: t("afflictions.cure")
			}))),
			feats: FEATS.filter(({ key }) => system.knowsFeat(key)).map(({ key, virtue }) => ({
				key,
				name: t(`feats.${key}.name`),
				summary: t(`feats.${key}.summary`),
				cost: t("feats.saveOrFatigue", { virtue: t(`virtues.${virtue}.abbr`) })
			})),
			armourTip: this.#armourTip(),
			// Foundry's placeholder has nothing worth enlarging, so it gets no data-name and no preview.
			hasArt: Boolean(actor.img) && actor.img !== Actor.implementation.DEFAULT_ICON,
			enrichedNotes: await this._enrich(system.notes)
		});
	}

	/** The hooks listened on while the window is open, by the name each was put on. */
	#watched = [];

	/**
	 * Listen on some of Foundry's hooks for as long as this window is open, and
	 * no longer. A hook rather than a document's `apps`, since deleting a
	 * document closes every window in its `apps`; taken off again in `_onClose`,
	 * so a sheet opened and shut over and over leaves nothing behind.
	 * @param {string[]} names Hooks to listen on.
	 * @param {Function} handler Called for each of them.
	 */
	_watchHooks(names, handler) {
		for (const name of names) this.#watched.push([name, Hooks.on(name, handler)]);
	}

	/** @override */
	_onClose(options) {
		super._onClose(options);
		for (const [name, id] of this.#watched) Hooks.off(name, id);
		this.#watched = [];
	}

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
		return this.#prepareItemRows(this.#itemsOf(types).sort((a, b) => a.sort - b.sort));
	}

	/**
	 * Owned items as _prepareItems gives them, in Property order: weapons lead,
	 * biggest die first, then shields, then armour from the head outward, then the rest.
	 * @param {...string} types Item types to include. None includes every item.
	 */
	_preparePropertyItems(...types) {
		return this.#prepareItemRows(this.#itemsOf(types).sort(comparePropertyPlace));
	}

	/**
	 * Property keeps its place (see _preparePropertyItems), so a row dropped among
	 * things of another place would only jump back: it stays put, and says why.
	 * Among things of its own place it sorts where it's dropped.
	 * @override
	 */
	_onSortItem(event, item) {
		const target = this.actor.items.get(event.target.closest("[data-item-id]")?.dataset.itemId);
		const source = this.actor.items.get(item.id);
		if (this.constructor.PROPERTY_ORDER && source && target && !samePropertyPlace(source, target)) {
			ui.notifications.info(t("property.keepsPlace", { name: source.name }));
			return;
		}
		return super._onSortItem(event, item);
	}

	/**
	 * @param {string[]} types
	 * @returns {Item[]}
	 */
	#itemsOf(types) {
		return this.actor.items.contents.filter((item) => !types.length || types.includes(item.type));
	}

	/**
	 * What the Armour total's hover says: each piece worn, in Property order,
	 * with its Armour, or that it doesn't count right now.
	 * @returns {string}
	 */
	#armourTip() {
		const pieces = armourWorn(this.#itemsOf(["armour"]).sort(comparePropertyPlace), this.actor.system.conditions ?? {});
		if (!pieces.length) return t("sheet.armourNone");
		return t("sheet.armourTip", {
			pieces: pieces.map(({ name, armour, counts }) => t(counts ? "sheet.armourPiece" : "sheet.armourPieceIdle", { name, armour })).join(", ")
		});
	}

	/**
	 * @param {Item[]} items
	 * @returns {Promise<object[]>}
	 */
	#prepareItemRows(items) {
		const wearer = this.actor.system.conditions ?? {};
		return Promise.all(items.map(async (item) => {
			const { system } = item;
			const armour = item.type === "armour";
			// Worn, but its Armour doesn't count right now: off its horse, say, or broken.
			const idle = armour && system.equipped && !armourCounts(system, wearer);
			const situational = armour && SITUATION_CONDITIONS.includes(system.condition);
			const counted = isCounted(system);
			return {
				id: item.id,
				name: item.name,
				...splitName(item.name),
				img: item.img,
				type: item.type,
				// The row shows the count with its own buttons.
				tags: itemTags(item, { counted: false }),
				equippable: typeof system.equipped === "boolean",
				equipped: system.equipped,
				// Broken, or all used: faded until mended or restocked.
				unusable: PROPERTY_TYPES.includes(item.type) && !isAtHand(system),
				idle,
				// Armour's toggle is a shield, as the Armour total is: on when the piece counts toward it right now.
				equipIcon: armour ? "fa-shield-halved" : "fa-hand-fist",
				equipLabel: armour ? t(idle ? "sheet.armourIdle" : system.equipped ? "sheet.armourOn" : "sheet.armourOff") : t("sheet.equip"),
				holds: situational ? {
					active: system.holds,
					label: t(system.holds ? "sheet.holdsOn" : "sheet.holdsOff", {
						counts: t(armourCounts({ ...system, equipped: true, broken: false }, wearer) ? "sheet.armourCounts" : "sheet.armourDoesNotCount")
					}),
					text: armourConditionText(system)
				} : null,
				count: counted ? {
					text: quantityText(system),
					cannotUse: isUsedUp(system),
					cannotAdd: Number.isInteger(system.quantity.max) && system.quantity.value >= system.quantity.max
				} : null,
				remedyLabel: system.remedy && isAtHand(system) ? t("remedy.use", { virtue: t(`virtues.${system.remedy}.abbr`) }) : null,
				description: await this._enrich(system.description)
			};
		}));
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
		// The pill flips what it shows, not the mark beneath: Wounded lapses once VIG is whole, and
		// CLA 0 Exposes whatever is marked, so a click there mustn't leave a hidden mark for later.
		const on = this.actor.system.conditions[key];
		return this.actor.update({ [`system.${key}`]: !on });
	}

	/**
	 * Take an affliction's toll now, when the Referee says it's due.
	 * @this {BastionlandActorSheet}
	 */
	static #onSufferAffliction(_event, target) {
		return sufferAffliction(this.actor, target.dataset.affliction);
	}

	/**
	 * Cure an affliction, which takes no more.
	 * @this {BastionlandActorSheet}
	 */
	static #onCureAffliction(_event, target) {
		return cureAffliction(this.actor, target.dataset.affliction);
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

	/**
	 * Put a piece on or take it off. Only one of each armour type can be worn at
	 * once (p12), so putting on a second coat takes the first off.
	 * @this {BastionlandActorSheet}
	 */
	static async #onToggleEquipped(_event, target) {
		const item = this.#itemFrom(target);
		if (!item) return;
		const putOn = !item.system.equipped;
		const displaced = putOn ? displacedArmour(this.actor.items.contents, item.id) : [];
		await this.actor.updateEmbeddedDocuments("Item", [
			{ _id: item.id, "system.equipped": putOn },
			...displaced.map((id) => ({ _id: id, "system.equipped": false }))
		]);
		for (const id of displaced) {
			ui.notifications.info(t("item.displaced", { name: this.actor.items.get(id)?.name, kind: t(`item.kinds.${item.system.kind}`).toLowerCase() }));
		}
	}

	/**
	 * Say whether the situation a piece of armour counts in, or doesn't, holds right now.
	 * @this {BastionlandActorSheet}
	 */
	static #onToggleHolds(_event, target) {
		const item = this.#itemFrom(target);
		return item?.update({ "system.holds": !item.system.holds });
	}

	/**
	 * Use one of something counted, or add one back.
	 * @this {BastionlandActorSheet}
	 */
	static #onAdjustCount(_event, target) {
		const item = this.#itemFrom(target);
		if (!item || !isCounted(item.system)) return;
		return item.update({ "system.quantity.value": countAfter(item.system.quantity, Number(target.dataset.by) || 0) });
	}

	/** @this {BastionlandActorSheet} */
	static #onUseRemedy(_event, target) {
		return useRemedy(this.actor, this.#itemFrom(target));
	}
}

