/**
 * The host's own reasoning disclosure stays manual in Lite: a running row is
 * not pressed open by the skin.
 *
 * @capability reasoning-display
 * @features chat-fold
 * @risk A reader who collapses a thinking row has the skin press it open again.
 */
import { spec, host } from '../../fixtures/behaviour.mjs'
import { ROW_PHASE_ATTRIBUTE, RUNNING_STATE } from '@dsh-claude-style/contracts/dom'

export default spec({ page: 'chat-fold' }, ({ test }) => {
  test('a running thinking row is never pressed', async (t) => {
    const result = await t.page.evaluate(async ([think, phase, running]) => {
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
      let presses = 0
      control.addEventListener('click', () => { presses += 1 }, true)
      row.append(control, build('div', []))
      document.body.append(row)
      await frames(3)
      return { presses }
    }, [host.attributes('chat.think-row'), ROW_PHASE_ATTRIBUTE, RUNNING_STATE])

    t.expectThat.equal(result.presses, 0, 'the skin does not press a running thinking row')
  })
})
