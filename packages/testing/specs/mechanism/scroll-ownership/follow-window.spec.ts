/**
 * The skin hands the follow back only when the host's own follow was the writer
 * the reader lost, not when the reader took the position himself (D40, D100).
 * A reader who moved inside the host's sampling window keeps his place.
 *
 * @capability scroll-ownership
 * @features chat-follow
 * @risk The skin presses the host's back-to-end button while the reader is reading higher up, or stops handing back a follow that a layout change lost.
 */
import { expect, test } from 'vitest'
import { followHandBackAllowed } from '@dsh-claude-style/client/pure'

const base = { seenAtTail: true, readerMoved: false, navigationMoved: false, gap: 0, viewport: 600 }

test('a lost follow with no reader move is handed back', () => {
  expect(followHandBackAllowed(base)).toBe(true)
})

test('a reader who moved outranks the hand-back', () => {
  expect(followHandBackAllowed({ ...base, readerMoved: true, gap: 300 })).toBe(false)
})

test('a feature taking the position to the reader\'s choice outranks the hand-back', () => {
  expect(followHandBackAllowed({ ...base, navigationMoved: true })).toBe(false)
})

test('a conversation that never followed the tail is not handed back', () => {
  expect(followHandBackAllowed({ ...base, seenAtTail: false })).toBe(false)
})

test('more than a screen off the end is the reader reading higher up', () => {
  expect(followHandBackAllowed({ ...base, gap: 601, viewport: 600 })).toBe(false)
})

test('a pin after the wheel does not re-arm the hand-back clock', () => {
  const followSeen = 1000
  const wheelAt = 1200
  // The host pinned the end again after the wheel. The hand-back is measured
  // against the follow edge, so the wheel still counts as the reader's move.
  expect(followHandBackAllowed({
    seenAtTail: true,
    readerMoved: wheelAt > followSeen,
    navigationMoved: false,
    gap: 0,
    viewport: 600,
  })).toBe(false)
})

test('a reader move during the hand-back ends it', () => {
  let moved = false
  const wanted = () => followHandBackAllowed({
    seenAtTail: true,
    readerMoved: moved,
    navigationMoved: false,
    gap: 0,
    viewport: 600,
  })
  expect(wanted()).toBe(true)
  moved = true
  expect(wanted()).toBe(false)
})

test('a wheel inside the host sample window is still the reader\'s move after a pin', () => {
  // The host's own sequence: the follow edge, the wheel, the pin the growth
  // wrote while the mark still stood, then the sample closing the follow. The
  // skin's clock is the edge, so the wheel is after it and the close is the
  // reader's answer.
  const followSeenAt = 1000
  const wheelAt = 1200
  expect(followHandBackAllowed({
    seenAtTail: true,
    readerMoved: wheelAt > followSeenAt,
    navigationMoved: false,
    gap: 0,
    viewport: 600,
  })).toBe(false)
})
