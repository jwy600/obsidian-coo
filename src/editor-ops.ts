import { Editor } from "obsidian";

export interface SelectionContext {
	selectedText: string;
	from: { line: number; ch: number };
	to: { line: number; ch: number };
}

export interface ParagraphBounds {
	startLine: number;
	endLine: number;
}

export interface MarkdownPrefix {
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
function isListItem(line: string): boolean {
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
 * Like findParagraphBounds, but if the cursor is on an annotation line,
 * falls back to the paragraph directly above it. This lets the rewrite
 * command work when the cursor lands on the %%...%% line after phrase picking.
 */
export function findParagraphBoundsNear(
	editor: Editor,
	lineNum: number,
): ParagraphBounds | null {
	const bounds = findParagraphBounds(editor, lineNum);
	if (bounds) return bounds;

	if (lineNum > 0 && isAnnotationLine(editor.getLine(lineNum))) {
		return findParagraphBounds(editor, lineNum - 1);
	}

	return null;
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
 * Find an annotation line immediately after the paragraph end.
 * Returns the line number if found, null otherwise.
 */
export function findAnnotationLine(
	editor: Editor,
	paragraphEndLine: number,
): number | null {
	const nextLine = paragraphEndLine + 1;
	if (nextLine >= editor.lineCount()) return null;

	const line = editor.getLine(nextLine);
	if (isAnnotationLine(line)) return nextLine;

	return null;
}

/**
 * Parse annotations from a %%...%% line.
 * "%%a, b, c%%" → ["a", "b", "c"]
 */
export function parseAnnotations(line: string): string[] {
	const trimmed = line.trim();
	const inner = trimmed.slice(2, -2).trim();
	if (!inner) return [];
	return inner
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s.length > 0);
}

/**
 * Format annotations into a %%...%% line.
 * ["a", "b"] → "%%a, b%%"
 */
export function formatAnnotations(annotations: string[]): string {
	return `%%${annotations.join(", ")}%%`;
}

/**
 * Append new annotations to a paragraph. Merges with existing %%...%%
 * or creates a new annotation line after the paragraph.
 * Skips duplicates.
 */
export function appendAnnotations(
	editor: Editor,
	paragraphEndLine: number,
	newAnnotations: string[],
): void {
	const existingLineNum = findAnnotationLine(editor, paragraphEndLine);

	if (existingLineNum !== null) {
		// Merge with existing
		const existingLine = editor.getLine(existingLineNum);
		const existing = parseAnnotations(existingLine);
		const merged = [...existing];

		for (const ann of newAnnotations) {
			if (!merged.includes(ann)) {
				merged.push(ann);
			}
		}

		const newLine = formatAnnotations(merged);
		const from = { line: existingLineNum, ch: 0 };
		const to = { line: existingLineNum, ch: existingLine.length };
		editor.replaceRange(newLine, from, to);
	} else {
		// Create new annotation line after paragraph
		const lineText = editor.getLine(paragraphEndLine);
		const insertPos = { line: paragraphEndLine, ch: lineText.length };
		const newLine = "\n" + formatAnnotations(newAnnotations);
		editor.replaceRange(newLine, insertPos);
	}
}

/**
 * Replace paragraph text and remove the annotation line.
 * Used by Flow C (rewrite).
 */
export function replaceParagraphAndRemoveAnnotations(
	editor: Editor,
	startLine: number,
	endLine: number,
	annotationLine: number | null,
	newText: string,
): void {
	// Determine the range to replace: paragraph + annotation line (if present)
	const lastLine = annotationLine !== null ? annotationLine : endLine;
	const lastLineText = editor.getLine(lastLine);

	const from = { line: startLine, ch: 0 };
	const to = { line: lastLine, ch: lastLineText.length };

	editor.replaceRange(newText, from, to);
}
