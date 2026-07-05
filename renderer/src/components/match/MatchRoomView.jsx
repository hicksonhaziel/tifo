import {
  Bell,
  CircleDot,
  Copy,
  Link2,
  MessageCircle,
  Mic,
  MoreHorizontal,
  Play,
  Radio,
  RefreshCw,
  RotateCcw,
  Sparkles,
  Video,
  Wifi,
  WifiOff,
  Zap
} from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

import { reactionTypes } from '../../tifo/constants.js'
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
import { ChantRecorder } from '../ChantRecorder.jsx'
import { ChatPanel } from '../ChatPanel.jsx'
import { ClipPicker } from '../ClipPicker.jsx'
import { ReactionEffects } from '../ReactionEffects.jsx'
import { ReplayPreview } from '../ReplayPreview.jsx'
import '../conversation/generatedConversation.css'
import { BallAvatar } from '../home/BallAvatar.jsx'
import chatBgSharp from '../home/chat-bg-sharp.png'
import { avatarUrl } from '../home/homeModel.js'
import './generatedMatch.css'

export function MatchRoomView({ controller }) {
  const { actions, derived, state } = controller
  const [copyStatus, setCopyStatus] = useState('')
  const [railTab, setRailTab] = useState('highlights')
  const metrics = derived.metrics
  const match = roomParts(state.roomCode)
  const offlineActive = state.offline.enabled
  const connected = !offlineActive && state.peerCount > 0
  const hasEvents = metrics.playableEvents.length > 0
  const activeEffect = state.effects[0]
  const matchTitle = state.roomTitle || `${match.home} vs ${match.away}`
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
  const headerFanCount = Math.max(state.peerCount + 1, fans.length)

  async function copyInvite() {
    const value = state.roomInvite || state.roomCode
    if (!value) return
    try {
      await window.navigator.clipboard.writeText(value)
      setCopyStatus('Copied')
    } catch {
      setCopyStatus('Failed')
    }
    window.setTimeout(() => setCopyStatus(''), 1500)
  }

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
          connected={connected}
          copyStatus={copyStatus}
          fanCount={headerFanCount}
          match={match}
          matchTitle={matchTitle}
          offlineActive={offlineActive}
          onCopyInvite={copyInvite}
          state={state}
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
                  label='Highlights'
                  onClick={() => setRailTab('highlights')}
                />
                <RailTab
                  active={railTab === 'actions'}
                  count={metrics.reactions + metrics.chants + metrics.clips}
                  label='Actions'
                  onClick={() => setRailTab('actions')}
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
              {railTab === 'actions' ? (
                <ActionsTab
                  actions={actions}
                  hasEvents={hasEvents}
                  metrics={metrics}
                  state={state}
                />
              ) : null}
              {railTab === 'fans' ? <FansTab actions={actions} fans={fans} state={state} /> : null}
            </div>
          </aside>
        </section>
      </div>
    </main>
  )
}

