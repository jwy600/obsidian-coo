import type { ResponseLanguage, TranslateLanguage } from "./types";
import { LANGUAGE_MAP } from "./types";
import type { CalloutQaPair } from "./editor-ops";

/**
 * System prompt for the Ask action (ported from coo-app-next's block-action
 * prompt; the plugin uses it only for ask — translate and rewrite have their
 * own prompts). The <language> tag is filled at runtime. The <scope> block is
 * essential for response chaining: it tells the model to treat prior chained
 * turns as background context and not echo them.
 */
const BLOCK_ACTION_PROMPT = `You answer a question about a given text block.

<language></language>

<scope>
- The text inside <passage>...</passage> is the focus of the action
- Treat any prior conversation turns (carried via response chaining) as background context — use them to interpret the passage, but do not quote or echo them in your output
</scope>

<ask>
For ask, the passage is the context that motivated the question — usually not the thing to answer about. Answer the user's actual question.
- If the question is about a term or concept (e.g. "what does X mean?", "what is X?"), first judge how central it is to the whole document (the full document is in your context — the reader asks about many things out of curiosity, so most concepts are NOT load-bearing): if it is skippable — a common word used in an ordinary sense, a named tool/person/library mentioned only as an example, a peripheral acronym, or a passing detail — begin the answer with **Minor** — and keep that answer to a sentence or two; otherwise use no label. Then explain the concept itself in its broader sense (what it actually refers to in its field, not just how this paragraph uses it) and ground it: say what the term specifically implies here
- If the question is about checking the passage itself (e.g. "is this claim accurate?", "does this follow?"), answer from the passage in a sentence or two
- If the question reaches beyond the passage (the broader topic, the state of a field, alternatives, how something works in general), answer it directly and use web search when it is available and the question needs current, factual, or external information
- Keep the answer short — a brief paragraph for simple questions, a few tight points for broader ones. Lead with the direct answer; add only what's needed to support it. No exhaustive writeups, no filler, no restating
- No preamble — start directly with the answer. The only exception is the **Minor** tag for skippable concepts; nothing else goes before the substance
- Use markdown structure (a short list, bold) only when it genuinely helps; skip it for short answers
- For math, write $…$ for inline and $$…$$ for display math — never \\(...\\) or \\[...\\] (they do not render here), and do not backslash-escape square brackets in prose
- Match the user's language
</ask>`;

/**
 * Translate prompt (ported from coo-app-next).
 * Translate is standalone (no chaining), so scope is simpler.
 * The <translationlanguage> tag is filled at runtime.
 */
const BLOCK_ACTION_TRANSLATE_PROMPT = `You translate a given text block.

<translationlanguage></translationlanguage>

<scope>
- Translate ONLY the text inside <passage>...</passage>
</scope>

<rules>
- Output plain text only — no markdown, no bullet points, no numbered lists, no headers
- No preamble ("Here's the translation:", "Sure!", etc.) — start directly with the result
- Preserve the tone and register of the original text
</rules>`;

/**
 * Rewrite prompt (ported from coo-app-next).
 * Revises a passage using the Q&A discussion (callout notes) about it.
 * The <language> tag is filled at runtime.
 */
const REWRITE_PROMPT = `You revise a passage of Markdown using a question-and-answer discussion about it.

<language></language>

<rules>
- Each entry in <notes> is a question the reader asked about the passage, followed by its answer. Integrate each answer's substance where it is relevant — clarify a term, support or correct a claim, or fold in the elaboration it provides
- Preserve the original Markdown formatting (paragraphs, headings, lists, code fences, math) unless an answer explicitly calls for changing it. Keep math in $…$ / $$…$$ form — never \\(...\\) or \\[...\\]
- Do not echo the questions and answers back, and do not add new discussion — only revise the passage
- Output the revised passage only — no preamble, no explanation, no surrounding fences
- Match the original tone, register, and language
</rules>`;

/**
 * Edit prompt. Constructs a coherent passage from the author's materials (rough
 * fragments of a thought), following any guidelines. Faithful construction:
 * connect, structure, and elaborate to complete the idea — but never invent
 * substance the fragments don't support. No <language> tag: Edit constructs in
 * the materials' own language (this is not translation). See CONTEXT.md (Edit,
 * Materials, Guidelines) and docs/adr/0001-edit-constructs-from-fragments.md.
 */
