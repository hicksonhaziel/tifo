const PearRuntime = require('pear-runtime')
const Hyperswarm = require('hyperswarm')
const Corestore = require('corestore')
const crypto = require('hypercore-crypto')
const goodbye = require('graceful-goodbye')
const FramedStream = require('framed-stream')
const Protomux = require('protomux')
const c = require('compact-encoding')
const path = require('bare-path')
const fs = require('bare-fs')
const b4a = require('b4a')
const { TifoEchoTimeline } = require('./tifo-echo-timeline')
const { TifoEventLog } = require('./tifo-event-log')
const { createTifoRoomState } = require('./tifo-room-state')

const pipe = new FramedStream(Bare.IPC)

const updaterConfig = {
  dir: Bare.argv[2],
  app: Bare.argv[3],
  updates: Bare.argv[4] !== 'false',
  version: Bare.argv[5],
  upgrade: Bare.argv[6],
  name: Bare.argv[7]
}

const store = new Corestore(path.join(updaterConfig.dir, 'pear-runtime/corestore'))
const swarm = new Hyperswarm()
const roomSwarm = new Hyperswarm()
const pear = new PearRuntime({ ...updaterConfig, swarm, store })

pear.updater.on('error', console.error)
if (updaterConfig.updates !== false) {
  swarm.on('connection', (connection) => store.replicate(connection))
  swarm.join(pear.updater.drive.core.discoveryKey, {
    client: true,
    server: false
  })
}

console.log('Application storage:', pear.storage)

pear.updater.on('updating', () => pipe.write('updating'))
pear.updater.on('updated', () => pipe.write('updated'))

function send(type, payload = {}) {
  pipe.write(JSON.stringify({ type, ...payload }))
}

const roomPeers = new Map()
const roomControlProtocol = 'tifo-room-control-v1'
const chantMaxBytes = 2 * 1024 * 1024
const chatVoiceMaxBytes = 5 * 1024 * 1024
const chatImageMaxBytes = 10 * 1024 * 1024
const clipMaxBytes = 64 * 1024 * 1024
const clipMaxDurationMs = 5 * 60 * 1000
const clipChunkBytes = 48 * 1024
let roomTopic = null
let echoRefreshInterval = null
const chantDir = path.join(updaterConfig.dir, 'tifo-chants')
const chatMediaDir = path.join(updaterConfig.dir, 'tifo-chat-media')
const clipDir = path.join(updaterConfig.dir, 'tifo-clips')
const pendingChantRequests = new Map()
const pendingChatMediaRequests = new Map()
const pendingClipRequests = new Map()
const echoTimeline = new TifoEchoTimeline(store)
const legacyEventLog = new TifoEventLog(store)
const pendingSyncEventIds = new Set()
const inflightSyncEventIds = new Set()
let simulatedOffline = false
let lastPendingFlushCount = 0

const roomState = createTifoRoomState({
  send,
  onJoinRoom: handleJoinRoom,
  onLeaveRoom: handleLeaveRoom,
  onChantSave: handleChantSave,
  onChatMediaSave: handleChatMediaSave,
  onClipSave: handleClipSave,
  onLocalEvent: handleLocalEvent,
  onRemoteEvent: handleRemoteEvent
})

function topicForRoom(roomCode) {
  return crypto.namespace(`tifo-room:${roomCode.trim().toUpperCase()}`, 1)[0]
}

function peerIdFor(connection, peerInfo) {
  const key = peerInfo?.publicKey || connection.remotePublicKey
  if (key) return b4a.toString(key, 'hex')
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function normalizeKeyHex(key) {
  if (b4a.isBuffer(key)) return b4a.toString(key, 'hex')
  if (typeof key !== 'string') return null

  const trimmed = key.trim().toLowerCase()
  return /^[0-9a-f]{64}$/.test(trimmed) ? trimmed : null
}

function chooseBaseKey(leftKey, rightKey) {
  return leftKey < rightKey ? leftKey : rightKey
}

function safeFilePart(value) {
  return String(value)
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 96)
}

function chantExtension(mimeType) {
  if (/wav/i.test(mimeType)) return 'wav'
  if (/ogg/i.test(mimeType)) return 'ogg'
  if (/mp4|mpeg/i.test(mimeType)) return 'm4a'
  return 'webm'
}

function clipExtension(mimeType) {
  if (/webm/i.test(mimeType)) return 'webm'
  if (/ogg|ogv/i.test(mimeType)) return 'ogv'
  if (/quicktime|mov/i.test(mimeType)) return 'mov'
  return 'mp4'
}

function chatMediaExtension(kind, mimeType) {
  if (kind === 'image') {
    if (/png/i.test(mimeType)) return 'png'
    if (/webp/i.test(mimeType)) return 'webp'
    if (/gif/i.test(mimeType)) return 'gif'
    return 'jpg'
  }

  return chantExtension(mimeType)
}

function chantRoomDir(roomCode) {
  return path.join(chantDir, safeFilePart(roomCode.trim().toUpperCase()))
}

function chatMediaRoomDir(roomCode) {
  return path.join(chatMediaDir, safeFilePart(roomCode.trim().toUpperCase()))
}

function clipRoomDir(roomCode) {
  return path.join(clipDir, safeFilePart(roomCode.trim().toUpperCase()))
}

function chantFilePath(roomCode, fileId) {
  return path.join(chantRoomDir(roomCode), safeFilePart(fileId))
}

function chatMediaMaxBytes(kind) {
  return kind === 'image' ? chatImageMaxBytes : chatVoiceMaxBytes
}

function chatMediaFileName(mediaRef, kind, mimeType) {
  return `${safeFilePart(mediaRef)}.${chatMediaExtension(kind, mimeType)}`
}

function chatMediaFilePath(roomCode, mediaRef, kind, mimeType) {
  return path.join(chatMediaRoomDir(roomCode), chatMediaFileName(mediaRef, kind, mimeType))
}

function clipFileName(clipRef, mimeType) {
  return `${safeFilePart(clipRef)}.${clipExtension(mimeType)}`
}

function clipFilePath(roomCode, clipRef, mimeType) {
  return path.join(clipRoomDir(roomCode), clipFileName(clipRef, mimeType))
}

function chantRequestId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function pendingSyncEvents() {
  return roomState.state.events.filter((event) => pendingSyncEventIds.has(event.id))
}

