# 架构：Ollama 独立能力与 OpenAI-compatible 聊天

[English](architecture.md) | 中文

已接受的协议决策记录在 [ADR 0001](adr/0001-separate-chat-protocol-from-ollama-capabilities.zh.md)。

## 能力归属

本包拥有一个 Ollama 特有 provider 身份 ollama-cloud，但不会把每个 Ollama endpoint 当作同一种协议。

聊天通过共享的 pi-ai adapter 使用 OpenAI Chat Completions：

    DSH GenerateOptions
      -> OllamaAdapter
      -> PiAiAdapter
      -> POST <chat-base>/chat/completions
      -> DSH StreamChunk

Ollama 特有的独立能力继续使用原生 API：

    模型发现  -> GET /api/tags + POST /api/show
    网页搜索  -> POST /api/web_search
    网页抓取  -> POST /api/web_fetch

DSH 通过 ctx.web 路由 web_search 和 web_fetch。它们的 provider 选择与当前聊天模型和 adapter 无关。

## Endpoint 映射

llm-ollama 设置节保存 Ollama 原生 base URL，因为模型发现和 Web 能力会直接使用它。默认值是：

    https://ollama.com/api

聊天 adapter 会把相邻的原生地址映射为：

    https://ollama.com/v1

以 /api 结尾的地址替换为 /v1；已经以 /v1 结尾的地址保持不变；其他自定义根地址追加 /v1。

## 模型目录

发现过程读取 /api/tags、去重原生 id，并通过 /api/show enrich 选中模型。原生元数据会提供 context length 及 vision、tools、thinking 能力，而 /v1/models 不提供这些信息。

保存的目录会转换成 pi-ai 聊天模型：

- vision 决定 text/image 输入模态；
- thinking 决定 reasoning 是否可用；
- 已知 Cloud 家族只暴露厂商真实档，并按模型设置 defaultEffort；
- 未知 thinking model 仍提供 off、low、medium、high、max，且不设插件默认；
- 发现到的 context length 决定 pi-ai 模型容量；
- 模型级或 route 级 maxTokens 成为请求默认；
- 不在已保存目录中的模型会被拒绝。

默认 fallback context window 是 262,144 tokens。正常情况下发现过程应该提供精确值；该 fallback 也会在元数据缺失时，为 pi-ai 的上下文安全余量留出空间。

## OpenAI compatibility profile

Adapter 会显式固定 Ollama 对应的 pi-ai compatibility，而不是依赖通用 endpoint 推断：

- 使用 max_tokens，不使用 max_completion_tokens；
- thinking model 发送 reasoning_effort；
- 请求 streaming usage；
- system message 保持 system role；
- 不发送 store 或 prompt_cache 字段。

Provider 签发的 OpenAI tool-call ID 会贯穿工具结果和 session log。旧私有原生 adapter 为聊天本地合成的 ID 不再用于新请求。

## 运行时两面

Host plugin 注册：

- OllamaAdapter route；
- llm-ollama 设置节；
- Ollama Web Search/Fetch provider；
- loopback-only 的模型发现/保存 RPC。

Client plugin 提供 Ollama Cloud 设置卡片和模型选择器。聊天协议迁移不会改变设置命名空间、凭据引用、provider id 和 picker 行为。

## Web 请求韧性

Search 和 Fetch 会在跟随 redirect 前拒绝。每次尝试都有可配置的 webRequestTimeoutMs 预算，默认 15 秒。一次瞬时超时或收到 HTTP 响应前的传输失败会重试；HTTP 错误、格式错误响应、缺失凭据、redirect 和调用方取消不会重试。

## 备选方案

不使用 OpenAI Responses，因为 Ollama 只支持 non-stateful 版本，而 DSH 已经管理历史。不使用 Anthropic Messages，因为 Ollama Cloud 需要额外 Bearer 认证，并且该兼容面没有模型列表或 prompt caching。在一个 route 下支持多个聊天协议会成倍增加 serializer、replay 和失败行为，但当前没有相应消费者。

## 已知限制

- 共享 PiAiAdapter 当前不支持 GenerateOptions.stop。
- Ollama 不会公开逐模型输出上限，因此 maxTokens 仍由部署配置。
- /api/show 会报告 thinking 能力，但不会报告精确的 effort 集合；插件应用 Ollama 文档中的通用规则和 GPT-OSS 例外。
- v0.2.2 及更早版本写入的旧日志可能包含重复 ollama-call-0；本次不会迁移它们。
