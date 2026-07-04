import { Bell, Copy, Link2, LogOut, MoreHorizontal, Users } from 'lucide-react'
import { AnimatePresence } from 'framer-motion'
import { useState } from 'react'

import { eventMeta, reactionTheme, roomParts, safeClass } from '../tifo/domain.js'
import { profileLabel } from '../tifo/identity.js'
import { roomInviteLabel } from '../tifo/invites.js'
import chatBgSharp from './home/chat-bg-sharp.png'
import { avatarUrl } from './home/homeModel.js'
import { OfflinePanel } from './OfflinePanel.jsx'
import { ReactionEffects } from './ReactionEffects.jsx'
import { ReplayPreview } from './ReplayPreview.jsx'
import { ChatPanel } from './ChatPanel.jsx'
import { ControlsPanel } from './ControlsPanel.jsx'
import { InviteModal } from './conversation/InviteModal.jsx'
import { TimelinePanel } from './TimelinePanel.jsx'
import './conversation/generatedConversation.css'

export function RoomView({ controller }) {
  const { actions, derived, state } = controller
  const [copyStatus, setCopyStatus] = useState('')
  const [inviteOpen, setInviteOpen] = useState(false)
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
    const isDm = state.roomKind === 'dm'
    const memberCount = Math.max(1, state.peerCount + 1)
    const title = state.roomTitle || (isDm ? 'Direct message' : 'Private group')
    const accent = isDm ? '#B87A70' : '#7FA6D1'

    return (
      <main
        className='tifo-generated-conversation'
        style={{
          '--chat-bg-image': `url(${chatBgSharp})`
        }}
      >
        <div className='col grow' style={{ minHeight: 0 }}>
          <ConversationHeader
            accent={accent}
            connected={connected}
            isDm={isDm}
            memberCount={memberCount}
            onOpenInvite={() => setInviteOpen(true)}
            roomInvite={state.roomInvite}
            title={title}
          />

          {state.lastError ? (
            <p className='conversation-error-banner' role='status'>
              {state.lastError}
            </p>
          ) : null}

          <ChatPanel
            actions={actions}
            connected={connected}
            derived={derived}
            metrics={metrics}
            offlineActive={offlineActive}
            placeholder='Say something to the terrace...'
            state={state}
            title={isDm ? `Direct message with ${title}` : title}
            variant='generated'
          />
          <AnimatePresence>
            {inviteOpen ? (
              <InviteModal
                inviteLink={state.roomInvite}
                onClose={() => setInviteOpen(false)}
                title={title}
              />
            ) : null}
          </AnimatePresence>
        </div>
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
        syncDiagnostics={state.syncDiagnostics}
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

function ConversationHeader({
  accent,
  connected,
  isDm,
  memberCount,
  onOpenInvite,
  roomInvite,
  title
}) {
  const subtitle = isDm
    ? connected
      ? 'Direct messages · peer online'
      : 'Direct messages · local-first'
    : `${memberCount} member${memberCount === 1 ? '' : 's'} · ${
        connected ? 'online' : 'local-first'
      }`

  return (
    <div className='content-header'>
      <div className='conversation-avatar avatar'>
        {isDm ? (
          <img alt={title} src={avatarUrl(`${title}-dm`)} />
        ) : (
          <div
            style={{
              alignItems: 'center',
              background: `linear-gradient(135deg, ${accent}55, ${accent}11)`,
              color: accent,
              display: 'flex',
              height: '100%',
              justifyContent: 'center',
              width: '100%'
            }}
          >
            <Users size={16} strokeWidth={2.4} />
          </div>
        )}
        <span className='presence-dot' aria-hidden='true' />
      </div>

      <div className='conversation-title col'>
        <div className='row aic gap-2'>
          <span className='h-display'>{title}</span>
          <span className={`chip ${isDm && connected ? 'live' : 'mute'}`}>
            {isDm ? (connected ? 'ONLINE' : 'LOCAL') : 'PRIVATE GROUP'}
          </span>
        </div>
        <span className='t-xs c-mute'>{subtitle}</span>
      </div>

      <div className='grow' />

      <div className='row aic gap-2 header-actions'>
        {!isDm && roomInvite ? (
          <button className='btn ghost sm' type='button' onClick={onOpenInvite}>
            <Link2 size={12} strokeWidth={2.4} />
            Invite
          </button>
        ) : null}
        <button className='btn ghost icon' title='Notifications' type='button'>
          <Bell size={14} strokeWidth={2.4} />
        </button>
        <button className='btn ghost icon' title='More' type='button'>
          <MoreHorizontal size={14} strokeWidth={2.4} />
        </button>
      </div>
    </div>
  )
}