function offlineStateDetail() {
  const pendingCount = pendingSyncEventIds.size
  if (simulatedOffline) {
    return pendingCount === 0
      ? 'Local room active'
      : `${pendingCount} local event${pendingCount === 1 ? '' : 's'} queued`
  }

  if (pendingCount > 0) {
    return roomPeers.size === 0
      ? `Waiting for peers to sync ${pendingCount} event${pendingCount === 1 ? '' : 's'}`
      : `Syncing ${pendingCount} pending event${pendingCount === 1 ? '' : 's'}`
  }

  if (lastPendingFlushCount > 0) {
    return `${lastPendingFlushCount} event${lastPendingFlushCount === 1 ? '' : 's'} synced after reconnect`
  }

  return roomPeers.size === 0 ? 'Network searching' : 'Network live'
}

function sendOfflineState(payload = {}) {
  send('offline:state', {
    detail: offlineStateDetail(),
    enabled: simulatedOffline,
    lastFlushCount: lastPendingFlushCount,
    pendingCount: pendingSyncEventIds.size,
    pendingEventIds: Array.from(pendingSyncEventIds),
    peerCount: roomPeers.size,
    ...payload
  })
}

function queuePendingSync(event) {
  if (!event?.id) return
  pendingSyncEventIds.add(event.id)
  inflightSyncEventIds.delete(event.id)
  lastPendingFlushCount = 0
  sendOfflineState()
}

function sendPeer(peer, message) {
  if (simulatedOffline || peer.closed || !peer.controlMessage) return
  peer.controlMessage.send({
    room: roomState.state.room?.code || null,
    ...message
  })
}

function sendPeerSnapshot(peer) {
  const room = roomState.state.room
  if (!room) return

  sendPeer(peer, {
    type: 'identity',
    nickname: roomState.state.profile.nickname,
    echo: echoTimeline.getIdentity()
  })
}

function sendAllPeerSnapshots() {
  for (const peer of roomPeers.values()) sendPeerSnapshot(peer)
}

function nudgePeersToRefresh() {
  for (const peer of roomPeers.values()) {
    sendPeer(peer, {
      type: 'echo:refresh'
    })
  }
}

function broadcastRoomEvent(event, exceptPeerId = null) {
  if (!roomState.state.room) return
  if (simulatedOffline) {
    queuePendingSync(event)
    return
  }

  for (const peer of roomPeers.values()) {
    if (peer.id === exceptPeerId) continue
    sendPeer(peer, {
      type: 'event:announce',
      event
    })
  }
}

function broadcastChantRequest(request) {
  for (const peer of roomPeers.values()) {
    sendPeer(peer, {
      type: 'chant:request',
      ...request
    })
  }
}

function broadcastChatMediaRequest(request) {
  for (const peer of roomPeers.values()) {
    sendPeer(peer, {
      type: 'chat-media:request',
      ...request
    })
  }
}

function broadcastClipRequest(request) {
  for (const peer of roomPeers.values()) {
    sendPeer(peer, {
      type: 'clip:request',
      ...request
    })
  }
}

function clearPendingChantRequests(message = 'Chant transfer was cancelled') {
  for (const [requestId, pending] of pendingChantRequests) {
    clearTimeout(pending.timeout)
    if (!pending.silent) {
      send('error', {
        command: 'chant:load',
        message
      })
    }
    pendingChantRequests.delete(requestId)
  }
}

function clearPendingChatMediaRequests(message = 'Chat media transfer was cancelled') {
  for (const [requestId, pending] of pendingChatMediaRequests) {
    clearTimeout(pending.timeout)
    if (!pending.silent) {
      send('error', {
        command: 'chat-media:load',
        message
      })
    }
    pendingChatMediaRequests.delete(requestId)
  }
}

function clearPendingClipRequests(message = 'Clip transfer was cancelled') {
  for (const [requestId, pending] of pendingClipRequests) {
    clearTimeout(pending.timeout)
    if (!pending.silent) {
      send('error', {
        command: 'clip:load',
        message
      })
    }
    pendingClipRequests.delete(requestId)
  }
}

function updateRoomPeerStatus() {
  const count = roomPeers.size
  send('peer:count', { count })

  if (!roomState.state.room) return
  if (simulatedOffline) {
    send('sync:status', {
      status:
        pendingSyncEventIds.size === 0
          ? 'Offline demo: local only'
          : `Offline demo: ${pendingSyncEventIds.size} pending`
    })
    sendOfflineState()
    return
  }

  send('sync:status', {
    status:
      count === 0 ? 'Searching for peers' : `P2P connected: ${count} peer${count === 1 ? '' : 's'}`
  })
  flushPendingSyncEvents()
}

function startEchoRefresh() {
  stopEchoRefresh()
  echoRefreshInterval = setInterval(() => {
    if (!roomState.state.room || roomPeers.size === 0) return
    sendAllPeerSnapshots()
    echoTimeline.refresh().catch((err) => {
      send('error', {
        command: 'echo:refresh',
        message: err.message || 'Could not refresh Echo timeline'
      })
    })
  }, 1200)
}

function stopEchoRefresh() {
  if (!echoRefreshInterval) return
  clearInterval(echoRefreshInterval)
  echoRefreshInterval = null
}

function persistEvent(event) {
  echoTimeline
    .append(event)
    .then(async () => {
      await echoTimeline.refresh()
      nudgePeersToRefresh()
    })
    .catch((err) => {
      send('error', {
        command: 'echo:persist',
        message: err.message || 'Could not save event locally'
      })
    })
}

async function handleJoinRoom(room) {
  const storedEvents = await echoTimeline.openRoom(room.code, {
    onUpdate: handleEchoTimelineUpdate
  })
  const migratedEvents = await migrateLegacyRoomEvents(room, storedEvents)
  if (simulatedOffline) {
    send('sync:status', { status: 'Offline demo: local only' })
    sendOfflineState()
  } else {
    joinRoomNetwork(room)
  }
  return migratedEvents
}

async function handleLeaveRoom() {
  leaveRoomNetwork()
  simulatedOffline = false
  pendingSyncEventIds.clear()
  inflightSyncEventIds.clear()
  lastPendingFlushCount = 0
  sendOfflineState()
  await echoTimeline.closeRoom()
}

function handleLocalEvent(event) {
  persistEvent(event)

  if (simulatedOffline || roomPeers.size === 0) {
    queuePendingSync(event)
    return
  }

  broadcastRoomEvent(event)
}

