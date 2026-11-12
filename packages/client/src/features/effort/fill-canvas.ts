import { resolveColour } from '@dsh-claude-style/engine/colour'
import { requestFrame } from '@dsh-claude-style/engine/frame'
import { pageHidden, subscribePageHidden } from '../../core/page-visibility'
import { motionEaseAt, motionMs } from '../../shared/motion'
import type { FrameTask } from '@dsh-claude-style/engine/frame'

/** The canvas the plain fill is drawn on; the surface table names it by this class. */
export const FILL_CANVAS_CLASS = 'dsh-claude-effort-fill-canvas'
/** The groove's height, matching `.dsh-claude-effort-track`. */
const FILL_H = 26
/** The groove's left cap; the right edge stays square so it meets the knob without a sliver of track. */
const FILL_RADIUS = 8
/** The label ink's share in the fill: the old rule's `26%` of the primary label. */
const FILL_ALPHA = 0.26
/** The backing store's device-pixel limit, the same as the top rung's field. */
const DPR_LIMIT = 2
/** The curve the knob glides on, so the fill and the knob travel together. */
const GLIDE_TOKEN = '--dsh-claude-ease-glide'
/** The knob's glide length. */
const MOVE_TOKEN = '--dsh-claude-duration-move'

/** The fill's right edge: the knob's centre, in CSS pixels from the track's left end. */
export function fillRight(travel: number, knobWidth: number) {
  return Math.round(travel) + knobWidth / 2
}

/** The canvas backing store's width in device pixels, capped at DPR 2. */
export function fillWidthDev(width: number, dpr: number) {
  return Math.round(width * Math.min(dpr > 0 ? dpr : 1, DPR_LIMIT))
}

/** The eased fill edge between two targets; both ends land on the target itself. */
export function fillEased(progress: number, from: number, to: number) {
  const p = Math.max(0, Math.min(1, progress))
  if (p <= 0) return from
  if (p >= 1) return to
  const eased = motionEaseAt(GLIDE_TOKEN, p)
  return from + (to - from) * eased
}

/** One target the slider asks for: where the fill ends, and how it gets there. */
export interface FillTarget {
  /** The right edge in CSS pixels from the track's left end. */
  right: number
  /** Whether the move plays on the stylesheet's glide; false lands at once. */
  animate: boolean
  /** A gesture writes every frame: the fill follows the knob without an easing of its own. */
  dragging: boolean
}

/**
 * The reasoning slider's plain fill, painted on one canvas.
 *
 * The fill used to be a div whose inline `width` changed on every pointer move:
 * each write re-laid out the groove and repainted the strip, and the width
 * transition ran on the main thread beside the knob's own transform. The canvas
 * writes no layout at all, and the top rung stops its frame loop outright, the
 * way the dot matrix does. It paints the same groove: the track's left end to
 * the knob's centre, square where the knob meets it.
 *
 * @param options.track - the groove the fill lies in.
 * @param options.reduced - whether the reader asked for reduced motion; the fill then lands without a glide.
 * @returns mount, the target writer, the drawing controls and the teardown.
 */
