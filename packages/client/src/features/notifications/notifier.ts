/** One system notification the skin asks for. */
export interface NotificationRequest {
  title: string
  body: string
  tag: string
  sessionId: string
}

/** The browser's own permission state, without asking for it. */
export type NotificationPermissionState = 'default' | 'granted' | 'denied' | 'unsupported'

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

/**
 * Create the page's notifier: one notification per event, the browser's own
 * permission gate, and a click that asks the host to open the session.
 */
export function createNotifier(openSession: (sessionId: string) => void) {
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
    if (permission === 'unsupported' || permission === 'denied') return
    if (await askPermission() !== 'granted') return
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
        openSession(request.sessionId)
        close(notification)
      }
      notification.onclose = () => { opened.delete(notification) }
    } catch (error) {
      console.warn('notifications: the browser refused one system notification', error)
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
