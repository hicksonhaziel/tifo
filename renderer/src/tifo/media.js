import { CHAT_IMAGE_MAX_BYTES, CHAT_VOICE_MAX_BYTES } from './constants.js'

export function imageFileSupported(file) {
  if (!file) return false
  if (file.type && /^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) return true
  return /\.(png|jpe?g|webp|gif)$/i.test(file.name)
}

export function imageMimeType(file) {
  if (file.type && file.type.startsWith('image/')) return file.type
  if (/\.png$/i.test(file.name)) return 'image/png'
  if (/\.webp$/i.test(file.name)) return 'image/webp'
  if (/\.gif$/i.test(file.name)) return 'image/gif'
  return 'image/jpeg'
}

export function chatMediaMaxBytes(kind) {
  return kind === 'image' ? CHAT_IMAGE_MAX_BYTES : CHAT_VOICE_MAX_BYTES
}

function bytesToHex(buffer) {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function mediaRefForFile(file, kind) {
  const input = `${kind}\n${file.size}\n${file.lastModified || 0}\n${file.type || ''}`
  if (!window.crypto?.subtle) {
    return `${kind}-${file.size.toString(16)}-${(file.lastModified || Date.now()).toString(16)}`
  }

  const encoded = new TextEncoder().encode(input)
  return bytesToHex(await window.crypto.subtle.digest('SHA-256', encoded))
}

export function mediaRefForBlob(blob, kind) {
  return `${kind}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${blob.size.toString(16)}`
}

export function readImageDimensions(objectUrl) {
  return new Promise((resolve) => {
    const image = new window.Image()
    const timeout = setTimeout(() => done(null), 2400)

    function done(dimensions) {
      clearTimeout(timeout)
      image.onload = null
      image.onerror = null
      resolve(dimensions)
    }

    image.onload = () => {
      done({
        height: image.naturalHeight,
        width: image.naturalWidth
      })
    }
    image.onerror = () => done(null)
    image.src = objectUrl
  })
}
