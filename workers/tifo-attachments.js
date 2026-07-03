function transferSnapshot(input = {}) {
  return {
    chants: count(input.chants),
    chatMedia: count(input.chatMedia),
    clips: count(input.clips)
  }
}

function count(value) {
  if (Number.isFinite(value)) return value
  if (value && typeof value.size === 'number') return value.size
  if (Array.isArray(value)) return value.length
  return 0
}

module.exports = {
  transferSnapshot
}
