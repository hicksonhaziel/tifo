const b4a = require('b4a')
const crypto = require('hypercore-crypto')
const IdentityKey = require('keet-identity-key')
const sodium = require('sodium-universal')
const { publicIdentityFields, signEvent, verifyEvent } = require('./tifo-event-signing')
const { cleanAvatarDataUrl } = require('./tifo-profile')

const path = requirePath()
const fs = requireFs()
const identityVersion = 2

class TifoIdentity {
  constructor(options = {}) {
    this.dir = options.dir
    this.file = path.join(this.dir, 'identity.json')
    this.now = options.now || Date.now
    this.identity = null
    this.readyPromise = null
  }

  ready() {
    if (this.readyPromise) return this.readyPromise

    this.readyPromise = fs
      .mkdir(this.dir, { recursive: true })
      .then(() => fs.readFile(this.file, 'utf8').catch(() => ''))
      .then((raw) => {
        if (!raw) return null
        const parsed = JSON.parse(raw)
        this.identity = sanitizeStoredIdentity(parsed)
        return this.identity
      })
      .catch(() => null)

    return this.readyPromise
  }

  async ensureProfile(input = {}) {
    await this.ready()

    const profileInput = cleanProfileInput(input)
    if (!profileInput.username) throw new Error('profile username is required')

    if (!this.identity) {
      this.identity = await createIdentity(profileInput, this.now)
      await this.persist()
      return this.publicProfile()
    }

    const usernameChanged =
      this.identity.username !== profileInput.username ||
      this.identity.displayName !== profileInput.displayName
    const avatarChanged =
      !!profileInput.avatarDataUrl && this.identity.avatarDataUrl !== profileInput.avatarDataUrl

    if (usernameChanged || avatarChanged || !this.identity.profileProof) {
      this.identity.username = profileInput.username
      this.identity.displayName = profileInput.displayName
      if (profileInput.avatarDataUrl) this.identity.avatarDataUrl = profileInput.avatarDataUrl
      this.identity.updatedAt = this.now()
      this.identity.profileProof = profileProofForIdentity(this.identity)
      await this.persist()
    }

    return this.publicProfile()
  }

  publicProfile() {
    if (!this.identity) return null

    return {
      avatarDataUrl: this.identity.avatarDataUrl || '',
      createdAt: this.identity.createdAt,
      displayName: this.identity.displayName,
      publicKey: this.identity.identityPublicKey,
      updatedAt: this.identity.updatedAt,
      userId: this.identity.userId,
      username: this.identity.username,
      verified: true,
      version: identityVersion,
      ...publicIdentityFields(this.identity)
    }
  }

  signEvent(event) {
    return signEvent(event, this.identity)
  }

  verifyEvent(event) {
    return verifyEvent(event)
  }

  async persist() {
    if (!this.identity) return
    await fs.mkdir(this.dir, { recursive: true })
    await fs.writeFile(this.file, `${JSON.stringify(this.identity, null, 2)}\n`)
  }
}

async function createIdentity(profileInput, now) {
  const mnemonic = IdentityKey.generateMnemonic()
  const identity = await IdentityKey.from({ mnemonic })
  const deviceKeyPair = crypto.keyPair()
  const deviceProof = await identity.bootstrap(deviceKeyPair.publicKey)
  const createdAt = now()

  const record = {
    createdAt,
    deviceProof: b4a.toString(deviceProof, 'base64'),
    devicePublicKey: b4a.toString(deviceKeyPair.publicKey, 'hex'),
    deviceSecretKey: b4a.toString(deviceKeyPair.secretKey, 'hex'),
    displayName: profileInput.displayName,
    avatarDataUrl: profileInput.avatarDataUrl,
    identityPublicKey: b4a.toString(identity.identityPublicKey, 'hex'),
    mnemonic,
    profileDiscoveryPublicKey: b4a.toString(identity.profileDiscoveryPublicKey, 'hex'),
    profileProof: '',
    updatedAt: createdAt,
    userId: userIdForIdentity(identity.identityPublicKey),
    username: profileInput.username,
    version: identityVersion
  }
  record.profileProof = profileProofForIdentity(record)
  identity.clear()
  return record
}

