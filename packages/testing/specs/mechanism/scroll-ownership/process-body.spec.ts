/**
 * A capped process body follows its own end while the content streams (D40,
 * D100). The reader who scrolls it away is not chased; once he brings it back to
 * its end, the next growth follows again.
 *
 * @capability scroll-ownership
 * @features engine
 * @risk A streaming tool body leaves the reader's own reading of it dragged to its end, or stops following after the reader scrolled back.
 */
import { expect, test } from 'vitest'
import { adoptSkin } from '@dsh-claude-style/engine/skin'
import { CATCH_UP_GAP_PX, createChatProcessFollow } from '@dsh-claude-style/client/pure'
import { PROCESS_BODY_SELECTOR, PROCESS_CONTENT_SELECTOR } from '@dsh-claude-style/contracts/dom'
import { attach } from '../../fixtures/host-markup'
import { ownedPage, wait } from '../../fixtures/scroll-owner'
import { TEST_SKIN } from '../../fixtures/vocabulary'

adoptSkin(TEST_SKIN)
const cleanups = ownedPage()

/** A capped body with a 2000px content layer, the shape the host mounts. */
function bodyFixture() {
  const body = attach(document.body, PROCESS_BODY_SELECTOR)
  body.style.cssText = 'height:100px;overflow-y:auto'
  const content = attach(body, PROCESS_CONTENT_SELECTOR)
  content.style.height = '2000px'
  cleanups.push(() => body.remove())
  return { body, content }
}

const gapOf = (body: HTMLElement) => Math.round(body.scrollHeight - body.clientHeight - body.scrollTop)

/** Take the body to a position and let the follower read it. */
async function goTo(body: HTMLElement, top: number) {
  body.scrollTop = top
  await wait(120)
}

/** Grow the content layer, and let the follower answer the growth. */
async function grow(content: HTMLElement) {
  content.style.height = '3000px'
  await wait(800)
}

test('content growing under a body at its end is walked back to the end', async () => {
  const stop = createChatProcessFollow()
  cleanups.push(stop)
  const { body, content } = bodyFixture()
  await goTo(body, body.scrollHeight)
  await grow(content)
  expect(gapOf(body)).toBeLessThanOrEqual(CATCH_UP_GAP_PX)
})

test('a body the reader scrolled away is left where he put it', async () => {
  const stop = createChatProcessFollow()
  cleanups.push(stop)
  const { body, content } = bodyFixture()
  await goTo(body, body.scrollHeight)
  await goTo(body, 300)
  await grow(content)
  expect(body.scrollTop).toBe(300)
})

test('a body the reader brought back to its end follows the next growth again', async () => {
  const stop = createChatProcessFollow()
  cleanups.push(stop)
  const { body, content } = bodyFixture()
  await goTo(body, body.scrollHeight)
  await goTo(body, 300)
  await goTo(body, body.scrollHeight)
  await grow(content)
  expect(gapOf(body)).toBeLessThanOrEqual(CATCH_UP_GAP_PX)
})
