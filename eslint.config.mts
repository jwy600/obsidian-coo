import tseslint from 'typescript-eslint';
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";
import { globalIgnores } from "eslint/config";

export default tseslint.config(
	{
		languageOptions: {
			globals: {
				...globals.browser,
			},
			parserOptions: {
				projectService: {
					allowDefaultProject: [
						'eslint.config.js',
						'manifest.json',
						'vitest.config.ts',
					]
				},
				tsconfigRootDir: import.meta.dirname,
				extraFileExtensions: ['.json']
			},
		},
	},
	...obsidianmd.configs.recommended,
	{
		// Scoped to TS/JS so the obsidianmd plugin (registered by
		// configs.recommended under those file patterns) is in scope here.
		files: ["**/*.ts", "**/*.tsx", "**/*.js", "**/*.jsx"],
		rules: {
			// Keep the recommended sentence-case rule at "error" with its default
			// strictness; ignoreRegex (additive — it does not weaken the default
			// brand/acronym lists) exempts a few intentional strings:
			//   ^coo       plugin brand (kept lower-case)
			//   ^sk-       API-key placeholder format
			//   OpenAI     PascalCase brand, not auto-preserved under
			//              enforceCamelCaseLower
			//   GPT-5.6    model labels (GPT-5.6 Sol / Terra / Luna)
			//   Translate  feature name used mid-sentence
			"obsidianmd/ui/sentence-case": [
				"error",
				{
					enforceCamelCaseLower: true,
					ignoreRegex: ["^coo", "^sk-", "OpenAI", "GPT-5\\.6", "Translate"],
				},
			],
		},
	},
	globalIgnores([
		"node_modules",
		"dist",
		"esbuild.config.mjs",
		"eslint.config.js",
		"version-bump.mjs",
		"versions.json",
		"main.js",
	]),
);
