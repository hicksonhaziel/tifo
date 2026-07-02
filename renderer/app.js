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
  chatDraft: '',
  chantRecorder: {
    elapsedMs: 0,
    error: '',
    status: 'idle'
  },
  replayPreview: {
    active: false,
    detail: '',
    error: '',
    progress: 0,
    title: ''
  },
  effects: [],
  seenEffectEventIds: new Set(),
  lastError: ''
}

const reactionTypes = [
  { type: 'goal', label: 'Goal', tone: 'ignite', cue: 'Terrace eruption' },
  { type: 'save', label: 'Save', tone: 'clean', cue: 'Safe hands' },
  { type: 'penalty', label: 'Penalty', tone: 'warning', cue: 'Pressure rising' },
  { type: 'var', label: 'VAR', tone: 'warning', cue: 'Decision pending' },
  { type: 'red-card', label: 'Red card', tone: 'danger', cue: 'The room turns' },
  { type: 'full-time', label: 'Full-time', tone: 'clean', cue: 'Whistle blown' },
  { type: 'heartbreak', label: 'Heartbreak', tone: 'cold', cue: 'Terrace drop' },
  { type: 'flare', label: 'Flare', tone: 'ignite', cue: 'Stand lit' }
]

const app = document.getElementById('app')
const chantAudioUrls = new Map()
const chantPrefetchIds = new Set()
const pendingChantLoads = new Map()
const pendingChantUrls = new Map()
const CHANT_MIN_MS = 3000
const CHANT_MAX_MS = 10000
const FALLBACK_CHANT_MS = 3600
let activeChantRecorder = null
let activeChantStream = null
let discardActiveChant = false
let chantTickTimer = null
let chantAutoStopTimer = null
let activeReplayAudio = null
let fallbackChantUrl = ''
let replayTimers = []

function reactionTheme(type) {
  return reactionTypes.find((reaction) => reaction.type === type) || reactionTypes[0]
}

