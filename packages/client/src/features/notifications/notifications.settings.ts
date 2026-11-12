import * as React from 'react'
import { copy } from './copy'
import { notificationPermission, requestNotificationPermission } from './notifier'
import type { SettingsControlsOf } from '../../core/feature'
import type manifest from './notifications.manifest'

export const controls: SettingsControlsOf<typeof manifest> = {
  'notification-permission': NotificationPermission,
}

function NotificationPermission() {
  const state = React.useState(notificationPermission())
  const permission = state[0]
  const setPermission = state[1]
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
