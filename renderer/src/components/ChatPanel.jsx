import {
  Check,
  FileText,
  ImagePlus,
  Link2,
  MessageCircle,
  Mic,
  Pause,
  Pencil,
  Play,
  Plus,
  Reply,
  Send,
  SmilePlus,
  StopCircle,
  Trash2,
  X
} from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import 'emoji-picker-element'
import emojiDataUrl from 'emoji-picker-element-data/en/emojibase/data.json?url'

import {
  eventStatus,
  eventStatusLabel,
  materializeChatEvents,
  readReceiptLabel
} from '../tifo/domain.js'
import { formatBytes, formatDuration, formatTime } from '../tifo/format.js'
import { avatarUrl } from './home/homeModel.js'

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
  title = 'Terrace chat',
  variant = 'default'
}) {
  const imageInputRef = useRef(null)
  const chatInputRef = useRef(null)
  const emojiPickerRef = useRef(null)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [emojiTargetId, setEmojiTargetId] = useState('')
  const [trayOpen, setTrayOpen] = useState(false)
  const [editingId, setEditingId] = useState('')
  const [editDraft, setEditDraft] = useState('')
  const voiceRecording = state.chatMedia.voiceStatus === 'recording'
  const voiceSaving = state.chatMedia.voiceStatus === 'saving'
  const imageSaving = state.chatMedia.imageStatus === 'saving'
  const generated = variant === 'generated'
  const hasDraft = state.chatDraft.trim().length > 0

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
    setTrayOpen(false)
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

  function startReply(event) {
    actions.startChatReply(event)
    window.requestAnimationFrame(() => chatInputRef.current?.focus())
  }

  if (generated) {
    return (
      <section className='conversation-chat chat-bg' aria-label={title}>
        <div className='chat-bg-pattern' />
        <div className='conversation-scroll'>
          <div className={`conversation-column ${state.roomKind === 'dm' ? 'dm' : ''}`}>
            <div className='date-divider'>
              <div className='hr grow' />
              <span className='eyebrow'>Today</span>
              <div className='hr grow' />
            </div>
            <div className='msg-list' id='chat-list'>
              <ChatItems
                actions={actions}
                allowFanDm={allowFanDm}
                derived={derived}
                editDraft={editDraft}
                editingId={editingId}
                onCancelEdit={cancelEditing}
                onEditDraftChange={setEditDraft}
                onReact={openReactionPicker}
                onSaveEdit={saveEdit}
                onStartEdit={startEditing}
                onStartReply={startReply}
                state={state}
                variant='generated'
              />
            </div>
          </div>
        </div>

        <div className={`composer-wrap ${state.roomKind === 'dm' ? 'dm' : ''}`}>
          <div className='composer'>
            <TypingIndicator state={state} />
            {emojiOpen && emojiTargetId ? <EmojiPickerPopover pickerRef={emojiPickerRef} /> : null}
            {state.chatReply ? (
              <ChatReplyPreview
                mode='composer'
                onCancel={actions.cancelChatReply}
                reply={state.chatReply}
              />
            ) : null}
            <form className='composer-capsule' onSubmit={submitChat}>
              <input
                type='file'
                accept='image/png,image/jpeg,image/webp,image/gif'
                hidden
                ref={imageInputRef}
                onChange={selectImage}
              />
              <button
                className={`composer-attach ${trayOpen ? 'open' : ''}`}
                onClick={() => setTrayOpen((open) => !open)}
                disabled={voiceRecording}
                title='Attach'
                type='button'
              >
                <Plus size={18} />
              </button>
              {voiceRecording ? (
                <RecordingStrip
                  elapsedMs={state.chatMedia.voiceElapsedMs}
                  onCancel={() => actions.stopVoiceNoteRecording({ discard: true })}
                />
              ) : (
                <>
                  <input
                    className='composer-input'
                    ref={chatInputRef}
                    maxLength='180'
                    placeholder={placeholder}
                    autoComplete='off'
                    value={state.chatDraft}
                    onChange={(event) => actions.setChatDraft(event.currentTarget.value)}
                  />
                  <button
                    className='composer-tool'
                    onClick={openComposerEmoji}
                    title='Emoji'
                    type='button'
                  >
                    <SmilePlus size={17} strokeWidth={2.4} />
                  </button>
                </>
              )}
              <button
                className={`composer-send ${voiceRecording ? 'recording' : hasDraft ? '' : 'mic'}`}
                disabled={voiceSaving}
                onClick={(event) => {
                  if (voiceRecording) {
                    event.preventDefault()
                    actions.stopVoiceNoteRecording()
                    return
                  }
                  if (!hasDraft) {
                    event.preventDefault()
                    actions.startVoiceNoteRecording()
                  }
                }}
                title={voiceRecording ? 'Send voice note' : hasDraft ? 'Send' : 'Record voice note'}
                type={hasDraft && !voiceRecording ? 'submit' : 'button'}
              >
                {voiceRecording ? (
                  <Check size={16} strokeWidth={2.4} />
                ) : hasDraft ? (
                  <Send size={15} strokeWidth={2.4} />
                ) : (
                  <Mic size={16} strokeWidth={2.4} />
                )}
              </button>
            </form>
            {emojiOpen && !emojiTargetId ? <EmojiPickerPopover pickerRef={emojiPickerRef} /> : null}
            {trayOpen ? (
              <AttachmentTray
                imageSaving={imageSaving}
                imageInputRef={imageInputRef}
                onEmoji={openComposerEmoji}
                onVoice={() => {
                  if (voiceRecording) actions.stopVoiceNoteRecording()
                  else actions.startVoiceNoteRecording()
                  setTrayOpen(false)
                }}
                voiceRecording={voiceRecording}
                voiceSaving={voiceSaving}
              />
            ) : null}
            <ChatMediaStatus state={state} />
          </div>
        </div>
      </section>
    )
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
          onStartReply={startReply}
          allowFanDm={allowFanDm}
          state={state}
        />
      </div>
      <TypingIndicator state={state} />
      {emojiOpen && emojiTargetId ? <EmojiPickerPopover pickerRef={emojiPickerRef} /> : null}
      {state.chatReply ? (
        <ChatReplyPreview
          mode='composer'
          onCancel={actions.cancelChatReply}
          reply={state.chatReply}
        />
      ) : null}
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

function RecordingStrip({ elapsedMs, onCancel }) {
  const bars = [
    8, 14, 20, 12, 18, 10, 22, 14, 8, 16, 12, 20, 10, 18, 14, 22, 10, 14, 8, 20, 12, 16, 10, 14
  ]

  return (
    <div className='rec-strip'>
      <span className='dot' aria-hidden='true' />
      <div className='wave' aria-hidden='true'>
        {bars.map((height, index) => (
          <i
            key={index}
            style={{
              animation: `tifo-rec-pulse ${0.6 + (index % 5) * 0.15}s infinite ${
                (index % 7) * 0.05
              }s`,
              height
            }}
          />
        ))}
      </div>
      <span className='time'>{formatDuration(elapsedMs)}</span>
      <button className='composer-tool rec-cancel' onClick={onCancel} title='Cancel' type='button'>
        <X size={16} strokeWidth={2.4} />
      </button>
    </div>
  )
}

function AttachmentTray({
  imageInputRef,
  imageSaving,
  onEmoji,
  onVoice,
  voiceRecording,
  voiceSaving
}) {
  const tiles = [
    {
      disabled: imageSaving,
      icon: <ImagePlus size={18} strokeWidth={2.4} />,
      key: 'photo',
      label: imageSaving ? 'Saving' : 'Photo',
      onClick: () => imageInputRef.current?.click()
    },
    {
      disabled: voiceSaving,
      icon: voiceRecording ? (
        <StopCircle size={18} strokeWidth={2.4} />
      ) : (
        <Mic size={18} strokeWidth={2.4} />
      ),
      key: 'voice',
      label: voiceRecording ? 'Stop' : voiceSaving ? 'Saving' : 'Voice',
      onClick: onVoice
    },
    {
      icon: <SmilePlus size={18} strokeWidth={2.4} />,
      key: 'emoji',
      label: 'Emoji',
      onClick: onEmoji
    },
    {
      disabled: true,
      icon: <Link2 size={18} strokeWidth={2.4} />,
      key: 'link',
      label: 'Link'
    },
    {
      disabled: true,
      icon: <FileText size={18} strokeWidth={2.4} />,
      key: 'file',
      label: 'File'
    },
    {
      disabled: true,
      icon: <MessageCircle size={18} strokeWidth={2.4} />,
      key: 'poll',
      label: 'Poll'
    }
  ]

  return (
    <div className='attach-tray'>
      <div className='tray-head'>
        <div className='tray-tabs'>
          <button className='tray-tab active' type='button'>
            Media
          </button>
        </div>
        <span className='t-xs c-mute'>Tap once to send</span>
      </div>
      <div className='tray-grid'>
        {tiles.map((tile) => (
          <button
            className='tray-tile'
            disabled={tile.disabled}
            key={tile.key}
            onClick={tile.onClick}
            type='button'
          >
            <div className='ic'>{tile.icon}</div>
            <span className='lbl'>{tile.label}</span>
          </button>
        ))}
      </div>
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

function TypingIndicator({ state }) {
  const users = state.typingUsers
    .filter((item) => item.expiresAt > Date.now())
    .map((item) => item.user.displayName || item.user.username || 'Fan')
    .slice(0, 3)

  if (users.length === 0) return null

  const label =
    users.length === 1
      ? `${users[0]} is typing...`
      : users.length === 2
        ? `${users[0]} and ${users[1]} are typing...`
        : `${users[0]}, ${users[1]}, and ${users.length - 2} more are typing...`

  return <p className='typing-indicator'>{label}</p>
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
  onStartReply,
  state,
  variant = 'default'
}) {
  const [activeFanId, setActiveFanId] = useState('')
  const chatEvents = materializeChatEvents(state.events, state.profile)
  if (chatEvents.length === 0) {
    if (state.syncStatus === 'Joining room') return null
    return <div className='empty-state'>No messages yet.</div>
  }

  return chatEvents.map((event) => {
    const status = eventStatus(event, state)
    const own = event.chatState?.own === true
    const canOpenFan = allowFanDm && !own && !!event.senderKey
    if (variant === 'generated') {
      return (
        <GeneratedChatItem
          actions={actions}
          activeFanId={activeFanId}
          allowFanDm={allowFanDm}
          canOpenFan={canOpenFan}
          derived={derived}
          editDraft={editDraft}
          editingId={editingId}
          event={event}
          key={event.id}
          onCancelEdit={onCancelEdit}
          onEditDraftChange={onEditDraftChange}
          onReact={onReact}
          onSaveEdit={onSaveEdit}
          onSetActiveFanId={setActiveFanId}
          onStartEdit={onStartEdit}
          onStartReply={onStartReply}
          own={own}
          state={state}
          status={status}
        />
      )
    }

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
          <span className={`message-status ${status}`}>
            {readReceiptLabel(event, state) || eventStatusLabel(event, state)}
          </span>
          <div className='chat-message-actions'>
            <button
              className='chat-inline-action'
              type='button'
              title='Reply'
              onClick={() => onStartReply(event)}
            >
              <Reply size={14} strokeWidth={2.4} />
            </button>
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

function GeneratedChatItem({
  actions,
  activeFanId,
  canOpenFan,
  derived,
  editDraft,
  editingId,
  event,
  onCancelEdit,
  onEditDraftChange,
  onReact,
  onSaveEdit,
  onSetActiveFanId,
  onStartEdit,
  onStartReply,
  own,
  state,
  status
}) {
  const delivery = readReceiptLabel(event, state) || eventStatusLabel(event, state)
  const sender = event.sender || 'Fan'
  const senderAvatar = avatarUrl(event.senderKey || sender)
  const voiceBubble =
    event.type === 'chat-media' && event.payload?.kind === 'voice' ? 'voice-bubble' : ''

  return (
    <article className={`msg ${status} ${own ? 'own' : ''}`}>
      {!own ? (
        <div className='avatar'>
          <img alt={`@${sender}`} src={senderAvatar} />
          <span>{sender.slice(0, 1).toUpperCase()}</span>
        </div>
      ) : null}
      <div className='body'>
        <div className='row aic gap-2' style={{ justifyContent: own ? 'flex-end' : 'flex-start' }}>
          {!own && canOpenFan ? (
            <button
              className='name'
              type='button'
              onClick={() => onSetActiveFanId((id) => (id === event.id ? '' : event.id))}
            >
              @{sender}
            </button>
          ) : !own ? (
            <span className='name'>@{sender}</span>
          ) : null}
          <span className='time'>{formatTime(event.timestamp)}</span>
          <span className={`delivery ${status}`}>{delivery}</span>
        </div>

        {activeFanId === event.id ? (
          <div className='chat-profile-popover'>
            <div>
              <strong>{sender}</strong>
              <span>
                {event.senderKey
                  ? `${event.senderKey.slice(0, 6)}...${event.senderKey.slice(-4)}`
                  : 'fan'}
              </span>
            </div>
            <button
              className='btn primary sm'
              type='button'
              onClick={() => actions.openDmFromEvent(event)}
            >
              <MessageCircle size={14} strokeWidth={2.4} />
              Message
            </button>
          </div>
        ) : null}

        <div className={`generated-bubble ${voiceBubble}`}>
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
        </div>

        <ChatReactionBar
          actions={actions}
          event={event}
          onReact={onReact}
          reactions={event.chatState?.reactions || []}
        />

        <div className='chat-message-actions'>
          <button
            className='chat-inline-action'
            type='button'
            title='Reply'
            onClick={() => onStartReply(event)}
          >
            <Reply size={14} strokeWidth={2.4} />
          </button>
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
      <>
        <ChatReplyPreview reply={event.payload.replyTo} />
        <p>
          {event.payload.text}
          {event.chatState?.editedAt ? <small className='edited-label'>Edited</small> : null}
        </p>
      </>
    )
  }

  const mediaUrl = derived.chatMediaUrls.get(event.id)
  const isLoading = derived.pendingChatMediaLoads.has(event.id)
  const payload = event.payload

  if (payload.kind === 'image') {
    return (
      <div className='chat-media-message image'>
        <ChatReplyPreview reply={payload.replyTo} />
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
      <ChatReplyPreview reply={payload.replyTo} />
      {mediaUrl ? (
        <VoiceNotePlayer
          durationMs={payload.durationMs || 0}
          own={event.chatState?.own === true}
          src={mediaUrl}
        />
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
    </div>
  )
}

function VoiceNotePlayer({ durationMs, own, src }) {
  const audioRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const bars = [6, 10, 14, 18, 12, 20, 8, 14, 16, 10, 18, 6, 12, 20, 14, 10, 8, 16, 12]

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
    <div className={`vn chat-voice-note ${own ? 'own' : ''}`}>
      <button
        className='play'
        onClick={togglePlayback}
        title={playing ? 'Pause voice note' : 'Play voice note'}
        type='button'
      >
        {playing ? <Pause size={12} strokeWidth={2.6} /> : <Play size={12} strokeWidth={2.6} />}
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

function ChatReplyPreview({ mode = 'message', onCancel, reply }) {
  if (!reply) return null

  return (
    <div className={`chat-reply-preview ${mode}`}>
      <div>
        <strong>{mode === 'composer' ? `Replying to ${reply.sender}` : reply.sender}</strong>
        <span>{reply.text || reply.kind || 'Message'}</span>
      </div>
      {mode === 'composer' ? (
        <button
          className='chat-inline-action'
          type='button'
          title='Cancel reply'
          onClick={onCancel}
        >
          <X size={14} strokeWidth={2.4} />
        </button>
      ) : null}
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
