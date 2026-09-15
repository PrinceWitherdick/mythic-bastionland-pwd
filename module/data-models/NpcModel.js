import { FEATS, NPC_SCALES } from "../config.js";
import { conditionsFor } from "../rules/virtues.js";
import { booleanField, characterFields, countField, textField } from "./fields.js";

const fields = foundry.data.fields;

/**
 * Anybody who isn't a player's Knight: a Myth's Cast, Seers, beasts, hirelings
 * and Warbands, laid out after the stat blocks the book prints for them.
 */
export class NpcModel extends foundry.abstract.TypeDataModel {
	static defineSchema() {
		return {
			// "That Foul Twisted Reptile", the part of a Cast name after the comma.
			epithet: textField(),
			...characterFields(),
			// Stat blocks print Armour as a total, with what it is alongside.
			armour: countField(),
			armourNote: textField(),
			scale: new fields.StringField({ required: true, initial: NPC_SCALES[0], choices: NPC_SCALES }),
			// Counts as a structure: only fire, siege weapons and suitably large creatures harm it (p11).
			structure: booleanField(),
			// Feats are for Knights, but some of the Cast "Can Focus" or "Can Deny".
			feats: new fields.SchemaField(Object.fromEntries(FEATS.map(({ key }) => [key, booleanField()])))
		};
	}

	/** @override */
	prepareDerivedData() {
		super.prepareDerivedData();
		this.conditions = conditionsFor(this);
		// A Warband is routed by a Mortal Wound, broken at SPI 0 and wiped out at VIG 0 (p11).
		this.warband = this.scale === "warband"
			? { routed: this.mortalWound, broken: this.virtues.spi.value === 0, wipedOut: this.virtues.vig.value === 0 }
			: null;
	}

	/**
	 * @param {string} key "smite", "focus" or "deny".
	 * @returns {boolean}
	 */
	knowsFeat(key) {
		return Boolean(this.feats[key]);
	}
}
