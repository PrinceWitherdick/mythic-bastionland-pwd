import { AGES } from "../config.js";
import { nextRank, rankForGlory } from "../rules/glory.js";
import { conditionsFor } from "../rules/virtues.js";
import { characterFields, countField, textField } from "./fields.js";

const fields = foundry.data.fields;

/** A player Knight, laid out after the official character sheet. */
export class KnightModel extends foundry.abstract.TypeDataModel {
	static defineSchema() {
		return {
			// "Known as the ___ Knight"
			knightType: textField(),
			// The Seer who granted their Knighthood.
			seer: textField(),
			// "Their ultimate fate was ___"
			fate: textField(),
			age: new fields.StringField({ required: true, initial: AGES[0], choices: AGES }),
			...characterFields(),
			glory: countField()
		};
	}

	/** @override */
	prepareDerivedData() {
		super.prepareDerivedData();
		this.rank = rankForGlory(this.glory);
		this.nextRank = nextRank(this.glory);
		this.armour = this.parent.items.reduce((total, item) => total + (item.system.wornArmour ?? 0), 0);
		this.conditions = conditionsFor(this);
	}

	/**
	 * Every Knight knows the three Feats (p7).
	 * @returns {boolean}
	 */
	knowsFeat() {
		return true;
	}
}
