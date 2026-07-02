import { Send } from 'lucide-react'

import { eventStatus, eventStatusLabel } from '../tifo/domain.js'
import { formatTime } from '../tifo/format.js'

export function ChatPanel({ actions, connected, metrics, offlineActive, state }) {
  function submitChat(event) {
    event.preventDefault()
    actions.sendChat(state.chatDraft)
  }

  return (
    <section className='chat-surface' aria-labelledby='chat-title'>
      <div className='section-heading'>
        <div>
          <h2 id='chat-title'>Terrace chat</h2>
          <p>{metrics.chats} messages from this room</p>
        </div>
        <span className={`local-pill ${offlineActive ? 'pending' : connected ? 'connected' : ''}`}>
          {offlineActive ? 'Offline' : connected ? 'Live sync' : 'Local first'}
        </span>
      </div>
      <div className='chat-list' id='chat-list'>
        <ChatItems state={state} />
      </div>
      <form id='chat-form' className='chat-form' onSubmit={submitChat}>
        <input
          id='chat-input'
          maxLength='180'
          placeholder='Send a terrace message'
          autoComplete='off'
          value={state.chatDraft}
          onChange={(event) => actions.setChatDraft(event.currentTarget.value)}
        />
        <button className='inline-flex items-center justify-center gap-2' type='submit'>
          <Send size={15} strokeWidth={2.4} />
          Send
        </button>
      </form>
    </section>
  )
}

function ChatItems({ state }) {
  const chatEvents = state.events.filter((event) => event.type === 'chat')
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
        <p>{event.payload.text}</p>
        <span className={`message-status ${status}`}>{eventStatusLabel(event, state)}</span>
      </article>
    )
  })
}
