import { COUNCIL_SEATS, CRISES, isMisruleDue, musterFor } from "../rules/dominion.js";
import { booleanField, htmlField, textField } from "./fields.js";

const fields = foundry.data.fields;

/**
 * A Holding granted to a ruler (Dominion, p20): its Council and the tasks its
 * seats have been given, its Court, the Crises it faces until they're
 * resolved, and whether it has fallen into misrule.
 */
export class DomainModel extends foundry.abstract.TypeDataModel {
	static defineSchema() {
		return {
			// The Seat of Power, ruling the whole Realm.
			seat: booleanField(),
			ruler: textField(),
			// The Holding on the Realm it rules, from holdingRef. Blank finds the Holding bearing its name.
			holding: textField(),
			// Whether Weeks or a Season have passed with its ruler away, so their return brings the Crisis Roll (p20).
			longAbsence: booleanField(),
			// Whom the ruler names to follow them (Succession, p21), written as the GM likes.
			successor: textField(),
			// The Season it was seized by force in, from seasonKey. Its turmoil lasts that Season (Conquest, p21).
			seized: textField(),
			// Who holds each seat, written as the GM likes.
			council: new fields.SchemaField(Object.fromEntries(COUNCIL_SEATS.map((key) => [key, textField()]))),
			// Those who serve outside the Council (The Court, p20), by id. See rules/court.js.
			court: new fields.ObjectField({ required: true, initial: {} }),
			// The tasks the Council has in hand (p20), by id. See rules/council-tasks.js.
			tasks: new fields.ObjectField({ required: true, initial: {} }),
			crises: new fields.ArrayField(new fields.StringField({ required: true, blank: false, choices: CRISES })),
			misrule: booleanField(),
			// The Season its Crisis Roll was last made in, from seasonKey.
			crisisRolled: textField(),
			// The Season its Drama in Court was last rolled in, from seasonKey (p21).
			dramaRolled: textField(),
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
