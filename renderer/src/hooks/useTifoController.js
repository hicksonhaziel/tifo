import { useEffect, useMemo, useRef, useState } from 'react'

import {
  CHANT_MAX_MS,
  CHANT_MIN_MS,
  CHAT_IMAGE_MAX_BYTES,
  CHAT_VOICE_MAX_BYTES,
  CLIP_MAX_BYTES,
  CLIP_MAX_DURATION_MS,
  REPLAY_DURATION_MS,
  REPLAY_MIN_STEP_MS,
  REPLAY_WINDOW_AFTER_MS,
  REPLAY_WINDOW_BEFORE_MS,
  VOICE_NOTE_MAX_MS,
  VOICE_NOTE_MIN_MS,
  reactionTypes
} from '../tifo/constants.js'
import {
  blobToBase64,
  createFallbackChantBlob,
  preferredChantMimeType,
  recordingSupported
} from '../tifo/audio.js'
import {
  clipFileSupported,
  clipMimeType,
  clipRefForFile,
  localPathForClip,
  localPathForFile,
  pathToFileUrl,
  readVideoDuration,
  storeLocalClipPath
} from '../tifo/clips.js'
import {
  eventListSignature,
  eventMeta,
  eventStatus,
  reactionTheme,
  roomMetrics
} from '../tifo/domain.js'
import {
  imageFileSupported,
  imageMimeType,
  mediaRefForBlob,
  mediaRefForFile,
  readImageDimensions
} from '../tifo/media.js'
import { createInitialState, clipDraftIdle, replayIdleState } from '../tifo/state.js'
import { createWorkerClient } from '../tifo/worker-client.js'
import { formatReplayOffset } from '../tifo/format.js'

