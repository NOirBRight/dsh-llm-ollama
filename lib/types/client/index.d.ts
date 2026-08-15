/** Browser half: Ollama Cloud setup inside Plugin configuration. */
import type { ClientContext } from '@deepseek-ai/dsh-client-runtime/client';
import type { OllamaSettingsKey } from './locales.ts';
declare module '@deepseek-ai/dsh-client-ui-slots' {
    interface LocaleNamespaceMap {
        /** Ollama Cloud Plugin configuration copy. */
        'settings.ollama-cloud': OllamaSettingsKey;
    }
}
/** Stable browser-plugin name. */
export declare const name = "dsh-llm-ollama-client";
/** Client services required by the Plugin configuration contribution. */
export declare const inject: string[];
/** Register localized Ollama Cloud configuration under Plugin configuration. */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map