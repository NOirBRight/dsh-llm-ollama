/**
 * Translate Ollama NDJSON chunks with one stateful harness block per content,
 * reasoning, or tool-call. Ollama streams complete tool calls per chunk (not
 * argument fragments), so each tool call opens a block, receives its full
 * arguments in one delta, and closes at the terminal chunk. Finish reason and
 * usage are deferred until the `done: true` chunk, ensuring no chunk follows
 * `finish`.
 *
 * @module dsh-llm-ollama/translate
 */
import type { FinishReason, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm';
import type { WireChatChunk, WireToolCall } from './types.ts';
/** Durable mapping from generated CallId to the tool name, for replay serialization. */
export interface ToolCallReplayEntry {
    callId: string;
    toolName: string;
}
/** Optional deterministic identity prefix for tool calls missing a provider id. */
export interface TranslateOptions {
    callIdPrefix?: string;
}
/**
 * Map the wire `done_reason` to the harness `FinishReason`. Ollama uses
 * `"stop"` for both normal completion and tool-call turns, so the presence of
 * tool-call blocks distinguishes them.
 * @param reason - the wire `done_reason` string.
 * @param hasToolCalls - whether any tool-call blocks were opened.
 * @returns the mapped reason; unrecognized values become `{kind: 'error'}` with the uppercased value as `code`.
 */
export declare function mapFinishReason(reason: string, hasToolCalls: boolean): FinishReason;
/**
 * Map wire usage fields. Ollama reports `prompt_eval_count` (input) and
 * `eval_count` (output) on the terminal chunk; there are no cache fields.
 * @param chunk - the terminal NDJSON chunk.
 * @returns disjoint harness counts.
 */
export declare function mapUsage(chunk: WireChatChunk): TokenUsage;
/**
 * Consume parsed NDJSON chat chunks and yield `StreamChunk`s. The terminal
 * chunk (`done: true`) flushes all `block-end`s, `usage`, and `finish`.
 * @param chunks - parsed wire chunks from `parseChatChunks`.
 * @returns deltas as they arrive; `block-end`s, `usage`, and `finish` are deferred to the `done: true` chunk.
 *   A `stop` finish with no opened blocks is a degenerate provider completion and maps to an
 *   `EMPTY_RESPONSE` error finish instead of a successful empty message.
 */
export declare function translate(chunks: AsyncIterable<WireChatChunk>, options?: TranslateOptions): AsyncGenerator<StreamChunk>;
/** Re-export for type consumers. */
export type { WireToolCall };
//# sourceMappingURL=translate.d.ts.map