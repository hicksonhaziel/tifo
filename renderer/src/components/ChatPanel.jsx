import {
  Check,
  ImagePlus,
  MessageCircle,
  Mic,
  Pencil,
  Send,
  SmilePlus,
  StopCircle,
  Trash2,
  X
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import 'emoji-picker-element'
import emojiDataUrl from 'emoji-picker-element-data/en/emojibase/data.json?url'

import { eventStatus, eventStatusLabel, materializeChatEvents } from '../tifo/domain.js'
import { formatBytes, formatDuration, formatTime } from '../tifo/format.js'

export function ChatPanel({
  actions,
  allowFanDm = false,
  connected,
  derived,
  metrics,
  offlineActive,
  placeholder = 'Send a terrace message',
  state,
  subtitle = '',
  surfaceClassName = '',
  title = 'Terrace chat'
}) {
  const imageInputRef = useRef(null)
  const chatInputRef = useRef(null)
  const emojiPickerRef = useRef(null)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [emojiTargetId, setEmojiTargetId] = useState('')
  const [editingId, setEditingId] = useState('')
  const [editDraft, setEditDraft] = useState('')
  const voiceRecording = state.chatMedia.voiceStatus === 'recording'
  const voiceSaving = state.chatMedia.voiceStatus === 'saving'
  const imageSaving = state.chatMedia.imageStatus === 'saving'

  useEffect(() => {
    const picker = emojiPickerRef.current
    if (!picker) return undefined

    picker.dataSource = emojiDataUrl

    function handleEmojiClick(event) {
      const unicode = event.detail?.unicode
      if (!unicode) return
      if (emojiTargetId) {
        actions.reactToChatEvent(emojiTargetId, unicode)
        setEmojiOpen(false)
        setEmojiTargetId('')
        return
      }

      insertEmoji(unicode)
    }

    picker.addEventListener('emoji-click', handleEmojiClick)
    return () => picker.removeEventListener('emoji-click', handleEmojiClick)
  }, [emojiOpen, emojiTargetId, state.chatDraft])

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

  function openComposerEmoji() {
    setEmojiTargetId('')
    setEmojiOpen((open) => (emojiTargetId ? true : !open))
  }

  function openReactionPicker(eventId) {
    setEmojiTargetId(eventId)
    setEmojiOpen(true)
  }

  function startEditing(event) {
    setEditingId(event.id)
    setEditDraft(event.payload.text || '')
  }

  function cancelEditing() {
    setEditingId('')
    setEditDraft('')
  }

  function saveEdit(event) {
    event.preventDefault()
    actions.editChatMessage(editingId, editDraft)
    cancelEditing()
  }

  return (
    <section className={`chat-surface ${surfaceClassName}`} aria-labelledby='chat-title'>
      <div className='section-heading'>
        <div>
          <h2 id='chat-title'>{title}</h2>
          <p>{subtitle || `${metrics.chats} text, ${metrics.media} media from this room`}</p>
        </div>
        <span className={`local-pill ${offlineActive ? 'pending' : connected ? 'connected' : ''}`}>
          {offlineActive ? 'Offline' : connected ? 'Live sync' : 'Local first'}
        </span>
      </div>
      <div className='chat-list' id='chat-list'>
        <ChatItems
          actions={actions}
          derived={derived}
          editDraft={editDraft}
          editingId={editingId}
          onCancelEdit={cancelEditing}
          onEditDraftChange={setEditDraft}
          onReact={openReactionPicker}
          onSaveEdit={saveEdit}
          onStartEdit={startEditing}
          allowFanDm={allowFanDm}
          state={state}
        />
      </div>
      {emojiOpen && emojiTargetId ? <EmojiPickerPopover pickerRef={emojiPickerRef} /> : null}
      <form id='chat-form' className='chat-form' onSubmit={submitChat}>
        <input
          id='chat-input'
          ref={chatInputRef}
          maxLength='180'
          placeholder={placeholder}
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
          onClick={openComposerEmoji}
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
      {emojiOpen && !emojiTargetId ? <EmojiPickerPopover pickerRef={emojiPickerRef} /> : null}
      <ChatMediaStatus state={state} />
    </section>
  )
}

function EmojiPickerPopover({ pickerRef }) {
  return (
    <div className='emoji-picker-popover'>
      <emoji-picker
        className='tifo-emoji-picker'
        data-source={emojiDataUrl}
        ref={pickerRef}
      ></emoji-picker>
    </div>
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

function ChatItems({
  actions,
  allowFanDm,
  derived,
  editDraft,
  editingId,
  onCancelEdit,
  onEditDraftChange,
  onReact,
  onSaveEdit,
  onStartEdit,
  state
}) {
  const [activeFanId, setActiveFanId] = useState('')
  const chatEvents = materializeChatEvents(state.events, state.profile)
  if (chatEvents.length === 0) {
    return <div className='empty-state'>No messages yet.</div>
  }

  return chatEvents.map((event) => {
    const status = eventStatus(event, state)
    const own = event.chatState?.own === true
    const canOpenFan = allowFanDm && !own && !!event.senderKey
    return (
      <article className={`chat-message ${status} ${own ? 'own' : ''}`} key={event.id}>
        <div className='chat-message-header'>
          {canOpenFan ? (
            <button
              className='chat-sender-button'
              type='button'
              onClick={() => setActiveFanId((id) => (id === event.id ? '' : event.id))}
            >
              {event.sender}
            </button>
          ) : (
            <strong>{event.sender}</strong>
          )}
          <span>{formatTime(event.timestamp)}</span>
        </div>
        {activeFanId === event.id ? (
          <div className='chat-profile-popover'>
            <div>
              <strong>{event.sender}</strong>
              <span>
                {event.senderKey
                  ? `${event.senderKey.slice(0, 6)}...${event.senderKey.slice(-4)}`
                  : 'fan'}
              </span>
            </div>
            <button
              className='private-tool-action'
              type='button'
              onClick={() => actions.openDmFromEvent(event)}
            >
              <MessageCircle size={14} strokeWidth={2.4} />
              Message
            </button>
          </div>
        ) : null}
        <ChatMessageBody
          actions={actions}
          derived={derived}
          editDraft={editDraft}
          editing={editingId === event.id}
          event={event}
          onCancelEdit={onCancelEdit}
          onEditDraftChange={onEditDraftChange}
          onSaveEdit={onSaveEdit}
        />
        <ChatReactionBar
          actions={actions}
          event={event}
          onReact={onReact}
          reactions={event.chatState?.reactions || []}
        />
        <div className='chat-message-footer'>
          <span className={`message-status ${status}`}>{eventStatusLabel(event, state)}</span>
          <div className='chat-message-actions'>
            <button
              className='chat-inline-action'
              type='button'
              title='React'
              onClick={() => onReact(event.id)}
            >
              <SmilePlus size={14} strokeWidth={2.4} />
            </button>
            {own && event.type === 'chat' ? (
              <button
                className='chat-inline-action'
                type='button'
                title='Edit message'
                onClick={() => onStartEdit(event)}
              >
                <Pencil size={14} strokeWidth={2.4} />
              </button>
            ) : null}
            {own ? (
              <button
                className='chat-inline-action danger'
                type='button'
                title='Delete message'
                onClick={() => actions.deleteChatEvent(event.id)}
              >
                <Trash2 size={14} strokeWidth={2.4} />
              </button>
            ) : null}
          </div>
        </div>
      </article>
    )
  })
}

function ChatMessageBody({
  actions,
  derived,
  editDraft,
  editing,
  event,
  onCancelEdit,
  onEditDraftChange,
  onSaveEdit
}) {
  if (event.type === 'chat') {
    if (editing) {
      return (
        <form className='chat-edit-form' onSubmit={onSaveEdit}>
          <input
            autoFocus
            maxLength='180'
            value={editDraft}
            onChange={(changeEvent) => onEditDraftChange(changeEvent.currentTarget.value)}
          />
          <button className='chat-inline-action' type='submit' title='Save edit'>
            <Check size={14} strokeWidth={2.4} />
          </button>
          <button
            className='chat-inline-action'
            type='button'
            title='Cancel edit'
            onClick={onCancelEdit}
          >
            <X size={14} strokeWidth={2.4} />
          </button>
        </form>
      )
    }

    return (
      <p>
        {event.payload.text}
        {event.chatState?.editedAt ? <small className='edited-label'>Edited</small> : null}
      </p>
    )
  }

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

function ChatReactionBar({ actions, event, onReact, reactions }) {
  return (
    <div className='chat-reaction-row'>
      {reactions.map((reaction) => (
        <button
          className={`chat-reaction-pill ${reaction.reactedByMe ? 'active' : ''}`}
          data-reactors={reaction.names.join(', ')}
          key={reaction.emoji}
          title={reaction.names.join(', ')}
          type='button'
          onClick={() => actions.reactToChatEvent(event.id, reaction.emoji)}
        >
          <span>{reaction.emoji}</span>
          <strong>{reaction.count}</strong>
        </button>
      ))}
      {reactions.length > 0 ? (
        <button
          className='chat-reaction-add'
          type='button'
          title='Add reaction'
          onClick={() => onReact(event.id)}
        >
          <SmilePlus size={13} strokeWidth={2.4} />
        </button>
      ) : null}
    </div>
  )
}
