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
  clipDraft: {
    caption: '',
    error: '',
    status: 'idle'
  },
  offline: {
    detail: 'Network searching',
    enabled: false,
    lastFlushCount: 0,
    pendingCount: 0,
    pendingEventIds: new Set()
  },
  chantRecorder: {
    elapsedMs: 0,
    error: '',
    status: 'idle'
  },
  replayPreview: {
    active: false,
    activeEventId: '',
    anchorId: '',
    anchorLabel: '',
    cueCount: 0,
    cues: [],
    detail: '',
    error: '',
    mode: 'idle',
    messages: [],
    progress: 0,
    title: '',
    windowLabel: ''
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
const clipPrefetchIds = new Set()
const clipPreviewUrls = new Map()
const pendingChantLoads = new Map()
const pendingChantUrls = new Map()
const pendingClipLoads = new Map()
const pendingClipPreviews = new Map()
const CHANT_MIN_MS = 3000
const CHANT_MAX_MS = 10000
const FALLBACK_CHANT_MS = 3600
const CLIP_MAX_BYTES = 64 * 1024 * 1024
const CLIP_MAX_DURATION_MS = 5 * 60 * 1000
const CLIP_PATH_STORAGE_KEY = 'tifo:clip-paths'
const REPLAY_WINDOW_BEFORE_MS = 5000
const REPLAY_WINDOW_AFTER_MS = 25000
const REPLAY_DURATION_MS = 12000
const REPLAY_MIN_STEP_MS = 520
let activeChantRecorder = null
let activeChantStream = null
let discardActiveChant = false
let chantTickTimer = null
let chantAutoStopTimer = null
let activeReplayAudio = null
let activeReplaySession = null
let fallbackChantUrl = ''
let replayProgressTimer = null
let replayStartedAt = 0
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

function formatDate(timestamp) {
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short'
  }).format(timestamp)
}

function formatDuration(ms) {
  return `${Math.max(1, Math.round(ms / 1000))}s`
}

function formatClipDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return 'Duration unknown'
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes === 0) return `${seconds}s`
  return `${minutes}:${String(seconds).padStart(2, '0')}`
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

  if (event.type === 'clip') {
    return {
      label: 'Clip',
      text: event.payload.caption || event.payload.title || 'Highlight clip'
    }
  }

  return {
    label: 'System',
    text: event.payload.text
  }
}

function eventStatus(event) {
  if (state.offline.pendingEventIds.has(event.id)) return 'pending'
  return ['local', 'remote', 'stored'].includes(event.status) ? event.status : 'local'
}

function eventStatusLabel(event) {
  const status = eventStatus(event)
  if (status === 'pending') return 'Pending'
  if (status === 'remote') return 'Peer'
  if (status === 'stored') return 'Synced'
  return 'Local'
}

