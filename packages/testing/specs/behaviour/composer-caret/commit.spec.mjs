/**
 * The composer keeps the browser's caret through an input-method composition:
 * the host raises its composing mark, the selection moves under it, and the
 * commit lands with the caret still visible where the reader typed.
 *
 * @capability composer-caret
 * @features composer
 * @risk A reader typing through an input method loses sight of where the composition will land, or the skin hides the native caret for the whole composition.
 */
import { spec, host } from '../../fixtures/behaviour.mjs'

const FIELD = host('composer.input')
const COMPOSING = host('composer.composing')

/** Wait a fixed number of animation frames the skin's own pass runs on. */
function frames(t, count) {
  return t.page.evaluate((total) => new Promise((resolve) => {
    let left = total
    const step = () => {
      left -= 1
      if (left <= 0) resolve()
      else requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }), count)
}

/** Give the editor the words a composition is committing, with the caret at `offset`. */
function editDraft(t, offset) {
  return t.page.evaluate(([field, at]) => {
    const input = document.querySelector(field)
    input.focus()
    input.textContent = 'hou m'
    const text = input.firstChild
    const range = document.createRange()
    range.setStart(text, at)
    range.collapse(true)
    const selection = document.getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
  }, [FIELD, offset])
}

/** Raise or drop the host's composition flag, with the composition event its keymap sees. */
function compose(t, active) {
  return t.page.evaluate(([field, composing, on]) => {
    const input = document.querySelector(field)
    if (on) {
      input.setAttribute(composing, '')
      input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    } else {
      input.removeAttribute(composing)
      input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'hou m' }))
    }
  }, [FIELD, COMPOSING, active])
}

/** What the reader sees of the caret: its colour on the field, and where the selection stands. */
function readCaret(t) {
  return t.page.evaluate((field) => {
    const input = document.querySelector(field)
    return {
      caret: getComputedStyle(input).caretColor,
      range: document.getSelection().getRangeAt(0).getBoundingClientRect().left,
      offset: document.getSelection().getRangeAt(0).startOffset,
    }
  }, FIELD)
}

export default spec({ page: 'composer' }, ({ test }) => {
  test('a composition keeps the browser caret visible', async (t) => {
    await editDraft(t, 3)
    await compose(t, true)
    await frames(t, 3)
    const caret = await readCaret(t)
    t.expectThat.equal(caret.caret !== 'rgba(0, 0, 0, 0)', true, `the native caret stays visible while the IME composes (${caret.caret})`)
  })

  test('the caret keeps the committed selection', async (t) => {
    await editDraft(t, 3)
    await compose(t, true)
    await frames(t, 2)
    // The browser moves the selection to the end while the composition is
    // still up; the next selectionchange is processed inside the composition.
    await editDraft(t, 5)
    await frames(t, 2)
    // The commit drops the flag and sends compositionend; no later
    // selectionchange is promised, so the settle after the event is what
    // reads the committed selection.
    await compose(t, false)
    await frames(t, 4)
    const caret = await readCaret(t)
    t.expectThat.equal(caret.caret !== 'rgba(0, 0, 0, 0)', true, `the native caret stays visible after the commit (${caret.caret})`)
    t.expectThat.equal(caret.offset, 5, 'the selection is the one the commit left')
  })
})
