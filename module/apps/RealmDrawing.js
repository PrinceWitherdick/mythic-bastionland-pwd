import { drawingCountLabel, finishRealmDrawing, getRealm, isDrawingRealm } from "../actions/realm.js";
import { ART_INDEX_HOOK, loadArtIndex } from "../book-art/art-index.js";
import { t } from "../chat/cards.js";
import { DRAWING_SIDE, bookDrawingGroups, drawingTally, finishPlacement, sheetDrawingGroups } from "../rules/realm-drawing.js";
import { REALM_TOOL_ICONS } from "../rules/realm.js";
import { RULE_PAGES } from "../rules/rule-pages.js";
import { templatePath } from "../system-id.js";
import { MapSidePanel, interfaceScale, mapOnScreen } from "./MapSidePanel.js";

/** The page Creating a Realm is printed on. */
const PAGE = RULE_PAGES.creatingRealm;

/**
 * Creating a Realm (p14), against the right edge of a Realm Scene the GM is
 * drawing by hand, in place of Travel and Exploration: the rulebook's own page
 * once Import PDF has read it, and the free Blank Realm sheet's until then.
 * Each step has the Realm tool that draws it and a tally of how far the
 * drawing has come. A Finish button under the map ends the drawing and brings
 * Travel and Exploration back. Only GMs see any of it.
 */
export class RealmDrawing extends MapSidePanel {
	static DEFAULT_OPTIONS = {
		id: "bastionland-realm-drawing",
		side: DRAWING_SIDE,
		classes: [`bastionland-travel-rules--${DRAWING_SIDE}`, "bastionland-realm-drawing"],
		actions: {
			useTool: RealmDrawing.#onUseTool
		}
	};

	static PARTS = {
		rules: { template: templatePath("apps/realm-drawing.hbs"), scrollable: [".bastionland-travel-rules__body"] }
	};

	/** @type {HTMLButtonElement|null} The Finish button under the map. */
	#finish = null;

	/** @type {{width: number, height: number}|null} The Finish button's size, which doesn't change once it's laid out. */
	#finishSize = null;

	/** @type {object|null|undefined} The imported book's index, loaded when the rules are first shown and after each import. */
	#index;

	/** @type {number|null} The hook that reads the index again after Import PDF. */
	#indexHook = null;

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		if (this.#index === undefined) this.#index = await loadArtIndex();
		const realm = getRealm(canvas.scene)?.realm;
		const tally = realm ? drawingTally(realm) : {};
		const text = (key, data) => t(`realmDrawing.${key}`, data);
		const counts = (key) => (tally[key] ?? []).map((entry) => ({ label: drawingCountLabel(entry), done: entry.done }));
		const tool = (step) => ({
			name: step.tool,
			brush: step.brush ?? null,
			icon: REALM_TOOL_ICONS[step.brush ?? step.tool],
			label: t(step.brush ? `realm.brushes.${step.brush}` : `realm.tools.${step.tool}`),
			hint: step.tool === "inspect" ? text("inspectHint") : null,
			active: canvas.realm?.active && canvas.realm.tool === step.tool
				&& (!step.brush || canvas.realm.drawsRiver === (step.brush === "river"))
		});

		const book = this.#index?.rules?.creatingRealm?.sections;
		const fromBook = book ? bookDrawingGroups(book) : null;
		const groups = (fromBook ?? sheetDrawingGroups(text)).map((group) => ({
			key: group.key,
			heading: group.heading,
			sections: group.parts.map((part) => ({
				key: part.key,
				blocks: printedBlocks(part.blocks),
				counts: part.step ? counts(part.step.key) : null,
				tool: part.step ? tool(part.step) : null
			}))
		}));

		return Object.assign(context, {
			title: text("title"),
			...MapSidePanel.pageContext(PAGE),
			// The book's own page says what the sheet's intro sums up.
			intro: fromBook ? null : text("intro"),
			groups,
			credit: text(fromBook ? "bookCredit" : "credit")
		});
	}

