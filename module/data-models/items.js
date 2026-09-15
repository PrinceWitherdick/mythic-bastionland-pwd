import { ARMOUR_KINDS } from "../config.js";
import { countField, htmlField, textField } from "./fields.js";

const fields = foundry.data.fields;

/** Fields every item type shares. */
class DescribedModel extends foundry.abstract.TypeDataModel {
	static defineSchema() {
		return { description: htmlField() };
	}
}

/** A weapon, e.g. "Polished mace (d8 hefty)". */
export class WeaponModel extends DescribedModel {
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
			// A steed's trample, added to its rider's dice when charging enemies on foot (p10).
			trample: new fields.BooleanField({ initial: false }),
			// A lance counts as Hefty rather than Long when its wielder is mounted (p12).
			heftyMounted: new fields.BooleanField({ initial: false }),
			equipped: new fields.BooleanField({ initial: true })
		};
	}

	/** Slow weapons are also Long (p12). */
	get isLong() {
		return this.long || this.slow;
	}
}

/** A coat, plates, helm or shield. Shields also add an Attack die. */
export class ArmourModel extends DescribedModel {
	static defineSchema() {
		return {
			...super.defineSchema(),
			kind: new fields.StringField({ required: true, initial: "coat", choices: ARMOUR_KINDS }),
			armour: countField({ initial: 1 }),
			damage: textField(),
			equipped: new fields.BooleanField({ initial: true })
		};
	}

	/** Armour this item adds to its owner's total right now. */
	get wornArmour() {
		return this.equipped ? this.armour : 0;
	}
}

/** Anything else a Knight carries: tools, remedies, steeds, oddities. */
export class GearModel extends DescribedModel {}

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
