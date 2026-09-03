#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, lstatSync, mkdtempSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs'
import { basename, dirname, join, relative, resolve, sep } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)))
const FIXTURE_ROOT = join(ROOT, 'fixtures', 'alpha4')
const TARBALL_ROOT = join(FIXTURE_ROOT, 'tarballs')
const PROVENANCE_PATH = join(FIXTURE_ROOT, 'PROVENANCE.json')
const LOCKFILE_PATH = join(ROOT, 'pnpm-lock.yaml')
const PACKAGE_NAME = 'dsh-llm-ollama'
const ALPHA4_VERSION = '0.1.2-alpha.4'
const RC1_VERSION = '0.1.2-rc.1'
const ALPHA4_TAG = 'dsh-v0.1.2-alpha.4'
const ALPHA4_COMMIT = '4e84901e6471b79ec0338099867ebb4606d12bb5'
const OWNER_NAME = 'dsh-llm-providers-ui'
const OWNER_VERSION = '0.1.5'
const OWNER_RELEASE = 'https://github.com/NOirBRight/dsh-llm-providers-ui/releases/download/v0.1.5/dsh-llm-providers-ui-0.1.5.tgz'
const FROZEN_OWNER_FILE = 'dsh-llm-providers-ui-0.1.5-8835d6bb27fd637e071ccebf3a752425f2a0396f2489001a97bfbd54b1e3a7de.tgz'
const FROZEN_OWNER_SHA256 = '8835d6bb27fd637e071ccebf3a752425f2a0396f2489001a97bfbd54b1e3a7de'
const FROZEN_OWNER_BYTES = 34359
const INVALID_REGISTRY = 'http://127.0.0.1:9/'
const DEPENDENCY_SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']

function fail(message) {
  throw new Error('[dsh-llm-ollama pack gate] ' + message)
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'))
  } catch (error) {
    fail('could not read JSON ' + path + ': ' + String(error))
  }
}

function assertNoWorkspaceSpecifier(value, label) {
  if (typeof value === 'string' && value.startsWith('workspace:')) fail(label + ' contains a workspace dependency specifier')
  if (Array.isArray(value)) {
    value.forEach(item => assertNoWorkspaceSpecifier(item, label))
    return
  }
  if (value !== null && typeof value === 'object') {
    for (const item of Object.values(value)) assertNoWorkspaceSpecifier(item, label)
  }
}

const SAFE_ENV_NAMES = new Map([
  ['PATH', 'PATH'],
  ['HOME', 'HOME'],
  ['USER', 'USER'],
  ['LANG', 'LANG'],
  ['TMP', 'TMP'],
  ['TMPDIR', 'TMPDIR'],
  ['TEMP', 'TEMP'],
  ['CI', 'CI'],
  ['SYSTEMROOT', 'SystemRoot'],
  ['WINDIR', 'WINDIR'],
  ['USERPROFILE', 'USERPROFILE'],
  ['HOMEDRIVE', 'HOMEDRIVE'],
  ['HOMEPATH', 'HOMEPATH'],
])
const FORBIDDEN_ENV_NAME = /(?:KEY|SECRET|TOKEN|PASSWORD|CREDENTIAL|AUTH|CLOUD|(?:^|_)(?:NPM|PNPM|YARN|COREPACK)(?:_|$))/iu

function commandEnv(extra = {}, options = {}) {
  const child = {}
  const set = (name, value) => {
    if (!name || value === undefined) return
    if (FORBIDDEN_ENV_NAME.test(name)) return
    const canonical = SAFE_ENV_NAMES.get(name.toUpperCase())
    if (canonical === undefined) return
    child[canonical] = String(value)
  }
  for (const [name, value] of Object.entries(process.env)) set(name, value)
  for (const [name, value] of Object.entries(extra)) set(name, value)
  child.NODE_PATH = ''
  child.NODE_OPTIONS = ''
  const userconfig = options.userconfig ?? join(ROOT, '.pack-gate-userconfig')
  const globalconfig = options.globalconfig ?? join(dirname(userconfig), 'global.npmrc')
  child.npm_config_userconfig = userconfig
  child.npm_config_globalconfig = globalconfig
  if (options.registry !== undefined) child.npm_config_registry = options.registry
  if (options.storeDir !== undefined) child.npm_config_store_dir = options.storeDir
  return child
}

function assertEnvironmentIsolation(work) {
  const userconfig = join(work, 'negative-userconfig.npmrc')
  const globalconfig = join(work, 'negative-globalconfig.npmrc')
  const storeDir = join(work, 'negative-store')
  writeFileSync(userconfig, '')
  writeFileSync(globalconfig, '')
  mkdirSync(storeDir)
  const forbidden = [
    '',
    'API_KEY',
    'DSH_SECRET',
    'ACCESS_TOKEN',
    'USER_PASSWORD',
    'AWS_CREDENTIALS',
    'OAUTH_AUTH',
    'MODEL_CLOUD',
    'NPM_CONFIG_CACHE',
    'PNPM_HOME',
    'YARN_RC_FILENAME',
    'COREPACK_HOME',
  ]
  const source = [
    'const forbidden = ' + JSON.stringify(forbidden),
    "for (const name of forbidden) if (Object.hasOwn(process.env, name)) throw new Error('forbidden environment leaked: ' + JSON.stringify(name))",
    "if (process.env.NODE_PATH !== '' || process.env.NODE_OPTIONS !== '') throw new Error('Node environment was not emptied')",
    "if (process.env.npm_config_userconfig !== " + JSON.stringify(userconfig) + ") throw new Error('userconfig is not isolated')",
    "if (process.env.npm_config_globalconfig !== " + JSON.stringify(globalconfig) + ") throw new Error('globalconfig is not isolated')",
    "if (process.env.npm_config_registry !== " + JSON.stringify(INVALID_REGISTRY) + ") throw new Error('registry is not invalidated')",
    "if (process.env.npm_config_store_dir !== " + JSON.stringify(storeDir) + ") throw new Error('store is not isolated')",
  ].join(';')
  run(process.execPath, ['--input-type=module', '-e', source], {
    cwd: ROOT,
    env: Object.fromEntries(forbidden.map(name => [name, 'must-not-leak'])),
    userconfig,
    globalconfig,
    registry: INVALID_REGISTRY,
    storeDir,
  })
  console.log('negative subprocess environment isolation verified')
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: commandEnv(options.env ?? {}, options),
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
  const stdout = result.stdout ?? ''
  const stderr = result.stderr ?? ''
  const output = stdout + stderr
  if (result.error !== undefined) fail(command + ' failed to start: ' + String(result.error))
  if (result.status !== 0) fail(command + ' ' + args.join(' ') + ' failed (exit ' + String(result.status) + '): ' + output)
  return { stdout, stderr, output }
}

