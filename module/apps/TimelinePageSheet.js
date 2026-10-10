import { pageTrackId, trackOfPage } from "../actions/timeline-store.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { trackContext, unwatchTimeline, watchTimeline } from "./timeline-ui.js";
import { renderWhenIdle } from "./ui.js";

/**
 * A thread of the Timeline as its journal page reads in the sidebar, so the
 * record can be shared and read outside the system's own windows. It's
 * written from the Timeline window or a sheet's Timeline tab. Made during
 * init, once Foundry's page sheet is there to build on.
 * @returns {typeof foundry.applications.sheets.journal.JournalEntryPageHandlebarsSheet}
 */
export function createTimelinePageSheet() {
	const { JournalEntryPageHandlebarsSheet } = foundry.applications.sheets.journal;
	const content = { template: templatePath("journal/timeline-page.hbs") };

	return class TimelinePageSheet extends JournalEntryPageHandlebarsSheet {
		static DEFAULT_OPTIONS = {
			classes: [SYSTEM_ID, "bastionland-timeline-page"]
		};

		static EDIT_PARTS = {
			header: super.EDIT_PARTS.header,
			content,
			footer: super.EDIT_PARTS.footer
		};

		static VIEW_PARTS = { content: { ...content, root: true } };

		#hooks = [];

		/** @override */
		async _prepareContentContext(context, options) {
			await super._prepareContentContext(context, options);
			context.timeline = await trackContext(trackOfPage(this.document), { editable: false });
		}

		/** @override */
		async _onFirstRender(context, options) {
			await super._onFirstRender(context, options);
			this.#hooks = watchTimeline(pageTrackId(this.document), () => renderWhenIdle(this));
		}

		/** @override */
		_onClose(options) {
			super._onClose(options);
			unwatchTimeline(this.#hooks);
			this.#hooks = [];
		}
	};
}
