import type { App } from "obsidian";
import type { ResponseLanguage } from "./types";
import {
	DEVELOPER_PROMPT_EN_FALLBACK,
	DEVELOPER_PROMPT_ZH_FALLBACK,
} from "./prompts";

const PROMPTS_FOLDER = "prompts";

const DEFAULT_PROMPT_FILES: ReadonlyArray<{
	lang: ResponseLanguage;
	filename: string;
	content: string;
}> = [
	{
		lang: "en",
		filename: "developer.md",
		content: DEVELOPER_PROMPT_EN_FALLBACK,
	},
	{
		lang: "zh",
		filename: "developer.md",
		content: DEVELOPER_PROMPT_ZH_FALLBACK,
	},
];

function langFolderPath(pluginDir: string, lang: ResponseLanguage): string {
	return `${pluginDir}/${PROMPTS_FOLDER}/${lang}`;
}

function promptFilePath(
	pluginDir: string,
	lang: ResponseLanguage,
	filename: string,
): string {
	return `${langFolderPath(pluginDir, lang)}/${filename}`;
}

/**
 * Ensure prompts/en/ and prompts/zh/ folders exist with default files.
 * Never overwrites existing files (preserves user edits).
 */
export async function ensureDefaultPrompts(
	app: App,
	pluginDir: string,
): Promise<void> {
	const adapter = app.vault.adapter;
	const baseFolder = `${pluginDir}/${PROMPTS_FOLDER}`;

	if (!(await adapter.exists(baseFolder))) {
		await adapter.mkdir(baseFolder);
	}

	for (const { lang, filename, content } of DEFAULT_PROMPT_FILES) {
		const folder = langFolderPath(pluginDir, lang);
		if (!(await adapter.exists(folder))) {
			await adapter.mkdir(folder);
		}

		const path = promptFilePath(pluginDir, lang, filename);
		if (!(await adapter.exists(path))) {
			await adapter.write(path, content);
		}
	}
}

/**
 * List all .md filenames in prompts/{lang}/, sorted alphabetically.
 */
export async function listPromptFiles(
	app: App,
	pluginDir: string,
	lang: ResponseLanguage,
): Promise<string[]> {
	const folder = langFolderPath(pluginDir, lang);
	const adapter = app.vault.adapter;

	if (!(await adapter.exists(folder))) {
		return [];
	}

	const listing = await adapter.list(folder);
	return listing.files
		.map((fullPath) => fullPath.split("/").pop() ?? "")
		.filter((name) => name.endsWith(".md"))
		.sort();
}

/**
 * Load and trim the content of a prompt file from prompts/{lang}/.
 * Returns null if the file does not exist or is empty.
 */
export async function loadPromptFile(
	app: App,
	pluginDir: string,
	lang: ResponseLanguage,
	filename: string,
): Promise<string | null> {
	const path = promptFilePath(pluginDir, lang, filename);
	const adapter = app.vault.adapter;

	if (!(await adapter.exists(path))) {
		return null;
	}

	const content = await adapter.read(path);
	const trimmed = content.trim();
	return trimmed.length > 0 ? trimmed : null;
}

/**
 * Load the developer system prompt from prompts/{lang}/{filename}.
 * If the file is missing or empty, falls back to the hardcoded prompt
 * for the given language.
 */
export async function loadDeveloperPrompt(
	app: App,
	pluginDir: string,
	lang: ResponseLanguage,
	filename: string,
): Promise<{ content: string; usedFallback: boolean }> {
	const loaded = await loadPromptFile(app, pluginDir, lang, filename);
	if (loaded) {
		return { content: loaded, usedFallback: false };
	}
	const fallback =
		lang === "zh"
			? DEVELOPER_PROMPT_ZH_FALLBACK
			: DEVELOPER_PROMPT_EN_FALLBACK;
	return { content: fallback, usedFallback: true };
}

/**
 * Migrate old flat-file prompt names (e.g. "developer.en.md") to the
 * language-folder scheme (e.g. "developer.md"). Returns the filename
 * unchanged if it doesn't match the old pattern.
 */
export function migratePromptFilename(filename: string): string {
	return filename.replace(/\.(en|zh)\.md$/, ".md");
}
