import { CLIP_PATH_STORAGE_KEY } from './constants.js'

export function clipFileSupported(file) {
  if (!file) return false
  if (file.type && file.type.startsWith('video/')) return true
  return /\.(mp4|m4v|mov|webm|ogg|ogv|mkv)$/i.test(file.name)
}

export function clipMimeType(file) {
  if (file.type && file.type.startsWith('video/')) return file.type
  if (/\.webm$/i.test(file.name)) return 'video/webm'
  if (/\.(ogg|ogv)$/i.test(file.name)) return 'video/ogg'
  if (/\.(mov|m4v)$/i.test(file.name)) return 'video/quicktime'
  return 'video/mp4'
}

function bytesToHex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function clipRefForFile(file) {
  const input = `${file.size}\n${file.lastModified || 0}\n${clipMimeType(file)}`
  if (!window.crypto?.subtle) {
    return `${file.size.toString(16)}-${(file.lastModified || Date.now()).toString(16)}`
  }

  const encoded = new TextEncoder().encode(input)
  return bytesToHex(await window.crypto.subtle.digest('SHA-256', encoded))
}

export function readVideoDuration(objectUrl) {
  return new Promise((resolve) => {
    const video = document.createElement('video')
    const timeout = setTimeout(() => done(null), 2400)

    function done(durationMs) {
      clearTimeout(timeout)
      video.removeAttribute('src')
      video.load()
      resolve(durationMs)
    }

    video.preload = 'metadata'
    video.addEventListener(
      'loadedmetadata',
      () => {
        const durationMs = Number.isFinite(video.duration)
          ? Math.round(video.duration * 1000)
          : null
        done(durationMs)
      },
      { once: true }
    )
    video.addEventListener('error', () => done(null), { once: true })
    video.src = objectUrl
  })
}

export function localPathForFile(file) {
  if (typeof window.bridge?.pathForFile !== 'function') return ''
  try {
    return window.bridge.pathForFile(file) || ''
  } catch {
    return ''
  }
}

export function readClipPathStore() {
  try {
    const raw = window.localStorage.getItem(CLIP_PATH_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : {}
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

export function saveClipPathStore(store) {
  try {
    window.localStorage.setItem(CLIP_PATH_STORAGE_KEY, JSON.stringify(store))
  } catch {
    // Private preview restore is optional; timeline metadata still works.
  }
}

export function storeLocalClipPath(clipRef, localPath) {
  if (!clipRef || !localPath) return
  const store = readClipPathStore()
  store[clipRef] = localPath
  saveClipPathStore(store)
}

export function localPathForClip(event) {
  const clipRef = event?.payload?.clipRef
  if (!clipRef) return ''
  const store = readClipPathStore()
  return typeof store[clipRef] === 'string' ? store[clipRef] : ''
}

export function pathToFileUrl(filePath) {
  if (!filePath) return ''
  let normalized = filePath.replace(/\\/g, '/')
  if (/^[a-z]:/i.test(normalized)) normalized = `/${normalized}`
  const encoded = normalized
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
  return `file://${encoded.startsWith('/') ? encoded : `/${encoded}`}`
}
