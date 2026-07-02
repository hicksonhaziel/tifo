import { Video } from 'lucide-react'
import { useRef } from 'react'

export function ClipPicker({ actions, clip }) {
  const inputRef = useRef(null)
  const saving = clip.status === 'saving'

  function selectClip(event) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (file) actions.saveClipMetadata(file)
  }

  return (
    <div className={`clip-picker ${saving ? 'saving' : ''}`}>
      <div>
        <span className='status-label'>Highlight clip</span>
        <strong>{saving ? 'Saving clip' : 'Clip metadata'}</strong>
      </div>
      <input
        id='clip-caption'
        maxLength='140'
        placeholder='Clip caption'
        value={clip.caption}
        disabled={saving}
        onChange={(event) => actions.setClipCaption(event.currentTarget.value)}
      />
      <input
        id='clip-input'
        type='file'
        accept='video/*'
        hidden
        ref={inputRef}
        onChange={selectClip}
      />
      <button
        className='clip-action inline-flex items-center justify-center gap-2'
        id='clip-select'
        type='button'
        disabled={saving}
        onClick={() => inputRef.current?.click()}
      >
        <Video size={15} strokeWidth={2.4} />
        {saving ? 'Reading clip' : 'Select clip'}
      </button>
      {clip.error ? (
        <p className='clip-error' role='status'>
          {clip.error}
        </p>
      ) : (
        <p className='control-note'>Peer transfer supports clips up to 5 minutes and 64 MB.</p>
      )}
    </div>
  )
}
