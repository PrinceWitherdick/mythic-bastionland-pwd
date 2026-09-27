import { ARMOUR_KINDS } from "../config.js";
import { RARITIES, specialistRarity } from "../rules/arms-and-goods.js";
import { ARMOUR_CONDITIONS } from "../rules/armour.js";
import { ALTERNATE_QUALITIES, SPECIALIST_DICE } from "../rules/attack.js";
import { bearsRemedies, overRemedyLimit } from "../rules/remedies.js";
import { RESTOCK_CADENCES } from "../rules/restock.js";
import { VIRTUES } from "../rules/virtues.js";
import { booleanField, countField, htmlField, textField } from "./fields.js";

const fields = foundry.data.fields;

/** A count left blank while nobody keeps one. */
const optionalCount = () => new fields.NumberField({ required: true, nullable: true, integer: true, min: 0, initial: null });

/** Fields every item type shares. */
class DescribedModel extends foundry.abstract.TypeDataModel {
	static defineSchema() {
		return { description: htmlField() };
	}
}

/**
 * What every possession has, weapon, armour or gear: how rare it is (Trade,
 * p12), how many are carried and whether they come round again, and whether
 * it has been broken.
 */
class PossessionModel extends DescribedModel {
	static defineSchema() {
		return {
			...super.defineSchema(),
			rarity: new fields.StringField({ required: true, blank: true, initial: "", choices: ["", ...RARITIES] }),
			// "3 javelins", "3 runic scrolls": blank while nobody counts them.
			quantity: new fields.SchemaField({ value: optionalCount(), max: optionalCount() }),
			// "Restock each new Season", "enough for one dose each day".
			restock: new fields.StringField({ required: true, blank: true, initial: "", choices: RESTOCK_CADENCES }),
			// Broken by a Strong Gambit (p10), or smashed: no use until mended.
			broken: booleanField()
		};
	}
}

/** A weapon, e.g. "Polished mace (d8 hefty)". */
export class WeaponModel extends PossessionModel {
	static defineSchema() {
		return {
			...super.defineSchema(),
			damage: new fields.StringField({ required: true, blank: false, initial: "d6" }),
			hefty: new fields.BooleanField({ initial: false }),
			long: new fields.BooleanField({ initial: false }),
			slow: new fields.BooleanField({ initial: false }),
			ranged: new fields.BooleanField({ initial: false }),
			// Cast attacks such as a sweep (d12 blast) or a scream that ignores armour.
			blast: new fields.BooleanField({ initial: false }),
			ignoresArmour: new fields.BooleanField({ initial: false }),
			// Its Damage never Slays or leaves anybody dying, as a Knight-Catcher's tremor-gun (p173).
			nonLethal: booleanField(),
			// A steed's trample, added to its rider's dice when charging enemies on foot (p10).
			trample: new fields.BooleanField({ initial: false }),
			// A lance counts as Hefty rather than Long when its wielder is mounted (p12).
			heftyMounted: new fields.BooleanField({ initial: false }),
			// A specialist weapon gains +d8 or +d10 in one situation, and is a category rarer (p12).
			specialist: new fields.SchemaField({
				die: new fields.StringField({ required: true, blank: true, initial: "", choices: ["", ...SPECIALIST_DICE] }),
				situation: textField()
			}),
			// Another way to fight with it, such as a bolt-guisarme's "d10 slow ranged", or
			// fang blades wielded as a pair. Blank damage means it has none.
			alternate: new fields.SchemaField({
				label: textField(),
				damage: textField(),
				...Object.fromEntries(ALTERNATE_QUALITIES.map((key) => [key, booleanField()]))
			}),
			// Each Attack with it uses one up, as a titan bead or an explosive is.
			usedUp: booleanField(),
			// A wooden weapon can be broken by a Strong Gambit (p10).
			wooden: booleanField(),
			equipped: new fields.BooleanField({ initial: true })
		};
	}

	/** Slow weapons are also Long (p12). */
	get isLong() {
		return this.long || this.slow;
	}

	/**
	 * Made a specialist weapon, it's one category rarer (p12), unless the same
	 * change says how rare it is.
	 * @override
	 */
	async _preUpdate(changes, options, user) {
		const allowed = await super._preUpdate(changes, options, user);
		if (allowed === false) return false;
		const die = changes.system?.specialist?.die;
		if (!die || this.specialist.die || changes.system.rarity !== undefined) return;
		const rarer = specialistRarity(this.rarity);
		if (rarer) changes.system.rarity = rarer;
	}
}

