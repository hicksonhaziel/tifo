import { reactionTypes } from './constants.js'
import { formatDuration } from './format.js'

export function safeClass(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

export function reactionTheme(type) {
  return reactionTypes.find((reaction) => reaction.type === type) || reactionTypes[0]
}

export function roomParts(roomCode) {
  const parts = roomCode.split('-').filter(Boolean)
  return {
    home: parts[0] || 'TIF',
    away: parts[1] || 'OPP',
    round: parts.at(-1) || 'Live'
  }
}

export function eventMeta(event) {
  if (event.type === 'chat') {
    return {
      label: 'Chat',
      text: event.payload.text
    }
  }

  if (event.type === 'chat-media') {
    const kind = event.payload.kind === 'image' ? 'Photo' : 'Voice note'
    return {
      label: kind,
      text: event.payload.caption || kind
    }
  }

  if (event.type === 'reaction') {
    const reaction = reactionTheme(event.payload.type)
    return {
      label: reaction.label,
      text: reaction.cue
    }
  }

  if (event.type === 'chant') {
    return {
      label: 'Chant',
      text: `${formatDuration(event.payload.durationMs)} terrace chant`
    }
  }

  if (event.type === 'clip') {
    return {
      label: 'Clip',
      text: event.payload.caption || event.payload.title || 'Highlight clip'
    }
  }

  return {
    label: 'System',
    text: event.payload.text
  }
}

export function eventStatus(event, appState) {
  if (appState.offline.pendingEventIds.has(event.id)) return 'pending'
  return ['local', 'remote', 'stored'].includes(event.status) ? event.status : 'local'
}

export function eventStatusLabel(event, appState) {
  const status = eventStatus(event, appState)
  if (status === 'pending') return 'Pending'
  if (status === 'remote') return 'Peer'
  if (status === 'stored') return 'Synced'
  return 'Local'
}

export function roomMetrics(appState) {
  const playableEvents = appState.events.filter((event) => event.type !== 'system')
  const pendingEvents = appState.events.filter((event) =>
    appState.offline.pendingEventIds.has(event.id)
  )

  return {
    chats: appState.events.filter((event) => event.type === 'chat').length,
    chants: appState.events.filter((event) => event.type === 'chant').length,
    clips: appState.events.filter((event) => event.type === 'clip').length,
    media: appState.events.filter((event) => event.type === 'chat-media').length,
    pending: Math.max(appState.offline.pendingCount, pendingEvents.length),
    reactions: appState.events.filter((event) => event.type === 'reaction').length,
    saved: appState.events.filter((event) => event.status === 'stored').length,
    peerEvents: appState.events.filter((event) => event.status === 'remote').length,
    playableEvents
  }
}

export function eventListSignature(events) {
  return events.map((event) => `${event.id}:${event.status}:${event.version}`).join('|')
}
