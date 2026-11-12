/**
 * The running row is pressed before any reasoning text renders, because the
 * host renders no body while the row is folded.
 *
 * @capability reasoning-display
 * @features chat-fold
 * @risk The skin waits for a body that a folded row never mounts, or retries a press that the control ignores.
 */
import { spec, host } from '../../fixtures/behaviour.mjs'
import { ROW_PHASE_ATTRIBUTE, RUNNING_STATE } from '@dsh-claude-style/contracts/dom'

export default spec({ page: 'chat-fold' }, ({ test }) => {
  test('a folded running row is pressed before its body exists, and an ignored press is not repeated', async (t) => {
    const result = await t.page.evaluate(async ([think, phase, running]) => {
      const frames = (count) => new Promise((resolve) => {
        const step = () => (count -= 1) === 0 ? resolve() : requestAnimationFrame(step)
        requestAnimationFrame(step)
      })
      const row = document.createElement('div')
      for (const [name, value] of think) row.setAttribute(name, value)
      row.setAttribute(phase, running)
      const control = document.createElement('button')
      control.type = 'button'
      control.setAttribute('aria-expanded', 'false')
      let presses = 0
      control.addEventListener('click', () => { presses += 1 })
      row.append(control)
      document.body.append(row)
      await frames(3)
      return { presses, expanded: control.getAttribute('aria-expanded') }
    }, [host.attributes('chat.think-row'), ROW_PHASE_ATTRIBUTE, RUNNING_STATE])

    t.expectThat.equal(result.presses, 1, 'the row is pressed once without a body')
    t.expectThat.equal(result.expanded, 'false', 'an ignored press leaves the control as it was')
  })
})
