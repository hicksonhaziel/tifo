const bridge = window.bridge
const decoder = new TextDecoder('utf-8')

const workers = {
  main: '/workers/main.js'
}

const state = {
  view: 'home',
  nickname: '',
  roomCode: 'MAR-DEMO-R16',
  roomTitle: '',
  workerStatus: 'starting',
  syncStatus: 'Local preview',
  peerCount: 0,
  events: []
}

const reactionTypes = [
  { type: 'goal', label: 'Goal', accent: 'red' },
  { type: 'save', label: 'Save', accent: 'white' },
  { type: 'var', label: 'VAR', accent: 'red' },
  { type: 'full-time', label: 'Full-time', accent: 'white' },
  { type: 'flare', label: 'Flare', accent: 'red' }
]

const app = document.getElementById('app')

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function formatTime(timestamp) {
  return new Intl.DateTimeFormat('en', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(timestamp)
}

function normalizeRoomTitle(roomCode) {
  return roomCode.trim().replaceAll('-', ' ').replace(/\s+/g, ' ').toUpperCase()
}

function addEvent(type, payload) {
  state.events.unshift({
    id: crypto.randomUUID(),
    type,
    sender: state.nickname || 'Local fan',
    timestamp: Date.now(),
    payload
  })
  render()
}

function renderHome() {
  app.innerHTML = `
    <main class="home-view">
      <section class="brand-panel" aria-labelledby="home-title">
        <div class="brand-lockup">
          <div class="tifo-mark" aria-hidden="true">
            <span></span>
          </div>
          <div>
            <p class="eyebrow">Peer-to-peer match room</p>
            <h1 id="home-title">TIFO</h1>
          </div>
        </div>
        <p class="tagline">Build the terrace. Preserve the echo.</p>
        <div class="status-grid" aria-label="App status">
          <div>
            <span class="status-label">Runtime</span>
            <strong>${escapeHtml(state.workerStatus)}</strong>
          </div>
          <div>
            <span class="status-label">Network</span>
            <strong>Not connected</strong>
          </div>
          <div>
            <span class="status-label">Mode</span>
            <strong>Local preview</strong>
          </div>
        </div>
      </section>

      <section class="join-panel" aria-labelledby="join-title">
        <div class="panel-heading">
          <p class="eyebrow">Join room</p>
          <h2 id="join-title">Match terrace</h2>
        </div>
        <form id="join-form" class="join-form">
          <label>
            <span>Fan name</span>
            <input
              id="nickname"
              name="nickname"
              maxlength="24"
              autocomplete="nickname"
              placeholder="Amina"
              value="${escapeHtml(state.nickname)}"
              required
            />
          </label>
          <label>
            <span>Room code</span>
            <input
              id="room-code"
              name="roomCode"
              maxlength="32"
              autocomplete="off"
              placeholder="MAR-DEMO-R16"
              value="${escapeHtml(state.roomCode)}"
              required
            />
          </label>
          <button class="primary-action" type="submit">Enter terrace</button>
        </form>
        <div class="fixture-preview">
          <span class="fixture-team">MAR</span>
          <span class="fixture-divider">vs</span>
          <span class="fixture-team muted">OPP</span>
          <span class="fixture-round">Demo room</span>
        </div>
      </section>
    </main>
  `

  document.getElementById('join-form').addEventListener('submit', (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    state.nickname = form.get('nickname').toString().trim()
    state.roomCode = form.get('roomCode').toString().trim()
    if (!state.nickname || !state.roomCode) return

    state.roomTitle = normalizeRoomTitle(state.roomCode)
    state.view = 'room'
    addEvent('system', {
      text: `${state.nickname} entered ${state.roomTitle}`
    })
  })
}

function renderRoom() {
  const hasEvents = state.events.some((event) => event.type !== 'system')
  const timeline = state.events
    .map((event) => {
      const meta =
        event.type === 'chat' ? 'Chat' : event.type === 'reaction' ? 'Reaction' : 'System'
      const text =
        event.type === 'chat'
          ? event.payload.text
          : event.type === 'reaction'
            ? event.payload.label
            : event.payload.text

      return `
        <li class="timeline-event ${event.type}">
          <div class="event-icon" aria-hidden="true"></div>
          <div>
            <div class="event-meta">
              <span>${escapeHtml(meta)}</span>
              <span>${escapeHtml(formatTime(event.timestamp))}</span>
            </div>
            <p>${escapeHtml(text)}</p>
            <span class="event-sender">${escapeHtml(event.sender)}</span>
          </div>
        </li>
      `
    })
    .join('')

  app.innerHTML = `
    <main class="room-view">
      <header class="room-header">
        <div class="brand-mini">
          <div class="tifo-mark small" aria-hidden="true"><span></span></div>
          <div>
            <p class="eyebrow">TIFO Living Terrace</p>
            <h1>${escapeHtml(state.roomTitle)}</h1>
          </div>
        </div>
        <div class="room-actions">
          <button class="ghost-action" id="leave-room" type="button">Leave</button>
        </div>
      </header>

      <section class="match-strip" aria-label="Room status">
        <div>
          <span class="status-label">Fan</span>
          <strong>${escapeHtml(state.nickname)}</strong>
        </div>
        <div>
          <span class="status-label">Peers</span>
          <strong>${state.peerCount}</strong>
        </div>
        <div>
          <span class="status-label">Sync</span>
          <strong>${escapeHtml(state.syncStatus)}</strong>
        </div>
        <div>
          <span class="status-label">Topic</span>
          <strong>${escapeHtml(state.roomCode)}</strong>
        </div>
      </section>

      <section class="room-grid">
        <section class="chat-surface" aria-labelledby="chat-title">
          <div class="section-heading">
            <h2 id="chat-title">Terrace chat</h2>
            <span class="local-pill">Local only</span>
          </div>
          <div class="chat-list" id="chat-list">
            ${renderChatItems()}
          </div>
          <form id="chat-form" class="chat-form">
            <input
              id="chat-input"
              maxlength="180"
              placeholder="Send a terrace message"
              autocomplete="off"
            />
            <button type="submit">Send</button>
          </form>
        </section>

        <aside class="controls-surface" aria-labelledby="controls-title">
          <div class="section-heading">
            <h2 id="controls-title">Match controls</h2>
          </div>
          <div class="reaction-grid">
            ${reactionTypes
              .map(
                (reaction) => `
                  <button
                    class="reaction-button ${reaction.accent}"
                    type="button"
                    data-reaction="${escapeHtml(reaction.type)}"
                  >
                    <span class="reaction-dot" aria-hidden="true"></span>
                    ${escapeHtml(reaction.label)}
                  </button>
                `
              )
              .join('')}
          </div>
          <button
            class="replay-action"
            id="replay-echo"
            type="button"
            ${hasEvents ? '' : 'disabled'}
          >
            Replay Echo
          </button>
          <p class="control-note">
            ${hasEvents ? 'Local preview events are ready.' : 'Add a chat or reaction first.'}
          </p>
        </aside>

        <section class="timeline-surface" aria-labelledby="timeline-title">
          <div class="section-heading">
            <h2 id="timeline-title">Echo timeline</h2>
            <span>${state.events.length} events</span>
          </div>
          <ol class="timeline-list">
            ${
              timeline ||
              `<li class="empty-state">The terrace is quiet. First messages and flares will appear here.</li>`
            }
          </ol>
        </section>
      </section>
    </main>
  `

  document.getElementById('leave-room').addEventListener('click', () => {
    state.view = 'home'
    state.syncStatus = 'Local preview'
    state.peerCount = 0
    render()
  })

  document.getElementById('chat-form').addEventListener('submit', (event) => {
    event.preventDefault()
    const input = document.getElementById('chat-input')
    const text = input.value.trim()
    if (!text) return
    input.value = ''
    addEvent('chat', { text })
  })

  for (const button of document.querySelectorAll('[data-reaction]')) {
    button.addEventListener('click', () => {
      const reaction = reactionTypes.find((item) => item.type === button.dataset.reaction)
      if (!reaction) return
      addEvent('reaction', {
        type: reaction.type,
        label: reaction.label
      })
    })
  }

  document.getElementById('replay-echo').addEventListener('click', () => {
    if (!hasEvents) return
    addEvent('system', {
      text: 'Replay Echo preview queued'
    })
  })
}

function renderChatItems() {
  const chatEvents = state.events.filter((event) => event.type === 'chat')
  if (chatEvents.length === 0) {
    return `<div class="empty-state">No messages yet.</div>`
  }

  return chatEvents
    .map(
      (event) => `
        <article class="chat-message">
          <div>
            <strong>${escapeHtml(event.sender)}</strong>
            <span>${escapeHtml(formatTime(event.timestamp))}</span>
          </div>
          <p>${escapeHtml(event.payload.text)}</p>
        </article>
      `
    )
    .join('')
}

function render() {
  if (state.view === 'room') renderRoom()
  else renderHome()
}

function startWorker() {
  bridge.startWorker(workers.main)

  bridge.onWorkerStdout(workers.main, (data) => {
    console.log('worker stdout', '[', workers.main, ']:', decoder.decode(data))
  })

  bridge.onWorkerStderr(workers.main, (data) => {
    console.error('worker stderr', '[', workers.main, ']:', decoder.decode(data))
  })

  bridge.onWorkerIPC(workers.main, (data) => {
    const message = decoder.decode(data)
    console.log('worker ipc', '[', workers.main, ']:', message)
    if (message === 'Hello from worker') {
      state.workerStatus = 'ready'
      render()
      bridge.writeWorkerIPC(workers.main, 'TIFO renderer ready')
    }
  })

  bridge.onWorkerExit(workers.main, (code) => {
    console.log('Worker exited with code', code)
    state.workerStatus = 'stopped'
    render()
  })
}

render()
startWorker()
