# On-device translation (QVAC)

TIFO understands chats and chants in any language **on the user's device** — no cloud inference,
no API keys, nothing leaves the machine. It uses the **QVAC SDK** with **Bergamot** neural machine
translation models.

## Where it runs

The translation service lives in the **Electron main process**
(`electron/qvac-service.js`) and is exposed to the renderer over IPC:

| IPC channel          | Purpose                            |
| -------------------- | ---------------------------------- |
| `qvac:status`        | availability + supported languages |
| `qvac:translateText` | translate a message                |
| `qvac:unload`        | free loaded models                 |

The renderer shows a per-message **"Translate to XX"** action and a target-language selector in the
composer (`renderer/src/components/ChatPanel.jsx`).

## Flow

```
translateText(text, to)
  └─ detect source language (script + keyword heuristics)
  └─ ensure a Bergamot model for the pair is available
        └─ look up the model in the registry (records)
        └─ download the model files once → cache in ~/.qvac/tifo-bergamot/<pair>/
  └─ sdk.loadModel({ modelType: 'nmtcpp-translation', modelConfig, modelSrc })
  └─ sdk.translate({ modelId, text }) → translated text
```

### Language pairs & pivoting

Bergamot ships direct models to/from **English**. For a non-English → non-English pair (e.g.
`fr → es`), TIFO **pivots through English** automatically by loading a pivot model — configured via
`modelConfig.pivotModel`.

### Model source

Models are fetched from the public **Firefox Translations** model registry:

- records: `firefox.settings.services.mozilla.com/v1/buckets/main/collections/translations-models/records`
- attachments: `firefox-settings-attachments.cdn.mozilla.net`

They're validated (size checks) and cached under `~/.qvac/tifo-bergamot/`. Fetches use a timeout
and automatic retry, so a transient blip doesn't fail the whole translation.

## Online once, then offline forever

- The **first** translation for a given language pair needs the internet to download the model.
- After that, the pair is cached and translation runs **fully offline** and locally.
- If the device is offline for a first-time pair, TIFO shows a clear message:
  _"Could not reach the translation model service… connect to the internet once to download the
  model, then it works offline."_

## Packaging note

QVAC ships native addons that run in a Bare worker. The generated bundle lives in `qvac/`
(`worker.bundle.js`, `worker.entry.mjs`, `addons.manifest.json`) — these are **build artifacts**
and are excluded from linting/formatting. Packaging is handled by the QVAC Electron Forge plugin
(see `forge.config.js`).

## Why it matters for TIFO

The World Cup is 48 nations of fans. On-device translation lets a Spanish fan understand a Moroccan
chant — instantly, privately, with no cloud — which is exactly the "atmosphere without Big Tech"
promise. See [demo.md](demo.md) for how to show this live.

## Reference

- QVAC docs: <https://qvac.tether.io> · <https://docs.qvac.tether.io>
