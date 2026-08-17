export type ModelType = "gpt-5.6-sol" | "gpt-5.6-terra" | "gpt-5.6-luna";

export type ReasoningEffort = "none" | "low" | "medium" | "high";

export type ResponseLanguage = "en" | "es" | "fr" | "zh" | "ja";

export type TranslateLanguage =
	| "English"
	| "Spanish"
	| "French"
	| "Chinese"
	| "Japanese";

export interface CooSettings {
	apiKey: string;
	model: ModelType;
	reasoningEffort: ReasoningEffort;
	webSearchEnabled: boolean;
	responseLanguage: ResponseLanguage;
	translateLanguage: TranslateLanguage;
}

/** Maps ResponseLanguage codes to full language names for prompt injection. */
export const LANGUAGE_MAP: Record<ResponseLanguage, string> = {
	en: "English",
	es: "Spanish",
	fr: "French",
	zh: "Simplified Chinese",
	ja: "Japanese",
};

/**
 * The generic default question, used when there is no focal selection
 * (whole-document mode). With a selection, `getDefaultAskQuestion` interpolates
 * it into `DEFAULT_ASK_QUESTION_TEMPLATE` instead.
 */
export const DEFAULT_ASK_QUESTION: Record<ResponseLanguage, string> = {
	en: "What does this mean?",
	es: "¿Qué significa esto?",
	fr: "Qu'est-ce que ça veut dire ?",
	zh: "这是什么意思？",
	ja: "どういう意味？",
};

/**
 * Selection-aware form of the default question: the focal selection in quotes
 * replaces the generic "this". The question doubles as the callout title, so a
 * collapsed `What does "entropy" mean?` records what was asked about where a
 * bare "What does this mean?" wouldn't.
 */
const DEFAULT_ASK_QUESTION_TEMPLATE: Record<ResponseLanguage, string> = {
	en: 'What does "{selection}" mean?',
	es: '¿Qué significa "{selection}"?',
	fr: 'Que signifie « {selection} » ?',
	zh: '“{selection}”是什么意思？',
	ja: '「{selection}」はどういう意味？',
};

/** Longest selection embedded in the default question before truncating. */
const MAX_SELECTION_IN_QUESTION = 60;

/**
 * The default ask question, selection-aware. Shown as the greyed placeholder
 * in the composer and submitted when the user presses Ask/Enter without
 * typing — the same string becomes the callout title. Embeds the selection in
 * quotes when there is one; otherwise falls back to the generic form. Long or
 * multi-line selections are collapsed and truncated (the full selection still
 * reaches the model via the highlight in the ask input).
 */
export function getDefaultAskQuestion(
	lang: ResponseLanguage,
	selection: string,
): string {
	const trimmed = selection.trim();
	if (!trimmed) return DEFAULT_ASK_QUESTION[lang];
	const collapsed = trimmed.replace(/\s+/g, " ");
	const embedded =
		collapsed.length > MAX_SELECTION_IN_QUESTION
			? collapsed.slice(0, MAX_SELECTION_IN_QUESTION) + "…"
			: collapsed;
	return DEFAULT_ASK_QUESTION_TEMPLATE[lang].replace(
		/\{selection\}/g,
		embedded,
	);
}

/** Maps TranslateLanguage to its corresponding ResponseLanguage code. */
export const TRANSLATE_TO_RESPONSE_MAP: Record<
	TranslateLanguage,
	ResponseLanguage
> = {
	English: "en",
	Spanish: "es",
	French: "fr",
	Chinese: "zh",
	Japanese: "ja",
};

/** Maps ResponseLanguage to its corresponding TranslateLanguage name. */
export const RESPONSE_TO_TRANSLATE_MAP: Record<
	ResponseLanguage,
	TranslateLanguage
> = {
	en: "English",
	es: "Spanish",
	fr: "French",
	zh: "Chinese",
	ja: "Japanese",
};
