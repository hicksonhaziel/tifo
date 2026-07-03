const path = requirePath()
const fs = requireFs()
const b4a = require('b4a')
const crypto = require('hypercore-crypto')
const sodium = require('sodium-universal')

const mailboxVersion = 1
const maxEnvelopeCount = 1600
const maxCipherBytes = 16 * 1024 * 1024

class TifoMailbox {
  constructor(options = {}) {
    this.dir = options.dir
    this.now = options.now || Date.now
    this.file = path.join(this.dir, 'mailbox.json')
    this.profile = null
    this.contacts = new Map()
    this.knownRooms = new Map()
    this.envelopes = new Map()
    this.readyPromise = null
    this.writePromise = Promise.resolve()
  }

  ready() {
    if (this.readyPromise) return this.readyPromise

    this.readyPromise = fs
      .mkdir(this.dir, { recursive: true })
      .then(() => fs.readFile(this.file, 'utf8').catch(() => ''))
      .then((raw) => {
        if (!raw) return
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed.contacts)) {
          for (const contact of parsed.contacts) this.rememberContact(contact, { persist: false })
        }
        if (Array.isArray(parsed.envelopes)) {
          for (const envelope of parsed.envelopes) this.storeEnvelopeSync(envelope)
        }
      })
      .catch(() => {})

    return this.readyPromise
  }

  async setProfile(profile) {
    await this.ready()
    this.profile = cleanProfile(profile)
    if (this.profile) this.rememberContact(this.profile, { persist: false })
    this.refreshContactDms()
    await this.persist()
  }

  async setKnownRooms(rooms = []) {
    await this.ready()
    for (const room of rooms) this.rememberRoom(room)
    this.refreshContactDms()
    await this.persist()
    return this.knownTopicHashes()
  }

  rememberRooms(rooms = []) {
    return this.setKnownRooms(rooms)
  }

  rememberRoom(room) {
    const clean = cleanRoom(room)
    if (!clean) return null

    const topicHash = topicHashForRoom(clean)
    this.knownRooms.set(topicHash, {
      ...clean,
      topicHash
    })
    return this.knownRooms.get(topicHash)
  }

  rememberContact(contact, options = {}) {
    const clean = cleanProfile(contact)
    if (!clean?.publicKey) return null
    const existing = this.contacts.get(clean.publicKey) || {}
    const next = {
      ...existing,
      ...clean,
      seenAt: this.now()
    }
    this.contacts.set(next.publicKey, next)
    if (options.persist !== false) this.persist()
    if (this.profile) this.refreshContactDms()
    return next
  }

  rememberContactFromEvent(event) {
    if (!event?.senderKey) return null
    return this.rememberContact({
      displayName: event.sender,
      publicKey: event.senderKey,
      username: event.sender
    })
  }

  refreshContactDms() {
    if (!this.profile?.publicKey) return

    for (const contact of this.contacts.values()) {
      if (!contact.publicKey || contact.publicKey === this.profile.publicKey) continue
      this.rememberRoom(dmRoomForPeer(this.profile, contact))
    }
  }

  knownTopicHashes() {
    return Array.from(this.knownRooms.keys()).sort()
  }

  topicHashForRoom(room) {
    const clean = cleanRoom(room)
    return clean ? topicHashForRoom(clean) : ''
  }

  envelopeIdsForTopics(topicHashes = this.knownTopicHashes()) {
    const topics = new Set(topicHashes.filter(isHashHex))
    return Array.from(this.envelopes.values())
      .filter((envelope) => topics.has(envelope.topicHash))
      .map((envelope) => envelope.id)
      .sort()
  }

  envelopesForTopics(topicHashes = [], knownIds = []) {
    const topics = new Set(topicHashes.filter(isHashHex))
    if (topics.size === 0) return []

    const known = new Set(Array.isArray(knownIds) ? knownIds.filter(isHashHex) : [])
    return Array.from(this.envelopes.values())
      .filter((envelope) => topics.has(envelope.topicHash) && !known.has(envelope.id))
      .sort((left, right) => left.createdAt - right.createdAt)
  }

  createEventEnvelope(room, event) {
    if (!event?.id) return null
    return this.createEnvelope(room, 'event', `event:${event.id}`, {
      event,
      kind: 'event',
      room: publicRoomRecord(room)
    })
  }

  createChatMediaEnvelope(room, media, bytes) {
    if (!media?.mediaRef || !bytes?.byteLength) return null
    return this.createEnvelope(room, 'chat-media', `chat-media:${media.mediaRef}`, {
      kind: 'chat-media',
      media: {
        bytesBase64: b4a.toString(bytes, 'base64'),
        durationMs: media.durationMs || null,
        height: media.height || null,
        kind: media.kind,
        mediaRef: media.mediaRef,
        mimeType: media.mimeType,
        size: media.size,
        width: media.width || null
      },
      room: publicRoomRecord(room)
    })
  }

  async createEnvelope(room, kind, stableId, payload) {
    await this.ready()

    const cleanRoom = this.rememberRoom(room)
    if (!cleanRoom) return null

    const plaintext = b4a.from(JSON.stringify(payload))
    const nonce = crypto.randomBytes(sodium.crypto_secretbox_NONCEBYTES)
    const key = encryptionKeyForRoom(cleanRoom)
    const ciphertext = b4a.alloc(plaintext.byteLength + sodium.crypto_secretbox_MACBYTES)
    sodium.crypto_secretbox_easy(ciphertext, plaintext, nonce, key)

    const envelope = {
      ciphertext: b4a.toString(ciphertext, 'base64'),
      createdAt: this.now(),
      id: sha256Hex(`mailbox:${cleanRoom.topicHash}:${kind}:${stableId}`),
      kind,
      nonce: b4a.toString(nonce, 'base64'),
      topicHash: cleanRoom.topicHash,
      version: mailboxVersion
    }

    const added = this.storeEnvelopeSync(envelope)
    if (added) await this.persist()
    return added ? envelope : null
  }

  async storeEnvelope(envelope) {
    await this.ready()
    const added = this.storeEnvelopeSync(envelope)
    if (added) await this.persist()
    return added
  }

  storeEnvelopeSync(envelope) {
    const clean = cleanEnvelope(envelope)
    if (!clean || this.envelopes.has(clean.id)) return false

    this.envelopes.set(clean.id, clean)
    this.prune()
    return true
  }

  decryptEnvelope(envelope) {
    const clean = cleanEnvelope(envelope)
    if (!clean) return null

    const room = this.knownRooms.get(clean.topicHash)
    if (!room) return null

    const nonce = b4a.from(clean.nonce, 'base64')
    const ciphertext = b4a.from(clean.ciphertext, 'base64')
    if (nonce.byteLength !== sodium.crypto_secretbox_NONCEBYTES) return null
    if (ciphertext.byteLength < sodium.crypto_secretbox_MACBYTES) return null
    if (ciphertext.byteLength > maxCipherBytes) return null

    const plaintext = b4a.alloc(ciphertext.byteLength - sodium.crypto_secretbox_MACBYTES)
    const opened = sodium.crypto_secretbox_open_easy(
      plaintext,
      ciphertext,
      nonce,
      encryptionKeyForRoom(room)
    )
    if (!opened) return null

    try {
      const payload = JSON.parse(b4a.toString(plaintext))
      if (!payload || typeof payload !== 'object') return null
      return {
        envelope: clean,
        payload,
        room
      }
    } catch {
      return null
    }
  }

  async decryptKnownEnvelopes(topicHashes = this.knownTopicHashes()) {
    await this.ready()
    const topics = new Set(topicHashes.filter(isHashHex))
    const records = []
    for (const envelope of this.envelopes.values()) {
      if (!topics.has(envelope.topicHash)) continue
      const record = this.decryptEnvelope(envelope)
      if (record) records.push(record)
    }
    return records
  }

  async eventsForRoom(room) {
    await this.ready()
    const topicHash = this.topicHashForRoom(room)
    if (!topicHash) return []

    const events = []
    for (const record of await this.decryptKnownEnvelopes([topicHash])) {
      if (record.payload.kind !== 'event') continue
      const event = record.payload.event
      if (event?.room === room.code) events.push(event)
    }

    return events.sort((left, right) => {
      const timeDelta = left.timestamp - right.timestamp
      if (timeDelta !== 0) return timeDelta
      return left.localCreatedAt - right.localCreatedAt
    })
  }

  prune() {
    if (this.envelopes.size <= maxEnvelopeCount) return

    const keep = Array.from(this.envelopes.values())
      .sort((left, right) => right.createdAt - left.createdAt)
      .slice(0, maxEnvelopeCount)
    this.envelopes = new Map(keep.map((envelope) => [envelope.id, envelope]))
  }

  persist() {
    this.writePromise = this.writePromise
      .catch(() => {})
      .then(async () => {
        await this.ready()
        await fs.mkdir(this.dir, { recursive: true })
        await fs.writeFile(
          this.file,
          JSON.stringify(
            {
              contacts: Array.from(this.contacts.values()),
              envelopes: Array.from(this.envelopes.values()),
              updatedAt: this.now(),
              version: mailboxVersion
            },
            null,
            2
          )
        )
      })

    return this.writePromise
  }
}