function MatchHeader({
  connected,
  copyStatus,
  fanCount,
  match,
  matchTitle,
  offlineActive,
  onCopyInvite,
  state
}) {
  const syncLabel = offlineActive ? 'OFFLINE' : connected ? 'P2P LIVE' : 'SEARCHING'
  const subtitle = [match.round, state.roomCode].filter(Boolean).join(' · ')

  return (
    <div className='content-header match-content-header'>
      <BallAvatar size={38} />
      <div className='conversation-title col'>
        <div className='row aic gap-2'>
          <span className='h-display'>{matchTitle}</span>
          <span className={`chip ${connected ? 'live' : 'mute'}`}>
            {syncLabel} · {fanCount} fans
          </span>
        </div>
        <span className='t-xs c-mute'>{subtitle || 'Live match terrace'}</span>
      </div>
      <div className='grow' />
      <div className='row aic gap-1 header-actions'>
        <button className='btn ghost sm' type='button' onClick={onCopyInvite}>
          {state.roomInvite ? (
            <Link2 size={12} strokeWidth={2.4} />
          ) : (
            <Copy size={12} strokeWidth={2.4} />
          )}
          {copyStatus || (state.roomInvite ? 'Invite' : 'Copy room')}
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

function ActionsTab({ actions, hasEvents, metrics, state }) {
  return (
    <div className='match-actions-tab'>
      <div className='match-rail-card'>
        <div className='match-section-title'>
          <span>Terrace flares</span>
          <small>{metrics.reactions} sent</small>
        </div>
        <div className='match-flare-grid'>
          {reactionTypes.map((reaction) => (
            <button
              className={`match-flare-button tone-${safeClass(reaction.tone)}`}
              key={reaction.type}
              onClick={() => actions.sendReaction(reaction.type)}
              type='button'
            >
              <span aria-hidden='true'>{reactionGlyph(reaction.type)}</span>
              <strong>{reaction.label}</strong>
              <small>{reaction.cue}</small>
            </button>
          ))}
        </div>
      </div>

      <div className='match-rail-card compact'>
        <button
          className='match-replay-action'
          disabled={!hasEvents}
          onClick={() => actions.replayFrom()}
          type='button'
        >
          <Play size={14} fill='currentColor' strokeWidth={2.4} />
          Replay Echo
        </button>
        <p className='match-note'>
          {hasEvents
            ? `${metrics.playableEvents.length} Echo-ready moments`
            : 'Waiting for clips, chants, or flares'}
        </p>
      </div>

      <div className='match-rail-card controls-card'>
        <ClipPicker actions={actions} clip={state.clipDraft} />
      </div>

      <div className='match-rail-card controls-card'>
        <ChantRecorder actions={actions} recorder={state.chantRecorder} />
      </div>

      <SyncCard actions={actions} metrics={metrics} state={state} />
    </div>
  )
}

function SyncCard({ actions, metrics, state }) {
  const offlineActive = state.offline.enabled
  const diagnostics = state.syncDiagnostics

  return (
    <div className='match-rail-card sync-card'>
      <div className='match-section-title'>
        <span>Mesh health</span>
        <small>{state.syncStatus}</small>
      </div>
      <div className='match-status-grid'>
        <StatusStat icon={<Wifi size={13} />} label='Room peers' value={state.peerCount} />
        <StatusStat icon={<Radio size={13} />} label='App peers' value={diagnostics.appPeers} />
        <StatusStat icon={<CircleDot size={13} />} label='Pending' value={metrics.pending} />
        <StatusStat
          icon={<RefreshCw size={13} />}
          label='Last sync'
          value={diagnostics.lastSyncAt ? formatTime(diagnostics.lastSyncAt) : 'Now'}
        />
      </div>
      <div className='match-sync-actions'>
        <button className='btn ghost sm' type='button' onClick={actions.requestRoomSync}>
          <RefreshCw size={12} strokeWidth={2.4} />
          Sync
        </button>
        <button className='btn ghost sm' type='button' onClick={actions.recoverRoomHistory}>
          <RotateCcw size={12} strokeWidth={2.4} />
          Recover
        </button>
        <button
          className={`btn ghost sm ${offlineActive ? 'active' : ''}`}
          type='button'
          onClick={() => actions.setOffline(!offlineActive)}
        >
          {offlineActive ? (
            <WifiOff size={12} strokeWidth={2.4} />
          ) : (
            <Wifi size={12} strokeWidth={2.4} />
          )}
          {offlineActive ? 'Offline' : 'Online'}
        </button>
      </div>
    </div>
  )
}

function StatusStat({ icon, label, value }) {
  return (
    <div className='match-status-stat'>
      <span>{icon}</span>
      <small>{label}</small>
      <strong>{value}</strong>
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

function reactionGlyph(type) {
  if (type === 'goal') return 'G'
  if (type === 'save') return 'S'
  if (type === 'penalty') return 'P'
  if (type === 'warning') return 'W'
  if (type === 'flare') return 'F'
  if (type === 'foul') return '!'
  return type.slice(0, 1).toUpperCase()
}
