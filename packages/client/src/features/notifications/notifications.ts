import { hostUiWorkspace } from '@dsh-claude-style/engine/host'
import { createAttentionFeed } from '../../shared/attention-feed'
import { copy } from './copy'
import { createNotifier } from './notifier'
import type { HostContext } from '@dsh-claude-style/engine/host'
import type { FeatureUi } from '../../core/feature'
import type { AttentionEvent } from '../../shared/attention'
import type manifest from './notifications.manifest'

/** One notification title per event; the body names the session it belongs to. */
function titleOf(event: AttentionEvent) {
  if (event.kind === 'finished') return copy('notificationFinished')
  if (event.pending === 'approval') return copy('notificationApproval')
  if (event.pending === 'plan-review') return copy('notificationPlanReview')
  return copy('notificationQuestion')
}

export function install(ctx: HostContext, ui: FeatureUi<typeof manifest>) {
  const workspace = hostUiWorkspace(ctx)
  const notifier = createNotifier((sessionId) => {
    if (typeof workspace?.openSession === 'function') workspace.openSession(sessionId)
  })

  function take(event: AttentionEvent, title: string) {
    void notifier.notify({
      title: titleOf(event),
      body: title,
      tag: `dsh-claude-style:${event.sessionId}:${event.kind === 'finished' ? 'finished' : event.pending}`,
      sessionId: event.sessionId,
    })
  }

  const feed = createAttentionFeed(ctx, take)
  ui.notifications = {}

  return () => {
    feed.dispose()
    notifier.dispose()
    delete ui.notifications
  }
}
