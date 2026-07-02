const Autobase = require('autobase')
const b4a = require('b4a')
const crypto = require('hypercore-crypto')

class TifoEchoTimeline {
  constructor(store) {
    this.rootStore = store
    this.base = null
    this.metaCore = null
    this.roomCode = null
    this.appendQueue = Promise.resolve()
    this.pendingRecords = []
    this.replicationMuxes = new Set()
    this.knownWriterKeys = new Set()
    this.onUpdate = noop
    this.updateQueue = Promise.resolve()
    this.generation = 0
  }

  async openRoom(roomCode, options = {}) {
    await this.closeRoom()

    this.roomCode = roomCode
    this.onUpdate = typeof options.onUpdate === 'function' ? options.onUpdate : noop
    await this.openRoomMeta()
    await this.openBase(await this.readSavedBaseKey())
    await this.saveRoomBaseKey(this.baseKey)

    return this.readAll()
  }

  async openRoomMeta() {
    this.metaCore = this.echoStore().get({
      name: roomMetaName(this.roomCode),
      valueEncoding: 'json'
    })
    await this.metaCore.ready()
  }

  async readSavedBaseKey() {
    const core = this.metaCore
    if (!core) return null

    for (let index = core.length - 1; index >= 0; index -= 1) {
      const record = await core.get(index, { wait: false })
      const baseKey = normalizeKeyHex(record?.baseKey)
      if (record?.room === this.roomCode && record?.type === 'room:base' && baseKey) {
        return baseKey
      }
    }

    return null
  }

  async saveRoomBaseKey(baseKey) {
    const nextBaseKey = normalizeKeyHex(baseKey)
    if (!this.metaCore || !this.roomCode || !nextBaseKey) return

    const previousBaseKey = await this.readSavedBaseKey()
    if (previousBaseKey === nextBaseKey) return

    await this.metaCore.append({
      type: 'room:base',
      room: this.roomCode,
      baseKey: nextBaseKey,
      savedAt: Date.now(),
      version: 1
    })
  }

  async openBase(bootstrapKey) {
    const bootstrapKeyHex = normalizeKeyHex(bootstrapKey)
    const echoStore = this.echoStore()
    const baseOptions = {
      ackInterval: 1000,
      valueEncoding: 'json',
      open: openEchoView,
      apply: applyEchoNodes
    }

    if (bootstrapKeyHex) {
      baseOptions.keyPair = await echoStore.createKeyPair(
        `writer:${this.roomCode.trim().toUpperCase()}:${bootstrapKeyHex}`
      )
    }

    this.base = new Autobase(
      echoStore.namespace(roomNamespace(this.roomCode)),
      normalizeKey(bootstrapKeyHex),
      baseOptions
    )

    await this.base.ready()
    this.knownWriterKeys = new Set()
    if (this.localWriterKey) this.knownWriterKeys.add(this.localWriterKey)
    this.base.on('update', () => this.notifyUpdate())
    this.base.on('writable', () => this.flushPendingRecords().catch(() => {}))

    for (const mux of this.replicationMuxes) this.base.replicate(mux)

    await this.base.update()
    await this.flushPendingRecords()
  }

  get baseKey() {
    return this.base?.key ? b4a.toString(this.base.key, 'hex') : null
  }

  get localWriterKey() {
    return this.base?.local?.key ? b4a.toString(this.base.local.key, 'hex') : null
  }

  get writable() {
    return !!this.base?.writable
  }

  getIdentity() {
    return {
      baseKey: this.baseKey,
      writerKey: this.localWriterKey
    }
  }

  replicate(mux) {
    this.replicationMuxes.add(mux)
    if (this.base) this.base.replicate(mux)
  }

  async adoptBase(baseKey) {
    const nextBaseKey = normalizeKeyHex(baseKey)
    if (!nextBaseKey || nextBaseKey === this.baseKey) return false

    const previousEvents = await this.readAll()
    await this.closeBase()
    await this.openBase(nextBaseKey)
    await this.saveRoomBaseKey(nextBaseKey)

    for (const event of previousEvents) this.queueRecord(eventRecord(event))
    await this.flushPendingRecords()
    this.notifyUpdate()
    return true
  }

  async addWriter(writerKey) {
    const nextWriterKey = normalizeKeyHex(writerKey)
    if (!nextWriterKey || nextWriterKey === this.localWriterKey) return false
    if (nextWriterKey === this.baseKey) return false
    if (this.knownWriterKeys.has(nextWriterKey)) return false

    this.knownWriterKeys.add(nextWriterKey)
    this.queueRecord({
      type: 'writer:add',
      writerKey: nextWriterKey
    })
    await this.flushPendingRecords()
    return true
  }