function profileProofForIdentity(identity) {
  const deviceKeyPair = {
    publicKey: b4a.from(identity.devicePublicKey, 'hex'),
    secretKey: b4a.from(identity.deviceSecretKey, 'hex')
  }
  const proof = b4a.from(identity.deviceProof, 'base64')
  const profileBytes = b4a.from(
    JSON.stringify({
      displayName: identity.displayName,
      avatarDataUrl: identity.avatarDataUrl || '',
      devicePublicKey: identity.devicePublicKey,
      identityPublicKey: identity.identityPublicKey,
      profileDiscoveryPublicKey: identity.profileDiscoveryPublicKey,
      updatedAt: identity.updatedAt,
      userId: identity.userId,
      username: identity.username
    })
  )
  return b4a.toString(IdentityKey.attestData(profileBytes, deviceKeyPair, proof), 'base64')
}

function cleanProfileInput(input = {}) {
  const username = cleanUsername(input.username || input.displayName || input.nickname)
  return {
    avatarDataUrl: cleanAvatarDataUrl(input.avatarDataUrl),
    displayName: cleanDisplayName(input.displayName || input.nickname || username),
    username
  }
}

function sanitizeStoredIdentity(identity) {
  if (!identity || typeof identity !== 'object') return null

  const username = cleanUsername(identity.username || identity.displayName)
  const displayName = cleanDisplayName(identity.displayName || username)
  if (!username || !displayName) return null

  const clean = {
    createdAt: Number.isFinite(identity.createdAt) ? identity.createdAt : Date.now(),
    deviceProof: cleanBase64(identity.deviceProof, 4096),
    devicePublicKey: cleanHex(identity.devicePublicKey, 32),
    deviceSecretKey: cleanHex(identity.deviceSecretKey, 64),
    displayName,
    avatarDataUrl: cleanAvatarDataUrl(identity.avatarDataUrl),
    identityPublicKey: cleanHex(identity.identityPublicKey || identity.publicKey, 32),
    mnemonic: typeof identity.mnemonic === 'string' ? identity.mnemonic : '',
    profileDiscoveryPublicKey: cleanHex(identity.profileDiscoveryPublicKey, 32),
    profileProof: cleanBase64(identity.profileProof, 4096),
    updatedAt: Number.isFinite(identity.updatedAt) ? identity.updatedAt : Date.now(),
    userId: cleanUserId(identity.userId),
    username,
    version: identityVersion
  }

  if (
    !clean.mnemonic ||
    !clean.deviceProof ||
    !clean.devicePublicKey ||
    !clean.deviceSecretKey ||
    !clean.identityPublicKey
  ) {
    return null
  }

  if (!clean.profileDiscoveryPublicKey) clean.profileDiscoveryPublicKey = clean.identityPublicKey
  if (!clean.userId) clean.userId = userIdForIdentity(b4a.from(clean.identityPublicKey, 'hex'))
  return clean
}

function cleanUsername(value) {
  return String(value || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 20)
}

function cleanDisplayName(value) {
  return String(value || '')
    .trim()
    .replace(/^@+/, '')
    .replace(/\s+/g, '_')
    .replace(/[^a-zA-Z0-9_]/g, '')
    .slice(0, 24)
}

function cleanUserId(value) {
  const userId = typeof value === 'string' ? value.trim() : ''
  return /^[a-z0-9_-]{6,48}$/i.test(userId) ? userId : ''
}

function cleanHex(value, bytes) {
  const hex = typeof value === 'string' ? value.trim().toLowerCase() : ''
  const chars = bytes * 2
  return new RegExp(`^[0-9a-f]{${chars}}$`).test(hex) ? hex : ''
}

function cleanBase64(value, maxLength) {
  const raw = typeof value === 'string' ? value.trim() : ''
  return raw && raw.length <= maxLength ? raw : ''
}

function userIdForIdentity(identityPublicKey) {
  const hash = b4a.alloc(sodium.crypto_hash_sha256_BYTES)
  sodium.crypto_hash_sha256(hash, identityPublicKey)
  return `fan_${b4a.toString(hash.subarray(0, 8), 'hex')}`
}

function requirePath() {
  if (typeof Bare !== 'undefined') return require('bare-path')
  return require('path')
}

function requireFs() {
  if (typeof Bare !== 'undefined') return require('bare-fs')
  return require('fs/promises')
}

module.exports = {
  TifoIdentity
}
