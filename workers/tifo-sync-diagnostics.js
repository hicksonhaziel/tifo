function createSyncDiagnostics(input = {}) {
  const now = input.now || Date.now()
  const mailboxTopicHashes = Array.isArray(input.mailboxTopicHashes) ? input.mailboxTopicHashes : []
  const pendingEventIds = Array.isArray(input.pendingEventIds) ? input.pendingEventIds : []
  const inflightEventIds = Array.isArray(input.inflightEventIds) ? input.inflightEventIds : []
  const pendingTransfers = input.pendingTransfers || {}

  return {
    appPeers: count(input.appPeers),
    inflightEvents: inflightEventIds.length,
    knownMailboxTopics: mailboxTopicHashes.length,
    lastSyncAt: Number.isFinite(input.lastSyncAt) ? input.lastSyncAt : null,
    mailboxTopicPreview: mailboxTopicHashes.slice(0, 5),
    pendingEvents: pendingEventIds.length,
    pendingTransfers,
    roomPeers: count(input.roomPeers),
    roomTopic: input.roomTopic || '',
    timestamp: now
  }
}

function count(value) {
  if (Number.isFinite(value)) return value
  if (value && typeof value.size === 'number') return value.size
  return 0
}

module.exports = {
  createSyncDiagnostics
}
