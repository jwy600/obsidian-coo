import type { App } from "obsidian";
import type { ResponseLanguage } from "./types";
import { DEVELOPER_PROMPT_FALLBACK, replaceLanguageTag } from "./prompts";

const PROMPTS_FOLDER = "prompts";

/** Prompt file definitions for ensureDefaultPrompts. */
const DEFAULT_PROMPT_FILES: ReadonlyArray<{
	filename: string;
	content: string;
}> = [
	{
		filename: "knowledgeassistant.md",
		content: DEVELOPER_PROMPT_FALLBACK,
	},
	{
		filename: "atomic.md",
		content: `You are a concise assistant that produces atomic, self-contained notes.

<language></language>
<response_approach>
- Give one clear, focused answer per question
- Each response should stand alone as a complete thought
- Prefer brevity over thoroughness — omit what isn't essential
</response_approach>

<structure>
- Lead with the key insight (1 sentence)
- Add 1-2 supporting details if needed
- No headers unless the topic has genuinely distinct parts
</structure>

<formatting>
- Use Markdown **only where semantically correct** (e.g., \`inline code\`, \`\`\`code fences\`\`\`)
- Use backticks to format file, directory, function, and class names
- Use $ for inline math and $$ for block math (Obsidian MathJax format). NEVER use \\( \\) or \\[ \\] delimiters.
- NEVER use numbered lists (1, 2, 3). If sequence matters, use letters (a, b, c) instead
</formatting>

<avoid>
- Long explanations when a short one suffices
- Repetition and filler phrases
- Headers and bullet lists for simple answers
</avoid>`,
	},
];

function promptsFolderPath(pluginDir: string): string {
	return `${pluginDir}/${PROMPTS_FOLDER}`;
}

function promptFilePath(pluginDir: string, filename: string): string {
	return `${promptsFolderPath(pluginDir)}/${filename}`;
}

/**
 * Migrate old per-language prompt folders into the flat prompts/ structure.
 *
 * a) Moves files from prompts/en/ and prompts/zh/ into prompts/ (skips if target exists).
 * b) Removes emptied language subfolders.
 * c) Renames developer.md -> knowledgeassistant.md (if target doesn't exist).
 */
export async function migratePromptFolders(
	app: App,
	pluginDir: string,
): Promise<void> {
	const adapter = app.vault.adapter;
	const baseFolder = promptsFolderPath(pluginDir);

	for (const lang of ["en", "zh"]) {
		const langFolder = `${baseFolder}/${lang}`;
		if (!(await adapter.exists(langFolder))) continue;

		const listing = await adapter.list(langFolder);
		for (const filePath of listing.files) {
			const filename = filePath.split("/").pop() ?? "";
			if (!filename) continue;

			const targetPath = `${baseFolder}/${filename}`;
			if (!(await adapter.exists(targetPath))) {
				const content = await adapter.read(filePath);
				await adapter.write(targetPath, content);
			}
			await adapter.remove(filePath);
		}

		// Remove the now-empty language subfolder
		const remaining = await adapter.list(langFolder);
		if (remaining.files.length === 0 && remaining.folders.length === 0) {
			await adapter.rmdir(langFolder, false);
		}
	}

	// Rename developer.md -> knowledgeassistant.md
	const oldPath = `${baseFolder}/developer.md`;
	const newPath = `${baseFolder}/knowledgeassistant.md`;
	if (
		(await adapter.exists(oldPath)) &&
		!(await adapter.exists(newPath))
	) {
		const content = await adapter.read(oldPath);
		await adapter.write(newPath, content);
		await adapter.remove(oldPath);
	}
}

/**
 * Ensure prompts/ folder exists with default prompt files.
 * Never overwrites existing files (preserves user edits).
 */
export async function ensureDefaultPrompts(
	app: App,
	pluginDir: string,
): Promise<void> {
	const adapter = app.vault.adapter;
	const baseFolder = promptsFolderPath(pluginDir);

	if (!(await adapter.exists(baseFolder))) {
		await adapter.mkdir(baseFolder);
	}

	for (const { filename, content } of DEFAULT_PROMPT_FILES) {
		const path = promptFilePath(pluginDir, filename);
		if (!(await adapter.exists(path))) {
			await adapter.write(path, content);
		}
	}
}

/**
 * List all .md filenames in the flat prompts/ folder, sorted alphabetically.
 */
export async function listPromptFiles(
	app: App,
	pluginDir: string,
): Promise<string[]> {
	const folder = promptsFolderPath(pluginDir);
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
 * Load and trim the content of a prompt file from prompts/.
 * Returns null if the file does not exist or is empty.
 */
export async function loadPromptFile(
	app: App,
	pluginDir: string,
	filename: string,
): Promise<string | null> {
	const path = promptFilePath(pluginDir, filename);
	const adapter = app.vault.adapter;

	if (!(await adapter.exists(path))) {
		return null;
	}

	const content = await adapter.read(path);
	const trimmed = content.trim();
	return trimmed.length > 0 ? trimmed : null;
}

/**
 * Load the developer system prompt from prompts/{filename},
 * then apply the language tag replacement.
 *
 * If the file is missing or empty, falls back to the hardcoded
 * DEVELOPER_PROMPT_FALLBACK with language tag applied.
 */
export async function loadDeveloperPrompt(
	app: App,
	pluginDir: string,
	lang: ResponseLanguage,
	filename: string,
): Promise<{ content: string; usedFallback: boolean }> {
	const loaded = await loadPromptFile(app, pluginDir, filename);
	if (loaded) {
		return { content: replaceLanguageTag(loaded, lang), usedFallback: false };
	}
	return {
		content: replaceLanguageTag(DEVELOPER_PROMPT_FALLBACK, lang),
		usedFallback: true,
	};
}

/**
 * Migrate old prompt filenames to new names.
 * - "developer.md", "developer.en.md", "developer.zh.md" -> "knowledgeassistant.md"
 */
export function migratePromptFilename(filename: string): string {
	if (
		filename === "developer.md" ||
		filename === "developer.en.md" ||
		filename === "developer.zh.md"
	) {
		return "knowledgeassistant.md";
	}
	return filename;
}
