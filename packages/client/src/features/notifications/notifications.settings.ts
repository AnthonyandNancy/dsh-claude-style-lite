import * as React from 'react'
import { copy } from './copy'
import { notificationChannel, subscribeNotificationChannel } from './channel'
import { notificationPermission, requestNotificationPermission } from './notifier'
import type { SettingsControlsOf } from '../../core/feature'
import type manifest from './notifications.manifest'

export const controls: SettingsControlsOf<typeof manifest> = {
  'notification-permission': NotificationPermission,
}

/** The channel the feature settled on decides what this row can say. */
function NotificationPermission() {
  const settled = React.useSyncExternalStore(subscribeNotificationChannel, notificationChannel, notificationChannel)
  const state = React.useState(notificationPermission())
  const permission = state[0]
  const setPermission = state[1]
  if (settled.channel === 'host') {
    return React.createElement(
      'span',
      { className: 'dsh-claude-settings-row-note' },
      copy('notificationChannelHost'),
      settled.clickReturnsSession ? null : copy('notificationClickUnavailable'),
    )
  }
  if (settled.channel === 'unsupported') {
    return React.createElement('span', { className: 'dsh-claude-settings-row-note' }, copy('notificationChannelUnsupported'))
  }
  // The browser channel keeps the permission line and its one request button.
  if (permission === 'granted') return null
  const line = permission === 'unsupported'
    ? copy('notificationUnsupported')
    : permission === 'denied'
      ? copy('notificationPermissionDenied')
      : copy('notificationPermissionDefault')
  return React.createElement(
    'span',
    { className: 'dsh-claude-settings-row-note' },
    line,
    permission === 'default'
      ? React.createElement('button', {
        type: 'button',
        className: 'dsh-claude-notification-permission',
        onClick: () => { void requestNotificationPermission().then(setPermission) },
      }, copy('notificationPermissionRequest'))
      : null,
  )
}
