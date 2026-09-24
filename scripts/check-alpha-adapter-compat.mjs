#!/usr/bin/env node

/** Verify the built adapter provides the method called directly by an alpha2 Host. */
const adapterModule = await import(new URL('../lib/index.js', import.meta.url).href)
const Adapter = adapterModule.OllamaAdapter
if (typeof Adapter !== 'function') throw new Error('OllamaAdapter is not exported from lib/index.js')
if (!Object.hasOwn(Adapter.prototype, 'imageRequestPricing')) {
  throw new Error('OllamaAdapter must own imageRequestPricing')
}
const adapter = Object.create(Adapter.prototype)
const pricing = adapter.imageRequestPricing('ollama-cloud', 'gpt-oss:20b')
if (pricing !== undefined) throw new Error('neutral imageRequestPricing must return undefined')
console.log('OllamaAdapter alpha2 adapter compatibility passed')
