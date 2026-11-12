/** One system notification the skin asks for. */
export interface NotificationRequest {
  title: string
  body: string
  tag: string
  sessionId: string
  kind: 'finished' | 'approval' | 'plan-review' | 'question'
}

/** The browser's own permission state, without asking for it. */
export type NotificationPermissionState = 'default' | 'granted' | 'denied' | 'unsupported'

/** The channel this page raises notifications through. */
export type NotificationChannel = 'host' | 'browser' | 'unsupported'

/** What this page can do with system notifications right now. */
export function notificationPermission(): NotificationPermissionState {
  if (typeof globalThis.Notification !== 'function') return 'unsupported'
  return globalThis.Notification.permission
}

/** Ask for permission once; a denied answer is kept by the browser and never asked again. */
export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (typeof globalThis.Notification !== 'function') return 'unsupported'
  if (globalThis.Notification.permission !== 'default') return globalThis.Notification.permission
  try {
    return await globalThis.Notification.requestPermission()
  } catch {
    // The request can be refused by the embedding page; the cue is decorative
    // and the next event must not throw into the status subscription (D12).
    return globalThis.Notification.permission
  }
}

/** The one call both branches answer: whether the event reached its channel. */
export interface Notifier {
  notify(request: NotificationRequest): Promise<boolean>
  dispose(): void
}

/** What the notifier needs from the feature that installs it. */
export interface NotifierDeps {
  channel: NotificationChannel
  /** The host's POST; resolves with whether that route accepted the notification. */
  send(request: NotificationRequest): Promise<boolean>
  openSession(sessionId: string): void
}

/**
 * Create the channel's notifier.
 *
 * The host channel posts through the private route and has no page permission
 * to ask for: the desktop app owns the system identity. The browser channel
 * keeps the page constructor, its one shared permission request and its click
 * focus. One failed send stays a failed send; the next event stands on its own
 * (D12).
 */
export function createNotifier(deps: NotifierDeps): Notifier & { permission(): NotificationPermissionState } {
  if (deps.channel === 'host') {
    return {
      notify: (request) => deps.send(request),
      permission: () => 'granted',
      dispose() {},
    }
  }
  if (deps.channel === 'unsupported') {
    return {
      notify: async () => false,
      permission: () => 'unsupported',
      dispose() {},
    }
  }

  const opened = new Set<Notification>()
  let permission = notificationPermission()
  let permissionRequest: Promise<NotificationPermissionState> | null = null

  function close(notification: Notification) {
    opened.delete(notification)
    notification.close()
  }

  /** One request serves every event that arrives before the answer does. */
  async function askPermission() {
    if (permission !== 'default') return permission
    if (permissionRequest === null) permissionRequest = requestNotificationPermission()
    permission = await permissionRequest
    permissionRequest = null
    return permission
  }

  async function notify(request: NotificationRequest) {
    if (permission === 'unsupported' || permission === 'denied') return false
    if (await askPermission() !== 'granted') return false
    // One failing system notification must not reach the status subscription
    // that asked for it; the next event stands on its own (D12).
    try {
      const notification = new Notification(request.title, {
        body: request.body,
        tag: request.tag,
        silent: true,
      })
      opened.add(notification)
      notification.onclick = () => {
        window.focus()
        deps.openSession(request.sessionId)
        close(notification)
      }
      notification.onclose = () => { opened.delete(notification) }
      return true
    } catch (error) {
      console.warn('notifications: the browser refused one system notification', error)
      return false
    }
  }

  return {
    notify,
    permission: () => permission,
    dispose() {
      for (const notification of [...opened]) close(notification)
      opened.clear()
    },
  }
}
