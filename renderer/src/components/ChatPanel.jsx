import { ImagePlus, Mic, Send, SmilePlus, StopCircle } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import 'emoji-picker-element'
import emojiDataUrl from 'emoji-picker-element-data/en/emojibase/data.json?url'

import { eventStatus, eventStatusLabel } from '../tifo/domain.js'
import { formatBytes, formatDuration, formatTime } from '../tifo/format.js'

export function ChatPanel({ actions, connected, derived, metrics, offlineActive, state }) {
  const imageInputRef = useRef(null)
  const chatInputRef = useRef(null)
  const emojiPickerRef = useRef(null)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const voiceRecording = state.chatMedia.voiceStatus === 'recording'
  const voiceSaving = state.chatMedia.voiceStatus === 'saving'
  const imageSaving = state.chatMedia.imageStatus === 'saving'

  useEffect(() => {
    const picker = emojiPickerRef.current
    if (!picker) return undefined

    picker.dataSource = emojiDataUrl

    function handleEmojiClick(event) {
      const unicode = event.detail?.unicode
      if (unicode) insertEmoji(unicode)
    }

    picker.addEventListener('emoji-click', handleEmojiClick)
    return () => picker.removeEventListener('emoji-click', handleEmojiClick)
  }, [emojiOpen, state.chatDraft])

  function submitChat(event) {
    event.preventDefault()
    actions.sendChat(state.chatDraft)
  }

  function selectImage(event) {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (file) actions.saveChatImage(file, state.chatDraft)
  }

  function insertEmoji(emoji) {
    const input = chatInputRef.current
    const start = input?.selectionStart ?? state.chatDraft.length
    const end = input?.selectionEnd ?? state.chatDraft.length
    const nextDraft = `${state.chatDraft.slice(0, start)}${emoji}${state.chatDraft.slice(end)}`
    actions.setChatDraft(nextDraft)
    setEmojiOpen(false)
    window.requestAnimationFrame(() => {
      input?.focus()
      input?.setSelectionRange(start + emoji.length, start + emoji.length)
    })
  }

  return (
    <section className='chat-surface' aria-labelledby='chat-title'>
      <div className='section-heading'>
        <div>
          <h2 id='chat-title'>Terrace chat</h2>
          <p>
            {metrics.chats} text, {metrics.media} media from this room
          </p>
        </div>
        <span className={`local-pill ${offlineActive ? 'pending' : connected ? 'connected' : ''}`}>
          {offlineActive ? 'Offline' : connected ? 'Live sync' : 'Local first'}
        </span>
      </div>
      <div className='chat-list' id='chat-list'>
        <ChatItems actions={actions} derived={derived} state={state} />
      </div>
      <form id='chat-form' className='chat-form' onSubmit={submitChat}>
        <input
          id='chat-input'
          ref={chatInputRef}
          maxLength='180'
          placeholder='Send a terrace message'
          autoComplete='off'
          value={state.chatDraft}
          onChange={(event) => actions.setChatDraft(event.currentTarget.value)}
        />
        <input
          type='file'
          accept='image/png,image/jpeg,image/webp,image/gif'
          hidden
          ref={imageInputRef}
          onChange={selectImage}
        />
        <button
          className={`chat-media-action ${emojiOpen ? 'active' : ''}`}
          type='button'
          title='Add emoji'
          onClick={() => setEmojiOpen((open) => !open)}
        >
          <SmilePlus size={16} strokeWidth={2.4} />
        </button>
        <button
          className='chat-media-action'
          type='button'
          disabled={imageSaving}
          title='Send photo'
          onClick={() => imageInputRef.current?.click()}
        >
          <ImagePlus size={16} strokeWidth={2.4} />
        </button>
        <button
          className={`chat-media-action ${voiceRecording ? 'recording' : ''}`}
          type='button'
          disabled={voiceSaving}
          title={voiceRecording ? 'Stop voice note' : 'Record voice note'}
          onClick={() => {
            if (voiceRecording) actions.stopVoiceNoteRecording()
            else actions.startVoiceNoteRecording()
          }}
        >
          {voiceRecording ? (
            <StopCircle size={16} strokeWidth={2.4} />
          ) : (
            <Mic size={16} strokeWidth={2.4} />
          )}
        </button>
        <button
          className='chat-submit-button inline-flex items-center justify-center gap-2'
          type='submit'
        >
          <Send size={15} strokeWidth={2.4} />
          Send
        </button>
      </form>
      {emojiOpen ? (
        <div className='emoji-picker-popover'>
          <emoji-picker
            className='tifo-emoji-picker'
            data-source={emojiDataUrl}
            ref={emojiPickerRef}
          ></emoji-picker>
        </div>
      ) : null}
      <ChatMediaStatus state={state} />
    </section>
  )
}

function ChatMediaStatus({ state }) {
  if (state.chatMedia.voiceStatus === 'recording') {
    return (
      <p className='chat-media-status recording'>
        Recording voice note · {formatDuration(state.chatMedia.voiceElapsedMs)}
      </p>
    )
  }

  if (state.chatMedia.voiceStatus === 'saving') {
    return <p className='chat-media-status'>Sending voice note</p>
  }

  if (state.chatMedia.imageStatus === 'saving') {
    return <p className='chat-media-status'>Sending image</p>
  }

  const error = state.chatMedia.voiceError || state.chatMedia.imageError
  if (!error) return null

  return (
    <p className='chat-media-status error' role='status'>
      {error}
    </p>
  )
}

function ChatItems({ actions, derived, state }) {
  const chatEvents = state.events.filter((event) => ['chat', 'chat-media'].includes(event.type))
  if (chatEvents.length === 0) {
    return <div className='empty-state'>No messages yet.</div>
  }

  return chatEvents.map((event) => {
    const status = eventStatus(event, state)
    return (
      <article className={`chat-message ${status}`} key={event.id}>
        <div>
          <strong>{event.sender}</strong>
          <span>{formatTime(event.timestamp)}</span>
        </div>
        <ChatMessageBody actions={actions} derived={derived} event={event} />
        <span className={`message-status ${status}`}>{eventStatusLabel(event, state)}</span>
      </article>
    )
  })
}

function ChatMessageBody({ actions, derived, event }) {
  if (event.type === 'chat') return <p>{event.payload.text}</p>

  const mediaUrl = derived.chatMediaUrls.get(event.id)
  const isLoading = derived.pendingChatMediaLoads.has(event.id)
  const payload = event.payload

  if (payload.kind === 'image') {
    return (
      <div className='chat-media-message image'>
        {payload.caption ? <p>{payload.caption}</p> : null}
        {mediaUrl ? (
          <img src={mediaUrl} alt={payload.caption || 'Shared match photo'} />
        ) : (
          <button
            className='chat-media-load'
            type='button'
            disabled={isLoading}
            onClick={() => actions.loadChatMedia(event)}
          >
            {isLoading ? 'Preparing image' : 'Load image'}
          </button>
        )}
        <small>{formatBytes(payload.size)}</small>
      </div>
    )
  }

  return (
    <div className='chat-media-message voice'>
      <p>Voice note · {formatDuration(payload.durationMs || 0)}</p>
      {mediaUrl ? (
        <audio controls preload='metadata' src={mediaUrl}></audio>
      ) : (
        <button
          className='chat-media-load'
          type='button'
          disabled={isLoading}
          onClick={() => actions.loadChatMedia(event)}
        >
          {isLoading ? 'Preparing voice note' : 'Load voice note'}
        </button>
      )}
      <small>{formatBytes(payload.size)}</small>
    </div>
  )
}
