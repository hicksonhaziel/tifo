import { Copy, LogOut } from 'lucide-react'
import { useState } from 'react'

import { eventMeta, reactionTheme, roomParts, safeClass } from '../tifo/domain.js'
import { profileLabel } from '../tifo/identity.js'
import { roomInviteLabel } from '../tifo/invites.js'
import { OfflinePanel } from './OfflinePanel.jsx'
import { ReactionEffects } from './ReactionEffects.jsx'
import { ReplayPreview } from './ReplayPreview.jsx'
import { ChatPanel } from './ChatPanel.jsx'
import { ControlsPanel } from './ControlsPanel.jsx'
import { TimelinePanel } from './TimelinePanel.jsx'

export function RoomView({ controller }) {
  const { actions, derived, state } = controller
  const [copyStatus, setCopyStatus] = useState('')
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
  const conversationRoom = ['group', 'private', 'dm'].includes(state.roomKind)

  async function copyInvite() {
    if (!state.roomInvite) return
    try {
      await window.navigator.clipboard.writeText(state.roomInvite)
      setCopyStatus('Invite copied')
    } catch {
      setCopyStatus('Copy failed')
    }
  }

  if (conversationRoom) {
    return (
      <main className='conversation-view'>
        <header className='conversation-header'>
          <div className='brand-mini'>
            <img className='brand-icon-image' src='../assets/brand/icon/tifo-app-icon.png' alt='' />
            <div>
              <p className='eyebrow'>{roomInviteLabel({ kind: state.roomKind })}</p>
              <h1>{state.roomTitle}</h1>
            </div>
          </div>
          <div className='room-actions'>
            <span
              className={`live-badge ${offlineActive ? 'offline' : connected ? 'connected' : ''}`}
            >
              <span aria-hidden='true'></span>
              {offlineActive ? 'Offline' : connected ? 'Live' : 'Seeking peers'}
            </span>
            {state.roomInvite && state.roomKind !== 'dm' ? (
              <button
                className='ghost-action inline-flex items-center justify-center gap-2'
                type='button'
                onClick={copyInvite}
              >
                <Copy size={15} strokeWidth={2.4} />
                {copyStatus || 'Copy invite'}
              </button>
            ) : null}
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

        {state.lastError ? (
          <p className='error-banner' role='status'>
            {state.lastError}
          </p>
        ) : null}

        <section className='conversation-main'>
          <ChatPanel
            actions={actions}
            connected={connected}
            derived={derived}
            metrics={metrics}
            offlineActive={offlineActive}
            placeholder='Write a message'
            state={state}
            subtitle={
              state.roomKind === 'dm'
                ? 'Direct chat with images, voice notes, and reactions'
                : 'Group chat with images, voice notes, and reactions'
            }
            surfaceClassName='conversation-surface'
            title={state.roomKind === 'dm' ? 'Messages' : 'Group chat'}
          />
        </section>
      </main>
    )
  }

  return (
    <main className={`room-view ${activeEffect ? `effect-${safeClass(activeEffect.tone)}` : ''}`}>
      <ReactionEffects effects={state.effects} />

      <header className='room-header'>
        <div className='brand-mini'>
          <img className='brand-icon-image' src='../assets/brand/icon/tifo-app-icon.png' alt='' />
          <div>
            <p className='eyebrow'>{roomInviteLabel({ kind: state.roomKind })}</p>
            <h1>{state.roomTitle}</h1>
          </div>
        </div>
        <div className='room-actions'>
          <span
            className={`live-badge ${offlineActive ? 'offline' : connected ? 'connected' : ''}`}
          >
            <span aria-hidden='true'></span>
            {offlineActive ? 'Offline mode' : connected ? 'P2P live' : 'Seeking peers'}
          </span>
          {state.roomInvite && state.roomKind !== 'dm' ? (
            <button
              className='ghost-action inline-flex items-center justify-center gap-2'
              type='button'
              onClick={copyInvite}
            >
              <Copy size={15} strokeWidth={2.4} />
              {copyStatus || 'Invite'}
            </button>
          ) : null}
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
          <strong>{profileLabel(state.profile)}</strong>
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
          allowFanDm
          connected={connected}
          derived={derived}
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
