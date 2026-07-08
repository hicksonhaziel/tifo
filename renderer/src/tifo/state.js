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
    knownProfiles: {},
    nickname: profile?.displayName || profile?.username || '',
    roomCode: '',
    roomInvite: '',
    roomAvatarDataUrl: '',
    roomKind: 'match',
    roomTitle: '',
    appPeerCount: 0,
    matchRooms: options.matchRooms || [],
    recentPrivateRooms: options.recentPrivateRooms || [],
    workerStatus: 'starting',
    syncStatus: 'Waiting for worker',
    syncDiagnostics: {
      appPeers: 0,
      inflightEvents: 0,
      knownMailboxTopics: 0,
      lastSyncAt: null,
      mailboxTopicPreview: [],
      pendingEvents: 0,
      pendingTransfers: {
        chants: 0,
        chatMedia: 0,
        clips: 0
      },
      roomPeers: 0,
      roomTopic: '',
      timestamp: null
    },
    peerCount: 0,
    events: [],
    chatDraft: '',
    chatReply: null,
    notifications: {
      items: [],
      unreadCount: 0
    },
    readReceipts: {},
    typingUsers: [],
    chatMedia: {
      imageError: '',
      imageStatus: 'idle',
      voiceElapsedMs: 0,
      voiceError: '',
      voiceStatus: 'idle'
    },
    qvac: {
      available: false,
      error: '',
      languages: [],
      lastProgress: '',
      status: 'idle',
      targetLanguage: 'en',
      translations: {}
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
