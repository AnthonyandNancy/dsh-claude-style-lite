/** The notification request both halves exchange (D73). */

/** The protocol the plugin owns for toast clicks. */
export const HOST_NOTIFY_PROTOCOL = 'dsh-claude-style-lite'

/** The four moments a notification can mark. */
export const NOTIFY_KINDS = ['finished', 'approval', 'plan-review', 'question'] as const
export type NotifyKind = typeof NOTIFY_KINDS[number]

/** The title and body limits the host route enforces. */
export const NOTIFY_TITLE_MAX = 128
export const NOTIFY_BODY_MAX = 256

/** One system notification: the copy the page supplies and the session a click returns to. */
export interface HostNotifyRequest {
  title: string
  body: string
  sessionId: string
  kind: NotifyKind
}

/** The host channel the page can address, or the page's own constructor. */
export type HostNotifyChannel = 'toast' | 'osascript' | 'notify-send' | 'browser'

/** The channel and whether a click can hand a session back to the page. */
export interface HostNotifyCapability {
  ok: true
  channel: HostNotifyChannel
  clickReturnsSession: boolean
}

/** The one waiting click, read from the handoff file. */
export interface HostNotifyActivation {
  sessionId: string
  at: number
}
