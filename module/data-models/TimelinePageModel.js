/**
 * One thread of the Timeline: a journal page holding a thread's dated
 * entries, kept by id so two people writing one thread at once each keep
 * their own rows. See rules/timeline.js for what an entry is.
 */
export class TimelinePageModel extends foundry.abstract.TypeDataModel {
	static defineSchema() {
		const { NumberField, SchemaField, StringField, TypedObjectField } = foundry.data.fields;
		const string = () => new StringField({ required: true, blank: true, initial: "" });
		return {
			// One of TRACK_KINDS, and the thread itself: "company", an actor's id, or "realm:<scene id>".
			trackKind: string(),
			trackId: string(),
			entries: new TypedObjectField(new SchemaField({
				id: string(),
				// The Season it falls in (seasonKey), or "" for before the tale.
				season: string(),
				order: new NumberField({ required: true, integer: true, min: 0, initial: 0 }),
				title: string(),
				place: string(),
				body: string(),
				// One of TIMELINE_SOURCES. Not a choice, so a row from a newer version still loads.
				source: new StringField({ required: true, blank: false, initial: "hand" }),
				key: string(),
				createdAt: new NumberField({ required: true, initial: 0 }),
				authorId: string()
			}), { validateKey: (key) => !key.includes(".") })
		};
	}
}