function safeClass(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

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

function formatDuration(ms) {
  return `${Math.max(1, Math.round(ms / 1000))}s`
}

function roomParts(roomCode) {
  const parts = roomCode.split('-').filter(Boolean)
  return {
    home: parts[0] || 'TIF',
    away: parts[1] || 'OPP',
    round: parts.at(-1) || 'Live'
  }
}

function eventMeta(event) {
  if (event.type === 'chat') {
    return {
      label: 'Chat',
      text: event.payload.text
    }
  }

  if (event.type === 'reaction') {
    const reaction = reactionTheme(event.payload.type)
    return {
      label: reaction.label,
      text: reaction.cue
    }
  }

  if (event.type === 'chant') {
    return {
      label: 'Chant',
      text: `${formatDuration(event.payload.durationMs)} terrace chant`
    }
  }

  return {
    label: 'System',
    text: event.payload.text
  }
}

function eventStatus(event) {
  return ['local', 'remote', 'stored'].includes(event.status) ? event.status : 'local'
}

function eventStatusLabel(event) {
  const status = eventStatus(event)
  if (status === 'remote') return 'Peer'
  if (status === 'stored') return 'Saved'
  return 'Local'
}

function roomMetrics() {
  const playableEvents = state.events.filter((event) => event.type !== 'system')
  return {
    chats: state.events.filter((event) => event.type === 'chat').length,
    chants: state.events.filter((event) => event.type === 'chant').length,
    reactions: state.events.filter((event) => event.type === 'reaction').length,
    saved: state.events.filter((event) => event.status === 'stored').length,
    peerEvents: state.events.filter((event) => event.status === 'remote').length,
    playableEvents
  }
}

function sendWorkerCommand(type, payload = {}) {
  return bridge.writeWorkerIPC(workers.main, JSON.stringify({ ...payload, type }))
}

function upsertEvent(event) {
  attachPendingChantUrl(event)
  prefetchChantAudio(event)
  const existingIndex = state.events.findIndex((item) => item.id === event.id)
  if (existingIndex >= 0) state.events.splice(existingIndex, 1)
  state.events.unshift(event)
}

function attachPendingChantUrl(event) {
  const clientId = event?.payload?.clientId
  if (event?.type !== 'chant' || !clientId || !pendingChantUrls.has(clientId)) return

  chantAudioUrls.set(event.id, pendingChantUrls.get(clientId))
  pendingChantUrls.delete(clientId)
}

function prefetchChantAudio(event) {
  if (event?.type !== 'chant' || !event.payload?.fileId) return
  if (chantAudioUrls.has(event.id) || pendingChantLoads.has(event.id)) return
  if (chantPrefetchIds.has(event.id)) return

  chantPrefetchIds.add(event.id)
  loadChantAudio(event, { silent: true })
}

function prefetchChantAudios(events) {
  for (const event of events) prefetchChantAudio(event)
}

function rememberEffectEvents(events) {
  for (const event of events) {
    if (event?.type === 'reaction') state.seenEffectEventIds.add(event.id)
  }
}

function triggerReactionEffect(event) {
  if (!event || event.type !== 'reaction' || state.seenEffectEventIds.has(event.id)) return

  state.seenEffectEventIds.add(event.id)

  const reaction = reactionTheme(event.payload.type)
  const effect = {
    id: event.id,
    type: reaction.type,
    label: reaction.label,
    tone: reaction.tone,
    sender: event.sender,
    createdAt: Date.now()
  }

  state.effects = [effect, ...state.effects].slice(0, 4)

  setTimeout(() => {
    state.effects = state.effects.filter((item) => item.id !== effect.id)
    if (state.view === 'room') render()
  }, 2200)
}

function applyLiveEffects(events) {
  for (const event of events) triggerReactionEffect(event)
}

function eventListSignature(events) {
  return events.map((event) => `${event.id}:${event.status}:${event.version}`).join('|')
}

function replayIdleState() {
  return {
    active: false,
    detail: '',
    error: '',
    progress: 0,
    title: ''
  }
}

function clearReplayTimers() {
  for (const timer of replayTimers) clearTimeout(timer)
  replayTimers = []
}

function stopActiveReplayAudio() {
  if (!activeReplayAudio) return
  activeReplayAudio.pause()
  activeReplayAudio.currentTime = 0
  activeReplayAudio = null
}

function resetReplayPreview(options = {}) {
  clearReplayTimers()
  stopActiveReplayAudio()
  state.replayPreview = replayIdleState()
  if (options.renderAfter && state.view === 'room') render()
}

function scheduleReplayStep(callback, delay) {
  const timer = setTimeout(() => {
    replayTimers = replayTimers.filter((item) => item !== timer)
    callback()
  }, delay)
  replayTimers.push(timer)
}

function resolvePendingChantLoad(eventId, dataUrl = '') {
  const pending = pendingChantLoads.get(eventId)
  if (!pending) return

  clearTimeout(pending.timeout)
  pendingChantLoads.delete(eventId)
  pending.resolve(dataUrl)
}

function applyWorkerMessage(message) {
  let shouldRender = true

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
      state.chatDraft = ''
      state.chantRecorder = {
        elapsedMs: 0,
        error: '',
        status: 'idle'
      }
      state.replayPreview = replayIdleState()
      state.effects = []
      state.seenEffectEventIds.clear()
      chantPrefetchIds.clear()
      rememberEffectEvents(state.events)
      prefetchChantAudios(state.events)
      state.lastError = ''
      break
    case 'room:left':
      state.view = 'home'
      state.roomTitle = ''
      state.peerCount = 0
      state.syncStatus = message.syncStatus || 'Worker ready'
      state.events = message.events || []
      state.chatDraft = ''
      stopChantRecording({ discard: true })
      resetReplayPreview()
      state.chantRecorder = {
        elapsedMs: 0,
        error: '',
        status: 'idle'
      }
      chantPrefetchIds.clear()
      state.effects = []
      state.seenEffectEventIds.clear()
      state.lastError = ''
      break
    case 'peer:count':
      shouldRender = state.peerCount !== message.count
      state.peerCount = message.count
      if (message.count > 0) prefetchChantAudios(state.events)
      break
    case 'sync:status':
      shouldRender = state.syncStatus !== message.status
      state.syncStatus = message.status
      break
    case 'event:added':
      triggerReactionEffect(message.event)
      upsertEvent(message.event)
      state.lastError = ''
      break
    case 'event:list':
      {
        const events = message.events || []
        shouldRender = eventListSignature(state.events) !== eventListSignature(events)
        if (shouldRender) {
          for (const event of events) attachPendingChantUrl(event)
          applyLiveEffects(events)
          state.events = events
          prefetchChantAudios(state.events)
        }
      }
      break
    case 'chant:loaded':
      chantAudioUrls.set(message.eventId, message.dataUrl)
      resolvePendingChantLoad(message.eventId, message.dataUrl)
      break
    case 'error':
      state.lastError = message.message || 'Worker error'
      state.syncStatus = 'Error'
      break
    default:
      console.warn('Unknown worker message type:', message.type)
      return
  }

  if (shouldRender) render()
}

