import { eventMeta, isOwnEvent } from './domain.js'

const maxNotifications = 80

export function emptyNotifications() {
  return {
    items: [],
    unreadCount: 0
  }
}

export function notificationForEvent(event, state) {
  if (!event || event.type === 'system' || isOwnEvent(event, state.profile)) return null
  if (!['chat', 'chat-media', 'reaction', 'chant', 'clip'].includes(event.type)) return null

  const meta = eventMeta(event)
  return {
    body: meta.text,
    id: event.id,
    kind: meta.label,
    read: state.view === 'room' && state.roomCode === event.room,
    roomCode: event.room || '',
    roomTitle: state.roomCode === event.room ? state.roomTitle : event.room || 'TIFO',
    sender: event.sender || 'Fan',
    timestamp: event.timestamp || Date.now()
  }
}

export function addNotification(notifications, notification) {
  if (!notification) return notifications || emptyNotifications()

  const current = notifications || emptyNotifications()
  const existing = current.items.find((item) => item.id === notification.id)
  const items = [
    {
      ...existing,
      ...notification
    },
    ...current.items.filter((item) => item.id !== notification.id)
  ].slice(0, maxNotifications)

  return {
    items,
    unreadCount: unreadCount(items)
  }
}

export function markNotificationsRead(notifications, roomCode = '') {
  const current = notifications || emptyNotifications()
  const cleanRoomCode = String(roomCode || '').trim()
  const items = current.items.map((item) =>
    !cleanRoomCode || item.roomCode === cleanRoomCode ? { ...item, read: true } : item
  )

  return {
    items,
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
