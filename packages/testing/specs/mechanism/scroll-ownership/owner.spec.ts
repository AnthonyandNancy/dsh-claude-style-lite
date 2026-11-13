/**
 * Who may move the conversation (D40, D95): writes and eases are ranked by source,
 * and a reader's own move is kept as an instant — whether content follows the end
 * is the host's to decide (D100). The skin keeps no position of the reader's.
 *
 * @capability scroll-ownership
 * @features engine
 * @risk A source ranked below a running ease writes over it, or the skin keeps a reader's position and writes it back over the tail the host just wrote.
 */
import { afterEach, expect, test } from 'vitest'
import { adoptSkin } from '@dsh-claude-style/engine/skin'
import { easeScrollFor, easeScrollToEndFor, navigationMovedSince, readerMovedSince, submissionHolds, writeScroll } from '@dsh-claude-style/engine/scroll-owner'
import { CONVERSATION_SCROLL_SELECTOR, CONVERSATION_SESSION_ATTRIBUTE, CONVERSATION_SESSION_SELECTOR, FLOW_KIND_ATTRIBUTE, PHASE_ATTRIBUTE, USER_ROW_KIND } from '@dsh-claude-style/contracts/dom'
import { MOTION_FULL, MOTION_REDUCED, TEST_SKIN } from '../../fixtures/vocabulary'
import { createScrollOwnerFixture } from '../../fixtures/scroll-owner'

adoptSkin(TEST_SKIN)

const nextFrame = () => new Promise<number>(resolve => requestAnimationFrame(resolve))
const wanted = () => true

const cleanups: (() => void)[] = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!()
})

/** Another scroller beside the conversation, which the owner does not govern. */
function besideBox() {
  const box = document.createElement('div')
  box.style.cssText = 'height:100px;overflow:auto'
  const content = document.createElement('div')
  content.style.height = '2000px'
  box.append(content)
  document.body.append(box)
  cleanups.push(() => box.remove())
  return box
}

const { scrollBox, join, setMotion } = createScrollOwnerFixture(cleanups)

/** The reader's own user row, as the host mounts it into the conversation. */
function userRow() {
  const row = document.createElement('div')
  row.setAttribute(FLOW_KIND_ATTRIBUTE, USER_ROW_KIND)
  return row
}

const settledScroll = (box: HTMLElement) => new Promise(resolve => box.addEventListener('scroll', resolve, { once: true }))

test('a source ranked below the running ease is refused, an equal or higher one is carried out', () => {
  setMotion(MOTION_FULL)
  const scroller = scrollBox(CONVERSATION_SCROLL_SELECTOR)
  expect(easeScrollFor(scroller, 'jump', () => 600, wanted)).toBe(true)
  expect(easeScrollToEndFor(scroller, 'follow', wanted)).toBe(false)
  expect(writeScroll(scroller, 0, 'fold')).toBe(false)
  expect(writeScroll(scroller, 300, 'jump')).toBe(true)
  expect(scroller.scrollTop).toBe(300)
})

test('a write ends a running ease that ranks below it', () => {
  setMotion(MOTION_FULL)
  const scroller = scrollBox(CONVERSATION_SCROLL_SELECTOR)
  expect(easeScrollToEndFor(scroller, 'follow', wanted)).toBe(true)
  expect(writeScroll(scroller, 200, 'fold')).toBe(true)
  expect(scroller.scrollTop).toBe(200)
})

test('a press or a wheel outside the conversation is no movement of it', () => {
  setMotion(MOTION_FULL)
  join()
  scrollBox(CONVERSATION_SCROLL_SELECTOR)
  const since = performance.now()
  while (performance.now() === since) { /* wait for the next tick */ }
  // A child transcript open beside the conversation scrolls on its own.
  const beside = besideBox()
  beside.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -120 }))
  beside.firstElementChild!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
  expect(readerMovedSince(since)).toBe(false)
  // A scroll key with nothing focused moves the conversation, and is theirs.
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp', bubbles: true }))
  expect(readerMovedSince(since)).toBe(true)
})

test('the reader\'s own message arms the submission hold and leaves the follow alone', async () => {
  setMotion(MOTION_FULL)
  join()
  const scroller = scrollBox(CONVERSATION_SCROLL_SELECTOR)
  scroller.append(userRow())
  await nextFrame()
  await nextFrame()
  expect(submissionHolds()).toBe(true)
  expect(easeScrollToEndFor(scroller, 'follow', wanted)).toBe(true)
})

