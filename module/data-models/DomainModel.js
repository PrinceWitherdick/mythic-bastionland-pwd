import { COUNCIL_SEATS, CRISES, isMisruleDue, musterFor } from "../rules/dominion.js";
import { booleanField, htmlField, textField } from "./fields.js";

const fields = foundry.data.fields;

/**
 * A Holding granted to a ruler (Dominion, p20): its Council, the Crises it
 * faces until they're resolved, and whether it has fallen into misrule.
 */
export class DomainModel extends foundry.abstract.TypeDataModel {
	static defineSchema() {
		return {
			// The Seat of Power, ruling the whole Realm.
			seat: booleanField(),
			ruler: textField(),
			// Who holds each seat, written as the GM likes.
			council: new fields.SchemaField(Object.fromEntries(COUNCIL_SEATS.map((key) => [key, textField()]))),
			crises: new fields.ArrayField(new fields.StringField({ required: true, blank: false, choices: CRISES })),
			misrule: booleanField(),
			// The Season its Crisis Roll was last made in, from seasonKey.
			crisisRolled: textField(),
			notes: htmlField()
		};
	}

	/** @override */
	prepareDerivedData() {
		super.prepareDerivedData();
		this.muster = musterFor(this.seat);
		this.misruleDue = isMisruleDue(this.crises) && !this.misrule;
	}
}
