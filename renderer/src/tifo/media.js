import { CHAT_IMAGE_MAX_BYTES, CHAT_VOICE_MAX_BYTES } from './constants.js'

const CHAT_IMAGE_OUTPUT_TYPE = 'image/jpeg'
const CHAT_IMAGE_MAX_SIDE = 1280
const CHAT_IMAGE_MAX_PIXELS = 24_000_000
const CHAT_IMAGE_OUTPUT_MAX_BYTES = 2.2 * 1024 * 1024
const CHAT_IMAGE_TARGET_BYTES = 1.6 * 1024 * 1024

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

export async function prepareChatImage(file) {
  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await loadImage(objectUrl)
    const sourceWidth = image.naturalWidth || image.width || 1
    const sourceHeight = image.naturalHeight || image.height || 1
    if (sourceWidth * sourceHeight > CHAT_IMAGE_MAX_PIXELS) {
      throw new Error('Image dimensions are too large')
    }
    const scale = Math.min(1, CHAT_IMAGE_MAX_SIDE / Math.max(sourceWidth, sourceHeight))
    const width = Math.max(1, Math.round(sourceWidth * scale))
    const height = Math.max(1, Math.round(sourceHeight * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height

    const context = canvas.getContext('2d')
    if (!context) throw new Error('Could not prepare image')
    context.clearRect(0, 0, width, height)
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(image, 0, 0, width, height)

    const qualities = [0.82, 0.72, 0.62]
    let blob = null
    for (const quality of qualities) {
      blob = await canvasToBlob(canvas, CHAT_IMAGE_OUTPUT_TYPE, quality)
      if (blob.size <= CHAT_IMAGE_TARGET_BYTES) break
    }

    if (!blob || blob.size < 1) throw new Error('Prepared image is empty')
    if (blob.size > Math.min(CHAT_IMAGE_MAX_BYTES, CHAT_IMAGE_OUTPUT_MAX_BYTES)) {
      throw new Error('Prepared image is too large')
    }

    return {
      blob,
      height,
      mimeType: CHAT_IMAGE_OUTPUT_TYPE,
      previewUrl: URL.createObjectURL(blob),
      width
    }
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new window.Image()
    image.addEventListener('load', () => resolve(image), { once: true })
    image.addEventListener('error', () => reject(new Error('Could not read image')), {
      once: true
    })
    image.src = src
  })
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob)
        else reject(new Error('Could not compress image'))
      },
      type,
      quality
    )
  })
}
