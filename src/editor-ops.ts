import type { Editor, EditorPosition } from "obsidian";

interface SelectionContext {
	selectedText: string;
	from: EditorPosition;
	to: EditorPosition;
}

interface ParagraphBounds {
	startLine: number;
	endLine: number;
}

interface MarkdownPrefix {
	prefix: string;
	content: string;
}

interface CalloutBlock {
	startLine: number;
	endLine: number;
}

/**
 * Get the current editor selection with position info.
 * Returns null if nothing is selected.
 */
export function getSelectedTextWithContext(
	editor: Editor,
): SelectionContext | null {
	const selectedText = editor.getSelection().trim();
	if (!selectedText) return null;

	return {
		selectedText,
		from: editor.getCursor("from"),
		to: editor.getCursor("to"),
	};
}

/**
 * Check if a line is a legacy %%...%% annotation line (kept as a paragraph
 * boundary for notes created by older plugin versions).
 */
function isAnnotationLine(line: string): boolean {
	const trimmed = line.trim();
	return trimmed.startsWith("%%") && trimmed.endsWith("%%");
}

/**
 * Check if a line starts a coo note callout: "> [!coo]" (optionally with
 * +/- and a title). Case-insensitive on the callout type.
 */
function isCalloutStart(line: string): boolean {
	return /^>\s*\[!coo\]/i.test(line);
}

/**
 * Check if a line is a Markdown heading (# .. ######). Headings are block
 * boundaries — a paragraph never extends across a heading, even with no blank
 * line between them.
 */
function isHeading(line: string): boolean {
	return /^#{1,6}\s/.test(line);
}

/**
 * Check if a line is empty or blank.
 */
function isEmptyLine(line: string): boolean {
	return line.trim().length === 0;
}

/**
 * Check if a line is a list item (unordered or ordered).
 * Matches: "- ", "* ", "+ ", "1. ", "  - " (indented), etc.
 */
export function isListItem(line: string): boolean {
	return /^\s*(?:[-*+]|\d+\.)\s/.test(line);
}

/**
 * Find the paragraph bounds around a given line.
 * A paragraph is a contiguous block of non-empty lines, bounded by empty
 * lines, headings, legacy %%...%% annotations, and coo callout starts.
 */
export function findParagraphBounds(
	editor: Editor,
	lineNum: number,
): ParagraphBounds | null {
	const totalLines = editor.lineCount();
	const currentLine = editor.getLine(lineNum);

	if (
		isEmptyLine(currentLine) ||
		isAnnotationLine(currentLine) ||
		isCalloutStart(currentLine) ||
		isHeading(currentLine)
	) {
		return null;
	}

	// List items are treated as individual paragraphs so that
	// notes attach to the specific item, not the entire list.
	if (isListItem(currentLine)) {
		return { startLine: lineNum, endLine: lineNum };
	}

	const isBoundary = (line: string): boolean =>
		isEmptyLine(line) ||
		isAnnotationLine(line) ||
		isCalloutStart(line) ||
		isHeading(line);

	let startLine = lineNum;
	while (startLine > 0) {
		const prev = editor.getLine(startLine - 1);
		if (isBoundary(prev)) break;
		startLine--;
	}

	let endLine = lineNum;
	while (endLine < totalLines - 1) {
		const next = editor.getLine(endLine + 1);
		if (isBoundary(next)) break;
		endLine++;
	}

	return { startLine, endLine };
}

/**
 * Find the paragraph span covering a selection: from the paragraph containing
 * the selection start to the paragraph containing the selection end. For a
 * single-paragraph selection this is just that paragraph; for a multi-paragraph
 * selection it spans all paragraphs in the range. Notes attach at the end of
 * the span (the last paragraph), not the first.
 */
export function findSelectionSpan(
	editor: Editor,
	from: EditorPosition,
	to: EditorPosition,
): ParagraphBounds | null {
	const start = findParagraphBounds(editor, from.line);
	if (!start) return null;
	if (to.line <= from.line) return start;

	let end = findParagraphBounds(editor, to.line);
	// Selection ends on an empty/annotation line — walk up to the last paragraph.
	if (!end) {
		for (let i = to.line; i >= 0; i--) {
			const b = findParagraphBounds(editor, i);
			if (b) {
				end = b;
				break;
			}
		}
	}
	if (!end) return start;
	return { startLine: start.startLine, endLine: Math.max(start.endLine, end.endLine) };
}

/**
 * Get paragraph text from startLine to endLine (inclusive).
 */
export function getParagraphText(
	editor: Editor,
	startLine: number,
	endLine: number,
): string {
	const lines: string[] = [];
	for (let i = startLine; i <= endLine; i++) {
		lines.push(editor.getLine(i));
	}
	return lines.join("\n");
}

/**
 * Extract a markdown line prefix (list marker, heading, blockquote)
 * from the text. Returns the prefix and the remaining content.
 * Used by rewrite to strip the prefix before sending to AI,
 * then re-add it to the response.
 */
