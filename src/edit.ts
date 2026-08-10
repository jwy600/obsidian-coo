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
	extractInlineGuidelines,
	type EditNote,
} from "./editor-ops";

/**
 * "Coo: Edit" — standalone, writing-mode. No modal (like Translate).
 *
 * Place the cursor in the materials — rough fragments of a thought, or finished
 * prose you want revised. Drop editing notes as %%…%% wherever you like: inline
 * next to the bit they concern (positional — a [§N] marker records the spot),
 * trailing at the end of the paragraph (whole-passage), or on the line directly
 * below (whole-passage) — all count. Edit carries out the intent (constructing
 * fragments fully, revising prose lightly) and appends the result as a collapsed
 * [!coo-edit] revision callout beneath the input — the materials and notes are
 * never overwritten, so you curate by hand. Revisions are numbered per note and
 * chain (sharing the note's conversation root), so later notes can reference a
 * prior revision. One editor op — Ctrl+Z reverts.
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

	const rawMaterials = getParagraphText(editor, bounds.startLine, bounds.endLine);
	if (!rawMaterials.trim()) {
		new Notice("The materials paragraph is empty.");
		return;
	}

	// Editing notes arrive from two places, and both count. Inline/trailing
	// %%…%% embedded in the paragraph (extractInlineGuidelines) become positional
	// guidelines — inline ones leave a [§N] marker at their spot; a trailing one
	// is whole-passage. %%…%% on the line(s) directly below (gatherEditContext)
	// are whole-passage too. insertAfter is where the revision callout lands
	// (after the below-paragraph notes, then after any existing revisions so new
	// ones stack in order); hasRevisions tells us whether this is the paragraph's
	// first edit.
	const { text: materials, notes: inlineNotes } = extractInlineGuidelines(rawMaterials);
	if (!materials.trim()) {
		new Notice("The materials paragraph has only notes — add some text to edit.");
		return;
	}
	const { guidelines: belowGuidelines, insertAfter, hasRevisions } = gatherEditContext(editor, bounds.endLine);
	const belowNotes: EditNote[] = belowGuidelines
		? belowGuidelines
				.split("\n")
				.map((g) => g.trim())
				.filter(Boolean)
				.map((note) => ({ note }))
		: [];
	const notes: EditNote[] = [...inlineNotes, ...belowNotes];

	const revisionNumber = nextRevisionNumber(editor);
	// Send the surrounding before/after paragraphs only on the first edit of this
	// paragraph — later revisions inherit them via the chain (revision #1's turn
	// carried the <context>), so resending would only add tokens.
	const context = hasRevisions ? undefined : getSurroundingParagraphs(editor, bounds);

	const userPrompt = buildEditInput(materials, notes, revisionNumber, context);
	const systemPrompt = getEditSystemPrompt();

	new Notice("Editing...");

	try {
		const result = await askChained({
			app,
			pluginDir,
			notePath,
			noteText: editor.getValue(),
			settings,
			systemPrompt,
			userPrompt,
			// Construction and light revision need neither search nor deep
			// reasoning — pin both off (Ask still follows the user's settings;
			// askChained defaults).
			reasoningEffort: "none",
			webSearchEnabled: false,
		});

		const label = notes.map((n) => n.note).join(" · ") || "Edit";
		const title =
			label.length > 80
				? `#${revisionNumber} ${label.slice(0, 80)}…`
				: `#${revisionNumber} ${label}`;
		appendCalloutAfter(editor, insertAfter, title, result.text, "coo-edit");

		new Notice(`Revision #${revisionNumber} ready.`, 2000);
	} catch (err) {
		const message =
			err instanceof Error ? err.message : "Edit failed.";
		new Notice(message, 5000);
	}
}
