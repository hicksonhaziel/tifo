const b4a = require('b4a')
const { cleanAvatarDataUrl } = require('./tifo-profile')

function cleanMatchRoomAnnouncement(room) {
  if (!room || typeof room !== 'object') return null
  const code = cleanPublicRoomCode(room.code)
  if (!code) return null

  const homeName = cleanPublicRoomName(room.homeName || room.home)
  const awayName = cleanPublicRoomName(room.awayName || room.away)
  const title =
    cleanPublicRoomTitle(room.title) ||
    (homeName && awayName ? `${homeName} vs ${awayName}` : code.replace(/-/g, ' '))

  const updatedAt = Number(room.updatedAt || room.createdAt)

  return {
    avatarDataUrl: cleanAvatarDataUrl(room.avatarDataUrl),
    away: cleanPublicTeamCode(room.away || awayName),
    awayName,
    code,
    home: cleanPublicTeamCode(room.home || homeName),
    homeName,
    invite: typeof room.invite === 'string' ? room.invite.trim().slice(0, 1400) : '',
    kind: 'match',
    round: cleanPublicRoomTitle(room.round || room.region || room.detail) || 'Match room',
    title,
    updatedAt: Number.isFinite(updatedAt) ? Math.max(0, Math.round(updatedAt)) : 0
  }
}

function roomMetadataForPeer(room) {
  if (!room || room.kind !== 'group') return null
  return {
    avatarDataUrl: cleanAvatarDataUrl(room.avatarDataUrl),
    code: room.code,
    invite: typeof room.invite === 'string' ? room.invite.trim().slice(0, 1400) : '',
    kind: room.kind,
    title:
      typeof room.title === 'string' ? room.title.trim().replace(/\s+/g, ' ').slice(0, 64) : '',
    topicKey: typeof room.topicKey === 'string' ? room.topicKey.trim().toLowerCase() : ''
  }
}

function roomMetadataFromPeer(currentRoom, metadata) {
  if (!currentRoom || !metadata || typeof metadata !== 'object') return null
  if (currentRoom.kind !== 'group') return null
  if (metadata.kind !== currentRoom.kind) return null
  if (metadata.code !== currentRoom.code) return null

  const topicKey =
    typeof metadata.topicKey === 'string' ? metadata.topicKey.trim().toLowerCase() : ''
  if (currentRoom.topicKey && topicKey && topicKey !== currentRoom.topicKey) return null

  return {
    ...currentRoom,
    avatarDataUrl: cleanAvatarDataUrl(metadata.avatarDataUrl) || currentRoom.avatarDataUrl || '',
    invite:
      typeof metadata.invite === 'string' && metadata.invite.trim()
        ? metadata.invite.trim().slice(0, 1400)
        : currentRoom.invite || '',
    title:
      typeof metadata.title === 'string' && metadata.title.trim()
        ? metadata.title.trim().replace(/\s+/g, ' ').slice(0, 64)
        : currentRoom.title,
    topicKey: currentRoom.topicKey || topicKey
  }
}

function profileSyncSignature(profile) {
  const publicKey = normalizeKeyHex(profile?.publicKey || profile?.identityPublicKey)
  if (!publicKey) return ''

  return JSON.stringify({
    avatarDataUrl: cleanAvatarDataUrl(profile.avatarDataUrl),
    devicePublicKey: normalizeKeyHex(profile.devicePublicKey) || '',
    displayName: cleanSyncUsername(profile.displayName || profile.username || profile.nickname),
    profileProof:
      typeof profile.profileProof === 'string' ? profile.profileProof.trim().slice(0, 4096) : '',
    publicKey,
    updatedAt: Number.isFinite(profile.updatedAt) ? Math.max(0, Math.round(profile.updatedAt)) : 0,
    userId: cleanSyncUserId(profile.userId),
    username: cleanSyncUsername(profile.username || profile.displayName || profile.nickname)
  })
}

function mailboxKnownSignature(profile, rooms = []) {
  return JSON.stringify({
    profile: profileSyncSignature(profile),
    rooms: rooms
      .map(mailboxKnownRoomSignature)
      .filter(Boolean)
      .sort((left, right) => left.key.localeCompare(right.key))
  })
}

function mailboxKnownRoomSignature(room) {
  if (!room || typeof room !== 'object') return null

  const kind =
    room.kind === 'dm' ? 'dm' : room.kind === 'group' || room.kind === 'private' ? 'group' : 'match'
  if (kind === 'match') {
    const clean = cleanMatchRoomAnnouncement(room)
    if (!clean) return null
    return {
      avatarDataUrl: clean.avatarDataUrl,
      code: clean.code,
      invite: clean.invite,
      key: `match:${clean.code}`,
      kind: 'match',
      round: clean.round,
      title: clean.title
    }
  }

  const code = cleanPublicRoomCode(room.code)
  const topicKey =
    typeof room.topicKey === 'string' && /^[0-9a-f]{64}$/i.test(room.topicKey.trim())
      ? room.topicKey.trim().toLowerCase()
      : ''
  if (!code || !topicKey) return null

  return {
    avatarDataUrl: cleanAvatarDataUrl(room.avatarDataUrl),
    code,
    invite: typeof room.invite === 'string' ? room.invite.trim().slice(0, 1400) : '',
    key: `${kind}:${topicKey}`,
    kind,
    title: cleanPublicRoomTitle(room.title || room.peerHandle || code),
    topicKey
  }
}

function cleanPublicRoomName(value) {
  return cleanPublicRoomTitle(value).slice(0, 40)
}

function cleanPublicRoomTitle(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 72)
}

function cleanPublicTeamCode(value) {
  const words = cleanPublicRoomTitle(value).split(/\s+/).filter(Boolean)
  const raw =
    words.length >= 2 ? words.map((word) => word.slice(0, 1)).join('') : words[0]?.slice(0, 3) || ''
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4)
}

function cleanPublicRoomCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
}

function cleanSyncUsername(value) {
  return String(value || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 24)
}

function cleanSyncUserId(value) {
  const userId = typeof value === 'string' ? value.trim() : ''
  return /^[a-z0-9_-]{6,48}$/i.test(userId) ? userId : ''
}

function normalizeKeyHex(key) {
  if (b4a.isBuffer(key)) return b4a.toString(key, 'hex')
  if (typeof key !== 'string') return null

  const trimmed = key.trim().toLowerCase()
  return /^[0-9a-f]{64}$/.test(trimmed) ? trimmed : null
}

module.exports = {
  cleanMatchRoomAnnouncement,
  mailboxKnownSignature,
  profileSyncSignature,
  roomMetadataForPeer,
  roomMetadataFromPeer
}
