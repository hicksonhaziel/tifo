const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')

const { TifoIdentity } = require('../workers/tifo-identity')
const { TifoMailbox, dmRoomForPeer } = require('../workers/tifo-mailbox')
const { createConversationState } = require('../workers/tifo-conversations')
const { createTifoRoomState } = require('../workers/tifo-room-state')

async function main() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'tifo-smoke-'))

  try {
    const aliceIdentity = new TifoIdentity({ dir: path.join(root, 'alice-identity') })
    const bobIdentity = new TifoIdentity({ dir: path.join(root, 'bob-identity') })
    const alice = await aliceIdentity.ensureProfile({ username: 'hickson' })
    const bob = await bobIdentity.ensureProfile({ username: 'amina' })

    assert.equal(alice.verified, true)
    assert.equal(bob.verified, true)
    assert.match(alice.publicKey, /^[0-9a-f]{64}$/)
    assert.match(alice.devicePublicKey, /^[0-9a-f]{64}$/)
    assert.notEqual(alice.publicKey, bob.publicKey)

    const aliceDm = dmRoomForPeer(alice, bob)
    const bobDm = dmRoomForPeer(bob, alice)
    assert.equal(aliceDm.code, bobDm.code)
    assert.equal(aliceDm.topicKey, bobDm.topicKey)

    const room = {
      code: 'NGA-GHA-R16',
      kind: 'match',
      title: 'Nigeria vs Ghana'
    }
    let aliceLocalEvent = null
    const aliceEvents = []
    const aliceRoom = createTifoRoomState({
      onJoinRoom: () => [],
      onChatMediaSave: ({ bytesBase64, localPath, roomCode, ...payload }) => payload,
      onLocalEvent: (event) => {
        aliceLocalEvent = event
        aliceEvents.push(event)
      },
      send: () => {},
      signEvent: (event) => aliceIdentity.signEvent(event),
      verifyEvent: (event) => aliceIdentity.verifyEvent(event)
    })
    const bobRoom = createTifoRoomState({
      onJoinRoom: () => [],
      send: () => {},
      signEvent: (event) => bobIdentity.signEvent(event),
      verifyEvent: (event) => bobIdentity.verifyEvent(event)
    })

    await aliceRoom.handleCommand({ profile: alice, room, type: 'room:join' })
    await bobRoom.handleCommand({ profile: bob, room, type: 'room:join' })
    await aliceRoom.handleCommand({ text: 'hello from hickson', type: 'chat:send' })

    assert.equal(aliceLocalEvent?.type, 'chat')
    assert.equal(aliceLocalEvent.verified, true)
    assert.match(aliceLocalEvent.signature, /^[0-9a-f]{128}$/)
    assert.equal(aliceLocalEvent.senderKey, alice.publicKey)

    const remoteEvent = bobRoom.addRemoteEvent(aliceLocalEvent)
    assert.equal(remoteEvent.verified, true)
    assert.equal(remoteEvent.senderKey, alice.publicKey)
    assert.equal(remoteEvent.payload.text, 'hello from hickson')

    await aliceRoom.handleCommand({
      bytesBase64: Buffer.from('fake-image').toString('base64'),
      clientId: 'image-client',
      height: 1,
      kind: 'image',
      mediaRef: 'image-ref',
      mimeType: 'image/png',
      size: 10,
      type: 'chat-media:save',
      width: 1
    })
    const imageEvent = aliceEvents.find((event) => event.payload?.mediaRef === 'image-ref')
    assert.equal(imageEvent.type, 'chat-media')
    assert.equal(imageEvent.payload.kind, 'image')
    assert.equal(imageEvent.verified, true)
    const remoteImageEvent = bobRoom.addRemoteEvent(imageEvent)
    assert.equal(remoteImageEvent.payload.kind, 'image')
    assert.equal(remoteImageEvent.verified, true)

    await aliceRoom.handleCommand({
      bytesBase64: Buffer.from('fake-voice').toString('base64'),
      clientId: 'voice-client',
      durationMs: 1200,
      kind: 'voice',
      mediaRef: 'voice-ref',
      mimeType: 'audio/webm',
      size: 10,
      type: 'chat-media:save'
    })
    const voiceEvent = aliceEvents.find((event) => event.payload?.mediaRef === 'voice-ref')
    assert.equal(voiceEvent.type, 'chat-media')
    assert.equal(voiceEvent.payload.kind, 'voice')
    assert.equal(voiceEvent.verified, true)
    const remoteVoiceEvent = bobRoom.addRemoteEvent(voiceEvent)
    assert.equal(remoteVoiceEvent.payload.kind, 'voice')
    assert.equal(remoteVoiceEvent.verified, true)

    const delayedEvents = []
    const delayedRoom = createTifoRoomState({
      onChatMediaSave: ({ bytesBase64, localPath, roomCode, ...payload }) =>
        new Promise((resolve) => setTimeout(() => resolve(payload), 40)),
      onJoinRoom: () => [],
      onLocalEvent: (event) => delayedEvents.push(event),
      send: () => {},
      signEvent: (event) => aliceIdentity.signEvent(event),
      verifyEvent: (event) => aliceIdentity.verifyEvent(event)
    })
    await delayedRoom.handleCommand({ profile: alice, room, type: 'room:join' })
    const delayedMedia = delayedRoom.handleCommand({
      bytesBase64: Buffer.from('slow-image').toString('base64'),
      clientId: 'slow-image-client',
      height: 1,
      kind: 'image',
      mediaRef: 'slow-image-ref',
      mimeType: 'image/png',
      size: 10,
      type: 'chat-media:save',
      width: 1
    })
    await delayedRoom.handleCommand({ text: 'text after slow media', type: 'chat:send' })
    assert.equal(
      delayedEvents.some(
        (event) => event.type === 'chat' && event.payload.text === 'text after slow media'
      ),
      true
    )
    await delayedMedia
    assert.equal(
      delayedEvents.some(
        (event) => event.type === 'chat-media' && event.payload.mediaRef === 'slow-image-ref'
      ),
      true
    )

    const aliceMailbox = new TifoMailbox({ dir: path.join(root, 'alice-mailbox') })
    const bobMailbox = new TifoMailbox({ dir: path.join(root, 'bob-mailbox') })
    await aliceMailbox.setProfile(alice)
    await bobMailbox.setProfile(bob)
    await aliceMailbox.setKnownRooms([room])
    await bobMailbox.setKnownRooms([room])

    const envelope = await aliceMailbox.createEventEnvelope(room, aliceLocalEvent)
    assert.ok(envelope)
    await bobMailbox.storeEnvelope(envelope)
    const mailboxEvents = await bobMailbox.eventsForRoom(room)
    assert.equal(
      mailboxEvents.some((event) => event.id === aliceLocalEvent.id),
      true
    )

    const conversations = createConversationState({ now: () => 12345 })
    const typing = conversations.cleanTyping(conversations.typingMessage(room, alice, true))
    const read = conversations.cleanRead(conversations.readMessage(room, bob, 12340))
    assert.equal(typing.typing, true)
    assert.equal(typing.user.publicKey, alice.publicKey)
    assert.equal(read.readAt, 12340)
    assert.equal(read.user.publicKey, bob.publicKey)

    console.log('smoke:two-window passed')
  } finally {
    await fs.rm(root, { force: true, recursive: true })
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
