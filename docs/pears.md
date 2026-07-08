# How TIFO uses the Pears stack

TIFO is built on the **Pears track** building blocks — Hyperswarm, Hypercore and Autobase — plus
Corestore and Protomux. This is a _deep_ use of the stack, not a Tether-logo-on-a-chat-app.

## Hyperswarm — peer discovery & transport

TIFO runs (in `workers/main.js`) up to three swarms, each for a distinct concern:

| Swarm       | Topic                  | Purpose                                  |
| ----------- | ---------------------- | ---------------------------------------- |
| `swarm`     | updater discovery key  | OTA app updates (Pear)                   |
| `appSwarm`  | `tifo-app-presence:v1` | app-wide presence + mailbox/DM discovery |
| `roomSwarm` | `tifo-room:{code}`     | the currently open room                  |

Topics are derived deterministically so two peers who type the same room code find each other:

```js
const crypto = require('hypercore-crypto')
const topic = crypto.namespace(`tifo-room:${topicKey}`, 1)[0] // 32-byte discovery topic
swarm.join(topic, { client: true, server: true })
```

On every `connection`, TIFO both replicates Corestore and opens a **Protomux** control channel.

## Protomux — the room control protocol

Rather than raw sockets, TIFO multiplexes typed messages over each encrypted connection:

- `tifo-room-control-v1` — room snapshots, chat/reaction/typing/read events, media-transfer
  negotiation.
- `tifo-app-mailbox-v1` — identity exchange, known-room announcements, and mailbox envelopes for
  DMs.

Each channel uses `compact-encoding` (`c.json`) messages, so adding a new message type is a
one-liner and stays forward-compatible.

## Hypercore + Corestore — local-first storage

A single **Corestore** (`pear-runtime/corestore`) manages every Hypercore the app opens: the
per-writer event logs, the Autobase view, and media metadata. Corestore also provides the one
replication stream handed to each swarm connection:

```js
swarm.on('connection', (conn) => store.replicate(conn))
```

Append-only Hypercores give TIFO verifiable, tamper-evident history for free — every event a fan
appends is theirs, signed, and replayable.

## Autobase — the multi-writer Echo timeline

`workers/tifo-echo-timeline.js` wraps **Autobase** to merge many fans' independent logs into one
shared, causally-ordered view — the heart of the Echo System.

Why Autobase (and not just one Hypercore)? Because the hard problem is **merging many writers**:

> "Every fan writes their own chant, flare, and celebration into their own local log. TIFO merges
> every fan's log — live, with no server — into the single shared match memory the whole room can
> replay."

Autobase's `apply` handler is kept deterministic (it only derives view state from the ordered
nodes), so every peer converges on the same timeline even as new causal information arrives.

## Offline-first & reconnection

- Writes never block on the network — a fan can chant into an empty room and it's saved locally.
- When peers appear, Corestore replication + Autobase linearization catch everyone up
  automatically; TIFO surfaces pending/caught-up counts through `offline:state` frames.
- Media bytes (chants, clips, images) transfer lazily peer-to-peer when a fan chooses to load them,
  keeping the control protocol light.

## Identity & encryption

- Connections are end-to-end encrypted by Hyperswarm's Noise transport.
- Fan identity uses **keet-identity-key**; room events are signed with **sodium-universal** so a
  message's sender can be verified by any peer (`workers/tifo-event-signing.js`).
- Private rooms and DMs use invite keys instead of public fixture topics.

## Reference

- Pears docs: <https://docs.pears.com>
- Building blocks: Hyperswarm, Hypercore, Autobase, Corestore, Protomux, HyperDHT.