function assertNoInstallWarning(output, label) {
  if (/\b(?:warn|warning)\b/iu.test(output)) fail(label + ' emitted a warning: ' + output)
}

function runAsync(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, env: commandEnv(options.env ?? {}, options), stdio: ['ignore', 'pipe', 'pipe'] })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', chunk => { stdout += String(chunk) })
    child.stderr.on('data', chunk => { stderr += String(chunk) })
    child.once('error', reject)
    child.once('close', status => {
      const output = stdout + stderr
      if (status !== 0) reject(new Error(command + ' ' + args.join(' ') + ' failed (exit ' + String(status) + '): ' + output))
      else resolvePromise({ stdout, stderr, output })
    })
  })
}

function parseJsonArray(output, label) {
  for (let start = output.indexOf('['); start >= 0; start = output.indexOf('[', start + 1)) {
    try {
      const value = JSON.parse(output.slice(start))
      if (Array.isArray(value)) return value
    } catch {
      // The pack command can print a notice before its JSON report.
    }
  }
  fail(label + ' did not return a JSON array')
}

function archiveEntries(archive) {
  const listing = run('tar', ['-tzf', archive], { cwd: ROOT }).stdout
  const entries = listing.split(/\r?\n/).filter(Boolean)
  if (!entries.includes('package/package.json')) fail('archive has no package/package.json: ' + archive)
  for (const entry of entries) {
    if ((entry !== 'package' && entry !== 'package/' && !entry.startsWith('package/')) || entry.includes('\\0') || entry.split('/').includes('..')) fail('archive contains an unsafe entry: ' + archive + ' ' + entry)
  }
  return entries
}

function archiveManifest(archive) {
  archiveEntries(archive)
  return JSON.parse(run('tar', ['-xOzf', archive, 'package/package.json'], { cwd: ROOT }).stdout)
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex')
}

function sha512Integrity(bytes) {
  return 'sha512-' + createHash('sha512').update(bytes).digest('base64')
}

function safeTarget(target, label) {
  if (typeof target !== 'string' || target.startsWith('/') || target.includes('\\0')) fail(label + ' is not a relative target: ' + String(target))
  const value = target.startsWith('./') ? target.slice(2) : target
  if (value.length === 0 || value.includes('*') || value === '..' || value.startsWith('../') || value.includes('/../')) fail(label + ' escapes its package: ' + target)
  return value
}

function collectExportTargets(value, label, output = []) {
  if (typeof value === 'string') {
    output.push({ label, target: value })
    return output
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectExportTargets(item, label + '[' + String(index) + ']', output))
    return output
  }
  if (value !== null && typeof value === 'object') {
    for (const [key, item] of Object.entries(value)) collectExportTargets(item, label + '.' + key, output)
  }
  return output
}

function assertInside(root, path, label) {
  const base = resolve(root)
  const candidate = resolve(path)
  if (candidate !== base && !candidate.startsWith(base + sep)) fail(label + ' leaves its package: ' + path)
  return candidate
}

function assertPackageLayout(manifest, packedFiles, packageRoot, label) {
  const files = new Set(packedFiles.map(path => String(path).replaceAll('\\', '/').replace(/^package\//u, '').replace(/^\.\//u, '')))
  const targets = collectExportTargets(manifest.exports, 'exports')
  if (typeof manifest.main === 'string') targets.push({ label: 'main', target: manifest.main })
  if (typeof manifest.types === 'string') targets.push({ label: 'types', target: manifest.types })
  for (const entry of targets) {
    const path = safeTarget(entry.target, label + ' ' + entry.label)
    if (!files.has(path)) fail(label + ' pack omits ' + entry.label + ' target ' + path)
    const diskPath = assertInside(packageRoot, join(packageRoot, path), label + ' ' + entry.label)
    if (!existsSync(diskPath) || lstatSync(diskPath).isDirectory()) fail(label + ' lacks file target ' + path)
  }
}

function walkFiles(root) {
  const files = []
  const visit = directory => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) visit(path)
      else if (entry.isFile()) files.push(path)
      else fail('symlink or special file in package: ' + path)
    }
  }
  visit(root)
  return files
}

function packageName(specifier) {
  return specifier.startsWith('@') ? specifier.split('/').slice(0, 2).join('/') : specifier.split('/')[0]
}

function resolveRelativeImport(file, specifier, packageRoot) {
  const base = assertInside(packageRoot, join(dirname(file), specifier), 'relative import')
  const candidates = [base, base + '.js', base + '.mjs', base + '.cjs', join(base, 'index.js')]
  const found = candidates.find(path => existsSync(path) && lstatSync(path).isFile())
  if (found === undefined) fail('packed relative import is missing: ' + relative(packageRoot, file) + ' -> ' + specifier)
  return found
}

