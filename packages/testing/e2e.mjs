#!/usr/bin/env node
/**
 * Run real `dsh web` scenarios against this checkout, the scripted model and a
 * browser (D92), each in its own scratch home. Usage: `node packages/testing/e2e.mjs
 * [--scenario <name>] [--shard <i>:<n>] [--jobs <n>] [--headed]`; shards run one
 * scenario at a time.
 */
import fs from 'node:fs'
import { availableParallelism } from 'node:os'
import path from 'node:path'
import { launchBrowser } from './browser.mjs'
import { argOf } from '../../scripts/shared/args.mjs'
import { start, openPage, waitForSkin, dismissOverlays, firstRunOverlayText, DEFAULT_HOME } from './dsh-web.mjs'
import { fingerprint, differences } from './local-home-guard.mjs'
import { MARKS, measureFrameMs } from './lane.mjs'
import { requireNewestHost } from './host-version.mjs'
import { SCENARIOS } from './scenarios.mjs'
import { sendPrompt, waitForTurn } from './prompt.mjs'
import { startMockLlm } from './mock-llm.mjs'
import { startMockPlatform, accountStore } from './mock-platform.mjs'
import { loadModule } from '../../scripts/shared/ts-module.mjs'
import { withLock } from '../../scripts/shared/verify-lock.mjs'
import { runsPath } from '../../scripts/shared/debug-paths.mjs'
import { featureCoverage } from '../../scripts/shared/feature-coverage.mjs'
import { sanitizePage } from '../../scripts/shared/privacy.mjs'

const ROOT = path.resolve(import.meta.dirname, '..', '..')
const DEFAULT_OUT = runsPath(ROOT, 'e2e', 'out')
/**
 * How long one scenario may take. A wait that never settles would otherwise hold
 * the run until the runner's own limit: this deadline writes the failure evidence
 * and stops the run instead. `DSH_E2E_DEADLINE_MS` shortens it, for trying the
 * watchdog itself.
 */
const SCENARIO_DEADLINE_MS = Number(process.env.DSH_E2E_DEADLINE_MS ?? '') || 3 * 60 * 1000

/**
 * How many scenarios the walk runs at once. Each one boots its own host and
 * drives its own page, and the scenarios that read the page frame by frame —
 * the tail's follow, the flight's landing, the doors' pin, the frame cost of a
 * long session — are the ones a loaded machine disturbs, so the count stays
 * well under the machine's cores. `--jobs` or `DSH_E2E_JOBS` says another.
 */
const DEFAULT_JOBS = Math.max(2, Math.min(4, Math.floor(availableParallelism() / 5)))

/** How many scenarios to run at once: the flag or the environment, else DEFAULT_JOBS. */
function jobsOf(value) {
  const asked = value ?? process.env.DSH_E2E_JOBS
  if (asked === undefined) return DEFAULT_JOBS
  const count = Number(asked)
  if (!Number.isInteger(count) || count < 1) throw new Error(`--jobs takes how many scenarios to run at once, not "${asked}"`)
  return count
}

/**
 * One scratch home per scenario running at once: `dsh-web.mjs` clears a home's
 * sessions and puts its settings layer back before every boot, so two scenarios
 * in one home would clear each other's state mid-turn. A walk of one scenario
 * uses the home itself, so `--home` keeps meaning what it says.
 */
function workerHomes(base, jobs, total) {
  const root = path.resolve(base ?? DEFAULT_HOME)
  const wanted = Math.max(1, Math.min(jobs, total))
  return wanted === 1 ? [root] : Array.from({ length: wanted }, (_, at) => `${root}-${at}`)
}

/**
 * The scenarios the default walk leaves out: the ones that read the host's own
 * statistics surfaces on a page the reader has moved (stats-position.mjs,
 * stats-overlay.mjs). This list is the only place a scenario is parked — the
 * default walk is every other entry of the table, derived in main() — so a
 * scenario added to the table runs by default, and a name here that the table
 * no longer holds stops the run.
 */
const PARKED = new Set(['statsPosition', 'statsOverlay', 'statsFooter'])

