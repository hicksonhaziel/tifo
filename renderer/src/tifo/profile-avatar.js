const MAX_SOURCE_BYTES = 10 * 1024 * 1024
const AVATAR_SIZE = 192
const OUTPUT_QUALITY = 0.78

export async function profileAvatarFromFile(file) {
  if (!file || typeof file !== 'object') throw new Error('Choose an image file')
  if (!/^image\/(png|jpe?g|webp)$/i.test(file.type || '')) {
    throw new Error('Use a PNG, JPG, or WebP image')
  }
  if (file.size > MAX_SOURCE_BYTES) throw new Error('Choose an image under 10 MB')

  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await loadImage(objectUrl)
    const canvas = document.createElement('canvas')
    canvas.width = AVATAR_SIZE
    canvas.height = AVATAR_SIZE

    const context = canvas.getContext('2d')
    if (!context) throw new Error('Could not prepare profile image')

    const side = Math.min(image.naturalWidth || image.width, image.naturalHeight || image.height)
    const sx = Math.max(0, ((image.naturalWidth || image.width) - side) / 2)
    const sy = Math.max(0, ((image.naturalHeight || image.height) - side) / 2)

    context.clearRect(0, 0, AVATAR_SIZE, AVATAR_SIZE)
    context.imageSmoothingEnabled = true
    context.imageSmoothingQuality = 'high'
    context.drawImage(image, sx, sy, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE)

    return canvas.toDataURL('image/jpeg', OUTPUT_QUALITY)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new window.Image()
    image.addEventListener('load', () => resolve(image), { once: true })
    image.addEventListener('error', () => reject(new Error('Could not read profile image')), {
      once: true
    })
    image.src = src
  })
}
