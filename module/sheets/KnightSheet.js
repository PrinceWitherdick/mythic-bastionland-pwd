import { attack } from "../actions/attack.js";
import { takeDamage } from "../actions/damage.js";
import { performFeat } from "../actions/feats.js";
import { rest, restoreVirtue } from "../actions/recovery.js";
import { rollSave } from "../actions/saves.js";
import { rollScar } from "../actions/scars.js";
import { AGES, FEATS, GAMBITS, PROPERTY_TYPES } from "../config.js";
import { RANKS } from "../rules/glory.js";
import { VIRTUES } from "../rules/virtues.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ActorSheetV2 } = foundry.applications.sheets;

const localize = (key) => game.i18n.localize(`bastionland.${key}`);
const format = (key, data) => game.i18n.format(`bastionland.${key}`, data);

/** Conditions a player marks by hand, keyed to the boolean they toggle. */
const MARKED_CONDITIONS = Object.freeze(["fatigued", "exposed", "mortalWound"]);

/** Conditions that follow from a Virtue at 0 and cannot be toggled. */
const DERIVED_CONDITIONS = Object.freeze(["exhausted", "impaired"]);

/** The Knight character sheet, laid out after the official printed sheet. */
export class KnightSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
	static DEFAULT_OPTIONS = {
		classes: [SYSTEM_ID, "bastionland", "bastionland-sheet"],
		position: { width: 860, height: 920 },
		window: { resizable: true },
		form: { submitOnChange: true },
		actions: {
			rollSave: KnightSheet.#onRollSave,
			performFeat: KnightSheet.#onPerformFeat,
			attack: KnightSheet.#onAttack,
			takeDamage: KnightSheet.#onTakeDamage,
			rest: KnightSheet.#onRest,
			restore: KnightSheet.#onRestore,
			rollScar: KnightSheet.#onRollScar,
			setAge: KnightSheet.#onSetAge,
			toggleCondition: KnightSheet.#onToggleCondition,
			createItem: KnightSheet.#onCreateItem,
			editItem: KnightSheet.#onEditItem,
			deleteItem: KnightSheet.#onDeleteItem,
			toggleEquipped: KnightSheet.#onToggleEquipped
		}
	};

	static PARTS = {
		sheet: {
			template: templatePath("actor/knight-sheet.hbs"),
			scrollable: [""]
		}
	};

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const actor = this.actor;
		const system = actor.system;
		const items = actor.items.contents.sort((a, b) => a.sort - b.sort);
		const ofTypes = (...types) => items.filter((item) => types.includes(item.type));
		const prepareAll = (list) => Promise.all(list.map((item) => this.#prepareItem(item)));

		return Object.assign(context, {
			actor,
			system,
			systemFields: system.schema.fields,
			virtues: VIRTUES.map((key) => ({
				key,
				abbr: localize(`virtues.${key}.abbr`),
				tail: localize(`virtues.${key}.tail`),
				label: localize(`virtues.${key}.label`),
				hint: localize(`virtues.${key}.hint`),
				value: system.virtues[key].value,
				max: system.virtues[key].max,
				recovery: localize(`recovery.${key}`),
				rollLabel: format("sheet.rollSave", { virtue: localize(`virtues.${key}.label`) }),
				restoreLabel: format("recovery.restore", { virtue: localize(`virtues.${key}.label`) })
			})),
			ages: AGES.map((key) => ({ key, label: localize(`age.${key}`), active: system.age === key })),
			ranks: RANKS.map((rank) => ({
				key: rank.key,
				glory: rank.glory,
				label: localize(`rank.${rank.key}`),
				active: system.rank === rank.key
			})),
			nextRank: system.nextRank
				? format("sheet.toNextRank", { needed: system.nextRank.needed, rank: localize(`rank.${system.nextRank.key}`) })
				: localize("sheet.worthiest"),
			conditions: [
				...MARKED_CONDITIONS.map((key) => ({ key, toggle: true })),
				...DERIVED_CONDITIONS.map((key) => ({ key, toggle: false }))
			].map((condition) => ({
				...condition,
				active: system.conditions[condition.key],
				label: localize(`conditions.${condition.key}.label`),
				hint: localize(`conditions.${condition.key}.hint`)
			})),
			propertyTypes: PROPERTY_TYPES.map((type) => ({ type, label: game.i18n.localize(`TYPES.Item.${type}`) })),
			property: await prepareAll(ofTypes(...PROPERTY_TYPES)),
			abilities: await prepareAll(ofTypes("ability")),
			passions: await prepareAll(ofTypes("passion")),
			scars: await prepareAll(ofTypes("scar")),
			feats: FEATS.map(({ key, virtue }) => ({
				key,
				name: localize(`feats.${key}.name`),
				summary: localize(`feats.${key}.summary`),
				cost: format("feats.saveOrFatigue", { virtue: localize(`virtues.${virtue}.abbr`) })
			})),
			gambits: GAMBITS.map((key) => localize(`gambits.${key}`)),
			enrichedNotes: await this.#enrich(system.notes)
		});
	}

	/**
	 * @param {string} html
	 * @returns {Promise<string>}
	 */
	#enrich(html) {
		return foundry.applications.ux.TextEditor.implementation.enrichHTML(html, {
			secrets: this.actor.isOwner,
			relativeTo: this.actor
		});
	}

	/**
	 * Flatten an owned item into what a sheet row needs.
	 * @param {Item} item
	 */
	async #prepareItem(item) {
		return {
			id: item.id,
			name: item.name,
			img: item.img,
			type: item.type,
			tags: itemTags(item),
			equippable: typeof item.system.equipped === "boolean",
			equipped: item.system.equipped,
			description: await this.#enrich(item.system.description)
		};
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

	/** @this {KnightSheet} */
	static #onRollSave(_event, target) {
		return rollSave(this.actor, target.dataset.virtue);
	}

	/** @this {KnightSheet} */
	static #onPerformFeat(_event, target) {
		return performFeat(this.actor, target.dataset.feat);
	}

	/** @this {KnightSheet} */
	static #onAttack() {
		return attack(this.actor);
	}

	/** @this {KnightSheet} */
	static #onTakeDamage() {
		return takeDamage(this.actor);
	}

	/** @this {KnightSheet} */
	static #onRest() {
		return rest(this.actor);
	}

	/** @this {KnightSheet} */
	static #onRestore(_event, target) {
		return restoreVirtue(this.actor, target.dataset.virtue);
	}

	/** @this {KnightSheet} */
	static #onRollScar() {
		return rollScar(this.actor);
	}

	/** @this {KnightSheet} */
	static #onSetAge(_event, target) {
		return this.actor.update({ "system.age": target.dataset.age });
	}

	/** @this {KnightSheet} */
	static #onToggleCondition(_event, target) {
		const key = target.dataset.condition;
		if (!MARKED_CONDITIONS.includes(key)) return;
		return this.actor.update({ [`system.${key}`]: !this.actor.system[key] });
	}

	/** @this {KnightSheet} */
	static async #onCreateItem(_event, target) {
		const { type } = target.dataset;
		const name = Item.implementation.defaultName({ type, parent: this.actor });
		const [item] = await this.actor.createEmbeddedDocuments("Item", [{ type, name }]);
		item?.sheet.render({ force: true });
	}

	/** @this {KnightSheet} */
	static #onEditItem(_event, target) {
		this.#itemFrom(target)?.sheet.render({ force: true });
	}

	/** @this {KnightSheet} */
	static #onDeleteItem(_event, target) {
		return this.#itemFrom(target)?.deleteDialog();
	}

	/** @this {KnightSheet} */
	static #onToggleEquipped(_event, target) {
		const item = this.#itemFrom(target);
		return item?.update({ "system.equipped": !item.system.equipped });
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
	const qualities = (...keys) => keys.filter((key) => system[key]).map((key) => localize(`item.${key}`));

	switch (item.type) {
		case "weapon":
			return [system.damage, ...qualities("hefty", "long", "slow", "ranged")];
		case "armour":
			return [
				localize(`item.kinds.${system.kind}`),
				system.damage,
				`A${system.armour}`
			].filter(Boolean);
		default:
			return [];
	}
}