/**
 * What the page looked like when a scenario failed: a picture, the console
 * problems, and the markers a timeout usually turns on — the composer's own
 * value, the host flow rows that did appear, any overlay still open. The lane
 * writes these into its output directory, which CI keeps as an artifact.
 */
async function captureFailure(session, out, name, say) {
  const { page } = session
  const file = path.join(out, `${name}-failure.png`)
  try {
    await sanitizePage(expression => page.evaluate(expression))
    await page.screenshot({ path: file })
  } catch (error) {
    // A refused capture leaves the diagnostic report available without storing
    // a picture that failed the privacy sweep (D92).
    say(`  failure capture unavailable: ${error.message.split('\n')[0]}\n`)
  }
  const state = await page.evaluate(() => {
    const input = document.querySelector('[data-composer-input]')
    return {
      url: location.href,
      composerValue: input === null ? null : (input.value ?? input.textContent ?? ''),
      rows: [...document.querySelectorAll('[data-chat-flow-kind]')].map((row) => row.getAttribute('data-chat-flow-kind')),
      dialogs: [...document.querySelectorAll('[role="dialog"]')]
        .filter((node) => node.offsetParent !== null)
        .map((node) => (node.innerText || '').replace(/\s+/g, ' ').slice(0, 160)),
      skin: document.body.getAttribute('data-dsh-claude-style'),
      // Whatever a scenario left in the title: a page under test has no other
      // channel out of the browser, and a failure is when it is worth reading.
      title: document.title,
    }
  }).catch((error) => ({ error: String(error) }))
  const report = [
    `scenario: ${name}`,
    `problems (${session.problems.length}):`,
    ...session.problems.slice(0, 20).map((line) => `  ${line}`),
    `state: ${JSON.stringify(state, null, 2)}`,
  ].join('\n')
  fs.writeFileSync(path.join(out, `${name}-failure.txt`), `${report}\n`)
  say(`  failure evidence: ${file}\n`)
}

/**
 * Sample the page once per frame, until the turn settles.
 *
 * The trace holds what each frame painted. The scroll offset a frame later reads
 * is the one the previous frame left, so a decrease between two samples is a
 * frame the reader saw slide backward, and the gap is what sat below the fold.
 * The reader's own row, its words and its visibility ride along, so a
 * submission that never reaches the page or arrives without its words is
 * visible in the trace.
 */
