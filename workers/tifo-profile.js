const maxAvatarDataUrlLength = 260000

function cleanAvatarDataUrl(value) {
  const dataUrl = typeof value === 'string' ? value.trim() : ''
  if (!dataUrl) return ''
  if (dataUrl.length > maxAvatarDataUrlLength) return ''
  return /^data:image\/(png|jpe?g|webp);base64,[a-z0-9+/=]+$/i.test(dataUrl) ? dataUrl : ''
}

module.exports = {
  cleanAvatarDataUrl
}