function assertStaticClosure(packageRoot, manifest, label) {
  const declared = new Set([...Object.keys(manifest.dependencies ?? {}), ...Object.keys(manifest.peerDependencies ?? {}), ...Object.keys(manifest.optionalDependencies ?? {})])
  const files = walkFiles(join(packageRoot, 'lib')).filter(path => /\.(?:js|mjs|cjs)$/u.test(path))
  if (files.length === 0) fail(label + ' has no packed JavaScript')
  const visited = new Set()
  const scan = file => {
    if (visited.has(file)) return
    visited.add(file)
    const source = readFileSync(file, 'utf8')
    const imports = /\\bfrom\\s*(['"])([^'"]+)\\1|\\brequire\\s*\\(\\s*(['"])([^'"]+)\\3\\s*\\)|\\bimport\\s*\\(\\s*(['"])([^'"]+)\\5\\s*\\)|\\bimport\\s*(['"])([^'"]+)\\7/g
    let match
    while ((match = imports.exec(source)) !== null) {
      const specifier = match[2] ?? match[4] ?? match[6] ?? match[8]
      if (specifier.startsWith('.')) {
        scan(resolveRelativeImport(file, specifier, packageRoot))
        continue
      }
      if (specifier.startsWith('/') || specifier.startsWith('file:')) fail(label + ' contains a file-system import: ' + specifier)
      if (specifier.startsWith('node:')) continue
      if (specifier.includes('/src/') || specifier.includes('/source/')) fail(label + ' imports a source-plane path: ' + specifier)
      const name = packageName(specifier)
      if (name === OWNER_NAME) fail(label + ' retains a Providers UI runtime import: ' + specifier)
      if (!declared.has(name)) fail(label + ' contains undeclared runtime import: ' + specifier)
    }
  }
  files.forEach(scan)
}

function verifySourceMigration(manifest) {
  for (const section of DEPENDENCY_SECTIONS) {
    for (const [name, spec] of Object.entries(manifest[section] ?? {})) {
      if (typeof spec !== 'string') fail(section + ' entry is not a string: ' + name)
      if (section === 'devDependencies' && name === OWNER_NAME
        && (spec === 'file:../dsh-llm-providers-ui/dsh-llm-providers-ui-0.1.5.tgz'
          || spec === 'file:../dsh-llm-providers-ui/fixtures/alpha4/tarballs/dsh-llm-providers-ui-0.1.5.tgz'
          || spec === OWNER_RELEASE)) continue
      if (/^(?:file:|link:|workspace:|npm:|github:|git\+|https?:|\/|\.\.?[\/]|~[\/])/iu.test(spec)) fail(section + ' uses a path or VCS source: ' + name + ' ' + spec)
    }
  }
  for (const section of ['dependencies', 'peerDependencies', 'optionalDependencies']) {
    for (const name of Object.keys(manifest[section] ?? {})) {
      if (name.startsWith('@deepseek-ai/dsh-') && manifest[section][name] !== ALPHA4_VERSION && !(satisfiesRange(ALPHA4_VERSION, manifest[section][name]) && satisfiesRange(RC1_VERSION, manifest[section][name]))) fail(name + ' must include both Alpha.4 and rc.1')
    }
  }
  if (manifest.devDependencies?.[OWNER_NAME] !== 'file:../dsh-llm-providers-ui/dsh-llm-providers-ui-0.1.5.tgz'
    && manifest.devDependencies?.[OWNER_NAME] !== 'file:../dsh-llm-providers-ui/fixtures/alpha4/tarballs/dsh-llm-providers-ui-0.1.5.tgz'
    && manifest.devDependencies?.[OWNER_NAME] !== OWNER_RELEASE) fail('Providers UI must use the pinned Alpha.4 development tarball')
  if (manifest.dependencies?.[OWNER_NAME] !== undefined || manifest.peerDependencies?.[OWNER_NAME] !== undefined) fail('Providers UI must not be a runtime or peer dependency')
  const card = readFileSync(join(ROOT, 'src/client/OllamaPluginCard.tsx'), 'utf8')
  if (!card.includes("from 'dsh-llm-providers-ui/sortable'")) fail('client does not import the public sortable subpath')
  const tsdown = readFileSync(join(ROOT, 'tsdown.config.ts'), 'utf8')
  if (!tsdown.includes("'dsh-llm-providers-ui/sortable'") || !/alwaysBundle\s*:/u.test(tsdown)) fail('tsdown does not bundle the sortable owner code')
  const adapter = readFileSync(join(ROOT, 'src/adapter.ts'), 'utf8')
  if (!adapter.includes('delegate.prepareCall(provider, model, signal)')) fail('adapter does not delegate prepareCall with the alpha.4 signature')
  const discovery = readFileSync(join(ROOT, 'src/discovery.ts'), 'utf8')
  if (discovery.includes('request.signal') || !discovery.includes('signal?: AbortSignal')) fail('discovery callback signal contract is not preserved')
  if (JSON.stringify(manifest.exports).includes('"./src/*"')) fail('package exports source files')
}

function parseVersion(value) {
  const match = String(value).trim().match(/^(\d+)(?:\.(\d+|x|\*))?(?:\.(\d+|x|\*))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/u)
  if (match === null) return undefined
  const minor = match[2] === undefined || match[2] === 'x' || match[2] === '*' ? undefined : Number(match[2])
  const patch = match[3] === undefined || match[3] === 'x' || match[3] === '*' ? undefined : Number(match[3])
  return { major: Number(match[1]), minor, patch, prerelease: match[4] }
}

function compareVersions(left, right) {
  const a = parseVersion(left)
  const b = parseVersion(right)
  if (a === undefined || b === undefined) return 0
  for (const key of ['major', 'minor', 'patch']) {
    const leftValue = a[key] ?? 0
    const rightValue = b[key] ?? 0
    if (leftValue !== rightValue) return leftValue - rightValue
  }
  if (a.prerelease === b.prerelease) return 0
  if (a.prerelease === undefined) return 1
  if (b.prerelease === undefined) return -1
  const leftParts = a.prerelease.split('.')
  const rightParts = b.prerelease.split('.')
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index++) {
    const leftPart = leftParts[index]
    const rightPart = rightParts[index]
    if (leftPart === undefined) return -1
    if (rightPart === undefined) return 1
    if (leftPart === rightPart) continue
    const leftNumber = /^\d+$/u.test(leftPart) ? Number(leftPart) : undefined
    const rightNumber = /^\d+$/u.test(rightPart) ? Number(rightPart) : undefined
    if (leftNumber !== undefined && rightNumber !== undefined) return leftNumber - rightNumber
    if (leftNumber !== undefined) return -1
    if (rightNumber !== undefined) return 1
    return leftPart < rightPart ? -1 : 1
  }
  return 0
}

function compareToTuple(version, tuple) {
  const parsed = parseVersion(version)
  if (parsed === undefined) return 0
  return compareVersions(version, String(tuple[0]) + '.' + String(tuple[1]) + '.' + String(tuple[2]))
}

function rangeTokens(range) {
  const tokens = String(range).trim().split(/\s+/u).filter(Boolean)
  const result = []
  for (let index = 0; index < tokens.length; index++) {
    if (/^(?:>=|<=|>|<|=)$/u.test(tokens[index]) && tokens[index + 1] !== undefined) result.push(tokens[index] + tokens[++index])
    else result.push(tokens[index])
  }
  return result
}

