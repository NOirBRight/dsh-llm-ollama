/**
 * Provide the auth services for the Ollama pi-ai adapter.
 *
 * Ollama resolves its API key through the request-local adapter hook, so this
 * process-local store starts empty and is only populated if a future login
 * flow writes a credential. Provider ambient auth is intentionally unavailable.
 *
 * @module dsh-llm-ollama/pi-ai-auth
 */
import type { AuthContext, CredentialStore } from '@earendil-works/pi-ai';
/**
 * Create the in-memory auth services used by Ollama's pi-ai adapter.
 *
 * @returns auth services with an empty credential store and no ambient sources.
 */
export declare function createOllamaPiAiAuth(): {
    credentials: CredentialStore;
    authContext: AuthContext;
};
//# sourceMappingURL=pi-ai-auth.d.ts.map