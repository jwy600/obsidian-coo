import type {
	BlockAction,
	ResponseLanguage,
	TranslateLanguage,
} from "./types";
import { LANGUAGE_MAP } from "./types";

/**
 * Single developer prompt fallback with `<language></language>` placeholder.
 * For English, the tag is removed entirely.
 * For other languages, it is filled with a language directive.
 */
export const DEVELOPER_PROMPT_FALLBACK = `You are a knowledgeable assistant that provides deep, thorough explanations.

<language></language>
<response_approach>
- Start with a clear, direct answer or definition
- Then explain the "why" and "how" behind it
- Include relevant examples, edge cases, and practical implications
- Connect to broader context when it aids understanding
- Cover the topic completely — assume the user wants to truly understand, not just get a quick answer
</response_approach>

<structure>
- Lead with the core concept (1-2 sentences)
- Expand with supporting details and mechanisms
- Add examples or analogies where helpful
- Note important exceptions or nuances
- Use headers (##) for distinct subtopics
</structure>

<formatting>
- Use Markdown **only where semantically correct** (e.g., \`inline code\`, \`\`\`code fences\`\`\`, lists, tables)
- Use backticks to format file, directory, function, and class names
- Use $ for inline math and $$ for block math (Obsidian MathJax format). NEVER use \\( \\) or \\[ \\] delimiters.
- NEVER use numbered lists (1, 2, 3). If sequence matters, use letters (a, b, c) instead
</formatting>

<avoid>
- Repetition (don't restate the same point differently)
- Filler phrases and unnecessary hedging
- Artificial padding for simple topics
</avoid>`;

/**
 * Single block-action prompt (language-neutral).
 * Language directives are prepended at runtime.
 */
const BLOCK_ACTION_PROMPT = `You transform or answer questions about a given text block.

<rules>
- Output plain text only — no markdown, no bullet points, no numbered lists, no headers
- No preamble ("Here's the translation:", "Sure!", etc.) — start directly with the result
- Keep responses focused and concise — typically 1-3 sentences for questions, similar length to input for transformations
- Match the tone of the original text
</rules>`;

/**
 * Replace `<language></language>` tag in a template string.
 * - English: removes the entire `<language>...</language>` line (including any blank line it leaves)
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
 * Prepend a language directive to a hardcoded prompt.
 * - English: returns prompt unchanged
 * - Others: prepends "Always respond in {full name}.\n\n"
 */
export function prependLanguageDirective(
	prompt: string,
	lang: ResponseLanguage,
): string {
	if (lang === "en") {
		return prompt;
	}
	const fullName = LANGUAGE_MAP[lang];
	return `Always respond in ${fullName}.\n\n${prompt}`;
}

/**
 * Get the block-action system prompt with language directive applied.
 * Used for all block actions: eli5, example, expand, ask, rewrite, AND inspire.
 */
export function getBlockActionSystemPrompt(lang: ResponseLanguage): string {
	return prependLanguageDirective(BLOCK_ACTION_PROMPT, lang);
}

/**
 * Get the block-action system prompt with a specific translation language directive.
 * Used only for the translate action.
 */
export function getTranslateSystemPrompt(
	translateLang: TranslateLanguage,
): string {
	return `Always respond in ${translateLang}.\n\n${BLOCK_ACTION_PROMPT}`;
}

export function buildActionPrompt(
	action: BlockAction,
	blockText: string,
	prompt?: string,
	translateLanguage?: TranslateLanguage,
	context?: string,
): string {
	const trimmedBlock = blockText.trim();

	switch (action) {
		case "translate": {
			const language = translateLanguage ?? "Chinese";
			return `Translate into ${language}:\n\n${trimmedBlock}`;
		}
		case "example": {
			let result = `Give one concrete example of this:\n\n${trimmedBlock}`;
			if (context) result += `\n\nDocument context:\n${context}`;
			return result;
		}
		case "expand": {
			let result = `Expand on this with more detail:\n\n${trimmedBlock}`;
			if (context) result += `\n\nDocument context:\n${context}`;
			return result;
		}
		case "eli5": {
			let result = `Explain this like I'm five:\n\n${trimmedBlock}`;
			if (context) result += `\n\nDocument context:\n${context}`;
			return result;
		}
		case "rewrite": {
			const highlightPrompt = prompt?.trim() ?? "";
			return `Rewrite this text, incorporating the highlighted phrases naturally. If a phrase is in a different language, INSERT each highlighted phrase in parentheses immediately after the most relevant word/phrase in the text. Prioritize natural integration, but if no coherent or logical placement exists for a phrase, append it at the end of the text rather than forcing an awkward insertion. Phrases to incorporate: ${highlightPrompt}. Text: ${trimmedBlock}`;
		}
		case "ask": {
			const trimmedPrompt = prompt?.trim() ?? "";
			let result = `Text: "${trimmedBlock}"`;
			if (context) result += `\n\nDocument context:\n${context}`;
			result += `\n\nQuestion: ${trimmedPrompt}`;
			return result;
		}
		case "inspire": {
			const instruction = prompt?.trim() ?? "";
			let result = `Text: "${trimmedBlock}"`;
			if (context) {
				result += `\n\nDocument context:\n${context}`;
			}
			result += `\n\nInstruction: ${instruction}`;
			result +=
				"\n\nProvide 2-5 related insights as bullet points. Each bullet starts with \"- \" and is 1-2 sentences. Start directly with the first bullet.";
			return result;
		}
		default:
			return "";
	}
}