function handleRemoteEvent(event) {
  persistEvent(event)
}

function handleEchoTimelineUpdate(events) {
  roomState.mergeStoredEvents(events)
}

function flushPendingSyncEvents() {
  if (simulatedOffline || !roomState.state.room) {
    sendOfflineState()
    return 0
  }

  if (pendingSyncEventIds.size === 0) return 0

  if (roomPeers.size === 0) {
    sendOfflineState()
    return 0
  }

  let flushedCount = 0
  for (const event of pendingSyncEvents().reverse()) {
    if (inflightSyncEventIds.has(event.id)) continue
    broadcastRoomEvent(event)
    inflightSyncEventIds.add(event.id)
    flushedCount += 1
  }

  for (const eventId of Array.from(pendingSyncEventIds)) {
    if (!roomState.state.seenEventIds.has(eventId)) {
      pendingSyncEventIds.delete(eventId)
      inflightSyncEventIds.delete(eventId)
    }
  }

  if (flushedCount > 0) {
    nudgePeersToRefresh()
    send('sync:status', {
      status: `Reconnected: sending ${flushedCount} event${flushedCount === 1 ? '' : 's'}`
    })
  }

  sendOfflineState()
  return flushedCount
}

function acknowledgePendingSync(eventId) {
  const cleanEventId = typeof eventId === 'string' ? eventId.slice(0, 96) : ''
  if (!pendingSyncEventIds.has(cleanEventId)) return

  pendingSyncEventIds.delete(cleanEventId)
  inflightSyncEventIds.delete(cleanEventId)
  lastPendingFlushCount += 1

  if (pendingSyncEventIds.size === 0) {
    send('sync:status', {
      status: `Reconnected: synced ${lastPendingFlushCount} event${lastPendingFlushCount === 1 ? '' : 's'}`
    })
  } else {
    send('sync:status', {
      status: `Reconnected: ${pendingSyncEventIds.size} pending`
    })
  }

  sendOfflineState()
}

async function setSimulatedOffline(enabled) {
  const nextOffline = enabled === true
  if (simulatedOffline === nextOffline) {
    sendOfflineState()
    return
  }

  const room = roomState.state.room
  simulatedOffline = nextOffline
  lastPendingFlushCount = 0

  if (simulatedOffline) {
    leaveRoomNetwork()
    send('sync:status', {
      status:
        pendingSyncEventIds.size === 0
          ? 'Offline demo: local only'
          : `Offline demo: ${pendingSyncEventIds.size} pending`
    })
    sendOfflineState()
    return
  }

  if (room) {
    joinRoomNetwork(room)
    await echoTimeline.refresh()
    flushPendingSyncEvents()
  } else {
    send('sync:status', { status: 'Worker ready' })
  }

  sendOfflineState()
}

async function migrateLegacyRoomEvents(room, storedEvents) {
  let legacyEvents = []
  try {
    legacyEvents = await legacyEventLog.openRoom(room.code)
  } catch (err) {
    send('error', {
      command: 'echo:migrate',
      message: err.message || 'Could not read old room history'
    })
    return storedEvents
  } finally {
    await legacyEventLog.closeRoom().catch(() => {})
  }

  const seen = new Set(storedEvents.map((event) => event.id))
  const missingEvents = legacyEvents.filter((event) => !seen.has(event.id))
  if (missingEvents.length === 0) return storedEvents

  for (const event of missingEvents) await echoTimeline.append(event)
  return echoTimeline.readAll()
}