/** A coat, plates, helm or shield. Shields also add an Attack die. */
export class ArmourModel extends PossessionModel {
	static defineSchema() {
		return {
			...super.defineSchema(),
			kind: new fields.StringField({ required: true, initial: "coat", choices: ARMOUR_KINDS }),
			armour: countField({ initial: 1 }),
			damage: textField(),
			// A buckler is a shield, but doesn't make a shieldwall (p10).
			buckler: booleanField(),
			// A wooden shield can be broken by a Strong Gambit (p10).
			wooden: booleanField(),
			// When its Armour counts; see rules/armour.js. `holds` is whether an
			// "only" or "except" situation holds right now.
			condition: new fields.StringField({ required: true, blank: true, initial: "", choices: ARMOUR_CONDITIONS }),
			situation: textField(),
			holds: booleanField(),
			equipped: new fields.BooleanField({ initial: true })
		};
	}
}

/**
 * The gear already let into each create still under way, by its options: core
 * hands every item in one create the same options object, so two Remedies
 * added together are weighed against each other and not only against what the
 * carrier already has.
 * @type {WeakMap<object, {type: string, system: object}[]>}
 */
const beingCreated = new WeakMap();

/** Anything else a Knight carries: tools, Remedies, poisons, oddities. */
export class GearModel extends PossessionModel {
	static defineSchema() {
		return {
			...super.defineSchema(),
			// A Remedy restores this Virtue to everybody present, and is used up (p9). Blank for anything else.
			remedy: new fields.StringField({ required: true, blank: true, initial: "", choices: ["", ...VIRTUES] }),
			// A poison, as strong as it is rare (p12).
			poison: booleanField()
		};
	}

	/**
	 * A person or beast of burden carries one Remedy at once (p9), so one more
	 * isn't added to somebody who has theirs.
	 * @override
	 */
	async _preCreate(data, options, user) {
		const allowed = await super._preCreate(data, options, user);
		if (allowed === false) return false;
		const alongside = beingCreated.get(options) ?? [];
		if (this.#overloads(null, this, alongside)) return false;
		beingCreated.set(options, [...alongside, { type: "gear", system: this }]);
	}

	/**
	 * Nor is a count raised, or a piece of gear made a Remedy, past what they can carry.
	 * @override
	 */
	async _preUpdate(changes, options, user) {
		const allowed = await super._preUpdate(changes, options, user);
		if (allowed === false) return false;
		// Only the Remedy and its count weigh on the load.
		if (!changes.system || !("remedy" in changes.system || "quantity" in changes.system)) return;
		const after = foundry.utils.mergeObject(this.toObject(), changes.system, { inplace: false });
		if (this.#overloads(this.parent.id, after)) return false;
	}

	/**
	 * Whether the item, as it would be, loads its carrier past one Remedy,
	 * saying so to whoever tried.
	 * @param {string|null} id The item's id among its carrier's, or null for one being added.
	 * @param {object} system The item's system data as it would be.
	 * @param {{type: string, system: object}[]} [alongside] Gear being added with it.
	 * @returns {boolean}
	 */
	#overloads(id, system, alongside = []) {
		const actor = this.parent?.parent;
		if (actor?.documentName !== "Actor" || !bearsRemedies(actor)) return false;
		if (!overRemedyLimit([...actor.items.contents, ...alongside], { id, system })) return false;
		const steed = actor.system.steed ? fromUuidSync(actor.system.steed) : null;
		ui.notifications.warn(game.i18n.format(steed ? "bastionland.remedy.limitSteed" : "bastionland.remedy.limit", { name: actor.name, steed: steed?.name }));
		return true;
	}
}

/** A Knight's unique talent. */
export class AbilityModel extends DescribedModel {}

/** A special means of restoring SPI. */
export class PassionModel extends DescribedModel {}

/** A lasting mark from the Scar table. */
export class ScarModel extends DescribedModel {
	static defineSchema() {
		return {
			...super.defineSchema(),
			roll: new fields.NumberField({ required: true, nullable: true, integer: true, min: 1, max: 12, initial: null }),
			// A GD increase that waited on something later has been rolled, or found not to apply.
			resolved: new fields.BooleanField({ initial: false }),
			// The Age and Season it was taken in, such as "2-winter", which Doom lasts.
			season: textField()
		};
	}
}
