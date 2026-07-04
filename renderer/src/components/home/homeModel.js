import { roomInviteLabel } from '../../tifo/invites.js'
import { unreadCountForRoom } from '../../tifo/notifications.js'

export function avatarUrl(seed) {
  return `https://api.dicebear.com/9.x/notionists/svg?seed=${encodeURIComponent(
    seed
  )}&backgroundColor=1a1e22,22272c,2b3137&backgroundType=solid&radius=50`
}

export function displayName(profile) {
  const username = profile?.displayName || profile?.username || 'haziel'
  return username.slice(0, 1).toUpperCase() + username.slice(1)
}

export function usernameLabel(profile) {
  return profile?.username || 'haziel'
}

export function roomTitle(room) {
  return room.homeName && room.awayName ? `${room.homeName} vs ${room.awayName}` : room.title
}

export function roomRound(room) {
  return room.round || room.region || room.detail || 'Match room'
}

export function searchRooms(rooms, query) {
  const cleanQuery = query.trim().toLowerCase()
  if (!cleanQuery) return rooms
  return rooms.filter((room) =>
    [room.title, room.home, room.away, room.homeName, room.awayName, room.round, room.code]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
      .includes(cleanQuery)
  )
}

export function searchChats(chats, query) {
  const cleanQuery = query.trim().toLowerCase()
  if (!cleanQuery) return chats
  return chats.filter((chat) =>
    [chat.title, chat.last, chat.type].filter(Boolean).join(' ').toLowerCase().includes(cleanQuery)
  )
}

export function recentChatRows(state) {
  return (state.recentPrivateRooms || []).map((room) => {
    const unread = unreadCountForRoom(state.notifications, room.code)
    const isDm = room.kind === 'dm' || room.type === 'dm'
    const title = isDm ? dmTitle(room, state.profile) : room.title || room.name || 'Private group'

    return {
      accent: isDm ? '#B87A70' : '#7FA6D1',
      avatar: isDm ? avatarUrl(`${title}-dm`) : '',
      key: room.code,
      last: unread > 0 ? `${unread} unread` : roomInviteLabel(room),
      room,
      time: timeAgo(room.lastJoinedAt),
      title,
      type: isDm ? 'dm' : 'group',
      unread
    }
  })
}

function dmTitle(room, profile) {
  const username = profile?.username
  const known =
    room.peerUsername ||
    room.otherUsername ||
    room.handle ||
    room.dmHandle ||
    room.title ||
    room.name ||
    'Direct message'

  return String(known)
    .replace(/^DM with\s+/i, '')
    .replace(/^@/, '')
    .replace(username || '', '')
    .replace(/\s+and\s+/i, '')
    .trim()
}

function timeAgo(timestamp) {
  if (!Number.isFinite(timestamp)) return 'now'
  const diff = Math.max(0, Date.now() - timestamp)
  const minute = 60 * 1000
  const hour = 60 * minute
  const day = 24 * hour
  if (diff < minute) return 'now'
  if (diff < hour) return `${Math.floor(diff / minute)}m`
  if (diff < day) return `${Math.floor(diff / hour)}h`
  return 'yesterday'
}
