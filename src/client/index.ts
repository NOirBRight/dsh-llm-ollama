/** Browser half: Ollama Cloud setup inside Plugin configuration. */

import type { ClientContext } from './shim.js'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { SettingsScope, SettingsScopeSnapshot } from './shim.js'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'
import {
  decodeOllamaCredentialStatus,
  decodeOllamaDiscoveryResult,
  decodeOllamaSettingsReadResult,
  decodeOllamaSaveResult,
  decodeOllamaUsageReply,
  DEFAULT_API_KEY_ENV,
  OLLAMA_CREDENTIAL_SET_ENDPOINT,
  OLLAMA_CREDENTIAL_STATUS_ENDPOINT,
  OLLAMA_DISCOVER_ENDPOINT,
  OLLAMA_RPC_CHANNEL,
  OLLAMA_SAVE_ENDPOINT,
  OLLAMA_SETTINGS_NAMESPACE,
  OLLAMA_SETTINGS_READ_ENDPOINT,
  OLLAMA_USAGE_ENDPOINT,
} from '../client-contract.ts'
import type { OllamaDiscoveryRequest, OllamaSettingsView } from '../client-contract.ts'
import { ensureProviderSection } from 'dsh-llm-providers-ui/client'
import { OllamaPluginCard } from './OllamaPluginCard.tsx'
import type { OllamaPluginCardFace } from './OllamaPluginCard.tsx'
import { OllamaModelPicker, OllamaModelPickerController } from './OllamaModelPicker.tsx'
import type { OllamaModelPickerFace } from './OllamaModelPicker.tsx'
import { en, zh } from './locales.ts'
import type { OllamaSettingsKey } from './locales.ts'


declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    'settings.provider.item': { kind: 'keyed'; scope: 'root' }
  }
}
declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Ollama Cloud Plugin configuration copy. */
    'settings.ollama-cloud': OllamaSettingsKey
  }
}

/** Stable browser-plugin name. */
export const name = 'dsh-llm-ollama-client'
/** Client services required by the Plugin configuration contribution. */
export const inject = ['slots', 'locale', 'connection']

/** Register localized Ollama Cloud configuration under Plugin configuration. */

