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
let roomTopic = null
let echoRefreshInterval = null
const chantDir = path.join(updaterConfig.dir, 'tifo-chants')
const echoTimeline = new TifoEchoTimeline(store)
const legacyEventLog = new TifoEventLog(store)

const roomState = createTifoRoomState({
  send,
  onJoinRoom: handleJoinRoom,
  onLeaveRoom: handleLeaveRoom,
  onChantSave: handleChantSave,
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

function chantRoomDir(roomCode) {
  return path.join(chantDir, safeFilePart(roomCode.trim().toUpperCase()))
}

function chantFilePath(roomCode, fileId) {
  return path.join(chantRoomDir(roomCode), safeFilePart(fileId))
}

function sendPeer(peer, message) {
  if (peer.closed || !peer.controlMessage) return
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

  for (const peer of roomPeers.values()) {
    if (peer.id === exceptPeerId) continue
    sendPeer(peer, {
      type: 'event:announce',
      event
    })
  }
}

function updateRoomPeerStatus() {
  const count = roomPeers.size
  send('peer:count', { count })

  if (!roomState.state.room) return
  send('sync:status', {
    status:
      count === 0 ? 'Searching for peers' : `P2P connected: ${count} peer${count === 1 ? '' : 's'}`
  })
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
  joinRoomNetwork(room)
  return migratedEvents
}

async function handleLeaveRoom() {
  leaveRoomNetwork()
  await echoTimeline.closeRoom()
}

function handleLocalEvent(event) {
  persistEvent(event)
  broadcastRoomEvent(event)
}

function handleRemoteEvent(event) {
  persistEvent(event)
}

function handleEchoTimelineUpdate(events) {
  roomState.mergeStoredEvents(events)
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

  if (data.byteLength > 2 * 1024 * 1024) {
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
    const data = await fs.readFile(chantFilePath(room.code, fileId))
    const mimeType =
      typeof command.mimeType === 'string' && command.mimeType.trim()
        ? command.mimeType.trim().slice(0, 80)
        : 'audio/webm'

    send('chant:loaded', {
      eventId: command.eventId.slice(0, 96),
      dataUrl: `data:${mimeType};base64,${b4a.toString(data, 'base64')}`,
      fileId
    })
  } catch {
    send('error', {
      command: 'chant:load',
      message: 'This chant audio is not available on this device'
    })
  }
}

async function handlePeerMessage(peer, message) {
  const room = roomState.state.room
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
    const addedEvent = roomState.addRemoteEvent(message.event)
    if (addedEvent) broadcastRoomEvent(addedEvent, peer.id)
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
  if (peer.channel) peer.channel.close()
  peer.connection.destroy()
  updateRoomPeerStatus()
}

function handleRoomConnection(connection, peerInfo) {
  if (!roomState.state.room) {
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
    if (command.type === 'chant:load') {
      await handleChantLoad(command)
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
