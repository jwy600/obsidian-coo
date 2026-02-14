import { describe, it, expect } from 'vitest';
import { extractResponseText } from '../src/ai-client';

describe('extractResponseText', () => {
	it('extracts from top-level output_text', () => {
		const response = JSON.stringify({
			output_text: '  Hello world  ',
		});
		expect(extractResponseText(response)).toBe('Hello world');
	});

	it('extracts from output array when output_text is missing', () => {
		const response = JSON.stringify({
			output: [
				{
					type: 'message',
					content: [
						{ type: 'output_text', text: '  Nested response  ' },
					],
				},
			],
		});
		expect(extractResponseText(response)).toBe('Nested response');
	});

	it('prefers output_text over output array', () => {
		const response = JSON.stringify({
			output_text: 'Top level',
			output: [
				{
					type: 'message',
					content: [
						{ type: 'output_text', text: 'Nested' },
					],
				},
			],
		});
		expect(extractResponseText(response)).toBe('Top level');
	});

	it('skips non-message items in output array', () => {
		const response = JSON.stringify({
			output: [
				{ type: 'tool_call', content: [] },
				{
					type: 'message',
					content: [
						{ type: 'output_text', text: 'Found it' },
					],
				},
			],
		});
		expect(extractResponseText(response)).toBe('Found it');
	});

	it('skips non-output_text content blocks', () => {
		const response = JSON.stringify({
			output: [
				{
					type: 'message',
					content: [
						{ type: 'refusal', text: 'No' },
						{ type: 'output_text', text: 'Actual text' },
					],
				},
			],
		});
		expect(extractResponseText(response)).toBe('Actual text');
	});

	it('throws when no text is found', () => {
		const response = JSON.stringify({ output: [] });
		expect(() => extractResponseText(response)).toThrow(
			"The assistant didn't return any text.",
		);
	});

	it('throws when output_text is empty', () => {
		const response = JSON.stringify({ output_text: '   ' });
		expect(() => extractResponseText(response)).toThrow(
			"The assistant didn't return any text.",
		);
	});

	it('throws on invalid JSON', () => {
		expect(() => extractResponseText('not json')).toThrow();
	});

	it('handles output_text with only whitespace in nested', () => {
		const response = JSON.stringify({
			output: [
				{
					type: 'message',
					content: [
						{ type: 'output_text', text: '   ' },
					],
				},
			],
		});
		expect(() => extractResponseText(response)).toThrow(
			"The assistant didn't return any text.",
		);
	});
});
