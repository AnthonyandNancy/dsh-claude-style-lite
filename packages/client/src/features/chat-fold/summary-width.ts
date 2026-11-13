import { inPagePixels } from '../../shared/page-zoom'

interface HeaderMetrics {
  gap: number
  paddingLeft: number
  paddingRight: number
  borderLeft: number
  borderRight: number
  parentPaddingLeft: number
  parentPaddingRight: number
}

/** The header's own style values, read once per invalidation. */
export function createSummaryWidthCache() {
  let metrics = new WeakMap<HTMLElement, HeaderMetrics>()

  function metricsOf(header: HTMLElement) {
    const kept = metrics.get(header)
    if (kept !== undefined) return kept
    const style = getComputedStyle(header)
    const parent = header.parentElement
    const parentStyle = parent === null ? null : getComputedStyle(parent)
    const next: HeaderMetrics = {
      gap: parseFloat(style.columnGap) || 0,
      paddingLeft: parseFloat(style.paddingLeft) || 0,
      paddingRight: parseFloat(style.paddingRight) || 0,
      borderLeft: parseFloat(style.borderLeftWidth) || 0,
      borderRight: parseFloat(style.borderRightWidth) || 0,
      parentPaddingLeft: parentStyle === null ? 0 : parseFloat(parentStyle.paddingLeft) || 0,
      parentPaddingRight: parentStyle === null ? 0 : parseFloat(parentStyle.paddingRight) || 0,
    }
    metrics.set(header, next)
    return next
  }

  return {
    available(header: HTMLElement, summary: HTMLElement) {
      const own = metricsOf(header)
      const parent = header.parentElement
      const limit = parent === null
        ? header.clientWidth
        : parent.clientWidth - own.parentPaddingLeft - own.parentPaddingRight
      let room = limit - own.paddingLeft - own.paddingRight - own.borderLeft - own.borderRight
      for (const child of header.children) {
        if (child === summary) continue
        const width = inPagePixels(child.getBoundingClientRect().width)
        if (width > 0) room -= width + own.gap
      }
      return Math.max(0, room)
    },
    invalidateAll() {
      metrics = new WeakMap()
    },
  }
}
