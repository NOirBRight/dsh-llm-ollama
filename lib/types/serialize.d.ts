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
import { CallId } from '@deepseek-ai/dsh-llm';
import type { GenerateOptions, Message } from '@deepseek-ai/dsh-llm';
import type { AttachmentStore } from '@deepseek-ai/dsh-attachment';
import type { WireChatRequest, WireMessage } from './types.ts';
/** Adapter-level request defaults (from plugin config). */
export interface RequestDefaults {
    /** Whether the selected model supports thinking; absent means unknown. */
    thinking?: boolean | undefined;
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
export declare function serializeMessages(messages: Message[], attachments: AttachmentStore | undefined): Promise<WireMessage[]>;
/**
 * Build the full wire request. Always streaming (`stream: true`); optional
 * fields are omitted rather than sent as null, so provider defaults apply.
 * @param options - the harness request (model, history, system, tools, sampling).
 * @param defaults - adapter-level thinking defaults; undefined fields put nothing on the wire.
 * @param attachments - durable byte resolver for image references; required when messages contain images.
 * @returns the `/api/chat` request body.
 */
export declare function serializeRequest(options: GenerateOptions, defaults?: RequestDefaults, attachments?: AttachmentStore): Promise<WireChatRequest>;
/** Re-export for adapter use. */
export { CallId };
//# sourceMappingURL=serialize.d.ts.map