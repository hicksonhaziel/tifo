import { cleanAvatarDataUrl } from './identity.js'
import { workerProfileSignature } from './profiles.js'

export function knownMailboxRooms(state = {}) {
  const publicRooms = (state.matchRooms || []).map((room) => ({
    avatarDataUrl: room.avatarDataUrl || '',
    code: room.code,
    createdAt: room.createdAt || 0,
    invite: room.invite || '',
    kind: 'match',
    title: room.title,
    away: room.away || '',
    awayName: room.awayName || '',
    home: room.home || '',
    homeName: room.homeName || '',
    round: room.round || room.region || ''
  }))

  const privateRooms = (state.recentPrivateRooms || []).map((room) => ({
    avatarDataUrl: room.avatarDataUrl || '',
    code: room.code,
    invite: room.invite || '',
    kind: room.kind,
    title: room.title,
    topicKey: room.topicKey || ''
  }))

  return [...publicRooms, ...privateRooms]
}

export function mailboxSyncSignature(profile, rooms = []) {
  return JSON.stringify({
    profile: workerProfileSignature(profile),
    rooms: rooms.map(mailboxRoomSignature).sort((left, right) => left.key.localeCompare(right.key))
  })
}

function mailboxRoomSignature(room) {
  const kind = room?.kind === 'dm' ? 'dm' : room?.kind === 'group' ? 'group' : 'match'
  const code = cleanRoomCode(room?.code)
  const topicKey = typeof room?.topicKey === 'string' ? room.topicKey.trim().toLowerCase() : ''
  const key = `${kind}:${topicKey || code}`

  return {
    avatarDataUrl: cleanAvatarDataUrl(room?.avatarDataUrl),
    code,
    invite: typeof room?.invite === 'string' ? room.invite.trim().slice(0, 1400) : '',
    key,
    kind,
    title: typeof room?.title === 'string' ? room.title.trim().replace(/\s+/g, ' ') : '',
    topicKey
  }
}

function cleanRoomCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
}