async function handleChantSave(command) {
  const data = b4a.from(command.bytesBase64, 'base64')
  if (data.byteLength < 256) {
    send('error', {
      command: 'chant:save',
      message: 'Recorded chant is empty'
    })
    return null
  }

  if (data.byteLength > chantMaxBytes) {
    send('error', {
      command: 'chant:save',
      message: 'Recorded chant is too large'
    })
    return null
  }

  const extension = chantExtension(command.mimeType)
  const fileId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}.${extension}`
  const dir = chantRoomDir(command.roomCode)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(path.join(dir, fileId), data)

  return {
    clientId: command.clientId,
    durationMs: command.durationMs,
    fileId,
    mimeType: command.mimeType,
    size: data.byteLength
  }
}

async function handleChatMediaSave(command) {
  const kind = command.kind === 'image' ? 'image' : command.kind === 'voice' ? 'voice' : null
  if (!kind) {
    send('error', {
      command: 'chat-media:save',
      message: 'Chat media kind is not valid'
    })
    return null
  }

  const mimeType =
    typeof command.mimeType === 'string' && command.mimeType.trim()
      ? command.mimeType.trim().slice(0, 80)
      : kind === 'image'
        ? 'image/jpeg'
        : 'audio/webm'

  if (kind === 'image' && !/^image\/(png|jpe?g|webp|gif)$/i.test(mimeType)) {
    send('error', {
      command: 'chat-media:save',
      message: 'Image type must be PNG, JPEG, WEBP, or GIF'
    })
    return null
  }

  if (kind === 'voice' && !/^audio\//i.test(mimeType)) {
    send('error', {
      command: 'chat-media:save',
      message: 'Voice note must be an audio file'
    })
    return null
  }

  let data = null
  if (typeof command.bytesBase64 === 'string' && command.bytesBase64.trim()) {
    data = b4a.from(command.bytesBase64, 'base64')
  } else if (typeof command.localPath === 'string' && command.localPath.trim()) {
    try {
      data = await fs.readFile(command.localPath.trim())
    } catch (err) {
      send('error', {
        command: 'chat-media:save',
        message: err.message || 'Could not read selected chat media'
      })
      return null
    }
  }

  if (!data || data.byteLength < 1) {
    send('error', {
      command: 'chat-media:save',
      message: 'Selected chat media is empty'
    })
    return null
  }

  const maxBytes = chatMediaMaxBytes(kind)
  if (data.byteLength > maxBytes) {
    send('error', {
      command: 'chat-media:save',
      message:
        kind === 'image' ? 'Image must be 10 MB or smaller' : 'Voice note must be 5 MB or smaller'
    })
    return null
  }

  const mediaRef =
    typeof command.mediaRef === 'string' && command.mediaRef.trim()
      ? command.mediaRef.trim().slice(0, 96)
      : `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`

  const dir = chatMediaRoomDir(command.roomCode)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(chatMediaFilePath(command.roomCode, mediaRef, kind, mimeType), data)

  const durationMs = Number(command.durationMs)
  const width = Number(command.width)
  const height = Number(command.height)

  return {
    caption: typeof command.caption === 'string' ? command.caption.trim().slice(0, 140) : '',
    clientId:
      typeof command.clientId === 'string' && command.clientId.trim()
        ? command.clientId.trim().slice(0, 80)
        : null,
    durationMs:
      kind === 'voice' && Number.isFinite(durationMs) && durationMs > 0
        ? Math.round(durationMs)
        : null,
    height: kind === 'image' && Number.isFinite(height) && height > 0 ? Math.round(height) : null,
    kind,
    mediaRef,
    mimeType,
    size: data.byteLength,
    width: kind === 'image' && Number.isFinite(width) && width > 0 ? Math.round(width) : null
  }
}

async function handleClipSave(command) {
  if (!command.localPath) {
    send('error', {
      command: 'clip:save',
      message: 'Could not read the selected clip path'
    })
    return null
  }

  if (command.durationMs > clipMaxDurationMs) {
    send('error', {
      command: 'clip:save',
      message: 'Clip must be 5 minutes or shorter'
    })
    return null
  }

  if (command.size > clipMaxBytes) {
    send('error', {
      command: 'clip:save',
      message: 'Clip must be 64 MB or smaller'
    })
    return null
  }

  let data = null
  try {
    data = await fs.readFile(command.localPath)
  } catch (err) {
    send('error', {
      command: 'clip:save',
      message: err.message || 'Could not read the selected clip'
    })
    return null
  }

  if (data.byteLength < 1) {
    send('error', {
      command: 'clip:save',
      message: 'Selected clip is empty'
    })
    return null
  }

  if (data.byteLength > clipMaxBytes) {
    send('error', {
      command: 'clip:save',
      message: 'Clip must be 64 MB or smaller'
    })
    return null
  }

  const dir = clipRoomDir(command.roomCode)
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(clipFilePath(command.roomCode, command.clipRef, command.mimeType), data)

  return {
    caption: command.caption,
    clientId: command.clientId,
    clipRef: command.clipRef,
    durationMs: command.durationMs,
    lastModified: command.lastModified,
    mimeType: command.mimeType,
    size: data.byteLength,
    title: command.title
  }
}

async function loadLocalChant(roomCode, fileId) {
  const safeFileId = safeFilePart(fileId)
  const data = await fs.readFile(chantFilePath(roomCode, safeFileId))
  if (data.byteLength > chantMaxBytes) throw new Error('Chant audio is too large')
  return { data, fileId: safeFileId }
}

async function loadLocalChatMedia(roomCode, mediaRef, kind, mimeType) {
  const cleanRef = safeFilePart(mediaRef)
  const data = await fs.readFile(chatMediaFilePath(roomCode, cleanRef, kind, mimeType))
  if (data.byteLength > chatMediaMaxBytes(kind)) throw new Error('Chat media is too large')
  return { data, mediaRef: cleanRef }
}

async function loadLocalClip(roomCode, clipRef, mimeType) {
  const filePath = clipFilePath(roomCode, clipRef, mimeType)
  const data = await fs.readFile(filePath)
  if (data.byteLength > clipMaxBytes) throw new Error('Clip video is too large')
  return { data, filePath }
}

function sendLoadedChant({ data, eventId, fileId, mimeType }) {
  send('chant:loaded', {
    eventId: eventId.slice(0, 96),
    dataUrl: `data:${mimeType};base64,${b4a.toString(data, 'base64')}`,
    fileId
  })
}

function sendLoadedChatMedia({ data, eventId, kind, mediaRef, mimeType, size }) {
  send('chat-media:loaded', {
    dataUrl: `data:${mimeType};base64,${b4a.toString(data, 'base64')}`,
    eventId: eventId.slice(0, 96),
    kind,
    mediaRef: mediaRef.slice(0, 96),
    mimeType,
    size
  })
}

function sendLoadedClip({ clipRef, eventId, filePath, mimeType, size }) {
  send('clip:loaded', {
    clipRef: clipRef.slice(0, 96),
    eventId: eventId.slice(0, 96),
    filePath,
    mimeType,
    size
  })
}

function requestRemoteChatMedia({ eventId, kind, mediaRef, mimeType, silent = false, size }) {
  if (roomPeers.size === 0) {
    if (!silent) {
      send('error', {
        command: 'chat-media:load',
        message: 'This chat media is not available on this device and no peers are connected'
      })
    }
    return
  }

  const maxBytes = chatMediaMaxBytes(kind)
  if (size > maxBytes) {
    if (!silent) {
      send('error', {
        command: 'chat-media:load',
        message:
          kind === 'image'
            ? 'Image is larger than the 10 MB transfer limit'
            : 'Voice note is larger than the 5 MB transfer limit'
      })
    }
    return
  }

  const requestId = chantRequestId()
  const timeout = setTimeout(
    () => {
      pendingChatMediaRequests.delete(requestId)
      if (!silent) {
        send('error', {
          command: 'chat-media:load',
          message: 'Connected peers do not have this chat media yet'
        })
      }
    },
    kind === 'image' ? 20000 : 10000
  )

  pendingChatMediaRequests.set(requestId, {
    chunks: [],
    eventId,
    kind,
    mediaRef,
    mimeType,
    receivedBytes: 0,
    receivedChunks: 0,
    silent,
    size,
    timeout,
    totalBytes: 0,
    totalChunks: 0
  })

  broadcastChatMediaRequest({
    eventId,
    kind,
    mediaRef,
    mimeType,
    requestId,
    size
  })

  if (!silent) {
    send('sync:status', {
      status: kind === 'image' ? 'Requesting image from peers' : 'Requesting voice note from peers'
    })
  }
}

function requestRemoteChant({ eventId, fileId, mimeType, silent = false }) {
  if (roomPeers.size === 0) {
    if (!silent) {
      send('error', {
        command: 'chant:load',
        message: 'This chant audio is not available on this device and no peers are connected'
      })
    }
    return
  }

  const requestId = chantRequestId()
  const timeout = setTimeout(() => {
    pendingChantRequests.delete(requestId)
    if (!silent) {
      send('error', {
        command: 'chant:load',
        message: 'Connected peers do not have this chant audio yet'
      })
    }
  }, 5000)

  pendingChantRequests.set(requestId, {
    eventId,
    fileId,
    mimeType,
    silent,
    timeout
  })

  broadcastChantRequest({
    eventId,
    fileId,
    mimeType,
    requestId
  })

  if (!silent) {
    send('sync:status', {
      status: 'Requesting chant audio from peers'
    })
  }
}

function requestRemoteClip({ eventId, clipRef, mimeType, size, silent = false }) {
  if (roomPeers.size === 0) {
    if (!silent) {
      send('error', {
        command: 'clip:load',
        message: 'This clip is not available on this device and no peers are connected'
      })
    }
    return
  }

  if (size > clipMaxBytes) {
    if (!silent) {
      send('error', {
        command: 'clip:load',
        message: 'Clip is larger than the 64 MB transfer limit'
      })
    }
    return
  }

  const requestId = chantRequestId()
  const timeout = setTimeout(() => {
    pendingClipRequests.delete(requestId)
    if (!silent) {
      send('error', {
        command: 'clip:load',
        message: 'Connected peers do not have this clip yet'
      })
    }
  }, 45000)

  pendingClipRequests.set(requestId, {
    chunks: [],
    clipRef,
    eventId,
    mimeType,
    receivedBytes: 0,
    receivedChunks: 0,
    silent,
    size,
    timeout,
    totalBytes: 0,
    totalChunks: 0
  })

  broadcastClipRequest({
    clipRef,
    eventId,
    mimeType,
    requestId,
    size
  })

  if (!silent) {
    send('sync:status', {
      status: 'Requesting clip from peers'
    })
  }
}

async function handleChantLoad(command) {
  const room = roomState.state.room
  if (!room) {
    send('error', {
      command: 'chant:load',
      message: 'Join a room before loading a chant'
    })
    return
  }

  if (typeof command.eventId !== 'string' || typeof command.fileId !== 'string') {
    send('error', {
      command: 'chant:load',
      message: 'Chant event id and file id are required'
    })
    return
  }

  try {
    const fileId = safeFilePart(command.fileId)
    const mimeType =
      typeof command.mimeType === 'string' && command.mimeType.trim()
        ? command.mimeType.trim().slice(0, 80)
        : 'audio/webm'
    const { data } = await loadLocalChant(room.code, fileId)

    sendLoadedChant({
      data,
      eventId: command.eventId,
      fileId,
      mimeType
    })
  } catch {
    requestRemoteChant({
      eventId: command.eventId.slice(0, 96),
      fileId: safeFilePart(command.fileId),
      mimeType:
        typeof command.mimeType === 'string' && command.mimeType.trim()
          ? command.mimeType.trim().slice(0, 80)
          : 'audio/webm',
      silent: command.silent === true
    })
  }
}

async function handleChatMediaLoad(command) {
  const room = roomState.state.room
  if (!room) {
    send('error', {
      command: 'chat-media:load',
      message: 'Join a room before loading chat media'
    })
    return
  }

  if (typeof command.eventId !== 'string' || typeof command.mediaRef !== 'string') {
    send('error', {
      command: 'chat-media:load',
      message: 'Chat media event id and reference are required'
    })
    return
  }

  const kind = command.kind === 'image' ? 'image' : command.kind === 'voice' ? 'voice' : null
  if (!kind) {
    send('error', {
      command: 'chat-media:load',
      message: 'Chat media kind is required'
    })
    return
  }

  const mediaRef = safeFilePart(command.mediaRef)
  const mimeType =
    typeof command.mimeType === 'string' && command.mimeType.trim()
      ? command.mimeType.trim().slice(0, 80)
      : kind === 'image'
        ? 'image/jpeg'
        : 'audio/webm'
  const size = Number(command.size)

  try {
    const { data } = await loadLocalChatMedia(room.code, mediaRef, kind, mimeType)
    sendLoadedChatMedia({
      data,
      eventId: command.eventId,
      kind,
      mediaRef,
      mimeType,
      size: data.byteLength
    })
  } catch {
    requestRemoteChatMedia({
      eventId: command.eventId.slice(0, 96),
      kind,
      mediaRef,
      mimeType,
      silent: command.silent === true,
      size: Number.isFinite(size) ? Math.round(size) : chatMediaMaxBytes(kind) + 1
    })
  }
}

async function handleClipLoad(command) {
  const room = roomState.state.room
  if (!room) {
    send('error', {
      command: 'clip:load',
      message: 'Join a room before loading a clip'
    })
    return
  }

  if (typeof command.eventId !== 'string' || typeof command.clipRef !== 'string') {
    send('error', {
      command: 'clip:load',
      message: 'Clip event id and reference are required'
    })
    return
  }

  const clipRef = safeFilePart(command.clipRef)
  const mimeType =
    typeof command.mimeType === 'string' && command.mimeType.trim()
      ? command.mimeType.trim().slice(0, 80)
      : 'video/mp4'
  const size = Number(command.size)

  try {
    const { data, filePath } = await loadLocalClip(room.code, clipRef, mimeType)
    sendLoadedClip({
      clipRef,
      eventId: command.eventId,
      filePath,
      mimeType,
      size: data.byteLength
    })
  } catch {
    requestRemoteClip({
      clipRef,
      eventId: command.eventId.slice(0, 96),
      mimeType,
      silent: command.silent === true,
      size: Number.isFinite(size) ? Math.round(size) : clipMaxBytes + 1
    })
  }
}

async function handlePeerChantRequest(peer, message) {
  const room = roomState.state.room
  if (!room) return
  if (typeof message.requestId !== 'string' || message.requestId.trim() === '') return
  if (typeof message.eventId !== 'string' || message.eventId.trim() === '') return
  if (typeof message.fileId !== 'string' || message.fileId.trim() === '') return

  try {
    const fileId = safeFilePart(message.fileId)
    const mimeType =
      typeof message.mimeType === 'string' && message.mimeType.trim()
        ? message.mimeType.trim().slice(0, 80)
        : 'audio/webm'
    const { data } = await loadLocalChant(room.code, fileId)

    sendPeer(peer, {
      type: 'chant:data',
      bytesBase64: b4a.toString(data, 'base64'),
      eventId: message.eventId.slice(0, 96),
      fileId,
      mimeType,
      requestId: message.requestId.slice(0, 96),
      size: data.byteLength
    })
  } catch {
    // This peer may only have the metadata. Another peer can still answer.
  }
}

async function handlePeerChantData(message) {
  const room = roomState.state.room
  if (!room) return
  if (typeof message.requestId !== 'string') return

  const requestId = message.requestId.slice(0, 96)
  const pending = pendingChantRequests.get(requestId)
  if (!pending) return

  if (typeof message.bytesBase64 !== 'string') return
  if (typeof message.fileId !== 'string' || safeFilePart(message.fileId) !== pending.fileId) return

  const maxBase64Chars = Math.ceil(chantMaxBytes * 1.4)
  if (message.bytesBase64.length > maxBase64Chars) return

  const data = b4a.from(message.bytesBase64, 'base64')
  const announcedSize = Number(message.size)
  if (data.byteLength < 256 || data.byteLength > chantMaxBytes) return
  if (Number.isFinite(announcedSize) && announcedSize !== data.byteLength) return

  clearTimeout(pending.timeout)
  pendingChantRequests.delete(requestId)

  try {
    await fs.mkdir(chantRoomDir(room.code), { recursive: true })
    await fs.writeFile(chantFilePath(room.code, pending.fileId), data)
  } catch (err) {
    send('error', {
      command: 'chant:cache',
      message: err.message || 'Could not cache chant audio locally'
    })
  }

  sendLoadedChant({
    data,
    eventId: pending.eventId,
    fileId: pending.fileId,
    mimeType: pending.mimeType
  })

  send('sync:status', {
    status: `P2P connected: ${roomPeers.size} peer${roomPeers.size === 1 ? '' : 's'}`
  })
}

async function handlePeerChatMediaRequest(peer, message) {
  const room = roomState.state.room
  if (!room) return
  if (typeof message.requestId !== 'string' || message.requestId.trim() === '') return
  if (typeof message.eventId !== 'string' || message.eventId.trim() === '') return
  if (typeof message.mediaRef !== 'string' || message.mediaRef.trim() === '') return

  const kind = message.kind === 'image' ? 'image' : message.kind === 'voice' ? 'voice' : null
  if (!kind) return

  const mediaRef = safeFilePart(message.mediaRef)
  const mimeType =
    typeof message.mimeType === 'string' && message.mimeType.trim()
      ? message.mimeType.trim().slice(0, 80)
      : kind === 'image'
        ? 'image/jpeg'
        : 'audio/webm'

  try {
    const { data } = await loadLocalChatMedia(room.code, mediaRef, kind, mimeType)
    const totalChunks = Math.ceil(data.byteLength / clipChunkBytes)
    const requestId = message.requestId.slice(0, 96)

    sendPeer(peer, {
      type: 'chat-media:data:start',
      eventId: message.eventId.slice(0, 96),
      kind,
      mediaRef,
      mimeType,
      requestId,
      totalBytes: data.byteLength,
      totalChunks
    })

    for (let index = 0; index < totalChunks; index += 1) {
      const start = index * clipChunkBytes
      const chunk = data.subarray(start, Math.min(start + clipChunkBytes, data.byteLength))
      sendPeer(peer, {
        type: 'chat-media:data:chunk',
        bytesBase64: b4a.toString(chunk, 'base64'),
        index,
        requestId
      })
      if (index % 16 === 0) await Promise.resolve()
    }

    sendPeer(peer, {
      type: 'chat-media:data:end',
      requestId
    })
  } catch {
    // This peer may only have the event. Another connected peer can still answer.
  }
}

function handlePeerChatMediaDataStart(message) {
  if (typeof message.requestId !== 'string') return
  const requestId = message.requestId.slice(0, 96)
  const pending = pendingChatMediaRequests.get(requestId)
  if (!pending) return
  if (safeFilePart(message.mediaRef) !== pending.mediaRef) return
  if (message.kind !== pending.kind) return

  const totalBytes = Number(message.totalBytes)
  const totalChunks = Number(message.totalChunks)
  const maxBytes = chatMediaMaxBytes(pending.kind)
  if (!Number.isFinite(totalBytes) || totalBytes < 1 || totalBytes > maxBytes) return
  if (!Number.isInteger(totalChunks) || totalChunks < 1) return
  if (totalChunks > Math.ceil(totalBytes / clipChunkBytes) + 1) return

  pending.chunks = new Array(totalChunks)
  pending.receivedBytes = 0
  pending.receivedChunks = 0
  pending.totalBytes = Math.round(totalBytes)
  pending.totalChunks = totalChunks
}

function handlePeerChatMediaDataChunk(message) {
  if (typeof message.requestId !== 'string') return
  const requestId = message.requestId.slice(0, 96)
  const pending = pendingChatMediaRequests.get(requestId)
  if (!pending || pending.totalChunks < 1) return
  if (typeof message.bytesBase64 !== 'string') return
  if (message.bytesBase64.length > Math.ceil(clipChunkBytes * 1.4)) return

  const index = Number(message.index)
  if (!Number.isInteger(index) || index < 0 || index >= pending.totalChunks) return
  if (pending.chunks[index]) return

  const chunk = b4a.from(message.bytesBase64, 'base64')
  if (chunk.byteLength < 1 || chunk.byteLength > clipChunkBytes) return
  if (pending.receivedBytes + chunk.byteLength > chatMediaMaxBytes(pending.kind)) return

  pending.chunks[index] = chunk
  pending.receivedBytes += chunk.byteLength
  pending.receivedChunks += 1
}

async function handlePeerChatMediaDataEnd(message) {
  const room = roomState.state.room
  if (!room) return
  if (typeof message.requestId !== 'string') return

  const requestId = message.requestId.slice(0, 96)
  const pending = pendingChatMediaRequests.get(requestId)
  if (!pending) return
  if (pending.receivedChunks !== pending.totalChunks) return
  if (pending.receivedBytes !== pending.totalBytes) return

  clearTimeout(pending.timeout)
  pendingChatMediaRequests.delete(requestId)

  const data = b4a.concat(pending.chunks)
  if (data.byteLength !== pending.totalBytes || data.byteLength > chatMediaMaxBytes(pending.kind)) {
    return
  }

  try {
    await fs.mkdir(chatMediaRoomDir(room.code), { recursive: true })
    await fs.writeFile(
      chatMediaFilePath(room.code, pending.mediaRef, pending.kind, pending.mimeType),
      data
    )
  } catch (err) {
    send('error', {
      command: 'chat-media:cache',
      message: err.message || 'Could not cache chat media locally'
    })
    return
  }

  sendLoadedChatMedia({
    data,
    eventId: pending.eventId,
    kind: pending.kind,
    mediaRef: pending.mediaRef,
    mimeType: pending.mimeType,
    size: data.byteLength
  })

  send('sync:status', {
    status: `P2P connected: ${roomPeers.size} peer${roomPeers.size === 1 ? '' : 's'}`
  })
}

async function handlePeerClipRequest(peer, message) {
  const room = roomState.state.room
  if (!room) return
  if (typeof message.requestId !== 'string' || message.requestId.trim() === '') return
  if (typeof message.eventId !== 'string' || message.eventId.trim() === '') return
  if (typeof message.clipRef !== 'string' || message.clipRef.trim() === '') return

  const clipRef = safeFilePart(message.clipRef)
  const mimeType =
    typeof message.mimeType === 'string' && message.mimeType.trim()
      ? message.mimeType.trim().slice(0, 80)
      : 'video/mp4'

  try {
    const { data } = await loadLocalClip(room.code, clipRef, mimeType)
    const totalChunks = Math.ceil(data.byteLength / clipChunkBytes)
    const requestId = message.requestId.slice(0, 96)

    sendPeer(peer, {
      type: 'clip:data:start',
      clipRef,
      eventId: message.eventId.slice(0, 96),
      mimeType,
      requestId,
      totalBytes: data.byteLength,
      totalChunks
    })

    for (let index = 0; index < totalChunks; index += 1) {
      const start = index * clipChunkBytes
      const chunk = data.subarray(start, Math.min(start + clipChunkBytes, data.byteLength))
      sendPeer(peer, {
        type: 'clip:data:chunk',
        bytesBase64: b4a.toString(chunk, 'base64'),
        index,
        requestId
      })
      if (index % 16 === 0) await Promise.resolve()
    }

    sendPeer(peer, {
      type: 'clip:data:end',
      requestId
    })
  } catch {
    // This peer may only have metadata. Another connected peer can still answer.
  }
}

function handlePeerClipDataStart(message) {
  if (typeof message.requestId !== 'string') return
  const requestId = message.requestId.slice(0, 96)
  const pending = pendingClipRequests.get(requestId)
  if (!pending) return
  if (safeFilePart(message.clipRef) !== pending.clipRef) return

  const totalBytes = Number(message.totalBytes)
  const totalChunks = Number(message.totalChunks)
  if (!Number.isFinite(totalBytes) || totalBytes < 1 || totalBytes > clipMaxBytes) return
  if (!Number.isInteger(totalChunks) || totalChunks < 1) return
  if (totalChunks > Math.ceil(totalBytes / clipChunkBytes) + 1) return

  pending.chunks = new Array(totalChunks)
  pending.receivedBytes = 0
  pending.receivedChunks = 0
  pending.totalBytes = Math.round(totalBytes)
  pending.totalChunks = totalChunks
}

function handlePeerClipDataChunk(message) {
  if (typeof message.requestId !== 'string') return
  const requestId = message.requestId.slice(0, 96)
  const pending = pendingClipRequests.get(requestId)
  if (!pending || pending.totalChunks < 1) return
  if (typeof message.bytesBase64 !== 'string') return
  if (message.bytesBase64.length > Math.ceil(clipChunkBytes * 1.4)) return

  const index = Number(message.index)
  if (!Number.isInteger(index) || index < 0 || index >= pending.totalChunks) return
  if (pending.chunks[index]) return

  const chunk = b4a.from(message.bytesBase64, 'base64')
  if (chunk.byteLength < 1 || chunk.byteLength > clipChunkBytes) return
  if (pending.receivedBytes + chunk.byteLength > clipMaxBytes) return

  pending.chunks[index] = chunk
  pending.receivedBytes += chunk.byteLength
  pending.receivedChunks += 1
}

async function handlePeerClipDataEnd(message) {
  const room = roomState.state.room
  if (!room) return
  if (typeof message.requestId !== 'string') return

  const requestId = message.requestId.slice(0, 96)
  const pending = pendingClipRequests.get(requestId)
  if (!pending) return
  if (pending.receivedChunks !== pending.totalChunks) return
  if (pending.receivedBytes !== pending.totalBytes) return

  clearTimeout(pending.timeout)
  pendingClipRequests.delete(requestId)

  const data = b4a.concat(pending.chunks)
  if (data.byteLength !== pending.totalBytes || data.byteLength > clipMaxBytes) return

  const filePath = clipFilePath(room.code, pending.clipRef, pending.mimeType)
  try {
    await fs.mkdir(clipRoomDir(room.code), { recursive: true })
    await fs.writeFile(filePath, data)
  } catch (err) {
    send('error', {
      command: 'clip:cache',
      message: err.message || 'Could not cache clip locally'
    })
    return
  }

  sendLoadedClip({
    clipRef: pending.clipRef,
    eventId: pending.eventId,
    filePath,
    mimeType: pending.mimeType,
    size: data.byteLength
  })

  send('sync:status', {
    status: `P2P connected: ${roomPeers.size} peer${roomPeers.size === 1 ? '' : 's'}`
  })
}

async function handlePeerMessage(peer, message) {
  const room = roomState.state.room
  if (simulatedOffline) return
  if (!room || !message || typeof message !== 'object' || message.room !== room.code) return

  if (message.type === 'identity') {
    if (typeof message.nickname === 'string' && message.nickname.trim()) {
      peer.nickname = message.nickname.trim().slice(0, 24)
    }

    await handlePeerIdentity(peer, message.echo)
    return
  }

  if (message.type === 'echo:refresh') {
    await echoTimeline.refresh()
    sendPeerSnapshot(peer)
    return
  }

  if (message.type === 'event:announce') {
    const eventId = typeof message.event?.id === 'string' ? message.event.id.slice(0, 96) : ''
    const addedEvent = roomState.addRemoteEvent(message.event)
    if (eventId) {
      sendPeer(peer, {
        type: 'event:ack',
        eventId
      })
    }
    if (addedEvent) broadcastRoomEvent(addedEvent, peer.id)
  }

  if (message.type === 'event:ack') {
    acknowledgePendingSync(message.eventId)
    return
  }

  if (message.type === 'chant:request') {
    await handlePeerChantRequest(peer, message)
    return
  }

  if (message.type === 'chant:data') {
    await handlePeerChantData(message)
    return
  }

  if (message.type === 'chat-media:request') {
    await handlePeerChatMediaRequest(peer, message)
    return
  }

  if (message.type === 'chat-media:data:start') {
    handlePeerChatMediaDataStart(message)
    return
  }

  if (message.type === 'chat-media:data:chunk') {
    handlePeerChatMediaDataChunk(message)
    return
  }

  if (message.type === 'chat-media:data:end') {
    await handlePeerChatMediaDataEnd(message)
    return
  }

  if (message.type === 'clip:request') {
    await handlePeerClipRequest(peer, message)
    return
  }

  if (message.type === 'clip:data:start') {
    handlePeerClipDataStart(message)
    return
  }

  if (message.type === 'clip:data:chunk') {
    handlePeerClipDataChunk(message)
    return
  }

  if (message.type === 'clip:data:end') {
    await handlePeerClipDataEnd(message)
  }
}

async function handlePeerIdentity(peer, echo) {
  const peerBaseKey = normalizeKeyHex(echo?.baseKey)
  const peerWriterKey = normalizeKeyHex(echo?.writerKey)
  const localIdentity = echoTimeline.getIdentity()
  const localBaseKey = normalizeKeyHex(localIdentity.baseKey)

  if (!peerBaseKey || !peerWriterKey || !localBaseKey) return

  peer.baseKey = peerBaseKey
  peer.writerKey = peerWriterKey

  const chosenBaseKey = chooseBaseKey(localBaseKey, peerBaseKey)
  if (chosenBaseKey !== localBaseKey) {
    await echoTimeline.adoptBase(chosenBaseKey)
    sendAllPeerSnapshots()
    await echoTimeline.refresh()
    return
  }

  if (peerBaseKey !== localBaseKey) {
    sendPeerSnapshot(peer)
    return
  }

  const addedWriter = await echoTimeline.addWriter(peerWriterKey)
  if (addedWriter) {
    sendPeerSnapshot(peer)
    await echoTimeline.refresh()
  }
}

function closeRoomPeer(peer) {
  if (peer.closed) return
  peer.closed = true
  roomPeers.delete(peer.id)
  inflightSyncEventIds.clear()
  if (peer.channel) peer.channel.close()
  peer.connection.destroy()
  updateRoomPeerStatus()
}

function handleRoomConnection(connection, peerInfo) {
  if (simulatedOffline || !roomState.state.room) {
    connection.destroy()
    return
  }

  const id = peerIdFor(connection, peerInfo)
  const existing = roomPeers.get(id)
  if (existing) closeRoomPeer(existing)

  const peer = {
    id,
    nickname: '',
    baseKey: null,
    writerKey: null,
    connection,
    channel: null,
    controlMessage: null,
    closed: false
  }

  const mux = Protomux.from(connection)
  echoTimeline.replicate(mux)

  peer.channel = mux.createChannel({
    protocol: roomControlProtocol,
    id: roomTopic,
    onopen() {
      sendPeerSnapshot(peer)
      flushPendingSyncEvents()
    },
    onclose() {
      closeRoomPeer(peer)
    }
  })

  if (!peer.channel) {
    connection.destroy()
    return
  }

  peer.controlMessage = peer.channel.addMessage({
    encoding: c.json,
    onmessage(message) {
      handlePeerMessage(peer, message).catch((err) => {
        send('error', {
          command: 'peer:message',
          message: err.message || 'Could not handle peer message'
        })
      })
    }
  })

  roomPeers.set(id, peer)
  peer.channel.open()
  connection.on('close', () => closeRoomPeer(peer))

  updateRoomPeerStatus()
  echoTimeline.refresh().catch(() => {})
}

function joinRoomNetwork(room) {
  leaveRoomNetwork()
  if (simulatedOffline) {
    send('sync:status', { status: 'Offline demo: local only' })
    sendOfflineState()
    return
  }

  startEchoRefresh()

  roomTopic = topicForRoom(room.code)
  const roomDiscovery = roomSwarm.join(roomTopic, {
    client: true,
    server: true
  })

  send('sync:status', { status: 'Finding P2P peers' })

  roomDiscovery
    .flushed()
    .then(() => {
      if (roomState.state.room?.code === room.code && roomPeers.size === 0) {
        send('sync:status', { status: 'Searching for peers' })
      }
      flushPendingSyncEvents()
    })
    .catch((err) => {
      send('error', {
        command: 'room:join',
        message: err.message || 'Could not announce room'
      })
    })
}

function leaveRoomNetwork() {
  stopEchoRefresh()
  clearPendingChantRequests()
  clearPendingChatMediaRequests()
  clearPendingClipRequests()

  if (roomTopic) {
    roomSwarm.leave(roomTopic).catch((err) => {
      console.error('Failed to leave room topic:', err)
    })
  }

  for (const peer of Array.from(roomPeers.values())) closeRoomPeer(peer)
  roomTopic = null
  send('peer:count', { count: 0 })
}

roomSwarm.on('connection', handleRoomConnection)
roomSwarm.on('update', updateRoomPeerStatus)

goodbye(async () => {
  stopEchoRefresh()
  await echoTimeline.closeRoom()
  await legacyEventLog.closeRoom()
  await roomSwarm.destroy()
  await swarm.destroy()
  await pear.close()
  await store.close()
})

pipe.on('data', async (data) => {
  const message = data.toString()
  if (message === 'pear:applyUpdate') {
    await pear.updater.applyUpdate()
    pipe.write('pear:updateApplied')
    return
  }

  let command = null
  try {
    command = JSON.parse(message)
  } catch {
    console.log(message)
    return
  }

  if (!command || typeof command !== 'object') {
    send('error', {
      command: 'unknown',
      message: 'Command must be a JSON object'
    })
    return
  }

  if (typeof command.type !== 'string' || command.type.trim() === '') {
    send('error', {
      command: 'unknown',
      message: 'Command type is required'
    })
    return
  }

  try {
    if (command.type === 'offline:set') {
      await setSimulatedOffline(command.enabled)
      return
    }

    if (command.type === 'chant:load') {
      await handleChantLoad(command)
      return
    }

    if (command.type === 'chat-media:load') {
      await handleChatMediaLoad(command)
      return
    }

    if (command.type === 'clip:load') {
      await handleClipLoad(command)
      return
    }

    await roomState.handleCommand(command)
  } catch (err) {
    send('error', {
      command: command.type,
      message: err.message || 'Worker command failed'
    })
  }
})

send('app:ready', {
  syncStatus: 'Worker ready'
})
