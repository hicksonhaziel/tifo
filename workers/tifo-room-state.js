function createTifoRoomState(options = {}) {
  const send = options.send
  const now = options.now || Date.now
  const random = options.random || Math.random

  if (typeof send !== 'function') {
    throw new TypeError('send function is required')
  }

  const state = {
    profile: {
      nickname: ''
    },
    room: null,
    events: []
  }

  function roomTitle(roomCode) {
    return roomCode.trim().replace(/-/g, ' ').replace(/\s+/g, ' ').toUpperCase()
  }

  function createEvent(type, payload) {
    return {
      id: `${now().toString(36)}-${random().toString(36).slice(2)}`,
      type,
      sender: state.profile.nickname || 'Local fan',
      timestamp: now(),
      room: state.room?.code || null,
      payload,
      status: 'local'
    }
  }

  function addEvent(type, payload) {
    const event = createEvent(type, payload)
    state.events.unshift(event)
    send('event:added', { event })
  }

  function sendError(command, message) {
    send('error', {
      command,
      message
    })
  }

  function requireString(command, value, field) {
    if (typeof value !== 'string' || value.trim() === '') {
      sendError(command, `${field} is required`)
      return null
    }

    return value.trim()
  }

  function requireRoom(command) {
    if (state.room) return true
    sendError(command, 'Join a room before using this command')
    return false
  }

  function handleProfileSet(command) {
    const nickname = requireString(command.type, command.nickname, 'nickname')
    if (!nickname) return

    state.profile.nickname = nickname.slice(0, 24)
  }

  function handleRoomJoin(command) {
    const nickname = requireString(command.type, command.nickname, 'nickname')
    const roomCode = requireString(command.type, command.roomCode, 'roomCode')
    if (!nickname || !roomCode) return

    state.profile.nickname = nickname.slice(0, 24)
    state.room = {
      code: roomCode.slice(0, 32),
      title: roomTitle(roomCode)
    }
    state.events = []

    const event = createEvent('system', {
      text: `${state.profile.nickname} entered ${state.room.title}`
    })
    state.events.unshift(event)

    send('room:joined', {
      profile: state.profile,
      room: state.room,
      peerCount: 0,
      syncStatus: 'Local worker preview',
      events: state.events
    })
    send('peer:count', { count: 0 })
    send('sync:status', { status: 'Local worker preview' })
  }

  function handleRoomLeave() {
    state.room = null
    state.events = []
    send('room:left', {
      syncStatus: 'Worker ready',
      events: []
    })
    send('peer:count', { count: 0 })
  }

  function handleChatSend(command) {
    if (!requireRoom(command.type)) return

    const text = requireString(command.type, command.text, 'text')
    if (!text) return

    addEvent('chat', {
      text: text.slice(0, 180)
    })
  }

  function handleReactionSend(command) {
    if (!requireRoom(command.type)) return

    const reactionType = requireString(command.type, command.reactionType, 'reactionType')
    const label = requireString(command.type, command.label, 'label')
    if (!reactionType || !label) return

    addEvent('reaction', {
      type: reactionType.slice(0, 32),
      label: label.slice(0, 48)
    })
  }

  function handleEchoReplay(command) {
    if (!requireRoom(command.type)) return

    const hasEvents = state.events.some((event) => event.type !== 'system')
    if (!hasEvents) {
      sendError(command.type, 'Add a chat or reaction before replaying Echo')
      return
    }

    addEvent('system', {
      text: 'Replay Echo preview queued'
    })
  }

  function handleCommand(command) {
    switch (command.type) {
      case 'profile:set':
        handleProfileSet(command)
        break
      case 'room:join':
        handleRoomJoin(command)
        break
      case 'room:leave':
        handleRoomLeave(command)
        break
      case 'chat:send':
        handleChatSend(command)
        break
      case 'reaction:send':
        handleReactionSend(command)
        break
      case 'echo:replay':
        handleEchoReplay(command)
        break
      default:
        sendError(command.type || 'unknown', `Unknown command: ${command.type || 'missing type'}`)
    }
  }

  return {
    handleCommand,
    state
  }
}

module.exports = {
  createTifoRoomState
}
