#!/usr/bin/env node
/**
 * reader-scroll.mjs — the reader's own scrolling during a live turn, end to end
 * (D40, D92).
 *
 * Registered in the lane's scenario table (packages/testing/scenarios.mjs). It
 * samples the page itself: the frames the shared trace carries are the scroll
 * behaviour's, and this scenario's reading is the status line's own pin.
 *
 * The status line of a running turn is pinned above the composer. The pin stands
 * only while the host follows the end: the reader who wheels back to read has to
 * find the line travelling with the content rather than floating at the pinned
 * spot over what he went back to read. The scenario wheels once, mid-turn, and
 * reads the frames it recorded.
 */
import surfaceTable from '../data/surface.json' with { type: 'json' }
import { bound } from '../bounds.mjs'

/** The host's page markers this scenario reads, as packages/testing/lane.mjs names them. */
const HOST = {
  scroller: '[data-conversation-scroll]', // CONVERSATION_SCROLL_SELECTOR
  running: '[data-chat-running]', // CHAT_RUNNING_SELECTOR
}

/** The host's own mark that content follows the end (FOLLOWING_TAIL_SELECTOR, packages/contracts/src/dom.ts). */
const FOLLOWING_TAIL = '[data-chat-following-tail]'
/** The skin's mark on the scroller while the reader's own move stands (surface.json, D101). */
const READER_MOVED = surfaceTable.surface.find((entry) => entry.id === 'chat-wait.reader-moved').attribute

/** How much of the pinned row's own height a frame may sit within and still count as floating at the pin. */
const PIN_SLACK_PX = bound('readerScrollPinSlackPx')
/** How far the tail has to sit from the end for the pin to have something to hold against. */
const TAIL_THRESHOLD_PX = bound('readerScrollTailThresholdPx')

/** How far the position is from the conversation's end. */
const gapOf = (page) => page.evaluate((host) => {
  const scroller = document.querySelector(host.scroller)
  return scroller === null ? 0 : Math.round(scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop)
}, HOST)

/**
 * Sample the page once per frame until the turn settles: what the reader left
 * behind, the row's place on screen, and whether the pin is on it. The row is
 * pinned exactly when the stylesheet's `position: sticky` applies.
 *
 * @param page - the lane's page.
 * @returns once the sampler is running; the frames land in the page's own global.
 */
function watch(page) {
  return page.evaluate((host) => {
    const trace = []
    window.__readerScrollTrace = trace
    const sample = () => {
      const scroller = document.querySelector(host.scroller)
      const row = document.querySelector(host.running)
      const movedAttr = host.movedAttr
      trace.push({
        top: scroller === null ? null : Math.round(scroller.scrollTop),
        gap: scroller === null ? null : Math.round(scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop),
        row: row === null ? null : Math.round(row.getBoundingClientRect().top),
        pinned: row !== null && getComputedStyle(row).position === 'sticky',
        moved: scroller !== null && scroller.hasAttribute(movedAttr),
      })
      if (trace.length < 6000) requestAnimationFrame(sample)
    }
    requestAnimationFrame(sample)
  }, { ...HOST, movedAttr: READER_MOVED })
}

