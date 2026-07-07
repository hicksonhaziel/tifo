const desktopNotificationSeenKey = 'tifo:desktop-notifications-seen:v1'
const maxDesktopNotificationSeen = 240

export function loadDesktopNotificationIds() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(desktopNotificationSeenKey) || '[]')
    return new Set(Array.isArray(parsed) ? parsed.filter((id) => typeof id === 'string') : [])
  } catch {
    return new Set()
  }
}

export function showDesktopNotification(notification, options = {}) {
  const seenIds = options.seenIds
  if (!notification || !seenIds || seenIds.has(notification.id)) return false
  if (notification.read === true && !options.appIsBackgrounded?.()) return false

  seenIds.add(notification.id)
  saveDesktopNotificationIds(seenIds)
  window.bridge
    ?.showNotification?.({
      body: notification.body,
      iconDataUrl: notification.avatarDataUrl,
      id: notification.id,
      roomCode: notification.roomCode,
      title: `${notification.sender} · ${notification.roomTitle || 'TIFO'}`
    })
    ?.catch?.(() => {})
  return true
}

function saveDesktopNotificationIds(ids) {
  try {
    const keep = Array.from(ids).slice(-maxDesktopNotificationSeen)
    window.localStorage.setItem(desktopNotificationSeenKey, JSON.stringify(keep))
  } catch {}
}