export function apply(ctx: ClientContext): void {
  const localeNamespace = 'settings.ollama-cloud'
  ctx.effect(
    () => ctx.locale.register(localeNamespace, { zh, en }),
    'dsh-llm-ollama: Plugin configuration copy',
  )
  const t = ctx.locale.bind(localeNamespace) as OllamaPluginCardFace['t']
  const picker = new OllamaModelPickerController()
  // This dual-runtime package compiles Host and Client Context augmentations in
  // one project; the browser entry receives the client handle at runtime.
  const { rpc } = ctx.get('connection') as unknown as ConnectionHandle
  let currentSnapshot: SettingsScopeSnapshot<OllamaSettingsView> = { status: 'loading', value: undefined, base: undefined, user: undefined, revision: undefined, writable: false, mode: 'host' }
  const listeners = new Set<() => void>()
  const publish = (next: SettingsScopeSnapshot<OllamaSettingsView>): void => { currentSnapshot = next; for (const listener of listeners) listener() }
  const readManagement = async (): Promise<void> => {
    const result = await rpc.call(OLLAMA_RPC_CHANNEL, OLLAMA_SETTINGS_READ_ENDPOINT, {})
    if (!result.ok) { publish({ ...currentSnapshot, status: 'unavailable' }); throw new Error(result.error.message) }
    const decoded = decodeOllamaSettingsReadResult(result.value)
    if (decoded === undefined) { publish({ ...currentSnapshot, status: 'unavailable' }); throw new Error(t('requestFailed')) }
    publish({ status: 'ready', value: decoded.settings, base: undefined, user: undefined, revision: decoded.revision, writable: true, mode: 'host' })
  }
  const scope: SettingsScope<OllamaSettingsView> = {
    getSnapshot: () => currentSnapshot,
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener) } },
    set: async () => { throw new Error('settings are managed by the provider RPC') },
    unset: async () => { throw new Error('settings are managed by the provider RPC') },
  }
  void readManagement().catch(() => {})

  const describeCredential: OllamaPluginCardFace['describeCredential'] = async () => {
    const ref = scope.getSnapshot().value?.apiKeyEnv ?? DEFAULT_API_KEY_ENV
    const result = await rpc.call(OLLAMA_RPC_CHANNEL, OLLAMA_CREDENTIAL_STATUS_ENDPOINT, { ref })
    if (!result.ok) throw new Error(result.error.message)
    const status = decodeOllamaCredentialStatus(result.value)
    if (status === undefined) throw new Error(t('requestFailed'))
    return status
  }

  const saveConfiguration: OllamaPluginCardFace['saveConfiguration'] = async (settings) => {
    const snapshot = scope.getSnapshot()
    if (snapshot.revision === undefined) throw new Error(t('requestFailed'))
    const saved = await rpc.call(
      OLLAMA_RPC_CHANNEL,
      OLLAMA_SAVE_ENDPOINT,
      {
        baseURL: settings.baseURL,
        models: settings.models,
        expectedRevision: snapshot.revision,
      },
    )
    if (!saved.ok) throw new Error(saved.error.message)
    const accepted = decodeOllamaSaveResult(saved.value)
    if (accepted === undefined) throw new Error(t('requestFailed'))
    publish({ ...currentSnapshot, status: 'ready', value: accepted.settings, revision: accepted.revision })
    return accepted
  }

  const saveCredential: OllamaPluginCardFace['saveCredential'] = async (apiKey) => {
    const ref = scope.getSnapshot().value?.apiKeyEnv ?? DEFAULT_API_KEY_ENV
    const result = await rpc.call(OLLAMA_RPC_CHANNEL, OLLAMA_CREDENTIAL_SET_ENDPOINT, { ref, value: apiKey })
    if (!result.ok) throw new Error(result.error.message)
    const status = decodeOllamaCredentialStatus(result.value)
    if (status === undefined) throw new Error(t('requestFailed'))
  }

  const fetchUsage: OllamaPluginCardFace['fetchUsage'] = async (request: OllamaDiscoveryRequest) => {
    const result = await rpc.call(
      OLLAMA_RPC_CHANNEL,
      OLLAMA_USAGE_ENDPOINT,
      request,
    )
    if (!result.ok) {
      // A Host started before this package's usage endpoint exists answers
      // with its unknown-endpoint error; the card asks for a restart instead
      // of surfacing that as a read failure.
      if (result.error.message.startsWith('unknown Ollama Cloud endpoint')) {
        return { kind: 'needs-restart' as const }
      }
      throw new Error(result.error.message)
    }
    const reply = decodeOllamaUsageReply(result.value)
    if (reply === undefined) throw new Error('Ollama Cloud returned an invalid usage snapshot')
    return reply.status === 'ok'
      ? { kind: 'ok' as const, usage: reply.usage }
      : { kind: 'unsupported' as const }
  }

  const discoverModels: OllamaPluginCardFace['discoverModels'] = async (request: OllamaDiscoveryRequest) => {
    const result = await rpc.call(
      OLLAMA_RPC_CHANNEL,
      OLLAMA_DISCOVER_ENDPOINT,
      request,
    )
    if (!result.ok) throw new Error(result.error.message)
    const decoded = decodeOllamaDiscoveryResult(result.value)
    if (decoded === undefined) throw new Error('Ollama Cloud returned an invalid model catalog')
    return decoded.models
  }

  ctx.slots.inject('shell.overlay', () => ctx.slots.register({
    name: 'shell.overlay',
    id: 'ollama-cloud-model-picker',
    order: 100,
    inject: (): OllamaModelPickerFace => ({
      t,
      hooks: { ollamaModelPicker: picker },
      closePicker: picker.close,
      togglePickerModel: picker.toggle,
      adoptPickerModels: picker.adopt,
    }),
  }, OllamaModelPicker))

  ensureProviderSection(ctx)
  ctx.slots.inject('settings.provider.item', () => ctx.slots.register({
    name: 'settings.provider.item',
    key: OLLAMA_SETTINGS_NAMESPACE,
    locale: localeNamespace,
    inject: (): OllamaPluginCardFace => ({
      t,
      hooks: { ollamaSettings: scope },
      describeCredential,
      saveConfiguration,
      saveCredential,
      discoverModels,
      fetchUsage,
      beginModelPicker: (initiallyPicked, onAdopt) => { picker.begin(onAdopt, initiallyPicked) },
      completeModelPicker: candidates => { picker.complete(candidates) },
      failModelPicker: message => { picker.fail(message) },
      closeModelPicker: picker.close,
    }),
  }, OllamaPluginCard))
}
