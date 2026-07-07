import { cleanAvatarDataUrl } from './identity.js'

export const RECENT_PRIVATE_ROOMS_KEY = 'tifo:private-rooms:v1'
const INVITE_PREFIX = 'tifo://room/'
const MAX_RECENT_PRIVATE_ROOMS = 40

export function createPrivateGroupInvite(input = {}) {
  const title = cleanTitle(input.title) || 'Private group'
  const now = Date.now()
  const roomId = randomToken(10)
  const topicKey = randomHex(32)

  return {
    avatarDataUrl: cleanAvatarDataUrl(input.avatarDataUrl),
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
  const title = cleanDmTitle(input.title, handle)

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

export function createMatchRoomInvite(room = {}, input = {}) {
  return sanitizeInvite({
    avatarDataUrl: room.avatarDataUrl,
    away: room.away,
    awayName: room.awayName,
    code: room.code,
    createdAt: room.createdAt,
    creator: cleanProfile(input.profile),
    home: room.home,
    homeName: room.homeName,
    kind: 'match',
    round: room.round || room.region,
    title: room.title,
    version: 1
  })
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
  const title = cleanDmTitle(peer.name, handle)

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
  return `${INVITE_PREFIX}${base64UrlEncode(JSON.stringify(invitePayload(invite)))}`
}

export function parseInvite(value) {
  const raw = normalizeInviteInput(value)
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

export function inviteToRoom(invite, options = {}) {
  const clean = sanitizeInvite(invite)
  const room = {
    avatarDataUrl: clean.avatarDataUrl,
    code: clean.code,
    invite: encodeInvite(clean),
    kind: clean.kind,
    title: clean.kind === 'dm' ? dmTitleForProfile(clean, options.profile) : clean.title,
    topicKey: clean.topicKey
  }

  if (clean.kind === 'match') {
    return {
      ...room,
      away: clean.away,
      awayName: clean.awayName,
      detail: clean.detail,
      home: clean.home,
      homeName: clean.homeName,
      region: clean.region,
      round: clean.round,
      userCreated: false
    }
  }

  return room
}

export function dmTitleForProfile(invite, profile = null) {
  const clean = sanitizeInvite(invite)
  if (clean.kind !== 'dm') return clean.title

  const profileKey =
    typeof profile?.publicKey === 'string' ? profile.publicKey.trim().toLowerCase() : ''
  const creatorKey =
    typeof clean.creator?.publicKey === 'string' ? clean.creator.publicKey.trim().toLowerCase() : ''
  if (profileKey && creatorKey && profileKey !== creatorKey) {
    return cleanDmTitle(clean.creator.username, clean.creator.username)
  }

  return cleanDmTitle(clean.title, clean.peerHandle)
}

export function loadRecentPrivateRooms(profile = null) {
  try {
    const raw = window.localStorage.getItem(RECENT_PRIVATE_ROOMS_KEY)
    if (!raw) return []
    const rooms = JSON.parse(raw)
    if (!Array.isArray(rooms)) return []
    return rooms
      .map((room) => sanitizeRecentRoom(room, profile))
      .filter(Boolean)
      .slice(0, MAX_RECENT_PRIVATE_ROOMS)
  } catch {
    return []
  }
}

export function saveRecentPrivateRoom(room, profile = null) {
  const current = loadRecentPrivateRooms(profile)
  const roomCode = cleanCode(room?.code || '')
  if (!roomCode) return current
  const existing = current.find((item) => item.code === roomCode)
  const clean = sanitizeRecentRoom(
    {
      ...existing,
      ...room,
      invite:
        typeof room?.invite === 'string' && room.invite.trim() ? room.invite : existing?.invite,
      avatarDataUrl:
        typeof room?.avatarDataUrl === 'string' && room.avatarDataUrl.trim()
          ? room.avatarDataUrl
          : existing?.avatarDataUrl,
      lastJoinedAt: Number.isFinite(room?.lastJoinedAt)
        ? room.lastJoinedAt
        : existing?.lastJoinedAt || Date.now(),
      topicKey:
        typeof room?.topicKey === 'string' && room.topicKey.trim()
          ? room.topicKey
          : existing?.topicKey
    },
    profile
  )
  if (!clean) return loadRecentPrivateRooms(profile)

  const next = [clean, ...current.filter((item) => item.code !== clean.code)]
    .sort((left, right) => right.lastJoinedAt - left.lastJoinedAt)
    .slice(0, MAX_RECENT_PRIVATE_ROOMS)

  window.localStorage.setItem(RECENT_PRIVATE_ROOMS_KEY, JSON.stringify(next))
  return next
}

export function deleteRecentPrivateRoom(roomCode, profile = null) {
  const cleanRoomCode = cleanCode(roomCode)
  if (!cleanRoomCode) return loadRecentPrivateRooms(profile)
  const next = loadRecentPrivateRooms(profile).filter((room) => room.code !== cleanRoomCode)
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

  const kind =
    invite.kind === 'match' || invite.kind === 'room'
      ? 'match'
      : invite.kind === 'dm'
        ? 'dm'
        : 'group'

  const topicKey = typeof invite.topicKey === 'string' ? invite.topicKey.trim().toLowerCase() : ''
  if (kind !== 'match' && !/^[0-9a-f]{64}$/.test(topicKey)) {
    throw new Error('Invite secret is not valid')
  }

  const code = cleanCode(
    invite.code || `${kind === 'dm' ? 'DM' : kind === 'group' ? 'GRP' : 'ROOM'}-${randomToken(10)}`
  )
  const title =
    kind === 'dm'
      ? cleanDmTitle(invite.title, invite.peerHandle)
      : kind === 'match'
        ? cleanMatchTitle(invite)
        : cleanTitle(invite.title) || 'Private group'

  const clean = {
    avatarDataUrl:
      kind === 'group' || kind === 'match' ? cleanAvatarDataUrl(invite.avatarDataUrl) : '',
    code,
    createdAt: Number.isFinite(invite.createdAt) ? invite.createdAt : Date.now(),
    creator: cleanProfile(invite.creator),
    kind,
    peerHandle: kind === 'dm' ? cleanHandle(invite.peerHandle) : '',
    title,
    topicKey: kind === 'match' ? '' : topicKey,
    version: 1
  }

  if (kind === 'match') {
    clean.away = cleanTeamCode(invite.away || invite.awayName)
    clean.awayName = cleanMatchName(invite.awayName || invite.away)
    clean.home = cleanTeamCode(invite.home || invite.homeName)
    clean.homeName = cleanMatchName(invite.homeName || invite.home)
    clean.round = cleanTitle(invite.round || invite.region || invite.detail) || 'Match room'
    clean.region = clean.round
    clean.detail = clean.round
  }

  return clean
}

function invitePayload(invite) {
  const clean = sanitizeInvite(invite)
  const payload = { ...clean }
  delete payload.avatarDataUrl
  return payload
}

function normalizeInviteInput(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const match = raw.match(/tifo:\/\/room\/[A-Za-z0-9_-]+/)
  return match ? match[0] : raw
}

function sanitizeRecentRoom(room, profile = null) {
  try {
    const invite = sanitizeInvite(room)
    if (invite.kind === 'match') return null
    return {
      ...invite,
      invite: typeof room.invite === 'string' ? room.invite : encodeInvite(invite),
      lastJoinedAt: Number.isFinite(room.lastJoinedAt) ? room.lastJoinedAt : Date.now(),
      title: invite.kind === 'dm' ? dmTitleForProfile(invite, profile) : invite.title
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

function cleanDmTitle(value, fallbackHandle = '') {
  const legacyTitle = cleanTitle(value)
    .replace(/^dm\s+with\s+/i, '')
    .replace(/^direct\s+message\s+with\s+/i, '')
    .replace(/^@+/, '')
  const normalizedLegacyTitle = legacyTitle.toLowerCase()
  const handle = cleanHandle(
    normalizedLegacyTitle === 'dm' || normalizedLegacyTitle === 'direct message'
      ? fallbackHandle
      : legacyTitle || fallbackHandle
  )
  if (!handle) return 'Direct message'
  return displayUsername(handle)
}

function cleanMatchTitle(invite) {
  const homeName = cleanMatchName(invite.homeName || invite.home)
  const awayName = cleanMatchName(invite.awayName || invite.away)
  if (homeName && awayName) return `${homeName} vs ${awayName}`
  return cleanTitle(invite.title) || 'Match room'
}

function cleanMatchName(value) {
  return cleanTitle(value).slice(0, 40)
}

function cleanTeamCode(value) {
  const words = cleanTitle(value).split(/\s+/).filter(Boolean)
  const raw =
    words.length >= 2 ? words.map((word) => word.slice(0, 1)).join('') : words[0]?.slice(0, 3) || ''
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4)
}

function cleanHandle(value) {
  return String(value || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 20)
}

function displayUsername(handle) {
  const clean = cleanHandle(handle)
  if (!clean) return ''
  return clean.slice(0, 1).toUpperCase() + clean.slice(1)
}

function cleanCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
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
