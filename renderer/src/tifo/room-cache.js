const ROOM_EVENT_CACHE_KEY = 'tifo:room-events:v1'
const MAX_CACHED_ROOMS = 40
const MAX_EVENTS_PER_ROOM = 180

export function loadCachedRoomEvents(roomCode) {
  const cleanRoomCode = cleanCode(roomCode)
  if (!cleanRoomCode) return []

  try {
    const cache = readCache()
    return sanitizeEvents(cache.rooms?.[cleanRoomCode]?.events || [], cleanRoomCode)
  } catch {
    return []
  }
}

export function saveCachedRoomEvents(roomCode, events = []) {
  const cleanRoomCode = cleanCode(roomCode)
  if (!cleanRoomCode) return

  try {
    const cache = readCache()
    const cleanEvents = sanitizeEvents(events, cleanRoomCode)
    if (cleanEvents.length === 0) return

    const rooms = {
      ...(cache.rooms || {}),
      [cleanRoomCode]: {
        events: cleanEvents,
        updatedAt: Date.now()
      }
    }
    const keepCodes = Object.keys(rooms)
      .sort((left, right) => (rooms[right].updatedAt || 0) - (rooms[left].updatedAt || 0))
      .slice(0, MAX_CACHED_ROOMS)
    const nextRooms = Object.fromEntries(keepCodes.map((code) => [code, rooms[code]]))

    window.localStorage.setItem(
      ROOM_EVENT_CACHE_KEY,
      JSON.stringify({
        rooms: nextRooms,
        version: 1
      })
    )
  } catch {}
}

export function mergeRoomEvents(primary = [], fallback = [], roomCode = '') {
  const cleanRoomCode = cleanCode(roomCode)
  const byId = new Map()

  for (const event of sanitizeEvents(fallback, cleanRoomCode)) byId.set(event.id, event)
  for (const event of sanitizeEvents(primary, cleanRoomCode)) {
    byId.set(event.id, {
      ...byId.get(event.id),
      ...event
    })
  }

  return sortEvents(Array.from(byId.values())).slice(0, MAX_EVENTS_PER_ROOM)
}

function readCache() {
  const raw = window.localStorage.getItem(ROOM_EVENT_CACHE_KEY)
  if (!raw) return { rooms: {}, version: 1 }
  const parsed = JSON.parse(raw)
  return parsed && typeof parsed === 'object' ? parsed : { rooms: {}, version: 1 }
}

function sanitizeEvents(events, roomCode) {
  const cleanRoomCode = cleanCode(roomCode)
  if (!Array.isArray(events) || !cleanRoomCode) return []

  const seen = new Set()
  const cleanEvents = []
  for (const event of events) {
    const clean = sanitizeEvent(event, cleanRoomCode)
    if (!clean || seen.has(clean.id)) continue
    seen.add(clean.id)
    cleanEvents.push(clean)
  }

  return sortEvents(cleanEvents).slice(0, MAX_EVENTS_PER_ROOM)
}

function sanitizeEvent(event, roomCode) {
  if (!event || typeof event !== 'object') return null
  if (event.type === 'system') return null
  if (event.room !== roomCode) return null
  if (typeof event.id !== 'string' || !event.id.trim()) return null
  if (typeof event.type !== 'string' || !event.type.trim()) return null
  if (!event.payload || typeof event.payload !== 'object') return null

  return {
    ...event,
    id: event.id.slice(0, 96),
    localCreatedAt: Number.isFinite(event.localCreatedAt) ? event.localCreatedAt : 0,
    room: roomCode,
    timestamp: Number.isFinite(event.timestamp) ? event.timestamp : 0,
    type: event.type.slice(0, 48)
  }
}

function sortEvents(events) {
  return [...events].sort((left, right) => {
    const timeDelta = right.timestamp - left.timestamp
    if (timeDelta !== 0) return timeDelta
    return right.localCreatedAt - left.localCreatedAt
  })
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
