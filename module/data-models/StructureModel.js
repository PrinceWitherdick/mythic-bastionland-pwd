import { STRUCTURE_KINDS } from "../rules/structures.js";
import { booleanField, countField, htmlField, textField, trackField } from "./fields.js";

const fields = foundry.data.fields;

/** Nothing wears a structure down but Damage, so it is never in any condition. */
const NO_CONDITIONS = Object.freeze({ fatigued: false, exposed: false, mortalWound: false, exhausted: false, impaired: false, wounded: false, mounted: false });

/**
 * A structure, ship or siege engine (Wood and Stone, p11): only GD and Armour,
 * destroyed at 0GD, and harmed only by fire, siege engines or something big
 * enough. It has no Virtues, so it never Saves, tires or loses its nerve.
 */
export class StructureModel extends foundry.abstract.TypeDataModel {
	static defineSchema() {
		return {
			kind: new fields.StringField({ required: true, initial: STRUCTURE_KINDS[0], choices: STRUCTURE_KINDS }),
			// Stone walls can't be breached by conventional means (p11); anything else is wood.
			stone: booleanField(),
			// "The Great Fungal Tower", the part of a Cast name after the comma.
			epithet: textField(),
			guard: trackField({ initial: 5 }),
			armour: countField(),
			armourNote: textField(),
			// What a ship carries, such as "6 passengers" or "a Warband".
			carries: textField(),
			notes: htmlField()
		};
	}

	/** @override */
	prepareDerivedData() {
		super.prepareDerivedData();
		// Damage, Morale and the Attack dialog read these on any actor.
		this.structure = true;
		this.conditions = NO_CONDITIONS;
		this.destroyed = this.guard.value === 0;
	}

	/** @returns {boolean} A structure performs no Feats. */
	knowsFeat() {
		return false;
	}
}
