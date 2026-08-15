/**
 * Serialize harness messages into Ollama native chat format. User text is joined;
 * assistant text becomes `content`, reasoning blocks become `thinking`, tool
 * calls become `tool_calls` (with `arguments` re-parsed from the raw JSON
 * string to an object), and tool results become separate `{role: 'tool'}`
 * messages keyed by `tool_name`. Assistant reasoning is replayed as `thinking`
 * only on tool-call turns, matching Ollama's passback convention. Core image
 * blocks are resolved to base64 through the attachment service for vision
 * models; text-only models reject images before serialization. Unknown
 * declaration-merged block types retain the adapter's documented extension
 * fallback.
 *
 * @module dsh-llm-ollama/serialize
 */

import { CallId, contentHasImage, LlmError } from '@deepseek-ai/dsh-llm'
import type { ContentBlock, GenerateOptions, Message } from '@deepseek-ai/dsh-llm'
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment'
import type { WireAssistantMessage, WireChatRequest, WireMessage, WireTool, WireToolCall } from './types.ts'

/** Adapter-level request defaults (from plugin config). */
export interface RequestDefaults {
  /** Whether the selected model supports thinking; absent means unknown. */
  thinking?: boolean | undefined
  /** Whether the model family accepts `think: false`; defaults to true. */
  thinkingCanDisable?: boolean | undefined
}

/** Resolved thinking fields for one request. */
interface ResolvedThink {
  think?: boolean | 'low' | 'medium' | 'high' | 'max'
}

/** Validate the adapter-owned effort before resolving its Ollama wire value. */
function reasoningEffort(effort: NonNullable<GenerateOptions['reasoningEffort']>): 'off' | 'low' | 'medium' | 'high' | 'max' {
  if (effort === 'off' || effort === 'low' || effort === 'medium' || effort === 'high' || effort === 'max') {
    return effort as 'off' | 'low' | 'medium' | 'high' | 'max'
  }
  throw new LlmError(
    `Ollama does not support reasoning effort "${effort}"`,
    'UNSUPPORTED_REASONING_EFFORT',
  )
}

/** Resolve the `think` wire value from the request effort and the model's thinking capability. */
function resolveThink(options: GenerateOptions, defaults: RequestDefaults): ResolvedThink {
  // Non-thinking models: omit think entirely. The runtime gates efforts before
  // I/O, but this keeps the serializer self-consistent with the model's capability.
  if (defaults.thinking === false) return {}
  const canDisable = defaults.thinkingCanDisable !== false
  if (options.purpose === 'session-title') return { think: canDisable ? false : 'low' }
  const effort = options.reasoningEffort === undefined
    ? undefined
    : reasoningEffort(options.reasoningEffort)
  if (effort === undefined) return {}
  if (effort === 'off') {
    if (!canDisable) {
      throw new LlmError('Ollama model does not support disabling thinking', 'UNSUPPORTED_REASONING_EFFORT')
    }
    return { think: false }
  }
  return { think: effort }
}

/** Join the text blocks of a message (used for user/tool-result content). */
function flattenText(blocks: ContentBlock[]): string {
  return blocks
    .filter(block => block.type === 'text')
    .map(block => block.text)
    .join('')
}

/** Collect base64 images from image blocks, resolving bytes through the attachment service. */
async function collectImages(
  blocks: readonly ContentBlock[],
  attachments: AttachmentStore,
): Promise<string[]> {
  const images: string[] = []
  for (const block of blocks) {
    if (block.type === 'image') {
      const stored = await attachments.readImage(block.attachment)
      images.push(Buffer.from(stored.data).toString('base64'))
    }
  }
  return images
}

/** Serialize one assistant message (text + reasoning + tool calls). */
function serializeAssistant(message: Message): WireAssistantMessage {
  const text = flattenText(message.content)
  const thinking = message.content
    .filter(block => block.type === 'reasoning')
    .map(block => block.text)
    .join('')
  const toolCalls = message.content
    .filter(block => block.type === 'tool-call')
    .map((block) => {
      const toolCall = block
      let parsed: Record<string, unknown>
      try {
        parsed = JSON.parse(toolCall.arguments) as Record<string, unknown>
      } catch {
        // The harness contract guarantees raw JSON strings; a parse failure
        // means the block was assembled wrong upstream.
        parsed = {}
      }
      return {
        function: {
          name: toolCall.name,
          arguments: parsed,
        },
      } satisfies WireToolCall
    })

  return {
    role: 'assistant',
    content: text,
    ...toolCalls.length > 0 && thinking.length > 0 ? { thinking } : {},
    ...toolCalls.length > 0 ? { tool_calls: toolCalls } : {},
  }
}

