import { Play, Zap } from 'lucide-react'

import { reactionTypes } from '../tifo/constants.js'
import { ClipPicker } from './ClipPicker.jsx'
import { ChantRecorder } from './ChantRecorder.jsx'

export function ControlsPanel({ actions, hasEvents, metrics, state }) {
  return (
    <aside className='controls-surface' aria-labelledby='controls-title'>
      <div className='section-heading'>
        <div>
          <h2 id='controls-title'>Terrace actions</h2>
          <p>
            {metrics.reactions} reactions, {metrics.chants} chants, {metrics.clips} clips
          </p>
        </div>
      </div>
      <div className='reaction-grid'>
        {reactionTypes.map((reaction) => (
          <button
            className={`reaction-button tone-${reaction.tone}`}
            type='button'
            data-reaction={reaction.type}
            onClick={() => actions.sendReaction(reaction.type)}
            key={reaction.type}
          >
            <span className='reaction-dot' aria-hidden='true'></span>
            <span>
              <strong className='inline-flex items-center gap-2'>
                {reaction.type === 'flare' ? <Zap size={13} strokeWidth={2.4} /> : null}
                {reaction.label}
              </strong>
              <small>{reaction.cue}</small>
            </span>
          </button>
        ))}
      </div>
      <button
        className='replay-action inline-flex items-center justify-center gap-2'
        id='replay-echo'
        type='button'
        disabled={!hasEvents}
        onClick={() => actions.replayFrom()}
      >
        <Play size={15} fill='currentColor' strokeWidth={2.4} />
        Replay Echo
      </button>
      <p className='control-note'>
        {hasEvents
          ? `${metrics.playableEvents.length} Echo-ready events`
          : 'Waiting for terrace noise'}
      </p>
      <ClipPicker actions={actions} clip={state.clipDraft} />
      <ChantRecorder actions={actions} recorder={state.chantRecorder} />
    </aside>
  )
}
