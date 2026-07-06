import { eventMeta, isOwnEvent } from './domain.js'

const readAtStorageKey = 'tifo:notification-read-at:v1'
const maxNotifications = 80

export function emptyNotifications() {
  return {
    items: [],
    readAtByRoom: {},
    unreadCount: 0
  }
}

export function loadNotificationReadAt() {
  try {
    const raw = window.localStorage.getItem(readAtStorageKey)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}

    return Object.fromEntries(
      Object.entries(parsed)
        .filter(([roomCode, readAt]) => typeof roomCode === 'string' && Number.isFinite(readAt))
        .map(([roomCode, readAt]) => [roomCode, readAt])
    )
  } catch {
    return {}
  }
}

export function saveNotificationReadAt(readAtByRoom = {}) {
  try {
    window.localStorage.setItem(readAtStorageKey, JSON.stringify(readAtByRoom))
  } catch {}
}

export function notificationForEvent(event, state) {
  if (!event || event.type === 'system' || isOwnEvent(event, state.profile)) return null
  if (!['chat', 'chat-media', 'reaction', 'chant', 'clip'].includes(event.type)) return null

  const meta = eventMeta(event)
  const lastReadAt = state.notifications?.readAtByRoom?.[event.room] || 0
  const currentRoomIsActive =
    state.view === 'room' && state.roomCode === event.room && state.appActive !== false
  const alreadyRead = Number.isFinite(event.timestamp) && event.timestamp <= lastReadAt
  return {
    body: meta.text,
    id: event.id,
    kind: meta.label,
    read: currentRoomIsActive || alreadyRead,
    roomCode: event.room || '',
    roomTitle:
      state.roomCode === event.room
        ? state.roomTitle
        : state.notificationRoomTitle || event.room || 'TIFO',
    sender: event.sender || 'Fan',
    timestamp: event.timestamp || Date.now()
  }
}

export function addNotification(notifications, notification) {
  if (!notification) return notifications || emptyNotifications()

  const current = notifications || emptyNotifications()
  const existing = current.items.find((item) => item.id === notification.id)
  const read = existing?.read === true || notification.read === true
  const items = [
    {
      ...existing,
      ...notification,
      read
    },
    ...current.items.filter((item) => item.id !== notification.id)
  ].slice(0, maxNotifications)

  return {
    items,
    readAtByRoom: current.readAtByRoom || {},
    unreadCount: unreadCount(items)
  }
}

export function markNotificationsRead(notifications, roomCode = '', readAt = Date.now()) {
  const current = notifications || emptyNotifications()
  const cleanRoomCode = String(roomCode || '').trim()
  const cleanReadAt = Number.isFinite(readAt) ? readAt : Date.now()
  const items = current.items.map((item) =>
    !cleanRoomCode || item.roomCode === cleanRoomCode ? { ...item, read: true } : item
  )
  const readAtByRoom = {
    ...(current.readAtByRoom || {})
  }
  if (cleanRoomCode) {
    readAtByRoom[cleanRoomCode] = Math.max(readAtByRoom[cleanRoomCode] || 0, cleanReadAt)
  } else {
    for (const item of current.items) {
      if (!item.roomCode) continue
      readAtByRoom[item.roomCode] = Math.max(readAtByRoom[item.roomCode] || 0, cleanReadAt)
    }
  }

  return {
    items,
    readAtByRoom,
    unreadCount: unreadCount(items)
  }
}

export function unreadCount(items = []) {
  return items.filter((item) => item.read !== true).length
}

export function unreadCountForRoom(notifications, roomCode) {
  const cleanRoomCode = String(roomCode || '').trim()
  if (!cleanRoomCode) return 0
  return (notifications?.items || []).filter(
    (item) => item.roomCode === cleanRoomCode && item.read !== true
  ).length
}
