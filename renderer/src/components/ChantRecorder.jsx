import { Mic, Music2 } from 'lucide-react'

import { CHANT_MAX_MS, CHANT_MIN_MS } from '../tifo/constants.js'
import { formatDuration } from '../tifo/format.js'

export function ChantRecorder({ actions, recorder }) {
  const isRecording = recorder.status === 'recording'
  const isSaving = recorder.status === 'saving'
  const canStop = isRecording && recorder.elapsedMs >= CHANT_MIN_MS
  const progress = Math.min(100, Math.round((recorder.elapsedMs / CHANT_MAX_MS) * 100))
  const buttonText = isRecording ? (canStop ? 'Stop chant' : 'Hold...') : 'Record chant'

  return (
    <div className={`chant-recorder ${isRecording ? 'recording' : ''}`}>
      <div>
        <span className='status-label'>Audio chant</span>
        <strong>
          {isSaving
            ? 'Saving chant'
            : isRecording
              ? formatDuration(recorder.elapsedMs)
              : '3-10 sec clip'}
        </strong>
      </div>
      <div className='chant-meter' aria-hidden='true'>
        <span style={{ width: `${progress}%` }}></span>
      </div>
      <button
        className='chant-action inline-flex items-center justify-center gap-2'
        id='chant-record'
        type='button'
        disabled={isSaving || (isRecording && !canStop)}
        onClick={() => {
          if (isRecording) actions.stopChantRecording()
          else actions.startChantRecording()
        }}
      >
        <Mic size={15} strokeWidth={2.4} />
        {buttonText}
      </button>
      <button
        className='chant-fallback-action inline-flex items-center justify-center gap-2'
        id='chant-fallback'
        type='button'
        disabled={isSaving || isRecording}
        onClick={actions.saveFallbackChant}
      >
        <Music2 size={15} strokeWidth={2.4} />
        Use sample chant
      </button>
      {recorder.error ? (
        <p className='chant-error' role='status'>
          {recorder.error}
        </p>
      ) : (
        <p className='control-note'>
          {isRecording
            ? 'Keep singing until the meter passes 3 seconds.'
            : 'Saved chants join the Echo timeline as local audio.'}
        </p>
      )}
    </div>
  )
}
