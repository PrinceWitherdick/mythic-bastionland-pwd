import { htmlField } from "./fields.js";

/**
 * The GM Toolkit's own data. A Realm's Myths, the Company's journey and the
 * notes on each hex live with the Realm's Scene, so a Realm keeps its own
 * however many there are; what's kept here belongs to no one Realm.
 */
export class GmToolkitModel extends foundry.abstract.TypeDataModel {
	static defineSchema() {
		return {
			// The GM's own notes, such as the plans the players shared at the end of a session (p16).
			notes: htmlField(),
			// Each Season's record by its key, such as "2-winter": the GM's notes and how it ended. See rules/season-log.js.
			seasons: new foundry.data.fields.ObjectField({ required: true, initial: {} })
		};
	}
}
