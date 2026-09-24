/** Browser half: Ollama Cloud setup inside Plugin configuration. */

import type { JsonValue } from '@deepseek-ai/dsh-util-values'
import type { Context as ClientContext } from '@deepseek-ai/cordis'
import type { ConnectionHandle } from '@deepseek-ai/dsh-client-connection/client'
import type { ConfigForm } from '@deepseek-ai/dsh-client-ui-settings/client'
import type {} from '@deepseek-ai/dsh-api-remotes/client'
import type {} from '@deepseek-ai/dsh-client-ui-settings-plugins/client'
import type {} from '@deepseek-ai/dsh-client-ui-layout/client'
import type {} from '@deepseek-ai/dsh-client-ui-renderer/client'
import type {} from '@deepseek-ai/dsh-client-locale/client'
import type {} from '@deepseek-ai/dsh-client-ui-slots'

import {
  decodeOllamaCredentialStatus,
  decodeOllamaDiscoveryResult,
  decodeOllamaSettings,
  decodeOllamaUsageReply,
  OLLAMA_CREDENTIAL_SET_ENDPOINT,
  OLLAMA_CREDENTIAL_STATUS_ENDPOINT,
  OLLAMA_DISCOVER_ENDPOINT,
  OLLAMA_RPC_METHOD,
  OLLAMA_SETTINGS_NAMESPACE,
  OLLAMA_SETTINGS_VALIDATE_ENDPOINT,
  OLLAMA_USAGE_ENDPOINT,
} from '../client-contract.ts'
import type { OllamaDiscoveryRequest, OllamaSettingsView } from '../client-contract.ts'
import type {} from 'dsh-llm-providers-ui/client';
import { createOllamaUsageReader, dropPersistedUsageKeys } from 'dsh-llm-providers-ui/usage-readers';
import { OllamaPluginCard } from './OllamaPluginCard.tsx'
import type { OllamaPluginCardFace } from './OllamaPluginCard.tsx'
import { OllamaModelPicker, OllamaModelPickerController } from './OllamaModelPicker.tsx'
import type { OllamaModelPickerFace } from './OllamaModelPicker.tsx'
import { en, zh } from './locales.ts'
import type { OllamaSettingsKey } from './locales.ts'


declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface LocaleNamespaceMap {
    /** Ollama Cloud Plugin configuration copy. */
    'settings.ollama-cloud': OllamaSettingsKey
  }
}

/** Stable browser-plugin name. */
export const name = 'dsh-llm-ollama-client'
/** Client services required by the Plugin configuration contribution. */
export const inject = ['slots', 'locale', 'connection', 'configForms']

/** How long the Providers UI owner may take to register `settings.section` before the missing-owner diagnostic reports. */
export const MISSING_OWNER_GRACE_MS = 15_000

/** Register localized Ollama Cloud configuration under Plugin configuration. */

