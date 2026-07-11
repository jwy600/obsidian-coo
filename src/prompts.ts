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
- Preserve the original Markdown formatting (paragraphs, headings, lists, code fences, math) unless an answer explicitly calls for changing it
- Do not echo the questions and answers back, and do not add new discussion — only revise the passage
- Output the revised passage only — no preamble, no explanation, no surrounding fences
- Match the original tone, register, and language
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

/** Build the Translate input: the selected text as <passage>. */
export function buildTranslateInput(passage: string): string {
	return `<passage>\n${passage.trim()}\n</passage>`;
}
