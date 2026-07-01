# TIFO

TIFO is a peer-to-peer living terrace for football fans, built on the Pear stack.

This repo currently starts from the official Pear Electron starter and will be shaped into the TIFO app described in `PLAN.md`.

## Development

Install dependencies:

```sh
npm install
```

Run the app:

```sh
npm start
```

Run multiple local peer instances with separate storage:

```sh
npm start -- --storage /tmp/tifo-amina
npm start -- --storage /tmp/tifo-yassine
npm start -- --storage /tmp/tifo-salma
```

## Pear

The root app has a generated Pear upgrade link in `package.json`.

Core starter pieces:

- `electron/main.js` starts Electron and embedded Pear/Bare workers.
- `electron/preload.js` exposes the renderer bridge.
- `workers/main.js` owns Pear runtime, Corestore, and Hyperswarm setup.
- `renderer/` contains the current placeholder UI.
