export const RECENT_PRIVATE_ROOMS_KEY = 'tifo:private-rooms:v1'
const INVITE_PREFIX = 'tifo://room/'

export function createPrivateGroupInvite(input = {}) {
  const title = cleanTitle(input.title) || 'Private group'
  const now = Date.now()
  const roomId = randomToken(10)
  const topicKey = randomHex(32)

  return {
    code: `GRP-${roomId}`,
    createdAt: now,
    creator: cleanProfile(input.profile),
    kind: 'group',
    title,
    topicKey,
    version: 1
  }
}

export function createDmInvite(input = {}) {
  const handle = cleanHandle(input.handle)
  const now = Date.now()
  const roomId = randomToken(10)
  const topicKey = randomHex(32)
  const title = handle ? `DM with @${handle}` : cleanTitle(input.title) || 'Direct message'

  return {
    code: `DM-${roomId}`,
    createdAt: now,
    creator: cleanProfile(input.profile),
    kind: 'dm',
    peerHandle: handle,
    title,
    topicKey,
    version: 1
  }
}

export async function createDmInviteForPeer(input = {}) {
  const profile = input.profile || {}
  const peer = input.peer || {}
  const localKey =
    typeof profile.publicKey === 'string' ? profile.publicKey.trim().toLowerCase() : ''
  const peerKey = typeof peer.publicKey === 'string' ? peer.publicKey.trim().toLowerCase() : ''
  if (!/^[0-9a-f]{64}$/.test(localKey) || !/^[0-9a-f]{64}$/.test(peerKey)) {
    throw new Error('This fan does not have a DM key yet')
  }
  if (localKey === peerKey) throw new Error('You cannot DM yourself')

  const pair = [localKey, peerKey].sort().join(':')
  const topicKey = await sha256Hex(`tifo-dm:v1:${pair}`)
  const handle = cleanHandle(peer.username || peer.name)
  const title = handle ? `DM with @${handle}` : `DM with ${cleanTitle(peer.name) || 'fan'}`

  return {
    code: `DM-${topicKey.slice(0, 20).toUpperCase()}`,
    createdAt: Date.now(),
    creator: cleanProfile(profile),
    kind: 'dm',
    peerHandle: handle,
    title,
    topicKey,
    version: 1
  }
}

export function encodeInvite(invite) {
  return `${INVITE_PREFIX}${base64UrlEncode(JSON.stringify(sanitizeInvite(invite)))}`
}

export function parseInvite(value) {
  const raw = String(value || '').trim()
  if (!raw) throw new Error('Paste an invite link')

  const encoded = raw.startsWith(INVITE_PREFIX) ? raw.slice(INVITE_PREFIX.length) : raw
  let parsed = null
  try {
    parsed = JSON.parse(base64UrlDecode(encoded))
  } catch {
    throw new Error('Invite link is not valid')
  }

  return sanitizeInvite(parsed)
}

export function inviteToRoom(invite) {
  const clean = sanitizeInvite(invite)
  return {
    code: clean.code,
    invite: encodeInvite(clean),
    kind: clean.kind,
    title: clean.title,
    topicKey: clean.topicKey
  }
}

export function loadRecentPrivateRooms() {
  try {
    const raw = window.localStorage.getItem(RECENT_PRIVATE_ROOMS_KEY)
    if (!raw) return []
    const rooms = JSON.parse(raw)
    if (!Array.isArray(rooms)) return []
    return rooms.map(sanitizeRecentRoom).filter(Boolean).slice(0, 8)
  } catch {
    return []
  }
}

export function saveRecentPrivateRoom(room) {
  const clean = sanitizeRecentRoom(room)
  if (!clean) return loadRecentPrivateRooms()

  const next = [clean, ...loadRecentPrivateRooms().filter((item) => item.code !== clean.code)]
    .sort((left, right) => right.lastJoinedAt - left.lastJoinedAt)
    .slice(0, 8)

  window.localStorage.setItem(RECENT_PRIVATE_ROOMS_KEY, JSON.stringify(next))
  return next
}

export function roomInviteLabel(room) {
  if (room?.kind === 'dm') return 'Direct message'
  if (room?.kind === 'group' || room?.kind === 'private') return 'Private group'
  return 'Match room'
}

function sanitizeInvite(invite) {
  if (!invite || typeof invite !== 'object') throw new Error('Invite link is not valid')

  const topicKey = typeof invite.topicKey === 'string' ? invite.topicKey.trim().toLowerCase() : ''
  if (!/^[0-9a-f]{64}$/.test(topicKey)) throw new Error('Invite secret is not valid')

  const kind = invite.kind === 'dm' ? 'dm' : 'group'
  const code = cleanCode(invite.code || `${kind === 'dm' ? 'DM' : 'GRP'}-${randomToken(10)}`)
  const title = cleanTitle(invite.title) || (kind === 'dm' ? 'Direct message' : 'Private group')

  return {
    code,
    createdAt: Number.isFinite(invite.createdAt) ? invite.createdAt : Date.now(),
    creator: cleanProfile(invite.creator),
    kind,
    peerHandle: kind === 'dm' ? cleanHandle(invite.peerHandle) : '',
    title,
    topicKey,
    version: 1
  }
}

function sanitizeRecentRoom(room) {
  try {
    const invite = sanitizeInvite(room)
    return {
      ...invite,
      invite: typeof room.invite === 'string' ? room.invite : encodeInvite(invite),
      lastJoinedAt: Number.isFinite(room.lastJoinedAt) ? room.lastJoinedAt : Date.now()
    }
  } catch {
    return null
  }
}

function cleanTitle(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 48)
}

function cleanHandle(value) {
  return String(value || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 20)
}

function cleanCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32)
}

function cleanProfile(profile) {
  if (!profile || typeof profile !== 'object') return null
  return {
    publicKey: typeof profile.publicKey === 'string' ? profile.publicKey.slice(0, 64) : '',
    username: typeof profile.username === 'string' ? profile.username.slice(0, 20) : ''
  }
}

function randomHex(byteLength) {
  const bytes = new Uint8Array(byteLength)
  window.crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function randomToken(byteLength) {
  return randomHex(byteLength)
    .slice(0, byteLength * 2)
    .toUpperCase()
}

function base64UrlEncode(value) {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

function base64UrlDecode(value) {
  const normalized = String(value || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/')
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=')
  const binary = window.atob(padded)
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

async function sha256Hex(value) {
  const digest = await window.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}
