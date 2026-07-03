const b4a = require('b4a')
const crypto = require('hypercore-crypto')
const IdentityKey = require('keet-identity-key')

const signatureVersion = 1

function signableEvent(event) {
  return {
    id: stringField(event.id),
    payload: sanitizePayload(event.payload),
    room: stringField(event.room),
    sender: stringField(event.sender),
    senderDeviceKey: stringField(event.senderDeviceKey),
    senderId: stringField(event.senderId),
    senderIdentityKey: stringField(event.senderIdentityKey),
    senderKey: stringField(event.senderKey),
    timestamp: numberField(event.timestamp),
    type: stringField(event.type),
    version: numberField(event.version) || 1
  }
}

function signingBufferForEvent(event) {
  return b4a.from(stableStringify(signableEvent(event)))
}

function signEvent(event, identity) {
  if (!identity?.deviceSecretKey || !identity?.devicePublicKey || !identity?.identityPublicKey) {
    return {
      ...event,
      verified: false
    }
  }

  const next = {
    ...event,
    senderDeviceKey: identity.devicePublicKey,
    senderIdentityKey: identity.identityPublicKey,
    senderKey: identity.identityPublicKey,
    signatureVersion
  }
  const signable = signingBufferForEvent(next)
  const deviceKeyPair = {
    publicKey: b4a.from(identity.devicePublicKey, 'hex'),
    secretKey: b4a.from(identity.deviceSecretKey, 'hex')
  }
  const deviceProof = b4a.from(identity.deviceProof, 'base64')
  const eventProof = IdentityKey.attestData(signable, deviceKeyPair, deviceProof)

  return {
    ...next,
    eventProof: b4a.toString(eventProof, 'base64'),
    signature: b4a.toString(crypto.sign(signable, deviceKeyPair.secretKey), 'hex'),
    verified: true
  }
}

function verifyEvent(event) {
  if (!event || typeof event !== 'object') return verification(false, 'missing event')

  const identityKey = hexKey(event.senderIdentityKey || event.senderKey)
  const deviceKey = hexKey(event.senderDeviceKey)
  const signature = hexSignature(event.signature)
  const eventProof =
    typeof event.eventProof === 'string' && event.eventProof.length <= 4096 ? event.eventProof : ''

  if (!identityKey || !deviceKey || !signature || !eventProof) {
    return verification(false, 'unsigned')
  }

  if (event.senderKey && hexKey(event.senderKey) !== identityKey) {
    return verification(false, 'sender key mismatch')
  }

  const signable = signingBufferForEvent({
    ...event,
    senderIdentityKey: identityKey,
    senderDeviceKey: deviceKey,
    senderKey: identityKey
  })

  const devicePublicKey = b4a.from(deviceKey, 'hex')
  const signatureBytes = b4a.from(signature, 'hex')
  if (!crypto.verify(signable, signatureBytes, devicePublicKey)) {
    return verification(false, 'bad signature')
  }

  const proofInfo = IdentityKey.verify(b4a.from(eventProof, 'base64'), signable, {
    expectedDevice: devicePublicKey,
    expectedIdentity: b4a.from(identityKey, 'hex')
  })

  if (!proofInfo) return verification(false, 'bad identity proof')

  return verification(true, 'verified')
}

function publicIdentityFields(identity) {
  if (!identity) return {}

  return {
    deviceProof: identity.deviceProof || '',
    devicePublicKey: identity.devicePublicKey || '',
    identityPublicKey: identity.identityPublicKey || '',
    profileDiscoveryPublicKey: identity.profileDiscoveryPublicKey || '',
    profileProof: identity.profileProof || ''
  }
}

function verification(verified, reason) {
  return { reason, verified }
}

function hexKey(value) {
  const key = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return /^[0-9a-f]{64}$/.test(key) ? key : ''
}

function hexSignature(value) {
  const signature = typeof value === 'string' ? value.trim().toLowerCase() : ''
  return /^[0-9a-f]{128}$/.test(signature) ? signature : ''
}

function stringField(value) {
  return typeof value === 'string'
    ? value
    : value === null || value === undefined
      ? ''
      : String(value)
}

function numberField(value) {
  return Number.isFinite(value) ? Math.round(value) : 0
}

function sanitizePayload(value) {
  if (!value || typeof value !== 'object') return {}
  return value
}

function stableStringify(value) {
  return JSON.stringify(sortValue(value))
}

function sortValue(value) {
  if (Array.isArray(value)) return value.map(sortValue)
  if (!value || typeof value !== 'object') return value

  return Object.keys(value)
    .sort()
    .reduce((record, key) => {
      const next = value[key]
      if (next === undefined) return record
      record[key] = sortValue(next)
      return record
    }, {})
}

module.exports = {
  publicIdentityFields,
  signEvent,
  signableEvent,
  signingBufferForEvent,
  signatureVersion,
  verifyEvent
}
