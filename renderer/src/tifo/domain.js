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

export function chatEventTypes() {
  return ['chat', 'chat-media']
}

export function chatReplySnapshot(event) {
  if (!event || !chatEventTypes().includes(event.type)) return null

  const id = typeof event.id === 'string' ? event.id.slice(0, 96) : ''
  if (!id) return null

  const sender =
    typeof event.sender === 'string' && event.sender.trim() ? event.sender.trim() : 'Fan'
  const kind =
    event.type === 'chat'
      ? 'chat'
      : event.payload?.kind === 'image'
        ? 'image'
        : event.payload?.kind === 'voice'
          ? 'voice'
          : 'media'
  const text = chatReplyText(event, kind)

  return {
    id,
    kind,
    sender: sender.slice(0, 24),
    text
  }
}

export function timelineEventTypes() {
  return ['clip', 'chant', 'reaction']
}

export function actorKeyForEvent(event) {
  return event?.senderIdentityKey || event?.senderKey || event?.senderId || event?.sender || ''
}

export function actorKeyForProfile(profile) {
  return (
    profile?.identityPublicKey ||
    profile?.publicKey ||
    profile?.userId ||
    profile?.displayName ||
    profile?.username ||
    ''
  )
}

export function isOwnEvent(event, profile) {
  const eventActor = actorKeyForEvent(event)
  const profileActor = actorKeyForProfile(profile)
  return !!eventActor && !!profileActor && eventActor === profileActor
}

export function materializeChatEvents(events, profile = null) {
  const sorted = [...events].sort((left, right) => {
    const timeDelta = left.timestamp - right.timestamp
    if (timeDelta !== 0) return timeDelta
    return left.localCreatedAt - right.localCreatedAt
  })
  const byId = new Map()
  const deletedIds = new Set()
  const edits = new Map()
  const reactions = new Map()

  for (const event of sorted) {
    if (chatEventTypes().includes(event.type)) {
      byId.set(event.id, event)
    }
  }

  for (const event of sorted) {
    if (event.type === 'chat-edit') {
      const target = byId.get(event.payload?.targetId)
      if (!target || target.type !== 'chat') continue
      if (actorKeyForEvent(target) !== actorKeyForEvent(event)) continue
      edits.set(target.id, {
        editedAt: event.timestamp,
        text: event.payload.text
      })
    }

    if (event.type === 'chat-delete') {
      const target = byId.get(event.payload?.targetId)
      if (!target || !chatEventTypes().includes(target.type)) continue
      if (actorKeyForEvent(target) !== actorKeyForEvent(event)) continue
      deletedIds.add(target.id)
    }

    if (event.type === 'chat-reaction') {
      const target = byId.get(event.payload?.targetId)
      if (!target || !chatEventTypes().includes(target.type)) continue
      addChatReaction(reactions, target.id, event)
    }
  }

  return sorted
    .filter((event) => chatEventTypes().includes(event.type) && !deletedIds.has(event.id))
    .map((event) => {
      const edit = edits.get(event.id)
      return {
        ...event,
        chatState: {
          editedAt: edit?.editedAt || null,
          own: isOwnEvent(event, profile),
          reactions: chatReactionList(reactions.get(event.id), profile)
        },
        payload:
          event.type === 'chat' && edit
            ? {
                ...event.payload,
                text: edit.text
              }
            : event.payload
      }
    })
    .sort((left, right) => {
      const timeDelta = right.timestamp - left.timestamp
      if (timeDelta !== 0) return timeDelta
      return right.localCreatedAt - left.localCreatedAt
    })
}

export function timelineEvents(events) {
  return events.filter((event) => timelineEventTypes().includes(event.type))
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

export function eventTrustLabel(event) {
  return event?.verified === true ? 'Verified' : 'Unverified'
}

export function readReceiptLabel(event, appState) {
  if (!isOwnEvent(event, appState.profile)) return ''
  const roomReceipts = appState.readReceipts?.[event.room] || {}
  const profileActor = actorKeyForProfile(appState.profile)
  const readers = Object.values(roomReceipts).filter(
    (receipt) =>
      receipt?.publicKey &&
      receipt.publicKey !== profileActor &&
      Number.isFinite(receipt.readAt) &&
      receipt.readAt >= event.timestamp
  )

  if (readers.length === 1) return 'Seen'
  if (readers.length > 1) return `Seen by ${readers.length}`
  return ''
}

export function roomMetrics(appState) {
  const chatEvents = materializeChatEvents(appState.events, appState.profile)
  const playableEvents = timelineEvents(appState.events)
  const pendingEvents = appState.events.filter((event) =>
    appState.offline.pendingEventIds.has(event.id)
  )

  return {
    chats: chatEvents.filter((event) => event.type === 'chat').length,
    chants: appState.events.filter((event) => event.type === 'chant').length,
    clips: appState.events.filter((event) => event.type === 'clip').length,
    media: chatEvents.filter((event) => event.type === 'chat-media').length,
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

function addChatReaction(reactions, targetId, event) {
  const emoji = event.payload?.emoji
  if (!emoji) return

  const targetReactions = reactions.get(targetId) || new Map()
  const emojiReactions = targetReactions.get(emoji) || new Map()
  const actor = actorKeyForEvent(event)
  if (!actor) return

  emojiReactions.set(actor, {
    actor,
    name: event.sender || 'Fan',
    timestamp: event.timestamp
  })
  targetReactions.set(emoji, emojiReactions)
  reactions.set(targetId, targetReactions)
}

function chatReplyText(event, kind) {
  if (kind === 'chat') {
    return String(event.payload?.text || '')
      .trim()
      .slice(0, 120)
  }
  if (kind === 'image') {
    return String(event.payload?.caption || 'Photo')
      .trim()
      .slice(0, 120)
  }
  if (kind === 'voice') return 'Voice note'
  return 'Media'
}

function chatReactionList(targetReactions, profile) {
  if (!targetReactions) return []

  const profileActor = actorKeyForProfile(profile)
  return Array.from(targetReactions.entries())
    .map(([emoji, reactors]) => {
      const people = Array.from(reactors.values())
        .sort((left, right) => left.name.localeCompare(right.name))
        .map((item) => item.name)

      return {
        count: people.length,
        emoji,
        names: people,
        reactedByMe: profileActor ? reactors.has(profileActor) : false
      }
    })
    .filter((item) => item.count > 0)
    .sort((left, right) => right.count - left.count || left.emoji.localeCompare(right.emoji))
}
