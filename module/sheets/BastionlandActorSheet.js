import { attack } from "../actions/attack.js";
import { takeDamage } from "../actions/damage.js";
import { challengeToDuel } from "../actions/duel.js";
import { performFeat } from "../actions/feats.js";
import { rest, restoreVirtue, useRemedy } from "../actions/recovery.js";
import { rollSave } from "../actions/saves.js";
import { ArtPreviewMixin } from "../apps/art-preview.js";
import { t } from "../chat/cards.js";
import { FEATS } from "../config.js";
import { VIRTUES } from "../rules/virtues.js";
import { SYSTEM_ID } from "../system-id.js";
import { BastionlandItemSheet } from "./BastionlandItemSheet.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

/** Conditions a player marks by hand, keyed to the boolean they toggle. */
const MARKED_CONDITIONS = Object.freeze(["fatigued", "exposed", "mortalWound"]);

/** Conditions that follow from a Virtue at 0 and cannot be toggled. */
const DERIVED_CONDITIONS = Object.freeze(["exhausted", "impaired"]);

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
 * copy of the actor's picture on hover.
 */
export class BastionlandActorSheet extends ArtPreviewMixin(HandlebarsApplicationMixin(ActorSheetV2)) {
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
			createItem: BastionlandActorSheet.#onCreateItem,
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
			})),
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
			img: item.img,
			type: item.type,
			tags: itemTags(item),
			equippable: typeof item.system.equipped === "boolean",
			equipped: item.system.equipped,
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
		return performFeat(this.actor, target.dataset.feat);
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

	/** @this {BastionlandActorSheet} */
	static #onCreateItem(_event, target) {
		BastionlandItemSheet.openNew(this.actor, target.dataset.type);
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

/**
 * Short labels printed after an item's name, the way the book writes
 * "Polished mace (d8 hefty)" or "Kite shield (d4, A1)".
 * @param {Item} item
 * @returns {string[]}
 */
function itemTags(item) {
	const { system } = item;
	const qualities = (...keys) => keys.filter((key) => system[key]).map((key) => t(`item.${key}`));

	switch (item.type) {
		case "weapon":
			return [system.damage, ...qualities("hefty", "long", "slow", "heftyMounted", "ranged", "blast", "ignoresArmour", "trample")];
		case "armour":
			return [
				t(`item.kinds.${system.kind}`),
				system.damage,
				`A${system.armour}`
			].filter(Boolean);
		case "gear":
			return system.remedy ? [t("item.remedyTag", { virtue: t(`virtues.${system.remedy}.abbr`) })] : [];
		default:
			return [];
	}
}
