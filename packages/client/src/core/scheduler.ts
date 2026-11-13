import { installScheduler as installEngineScheduler } from '@dsh-claude-style/engine/scheduler'
import type { FeatureHandle, SchedulerCalls } from '@dsh-claude-style/engine/scheduler'
import { onHdslLoaded, onUsernameLoaded } from '../shared/identity'
import { onModelCopyLoaded } from '../features/model/model-copy'
import { loadPrefs, refreshMotionAttribute, subscribePrefs } from './prefs'
import type { HostContext } from '@dsh-claude-style/engine/host'
import type { FooterHandle } from '../features/account/account-footer'
import type { BanHandle } from '../features/ban-screen/ban-screen'
import type { ChatFoldHandle } from '../features/chat-fold/chat-fold'
import type { ComposerHandle } from '../features/composer/composer'
import type { ContextStatsHandle } from '../features/context-stats/context-stats'
import type { MeterRingHandle } from '../features/context-stats/meter-ring'
import type { ModelHandle } from '../features/model/model-picker'
import type { QuickProvidersHandle } from '../features/settings/quick-providers'

/** Public feature handles; a feature sees only its own and its manifest's `reads`. */
export interface Handles {
  brand: FeatureHandle
  composer: ComposerHandle
  questionCard: FeatureHandle
  homeLayout: FeatureHandle
  homeRipple: FeatureHandle
  mascot: FeatureHandle
  permissions: FeatureHandle
  contextStats: ContextStatsHandle
  meterRing: MeterRingHandle
  model: ModelHandle
  effort: FeatureHandle
  heroMenu: FeatureHandle
  quickProviders: QuickProvidersHandle
  footer: FooterHandle
  ban: BanHandle
  workspace: FeatureHandle
  search: FeatureHandle
  sidebarPeek: FeatureHandle
  sidebarStatus: FeatureHandle
  sessionActions: FeatureHandle
  manualUnread: FeatureHandle
  sidebarEntries: FeatureHandle
  turnNav: FeatureHandle
  chatFollow: FeatureHandle
  chatFold: ChatFoldHandle
  processColumn: FeatureHandle
  chatWait: FeatureHandle
  chatReveal: FeatureHandle
  chatAnchor: FeatureHandle
  chatFiles: FeatureHandle
  messageActions: FeatureHandle
  viewTabs: FeatureHandle
  headerBand: FeatureHandle
  rightbarFit: FeatureHandle
  sessionPanel: FeatureHandle
  bottomPanelFit: FeatureHandle
  conversationWidth: FeatureHandle
  rowSkip: FeatureHandle
  sessionTitle: FeatureHandle
  settingsNav: FeatureHandle
  soundCues: FeatureHandle
  notifications: FeatureHandle
  sodium: FeatureHandle
  surface: FeatureHandle
  activeFirst: FeatureHandle
  activeShelf: FeatureHandle
  dateGroups: FeatureHandle
  widthHandle: FeatureHandle
}

export type HandleName = keyof Handles


export type Ui = SchedulerCalls & { [K in HandleName]?: Handles[K] }

/** Run the engine's scheduler over this skin's features, listening to the sources that change what they show. */
export function installScheduler(ctx: HostContext, ui: Ui, features: HandleName[]) {
  const stop = installEngineScheduler<HandleName>(ctx, ui, features, {
    copyChange: [subscribePrefs, onModelCopyLoaded],
    refresh: [onUsernameLoaded, onHdslLoaded],
    start: loadPrefs,
    systemMotionChanged: refreshMotionAttribute,
  })
  // The preference read above can install or retire a feature while the engine
  // is still starting. Its own first index predates that read, so the registry
  // is indexed once more before the entry uses the scheduler.
  ui.refreshHandles?.()
  return stop
}
