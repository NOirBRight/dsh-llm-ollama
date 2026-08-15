# 架构：Ollama Cloud 原生协议与插件入口

[English](architecture.md) | 中文

## Problem

Ollama Cloud 暴露三种线协议：原生 `/api/chat`（NDJSON 流式）、OpenAI 兼容 `/v1/chat/completions`（SSE）和 Anthropic 兼容 `/v1/messages`（SSE）。适配器需要选择实现哪一种。

## Decision

`dsh-llm-ollama` 适配器只实现原生 `/api/chat` 协议。它遵循 `dsh-llm-deepseek` 的直接 fetch 模板（分拆 wire-types / serialize / NDJSON-parse / translate / adapter 模块），并加入 `dsh-llm-pi-ai` 的发现模式（`/api/tags` + `/api/show`）。

原生协议是唯一暴露适配器发现功能所需模型元数据的协议：`/api/show` 返回 `model_info.*.context_length` 和 `capabilities`（vision、thinking、tools）。OpenAI 兼容的 `/v1/models` 只返回 `{id, created, owned_by}`。Anthropic 兼容端点没有模型列表。

原生 `think` 字段接受 `false`/`"low"`/`"medium"`/`"high"`/`"max"`，而 OpenAI 兼容的 `reasoning_effort` 只接受 `"none"`/`"low"`/`"medium"`/`"high"`——`"max"` 级别仅原生支持。

独立安装的 npm 包同时携带两个运行时入口。Host 入口注册适配器、设置分节、模型发现和仅限 loopback 的丰富发现 Connection RPC；`dsh.client` 入口向 `settings.plugin.item` 贡献一张卡片，用户可通过凭据 API 保存 API key、探测尚未保存的端点、选择发现的模型，并编辑容量与能力标志。bundle 不要求修改 Harness 核心或 profile 文件。

## Alternatives considered

### 为什么不用 OpenAI 兼容端点？

OpenAI 兼容的 `/v1/chat/completions` 端点已经可以通过 `@deepseek-ai/dsh-llm-pi-ai` 作为手声明路由使用（`api: openai-completions`、`baseURL: https://ollama.com/v1`、`apiKeyEnv: OLLAMA_API_KEY`）。为同一端点构建第二个适配器会重复 pi-ai 的 SSE 解析、call-id 工具调用处理和 `reasoning_effort` 映射。更重要的是，OpenAI 兼容的 `/v1/models` 列表只返回模型 id——没有上下文窗口、没有能力声明——因此用户要求的发现功能（"自动配置上下文、最大输出、视觉、推理等级"）无法通过该协议满足。

### 为什么不用 Anthropic 兼容端点？

Anthropic 兼容的 `/v1/messages` 端点为使用 Anthropic API 的工具（如 Claude Code）而存在。harness 有自己的 provider-neutral 消息词汇；没有消费者需要 Anthropic 的线格式。支持它会增加第三个 serializer 和 translator，没有净收益。

### 为什么不在一个适配器里支持全部三种？

一个适配器只说一种协议。在一个适配器里支持三种线格式会让 serializer/translator 表面翻三倍（三种消息格式、三种流式格式、三种工具调用关联模型），没有消费者收益。harness 的消息词汇是 provider-neutral 的；适配器翻译为一种线格式，想要其他格式的用户使用相应的适配器（pi-ai 用于 OpenAI 兼容）。

### 为什么不修改 Models 页面？

Models 编辑器只识别一组封闭的内置 provider 布局。加入 Ollama 专用分支会让此外部包依赖 Harness 核心修改，下一个第三方适配器仍会遇到同一问题。现有 `settings.plugin.item` client slot 允许包自行持有编辑器，无需修改应用。通用的 Models 页面 provider 编辑器扩展点仍属于上游事项。

## Consequences

- **工具名关联**：Ollama 通过 `tool_name`（函数名）关联工具结果，不是 call id。适配器生成顺序 `CallId` 并在 `finish.replayState` 中保存 `callId → toolName` 映射，以便 serializer 在回放时重建关联。如果模型在一轮中调用同一工具两次，线格式无法区分两个结果；serializer 按顺序发送，provider 按位置匹配。
- **NDJSON 传输**：适配器附带新的 `ndjson.ts` 解析器（带 UTF-8 边界安全的行分割），而不是复用 `dsh-llm-deepseek` 的 `eventsource-parser` SSE 解析器。终止块携带 `done: true`（没有 `[DONE]` 哨兵）。
- **发现丰富度**：`/api/tags` + `/api/show` 发现返回 OpenAI 兼容列表无法提供的上下文窗口和能力标志。标准 LLM 发现响应携带可移植的容量字段；包的 loopback 配置 RPC 为自己的 client 卡片保留 Ollama 专用的 vision、thinking 和 tools 标志。
- **单包 Web 配置**：`dsh plugin add` 同时安装 Host 与 client 入口。client 卡片通过 `settingsScope` 写设置、通过 `credentials.set` 写凭据，并通过仅限 loopback 的 Connection 通道执行丰富发现，因此设置响应不包含密钥。
- **GPT-OSS thinking 限制**：GPT-OSS 要求 `think: "low"|"medium"|"high"` 且无法禁用 thinking。适配器为所有 thinking 模型暴露 `off`；如果 GPT-OSS 拒绝 `think: false`，错误以 `INVALID_REQUEST` 传播。按模型的 `noOff` 标志推迟。
- **OpenAI 兼容覆盖**：想要 OpenAI 兼容端点的用户通过 `dsh-llm-pi-ai` 手声明路由使用。本适配器不支持该协议，避免重复。