function writeWavText(view, offset, text) {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index))
  }
}

function createFallbackChantBlob() {
  const sampleRate = 22050
  const durationSeconds = FALLBACK_CHANT_MS / 1000
  const sampleCount = Math.floor(sampleRate * durationSeconds)
  const dataBytes = sampleCount * 2
  const buffer = new ArrayBuffer(44 + dataBytes)
  const view = new DataView(buffer)

  writeWavText(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  writeWavText(view, 8, 'WAVE')
  writeWavText(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeWavText(view, 36, 'data')
  view.setUint32(40, dataBytes, true)

  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / sampleRate
    const beat = time % 0.46
    const phrase = Math.floor(time / 0.9) % 2 === 0 ? 1 : 0.84
    const voice =
      Math.sin(2 * Math.PI * 176 * phrase * time) * 0.34 +
      Math.sin(2 * Math.PI * 264 * phrase * time) * 0.18
    const noise = (((index * 48271) % 2147483647) / 1073741823.5 - 1) * 0.52
    const clap = beat < 0.04 ? noise * (1 - beat / 0.04) : 0
    const envelope = Math.min(1, time / 0.08, (durationSeconds - time) / 0.22)
    const sample = Math.max(-1, Math.min(1, (voice + clap) * envelope))
    view.setInt16(44 + index * 2, sample * 0x7fff, true)
  }

  return {
    blob: new Blob([buffer], { type: 'audio/wav' }),
    durationMs: FALLBACK_CHANT_MS,
    mimeType: 'audio/wav'
  }
}

function getFallbackChantUrl() {
  if (!fallbackChantUrl) {
    fallbackChantUrl = URL.createObjectURL(createFallbackChantBlob().blob)
  }

  return fallbackChantUrl
}

async function saveChantBlob({ blob, durationMs, mimeType }) {
  const clientId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  pendingChantUrls.set(clientId, URL.createObjectURL(blob))
  const bytesBase64 = await blobToBase64(blob)

  state.chantRecorder = {
    elapsedMs: durationMs,
    error: '',
    status: 'ready'
  }

  sendWorkerCommand('chant:save', {
    bytesBase64,
    clientId,
    durationMs,
    mimeType
  })
  render()
}

async function saveFallbackChant() {
  if (['recording', 'saving'].includes(state.chantRecorder.status)) return

  try {
    const fallback = createFallbackChantBlob()
    state.chantRecorder = {
      elapsedMs: fallback.durationMs,
      error: '',
      status: 'saving'
    }
    render()
    await saveChantBlob(fallback)
  } catch (err) {
    state.chantRecorder = {
      elapsedMs: 0,
      error: err.message || 'Could not save demo chant',
      status: 'error'
    }
    render()
  }
}

function loadChantAudio(event, options = {}) {
  if (chantAudioUrls.has(event.id)) return Promise.resolve(chantAudioUrls.get(event.id))
  if (!event.payload?.fileId) return Promise.resolve('')
  if (pendingChantLoads.has(event.id)) return pendingChantLoads.get(event.id).promise

  let resolveLoad = null
  const promise = new Promise((resolve) => {
    resolveLoad = resolve
  })
  const timeoutMs = options.silent === true ? 5000 : 1200
  const timeout = setTimeout(() => {
    pendingChantLoads.delete(event.id)
    if (options.silent === true && !chantAudioUrls.has(event.id)) chantPrefetchIds.delete(event.id)
    resolveLoad('')
    if (state.view === 'room') render()
  }, timeoutMs)

  pendingChantLoads.set(event.id, {
    promise,
    resolve: resolveLoad,
    timeout
  })
  requestChantLoad(event, options)
  if (options.silent !== true && state.view === 'room') render()
  return promise
}

function playAudioUrl(url) {
  if (!url) return Promise.resolve()

  stopActiveReplayAudio()

  return new Promise((resolve) => {
    const audio = new window.Audio(url)
    let settled = false

    function done() {
      if (settled) return
      settled = true
      if (activeReplayAudio === audio) activeReplayAudio = null
      resolve()
    }

    activeReplayAudio = audio
    audio.volume = 0.86
    audio.addEventListener('ended', done, { once: true })
    audio.addEventListener('error', done, { once: true })
    audio.play().catch(done)
  })
}

async function playChantForReplay(event) {
  const audioUrl = await loadChantAudio(event)
  await playAudioUrl(audioUrl || getFallbackChantUrl())
}

function startReplayEchoPreview() {
  const items = roomMetrics().playableEvents.slice(0, 10).reverse()
  if (items.length === 0) return

  resetReplayPreview()
  state.replayPreview = {
    active: true,
    detail: `${items.length} terrace events queued`,
    error: '',
    progress: 0,
    title: 'Replay Echo'
  }
  render()
  scheduleReplayStep(() => playReplayItem(items, 0), 180)
}

function playReplayItem(items, index) {
  if (state.view !== 'room') return

  if (index >= items.length) {
    state.replayPreview = {
      active: true,
      detail: 'Local Echo preview finished',
      error: '',
      progress: 100,
      title: 'Echo complete'
    }
    render()
    scheduleReplayStep(() => resetReplayPreview({ renderAfter: true }), 2600)
    return
  }

  const event = items[index]
  const meta = eventMeta(event)
  const progress = Math.round(((index + 1) / items.length) * 100)

  state.replayPreview = {
    active: true,
    detail: `${event.sender}: ${meta.text}`,
    error:
      event.type === 'chant' && !chantAudioUrls.has(event.id)
        ? 'Using local file or demo chant'
        : '',
    progress,
    title: meta.label
  }

  if (event.type === 'reaction') {
    triggerReactionEffect({
      ...event,
      id: `replay-${event.id}-${index}-${Date.now()}`
    })
  }

  if (event.type === 'chant') {
    playChantForReplay(event).catch(() => {
      state.replayPreview = {
        ...state.replayPreview,
        error: 'Replay audio fell back to demo chant'
      }
      render()
      return playAudioUrl(getFallbackChantUrl())
    })
  }

  render()
  scheduleReplayStep(() => playReplayItem(items, index + 1), event.type === 'chant' ? 2300 : 1200)
}

function recordingSupported() {
  return !!navigator.mediaDevices?.getUserMedia && typeof window.MediaRecorder === 'function'
}

function preferredChantMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg']
  if (
    typeof window.MediaRecorder === 'undefined' ||
    typeof window.MediaRecorder.isTypeSupported !== 'function'
  ) {
    return ''
  }

  return candidates.find((type) => window.MediaRecorder.isTypeSupported(type)) || ''
}

