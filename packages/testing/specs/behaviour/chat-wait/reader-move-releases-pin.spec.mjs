/**
 * A reader who wheels up from a running turn's status line sees the line travel
 * with the transcript at once, rather than staying pinned over what he went
 * back to read while the host waits out its sample window (D100, D101).
 *
 * @capability chat-wait
 * @features chat-wait, chat-follow
 * @risk The status line floats over the reader's chosen place for the host's whole sampling window and jumps down when the host finally turns its follow off.
 */
import { spec } from '../../fixtures/behaviour.mjs'
import { CHAT_FLOW_SELECTOR, CHAT_RUNNING_SELECTOR, CONVERSATION_SCROLL_SELECTOR, FOLLOWING_TAIL_ATTRIBUTE, STREAMING_ATTRIBUTE } from '@dsh-claude-style/contracts/dom'

export default spec({ page: 'chat-follow' }, ({ test }) => {
  test('a reader move releases the status line pin on the next frame', async (t) => {
    const followingAttr = FOLLOWING_TAIL_ATTRIBUTE
    const movedAttr = t.surface.attribute('chat-wait.reader-moved')
    const waitTailAttr = t.surface.attribute('chat-wait.tail')

    const result = await t.page.evaluate(async ([
      scrollerSel, runningSel, flowSel, followingAttr, movedAttr, waitTailAttr, streamAttr,
    ]) => {
      const box = document.querySelector(scrollerSel)
      const frame = document.querySelector('#debugFollowing')
      const column = frame === null ? null : frame.querySelector(flowSel)
      if (box === null || frame === null || column === null) throw new Error('the chat-follow stand-in page is missing its scroller, frame or flow')
      frame.setAttribute(followingAttr, '')
      column.innerHTML = ''
      column.style.cssText = 'height:648px;display:flex;flex-direction:column'
      const filler = document.createElement('div')
      filler.style.height = '600px'
      const stream = document.createElement('div')
      stream.setAttribute(streamAttr, '')
      stream.style.height = '24px'
      const row = document.createElement('div')
      row.setAttribute(runningSel.slice(1, -1), '')
      row.setAttribute(waitTailAttr, '')
      row.style.cssText = 'height:24px;display:flex;align-items:center'
      row.textContent = '正在思考'
      column.append(filler, stream, row)
      document.body.style.setProperty('--dsh-composer-height', '24px')
      box.scrollTop = box.scrollHeight
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

      const pinnedBefore = getComputedStyle(row).position === 'sticky'
      const topBefore = row.getBoundingClientRect().top
      box.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: -300 }))
      box.scrollTop = Math.max(0, box.scrollTop - 300)
      await new Promise((resolve) => requestAnimationFrame(resolve))
      const pinnedAfter = getComputedStyle(row).position === 'sticky'
      const topAfter = row.getBoundingClientRect().top
      const marked = box.hasAttribute(movedAttr)

      // The reader comes back to the end; the host's next follow edge says so.
      box.scrollTop = box.scrollHeight
      frame.removeAttribute(followingAttr)
      frame.setAttribute(followingAttr, '')
      await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
      const pinnedAgain = getComputedStyle(row).position === 'sticky'

      column.innerHTML = ''
      return { pinnedBefore, pinnedAfter, pinnedAgain, topBefore, topAfter, marked }
    }, [CONVERSATION_SCROLL_SELECTOR, CHAT_RUNNING_SELECTOR, CHAT_FLOW_SELECTOR, followingAttr, movedAttr, waitTailAttr, STREAMING_ATTRIBUTE])

    t.expectThat.equal(result.pinnedBefore, true, 'the status line starts pinned at the tail')
    t.expectThat.equal(result.marked, true, 'the reader move is marked on the conversation')
    t.expectThat.equal(result.pinnedAfter, false, 'the pin releases on the frame after the wheel')
    t.expectThat.equal(result.pinnedAgain, true, 'the host follow edge restores the pin')
    t.expectThat.equal(result.topAfter > result.topBefore, true, `the line moves with the transcript (${result.topBefore} → ${result.topAfter})`)
  }, { frames: true })
})
