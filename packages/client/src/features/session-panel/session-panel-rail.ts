import * as React from 'react'
import { CONVERSATION_SCROLL_SELECTOR, CONVERSATION_SESSION_ATTRIBUTE, CONVERSATION_SESSION_SELECTOR, FLOW_KIND_ATTRIBUTE, RIGHTBAR_COLUMN_SELECTOR, SIDEBAR_CHAT_SELECTOR } from '@dsh-claude-style/contracts/dom'
import { observeMarker, observeSize, subscribeMutations } from '@dsh-claude-style/engine/bus'
import { cacheFirstMatch, findRightbarToggle } from '@dsh-claude-style/engine/host'
import { conversationScroller } from '@dsh-claude-style/engine/chat-dom'
import { readPrefs, subscribePrefs } from '../../core/prefs'
import { PART_ATTR } from '../../constants'
import { SESSION_PANEL_ATTR } from '../../constants'
import { copy } from './copy'
import { setRailOpen, setRailToggle, setSessionAvailable } from './session-panel-state'
import { PanelBody } from './session-panel-body'

const h = React.createElement

/** The seats the rail reads the page's own marks from; they are the skin's parts, not host selectors. */
const CENTER = `[${PART_ATTR}~="center-column"]`
const PRESET = `[${PART_ATTR}~="header-label"]`

/** The rail's width (D94). */
const RAIL_WIDTH = 320

/** One box in the page's pixels, as a fixed rail is placed from it. */
interface RailBox {
  top: number
  height: number
  right: number
}

/** The session the conversation shows, followed across a switch and the hero page. */
function useConversationSession() {
  const [reading, setReading] = React.useState<{ id: string | null, live: boolean }>({ id: null, live: false })
  React.useEffect(() => {
    // The element the attribute lands on may exist before the attribute: a
    // cached first match reads it again whenever the page's structure changes.
    const sessionNode = cacheFirstMatch<HTMLElement>(CONVERSATION_SESSION_SELECTOR)
    // The rail belongs to the conversation the reader is looking at: not a new
    // session without a turn yet, not a plugin page's hidden conversation, and
    // not a subagent's own column (D94).
    const live = () => {
      const node = sessionNode()
      if (node === null || node === undefined || !node.isConnected) return false
      if (node.closest(SIDEBAR_CHAT_SELECTOR) !== null) return false
      const scroller = node.closest(CONVERSATION_SCROLL_SELECTOR) ?? conversationScroller()
      if (!(scroller instanceof HTMLElement) || !scroller.checkVisibility()) return false
      return scroller.querySelector(`[${FLOW_KIND_ATTRIBUTE}]`) !== null
    }
    const read = () => {
      const node = sessionNode()
      const id = node?.getAttribute(CONVERSATION_SESSION_ATTRIBUTE) ?? null
      setReading(previous => ({ id, live: live() }))
    }
    const stop = subscribeMutations(document.body, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['data-phase', CONVERSATION_SESSION_ATTRIBUTE, FLOW_KIND_ATTRIBUTE],
    }, read)
    read()
    return stop
  }, [])
  return reading
}

/** The preset's own words, as the header's label carries them (D94). */
function usePresetLabel() {
  const [label, setLabel] = React.useState('')
  React.useEffect(() => {
    const presets = observeMarker<HTMLElement>(PRESET)
    const read = () => setLabel((presets.all()[0]?.textContent ?? '').trim())
    const stop = subscribeMutations(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: [PART_ATTR] }, read)
    read()
    return () => {
      stop()
      presets.release()
    }
  }, [])
  return label
}

/**
 * Whether the details rail stands open, and where (D94).
 *
 * The setting decides the first state of each session; a reader who opens or
 * closes the rail keeps that choice for the session they are reading, and a
 * switch returns to the setting. The box follows the column: the rail is fixed,
 * and its right edge is the column's own right edge, so an opened host sidebar
 * moves it along.
 */