function resetChantTimers() {
  if (chantTickTimer) clearInterval(chantTickTimer)
  if (chantAutoStopTimer) clearTimeout(chantAutoStopTimer)
  chantTickTimer = null
  chantAutoStopTimer = null
}

function releaseChantStream() {
  if (!activeChantStream) return
  for (const track of activeChantStream.getTracks()) track.stop()
  activeChantStream = null
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new window.FileReader()
    reader.addEventListener('load', () => {
      const result = String(reader.result || '')
      resolve(result.includes(',') ? result.slice(result.indexOf(',') + 1) : result)
    })
    reader.addEventListener('error', () =>
      reject(reader.error || new Error('Could not read chant'))
    )
    reader.readAsDataURL(blob)
  })
}

async function startChantRecording() {
  if (!recordingSupported()) {
    state.chantRecorder = {
      elapsedMs: 0,
      error: 'Microphone recording is not available in this runtime',
      status: 'error'
    }
    render()
    return
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    const mimeType = preferredChantMimeType()
    const chunks = []
    const recorder = mimeType
      ? new window.MediaRecorder(stream, { mimeType })
      : new window.MediaRecorder(stream)
    const startedAt = Date.now()

    activeChantStream = stream
    activeChantRecorder = recorder
    discardActiveChant = false

    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) chunks.push(event.data)
    })

    recorder.addEventListener('stop', () => {
      finalizeChantRecording({
        chunks,
        durationMs: Date.now() - startedAt,
        mimeType: recorder.mimeType || mimeType || 'audio/webm'
      }).catch((err) => {
        state.chantRecorder = {
          elapsedMs: 0,
          error: err.message || 'Could not save chant',
          status: 'error'
        }
        render()
      })
    })

    recorder.start()
    state.chantRecorder = {
      elapsedMs: 0,
      error: '',
      status: 'recording'
    }

    chantTickTimer = setInterval(() => {
      state.chantRecorder = {
        ...state.chantRecorder,
        elapsedMs: Math.min(Date.now() - startedAt, CHANT_MAX_MS)
      }
      render()
    }, 500)

    chantAutoStopTimer = setTimeout(() => {
      stopChantRecording()
    }, CHANT_MAX_MS)

    render()
  } catch (err) {
    releaseChantStream()
    state.chantRecorder = {
      elapsedMs: 0,
      error: err.message || 'Microphone permission failed',
      status: 'error'
    }
    render()
  }
}

