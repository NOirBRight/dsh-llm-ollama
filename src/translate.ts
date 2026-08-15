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

import { CallId, EMPTY_RESPONSE_CODE, LlmError } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, FinishReason, StreamChunk, TokenUsage } from '@deepseek-ai/dsh-llm'
import type { WireChatChunk, WireToolCall } from './types.ts'

/** One open block under assembly. */
interface OpenBlock {
  index: number
  kind: 'text' | 'reasoning' | 'tool-call'
  text: string
  /** tool-call only */
  callId?: string
  name?: string
}

/** Durable mapping from generated CallId to the tool name, for replay serialization. */
export interface ToolCallReplayEntry {
  callId: string
  toolName: string
}

/** Optional deterministic identity prefix for tool calls missing a provider id. */
export interface TranslateOptions {
  callIdPrefix?: string
}

let fallbackStreamSequence = 0

/**
 * Map the wire `done_reason` to the harness `FinishReason`. Ollama uses
 * `"stop"` for both normal completion and tool-call turns, so the presence of
 * tool-call blocks distinguishes them.
 * @param reason - the wire `done_reason` string.
 * @param hasToolCalls - whether any tool-call blocks were opened.
 * @returns the mapped reason; unrecognized values become `{kind: 'error'}` with the uppercased value as `code`.
 */
export function mapFinishReason(reason: string, hasToolCalls: boolean): FinishReason {
  switch (reason) {
    case 'stop':
      return hasToolCalls ? { kind: 'tool-calls' } : { kind: 'stop' }
    case 'length':
      return { kind: 'max-tokens' }
    default:
      return {
        kind: 'error',
        failure: { message: `model stopped: ${reason}`, code: reason.toUpperCase() },
      }
  }
}

/**
 * Map wire usage fields. Ollama reports `prompt_eval_count` (input) and
 * `eval_count` (output) on the terminal chunk; there are no cache fields.
 * @param chunk - the terminal NDJSON chunk.
 * @returns disjoint harness counts.
 */
export function mapUsage(chunk: WireChatChunk): TokenUsage {
  return {
    inputTokens: chunk.prompt_eval_count ?? 0,
    outputTokens: chunk.eval_count ?? 0,
  }
}

/** Assemble the final `ContentBlock` for one open block. */
function closeBlock(block: OpenBlock): ContentBlock {
  switch (block.kind) {
    case 'text': return { type: 'text', text: block.text }
    case 'reasoning': return { type: 'reasoning', text: block.text }
    case 'tool-call': return {
      type: 'tool-call',
      id: CallId(block.callId ?? ''),
      name: block.name ?? '',
      arguments: block.text,
    }
  }
}

/**
 * Consume parsed NDJSON chat chunks and yield `StreamChunk`s. The terminal
 * chunk (`done: true`) flushes all `block-end`s, `usage`, and `finish`.
 * @param chunks - parsed wire chunks from `parseChatChunks`.
 * @returns deltas as they arrive; `block-end`s, `usage`, and `finish` are deferred to the `done: true` chunk.
 *   A `stop` finish with no opened blocks is a degenerate provider completion and maps to an
 *   `EMPTY_RESPONSE` error finish instead of a successful empty message.
 */
export async function* translate(
  chunks: AsyncIterable<WireChatChunk>,
  options: TranslateOptions = {},
): AsyncGenerator<StreamChunk> {
  const callIdPrefix = options.callIdPrefix ?? `ollama-call-${++fallbackStreamSequence}`
  let nextIndex = 0
  let textBlock: OpenBlock | undefined
  let reasoningBlock: OpenBlock | undefined
  const toolBlocks: OpenBlock[] = []
  const order: OpenBlock[] = []
  let toolCallCounter = 0
  const replayEntries: ToolCallReplayEntry[] = []

  function open(kind: OpenBlock['kind']): OpenBlock {
    const block: OpenBlock = { index: nextIndex++, kind, text: '' }
    order.push(block)
    return block
  }

  for await (const chunk of chunks) {
    const message = chunk.message

    // Reasoning first: thinking mode interleaves it before text.
    const thinking = message.thinking
    if (typeof thinking === 'string' && thinking.length > 0) {
      if (!reasoningBlock) {
        reasoningBlock = open('reasoning')
        yield { type: 'block-start', index: reasoningBlock.index, blockType: 'reasoning' }
      }
      reasoningBlock.text += thinking
      yield { type: 'reasoning-delta', index: reasoningBlock.index, text: thinking }
    }

    const content = message.content
    if (typeof content === 'string' && content.length > 0) {
      if (!textBlock) {
        textBlock = open('text')
        yield { type: 'block-start', index: textBlock.index, blockType: 'text' }
      }
      textBlock.text += content
      yield { type: 'text-delta', index: textBlock.index, text: content }
    }

    // Ollama sends complete tool calls per chunk (not argument fragments).
    for (const call of message.tool_calls ?? []) {
      const ordinal = toolCallCounter++
      const callId = typeof call.id === 'string' && call.id.length > 0
        ? call.id
        : `${callIdPrefix}-${ordinal}`
      const toolName = call.function.name
      const argumentsJson = JSON.stringify(call.function.arguments)
      const block = open('tool-call')
      block.callId = callId
      block.name = toolName
      block.text = argumentsJson
      toolBlocks.push(block)
      replayEntries.push({ callId, toolName })
      yield { type: 'block-start', index: block.index, blockType: 'tool-call' }
      yield {
        type: 'tool-call-delta',
        index: block.index,
        id: CallId(callId),
        name: toolName,
        argumentsDelta: argumentsJson,
      }
    }

    if (chunk.done) {
      for (const block of order) {
        yield { type: 'block-end', index: block.index, block: closeBlock(block) }
      }
      yield { type: 'usage', usage: mapUsage(chunk) }
      const reason = mapFinishReason(chunk.done_reason ?? 'stop', toolBlocks.length > 0)
      yield {
        type: 'finish',
        reason: reason.kind === 'stop' && order.length === 0
          ? {
            kind: 'error',
            failure: { message: 'model returned a completed response with no content', code: EMPTY_RESPONSE_CODE },
          }
          : reason,
        ...replayEntries.length > 0 ? { replayState: { callIds: replayEntries } } : {},
      }
      return
    }
  }

  // parseChatChunks guarantees a done chunk (or throws); reaching here means
  // the chunk source violated that contract.
  throw new LlmError('Ollama chunk stream ended without a done chunk', 'STREAM_CLOSED')
}

/** Re-export for type consumers. */
export type { WireToolCall }
