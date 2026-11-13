/**
 * User-message folding follows structural changes without depending on a scan
 * of every assistant-text update.
 *
 * @capability message-fold
 * @features chat-fold
 * @risk A user message arrives or its bubble is replaced while content-only passes are skipped, leaving a long message uncapped or leaving its old fold control behind.
 */
import { spec } from '../../fixtures/behaviour.mjs'

/**
 * Mount one long user message under the stand-in scroller.
 * The optional observer question counts the shared ResizeObserver's calls
 * against the message, which is where a registration left behind shows.
 */
function mountLongMessage([scrollerSelector, flow, kind, bubble, key, watchObserver]) {
  if (watchObserver) {
    // cost: D40 — the shared observer owns every registration, so its own calls are where a leaked one shows.
    const target = ResizeObserver.prototype
    const observe = target.observe
    const unobserve = target.unobserve
    const held = new Map()
    window.__messageFoldRegistrations = held
    target.observe = function (element) {
      held.set(element, (held.get(element) ?? 0) + 1)
      return observe.call(this, element)
    }
    target.unobserve = function (element) {
      held.set(element, (held.get(element) ?? 0) - 1)
      return unobserve.call(this, element)
    }
  }
  const column = document.createElement('div')
  column.setAttribute(flow, '')
  const row = document.createElement('div')
  row.setAttribute(kind, 'user')
  const message = document.createElement('div')
  message.setAttribute(bubble, '')
  for (let index = 0; index < 30; index += 1) {
    const line = document.createElement('div')
    line.style.height = '24px'
    line.textContent = `A long user message line ${index}`
    message.append(line)
  }
  row.append(message)
  column.append(row)
  document.querySelector(scrollerSelector).prepend(column)
  window[key] = { column, row, message }
}

export default spec({ page: 'chat-fold' }, ({ test }) => {
  test('new, replaced and reattached user bubbles keep exactly one fold control', async (t) => {
    await t.prefs({ chatAnimations: true, motion: 'full' })
    const scroller = t.host('chat.scroller')
    const flowAttribute = t.host.attribute('chat.flow')
    const kindAttribute = t.host('chat.user-row')
    const streamingAttribute = t.host('chat.streaming-attribute')
    const bubbleAttribute = t.host.attribute('chat.message-bubble')
    const foldAttribute = t.surface.attribute('chat.message-fold')
    const toggle = t.surface('chat.message-fold-toggle')
    await t.page.evaluate(mountLongMessage, [scroller, flowAttribute, kindAttribute, bubbleAttribute, '__messageFoldFixture', false])

    const folded = () => t.page.evaluate((attribute) => window.__messageFoldFixture.message.hasAttribute(attribute), foldAttribute)
    await t.page.waitForSelector(toggle, { timeout: 5000 })
    t.expectThat.equal(await t.page.locator(toggle).count(), 1, 'the new long message gets one control')
    t.expectThat.equal(await folded(), true, 'the new long message is capped')

    await t.page.evaluate((attribute) => {
      const fixture = window.__messageFoldFixture
      const replacement = fixture.message.cloneNode(true)
      replacement.removeAttribute(attribute)
      fixture.message.replaceWith(replacement)
      fixture.message = replacement
    }, foldAttribute)
    await t.page.waitForFunction((attribute) => window.__messageFoldFixture.message.hasAttribute(attribute), foldAttribute, { timeout: 5000 })
    t.expectThat.equal(await t.page.locator(toggle).count(), 1, 'replacing the bubble carries no old control over')

    await t.page.evaluate(() => {
      const fixture = window.__messageFoldFixture
      fixture.row.remove()
    })
    await t.settle()
    await t.page.evaluate(() => {
      const fixture = window.__messageFoldFixture
      fixture.column.append(fixture.row)
    })
    await t.settle()
    t.expectThat.equal(await t.page.locator(toggle).count(), 1, 'reattaching the row rebuilds one control')
    t.expectThat.equal(await folded(), true, 'the reattached message is measured again')

    await t.page.evaluate(([kind, streaming]) => {
      const answer = document.createElement('div')
      answer.setAttribute(kind, 'assistant-step')
      answer.setAttribute(streaming, '')
      window.__messageFoldFixture.column.append(answer)
      window.__messageFoldFixture.answer = answer
    }, [kindAttribute, streamingAttribute])
    for (let index = 0; index < 3; index += 1) {
      await t.page.evaluate((index) => {
        window.__messageFoldFixture.answer.textContent += ` streamed ${index}`
      }, index)
      await t.settle()
      t.expectThat.equal(await t.page.locator(toggle).count(), 1, 'assistant growth leaves the user control alone')
      t.expectThat.equal(await folded(), true, 'assistant growth preserves the user message state')
    }
    await t.page.evaluate(() => {
      window.__messageFoldFixture.column.remove()
      delete window.__messageFoldFixture
    })
  })

  test('a message left behind by a removed row stops its size observation', async (t) => {
    await t.prefs({ chatAnimations: true, motion: 'full' })
    const scroller = t.host('chat.scroller')
    const flowAttribute = t.host.attribute('chat.flow')
    const kind = t.host('chat.user-row')
    const bubbleAttribute = t.host.attribute('chat.message-bubble')
    const toggle = t.surface('chat.message-fold-toggle')
    await t.page.evaluate(mountLongMessage, [scroller, flowAttribute, kind, bubbleAttribute, '__detachedBubble', true])

    await t.page.waitForSelector(toggle, { timeout: 5000 })
    const registrations = () => t.page.evaluate(() => window.__messageFoldRegistrations.get(window.__detachedBubble.message) ?? 0)
    t.expectThat.equal(await registrations(), 1, 'the foldable message is observed once while its row stands')
    await t.page.evaluate(() => {
      window.__detachedBubble.row.remove()
    })
    await t.settle()
    t.expectThat.equal(await registrations(), 0, 'the message left behind by the removed row is no longer observed')
    await t.page.evaluate(() => {
      window.__detachedBubble.column.remove()
      delete window.__detachedBubble
    })
  })
})
