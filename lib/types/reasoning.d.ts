/**
 * Per-family Ollama Cloud thinking levels and plugin-owned defaults.
 *
 * `/api/show` only reports a thinking capability. Distinct effort budgets
 * come from vendor docs: an OpenAI-compatible endpoint accepting a string
 * is not treated as a real budget. Unknown thinking models keep the generic
 * five-level map and no `defaultEffort`.
 *
 * @module dsh-llm-ollama/reasoning
 */
import type { LlmResolvedModelInfo } from '@deepseek-ai/dsh-llm';
import type { ModelThinkingLevel, ThinkingLevelMap } from '@earendil-works/pi-ai';
import type { OllamaCatalogModelConfig } from './client-contract.ts';
/** Cloud families with documented real thinking controls. */
export type OllamaReasoningFamily = 'glm-5.2' | 'glm-5.1' | 'deepseek-v4-pro' | 'deepseek-v4-flash' | 'gpt-oss' | 'gemma4' | 'nemotron-3-ultra' | 'nemotron-3-super' | 'nemotron-3-nano' | 'minimax-m3' | 'minimax-m2' | 'kimi-k2.7' | 'kimi-k3' | 'kimi-k2.6' | 'qwen3.5' | 'generic';
/**
 * Strip a registry prefix so family matching sees the native Ollama id.
 * @param model - wire model id, possibly `registry/name:tag`.
 */
export declare function ollamaModelBasename(model: string): string;
/**
 * Test whether Ollama documents the model family as low/medium/high-only.
 * @param model - Ollama wire model id.
 * @returns true for GPT-OSS ids, including registry-prefixed ids.
 */
export declare function isGptOssModel(model: string): boolean;
/**
 * Classify one catalog id into a documented Cloud family, or generic.
 * @param model - Ollama wire model id.
 */
export declare function ollamaReasoningFamily(model: string): OllamaReasoningFamily;
/**
 * Thinking-level map for one catalog row, or undefined when thinking is off.
 * @param model - saved catalog entry.
 */
export declare function ollamaThinkingLevelMap(model: OllamaCatalogModelConfig): ThinkingLevelMap | undefined;
/**
 * Plugin-owned default effort for a known Cloud family.
 * @param model - Ollama wire model id.
 * @returns a supported selector id, or undefined for unknown families.
 */
export declare function ollamaDefaultEffort(model: string): ModelThinkingLevel | undefined;
/** Stable order for the Default thinking dropdown. */
export declare const OLLAMA_EFFORT_ORDER: readonly ["off", "low", "medium", "high", "xhigh", "max"];
/** Short labels for advertised Ollama reasoning levels. */
export declare const OLLAMA_EFFORT_LABELS: Readonly<Record<string, string>>;
/** Advertised thinking levels for one catalog row. */
export declare function effortsForOllamaModel(model: OllamaCatalogModelConfig): readonly string[];
/**
 * Attach the family or row default to a resolved model when that level is offered.
 * @param info - descriptor from the delegated pi-ai adapter.
 * @param model - Ollama wire model id.
 * @param override - optional saved row default.
 */
export declare function applyOllamaReasoningMetadata(info: LlmResolvedModelInfo, model: string, override?: string): LlmResolvedModelInfo;
//# sourceMappingURL=reasoning.d.ts.map