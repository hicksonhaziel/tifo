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
  syncStatus: 'Waiting for worker',
  peerCount: 0,
  events: [],
  lastError: ''
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

function sendWorkerCommand(type, payload = {}) {
  return bridge.writeWorkerIPC(workers.main, JSON.stringify({ ...payload, type }))
}

function upsertEvent(event) {
  const existingIndex = state.events.findIndex((item) => item.id === event.id)
  if (existingIndex >= 0) state.events.splice(existingIndex, 1)
  state.events.unshift(event)
}

function applyWorkerMessage(message) {
  switch (message.type) {
    case 'app:ready':
      state.workerStatus = 'ready'
      state.syncStatus = message.syncStatus || 'Worker ready'
      state.lastError = ''
      break
    case 'room:joined':
      state.view = 'room'
      state.nickname = message.profile.nickname
      state.roomCode = message.room.code
      state.roomTitle = message.room.title
      state.peerCount = message.peerCount
      state.syncStatus = message.syncStatus
      state.events = message.events || []
      state.lastError = ''
      break
    case 'room:left':
      state.view = 'home'
      state.roomTitle = ''
      state.peerCount = 0
      state.syncStatus = message.syncStatus || 'Worker ready'
      state.events = message.events || []
      state.lastError = ''
      break
    case 'peer:count':
      state.peerCount = message.count
      break
    case 'sync:status':
      state.syncStatus = message.status
      break
    case 'event:added':
      upsertEvent(message.event)
      state.lastError = ''
      break
    case 'event:list':
      state.events = message.events || []
      break
    case 'error':
      state.lastError = message.message || 'Worker error'
      state.syncStatus = 'Error'
      break
    default:
      console.warn('Unknown worker message type:', message.type)
      return
  }

  render()
}

function renderHome() {
  app.innerHTML = `
    <main class="home-view">
      <section class="brand-panel" aria-labelledby="home-title">
        <div class="brand-lockup">
          <div>
            <p class="eyebrow">TIFO Living Terrace</p>
            <h1 id="home-title">
              <img
                class="brand-logo-image"
                src="../assets/brand/transparent/tifo-primary-lockup.png"
                alt="TIFO"
              />
            </h1>
          </div>
        </div>
        <p class="tagline">Build the terrace. Preserve the echo.</p>
        <div class="feature-row" aria-label="TIFO principles">
          <span>Fan owned</span>
          <span>No accounts</span>
          <span>Peer first</span>
        </div>
        <div class="status-grid" aria-label="App status">
          <div>
            <span class="status-label">Pear worker</span>
            <strong>${escapeHtml(state.workerStatus)}</strong>
          </div>
          <div>
            <span class="status-label">P2P room</span>
            <strong>Not connected</strong>
          </div>
          <div>
            <span class="status-label">Mode</span>
            <strong>Local preview</strong>
          </div>
        </div>
        ${
          state.lastError
            ? `<p class="error-banner" role="status">${escapeHtml(state.lastError)}</p>`
            : ''
        }
      </section>

      <section class="join-panel" aria-labelledby="join-title">
        <div class="panel-heading">
          <p class="eyebrow">Join room</p>
          <h2 id="join-title">Enter a match room</h2>
          <p class="panel-copy">Join a worker-backed P2P match room.</p>
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
          <span class="fixture-label">Demo fixture</span>
          <span class="fixture-team">MAR</span>
          <span class="fixture-divider">vs</span>
          <span class="fixture-team muted">OPP</span>
          <span class="fixture-round">R16</span>
        </div>
      </section>
    </main>
  `

  document.getElementById('join-form').addEventListener('submit', (event) => {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    const nickname = form.get('nickname').toString().trim()
    const roomCode = form.get('roomCode').toString().trim()
    if (!nickname || !roomCode) return

    sendWorkerCommand('profile:set', { nickname })
    sendWorkerCommand('room:join', {
      nickname,
      roomCode
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
          <img
            class="brand-icon-image"
            src="../assets/brand/icon/tifo-app-icon.png"
            alt=""
          />
          <div>
            <p class="eyebrow">${escapeHtml(state.syncStatus)}</p>
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
      ${
        state.lastError
          ? `<p class="error-banner" role="status">${escapeHtml(state.lastError)}</p>`
          : ''
      }

      <section class="room-grid">
        <section class="chat-surface" aria-labelledby="chat-title">
          <div class="section-heading">
            <div>
              <h2 id="chat-title">Terrace chat</h2>
              <p>Messages round-trip through the worker.</p>
            </div>
            <span class="local-pill">P2P room</span>
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
            <div>
              <h2 id="controls-title">Match controls</h2>
              <p>Build the moment.</p>
            </div>
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
            <div>
              <h2 id="timeline-title">Echo timeline</h2>
              <p>In-memory shared event stream.</p>
            </div>
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
    sendWorkerCommand('room:leave')
  })

  document.getElementById('chat-form').addEventListener('submit', (event) => {
    event.preventDefault()
    const input = document.getElementById('chat-input')
    const text = input.value.trim()
    if (!text) return
    input.value = ''
    sendWorkerCommand('chat:send', { text })
  })

  for (const button of document.querySelectorAll('[data-reaction]')) {
    button.addEventListener('click', () => {
      const reaction = reactionTypes.find((item) => item.type === button.dataset.reaction)
      if (!reaction) return
      sendWorkerCommand('reaction:send', {
        reactionType: reaction.type,
        label: reaction.label
      })
    })
  }

  document.getElementById('replay-echo').addEventListener('click', () => {
    if (!hasEvents) return
    sendWorkerCommand('echo:replay')
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

    let parsed = null
    try {
      parsed = JSON.parse(message)
    } catch {
      parsed = null
    }

    if (parsed?.type) {
      applyWorkerMessage(parsed)
      return
    }

    if (message === 'Hello from worker') {
      state.workerStatus = 'ready'
      state.syncStatus = 'Worker ready'
      render()
      bridge.writeWorkerIPC(workers.main, 'TIFO renderer ready')
    }
  })

  bridge.onWorkerExit(workers.main, (code) => {
    console.log('Worker exited with code', code)
    state.workerStatus = 'stopped'
    state.syncStatus = 'Worker stopped'
    render()
  })
}

render()
startWorker()
