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

import { ReasoningEffortId } from '@deepseek-ai/dsh-llm'
import type { LlmResolvedModelInfo } from '@deepseek-ai/dsh-llm'
import type { ModelThinkingLevel, ThinkingLevelMap } from '@earendil-works/pi-ai'
import type { OllamaCatalogModelConfig } from './client-contract.ts'

const UNSUPPORTED = null

/** Pin every pi-ai level so an absent key is never guessed as supported. */
function pin(supported: Partial<Record<ModelThinkingLevel, string>>): ThinkingLevelMap {
  return {
    off: supported.off ?? UNSUPPORTED,
    minimal: supported.minimal ?? UNSUPPORTED,
    low: supported.low ?? UNSUPPORTED,
    medium: supported.medium ?? UNSUPPORTED,
    high: supported.high ?? UNSUPPORTED,
    xhigh: supported.xhigh ?? UNSUPPORTED,
    max: supported.max ?? UNSUPPORTED,
  }
}

const OFF_HIGH = pin({ off: 'none', high: 'high' })
const OFF_HIGH_MAX = pin({ off: 'none', high: 'high', max: 'max' })
const OFF_LOW_HIGH = pin({ off: 'none', low: 'low', high: 'high' })
const OFF_LOW_HIGH_MAX = pin({ off: 'none', low: 'low', high: 'high', max: 'max' })
const OFF_MEDIUM_HIGH = pin({ off: 'none', medium: 'medium', high: 'high' })
const LOW_MEDIUM_HIGH = pin({ low: 'low', medium: 'medium', high: 'high' })
const LOW_HIGH_MAX = pin({ low: 'low', high: 'high', max: 'max' })
const HIGH_ONLY = pin({ high: 'high' })
const GENERIC = pin({ off: 'none', low: 'low', medium: 'medium', high: 'high', max: 'max' })

/** Cloud families with documented real thinking controls. */
export type OllamaReasoningFamily =
  | 'glm-5.2'
  | 'glm-5.1'
  | 'deepseek-v4-pro'
  | 'deepseek-v4-flash'
  | 'gpt-oss'
  | 'gemma4'
  | 'nemotron-3-ultra'
  | 'nemotron-3-super'
  | 'nemotron-3-nano'
  | 'minimax-m3'
  | 'minimax-m2'
  | 'kimi-k2.7'
  | 'kimi-k3'
  | 'kimi-k2.6'
  | 'qwen3.5'
  | 'generic'

interface FamilyPolicy {
  levels: ThinkingLevelMap
  defaultEffort?: ModelThinkingLevel
}

const FAMILIES: Record<Exclude<OllamaReasoningFamily, 'generic'>, FamilyPolicy> = {
  'glm-5.2': { levels: OFF_HIGH_MAX, defaultEffort: 'max' },
  'glm-5.1': { levels: OFF_HIGH, defaultEffort: 'high' },
  'deepseek-v4-pro': { levels: OFF_LOW_HIGH_MAX, defaultEffort: 'high' },
  'deepseek-v4-flash': { levels: OFF_LOW_HIGH_MAX, defaultEffort: 'high' },
  'gpt-oss': { levels: LOW_MEDIUM_HIGH, defaultEffort: 'medium' },
  gemma4: { levels: OFF_HIGH, defaultEffort: 'high' },
  'nemotron-3-ultra': { levels: OFF_MEDIUM_HIGH, defaultEffort: 'medium' },
  'nemotron-3-super': { levels: OFF_LOW_HIGH, defaultEffort: 'low' },
  'nemotron-3-nano': { levels: OFF_LOW_HIGH, defaultEffort: 'low' },
  'minimax-m3': { levels: OFF_HIGH, defaultEffort: 'high' },
  'minimax-m2': { levels: HIGH_ONLY, defaultEffort: 'high' },
  'kimi-k2.7': { levels: HIGH_ONLY, defaultEffort: 'high' },
  'kimi-k3': { levels: LOW_HIGH_MAX, defaultEffort: 'max' },
  'kimi-k2.6': { levels: OFF_HIGH, defaultEffort: 'high' },
  'qwen3.5': { levels: OFF_HIGH, defaultEffort: 'high' },
}

