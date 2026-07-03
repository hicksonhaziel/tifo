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
    const aliceRoom = createTifoRoomState({
      onJoinRoom: () => [],
      onLocalEvent: (event) => {
        aliceLocalEvent = event
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
