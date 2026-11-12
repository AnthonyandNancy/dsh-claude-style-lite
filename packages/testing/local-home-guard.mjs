#!/usr/bin/env node
/**
 * local-home-guard.mjs — fingerprint the reader's real DSH homes before and
 * after a test run, so a leak is evidence rather than a suspicion.
 *
 * The scan is read-only. Symbolic links record their target and are not
 * followed: a `link:` plugin points at a checkout, which is the test tree,
 * not reader state.
 *
 * Usage:
 *   node packages/testing/local-home-guard.mjs <fingerprint.json> --before
 *   node packages/testing/local-home-guard.mjs <fingerprint.json>
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

/** The two homes a run must not touch. */
function targets() {
  return {
    dsh: process.env.LOCAL_DSH_HOME ?? path.join(os.homedir(), '.dsh'),
    agents: process.env.LOCAL_DSH_AGENTS_HOME ?? path.join(os.homedir(), '.agents'),
  }
}

/** One file's size, mtime and content hash; symlinks record their target only. */
function fileFact(file) {
  const stat = fs.lstatSync(file, { throwIfNoEntry: false })
  if (stat === undefined) return null
  if (stat.isSymbolicLink()) return { link: fs.readlinkSync(file) }
  if (!stat.isFile()) return { mode: stat.mode, size: stat.size, mtimeMs: stat.mtimeMs }
  const hash = createHash('sha256').update(fs.readFileSync(file)).digest('hex')
  return { mode: stat.mode, size: stat.size, mtimeMs: stat.mtimeMs, hash }
}

/** Every path under one root, keyed by its path relative to that root. */
function scan(root) {
  if (!fs.existsSync(root)) return { root, exists: false, files: {} }
  const files = {}
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isSymbolicLink()) {
        files[path.relative(root, full)] = fileFact(full)
        continue
      }
      if (entry.isDirectory()) {
        walk(full)
        continue
      }
      files[path.relative(root, full)] = fileFact(full)
    }
  }
  walk(root)
  return { root, exists: true, files }
}

/** The fingerprint a before/after pair compares. */
export function fingerprint() {
  const target = targets()
  return { at: new Date().toISOString(), dsh: scan(target.dsh), agents: scan(target.agents) }
}

/** Differences between two fingerprints, as readable lines; [] when nothing moved. */
export function differences(before, after) {
  const out = []
  for (const name of ['dsh', 'agents']) {
    const left = before[name]
    const right = after[name]
    if (left.exists !== right.exists) {
      out.push(`${name}: exists ${left.exists} -> ${right.exists}`)
      continue
    }
    if (!left.exists && !right.exists) continue
    const keys = new Set([...Object.keys(left.files), ...Object.keys(right.files)])
    for (const key of [...keys].sort()) {
      const a = JSON.stringify(left.files[key])
      const b = JSON.stringify(right.files[key])
      if (a !== b) out.push(`${name}/${key}: ${a} -> ${b}`)
    }
  }
  return out
}

if (import.meta.main) {
  const out = process.argv[2]
  if (out === undefined) throw new Error('usage: local-home-guard.mjs <fingerprint.json> [--before]')
  const text = JSON.stringify(fingerprint(), null, 2)
  const nl = String.fromCharCode(10)
  if (process.argv.includes('--before')) {
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(out, text + nl)
  } else {
    const prior = JSON.parse(fs.readFileSync(out, 'utf8'))
    const moved = differences(prior, JSON.parse(text))
    if (moved.length > 0) throw new Error('local home changed during the run:' + nl + moved.join(nl))
    console.log(`local homes unchanged (${prior.dsh.root}, ${prior.agents.root})`)
  }
}