	/** @override */
	async _onFirstRender(context, options) {
		await super._onFirstRender(context, options);
		const finish = document.createElement("button");
		finish.type = "button";
		finish.id = "bastionland-realm-drawing-finish";
		finish.className = "bastionland bastionland-realm-drawing__finish";
		finish.innerHTML = `<i class="fa-solid fa-scroll" inert></i> ${foundry.utils.escapeHTML(t("realmDrawing.finish.button"))}`;
		finish.dataset.tooltip = t("realmDrawing.finish.hint");
		finish.addEventListener("click", () => finishRealmDrawing(canvas.scene));
		(document.getElementById("interface") ?? document.body).append(finish);
		this.#finish = finish;
		// Import PDF run while drawing brings in the rulebook's own page in place of the sheet's.
		this.#indexHook = Hooks.on(ART_INDEX_HOOK, () => {
			this.#index = undefined;
			this.render();
		});
	}

	/** @override */
	_onClose(options) {
		super._onClose(options);
		if (this.#indexHook !== null) Hooks.off(ART_INDEX_HOOK, this.#indexHook);
		this.#indexHook = null;
		// Read again next time, in case the book has been imported since.
		this.#index = undefined;
		this.#finish?.remove();
		this.#finish = null;
		this.#finishSize = null;
	}

	/** Hold the rules against the map's right edge, and the Finish button under it. */
	place(map = mapOnScreen()) {
		super.place(map);
		if (!this.#finish || !map) return;
		// Measured once it has a size, so a pan doesn't lay the page out again for it.
		this.#finishSize ??= this.#finish.offsetWidth ? { width: this.#finish.offsetWidth, height: this.#finish.offsetHeight } : null;
		if (!this.#finishSize) return;
		const hotbar = document.getElementById("hotbar")?.getBoundingClientRect();
		const floor = hotbar?.height ? hotbar.top : window.innerHeight;
		const { left, top } = finishPlacement(map, { ...this.#finishSize, floor, scale: interfaceScale() });
		this.#finish.style.left = `${left}px`;
		this.#finish.style.top = `${top}px`;
	}

	/* -------------------------------------------- */
	/*  Actions                                     */
	/* -------------------------------------------- */

	/** @this {RealmDrawing} */
	static async #onUseTool(_event, target) {
		const { tool, brush } = target.dataset;
		// Terrain and the river are one tool, so the step also says which of them it lays. Picking it up draws these rules again.
		await canvas.realm?.useTool(tool, { brush });
	}
}

/**
 * A step's printed text as the template sets it out: each paragraph, then
 * bullets together in one list and labelled lines together in another.
 * @param {import("../rules/realm-drawing.js").DrawingBlock[]} blocks
 * @returns {({text: string}|{bullets: string[]}|{lines: {label: string, text: string}[]})[]}
 */
function printedBlocks(blocks) {
	const printed = [];
	for (const block of blocks) {
		const last = printed.at(-1);
		if (block.kind === "bullet") {
			if (last?.bullets) last.bullets.push(block.text);
			else printed.push({ bullets: [block.text] });
		} else if (block.kind === "term") {
			const line = { label: block.label, text: block.text };
			if (last?.lines) last.lines.push(line);
			else printed.push({ lines: [line] });
		} else printed.push({ text: block.text });
	}
	return printed;
}

/** @type {RealmDrawing|null} */
let panel = null;

/**
 * Show the drawing rules beside a Realm Scene the GM is still drawing.
 * @returns {Promise<unknown>}
 */
export function showRealmDrawing() {
	if (!game.user.isGM || !isDrawingRealm(canvas?.scene)) return closeRealmDrawing();
	panel ??= new RealmDrawing();
	return panel.render({ force: true });
}

/**
 * Draw the rules' tallies again after the Realm on the canvas changed.
 * @param {string} sceneId
 */
export function refreshRealmDrawing(sceneId) {
	if (panel?.rendered && sceneId === canvas?.scene?.id) panel.render();
}

/**
 * Take the drawing rules and the Finish button down.
 * @returns {Promise<unknown>}
 */
export function closeRealmDrawing() {
	return panel?.rendered ? panel.close({ animate: false }) : Promise.resolve();
}
