import type { NotificationChannel } from './notifier'

/** What the settings row knows about the channel while the page runs. */
export interface NotificationChannelState {
  channel: NotificationChannel
  /** Whether a click on a host notification hands the session back to this page. */
  clickReturnsSession: boolean
}

const UNKNOWN: NotificationChannelState = { channel: 'unsupported', clickReturnsSession: false }

let current: NotificationChannelState = UNKNOWN
const listeners = new Set<() => void>()

/** Publish the channel the feature settled on. */
export function setNotificationChannel(next: NotificationChannelState) {
  if (next.channel === current.channel && next.clickReturnsSession === current.clickReturnsSession) return
  current = next
  for (const listener of [...listeners]) listener()
}

/** The channel the feature settled on, or `unsupported` before the capability answered. */
export function notificationChannel(): NotificationChannelState {
  return current
}

/** Subscribe to channel changes; the settings row redraws from this. */
export function subscribeNotificationChannel(listener: () => void) {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
