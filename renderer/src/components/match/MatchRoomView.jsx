import {
  Bell,
  Link2,
  MessageCircle,
  Mic,
  MoreHorizontal,
  Play,
  Sparkles,
  Video,
  Zap
} from 'lucide-react'
import { AnimatePresence } from 'framer-motion'
import { useMemo, useRef, useState } from 'react'

import {
  eventMeta,
  eventStatusLabel,
  reactionTheme,
  roomParts,
  safeClass,
  timelineEvents
} from '../../tifo/domain.js'
import {
  formatBytes,
  formatClipDuration,
  formatDate,
  formatDuration,
  formatTime
} from '../../tifo/format.js'
import { profileLabel, profileName } from '../../tifo/identity.js'
import { availableRooms } from '../../tifo/rooms.js'
import { ChatPanel } from '../ChatPanel.jsx'
import { InviteModal } from '../conversation/InviteModal.jsx'
import { ReactionEffects } from '../ReactionEffects.jsx'
import { ReplayPreview } from '../ReplayPreview.jsx'
import '../conversation/generatedConversation.css'
import { BallAvatar } from '../home/BallAvatar.jsx'
import chatBgSharp from '../home/chat-bg-sharp.png'
import { avatarUrl } from '../home/homeModel.js'
import './generatedMatch.css'

export function MatchRoomView({ controller }) {
  const { actions, derived, state } = controller
  const [inviteOpen, setInviteOpen] = useState(false)
  const [railTab, setRailTab] = useState('highlights')
  const metrics = derived.metrics
  const roomFixture = useMemo(
    () => availableRooms.find((room) => room.code === state.roomCode) || null,
    [state.roomCode]
  )
  const match = roomFixture
    ? {
        away: roomFixture.awayName || roomFixture.away,
        home: roomFixture.homeName || roomFixture.home,
        round: roomFixture.round || roomFixture.region || ''
      }
    : roomParts(state.roomCode)
  const offlineActive = state.offline.enabled
  const connected = !offlineActive && state.peerCount > 0
  const activeEffect = state.effects[0]
  const matchTitle = matchRoomTitle({
    fallbackTitle: `${match.home} vs ${match.away}`,
    roomCode: state.roomCode,
    roomFixture,
    stateTitle: state.roomTitle
  })
  const highlights = useMemo(() => {
    return timelineEvents(state.events)
      .slice()
      .sort((left, right) => {
        const timeDelta = right.timestamp - left.timestamp
        if (timeDelta !== 0) return timeDelta
        return right.localCreatedAt - left.localCreatedAt
      })
  }, [state.events])
  const fans = useMemo(() => knownFans(state), [state.events, state.profile])
  const inviteLink = state.roomInvite || state.roomCode

  return (
    <main
      className={`tifo-generated-conversation tifo-generated-match ${
        activeEffect ? `effect-${safeClass(activeEffect.tone)}` : ''
      }`}
      style={{
        '--chat-bg-image': `url(${chatBgSharp})`
      }}
    >
      <ReactionEffects effects={state.effects} />
      <div className='col grow match-room-shell'>
        <MatchHeader
          match={match}
          matchTitle={matchTitle}
          onOpenInvite={() => setInviteOpen(true)}
        />

        {state.lastError ? (
          <p className='conversation-error-banner' role='status'>
            {state.lastError}
          </p>
        ) : null}

        <ReplayPreview actions={actions} replay={state.replayPreview} />

        <section className='match-room-body' aria-label='Match room'>
          <div className='match-chat-pane'>
            <ChatPanel
              actions={actions}
              allowFanDm
              composerMode='match'
              connected={connected}
              derived={derived}
              metrics={metrics}
              offlineActive={offlineActive}
              placeholder='Say something to the terrace...'
              state={state}
              title='Terrace chat'
              variant='generated'
            />
          </div>

          <aside className='rail match-rail' aria-label='Match room controls'>
            <div className='match-rail-tabs'>
              <div className='rail-tabs'>
                <RailTab
                  active={railTab === 'highlights'}
                  count={highlights.length}
                  label='Timeline'
                  onClick={() => setRailTab('highlights')}
                />
                <RailTab
                  active={railTab === 'fans'}
                  count={fans.length}
                  label='Fans'
                  onClick={() => setRailTab('fans')}
                />
              </div>
            </div>

            <div className='match-rail-scroll'>
              {railTab === 'highlights' ? (
                <HighlightsTab
                  actions={actions}
                  derived={derived}
                  events={highlights}
                  state={state}
                />
              ) : null}
              {railTab === 'fans' ? <FansTab actions={actions} fans={fans} state={state} /> : null}
            </div>
          </aside>
        </section>
        <AnimatePresence>
          {inviteOpen ? (
            <InviteModal
              inviteLink={inviteLink}
              kindLabel='room'
              onClose={() => setInviteOpen(false)}
              title={matchTitle}
            />
          ) : null}
        </AnimatePresence>
      </div>
    </main>
  )
}