export function apply(ctx: ClientContext): void {

  const localeNamespace = 'settings.ollama-cloud'
  ctx.effect(
    () => ctx.locale.register(localeNamespace, { zh, en }),
    'dsh-llm-ollama: Plugin configuration copy',
  )
  const t = ctx.locale.bind(localeNamespace) as OllamaPluginCardFace['t']
  const picker = new OllamaModelPickerController()
  const account = { state: 'unknown' as 'connected' | 'configured' | 'unconnected' | 'unknown' }
  let accountEpoch = 0
  let closed = false
  const publishAccount = (state: typeof account.state): void => {
    if (closed || account.state === state) return
    account.state = state
    try { ctx.get('providerDirectory')?.update(OLLAMA_SETTINGS_NAMESPACE) } catch { /* providerDirectory is optional in lab */ }
  }
  const { rpc } = ctx.get('connection') as unknown as ConnectionHandle
  const settingsForm: ConfigForm<OllamaSettingsView> = ctx.configForms.get(OLLAMA_SETTINGS_NAMESPACE)
  const callOllamaRpc = (endpoint: string, payload: unknown, signal?: AbortSignal) =>
    rpc.call('/api', OLLAMA_RPC_METHOD, { endpoint, payload }, signal)

  const describeCredential: OllamaPluginCardFace['describeCredential'] = async () => {
    const epoch = accountEpoch
    const result = await callOllamaRpc(OLLAMA_CREDENTIAL_STATUS_ENDPOINT, {})
    if (!result.ok) throw new Error(result.error.message)
    const status = decodeOllamaCredentialStatus(result.value)
    if (status === undefined) throw new Error(t('requestFailed'))
    if (epoch === accountEpoch) publishAccount(status.configured ? 'configured' : 'unconnected')
    return status
  }
  ctx.effect(() => {
    void describeCredential().catch(() => { /* account remains unknown until a later card read */ })
    return () => { closed = true }
  }, 'dsh-llm-ollama: account snapshot')

  const saveConfiguration: OllamaPluginCardFace['saveConfiguration'] = async (settings) => {
    const snapshot = settingsForm.getSnapshot()
    if (snapshot.status !== 'ready' || snapshot.value === undefined || snapshot.revision === undefined) {
      throw new Error(t('requestFailed'))
    }
    if (!snapshot.writable) throw new Error(t('requestFailed'))
    const current = decodeOllamaSettings(snapshot.value)
    if (current === undefined) throw new Error(t('requestFailed'))
    const sameSettings = current.baseURL === settings.baseURL
      && JSON.stringify(current.models) === JSON.stringify(settings.models)
    if (sameSettings) return { settings: current, revision: snapshot.revision }

    const checked = await callOllamaRpc(OLLAMA_SETTINGS_VALIDATE_ENDPOINT, {
      baseURL: settings.baseURL,
      models: settings.models,
      expectedRevision: snapshot.revision,
    })
    if (!checked.ok) throw new Error(checked.error.message)
    const accepted = await settingsForm.mutate([
      { op: 'set', path: ['baseURL'], value: settings.baseURL },
      { op: 'set', path: ['models'], value: settings.models.map((model): JsonValue => ({
        id: model.id,
        ...model.name === undefined ? {} : { name: model.name },
        ...model.description === undefined ? {} : { description: model.description },
        ...model.contextWindow === undefined ? {} : { contextWindow: model.contextWindow },
        ...model.maxTokens === undefined ? {} : { maxTokens: model.maxTokens },
        ...model.vision === undefined ? {} : { vision: model.vision },
        ...model.thinking === undefined ? {} : { thinking: model.thinking },
        ...model.defaultEffort === undefined ? {} : { defaultEffort: model.defaultEffort },
        ...model.tools === undefined ? {} : { tools: model.tools },
      })) },
    ], snapshot.revision)
    if (!accepted) {
      const latest = settingsForm.getSnapshot()
      if (latest.revision !== undefined && latest.revision !== snapshot.revision) {
        throw new Error(
          `settings namespace "${OLLAMA_SETTINGS_NAMESPACE}" changed since it was read`
          + ` (expected revision ${snapshot.revision}, now ${latest.revision})`,
        )
      }
      throw new Error(t('requestFailed'))
    }
    const latest = settingsForm.getSnapshot()
    const saved = decodeOllamaSettings(latest.value)
    if (latest.revision === undefined || saved === undefined) throw new Error(t('requestFailed'))
    return { settings: saved, revision: latest.revision }
  }

  const saveCredential: OllamaPluginCardFace['saveCredential'] = async (apiKey) => {
    const result = await callOllamaRpc(OLLAMA_CREDENTIAL_SET_ENDPOINT, { value: apiKey })
    if (!result.ok) throw new Error(result.error.message)
    const status = decodeOllamaCredentialStatus(result.value)
    if (status === undefined) throw new Error(t('requestFailed'))
    dropPersistedUsageKeys([OLLAMA_SETTINGS_NAMESPACE])
    ctx.get('providerDirectory')?.invalidateUsage(OLLAMA_SETTINGS_NAMESPACE)
    accountEpoch += 1
    publishAccount(status.configured ? 'configured' : 'unconnected')
  }

  const fetchUsage: OllamaPluginCardFace['fetchUsage'] = async (request: OllamaDiscoveryRequest) => {
    const result = await callOllamaRpc(OLLAMA_USAGE_ENDPOINT, request)
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
    const result = await callOllamaRpc(OLLAMA_DISCOVER_ENDPOINT, request)
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
  ctx.slots.inject('settings.provider.item', () => ctx.slots.register({
    name: 'settings.provider.item',
    key: OLLAMA_SETTINGS_NAMESPACE,
    locale: localeNamespace,
    inject: (): OllamaPluginCardFace => ({
      t,
      hooks: { ollamaSettings: settingsForm },
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
  ctx.inject(['providerDirectory'], (ctx) => {
    ctx.effect(
      () => {
        const declaration = Object.assign({
          key: OLLAMA_SETTINGS_NAMESPACE,
          name: 'Ollama Cloud',
          role: 'llm' as const,
          header: 'shared' as const,
          detail: 'shared' as const,
          usage: createOllamaUsageReader(),
          modelCount: () => settingsForm.getSnapshot().value?.models?.length,
        }, {
          catalogId: 'ollama-cloud',
          account: () => ({ state: account.state }),
        })
        return ctx.providerDirectory.register(declaration as Parameters<typeof ctx.providerDirectory.register>[0])
      },
      'dsh-llm-ollama: provider directory',
    )
  })
  // Diagnostic when the Providers UI owner is not mounted (Web without dsh-llm-providers-ui).
  // The card is registered but the page will not appear; providers still work Host-side.
  ctx.effect(() => {
    let warned = false
    const hasProvidersSection = (): boolean =>
      ctx.slots.entries('settings.section').some(entry => (entry.options as { id?: string }).id === 'providers')
    const check = (): void => {
      if (!hasProvidersSection() && !warned) {
        warned = true
        console.warn('[dsh-llm-providers-ui] LLM Providers page missing for card llm-ollama: install dsh-llm-providers-ui to show the card. Host route remains active.')
      }
    }
    // The owner registers the section only once the settings snapshot has arrived and the page is
    // visible, so an immediate check always precedes that registration; the grace period covers it.
    const timer = setTimeout(check, MISSING_OWNER_GRACE_MS)
    const stop = ctx.slots.subscribe('settings.section', () => {
      if (warned || !hasProvidersSection()) return
      warned = true
      clearTimeout(timer)
    })
    return () => {
      clearTimeout(timer)
      stop()
    }
  }, 'dsh-llm-providers-ui: missing owner diagnostic')

}