test('a hold armed by one conversation does not follow the reader into the next', async () => {
  setMotion(MOTION_FULL)
  join()
  // The conversation's own element, in the shape the host draws it: the active
  // phase holding the session's column.
  const phase = document.createElement('div')
  phase.setAttribute(PHASE_ATTRIBUTE, 'active')
  const session = document.createElement('div')
  session.setAttribute(CONVERSATION_SESSION_ATTRIBUTE, 'session-one')
  const scroller = scrollBox(CONVERSATION_SCROLL_SELECTOR)
  session.append(scroller)
  phase.append(session)
  document.body.append(phase)
  cleanups.push(() => phase.remove())
  scroller.append(userRow())
  await nextFrame()
  await nextFrame()
  expect(submissionHolds()).toBe(true)
  // A session switch keeps the scroller (the reading view reuses it): the hold
  // the last conversation armed must not stand over the session just opened.
  // The fixture is the shape the contract names.
  expect(session.matches(CONVERSATION_SESSION_SELECTOR)).toBe(true)
  session.setAttribute(CONVERSATION_SESSION_ATTRIBUTE, 'session-two')
  writeScroll(scroller, 100, 'follow')
  expect(submissionHolds()).toBe(false)
})

test('under reduced motion an ease is its destination written at once', () => {
  setMotion(MOTION_REDUCED)
  const scroller = scrollBox(CONVERSATION_SCROLL_SELECTOR)
  expect(easeScrollFor(scroller, 'jump', () => 400, wanted)).toBe(true)
  expect(scroller.scrollTop).toBe(400)
})

test('only intents that move a position count as the reader moving', () => {
  join()
  scrollBox(CONVERSATION_SCROLL_SELECTOR)
  const since = performance.now()
  // The clock is coarse: an intent in the same tick would read as not after `since`.
  while (performance.now() === since) { /* wait for the next tick */ }
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
  expect(readerMovedSince(since)).toBe(false)
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageDown', bubbles: true }))
  expect(readerMovedSince(since)).toBe(true)
})

test('a wheel, a drag of the scrollbar strip and an upward key are each the reader taking the conversation over', async () => {
  setMotion(MOTION_FULL)
  join()
  const scroller = scrollBox(CONVERSATION_SCROLL_SELECTOR)
  scroller.scrollTop = scroller.scrollHeight
  await settledScroll(scroller)

  // Each intent is measured against a reading taken before it, and the clock
  // is coarse: the wait puts the intent in a tick after the reading.
  const over = async (dispatch: () => void) => {
    const since = performance.now()
    while (performance.now() === since) { /* wait for the next tick */ }
    dispatch()
    expect(readerMovedSince(since)).toBe(true)
  }
  await over(() => scroller.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -120 })))
  // The strip stands past clientWidth, the way a classic scrollbar does.
  const box = scroller.getBoundingClientRect()
  await over(() => scroller.dispatchEvent(new PointerEvent('pointerdown', {
    bubbles: true,
    button: 0,
    clientX: box.left + scroller.clientWidth + 2,
    clientY: box.top + 4,
  })))
  await over(() => document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true })))
})

test('a press on the words selects text and is no movement of the conversation', async () => {
  setMotion(MOTION_FULL)
  join()
  const scroller = scrollBox(CONVERSATION_SCROLL_SELECTOR)
  const box = scroller.getBoundingClientRect()
  const since = performance.now()
  while (performance.now() === since) { /* wait for the next tick */ }
  scroller.dispatchEvent(new PointerEvent('pointerdown', {
    bubbles: true,
    button: 0,
    clientX: box.left + 4,
    clientY: box.top + 4,
  }))
  expect(readerMovedSince(since)).toBe(false)
})

test('a jump to a place the reader picked is a move of his own, a follow is not', () => {
  setMotion(MOTION_FULL)
  const scroller = scrollBox(CONVERSATION_SCROLL_SELECTOR)
  const since = performance.now()
  while (performance.now() === since) { /* wait for the next tick */ }
  expect(navigationMovedSince(since)).toBe(false)
  expect(easeScrollToEndFor(scroller, 'follow', wanted)).toBe(true)
  expect(navigationMovedSince(since)).toBe(false)
  expect(writeScroll(scroller, 400, 'jump')).toBe(true)
  expect(navigationMovedSince(since)).toBe(true)
})

test('once the last member leaves, intents are no longer heard', () => {
  const leave = join()
  scrollBox(CONVERSATION_SCROLL_SELECTOR)
  leave()
  const since = performance.now()
  while (performance.now() === since) { /* wait for the next tick */ }
  document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'PageUp', bubbles: true }))
  expect(readerMovedSince(since)).toBe(false)
})
