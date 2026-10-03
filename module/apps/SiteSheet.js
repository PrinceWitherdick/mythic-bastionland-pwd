import { hasSiteJournal, openSiteJournal } from "../actions/site-journals.js";
import { readSite, siteUpdate } from "../actions/sites.js";
import { t } from "../chat/cards.js";
import { emptyHistory, recordChange, stepHistory } from "../rules/history.js";
import { serialWrites } from "../rules/queue.js";
import { createRandom, randomSeed } from "../rules/random.js";
import { edgeMiddle, kindGlyph, mapPercent, siteMap, sitePoint } from "../rules/site-diagram.js";
import {
	ENTRANCE_KINDS,
	POINT_KINDS,
	POSITION_KEYS,
	ROUTE_KINDS,
	RULE_KINDS,
	RULE_LIMITS,
	SITE_MODES,
	SITE_PRESETS,
	STEP_CAN_ROLL,
	STEP_ROLLS,
	applySiteForm,
	clearSite,
	isBlankSite,
	markPoint,
	markedPoints,
	numberPoint,
	numberedPoints,
	playerView,
	pointCounts,
	revealEntrance,
	revealEverything,
	revealPoint,
	revealRoute,
	rollSite,
	routeCounts,
	routesFrom,
	setEntrance,
	setRoute,
	setRules,
	siteEdge,
	siteSteps
} from "../rules/sites.js";
import { escapeHTML } from "../rules/text.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { confirmDialog, undoRedoKey } from "./ui.js";

