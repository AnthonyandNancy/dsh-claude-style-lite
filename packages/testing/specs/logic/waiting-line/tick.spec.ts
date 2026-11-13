/**
 * A quarter-second tick is the clock's, not the whole line's: a followed row
 * with no wording lock due writes only its clock and badge, while a row waiting
 * on its wording lock, or with no host target subscription, asks for the full
 * sync the old timer performed.
 *
 * @capability waiting-line
 * @features chat-wait
 * @risk A lightweight tick stops updating the wording after its lock, drops the overtime badge, or stops reclassifying the tail.
 */
import { expect, test } from 'vitest'
import { waitTickPlan } from '@dsh-claude-style/client/pure'

test('a followed row with a future wording lock writes only clock and badge', () => {
  expect(waitTickPlan({ turnStart: 1000, waitStart: null, wordUntil: 3000, followed: true }, 2000))
    .toEqual({ clock: true, overtime: false, full: false })
})

test('a wording lock that has run out asks for the full sync', () => {
  expect(waitTickPlan({ turnStart: 1000, waitStart: null, wordUntil: 2000, followed: true }, 2000).full).toBe(true)
})

test('a row without a host target subscription falls back to the full sync', () => {
  expect(waitTickPlan({ turnStart: null, waitStart: null, wordUntil: null, followed: false }, 2000))
    .toEqual({ clock: false, overtime: false, full: true })
})

test('the overtime badge follows the wait start, not the turn start', () => {
  expect(waitTickPlan({ turnStart: 0, waitStart: 5000, wordUntil: null, followed: true }, 14_999).overtime).toBe(false)
  expect(waitTickPlan({ turnStart: 0, waitStart: 5000, wordUntil: null, followed: true }, 15_000).overtime).toBe(true)
})
