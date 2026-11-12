/**
 * The details control stays in the header whether the panel opens by default
 * or not; the preference only chooses the first state of each session.
 *
 * @capability session-panel
 * @features session-panel
 * @risk Turning the default off removes the entry, or a reader’s close is overridden in the same session.
 */
import { spec } from '../../fixtures/behaviour.mjs'

export default spec({ page: 'conversation' }, ({ test }) => {
  test('the entry stays while the default decides the opening state', async (t) => {
    await t.prefs({ sessionPanelOpenByDefault: true })
    await t.settle()
    // The control is the conversation header's pressed toggle; the rail is the
    // labelled complementary column it opens.
    const opened = await t.page.evaluate(() => ({
      control: document.querySelector('button[aria-pressed][aria-label]') !== null,
      rail: document.querySelector('aside[aria-label]') !== null,
    }))
    t.expectThat.equal(opened.control, true, 'the header control stands with the default on')
    t.expectThat.equal(opened.rail, true, 'the rail opens by default')

    await t.prefs({ sessionPanelOpenByDefault: false })
    await t.settle()
    const closed = await t.page.evaluate(() => {
      const control = document.querySelector('button[aria-pressed][aria-label]')
      return {
        control: control !== null,
        pressed: control?.getAttribute('aria-pressed'),
        rail: document.querySelector('aside[aria-label]') !== null,
      }
    })
    t.expectThat.equal(closed.control, true, 'the header control stays with the default off')
    t.expectThat.equal(closed.pressed, 'false', 'the control reports the rail as closed')
    t.expectThat.equal(closed.rail, false, 'the rail stays closed')
  })
})