const { DocumentSheetV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** The gap in pixels between the bar and the sides of the map. */
const BAR_INSET = 6;

const MODE_ICONS = Object.freeze({ draw: "fa-solid fa-pen-nib", reveal: "fa-solid fa-eye" });

const STATE_ICONS = Object.freeze({
	done: "fa-solid fa-circle-check",
	todo: "fa-regular fa-circle",
	over: "fa-solid fa-circle-exclamation",
	problem: "fa-solid fa-circle-exclamation"
});

/**
 * @typedef {import("../rules/sites.js").Site} Site
 * @typedef {{type: "point"|"route", key: string}} SiteSelection
 */

/**
 * A Site (p15) as its Journal entry opens: the map, drawn by clicking, with
 * the book's four steps beneath it and the key to write beside it.
 *
 * Referees draw the Site, or roll whatever part of it isn't done, and reveal
 * it as it's explored. Players who can see the entry get the map alone,
 * showing only what they've found, and it follows the Referee's changes
 * because Foundry redraws a sheet whenever its document changes.
 */
export class SiteSheet extends HandlebarsApplicationMixin(DocumentSheetV2) {
	static DEFAULT_OPTIONS = {
		classes: [SYSTEM_ID, "bastionland", "bastionland-site-window"],
		position: { width: 1040, height: 800 },
		window: { icon: "fa-solid fa-dungeon", resizable: true },
		sheetConfig: false,
		form: { handler: SiteSheet.#onSubmit, submitOnChange: true, closeOnSubmit: false },
		actions: {
			point: SiteSheet.#onPoint,
			route: SiteSheet.#onRoute,
			entrance: SiteSheet.#onEntrance,
			deselect: SiteSheet.#onDeselect,
			markPoint: SiteSheet.#onMarkPoint,
			placeEntrance: SiteSheet.#onPlaceEntrance,
			drawRoute: SiteSheet.#onDrawRoute,
			findRoute: SiteSheet.#onFindRoute,
			pickPoint: SiteSheet.#onPickPoint,
			found: SiteSheet.#onFound,
			mode: SiteSheet.#onMode,
			rollStep: SiteSheet.#onRollStep,
			rollRest: SiteSheet.#onRollRest,
			clear: SiteSheet.#onClear,
			preset: SiteSheet.#onPreset,
			revealAll: SiteSheet.#onRevealAll,
			hideAll: SiteSheet.#onHideAll,
			undo: SiteSheet.#onUndo,
			redo: SiteSheet.#onRedo,
			showPlayers: SiteSheet.#onShowPlayers,
			journal: SiteSheet.#onJournal
		}
	};

	static PARTS = {
		toolbar: { template: templatePath("apps/site-toolbar.hbs") },
		map: { template: templatePath("apps/site-map.hbs"), scrollable: [""] },
		key: { template: templatePath("apps/site-key.hbs"), scrollable: [""] }
	};

	/** Set by New Site: close this with nothing drawn or written and the entry is deleted. */
	discardIfBlank = false;

	/** What clicking the map does, one of SITE_MODES. */
	#mode = "draw";

	/** @type {SiteSelection|null} The point or route the bar is open for. */
	#selected = null;

	/** Set when the bar was opened from the keyboard, so focus moves into it once drawn. */
	#focusBar = false;

	/** @type {string|null} The point last scrolled to in the key, so a redraw doesn't scroll again. */
	#shownInKey = null;

	/** @type {import("../rules/history.js").History} The Site before each change, for Undo and Redo. */
	#steps = emptyHistory();

	/** Each change waits for the one before, so it works from the Site as that one left it. */
	#writing = serialWrites();

	/** @override */
	get title() {
		return this.document.name;
	}

	/** @override */
	_initializeApplicationOptions(options) {
		options = super._initializeApplicationOptions(options);
		// Players get the map alone, in a smaller window.
		if (!options.document.isOwner) {
			options.position = { ...options.position, width: 560, height: 600 };
			options.classes = [...options.classes, "bastionland-site-window--players"];
		}
		return options;
	}

	/** @override */
	_configureRenderParts(options) {
		const parts = super._configureRenderParts(options);
		return this.isEditable ? parts : { map: parts.map };
	}

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const site = readSite(this.document);
		const referee = this.isEditable;
		if (referee) this.#selected = this.#stillSelectable(site);

		const map = siteMap(site, {
			title: t("sites.map.label", { name: this.document.name }),
			labels: this.#mapLabels(),
			players: !referee,
			mode: referee ? this.#mode : null,
			selected: this.#selected,
			idPrefix: this.id
		});
		return Object.assign(context, { referee, map }, referee ? this.#refereeContext(site) : this.#playersContext(site));
	}

	/**
	 * @param {Site} site
	 * @returns {SiteSelection|null} The selection, unless someone else's change or Undo took away what it picked.
	 */
	#stillSelectable(site) {
		const selected = this.#selected;
		if (!selected || this.#mode !== "draw") return null;
		if (selected.type === "point") return POSITION_KEYS.includes(selected.key) ? selected : null;
		const edge = siteEdge(selected.key);
		return edge?.ends.every((end) => site.points[end].kind) ? selected : null;
	}

	/** @returns {import("../rules/site-diagram.js").SiteMapLabels} */
	#mapLabels() {
		return {
			point: ({ number, kind }) => t("sites.map.point", { number, kind: t(`sites.points.${kind}.label`) }),
			erased: () => t("sites.map.erased"),
			route: ({ from, to, kind }) => (kind
				? t("sites.map.route", { from, to, kind: t(`sites.routes.${kind}.label`) })
				: t("sites.map.slot", { from, to })),
			entrance: ({ number, kind }) => t("sites.map.entrance", { number, kind: t(`sites.entrances.${kind}.label`) }),
			glimpsed: () => t("sites.map.glimpsed")
		};
	}

	/**
	 * @param {Site} site
	 * @returns {object} What the Referee's toolbar, map and key show.
	 */
	#refereeContext(site) {
		const drawing = this.#mode === "draw";
		const steps = siteSteps(site);
		return {
			drawing,
			hint: t(`sites.modes.${this.#mode}.help`),
			modes: SITE_MODES.map((mode) => ({
				key: mode,
				label: t(`sites.modes.${mode}.label`),
				hint: t(`sites.modes.${mode}.hint`),
				icon: MODE_ICONS[mode],
				active: mode === this.#mode
			})),
			undoDisabled: !this.#steps.undo.length,
			redoDisabled: !this.#steps.redo.length,
			bar: drawing ? this.#bar(site) : null,
			steps: steps.map((step, index) => this.#step(site, step, index)),
			rules: Object.entries(RULE_KINDS).map(([group, kinds]) => ({
				label: t(`sites.rules.${group}`),
				counts: kinds.map((kind) => ({
					id: `${this.id}-rules-${group}-${kind}`,
					name: `rules.${group}.${kind}`,
					value: site.rules[group][kind],
					max: RULE_LIMITS[group],
					label: t(`sites.${group}.${kind}.plural`),
					glyph: kindGlyph(group, kind)
				}))
			})),
			presets: SITE_PRESETS.map(({ key, rules }) => ({
				key,
				label: t(`sites.presets.${key}`),
				active: foundry.utils.objectsEqual(rules, site.rules)
			})),
			name: this.document.name,
			notes: site.notes,
			journal: hasSiteJournal(this.document, site),
			entrances: ENTRANCE_KINDS.flatMap((kind) => numberedPoints(site)
				.filter((key) => site.points[key].entrance === kind)
				.map((key) => {
					const { number, entranceText, entranceFound } = site.points[key];
					const label = t(`sites.entrances.${kind}.label`);
					const at = t("sites.key.at", { number });
					return {
						key,
						label,
						at,
						glyph: kindGlyph("entrances", kind),
						name: `points.${key}.entranceText`,
						text: entranceText,
						placeholder: t(`sites.entrances.${kind}.placeholder`),
						fieldLabel: `${label}, ${at}`,
						found: this.#foundToggle(entranceFound)
					};
				})),
			points: numberedPoints(site).map((key) => {
				const { kind, number, text, found } = site.points[key];
				const label = t(`sites.points.${kind}.label`);
				return {
					key,
					number,
					label,
					glyph: kindGlyph("points", kind),
					name: `points.${key}.text`,
					text,
					placeholder: t(`sites.points.${kind}.placeholder`),
					fieldLabel: t("sites.map.point", { number, kind: label }),
					found: this.#foundToggle(found),
					routes: routesFrom(site, key).map(({ to, kind: route, text: note }) => ({
						glyph: kindGlyph("routes", route),
						label: t(`sites.routes.${route}.to`, { number: to }),
						note
					}))
				};
			})
		};
	}

	/**
	 * @param {boolean} found
	 * @returns {{pressed: boolean, icon: string, label: string}} An eye that says whether players have found something.
	 */
	#foundToggle(found) {
		return {
			pressed: found,
			icon: found ? "fa-solid fa-eye" : "fa-solid fa-eye-slash",
			label: t(found ? "sites.key.found" : "sites.key.notFound")
		};
	}

	/**
	 * @param {Site} site
	 * @param {import("../rules/sites.js").SiteStep} step
	 * @param {number} index
	 * @returns {object} One of the book's steps, with its counts.
	 */
	#step(site, { key, state, tallies, unreachable }, index) {
		// A roll that would draw nothing is offered disabled, rather than hidden, so the steps stay in line.
		const rolls = STEP_CAN_ROLL[key]?.(site) ?? false;
		let detail = "";
		if (key === "reachable" && state === "problem") detail = t("sites.steps.reachable.unreachable", { points: unreachable.join(", ") });
		return {
			key,
			number: index + 1,
			state,
			label: t(`sites.steps.${key}.label`),
			hint: t(`sites.steps.${key}.hint`),
			stateLabel: t(`sites.steps.states.${state}`),
			stateIcon: STATE_ICONS[state],
			detail,
			tallies: tallies.map(({ kind, count, target, state: tally }) => ({
				glyph: kindGlyph(key, kind),
				label: t(`sites.${key}.${kind}.plural`),
				hint: t(`sites.${key}.${kind}.hint`),
				count: t("sites.steps.count", { count, target }),
				state: tally
			})),
			roll: STEP_ROLLS[key] ? { label: t(`sites.steps.${key}.roll`), disabled: !rolls } : null
		};
	}

	/**
	 * The bar over the map for the selected point or route.
	 * @param {Site} site
	 * @returns {object|null}
	 */
	#bar(site) {
		const selected = this.#selected;
		if (!selected) return null;

		if (selected.type === "point") {
			const point = site.points[selected.key];
			const at = sitePoint(selected.key);
			const counts = pointCounts(site);
			return {
				x: mapPercent(at).x,
				// Along the nearer edge of the map, in the margin beyond the points, so the next point is still there to click.
				placement: at.y < 0 ? "top" : "bottom",
				label: point.kind ? t("sites.bar.point", { number: point.number }) : t("sites.map.erased"),
				kinds: POINT_KINDS.map((kind) => ({
					action: "markPoint",
					kind,
					glyph: kindGlyph("points", kind),
					label: t(`sites.points.${kind}.label`),
					hint: t(`sites.points.${kind}.hint`),
					tally: t("sites.steps.count", { count: counts[kind], target: site.rules.points[kind] }),
					pressed: point.kind === kind
				})),
				clear: null,
				erase: point.kind ? { label: t("sites.bar.erase"), hint: t("sites.bar.eraseHint") } : null,
				numbers: point.kind ? markedPoints(site).map((_key, index) => ({ number: index + 1, pressed: index + 1 === point.number })) : [],
				entrances: point.kind ? ENTRANCE_KINDS.map((kind) => ({
					kind,
					glyph: kindGlyph("entrances", kind),
					label: t(`sites.entrances.${kind}.label`),
					hint: t(`sites.entrances.${kind}.hint`),
					pressed: point.entrance === kind
				})) : [],
				note: null,
				found: null
			};
		}

		const route = site.routes[selected.key];
		const [from, to] = siteEdge(selected.key).ends.map((end) => site.points[end].number).sort((a, b) => a - b);
		const middle = edgeMiddle(selected.key);
		const counts = routeCounts(site);
		return {
			x: mapPercent(middle).x,
			placement: middle.y < 0 ? "top" : "bottom",
			label: t("sites.bar.route", { from, to }),
			kinds: ROUTE_KINDS.map((kind) => ({
				action: "drawRoute",
				kind,
				glyph: kindGlyph("routes", kind),
				label: t(`sites.routes.${kind}.label`),
				hint: t(`sites.routes.${kind}.hint`),
				tally: t("sites.steps.count", { count: counts[kind], target: site.rules.routes[kind] }),
				pressed: route.kind === kind
			})),
			clear: route.kind ? { action: "drawRoute", label: t("sites.bar.remove"), hint: t("sites.bar.removeHint") } : null,
			erase: null,
			numbers: [],
			entrances: [],
			note: route.kind ? { name: `routes.${selected.key}.text`, value: route.text, placeholder: t("sites.bar.note") } : null,
			found: route.kind === "hidden" ? this.#foundToggle(route.found) : null
		};
	}

	/**
	 * @param {Site} site
	 * @returns {object} What players' map shows beneath it.
	 */
	#playersContext(site) {
		const view = playerView(site);
		const legend = (group, kinds) => kinds.map((kind) => ({ glyph: kindGlyph(group, kind), label: t(`sites.${group}.${kind}.label`) }));
		return {
			empty: !view.points.length && !view.glimpsed.length && !view.routes.length && !view.entrances.length,
			legend: [...legend("points", POINT_KINDS), ...legend("routes", ROUTE_KINDS), ...legend("entrances", ENTRANCE_KINDS)]
		};
	}

	/** @override */
	async _onFirstRender(context, options) {
		await super._onFirstRender(context, options);
		this.element.addEventListener("keydown", (event) => this.#onKeyDown(event));
		// The bar's number is a choice rather than a button. Having no name, it sends nothing with the form.
		this.element.addEventListener("change", (event) => {
			if (event.target.matches?.("[data-change='numberPoint']")) this.#renumber(Number(event.target.value));
		});
	}

	/** @override */
	async _onRender(context, options) {
		await super._onRender(context, options);
		if (!this.isEditable) return;
		this.#placeBar();
		this.#showSelectionInKey();
	}

	/**
	 * Keep a draft typed into a field someone else's change redraws, rather than
	 * putting back what was saved underneath the typist.
	 * @override
	 */
	_preSyncPartState(partId, newElement, priorElement, state) {
		super._preSyncPartState(partId, newElement, priorElement, state);
		const field = priorElement.querySelector(":is(input, textarea):focus");
		if (field?.name && field.value !== field.defaultValue) {
			state.draft = { name: field.name, value: field.value, start: field.selectionStart, end: field.selectionEnd };
		}
	}

	/** @override */
	_syncPartState(partId, newElement, priorElement, state) {
		super._syncPartState(partId, newElement, priorElement, state);
		if (!state.draft) return;
		const field = [...newElement.querySelectorAll(":is(input, textarea)[name]")].find(({ name }) => name === state.draft.name);
		if (!field) return;
		field.value = state.draft.value;
		field.setSelectionRange?.(state.draft.start, state.draft.end);
	}

	/** Nudge the bar across so it doesn't hang off either side of the map. */
	#placeBar() {
		const bar = this.element.querySelector(".bastionland-site__bar");
		const board = bar?.closest(".bastionland-site__board");
		if (!board) return;
		const room = board.getBoundingClientRect();
		const box = bar.getBoundingClientRect();
		const shift = Math.max(0, room.left + BAR_INSET - box.left) - Math.max(0, box.right - (room.right - BAR_INSET));
		bar.style.setProperty("--site-shift", `${Math.round(shift)}px`);

		if (this.#focusBar) {
			this.#focusBar = false;
			bar.querySelector("button[aria-pressed='true'], button:not([data-action='deselect'])")?.focus();
		}
	}

	/** Mark the selected point's entries in the key, and bring its entry into view when the selection changes. */
	#showSelectionInKey() {
		const key = this.#selected?.type === "point" ? this.#selected.key : null;
		const entries = this.element.querySelectorAll(".bastionland-site__entry[data-point]");
		for (const entry of entries) entry.classList.toggle("is-selected", entry.dataset.point === key);
		if (key && key !== this.#shownInKey) {
			[...entries].find((entry) => entry.dataset.point === key && entry.matches(".bastionland-site__entry--point"))
				?.scrollIntoView({ block: "nearest", behavior: "smooth" });
		}
		this.#shownInKey = key;
	}

	/**
	 * Enter or Space presses a part of the map, as they press a button. Escape
	 * closes the bar rather than the window. Ctrl+Z undoes and Ctrl+Y or
	 * Ctrl+Shift+Z redoes, with Cmd in place of Ctrl on a Mac, unless a text
	 * field has the key for its own Undo.
	 * @param {KeyboardEvent} event
	 */
	#onKeyDown(event) {
		const { key, target } = event;
		const typing = target instanceof HTMLElement && target.matches("input, textarea, select, [contenteditable]");

		if ((key === "Enter" || key === " ") && target instanceof SVGElement && target.matches("[data-action][role='button']")) {
			event.preventDefault();
			target.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
			return;
		}

		if (key === "Escape" && this.#selected && (!typing || target.closest(".bastionland-site__bar"))) {
			event.preventDefault();
			event.stopPropagation();
			// Leaving the note sends what was typed before the bar goes.
			if (typing) target.blur();
			this.#deselect({ focus: true });
			return;
		}

		if (typing) return;
		const way = undoRedoKey(event);
		if (!way) return;
		event.preventDefault();
		event.stopPropagation();
		this.#history(way);
	}

	/**
	 * Open the bar for a point or route, or close it when it's already open for that one.
	 * @param {SiteSelection} selection
	 * @param {MouseEvent} event A click from the keyboard has no detail, and moves focus into the bar.
	 */
	#select(selection, event) {
		const same = this.#selected?.type === selection.type && this.#selected.key === selection.key;
		this.#selected = same ? null : selection;
		this.#focusBar = !same && event?.detail === 0;
		return this.render({ parts: ["map"] });
	}

	/**
	 * @param {object} [options]
	 * @param {boolean} [options.focus] Put focus back on what the bar was open for.
	 */
	async #deselect({ focus = false } = {}) {
		const was = this.#selected;
		if (!was) return;
		this.#selected = null;
		await this.render({ parts: ["map"] });
		if (focus) this.element.querySelector(`#${CSS.escape(`${this.id}-${was.type}-${was.key}`)}`)?.focus();
	}

	/**
	 * Change the Site, one change after another, recording it for Undo.
	 * @param {(site: Site) => Site} change
	 * @param {object} [options]
	 * @param {object} [options.update] More for the same update, such as the entry's name.
	 * @returns {Promise<void>}
	 */
	#write(change, { update = {} } = {}) {
		return this.#writing(async () => {
			if (!this.isEditable) return;
			const before = readSite(this.document);
			const changes = siteUpdate(before, change(before));
			if (!Object.keys(changes).length && !Object.keys(update).length) return;
			if (Object.keys(changes).length) this.#steps = recordChange(this.#steps, before);
			await this.document.update({ ...update, ...changes });
		}).catch((error) => console.error(`${SYSTEM_ID} | Couldn't change the Site ${this.document.name}`, error));
	}

	/**
	 * Undo or redo the last change.
	 * @param {"undo"|"redo"} way
	 * @returns {Promise<void>}
	 */
	#history(way) {
		return this.#writing(async () => {
			const current = readSite(this.document);
			const step = stepHistory(this.#steps, way, current);
			if (!step) return;
			this.#steps = step.history;
			const changes = siteUpdate(current, step.target);
			// Nothing to write still changes which of Undo and Redo can be pressed.
			if (Object.keys(changes).length) await this.document.update(changes);
			else await this.render({ parts: ["toolbar"] });
		}).catch((error) => console.error(`${SYSTEM_ID} | Couldn't ${way} on the Site ${this.document.name}`, error));
	}

	/** @override */
	_onClose(options) {
		super._onClose(options);
		const entry = this.document;
		const discard = this.discardIfBlank && game.user.isGM;
		this.discardIfBlank = false;
		this.#selected = null;
		this.#shownInKey = null;
		this.#steps = emptyHistory();
		// A Site made with New Site and closed untouched leaves no empty entry behind.
		if (discard) {
			this.#writing.settled().then(() => {
				if (game.journal.has(entry.id) && isBlankSite(readSite(entry)) && entry.name === t("sites.defaultName")) return entry.delete();
			}).catch((error) => console.error(`${SYSTEM_ID} | Couldn't discard the empty Site ${entry.name}`, error));
		}
	}

	/* -------------------------------------------- */
	/*  Actions                                     */
	/* -------------------------------------------- */

	/**
	 * Name, notes, rules, and what's written about points, entrances and routes.
	 * @this {SiteSheet}
	 */
	static #onSubmit(_event, _form, formData) {
		if (!this.isEditable) return;
		const data = foundry.utils.expandObject(formData.object);
		const name = String(data.name ?? "").trim();
		const update = name && name !== this.document.name ? { name } : {};
		return this.#write((site) => applySiteForm(site, data), { update });
	}

	/**
	 * A point on the map: open the bar for it while drawing, or show or hide it from players while revealing.
	 * @this {SiteSheet}
	 */
	static #onPoint(event, target) {
		const key = target.dataset.point;
		if (this.#mode === "reveal") return this.#write((site) => revealPoint(site, key, !site.points[key].found));
		return this.#select({ type: "point", key }, event);
	}

	/**
	 * A route or a gap for one: open the bar while drawing, or show or hide a hidden route while revealing.
	 * @this {SiteSheet}
	 */
	static #onRoute(event, target) {
		const key = target.dataset.route;
		if (this.#mode === "reveal") return this.#write((site) => revealRoute(site, key, !site.routes[key].found));
		return this.#select({ type: "route", key }, event);
	}

	/** @this {SiteSheet} */
	static #onEntrance(_event, target) {
		const key = target.dataset.point;
		return this.#write((site) => revealEntrance(site, key, !site.points[key].entranceFound));
	}

	/**
	 * The map's background, and the bar's close button.
	 * @this {SiteSheet}
	 */
	static #onDeselect(_event, target) {
		return this.#deselect({ focus: target.matches("button") });
	}

	/** @this {SiteSheet} */
	static #onMarkPoint(_event, target) {
		if (this.#selected?.type !== "point") return;
		const { key } = this.#selected;
		return this.#write((site) => markPoint(site, key, target.dataset.kind || null));
	}

	/**
	 * Give the selected point another number, swapping with the point that had it.
	 * @param {number} number
	 */
	#renumber(number) {
		if (this.#selected?.type !== "point") return;
		const { key } = this.#selected;
		return this.#write((site) => numberPoint(site, key, number));
	}

	/**
	 * Place an entrance at the selected point, or take it away if it's already there.
	 * @this {SiteSheet}
	 */
	static #onPlaceEntrance(_event, target) {
		if (this.#selected?.type !== "point") return;
		const { key } = this.#selected;
		const kind = target.dataset.kind;
		return this.#write((site) => setEntrance(site, key, site.points[key].entrance === kind ? null : kind));
	}

	/** @this {SiteSheet} */
	static #onDrawRoute(_event, target) {
		if (this.#selected?.type !== "route") return;
		const { key } = this.#selected;
		return this.#write((site) => setRoute(site, key, target.dataset.kind || null));
	}

	/** @this {SiteSheet} */
	static #onFindRoute() {
		if (this.#selected?.type !== "route") return;
		const { key } = this.#selected;
		return this.#write((site) => revealRoute(site, key, !site.routes[key].found));
	}

	/**
	 * A point's entry in the key: draw it on the map.
	 * @this {SiteSheet}
	 */
	static #onPickPoint(event, target) {
		const key = target.dataset.point;
		if (this.#selected?.type === "point" && this.#selected.key === key) return;
		if (this.#mode !== "draw") {
			this.#mode = "draw";
			this.#selected = { type: "point", key };
			this.#focusBar = event.detail === 0;
			return this.render();
		}
		return this.#select({ type: "point", key }, event);
	}

	/**
	 * The eye beside an entry in the key.
	 * @this {SiteSheet}
	 */
	static #onFound(_event, target) {
		const { point, entrance } = target.dataset;
		if (entrance) return this.#write((site) => revealEntrance(site, entrance, !site.points[entrance].entranceFound));
		return this.#write((site) => revealPoint(site, point, !site.points[point].found));
	}

	/** @this {SiteSheet} */
	static #onMode(_event, target) {
		const mode = target.dataset.mode;
		if (!SITE_MODES.includes(mode) || mode === this.#mode) return;
		this.#mode = mode;
		this.#selected = null;
		return this.render();
	}

	/** @this {SiteSheet} */
	static #onRollStep(_event, target) {
		const roll = STEP_ROLLS[target.dataset.step];
		if (!roll) return;
		return this.#write((site) => roll(site, createRandom(randomSeed())));
	}

	/** @this {SiteSheet} */
	static #onRollRest() {
		return this.#write((site) => rollSite(site, createRandom(randomSeed())));
	}

	/** @this {SiteSheet} */
	static async #onClear() {
		const confirmed = await confirmDialog({
			title: t("sites.clearTitle", { name: this.document.name }),
			icon: "fa-solid fa-eraser",
			message: escapeHTML(t("sites.clearConfirm"))
		});
		if (!confirmed) return;
		this.#selected = null;
		return this.#write(clearSite);
	}

	/** @this {SiteSheet} */
	static #onPreset(_event, target) {
		const preset = SITE_PRESETS.find(({ key }) => key === target.dataset.preset);
		if (!preset) return;
		return this.#write((site) => setRules(site, preset.rules));
	}

	/** @this {SiteSheet} */
	static #onRevealAll() {
		return this.#write((site) => revealEverything(site, true));
	}

	/** @this {SiteSheet} */
	static #onHideAll() {
		return this.#write((site) => revealEverything(site, false));
	}

	/** @this {SiteSheet} */
	static #onUndo() {
		return this.#history("undo");
	}

	/** @this {SiteSheet} */
	static #onRedo() {
		return this.#history("redo");
	}

	/**
	 * Foundry's own Show Players, which can also let them see the entry.
	 * @this {SiteSheet}
	 */
	static #onShowPlayers() {
		return foundry.documents.collections.Journal.showDialog(this.document);
	}

	/**
	 * The Site written out in a Journal entry of its own, which players see only once a GM shares it.
	 * @this {SiteSheet}
	 */
	static #onJournal() {
		return openSiteJournal(this.document);
	}
}
