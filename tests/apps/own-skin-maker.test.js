import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { BLOG_LANDMARK_TYPES, LANDMARK_TYPES, isBlogLandmark } from "../../module/rules/realm.js";
import { defaultRealmLook } from "../../module/rules/realm-skins.js";

/** Whether the world offers the blog's Landmarks. */
let blog = false;

vi.mock("../../module/actions/blog-landmarks.js", () => ({
	blogLandmarksOn: () => blog,
	offeredLandmarks: () => (blog ? [...LANDMARK_TYPES] : LANDMARK_TYPES.filter((type) => !isBlogLandmark(type)))
}));
vi.mock("../../module/actions/own-skins.js", () => ({ saveOwnSkin: vi.fn() }));
vi.mock("../../module/book-art/files.js", () => ({ filePicker: vi.fn() }));
vi.mock("../../module/chat/cards.js", () => ({ t: (key) => key }));
vi.mock("../../module/apps/art-preview.js", () => ({ ArtPreviewMixin: (base) => class extends base {} }));
vi.mock("../../module/apps/ui.js", () => ({ chooseLocalFiles: vi.fn() }));

let realmPictureGroups;

beforeAll(async () => {
	globalThis.foundry = { applications: { api: { ApplicationV2: class {}, HandlebarsApplicationMixin: (base) => class extends base {} } } };
	({ realmPictureGroups } = await import("../../module/apps/OwnSkinMaker.js"));
});

afterAll(() => {
	delete globalThis.foundry;
});

/** @returns {string[]} The Landmark labels the features group shows. */
const landmarkLabels = () => realmPictureGroups(defaultRealmLook())[1].pictures
	.map((picture) => picture.label)
	.filter((label) => label.startsWith("realm.landmarks."));

describe("the Realm pictures a skin maker and Realm Appearance show", () => {
	it("leaves the blog's Landmarks out while the world doesn't offer them", () => {
		blog = false;
		const labels = landmarkLabels();
		expect(labels).toContain("realm.landmarks.other");
		for (const type of BLOG_LANDMARK_TYPES) expect(labels).not.toContain(`realm.landmarks.${type}`);
	});

	it("shows them once it does", () => {
		blog = true;
		expect(landmarkLabels()).toEqual(LANDMARK_TYPES.map((type) => `realm.landmarks.${type}`));
	});
});
