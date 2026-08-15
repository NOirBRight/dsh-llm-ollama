# ADR 0001：将聊天协议与 Ollama 能力分离

[English](0001-separate-chat-protocol-from-ollama-capabilities.md) | 中文

## 状态

已接受 — 2026-08-15

## 背景

Ollama Cloud 提供四个相关的聊天/能力接口：

- 原生聊天：POST /api/chat
- OpenAI Chat Completions：POST /v1/chat/completions
- OpenAI Responses：POST /v1/responses
- Anthropic Messages：POST /v1/messages

它还提供 Ollama 原生的独立能力：

- 模型发现：GET /api/tags、POST /api/show
- 网页搜索：POST /api/web_search
- 网页抓取：POST /api/web_fetch

第一版适配器使用私有的原生 /api/chat NDJSON serializer 和 translator。因此工具调用身份只能由适配器自己生成。旧实现在每次响应开始时都会生成 ollama-call-0，导致同一个 DSH 会话中的不同轮次复用同一个 CallId，Web client 因此把无关的工具调用合并。

针对 Ollama Cloud 和本地 Ollama 0.21.2 的验证表明，原生 /api/chat 现在会返回 provider 签发的工具调用 id，只是公开的 OpenAPI schema 仍未写出该字段。通过 @deepseek-ai/dsh-llm-pi-ai 的验证也表明，Ollama 的 OpenAI Chat Completions 端点已经保留 DSH agent 所需能力：streaming、thinking、provider 签发的工具调用 ID、工具结果回放、视觉输入和 usage。

插件的其他能力与聊天协议无关。即使模型通过 OpenAI Chat Completions 提供聊天，也仍然可以使用 Ollama Cloud Search/Fetch，因为 DSH 通过配置好的 ctx.web provider 路由 web_search 和 web_fetch，而不是通过当前聊天适配器路由。

## 决策

ollama-cloud 聊天路由使用 OpenAI Chat Completions，并复用共享的 pi-ai 实现。插件不再持有私有的原生聊天 serializer 或 NDJSON translator。

插件继续负责以下 Ollama 特有独立能力：

- 用 /api/tags 和 /api/show 做模型发现与能力元数据识别；
- 用 /api/web_search 和 /api/web_fetch 提供 Web capability provider；
- Ollama Cloud 设置卡片和模型选择器；
- ollama-cloud provider 身份与 llm-ollama 设置命名空间。

配置中的 baseURL 仍然表示 Ollama 原生 API 地址，默认是 https://ollama.com/api。适配器只在聊天路径内部把它映射为 OpenAI-compatible 地址 https://ollama.com/v1。

## 备选方案

### 保留私有的原生 /api/chat 适配器

不作为长期架构采用。模型发现和 Web 能力仍然需要原生 API，但额外维护一套聊天线协议会重复共享 pi-ai adapter 已经实现的 SSE 解析、工具调用身份、历史回放和推理映射。v0.2.3 hotfix 会继续保证该路径对现有用户安全，v0.3.0 则把默认聊天路径迁到共享实现。

### 使用 OpenAI Responses

不作为默认协议。Ollama 只支持 non-stateful Responses：不支持 previous_response_id、conversation 和 truncation。DSH 自己已经管理会话状态和完整历史回放，因此 Responses 只会增加协议复杂度，没有对应的消费者收益。

### 使用 Anthropic Messages

不作为默认协议。该端点在额外提供 Authorization: Bearer 时可用，但只提供 x-api-key 对 Ollama Cloud 不够。它也没有模型列表，并缺少 prompt caching、citations、PDF blocks、token counting 和 tool_choice 等 Anthropic 能力。

### 同时支持所有协议

不采用。一个 adapter route 应该只说一种聊天协议。在同一路由下支持 native、Chat Completions、Responses 和 Anthropic，会让 serializer、replay 和失败矩阵成倍增加，但没有消费者同时需要这四种协议。

## 影响

- 聊天工具调用 ID 来自 OpenAI-compatible 响应，而不是本地合成的 ollama-call-N。
- 插件复用 pi-ai 的 OpenAI-compatible 历史转换、工具结果回放、推理映射和流处理。
- 适配器发送 max_tokens、reasoning_effort 和 stream_options.include_usage；不会发送 max_completion_tokens、store 或 prompt_cache_* 字段。
- 现有 llm-ollama 设置和已保存的模型目录继续有效。用户看到的 baseURL 仍是原生地址，因为发现和 Web 能力继续使用它。
- 模型必须先进入已配置目录；旧原生适配器允许的未列出模型 pass-through 被移除。
- 当前共享 pi-ai adapter 不支持 GenerateOptions.stop；在它上游增加支持前，这仍是文档记录的限制。
- 旧会话日志不迁移。已经写入重复 ollama-call-0 的旧日志仍可能回放异常，但新会话会获得 provider 级唯一 ID。
- 无论当前聊天模型是什么，Ollama Cloud Search/Fetch 都继续可用，因为它们是独立的 ctx.web provider。

## 证据

- Ollama Cloud 原生 /api/chat 在非流式和流式响应中都返回 tool_calls[].id。
- 本地 Ollama 0.21.2 对相同原生请求也返回 tool_calls[].id。
- llm-pi-ai 通过 /v1/chat/completions、/v1/responses 和 /v1/messages 完成了首次工具调用。
- llm-pi-ai 通过全部三种兼容协议完成了工具结果回放。
- /api/show 返回 capabilities 和上下文元数据；/v1/models 只返回模型 id。
- Ollama Cloud /api/web_search 能独立于当前 DSH 聊天模型返回结果。
