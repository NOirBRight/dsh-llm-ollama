/** Browser half: Ollama Cloud setup inside Plugin configuration. */
import type { Context as ClientContext } from '@deepseek-ai/cordis';
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
/** How long the Providers UI owner may take to register `settings.section` before the missing-owner diagnostic reports. */
export declare const MISSING_OWNER_GRACE_MS = 15000;
/** Register localized Ollama Cloud configuration under Plugin configuration. */
export declare function apply(ctx: ClientContext): void;
//# sourceMappingURL=index.d.ts.map