import { NOTIFY_ACTIVATION_PATH, NOTIFY_PATH } from '@dsh-claude-style/contracts/routes'
import { hostUiWorkspace } from '@dsh-claude-style/engine/host'
import { createAttentionFeed } from '../../shared/attention-feed'
import { setNotificationChannel } from './channel'
import { copy } from './copy'
import { createNotifier } from './notifier'
import type { HostContext } from '@dsh-claude-style/engine/host'
import type { FeatureUi } from '../../core/feature'
import type { AttentionEvent } from '../../shared/attention'
import type { HostNotifyActivation, HostNotifyCapability } from '@dsh-claude-style/contracts/notify'
import type manifest from './notifications.manifest'
import type { NotificationChannel, NotificationRequest, Notifier } from './notifier'

/** The title one ending outcome states; the body names the session it belongs to. */
const ENDING_TITLES = {
  completed: 'notificationFinished',
  stopped: 'notificationStopped',
  failed: 'notificationFailed',
  interrupted: 'notificationInterrupted',
  forked: 'notificationFinished',
  truncated: 'notificationTruncated',
  blocked: 'notificationBlocked',
  unknown: 'notificationUnknown',
} as const

/** One notification title per event; the body names the session it belongs to. */
function titleOf(event: AttentionEvent) {
  if (event.kind === 'ended') return copy(ENDING_TITLES[event.outcome])
  if (event.pending === 'approval') return copy('notificationApproval')
  if (event.pending === 'plan-review') return copy('notificationPlanReview')
  return copy('notificationQuestion')
}

/** The event's kind in the shared notification vocabulary. */
function kindOf(event: AttentionEvent): NotificationRequest['kind'] {
  if (event.kind === 'ended') return 'finished'
  return event.pending
}

/** How often the page asks for a click the protocol handler left behind. */
const ACTIVATION_POLL_MS = 1500

/** A process channel the host half sends through, or the page's own constructor. */
function channelOf(capability: HostNotifyCapability): NotificationChannel {
  if (capability.channel === 'browser') return 'browser'
  return 'host'
}

export function install(ctx: HostContext, ui: FeatureUi<typeof manifest>) {
  const workspace = hostUiWorkspace(ctx)
  const openSession = (sessionId: string) => {
    if (typeof workspace?.openSession === 'function') workspace.openSession(sessionId)
  }
  let stopped = false
  let channel: NotificationChannel = 'unsupported'
  let notifier: Notifier | null = null
  let activationTimer: number | null = null
  /** Activations already handed to the page, so one handoff opens one session. */
  const seen = new Set<string>()
  /** Events that arrived before the capability did; they flush once into the channel. */
  const waiting: NotificationRequest[] = []

  async function sendToHost(request: NotificationRequest) {
    const response = await fetch(NOTIFY_PATH, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title: request.title,
        body: request.body,
        sessionId: request.sessionId,
        kind: request.kind,
      }),
    })
    if (response.ok) return true
    // A desktop page has no working page constructor to fall back to, so the
    // failure is reported once and the host channel stays for the next event.
    console.warn('notifications: the host refused one notification', response.status)
    return false
  }

  function startActivationPoll() {
    if (activationTimer !== null) return
    activationTimer = window.setInterval(() => {
      void fetch(NOTIFY_ACTIVATION_PATH, { cache: 'no-store' })
        .then((response) => response.ok ? response.json() as Promise<{ activation: HostNotifyActivation | null }> : null)
        .then((answer) => {
          if (stopped || answer === null || answer.activation === null) return
          const activation = answer.activation
          const key = `${activation.sessionId}:${activation.at}`
          if (seen.has(key)) return
          seen.add(key)
          openSession(activation.sessionId)
          window.focus()
        })
        .catch((error: unknown) => {
          // Polling reads one handoff at a time; a failed read must not stop the
          // next poll or reach the subscription that installed the feature (D12).
          console.warn('notifications: the activation read failed', error)
        })
    }, ACTIVATION_POLL_MS)
  }

  function settle(capability: HostNotifyCapability | null) {
    if (stopped) return
    if (capability === null) {
      // A web page keeps its own constructor; a desktop page has no working
      // page constructor, so it reports the missing host channel instead.
      channel = location.protocol === 'dsh-app:' ? 'unsupported' : 'browser'
      notifier = createNotifier({ channel, send: sendToHost, openSession })
      setNotificationChannel({ channel, clickReturnsSession: false })
      return
    }
    channel = channelOf(capability)
    notifier = createNotifier({ channel, send: sendToHost, openSession })
    setNotificationChannel({ channel, clickReturnsSession: capability.clickReturnsSession })
    // A click can only arrive after a send has registered the protocol, and
    // the capability read before that first send reports false. Poll anyway:
    // the first notification's click must still open its session.
    if (channel === 'host') startActivationPoll()
    for (const request of waiting.splice(0)) void notifier.notify(request)
  }

  void fetch(NOTIFY_PATH, { cache: 'no-store' })
    .then((response) => response.ok ? response.json() as Promise<HostNotifyCapability> : null)
    .catch((error: unknown) => {
      // The capability is one read at boot; its failure decides the channel and
      // must not reach the feed that installed this feature (D12).
      console.warn('notifications: the channel read failed', error)
      return null
    })
    .then(settle)

  function take(event: AttentionEvent, title: string) {
    const request: NotificationRequest = {
      title: titleOf(event),
      body: title,
      tag: `dsh-claude-style:${event.sessionId}:${kindOf(event)}`,
      sessionId: event.sessionId,
      kind: kindOf(event),
    }
    if (notifier === null) waiting.push(request)
    else void notifier.notify(request)
  }

  const feed = createAttentionFeed(ctx, take)
  ui.notifications = {}

  return () => {
    stopped = true
    if (activationTimer !== null) window.clearInterval(activationTimer)
    feed.dispose()
    notifier?.dispose()
    delete ui.notifications
  }
}
