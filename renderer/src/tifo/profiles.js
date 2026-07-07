import { cleanAvatarDataUrl, normalizeUsername } from './identity.js'

export function cleanPublicProfileKey(value) {
  const key = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return /^[0-9a-f]{64}$/.test(key) ? key : ''
}

export function cleanUserId(value) {
  const userId = typeof value === 'string' ? value.trim() : ''
  return /^[a-z0-9_-]{6,48}$/i.test(userId) ? userId : ''
}

export function mergeKnownProfiles(existing = {}, profiles = []) {
  let next = existing || {}
  let changed = false

  for (const profile of profiles) {
    const clean = cleanKnownProfile(profile)
    if (!clean) continue

    for (const alias of knownProfileAliases(clean)) {
      const previous = next[alias]
      const merged = mergeKnownProfile(previous, clean)
      if (knownProfileSignature(previous) === knownProfileSignature(merged)) continue
      if (!changed) next = { ...next }
      next[alias] = merged
      changed = true
    }
  }

  return changed ? next : existing || {}
}

export function profileFromEvent(event) {
  if (!event || typeof event !== 'object') return null
  return {
    displayName: event.sender,
    identityPublicKey: event.senderIdentityKey || event.senderKey || '',
    publicKey: event.senderKey || event.senderIdentityKey || '',
    updatedAt: Number.isFinite(event.timestamp) ? event.timestamp : 0,
    userId: event.senderId || '',
    username: event.sender
  }
}

export function profilesFromEvents(events = []) {
  return events.map(profileFromEvent).filter(Boolean)
}

export function workerProfileSignature(profile) {
  if (!profile) return ''
  return JSON.stringify({
    avatarDataUrl: cleanAvatarDataUrl(profile.avatarDataUrl),
    displayName: profile.displayName || '',
    identityPublicKey: cleanPublicProfileKey(profile.identityPublicKey || profile.publicKey),
    publicKey: cleanPublicProfileKey(profile.publicKey || profile.identityPublicKey),
    updatedAt: Number.isFinite(profile.updatedAt) ? Math.max(0, Math.round(profile.updatedAt)) : 0,
    userId: cleanUserId(profile.userId),
    username: normalizeUsername(profile.username || profile.displayName || profile.nickname)
  })
}

function cleanKnownProfile(profile) {
  if (!profile || typeof profile !== 'object') return null

  const identityPublicKey = cleanPublicProfileKey(profile.identityPublicKey || profile.publicKey)
  const publicKey = cleanPublicProfileKey(profile.publicKey) || identityPublicKey
  const userId = cleanUserId(profile.userId)
  const username = normalizeUsername(profile.username || profile.displayName || profile.nickname)
  const displayName = cleanDisplayName(profile.displayName || profile.nickname || username)
  if (!publicKey && !identityPublicKey && !userId && !username) return null

  const updatedAt = Number(profile.updatedAt)
  return {
    avatarDataUrl: cleanAvatarDataUrl(profile.avatarDataUrl),
    displayName,
    identityPublicKey,
    publicKey,
    updatedAt: Number.isFinite(updatedAt) ? Math.max(0, Math.round(updatedAt)) : 0,
    userId,
    username,
    verified: profile.verified === true
  }
}

function cleanDisplayName(value, fallback = 'Fan') {
  const name = String(value || fallback)
    .trim()
    .replace(/^@+/, '')
    .replace(/\s+/g, '_')
    .slice(0, 24)
  return name || fallback
}

function knownProfileAliases(profile) {
  const aliases = new Set()
  if (profile.identityPublicKey) aliases.add(profile.identityPublicKey)
  if (profile.publicKey) aliases.add(profile.publicKey)
  if (profile.userId) aliases.add(profile.userId)
  if (profile.username) aliases.add(`name:${profile.username}`)
  const displayAlias = normalizeUsername(profile.displayName)
  if (displayAlias) aliases.add(`name:${displayAlias}`)
  return Array.from(aliases)
}

function mergeKnownProfile(previous, incoming) {
  const previousUpdatedAt = previous?.updatedAt || 0
  const incomingUpdatedAt = incoming.updatedAt || 0
  const useIncomingAvatar =
    !!incoming.avatarDataUrl && (!previous?.avatarDataUrl || incomingUpdatedAt >= previousUpdatedAt)

  return {
    ...previous,
    ...incoming,
    avatarDataUrl: useIncomingAvatar ? incoming.avatarDataUrl : previous?.avatarDataUrl || '',
    updatedAt: Math.max(previousUpdatedAt, incomingUpdatedAt)
  }
}

function knownProfileSignature(profile) {
  if (!profile) return ''
  return [
    profile.avatarDataUrl || '',
    profile.displayName || '',
    profile.identityPublicKey || '',
    profile.publicKey || '',
    profile.updatedAt || 0,
    profile.userId || '',
    profile.username || '',
    profile.verified === true ? '1' : '0'
  ].join('|')
}