function satisfiesRange(version, range) {
  const text = String(range).trim()
  if (text === '' || text === '*' || text === 'latest') return true
  return text.split(/\s*\|\|\s*/u).some(part => {
    const value = part.trim()
    if (value === '') return true
    if (value.startsWith('^') || value.startsWith('~')) {
      const base = parseVersion(value.slice(1))
      if (base === undefined) return false
      const lower = String(base.major) + '.' + String(base.minor ?? 0) + '.' + String(base.patch ?? 0) + (base.prerelease === undefined ? '' : '-' + base.prerelease)
      let upper
      if (value.startsWith('~')) upper = base.minor === undefined ? [base.major + 1, 0, 0] : [base.major, base.minor + 1, 0]
      else if (base.major > 0) upper = [base.major + 1, 0, 0]
      else if ((base.minor ?? 0) > 0) upper = [0, (base.minor ?? 0) + 1, 0]
      else upper = [0, 0, (base.patch ?? 0) + 1]
      return compareVersions(version, lower) >= 0 && compareToTuple(version, upper) < 0
    }
    const tokens = rangeTokens(value)
    if (tokens.length === 1 && tokens[0].includes('-') && tokens[0].split('-').length === 3) {
      const [lower, upper] = tokens[0].split('-').map(item => item.trim())
      return compareVersions(version, lower) >= 0 && compareVersions(version, upper) <= 0
    }
    let sawComparator = false
    let valid = true
    for (const token of tokens) {
      const match = token.match(/^(>=|<=|>|<|=)?(.+)$/u)
      if (match === null) { valid = false; break }
      const comparator = match[1] ?? ''
      const target = parseVersion(match[2])
      if (target === undefined) { valid = false; break }
      if (target.minor === undefined || target.patch === undefined) {
        if (comparator !== '') {
          sawComparator = true
          const lower = String(target.major) + '.' + String(target.minor ?? 0) + '.' + String(target.patch ?? 0)
          const comparison = compareVersions(version, lower)
          if (comparator === '>=' && comparison < 0) valid = false
          if (comparator === '>' && comparison <= 0) valid = false
          if (comparator === '<=' && comparison > 0) valid = false
          if (comparator === '<' && comparison >= 0) valid = false
          continue
        }
        const candidate = parseVersion(version)
        if (candidate === undefined || candidate.major !== target.major || (target.minor !== undefined && candidate.minor !== target.minor) || (target.patch !== undefined && candidate.patch !== target.patch)) valid = false
        continue
      }
      const comparison = compareVersions(version, match[2])
      if (comparator === '') { if (comparison !== 0) valid = false } else { sawComparator = true; if (comparator === '>=' && comparison < 0) valid = false; if (comparator === '>' && comparison <= 0) valid = false; if (comparator === '<=' && comparison > 0) valid = false; if (comparator === '<' && comparison >= 0) valid = false; if (comparator === '=' && comparison !== 0) valid = false }
    }
    return valid && (sawComparator || tokens.length > 0)
  })
}

function dependencyTarget(name, spec) {
  const text = String(spec)
  if (!text.startsWith('npm:')) return { name, range: text }
  const alias = text.slice('npm:'.length)
  const separator = alias.lastIndexOf('@')
  if (separator <= 0) return { name: alias, range: '*' }
  return { name: alias.slice(0, separator), range: alias.slice(separator + 1) }
}

function findStaticDependency(byIdentity, parent, name, spec) {
  const target = dependencyTarget(name, spec)
  const candidates = [...byIdentity.values()].filter(item => item.manifest.name === target.name)
  if (String(spec).startsWith('workspace:')) {
    if (target.name.startsWith('@deepseek-ai/dsh-')) return byIdentity.get(target.name + '@' + ALPHA4_VERSION)
    return candidates[0]
  }
  return candidates.find(item => satisfiesRange(item.manifest.version, target.range))
}

function edgeKey(parent, section, name, spec) {
  return parent + ' -> ' + section + ' ' + name + '@' + String(spec)
}

function readOptionalPlatformGaps(provenance, byIdentity) {
  const gaps = provenance.graph?.optionalPlatformGaps
  if (!Array.isArray(gaps)) fail('provenance has no explicit optional platform gap list')
  const declared = new Map()
  for (const gap of gaps) {
    if (gap === null || typeof gap !== 'object') fail('optional platform gap is not an object')
    if (gap.platform !== 'native' || typeof gap.reason !== 'string' || gap.reason.trim() === '') fail('optional platform gap lacks native platform reason')
    if (typeof gap.parent !== 'string' || typeof gap.section !== 'string' || typeof gap.name !== 'string' || typeof gap.spec !== 'string') fail('optional platform gap has invalid edge fields')
    if (gap.section !== 'optionalDependencies' && gap.section !== 'peerDependencies') fail('optional platform gap uses a non-optional dependency section: ' + gap.section)
    const parent = byIdentity.get(gap.parent)?.manifest
    if (parent === undefined) fail('optional platform gap names a missing parent: ' + gap.parent)
    const actualSpec = parent[gap.section]?.[gap.name]
    if (actualSpec !== gap.spec) fail('optional platform gap does not match its parent manifest: ' + edgeKey(gap.parent, gap.section, gap.name, gap.spec))
    const optional = gap.section === 'optionalDependencies' || parent.peerDependenciesMeta?.[gap.name]?.optional === true
    if (!optional) fail('optional platform gap is not optional: ' + edgeKey(gap.parent, gap.section, gap.name, gap.spec))
    const key = edgeKey(gap.parent, gap.section, gap.name, gap.spec)
    if (declared.has(key)) fail('duplicate optional platform gap: ' + key)
    declared.set(key, gap)
  }
  return declared
}

