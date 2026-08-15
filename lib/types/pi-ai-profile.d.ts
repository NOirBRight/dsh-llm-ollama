/**
 * Translate the plugin's Ollama-native connection facts into the pi-ai profile
 * used for OpenAI Chat Completions. The user-facing base URL remains the
 * native /api endpoint because discovery and Web capabilities use it; only
 * this profile switches chat to /v1.
 *
 * @module dsh-llm-ollama/pi-ai-profile
 */
import type { ResolvedPiAiProviderProfile } from '@deepseek-ai/dsh-llm-pi-ai';
import type { OllamaConnectionOptions } from './adapter.ts';
/** Safe output capability used when Ollama does not disclose one. */
export declare const OLLAMA_DEFAULT_MODEL_MAX_TOKENS = 32768;
/** Map the user-facing native Ollama base URL to the OpenAI-compatible chat base. */
export declare function openAICompatibleBaseURL(baseURL: string): string;
/** Resolve the complete pi-ai profile for one Ollama options snapshot. */
export declare function createOllamaPiAiProfile(connection: OllamaConnectionOptions): ResolvedPiAiProviderProfile;
//# sourceMappingURL=pi-ai-profile.d.ts.map