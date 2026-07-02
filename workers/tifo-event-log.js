const b4a = require('b4a')
const crypto = require('hypercore-crypto')

class TifoEventLog {
  constructor(store) {
    this.store = store.namespace('tifo-events')
    this.core = null
    this.roomCode = null
    this.appendQueue = Promise.resolve()
  }

  async openRoom(roomCode) {
    await this.closeRoom()

    this.roomCode = roomCode
    this.core = this.store.get({
      name: roomLogName(roomCode)
    })
    await this.core.ready()

    return this.readAll()
  }

  async readAll() {
    if (!this.core) return []

    const events = []
    for (let index = 0; index < this.core.length; index++) {
      const block = await this.core.get(index, { wait: false })
      const event = decodeEvent(block, this.roomCode)
      if (event) events.push(event)
    }

    return events
  }

  append(event) {
    if (!this.core || !event || event.room !== this.roomCode) return Promise.resolve()

    this.appendQueue = this.appendQueue
      .catch(() => {})
      .then(async () => {
        await this.core.append(b4a.from(JSON.stringify(event)))
      })

    return this.appendQueue
  }

  async closeRoom() {
    await this.appendQueue.catch(() => {})
    this.appendQueue = Promise.resolve()

    if (this.core?.close) await this.core.close()
    this.core = null
    this.roomCode = null
  }
}

function roomLogName(roomCode) {
  return b4a.toString(
    crypto.namespace(`tifo-event-log:${roomCode.trim().toUpperCase()}`, 1)[0],
    'hex'
  )
}

function decodeEvent(block, roomCode) {
  try {
    const event = JSON.parse(block.toString())
    if (!event || typeof event !== 'object') return null
    if (event.room !== roomCode) return null
    if (typeof event.id !== 'string' || event.id.trim() === '') return null
    if (!['chat', 'chant', 'reaction', 'system'].includes(event.type)) return null
    if (!event.payload || typeof event.payload !== 'object') return null
    return {
      ...event,
      status: event.status || 'stored'
    }
  } catch {
    return null
  }
}

module.exports = {
  TifoEventLog
}
