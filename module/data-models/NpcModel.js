import { AGES, FEATS, NPC_SCALES } from "../config.js";
import { conditionsFor, healsWound } from "../rules/virtues.js";
import { afflictionsField, booleanField, characterFields, countField, textField } from "./fields.js";

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
			// The UUID of whoever leads this Warband from the front, sharing its Damage until their next turn (p11).
			leader: textField(),
			// Young, Mature or Old (p17), or blank where nobody has said, as for most of the Cast.
			age: new fields.StringField({ required: true, blank: true, initial: "", choices: ["", ...AGES] }),
			// What keeps them from harm, as "Cannot be harmed by physical attacks." Weighed as each blow lands.
			immunity: textField(),
			// The afflictions they cause those they touch, as the Plague's infected cause d6 VIG loss daily.
			inflicts: afflictionsField(),
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
	 * Wounded goes once VIG is whole again.
	 * @override
	 */
	async _preUpdate(changes, options, user) {
		const allowed = await super._preUpdate(changes, options, user);
		if (allowed === false) return false;
		if (healsWound(this, changes)) changes.system.wounded = false;
	}

	/**
	 * @param {string} key "smite", "focus" or "deny".
	 * @returns {boolean}
	 */
	knowsFeat(key) {
		return Boolean(this.feats[key]);
	}
}
