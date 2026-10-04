import { t } from "../chat/cards.js";
import { ARMOUR_KINDS, PROPERTY_TYPES } from "../config.js";
import { RARITIES } from "../rules/arms-and-goods.js";
import { ARMOUR_CONDITIONS } from "../rules/armour.js";
import { ALTERNATE_QUALITIES, DIE_SIZES, SPECIALIST_DICE, insteadOfChanges, insteadOfOptions } from "../rules/attack.js";
import { scarForRoll } from "../rules/scars.js";
import { ABILITY_NEEDS, ABILITY_POWERS, ATTACK_GRANTS, usesFrom } from "../rules/ability-uses.js";
import { AFFLICTION_TIMES } from "../rules/afflictions.js";
import { ABILITY_CADENCES, RESTOCK_CADENCES } from "../rules/restock.js";
import { VIRTUES } from "../rules/virtues.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";

const { HandlebarsApplicationMixin } = foundry.applications.api;
const { ItemSheetV2 } = foundry.applications.sheets;

/**
 * One sheet for every item type; the template shows the fields each type has.
 * Opened by `openNew`, it writes an item the actor doesn't have yet and only
 * adds it when the player saves.
 */
export class BastionlandItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
	static DEFAULT_OPTIONS = {
		// Not "bastionland-item": that is the class on an item's row in a sheet's
		// list, and its padding and rule would be painted around this window.
		classes: [SYSTEM_ID, "bastionland", "bastionland-item-window"],
		position: { width: 480, height: 640 },
		window: { resizable: true },
		form: { submitOnChange: true },
		actions: {
			deleteItem: BastionlandItemSheet.#onDeleteItem,
			readUses: BastionlandItemSheet.#onReadUses,
			saveAndClose: BastionlandItemSheet.#onSaveAndClose
		}
	};

	static PARTS = {
		sheet: {
			template: templatePath("item/item-sheet.hbs"),
			scrollable: [""]
		}
	};

	/**
	 * Open a sheet for an item an actor doesn't carry yet. The item is written in
	 * one go and only added when the player saves, so a + button pressed by
	 * mistake leaves the actor as it was.
	 * @param {Actor} actor The actor the item would belong to.
	 * @param {string} type The item type to write.
	 * @returns {BastionlandItemSheet} The sheet, already rendering.
	 */
	static openNew(actor, type) {
		const name = Item.implementation.defaultName({ type, parent: actor });
		// Unsaved and without an id, which is how Foundry tells a sheet that its
		// submission creates the document rather than updating one.
		const draft = new Item.implementation({ type, name }, { parent: actor });
		const sheet = new this({
			document: draft,
			canCreate: true,
			form: { submitOnChange: false, closeOnSubmit: true }
		});
		sheet.render({ force: true });
		return sheet;
	}

	/** Updates to the actor's other weapons, made once this one's change is written. */
	#partnerUpdates = [];

	/** @returns {boolean} Whether this sheet is writing an item that hasn't been added yet. */
	get isNew() {
		return !this.item.id;
	}

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const item = this.item;

		return Object.assign(context, {
			item,
			system: item.system,
			systemFields: item.system.schema.fields,
			typeLabel: game.i18n.localize(`TYPES.Item.${item.type}`),
			isNew: this.isNew,
			// An Ability, Passion or Scar is nothing you could hold, so it has no picture.
			hasPicture: !["ability", "passion", "scar"].includes(item.type),
			isWeapon: item.type === "weapon",
			isArmour: item.type === "armour",
			isScar: item.type === "scar",
			// A Humiliation settles on revenge, so it names whoever it's owed on (p9).
			byRevenge: item.type === "scar" && Boolean(scarForRoll(item.system.roll)?.byRevenge),
			isGear: item.type === "gear",
			// An Ability may be limited: so many uses, coming back at some time.
			isAbility: item.type === "ability",
			abilityCadenceOptions: Object.fromEntries(ABILITY_CADENCES.map((key) => [key, t(`ability.per.${key || "none"}`)])),
			lastingDieOptions: { "": t("ability.noLastingDie"), ...Object.fromEntries(DIE_SIZES.map((faces) => [`d${faces}`, `d${faces}`])) },
			abilityGrants: item.type === "ability"
				? ATTACK_GRANTS.map((key) => ({ key, label: t(`attack.grant.${key}`), hint: t(`attack.grant.${key}Hint`), checked: item.system.grants[key] }))
				: [],
			// What else it can do: roll a joint Attack again, ward an ally, flip a coin, etch a rune.
			abilityPowers: item.type === "ability"
				? ABILITY_POWERS.map((key) => ({ key, label: t(`ability.powers.${key}`), hint: t(`ability.powers.${key}Hint`), checked: item.system[key] }))
				: [],
			// The only kind of Attack an Ability is used in (p68, p92).
			needsOptions: Object.fromEntries(ABILITY_NEEDS.map((key) => [key, t(`ability.needs.${key || "any"}`)])),
			// The Virtue a possession costs should something befall it (p62).
			lossVirtueOptions: { "": t("item.lossNone"), ...Object.fromEntries(VIRTUES.map((key) => [key, t(`virtues.${key}.abbr`)])) },
			// A weapon's Damage that burns on each round, or each day (p173).
			lingersOptions: { "": t("item.lingersNever"), ...Object.fromEntries(AFFLICTION_TIMES.map((key) => [key, t(`afflictions.when.${key}`)])) },
			// Weapons, armour and gear can be rare, counted, restocked and broken.
			isPossession: PROPERTY_TYPES.includes(item.type),
			insteadOf: this.#insteadOf(),
			alternateQualities: item.type === "weapon"
				? ALTERNATE_QUALITIES.map((key) => ({ key, label: t(`item.${key}`), hint: t(`item.${key}Hint`), checked: item.system.alternate[key] }))
				: [],
			conditionOptions: Object.fromEntries(ARMOUR_CONDITIONS.map((key) => [key, t(`item.conditions.${key || "always"}`)])),
			rarityOptions: { "": t("item.noRarity"), ...Object.fromEntries(RARITIES.map((key) => [key, t(`goods.rarities.${key}`)])) },
			restockOptions: Object.fromEntries(RESTOCK_CADENCES.map((key) => [key, t(`item.restocks.${key || "never"}`)])),
			kindOptions: Object.fromEntries(ARMOUR_KINDS.map((key) => [key, game.i18n.localize(`bastionland.item.kinds.${key}`)])),
			specialistOptions: { "": t("item.notSpecialist"), ...Object.fromEntries(SPECIALIST_DICE.map((die) => [die, `+${die}`])) },
			remedyOptions: { "": t("item.notRemedy"), ...Object.fromEntries(VIRTUES.map((key) => [key, t(`virtues.${key}.label`)])) },
			enrichedDescription: await foundry.applications.ux.TextEditor.implementation.enrichHTML(item.system.description, {
				secrets: item.isOwner,
				relativeTo: item
			})
		});
	}

	/**
	 * The actor's other weapons, as the "Instead of" choice weighs them.
	 * @returns {import("../rules/attack.js").EitherWeapon[]}
	 */
	#otherWeapons() {
		return (this.item.actor?.items ?? [])
			.filter((each) => each.type === "weapon" && each.id !== this.item.id)
			.map((each) => ({ id: each.id, name: each.name, either: each.system.either }));
	}

	/**
	 * Which of an NPC's other attacks this one is used instead of, as the book
	 * prints "Pound (2d12) or sweep (d12 blast)", so an Attack uses only one of
	 * them. A Knight's weapons have their second way to fight instead.
	 * @returns {{options: Record<string, string>, selected: string}|null} Null where there's nothing to choose.
	 */
	#insteadOf() {
		if (this.item.type !== "weapon" || !this.item.actor || this.item.actor.type === "knight") return null;
		const others = this.#otherWeapons();
		if (!others.length) return null;
		const { options, selected } = insteadOfOptions({ id: this.item.id, either: this.item.system.either }, others);
		return { options: { "": t("item.insteadOfNone"), ...Object.fromEntries(options.map(({ key, label }) => [key, label])) }, selected };
	}

	/**
	 * Fill in an Ability's uses from its own words: "twice per day".
	 * @this {BastionlandItemSheet}
	 */
	static async #onReadUses() {
		const uses = usesFrom(this.item.system.description);
		if (!uses.restock) {
			ui.notifications.info(t("ability.noUsesRead", { name: this.item.name }));
			return;
		}
		const changes = { "system.quantity": uses.quantity, "system.restock": uses.restock };
		// One not yet added is written when the window is saved.
		if (this.isNew) {
			this.item.updateSource(changes);
			await this.render();
		} else await this.item.update(changes);
	}

	/**
	 * Delete the item, once its owner has confirmed. Foundry shuts the window
	 * itself when the document goes.
	 * @this {BastionlandItemSheet}
	 */
	static #onDeleteItem() {
		return this.item.deleteDialog();
	}

	/**
	 * Save and shut the window. An item the actor already carries writes every
	 * change as it's made, so this only catches whatever is still in the form.
	 * @this {BastionlandItemSheet}
	 */
	static async #onSaveAndClose() {
		await this.submit();
		return this.close();
	}

	/**
	 * The "Instead of" choice becomes this weapon's mark, and whatever the
	 * attack picked or the one left behind needs changing to match.
	 * @inheritDoc
	 */
	_processFormData(event, form, formData) {
		const data = super._processFormData(event, form, formData);
		if (!("insteadOf" in data)) return data;
		const pick = String(data.insteadOf ?? "");
		delete data.insteadOf;
		const { either, others } = insteadOfChanges({ id: this.item.id, either: this.item.system.either }, this.#otherWeapons(), pick);
		data.system = { ...data.system, either };
		this.#partnerUpdates = others;
		return data;
	}

	/** @inheritDoc */
	async _processSubmitData(event, form, submitData, options) {
		await super._processSubmitData(event, form, submitData, options);
		const updates = this.#partnerUpdates;
		this.#partnerUpdates = [];
		if (updates.length && this.item.actor) await this.item.actor.updateEmbeddedDocuments("Item", updates);
	}

	/** @inheritDoc */
	_prepareSubmitData(event, form, formData, updateData) {
		const submitData = super._prepareSubmitData(event, form, formData, updateData);
		// The form has no field for the type, and creating the item needs one.
		if (this.isNew) submitData.type = this.item.type;
		return submitData;
	}
}