function stopChantRecording(options = {}) {
  resetChantTimers()

  const recorder = activeChantRecorder
  activeChantRecorder = null

  if (!recorder) {
    releaseChantStream()
    if (options.discard) return
    state.chantRecorder = {
      elapsedMs: 0,
      error: '',
      status: 'idle'
    }
    return
  }

  if (options.discard) {
    discardActiveChant = true
    if (recorder.state !== 'inactive') recorder.stop()
    return
  }

  const elapsedMs = state.chantRecorder.elapsedMs
  if (elapsedMs < CHANT_MIN_MS) {
    activeChantRecorder = recorder
    state.chantRecorder = {
      elapsedMs,
      error: 'Hold for at least 3 seconds',
      status: 'error'
    }
    render()
    return
  }

  state.chantRecorder = {
    elapsedMs,
    error: '',
    status: 'saving'
  }
  render()
  if (recorder.state !== 'inactive') recorder.stop()
}

async function finalizeChantRecording({ chunks, durationMs, mimeType }) {
  if (discardActiveChant) {
    discardActiveChant = false
    releaseChantStream()
    return
  }

  releaseChantStream()

  if (durationMs < CHANT_MIN_MS) {
    state.chantRecorder = {
      elapsedMs: durationMs,
      error: 'Hold for at least 3 seconds',
      status: 'error'
    }
    render()
    return
  }

  const blob = new Blob(chunks, { type: mimeType })
  await saveChantBlob({ blob, durationMs, mimeType })
}

