// eslint-disable-next-line @typescript-eslint/no-unused-vars
export type ClientContext = import('@deepseek-ai/cordis').Context & { settingsScope: { bind<T>(spec: any): SettingsScope<T> }, locale: any, slots: any, get: (id: string) => any } & Record<string, any>;
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface SettingsScopeSnapshot<T> {
  status: 'loading' | 'ready' | 'unavailable';
  value: T | undefined;
  base: unknown;
  user: unknown;
  revision: number | undefined;
  writable: boolean;
  mode: 'host' | 'memory';
}
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export interface SettingsScope<T> {
  getSnapshot(): SettingsScopeSnapshot<T>;
  subscribe(listener: () => void): () => void;
  set(field: string, value: unknown): Promise<void>;
  unset(field: string): Promise<void>;
}
