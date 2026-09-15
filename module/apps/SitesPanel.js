import { postCard, t } from "../chat/cards.js";
import { randomSeed } from "../rules/random.js";
import { SITE_DIAGRAM_SIZE, siteDiagram, svgDataURI } from "../rules/site-diagram.js";
import {
	DEFAULT_SITE,
	POINT_KINDS,
	ROUTE_KINDS,
	SITE_PRESETS,
	generateSite,
	normaliseSiteOptions,
	pointRoutes
} from "../rules/sites.js";
import { escapeHTML } from "../rules/text.js";
import { SYSTEM_ID, templatePath } from "../system-id.js";
import { singletonOpener } from "./ui.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * @typedef {object} DescribedSite
 * @property {string} name   What the GM called it, or a name from its seed.
 * @property {string} label  Names the drawing for screen readers.
 * @property {string} svg    The drawing.
 * @property {{number: number, kind: string, kindLabel: string, entrances: string, routes: string}[]} points
 * @property {string[]} problems
 */

/**
 * The Journal page for a Site: the drawing, then each point with room beneath
 * it for the GM to describe what's there. The drawing goes in as an image
 * because Foundry strips <svg> from Journal text when it saves.
 * @param {DescribedSite} described
 * @returns {string} HTML.
 */
function journalContent({ label, svg, points }) {
	const image = `<p><img src="${svgDataURI(svg)}" alt="${escapeHTML(label)}" width="${SITE_DIAGRAM_SIZE}" height="${SITE_DIAGRAM_SIZE}"></p>`;
	const hint = `<p><em>${escapeHTML(t("sites.journalHint"))}</em></p>`;
	const entries = points.map(({ kindLabel, entrances, routes }) => {
		const where = entrances ? ` · ${escapeHTML(entrances)}` : "";
		return `<li><p><strong>${escapeHTML(kindLabel)}</strong>${where}: ${escapeHTML(routes)}</p><p></p></li>`;
	});
	return `${image}${hint}<ol>${entries.join("")}</ol>`;
}

/**
 * The GM's tool for Sites (p15): pick a seed and how many of each point and
 * route, see the Site drawn, then post it to the GM or keep it as a Journal.
 */
export class SitesPanel extends HandlebarsApplicationMixin(ApplicationV2) {
	static DEFAULT_OPTIONS = {
		tag: "form",
		classes: [SYSTEM_ID, "bastionland", "bastionland-sites-window"],
		position: { width: 720, height: "auto" },
		window: { title: "bastionland.sites.title", icon: "fa-solid fa-dungeon", resizable: true },
		form: { handler: SitesPanel.#onSubmit, submitOnChange: true, closeOnSubmit: false },
		actions: {
			reroll: SitesPanel.#onReroll,
			preset: SitesPanel.#onPreset,
			post: SitesPanel.#onPost,
			save: SitesPanel.#onSave
		}
	};

	static PARTS = {
		panel: { template: templatePath("apps/sites-panel.hbs") }
	};

	/** The name the GM typed, blank for one made from the seed. */
	#name = "";

	/** The seed and distribution the Site is rolled from. */
	#options = normaliseSiteOptions({ ...DEFAULT_SITE, seed: randomSeed() });

	/** @returns {DescribedSite} The Site these options roll, in words for a template or Journal. */
	#describe() {
		const site = generateSite(this.#options);
		const name = this.#name || t("sites.defaultName", { seed: this.#options.seed });
		const label = t("sites.diagram", { name });
		return {
			name,
			label,
			svg: siteDiagram(site, label),
			points: site.points.map(({ number, kind }) => ({
				number,
				kind,
				kindLabel: t(`sites.points.${kind}.label`),
				entrances: site.entrances
					.filter(({ point }) => point === number)
					.map(({ hidden }) => (hidden ? t("sites.hiddenEntranceHere") : t("sites.entranceHere")))
					.join(", "),
				routes: pointRoutes(site, number).map(({ to, kind: route }) => t(`sites.routes.${route}.to`, { number: to })).join(", ")
					|| t("sites.noRoutes")
			})),
			problems: site.problems.map(({ reason, asked, used }) => t(`sites.problems.${reason}`, { asked, used }))
		};
	}

	/** @override */
	async _prepareContext(options) {
		const context = await super._prepareContext(options);
		const { svg, points, problems } = this.#describe();
		const { seed, entrance, hiddenEntrance } = this.#options;
		const counts = (group, kinds) => kinds.map((kind) => ({
			name: `${group}.${kind}`,
			value: this.#options[group][kind],
			label: t(`sites.${group}.${kind}.plural`),
			hint: t(`sites.${group}.${kind}.hint`)
		}));

		return Object.assign(context, {
			name: this.#name,
			placeholder: t("sites.defaultName", { seed }),
			seed,
			pointCounts: counts("points", POINT_KINDS),
			routeCounts: counts("routes", ROUTE_KINDS),
			entrance,
			hiddenEntrance,
			presets: SITE_PRESETS.map(({ key }) => ({ key, label: t(`sites.presets.${key}`) })),
			diagram: svg,
			points,
			problems
		});
	}

	/* -------------------------------------------- */
	/*  Actions                                     */
	/* -------------------------------------------- */

	/** @this {SitesPanel} */
	static #onSubmit(_event, _form, formData) {
		const data = foundry.utils.expandObject(formData.object);
		this.#name = String(data.name ?? "").trim();
		// A cleared seed keeps the last one, so the drawing doesn't jump while the GM types.
		this.#options = normaliseSiteOptions(data, this.#options);
		return this.render();
	}

	/** @this {SitesPanel} */
	static #onReroll() {
		this.#options = { ...this.#options, seed: randomSeed() };
		return this.render();
	}

	/** @this {SitesPanel} */
	static #onPreset(_event, target) {
		const preset = SITE_PRESETS.find(({ key }) => key === target.dataset.preset);
		if (!preset) return;
		this.#options = normaliseSiteOptions({ ...preset, seed: this.#options.seed });
		return this.render();
	}

	/** @this {SitesPanel} */
	static #onPost() {
		if (!game.user.isGM) return;
		const { name, label, svg, points, problems } = this.#describe();
		return postCard(null, "site", {
			name,
			tagline: t("sites.tagline", { seed: this.#options.seed }),
			image: svgDataURI(svg),
			label,
			size: SITE_DIAGRAM_SIZE,
			points,
			problems
		}, { mode: "gm" });
	}

	/** @this {SitesPanel} */
	static async #onSave() {
		if (!game.user.isGM) return;
		const described = this.#describe();
		const entry = await CONFIG.JournalEntry.documentClass.create({
			name: described.name,
			pages: [{
				name: described.name,
				type: "text",
				text: { format: CONST.JOURNAL_ENTRY_PAGE_FORMATS.HTML, content: journalContent(described) }
			}]
		});
		if (!entry) return;
		ui.notifications.info(t("sites.saved", { name: entry.name }));
		entry.sheet.render({ force: true });
	}
}

/** Open Sites, bringing the window forward if it's already open. */
export const openSitesPanel = singletonOpener(SitesPanel);
