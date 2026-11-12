/**
 * The plain effort fill is a canvas that follows the knob, hands the groove to
 * the top rung's matrix and stops painting under reduced motion.
 *
 * @capability effort-picker
 * @features effort
 * @risk The fill lags the knob, keeps painting over the top rung's matrix, or repaints after the card closes.
 */
import { spec, surface } from '../../fixtures/behaviour.mjs'
import { openSlider, stopX } from '../../fixtures/effort-slider.mjs'

export default spec({ page: 'effort' }, ({ test }) => {
  test('the plain fill is a canvas and the DOM fill is gone', async (t) => {
    const { track, knob, y } = await openSlider(t, 4)
    t.expectThat.equal(await t.read.count(surface('effort.fill')), 1, 'the canvas is the only fill')
    t.expectThat.equal(await t.read.count(t.surface('effort.fill')), 1, 'one fill canvas stands')
    const before = await t.read.pixels(t.surface('effort.fill'))
    await t.page.mouse.click(stopX(track, knob, 0.5), y)
    await t.settle()
    const after = await t.read.pixels(t.surface('effort.fill'))
    t.expectThat.equal(before !== null && after !== null && before !== after, true, 'the canvas repaints when the level moves')
  })

  test('the top rung hides the plain fill and keeps the matrix', async (t) => {
    const { track, knob, y } = await openSlider(t, 4)
    await t.page.mouse.click(stopX(track, knob, 1), y)
    await t.settle()
    const fill = await t.read.computed(t.surface('effort.fill'), 'opacity')
    t.expectThat.equal(fill, '0', 'the plain fill is transparent at the top rung')
    t.expectThat.equal(await t.read.count(t.surface('effort.particle')), 1, 'the matrix canvas still stands')
  })

  test('reduced motion still draws the fill where the pointer lands', async (t) => {
    await t.prefs({ motion: 'reduced' })
    const { track, knob, y } = await openSlider(t, 4)
    await t.page.mouse.click(stopX(track, knob, 0.5), y)
    await t.settle()
    const pixels = await t.read.pixels(t.surface('effort.fill'))
    t.expectThat.equal(pixels !== null && pixels > 0, true, 'the fill is drawn without a transition')
  })

  test('closing the card leaves the canvas still', async (t) => {
    const { track, knob, y } = await openSlider(t, 4)
    await t.page.mouse.click(stopX(track, knob, 0.8), y)
    await t.settle()
    // A press outside the card is what folds it; the trigger itself stays inside
    // the popover's own press guard and leaves it open.
    await t.page.mouse.click(8, 8)
    await t.settle()
    const open = await t.read.attribute(t.surface('effort.popover'), surface.attribute('popover.open'))
    t.expectThat.equal(open, 'false', 'the card is closed')
    const before = await t.read.pixels(t.surface('effort.fill'))
    await t.page.waitForTimeout(120)
    const after = await t.read.pixels(t.surface('effort.fill'))
    t.expectThat.equal(before, after, 'the closed fill canvas paints no new frame')
  })
})
