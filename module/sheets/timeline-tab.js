// A sheet's Timeline page: its actor's thread of the campaign's Timeline, or
// on the Referee Toolkit every thread side by side. TimelineTabMixin does all
// the page asks of its sheet: its button's action, its words, following the
// Timeline while the sheet is open, and wiring the page each time it's drawn.
// The sheet lists the page among its TABS where it wants it on the rail. A
// world with the Timeline turned off has no Timeline page.

import { TimelineTab, onTimelineAction, timelineShown } from "../apps/timeline-ui.js";
import { renderWhenIdle } from "../apps/ui.js";

/** The page's id, among a sheet's TABS and, where it's a part of its own, its PARTS. */
export const TIMELINE_TAB = "timeline";

/**
 * @param {typeof foundry.applications.api.ApplicationV2} Base An actor sheet with tabs.
 * @param {object} [options]
 * @param {boolean} [options.board] Every thread side by side, as the Timeline window shows them, rather than the actor's own.
 */
export const TimelineTabMixin = (Base, { board = false } = {}) => class extends Base {
	static DEFAULT_OPTIONS = { actions: { timeline: onTimelineAction } };

	#timeline = new TimelineTab(this, { board, redraw: () => this._redrawTimeline() });

	/** @returns {boolean} Whether the page is a part of the sheet's own, drawn on its own, rather than inside the sheet's one part. */
	get #ownPart() {
		return Boolean(this.constructor.PARTS?.[TIMELINE_TAB]);
	}

	/** Draw the page again: the whole sheet, unless the sheet draws it as a part of its own. */
	_redrawTimeline() {
		renderWhenIdle(this);
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

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		if (!this.#ownPart) context.timeline = await this.#timeline.context(context.tabs);
		return context;
	}

	/** @override */
	async _preparePartContext(partId, context, options) {
		const part = await super._preparePartContext(partId, context, options);
		if (partId === TIMELINE_TAB && this.#ownPart) part.timeline = await this.#timeline.context(context.tabs);
		return part;
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

	/** @override */
	async _onRender(context, options) {
		await super._onRender(context, options);
		if (!this.#ownPart || options.parts?.includes(TIMELINE_TAB)) this.#timeline.wire(this.element);
	}

	/** @override */
	_onClose(options) {
		super._onClose(options);
		this.#timeline.unwatch();
	}
};
