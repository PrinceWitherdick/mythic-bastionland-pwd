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
