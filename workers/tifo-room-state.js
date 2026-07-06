const { cleanAvatarDataUrl } = require('./tifo-profile')

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
  const signEvent = options.signEvent || ((event) => event)
  const verifyEvent =
    options.verifyEvent ||
    (() => ({
      reason: 'unsigned',
      verified: false
    }))

  if (typeof send !== 'function') {
    throw new TypeError('send function is required')
  }

  const state = {
    profile: emptyProfile(),
    room: null,
    events: [],
    seenEventIds: new Set()
  }

  function noop() {}

  function roomTitle(roomCode) {
    return roomCode.trim().replace(/-/g, ' ').replace(/\s+/g, ' ').toUpperCase()
  }

  function sanitizeRoom(command) {
    const source = command.room && typeof command.room === 'object' ? command.room : {}
    const roomCode = requireString(command.type, source.code || command.roomCode, 'roomCode')
    if (!roomCode) return null

    const kind =
      source.kind === 'dm'
        ? 'dm'
        : source.kind === 'group' || source.kind === 'private'
          ? 'group'
          : 'match'
    const title =
      kind === 'dm'
        ? cleanDmTitle(source.title || source.peerHandle)
        : typeof source.title === 'string' && source.title.trim()
          ? source.title.trim().replace(/\s+/g, ' ').slice(0, 64)
          : roomTitle(roomCode)
    const topicKey =
      typeof source.topicKey === 'string' && /^[0-9a-f]{64}$/i.test(source.topicKey.trim())
        ? source.topicKey.trim().toLowerCase()
        : ''

    if ((kind === 'group' || kind === 'dm') && !topicKey) {
      sendError(command.type, 'invite secret is required')
      return null
    }

    return {
      avatarDataUrl: cleanAvatarDataUrl(source.avatarDataUrl),
      code: cleanRoomCode(roomCode),
      invite: typeof source.invite === 'string' ? source.invite.trim().slice(0, 1400) : '',
      kind,
      title,
      topicKey
    }
  }

  function emptyProfile() {
    return {
      displayName: '',
      avatarDataUrl: '',
      deviceProof: '',
      devicePublicKey: '',
      identityPublicKey: '',
      nickname: '',
      profileDiscoveryPublicKey: '',
      profileProof: '',
      publicKey: '',
      userId: '',
      username: '',
      verified: false
    }
  }

  function profileDisplayName(profile = state.profile) {
    return profile.displayName || profile.username || profile.nickname || 'Local fan'
  }

  function createEvent(type, payload) {
    const createdAt = now()
    const event = {
      id: `${createdAt.toString(36)}-${random().toString(36).slice(2)}`,
      type,
      sender: profileDisplayName(),
      senderId: state.profile.userId || null,
      senderDeviceKey: state.profile.devicePublicKey || null,
      senderIdentityKey: state.profile.identityPublicKey || state.profile.publicKey || null,
      senderKey: state.profile.identityPublicKey || state.profile.publicKey || null,
      timestamp: createdAt,
      room: state.room?.code || null,
      payload,
      status: 'local',
      localCreatedAt: createdAt,
      version: 1
    }
    const signed = signEvent(event)
    return signed && typeof signed === 'object' ? signed : event
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

  function cleanUsername(value) {
    return String(value || '')
      .trim()
      .replace(/^@+/, '')
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '')
      .slice(0, 20)
  }

  function cleanDmTitle(value) {
    const legacyTitle = String(value || '')
      .trim()
      .replace(/\s+/g, ' ')
      .replace(/^dm\s+with\s+/i, '')
      .replace(/^direct\s+message\s+with\s+/i, '')
      .replace(/^@+/, '')
    const normalizedLegacyTitle = legacyTitle.toLowerCase()
    const username =
      normalizedLegacyTitle === 'dm' || normalizedLegacyTitle === 'direct message'
        ? ''
        : cleanUsername(legacyTitle)
    return displayUsername(username) || 'Direct message'
  }

  function displayUsername(username) {
    const clean = cleanUsername(username)
    if (!clean) return ''
    return clean.slice(0, 1).toUpperCase() + clean.slice(1)
  }

  function cleanDisplayName(value) {
    return String(value || '')
      .trim()
      .replace(/^@+/, '')
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_]/g, '')
      .slice(0, 24)
  }

  function cleanPublicKey(value) {
    const key = typeof value === 'string' ? value.trim().toLowerCase() : ''
    return /^[0-9a-f]{64}$/.test(key) ? key : ''
  }

  function cleanUserId(value) {
    const userId = typeof value === 'string' ? value.trim() : ''
    return /^[a-z0-9_-]{6,48}$/i.test(userId) ? userId : ''
  }

  function cleanBase64(value, maxLength) {
    const raw = typeof value === 'string' ? value.trim() : ''
    return raw && raw.length <= maxLength ? raw : ''
  }

  function cleanSignature(value) {
    const signature = typeof value === 'string' ? value.trim().toLowerCase() : ''
    return /^[0-9a-f]{128}$/.test(signature) ? signature : ''
  }

  function cleanRoomCode(value) {
    return String(value || '')
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 48)
  }

  function actorKeyForEvent(event) {
    return event?.senderKey || event?.senderId || event?.sender || ''
  }

  function actorKeyForProfile(profile) {
    return profile?.publicKey || profile?.userId || profileDisplayName(profile)
  }

  function sameActor(event, profile) {
    const eventActor = actorKeyForEvent(event)
    const profileActor = actorKeyForProfile(profile)
    return !!eventActor && !!profileActor && eventActor === profileActor
  }

  function replyToForCommand(command) {
    const targetId =
      command.replyTo && typeof command.replyTo === 'object'
        ? command.replyTo.id
        : command.replyToId
    const cleanTargetId = typeof targetId === 'string' ? targetId.trim().slice(0, 96) : ''
    if (!cleanTargetId) return null

    const target = state.events.find((event) => event.id === cleanTargetId)
    if (!target || !['chat', 'chat-media'].includes(target.type)) return null

    return replySnapshotForEvent(target)
  }

  function replySnapshotForEvent(event) {
    const kind =
      event.type === 'chat'
        ? 'chat'
        : event.payload?.kind === 'image'
          ? 'image'
          : event.payload?.kind === 'voice'
            ? 'voice'
            : 'media'
    const text =
      kind === 'chat'
        ? event.payload.text
        : kind === 'image'
          ? event.payload.caption || 'Photo'
          : kind === 'voice'
            ? 'Voice note'
            : 'Media'

    return {
      id: event.id.slice(0, 96),
      kind,
      sender: String(event.sender || 'Fan')
        .trim()
        .slice(0, 24),
      text: String(text || '')
        .trim()
        .slice(0, 120)
    }
  }

  function sanitizeReplyTo(value) {
    if (!value || typeof value !== 'object') return null
    const id = typeof value.id === 'string' ? value.id.trim().slice(0, 96) : ''
    if (!id) return null

    const kind = ['chat', 'image', 'voice', 'media'].includes(value.kind) ? value.kind : 'chat'
    const sender =
      typeof value.sender === 'string' && value.sender.trim()
        ? value.sender.trim().slice(0, 24)
        : 'Fan'
    const fallback = kind === 'image' ? 'Photo' : kind === 'voice' ? 'Voice note' : 'Message'
    const text =
      typeof value.text === 'string' && value.text.trim()
        ? value.text.trim().slice(0, 120)
        : fallback

    return {
      id,
      kind,
      sender,
      text
    }
  }

  function sanitizeEmoji(value) {
    const emoji = typeof value === 'string' ? value.trim() : ''
    if (!emoji || emoji.length > 16) return ''
    if (/[\u0000-\u001f\u007f]/.test(emoji)) return ''
    return emoji
  }

  function sanitizeProfile(command) {
    const source =
      command.profile && typeof command.profile === 'object' ? command.profile : command || {}

    const fallbackName =
      typeof command.nickname === 'string'
        ? command.nickname
        : typeof source.nickname === 'string'
          ? source.nickname
          : ''

    const username = cleanUsername(source.username || fallbackName)
    const displayName = cleanDisplayName(source.displayName || fallbackName || username)
    if (!displayName) return null

    return {
      deviceProof: cleanBase64(source.deviceProof, 4096),
      devicePublicKey: cleanPublicKey(source.devicePublicKey),
      displayName,
      avatarDataUrl: cleanAvatarDataUrl(source.avatarDataUrl),
      identityPublicKey: cleanPublicKey(source.identityPublicKey || source.publicKey),
      nickname: displayName,
      profileDiscoveryPublicKey: cleanPublicKey(source.profileDiscoveryPublicKey),
      profileProof: cleanBase64(source.profileProof, 4096),
      publicKey: cleanPublicKey(source.publicKey),
      userId: cleanUserId(source.userId),
      username,
      verified: source.verified === true
    }
  }

  function handleProfileSet(command) {
    const profile = sanitizeProfile(command)
    if (!profile) {
      sendError(command.type, 'profile is required')
      return
    }

    state.profile = profile
  }

  async function handleRoomJoin(command) {
    const profile = sanitizeProfile(command)
    const room = sanitizeRoom(command)
    if (!profile || !room) {
      if (!profile) sendError(command.type, 'profile is required')
      return
    }

    state.profile = profile
    state.room = room
    state.events = []
    state.seenEventIds.clear()

    const storedEvents = await onJoinRoom(state.room, command.cachedEvents)
    mergeStoredEvents(storedEvents, { notify: false })

    const event = createEvent('system', {
      text: `${profileDisplayName()} entered ${state.room.title}`
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

    const payload = {
      text: text.slice(0, 180)
    }
    const replyTo = replyToForCommand(command)
    if (replyTo) payload.replyTo = replyTo

    addEvent('chat', payload)
  }

  function handleChatEdit(command) {
    if (!requireRoom(command.type)) return

    const targetId = requireString(command.type, command.targetId, 'targetId')
    const text = requireString(command.type, command.text, 'text')
    if (!targetId || !text) return

    const target = state.events.find((event) => event.id === targetId)
    if (!target || target.type !== 'chat') {
      sendError(command.type, 'Message was not found')
      return
    }

    if (!sameActor(target, state.profile)) {
      sendError(command.type, 'Only the sender can edit this message')
      return
    }

    addEvent('chat-edit', {
      targetId: targetId.slice(0, 96),
      text: text.slice(0, 180)
    })
  }

  function handleChatDelete(command) {
    if (!requireRoom(command.type)) return

    const targetId = requireString(command.type, command.targetId, 'targetId')
    if (!targetId) return

    const target = state.events.find((event) => event.id === targetId)
    if (!target || !['chat', 'chat-media'].includes(target.type)) {
      sendError(command.type, 'Message was not found')
      return
    }

    if (!sameActor(target, state.profile)) {
      sendError(command.type, 'Only the sender can delete this message')
      return
    }

    addEvent('chat-delete', {
      targetId: targetId.slice(0, 96)
    })
  }

  function handleChatReaction(command) {
    if (!requireRoom(command.type)) return

    const targetId = requireString(command.type, command.targetId, 'targetId')
    const emoji = sanitizeEmoji(command.emoji)
    if (!targetId || !emoji) {
      sendError(command.type, 'emoji reaction is required')
      return
    }

    const target = state.events.find((event) => event.id === targetId)
    if (!target || !['chat', 'chat-media'].includes(target.type)) {
      sendError(command.type, 'Message was not found')
      return
    }

    addEvent('chat-reaction', {
      emoji,
      targetId: targetId.slice(0, 96)
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
    const roomCode = state.room.code

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
      roomCode
    })

    if (state.room?.code !== roomCode) return
    if (!payload) return
    addEvent('chant', payload)
  }

  async function handleChatMediaSave(command) {
    if (!requireRoom(command.type)) return
    const roomCode = state.room.code

    const payload = sanitizeChatMediaPayload(command)
    if (!payload) {
      sendError(command.type, 'Chat media is not valid')
      return
    }
    const replyTo = replyToForCommand(command)
    if (replyTo) payload.replyTo = replyTo

    const savedPayload = await onChatMediaSave({
      ...payload,
      bytesBase64:
        typeof command.bytesBase64 === 'string' && command.bytesBase64.trim()
          ? command.bytesBase64.trim()
          : '',
      localPath: typeof command.localPath === 'string' ? command.localPath.trim() : '',
      roomCode
    })

    if (state.room?.code !== roomCode) return
    if (!savedPayload) return
    addEvent('chat-media', savedPayload)
  }

  async function handleClipSave(command) {
    if (!requireRoom(command.type)) return
    const roomCode = state.room.code

    const payload = sanitizeClipPayload(command)
    if (!payload) {
      sendError(command.type, 'Clip metadata is not valid')
      return
    }

    const savedPayload = await onClipSave({
      ...payload,
      localPath: typeof command.localPath === 'string' ? command.localPath.trim() : '',
      roomCode
    })

    if (state.room?.code !== roomCode) return
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
      case 'chat:edit':
        handleChatEdit(command)
        break
      case 'chat:delete':
        handleChatDelete(command)
        break
      case 'chat:react':
        handleChatReaction(command)
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
      const cleanPayload = {
        text: payload.text.trim().slice(0, 180)
      }
      const replyTo = sanitizeReplyTo(payload.replyTo)
      if (replyTo) cleanPayload.replyTo = replyTo
      return cleanPayload
    }

    if (event.type === 'chat-edit') {
      if (typeof payload.targetId !== 'string' || payload.targetId.trim() === '') return null
      if (typeof payload.text !== 'string' || payload.text.trim() === '') return null
      return {
        targetId: payload.targetId.trim().slice(0, 96),
        text: payload.text.trim().slice(0, 180)
      }
    }

    if (event.type === 'chat-delete') {
      if (typeof payload.targetId !== 'string' || payload.targetId.trim() === '') return null
      return {
        targetId: payload.targetId.trim().slice(0, 96)
      }
    }

    if (event.type === 'chat-reaction') {
      if (typeof payload.targetId !== 'string' || payload.targetId.trim() === '') return null
      const emoji = sanitizeEmoji(payload.emoji)
      if (!emoji) return null
      return {
        emoji,
        targetId: payload.targetId.trim().slice(0, 96)
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

    const cleanPayload = {
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
    const replyTo = sanitizeReplyTo(payload.replyTo)
    if (replyTo) cleanPayload.replyTo = replyTo
    return cleanPayload
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
      ...cleanSignedEventFields(event),
      sender: sender.slice(0, 24),
      senderId: cleanUserId(event.senderId),
      senderKey: cleanPublicKey(event.senderKey || event.senderIdentityKey),
      timestamp,
      room: state.room.code,
      payload,
      status: event.status === 'stored' ? 'stored' : 'remote',
      localCreatedAt: Number.isFinite(event.localCreatedAt) ? event.localCreatedAt : now(),
      version: Number.isFinite(event.version) ? event.version : 1
    }
    applyVerification(cleanEvent)

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
      send('event:list', { events: state.events, room: state.room?.code || '' })
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

    const cleanEvent = {
      id: event.id.slice(0, 96),
      type: event.type,
      ...cleanSignedEventFields(event),
      sender:
        typeof event.sender === 'string' && event.sender.trim()
          ? event.sender.trim().slice(0, 24)
          : 'Stored fan',
      senderId: cleanUserId(event.senderId),
      senderKey: cleanPublicKey(event.senderKey || event.senderIdentityKey),
      timestamp: Number.isFinite(event.timestamp) ? event.timestamp : now(),
      room: state.room.code,
      payload,
      status: event.status || 'stored',
      localCreatedAt: Number.isFinite(event.localCreatedAt) ? event.localCreatedAt : now(),
      version: Number.isFinite(event.version) ? event.version : 1
    }
    applyVerification(cleanEvent)
    return cleanEvent
  }

  function cleanSignedEventFields(event) {
    return {
      eventProof: cleanBase64(event.eventProof, 4096),
      senderDeviceKey: cleanPublicKey(event.senderDeviceKey),
      senderIdentityKey: cleanPublicKey(event.senderIdentityKey || event.senderKey),
      signature: cleanSignature(event.signature),
      signatureVersion: Number.isFinite(event.signatureVersion)
        ? Math.max(0, Math.round(event.signatureVersion))
        : 0
    }
  }

  function applyVerification(event) {
    const result = verifyEvent(event)
    event.verified = result?.verified === true
    event.verificationReason = result?.reason || (event.verified ? 'verified' : 'unsigned')
    if (event.verified && event.senderIdentityKey) event.senderKey = event.senderIdentityKey
    return event
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
      event.senderId,
      event.senderDeviceKey,
      event.senderIdentityKey,
      event.senderKey,
      event.signature,
      event.timestamp,
      event.status,
      event.verified,
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