/**
 * Serialize the conversation into Ollama wire messages. Tool-result blocks
 * become standalone `{role: 'tool'}` messages keyed by `tool_name`; the
 * harness puts each tool result in its own user-role message, so a mixed
 * user message contributes its text first and its tool results as separate
 * wire messages after. The `callIdToName` map is maintained in-order so
 * each tool result resolves its `tool_name` from the preceding tool-call.
 * @param messages - the harness conversation, in order.
 * @param attachments - durable byte resolver for image references; required when messages contain images.
 * @returns the wire messages; order preserved, each tool result expanded into its own entry.
 */
export async function serializeMessages(
  messages: Message[],
  attachments: AttachmentStore | undefined,
): Promise<WireMessage[]> {
  const wire: WireMessage[] = []
  const callIdToName = new Map<string, string>()
  for (const message of messages) {
    if (message.role === 'system') {
      wire.push({ role: 'system', content: flattenText(message.content) })
      continue
    }
    if (message.role === 'assistant') {
      // Record callId → toolName for later tool-result correlation.
      for (const block of message.content) {
        if (block.type === 'tool-call') {
          const toolCall = block
          callIdToName.set(String(toolCall.id), toolCall.name)
        }
      }
      wire.push(serializeAssistant(message))
      continue
    }
    // user role: tool results ride in user messages in the harness vocabulary,
    // but Ollama wants them as role:'tool' messages keyed by tool_name.
    const toolResults = message.content.filter(block => block.type === 'tool-result')
    const text = flattenText(message.content)
    const hasImages = contentHasImage(message.content)

    if (hasImages) {
      if (attachments === undefined) {
        throw new LlmError('Ollama image input requires the durable attachment service', 'UNSUPPORTED_CONTENT')
      }
      const images = await collectImages(message.content, attachments)
      wire.push({
        role: 'user',
        content: text,
        ...images.length > 0 ? { images } : {},
      })
    } else if (text.length > 0 || toolResults.length === 0) {
      wire.push({ role: 'user', content: text })
    }

    for (const result of toolResults) {
      const toolResult = result
      const toolName = callIdToName.get(String(toolResult.toolCallId))
      if (toolName === undefined) {
        throw new LlmError(
          `Ollama cannot correlate tool result for call id "${toolResult.toolCallId}";`
          + ' no preceding assistant tool-call carries that id',
          'INVALID_HISTORY',
        )
      }
      wire.push({
        role: 'tool',
        tool_name: toolName,
        // Empty tool output still needs SOME content on the wire.
        content: flattenText(toolResult.content) || '(no output)',
      })
    }
  }
  return wire
}

/**
 * Build the full wire request. Always streaming (`stream: true`); optional
 * fields are omitted rather than sent as null, so provider defaults apply.
 * @param options - the harness request (model, history, system, tools, sampling).
 * @param defaults - adapter-level thinking defaults; undefined fields put nothing on the wire.
 * @param attachments - durable byte resolver for image references; required when messages contain images.
 * @returns the `/api/chat` request body.
 */
export async function serializeRequest(
  options: GenerateOptions,
  defaults: RequestDefaults = {},
  attachments?: AttachmentStore,
): Promise<WireChatRequest> {
  const messages = await serializeMessages(options.messages, attachments)
  if (options.system !== undefined) {
    messages.unshift({ role: 'system', content: options.system })
  }

  const tools: WireTool[] | undefined = options.tools?.map(tool => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }))

  const resolvedThink = resolveThink(options, defaults)

  // Build options: num_ctx from the resolved context window, num_predict from
  // maxTokens, temperature and stop when present.
  const wireOptions: WireChatRequest['options'] = {
    ...options.maxTokens === undefined ? {} : { num_predict: options.maxTokens },
    ...options.temperature === undefined ? {} : { temperature: options.temperature },
    ...options.stop === undefined ? {} : { stop: options.stop },
  }

  return {
    model: options.model,
    messages,
    stream: true,
    ...resolvedThink.think !== undefined ? { think: resolvedThink.think } : {},
    ...tools !== undefined && tools.length > 0 ? { tools } : {},
    ...Object.keys(wireOptions).length > 0 ? { options: wireOptions } : {},
  }
}

/** Re-export for adapter use. */
export { CallId }
