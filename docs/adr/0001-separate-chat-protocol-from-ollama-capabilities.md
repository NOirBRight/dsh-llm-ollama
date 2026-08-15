# ADR 0001: Separate chat protocol from Ollama capabilities

English | [中文](0001-separate-chat-protocol-from-ollama-capabilities.zh.md)

## Status

Accepted — 2026-08-15

## Context

Ollama Cloud exposes four relevant chat/capability surfaces:

- native chat: POST /api/chat
- OpenAI Chat Completions: POST /v1/chat/completions
- OpenAI Responses: POST /v1/responses
- Anthropic Messages: POST /v1/messages

It also exposes Ollama-native independent capabilities:

- model discovery: GET /api/tags, POST /api/show
- web search: POST /api/web_search
- web fetch: POST /api/web_fetch

The first adapter implementation used a private native /api/chat NDJSON serializer and translator. That made tool-call identity the adapter's responsibility. The implementation generated ollama-call-0 at the start of every response, so different turns in one DSH session reused the same CallId and the Web client merged unrelated tool calls.

Verification against Ollama Cloud and local Ollama 0.21.2 showed that native /api/chat now returns a provider-issued tool-call id, although the public OpenAPI schema still omits that field. Verification through @deepseek-ai/dsh-llm-pi-ai also showed that Ollama's OpenAI Chat Completions endpoint preserves the DSH features the agent needs: streaming, thinking, provider-issued tool-call IDs, tool-result replay, vision support, and usage.

The plugin's other capabilities are independent of chat. A model served through OpenAI Chat Completions can still use Ollama Cloud Search/Fetch because DSH routes web_search and web_fetch through the configured ctx.web providers, not through the selected chat adapter.

## Decision

The ollama-cloud chat route uses OpenAI Chat Completions through the shared pi-ai-backed implementation. This plugin no longer owns a private native chat serializer or NDJSON translator.

The plugin continues to own Ollama-specific capabilities:

- /api/tags and /api/show for model discovery and capability metadata;
- /api/web_search and /api/web_fetch for Web capability providers;
- the Ollama Cloud settings card and model picker;
- the ollama-cloud provider identity and llm-ollama settings namespace.

The configured baseURL remains the native Ollama base (https://ollama.com/api by default). The adapter maps it internally to the OpenAI-compatible base (https://ollama.com/v1) for chat only.

## Alternatives considered

### Keep a private native /api/chat adapter

Rejected as the long-term architecture. Native discovery and Web capabilities still require the native API, but maintaining a second chat wire implementation duplicates the shared pi-ai adapter's SSE parsing, tool-call identity handling, replay, and reasoning mapping. The v0.2.3 hotfix keeps this path safe for existing users, but v0.3.0 moves the default chat path to the shared implementation.

### Use OpenAI Responses

Rejected as the default. Ollama supports only the non-stateful Responses flavor: no previous_response_id, no conversation, and no truncation. DSH already owns conversation state and full history replay, so Responses adds protocol complexity without a matching consumer benefit.

### Use Anthropic Messages

Rejected as the default. The endpoint works when an extra Authorization: Bearer header is supplied, but x-api-key alone is not enough for Ollama Cloud. It also lacks model listing and omits Anthropic features such as prompt caching, citations, PDF blocks, token counting, and tool_choice.

### Support every protocol

Rejected. One adapter route should speak one chat protocol. Supporting native, Chat Completions, Responses, and Anthropic behind one route would multiply serializer, replay, and failure-matrix coverage without a consumer that needs all four.

## Consequences

- Chat tool-call IDs come from the provider's OpenAI-compatible response instead of a locally synthesized ollama-call-N value.
- The plugin reuses pi-ai's OpenAI-compatible history conversion, tool-result replay, reasoning mapping, and stream handling.
- The adapter sends max_tokens, reasoning_effort, and stream_options.include_usage; it does not send max_completion_tokens, store, or prompt_cache_* fields.
- Existing llm-ollama settings and saved model catalogs remain valid. The native baseURL remains the user-facing endpoint because discovery and Web capabilities still use it.
- Models must be present in the configured catalog; the old native adapter's unlisted-model pass-through is removed.
- GenerateOptions.stop is not supported by the current shared pi-ai adapter and remains a documented limitation until that upstream adapter grows support.
- Old session logs are not migrated. Logs already written with duplicate ollama-call-0 values can still replay poorly, but new sessions receive provider-unique IDs.
- Ollama Cloud Search/Fetch remain available regardless of the selected chat model because they are independent ctx.web providers.

## Evidence

- Ollama Cloud native /api/chat returned tool_calls[].id in both non-streaming and streaming responses.
- Local Ollama 0.21.2 returned tool_calls[].id for the same native request.
- llm-pi-ai completed a first tool call through /v1/chat/completions, /v1/responses, and /v1/messages.
- llm-pi-ai completed tool-result replay through all three compatibility protocols.
- /api/show returned capabilities and context metadata; /v1/models returned only model ids.
- Ollama Cloud /api/web_search returned results independently of the selected DSH chat model.
