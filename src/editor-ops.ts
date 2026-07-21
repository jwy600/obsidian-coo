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

export interface CalloutBlock {
	startLine: number;
	endLine: number;
}

/** A callout's question (its title) and answer (its body). */
export interface CalloutQaPair {
	question: string;
	answer: string;
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
 * Check if a line starts ANY callout (e.g. "> [!note]", "> [!warning]"), not
 * just a coo callout. Used to tell when a selection sits inside a different
 * callout type — drill-down does not apply there.
 */
function isAnyCalloutStart(line: string): boolean {
	return /^>\s*\[!/i.test(line);
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
 * Find the coo callout whose body contains a position, or null if the position
 * is not inside a coo callout body. Used by drill-down: selecting text inside an
 * answer callout targets that callout. A position on the callout title line, or
 * inside a non-coo callout (e.g. "[!note]"), is not a body drill.
 */
export function findCalloutContaining(
	editor: Editor,
	pos: EditorPosition,
): CalloutBlock | null {
	const line = pos.line;
	const cur = editor.getLine(line);
	// Title line, or not even a blockquote line → not inside a body.
	if (isCalloutStart(cur) || !cur.startsWith(">")) return null;

	// Walk up: every line up to a coo callout start must be a body line.
	let startLine = -1;
	for (let i = line; i >= 0; i--) {
		const l = editor.getLine(i);
		if (isCalloutStart(l)) {
			startLine = i;
			break;
		}
		if (isAnyCalloutStart(l)) return null; // a different callout type
		if (!l.startsWith(">")) return null; // left the blockquote region
	}
	if (startLine === -1) return null;

	// Walk down from the start to the block's last consecutive ">" line.
	let endLine = startLine;
	while (
		endLine + 1 < editor.lineCount() &&
		editor.getLine(endLine + 1).startsWith(">")
	) {
		endLine++;
	}
	return { startLine, endLine };
}

/**
 * Get the answer body of a single coo callout block (the title/question is not
 * included). Used by drill-down to read the answer a selection sits inside.
 */
export function getCalloutBody(editor: Editor, block: CalloutBlock): string {
	const lines: string[] = [];
	for (let i = block.startLine + 1; i <= block.endLine; i++) {
		lines.push(stripCalloutBody(editor.getLine(i)));
	}
	return lines.join("\n").trim();
}

/**
 * Extract the title (the question) from a coo callout's start line, stripping
 * the "> [!coo]- " prefix. Returns "" when there is no title text.
 */
function getCalloutTitle(editor: Editor, block: CalloutBlock): string {
	const line = editor.getLine(block.startLine);
	const match = line.match(/^>\s*\[!coo\][-+]?\s*(.*)$/i);
	return match ? (match[1] ?? "").trim() : "";
}

/**
 * Get each callout's question and answer below a paragraph, as Q&A pairs. Used
 * by Rewrite so the model sees what each answer is about. Callouts with no body
 * are skipped.
 */
export function getCalloutQaPairs(
	editor: Editor,
	paragraphEndLine: number,
): CalloutQaPair[] {
	const blocks = findCalloutBlocks(editor, paragraphEndLine);
	const pairs: CalloutQaPair[] = [];
	for (const block of blocks) {
		const answer = getCalloutBody(editor, block);
		if (answer) {
			pairs.push({ question: getCalloutTitle(editor, block), answer });
		}
	}
	return pairs;
}

/**
 * Append a note as a new collapsed coo callout below the paragraph, after any
 * existing note callouts. The question becomes the callout title; the answer
 * (with its markdown intact) becomes the body. A blank line separates the
 * callout block from the paragraph / previous callout so it renders as its own
 * block.
 */
/**
 * Normalize the math delimiters an LLM tends to emit into the ones Obsidian
 * actually renders. Obsidian's MathJax only honors `$…$` (inline) and `$$…$$`
 * (display); models often return TeX's `\(...\)` and `\[...\]` instead, which
 * show up as literal text. We also see `\[…\]` used to *escape brackets in
 * prose* (e.g. `\[W\]hat`, `\[TOPIC …\]`), so the display conversion is guarded
 * — only spans whose body looks like math convert.
 *
 * Pure string transform; called for every callout body in formatCalloutBlock.
 */
export function normalizeMathDelimiters(text: string): string {
	// Inline math. Escaped parens in prose are vanishingly rare, so every
	// \( … \) pair is treated as inline math.
	let out = text.replace(/\\\(([\s\S]+?)\\\)/g, (_m, body: string) => `$${body}$`);
	// Display math. Convert only when the body contains a LaTeX command, an
	// exponent/index, braces, or an equals sign — signals it is math, not
	// escaped prose brackets.
	out = out.replace(/\\\[([\s\S]+?)\\\]/g, (match, body: string) => {
		if (/\\[a-zA-Z]+|[\^_{}=]/.test(body)) {
			return `$$${body}$$`;
		}
		return match;
	});
	return out;
}

/**
 * Format a collapsed coo callout block string from a title (the question) and
 * content (the answer, markdown intact). Returns "" when the content is empty.
 * Math delimiters are normalized first so formulas render in the note. Shared
 * by appendCallout and appendCalloutAfter.
 */
function formatCalloutBlock(title: string, content: string): string {
	const safeTitle = title.replace(/\n+/g, " ").trim() || "note";
	const normalized = normalizeMathDelimiters(content.trim());
	if (!normalized) return "";

	const body = normalized
		.split("\n")
		.map((l) => (l.trim() === "" ? ">" : `> ${l}`));
	return [`> [!coo]- ${safeTitle}`, ...body].join("\n");
}

/**
 * A trailing newline to emit after an inserted callout, when needed. The callout
 * is inserted with a blank line *before* it but relies on what follows for
 * separation *after*. When the next line is non-blank (e.g. a tight list item),
 * the callout body would run straight into it — and since an ordered list item
 * starting with a number other than 1 can't interrupt a paragraph, that next
 * item gets absorbed into the callout body and disappears in read mode. A blank
 * line after the callout keeps it its own block. No trailing newline at EOF or
 * when the next line is already blank.
 */
function trailingSeparator(editor: Editor, afterLine: number): string {
	if (afterLine + 1 >= editor.lineCount()) return "";
	return editor.getLine(afterLine + 1).trim() === "" ? "" : "\n";
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
	const blockText = formatCalloutBlock(title, content);
	if (!blockText) return;

	const existing = findCalloutBlocks(editor, paragraphEndLine);
	const insertAfterLine =
		existing.length > 0
			? (existing[existing.length - 1]?.endLine ?? paragraphEndLine)
			: paragraphEndLine;
	const lineText = editor.getLine(insertAfterLine);
	const insertPos = { line: insertAfterLine, ch: lineText.length };
	// Follow with a blank line when the next line isn't already blank, so a tight
	// list item (e.g. "3. ...") isn't absorbed into the callout body. See
	// trailingSeparator.
	editor.replaceRange(`\n\n${blockText}${trailingSeparator(editor, insertAfterLine)}`, insertPos);
}

/**
 * Append a note as a new collapsed coo callout immediately AFTER a specific
 * line. Used by drill-down: the new answer stacks right under the answer it is
 * about (mid-stack or last), with a blank line separating it from the line
 * above.
 */
export function appendCalloutAfter(
	editor: Editor,
	afterLine: number,
	title: string,
	content: string,
): void {
	const blockText = formatCalloutBlock(title, content);
	if (!blockText) return;

	const lineText = editor.getLine(afterLine);
	const insertPos = { line: afterLine, ch: lineText.length };
	editor.replaceRange(`\n\n${blockText}${trailingSeparator(editor, afterLine)}`, insertPos);
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

/**
 * Wrap an editor range with Obsidian ==highlight== markers, so the selected word
 * stays visually highlighted in the note while the discuss modal is open. The
 * range must be within a single line (a word or short phrase) — ==...== is an
 * inline highlight that doesn't render across line breaks. One editor op.
 * Paired with clearSelectionHighlight, which removes the markers on modal close.
 */
export function highlightSelection(
	editor: Editor,
	from: EditorPosition,
	to: EditorPosition,
	text: string,
): void {
	editor.replaceRange(`==${text}==`, from, to);
}