export function extractMarkdownPrefix(text: string): MarkdownPrefix {
	// List items: "- ", "* ", "+ ", "1. ", "  - ", "   1. ", etc.
	// Headings: "# ", "## ", "### ", etc.
	// Blockquotes: "> ", ">  ", etc.
	const match = text.match(/^(\s*(?:[-*+]|\d+\.)\s+|#{1,6}\s+|>\s+)/);
	if (match && match[1]) {
		return { prefix: match[1], content: text.slice(match[1].length) };
	}
	return { prefix: "", content: text };
}

/**
 * Strip the "> " (or ">") prefix from a callout body line.
 */
function stripCalloutBody(line: string): string {
	if (line.startsWith("> ")) return line.slice(2);
	if (line === ">") return "";
	return line;
}

/**
 * Find all coo-note callout blocks below the paragraph. Notes are a separate
 * block, separated from the paragraph by a blank line, so blank line(s) between
 * the paragraph and the first callout (and between callouts) are skipped.
 * Returns each callout's line range.
 */
export function findCalloutBlocks(
	editor: Editor,
	paragraphEndLine: number,
): CalloutBlock[] {
	const blocks: CalloutBlock[] = [];
	let i = paragraphEndLine + 1;
	while (i < editor.lineCount() && isEmptyLine(editor.getLine(i))) {
		i++;
	}
	while (i < editor.lineCount()) {
		if (!isCalloutStart(editor.getLine(i))) break;
		const startLine = i;
		i++;
		// Consume the callout body (lines starting with ">").
		while (i < editor.lineCount() && editor.getLine(i).startsWith(">")) {
			i++;
		}
		blocks.push({ startLine, endLine: i - 1 });
		// Skip blank lines between callouts.
		while (i < editor.lineCount() && isEmptyLine(editor.getLine(i))) {
			i++;
		}
	}
	return blocks;
}

/**
 * Get the answer content of each note callout below the paragraph.
 * The callout title (the question) is not included — only the body (answer).
 */
export function getCalloutNotes(
	editor: Editor,
	paragraphEndLine: number,
): string[] {
	const blocks = findCalloutBlocks(editor, paragraphEndLine);
	const notes: string[] = [];
	for (const block of blocks) {
		const lines: string[] = [];
		for (let i = block.startLine + 1; i <= block.endLine; i++) {
			lines.push(stripCalloutBody(editor.getLine(i)));
		}
		const content = lines.join("\n").trim();
		if (content) notes.push(content);
	}
	return notes;
}

/**
 * Append a note as a new collapsed coo callout below the paragraph, after any
 * existing note callouts. The question becomes the callout title; the answer
 * (with its markdown intact) becomes the body. A blank line separates the
 * callout block from the paragraph / previous callout so it renders as its own
 * block.
 */
export function appendCallout(
	editor: Editor,
	paragraphEndLine: number,
	title: string,
	content: string,
): void {
	const safeTitle = title.replace(/\n+/g, " ").trim() || "note";
	const trimmedContent = content.trim();
	if (!trimmedContent) return;

	const body = trimmedContent
		.split("\n")
		.map((l) => (l.trim() === "" ? ">" : `> ${l}`));
	const blockText = [`> [!coo]- ${safeTitle}`, ...body].join("\n");

	const existing = findCalloutBlocks(editor, paragraphEndLine);
	const insertAfterLine =
		existing.length > 0
			? (existing[existing.length - 1]?.endLine ?? paragraphEndLine)
			: paragraphEndLine;
	const lineText = editor.getLine(insertAfterLine);
	const insertPos = { line: insertAfterLine, ch: lineText.length };
	editor.replaceRange(`\n\n${blockText}`, insertPos);
}

/**
 * Replace the paragraph (and any note callouts below it) with new text.
 * Used by Rewrite: the rewritten paragraph replaces the original + all its
 * note callouts (and the blank separators between them).
 */
export function replaceParagraphAndRemoveCallouts(
	editor: Editor,
	startLine: number,
	endLine: number,
	calloutBlocks: CalloutBlock[],
	newText: string,
): void {
	const lastBlockEnd =
		calloutBlocks.length > 0
			? (calloutBlocks[calloutBlocks.length - 1]?.endLine ?? endLine)
			: endLine;
	const lastLineText = editor.getLine(lastBlockEnd);

	const from = { line: startLine, ch: 0 };
	const to = { line: lastBlockEnd, ch: lastLineText.length };

	editor.replaceRange(newText, from, to);
}

/**
 * Insert a bracketed translation immediately after the given position.
 * The original selection is preserved; the translation lands right after it.
 * One editor op — Ctrl+Z reverts it.
 */
export function insertTranslationAfter(
	editor: Editor,
	pos: EditorPosition,
	translation: string,
): void {
	const safe = translation.replace(/\n+/g, " ").trim();
	editor.replaceRange(` (${safe})`, pos);
}
