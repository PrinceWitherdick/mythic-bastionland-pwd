import { VIRTUES, VIRTUE_MAX } from "../rules/virtues.js";
import { AFFLICTION_TIMES } from "../rules/afflictions.js";

const fields = foundry.data.fields;

/**
 * A whole number that never drops below zero.
 * @param {object} [options]
 * @param {number} [options.initial=0]
 * @param {number} [options.max]
 */
export function countField({ initial = 0, max } = {}) {
	return new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, max, initial });
}

/**
 * A score with a current value and a maximum, such as a Virtue or GD. Foundry
 * treats `{value, max}` pairs as token bar attributes.
 * @param {object} [options]
 * @param {number} [options.initial=0] Starting value for both halves.
 * @param {number} [options.max]       Upper bound for both halves.
 */
export function trackField({ initial = 0, max } = {}) {
	return new fields.SchemaField({
		value: countField({ initial, max }),
		max: countField({ initial, max })
	});
}

/** Free text that may be left blank. */
export function textField() {
	return new fields.StringField({ required: true, blank: true, initial: "" });
}

/** Rich text edited with ProseMirror. */
export function htmlField() {
	return new fields.HTMLField({ required: true, blank: true, initial: "" });
}

/** A box that starts unticked. */
export function booleanField() {
	return new fields.BooleanField({ initial: false });
}

/**
 * A list of afflictions, each a Virtue lost each morning or each round, as a
 * victim carries them or one of the Cast causes them. See rules/afflictions.js.
 * @returns {foundry.data.fields.ArrayField}
 */
export function afflictionsField() {
	return new fields.ArrayField(new fields.SchemaField({
		id: new fields.StringField({ required: true, blank: false }),
		name: textField(),
		loss: new fields.StringField({ required: true, blank: false, initial: "1d6" }),
		virtue: new fields.StringField({ required: true, initial: VIRTUES[0], choices: VIRTUES }),
		when: new fields.StringField({ required: true, initial: AFFLICTION_TIMES[0], choices: AFFLICTION_TIMES })
	}));
}

/**
 * What every character has, Knight or NPC: Virtues, GD, the conditions marked
 * by hand, afflictions carried, and notes. `conditionsFor` derives the rest from these.
 */
export function characterFields() {
	return {
		virtues: new fields.SchemaField(Object.fromEntries(VIRTUES.map((key) => [key, trackField({ initial: 10, max: VIRTUE_MAX })]))),
		guard: trackField({ initial: 3 }),
		fatigued: booleanField(),
		// Caught with their guard down. CLA 0 also Exposes, but that is derived.
		exposed: booleanField(),
		mortalWound: booleanField(),
		// Took Damage past their GD (p8); it lapses once their VIG is whole again.
		wounded: booleanField(),
		// On horseback, so a lance counts as Hefty and a rider's plate counts.
		mounted: booleanField(),
		// What eats at them each morning or each round until cured, such as the Plague.
		afflictions: afflictionsField(),
		notes: htmlField()
	};
}