/**
 * Strip a registry prefix so family matching sees the native Ollama id.
 * @param model - wire model id, possibly `registry/name:tag`.
 */
export function ollamaModelBasename(model: string): string {
  const slash = model.lastIndexOf('/')
  return slash === -1 ? model : model.slice(slash + 1)
}

function named(id: string, family: string): boolean {
  return id === family || id.startsWith(`${family}:`)
}

/**
 * Test whether Ollama documents the model family as low/medium/high-only.
 * @param model - Ollama wire model id.
 * @returns true for GPT-OSS ids, including registry-prefixed ids.
 */
export function isGptOssModel(model: string): boolean {
  return named(ollamaModelBasename(model).toLowerCase(), 'gpt-oss')
}

/**
 * Classify one catalog id into a documented Cloud family, or generic.
 * @param model - Ollama wire model id.
 */
export function ollamaReasoningFamily(model: string): OllamaReasoningFamily {
  const id = ollamaModelBasename(model).toLowerCase()
  if (named(id, 'gpt-oss')) return 'gpt-oss'
  if (named(id, 'glm-5.2')) return 'glm-5.2'
  if (named(id, 'glm-5.1')) return 'glm-5.1'
  if (named(id, 'deepseek-v4-pro')) return 'deepseek-v4-pro'
  if (named(id, 'deepseek-v4-flash')) return 'deepseek-v4-flash'
  if (named(id, 'gemma4')) return 'gemma4'
  if (named(id, 'nemotron-3-ultra')) return 'nemotron-3-ultra'
  if (named(id, 'nemotron-3-super')) return 'nemotron-3-super'
  if (named(id, 'nemotron-3-nano')) return 'nemotron-3-nano'
  if (named(id, 'minimax-m3')) return 'minimax-m3'
  if (id === 'minimax-m2' || id.startsWith('minimax-m2.') || id.startsWith('minimax-m2:')) return 'minimax-m2'
  if (id === 'kimi-k2.7' || id.startsWith('kimi-k2.7-') || id.startsWith('kimi-k2.7:')) return 'kimi-k2.7'
  if (id === 'kimi-k2.6' || id.startsWith('kimi-k2.6-') || id.startsWith('kimi-k2.6:')) return 'kimi-k2.6'
  if (named(id, 'kimi-k3')) return 'kimi-k3'
  if (named(id, 'qwen3.5')) return 'qwen3.5'
  return 'generic'
}

function policyFor(model: string): FamilyPolicy {
  const family = ollamaReasoningFamily(model)
  if (family === 'generic') return { levels: GENERIC }
  return FAMILIES[family]
}

/**
 * Thinking-level map for one catalog row, or undefined when thinking is off.
 * @param model - saved catalog entry.
 */
export function ollamaThinkingLevelMap(model: OllamaCatalogModelConfig): ThinkingLevelMap | undefined {
  if (model.thinking !== true) return undefined
  return policyFor(model.id).levels
}

/**
 * Plugin-owned default effort for a known Cloud family.
 * @param model - Ollama wire model id.
 * @returns a supported selector id, or undefined for unknown families.
 */
export function ollamaDefaultEffort(model: string): ModelThinkingLevel | undefined {
  return policyFor(model).defaultEffort
}

/**
 * Attach the family default to a resolved model when that level is offered.
 * @param info - descriptor from the delegated pi-ai adapter.
 * @param model - Ollama wire model id.
 */
export function applyOllamaReasoningMetadata(
  info: LlmResolvedModelInfo,
  model: string,
): LlmResolvedModelInfo {
  if (info.reasoning === undefined) return info
  const preferred = ollamaDefaultEffort(model)
  if (preferred === undefined) return info
  const defaultEffort = ReasoningEffortId(preferred)
  if (!info.reasoning.efforts.some(effort => effort.id === defaultEffort)) return info
  return {
    ...info,
    reasoning: { ...info.reasoning, defaultEffort },
  }
}
