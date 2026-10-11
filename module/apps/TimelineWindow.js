import { t } from "../chat/cards.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { TimelineHost, boardContext, onTimelineAction, refuseHiddenTimeline, timelineShown, unwatchTimeline, watchTimeline } from "./timeline-ui.js";
import { renderWhenIdle, singletonOpener } from "./ui.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** How long a burst of writes is let settle before the Timeline is drawn again. */
const REDRAW_DELAY = 150;

/**
 * The full Timeline, after Stonetop's: every thread of the tale side by side,
 * the Company's, each Knight's, each Domain's and each Realm's, a row for
 * each Season, or a lane each across the page. Anyone can open it; anyone who
 * owns the Timeline can write on it.
 */
export class TimelineWindow extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		id: "bastionland-timeline",
		classes: [SYSTEM_ID, "bastionland", "bastionland-timeline-window"],
		position: { width: 900, height: 700 },
		window: { icon: "fa-solid fa-timeline", resizable: true },
		actions: { timeline: onTimelineAction }
	};

	static PARTS = {
		board: { template: templatePath("apps/timeline.hbs") }
	};

	/** @override */
	get title() {
		return t("timeline.title");
	}

	/** The hooks it follows while open. */
	#hooks = [];

	/** A burst of writes is let settle before the Timeline is drawn again; one landing after it closes draws nothing. */
	#redraw = foundry.utils.debounce(() => renderWhenIdle(this), REDRAW_DELAY);

	/** Its board's place, zoom, menus and keyboard, kept across redraws. */
	#host = new TimelineHost("window");

	/** The threads the board offers, as last drawn. */
	#trackIds = [];

	/** @override */
	async _prepareContext(options) {
		const board = await boardContext();
		this.#trackIds = board.threads.map((thread) => thread.trackId);
		return Object.assign(await super._prepareContext(options), board);
	}

	/** @override */
	async _onFirstRender(context, options) {
		await super._onFirstRender(context, options);
		this.#hooks = watchTimeline(null, this.#redraw);
	}

	/** @override */
	async _onRender(context, options) {
		await super._onRender(context, options);
		this.#host.wire(this.element, this.#trackIds);
	}

	/** @override */
	_onClose(options) {
		super._onClose(options);
		unwatchTimeline(this.#hooks);
		this.#hooks = [];
		this.#host.close();
	}
}

const openWindow = singletonOpener(TimelineWindow);

/** Open the full Timeline, bringing it forward if it's already open; nothing while the world has it off. */
export const openTimeline = () => (refuseHiddenTimeline() ? null : openWindow());

/**
 * The window to render when restoring it after a reload; none while the world has the Timeline off.
 * @returns {TimelineWindow|null}
 */
export const reopenableTimeline = () => (timelineShown() ? (foundry.applications.instances.get(TimelineWindow.DEFAULT_OPTIONS.id) ?? new TimelineWindow()) : null);
