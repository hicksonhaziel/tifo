export function clipDraftIdle(overrides = {}) {
  return {
    caption: '',
    error: '',
    status: 'idle',
    ...overrides
  }
}

export function replayIdleState() {
  return {
    active: false,
    activeEventId: '',
    anchorId: '',
    anchorLabel: '',
    cueCount: 0,
    cues: [],
    detail: '',
    error: '',
    mode: 'idle',
    messages: [],
    progress: 0,
    title: '',
    windowLabel: ''
  }
}

export function createInitialState(options = {}) {
  const profile = options.profile || null

  return {
    view: profile ? 'home' : 'welcome',
    profile,
    nickname: profile?.displayName || profile?.username || '',
    roomCode: '',
    roomInvite: '',
    roomKind: 'match',
    roomTitle: '',
    appPeerCount: 0,
    recentPrivateRooms: options.recentPrivateRooms || [],
    workerStatus: 'starting',
    syncStatus: 'Waiting for worker',
    peerCount: 0,
    events: [],
    chatDraft: '',
    chatReply: null,
    chatMedia: {
      imageError: '',
      imageStatus: 'idle',
      voiceElapsedMs: 0,
      voiceError: '',
      voiceStatus: 'idle'
    },
    clipDraft: clipDraftIdle(),
    offline: {
      detail: 'Network searching',
      enabled: false,
      lastFlushCount: 0,
      pendingCount: 0,
      pendingEventIds: new Set()
    },
    chantRecorder: {
      elapsedMs: 0,
      error: '',
      status: 'idle'
    },
    replayPreview: replayIdleState(),
    effects: [],
    lastError: ''
  }
}
