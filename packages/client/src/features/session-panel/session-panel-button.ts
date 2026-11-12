import * as React from 'react'
import * as primitives from '@deepseek-ai/dsh-client-ui-primitives'
import { copy } from './copy'
import { railOpen, sessionAvailable, subscribeRail, subscribeSessionAvailable, toggleRail } from './session-panel-state'

/**
 * The header's own control for the details rail (D96).
 *
 * The control stays in the header whether the default is on or off. The rail
 * opens itself on a session when the setting says so; this control puts it
 * away, or brings it back. Without a session to describe the control stands
 * disabled, so the hero page names the way in without pretending it works.
 */
export function SessionPanelButton() {
  const label = copy('detailsToggle')
  const open = React.useSyncExternalStore(subscribeRail, railOpen, railOpen)
  const available = React.useSyncExternalStore(subscribeSessionAvailable, sessionAvailable, sessionAvailable)
  return React.createElement(primitives.Tooltip, {
    label,
    side: 'bottom',
    delayMs: 500,
    // The tooltip's child is typed as an anchor element, while the host's
    // forward-ref button carries a LegacyRef; the tooltip clones the element it
    // is handed either way.
    children: React.createElement(primitives.Button, {
      variant: 'ghost',
      size: 'sm',
      className: 'dsh-claude-session-panel-button',
      'aria-label': label,
      'aria-disabled': available ? undefined : 'true',
      'aria-pressed': open ? 'true' : 'false',
      disabled: !available,
      icon: React.createElement(primitives.IconFlatListOutlineRegular, { size: 16 }),
      onClick() { if (available) toggleRail() },
    }) as unknown as React.ReactElement,
  })
}