const EDIT_PROMPT = `You construct a coherent passage of Markdown from the author's materials, faithfully expressing the thought they couldn't yet articulate, following any guidelines they give.

<scope>
- The text inside <materials>...</materials> is the author's fragments — rough pieces of a single thought, not finished prose
- The materials are always the author's original fragments — construct from those, not from a prior revision, unless the guidelines explicitly build on a numbered revision
- Prior conversation turns (via response chaining) hold the passages you constructed earlier, each labeled with its number (e.g. "revision #2"). If the guidelines refer to one by number (e.g. "reuse the opening from revision #2"), resolve it from those turns — do not re-derive it from the fragments
- The <guidelines>...</guidelines> block, when present, holds the author's editing direction (tone, length, focus, or references to prior revisions). Follow it
- The <context> block, when present, holds the prose paragraphs immediately before and after the materials. Use them to match flow, register, and voice so the passage continues from the preceding paragraph and leads into the following one — but construct only from the <materials>; never repeat or incorporate the surrounding paragraphs' substance
</scope>

<rules>
- Turn the materials into a coherent passage that fully expresses the thought: connect the pieces, structure them, and elaborate as much as is needed to complete the idea — but no more. Do not pad, repeat, or elaborate for its own sake
- Stay faithful to the thought. You may add connective tissue and structure; never invent claims, examples, facts, or emphasis the materials do not support
- Preserve all of the materials' substance: reorganize and connect the points as flowing prose, but do not summarize away, omit, or merge any distinct detail — every claim, step, and fact should survive into the passage. (If the guidelines explicitly ask to summarize or shorten, follow them instead.)
- Match the voice and register of the surrounding note, so the passage reads like the author wrote it — unless the guidelines ask for a different tone
- With no guidelines, construct the thought fully and naturally. With guidelines, follow them
- Construct in the language the materials are written in (this is not translation)
- Preserve any Markdown formatting the materials imply (lists, code, math) where it still fits; keep math in $…$ / $$…$$ — never \\(...\\) or \\[...\\]
- Output the constructed passage only — no preamble, no explanation, no surrounding code fences
</rules>`;

/**
 * Registration prompt (ported from coo-app-next).
 * Primes the model with the whole note so later asks can chain from it.
 * No language tag — the acknowledgment language is not important (text is discarded).
 */
const REGISTER_DOC_PROMPT = `The user has shared a document. Store it in context — you'll be asked about it next.

<rules>
- Acknowledge in one short sentence that you've received it
- Do not summarize or analyze the document yet — wait for the user's question
- No preamble beyond that one sentence
</rules>`;

/**
 * Replace `<language></language>` tag in a template string.
 * - English: removes the tag (and any blank line it leaves behind)
 * - Others: fills the tag with "Always respond in {full language name}."
 */
export function replaceLanguageTag(
	template: string,
	lang: ResponseLanguage,
): string {
	if (lang === "en") {
		return template.replace(/\n?<language><\/language>\n?/, "\n");
	}
	const fullName = LANGUAGE_MAP[lang];
	return template.replace(
		"<language></language>",
		`<language>Always respond in ${fullName}.</language>`,
	);
}

/**
 * Replace `<translationlanguage></translationlanguage>` tag in a template string.
 * - English: removes the tag
 * - Others: fills the tag with "Translate into {language}."
 */
export function replaceTranslationLanguageTag(
	template: string,
	lang: TranslateLanguage,
): string {
	if (lang === "English") {
		return template.replace(
			/\n?<translationlanguage><\/translationlanguage>\n?/,
			"\n",
		);
	}
	return template.replace(
		"<translationlanguage></translationlanguage>",
		`<translationlanguage>Translate into ${lang}.</translationlanguage>`,
	);
}

/** Block-action system prompt (for ask) with language applied. */
export function getBlockActionSystemPrompt(lang: ResponseLanguage): string {
	return replaceLanguageTag(BLOCK_ACTION_PROMPT, lang);
}

/** Translate system prompt with the translation target language applied. */
export function getTranslateSystemPrompt(
	translateLang: TranslateLanguage,
): string {
	return replaceTranslationLanguageTag(BLOCK_ACTION_TRANSLATE_PROMPT, translateLang);
}