function publicRoomRecord(room) {
  const clean = cleanRoom(room)
  if (!clean) return null
  return {
    code: clean.code,
    kind: clean.kind,
    title: clean.title
  }
}

function cleanRoom(room) {
  if (!room || typeof room !== 'object') return null

  const code = cleanRoomCode(room.code)
  if (!code) return null

  const kind =
    room.kind === 'dm' ? 'dm' : room.kind === 'group' || room.kind === 'private' ? 'group' : 'match'
  const topicKey =
    typeof room.topicKey === 'string' && /^[0-9a-f]{64}$/i.test(room.topicKey.trim())
      ? room.topicKey.trim().toLowerCase()
      : ''
  if ((kind === 'group' || kind === 'dm') && !topicKey) return null

  const title =
    kind === 'dm'
      ? cleanDmTitle(room.title || room.peerHandle)
      : typeof room.title === 'string' && room.title.trim()
        ? room.title.trim().replace(/\s+/g, ' ').slice(0, 64)
        : code

  return {
    code,
    invite: typeof room.invite === 'string' ? room.invite.trim().slice(0, 1400) : '',
    kind,
    title,
    topicKey
  }
}

function cleanProfile(profile) {
  if (!profile || typeof profile !== 'object') return null
  const publicKey =
    typeof profile.publicKey === 'string' && /^[0-9a-f]{64}$/i.test(profile.publicKey.trim())
      ? profile.publicKey.trim().toLowerCase()
      : ''
  if (!publicKey) return null

  const username = cleanUsername(profile.username || profile.displayName || profile.nickname)
  return {
    displayName: username || 'fan',
    publicKey,
    username
  }
}

