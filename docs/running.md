# Running & development

## Prerequisites

- **Node.js ≥ 20**, **npm ≥ 10**
- Linux, macOS, or Windows
- Internet **once** for the first QVAC translation (model download) — optional for the core P2P demo

## Install & run

```sh
npm install
npm start        # builds the renderer (Vite) then launches Electron + the Bare worker
```

`npm start` runs `build:renderer` then `electron-forge start -- --no-updates`.

### Iterating on the UI

The renderer is a standard Vite build. To rebuild just the UI:

```sh
npm run build:renderer   # outputs to renderer-dist/
```

## The multi-peer demo (most important)

Each running instance is a separate "device" identified by its **storage directory**. Give every
instance its own `--storage` path:

```sh
npm start -- --storage /tmp/tifo-amina
npm start -- --storage /tmp/tifo-yassine
npm start -- --storage /tmp/tifo-salma
```

Then, in each window:

1. Complete onboarding (pick a username — stored on that device only).
2. Create a match room in one window; copy its invite from the header.
3. Join the same room in the others (paste the invite, or use the same room code).
4. Watch the **peer count** rise and chat/reactions/Echo timeline sync directly between them.

> Tip: there's also `npm run smoke:two-window` to launch two instances quickly for a sanity check.

### Where data lives

With `--storage <dir>`, everything for that instance is under `<dir>`:

- `pear-runtime/corestore` — Hypercores (events, Autobase view)
- `tifo-identity`, `tifo-mailbox`, `tifo-chants`, `tifo-chat-media`, `tifo-clips`

QVAC translation models are shared across instances in `~/.qvac/tifo-bergamot/`.

To reset an instance, delete its storage directory.

## Simulating offline / reconnect

Inside a room, the offline controls let you queue events locally and then reconnect to show
catch-up sync — a clean way to demo offline-first resilience without pulling a cable.

## Linting & formatting

```sh
npm run lint     # prettier --check . && lunte
npm run format   # prettier --write . && lunte --fix
```

Generated artifacts (`renderer-dist/`, `qvac/worker.bundle.js`, …) are excluded via
`.prettierignore` / `.lunteignore`.

## Packaging

```sh
npm run package  # electron-forge package (current platform)
npm run make     # build distributables (AppImage / dmg / msix, per forge.config.js)
```

Packaging bundles the QVAC worker and prunes native prebuilds for the target platform via the QVAC
Electron Forge plugin. Note that ASAR is disabled because the Bare worker loads native addons from
real files on disk.

## Troubleshooting

| Symptom                                                      | Fix                                                                                     |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| Translation: "Could not reach the translation model service" | Connect to the internet once so the Bergamot model can download; it's cached afterward. |
| "File descriptor could not be locked" (QVAC)                 | Another TIFO instance is holding the shared model cache — close the extra instance.     |
| Peers don't connect                                          | Check both instances joined the same room/topic and aren't in "simulate offline".       |
| Want a clean slate                                           | Delete the instance's `--storage` directory.                                            |
