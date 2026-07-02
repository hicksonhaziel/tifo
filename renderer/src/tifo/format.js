export function formatTime(timestamp) {
  return new Intl.DateTimeFormat('en', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  }).format(timestamp)
}

export function formatDate(timestamp) {
  return new Intl.DateTimeFormat('en', {
    day: 'numeric',
    month: 'short'
  }).format(timestamp)
}

export function formatDuration(ms) {
  return `${Math.max(1, Math.round(ms / 1000))}s`
}

export function formatClipDuration(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return 'Duration unknown'
  const totalSeconds = Math.round(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes === 0) return `${seconds}s`
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 1) return '0 KB'
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatReplayOffset(ms) {
  if (Math.abs(ms) < 500) return 'Moment'
  const seconds = Math.round(ms / 1000)
  return seconds > 0 ? `+${seconds}s` : `${seconds}s`
}