export function createFillCanvas(options: {
  track: HTMLElement
  reduced: () => boolean
}) {
  const canvas = document.createElement('canvas')
  canvas.className = FILL_CANVAS_CLASS
  const context: CanvasRenderingContext2D = canvas.getContext('2d') ?? (() => {
    throw new Error('effort/fill-canvas: the fill canvas has no 2d context')
  })()

  /** The CSS width of the track the canvas stands in. */
  let width = 0
  let dpr = 1
  /** The colour the track's ink resolves to, with the fill's alpha; null until the first read. */
  let fill: string | null = null
  /** The right edge drawn now, in CSS pixels. */
  let current = 0
  /** What the last target asked for, or null before the first one. */
  let target: FillTarget | null = null
  let startedAt = 0
  let from = 0
  let to = 0
  let animating = false
  let disposed = false
  let cancelFrame: (() => void) | null = null

  /**
   * The fill is the card's label ink at 26%: the stylesheet's old rule mixed the
   * same token with transparent, which is these channels at this alpha. It is
   * read at draw time, not at mount: the install runs before the browser has
   * resolved the sheet on the fresh canvas, and an empty computed value there
   * is the paint not being ready, not a broken token.
   */
  function readPalette() {
    const value = getComputedStyle(canvas).color.trim()
    const colour = value === '' ? null : resolveColour(value)
    if (colour === null) return
    fill = `rgba(${colour.red}, ${colour.green}, ${colour.blue}, ${colour.alpha * FILL_ALPHA})`
  }

  /** Size the backing store to the track, in whole device pixels. */
  function size() {
    width = options.track.clientWidth
    dpr = Math.min(window.devicePixelRatio > 0 ? window.devicePixelRatio : 1, DPR_LIMIT)
    canvas.width = fillWidthDev(width, dpr)
    canvas.height = Math.round(FILL_H * dpr)
    canvas.style.width = `${width}px`
    canvas.style.height = `${FILL_H}px`
  }

  /**
   * Paint one right edge. The rounded left cap is drawn even at zero width — a
   * canvas narrower than the cap still shows the groove's corner — but an
   * empty ladder has no fill at all, and the slider passes 0 for it.
   */
  function drawAt(right: number) {
    const devW = canvas.width
    const devH = canvas.height
    const edge = Math.max(0, Math.min(devW, Math.round(right * dpr)))
    context.clearRect(0, 0, devW, devH)
    if (edge <= 0) return
    if (fill === null) readPalette()
    if (fill === null) return
    const radius = Math.min(FILL_RADIUS * dpr, edge / 2)
    context.fillStyle = fill
    context.beginPath()
    context.roundRect(0, 0, edge, devH, [radius, 0, 0, radius])
    context.fill()
  }

  function stopFrame() {
    if (cancelFrame !== null) cancelFrame()
    cancelFrame = null
  }

  /** One frame of the glide; it asks for the next only while the travel is unfinished. */
  const task: FrameTask = {
    write(now) {
      cancelFrame = null
      if (disposed || !animating) return
      const duration = Math.max(1, motionMs(MOVE_TOKEN))
      const progress = Math.min(1, (now - startedAt) / duration)
      current = fillEased(progress, from, to)
      drawAt(current)
      if (progress >= 1) {
        current = to
        animating = false
        return
      }
      cancelFrame = requestFrame(task)
    },
  }

  /** An off-screen page holds no frame; coming back lands on the target rather than replaying the travel. */
  const stopVisibility = subscribePageHidden((hidden) => {
    stopFrame()
    animating = false
    if (!hidden && target !== null) {
      current = target.right
      drawAt(current)
    }
  })

  return {
    /** Put the canvas under the ticks, then read what it computes where it now stands. */
    mount() {
      options.track.prepend(canvas)
      size()
      drawAt(0)
    },
    /** Take one target: at once while dragging, under reduced motion, or when no glide is asked for. */
    setTarget(next: FillTarget) {
      if (disposed) return
      target = next
      if (options.reduced() || next.dragging || !next.animate || pageHidden()) {
        stopFrame()
        animating = false
        current = next.right
        drawAt(current)
        return
      }
      stopFrame()
      from = current
      to = next.right
      if (from === to) {
        drawAt(to)
        animating = false
        return
      }
      startedAt = performance.now()
      animating = true
      cancelFrame = requestFrame(task)
    },
    /** Paint the edge already asked for, after the palette or the width moved under it. */
    draw() {
      drawAt(current)
    },
    /** Stop the glide where it stands; the top rung takes the groove over from this frame on. */
    pause() {
      stopFrame()
      animating = false
    },
    /** Re-read the palette and the track's width after a resize or a palette change. */
    resize() {
      readPalette()
      size()
      drawAt(current)
    },
    dispose() {
      disposed = true
      stopVisibility()
      stopFrame()
      animating = false
      target = null
      canvas.remove()
    },
  }
}
