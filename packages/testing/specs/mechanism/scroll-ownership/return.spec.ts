/**
 * The host's back-to-end button is the reader's answer with the follow: its
 * press ends the reader hold before the host moves the position to the tail, so
 * the growth that follows belongs to the host's follow (D40).
 *
 * @capability scroll-ownership
 * @features engine
 * @risk After the reader presses the host's back-to-end button, the next piece of content writes the position the reader left back over the tail and the window jumps to the top.
 */
import { afterEach, expect, test } from 'vitest'
import { adoptSkin } from '@dsh-claude-style/engine/skin'
import { readerHolds, readerScrollPosition } from '@dsh-claude-style/engine/scroll-owner'
import { CHAT_FLOW_SELECTOR, CONVERSATION_SCROLL_SELECTOR, FOLLOWING_TAIL_ATTRIBUTE } from '@dsh-claude-style/contracts/dom'
import { TEST_SKIN } from '../../fixtures/vocabulary'
import { hostElement } from '../../fixtures/host-markup'
import { createScrollOwnerFixture } from '../../fixtures/scroll-owner'

adoptSkin(TEST_SKIN)

const wait = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds))
const cleanups: (() => void)[] = []
afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()!()
})

const { scrollBox, join } = createScrollOwnerFixture(cleanups)

/**
 * The host's frame around the follow button: the scroller holds the flow
 * column, and the button stands beside the frame, outside the scroller, so a
 * press on it reaches no scroll intent the owner hears (engine/chat-dom.ts's
 * findFollowTailButton). Its click is the host's returnToBottom: the follow
 * mark comes on and the position goes to the tail.
 */
function followFrame() {
  join()
  const scroller = scrollBox(CONVERSATION_SCROLL_SELECTOR)
  const column = hostElement(CHAT_FLOW_SELECTOR)
  column.style.height = '2000px'
  scroller.replaceChildren(column)
  const button = document.createElement('button')
  button.type = 'button'
  const presses: number[] = []
  button.addEventListener('click', () => {
    presses.push(performance.now())
    scroller.setAttribute(FOLLOWING_TAIL_ATTRIBUTE, '')
    scroller.scrollTop = scroller.scrollHeight
  })
  const frame = document.createElement('div')
  const slot = document.createElement('div')
  const outer = document.createElement('div')
  slot.append(button)
  frame.append(scroller)
  outer.append(frame, slot)
  document.body.append(outer)
  cleanups.push(() => outer.remove())
  return { scroller, column, button, presses }
}

/** The host's own follow pinning the end as content grows. */
function pinTail(scroller: HTMLElement) {
  scroller.scrollTop = scroller.scrollHeight
}

test('the host back-to-end button ends the reader hold and keeps the position at the tail', async () => {
  const { scroller, button, presses } = followFrame()
  scroller.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -120 }))
  scroller.scrollTop = 0
  expect(readerHolds(scroller)).toBe(true)
  expect(readerScrollPosition(scroller)).toBe(0)
  button.click()
  expect(presses).toHaveLength(1)
  expect(readerHolds(scroller)).toBe(false)
  expect(readerScrollPosition(scroller)).toBeNull()
  expect(scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop).toBe(0)
  await wait(50)
  expect(scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop).toBe(0)
})

test('content growing after the host button press stays at the tail the host pins', async () => {
  const { scroller, column, button, presses } = followFrame()
  scroller.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -120 }))
  scroller.scrollTop = 0
  button.click()
  expect(presses).toHaveLength(1)
  const piece = document.createElement('div')
  piece.style.height = '600px'
  column.append(piece)
  pinTail(scroller)
  await wait(50)
  expect(presses).toHaveLength(1)
  expect(readerHolds(scroller)).toBe(false)
  expect(scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop).toBe(0)
})

test('a keyboard activation of the host button ends the reader hold the same way', async () => {
  const { scroller, button } = followFrame()
  scroller.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -120 }))
  scroller.scrollTop = 0
  expect(readerHolds(scroller)).toBe(true)
  button.focus()
  button.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
  button.click()
  expect(readerHolds(scroller)).toBe(false)
  expect(scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop).toBe(0)
})

test('the reader who scrolls up again after the button press holds the new position', async () => {
  const { scroller, button } = followFrame()
  scroller.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -120 }))
  scroller.scrollTop = 0
  button.click()
  expect(readerHolds(scroller)).toBe(false)
  const scrolled = new Promise(resolve => scroller.addEventListener('scroll', resolve, { once: true }))
  scroller.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -120 }))
  scroller.scrollTop = 200
  await scrolled
  expect(readerHolds(scroller)).toBe(true)
  expect(readerScrollPosition(scroller)).toBe(200)
})