function readerScrollScenario({ check }) {
  return {
    script: 'long',
    prompt: 'write a long answer',
    delayMs: 300,
    viewport: { width: 1280, height: 600 },
    /**
     * Wait for the shape this asks about — a running turn, the tail followed,
     * the transcript taller than the viewport, the status line pinned — then
     * wheel up over the transcript, the way a reader goes back to read. What
     * the wheel left behind is written beside the frames it is measured against.
     */
    async duringTurn({ page }) {
      await watch(page)
      await page.waitForFunction((marks) => {
        const row = document.querySelector(marks.running)
        const scroller = document.querySelector(marks.scroller)
        if (row === null || scroller === null) return false
        // The sampler has to have a phase of its own before the wheel: the
        // pinned spot is read off the frames it recorded.
        if ((window.__readerScrollTrace ?? []).length < 40) return false
        if (scroller.scrollHeight <= scroller.clientHeight) return false
        if (scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop > marks.atTail) return false
        return getComputedStyle(row).position === 'sticky'
      }, { ...HOST, atTail: TAIL_THRESHOLD_PX }, { timeout: 20000 })
      const box = await page.locator(HOST.scroller).boundingBox()
      const row = await page.locator(HOST.running).boundingBox()
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.wheel(0, -400)
      // The wheel is the reader's move: the host's sample settles it and turns
      // its own follow off. What is waited for is that mark going away, not a
      // position — the position is only recorded, as what the frames are
      // measured against.
      await page.waitForFunction((marks) => {
        if (document.querySelector(marks.followingTail) !== null) return false
        const scroller = document.querySelector(marks.scroller)
        if (scroller === null || !scroller.hasAttribute(marks.movedAttr)) return false
        return scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop > 0
      }, { followingTail: FOLLOWING_TAIL, movedAttr: READER_MOVED, ...HOST }, { timeout: 5000 })
      const frame = await page.evaluate(() => (window.__readerScrollTrace ?? []).length)
      const position = await page.evaluate((selector) => {
        const scroller = document.querySelector(selector)
        return scroller === null ? null : Math.round(scroller.scrollTop)
      }, HOST.scroller)
      const gap = await gapOf(page)
      await page.evaluate((left) => {
        window.__readerScrollLeft = left
      }, { frame, row: Math.round(row.y), gap, top: position })
    },
    async assert({ page, session }) {
      const trace = await page.evaluate(() => window.__readerScrollTrace ?? [])
      const left = await page.evaluate(() => window.__readerScrollLeft ?? null)
      const followingNow = await page.evaluate((mark) => document.querySelector(mark) !== null, FOLLOWING_TAIL)
      const before = left === null ? [] : trace.slice(0, left.frame)
      const after = left === null ? [] : trace.slice(left.frame)
      // The pinned spot is a number the frames themselves carry: read it off the
      // phase the reader left, so the check does not restate the CSS.
      const spots = before.filter((frame) => frame.pinned && frame.row !== null).map((frame) => frame.row)
      const pinnedSpot = spots.length === 0 ? null : Math.max(...spots)
      const pinnedAfter = after.filter((frame) => frame.pinned)
      // The reader's move is marked from the frame it lands, and stays marked
      // while the host's sample closes its follow.
      const movedAfter = after.filter((frame) => !frame.moved)
      // Floating: a frame whose row sits at the pinned spot while the reader is
      // hundreds of pixels away from the tail it belongs to.
      const floated = after.filter((frame) => frame.pinned && frame.row !== null
        && !(frame.row > left.row && frame.row < left.row + PIN_SLACK_PX))
      return [
        check('逐帧采样真的在跑', trace.length > 30 && left !== null && left.frame > 30, `${trace.length} frames, the wheel at ${left === null ? 'n/a' : left.frame}`),
        check('读者的滚动发生在状态行钉住时', left !== null && pinnedSpot !== null && Math.abs(left.row - pinnedSpot) <= 2, `the wheel at row ${left === null ? 'n/a' : left.row}, the pinned spot ${pinnedSpot === null ? 'never pinned' : `${pinnedSpot}px`} (${spots.length} frames)`),
        check('滚动之后宿主不再跟随末尾', left !== null && !followingNow, left === null ? 'no reader phase in the trace' : `gap ${left.gap}px when the wheel landed`),
        check('读者滚动期间状态行不再钉住', left !== null && pinnedAfter.length === 0, `${pinnedAfter.length} pinned of ${after.length} frames after the wheel`),
        check('读者的移动从滚轮后的第一帧起就留在对话容器上', left !== null && movedAfter.length === 0, `${movedAfter.length} of ${after.length} frames without the move mark`),
        check('宿主的跟随一直关着', left !== null && !followingNow, `the host follows the end at the end of the turn: ${followingNow}`),
        check('后续增长不改变读者选择的滚动位置', left !== null && left.top !== null && after.length > 10 && after.every((frame) => frame.top === left.top), left === null ? 'no reader position' : `wanted ${left.top}px, readings ${[...new Set(after.map((frame) => frame.top))].join('/')}px`),
        check('状态行不再浮在内容上', floated.length === 0, floated.length === 0 ? 'held its document place' : `${floated.length} frames at the pinned spot`),
        check('控制台没有异常', session.problems.length === 0, session.problems.slice(0, 3).join(' | ')),
      ]
    },
  }
}

export { readerScrollScenario }
