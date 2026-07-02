const PearRuntime = require('pear-runtime')
const Hyperswarm = require('hyperswarm')
const Corestore = require('corestore')
const crypto = require('hypercore-crypto')
const goodbye = require('graceful-goodbye')
const FramedStream = require('framed-stream')
const path = require('bare-path')
const b4a = require('b4a')
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
const roomProtocol = 'tifo-room-v1'
let roomTopic = null

const roomState = createTifoRoomState({
  send,
  onJoinRoom: joinRoomNetwork,
  onLeaveRoom: leaveRoomNetwork,
  onLocalEvent: broadcastRoomEvent
})

function topicForRoom(roomCode) {
  return crypto.namespace(`tifo-room:${roomCode.trim().toUpperCase()}`, 1)[0]
}

function peerIdFor(connection, peerInfo) {
  const key = peerInfo?.publicKey || connection.remotePublicKey
  if (key) return b4a.toString(key, 'hex')
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function sendPeer(peer, message) {
  if (peer.closed) return
  peer.stream.write(
    JSON.stringify({
      protocol: roomProtocol,
      ...message
    })
  )
}

function sendPeerSnapshot(peer) {
  const room = roomState.state.room
  if (!room) return

  sendPeer(peer, {
    type: 'hello',
    room: room.code,
    nickname: roomState.state.profile.nickname
  })
  sendPeer(peer, {
    type: 'event:list',
    room: room.code,
    events: roomState.state.events
  })
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

function broadcastRoomMessage(message, exceptPeerId = null) {
  for (const peer of roomPeers.values()) {
    if (peer.id === exceptPeerId) continue
    sendPeer(peer, message)
  }
}

function broadcastRoomEvent(event) {
  if (!roomState.state.room) return

  broadcastRoomMessage({
    type: 'event',
    room: roomState.state.room.code,
    event
  })
}

function handlePeerMessage(peer, data) {
  let message = null
  try {
    message = JSON.parse(data.toString())
  } catch {
    return
  }

  const room = roomState.state.room
  if (!room || message.protocol !== roomProtocol || message.room !== room.code) return

  if (message.type === 'hello') {
    if (typeof message.nickname === 'string' && message.nickname.trim()) {
      peer.nickname = message.nickname.trim().slice(0, 24)
    }
    return
  }

  if (message.type === 'event') {
    const addedEvent = roomState.addRemoteEvent(message.event)
    if (addedEvent) {
      broadcastRoomMessage(
        {
          type: 'event',
          room: room.code,
          event: addedEvent
        },
        peer.id
      )
    }
    return
  }

  if (message.type === 'event:list' && Array.isArray(message.events)) {
    for (const event of message.events) roomState.addRemoteEvent(event)
  }
}

function closeRoomPeer(peer) {
  if (peer.closed) return
  peer.closed = true
  roomPeers.delete(peer.id)
  peer.stream.destroy()
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
    stream: new FramedStream(connection),
    closed: false
  }
  roomPeers.set(id, peer)

  peer.stream.on('data', (data) => handlePeerMessage(peer, data))
  peer.stream.on('error', () => closeRoomPeer(peer))
  peer.stream.on('close', () => closeRoomPeer(peer))
  connection.on('close', () => closeRoomPeer(peer))

  updateRoomPeerStatus()
  sendPeerSnapshot(peer)
}

function joinRoomNetwork(room) {
  leaveRoomNetwork()

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

  roomState.handleCommand(command)
})

send('app:ready', {
  syncStatus: 'Worker ready'
})