function roomMetrics() {
  const playableEvents = state.events.filter((event) => event.type !== 'system')
  const pendingEvents = state.events.filter((event) => state.offline.pendingEventIds.has(event.id))
  return {
    chats: state.events.filter((event) => event.type === 'chat').length,
    chants: state.events.filter((event) => event.type === 'chant').length,
    clips: state.events.filter((event) => event.type === 'clip').length,
    pending: Math.max(state.offline.pendingCount, pendingEvents.length),
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
  attachPendingClipPreview(event)
  prefetchChantAudio(event)
  prefetchClipVideo(event)
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

function prefetchClipVideo(event) {
  if (event?.type !== 'clip' || !event.payload?.clipRef) return
  if (clipPreviewUrlForEvent(event) || pendingClipLoads.has(event.id)) return
  if (clipPrefetchIds.has(event.id)) return

  clipPrefetchIds.add(event.id)
  loadClipVideo(event, { silent: true })
}

function prefetchClipVideos(events) {
  for (const event of events) prefetchClipVideo(event)
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
    activeEventId: '',
    anchorId: '',
    anchorLabel: '',
    cueCount: 0,
    cues: [],
    detail: '',
    error: '',
    mode: 'idle',
    messages: [],
    progress: 0,
    title: '',
    windowLabel: ''
  }
}

function clearReplayTimers() {
  for (const timer of replayTimers) clearTimeout(timer)
  replayTimers = []
  if (replayProgressTimer) clearInterval(replayProgressTimer)
  replayProgressTimer = null
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
  activeReplaySession = null
  replayStartedAt = 0
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

function updateReplayProgress(progress) {
  state.replayPreview = {
    ...state.replayPreview,
    progress
  }

  const progressBar = document.querySelector('.replay-progress span')
  if (progressBar) progressBar.style.width = `${progress}%`
}

function resolvePendingChantLoad(eventId, dataUrl = '') {
  const pending = pendingChantLoads.get(eventId)
  if (!pending) return

  clearTimeout(pending.timeout)
  pendingChantLoads.delete(eventId)
  pending.resolve(dataUrl)
}

function resolvePendingClipLoad(eventId, videoUrl = '') {
  const pending = pendingClipLoads.get(eventId)
  if (!pending) return

  clearTimeout(pending.timeout)
  pendingClipLoads.delete(eventId)
  pending.resolve(videoUrl)
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
      state.clipDraft = clipDraftIdle()
      state.offline = {
        detail: 'Network searching',
        enabled: false,
        lastFlushCount: 0,
        pendingCount: 0,
        pendingEventIds: new Set()
      }
      state.chantRecorder = {
        elapsedMs: 0,
        error: '',
        status: 'idle'
      }
      state.replayPreview = replayIdleState()
      state.effects = []
      state.seenEffectEventIds.clear()
      chantPrefetchIds.clear()
      clipPrefetchIds.clear()
      rememberEffectEvents(state.events)
      prefetchChantAudios(state.events)
      prefetchClipVideos(state.events)
      state.lastError = ''
      break
    case 'room:left':
      state.view = 'home'
      state.roomTitle = ''
      state.peerCount = 0
      state.syncStatus = message.syncStatus || 'Worker ready'
      state.events = message.events || []
      state.chatDraft = ''
      state.clipDraft = clipDraftIdle()
      clearClipPreviewUrls()
      state.offline = {
        detail: 'Network searching',
        enabled: false,
        lastFlushCount: 0,
        pendingCount: 0,
        pendingEventIds: new Set()
      }
      stopChantRecording({ discard: true })
      resetReplayPreview()
      state.chantRecorder = {
        elapsedMs: 0,
        error: '',
        status: 'idle'
      }
      chantPrefetchIds.clear()
      clipPrefetchIds.clear()
      state.effects = []
      state.seenEffectEventIds.clear()
      state.lastError = ''
      break
    case 'peer:count':
      shouldRender = state.peerCount !== message.count
      state.peerCount = message.count
      if (message.count > 0) {
        prefetchChantAudios(state.events)
        prefetchClipVideos(state.events)
      }
      break
    case 'sync:status':
      shouldRender = state.syncStatus !== message.status
      state.syncStatus = message.status
      break
    case 'offline:state':
      {
        const pendingEventIds = Array.isArray(message.pendingEventIds)
          ? message.pendingEventIds.filter((id) => typeof id === 'string')
          : []
        state.offline = {
          detail: message.detail || (message.enabled ? 'Local room active' : 'Network live'),
          enabled: message.enabled === true,
          lastFlushCount: Number.isFinite(message.lastFlushCount) ? message.lastFlushCount : 0,
          pendingCount: Number.isFinite(message.pendingCount) ? message.pendingCount : 0,
          pendingEventIds: new Set(pendingEventIds)
        }
      }
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
          for (const event of events) {
            attachPendingChantUrl(event)
            attachPendingClipPreview(event)
          }
          applyLiveEffects(events)
          state.events = events
          prefetchChantAudios(state.events)
          prefetchClipVideos(state.events)
        }
      }
      break
    case 'chant:loaded':
      chantAudioUrls.set(message.eventId, message.dataUrl)
      resolvePendingChantLoad(message.eventId, message.dataUrl)
      break
    case 'clip:loaded':
      {
        const videoUrl = pathToFileUrl(message.filePath || '')
        if (videoUrl) {
          clipPreviewUrls.set(message.eventId, videoUrl)
          storeLocalClipPath(message.clipRef, message.filePath)
        }
        resolvePendingClipLoad(message.eventId, videoUrl)
      }
      break
    case 'echo:replay':
      shouldRender = false
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

function readClipPathStore() {
  try {
    const raw = window.localStorage.getItem(CLIP_PATH_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function saveClipPathStore(store) {
  try {
    window.localStorage.setItem(CLIP_PATH_STORAGE_KEY, JSON.stringify(store))
  } catch {
    // Private preview restore is optional; timeline metadata still works.
  }
}

function storeLocalClipPath(clipRef, localPath) {
  if (!clipRef || !localPath) return
  const store = readClipPathStore()
  store[clipRef] = localPath
  saveClipPathStore(store)
}

function localPathForClip(event) {
  const clipRef = event?.payload?.clipRef
  if (!clipRef) return ''
  const store = readClipPathStore()
  return typeof store[clipRef] === 'string' ? store[clipRef] : ''
}

function pathToFileUrl(filePath) {
  if (!filePath) return ''
  let normalized = filePath.replace(/\\/g, '/')
  if (/^[a-z]:/i.test(normalized)) normalized = `/${normalized}`
  const encoded = normalized
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
  return `file://${encoded.startsWith('/') ? encoded : `/${encoded}`}`
}

function clipPreviewUrlForEvent(event) {
  if (clipPreviewUrls.has(event.id)) return clipPreviewUrls.get(event.id)
  const localPath = localPathForClip(event)
  return localPath ? pathToFileUrl(localPath) : ''
}

function clearClipPreviewUrls() {
  for (const url of clipPreviewUrls.values()) {
    if (url.startsWith('blob:')) URL.revokeObjectURL(url)
  }
  for (const preview of pendingClipPreviews.values()) URL.revokeObjectURL(preview.url)
  for (const pending of pendingClipLoads.values()) {
    clearTimeout(pending.timeout)
    pending.resolve('')
  }
  clipPreviewUrls.clear()
  pendingClipLoads.clear()
  pendingClipPreviews.clear()
}

function attachPendingClipPreview(event) {
  const clientId = event?.payload?.clientId
  if (event?.type !== 'clip' || !clientId || !pendingClipPreviews.has(clientId)) return

  const preview = pendingClipPreviews.get(clientId)
  clipPreviewUrls.set(event.id, preview.url)
  if (preview.localPath) storeLocalClipPath(event.payload.clipRef, preview.localPath)
  pendingClipPreviews.delete(clientId)
}

function clipDraftIdle(overrides = {}) {
  return {
    caption: '',
    error: '',
    status: 'idle',
    ...overrides
  }
}

function clipFileSupported(file) {
  if (!file) return false
  if (file.type && file.type.startsWith('video/')) return true
  return /\.(mp4|m4v|mov|webm|ogg|ogv|mkv)$/i.test(file.name)
}

function clipMimeType(file) {
  if (file.type && file.type.startsWith('video/')) return file.type
  if (/\.webm$/i.test(file.name)) return 'video/webm'
  if (/\.(ogg|ogv)$/i.test(file.name)) return 'video/ogg'
  if (/\.(mov|m4v)$/i.test(file.name)) return 'video/quicktime'
  return 'video/mp4'
}

function bytesToHex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function clipRefForFile(file) {
  const input = `${file.size}\n${file.lastModified || 0}\n${clipMimeType(file)}`
  if (!window.crypto?.subtle) {
    return `${file.size.toString(16)}-${(file.lastModified || Date.now()).toString(16)}`
  }

  const encoded = new TextEncoder().encode(input)
  return bytesToHex(await window.crypto.subtle.digest('SHA-256', encoded))
}

function readVideoDuration(objectUrl) {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    const timeout = setTimeout(() => done(null), 2400)

    function done(durationMs) {
      clearTimeout(timeout)
      video.removeAttribute('src')
      video.load()
      resolve(durationMs)
    }

    video.preload = 'metadata'
    video.addEventListener(
      'loadedmetadata',
      () => {
        const durationMs = Number.isFinite(video.duration)
          ? Math.round(video.duration * 1000)
          : null
        done(durationMs)
      },
      { once: true }
    )
    video.addEventListener('error', () => done(null), { once: true })
    video.src = objectUrl
  })
}

function localPathForFile(file) {
  if (typeof bridge.pathForFile !== 'function') return ''
  try {
    return bridge.pathForFile(file) || ''
  } catch {
    return ''
  }
}

async function saveClipMetadata(file) {
  if (state.clipDraft.status === 'saving') return

  if (!clipFileSupported(file)) {
    state.clipDraft = {
      ...state.clipDraft,
      error: 'Select a video clip file',
      status: 'error'
    }
    render()
    return
  }

  if (!Number.isFinite(file.size) || file.size < 1) {
    state.clipDraft = {
      ...state.clipDraft,
      error: 'Selected clip is empty',
      status: 'error'
    }
    render()
    return
  }

  if (file.size > CLIP_MAX_BYTES) {
    state.clipDraft = {
      ...state.clipDraft,
      error: 'Clip must be 64 MB or smaller',
      status: 'error'
    }
    render()
    return
  }

  let objectUrl = ''
  try {
    objectUrl = URL.createObjectURL(file)
    state.clipDraft = {
      ...state.clipDraft,
      error: '',
      status: 'saving'
    }
    render()

    const [clipRef, durationMs] = await Promise.all([
      clipRefForFile(file),
      readVideoDuration(objectUrl)
    ])

    if (!Number.isFinite(durationMs) || durationMs <= 0) {
      URL.revokeObjectURL(objectUrl)
      state.clipDraft = {
        ...state.clipDraft,
        error: 'Could not read clip duration',
        status: 'error'
      }
      render()
      return
    }

    if (durationMs > CLIP_MAX_DURATION_MS) {
      URL.revokeObjectURL(objectUrl)
      state.clipDraft = {
        ...state.clipDraft,
        error: 'Clip must be 5 minutes or shorter',
        status: 'error'
      }
      render()
      return
    }

    const clientId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
    const localPath = localPathForFile(file)

    pendingClipPreviews.set(clientId, {
      localPath,
      url: objectUrl
    })
    if (localPath) storeLocalClipPath(clipRef, localPath)

    sendWorkerCommand('clip:save', {
      caption: state.clipDraft.caption,
      clientId,
      clipRef,
      durationMs,
      lastModified: file.lastModified || null,
      localPath,
      mimeType: clipMimeType(file),
      size: file.size,
      title: 'Highlight clip'
    })

    state.clipDraft = clipDraftIdle()
    render()
  } catch (err) {
    if (objectUrl) URL.revokeObjectURL(objectUrl)
    state.clipDraft = {
      ...state.clipDraft,
      error: err.message || 'Could not save clip metadata',
      status: 'error'
    }
    render()
  }
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

function loadClipVideo(event, options = {}) {
  const existingUrl = clipPreviewUrlForEvent(event)
  if (existingUrl) return Promise.resolve(existingUrl)
  if (!event.payload?.clipRef) return Promise.resolve('')
  if (pendingClipLoads.has(event.id)) return pendingClipLoads.get(event.id).promise

  let resolveLoad = null
  const promise = new Promise((resolve) => {
    resolveLoad = resolve
  })
  const timeoutMs = options.silent === true ? 45000 : 60000
  const timeout = setTimeout(() => {
    pendingClipLoads.delete(event.id)
    if (options.silent === true && !clipPreviewUrlForEvent(event)) clipPrefetchIds.delete(event.id)
    resolveLoad('')
    if (state.view === 'room') render()
  }, timeoutMs)

  pendingClipLoads.set(event.id, {
    promise,
    resolve: resolveLoad,
    timeout
  })
  requestClipLoad(event, options)
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

function replayEventsChronological() {
  return state.events
    .filter((event) => event.type !== 'system')
    .slice()
    .sort((left, right) => left.timestamp - right.timestamp)
}

function chooseReplayAnchor(anchorId = '') {
  const events = replayEventsChronological()
  if (anchorId) return events.find((event) => event.id === anchorId) || null

  return (
    events
      .slice()
      .reverse()
      .find(
        (event) => event.type === 'reaction' && ['goal', 'flare'].includes(event.payload?.type)
      ) ||
    events.at(-1) ||
    null
  )
}

function formatReplayOffset(ms) {
  if (Math.abs(ms) < 500) return 'Moment'
  const seconds = Math.round(ms / 1000)
  return seconds > 0 ? `+${seconds}s` : `${seconds}s`
}

function replayToneForEvent(event) {
  if (event.type === 'reaction') return reactionTheme(event.payload.type).tone
  if (event.type === 'chant') return 'cold'
  if (event.type === 'clip') return 'warning'
  if (event.type === 'chat') return 'clean'
  return 'warning'
}

function replayCueForEvent(event, anchor, replayStart, replayWindowMs, index) {
  const meta = eventMeta(event)
  const atMs = Math.max(
    0,
    Math.min(
      REPLAY_DURATION_MS,
      Math.round(((event.timestamp - replayStart) / replayWindowMs) * REPLAY_DURATION_MS)
    )
  )

  return {
    atMs,
    event,
    id: event.id,
    index,
    label: meta.label,
    offset: formatReplayOffset(event.timestamp - anchor.timestamp),
    sender: event.sender,
    text: meta.text,
    tone: replayToneForEvent(event),
    type: event.type
  }
}

function buildReplaySession(anchorId = '') {
  const anchor = chooseReplayAnchor(anchorId)
  if (!anchor) return null

  const replayStart = anchor.timestamp - REPLAY_WINDOW_BEFORE_MS
  const replayEnd = anchor.timestamp + REPLAY_WINDOW_AFTER_MS
  const replayWindowMs = replayEnd - replayStart
  const windowEvents = replayEventsChronological().filter(
    (event) => event.timestamp >= replayStart && event.timestamp <= replayEnd
  )
  const sourceEvents = windowEvents.length > 0 ? windowEvents : [anchor]
  const cues = sourceEvents
    .map((event, index) => replayCueForEvent(event, anchor, replayStart, replayWindowMs, index))
    .sort((left, right) => left.atMs - right.atMs || left.index - right.index)

  for (let index = 1; index < cues.length; index += 1) {
    const previous = cues[index - 1]
    const cue = cues[index]
    if (cue.atMs - previous.atMs < REPLAY_MIN_STEP_MS) {
      cue.atMs = Math.min(REPLAY_DURATION_MS - 300, previous.atMs + REPLAY_MIN_STEP_MS)
    }
  }

  const anchorMeta = eventMeta(anchor)

  return {
    anchor,
    anchorLabel: `${anchorMeta.label} by ${anchor.sender}`,
    cues,
    durationMs: Math.max(REPLAY_DURATION_MS, cues.at(-1)?.atMs + 1200 || REPLAY_DURATION_MS),
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
    windowLabel: `${formatReplayOffset(-REPLAY_WINDOW_BEFORE_MS)} to ${formatReplayOffset(REPLAY_WINDOW_AFTER_MS)}`
  }
}

function startReplayProgress(session) {
  replayStartedAt = Date.now()
  if (replayProgressTimer) clearInterval(replayProgressTimer)
  replayProgressTimer = setInterval(() => {
    if (activeReplaySession !== session.id) return
    const elapsed = Date.now() - replayStartedAt
    updateReplayProgress(Math.min(99, Math.round((elapsed / session.durationMs) * 100)))
  }, 220)
}

function startReplayEcho(anchorId = '') {
  const session = buildReplaySession(anchorId)
  if (!session) {
    state.lastError = 'Add a goal, reaction, chat, clip, or chant before replaying Echo'
    render()
    return
  }

  for (const cue of session.cues) {
    if (cue.type === 'chant') prefetchChantAudio(cue.event)
  }

  resetReplayPreview()
  activeReplaySession = session.id
  state.lastError = ''
  state.replayPreview = {
    ...replayIdleState(),
    active: true,
    anchorId: session.anchor.id,
    anchorLabel: session.anchorLabel,
    cueCount: session.cues.length,
    cues: session.cues.map((cue) => ({
      id: cue.id,
      label: cue.label,
      offset: cue.offset,
      tone: cue.tone,
      type: cue.type
    })),
    detail: `${session.cues.length} events queued around ${session.anchorLabel}`,
    mode: 'running',
    title: 'Replay Echo',
    windowLabel: session.windowLabel
  }
  startReplayProgress(session)

  for (const cue of session.cues) {
    scheduleReplayStep(() => activateReplayCue(session, cue), cue.atMs)
  }

  scheduleReplayStep(() => finishReplaySession(session), session.durationMs + 650)
  render()
}

function activateReplayCue(session, cue) {
  if (activeReplaySession !== session.id || state.view !== 'room') return

  state.replayPreview = {
    ...state.replayPreview,
    activeEventId: cue.id,
    detail: `${cue.offset} · ${cue.sender}: ${cue.text}`,
    error:
      cue.type === 'chant' && !chantAudioUrls.has(cue.id)
        ? 'Loading chant audio or using fallback'
        : '',
    messages: [
      {
        id: `${session.id}-${cue.id}-${Date.now()}`,
        label: cue.label,
        offset: cue.offset,
        sender: cue.sender,
        text: cue.text,
        tone: cue.tone,
        type: cue.type
      },
      ...state.replayPreview.messages
    ].slice(0, 5),
    title: cue.label
  }

  if (cue.type === 'reaction') {
    triggerReactionEffect({
      ...cue.event,
      id: `replay-${cue.id}-${Date.now()}`
    })
  }

  if (cue.type === 'chant') {
    playChantForReplay(cue.event).catch(() => {
      if (activeReplaySession !== session.id) return null
      state.replayPreview = {
        ...state.replayPreview,
        error: 'Replay audio fell back to demo chant'
      }
      render()
      return playAudioUrl(getFallbackChantUrl())
    })
  }

  render()
}

function finishReplaySession(session) {
  if (activeReplaySession !== session.id) return
  if (replayProgressTimer) clearInterval(replayProgressTimer)
  replayProgressTimer = null
  stopActiveReplayAudio()

  state.replayPreview = {
    ...state.replayPreview,
    activeEventId: '',
    detail: `${session.cues.length} Echo events replayed`,
    error: '',
    mode: 'complete',
    progress: 100,
    title: 'Echo complete'
  }
  render()
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

function requestClipLoad(event, options = {}) {
  if (clipPreviewUrlForEvent(event)) return
  sendWorkerCommand('clip:load', {
    clipRef: event.payload.clipRef,
    eventId: event.id,
    mimeType: event.payload.mimeType,
    silent: options.silent === true,
    size: event.payload.size
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
  const offlineActive = state.offline.enabled
  const connected = !offlineActive && state.peerCount > 0
  const syncTone = offlineActive
    ? 'offline'
    : state.lastError
      ? 'error'
      : connected
        ? 'connected'
        : 'searching'
  const activeEffect = state.effects[0]
  const timeline = state.events
    .map((event) => {
      const meta = eventMeta(event)
      const status = eventStatus(event)
      const reaction = event.type === 'reaction' ? reactionTheme(event.payload.type) : null
      const reactionClass = reaction
        ? `reaction-${safeClass(reaction.type)} tone-${reaction.tone}`
        : ''
      const replayClass = [
        state.replayPreview.activeEventId === event.id ? 'replay-active' : '',
        state.replayPreview.anchorId === event.id ? 'replay-anchor' : ''
      ]
        .filter(Boolean)
        .join(' ')

      return `
        <li class="timeline-event ${event.type} ${status} ${reactionClass} ${replayClass}">
          <div class="event-icon" aria-hidden="true"></div>
          <div>
            <div class="event-meta">
              <span>${escapeHtml(meta.label)}</span>
              <span>${escapeHtml(formatTime(event.timestamp))}</span>
            </div>
            ${renderTimelineEventBody(event, meta)}
            <div class="event-footer">
              <span class="event-sender">${escapeHtml(event.sender)}</span>
              <div class="event-actions">
                <span class="event-status ${status}">${escapeHtml(eventStatusLabel(event))}</span>
                ${
                  event.type !== 'system'
                    ? `<button class="event-replay-action" type="button" data-replay-anchor="${escapeHtml(event.id)}">Replay</button>`
                    : ''
                }
              </div>
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
          <span class="live-badge ${offlineActive ? 'offline' : connected ? 'connected' : ''}">
            <span aria-hidden="true"></span>
            ${escapeHtml(offlineActive ? 'Offline demo' : connected ? 'P2P live' : 'Seeking peers')}
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
        <div>
          <span class="status-label">Pending</span>
          <strong>${metrics.pending}</strong>
        </div>
      </section>
      ${renderOfflinePanel(metrics)}
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
            <span class="local-pill ${offlineActive ? 'pending' : connected ? 'connected' : ''}">${offlineActive ? 'Offline' : connected ? 'Live sync' : 'Local first'}</span>
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
              <p>${metrics.reactions} reactions, ${metrics.chants} chants, ${metrics.clips} clips</p>
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
          ${renderClipPicker()}
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

  document.getElementById('offline-toggle').addEventListener('change', (event) => {
    sendWorkerCommand('offline:set', { enabled: event.currentTarget.checked })
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

  const clipCaptionInput = document.getElementById('clip-caption')
  if (clipCaptionInput) {
    clipCaptionInput.addEventListener('input', (event) => {
      state.clipDraft.caption = event.currentTarget.value
    })
  }

  const clipInput = document.getElementById('clip-input')
  const clipButton = document.getElementById('clip-select')
  if (clipInput && clipButton) {
    clipButton.addEventListener('click', () => {
      clipInput.click()
    })
    clipInput.addEventListener('change', (event) => {
      const file = event.currentTarget.files?.[0]
      event.currentTarget.value = ''
      if (file) saveClipMetadata(file)
    })
  }

  const replayCloseButton = document.getElementById('replay-close')
  if (replayCloseButton) {
    replayCloseButton.addEventListener('click', () => {
      resetReplayPreview({ renderAfter: true })
    })
  }

  const replayAgainButton = document.getElementById('replay-again')
  if (replayAgainButton) {
    replayAgainButton.addEventListener('click', () => {
      startReplayEcho(state.replayPreview.anchorId)
      sendWorkerCommand('echo:replay')
    })
  }

  for (const button of document.querySelectorAll('[data-chant-load]')) {
    button.addEventListener('click', () => {
      const event = state.events.find((item) => item.id === button.dataset.chantLoad)
      if (event) loadChantAudio(event)
    })
  }

  for (const button of document.querySelectorAll('[data-replay-anchor]')) {
    button.addEventListener('click', () => {
      startReplayEcho(button.dataset.replayAnchor)
      sendWorkerCommand('echo:replay')
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
    startReplayEcho()
    sendWorkerCommand('echo:replay')
  })
}

function renderOfflinePanel(metrics) {
  const offline = state.offline
  const modeLabel = offline.enabled
    ? 'Offline simulation'
    : metrics.pending > 0
      ? 'Reconnect pending'
      : 'Network sync'
  const flushLabel =
    offline.lastFlushCount > 0
      ? `${offline.lastFlushCount} caught up`
      : offline.enabled
        ? 'Queueing locally'
        : state.peerCount > 0
          ? 'Peers available'
          : 'Searching'

  return `
    <section class="offline-demo-panel ${offline.enabled ? 'enabled' : ''}" aria-label="Offline reconnect status">
      <div class="offline-demo-copy">
        <span class="status-label">Reconnect demo</span>
        <strong>${escapeHtml(modeLabel)}</strong>
        <p>${escapeHtml(offline.detail)}</p>
      </div>
      <div class="offline-demo-stats">
        <div>
          <span>Pending</span>
          <strong>${metrics.pending}</strong>
        </div>
        <div>
          <span>Catch-up</span>
          <strong>${escapeHtml(flushLabel)}</strong>
        </div>
      </div>
      <label class="offline-toggle">
        <input id="offline-toggle" type="checkbox" ${offline.enabled ? 'checked' : ''} />
        <span aria-hidden="true"></span>
        <strong>Simulate offline</strong>
      </label>
    </section>
  `
}

function renderReplayPreview() {
  const replay = state.replayPreview
  if (!replay.active) return ''
  const complete = replay.mode === 'complete'

  return `
    <section class="replay-preview ${complete ? 'complete' : 'running'}" aria-live="polite">
      <div class="replay-main">
        <div>
          <span class="status-label">Replay Echo</span>
          <strong>${escapeHtml(replay.title)}</strong>
          <p>${escapeHtml(replay.detail)}</p>
          ${replay.error ? `<small>${escapeHtml(replay.error)}</small>` : ''}
        </div>
        <div class="replay-meta">
          <span>${escapeHtml(replay.anchorLabel)}</span>
          <span>${escapeHtml(replay.windowLabel)}</span>
          <span>${replay.cueCount} cues</span>
        </div>
      </div>
      <div class="replay-progress-block">
        <div class="replay-progress" aria-hidden="true">
          <span style="width: ${replay.progress}%"></span>
        </div>
        ${renderReplayCueRail(replay)}
      </div>
      <div class="replay-feed">
        ${renderReplayMessages(replay)}
      </div>
      <div class="replay-controls">
        <button class="ghost-action" id="replay-again" type="button">${complete ? 'Replay again' : 'Restart'}</button>
        <button class="ghost-action" id="replay-close" type="button">Close</button>
      </div>
    </section>
  `
}

function renderReplayCueRail(replay) {
  if (!replay.cues.length) return ''

  return `
    <div class="replay-cue-rail" aria-hidden="true">
      ${replay.cues
        .map(
          (cue) => `
            <span
              class="tone-${escapeHtml(safeClass(cue.tone))} ${replay.activeEventId === cue.id ? 'active' : ''}"
              title="${escapeHtml(`${cue.offset} ${cue.label}`)}"
            ></span>
          `
        )
        .join('')}
    </div>
  `
}

function renderReplayMessages(replay) {
  if (!replay.messages.length) {
    return `<div class="replay-empty">Waiting for the first Echo cue.</div>`
  }

  return replay.messages
    .map(
      (message) => `
        <article class="replay-message tone-${escapeHtml(safeClass(message.tone))} ${escapeHtml(safeClass(message.type))}">
          <span>${escapeHtml(message.offset)}</span>
          <div>
            <strong>${escapeHtml(message.label)}</strong>
            <p>${escapeHtml(message.sender)} · ${escapeHtml(message.type === 'clip' ? `Clip card: ${message.text}` : message.text)}</p>
            ${message.type === 'clip' ? '<em>Highlight clip placeholder</em>' : ''}
          </div>
        </article>
      `
    )
    .join('')
}

function renderTimelineEventBody(event, meta) {
  if (event.type === 'clip') return renderClipEvent(event)
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

function renderClipPicker() {
  const clip = state.clipDraft
  const saving = clip.status === 'saving'

  return `
    <div class="clip-picker ${saving ? 'saving' : ''}">
      <div>
        <span class="status-label">Highlight clip</span>
        <strong>${escapeHtml(saving ? 'Saving clip' : 'Clip metadata')}</strong>
      </div>
      <input
        id="clip-caption"
        maxlength="140"
        placeholder="Clip caption"
        value="${escapeHtml(clip.caption)}"
        ${saving ? 'disabled' : ''}
      />
      <input id="clip-input" type="file" accept="video/*" hidden />
      <button class="clip-action" id="clip-select" type="button" ${saving ? 'disabled' : ''}>
        ${escapeHtml(saving ? 'Reading clip' : 'Select clip')}
      </button>
      ${
        clip.error
          ? `<p class="clip-error" role="status">${escapeHtml(clip.error)}</p>`
          : `<p class="control-note">Peer transfer supports clips up to 5 minutes and 64 MB.</p>`
      }
    </div>
  `
}

function clipDetailText(event) {
  const payload = event.payload
  const date = formatDate(payload.lastModified || event.timestamp)
  return `${formatClipDuration(payload.durationMs)} · ${date} · ${formatBytes(payload.size)}`
}

function renderClipEvent(event) {
  const payload = event.payload
  const previewUrl = clipPreviewUrlForEvent(event)
  const isLoading = pendingClipLoads.has(event.id)
  const caption = payload.caption || payload.title || 'Highlight clip'

  return `
    <div class="clip-card">
      <div>
        <strong>${escapeHtml(caption)}</strong>
        <p>${escapeHtml(clipDetailText(event))}</p>
      </div>
      ${
        previewUrl
          ? `<video class="clip-preview" controls preload="metadata" src="${escapeHtml(previewUrl)}"></video>`
          : `<div class="clip-unavailable">${escapeHtml(isLoading ? 'Preparing clip from peer' : 'Clip unavailable on this device')}</div>`
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
