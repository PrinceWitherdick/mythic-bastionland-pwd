import { chooseLocalFiles, singletonOpener } from "../apps/ui.js";
import { filePicker } from "../book-art/files.js";
import { t } from "../chat/cards.js";
import { isPdfPath } from "../rules/rulebook.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { openReader, openRulebook } from "./BookReader.js";
import { bringInRulebook, importKeptRulebook } from "./bring-in.js";
import {
	RULEBOOK_DIR,
	RULEBOOK_HOOK,
	canBrowseRulebooks,
	canKeepRulebook,
	rulebookPath,
	saveRulebookPath
} from "./store.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Where the GM says which file is the rulebook. Two ways in: a file on their
 * own computer, which is copied into the world so it's still there next
 * session (the reader fetches by URL, and a file picked in the browser only
 * lasts until the page reloads), or a file already on the server, which is
 * the whole story on a hosted Foundry. Each choice is saved as it's made, and
 * either way the book is read for its art and tables as well.
 */
export class RulebookSetup extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		id: "bastionland-rulebook-setup",
		classes: [SYSTEM_ID, "bastionland", "bastionland-rulebook-setup-window"],
		position: { width: 520, height: "auto" },
		window: { title: "bastionland.rulebook.setup.title", icon: "fa-solid fa-book", resizable: true },
		actions: {
			choose: RulebookSetup.#onChoose,
			browse: RulebookSetup.#onBrowse,
			forget: RulebookSetup.#onForget,
			read: RulebookSetup.#onRead
		}
	};

	static PARTS = {
		setup: { template: templatePath("apps/rulebook-setup.hbs") }
	};

	/** @type {number|null} */
	#hook = null;

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		return Object.assign(context, {
			path: rulebookPath(),
			dir: RULEBOOK_DIR,
			canKeep: canKeepRulebook(),
			canBrowse: canBrowseRulebooks()
		});
	}

	/** @override */
	async _onFirstRender(context, options) {
		await super._onFirstRender(context, options);
		// Redraw when the path changes here or on another GM's screen.
		this.#hook = Hooks.on(RULEBOOK_HOOK, () => this.rendered && this.render());
	}

	/** @override */
	_onRender(context, options) {
		super._onRender(context, options);
		const input = this.element.querySelector("input[type=file]");
		input?.addEventListener("change", () => this.#keep(input.files?.[0]));
	}

	/** @override */
	_onClose(options) {
		super._onClose(options);
		if (this.#hook !== null) Hooks.off(RULEBOOK_HOOK, this.#hook);
		this.#hook = null;
	}

	/** @param {File|undefined} file */
	async #keep(file) {
		if (file) await bringInRulebook(file);
	}

	/** @this {RulebookSetup} */
	static #onChoose() {
		chooseLocalFiles(this.element);
	}

	/**
	 * Pick a file already on the server. Foundry files PDFs under "text".
	 * @this {RulebookSetup}
	 */
	static #onBrowse() {
		const FilePicker = filePicker();
		new FilePicker({
			type: "text",
			current: rulebookPath() || `${RULEBOOK_DIR}/`,
			callback: async (path) => {
				if (!path) return;
				// Only the extension can be checked without fetching the file, so this warns rather than refuses.
				if (!isPdfPath(path)) ui.notifications.warn(t("rulebook.notPdf"));
				await saveRulebookPath(path);
				openReader()?.reload();
				await importKeptRulebook();
			}
		}).render({ force: true });
	}

	/** The copied file stays on the server; only the world's pointer to it goes. */
	static async #onForget() {
		await saveRulebookPath("");
		await openReader()?.close();
	}

	static #onRead() {
		openRulebook();
	}
}

const openSetup = singletonOpener(RulebookSetup);

/** Open the setup window, or bring it forward. */
export const openRulebookSetup = () => (canKeepRulebook() || canBrowseRulebooks() ? openSetup() : null);
