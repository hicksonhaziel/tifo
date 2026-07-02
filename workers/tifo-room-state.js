function createTifoRoomState(options = {}) {
  const send = options.send
  const now = options.now || Date.now
  const random = options.random || Math.random
  const onJoinRoom = options.onJoinRoom || noop
  const onLeaveRoom = options.onLeaveRoom || noop
  const onLocalEvent = options.onLocalEvent || noop
  const onRemoteEvent = options.onRemoteEvent || noop
  const onChantSave = options.onChantSave || noop
  const onChatMediaSave = options.onChatMediaSave || noop
  const onClipSave = options.onClipSave || noop

  if (typeof send !== 'function') {
    throw new TypeError('send function is required')
  }

  const state = {
    profile: {
      nickname: ''
    },
    room: null,
    events: [],
    seenEventIds: new Set()
  }

  function noop() {}

  function roomTitle(roomCode) {
    return roomCode.trim().replace(/-/g, ' ').replace(/\s+/g, ' ').toUpperCase()
  }

  function createEvent(type, payload) {
    const createdAt = now()
    return {
      id: `${createdAt.toString(36)}-${random().toString(36).slice(2)}`,
      type,
      sender: state.profile.nickname || 'Local fan',
      timestamp: createdAt,
      room: state.room?.code || null,
      payload,
      status: 'local',
      localCreatedAt: createdAt,
      version: 1
    }
  }

  function addEvent(type, payload) {
    const event = createEvent(type, payload)
    state.seenEventIds.add(event.id)
    state.events.unshift(event)
    send('event:added', { event })
    onLocalEvent(event)
    return event
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

  async function handleRoomJoin(command) {
    const nickname = requireString(command.type, command.nickname, 'nickname')
    const roomCode = requireString(command.type, command.roomCode, 'roomCode')
    if (!nickname || !roomCode) return

    state.profile.nickname = nickname.slice(0, 24)
    state.room = {
      code: roomCode.slice(0, 32),
      title: roomTitle(roomCode)
    }
    state.events = []
    state.seenEventIds.clear()

    const storedEvents = await onJoinRoom(state.room)
    mergeStoredEvents(storedEvents, { notify: false })

    const event = createEvent('system', {
      text: `${state.profile.nickname} entered ${state.room.title}`
    })
    state.seenEventIds.add(event.id)
    state.events.unshift(event)

    send('room:joined', {
      profile: state.profile,
      room: state.room,
      peerCount: 0,
      syncStatus: 'Local worker preview',
      events: sortedEvents()
    })
    send('peer:count', { count: 0 })
    send('sync:status', { status: 'Local worker preview' })
  }

  async function handleRoomLeave() {
    const previousRoom = state.room
    state.room = null
    state.events = []
    state.seenEventIds.clear()
    send('room:left', {
      syncStatus: 'Worker ready',
      events: []
    })
    send('peer:count', { count: 0 })
    await onLeaveRoom(previousRoom)
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

  async function handleChantSave(command) {
    if (!requireRoom(command.type)) return

    const clientId = requireString(command.type, command.clientId, 'clientId')
    const mimeType = requireString(command.type, command.mimeType, 'mimeType')
    const bytesBase64 = requireString(command.type, command.bytesBase64, 'bytesBase64')
    if (!clientId || !mimeType || !bytesBase64) return

    const durationMs = Number(command.durationMs)
    if (!Number.isFinite(durationMs) || durationMs < 2500 || durationMs > 11000) {
      sendError(command.type, 'Chant must be 3 to 10 seconds')
      return
    }

    const payload = await onChantSave({
      bytesBase64,
      clientId: clientId.slice(0, 80),
      durationMs: Math.round(durationMs),
      mimeType: mimeType.slice(0, 80),
      roomCode: state.room.code
    })

    if (!payload) return
    addEvent('chant', payload)
  }

  async function handleChatMediaSave(command) {
    if (!requireRoom(command.type)) return

    const payload = sanitizeChatMediaPayload(command)
    if (!payload) {
      sendError(command.type, 'Chat media is not valid')
      return
    }

    const savedPayload = await onChatMediaSave({
      ...payload,
      bytesBase64:
        typeof command.bytesBase64 === 'string' && command.bytesBase64.trim()
          ? command.bytesBase64.trim()
          : '',
      localPath: typeof command.localPath === 'string' ? command.localPath.trim() : '',
      roomCode: state.room.code
    })

    if (!savedPayload) return
    addEvent('chat-media', savedPayload)
  }

  async function handleClipSave(command) {
    if (!requireRoom(command.type)) return

    const payload = sanitizeClipPayload(command)
    if (!payload) {
      sendError(command.type, 'Clip metadata is not valid')
      return
    }

    const savedPayload = await onClipSave({
      ...payload,
      localPath: typeof command.localPath === 'string' ? command.localPath.trim() : '',
      roomCode: state.room.code
    })

    if (!savedPayload) return
    addEvent('clip', savedPayload)
  }

  function handleEchoReplay(command) {
    if (!requireRoom(command.type)) return

    const playableEvents = state.events.filter((event) => event.type !== 'system')
    if (playableEvents.length === 0) {
      sendError(command.type, 'Add a terrace event before replaying Echo')
      return
    }

    send('echo:replay', {
      eventCount: playableEvents.length
    })
  }

  async function handleCommand(command) {
    switch (command.type) {
      case 'profile:set':
        handleProfileSet(command)
        break
      case 'room:join':
        await handleRoomJoin(command)
        break
      case 'room:leave':
        await handleRoomLeave(command)
        break
      case 'chat:send':
        handleChatSend(command)
        break
      case 'reaction:send':
        handleReactionSend(command)
        break
      case 'chant:save':
        await handleChantSave(command)
        break
      case 'chat-media:save':
        await handleChatMediaSave(command)
        break
      case 'clip:save':
        await handleClipSave(command)
        break
      case 'echo:replay':
        handleEchoReplay(command)
        break
      default:
        sendError(command.type || 'unknown', `Unknown command: ${command.type || 'missing type'}`)
    }
  }

  function sanitizeRemotePayload(event) {
    const payload =
      event && typeof event.payload === 'object' && event.payload !== null ? event.payload : {}

    if (event.type === 'chat') {
      if (typeof payload.text !== 'string' || payload.text.trim() === '') return null
      return {
        text: payload.text.trim().slice(0, 180)
      }
    }

    if (event.type === 'reaction') {
      if (typeof payload.type !== 'string' || typeof payload.label !== 'string') return null
      return {
        type: payload.type.trim().slice(0, 32),
        label: payload.label.trim().slice(0, 48)
      }
    }

    if (event.type === 'system') {
      if (typeof payload.text !== 'string' || payload.text.trim() === '') return null
      return {
        text: payload.text.trim().slice(0, 180)
      }
    }

    if (event.type === 'chant') {
      if (typeof payload.fileId !== 'string' || payload.fileId.trim() === '') return null
      if (typeof payload.mimeType !== 'string' || payload.mimeType.trim() === '') return null
      const durationMs = Number(payload.durationMs)
      const size = Number(payload.size)
      if (!Number.isFinite(durationMs) || durationMs < 1000 || durationMs > 12000) return null
      if (!Number.isFinite(size) || size < 1) return null

      return {
        clientId:
          typeof payload.clientId === 'string' ? payload.clientId.trim().slice(0, 80) : null,
        durationMs: Math.round(durationMs),
        fileId: payload.fileId.trim().slice(0, 120),
        mimeType: payload.mimeType.trim().slice(0, 80),
        size: Math.round(size)
      }
    }

    if (event.type === 'chat-media') return sanitizeChatMediaPayload(payload)

    if (event.type === 'clip') return sanitizeClipPayload(payload)

    return null
  }

  function sanitizeChatMediaPayload(payload) {
    if (!payload || typeof payload !== 'object') return null

    const kind = payload.kind === 'image' ? 'image' : payload.kind === 'voice' ? 'voice' : null
    if (!kind) return null
    if (typeof payload.mediaRef !== 'string' || payload.mediaRef.trim() === '') return null

    const size = Number(payload.size)
    const maxBytes = kind === 'image' ? 10 * 1024 * 1024 : 5 * 1024 * 1024
    if (!Number.isFinite(size) || size < 1 || size > maxBytes) return null

    const mimeType =
      typeof payload.mimeType === 'string' && payload.mimeType.trim()
        ? payload.mimeType.trim().slice(0, 80)
        : kind === 'image'
          ? 'image/jpeg'
          : 'audio/webm'

    if (kind === 'image' && !/^image\/(png|jpe?g|webp|gif)$/i.test(mimeType)) return null
    if (kind === 'voice' && !/^audio\//i.test(mimeType)) return null

    const durationMs = Number(payload.durationMs)
    const width = Number(payload.width)
    const height = Number(payload.height)

    return {
      caption: typeof payload.caption === 'string' ? payload.caption.trim().slice(0, 140) : '',
      clientId: typeof payload.clientId === 'string' ? payload.clientId.trim().slice(0, 80) : null,
      durationMs:
        kind === 'voice' && Number.isFinite(durationMs) && durationMs >= 0
          ? Math.round(durationMs)
          : null,
      height: kind === 'image' && Number.isFinite(height) && height > 0 ? Math.round(height) : null,
      kind,
      mediaRef: payload.mediaRef.trim().slice(0, 96),
      mimeType,
      size: Math.round(size),
      width: kind === 'image' && Number.isFinite(width) && width > 0 ? Math.round(width) : null
    }
  }

  function sanitizeClipPayload(payload) {
    if (!payload || typeof payload !== 'object') return null
    if (typeof payload.clipRef !== 'string' || payload.clipRef.trim() === '') return null

    const size = Number(payload.size)
    if (!Number.isFinite(size) || size < 1 || size > 64 * 1024 * 1024) return null

    const durationMs = Number(payload.durationMs)
    const cleanDurationMs =
      Number.isFinite(durationMs) && durationMs >= 0 && durationMs <= 5 * 60 * 1000
        ? Math.round(durationMs)
        : null
    if (cleanDurationMs === null) return null

    const lastModified = Number(payload.lastModified)
    const title =
      typeof payload.title === 'string' && payload.title.trim()
        ? payload.title.trim().slice(0, 80)
        : 'Highlight clip'

    return {
      caption: typeof payload.caption === 'string' ? payload.caption.trim().slice(0, 140) : '',
      clientId: typeof payload.clientId === 'string' ? payload.clientId.trim().slice(0, 80) : null,
      clipRef: payload.clipRef.trim().slice(0, 96),
      durationMs: cleanDurationMs,
      lastModified: Number.isFinite(lastModified) ? Math.round(lastModified) : null,
      mimeType:
        typeof payload.mimeType === 'string' && payload.mimeType.trim()
          ? payload.mimeType.trim().slice(0, 80)
          : 'video/mp4',
      size: Math.round(size),
      title
    }
  }

  function addRemoteEvent(event) {
    if (!state.room || !event || typeof event !== 'object') return null
    if (typeof event.id !== 'string' || event.id.trim() === '') return null
    if (state.seenEventIds.has(event.id)) return null
    if (event.room !== state.room.code) return null

    const payload = sanitizeRemotePayload(event)
    if (!payload) return null

    const timestamp = Number.isFinite(event.timestamp) ? event.timestamp : now()
    const sender =
      typeof event.sender === 'string' && event.sender.trim() ? event.sender.trim() : 'Remote fan'

    const cleanEvent = {
      id: event.id.slice(0, 96),
      type: event.type,
      sender: sender.slice(0, 24),
      timestamp,
      room: state.room.code,
      payload,
      status: event.status === 'stored' ? 'stored' : 'remote',
      localCreatedAt: Number.isFinite(event.localCreatedAt) ? event.localCreatedAt : now(),
      version: Number.isFinite(event.version) ? event.version : 1
    }

    state.seenEventIds.add(cleanEvent.id)
    state.events.unshift(cleanEvent)
    send('event:added', { event: cleanEvent })
    onRemoteEvent(cleanEvent)
    return cleanEvent
  }

  function mergeStoredEvents(events, opts = {}) {
    if (!Array.isArray(events)) return []

    const added = []
    let changed = false
    for (const event of events) {
      const cleanEvent = cleanStoredEvent(event)
      if (!cleanEvent) continue

      const existingIndex = state.events.findIndex((item) => item.id === cleanEvent.id)
      if (existingIndex >= 0) {
        const previous = state.events[existingIndex]
        const next = {
          ...previous,
          ...cleanEvent
        }
        if (eventListEntrySignature(previous) !== eventListEntrySignature(next)) {
          state.events[existingIndex] = next
          changed = true
        }
        state.seenEventIds.add(cleanEvent.id)
        continue
      }

      if (state.seenEventIds.has(cleanEvent.id)) continue
      state.seenEventIds.add(cleanEvent.id)
      state.events.unshift(cleanEvent)
      added.push(cleanEvent)
    }

    if ((added.length > 0 || changed) && opts.notify !== false) {
      state.events = sortedEvents()
      send('event:list', { events: state.events })
    } else if (added.length > 0 || changed) {
      state.events = sortedEvents()
    }

    return added
  }

  function cleanStoredEvent(event) {
    if (!state.room || !event || typeof event !== 'object') return null
    if (typeof event.id !== 'string' || event.id.trim() === '') return null
    if (event.room !== state.room.code) return null

    const payload = sanitizeRemotePayload(event)
    if (!payload) return null

    return {
      id: event.id.slice(0, 96),
      type: event.type,
      sender:
        typeof event.sender === 'string' && event.sender.trim()
          ? event.sender.trim().slice(0, 24)
          : 'Stored fan',
      timestamp: Number.isFinite(event.timestamp) ? event.timestamp : now(),
      room: state.room.code,
      payload,
      status: event.status || 'stored',
      localCreatedAt: Number.isFinite(event.localCreatedAt) ? event.localCreatedAt : now(),
      version: Number.isFinite(event.version) ? event.version : 1
    }
  }

  function sortedEvents() {
    return [...state.events].sort((left, right) => {
      const timeDelta = right.timestamp - left.timestamp
      if (timeDelta !== 0) return timeDelta
      return right.localCreatedAt - left.localCreatedAt
    })
  }

  function eventListEntrySignature(event) {
    return [
      event.id,
      event.type,
      event.sender,
      event.timestamp,
      event.status,
      event.version,
      JSON.stringify(event.payload)
    ].join(':')
  }

  return {
    addRemoteEvent,
    handleCommand,
    mergeStoredEvents,
    state
  }
}

module.exports = {
  createTifoRoomState
}
