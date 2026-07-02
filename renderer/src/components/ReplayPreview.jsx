import { RotateCcw, X } from 'lucide-react'

import { safeClass } from '../tifo/domain.js'

export function ReplayPreview({ actions, replay }) {
  if (!replay.active) return null
  const complete = replay.mode === 'complete'

  return (
    <section className={`replay-preview ${complete ? 'complete' : 'running'}`} aria-live='polite'>
      <div className='replay-main'>
        <div>
          <span className='status-label'>Replay Echo</span>
          <strong>{replay.title}</strong>
          <p>{replay.detail}</p>
          {replay.error ? <small>{replay.error}</small> : null}
        </div>
        <div className='replay-meta'>
          <span>{replay.anchorLabel}</span>
          <span>{replay.windowLabel}</span>
          <span>{replay.cueCount} cues</span>
        </div>
      </div>
      <div className='replay-progress-block'>
        <div className='replay-progress' aria-hidden='true'>
          <span style={{ width: `${replay.progress}%` }}></span>
        </div>
        <ReplayCueRail replay={replay} />
      </div>
      <div className='replay-feed'>
        <ReplayMessages replay={replay} />
      </div>
      <div className='replay-controls'>
        <button
          className='ghost-action inline-flex items-center justify-center gap-2'
          type='button'
          onClick={() => actions.replayFrom(replay.anchorId)}
        >
          <RotateCcw size={14} strokeWidth={2.4} />
          {complete ? 'Replay again' : 'Restart'}
        </button>
        <button
          className='ghost-action inline-flex items-center justify-center gap-2'
          type='button'
          onClick={() => actions.resetReplayPreview({ renderAfter: true })}
        >
          <X size={14} strokeWidth={2.4} />
          Close
        </button>
      </div>
    </section>
  )
}

function ReplayCueRail({ replay }) {
  if (!replay.cues.length) return null

  return (
    <div className='replay-cue-rail' aria-hidden='true'>
      {replay.cues.map((cue) => (
        <span
          className={`tone-${safeClass(cue.tone)} ${replay.activeEventId === cue.id ? 'active' : ''}`}
          title={`${cue.offset} ${cue.label}`}
          key={`${cue.id}-${cue.offset}`}
        ></span>
      ))}
    </div>
  )
}

function ReplayMessages({ replay }) {
  if (!replay.messages.length) {
    return <div className='replay-empty'>Waiting for the first Echo cue.</div>
  }

  return replay.messages.map((message) => (
    <article
      className={`replay-message tone-${safeClass(message.tone)} ${safeClass(message.type)}`}
      key={message.id}
    >
      <span>{message.offset}</span>
      <div>
        <strong>{message.label}</strong>
        <p>
          {message.sender} · {message.type === 'clip' ? `Clip card: ${message.text}` : message.text}
        </p>
        {message.type === 'clip' ? <em>Highlight clip placeholder</em> : null}
      </div>
    </article>
  ))
}
