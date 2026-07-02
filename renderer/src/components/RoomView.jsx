import { LogOut } from 'lucide-react'

import { eventMeta, reactionTheme, roomParts, safeClass } from '../tifo/domain.js'
import { OfflinePanel } from './OfflinePanel.jsx'
import { ReactionEffects } from './ReactionEffects.jsx'
import { ReplayPreview } from './ReplayPreview.jsx'
import { ChatPanel } from './ChatPanel.jsx'
import { ControlsPanel } from './ControlsPanel.jsx'
import { TimelinePanel } from './TimelinePanel.jsx'

export function RoomView({ controller }) {
  const { actions, derived, state } = controller
  const metrics = derived.metrics
  const hasEvents = metrics.playableEvents.length > 0
  const match = roomParts(state.roomCode)
  const latestEvent = metrics.playableEvents[0]
  const offlineActive = state.offline.enabled
  const connected = !offlineActive && state.peerCount > 0
  const syncTone = offlineActive
    ? 'offline'
    : state.lastError
      ? 'error'
      : connected
        ? 'connected'
        : 'searching'
  const activeEffect = state.effects[0]

  return (
    <main className={`room-view ${activeEffect ? `effect-${safeClass(activeEffect.tone)}` : ''}`}>
      <ReactionEffects effects={state.effects} />

      <header className='room-header'>
        <div className='brand-mini'>
          <img className='brand-icon-image' src='../assets/brand/icon/tifo-app-icon.png' alt='' />
          <div>
            <p className='eyebrow'>TIFO Match Room</p>
            <h1>{state.roomTitle}</h1>
          </div>
        </div>
        <div className='room-actions'>
          <span
            className={`live-badge ${offlineActive ? 'offline' : connected ? 'connected' : ''}`}
          >
            <span aria-hidden='true'></span>
            {offlineActive ? 'Offline demo' : connected ? 'P2P live' : 'Seeking peers'}
          </span>
          <button
            className='ghost-action inline-flex items-center justify-center gap-2'
            type='button'
            onClick={actions.leaveRoom}
          >
            <LogOut size={15} strokeWidth={2.4} />
            Leave
          </button>
        </div>
      </header>

      <section className='room-stage' aria-label='Match summary'>
        <div className='scoreboard'>
          <div className='score-team-block'>
            <span className='team-label'>Home</span>
            <strong>{match.home}</strong>
          </div>
          <div className='score-core'>
            <span>{match.round}</span>
            <strong>vs</strong>
            <small>{state.roomCode}</small>
          </div>
          <div className='score-team-block muted'>
            <span className='team-label'>Away</span>
            <strong>{match.away}</strong>
          </div>
        </div>
        <div className={`stage-summary ${syncTone} ${activeEffect ? 'active-reaction' : ''}`}>
          <span>Room sync</span>
          <strong>
            {activeEffect ? reactionTheme(activeEffect.type).label : state.syncStatus}
          </strong>
          <p>
            {activeEffect
              ? `${activeEffect.sender} lifted the terrace`
              : latestEvent
                ? eventMeta(latestEvent).text
                : 'Waiting for the first chant, flare, or message.'}
          </p>
        </div>
      </section>

      <ReplayPreview actions={actions} replay={state.replayPreview} />

      <section className='match-strip' aria-label='Room status'>
        <div>
          <span className='status-label'>Fan</span>
          <strong>{state.nickname}</strong>
        </div>
        <div>
          <span className='status-label'>Peers live</span>
          <strong>{state.peerCount}</strong>
        </div>
        <div>
          <span className='status-label'>Echo events</span>
          <strong>{state.events.length}</strong>
        </div>
        <div>
          <span className='status-label'>Saved</span>
          <strong>{metrics.saved}</strong>
        </div>
        <div>
          <span className='status-label'>Pending</span>
          <strong>{metrics.pending}</strong>
        </div>
      </section>

      <OfflinePanel
        actions={actions}
        metrics={metrics}
        offline={state.offline}
        peerCount={state.peerCount}
      />

      {state.lastError ? (
        <p className='error-banner' role='status'>
          {state.lastError}
        </p>
      ) : null}

      <section className='room-grid'>
        <ChatPanel
          actions={actions}
          connected={connected}
          metrics={metrics}
          offlineActive={offlineActive}
          state={state}
        />
        <ControlsPanel actions={actions} hasEvents={hasEvents} metrics={metrics} state={state} />
        <TimelinePanel actions={actions} derived={derived} state={state} />
      </section>
    </main>
  )
}
