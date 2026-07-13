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
 * The default question shown as a greyed placeholder in the composer ask
 * input, localized per response language. Submitted as the ask prompt when the
 * user presses Ask without typing anything — so the input is "pre-populated"
 * with a sensible question (placeholder + submit-fallback, no real value).
 */
export const DEFAULT_ASK_QUESTION: Record<ResponseLanguage, string> = {
	en: "What does this mean?",
	es: "¿Qué significa esto?",
	fr: "Qu'est-ce que ça veut dire ?",
	zh: "这是什么意思？",
	ja: "どういう意味？",
};

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
