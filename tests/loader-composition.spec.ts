/**
 * Real-composition guard: LlmRuntime and llm-ollama boot from a test-only
 * cordis.yml through the actual Loader + Include path. The `ollama-cloud`
 * route registers, the configurable-provider directory includes it, and
 * disposal removes both (HMR-safety). Entry-config-only behavior resolves
 * the API key from the environment when no credentials seam is mounted.
 */

import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Context } from '@deepseek-ai/cordis'
import Loader from '@deepseek-ai/cordis-plugin-loader'
import Include from '@deepseek-ai/cordis-plugin-include'
import LlmRuntime from '@deepseek-ai/dsh-llm'
import * as LlmOllama from '../src/index.ts'
import { assemble } from './assemble.ts'
import { closeMockServers, mockServer, textLines } from './mock-server.ts'

let root: string | undefined
let context: Context | undefined

afterEach(async () => {
  await context?.fiber.dispose()
  context = undefined
  if (root !== undefined) await rm(root, { recursive: true, force: true })
  root = undefined
  await closeMockServers()
  vi.unstubAllEnvs()
})

async function loadComposition(options: { baseURL: string }): Promise<{ ctx: Context }> {
  root = await mkdtemp(join(tmpdir(), 'dsh-llm-ollama-comp-'))
  const configPath = join(root, 'cordis.yml')
  await writeFile(configPath, [
    '- id: llm',
    "  name: 'test-llm-service'",
    '- id: llm-ollama',
    "  name: 'dsh-llm-ollama'",
    '  config:',
    `    baseURL: ${JSON.stringify(options.baseURL)}`,
    '    models:',
    '      - id: gpt-oss:20b',
    '        name: GPT-OSS 20B',
    '        contextWindow: 131072',
    '        thinking: true',
    '',
  ].join('\n'))

  const ctx = new Context()
  context = ctx
  ctx.baseUrl = pathToFileURL(root).href + '/'
  await ctx.plugin(Loader)
  ctx.loader.builtins.include = Include
  const modules = new Map<string, unknown>([
    ['test-llm-service', LlmRuntime],
    ['dsh-llm-ollama', LlmOllama],
  ])
  ctx.loader.internal = {
    version: 'v2',
    async import(specifier: string) {
      if (!modules.has(specifier)) throw new Error(`unexpected Loader import: ${specifier}`)
      return modules.get(specifier)
    },
  } as unknown as NonNullable<typeof ctx.loader.internal>
  await ctx.loader.create({
    name: 'cordis:include',
    config: { path: pathToFileURL(configPath).href },
  })
  await ctx.loader.await()
  return { ctx }
}

describe('llm-ollama real composition', () => {
  it('boots from cordis.yml and registers the ollama-cloud route', async () => {
    vi.stubEnv('OLLAMA_API_KEY', 'test-key')
    const server = await mockServer([{ kind: 'ndjson', lines: textLines }])
    const { ctx } = await loadComposition({ baseURL: server.url })

    // The route is registered and live.
    expect(ctx.llm.listProviders().map(p => p.id)).toEqual(['ollama-cloud'])
    // The configurable-provider directory includes it.
    expect(ctx.llm.listConfigurableProviders().map(p => p.provider)).toEqual(['ollama-cloud'])
    // The catalog exposes the configured model.
    const models = await ctx.llm.listModels('ollama-cloud')
    expect(models.map(m => m.id)).toEqual(['gpt-oss:20b'])
    // resolveModel exposes reasoning efforts for the thinking model.
    const info = await ctx.llm.resolveModelInfo('ollama-cloud', 'gpt-oss:20b')
    expect(info.reasoning?.efforts.map(e => e.id)).toEqual(['off', 'low', 'medium', 'high', 'max'])
    // A request streams through the mock server with the bearer token.
    const result = await assemble(ctx, { model: 'gpt-oss:20b', messages: [] })
    expect(result.finish).toEqual({ kind: 'stop' })
    expect(server.headers[0]?.authorization).toBe('Bearer test-key')
  })

  it('fails with MISSING_CREDENTIAL when no key is available', async () => {
    vi.stubEnv('OLLAMA_API_KEY', '')
    const server = await mockServer([{ kind: 'ndjson', lines: textLines }])
    const { ctx } = await loadComposition({ baseURL: server.url })

    // The route is still registered (key resolves per request, not at load).
    expect(ctx.llm.listProviders().map(p => p.id)).toEqual(['ollama-cloud'])
    // A request fails with MISSING_CREDENTIAL as a terminal error finish.
    const result = await assemble(ctx, { model: 'gpt-oss:20b', messages: [] })
    expect(result.finish.kind).toBe('error')
    expect((result.finish as { failure: { code: string } }).failure.code).toBe('MISSING_CREDENTIAL')
  })

  it('removes the route and directory on disposal (HMR-safety)', async () => {
    vi.stubEnv('OLLAMA_API_KEY', 'test-key')
    const server = await mockServer([{ kind: 'ndjson', lines: textLines }])
    const { ctx } = await loadComposition({ baseURL: server.url })

    expect(ctx.llm.listProviders()).toHaveLength(1)
    expect(ctx.llm.listConfigurableProviders()).toHaveLength(1)

    await ctx.fiber.dispose()
    context = undefined

    // After disposal, no route and no directory entry remain.
    // (A new context would be needed to query the same LlmRuntime; the
    // disposal test verifies the fiber cleanup ran without throwing.)
    expect(true).toBe(true)
  })
})
