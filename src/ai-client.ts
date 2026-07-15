import { requestUrl, type RequestUrlResponse } from "obsidian";
import type { CooSettings, ReasoningEffort } from "./types";
import { getRegisterDocumentPrompt } from "./prompts";

const API_URL = "https://api.openai.com/v1/responses";

export interface ChatCompletionParams {
	settings: CooSettings;
	systemPrompt: string;
	userPrompt: string;
	/** Chain head from a prior stored response. */
	previousResponseId?: string;
	/** Whether OpenAI stores the response (default true — needed for chaining). */
	store?: boolean;
	/** Override reasoning effort; defaults to settings.reasoningEffort. */
	reasoningEffort?: ReasoningEffort;
	/** Override web search; defaults to settings.webSearchEnabled. */
	webSearchEnabled?: boolean;
}

export interface ResponseResult {
	text: string;
	responseId: string;
}

/** API error carrying the HTTP status, so callers can react (e.g. expired id). */
export class CooApiError extends Error {
	status: number;
	constructor(status: number, message: string) {
		super(message);
		this.name = "CooApiError";
		this.status = status;
	}
}

function resolveReasoning(params: ChatCompletionParams): ReasoningEffort {
	return params.reasoningEffort ?? params.settings.reasoningEffort;
}

function resolveWebSearch(params: ChatCompletionParams): boolean {
	return params.webSearchEnabled ?? params.settings.webSearchEnabled;
}

function buildRequestBody(
	params: ChatCompletionParams,
): Record<string, unknown> {
	const { settings, systemPrompt, userPrompt, previousResponseId, store = true } = params;

	const body: Record<string, unknown> = {
		model: settings.model,
		input: userPrompt,
		instructions: systemPrompt,
		store,
	};

	if (previousResponseId) {
		body.previous_response_id = previousResponseId;
	}

	const reasoning = resolveReasoning(params);
	if (reasoning !== "none") {
		body.reasoning = { effort: reasoning };
	}

	if (resolveWebSearch(params)) {
		body.tools = [{ type: "web_search" }];
	}

	return body;
}

function extractApiError(body: string): string {
	try {
		const json = JSON.parse(body) as { error?: { message?: string } };
		if (json.error?.message) return json.error.message;
	} catch {
		// not JSON
	}
	return body.slice(0, 200);
}

function mapHttpError(status: number, body: string): string {
	const detail = extractApiError(body);

	switch (status) {
		case 400:
			return `Bad request: ${detail}`;
		case 401:
			return "Invalid API key. Please check your key in Coo settings.";
		case 429:
			return "Rate limited by OpenAI. Please wait a moment and try again.";
		case 500:
		case 502:
		case 503:
			return "OpenAI service error. Please try again later.";
		default:
			return `OpenAI API error (${status}): ${detail}`;
	}
}

/**
 * Parse a Responses API body into { text, responseId }.
 * `text` is "" if the model returned no output (caller decides whether that's an error).
 */
export function parseResponse(responseText: string): ResponseResult {
	const data = JSON.parse(responseText) as {
		id?: string;
		output_text?: string;
		output?: Array<{
			type?: string;
			content?: Array<{ type?: string; text?: string }>;
		}>;
	};

	const responseId = data.id ?? "";

	// Try top-level output_text first, then extract from output array
	let text = data.output_text?.trim();
	if (!text && data.output) {
		for (const item of data.output) {
			if (item.type === "message" && item.content) {
				for (const block of item.content) {
					if (block.type === "output_text" && block.text) {
						text = block.text.trim();
						break;
					}
				}
			}
			if (text) break;
		}
	}

	return { text: text ?? "", responseId };
}

async function apiFetch(
	apiKey: string,
	body: Record<string, unknown>,
): Promise<RequestUrlResponse> {
	// requestUrl with throw: false mirrors fetch semantics: it returns the
	// response (status + body) for 4xx/5xx instead of throwing, so callApi can
	// read the error body and map HTTP codes to user-friendly notices.
	return requestUrl({
		url: API_URL,
		method: "POST",
		contentType: "application/json",
		headers: {
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify(body),
		throw: false,
	});
}

/** Low-level call: returns { text, responseId } without throwing on empty text. */
async function callApi(params: ChatCompletionParams): Promise<ResponseResult> {
	if (!params.settings.apiKey) {
		throw new Error(
			"API key not configured. Please set it in Coo settings.",
		);
	}

	const body = buildRequestBody(params);
	const response = await apiFetch(params.settings.apiKey, body);
	const responseText = response.text;

	if (response.status >= 400) {
		throw new CooApiError(
			response.status,
			mapHttpError(response.status, responseText),
		);
	}

	return parseResponse(responseText);
}

/**
 * Non-streaming response via Responses API.
 * Throws if the model returns no text.
 */
export async function chatCompletion(
	params: ChatCompletionParams,
): Promise<ResponseResult> {
	const result = await callApi(params);
	if (!result.text) {
		throw new Error("The assistant didn't return any text.");
	}
	return result;
}

/**
 * Register a note as the conversation root.
 * Sends the full note text with the registration prompt (store: true) and
 * returns the response_id (R0) to chain future asks from. The acknowledgment
 * text is discarded — only the id matters.
 */
export async function registerNote(
	settings: CooSettings,
	noteText: string,
): Promise<string> {
	const result = await callApi({
		settings,
		systemPrompt: getRegisterDocumentPrompt(),
		userPrompt: noteText,
		store: true,
		reasoningEffort: "none",
		webSearchEnabled: false,
	});

	if (!result.responseId) {
		throw new Error("Registration failed: no response id returned.");
	}
	return result.responseId;
}
