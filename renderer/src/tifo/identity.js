export const PROFILE_STORAGE_KEY = 'tifo:local-profile:v1'

export function loadLocalProfile() {
  try {
    const raw = window.localStorage.getItem(PROFILE_STORAGE_KEY)
    if (!raw) return null
    return sanitizeStoredProfile(JSON.parse(raw))
  } catch {
    return null
  }
}

export function saveLocalProfile(profile) {
  window.localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profile))
}

export function createLocalProfile(input = {}) {
  const username = normalizeUsername(input.username)
  if (!validUsername(username)) {
    throw new Error('Choose a username with 2 to 20 letters, numbers, or underscores')
  }

  const now = Date.now()
  const publicKey = randomHex(32)
  const avatarDataUrl = cleanAvatarDataUrl(input.avatarDataUrl)

  return {
    avatarDataUrl,
    createdAt: now,
    displayName: username,
    publicKey,
    updatedAt: now,
    userId: `fan_${randomHex(8)}`,
    username,
    version: 1
  }
}

export function normalizeUsername(value) {
  return String(value || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 20)
}

export function validUsername(username) {
  return /^[a-z0-9_]{2,20}$/.test(username)
}

export function profileLabel(profile) {
  return profile?.username ? `@${profile.username}` : 'Local fan'
}

export function profileName(profile) {
  return profile?.displayName || profile?.username || 'Local fan'
}

export function shortProfileKey(profile) {
  const key = typeof profile?.publicKey === 'string' ? profile.publicKey : ''
  return key ? `${key.slice(0, 6)}...${key.slice(-4)}` : 'local'
}

function sanitizeStoredProfile(profile) {
  if (!profile || typeof profile !== 'object') return null

  const username = normalizeUsername(profile.username || profile.nickname || profile.displayName)
  if (!validUsername(username)) return null

  const identityPublicKey = cleanPublicKey(profile.identityPublicKey || profile.publicKey)
  const publicKey = cleanPublicKey(profile.publicKey) || identityPublicKey || randomHex(32)

  const userId =
    typeof profile.userId === 'string' && /^[a-z0-9_-]{6,48}$/i.test(profile.userId)
      ? profile.userId
      : `fan_${randomHex(8)}`

  return {
    createdAt: Number.isFinite(profile.createdAt) ? profile.createdAt : Date.now(),
    avatarDataUrl: cleanAvatarDataUrl(profile.avatarDataUrl),
    deviceProof: cleanProof(profile.deviceProof),
    devicePublicKey: cleanPublicKey(profile.devicePublicKey),
    displayName: username,
    identityPublicKey,
    profileDiscoveryPublicKey: cleanPublicKey(profile.profileDiscoveryPublicKey),
    profileProof: cleanProof(profile.profileProof),
    publicKey,
    updatedAt: Number.isFinite(profile.updatedAt) ? profile.updatedAt : Date.now(),
    userId,
    verified: profile.verified === true,
    username,
    version: Number.isFinite(profile.version) ? profile.version : 1
  }
}

export function cleanAvatarDataUrl(value) {
  const dataUrl = typeof value === 'string' ? value.trim() : ''
  if (!dataUrl) return ''
  if (dataUrl.length > 260_000) return ''
  return /^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=]+$/i.test(dataUrl) ? dataUrl : ''
}

function cleanPublicKey(value) {
  const key = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return /^[0-9a-f]{64}$/.test(key) ? key : ''
}

function cleanProof(value) {
  const proof = typeof value === 'string' ? value.trim() : ''
  return proof && proof.length <= 4096 ? proof : ''
}

function randomHex(byteLength) {
  const bytes = new Uint8Array(byteLength)
  window.crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
}
