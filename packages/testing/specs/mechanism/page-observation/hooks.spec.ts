/**
 * A feature installed after the scheduler has started is reached by the next
 * event only after the registry announces the change; a feature dropped from
 * the registry is never called again.
 *
 * @capability page-observation
 * @features engine
 * @risk A late deferred feature misses events, or a retired feature keeps writing after its teardown.
 */
import { afterEach, expect, test } from 'vitest'
import { installScheduler } from '@dsh-claude-style/engine/scheduler'
import type { HostContext } from '@dsh-claude-style/engine/host'

const cleanups: (() => void)[] = []
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup()
})

const ctx = { get: () => undefined } as unknown as HostContext

test('refreshHandles brings a late feature into the event index and removes a retired one', () => {
  let calls = 0
  const ui = { retire: () => {} } as Record<string, unknown> & { schedule?: () => void; refreshHandles?: () => void; retire: () => void }
  cleanups.push(installScheduler(ctx, ui as never, ['mascot'], {
    copyChange: [],
    refresh: [],
    start() {},
    systemMotionChanged() {},
  }))
  expect(typeof ui.refreshHandles).toBe('function')
  ui.mascot = { onActivity() { calls += 1 } }
  // The registry has not announced the handle yet, so the event index does not hold it.
  document.dispatchEvent(new PointerEvent('pointerdown'))
  expect(calls).toBe(0)
  ui.refreshHandles?.()
  document.dispatchEvent(new PointerEvent('pointerdown'))
  expect(calls).toBe(1)
  delete ui.mascot
  ui.refreshHandles?.()
  document.dispatchEvent(new PointerEvent('pointerdown'))
  expect(calls).toBe(1)
})
