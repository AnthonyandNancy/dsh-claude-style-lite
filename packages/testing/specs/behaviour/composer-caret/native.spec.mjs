/**
 * Lite leaves the browser's caret alone: the composer's caret colour is not
 * transparent, no drawn layer stands in the page, and typing still works.
 *
 * @capability composer-caret
 * @features composer
 * @risk A reader cannot see where typing will land, or the skin keeps a transparent caret after removing its own.
 */
import { spec, host, retiredMark } from '../../fixtures/behaviour.mjs'

const FIELD = host('composer.input')
/** The retired layer and mark, read off the removal record the lanes share. */
const RETIRED_LAYER = retiredMark('caretLayer')
const RETIRED_MARK = retiredMark('caretMark')

export default spec({ page: 'composer' }, ({ test }) => {
  test('the composer keeps the native caret', async (t) => {
    await t.page.locator(FIELD).click()
    const reading = await t.page.evaluate(([field, layer, mark]) => {
      const element = document.querySelector(field)
      return {
        caret: getComputedStyle(element).caretColor,
        layers: document.querySelectorAll(layer).length,
        marks: document.querySelectorAll(mark).length,
      }
    }, [FIELD, RETIRED_LAYER, RETIRED_MARK])
    t.expectThat.equal(reading.caret !== 'rgba(0, 0, 0, 0)', true, `the native caret is visible (${reading.caret})`)
    t.expectThat.equal(reading.layers, 0, 'no drawn caret layer stands')
    t.expectThat.equal(reading.marks, 0, 'no drawn caret mark stands')
  })
})