function MatchHeader({ match, matchTitle, onOpenInvite }) {
  const subtitle = match.round || 'Live match terrace'

  return (
    <div className='content-header match-content-header'>
      <BallAvatar size={38} />
      <div className='conversation-title col'>
        <div className='row aic gap-2'>
          <span className='h-display'>{matchTitle}</span>
        </div>
        <span className='t-xs c-mute'>{subtitle || 'Live match terrace'}</span>
      </div>
      <div className='grow' />
      <div className='row aic gap-1 header-actions'>
        <button className='btn ghost sm' type='button' onClick={onOpenInvite}>
          <Link2 size={12} strokeWidth={2.4} />
          Invite
        </button>
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

function RailTab({ active, count, label, onClick }) {
  return (
    <button className={`rail-tab ${active ? 'active' : ''}`} onClick={onClick} type='button'>
      {label}
      <span className='count'>{count}</span>
    </button>
  )
}

function HighlightsTab({ actions, derived, events, state }) {
  if (events.length === 0) {
    return (
      <div className='match-empty-card'>
        <Sparkles size={18} strokeWidth={2.4} />
        <strong>Waiting for the first echo</strong>
        <span>Flares, chants, and clips will land here.</span>
      </div>
    )
  }

  return (
    <ol className='match-highlight-list'>
      {events.map((event) => (
        <HighlightItem
          actions={actions}
          derived={derived}
          event={event}
          key={event.id}
          state={state}
        />
      ))}
    </ol>
  )
}

function HighlightItem({ actions, derived, event, state }) {
  const meta = eventMeta(event)
  const status = derived.eventStatus(event)
  const reaction = event.type === 'reaction' ? reactionTheme(event.payload.type) : null
  const icon = highlightIcon(event, reaction)

  return (
    <li className={`tl-item match-highlight-item ${safeClass(event.type)} ${status}`}>
      <div className='icon'>{icon}</div>
      <div className='col grow'>
        <div className='meta'>
          <span>@{event.sender}</span>
          <span>·</span>
          <span>{formatTime(event.timestamp)}</span>
          <span>·</span>
          <span>{eventStatusLabel(event, state)}</span>
        </div>
        <div className='title'>{meta.label}</div>
        <p className='match-highlight-text'>{meta.text}</p>
        {event.type === 'clip' ? (
          <ClipHighlight actions={actions} derived={derived} event={event} />
        ) : null}
        {event.type === 'chant' ? (
          <ChantHighlight actions={actions} derived={derived} event={event} />
        ) : null}
        {event.type === 'reaction' && reaction ? <ReactionHighlight reaction={reaction} /> : null}
        <button
          className='match-inline-link'
          type='button'
          onClick={() => actions.replayFrom(event.id)}
        >
          Replay Echo
        </button>
      </div>
    </li>
  )
}

function ClipHighlight({ actions, derived, event }) {
  const payload = event.payload
  const previewUrl = derived.clipPreviewUrlForEvent(event)
  const isLoading = derived.pendingClipLoads.has(event.id)
  const caption = payload.caption || payload.title || 'Highlight clip'

  return (
    <div className='match-clip-highlight'>
      <div className='match-clip-copy'>
        <strong>{caption}</strong>
        <span>
          {formatClipDuration(payload.durationMs)} · {formatBytes(payload.size)} ·{' '}
          {formatDate(event.timestamp)}
        </span>
      </div>
      {previewUrl ? (
        <video controls preload='metadata' src={previewUrl}></video>
      ) : (
        <button
          className='match-media-load'
          disabled={isLoading}
          onClick={() => actions.loadClipVideo(event)}
          type='button'
        >
          {isLoading ? 'Preparing clip' : 'Load clip'}
        </button>
      )}
    </div>
  )
}

function ChantHighlight({ actions, derived, event }) {
  const audioUrl = derived.chantAudioUrls.get(event.id)
  const isLoading = derived.pendingChantLoads.has(event.id)

  if (!audioUrl) {
    return (
      <button
        className='match-media-load'
        disabled={isLoading}
        onClick={() => actions.loadChantAudio(event)}
        type='button'
      >
        {isLoading ? 'Preparing chant' : 'Load chant'}
      </button>
    )
  }

  return <RailAudioPlayer durationMs={event.payload.durationMs || 0} src={audioUrl} />
}

function ReactionHighlight({ reaction }) {
  return (
    <div className={`match-flare-pill tone-${safeClass(reaction.tone)}`}>
      <Zap size={12} strokeWidth={2.6} />
      <span>{reaction.label}</span>
      <small>{reaction.cue}</small>
    </div>
  )
}

function FansTab({ actions, fans, state }) {
  return (
    <div className='match-fans-list'>
      {fans.map((fan) => (
        <div className='match-fan-row' key={fan.id}>
          <div className='avatar'>
            <img alt={`@${fan.name}`} src={avatarUrl(fan.key || fan.name)} />
            <span>{fan.name.slice(0, 1).toUpperCase()}</span>
          </div>
          <div className='col grow'>
            <span className='match-fan-name'>@{fan.name}</span>
            <span className='t-xs c-mute'>
              {fan.self
                ? profileLabel(state.profile)
                : fan.lastSeen
                  ? `Active ${formatTime(fan.lastSeen)}`
                  : 'Known fan'}
            </span>
          </div>
          <button
            className='btn ghost sm'
            disabled={fan.self || !fan.key}
            onClick={() => actions.openDmFromEvent({ sender: fan.name, senderKey: fan.key })}
            type='button'
          >
            <MessageCircle size={12} strokeWidth={2.4} />
            DM
          </button>
        </div>
      ))}
    </div>
  )
}

function RailAudioPlayer({ durationMs, src }) {
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const bars = [6, 10, 14, 18, 12, 20, 8, 14, 16, 10, 18, 6, 12, 20, 14]

  function togglePlayback() {
    const audio = audioRef.current
    if (!audio) return

    if (playing) {
      audio.pause()
      setPlaying(false)
      return
    }

    audio
      .play()
      .then(() => setPlaying(true))
      .catch(() => setPlaying(false))
  }

  return (
    <div className='vn match-rail-audio'>
      <button className='play' onClick={togglePlayback} title='Play chant' type='button'>
        <Play size={12} fill='currentColor' strokeWidth={2.4} />
      </button>
      <div className='wave' aria-hidden='true'>
        {bars.map((height, index) => (
          <i key={index} style={{ height }} />
        ))}
      </div>
      <span className='dur'>{formatDuration(durationMs)}</span>
      <audio
        onEnded={() => setPlaying(false)}
        onPause={() => setPlaying(false)}
        preload='metadata'
        ref={audioRef}
        src={src}
      />
    </div>
  )
}

function knownFans(state) {
  const profile = state.profile
  const selfName = profileName(profile)
  const selfKey = profile?.publicKey || ''
  const fans = new Map()

  if (profile) {
    fans.set(selfKey || selfName, {
      eventCount: 0,
      id: selfKey || selfName,
      key: selfKey,
      lastSeen: Date.now(),
      name: profile.username || selfName,
      self: true
    })
  }

  for (const event of state.events) {
    const name = String(event.sender || '').trim()
    if (!name) continue
    const key = event.senderKey || event.senderIdentityKey || event.senderId || name
    const existing = fans.get(key)
    fans.set(key, {
      eventCount: (existing?.eventCount || 0) + 1,
      id: key,
      key: event.senderKey || event.senderIdentityKey || '',
      lastSeen: Math.max(existing?.lastSeen || 0, event.timestamp || 0),
      name,
      self: existing?.self || (!!selfKey && key === selfKey)
    })
  }

  return Array.from(fans.values()).sort((left, right) => {
    if (left.self) return -1
    if (right.self) return 1
    return right.lastSeen - left.lastSeen || right.eventCount - left.eventCount
  })
}

function highlightIcon(event, reaction) {
  if (event.type === 'clip') return <Video size={14} strokeWidth={2.4} />
  if (event.type === 'chant') return <Mic size={14} strokeWidth={2.4} />
  if (reaction?.type === 'goal') return <Zap size={14} strokeWidth={2.6} />
  return <Sparkles size={14} strokeWidth={2.4} />
}

function matchRoomTitle({ fallbackTitle, roomCode, roomFixture, stateTitle }) {
  if (roomFixture?.title) return roomFixture.title

  const title = String(stateTitle || '').trim()
  if (title && title !== roomCode && title.replace(/\s+/g, '-') !== roomCode) return title

  return fallbackTitle
}
