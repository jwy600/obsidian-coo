import { Editor, Notice } from "obsidian";
import type { CooSettings } from "./types";
import { chatCompletion } from "./ai-client";
import { getTranslateSystemPrompt, buildTranslateInput } from "./prompts";
import { insertTranslationAfter } from "./editor-ops";

/**
 * "Coo: Translate" — standalone, word/phrase-level.
 *
 * Select a word or phrase → trigger → the translation is inserted inline,
 * bracketed, immediately after the selection. The original text is preserved.
 * One editor op — Ctrl+Z reverts. Does not chain.
 */
export async function performTranslate(
	editor: Editor,
	settings: CooSettings,
): Promise<void> {
	const selectedText = editor.getSelection().trim();
	if (!selectedText) {
		new Notice("Select a word or phrase to translate.");
		return;
	}

	// Capture the selection end before the async call — the selection may be
	// lost or the cursor may move while we wait for the API.
	const to = editor.getCursor("to");

	new Notice("Translating...");

	try {
		const userPrompt = buildTranslateInput(selectedText);
		const systemPrompt = getTranslateSystemPrompt(settings.translateLanguage);

		const result = await chatCompletion({
			settings,
			systemPrompt,
			userPrompt,
			store: false,
			reasoningEffort: "none",
			webSearchEnabled: false,
		});

		insertTranslationAfter(editor, to, result.text);
	} catch (err) {
		const message =
			err instanceof Error ? err.message : "Translation failed.";
		new Notice(message, 5000);
	}
}
