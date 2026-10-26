import { afterEach, describe, expect, it } from "vitest";
import { KeepDraftMixin, noteDraft, putBackDraft } from "../../module/apps/keep-draft.js";

/** A field as the DOM has it: what's typed, and what the page was drawn with. */
const field = (name, value, defaultValue = value) => ({ name, value, defaultValue, selectionStart: value.length, selectionEnd: value.length, setSelectionRange(start, end) {
	this.selectionStart = start;
	this.selectionEnd = end;
} });

/** A part holding these fields and folds, one of the fields in use. */
function part({ fields = [], focused = null, folds = [] } = {}) {
	return {
		querySelector(selector) {
			if (selector === ":is(input, textarea):focus") return focused;
			const id = selector.match(/^details\[data-sync="(.+)"\]$/)?.[1];
			return folds.find((fold) => fold.dataset.sync === id) ?? null;
		},
		querySelectorAll(selector) {
			return selector === "details[data-sync]" ? folds : fields;
		}
	};
}

afterEach(() => {
	delete globalThis.game;
});

describe("a draft kept across a sheet's own redraw", () => {
	it("puts back what's typed in the field in use, over the value saved before it", () => {
		// Omen 1 was saved as Omen 2 was being typed; the redraw has Omen 2 as saved.
		const typing = field("omens.1", "A storm comes", "");
		const state = {};
		noteDraft(part({ fields: [typing], focused: typing }), state);
		const drawn = field("omens.1", "");
		putBackDraft(part({ fields: [field("omens.0", "Crows"), drawn] }), state);
		expect(drawn.value).toBe("A storm comes");
		expect(drawn.selectionStart).toBe("A storm comes".length);
	});

	it("leaves a field alone when nothing new is typed in it", () => {
		const idle = field("castNote", "Saved");
		const state = {};
		noteDraft(part({ fields: [idle], focused: idle }), state);
		expect(state.draft).toBeUndefined();
	});

	it("keeps each fold open or shut on v13, which doesn't itself", () => {
		globalThis.game = { release: { generation: 13 } };
		const state = {};
		noteDraft(part({ folds: [{ dataset: { sync: "table" }, open: true }] }), state);
		const fold = { dataset: { sync: "table" }, open: false };
		putBackDraft(part({ folds: [fold] }), state);
		expect(fold.open).toBe(true);
	});

	it("leaves folds to Foundry on v14", () => {
		const state = {};
		noteDraft(part({ folds: [{ dataset: { sync: "table" }, open: true }] }), state);
		expect(state.folds).toBeUndefined();
	});

	it("is kept by a sheet mixed with it, after Foundry's own syncing", () => {
		const calls = [];
		class Base {
			_preSyncPartState() {
				calls.push("pre");
			}
			_syncPartState() {
				calls.push("sync");
			}
		}
		const sheet = new (KeepDraftMixin(Base))();
		const typed = field("omens.1", "A storm comes", "");
		const drawn = field("omens.1", "");
		const state = {};
		sheet._preSyncPartState("form", null, part({ fields: [typed], focused: typed }), state);
		sheet._syncPartState("form", part({ fields: [drawn] }), null, state);
		expect(calls).toEqual(["pre", "sync"]);
		expect(drawn.value).toBe("A storm comes");
	});
});