function requestChantLoad(event, options = {}) {
  if (chantAudioUrls.has(event.id)) return
  sendWorkerCommand('chant:load', {
    eventId: event.id,
    fileId: event.payload.fileId,
    mimeType: event.payload.mimeType,
    silent: options.silent === true
  })
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
  const metrics = roomMetrics()
  const hasEvents = metrics.playableEvents.length > 0
  const match = roomParts(state.roomCode)
  const latestEvent = metrics.playableEvents[0]
  const connected = state.peerCount > 0
  const syncTone = state.lastError ? 'error' : connected ? 'connected' : 'searching'
  const activeEffect = state.effects[0]
  const timeline = state.events
    .map((event) => {
      const meta = eventMeta(event)
      const status = eventStatus(event)
      const reaction = event.type === 'reaction' ? reactionTheme(event.payload.type) : null
      const reactionClass = reaction
        ? `reaction-${safeClass(reaction.type)} tone-${reaction.tone}`
        : ''

      return `
        <li class="timeline-event ${event.type} ${status} ${reactionClass}">
          <div class="event-icon" aria-hidden="true"></div>
          <div>
            <div class="event-meta">
              <span>${escapeHtml(meta.label)}</span>
              <span>${escapeHtml(formatTime(event.timestamp))}</span>
            </div>
            ${renderTimelineEventBody(event, meta)}
            <div class="event-footer">
              <span class="event-sender">${escapeHtml(event.sender)}</span>
              <span class="event-status ${status}">${escapeHtml(eventStatusLabel(event))}</span>
            </div>
          </div>
        </li>
      `
    })
    .join('')

  app.innerHTML = `
    <main class="room-view ${activeEffect ? `effect-${safeClass(activeEffect.tone)}` : ''}">
      ${renderReactionEffects()}
      <header class="room-header">
        <div class="brand-mini">
          <img
            class="brand-icon-image"
            src="../assets/brand/icon/tifo-app-icon.png"
            alt=""
          />
          <div>
            <p class="eyebrow">TIFO Match Room</p>
            <h1>${escapeHtml(state.roomTitle)}</h1>
          </div>
        </div>
        <div class="room-actions">
          <span class="live-badge ${connected ? 'connected' : ''}">
            <span aria-hidden="true"></span>
            ${escapeHtml(connected ? 'P2P live' : 'Seeking peers')}
          </span>
          <button class="ghost-action" id="leave-room" type="button">Leave</button>
        </div>
      </header>

      <section class="room-stage" aria-label="Match summary">
        <div class="scoreboard">
          <div class="score-team-block">
            <span class="team-label">Home</span>
            <strong>${escapeHtml(match.home)}</strong>
          </div>
          <div class="score-core">
            <span>${escapeHtml(match.round)}</span>
            <strong>vs</strong>
            <small>${escapeHtml(state.roomCode)}</small>
          </div>
          <div class="score-team-block muted">
            <span class="team-label">Away</span>
            <strong>${escapeHtml(match.away)}</strong>
          </div>
        </div>
        <div class="stage-summary ${syncTone} ${activeEffect ? 'active-reaction' : ''}">
          <span>Room sync</span>
          <strong>${escapeHtml(activeEffect ? activeEffect.label : state.syncStatus)}</strong>
          <p>${escapeHtml(activeEffect ? `${activeEffect.sender} lifted the terrace` : latestEvent ? eventMeta(latestEvent).text : 'Waiting for the first chant, flare, or message.')}</p>
        </div>
      </section>

      ${renderReplayPreview()}

      <section class="match-strip" aria-label="Room status">
        <div>
          <span class="status-label">Fan</span>
          <strong>${escapeHtml(state.nickname)}</strong>
        </div>
        <div>
          <span class="status-label">Peers live</span>
          <strong>${state.peerCount}</strong>
        </div>
        <div>
          <span class="status-label">Echo events</span>
          <strong>${state.events.length}</strong>
        </div>
        <div>
          <span class="status-label">Saved</span>
          <strong>${metrics.saved}</strong>
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
              <p>${metrics.chats} messages from this room</p>
            </div>
            <span class="local-pill ${connected ? 'connected' : ''}">${connected ? 'Live sync' : 'Local first'}</span>
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
              value="${escapeHtml(state.chatDraft)}"
            />
            <button type="submit">Send</button>
          </form>
        </section>

        <aside class="controls-surface" aria-labelledby="controls-title">
          <div class="section-heading">
            <div>
              <h2 id="controls-title">Terrace actions</h2>
              <p>${metrics.reactions} reactions, ${metrics.chants} chants</p>
            </div>
          </div>
          <div class="reaction-grid">
            ${reactionTypes
              .map(
                (reaction) => `
                  <button
                    class="reaction-button tone-${reaction.tone}"
                    type="button"
                    data-reaction="${escapeHtml(reaction.type)}"
                  >
                    <span class="reaction-dot" aria-hidden="true"></span>
                    <span>
                      <strong>${escapeHtml(reaction.label)}</strong>
                      <small>${escapeHtml(reaction.cue)}</small>
                    </span>
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
            ${hasEvents ? `${metrics.playableEvents.length} Echo-ready events` : 'Waiting for terrace noise'}
          </p>
          ${renderChantRecorder()}
        </aside>

        <section class="timeline-surface" aria-labelledby="timeline-title">
          <div class="section-heading">
            <div>
              <h2 id="timeline-title">Echo timeline</h2>
              <p>${metrics.peerEvents} peer events, ${metrics.saved} saved</p>
            </div>
            <span class="timeline-count">${state.events.length} events</span>
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
    state.chatDraft = ''
    sendWorkerCommand('chat:send', { text })
  })

  document.getElementById('chat-input').addEventListener('input', (event) => {
    state.chatDraft = event.currentTarget.value
  })

  const chantButton = document.getElementById('chant-record')
  if (chantButton) {
    chantButton.addEventListener('click', () => {
      if (state.chantRecorder.status === 'recording') stopChantRecording()
      else startChantRecording()
    })
  }

  const fallbackChantButton = document.getElementById('chant-fallback')
  if (fallbackChantButton) {
    fallbackChantButton.addEventListener('click', () => {
      saveFallbackChant()
    })
  }

  const replayCloseButton = document.getElementById('replay-close')
  if (replayCloseButton) {
    replayCloseButton.addEventListener('click', () => {
      resetReplayPreview({ renderAfter: true })
    })
  }

  for (const button of document.querySelectorAll('[data-chant-load]')) {
    button.addEventListener('click', () => {
      const event = state.events.find((item) => item.id === button.dataset.chantLoad)
      if (event) loadChantAudio(event)
    })
  }

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
    startReplayEchoPreview()
    sendWorkerCommand('echo:replay')
  })
}

