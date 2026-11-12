/**
 * The host's own reasoning disclosure stays the reader's: a running thinking
 * row is never pressed, and the row keeps the folded state the host gave it.
 *
 * @capability reasoning-display
 * @features chat-fold
 * @risk The skin presses a thinking row open or shut behind the reader, or leaves the row in a state the host did not draw.
 */
import { spec, host } from '../../fixtures/behaviour.mjs'
import { ROW_PHASE_ATTRIBUTE, RUNNING_STATE } from '@dsh-claude-style/contracts/dom'

export default spec({ page: 'chat-fold' }, ({ test }) => {
  test('a running thinking row is never pressed, and keeps the state the host gave it', async (t) => {
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
      // page's own rows were in place when the skin installed.
      const row = build('div', [...think, [phase, running]])
      const control = build('button', [['type', 'button'], ['aria-expanded', 'false']])
      control.textContent = 'Think'
      control.addEventListener('click', () => {
        control.setAttribute('aria-expanded', control.getAttribute('aria-expanded') === 'true' ? 'false' : 'true')
      })
      let presses = 0
      control.addEventListener('click', () => { presses += 1 }, true)
      row.append(control, build('div', []))
      document.body.append(row)
      await frames(3)
      const afterMount = control.getAttribute('aria-expanded')
      // The reader opens it: the skin leaves that state alone too.
      control.click()
      await frames(3)
      const afterReaderOpen = control.getAttribute('aria-expanded')
      // The reasoning stops: the row is still where the reader put it.
      row.setAttribute(phase, 'ok')
      await frames(3)
      return {
        presses,
        afterMount,
        afterReaderOpen,
        afterSettled: control.getAttribute('aria-expanded'),
      }
    }, [host.attributes('chat.think-row'), ROW_PHASE_ATTRIBUTE, RUNNING_STATE])

    t.expectThat.equal(result.presses, 1, 'only the reader’s own press reaches the control')
    t.expectThat.equal(result.afterMount, 'false', 'the running row stays folded as the host drew it')
    t.expectThat.equal(result.afterReaderOpen, 'true', 'the reader’s own open is kept')
    t.expectThat.equal(result.afterSettled, 'true', 'the row keeps that state once the reasoning stops')
  })
})
