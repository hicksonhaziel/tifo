import { motion } from 'framer-motion'
import { RotateCcw, Sparkles, X } from 'lucide-react'

import { safeClass } from '../../tifo/domain.js'

export function ReplayModal({ actions, replay }) {
  if (!replay.active) return null
  const complete = replay.mode === 'complete'

  const activeMessage =
    replay.messages.find((message) => message.id === replay.activeEventId) || null
  const heroOffset = activeMessage?.offset || replay.messages[0]?.offset || '0:00'
  const heroLabel = activeMessage?.label || replay.title || 'Terrace Echo'
  const heroSender = activeMessage?.sender || ''

  function close() {
    actions.resetReplayPreview({ renderAfter: true })
  }

  return (
    <motion.div
      className='replay-modal-overlay'
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      onClick={close}
      role='dialog'
      aria-modal='true'
      aria-label='Replay Echo'
    >
      <motion.div
        className={`replay-modal ${complete ? 'complete' : 'running'}`}
        initial={{ opacity: 0, y: 28, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 18, scale: 0.97 }}
        transition={{ duration: 0.32, ease: [0.2, 0.8, 0.3, 1] }}
        onClick={(event) => event.stopPropagation()}
      >
        <div className='replay-modal-aura' aria-hidden='true' />

        <button className='replay-modal-close' onClick={close} title='Close' type='button'>
          <X size={17} strokeWidth={2.4} />
        </button>

        {/* Echo stage — the ripple motif visualizes the Echo replaying */}
        <div className='replay-modal-stage'>
          <div className={`replay-echo-rings ${complete ? 'done' : ''}`} aria-hidden='true'>
            <span className='ring r1' />
            <span className='ring r2' />
            <span className='ring r3' />
            <span className='replay-echo-core'>
              <em>{heroOffset}</em>
              <small>echo</small>
            </span>
          </div>
          <div className='replay-stage-copy'>
            <span className='status-label'>
              <span className={`replay-live-dot ${complete ? 'done' : ''}`} aria-hidden='true' />
              {complete ? 'Echo · complete' : 'Replay Echo · live'}
            </span>
            <strong>{heroLabel}</strong>
            <p>
              {heroSender ? `${heroSender} · ${replay.title || 'Terrace Echo'}` : replay.detail}
            </p>
            <div className='replay-modal-meta'>
              {replay.anchorLabel ? <span>{replay.anchorLabel}</span> : null}
              {replay.windowLabel ? <span>{replay.windowLabel}</span> : null}
              <span>{replay.cueCount} cues</span>
            </div>
          </div>
        </div>

        <div className='replay-modal-progress' aria-hidden='true'>
          <span style={{ width: `${replay.progress}%` }} />
        </div>

        {replay.cues.length ? (
          <div className='replay-modal-cues' aria-hidden='true'>
            {replay.cues.map((cue) => (
              <span
                className={`tone-${safeClass(cue.tone)} ${
                  replay.activeEventId === cue.id ? 'active' : ''
                }`}
                key={`${cue.id}-${cue.offset}`}
                title={`${cue.offset} ${cue.label}`}
              />
            ))}
          </div>
        ) : null}

        <div className='replay-modal-feed'>
          {replay.messages.length ? (
            replay.messages.map((message) => (
              <motion.article
                className={`replay-modal-msg tone-${safeClass(message.tone)} ${safeClass(
                  message.type
                )} ${replay.activeEventId === message.id ? 'active' : ''}`}
                key={message.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.24, ease: 'easeOut' }}
              >
                <span className='off'>{message.offset}</span>
                <div className='body'>
                  <strong>{message.label}</strong>
                  <p>
                    {message.sender} ·{' '}
                    {message.type === 'clip' ? `Clip: ${message.text}` : message.text}
                  </p>
                </div>
              </motion.article>
            ))
          ) : (
            <div className='replay-modal-empty'>
              <Sparkles size={16} strokeWidth={2.4} />
              Waiting for the first Echo cue…
            </div>
          )}
        </div>

        {replay.error ? <p className='replay-modal-error'>{replay.error}</p> : null}

        <div className='replay-modal-controls'>
          <button className='btn' onClick={() => actions.replayFrom(replay.anchorId)} type='button'>
            <RotateCcw size={14} strokeWidth={2.4} />
            {complete ? 'Replay again' : 'Restart'}
          </button>
          <button className='btn primary' onClick={close} type='button'>
            <X size={14} strokeWidth={2.4} />
            Close Echo
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}