function renderReplayPreview() {
  const replay = state.replayPreview
  if (!replay.active) return ''

  return `
    <section class="replay-preview" aria-live="polite">
      <div>
        <span class="status-label">Replay Echo</span>
        <strong>${escapeHtml(replay.title)}</strong>
        <p>${escapeHtml(replay.detail)}</p>
        ${replay.error ? `<small>${escapeHtml(replay.error)}</small>` : ''}
      </div>
      <div class="replay-progress" aria-hidden="true">
        <span style="width: ${replay.progress}%"></span>
      </div>
      <button class="ghost-action" id="replay-close" type="button">Close</button>
    </section>
  `
}

function renderTimelineEventBody(event, meta) {
  if (event.type !== 'chant') return `<p>${escapeHtml(meta.text)}</p>`

  const audioUrl = chantAudioUrls.get(event.id)
  const isLoading = pendingChantLoads.has(event.id)
  const duration = formatDuration(event.payload.durationMs)

  return `
    <div class="chant-event">
      <p>${escapeHtml(duration)} terrace chant · ${escapeHtml(formatBytes(event.payload.size))}</p>
      ${
        audioUrl
          ? `<audio controls preload="metadata" src="${escapeHtml(audioUrl)}"></audio>`
          : `<button class="chant-load-action" type="button" data-chant-load="${escapeHtml(event.id)}" ${isLoading ? 'disabled' : ''}>${escapeHtml(isLoading ? 'Preparing audio' : 'Load audio')}</button>`
      }
    </div>
  `
}

function renderChantRecorder() {
  const recorder = state.chantRecorder
  const isRecording = recorder.status === 'recording'
  const isSaving = recorder.status === 'saving'
  const canStop = isRecording && recorder.elapsedMs >= CHANT_MIN_MS
  const progress = Math.min(100, Math.round((recorder.elapsedMs / CHANT_MAX_MS) * 100))
  const buttonText = isRecording ? (canStop ? 'Stop chant' : 'Hold...') : 'Record chant'

  return `
    <div class="chant-recorder ${isRecording ? 'recording' : ''}">
      <div>
        <span class="status-label">Audio chant</span>
        <strong>${escapeHtml(isSaving ? 'Saving chant' : isRecording ? formatDuration(recorder.elapsedMs) : '3-10 sec clip')}</strong>
      </div>
      <div class="chant-meter" aria-hidden="true">
        <span style="width: ${progress}%"></span>
      </div>
      <button
        class="chant-action"
        id="chant-record"
        type="button"
        ${isSaving || (isRecording && !canStop) ? 'disabled' : ''}
      >
        ${escapeHtml(buttonText)}
      </button>
      <button
        class="chant-fallback-action"
        id="chant-fallback"
        type="button"
        ${isSaving || isRecording ? 'disabled' : ''}
      >
        Use demo chant
      </button>
      ${
        recorder.error
          ? `<p class="chant-error" role="status">${escapeHtml(recorder.error)}</p>`
          : `<p class="control-note">${isRecording ? 'Keep singing until the meter passes 3 seconds.' : 'Saved chants join the Echo timeline as local audio.'}</p>`
      }
    </div>
  `
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 1) return '0 KB'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function renderReactionEffects() {
  if (state.effects.length === 0) return ''

  return `
    <div class="reaction-fx-layer" aria-hidden="true">
      ${state.effects
        .map(
          (effect, index) => `
            <div class="reaction-burst tone-${safeClass(effect.tone)} burst-${index}">
              <span>${escapeHtml(effect.label)}</span>
              <small>${escapeHtml(effect.sender)}</small>
            </div>
          `
        )
        .join('')}
      <div class="terrace-flash tone-${safeClass(state.effects[0].tone)}"></div>
    </div>
  `
}

function renderChatItems() {
  const chatEvents = state.events.filter((event) => event.type === 'chat')
  if (chatEvents.length === 0) {
    return `<div class="empty-state">No messages yet.</div>`
  }

  return chatEvents
    .map((event) => {
      const status = eventStatus(event)
      return `
        <article class="chat-message ${status}">
          <div>
            <strong>${escapeHtml(event.sender)}</strong>
            <span>${escapeHtml(formatTime(event.timestamp))}</span>
          </div>
          <p>${escapeHtml(event.payload.text)}</p>
          <span class="message-status ${status}">${escapeHtml(eventStatusLabel(event))}</span>
        </article>
      `
    })
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
