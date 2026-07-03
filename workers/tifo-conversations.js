function createConversationState(options = {}) {
  const now = options.now || Date.now
  const typingTtlMs = options.typingTtlMs || 4500
  const reads = new Map()

  function typingMessage(room, profile, typing = true) {
    if (!room?.code || !profile?.publicKey) return null
    return {
      displayName: profile.displayName || profile.username || 'Fan',
      publicKey: profile.publicKey,
      room: room.code,
      timestamp: now(),
      type: typing ? 'typing:start' : 'typing:stop',
      username: profile.username || ''
    }
  }

  function readMessage(room, profile, readAt = now()) {
    if (!room?.code || !profile?.publicKey) return null
    const cleanReadAt = Number.isFinite(readAt) ? Math.max(0, Math.round(readAt)) : now()
    const key = `${room.code}:${profile.publicKey}`
    const previous = reads.get(key) || 0
    const nextReadAt = Math.max(previous, cleanReadAt)
    reads.set(key, nextReadAt)

    return {
      displayName: profile.displayName || profile.username || 'Fan',
      publicKey: profile.publicKey,
      readAt: nextReadAt,
      room: room.code,
      timestamp: now(),
      type: 'read:state',
      username: profile.username || ''
    }
  }

  function cleanTyping(message) {
    const user = cleanUser(message)
    if (!message || typeof message !== 'object' || !user) return null
    return {
      expiresAt: now() + typingTtlMs,
      room: cleanRoomCode(message.room),
      typing: message.type !== 'typing:stop',
      user
    }
  }

  function cleanRead(message) {
    const user = cleanUser(message)
    if (!message || typeof message !== 'object' || !user) return null
    const readAt = Number(message.readAt)
    return {
      readAt: Number.isFinite(readAt) ? Math.max(0, Math.round(readAt)) : now(),
      room: cleanRoomCode(message.room),
      user
    }
  }

  function cleanUser(message) {
    const publicKey =
      typeof message?.publicKey === 'string' && /^[0-9a-f]{64}$/i.test(message.publicKey.trim())
        ? message.publicKey.trim().toLowerCase()
        : ''
    if (!publicKey) return null

    return {
      displayName:
        typeof message.displayName === 'string' && message.displayName.trim()
          ? message.displayName.trim().slice(0, 24)
          : cleanUsername(message.username) || 'Fan',
      publicKey,
      username: cleanUsername(message.username)
    }
  }

  return {
    cleanRead,
    cleanTyping,
    readMessage,
    typingMessage
  }
}

function cleanUsername(value) {
  return String(value || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 20)
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

module.exports = {
  createConversationState
}