  async readAll() {
    const base = this.base
    if (!base) return []

    await base.update()
    if (this.base !== base) return []

    const events = []
    const seen = new Set()
    for (let index = 0; index < base.view.length; index++) {
      const record = await base.view.get(index, { wait: false })
      const event = decodeEchoEvent(record, this.roomCode)
      if (!event || seen.has(event.id)) continue
      seen.add(event.id)
      events.push(event)
    }

    return events
  }

  append(event) {
    if (!this.base || !event || event.room !== this.roomCode) return Promise.resolve()

    this.queueRecord(eventRecord(event))
    return this.flushPendingRecords()
  }

  refresh() {
    return this.notifyUpdate()
  }

  queueRecord(record) {
    this.pendingRecords.push(record)
  }

  echoStore() {
    return this.rootStore.namespace('tifo-echo')
  }

  flushPendingRecords() {
    this.appendQueue = this.appendQueue
      .catch(() => {})
      .then(async () => {
        if (!this.base || !this.base.writable) return

        while (this.pendingRecords.length > 0 && this.base?.writable) {
          const record = this.pendingRecords.shift()
          await this.base.append(record)
        }

        await this.base.update()
        this.notifyUpdate()
      })

    return this.appendQueue
  }

  async closeRoom() {
    this.generation++
    await this.closeBase()
    if (this.metaCore?.close) await this.metaCore.close()
    this.roomCode = null
    this.metaCore = null
    this.pendingRecords = []
    this.replicationMuxes.clear()
    this.knownWriterKeys.clear()
    this.onUpdate = noop
  }

  async closeBase() {
    await this.appendQueue.catch(() => {})
    this.appendQueue = Promise.resolve()

    if (this.base) await this.base.close()
    this.base = null
  }

  notifyUpdate() {
    const generation = this.generation
    this.updateQueue = this.updateQueue
      .catch(() => {})
      .then(async () => {
        if (generation !== this.generation) return
        if (!this.base || !this.roomCode) return
        this.onUpdate(await this.readAll())
      })

    return this.updateQueue
  }
}

function openEchoView(store) {
  return store.get({
    name: 'echo-timeline',
    valueEncoding: 'json'
  })
}

async function applyEchoNodes(nodes, view, host) {
  for (const node of nodes) {
    const { value } = node
    if (!value) continue

    if (value.addWriter || value.type === 'writer:add') {
      const writerKey = normalizeKey(value.addWriter || value.writerKey)
      if (writerKey) await host.addWriter(writerKey, { indexer: true })
      continue
    }

    if (value.type !== 'event' || !value.event) continue

    await view.append({
      ...value.event,
      echoWriter: node.from?.key ? b4a.toString(node.from.key, 'hex') : null,
      echoLength: node.length
    })
  }
}

function eventRecord(event) {
  return {
    type: 'event',
    event: {
      ...event,
      version: event.version || 1
    }
  }
}

function roomNamespace(roomCode) {
  return b4a.toString(crypto.namespace(`tifo-echo:${roomCode.trim().toUpperCase()}`, 1)[0], 'hex')
}

function roomMetaName(roomCode) {
  return b4a.toString(
    crypto.namespace(`tifo-echo-meta:${roomCode.trim().toUpperCase()}`, 1)[0],
    'hex'
  )
}

function normalizeKey(key) {
  if (!key) return null
  if (b4a.isBuffer(key)) return key
  if (typeof key !== 'string') return null
  const trimmed = key.trim()
  if (!/^[0-9a-f]{64}$/i.test(trimmed)) return null
  return b4a.from(trimmed, 'hex')
}

function normalizeKeyHex(key) {
  const normalized = normalizeKey(key)
  return normalized ? b4a.toString(normalized, 'hex') : null
}

function decodeEchoEvent(record, roomCode) {
  if (!record || typeof record !== 'object') return null
  if (record.room !== roomCode) return null
  if (typeof record.id !== 'string' || record.id.trim() === '') return null
  if (
    ![
      'chat',
      'chat-delete',
      'chat-edit',
      'chat-media',
      'chat-reaction',
      'chant',
      'clip',
      'reaction',
      'system'
    ].includes(record.type)
  ) {
    return null
  }
  if (!record.payload || typeof record.payload !== 'object') return null

  return {
    ...record,
    status: 'stored',
    version: Number.isFinite(record.version) ? record.version : 1
  }
}

function noop() {}

module.exports = {
  TifoEchoTimeline
}
