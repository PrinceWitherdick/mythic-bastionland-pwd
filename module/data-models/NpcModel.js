import { AGES, FEATS, NPC_SCALES, NPC_WIELDS, WEAKNESS_DICE } from "../config.js";
import { MORALE_BREAKS } from "../rules/morale.js";
import { conditionsFor, healsWound } from "../rules/virtues.js";
import { warbandState } from "../rules/warbands.js";
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
			// "fled" or "surrendered" once a failed Morale Save took them out of the fight (p10), until cleared.
			moraleBroken: new fields.StringField({ required: true, blank: true, initial: "", choices: ["", ...MORALE_BREAKS] }),
			// Young, Mature or Old (p17), or blank where nobody has said, as for most of the Cast.
			age: new fields.StringField({ required: true, blank: true, initial: "", choices: ["", ...AGES] }),
			// In two hands as a Knight, or all at once as claws and teeth, or blank to read it off their gear (p12).
			wields: new fields.StringField({ required: true, blank: true, initial: "", choices: ["", ...NPC_WIELDS] }),
			// What keeps them from harm, as "No weapon of iron can touch it." Weighed as each blow lands.
			immunity: textField(),
			// What can be turned against them, as a hatred of fire. Once `known`, every Attack that uses it gets `die` (p188).
			weakness: new fields.SchemaField({
				text: textField(),
				die: new fields.StringField({ required: true, initial: "d10", choices: WEAKNESS_DICE }),
				known: booleanField()
			}),
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
		// A Warband is routed by a Mortal Wound or failed Morale, broken at SPI 0 and wiped out at VIG 0 (p10–11).
		this.warband = this.scale === "warband"
			? warbandState({ mortalWound: this.mortalWound, spi: this.virtues.spi.value, vig: this.virtues.vig.value, moraleBroken: this.moraleBroken })
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