/** Rewrite system prompt with language applied. */
export function getRewriteSystemPrompt(lang: ResponseLanguage): string {
	return replaceLanguageTag(REWRITE_PROMPT, lang);
}

/** Edit system prompt. No language tag — Edit constructs in the materials' own language. */
export function getEditSystemPrompt(): string {
	return EDIT_PROMPT;
}

/** Registration prompt (no language tag). */
export function getRegisterDocumentPrompt(): string {
	return REGISTER_DOC_PROMPT;
}

/**
 * Build the Ask input: question framing first, then <passage>, then the user's
 * highlighted selection (if any) as the focal phrase. The passage is a paragraph
 * normally, or an answer body when drilling down into a note callout. Chained
 * context (prior Q&A) arrives server-side via previous_response_id, so it is
 * NOT re-sent here.
 */
export function buildAskInput(
	passage: string,
	selection: string | undefined,
	question: string,
): string {
	const trimmedPassage = passage.trim();
	const trimmedQuestion = question.trim();
	const passageBlock = `<passage>\n${trimmedPassage}\n</passage>`;
	const highlight = selection?.trim()
		? `\n\nThe user highlighted this part: "${selection.trim()}"`
		: "";
	// Matches the reference app (coo-app-next): preamble + question first, the
	// passage last. The highlight is the plugin's addition; it always reflects
	// the user's current selection (including a drill-down selection inside an
	// answer), so it is never stale and is appended after the passage.
	return `Answer this question about the passage.\n\nQuestion: ${trimmedQuestion}\n\n${passageBlock}${highlight}`;
}

/**
 * Detect and strip a leading "Minor" tag from an Ask answer. The ask prompt has
 * the model begin skippable-concept answers with **Minor** — (or "Minor —" /
 * "Minor:"); pull that flag off so it can move to the callout title (visible
 * when collapsed) and the body stays clean.
 */
export function parseMinorTag(text: string): { isMinor: boolean; body: string } {
	const match = text.match(
		/^\s*(?:\*\*\s*minor\s*\*\*|minor)\s*[—–\-:]\s*([\s\S]*)$/i,
	);
	if (match) {
		return { isMinor: true, body: (match[1] ?? "").trim() };
	}
	return { isMinor: false, body: text };
}

/**
 * Build the Rewrite input: the passage and the Q&A notes (each callout's
 * question + answer), so the model knows what each answer addresses. Rewrite is
 * one-shot (does not chain).
 */
export function buildRewriteInput(
	passage: string,
	notes: CalloutQaPair[],
): string {
	const trimmedPassage = passage.trim();
	const passageBlock = `<passage>\n${trimmedPassage}\n</passage>`;
	if (notes.length === 0) {
		return passageBlock;
	}
	const noteBlock = notes
		.map((n) => `Q: ${n.question}\nA: ${n.answer}`)
		.join("\n\n");
	return `${passageBlock}\n\n<notes>\n${noteBlock}\n</notes>`;
}

/**
 * Build the Edit input: the materials (fragments) as <materials>, the guidelines
 * (when present) as <guidelines>, and the revision number so the chained turn is
 * labeled — later guidelines can reference "revision #N". The materials are
 * always the author's original fragments; prior revisions arrive via chaining.
 */
export function buildEditInput(
	materials: string,
	guidelines: string,
	revisionNumber: number,
	context?: { before?: string; after?: string },
): string {
	const materialsBlock = `<materials>\n${materials.trim()}\n</materials>`;
	const guidelinesBlock = guidelines.trim()
		? `\n\n<guidelines>\n${guidelines.trim()}\n</guidelines>`
		: "";
	const before = context?.before?.trim() ?? "";
	const after = context?.after?.trim() ?? "";
	const contextBlock =
		before || after
			? `\n\n<context>\nPreceding paragraph:\n${before || "(none)"}\n\nFollowing paragraph:\n${after || "(none)"}\n</context>`
			: "";
	return `Construct a passage from the materials below, following any guidelines. This is revision #${revisionNumber}.\n\n${materialsBlock}${guidelinesBlock}${contextBlock}`;
}

/** Build the Translate input: the selected text as <passage>. */
export function buildTranslateInput(passage: string): string {
	return `<passage>\n${passage.trim()}\n</passage>`;
}