function useRailReading(session: string | null) {
  const [open, setOpen] = React.useState(false)
  const [box, setBox] = React.useState<RailBox | null>(null)
  /** The reader's own choice for this session; `default` follows the setting. */
  const choice = React.useRef<{ session: string | null, mode: 'default' | 'open' | 'closed' }>({ session: null, mode: 'default' })
  /** Whether the host's own right column holds width now, as the last measurement read it. */
  const hostColumn = React.useRef(false)
  React.useEffect(() => {
    let stopSize: (() => void) | null = null
    let stopHostSize: (() => void) | null = null
    let center: HTMLElement | null = null
    let host: HTMLElement | null = null
    const measure = () => {
      const rect = center === null ? null : center.getBoundingClientRect()
      // The rail may stand without the column part (an older host): it then
      // takes the window's right edge, and the session's own state decides.
      setBox({
        top: rect === null ? 0 : Math.round(rect.top),
        height: rect === null ? window.innerHeight : Math.round(rect.height),
        right: rect === null ? 0 : Math.round(window.innerWidth - rect.right),
      })
      if (choice.current.session !== session) choice.current = { session, mode: 'default' }
      // The host's own right column stands on this same side, so it comes
      // first: while it holds width the rail keeps away, and the reader's
      // choice stands again once that column closes (D94). Its width is the
      // host's to give, so it is read from its box.
      hostColumn.current = host !== null && host.isConnected && host.getBoundingClientRect().width > 0
      const preferred = readPrefs().sessionPanelOpenByDefault
      const mode = choice.current.mode
      setOpen(!hostColumn.current && (
        mode === 'open' || (mode === 'default' && session !== null && preferred)
      ))
    }
    const columns = observeMarker<HTMLElement>(CENTER)
    const hostColumns = observeMarker<HTMLElement>(RIGHTBAR_COLUMN_SELECTOR)
    const bind = () => {
      const next = columns.all()[0] ?? null
      const nextHost = hostColumns.all()[0] ?? null
      // The host rebuilds both columns while a turn streams: each new node is
      // watched afresh, and either one's width change places the rail again.
      if (next !== center || nextHost !== host) {
        if (stopSize !== null) stopSize()
        if (stopHostSize !== null) stopHostSize()
        stopSize = null
        stopHostSize = null
        center = next
        host = nextHost
        if (center !== null) stopSize = observeSize(center, measure)
        if (host !== null) stopHostSize = observeSize(host, measure)
      }
      if (center === null) {
        setBox(null)
        setOpen(false)
        return
      }
      measure()
    }
    // The parts walk marks the column after the first frame, so its arrival is
    // an attribute change, not a child-list one.
    const stopParts = subscribeMutations(document.body, { subtree: true, attributes: true, attributeFilter: ['data-dsh-claude-part'] }, bind)
    bind()
    // The columns' own size observers report once on attach, which covers a
    // shell that laid out after this feature's first render; no timer wakes a
    // page that has settled.
    const offPrefs = subscribePrefs(measure)
    window.addEventListener('resize', bind)
    return () => {
      offPrefs()
      stopParts()
      columns.release()
      hostColumns.release()
      window.removeEventListener('resize', bind)
      if (stopSize !== null) stopSize()
      if (stopHostSize !== null) stopHostSize()
    }
  }, [session])
  // The header's control keeps the reader's explicit choice for this session.
  React.useEffect(() => {
    const flip = () => {
      if (open) {
        choice.current = { session, mode: 'closed' }
        setOpen(false)
        return
      }
      // The rail stands where the host's own right column stands: a press
      // asks for that side, so the column closes first and the rail comes in
      // as soon as its width is back (D94).
      if (hostColumn.current) findRightbarToggle()?.click()
      choice.current = { session, mode: 'open' }
      setOpen(!hostColumn.current)
    }
    setRailToggle(flip)
    return () => { setRailToggle(null) }
  }, [open, session])
  React.useEffect(() => {
    setRailOpen(open)
  }, [open])
  return { open, box }
}

/** The conversation's details rail: the session overview the reader keeps beside the chat (D94). */
export function SessionPanelRail() {
  const { id: session, live } = useConversationSession()
  const preset = usePresetLabel()
  const { open, box } = useRailReading(session)
  // The header's control follows the conversation's own answer: a session id on
  // a visible conversation is the only page its press can describe (D94). A new
  // answer that stays available wakes nobody; only the rail's unmount clears it.
  React.useEffect(() => {
    setSessionAvailable(session !== null && live)
  }, [session, live])
  React.useEffect(() => () => setSessionAvailable(false), [])
  // The page mark squeezes the conversation; it goes with the rail itself, so a
  // hidden rail (a new session, a plugin page) leaves no strip of empty space.
  const shown = session !== null && live && open && box !== null
  React.useEffect(() => {
    if (shown) document.body.setAttribute(SESSION_PANEL_ATTR, '')
    else document.body.removeAttribute(SESSION_PANEL_ATTR)
    return () => document.body.removeAttribute(SESSION_PANEL_ATTR)
  }, [shown])
  if (!shown) return null
  return h('aside', {
    className: 'dsh-claude-details',
    'aria-label': copy('detailsTitle'),
    style: { top: `${box.top}px`, height: `${box.height}px`, right: `${box.right}px`, width: `${RAIL_WIDTH}px` },
  },
  h(PanelBody, { key: session, sessionId: session, preset }))
}
