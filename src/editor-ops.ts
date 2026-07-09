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
 * Check if a line is an annotation line (%%...%%).
 */
function isAnnotationLine(line: string): boolean {
	const trimmed = line.trim();
	return trimmed.startsWith("%%") && trimmed.endsWith("%%");
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
 * A paragraph is a contiguous block of non-empty, non-annotation lines.
 */
export function findParagraphBounds(
	editor: Editor,
	lineNum: number,
): ParagraphBounds | null {
	const totalLines = editor.lineCount();
	const currentLine = editor.getLine(lineNum);

	if (isEmptyLine(currentLine) || isAnnotationLine(currentLine)) {
		return null;
	}

	// List items are treated as individual paragraphs so that
	// annotations attach to the specific item, not the entire list.
	if (isListItem(currentLine)) {
		return { startLine: lineNum, endLine: lineNum };
	}

	let startLine = lineNum;
	while (startLine > 0) {
		const prev = editor.getLine(startLine - 1);
		if (isEmptyLine(prev) || isAnnotationLine(prev)) break;
		startLine--;
	}

	let endLine = lineNum;
	while (endLine < totalLines - 1) {
		const next = editor.getLine(endLine + 1);
		if (isEmptyLine(next) || isAnnotationLine(next)) break;
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
 * The inner content of a single %%...%% annotation line (no comma splitting —
 * each annotation line is one note). Empty string if the annotation is empty.
 */
function parseAnnotationContent(line: string): string {
	const trimmed = line.trim();
	const inner = trimmed.slice(2, -2).trim();
	return inner;
}

/**
 * Find all consecutive annotation lines below the paragraph.
 * Notes are a separate block, separated from the paragraph by a blank line,
 * so any blank line(s) between the paragraph and the notes are skipped first.
 * Each annotation line is one note (Ask answer). Returns their line numbers.
 */
export function findAllAnnotationLines(
	editor: Editor,
	paragraphEndLine: number,
): number[] {
	let i = paragraphEndLine + 1;
	while (i < editor.lineCount() && isEmptyLine(editor.getLine(i))) {
		i++;
	}
	const lines: number[] = [];
	while (i < editor.lineCount() && isAnnotationLine(editor.getLine(i))) {
		lines.push(i);
		i++;
	}
	return lines;
}

/**
 * Get all annotation notes below a paragraph (one note per %%...%% line).
 */
export function getAnnotationNotes(
	editor: Editor,
	paragraphEndLine: number,
): string[] {
	const lineNums = findAllAnnotationLines(editor, paragraphEndLine);
	const notes: string[] = [];
	for (const lineNum of lineNums) {
		const content = parseAnnotationContent(editor.getLine(lineNum));
		if (content) notes.push(content);
	}
	return notes;
}

/**
 * Append a single note as a new %%...%% line below the paragraph, after any
 * existing annotation lines. The first note is separated from the paragraph by
 * a blank line so it renders as its own block (not inline with the paragraph);
 * subsequent notes stack directly under the previous one. Newlines in the note
 * are collapsed so the annotation stays on one line.
 */
export function appendAnnotation(
	editor: Editor,
	paragraphEndLine: number,
	note: string,
): void {
	const safe = note.replace(/\n+/g, " ").trim();
	if (!safe) return;

	const existing = findAllAnnotationLines(editor, paragraphEndLine);
	const insertAfterLine = existing[existing.length - 1] ?? paragraphEndLine;
	const lineText = editor.getLine(insertAfterLine);
	const insertPos = { line: insertAfterLine, ch: lineText.length };
	// First note: blank line separator. Subsequent notes: stack directly.
	const sep = existing.length > 0 ? "\n" : "\n\n";
	editor.replaceRange(`${sep}%%${safe}%%`, insertPos);
}

/**
 * Replace the paragraph (and any annotation lines below it) with new text.
 * Used by Rewrite: the rewritten paragraph replaces the original + notes.
 */
export function replaceParagraphAndRemoveAnnotations(
	editor: Editor,
	startLine: number,
	endLine: number,
	annotationLines: number[],
	newText: string,
): void {
	const lastLine = annotationLines[annotationLines.length - 1] ?? endLine;
	const lastLineText = editor.getLine(lastLine);

	const from = { line: startLine, ch: 0 };
	const to = { line: lastLine, ch: lastLineText.length };

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
