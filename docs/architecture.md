# Architecture

TIFO is a desktop app with three cooperating processes and a strict "local-first, peer-to-peer"
data model. Nothing depends on a central server.

## Process model

```
Electron main  ──spawns──▶  Bare worker (Pear runtime)
     │  (electron/main.js)        │  (workers/main.js)
     │                            │
     │  contextBridge             │  Corestore · Hyperswarm · Autobase
     ▼  (electron/preload.js)     ▼
Renderer (React)  ◀──framed IPC──▶  (all P2P + storage lives here)
  (renderer/src)
```

### 1. Electron main — `electron/main.js`

- Boots the app window and spawns the **Bare worker** with `pear-runtime`, wiring a
  `framed-stream` duplex pipe for IPC.
- Hosts the **QVAC translation service** (`electron/qvac-service.js`) in the main process and
  exposes it over IPC (`qvac:translateText`, `qvac:status`, …).
- Owns desktop concerns: notifications, badge count, single-instance lock, and opening external
  web links in the system browser (`setWindowOpenHandler` → `shell.openExternal`).

### 2. Bare worker — `workers/main.js`

The P2P brain. Runs in the Pear/Bare runtime (not Node) and never touches the DOM. It owns:

- **Corestore** — local Hypercore storage under `pear-runtime/corestore`.
- **Three Hyperswarm instances** — OTA updates, **app presence**, and the **active room**.
- **Protomux** — a `tifo-room-control-v1` protocol channel per room connection, plus an
  app-level `tifo-app-mailbox-v1` channel.
- **Autobase Echo timeline** — `workers/tifo-echo-timeline.js` (see [pears.md](pears.md)).
- **Mailbox** — `workers/tifo-mailbox.js`, store-and-forward DMs between peers.
- **Identity & signing** — `workers/tifo-identity.js` (keet-identity-key) and
  `workers/tifo-event-signing.js` (sodium signatures on room events).
- **Room state machine** — `workers/tifo-room-state.js` reduces local + remote events into the
  room view the renderer renders.

The worker talks to the renderer by writing JSON frames (`send(type, payload)`); the renderer
sends commands back over the same pipe.

### 3. Renderer — `renderer/src`

React 19 + Vite + Tailwind. The single source of UI truth is **`useTifoController`**
(`renderer/src/hooks/useTifoController.js`) — it holds app state, subscribes to worker frames via
`renderer/src/tifo/worker-client.js`, and exposes `actions` to components.

Key views: onboarding/splash, Home (sidebar + empty state), conversation (DM/group) and match room
(`components/match/*`), and the Replay theater modal.

## The event & data model

Every user action is an **event** appended to the local log and merged across peers:

| Type         | Meaning                                                |
| ------------ | ------------------------------------------------------ |
| `chat`       | text message (supports reply, edit, reactions)         |
| `chat-media` | image or voice note                                    |
| `reaction`   | flare / goal / save / VAR / penalty / full-time / fire |
| `chant`      | short recorded audio                                   |
| `clip`       | highlight video                                        |

Events carry `sender`, `senderKey`, `timestamp`, `room`, and a signature. Media payloads store a
content reference; the bytes transfer peer-to-peer on demand (`chant:load`, `clip:load`,
`chat-media:load`).

## The Echo System

The Echo System is TIFO's differentiator and its deepest use of Pears:

1. Each fan writes their own reactions to their **own local append-only log**.
2. **Autobase** linearizes every participant's log into one **causally-ordered timeline** — with
   no server deciding the order.
3. **Replay Echo** takes an anchor moment, gathers the cues in a time window, and plays them back
   in match order inside a full-screen theater modal (`components/match/ReplayModal.jsx`), with a
   progress bar, a cue rail, and the synchronized message feed.

Because the timeline is peer-merged and stored locally, a fan who joined late — or who was offline
during the goal — can still replay exactly what the terrace felt like.

## Offline-first

- Local appends succeed with zero peers connected.
- Pending events are tracked and flushed automatically when peers reconnect
  (`offline:state` frames drive the UI indicators).
- A "simulate offline" toggle exists for demoing reconnect/catch-up.

See [pears.md](pears.md) for the networking specifics and [qvac.md](qvac.md) for on-device AI.
