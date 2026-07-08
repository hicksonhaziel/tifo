# Live demo script

A tight ~3-minute run that shows real Pears depth + on-device QVAC, ending on the emotional
"Replay Echo" beat. Rehearse it so it runs without narration crutches.

## Setup (before you present)

Launch 3–4 instances, each as a different fan:

```sh
npm start -- --storage /tmp/tifo-amina
npm start -- --storage /tmp/tifo-yassine
npm start -- --storage /tmp/tifo-salma
```

- Onboard each with a distinct name (Amina, Yassine, Salma…).
- In Amina's window, create a match room — e.g. **MAR vs ESP — R16** — and copy the invite.
- Join that room in the other windows.
- Pre-download the translation model once (translate any non-English message) so the live demo is
  instant and offline.

## The run

1. **The terrace fills up.** Show the room; point at the **peer count** climbing as each fan
   joins. "No server — they found each other directly over Hyperswarm."
2. **Live chat + reactions.** Send a few messages across windows; fire a **Goal flare** — it's felt
   across every window in real time.
3. **A chant.** Record a short chant in one window ("Dima Maghrib!"); it lands in the room's
   timeline.
4. **Understand every fan (QVAC).** Have one fan send a message in Spanish or French; in another
   window tap **Translate** — it resolves **on-device**, no cloud. "48 nations, everyone
   understood, nothing leaves the device."
5. **The Echo.** Open the **Replay** tab → **Replay latest Echo**. The full-screen theater opens:
   the echo-ripple stage, progress bar and cue rail replay the goal moment — chants, flares and
   clips **in sync**, exactly as the room lived it.
6. **Offline-first.** Toggle simulate-offline in one window, send a reaction, then reconnect —
   show the pending count catch up. "Stadium Wi-Fi dies; the terrace doesn't."
7. **Close on the line:** *"TIFO doesn't just connect fans. It builds the terrace — and preserves
   the echo. Peer to peer."*

## Backup plans

- If audio recording is flaky, use a pre-recorded chant already in the room.
- If a first-time translation would need the network, rely on the **pre-downloaded** model from
  setup (it's cached and offline).
- If multi-device is risky, run all instances locally on one machine (that's the intended demo).

## What each beat proves to judges

| Beat | Judging criterion |
| --- | --- |
| Peers connect, no server | Real use of the Pears track |
| Autobase Echo replay | Technical ambition |
| On-device translation | Real use of QVAC (Local AI) |
| Offline → reconnect sync | Real-world utility |
| The synchronized replay | Creativity + the "wow" moment |
