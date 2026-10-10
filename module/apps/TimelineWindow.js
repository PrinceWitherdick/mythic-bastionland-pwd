import { t } from "../chat/cards.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { boardContext, onTimelineAction, unwatchTimeline, watchTimeline, wireTimelineFilter } from "./timeline-ui.js";
import { renderWhenIdle, singletonOpener } from "./ui.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/** How long a burst of writes is let settle before the Timeline is drawn again. */
const REDRAW_DELAY = 150;

/**
 * The full Timeline, after Stonetop's: every thread of the tale side by side,
 * the Company's, each Knight's, each Domain's and each Realm's, a row for
 * each Season. Anyone can open it; anyone who owns the Timeline can write on it.
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
		board: { template: templatePath("apps/timeline.hbs"), scrollable: [".bastionland-timeline__scroll"] }
	};

	/** @override */
	get title() {
		return t("timeline.title");
	}

	/** The hooks it follows while open. */
	#hooks = [];

	/** A burst of writes is let settle before the Timeline is drawn again; one landing after it closes draws nothing. */
	#redraw = foundry.utils.debounce(() => renderWhenIdle(this), REDRAW_DELAY);

	/** Whether it has been scrolled to the Season it is now, which it is once. */
	#placed = false;

	/** The Filter stays open across a redraw it caused. */
	#filter = { open: false };

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
		const root = this.element;
		wireTimelineFilter(root, { trackIds: this.#trackIds, state: this.#filter });
		if (!this.#placed) {
			this.#placed = true;
			const now = root.querySelector(".bastionland-timeline__period-head.is-now") ?? [...root.querySelectorAll(".bastionland-timeline__period-head")].at(-1);
			now?.scrollIntoView({ block: "center" });
		}
	}

	/** @override */
	_onClose(options) {
		super._onClose(options);
		unwatchTimeline(this.#hooks);
		this.#hooks = [];
		this.#placed = false;
	}
}

/** Open the full Timeline, bringing it forward if it's already open. */
export const openTimeline = singletonOpener(TimelineWindow);

/**
 * The window to render when restoring it after a reload.
 * @returns {TimelineWindow}
 */
export const reopenableTimeline = () => foundry.applications.instances.get(TimelineWindow.DEFAULT_OPTIONS.id) ?? new TimelineWindow();