function checkProvenance() {
  const provenance = readJson(PROVENANCE_PATH)
  if (provenance.source?.repository !== 'https://github.com/deepseek-ai/deepseek-harness.git') fail('provenance repository is not DeepSeek Harness')
  if (provenance.source?.tag !== ALPHA4_TAG || provenance.source?.commit !== ALPHA4_COMMIT || provenance.source?.packagesBuiltFromThisCheckout !== true) fail('provenance does not identify the exact clean alpha.4 source')
  const ownerPin = provenance.ownerArtifact
  if (ownerPin?.package !== OWNER_NAME
    || ownerPin?.version !== OWNER_VERSION
    || ownerPin?.file !== FROZEN_OWNER_FILE
    || ownerPin?.bytes !== FROZEN_OWNER_BYTES
    || ownerPin?.sha256 !== FROZEN_OWNER_SHA256) {
    fail('provenance does not pin the frozen Providers UI owner artifact')
  }
  const lock = readFileSync(LOCKFILE_PATH, 'utf8')
  const lockPin = [
    'frozenOwner:',
    '  package: ' + OWNER_NAME,
    '  version: ' + OWNER_VERSION,
    '  file: ' + FROZEN_OWNER_FILE,
    '  bytes: ' + String(FROZEN_OWNER_BYTES),
    '  sha256: ' + FROZEN_OWNER_SHA256,
  ].join('\n')
  if (!lock.includes(lockPin)) fail('lockfile does not pin the frozen Providers UI owner artifact')
  const files = readdirSync(TARBALL_ROOT).filter(file => file.endsWith('.tgz')).sort()
  const records = provenance.tarballs
  if (records === null || typeof records !== 'object') fail('provenance has no tarball records')
  const recordNames = Object.keys(records).sort()
  if (JSON.stringify(files) !== JSON.stringify(recordNames)) fail('provenance archive list differs from fixtures')
  const byIdentity = new Map()
  for (const file of files) {
    const record = records[file]
    const archive = join(TARBALL_ROOT, file)
    const bytes = readFileSync(archive)
    const manifest = archiveManifest(archive)
    assertNoWorkspaceSpecifier(manifest, file + ' package.json')
    if (record.package !== manifest.name || record.version !== manifest.version || record.bytes !== bytes.length || record.sha256 !== sha256(bytes)) fail('provenance bytes or identity mismatch: ' + file)
    if (!['clean-alpha4', 'clean-alpha4-third-party', 'registry', 'frozen-owner'].includes(record.source)) fail('provenance source is not static: ' + file)
    const id = manifest.name + '@' + manifest.version
    if (byIdentity.has(id)) fail('duplicate fixture identity: ' + id)
    byIdentity.set(id, { file, manifest, record })
    if (manifest.name.startsWith('@deepseek-ai/dsh-')) {
      if (manifest.version !== ALPHA4_VERSION || record.source !== 'clean-alpha4') fail('non-alpha official fixture: ' + id)
    }
  }
  const official = [...byIdentity.values()].filter(item => item.record.source === 'clean-alpha4').map(item => item.manifest.name).sort()
  const listedOfficial = [...(provenance.graph?.officialAlpha4Packages ?? [])].sort()
  if (JSON.stringify(official) !== JSON.stringify(listedOfficial)) fail('provenance official package graph is stale')
  const versions = new Map()
  for (const item of byIdentity.values()) {
    const list = versions.get(item.manifest.name) ?? []
    list.push(item.manifest.version)
    versions.set(item.manifest.name, list)
  }
  const actualMulti = Object.fromEntries([...versions]
    .filter(([, list]) => new Set(list).size > 1)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, list]) => [name, [...new Set(list)].sort()]))
  if (JSON.stringify(actualMulti) !== JSON.stringify(provenance.graph?.multiVersionPackages ?? {})) fail('provenance multi-version graph is stale')
  if (Object.keys(actualMulti).length === 0) fail('fixture graph has no multi-version third-party package')
  for (const [name, list] of Object.entries(actualMulti)) {
    if (name.startsWith('@deepseek-ai/dsh-')) fail('official alpha package has multiple versions: ' + name)
    if (!list.every(version => byIdentity.has(name + '@' + version))) fail('multi-version graph names a missing archive: ' + name)
  }
  const declaredGaps = readOptionalPlatformGaps(provenance, byIdentity)
  const reachable = new Set()
  const walk = manifest => {
    for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
      for (const [name, spec] of Object.entries(manifest[section] ?? {})) {
        const candidate = findStaticDependency(byIdentity, manifest.name + '@' + manifest.version, name, spec)
        if (candidate === undefined) continue
        const id = candidate.manifest.name + '@' + candidate.manifest.version
        if (reachable.has(id)) continue
        reachable.add(id)
        walk(candidate.manifest)
      }
    }
  }
  walk(readJson(join(ROOT, 'package.json')))
  const ownerRecord = [...byIdentity.values()].find(item => item.manifest.name === OWNER_NAME && item.manifest.version === OWNER_VERSION)
  if (ownerRecord !== undefined) walk(ownerRecord.manifest)
  const relevantGaps = new Map([...declaredGaps].filter(([key]) => reachable.has(key.split(' -> ', 1)[0])))
  const observedGaps = new Set()
  const nonOptionalMissing = []
  const undeclaredOptionalMissing = []
  for (const item of [...byIdentity.values()].filter(item => reachable.has(item.manifest.name + '@' + item.manifest.version))) {
    for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
      for (const [name, spec] of Object.entries(item.manifest[section] ?? {})) {
        const parent = item.manifest.name + '@' + item.manifest.version
        const optional = section === 'optionalDependencies' || section === 'peerDependencies' && item.manifest.peerDependenciesMeta?.[name]?.optional === true
        const key = edgeKey(parent, section, name, spec)
        const candidate = findStaticDependency(byIdentity, parent, name, spec)
        if (candidate === undefined) {
          if (optional && relevantGaps.has(key)) observedGaps.add(key)
          else if (optional) undeclaredOptionalMissing.push(key)
          else nonOptionalMissing.push(key)
          continue
        }
        if (relevantGaps.has(key)) fail('declared optional platform gap has an available archive: ' + key)
        if (String(spec).startsWith('workspace:') && name.startsWith('@deepseek-ai/dsh-') && candidate.manifest.version !== ALPHA4_VERSION) fail('workspace dependency is not alpha.4: ' + parent + ' -> ' + name + '@' + candidate.manifest.version)
      }
    }
  }
  if (nonOptionalMissing.length > 0) fail('nonoptional missing versioned edges: ' + nonOptionalMissing.join('; '))
  if (undeclaredOptionalMissing.length > 0) fail('optional edge is not an explicit platform gap: ' + undeclaredOptionalMissing.join('; '))
  const staleGaps = [...relevantGaps.keys()].filter(key => !observedGaps.has(key))
  if (staleGaps.length > 0) fail('declared optional platform gaps are not missing: ' + staleGaps.join('; '))
  console.log('static fixture provenance verified: ' + files.length + ' archives, ' + official.length + ' clean alpha.4 packages')
  console.log('zero nonoptional missing versioned edges; optional platform gaps documented: ' + String(observedGaps.size))
  return { provenance, byIdentity, optionalPlatformGaps: relevantGaps }
}


