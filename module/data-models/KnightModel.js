import { AGES } from "../config.js";
import { nextRank, rankForGlory } from "../rules/glory.js";
import { conditionsFor } from "../rules/virtues.js";
import { booleanField, characterFields, countField, textField } from "./fields.js";

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
			// The shield painted at the top of the sheet: an uploaded file's path, or a data URL for users who can't upload.
			heraldry: textField(),
			age: new fields.StringField({ required: true, initial: AGES[0], choices: AGES }),
			// The UUID of the NPC this Knight rides, whose trample joins a mounted charge.
			steed: textField(),
			// A Squire is not yet a Knight, so cannot gain Glory or perform Feats (p7).
			isSquire: booleanField(),
			// A Knight's Squire, or the Knight a Squire serves, by UUID.
			squire: textField(),
			serves: textField(),
			// The UUID of the Domain this Knight rules.
			domain: textField(),
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
	 * Every Knight knows the three Feats (p7). A Squire isn't a Knight yet.
	 * @returns {boolean}
	 */
	knowsFeat() {
		return !this.isSquire;
	}

	/**
	 * Squires cannot gain Glory (p7).
	 * @returns {boolean}
	 */
	get gainsGlory() {
		return !this.isSquire;
	}
}
