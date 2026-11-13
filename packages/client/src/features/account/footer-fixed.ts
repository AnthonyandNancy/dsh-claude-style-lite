import { subscribeMutations } from '@dsh-claude-style/engine/bus'

/**
 * The fixed-position answer for one footer subtree. A node's position is read
 * once; a class, style, role or structural change under the footer drops the
 * answers because the host has rebuilt or reclassified a node. The map is
 * replaced rather than cleared so old nodes leave with the old generation.
 */
export function createFooterFixedCache(footArea: Element) {
  let answers = new WeakMap<Element, boolean>()
  const stop = subscribeMutations(footArea, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'role', 'open', 'aria-expanded', 'aria-hidden'],
  }, () => {
    answers = new WeakMap()
  })

  return {
    fixed(el: Element) {
      const kept = answers.get(el)
      if (kept !== undefined) return kept
      const next = window.getComputedStyle(el).position === 'fixed'
      answers.set(el, next)
      return next
    },
    stop,
  }
}
