import { App, Editor, Notice } from "obsidian";
import type { CooSettings } from "./types";
import { askChained } from "./chain";
import { getEditSystemPrompt, buildEditInput } from "./prompts";
import {
	resolveEditBounds,
	getParagraphText,
	gatherEditContext,
	getSurroundingParagraphs,
	nextRevisionNumber,
	appendCalloutAfter,
} from "./editor-ops";

/**
 * "Coo: Edit" — standalone, writing-mode. No modal (like Translate).
 *
 * Place the cursor in the materials (the rough fragments of a thought); any
 * guidelines go in a %%…%% comment on the line directly below. Edit constructs a
 * coherent passage and appends it as a collapsed [!coo-edit] revision callout
 * beneath the input — the materials and guidelines are never overwritten, so you
 * curate by hand. Revisions are numbered per note and chain (sharing the note's
 * conversation root), so later guidelines can reference a prior revision. One
 * editor op — Ctrl+Z reverts.
 */
export async function performEdit(
	app: App,
	editor: Editor,
	settings: CooSettings,
	pluginDir: string,
	notePath: string,
): Promise<void> {
	// The materials are the selection span when text is selected (so a
	// multi-paragraph block like a list can be edited as one unit), otherwise the
	// paragraph at the cursor. A cursor/selection on a %%…%% line (or a
	// blank/heading/callout line) yields no materials — resolveEditBounds returns
	// null, so you can't "edit a guideline" by mistake.
	const bounds = resolveEditBounds(editor);
	if (!bounds) {
		new Notice("Select the materials, or place the cursor in them — not on a %%guidelines%% line.");
		return;
	}

	const materials = getParagraphText(editor, bounds.startLine, bounds.endLine);
	if (!materials.trim()) {
		new Notice("The materials paragraph is empty.");
		return;
	}

	// Guidelines: the %%…%% line(s) directly below the materials. insertAfter is
	// where the revision callout lands — after the guidelines, then after any
	// existing revisions so new ones stack in order. hasRevisions tells us whether
	// this is the paragraph's first edit.
	const { guidelines, insertAfter, hasRevisions } = gatherEditContext(editor, bounds.endLine);
	const revisionNumber = nextRevisionNumber(editor);
	// Send the surrounding before/after paragraphs only on the first edit of this
	// paragraph — later revisions inherit them via the chain (revision #1's turn
	// carried the <context>), so resending would only add tokens.
	const context = hasRevisions ? undefined : getSurroundingParagraphs(editor, bounds);

	const userPrompt = buildEditInput(materials, guidelines, revisionNumber, context);
	const systemPrompt = getEditSystemPrompt();

	new Notice("Constructing...");

	try {
		const result = await askChained({
			app,
			pluginDir,
			notePath,
			noteText: editor.getValue(),
			settings,
			systemPrompt,
			userPrompt,
			// Construction needs neither search nor deep reasoning — pin both off
			// (Ask still follows the user's settings; askChained defaults).
			reasoningEffort: "none",
			webSearchEnabled: false,
		});

		const label = guidelines || "Construct";
		const title =
			label.length > 80
				? `#${revisionNumber} ${label.slice(0, 80)}…`
				: `#${revisionNumber} ${label}`;
		appendCalloutAfter(editor, insertAfter, title, result.text, "coo-edit");

		new Notice(`Constructed revision #${revisionNumber}.`, 2000);
	} catch (err) {
		const message =
			err instanceof Error ? err.message : "Construction failed.";
		new Notice(message, 5000);
	}
}
