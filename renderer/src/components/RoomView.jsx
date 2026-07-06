import { Bell, Link2, MoreHorizontal, Users } from 'lucide-react'
import { AnimatePresence } from 'framer-motion'
import { useState } from 'react'

import chatBgSharp from './home/chat-bg-sharp.png'
import { profileAvatarForName } from './home/homeModel.js'
import { ChatPanel } from './ChatPanel.jsx'
import { InviteModal } from './conversation/InviteModal.jsx'
import { MatchRoomView } from './match/MatchRoomView.jsx'
import './conversation/generatedConversation.css'

export function RoomView({ controller }) {
  const { actions, derived, state } = controller
  const [inviteOpen, setInviteOpen] = useState(false)
  const metrics = derived.metrics
  const offlineActive = state.offline.enabled
  const connected = !offlineActive && state.peerCount > 0
  const conversationRoom = ['group', 'private', 'dm'].includes(state.roomKind)

  if (conversationRoom) {
    const isDm = state.roomKind === 'dm'
    const memberCount = Math.max(1, state.peerCount + 1)
    const title = state.roomTitle || (isDm ? 'Direct message' : 'Private group')
    const accent = isDm ? '#B87A70' : '#7FA6D1'
    const conversationAvatar = isDm ? profileAvatarForName(state, title, `${title}-dm`) : ''

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
            avatar={conversationAvatar}
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

  return <MatchRoomView controller={controller} />
}

function ConversationHeader({
  accent,
  avatar,
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
          <img alt={title} src={avatar} />
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
