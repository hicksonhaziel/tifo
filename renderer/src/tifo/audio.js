import { FALLBACK_CHANT_MS } from './constants.js'

function writeWavText(view, offset, text) {
  for (let index = 0; index < text.length; index += 1) {
    view.setUint8(offset + index, text.charCodeAt(index))
  }
}

export function createFallbackChantBlob() {
  const sampleRate = 22050
  const durationSeconds = FALLBACK_CHANT_MS / 1000
  const sampleCount = Math.floor(sampleRate * durationSeconds)
  const dataBytes = sampleCount * 2
  const buffer = new ArrayBuffer(44 + dataBytes)
  const view = new DataView(buffer)

  writeWavText(view, 0, 'RIFF')
  view.setUint32(4, 36 + dataBytes, true)
  writeWavText(view, 8, 'WAVE')
  writeWavText(view, 12, 'fmt ')
  view.setUint32(16, 16, true)
  view.setUint16(20, 1, true)
  view.setUint16(22, 1, true)
  view.setUint32(24, sampleRate, true)
  view.setUint32(28, sampleRate * 2, true)
  view.setUint16(32, 2, true)
  view.setUint16(34, 16, true)
  writeWavText(view, 36, 'data')
  view.setUint32(40, dataBytes, true)

  for (let index = 0; index < sampleCount; index += 1) {
    const time = index / sampleRate
    const beat = time % 0.46
    const phrase = Math.floor(time / 0.9) % 2 === 0 ? 1 : 0.84
    const voice =
      Math.sin(2 * Math.PI * 176 * phrase * time) * 0.34 +
      Math.sin(2 * Math.PI * 264 * phrase * time) * 0.18
    const noise = (((index * 48271) % 2147483647) / 1073741823.5 - 1) * 0.52
    const clap = beat < 0.04 ? noise * (1 - beat / 0.04) : 0
    const envelope = Math.min(1, time / 0.08, (durationSeconds - time) / 0.22)
    const sample = Math.max(-1, Math.min(1, (voice + clap) * envelope))
    view.setInt16(44 + index * 2, sample * 0x7fff, true)
  }

  return {
    blob: new Blob([buffer], { type: 'audio/wav' }),
    durationMs: FALLBACK_CHANT_MS,
    mimeType: 'audio/wav'
  }
}

export function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new window.FileReader()
    reader.addEventListener('load', () => {
      const result = String(reader.result || '')
      resolve(result.includes(',') ? result.slice(result.indexOf(',') + 1) : result)
    })
    reader.addEventListener('error', () =>
      reject(reader.error || new Error('Could not read chant'))
    )
    reader.readAsDataURL(blob)
  })
}

export function recordingSupported() {
  return !!navigator.mediaDevices?.getUserMedia && typeof window.MediaRecorder === 'function'
}

export function preferredChantMimeType() {
  const candidates = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg']
  if (
    typeof window.MediaRecorder === 'undefined' ||
    typeof window.MediaRecorder.isTypeSupported !== 'function'
  ) {
    return ''
  }

  return candidates.find((type) => window.MediaRecorder.isTypeSupported(type)) || ''
}
