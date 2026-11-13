/**
 * The skin hands the follow back to the host's own control (D40, D100): while the
 * reader has not moved the page himself, a lost follow is given back by one press
 * of the host's back-to-end button, and the position is walked to the end first.
 *
 * @capability scroll-ownership
 * @features engine
 * @risk After a layout change takes the host's follow away, content keeps growing above the tail; or the skin presses the host's button while the reader is reading higher up.
 */
import { expect, test } from 'vitest'
import { adoptSkin } from '@dsh-claude-style/engine/skin'
import { handBackFollow } from '@dsh-claude-style/engine/scroll-owner'
import { CHAT_FLOW_SELECTOR, FOLLOWING_TAIL_ATTRIBUTE } from '@dsh-claude-style/contracts/dom'
import { hostElement } from '../../fixtures/host-markup'
import { ownedPage, wait } from '../../fixtures/scroll-owner'
import { TEST_SKIN } from '../../fixtures/vocabulary'
import { createScrollOwnerFixture } from '../../fixtures/scroll-owner'

adoptSkin(TEST_SKIN)

const cleanups = ownedPage()

const { scrollBox, join } = createScrollOwnerFixture(cleanups)

/**
 * The host's frame around the follow button: the scroller holds the flow column,
 * and the button stands beside the frame, outside the scroller, so it is the
 * shape `findFollowTailButton` reads (engine/chat-dom.ts). Its click is the
 * host's returnToBottom: the follow mark comes on and the position goes to the
 * tail.
 */
function followFrame() {
  join()
  const scroller = scrollBox()
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
  return { scroller, button, presses }
}

test('a lost follow is handed back by one press of the host button', async () => {
  const { button, presses } = followFrame()
  handBackFollow('follow')
  await wait(1200)
  expect(presses).toHaveLength(1)
  expect(button.isConnected).toBe(true)
})

test('a reader who took the position himself gets no press', async () => {
  const { presses } = followFrame()
  handBackFollow('follow', { stillWanted: () => false })
  await wait(1200)
  expect(presses).toHaveLength(0)
})

test('the hand-back walks the position to the end before it presses', async () => {
  const { scroller, presses } = followFrame()
  scroller.scrollTop = 0
  handBackFollow('follow')
  await wait(1200)
  expect(presses).toHaveLength(1)
  expect(scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop).toBe(0)
})

test('a settle callback runs once the round is over', async () => {
  const { presses } = followFrame()
  let settled = 0
  handBackFollow('follow', { onSettled: () => { settled += 1 } })
  await wait(1200)
  expect(presses).toHaveLength(1)
  expect(settled).toBe(1)
})
