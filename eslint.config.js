import js from "@eslint/js";
import globals from "globals";

// Globals Foundry provides at runtime. Listed by hand so a misspelt global
// still fails lint instead of passing as an unknown browser global.
const foundryGlobals = {
	Actor: "readonly",
	ChatMessage: "readonly",
	CONFIG: "readonly",
	CONST: "readonly",
	foundry: "readonly",
	fromUuid: "readonly",
	game: "readonly",
	Handlebars: "readonly",
	Hooks: "readonly",
	Item: "readonly",
	Roll: "readonly",
	ui: "readonly"
};

export default [
	{ ignores: ["node_modules/**", "dist/**", "coverage/**"] },
	js.configs.recommended,
	{
		files: ["**/*.js"],
		languageOptions: {
			ecmaVersion: "latest",
			sourceType: "module",
			globals: { ...globals.browser, ...foundryGlobals }
		},
		rules: {
			eqeqeq: ["error", "smart"],
			"no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
			"no-restricted-syntax": ["error", {
				selector: "Literal[value='mythic-bastionland-pwd']",
				message: "Import SYSTEM_ID from module/system-id.js instead of spelling out the id."
			}]
		}
	},
	{
		files: ["module/system-id.js"],
		rules: { "no-restricted-syntax": "off" }
	},
	{
		files: ["tests/**/*.js", "scripts/**/*.js", "*.config.js"],
		languageOptions: { globals: { ...globals.node } }
	}
];
