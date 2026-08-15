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

import { LlmError } from '@deepseek-ai/dsh-llm'

/**
 * Parse an NDJSON byte stream into individual line strings. Each non-empty
 * line is yielded in arrival order; empty lines (blank separators) are
 * skipped. The caller parses each line as JSON.
 * @param stream - raw NDJSON bytes; reads may split anywhere, including mid-UTF-8.
 * @returns each non-empty line as a string, in arrival order.
 */
export async function* parseNdjson(
  stream: ReadableStream<BufferSource>,
): AsyncGenerator<string> {
  const decoder = new TextDecoder()
  const reader = stream.getReader()
  let buffer = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let newlineIndex: number
      // Split on \n; trim \r for CRLF compatibility. A partial line (no
      // trailing newline) stays in the buffer for the next read.
      while ((newlineIndex = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, newlineIndex).replace(/\r$/, '')
        buffer = buffer.slice(newlineIndex + 1)
        if (line.length > 0) yield line
      }
    }
    // Flush any trailing content without a final newline. An empty buffer
    // (the common case — the last line ended with \n) yields nothing.
    const tail = buffer.replace(/\r$/, '')
    if (tail.length > 0) yield tail
  } finally {
    await reader.cancel().catch(() => {
      // Cancel after a drained or abandoned read is cleanup; the reply is
      // already decided either way.
    })
  }
}

/**
 * Consume an NDJSON byte stream and yield parsed JSON objects, stopping after
 * the terminal chunk (`done: true`). Throws `LlmError('STREAM_CLOSED')` when
 * the stream ends without a `done: true` chunk (truncated response).
 * @param stream - raw NDJSON bytes from `/api/chat`.
 * @returns parsed `WireChatChunk` objects in arrival order, the terminal chunk last.
 */
export async function* parseChatChunks<T extends { done: boolean }>(
  stream: ReadableStream<BufferSource>,
): AsyncGenerator<T> {
  for await (const line of parseNdjson(stream)) {
    let chunk: T
    try {
      chunk = JSON.parse(line) as T
    } catch {
      throw new LlmError(`malformed NDJSON line: ${line.slice(0, 120)}`, 'MALFORMED_RESPONSE')
    }
    yield chunk
    if (chunk.done) {
      return
    }
  }
  // Reaching past the loop means no chunk carried `done: true` — the stream
  // was truncated. `sawDone` is always `false` here (TypeScript narrows it),
  // so the guard is unconditional.
  throw new LlmError('Ollama NDJSON stream ended without a done chunk', 'STREAM_CLOSED')
}
