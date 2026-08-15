/**
 * Decode an NDJSON byte stream into individual JSON-serialized lines. Ollama
 * streams `/api/chat` as newline-delimited JSON objects
 * (`application/x-ndjson`), one per line; the terminal line carries
 * `done: true`. Unlike SSE there is no `[DONE]` sentinel — the caller
 * identifies the terminal chunk by parsing each line and checking `done`.
 *
 * A line may split across reads, including mid-UTF-8, so partial bytes are
 * buffered until the next `\n`. A stream that ends without a final newline
 * on a non-empty buffer yields the buffered text as a last line (the
 * terminal chunk is still identified by `done: true` in the parsed JSON).
 *
 * @module dsh-llm-ollama/ndjson
 */
/**
 * Parse an NDJSON byte stream into individual line strings. Each non-empty
 * line is yielded in arrival order; empty lines (blank separators) are
 * skipped. The caller parses each line as JSON.
 * @param stream - raw NDJSON bytes; reads may split anywhere, including mid-UTF-8.
 * @returns each non-empty line as a string, in arrival order.
 */
export declare function parseNdjson(stream: ReadableStream<BufferSource>): AsyncGenerator<string>;
/**
 * Consume an NDJSON byte stream and yield parsed JSON objects, stopping after
 * the terminal chunk (`done: true`). Throws `LlmError('STREAM_CLOSED')` when
 * the stream ends without a `done: true` chunk (truncated response).
 * @param stream - raw NDJSON bytes from `/api/chat`.
 * @returns parsed `WireChatChunk` objects in arrival order, the terminal chunk last.
 */
export declare function parseChatChunks<T extends {
    done: boolean;
}>(stream: ReadableStream<BufferSource>): AsyncGenerator<T>;
//# sourceMappingURL=ndjson.d.ts.map