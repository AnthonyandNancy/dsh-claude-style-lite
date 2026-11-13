/**
 * The home panel's figures are a pure function of the usage report, the session
 * list summary, the range and the book draw. A store notification that changes
 * none of them must not rebuild the heat grid or the model chart.
 *
 * @capability home-panel
 * @features home
 * @risk Reusing a figure set after the range, the report or the list summary changed shows stale numbers.
 */
import { expect, test } from 'vitest'
import { createHomePanelMemo } from '@dsh-claude-style/client/pure'
import type { HomeUsageState, ListSummary } from '@dsh-claude-style/client/pure'

const state: HomeUsageState = { value: null, computing: false, error: null, loading: false, answeredAt: null }
const listed: ListSummary = { tokens: 0, sessions: 0, activeDays: 0, model: null, models: [], days: [], entries: [] }

test('the same four inputs reuse the computed panel', () => {
  const memo = createHomePanelMemo()
  const first = memo(state, listed, 'all', 0.25)
  expect(memo(state, listed, 'all', 0.25)).toBe(first)
  expect(memo(state, listed, '7d', 0.25)).not.toBe(first)
  expect(memo(state, { ...listed }, 'all', 0.25)).not.toBe(first)
})
