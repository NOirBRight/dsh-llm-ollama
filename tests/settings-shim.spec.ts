import { describe, expect, it } from 'vitest'
import type { SettingsScope, SettingsScopeSnapshot } from '../src/client/shim.ts'

describe('SettingsScope shim structural compatibility', () => {
  it('accepts published RC and alpha1 scope operations', () => {
    const snapshot: SettingsScopeSnapshot<string> = {
      status: 'ready', value: 'value', base: undefined, user: undefined,
      revision: 1, writable: true, mode: 'host',
    }
    const rcScope: SettingsScope<string> = {
      getSnapshot: () => snapshot,
      subscribe: () => () => {},
      set: async () => {},
      unset: async () => {},
    }
    const alphaScope: SettingsScope<string> = {
      ...rcScope,
      mutate: async () => {},
    }
    expect(rcScope.getSnapshot().value).toBe('value')
    expect(rcScope.mutate).toBeUndefined()
    expect(typeof alphaScope.mutate).toBe('function')
  })
})