function dmRoomForPeer(profile, peer) {
  const localKey = profile.publicKey.trim().toLowerCase()
  const peerKey = peer.publicKey.trim().toLowerCase()
  const pair = [localKey, peerKey].sort().join(':')
  const topicKey = sha256Hex(`tifo-dm:v1:${pair}`)
  const username = cleanUsername(peer.username || peer.displayName)

  return {
    code: `DM-${topicKey.slice(0, 20).toUpperCase()}`,
    kind: 'dm',
    title: displayUsername(username) || 'Direct message',
    topicKey
  }
}

function cleanDmTitle(value) {
  const legacyTitle = String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^dm\s+with\s+/i, '')
    .replace(/^direct\s+message\s+with\s+/i, '')
    .replace(/^@+/, '')
  const normalizedLegacyTitle = legacyTitle.toLowerCase()
  const username =
    normalizedLegacyTitle === 'dm' || normalizedLegacyTitle === 'direct message'
      ? ''
      : cleanUsername(legacyTitle)
  return displayUsername(username) || 'Direct message'
}

function cleanUsername(value) {
  return String(value || '')
    .trim()
    .replace(/^@+/, '')
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '')
    .slice(0, 20)
}

function displayUsername(username) {
  const clean = cleanUsername(username)
  if (!clean) return ''
  return clean.slice(0, 1).toUpperCase() + clean.slice(1)
}

function cleanRoomCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
}

function topicHashForRoom(room) {
  const material =
    room.kind === 'group' || room.kind === 'dm'
      ? `${room.kind}:${room.topicKey}`
      : `match:${room.code}`
  return sha256Hex(`tifo-mailbox-topic:v1:${material}`)
}

function encryptionKeyForRoom(room) {
  const material =
    room.kind === 'group' || room.kind === 'dm'
      ? `${room.kind}:${room.topicKey}`
      : `match:${room.code}`
  return sha256Buffer(`tifo-mailbox-key:v1:${material}`)
}

function cleanEnvelope(envelope) {
  if (!envelope || typeof envelope !== 'object') return null
  if (!isHashHex(envelope.id) || !isHashHex(envelope.topicHash)) return null
  if (!['event', 'chat-media'].includes(envelope.kind)) return null
  if (typeof envelope.nonce !== 'string' || typeof envelope.ciphertext !== 'string') return null
  if (envelope.ciphertext.length > Math.ceil(maxCipherBytes * 1.4)) return null

  return {
    ciphertext: envelope.ciphertext,
    createdAt: Number.isFinite(envelope.createdAt) ? envelope.createdAt : Date.now(),
    id: envelope.id,
    kind: envelope.kind,
    nonce: envelope.nonce,
    topicHash: envelope.topicHash,
    version: mailboxVersion
  }
}

function isHashHex(value) {
  return typeof value === 'string' && /^[0-9a-f]{64}$/i.test(value.trim())
}

function sha256Hex(value) {
  return b4a.toString(sha256Buffer(value), 'hex')
}

function sha256Buffer(value) {
  const out = b4a.alloc(sodium.crypto_hash_sha256_BYTES)
  sodium.crypto_hash_sha256(out, b4a.from(String(value)))
  return out
}

module.exports = {
  TifoMailbox,
  dmRoomForPeer,
  topicHashForRoom
}

function requirePath() {
  if (typeof Bare !== 'undefined') return require('bare-path')
  return require('path')
}

function requireFs() {
  if (typeof Bare !== 'undefined') return require('bare-fs')
  return require('fs/promises')
}
