import { AGES } from "../config.js";
import { armourTotal } from "../rules/armour.js";
import { nextRank, rankForGlory } from "../rules/glory.js";
import { SEER_UNHARMED, namesNewSeer } from "../rules/seer-state.js";
import { SCORES, conditionsFor, healsWound } from "../rules/virtues.js";
import { booleanField, characterFields, countField, htmlField, textField } from "./fields.js";

const fields = foundry.data.fields;

/** A player Knight, laid out after the official character sheet. */
export class KnightModel extends foundry.abstract.TypeDataModel {
	static defineSchema() {
		return {
			// "Known as the ___ Knight"
			knightType: textField(),
			// The Seer who granted their Knighthood.
			seer: textField(),
			// The Seer's portrait, what the book says of them, and what the Knight has learned of them since.
			seerImg: textField(),
			seerInfo: htmlField(),
			seerNotes: htmlField(),
			// What the book gives the Seer, filled in from the art index: the scores that are
			// their maximums, their Armour, and whether they're harmed as a structure. Null for
			// a Seer the book gives none, and for one written in by hand.
			seerBook: new fields.SchemaField({
				...Object.fromEntries(SCORES.map((key) => [key, new fields.NumberField({ required: true, nullable: true, integer: true, min: 0, initial: null })])),
				armour: countField(),
				structure: booleanField()
			}, { required: true, nullable: true, initial: null }),
			// The Seer's scores as they stand, blank while at the book's, and their Mortal Wound; see rules/seer-state.js.
			seerState: new fields.SchemaField({
				...Object.fromEntries(SCORES.map((key) => [key, new fields.NumberField({ required: true, nullable: true, integer: true, min: 0, initial: null })])),
				mortalWound: booleanField()
			}),
			// The d6 table on their page and what they rolled on it; see rules/knight-tables.js.
			bookTable: new fields.SchemaField({
				knight: textField(),
				page: new fields.NumberField({ required: true, nullable: true, integer: true, initial: null }),
				name: textField(),
				columns: new fields.ArrayField(new fields.StringField()),
				rows: new fields.ArrayField(new fields.ArrayField(new fields.StringField())),
				rolls: new fields.ArrayField(countField({ max: 6 }))
			}),
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
			// The UUID of the Knight or Squire named to follow them (Succession and Legacy, p17).
			successor: textField(),
			...characterFields(),
			glory: countField()
		};
	}

	/** @override */
	prepareDerivedData() {
		super.prepareDerivedData();
		this.rank = rankForGlory(this.glory);
		this.nextRank = nextRank(this.glory);
		this.conditions = conditionsFor(this);
		// One of each type counts, and only while its condition holds (p12).
		this.armour = armourTotal(this.parent.items.filter((item) => item.type === "armour").map((item) => item.system), this.conditions);
	}

	/**
	 * The harm on the Seer page is the Seer's own, so naming another Seer clears it.
	 * Wounded goes once VIG is whole again.
	 * @override
	 */
	async _preUpdate(changes, options, user) {
		const allowed = await super._preUpdate(changes, options, user);
		if (allowed === false) return false;
		if (namesNewSeer(changes, this.seer)) foundry.utils.setProperty(changes, "system.seerState", { ...SEER_UNHARMED });
		if (healsWound(this, changes)) changes.system.wounded = false;
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
