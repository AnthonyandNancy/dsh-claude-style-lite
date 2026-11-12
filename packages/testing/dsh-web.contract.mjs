#!/usr/bin/env node
/**
 * dsh-web.contract.mjs — the checks that prove a scratch host cannot reach the
 * reader's DSH configuration (D92). They read the values `start()` derives
 * before a host is booted, so they run without starting one.
 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { isolatedEnv, runRoot, DEFAULT_HOME } from './dsh-web.mjs'

assert.ok(DEFAULT_HOME.includes(path.join('.debug', 'runs', 'e2e')), 'the default home stands under .debug/runs/e2e')
const parent = path.resolve('.debug/runs/dsh-web/contract')
const root = runRoot(parent)
fs.mkdirSync(root, { recursive: true })
const env = isolatedEnv(root, { DSH_E2E_MOCK_KEY: 'mock' })

assert.equal(env.DSH_HOME, path.join(root, 'home'))
assert.equal(env.DSH_AGENTS_HOME, path.join(root, 'agents'))
assert.equal(env.DSH_TELEMETRY_DISABLED, '1')
assert.equal(env.npm_config_store_dir, path.join(root, 'pnpm-store'))
assert.equal(env.npm_config_userconfig, path.join(root, 'npmrc'))
assert.equal(env.DSH_E2E_MOCK_KEY, 'mock')
for (const name of ['OPENAI_API_KEY', 'DSH_WEB_URL', 'BROWSER', 'SSH_CONNECTION', 'SSH_TTY', 'NODE_OPTIONS', 'NODE_PATH']) {
  assert.equal(env[name], undefined, `${name} must not cross into the scratch host`)
}
assert.equal(path.dirname(root), parent)
assert.match(path.basename(root), /^\d{4}-\d{2}-\d{2}T/)
console.log('dsh-web contract ok')
