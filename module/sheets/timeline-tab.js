// A sheet's Timeline page: its actor's thread of the campaign's Timeline, or
// on the Referee Toolkit every thread side by side. TimelineTabMixin does all
// the page asks of its sheet: its button's action, its words, following the
// Timeline while the sheet is open, and wiring the page each time it's drawn.
// The sheet lists the page among its TABS where it wants it on the rail, and
// among its PARTS as a part of its own, so a write on the Timeline draws only
// the page, and the sheet's other redraws leave it as it is. A world with the
// Timeline turned off has no Timeline page.
//
// A sheet whose pages sit together under one header, as the Knight's and the
// Domain's do, marks where the page goes with an empty `data-timeline-slot`
// in its own part, and the page is put there each time either is drawn.

import { TimelineTab, onTimelineAction, timelineRedrawer, timelineShown } from "../apps/timeline-ui.js";

/** The page's id, among a sheet's TABS and its PARTS. */
const TIMELINE_TAB = "timeline";

/** Where a sheet's own part has the page put. */
const SLOT = "[data-timeline-slot]";

/**
 * @param {typeof foundry.applications.api.ApplicationV2} Base An actor sheet with tabs, drawn by Handlebars a part at a time.
 * @param {object} [options]
 * @param {boolean} [options.board] Every thread side by side, as the Timeline window shows them, rather than the actor's own.
 */
export const TimelineTabMixin = (Base, { board = false } = {}) => class extends Base {
	static DEFAULT_OPTIONS = { actions: { timeline: onTimelineAction } };

	#timeline = new TimelineTab(this, { board, redraw: () => this._redrawTimeline(), show: () => this.render({ parts: [TIMELINE_TAB] }) });

	/** The page drawn again, once a burst of writes has settled. */
	#redrawSoon = timelineRedrawer(this, TIMELINE_TAB);

	/** Whether the page as last drawn was put back into a sheet part drawn afresh, so it's wired again. */
	#moved = false;

	/** Draw the page again, on its own. */
	_redrawTimeline() {
		this.#redrawSoon();
	}

	/**
	 * A world with the Timeline turned off has no Timeline page.
	 * @override
	 */
	_getTabsConfig(group) {
		const config = super._getTabsConfig(group);
		if (!config?.tabs?.some((tab) => tab.id === TIMELINE_TAB) || timelineShown()) return config;
		return { ...config, tabs: config.tabs.filter((tab) => tab.id !== TIMELINE_TAB) };
	}

	/** @returns {boolean} Whether the sheet shows the page: not while the world has it off, nor on a Knight still to be chosen. */
	#hasPage() {
		return Boolean(this._getTabsConfig("primary")?.tabs?.some((tab) => tab.id === TIMELINE_TAB));
	}

	/**
	 * No part for a page the sheet doesn't show.
	 * @override
	 */
	_configureRenderParts(options) {
		const parts = super._configureRenderParts(options);
		if (!this.#hasPage()) delete parts[TIMELINE_TAB];
		return parts;
	}

	/**
	 * The page is drawn when asked for, and otherwise only when it isn't on the
	 * sheet yet, the sheet is opened on a page, or the actor is renamed, as a
	 * thread is named after its actor: the page follows the Timeline on its own,
	 * so a Knight's VIG changing in a fight doesn't gather their thread again.
	 * @override
	 */
	_configureRenderOptions(options) {
		const asked = options.parts;
		super._configureRenderOptions(options);
		if (!options.parts.includes(TIMELINE_TAB)) return;
		const renamed = options.renderContext === `update${this.document?.documentName}` && "name" in (options.renderData ?? {});
		const draws = this.#hasPage() && (asked?.includes(TIMELINE_TAB) || !this.parts?.[TIMELINE_TAB]?.isConnected || options.tab !== undefined || renamed);
		if (!draws) options.parts = options.parts.filter((id) => id !== TIMELINE_TAB);
	}

	/** @override */
	async _preparePartContext(partId, context, options) {
		const part = await super._preparePartContext(partId, context, options);
		if (partId === TIMELINE_TAB) part.timeline = await this.#timeline.context(context.tabs);
		return part;
	}

	/**
	 * Put the page into the slot a sheet part keeps for it: the page as last
	 * drawn, if it isn't being drawn again.
	 * @param {HTMLElement} root
	 * @returns {boolean} Whether there was a slot and a page to put in it.
	 */
	#fillSlot(root) {
		const slot = root?.querySelector(SLOT);
		const page = this.parts?.[TIMELINE_TAB];
		if (!slot || !page) return false;
		slot.replaceWith(page);
		return true;
	}

	/**
	 * A sheet part drawn afresh takes the page into its slot before its scroll is
	 * put back, so the page's height counts.
	 * @override
	 */
	_syncPartState(partId, newElement, priorElement, state) {
		if (partId !== TIMELINE_TAB && this.#fillSlot(newElement)) this.#moved = true;
		super._syncPartState(partId, newElement, priorElement, state);
	}

	/**
	 * A page drawn where there was nothing before is added at the window's
	 * foot, and moved into its slot from there.
	 * @override
	 */
	_replaceHTML(result, content, options) {
		super._replaceHTML(result, content, options);
		this.#fillSlot(content);
	}

	/**
	 * A Timeline page that missed a change while hidden is drawn again as it's opened.
	 * @override
	 */
	changeTab(tab, group, options) {
		super.changeTab(tab, group, options);
		this.#timeline.shown(tab);
	}

	/** @override */
	async _onFirstRender(context, options) {
		await super._onFirstRender(context, options);
		this.#timeline.watch();
	}

	/**
	 * The page is wired as it's drawn, and again once moved into a sheet part
	 * drawn afresh, which puts its board back where it was left.
	 * @override
	 */
	async _onRender(context, options) {
		await super._onRender(context, options);
		if (!options.parts?.includes(TIMELINE_TAB) && !this.#moved) return;
		this.#moved = false;
		this.#timeline.wire(this.element);
	}

	/** @override */
	_onClose(options) {
		super._onClose(options);
		this.#timeline.unwatch();
	}
};
