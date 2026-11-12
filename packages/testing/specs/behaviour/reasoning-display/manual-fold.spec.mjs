/**
 * A running thinking row is opened once when it starts, so the first reasoning
 * text is visible at once; a reader who closes it keeps it closed for that phase.
 *
 * @capability reasoning-display
 * @features chat-fold
 * @risk The skin leaves the first reasoning frames folded, or overrides a reader who closed the row.
 */
import { spec, host } from '../../fixtures/behaviour.mjs'
import { ROW_PHASE_ATTRIBUTE, RUNNING_STATE } from '@dsh-claude-style/contracts/dom'

export default spec({ page: 'chat-fold' }, ({ test }) => {
  test('a running thinking row opens once, and a reader who closes it stays closed', async (t) => {
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
      const opened = control.getAttribute('aria-expanded') === 'true'
      const pressedToOpen = presses
      // The reader closes it: the same phase must not reopen it.
      control.click()
      await frames(3)
      const afterReaderClose = control.getAttribute('aria-expanded') === 'true'
      // A new phase starts on the same row: it may open once more.
      row.setAttribute(phase, 'ok')
      row.setAttribute(phase, running)
      await frames(3)
      return {
        opened,
        pressedToOpen,
        afterReaderClose,
        afterNewPhase: control.getAttribute('aria-expanded') === 'true',
      }
    }, [host.attributes('chat.think-row'), ROW_PHASE_ATTRIBUTE, RUNNING_STATE])

    t.expectThat.equal(result.opened, true, 'the running row opens itself')
    t.expectThat.equal(result.pressedToOpen, 1, 'one press opens it')
    t.expectThat.equal(result.afterReaderClose, false, 'the reader’s close is kept in that phase')
    t.expectThat.equal(result.afterNewPhase, true, 'a new running phase opens it again')
  })
})