function verifyOwnerArtifact(work) {
  const artifactPath = process.env.DSH_LLM_PROVIDERS_UI_ARTIFACT ?? process.env.DSH_PROVIDERS_UI_ARTIFACT ?? join(TARBALL_ROOT, FROZEN_OWNER_FILE)
  const expectedSha = process.env.DSH_LLM_PROVIDERS_UI_SHA256 ?? process.env.DSH_PROVIDERS_UI_SHA256 ?? FROZEN_OWNER_SHA256
  if (process.env.DSH_LLM_PROVIDERS_UI_ARTIFACT !== undefined
    && process.env.DSH_PROVIDERS_UI_ARTIFACT !== undefined
    && process.env.DSH_LLM_PROVIDERS_UI_ARTIFACT !== process.env.DSH_PROVIDERS_UI_ARTIFACT) {
    fail('owner artifact environment variables disagree')
  }
  if (process.env.DSH_LLM_PROVIDERS_UI_SHA256 !== undefined
    && process.env.DSH_PROVIDERS_UI_SHA256 !== undefined
    && process.env.DSH_LLM_PROVIDERS_UI_SHA256 !== process.env.DSH_PROVIDERS_UI_SHA256) {
    fail('owner SHA environment variables disagree')
  }
  const artifact = resolve(artifactPath)
  if (!existsSync(artifact) || !lstatSync(artifact).isFile() || lstatSync(artifact).isSymbolicLink()) fail('Providers UI artifact must be a regular file: ' + artifact)
  if (!/^[a-f0-9]{64}$/iu.test(expectedSha)) fail('Providers UI SHA-256 must be 64 hexadecimal characters')
  if (expectedSha.toLowerCase() !== FROZEN_OWNER_SHA256) fail('Providers UI SHA-256 is not the frozen owner pin')
  if (basename(artifact) !== FROZEN_OWNER_FILE) fail('Providers UI artifact is not the frozen owner archive: ' + artifact)
  const bytes = readFileSync(artifact)
  if (bytes.length !== FROZEN_OWNER_BYTES) fail('Providers UI artifact byte count differs from the frozen owner pin')
  const actualSha = sha256(bytes)
  if (actualSha !== FROZEN_OWNER_SHA256) fail('Providers UI SHA-256 mismatch: expected ' + FROZEN_OWNER_SHA256 + ', got ' + actualSha)
  const manifest = archiveManifest(artifact)
  assertNoWorkspaceSpecifier(manifest, 'Providers UI package.json')
  if (manifest.name !== OWNER_NAME || manifest.version !== OWNER_VERSION) fail('Providers UI artifact is not ' + OWNER_NAME + '@' + OWNER_VERSION)
  const entryFiles = archiveEntries(artifact).map(path => path.replace(/^package\//u, '').replace(/\/$/u, ''))
  for (const target of [manifest.main, manifest.types, manifest.exports?.['./sortable']?.default ?? manifest.exports?.['./sortable']]) {
    const path = safeTarget(target, 'Providers UI export')
    if (!entryFiles.includes(path)) fail('Providers UI artifact omits ' + path)
  }
  console.log('Providers UI artifact verified: sha256=' + actualSha)
  return { artifact, manifest, integrity: sha512Integrity(bytes) }
}

function targetPack(work, manifest) {
  const userconfig = join(work, 'target-userconfig.npmrc')
  const globalconfig = join(work, 'target-globalconfig.npmrc')
  const storeDir = join(work, 'target-store')
  writeFileSync(userconfig, '')
  writeFileSync(globalconfig, '')
  mkdirSync(storeDir)
  const packageManager = { cwd: ROOT, userconfig, globalconfig, registry: INVALID_REGISTRY, storeDir }
  const dry = run('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], packageManager)
  const dryReport = parseJsonArray(dry.output, 'npm pack dry run')[0]
  if (dryReport === undefined || !Array.isArray(dryReport.files)) fail('npm pack dry run returned no file list')
  const dryFiles = dryReport.files.map(entry => entry.path).filter(path => typeof path === 'string')
  assertPackageLayout(manifest, dryFiles, ROOT, 'source package')
  if (dryFiles.some(path => /^(?:src|tests|scripts|node_modules)\//u.test(String(path).replace(/^package\//u, '')))) fail('pack includes source, test, script, or installed files')
  const output = join(work, 'target-pack')
  mkdirSync(output)
  const packed = run('npm', ['pack', '--json', '--pack-destination', output, '--ignore-scripts'], packageManager)
  const report = parseJsonArray(packed.output, 'npm pack')[0]
  if (report === undefined || typeof report.filename !== 'string') fail('npm pack returned no archive report')
  const archive = join(output, basename(report.filename))
  if (!existsSync(archive) || !lstatSync(archive).isFile()) fail('npm pack did not create an archive')
  const entries = archiveEntries(archive)
  const extracted = join(work, 'target-extracted')
  mkdirSync(extracted)
  run('tar', ['-xzf', archive, '-C', extracted], { cwd: ROOT })
  assertPackageLayout(manifest, entries, join(extracted, 'package'), 'target archive')
  const reported = new Set(dryFiles.map(path => String(path).replace(/^package\//u, '').replace(/^\.\//u, '')))
  const actual = new Set(entries.map(path => path.replace(/^package\//u, '').replace(/\/$/u, '')))
  for (const path of reported) if (!actual.has(path)) fail('target archive differs from dry-run file set: ' + path)
  return { archive, dryFiles, packageRoot: join(extracted, 'package') }
}

function registryNamePath(name) {
  return encodeURIComponent(name)
}

async function startFixtureRegistry(records) {
  const byName = new Map()
  const byTarball = new Map()
  const served = new Set()
  for (const item of records) {
    const list = byName.get(item.manifest.name) ?? []
    const bytes = readFileSync(item.path)
    const filename = basename(item.path)
    list.push({ ...item, filename, bytes, integrity: sha512Integrity(bytes), sha1: createHash('sha1').update(bytes).digest('hex') })
    byName.set(item.manifest.name, list)
    const record = list[list.length - 1]
    byTarball.set(filename, record)
    // pnpm canonicalizes registry tarball names to the package stem. Serve
    // both the archive filename and that canonical spelling.
    const stem = item.manifest.name.startsWith('@')
      ? item.manifest.name.slice(item.manifest.name.indexOf('/') + 1)
      : item.manifest.name
    byTarball.set(stem + '-' + item.manifest.version + '.tgz', record)
  }
  let registryUrl = ''
  const server = createServer((request, response) => {
    try {
      const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname
      const decoded = decodeURIComponent(pathname)
      const marker = '/-/'
      if (decoded.includes(marker)) {
        const filename = decoded.slice(decoded.lastIndexOf(marker) + marker.length)
        const item = byTarball.get(filename)
        if (item !== undefined && process.env.DSH_DEBUG_PACK === '1') console.error('fixture request', filename, item.manifest.name + '@' + item.manifest.version, sha512Integrity(item.bytes))
        if (item === undefined) { response.statusCode = 404; response.end('fixture archive not found'); return }
        served.add(item.manifest.name + '@' + item.manifest.version)
        response.setHeader('content-type', 'application/octet-stream')
        response.end(item.bytes)
        return
      }
      const name = decoded.replace(/^\//u, '')
      const list = byName.get(name)
      if (list === undefined) { response.statusCode = 404; response.end('fixture metadata not found'); return }
      const versions = {}
      for (const item of list) {
        versions[item.manifest.version] = {
          ...item.manifest,
          dist: { tarball: registryUrl + registryNamePath(item.manifest.name) + '/-/' + item.filename, integrity: item.integrity, shasum: item.sha1 },
        }
      }
      response.setHeader('content-type', 'application/json')
      response.end(JSON.stringify({ name, 'dist-tags': { latest: list.at(-1).manifest.version }, versions }))
    } catch (error) {
      response.statusCode = 500
      response.end(String(error))
    }
  })
  await new Promise((resolvePromise, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', resolvePromise)
  })
  const address = server.address()
  if (address === null || typeof address === 'string') fail('fixture registry did not bind to a TCP port')
  registryUrl = 'http://127.0.0.1:' + String(address.port) + '/'
  return { server, url: registryUrl, byName, served }
}

async function stopFixtureRegistry(server) {
  await new Promise(resolvePromise => server.close(() => resolvePromise()))
}

function writeProbeManifest(directory, dependency, peerRoots, builtDependencies) {
  const dependencies = { [dependency.name]: dependency.spec }
  for (const [name, spec] of Object.entries(peerRoots)) if (dependencies[name] === undefined) dependencies[name] = spec
  const manifest = {
    name: 'dsh-llm-ollama-pack-probe',
    private: true,
    type: 'module',
    dependencies,
    pnpm: { onlyBuiltDependencies: builtDependencies },
  }
  writeFileSync(join(directory, 'package.json'), JSON.stringify(manifest, null, 2) + '\n')
  writeFileSync(join(directory, '.npmrc'), 'auto-install-peers=false\n')
  writeFileSync(join(directory, 'global.npmrc'), '')
}

async function installSeed(directory, store, registryUrl, label) {
  let result
  try {
    result = await runAsync('pnpm', ['install', '--ignore-scripts', '--store-dir', store, '--registry', registryUrl, '--no-frozen-lockfile'], { cwd: directory, env: { CI: 'true' }, userconfig: join(directory, '.npmrc'), globalconfig: join(directory, 'global.npmrc'), registry: registryUrl, storeDir: store })
  } catch (error) {
    fail(String(error))
  }
  assertNoInstallWarning(result.output, label + ' seed install')
}

function installOffline(directory, store, label) {
  safeRemoveTree(join(directory, 'node_modules'))
  const result = run('pnpm', ['install', '--offline', '--ignore-scripts', '--store-dir', store, '--registry', INVALID_REGISTRY, '--frozen-lockfile'], { cwd: directory, env: { CI: 'true' }, userconfig: join(directory, '.npmrc'), globalconfig: join(directory, 'global.npmrc'), registry: INVALID_REGISTRY, storeDir: store })
  assertNoInstallWarning(result.output, label + ' offline install')
}

function installedPackages(directory) {
  const root = join(directory, 'node_modules')
  const result = []
  const visited = new Set()
  const visit = path => {
    if (!existsSync(path)) return
    const real = realpathSync(path)
    if (visited.has(real)) return
    visited.add(real)
    if (existsSync(join(real, 'package.json'))) {
      const manifest = readJson(join(real, 'package.json'))
      if (typeof manifest.name === 'string') result.push({ path: real, manifest })
    }
    const childModules = join(real, 'node_modules')
    if (!existsSync(childModules)) return
    for (const scope of readdirSync(childModules, { withFileTypes: true })) {
      if (!scope.isDirectory() && !scope.isSymbolicLink()) continue
      const scopePath = join(childModules, scope.name)
      if (scope.name.startsWith('@')) {
        for (const child of readdirSync(scopePath, { withFileTypes: true })) if (child.isDirectory() || child.isSymbolicLink()) visit(join(scopePath, child.name))
      } else visit(scopePath)
    }
  }
  visit(directory)
  return result
}

function assertInstalledFixtureChildren(directory, byIdentity, served, roots, label) {
  const missing = []
  for (const item of installedPackages(directory)) {
    const id = item.manifest.name + '@' + item.manifest.version
    if (roots.has(id) || item.manifest.name === 'dsh-llm-ollama-pack-probe') continue
    if (!byIdentity.has(id)) missing.push(id + ' (no immutable fixture archive)')
    else if (served !== undefined && !served.has(id)) missing.push(id + ' (not fetched from fixture registry)')
  }
  if (missing.length > 0) fail(label + ' has unverified installed children: ' + missing.join('; '))
}

function assertInstalledVersionPlane(directory, label) {
  const packages = installedPackages(directory)
  const dsh = packages.filter(item => item.manifest.name.startsWith('@deepseek-ai/dsh-'))
  if (dsh.length === 0) fail(label + ' installed no DSH package')
  for (const item of dsh) if (item.manifest.version !== ALPHA4_VERSION) fail(label + ' installed non-alpha DSH package: ' + item.manifest.name + '@' + item.manifest.version)
  const cordis = packages.filter(item => item.manifest.name === '@deepseek-ai/cordis')
  if (cordis.length === 0 || new Set(cordis.map(item => item.path)).size !== 1 || cordis[0].manifest.version !== '4.0.2') {
    console.error(label + ' Cordis candidates:', cordis.map(item => ({ path: item.path, version: item.manifest.version })))
    fail(label + ' installed an invalid Cordis identity')
  }
}

function targetRoot(directory) {
  const path = join(directory, 'node_modules', PACKAGE_NAME)
  if (!existsSync(path)) fail('offline install has no target package')
  const real = realpathSync(path)
  if (existsSync(join(real, 'src'))) fail('installed target exposes source files')
  return real
}

function nodeSmoke(directory, label, source) {
  const path = join(directory, label + '.mjs')
  writeFileSync(path, source)
  const result = run('node', [path], { cwd: directory, userconfig: join(directory, '.npmrc') })
  assertNoInstallWarning(result.output, label + ' smoke')
}

function runPublicSmokes(directory, kind) {
  if (kind === 'host') {
    nodeSmoke(directory, 'host-smoke', "import * as mod from 'dsh-llm-ollama'; if (typeof mod.apply !== 'function' || typeof mod.OllamaAdapter !== 'function') throw new Error('Host exports are incomplete')\n")
    return
  }
  if (kind === 'invariant') {
    nodeSmoke(directory, 'invariant-smoke', "import * as mod from 'dsh-llm-ollama/invariant'; if (typeof mod.apply !== 'function') throw new Error('invariant export is incomplete')\n")
    return
  }
  const source = [
    'const registrations = []',
    'globalThis.window = { __ModuleLoader__: { load(row) { registrations.push(row) } } }',
    "await import('dsh-llm-ollama/client')",
    "const row = registrations.find(item => item.id === 'dsh-llm-ollama')",
    "if (row === undefined || typeof row.factory !== 'function') throw new Error('client did not register a ModuleLoader factory')",
    "const result = row.factory(specifier => { if (specifier === 'dsh-llm-providers-ui/sortable') throw new Error('client kept a Providers UI runtime import'); return {} })",
    "if (typeof result.apply !== 'function') throw new Error('client factory exports are incomplete')",
    "let rejected = false; try { await import('dsh-llm-ollama/src/index.ts') } catch { rejected = true }; if (!rejected) throw new Error('source plane is importable')",
  ].join('\n') + '\n'
  nodeSmoke(directory, 'client-smoke', source)
}

function samePath(left, right) {
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right
}

function safeRemoveTree(root) {
  const visit = path => {
    let stat
    try {
      stat = lstatSync(path)
    } catch (error) {
      if (error?.code === 'ENOENT') return
      throw error
    }
    if (stat.isSymbolicLink()) {
      unlinkSync(path)
      return
    }
    if (!stat.isDirectory()) {
      rmSync(path, { force: true })
      return
    }
    const real = realpathSync(path)
    if (!samePath(real, resolve(path))) {
      unlinkSync(path)
      return
    }
    for (const child of readdirSync(path)) visit(join(path, child))
    rmdirSync(path)
  }
  visit(root)
}

function describeError(error) {
  if (error instanceof AggregateError) return [error.message, ...error.errors.map(describeError)].join('\n')
  return String(error?.stack ?? error)
}

async function cleanupPackGate(work, registry, primaryError) {
  const failures = []
  if (registry !== undefined) {
    try {
      await stopFixtureRegistry(registry.server)
    } catch (error) {
      failures.push(error)
    }
  }
  try {
    safeRemoveTree(work)
  } catch (error) {
    failures.push(error)
  }
  if (failures.length === 0) return
  const cleanupError = new AggregateError(failures, 'dsh-llm-ollama pack gate cleanup failed')
  if (primaryError !== undefined) {
    console.error('[dsh-llm-ollama pack gate] cleanup failed after primary error: ' + describeError(cleanupError))
    return
  }
  throw cleanupError
}

async function main() {
  const manifest = readJson(join(ROOT, 'package.json'))
  verifySourceMigration(manifest)
  const { byIdentity, optionalPlatformGaps } = checkProvenance()
  // Keep the consumer outside this repository's workspace. Otherwise pnpm
  // discovers the root workspace and installs the owner's devDependencies,
  // defeating the isolated tarball consumer check.
  const work = mkdtempSync(join(tmpdir(), 'dsh-llm-ollama-pack-gate-'))
  let registry
  let primaryError
  try {
    assertEnvironmentIsolation(work)
    const owner = verifyOwnerArtifact(work)
    const target = targetPack(work, manifest)
    const records = [...byIdentity.values()].map(item => ({ path: join(TARBALL_ROOT, item.file), manifest: item.manifest }))
    registry = await startFixtureRegistry(records)
    const peerRoots = {}
    const peerRanges = new Map()
    const staticCandidates = name => [...byIdentity.values()]
      .filter(item => item.manifest.name === name)
      .sort((a, b) => String(a.manifest.version).localeCompare(String(b.manifest.version)))
    const pending = [manifest, owner.manifest]
    const queued = new Set()
    const enqueue = item => {
      const id = item.manifest.name + '@' + item.manifest.version
      if (queued.has(id)) return
      queued.add(id)
      pending.push(item.manifest)
    }
    while (pending.length > 0) {
      const peerManifest = pending.shift()
      if (peerManifest === undefined) continue
      const parent = peerManifest.name + '@' + peerManifest.version
      for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
        for (const [name, spec] of Object.entries(peerManifest[section] ?? {})) {
          const optional = section === 'optionalDependencies'
            || section === 'peerDependencies' && peerManifest.peerDependenciesMeta?.[name]?.optional === true
          const key = edgeKey(parent, section, name, spec)
          const candidate = findStaticDependency(byIdentity, parent, name, spec)
          if (candidate === undefined) {
            if (optional && optionalPlatformGaps.has(key)) continue
            fail('reachable graph lacks dependency archive: ' + key)
          }
          enqueue(candidate)
          if (section !== 'peerDependencies' || optional) continue
          const target = dependencyTarget(name, spec)
          const ranges = peerRanges.get(name) ?? []
          ranges.push(target.range)
          peerRanges.set(name, ranges)
          const compatible = staticCandidates(target.name)
            .filter(item => ranges.every(range => satisfiesRange(item.manifest.version, range))).at(-1)
          if (compatible === undefined) fail('explicit peer graph has incompatible versions for ' + name + ': ' + ranges.join(', '))
          peerRoots[name] = compatible.manifest.version
        }
      }
    }
    const buildDependencies = [...new Set([...byIdentity.values()]
      .filter(item => ['preinstall', 'install', 'postinstall', 'prepare'].some(name => item.manifest.scripts?.[name] !== undefined))
      .map(item => item.manifest.name))].sort()
    const fixtureKinds = [
      { kind: 'owner', dependency: { name: OWNER_NAME, spec: 'file:' + owner.artifact } },
      { kind: 'host', dependency: { name: PACKAGE_NAME, spec: 'file:' + target.archive } },
      { kind: 'invariant', dependency: { name: PACKAGE_NAME, spec: 'file:' + target.archive } },
      { kind: 'client', dependency: { name: PACKAGE_NAME, spec: 'file:' + target.archive } },
    ]
    const fixtures = []
    for (const fixture of fixtureKinds) {
      const directory = join(work, 'fixture-' + fixture.kind)
      const store = join(work, 'store-' + fixture.kind)
      mkdirSync(directory)
      mkdirSync(store)
      writeProbeManifest(directory, fixture.dependency, peerRoots, buildDependencies)
      registry.served.clear()
      await installSeed(directory, store, registry.url, fixture.kind)
      const roots = new Set([fixture.dependency.name + '@' + (fixture.kind === 'owner' ? OWNER_VERSION : manifest.version)])
      assertInstalledFixtureChildren(directory, byIdentity, registry.served, roots, fixture.kind + ' seed')
      fixtures.push({ ...fixture, directory, store, roots })
    }
    await stopFixtureRegistry(registry.server)
    registry = undefined
    for (const fixture of fixtures) {
      installOffline(fixture.directory, fixture.store, fixture.kind)
      assertInstalledFixtureChildren(fixture.directory, byIdentity, undefined, fixture.roots, fixture.kind + ' offline')
      if (fixture.kind === 'owner') {
        const root = join(fixture.directory, 'node_modules', OWNER_NAME)
        if (!existsSync(root)) fail('offline owner install has no Providers UI package')
        const installed = readJson(join(realpathSync(root), 'package.json'))
        if (installed.name !== OWNER_NAME || installed.version !== OWNER_VERSION) fail('offline owner install resolved the wrong package')
        safeTarget(installed.exports?.['./sortable']?.default ?? installed.exports?.['./sortable'], 'offline owner sortable export')
      } else {
        assertInstalledVersionPlane(fixture.directory, fixture.kind)
        const root = targetRoot(fixture.directory)
        const installedManifest = readJson(join(root, 'package.json'))
        assertPackageLayout(installedManifest, target.dryFiles, root, fixture.kind + ' installed target')
        assertStaticClosure(root, installedManifest, fixture.kind + ' installed target')
        if (readFileSync(join(root, 'lib', 'client.js'), 'utf8').includes(OWNER_NAME + '/sortable')) fail(fixture.kind + ' package retains a Providers UI runtime import')
        runPublicSmokes(fixture.directory, fixture.kind)
      }
    }
    console.log('pack check passed: immutable registry/store child bytes, zero nonoptional missing versioned edges, fresh offline runtime imports, and Host smoke verified')
  } catch (error) {
    primaryError = error
    throw error
  } finally {
    await cleanupPackGate(work, registry, primaryError)
  }
}

main().catch(error => { console.error(String(error?.stack ?? error)); process.exitCode = 1 })
