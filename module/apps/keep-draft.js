import { isV13 } from "../compat.js";

/*
 * A sheet that saves as each field changes is drawn again by its own save,
 * and drawing puts every field back to its saved value. Foundry puts the focus
 * back, but not what was being typed in the next field meanwhile. These keep
 * that, from a part's `_preSyncPartState` to its `_syncPartState`.
 */

/**
 * Note what's typed and not yet saved in the field in use, and which folds are
 * open: v14 keeps a `details[data-sync]` open or shut itself, v13 doesn't.
 * @param {HTMLElement} priorElement The part as it was.
 * @param {object} state The state Foundry carries across the redraw.
 */
export function noteDraft(priorElement, state) {
	if (isV13()) state.folds = Object.fromEntries([...priorElement.querySelectorAll("details[data-sync]")].map((fold) => [fold.dataset.sync, fold.open]));
	const field = priorElement.querySelector(":is(input, textarea):focus");
	if (field?.name && field.value !== field.defaultValue) {
		state.draft = { name: field.name, value: field.value, start: field.selectionStart, end: field.selectionEnd };
	}
}

/**
 * Put back what `noteDraft` noted, over the part drawn afresh.
 * @param {HTMLElement} newElement The part as now drawn.
 * @param {object} state
 */
export function putBackDraft(newElement, state) {
	for (const [id, open] of Object.entries(state.folds ?? {})) {
		const fold = newElement.querySelector(`details[data-sync="${id}"]`);
		if (fold) fold.open = open;
	}
	if (!state.draft) return;
	const field = [...newElement.querySelectorAll(":is(input, textarea)[name]")].find(({ name }) => name === state.draft.name);
	if (!field) return;
	field.value = state.draft.value;
	field.setSelectionRange?.(state.draft.start, state.draft.end);
}

/**
 * A sheet that keeps what's typed, and its folds, across each redraw.
 * @param {typeof foundry.applications.api.ApplicationV2} Base
 */
export const KeepDraftMixin = (Base) => class extends Base {
	/** @override */
	_preSyncPartState(partId, newElement, priorElement, state) {
		super._preSyncPartState(partId, newElement, priorElement, state);
		noteDraft(priorElement, state);
	}

	/** @override */
	_syncPartState(partId, newElement, priorElement, state) {
		super._syncPartState(partId, newElement, priorElement, state);
		putBackDraft(newElement, state);
	}
};
