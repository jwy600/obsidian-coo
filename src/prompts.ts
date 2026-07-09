import type { ResponseLanguage, TranslateLanguage } from "./types";
import { LANGUAGE_MAP } from "./types";

/**
 * Block-action prompt (ported from coo-app-next).
 * Covers translate, rewrite, and ask. The <language> tag is filled at runtime.
 * The <scope> block is essential for response chaining: it tells the model to
 * treat prior chained turns as background context and not echo them.
 */
const BLOCK_ACTION_PROMPT = `You transform or answer questions about a given text block.

<language></language>

<scope>
- The text inside <passage>...</passage> is the focus of the action
- Treat any prior conversation turns (carried via response chaining) as background context — use them to interpret the passage, but do not quote or echo them in your output
</scope>

<transformations>
For translate and rewrite:
- Apply the action ONLY to the passage's text
- Output plain text only — no markdown, no bullet points, no numbered lists, no headers
- No preamble ("Here's the translation:", "Sure!", etc.) — start directly with the result
- Keep responses focused and concise — typically similar length to the input
- Match the tone of the original text
</transformations>

<ask>
For ask, the passage is the context that motivated the question — not the thing to answer about. Answer the user's actual question.
- If the question is about understanding or checking the passage itself (e.g. "what does this term mean?", "is this claim accurate?"), answer from the passage in a sentence or two
- If the question reaches beyond the passage (the broader topic, the state of a field, alternatives, how something works in general), answer it directly and use web search when it is available and the question needs current, factual, or external information
- Keep the answer short — a brief paragraph for simple questions, a few tight points for broader ones. Lead with the direct answer; add only what's needed to support it. No exhaustive writeups, no filler, no restating
- No preamble — start directly with the answer
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
 * Revises a passage by applying the user's notes as edits.
 * The <language> tag is filled at runtime.
 */
const REWRITE_PROMPT = `You revise a passage of Markdown according to the user's notes.

<language></language>

<rules>
- Preserve the original Markdown formatting (paragraphs, headings, lists, code fences, math) unless a note explicitly asks you to change it
- Apply each note as an edit to the relevant span — do not echo the notes back, do not add new ones
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
 * Build the Ask input: the paragraph as <passage>, the user's highlighted
 * selection (if any) as the focal phrase, and the question.
 * Chained context (prior Q&A) arrives server-side via previous_response_id,
 * so it is NOT re-sent here.
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
	return `${passageBlock}${highlight}\n\nQuestion: ${trimmedQuestion}`;
}

/**
 * Build the Rewrite input: the passage and the accumulated notes.
 * Rewrite is one-shot (does not chain).
 */
export function buildRewriteInput(passage: string, notes: string[]): string {
	const trimmedPassage = passage.trim();
	const passageBlock = `<passage>\n${trimmedPassage}\n</passage>`;
	if (notes.length === 0) {
		return passageBlock;
	}
	const noteBlock = notes.map((n) => `- ${n}`).join("\n");
	return `${passageBlock}\n\n<notes>\n${noteBlock}\n</notes>`;
}

/** Build the Translate input: the selected text as <passage>. */
export function buildTranslateInput(passage: string): string {
	return `<passage>\n${passage.trim()}\n</passage>`;
}