export function useTifoController() {
  const [appState, setReactState] = useState(() => createInitialState())
  const stateRef = useRef(appState)
  const decoderRef = useRef(new TextDecoder('utf-8'))
  const workerClientRef = useRef(null)
  const mountedRef = useRef(true)

  const chantAudioUrlsRef = useRef(new Map())
  const chantPrefetchIdsRef = useRef(new Set())
  const chatMediaUrlsRef = useRef(new Map())
  const chatMediaPrefetchIdsRef = useRef(new Set())
  const clipPrefetchIdsRef = useRef(new Set())
  const clipPreviewUrlsRef = useRef(new Map())
  const pendingChantLoadsRef = useRef(new Map())
  const pendingChantUrlsRef = useRef(new Map())
  const pendingChatMediaLoadsRef = useRef(new Map())
  const pendingChatMediaPreviewsRef = useRef(new Map())
  const pendingClipLoadsRef = useRef(new Map())
  const pendingClipPreviewsRef = useRef(new Map())
  const seenEffectEventIdsRef = useRef(new Set())

  const activeChantRecorderRef = useRef(null)
  const activeChantStreamRef = useRef(null)
  const discardActiveChantRef = useRef(false)
  const chantTickTimerRef = useRef(null)
  const chantAutoStopTimerRef = useRef(null)
  const activeVoiceRecorderRef = useRef(null)
  const activeVoiceStreamRef = useRef(null)
  const voiceTickTimerRef = useRef(null)
  const voiceAutoStopTimerRef = useRef(null)
  const activeReplayAudioRef = useRef(null)
  const activeReplaySessionRef = useRef(null)
  const fallbackChantUrlRef = useRef('')
  const replayProgressTimerRef = useRef(null)
  const replayStartedAtRef = useRef(0)
  const replayTimersRef = useRef([])

  function setAppState(updater) {
    const previous = stateRef.current
    const next = typeof updater === 'function' ? updater(previous) : { ...previous, ...updater }
    stateRef.current = next
    setReactState(next)
  }

  function refresh() {
    setAppState((state) => ({ ...state }))
  }

  function sendWorkerCommand(type, payload = {}) {
    return workerClientRef.current?.send(type, payload)
  }

  function resolvePendingChantLoad(eventId, dataUrl = '') {
    const pending = pendingChantLoadsRef.current.get(eventId)
    if (!pending) return

    clearTimeout(pending.timeout)
    pendingChantLoadsRef.current.delete(eventId)
    pending.resolve(dataUrl)
  }

  function resolvePendingChatMediaLoad(eventId, dataUrl = '') {
    const pending = pendingChatMediaLoadsRef.current.get(eventId)
    if (!pending) return

    clearTimeout(pending.timeout)
    pendingChatMediaLoadsRef.current.delete(eventId)
    pending.resolve(dataUrl)
  }

  function resolvePendingClipLoad(eventId, videoUrl = '') {
    const pending = pendingClipLoadsRef.current.get(eventId)
    if (!pending) return

    clearTimeout(pending.timeout)
    pendingClipLoadsRef.current.delete(eventId)
    pending.resolve(videoUrl)
  }

  function attachPendingChantUrl(event) {
    const clientId = event?.payload?.clientId
    if (event?.type !== 'chant' || !clientId || !pendingChantUrlsRef.current.has(clientId)) return

    chantAudioUrlsRef.current.set(event.id, pendingChantUrlsRef.current.get(clientId))
    pendingChantUrlsRef.current.delete(clientId)
  }

  function attachPendingChatMediaPreview(event) {
    const clientId = event?.payload?.clientId
    if (
      event?.type !== 'chat-media' ||
      !clientId ||
      !pendingChatMediaPreviewsRef.current.has(clientId)
    ) {
      return
    }

    const preview = pendingChatMediaPreviewsRef.current.get(clientId)
    chatMediaUrlsRef.current.set(event.id, preview.url)
    pendingChatMediaPreviewsRef.current.delete(clientId)
  }

  function attachPendingClipPreview(event) {
    const clientId = event?.payload?.clientId
    if (event?.type !== 'clip' || !clientId || !pendingClipPreviewsRef.current.has(clientId)) {
      return
    }

    const preview = pendingClipPreviewsRef.current.get(clientId)
    clipPreviewUrlsRef.current.set(event.id, preview.url)
    if (preview.localPath) storeLocalClipPath(event.payload.clipRef, preview.localPath)
    pendingClipPreviewsRef.current.delete(clientId)
  }

  function clipPreviewUrlForEvent(event) {
    if (clipPreviewUrlsRef.current.has(event.id)) return clipPreviewUrlsRef.current.get(event.id)
    const localPath = localPathForClip(event)
    return localPath ? pathToFileUrl(localPath) : ''
  }

  function clearClipPreviewUrls() {
    for (const url of clipPreviewUrlsRef.current.values()) {
      if (url.startsWith('blob:')) URL.revokeObjectURL(url)
    }
    for (const preview of pendingClipPreviewsRef.current.values()) URL.revokeObjectURL(preview.url)
    for (const pending of pendingClipLoadsRef.current.values()) {
      clearTimeout(pending.timeout)
      pending.resolve('')
    }
    clipPreviewUrlsRef.current.clear()
    pendingClipLoadsRef.current.clear()
    pendingClipPreviewsRef.current.clear()
  }

  function clearChatMediaUrls() {
    for (const url of chatMediaUrlsRef.current.values()) {
      if (url.startsWith('blob:')) URL.revokeObjectURL(url)
    }
    for (const preview of pendingChatMediaPreviewsRef.current.values()) {
      if (preview.url?.startsWith('blob:')) URL.revokeObjectURL(preview.url)
    }
    for (const pending of pendingChatMediaLoadsRef.current.values()) {
      clearTimeout(pending.timeout)
      pending.resolve('')
    }
    chatMediaUrlsRef.current.clear()
    pendingChatMediaLoadsRef.current.clear()
    pendingChatMediaPreviewsRef.current.clear()
  }

  function requestChantLoad(event, options = {}) {
    if (chantAudioUrlsRef.current.has(event.id)) return
    sendWorkerCommand('chant:load', {
      eventId: event.id,
      fileId: event.payload.fileId,
      mimeType: event.payload.mimeType,
      silent: options.silent === true
    })
  }

  function requestChatMediaLoad(event, options = {}) {
    if (chatMediaUrlsRef.current.has(event.id)) return
    sendWorkerCommand('chat-media:load', {
      eventId: event.id,
      kind: event.payload.kind,
      mediaRef: event.payload.mediaRef,
      mimeType: event.payload.mimeType,
      silent: options.silent === true,
      size: event.payload.size
    })
  }

  function requestClipLoad(event, options = {}) {
    if (clipPreviewUrlForEvent(event)) return
    sendWorkerCommand('clip:load', {
      clipRef: event.payload.clipRef,
      eventId: event.id,
      mimeType: event.payload.mimeType,
      silent: options.silent === true,
      size: event.payload.size
    })
  }

  function loadChantAudio(event, options = {}) {
    if (chantAudioUrlsRef.current.has(event.id)) {
      return Promise.resolve(chantAudioUrlsRef.current.get(event.id))
    }
    if (!event.payload?.fileId) return Promise.resolve('')
    if (pendingChantLoadsRef.current.has(event.id)) {
      return pendingChantLoadsRef.current.get(event.id).promise
    }

    let resolveLoad = null
    const promise = new Promise((resolve) => {
      resolveLoad = resolve
    })
    const timeoutMs = options.silent === true ? 5000 : 1200
    const timeout = setTimeout(() => {
      pendingChantLoadsRef.current.delete(event.id)
      if (options.silent === true && !chantAudioUrlsRef.current.has(event.id)) {
        chantPrefetchIdsRef.current.delete(event.id)
      }
      resolveLoad('')
      if (stateRef.current.view === 'room') refresh()
    }, timeoutMs)

    pendingChantLoadsRef.current.set(event.id, {
      promise,
      resolve: resolveLoad,
      timeout
    })
    requestChantLoad(event, options)
    if (options.silent !== true && stateRef.current.view === 'room') refresh()
    return promise
  }

  function loadChatMedia(event, options = {}) {
    if (chatMediaUrlsRef.current.has(event.id)) {
      return Promise.resolve(chatMediaUrlsRef.current.get(event.id))
    }
    if (!event.payload?.mediaRef) return Promise.resolve('')
    if (pendingChatMediaLoadsRef.current.has(event.id)) {
      return pendingChatMediaLoadsRef.current.get(event.id).promise
    }

    let resolveLoad = null
    const promise = new Promise((resolve) => {
      resolveLoad = resolve
    })
    const timeoutMs = event.payload.kind === 'image' ? 22000 : 12000
    const timeout = setTimeout(() => {
      pendingChatMediaLoadsRef.current.delete(event.id)
      if (options.silent === true && !chatMediaUrlsRef.current.has(event.id)) {
        chatMediaPrefetchIdsRef.current.delete(event.id)
      }
      resolveLoad('')
      if (stateRef.current.view === 'room') refresh()
    }, timeoutMs)

    pendingChatMediaLoadsRef.current.set(event.id, {
      promise,
      resolve: resolveLoad,
      timeout
    })
    requestChatMediaLoad(event, options)
    if (options.silent !== true && stateRef.current.view === 'room') refresh()
    return promise
  }

  function loadClipVideo(event, options = {}) {
    const existingUrl = clipPreviewUrlForEvent(event)
    if (existingUrl) return Promise.resolve(existingUrl)
    if (!event.payload?.clipRef) return Promise.resolve('')
    if (pendingClipLoadsRef.current.has(event.id)) {
      return pendingClipLoadsRef.current.get(event.id).promise
    }

    let resolveLoad = null
    const promise = new Promise((resolve) => {
      resolveLoad = resolve
    })
    const timeoutMs = options.silent === true ? 45000 : 60000
    const timeout = setTimeout(() => {
      pendingClipLoadsRef.current.delete(event.id)
      if (options.silent === true && !clipPreviewUrlForEvent(event)) {
        clipPrefetchIdsRef.current.delete(event.id)
      }
      resolveLoad('')
      if (stateRef.current.view === 'room') refresh()
    }, timeoutMs)

    pendingClipLoadsRef.current.set(event.id, {
      promise,
      resolve: resolveLoad,
      timeout
    })
    requestClipLoad(event, options)
    if (options.silent !== true && stateRef.current.view === 'room') refresh()
    return promise
  }

  function prefetchChantAudio(event) {
    if (event?.type !== 'chant' || !event.payload?.fileId) return
    if (chantAudioUrlsRef.current.has(event.id) || pendingChantLoadsRef.current.has(event.id)) {
      return
    }
    if (chantPrefetchIdsRef.current.has(event.id)) return

    chantPrefetchIdsRef.current.add(event.id)
    loadChantAudio(event, { silent: true })
  }

  function prefetchChatMedia(event) {
    if (event?.type !== 'chat-media' || !event.payload?.mediaRef) return
    if (chatMediaUrlsRef.current.has(event.id) || pendingChatMediaLoadsRef.current.has(event.id)) {
      return
    }
    if (chatMediaPrefetchIdsRef.current.has(event.id)) return

    chatMediaPrefetchIdsRef.current.add(event.id)
    loadChatMedia(event, { silent: true })
  }

  function prefetchClipVideo(event) {
    if (event?.type !== 'clip' || !event.payload?.clipRef) return
    if (clipPreviewUrlForEvent(event) || pendingClipLoadsRef.current.has(event.id)) return
    if (clipPrefetchIdsRef.current.has(event.id)) return

    clipPrefetchIdsRef.current.add(event.id)
    loadClipVideo(event, { silent: true })
  }

  function prefetchChantAudios(events) {
    for (const event of events) prefetchChantAudio(event)
  }

  function prefetchChatMediaEvents(events) {
    for (const event of events) prefetchChatMedia(event)
  }

  function prefetchClipVideos(events) {
    for (const event of events) prefetchClipVideo(event)
  }

  function rememberEffectEvents(events) {
    for (const event of events) {
      if (event?.type === 'reaction') seenEffectEventIdsRef.current.add(event.id)
    }
  }

  function triggerReactionEffect(event) {
    if (!event || event.type !== 'reaction' || seenEffectEventIdsRef.current.has(event.id)) return

    seenEffectEventIdsRef.current.add(event.id)

    const reaction = reactionTheme(event.payload.type)
    const effect = {
      id: event.id,
      type: reaction.type,
      label: reaction.label,
      tone: reaction.tone,
      sender: event.sender,
      createdAt: Date.now()
    }

    setAppState((state) => ({
      ...state,
      effects: [effect, ...state.effects].slice(0, 4)
    }))

    setTimeout(() => {
      if (!mountedRef.current) return
      setAppState((state) => ({
        ...state,
        effects: state.effects.filter((item) => item.id !== effect.id)
      }))
    }, 2200)
  }

  function applyLiveEffects(events) {
    for (const event of events) triggerReactionEffect(event)
  }

  function upsertEvent(event) {
    attachPendingChantUrl(event)
    attachPendingChatMediaPreview(event)
    attachPendingClipPreview(event)
    prefetchChantAudio(event)
    prefetchChatMedia(event)
    prefetchClipVideo(event)

    setAppState((state) => {
      const nextEvents = [...state.events]
      const existingIndex = nextEvents.findIndex((item) => item.id === event.id)
      if (existingIndex >= 0) nextEvents.splice(existingIndex, 1)
      nextEvents.unshift(event)
      return {
        ...state,
        events: nextEvents,
        lastError: ''
      }
    })
  }

  function applyWorkerMessage(message) {
    switch (message.type) {
      case 'app:legacy-ready':
      case 'app:ready':
        setAppState((state) => ({
          ...state,
          workerStatus: message.workerStatus || 'ready',
          syncStatus: message.syncStatus || 'Worker ready',
          lastError: ''
        }))
        break
      case 'app:worker-exit':
        setAppState((state) => ({
          ...state,
          workerStatus: message.workerStatus || 'stopped',
          syncStatus: message.syncStatus || 'Worker stopped'
        }))
        break
      case 'room:joined':
        setAppState((state) => ({
          ...state,
          view: 'room',
          nickname: message.profile.nickname,
          roomCode: message.room.code,
          roomTitle: message.room.title,
          peerCount: message.peerCount,
          syncStatus: message.syncStatus,
          events: message.events || [],
          chatDraft: '',
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
        }))
        seenEffectEventIdsRef.current.clear()
        chantPrefetchIdsRef.current.clear()
        chatMediaPrefetchIdsRef.current.clear()
        clipPrefetchIdsRef.current.clear()
        rememberEffectEvents(message.events || [])
        prefetchChantAudios(message.events || [])
        prefetchChatMediaEvents(message.events || [])
        prefetchClipVideos(message.events || [])
        break
      case 'room:left':
        setAppState((state) => ({
          ...state,
          view: 'home',
          roomTitle: '',
          peerCount: 0,
          syncStatus: message.syncStatus || 'Worker ready',
          events: message.events || [],
          chatDraft: '',
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
        }))
        clearClipPreviewUrls()
        clearChatMediaUrls()
        stopChantRecording({ discard: true })
        stopVoiceNoteRecording({ discard: true })
        resetReplayPreview()
        chantPrefetchIdsRef.current.clear()
        chatMediaPrefetchIdsRef.current.clear()
        clipPrefetchIdsRef.current.clear()
        seenEffectEventIdsRef.current.clear()
        break
      case 'peer:count':
        setAppState((state) => ({
          ...state,
          peerCount: message.count
        }))
        if (message.count > 0) {
          prefetchChantAudios(stateRef.current.events)
          prefetchChatMediaEvents(stateRef.current.events)
          prefetchClipVideos(stateRef.current.events)
        }
        break
      case 'sync:status':
        setAppState((state) => ({
          ...state,
          syncStatus: message.status
        }))
        break
      case 'offline:state': {
        const pendingEventIds = Array.isArray(message.pendingEventIds)
          ? message.pendingEventIds.filter((id) => typeof id === 'string')
          : []
        setAppState((state) => ({
          ...state,
          offline: {
            detail: message.detail || (message.enabled ? 'Local room active' : 'Network live'),
            enabled: message.enabled === true,
            lastFlushCount: Number.isFinite(message.lastFlushCount) ? message.lastFlushCount : 0,
            pendingCount: Number.isFinite(message.pendingCount) ? message.pendingCount : 0,
            pendingEventIds: new Set(pendingEventIds)
          }
        }))
        break
      }
      case 'event:added':
        triggerReactionEffect(message.event)
        upsertEvent(message.event)
        break
      case 'event:list': {
        const events = message.events || []
        if (eventListSignature(stateRef.current.events) === eventListSignature(events)) return
        for (const event of events) {
          attachPendingChantUrl(event)
          attachPendingChatMediaPreview(event)
          attachPendingClipPreview(event)
        }
        applyLiveEffects(events)
        setAppState((state) => ({
          ...state,
          events
        }))
        prefetchChantAudios(events)
        prefetchChatMediaEvents(events)
        prefetchClipVideos(events)
        break
      }
      case 'chant:loaded':
        chantAudioUrlsRef.current.set(message.eventId, message.dataUrl)
        resolvePendingChantLoad(message.eventId, message.dataUrl)
        refresh()
        break
      case 'chat-media:loaded':
        chatMediaUrlsRef.current.set(message.eventId, message.dataUrl)
        resolvePendingChatMediaLoad(message.eventId, message.dataUrl)
        refresh()
        break
      case 'clip:loaded': {
        const videoUrl = pathToFileUrl(message.filePath || '')
        if (videoUrl) {
          clipPreviewUrlsRef.current.set(message.eventId, videoUrl)
          storeLocalClipPath(message.clipRef, message.filePath)
        }
        resolvePendingClipLoad(message.eventId, videoUrl)
        refresh()
        break
      }
      case 'echo:replay':
        break
      case 'error':
        setAppState((state) => ({
          ...state,
          lastError: message.message || 'Worker error',
          syncStatus: 'Error'
        }))
        break
      default:
        console.warn('Unknown worker message type:', message.type)
    }
  }

  function getFallbackChantUrl() {
    if (!fallbackChantUrlRef.current) {
      fallbackChantUrlRef.current = URL.createObjectURL(createFallbackChantBlob().blob)
    }

    return fallbackChantUrlRef.current
  }

  async function saveChantBlob({ blob, durationMs, mimeType }) {
    const clientId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
    pendingChantUrlsRef.current.set(clientId, URL.createObjectURL(blob))
    const bytesBase64 = await blobToBase64(blob)

    setAppState((state) => ({
      ...state,
      chantRecorder: {
        elapsedMs: durationMs,
        error: '',
        status: 'ready'
      }
    }))

    sendWorkerCommand('chant:save', {
      bytesBase64,
      clientId,
      durationMs,
      mimeType
    })
  }

  async function saveFallbackChant() {
    if (['recording', 'saving'].includes(stateRef.current.chantRecorder.status)) return

    try {
      const fallback = createFallbackChantBlob()
      setAppState((state) => ({
        ...state,
        chantRecorder: {
          elapsedMs: fallback.durationMs,
          error: '',
          status: 'saving'
        }
      }))
      await saveChantBlob(fallback)
    } catch (err) {
      setAppState((state) => ({
        ...state,
        chantRecorder: {
          elapsedMs: 0,
          error: err.message || 'Could not save demo chant',
          status: 'error'
        }
      }))
    }
  }

  function resetChantTimers() {
    if (chantTickTimerRef.current) clearInterval(chantTickTimerRef.current)
    if (chantAutoStopTimerRef.current) clearTimeout(chantAutoStopTimerRef.current)
    chantTickTimerRef.current = null
    chantAutoStopTimerRef.current = null
  }

  function releaseChantStream() {
    if (!activeChantStreamRef.current) return
    for (const track of activeChantStreamRef.current.getTracks()) track.stop()
    activeChantStreamRef.current = null
  }

  async function startChantRecording() {
    if (!recordingSupported()) {
      setAppState((state) => ({
        ...state,
        chantRecorder: {
          elapsedMs: 0,
          error: 'Microphone recording is not available in this runtime',
          status: 'error'
        }
      }))
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = preferredChantMimeType()
      const chunks = []
      const recorder = mimeType
        ? new window.MediaRecorder(stream, { mimeType })
        : new window.MediaRecorder(stream)
      const startedAt = Date.now()

      activeChantStreamRef.current = stream
      activeChantRecorderRef.current = recorder
      discardActiveChantRef.current = false

      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) chunks.push(event.data)
      })

      recorder.addEventListener('stop', () => {
        finalizeChantRecording({
          chunks,
          durationMs: Date.now() - startedAt,
          mimeType: recorder.mimeType || mimeType || 'audio/webm'
        }).catch((err) => {
          setAppState((state) => ({
            ...state,
            chantRecorder: {
              elapsedMs: 0,
              error: err.message || 'Could not save chant',
              status: 'error'
            }
          }))
        })
      })

      recorder.start()
      setAppState((state) => ({
        ...state,
        chantRecorder: {
          elapsedMs: 0,
          error: '',
          status: 'recording'
        }
      }))

      chantTickTimerRef.current = setInterval(() => {
        setAppState((state) => ({
          ...state,
          chantRecorder: {
            ...state.chantRecorder,
            elapsedMs: Math.min(Date.now() - startedAt, CHANT_MAX_MS)
          }
        }))
      }, 500)

      chantAutoStopTimerRef.current = setTimeout(() => {
        stopChantRecording()
      }, CHANT_MAX_MS)
    } catch (err) {
      releaseChantStream()
      setAppState((state) => ({
        ...state,
        chantRecorder: {
          elapsedMs: 0,
          error: err.message || 'Microphone permission failed',
          status: 'error'
        }
      }))
    }
  }

  function stopChantRecording(options = {}) {
    resetChantTimers()

    const recorder = activeChantRecorderRef.current
    activeChantRecorderRef.current = null

    if (!recorder) {
      releaseChantStream()
      if (options.discard) return
      setAppState((state) => ({
        ...state,
        chantRecorder: {
          elapsedMs: 0,
          error: '',
          status: 'idle'
        }
      }))
      return
    }

    if (options.discard) {
      discardActiveChantRef.current = true
      if (recorder.state !== 'inactive') recorder.stop()
      return
    }

    const elapsedMs = stateRef.current.chantRecorder.elapsedMs
    if (elapsedMs < CHANT_MIN_MS) {
      activeChantRecorderRef.current = recorder
      setAppState((state) => ({
        ...state,
        chantRecorder: {
          elapsedMs,
          error: 'Hold for at least 3 seconds',
          status: 'error'
        }
      }))
      return
    }

    setAppState((state) => ({
      ...state,
      chantRecorder: {
        elapsedMs,
        error: '',
        status: 'saving'
      }
    }))
    if (recorder.state !== 'inactive') recorder.stop()
  }

  async function finalizeChantRecording({ chunks, durationMs, mimeType }) {
    if (discardActiveChantRef.current) {
      discardActiveChantRef.current = false
      releaseChantStream()
      return
    }

    releaseChantStream()

    if (durationMs < CHANT_MIN_MS) {
      setAppState((state) => ({
        ...state,
        chantRecorder: {
          elapsedMs: durationMs,
          error: 'Hold for at least 3 seconds',
          status: 'error'
        }
      }))
      return
    }

    const blob = new Blob(chunks, { type: mimeType })
    await saveChantBlob({ blob, durationMs, mimeType })
  }

  function resetVoiceTimers() {
    if (voiceTickTimerRef.current) clearInterval(voiceTickTimerRef.current)
    if (voiceAutoStopTimerRef.current) clearTimeout(voiceAutoStopTimerRef.current)
    voiceTickTimerRef.current = null
    voiceAutoStopTimerRef.current = null
  }

  function releaseVoiceStream() {
    if (!activeVoiceStreamRef.current) return
    for (const track of activeVoiceStreamRef.current.getTracks()) track.stop()
    activeVoiceStreamRef.current = null
  }

  async function saveVoiceNoteBlob({ blob, durationMs, mimeType }) {
    if (blob.size < 1) {
      setAppState((state) => ({
        ...state,
        chatMedia: {
          ...state.chatMedia,
          voiceError: 'Voice note is empty',
          voiceStatus: 'error'
        }
      }))
      return
    }

    if (blob.size > CHAT_VOICE_MAX_BYTES) {
      setAppState((state) => ({
        ...state,
        chatMedia: {
          ...state.chatMedia,
          voiceError: 'Voice note must be 5 MB or smaller',
          voiceStatus: 'error'
        }
      }))
      return
    }

    const clientId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
    const url = URL.createObjectURL(blob)
    const mediaRef = mediaRefForBlob(blob, 'voice')
    const bytesBase64 = await blobToBase64(blob)

    pendingChatMediaPreviewsRef.current.set(clientId, { url })

    setAppState((state) => ({
      ...state,
      chatMedia: {
        ...state.chatMedia,
        voiceElapsedMs: durationMs,
        voiceError: '',
        voiceStatus: 'saving'
      }
    }))

    sendWorkerCommand('chat-media:save', {
      bytesBase64,
      clientId,
      durationMs,
      kind: 'voice',
      mediaRef,
      mimeType,
      size: blob.size
    })

    setAppState((state) => ({
      ...state,
      chatMedia: {
        ...state.chatMedia,
        voiceElapsedMs: 0,
        voiceError: '',
        voiceStatus: 'idle'
      }
    }))
  }

  async function startVoiceNoteRecording() {
    if (!recordingSupported()) {
      setAppState((state) => ({
        ...state,
        chatMedia: {
          ...state.chatMedia,
          voiceElapsedMs: 0,
          voiceError: 'Microphone recording is not available in this runtime',
          voiceStatus: 'error'
        }
      }))
      return
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = preferredChantMimeType()
      const chunks = []
      const recorder = mimeType
        ? new window.MediaRecorder(stream, { mimeType })
        : new window.MediaRecorder(stream)
      const startedAt = Date.now()

      activeVoiceStreamRef.current = stream
      activeVoiceRecorderRef.current = recorder

      recorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) chunks.push(event.data)
      })

      recorder.addEventListener('stop', () => {
        const durationMs = Date.now() - startedAt
        releaseVoiceStream()
        if (durationMs < VOICE_NOTE_MIN_MS) {
          setAppState((state) => ({
            ...state,
            chatMedia: {
              ...state.chatMedia,
              voiceElapsedMs: durationMs,
              voiceError: 'Hold for at least 1 second',
              voiceStatus: 'error'
            }
          }))
          return
        }

        const blob = new Blob(chunks, { type: recorder.mimeType || mimeType || 'audio/webm' })
        saveVoiceNoteBlob({
          blob,
          durationMs,
          mimeType: recorder.mimeType || mimeType || 'audio/webm'
        }).catch((err) => {
          setAppState((state) => ({
            ...state,
            chatMedia: {
              ...state.chatMedia,
              voiceElapsedMs: 0,
              voiceError: err.message || 'Could not save voice note',
              voiceStatus: 'error'
            }
          }))
        })
      })

      recorder.start()
      setAppState((state) => ({
        ...state,
        chatMedia: {
          ...state.chatMedia,
          voiceElapsedMs: 0,
          voiceError: '',
          voiceStatus: 'recording'
        }
      }))

      voiceTickTimerRef.current = setInterval(() => {
        setAppState((state) => ({
          ...state,
          chatMedia: {
            ...state.chatMedia,
            voiceElapsedMs: Math.min(Date.now() - startedAt, VOICE_NOTE_MAX_MS)
          }
        }))
      }, 500)

      voiceAutoStopTimerRef.current = setTimeout(() => {
        stopVoiceNoteRecording()
      }, VOICE_NOTE_MAX_MS)
    } catch (err) {
      releaseVoiceStream()
      setAppState((state) => ({
        ...state,
        chatMedia: {
          ...state.chatMedia,
          voiceElapsedMs: 0,
          voiceError: err.message || 'Microphone permission failed',
          voiceStatus: 'error'
        }
      }))
    }
  }

  function stopVoiceNoteRecording(options = {}) {
    resetVoiceTimers()

    const recorder = activeVoiceRecorderRef.current
    activeVoiceRecorderRef.current = null

    if (!recorder) {
      releaseVoiceStream()
      if (options.discard) return
      setAppState((state) => ({
        ...state,
        chatMedia: {
          ...state.chatMedia,
          voiceElapsedMs: 0,
          voiceError: '',
          voiceStatus: 'idle'
        }
      }))
      return
    }

    if (options.discard) {
      if (recorder.state !== 'inactive') recorder.stop()
      return
    }

    const elapsedMs = stateRef.current.chatMedia.voiceElapsedMs
    if (elapsedMs < VOICE_NOTE_MIN_MS) {
      setAppState((state) => ({
        ...state,
        chatMedia: {
          ...state.chatMedia,
          voiceElapsedMs: elapsedMs,
          voiceError: 'Hold for at least 1 second',
          voiceStatus: 'error'
        }
      }))
      if (recorder.state !== 'inactive') recorder.stop()
      return
    }

    setAppState((state) => ({
      ...state,
      chatMedia: {
        ...state.chatMedia,
        voiceElapsedMs: elapsedMs,
        voiceError: '',
        voiceStatus: 'saving'
      }
    }))
    if (recorder.state !== 'inactive') recorder.stop()
  }

  async function saveChatImage(file, caption = '') {
    if (stateRef.current.chatMedia.imageStatus === 'saving') return

    if (!imageFileSupported(file)) {
      setAppState((state) => ({
        ...state,
        chatMedia: {
          ...state.chatMedia,
          imageError: 'Select a PNG, JPEG, WEBP, or GIF image',
          imageStatus: 'error'
        }
      }))
      return
    }

    if (!Number.isFinite(file.size) || file.size < 1) {
      setAppState((state) => ({
        ...state,
        chatMedia: {
          ...state.chatMedia,
          imageError: 'Selected image is empty',
          imageStatus: 'error'
        }
      }))
      return
    }

    if (file.size > CHAT_IMAGE_MAX_BYTES) {
      setAppState((state) => ({
        ...state,
        chatMedia: {
          ...state.chatMedia,
          imageError: 'Image must be 10 MB or smaller',
          imageStatus: 'error'
        }
      }))
      return
    }

    let objectUrl = ''
    try {
      objectUrl = URL.createObjectURL(file)
      setAppState((state) => ({
        ...state,
        chatMedia: {
          ...state.chatMedia,
          imageError: '',
          imageStatus: 'saving'
        }
      }))

      const [mediaRef, dimensions] = await Promise.all([
        mediaRefForFile(file, 'image'),
        readImageDimensions(objectUrl)
      ])
      const clientId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
      const localPath = localPathForFile(file)

      pendingChatMediaPreviewsRef.current.set(clientId, { url: objectUrl })

      sendWorkerCommand('chat-media:save', {
        caption: caption.trim().slice(0, 140),
        clientId,
        height: dimensions?.height || null,
        kind: 'image',
        localPath,
        mediaRef,
        mimeType: imageMimeType(file),
        size: file.size,
        width: dimensions?.width || null
      })

      setAppState((state) => ({
        ...state,
        chatDraft: caption.trim() ? '' : state.chatDraft,
        chatMedia: {
          ...state.chatMedia,
          imageError: '',
          imageStatus: 'idle'
        }
      }))
    } catch (err) {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      setAppState((state) => ({
        ...state,
        chatMedia: {
          ...state.chatMedia,
          imageError: err.message || 'Could not send image',
          imageStatus: 'error'
        }
      }))
    }
  }

  async function saveClipMetadata(file) {
    if (stateRef.current.clipDraft.status === 'saving') return

    if (!clipFileSupported(file)) {
      setAppState((state) => ({
        ...state,
        clipDraft: {
          ...state.clipDraft,
          error: 'Select a video clip file',
          status: 'error'
        }
      }))
      return
    }

    if (!Number.isFinite(file.size) || file.size < 1) {
      setAppState((state) => ({
        ...state,
        clipDraft: {
          ...state.clipDraft,
          error: 'Selected clip is empty',
          status: 'error'
        }
      }))
      return
    }

    if (file.size > CLIP_MAX_BYTES) {
      setAppState((state) => ({
        ...state,
        clipDraft: {
          ...state.clipDraft,
          error: 'Clip must be 64 MB or smaller',
          status: 'error'
        }
      }))
      return
    }

    let objectUrl = ''
    try {
      objectUrl = URL.createObjectURL(file)
      setAppState((state) => ({
        ...state,
        clipDraft: {
          ...state.clipDraft,
          error: '',
          status: 'saving'
        }
      }))

      const [clipRef, durationMs] = await Promise.all([
        clipRefForFile(file),
        readVideoDuration(objectUrl)
      ])

      if (!Number.isFinite(durationMs) || durationMs <= 0) {
        URL.revokeObjectURL(objectUrl)
        setAppState((state) => ({
          ...state,
          clipDraft: {
            ...state.clipDraft,
            error: 'Could not read clip duration',
            status: 'error'
          }
        }))
        return
      }

      if (durationMs > CLIP_MAX_DURATION_MS) {
        URL.revokeObjectURL(objectUrl)
        setAppState((state) => ({
          ...state,
          clipDraft: {
            ...state.clipDraft,
            error: 'Clip must be 5 minutes or shorter',
            status: 'error'
          }
        }))
        return
      }

      const clientId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
      const localPath = localPathForFile(file)

      pendingClipPreviewsRef.current.set(clientId, {
        localPath,
        url: objectUrl
      })
      if (localPath) storeLocalClipPath(clipRef, localPath)

      sendWorkerCommand('clip:save', {
        caption: stateRef.current.clipDraft.caption,
        clientId,
        clipRef,
        durationMs,
        lastModified: file.lastModified || null,
        localPath,
        mimeType: clipMimeType(file),
        size: file.size,
        title: 'Highlight clip'
      })

      setAppState((state) => ({
        ...state,
        clipDraft: clipDraftIdle()
      }))
    } catch (err) {
      if (objectUrl) URL.revokeObjectURL(objectUrl)
      setAppState((state) => ({
        ...state,
        clipDraft: {
          ...state.clipDraft,
          error: err.message || 'Could not save clip metadata',
          status: 'error'
        }
      }))
    }
  }

  function replayEventsChronological() {
    return stateRef.current.events
      .filter((event) => event.type !== 'system')
      .slice()
      .sort((left, right) => left.timestamp - right.timestamp)
  }

  function chooseReplayAnchor(anchorId = '') {
    const events = replayEventsChronological()
    if (anchorId) return events.find((event) => event.id === anchorId) || null

    return (
      events
        .slice()
        .reverse()
        .find(
          (event) => event.type === 'reaction' && ['goal', 'flare'].includes(event.payload?.type)
        ) ||
      events.at(-1) ||
      null
    )
  }

  function replayToneForEvent(event) {
    if (event.type === 'reaction') return reactionTheme(event.payload.type).tone
    if (event.type === 'chant') return 'cold'
    if (event.type === 'clip') return 'warning'
    if (event.type === 'chat') return 'clean'
    if (event.type === 'chat-media') return event.payload.kind === 'image' ? 'warning' : 'cold'
    return 'warning'
  }

  function replayCueForEvent(event, anchor, replayStart, replayWindowMs, index) {
    const meta = eventMeta(event)
    const atMs = Math.max(
      0,
      Math.min(
        REPLAY_DURATION_MS,
        Math.round(((event.timestamp - replayStart) / replayWindowMs) * REPLAY_DURATION_MS)
      )
    )

    return {
      atMs,
      event,
      id: event.id,
      index,
      label: meta.label,
      offset: formatReplayOffset(event.timestamp - anchor.timestamp),
      sender: event.sender,
      text: meta.text,
      tone: replayToneForEvent(event),
      type: event.type
    }
  }

  function buildReplaySession(anchorId = '') {
    const anchor = chooseReplayAnchor(anchorId)
    if (!anchor) return null

    const replayStart = anchor.timestamp - REPLAY_WINDOW_BEFORE_MS
    const replayEnd = anchor.timestamp + REPLAY_WINDOW_AFTER_MS
    const replayWindowMs = replayEnd - replayStart
    const windowEvents = replayEventsChronological().filter(
      (event) => event.timestamp >= replayStart && event.timestamp <= replayEnd
    )
    const sourceEvents = windowEvents.length > 0 ? windowEvents : [anchor]
    const cues = sourceEvents
      .map((event, index) => replayCueForEvent(event, anchor, replayStart, replayWindowMs, index))
      .sort((left, right) => left.atMs - right.atMs || left.index - right.index)

    for (let index = 1; index < cues.length; index += 1) {
      const previous = cues[index - 1]
      const cue = cues[index]
      if (cue.atMs - previous.atMs < REPLAY_MIN_STEP_MS) {
        cue.atMs = Math.min(REPLAY_DURATION_MS - 300, previous.atMs + REPLAY_MIN_STEP_MS)
      }
    }

    const anchorMeta = eventMeta(anchor)

    return {
      anchor,
      anchorLabel: `${anchorMeta.label} by ${anchor.sender}`,
      cues,
      durationMs: Math.max(REPLAY_DURATION_MS, cues.at(-1)?.atMs + 1200 || REPLAY_DURATION_MS),
      id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`,
      windowLabel: `${formatReplayOffset(-REPLAY_WINDOW_BEFORE_MS)} to ${formatReplayOffset(
        REPLAY_WINDOW_AFTER_MS
      )}`
    }
  }

  function clearReplayTimers() {
    for (const timer of replayTimersRef.current) clearTimeout(timer)
    replayTimersRef.current = []
    if (replayProgressTimerRef.current) clearInterval(replayProgressTimerRef.current)
    replayProgressTimerRef.current = null
  }

  function stopActiveReplayAudio() {
    if (!activeReplayAudioRef.current) return
    activeReplayAudioRef.current.pause()
    activeReplayAudioRef.current.currentTime = 0
    activeReplayAudioRef.current = null
  }

  function resetReplayPreview(options = {}) {
    clearReplayTimers()
    stopActiveReplayAudio()
    activeReplaySessionRef.current = null
    replayStartedAtRef.current = 0
    setAppState((state) => ({
      ...state,
      replayPreview: replayIdleState()
    }))
    if (options.renderAfter) refresh()
  }

  function scheduleReplayStep(callback, delay) {
    const timer = setTimeout(() => {
      replayTimersRef.current = replayTimersRef.current.filter((item) => item !== timer)
      callback()
    }, delay)
    replayTimersRef.current.push(timer)
  }

  function updateReplayProgress(progress) {
    setAppState((state) => ({
      ...state,
      replayPreview: {
        ...state.replayPreview,
        progress
      }
    }))
  }

  function startReplayProgress(session) {
    replayStartedAtRef.current = Date.now()
    if (replayProgressTimerRef.current) clearInterval(replayProgressTimerRef.current)
    replayProgressTimerRef.current = setInterval(() => {
      if (activeReplaySessionRef.current !== session.id) return
      const elapsed = Date.now() - replayStartedAtRef.current
      updateReplayProgress(Math.min(99, Math.round((elapsed / session.durationMs) * 100)))
    }, 220)
  }

  function startReplayEcho(anchorId = '') {
    const session = buildReplaySession(anchorId)
    if (!session) {
      setAppState((state) => ({
        ...state,
        lastError: 'Add a goal, reaction, chat, clip, or chant before replaying Echo'
      }))
      return
    }

    for (const cue of session.cues) {
      if (cue.type === 'chant') prefetchChantAudio(cue.event)
    }

    clearReplayTimers()
    stopActiveReplayAudio()
    activeReplaySessionRef.current = session.id
    replayStartedAtRef.current = 0
    setAppState((state) => ({
      ...state,
      lastError: '',
      replayPreview: {
        ...replayIdleState(),
        active: true,
        anchorId: session.anchor.id,
        anchorLabel: session.anchorLabel,
        cueCount: session.cues.length,
        cues: session.cues.map((cue) => ({
          id: cue.id,
          label: cue.label,
          offset: cue.offset,
          tone: cue.tone,
          type: cue.type
        })),
        detail: `${session.cues.length} events queued around ${session.anchorLabel}`,
        mode: 'running',
        title: 'Replay Echo',
        windowLabel: session.windowLabel
      }
    }))
    startReplayProgress(session)

    for (const cue of session.cues) {
      scheduleReplayStep(() => activateReplayCue(session, cue), cue.atMs)
    }

    scheduleReplayStep(() => finishReplaySession(session), session.durationMs + 650)
  }

  function playAudioUrl(url) {
    if (!url) return Promise.resolve()

    stopActiveReplayAudio()

    return new Promise((resolve) => {
      const audio = new window.Audio(url)
      let settled = false

      function done() {
        if (settled) return
        settled = true
        if (activeReplayAudioRef.current === audio) activeReplayAudioRef.current = null
        resolve()
      }

      activeReplayAudioRef.current = audio
      audio.volume = 0.86
      audio.addEventListener('ended', done, { once: true })
      audio.addEventListener('error', done, { once: true })
      audio.play().catch(done)
    })
  }

  async function playChantForReplay(event) {
    const audioUrl = await loadChantAudio(event)
    await playAudioUrl(audioUrl || getFallbackChantUrl())
  }

  function activateReplayCue(session, cue) {
    if (activeReplaySessionRef.current !== session.id || stateRef.current.view !== 'room') return

    setAppState((state) => ({
      ...state,
      replayPreview: {
        ...state.replayPreview,
        activeEventId: cue.id,
        detail: `${cue.offset} · ${cue.sender}: ${cue.text}`,
        error:
          cue.type === 'chant' && !chantAudioUrlsRef.current.has(cue.id)
            ? 'Loading chant audio or using fallback'
            : '',
        messages: [
          {
            id: `${session.id}-${cue.id}-${Date.now()}`,
            label: cue.label,
            offset: cue.offset,
            sender: cue.sender,
            text: cue.text,
            tone: cue.tone,
            type: cue.type
          },
          ...state.replayPreview.messages
        ].slice(0, 5),
        title: cue.label
      }
    }))

    if (cue.type === 'reaction') {
      triggerReactionEffect({
        ...cue.event,
        id: `replay-${cue.id}-${Date.now()}`
      })
    }

    if (cue.type === 'chant') {
      playChantForReplay(cue.event).catch(() => {
        if (activeReplaySessionRef.current !== session.id) return null
        setAppState((state) => ({
          ...state,
          replayPreview: {
            ...state.replayPreview,
            error: 'Replay audio fell back to demo chant'
          }
        }))
        return playAudioUrl(getFallbackChantUrl())
      })
    }
  }

  function finishReplaySession(session) {
    if (activeReplaySessionRef.current !== session.id) return
    if (replayProgressTimerRef.current) clearInterval(replayProgressTimerRef.current)
    replayProgressTimerRef.current = null
    stopActiveReplayAudio()

    setAppState((state) => ({
      ...state,
      replayPreview: {
        ...state.replayPreview,
        activeEventId: '',
        detail: `${session.cues.length} Echo events replayed`,
        error: '',
        mode: 'complete',
        progress: 100,
        title: 'Echo complete'
      }
    }))
  }

  function joinRoom({ nickname, roomCode }) {
    if (!nickname || !roomCode) return

    sendWorkerCommand('profile:set', { nickname })
    sendWorkerCommand('room:join', {
      nickname,
      roomCode
    })
  }

  function leaveRoom() {
    sendWorkerCommand('room:leave')
  }

  function sendChat(text) {
    const clean = text.trim()
    if (!clean) return
    setAppState((state) => ({
      ...state,
      chatDraft: ''
    }))
    sendWorkerCommand('chat:send', { text: clean })
  }

  function setChatDraft(value) {
    setAppState((state) => ({
      ...state,
      chatDraft: value
    }))
  }

  function setClipCaption(value) {
    setAppState((state) => ({
      ...state,
      clipDraft: {
        ...state.clipDraft,
        caption: value
      }
    }))
  }

  function setOffline(enabled) {
    sendWorkerCommand('offline:set', { enabled })
  }

  function sendReaction(reactionType) {
    const reaction = reactionTypes.find((item) => item.type === reactionType)
    if (!reaction) return
    sendWorkerCommand('reaction:send', {
      reactionType: reaction.type,
      label: reaction.label
    })
  }

  function replayFrom(anchorId = '') {
    startReplayEcho(anchorId)
    sendWorkerCommand('echo:replay')
  }

  useEffect(() => {
    mountedRef.current = true
    const client = createWorkerClient({
      decoder: decoderRef.current,
      onMessage: applyWorkerMessage
    })
    workerClientRef.current = client
    const cleanupWorker = client.start()

    return () => {
      mountedRef.current = false
      cleanupWorker?.()
      resetChantTimers()
      resetVoiceTimers()
      releaseChantStream()
      releaseVoiceStream()
      clearReplayTimers()
      stopActiveReplayAudio()
      clearChatMediaUrls()
      clearClipPreviewUrls()
      if (fallbackChantUrlRef.current) URL.revokeObjectURL(fallbackChantUrlRef.current)
    }
    // The worker callbacks use refs for fresh state; the worker should start once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const metrics = useMemo(() => roomMetrics(appState), [appState])

  return {
    actions: {
      joinRoom,
      leaveRoom,
      loadChantAudio,
      loadChatMedia,
      loadClipVideo,
      replayFrom,
      resetReplayPreview,
      saveChatImage,
      saveClipMetadata,
      saveFallbackChant,
      sendChat,
      sendReaction,
      setChatDraft,
      setClipCaption,
      setOffline,
      startChantRecording,
      startVoiceNoteRecording,
      stopChantRecording,
      stopVoiceNoteRecording
    },
    derived: {
      chantAudioUrls: chantAudioUrlsRef.current,
      chatMediaUrls: chatMediaUrlsRef.current,
      clipPreviewUrlForEvent,
      eventStatus: (event) => eventStatus(event, appState),
      metrics,
      pendingChantLoads: pendingChantLoadsRef.current,
      pendingChatMediaLoads: pendingChatMediaLoadsRef.current,
      pendingClipLoads: pendingClipLoadsRef.current
    },
    state: appState
  }
}
