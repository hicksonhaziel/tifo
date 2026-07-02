export const workers = {
  main: '/workers/main.js'
}

export const reactionTypes = [
  { type: 'goal', label: 'Goal', tone: 'ignite', cue: 'Terrace eruption' },
  { type: 'save', label: 'Save', tone: 'clean', cue: 'Safe hands' },
  { type: 'penalty', label: 'Penalty', tone: 'warning', cue: 'Pressure rising' },
  { type: 'var', label: 'VAR', tone: 'warning', cue: 'Decision pending' },
  { type: 'red-card', label: 'Red card', tone: 'danger', cue: 'The room turns' },
  { type: 'full-time', label: 'Full-time', tone: 'clean', cue: 'Whistle blown' },
  { type: 'heartbreak', label: 'Heartbreak', tone: 'cold', cue: 'Terrace drop' },
  { type: 'flare', label: 'Flare', tone: 'ignite', cue: 'Stand lit' }
]

export const CHANT_MIN_MS = 3000
export const CHANT_MAX_MS = 10000
export const FALLBACK_CHANT_MS = 3600
export const VOICE_NOTE_MIN_MS = 800
export const VOICE_NOTE_MAX_MS = 60 * 1000
export const CHAT_IMAGE_MAX_BYTES = 10 * 1024 * 1024
export const CHAT_VOICE_MAX_BYTES = 5 * 1024 * 1024
export const CLIP_MAX_BYTES = 64 * 1024 * 1024
export const CLIP_MAX_DURATION_MS = 5 * 60 * 1000
export const CLIP_PATH_STORAGE_KEY = 'tifo:clip-paths'
export const REPLAY_WINDOW_BEFORE_MS = 5000
export const REPLAY_WINDOW_AFTER_MS = 25000
export const REPLAY_DURATION_MS = 12000
export const REPLAY_MIN_STEP_MS = 520
