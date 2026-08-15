# Architecture: Ollama Cloud native protocol and plugin faces

English | [中文](architecture.zh.md)

## Problem

Ollama Cloud exposes three wire protocols: native `/api/chat` (NDJSON streaming), OpenAI-compatible `/v1/chat/completions` (SSE), and Anthropic-compatible `/v1/messages` (SSE). The adapter must choose which to implement.

## Decision

The `dsh-llm-ollama` adapter implements only the native `/api/chat` protocol. It follows the `dsh-llm-deepseek` direct-fetch template (separate wire-types / serialize / NDJSON-parse / translate / adapter modules) and discovers models from `/api/tags` plus `/api/show`, deduplicating native tag ids while retaining tag order.

The native protocol is the only one that exposes the model metadata the adapter's discovery feature needs: `/api/show` returns `model_info.*.context_length` and `capabilities` (vision, thinking, tools). The OpenAI-compatible `/v1/models` returns only `{id, created, owned_by}`. The Anthropic-compatible endpoint has no model listing at all.

The native `think` field follows Ollama's general `false`/`"low"`/`"medium"`/`"high"`/`"max"` rule, with GPT-OSS restricted to `"low"`/`"medium"`/`"high"`. OpenAI-compatible `reasoning_effort` accepts only `"none"`/`"low"`/`"medium"`/`"high"`; the general native rule is the only one with `"max"`.

The independently installed npm package carries both runtime faces. Its Host entry registers the adapter, settings section, model discovery, and a loopback-only Connection RPC for rich discovery and atomic editor saves. Its `dsh.client` entry contributes one card to `settings.plugin.item` and a model picker to `shell.overlay`; users store the API key through the credentials API, interrogate an unsaved endpoint, select discovered models, and edit capacities and capability flags. The bundle requires no Harness core or profile-file modification.

## Alternatives considered

### Why not the OpenAI-compatible endpoint?

The OpenAI-compatible `/v1/chat/completions` endpoint is already usable through `@deepseek-ai/dsh-llm-pi-ai` as a hand-declared route (`api: openai-completions`, `baseURL: https://ollama.com/v1`, `apiKeyEnv: OLLAMA_API_KEY`). Building a second adapter for the same endpoint would duplicate pi-ai's SSE parsing, call-id tool-call handling, and `reasoning_effort` mapping. More importantly, the OpenAI-compatible `/v1/models` listing returns only model ids, with no context windows or capabilities. Native `/api/show` supplies those fields, although neither listing supplies per-model output limits or accepted thinking efforts.

### Why not the Anthropic-compatible endpoint?

The Anthropic-compatible `/v1/messages` endpoint exists for tools that speak Anthropic's API (Claude Code). The harness has its own provider-neutral message vocabulary; no consumer needs Anthropic's wire format. Supporting it would add a third serializer and translator for no net benefit.

### Why not support all three in one adapter?

One adapter speaks one protocol. Supporting three wire formats in one adapter would triple the serializer/translator surface (three message formats, three streaming formats, three tool-call correlation models) for no consumer benefit. The harness message vocabulary is provider-neutral; the adapter translates to one wire format, and users who want a different one use the appropriate adapter (pi-ai for OpenAI-compatible).

### Why not patch the Models page?

The Models editor recognizes a closed set of built-in provider layouts. Adding an Ollama-specific branch would make this external package depend on a Harness core modification and repeat the same problem for the next third-party adapter. The existing `settings.plugin.item` client slot lets the package own its editor without changing the application. A generic Models-page provider-editor extension remains an upstream concern.

## Consequences

- **Tool-name correlation**: Ollama correlates tool results by `tool_name` (the function name), not by a call id. The adapter generates sequential `CallId`s and stores the `callId → toolName` mapping in `finish.replayState` so the serializer can reconstruct the correlation on replay. If the model calls the same tool twice in one turn, the wire cannot distinguish the two results; the serializer sends them in order and the provider matches positionally.
- **NDJSON transport**: The adapter ships a new `ndjson.ts` parser (line-splitting with UTF-8 boundary safety) instead of reusing the `eventsource-parser` SSE parser from `dsh-llm-deepseek`. The terminal chunk carries `done: true` (no `[DONE]` sentinel).
- **Discovery richness**: The `/api/tags` + `/api/show` discovery returns context windows and capability flags that the OpenAI-compatible listing cannot. The client opens its picker before the RPC settles; the Host enriches up to six native tag models concurrently and preserves tag order. The picker seeds checked state from the draft, retains current-only ids, and replaces the draft catalog with the adopted set. The package's loopback RPC preserves Ollama-specific vision, thinking, and tools flags for its own card. `/api/show` does not identify accepted thinking efforts.
- **Single-package Web setup**: `dsh plugin add` installs the Host and client faces together. The card reads through `settingsScope`, saves the URL and catalog through one revision-fenced Host mutation, writes credentials through `credentials.set`, and performs rich discovery through the same loopback-only Connection channel. Its `shell.overlay` contribution portals the visible dialog to `document.body`, matching DSH modal composition so the Settings dialog cannot cover it. No secret is included in a settings response.
- **Thinking efforts**: The adapter applies Ollama's documented general effort set and its explicit GPT-OSS exception. It cannot discover a narrower model-specific set because `/api/show` reports only the `thinking` capability.
- **Web capability providers**: The Host plugin also registers `/api/web_search` and `/api/web_fetch` with `ctx.web` under `ollama-cloud`, sharing the chat route's credential and base URL. Selection remains deployment policy (the base bundle pins `deepseek-official`); a profile switches by pinning `searchProvider`/`fetchProvider` in its cordis patch. Credentialed requests set `redirect: 'error'` so the key cannot leak to a redirect target. The fetch provider reports Ollama's extracted page content as `text`.
- **OpenAI-compatible coverage**: Users who want the OpenAI-compatible endpoint use `dsh-llm-pi-ai` with a hand-declared route. This adapter does not support that protocol, avoiding duplication.