async function startTrace(page) {
  await page.evaluate((host) => {
    const trace = []
    window.__e2eTrace = trace
    const visible = (element) => element !== null && getComputedStyle(element).visibility !== 'hidden' && Number(getComputedStyle(element).opacity) > 0
    const words = (element) => element === null ? null : [...element.querySelectorAll('*')]
      .filter((node) => node.children.length === 0 && (node.textContent ?? '').trim() !== '' && visible(node))
      .map((node) => (node.textContent ?? '').trim().slice(0, 24))
    const sample = () => {
      const frame = { t: Math.round(performance.now()) }
      const scroller = document.querySelector(host.scroller)
      if (scroller !== null) {
        frame.top = Math.round(scroller.scrollTop)
        frame.height = Math.round(scroller.scrollHeight)
        frame.gap = Math.round(scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop)
        frame.following = document.querySelector(host.followingTail) !== null
        frame.hold = document.querySelector(host.hold) !== null
      }
      const rows = [...document.querySelectorAll(host.userRow)]
      const last = rows.length === 0 ? null : rows[rows.length - 1]
      frame.echo = document.querySelector(host.echo) !== null || (last !== null && last.hasAttribute(host.echoAttribute))
      frame.rows = rows.length
      frame.rowVisible = visible(last)
      frame.rowWords = words(last)
      // The live turn's own status line at the end of the flow: the skin pins it
      // while the reader is at the tail, so its screen position is the check.
      // Kept to the hundredth: a pin that slips by a fraction of a pixel is the
      // shake a reader sees once the page is scaled, and rounding would hide it.
      const running = document.querySelector(host.running)
      frame.running = running === null ? null : Math.round(running.getBoundingClientRect().top * 100) / 100
      // The composer's own box and the message column's foot in the viewport:
      // the composer is the scroller's sibling and may not move while the answer
      // grows, and the column's foot against the scroller's own bottom is the
      // stream slide's offset as drawn (stream-pace.mjs). The column keeps a
      // foot of its own below its last block — the host's clearance for the
      // composer — so its foot is read from that block, the flow's last row.
      const card = document.querySelector(host.composerCard)
      const column = scroller === null ? null : scroller.querySelector(host.flow)
      const lastRow = column === null ? null : column.lastElementChild
      const cardRect = card === null ? null : card.getBoundingClientRect()
      const seatRect = card === null ? null : card.closest(host.composerSeat)?.getBoundingClientRect() ?? null
      const statsLine = document.querySelector(host.statsLine)
      const statsRect = statsLine === null || getComputedStyle(statsLine).visibility === 'hidden' ? null : statsLine.getBoundingClientRect()
      const scrollerRect = scroller === null ? null : scroller.getBoundingClientRect()
      const rowRect = lastRow === null ? null : lastRow.getBoundingClientRect()
      const columnRect = column === null ? null : column.getBoundingClientRect()
      // What the reader sees of everything already streamed: the column's layout
      // top, the scroller's offset and the stream slide's transform in one
      // number. A slide that keeps up with the growth holds this steady; one
      // that cancels the host's pin and then re-carries more than arrived shows
      // up here as the column moving down between two frames (stream-jitter.mjs).
      frame.flowTop = columnRect === null ? null : Math.round(columnRect.top * 10) / 10
      frame.card = cardRect === null ? null : Math.round(cardRect.top * 10) / 10
      frame.cardBottom = cardRect === null ? null : Math.round(cardRect.bottom * 10) / 10
      frame.seat = seatRect === null ? null : [Math.round(seatRect.top * 10) / 10, Math.round(seatRect.bottom * 10) / 10]
      frame.stats = statsRect === null ? null : [Math.round(statsRect.top * 10) / 10, Math.round(statsRect.bottom * 10) / 10]
      frame.statsMode = statsLine?.getAttribute(host.statsFooterLine) ?? null
      frame.lag = rowRect === null || scrollerRect === null ? null : Math.round((rowRect.bottom - scrollerRect.bottom) * 10) / 10
      trace.push(frame)
      if (trace.length < 6000) requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  }, MARKS)
}

/** Run one scenario on its own instance, and return its checks and trace. */
async function runScenario(name, options) {
  const scenario = SCENARIOS[name]
  if (scenario === undefined) throw new Error(`no scenario named "${name}" (${Object.keys(SCENARIOS).join(', ')})`)
  /** This scenario's own log lines, handed to the runner as one block when it is done. */
  const lines = []
  const say = (line) => lines.push(line)
  const flush = () => {
    if (lines.length === 0) return
    const block = lines.join('')
    lines.length = 0
    if (options.say === undefined) process.stdout.write(block)
    else options.say(block)
  }
  // The scratch home is known before the host boots, and a scripted tool call
  // needs it: the model service fills the script's `{{workspace}}` slots with it
  // (packages/testing/mock-llm.mjs), and the scenario writes files beside them.
  // A program-dispatched call carries the path inside the program's own source,
  // where a backslash is an escape, so that slot carries the doubled form.
  // A scenario that installs another plugin boots a home of its own: the
  // shared one would carry that plugin onto every later scenario's page. The
  // home starts empty on every run, since the reset below clears the host's
  // sessions and leaves the other plugin's own store pointing at them.
  const sharedHome = path.resolve(options.home ?? DEFAULT_HOME)
  const home = scenario.plugins === undefined
    ? sharedHome
    : path.join(path.dirname(sharedHome), `home-${name}${options.worker === undefined ? '' : `-${options.worker}`}`)
  if (scenario.plugins !== undefined) fs.rmSync(home, { recursive: true, force: true })
  // The run root is made by dsh-web.mjs; a scripted call writes inside the
  // workspace the host registers there, so the mock needs the path only after
  // the host has started. The model service fills `{{workspace}}` and its
  // doubled form `{{workspaceCode}}` in every tool call.
  const workspace = path.join(home, 'workspace')
  const mock = await startMockLlm({
    script: scenario.script,
    delayMs: scenario.delayMs ?? options.delayMs,
    vars: { workspace, workspaceCode: workspace.replaceAll('\\', '\\\\') },
  })
  // A scenario that draws the account surfaces signs in against the scripted
  // platform: the host's account provider reads it over loopback, from a store
  // of this boot's own, and the account's model route answers from the same
  // scripted model service as the key route.
  const platform = scenario.account === true ? await startMockPlatform() : null
  const accountPatch = []
  if (platform !== null) {
    const store = path.join(home, 'lane-account.credentials.yaml')
    fs.mkdirSync(home, { recursive: true })
    accountStore(store, platform.url)
    accountPatch.push(
      '- id: credentials', '  config:', `    path: ${JSON.stringify(store)}`,
      '- id: deepseek-account', '  config:', `    platformOrigin: ${platform.url}`, '    allowLoopbackHttp: true', `    inferenceOrigin: ${mock.url}`,
      '- id: llm-deepseek-account', '  config:', `    baseURL: ${mock.url}`,
    )
  }
  const patch = ['- id: llm-deepseek', '  config:', `    baseURL: ${mock.url}`, '    apiKeyEnv: DSH_E2E_MOCK_KEY', ...accountPatch, ...scenario.patch ?? []].join('\n')
  const host = await start({ patch, args: scenario.hostArgs, env: { DSH_E2E_MOCK_KEY: 'mock' }, home, plugins: scenario.plugins, resetState: true })
  const runWorkspace = path.join(host.home, 'workspace')
  say(`\n== ${name} ==  mock ${mock.url}  host ${host.url}\n`)
  /** Where the scenario is, so a hang in the log says which step it never left. */
  const step = (label) => say(`  · ${label}\n`)
  let session
  let expired = false
  const timer = setTimeout(() => { expired = true }, SCENARIO_DEADLINE_MS)
  try {
    // `args` are launch switches, and the walk's shared browser was started
    // without them: a scenario that carries any starts a browser of its own,
    // which its own `close` takes down again.
    session = await openPage(host.url, {
      browser: scenario.browserArgs === undefined ? options.browser : undefined,
      headless: options.headed !== true,
      args: scenario.browserArgs,
      initScript: scenario.initScript,
      ...scenario.viewport,
    })
    const { page } = session
    const body = (async () => {
      step('waiting for the skin')
      await waitForSkin(page)
      step('answering the first-run overlays')
      if (!(await dismissOverlays(page))) {
        const left = await firstRunOverlayText(page)
        throw new Error(`the shell left a first-run overlay open${left === '' ? '' : `: ${left}`}`)
      }
      const context = { page, session, url: host.url, home, trace: [], notes: {}, out: options.out }
      if (scenario.beforeSend !== undefined) await scenario.beforeSend(context)
      step('sending the prompt')
      // Performance scenarios supply their own probe for every measured round.
      if (scenario.trace !== false) await startTrace(page)
      await sendPrompt(page, scenario.prompt)
      step('waiting for the turn to settle')
      // A scenario that acts while the turn runs, beside the wait rather than after it.
      const during = scenario.duringTurn === undefined ? null : scenario.duringTurn(context)
      await waitForTurn(page)
      if (during !== null) await during
      context.trace = await page.evaluate(() => window.__e2eTrace ?? [])
      if (scenario.afterTurn !== undefined) {
        step('after the turn')
        await scenario.afterTurn(context)
      }
      step('asserting')
      const checks = await scenario.assert(context)
      // An observation that differs is printed as a difference and fails nothing (D92).
      for (const item of checks) say(`  ${item.ok ? '✓' : item.observation === true ? '△' : '✗'} ${item.name}${item.detail === '' ? '' : `  — ${item.detail}`}\n`)
      const failed = checks.filter((item) => !item.ok && item.observation !== true).length
      const observed = checks.filter((item) => !item.ok && item.observation === true)
      if (expired) throw new Error(`scenario "${name}" overran its ${SCENARIO_DEADLINE_MS / 1000} s deadline`)
      return { scenario: name, checks, failed, observed, frameMs: await measureFrameMs(page), requested: mock.requests.length, trace: context.trace, notes: context.notes }
    })()
    return await body
  } catch (error) {
    if (session !== undefined) await captureFailure(session, options.out, name, say).catch(() => {})
    if (expired) {
      // The hung step is still holding the page; the run stops here with the
      // evidence written above instead of waiting on the runner's own limit.
      say(`  scenario "${name}" passed its ${SCENARIO_DEADLINE_MS / 1000} s deadline; stopping the run\n`)
      flush()
      host.stop()
      await mock.stop().catch(() => {})
      process.exit(1)
    }
    throw error
  } finally {
    clearTimeout(timer)
    if (session !== undefined) await session.close()
    host.stop()
    await mock.stop()
    if (platform !== null) await platform.stop()
    // The lines of a scenario that failed are printed before its error leaves
    // this function, so the evidence and the step it hung on stay together.
    flush()
  }
}

/**
 * One slice of a walk: every `<total>`th name from `<index>`. The scenarios of a
 * walk are independent of one another, so slices taken this way cover the walk
 * exactly once between them however many runners hold it (D92).
 */
function shardOf(names, spec) {
  const at = spec.indexOf(':')
  const index = at === -1 ? NaN : Number(spec.slice(0, at))
  const total = at === -1 ? NaN : Number(spec.slice(at + 1))
  if (!Number.isInteger(index) || !Number.isInteger(total) || total < 1 || index < 0 || index >= total) {
    throw new Error(`--shard takes <index>:<total> with 0 <= index < total, not "${spec}"`)
  }
  return names.filter((name, position) => position % total === index)
}

async function main() {
  const args = process.argv.slice(2)
  // The lane reads what the host draws; a host other than the pinned one gets no verdict (D92).
  requireNewestHost()
  // The timing table names the scenarios that hold it (D3), so the two lists are
  // checked against each other rather than kept in step by hand.
  const { E2E_SCENARIOS } = loadModule('packages/contracts/src/timing.ts')
  const known = Object.keys(SCENARIOS)
  const claimed = [...new Set(Object.values(featureCoverage()).flatMap((row) => row.scenarios))]
  const missing = claimed.filter((name) => !known.includes(name))
  if (missing.length > 0) throw new Error(`feature manifests name scenarios the lane does not hold: ${missing.join(', ')}`)
  const unknown = E2E_SCENARIOS.filter((name) => !known.includes(name))
  const unnamed = known.filter((name) => !E2E_SCENARIOS.includes(name))
  if (unknown.length > 0 || unnamed.length > 0) {
    throw new Error(`the lane runs ${known.join(', ')} while packages/contracts/src/timing.ts names ${E2E_SCENARIOS.join(', ')}`
      + `${unknown.length > 0 ? `; named there but missing here: ${unknown.join(', ')}` : ''}`
      + `${unnamed.length > 0 ? `; run here but unnamed there: ${unnamed.join(', ')}` : ''}`)
  }
  const parked = [...PARKED].filter((name) => !known.includes(name))
  if (parked.length > 0) {
    throw new Error(`the lane parks ${parked.join(', ')}, which packages/testing/scenarios.mjs does not hold`)
  }
  const names = (argOf('scenario') ?? E2E_SCENARIOS.filter((name) => !PARKED.has(name)).join(',')).split(',').map((name) => name.trim()).filter(Boolean)
  const shard = argOf('shard')
  if (shard !== undefined && argOf('scenario') !== undefined) {
    throw new Error('--shard takes one slice of the default walk; --scenario names the scenarios itself')
  }
  const walked = shard === undefined ? names : shardOf(names, shard)
  if (walked.length === 0) throw new Error(`--shard ${shard} of ${names.length} scenarios has nothing to run`)
  const out = path.resolve(argOf('out') ?? DEFAULT_OUT)
  // A shard is one slice of a walk the cloud holds between several machines, and
  // its own parallelism is the shards; a slice driven several at a time on a
  // small runner is what its frame readings do not survive. `--jobs` says
  // otherwise, and everywhere else the machine's own core count answers.
  const jobs = shard !== undefined && argOf('jobs') === undefined ? 1 : jobsOf(argOf('jobs'))
  const options = {
    headed: args.includes('--headed'),
    delayMs: argOf('delay') === undefined ? undefined : Number(argOf('delay')),
    home: argOf('home'),
    out,
  }
  fs.mkdirSync(out, { recursive: true })
  const homes = workerHomes(options.home, jobs, walked.length)
  // The first boot of a scratch home installs this checkout into its profile,
  // which on a cold machine outlasts the waits a scenario makes on the page.
  // Every home pays that once, up front and beside the others. The home the
  // plugin's own scenarios use is made when their scenario runs (`runScenario`).
  if (walked.length > 1) {
    await Promise.all(homes.map(async (home) => {
      const warm = await start({ home, env: {}, resetState: false })
      warm.stop()
    }))
  }
  // One browser for the whole walk: a scenario's page lives in a context of its
  // own, so what the browser start costs is paid once instead of per scenario.
  const browser = await launchBrowser({ headless: options.headed !== true })
  const queue = [...walked]
  const finished = new Map()
  /** The first scenario that threw, kept until every instance has stopped. */
  let broke = null
  const say = (block) => process.stdout.write(block)
  // The reader's homes are the one thing this lane may never write. A
  // fingerprint is taken before the first host and compared after the last one
  // stops, on the success and failure paths alike.
  const localHomes = fingerprint()
  try {
    await Promise.all(homes.map(async (home, worker) => {
      // A scenario that throws ends the walk the way a serial one does — the
      // scenarios still in flight finish, none is started after it, and what it
      // threw is raised once its instance is down.
      while (queue.length > 0 && broke === null) {
        const name = queue.shift()
        try {
          const result = await runScenario(name, { ...options, home, worker, browser, say })
          fs.writeFileSync(path.join(out, `${name}.json`), `${JSON.stringify(result, null, 2)}\n`)
          finished.set(name, result)
        } catch (error) {
          broke = error
        }
      }
    }))
  } finally {
    await browser.close()
    const moved = differences(localHomes, fingerprint())
    if (moved.length > 0) {
      throw new Error(`the run touched a reader home:${String.fromCharCode(10)}${moved.join(String.fromCharCode(10))}`)
    }
  }
  if (broke !== null) throw broke
  const results = walked.map((name) => finished.get(name))
  const failed = results.reduce((sum, result) => sum + result.failed, 0)
  const observed = results.flatMap((result) => result.observed.map((item) => ({ scenario: result.scenario, ...item })))
  fs.writeFileSync(path.join(out, 'observations.json'), `${JSON.stringify(observed, null, 2)}\n`)
  process.stdout.write(`\n${failed === 0 ? 'E2E PASS' : 'E2E FAIL'} — ${results.length} scenarios, ${failed} failed checks, ${observed.length} observations that differ from their record; traces in ${out}\n`)
  // The cloud's job page carries the differences, so the ones that fail nothing are still read.
  if (observed.length > 0 && process.env.GITHUB_STEP_SUMMARY) {
    const lines = observed.map((item) => `- **${item.scenario}** — ${item.name}: ${item.detail}`)
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Observations that differ from their record\n\n${lines.join('\n')}\n`)
  }
  // A scenario leaves a handle behind on a slow runner — the CI job walked every
  // scenario in minutes and then sat until its own cap, because the process had
  // finished and its event loop had not. The exit code is the result.
  process.exit(failed > 0 ? 1 : 0)
}

withLock('e2e', 'e2e', main).catch((error) => {
  console.error(error)
  process.exit(1)
})

