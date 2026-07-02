import { motion } from 'framer-motion'

import { eventMeta, eventStatusLabel, reactionTheme, safeClass } from '../tifo/domain.js'
import {
  formatBytes,
  formatClipDuration,
  formatDate,
  formatDuration,
  formatTime
} from '../tifo/format.js'

export function TimelinePanel({ actions, derived, state }) {
  return (
    <section className='timeline-surface' aria-labelledby='timeline-title'>
      <div className='section-heading'>
        <div>
          <h2 id='timeline-title'>Echo timeline</h2>
          <p>
            {derived.metrics.peerEvents} peer events, {derived.metrics.saved} saved
          </p>
        </div>
        <span className='timeline-count'>{state.events.length} events</span>
      </div>
      <ol className='timeline-list'>
        {state.events.length > 0 ? (
          state.events.map((event) => (
            <TimelineEvent
              actions={actions}
              derived={derived}
              event={event}
              state={state}
              key={event.id}
            />
          ))
        ) : (
          <li className='empty-state'>
            The terrace is quiet. First messages and flares will appear here.
          </li>
        )}
      </ol>
    </section>
  )
}

function TimelineEvent({ actions, derived, event, state }) {
  const meta = eventMeta(event)
  const status = derived.eventStatus(event)
  const reaction = event.type === 'reaction' ? reactionTheme(event.payload.type) : null
  const reactionClass = reaction ? `reaction-${safeClass(reaction.type)} tone-${reaction.tone}` : ''
  const replayClass = [
    state.replayPreview.activeEventId === event.id ? 'replay-active' : '',
    state.replayPreview.anchorId === event.id ? 'replay-anchor' : ''
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <motion.li
      className={`timeline-event ${event.type} ${status} ${reactionClass} ${replayClass}`}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
    >
      <div className='event-icon' aria-hidden='true'></div>
      <div>
        <div className='event-meta'>
          <span>{meta.label}</span>
          <span>{formatTime(event.timestamp)}</span>
        </div>
        <TimelineEventBody actions={actions} derived={derived} event={event} meta={meta} />
        <div className='event-footer'>
          <span className='event-sender'>{event.sender}</span>
          <div className='event-actions'>
            <span className={`event-status ${status}`}>{eventStatusLabel(event, state)}</span>
            {event.type !== 'system' ? (
              <button
                className='event-replay-action'
                type='button'
                onClick={() => actions.replayFrom(event.id)}
              >
                Replay
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </motion.li>
  )
}

function TimelineEventBody({ actions, derived, event, meta }) {
  if (event.type === 'clip') {
    return <ClipEvent actions={actions} derived={derived} event={event} />
  }
  if (event.type === 'chant') {
    return <ChantEvent actions={actions} derived={derived} event={event} />
  }
  return <p>{meta.text}</p>
}

function ChantEvent({ actions, derived, event }) {
  const audioUrl = derived.chantAudioUrls.get(event.id)
  const isLoading = derived.pendingChantLoads.has(event.id)
  const duration = formatDuration(event.payload.durationMs)

  return (
    <div className='chant-event'>
      <p>
        {duration} terrace chant · {formatBytes(event.payload.size)}
      </p>
      {audioUrl ? (
        <audio controls preload='metadata' src={audioUrl}></audio>
      ) : (
        <button
          className='chant-load-action'
          type='button'
          disabled={isLoading}
          onClick={() => actions.loadChantAudio(event)}
        >
          {isLoading ? 'Preparing audio' : 'Load audio'}
        </button>
      )}
    </div>
  )
}

function ClipEvent({ derived, event }) {
  const payload = event.payload
  const previewUrl = derived.clipPreviewUrlForEvent(event)
  const isLoading = derived.pendingClipLoads.has(event.id)
  const caption = payload.caption || payload.title || 'Highlight clip'

  return (
    <div className='clip-card'>
      <div>
        <strong>{caption}</strong>
        <p>{clipDetailText(event)}</p>
      </div>
      {previewUrl ? (
        <video className='clip-preview' controls preload='metadata' src={previewUrl}></video>
      ) : (
        <div className='clip-unavailable'>
          {isLoading ? 'Preparing clip from peer' : 'Clip unavailable on this device'}
        </div>
      )}
    </div>
  )
}

function clipDetailText(event) {
  const payload = event.payload
  const date = formatDate(payload.lastModified || event.timestamp)
  return `${formatClipDuration(payload.durationMs)} · ${date} · ${formatBytes(payload.size)}`
}
