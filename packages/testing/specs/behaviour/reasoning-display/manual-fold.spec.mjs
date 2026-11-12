/**
 * The host's own reasoning disclosure stays manual in Lite: a running row is
 * not pressed open, and the stepped text window still follows an expanded row
 * without changing its expanded state.
 *
 * @capability reasoning-display
 * @features chat-fold
 * @risk A reader who collapses or expands a thinking row has the skin override that decision, or a streaming row stops updating its stepped window.
 */
import { spec, host, surface } from '../../fixtures/behaviour.mjs'
import { EXPANDED_ATTRIBUTE, ROW_PHASE_ATTRIBUTE, RUNNING_STATE } from '@dsh-claude-style/contracts/dom'

const WINDOW = surface('chat.reason-window')

export default spec({ page: 'chat-fold' }, ({ test }) => {
  test('a running thinking row is never pressed, and an expanded row still takes a window', async (t) => {
    await t.prefs({ chatAnimations: true, motion: 'full', reasoningDisplay: 'stepped' })
    const result = await t.page.evaluate(async ([think, reasoning, phase, running, expanded, windowMark]) => {
      const build = (tag, pairs) => {
        const element = document.createElement(tag)
        for (const [name, value] of pairs) element.setAttribute(name, value)
        return element
      }
      const frames = (count) => new Promise((resolve) => {
        const step = () => (count -= 1) === 0 ? resolve() : requestAnimationFrame(step)
        requestAnimationFrame(step)
      })
      // A row that arrives while the turn runs, as a live stream adds one: the
      // fixture's own rows were settled when the skin installed.
      const row = build('div', [[phase, running], ...think])
      const control = build('button', [['type', 'button']])
      control.textContent = 'Thinking'
      control.addEventListener('click', () => row.toggleAttribute(expanded))
      let presses = 0
      control.addEventListener('click', () => { presses += 1 }, true)
      const body = build('div', [])
      const text = build('div', reasoning)
      text.textContent = 'reasoning line'
      body.append(text)
      row.append(control, body)
      document.body.append(row)
      await frames(2)
      const afterRunning = presses
      // A reader expands the row; the stepped window follows the text without a press.
      row.setAttribute(expanded, '')
      await frames(2)
      return { afterRunning, windows: row.querySelectorAll(windowMark).length }
    }, [host.attributes('chat.think-row'), host.attributes('chat.reasoning-text'), ROW_PHASE_ATTRIBUTE, RUNNING_STATE, EXPANDED_ATTRIBUTE, WINDOW])

    t.expectThat.equal(result.afterRunning, 0, 'the skin does not press a running thinking row')
    t.expectThat.equal(result.windows > 0, true, 'the expanded row takes its stepped window')
  })
})
