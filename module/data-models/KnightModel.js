import { AGES } from "../config.js";
import { nextRank, rankForGlory } from "../rules/glory.js";
import { VIRTUE_MAX } from "../rules/virtues.js";
import { countField, htmlField, textField, trackField } from "./fields.js";

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
			virtues: new fields.SchemaField({
				vig: trackField({ initial: 10, max: VIRTUE_MAX }),
				cla: trackField({ initial: 10, max: VIRTUE_MAX }),
				spi: trackField({ initial: 10, max: VIRTUE_MAX })
			}),
			guard: trackField({ initial: 3 }),
			glory: countField(),
			fatigued: new fields.BooleanField({ initial: false }),
			// Caught with their guard down. CLA 0 also Exposes, but that is derived.
			exposed: new fields.BooleanField({ initial: false }),
			mortalWound: new fields.BooleanField({ initial: false }),
			notes: htmlField()
		};
	}

	/** @override */
	prepareDerivedData() {
		super.prepareDerivedData();
		const { vig, cla, spi } = this.virtues;

		this.rank = rankForGlory(this.glory);
		this.nextRank = nextRank(this.glory);
		this.armour = this.parent.items.reduce((total, item) => total + (item.system.wornArmour ?? 0), 0);
		this.conditions = {
			fatigued: this.fatigued,
			exhausted: vig.value === 0,
			exposed: this.exposed || cla.value === 0,
			impaired: spi.value === 0,
			mortalWound: this.mortalWound
		};
	}
}
