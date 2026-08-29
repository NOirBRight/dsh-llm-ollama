#!/usr/bin/env node

/** Verify the built adapter provides the method called directly by an alpha1 Host. */
const module = await import(new URL('../lib/index.js', import.meta.url).href)
const Adapter = module.OllamaAdapter
if (typeof Adapter !== 'function') throw new Error('OllamaAdapter is not exported from lib/index.js')
if (!Object.hasOwn(Adapter.prototype, 'imageRequestPricing')) {
  throw new Error('OllamaAdapter must own imageRequestPricing')
}
const adapter = Object.create(Adapter.prototype)
const pricing = adapter.imageRequestPricing('ollama-cloud', 'gpt-oss:20b')
if (pricing !== undefined) throw new Error('neutral imageRequestPricing must return undefined')
console.log('OllamaAdapter alpha1 adapter compatibility passed')
