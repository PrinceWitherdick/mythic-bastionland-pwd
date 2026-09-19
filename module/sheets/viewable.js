/**
 * Foundry disables every control on a sheet the user can't edit. A control
 * marked `data-viewable`, or inside an element marked so, stays live for a
 * viewer: a Feat's or item's name only posts the sheet's text to chat, as a
 * move's name does in Stonetop, and the Settings page writes the reader's own
 * settings rather than the Actor.
 */

/** Every control under a `data-viewable` mark, the mark itself included. */
const VIEWABLE_CONTROLS = ":is(button, input, select, textarea, fieldset):is([data-viewable], [data-viewable] *)";

/**
 * Enable the controls marked `data-viewable` under an element.
 * @param {ParentNode|null|undefined} root
 */
export function enableViewable(root) {
	for (const control of root?.querySelectorAll(VIEWABLE_CONTROLS) ?? []) control.disabled = false;
}

/**
 * Keeps a sheet's `data-viewable` controls live when the rest are disabled.
 * @param {typeof foundry.applications.api.DocumentSheetV2} Base
 */
export const ViewableMixin = (Base) => class extends Base {
	/** @override */
	_toggleDisabled(disabled) {
		super._toggleDisabled(disabled);
		enableViewable(this.form);
	}
};
