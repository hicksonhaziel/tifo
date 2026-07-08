const fs = require('fs')
const os = require('os')
const path = require('path')

const defaultTargetLanguage = 'en'
const maxTextLength = 1800

const languageNames = {
  ar: 'Arabic',
  de: 'German',
  en: 'English',
  es: 'Spanish',
  fr: 'French',
  hi: 'Hindi',
  it: 'Italian',
  ja: 'Japanese',
  ko: 'Korean',
  nl: 'Dutch',
  pt: 'Portuguese',
  ru: 'Russian',
  tr: 'Turkish',
  zh: 'Chinese'
}

const firefoxBergamotRecordsUrl =
  'https://firefox.settings.services.mozilla.com/v1/buckets/main/collections/translations-models/records'
const firefoxBergamotAttachmentBase = 'https://firefox-settings-attachments.cdn.mozilla.net'
const preferredBergamotVersion = '1.0'
const minBergamotFileBytes = 1024

function createQvacService({ sendToAll }) {
  let sdkPromise = null
  let bergamotRecordsPromise = null
  const bergamotFileLoads = new Map()
  const translationModels = new Map()
  const translationModelLoads = new Map()

  function emit(payload) {
    sendToAll('qvac:progress', {
      timestamp: Date.now(),
      ...payload
    })
  }

  function status() {
    return {
      available: isSdkResolvable(),
      defaultTargetLanguage,
      languages: Object.entries(languageNames).map(([code, label]) => ({ code, label })),
      loadedTranslationModels: translationModels.size
    }
  }

  async function translateText(input = {}) {
    const text = cleanText(input.text)
    if (!text) throw new Error('Nothing to translate')

    const targetLanguage = cleanLanguage(input.to) || defaultTargetLanguage
    const sourceLanguage = sourceLanguageForText(text, input.from, targetLanguage)
    if (!sourceLanguage) {
      throw new Error('Could not detect source language for local translation')
    }
    if (sourceLanguage === targetLanguage) {
      return {
        engine: 'qvac-bergamot',
        sourceLanguage,
        targetLanguage,
        text,
        unchanged: true
      }
    }

    const sdk = await getSdk()
    const modelId = await ensureTranslationModel(sdk, sourceLanguage, targetLanguage)
    emit({
      kind: 'translation',
      message: `Translating ${sourceLanguage.toUpperCase()} to ${targetLanguage.toUpperCase()}`,
      phase: 'running'
    })

    const result = sdk.translate({
      modelId,
      modelType: 'nmtcpp-translation',
      stream: false,
      text
    })
    const translatedText = cleanTranslatedText(await result.text)
    const stats = await result.stats.catch(() => null)

    emit({
      kind: 'translation',
      message: 'Translation ready',
      phase: 'ready'
    })

    return {
      engine: 'qvac-bergamot',
      sourceLanguage,
      stats,
      targetLanguage,
      text: translatedText || text
    }
  }

  async function unloadAll() {
    const sdk = sdkPromise ? await sdkPromise.catch(() => null) : null
    if (!sdk) return

    const unloads = []
    for (const modelId of translationModels.values()) {
      unloads.push(sdk.unloadModel({ clearStorage: false, modelId }).catch(() => {}))
    }

    await Promise.all(unloads)
    translationModels.clear()
    translationModelLoads.clear()
  }

  async function close() {
    const sdk = sdkPromise ? await sdkPromise.catch(() => null) : null
    if (!sdk) return
    await unloadAll().catch(() => {})
    await sdk.close?.().catch?.(() => {})
  }

  function getSdk() {
    if (!sdkPromise) {
      sdkPromise = import('@qvac/sdk').catch((err) => {
        sdkPromise = null
        throw new Error(err.message || 'QVAC SDK is not available')
      })
    }
    return sdkPromise
  }

  function ensureTranslationModel(sdk, sourceLanguage, targetLanguage) {
    const plan = translationPlan(sdk, sourceLanguage, targetLanguage)
    const cacheKey = plan.cacheKey
    const cached = translationModels.get(cacheKey)
    if (cached) return cached
    if (translationModelLoads.has(cacheKey)) return translationModelLoads.get(cacheKey)

    const load = loadTranslationModel(sdk, plan)
      .then((modelId) => {
        translationModels.set(cacheKey, modelId)
        translationModelLoads.delete(cacheKey)
        return modelId
      })
      .catch((err) => {
        translationModelLoads.delete(cacheKey)
        throw err
      })

    translationModelLoads.set(cacheKey, load)
    return load
  }

  async function loadTranslationModel(sdk, plan) {
    emit({
      kind: 'translation',
      message: `Loading ${plan.label}`,
      phase: 'loading'
    })

    const model = await resolveBergamotModel(plan)

    return sdk.loadModel({
      modelConfig: model.modelConfig,
      modelSrc: model.modelSrc,
      modelType: 'nmtcpp-translation',
      onProgress: (progress) => {
        emit({
          downloaded: progress.downloaded || 0,
          kind: 'translation',
          message: `Downloading ${plan.label}`,
          percentage: Number.isFinite(progress.percentage) ? Math.round(progress.percentage) : null,
          phase: 'download',
          total: progress.total || 0
        })
      }
    })
  }

  function translationPlan(_sdk, sourceLanguage, targetLanguage) {
    if (sourceLanguage === 'en' || targetLanguage === 'en') {
      return {
        cacheKey: `${sourceLanguage}:${targetLanguage}`,
        label: `${sourceLanguage.toUpperCase()} to ${targetLanguage.toUpperCase()}`,
        sourceLanguage,
        targetLanguage
      }
    }

    return {
      cacheKey: `${sourceLanguage}:en:${targetLanguage}`,
      label: `${sourceLanguage.toUpperCase()} to ${targetLanguage.toUpperCase()} via English`,
      pivotLanguage: 'en',
      sourceLanguage,
      targetLanguage
    }
  }

  async function resolveBergamotModel(plan) {
    const primaryTarget = plan.pivotLanguage || plan.targetLanguage
    const primary = await ensureBergamotFiles(plan.sourceLanguage, primaryTarget)
    const modelConfig = {
      ...bergamotGenerationConfig(plan.sourceLanguage, plan.targetLanguage),
      srcVocabSrc: primary.srcVocabSrc,
      dstVocabSrc: primary.dstVocabSrc
    }

    if (plan.pivotLanguage) {
      const pivot = await ensureBergamotFiles(plan.pivotLanguage, plan.targetLanguage)
      modelConfig.pivotModel = {
        beamsize: 1,
        dstVocabSrc: pivot.dstVocabSrc,
        lengthpenalty: 1.1,
        modelSrc: pivot.modelSrc,
        normalize: 1,
        srcVocabSrc: pivot.srcVocabSrc,
        temperature: 0.2
      }
    }

    return {
      modelConfig,
      modelSrc: primary.modelSrc
    }
  }

  function bergamotGenerationConfig(from, to) {
    return {
      beamsize: 1,
      engine: 'Bergamot',
      from,
      lengthpenalty: 1.1,
      normalize: 1,
      temperature: 0.2,
      to
    }
  }

  async function ensureBergamotFiles(sourceLanguage, targetLanguage) {
    const cacheKey = `${sourceLanguage}:${targetLanguage}`
    const existing = bergamotFileLoads.get(cacheKey)
    if (existing) return existing

    const load = downloadBergamotFiles(sourceLanguage, targetLanguage).catch((err) => {
      bergamotFileLoads.delete(cacheKey)
      throw err
    })
    bergamotFileLoads.set(cacheKey, load)
    return load
  }

  async function downloadBergamotFiles(sourceLanguage, targetLanguage) {
    const names = bergamotFileNames(sourceLanguage, targetLanguage)
    const dir = path.join(
      os.homedir(),
      '.qvac',
      'tifo-bergamot',
      `${sourceLanguage}-${targetLanguage}`
    )
    const records = await getBergamotRecords()
    const pairRecords = records.filter(
      (record) =>
        record.fromLang === normalizeBcp47Language(sourceLanguage) &&
        record.toLang === normalizeBcp47Language(targetLanguage) &&
        record.attachment
    )
    const selectedRecords = selectBergamotRecords(pairRecords, names)

    if (!selectedRecords.length) {
      throw new Error(
        `No compatible QVAC Bergamot model for ${sourceLanguage.toUpperCase()} to ${targetLanguage.toUpperCase()}`
      )
    }

    await fs.promises.mkdir(dir, { recursive: true })
    emit({
      kind: 'translation',
      message: `Preparing ${sourceLanguage.toUpperCase()} to ${targetLanguage.toUpperCase()} model`,
      phase: 'download'
    })

    for (const record of selectedRecords) {
      await downloadBergamotRecord(record, dir)
    }

    return {
      dstVocabSrc: path.join(dir, names.dstVocabName),
      modelSrc: path.join(dir, names.modelName),
      srcVocabSrc: path.join(dir, names.srcVocabName)
    }
  }

  function getBergamotRecords() {
    if (!bergamotRecordsPromise) {
      bergamotRecordsPromise = fetchJson(firefoxBergamotRecordsUrl).then((body) =>
        Array.isArray(body?.data) ? body.data : []
      )
    }
    return bergamotRecordsPromise
  }

  return {
    close,
    status,
    translateText,
    unloadAll
  }
}

function isSdkResolvable() {
  try {
    require.resolve('@qvac/sdk')
    return true
  } catch {
    return false
  }
}

function cleanText(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, maxTextLength)
}

function cleanTranslatedText(value) {
  return String(value || '')
    .trim()
    .replace(/^(translation|translated text)\s*:\s*/i, '')
    .replace(/^["']|["']$/g, '')
    .trim()
}

function cleanLanguage(value) {
  const language = String(value || '')
    .trim()
    .toLowerCase()
  return languageNames[language] ? language : ''
}

function sourceLanguageForText(text, requestedSource, targetLanguage) {
  const explicit = cleanLanguage(requestedSource)
  if (explicit) return explicit
  if (targetLanguage !== 'en') return 'en'
  return detectLanguage(text, targetLanguage)
}

function detectLanguage(text, targetLanguage = 'en') {
  const sample = ` ${String(text || '').toLowerCase()} `
  if (/[\u0600-\u06ff]/.test(sample)) return 'ar'
  if (/[\u4e00-\u9fff]/.test(sample)) return 'zh'
  if (/[\u3040-\u30ff]/.test(sample)) return 'ja'
  if (/[\uac00-\ud7af]/.test(sample)) return 'ko'
  if (/[а-яё]/i.test(sample)) return 'ru'
  if (/[¿¡ñáéíóúü]/i.test(sample) || hasAny(sample, [' hola ', ' gracias ', ' vamos ', ' gol '])) {
    return 'es'
  }
  if (/[àâçéèêëîïôûùüÿœ]/i.test(sample) || hasAny(sample, [' bonjour ', ' merci ', ' allez '])) {
    return 'fr'
  }
  if (/[ãõ]/i.test(sample) || hasAny(sample, [' obrigado ', ' obrigada ', ' vamos ', ' voce '])) {
    return 'pt'
  }
  if (/[äöüß]/i.test(sample) || hasAny(sample, [' danke ', ' bitte ', ' guten '])) return 'de'
  if (hasAny(sample, [' ciao ', ' grazie ', ' forza '])) return 'it'
  if (hasAny(sample, [' merhaba ', ' tesekkur ', ' tamam '])) return 'tr'
  if (targetLanguage !== 'en') return 'en'
  return ''
}

function hasAny(sample, needles) {
  return needles.some((needle) => sample.includes(needle))
}

function bergamotFileNames(sourceLanguage, targetLanguage) {
  const pair = `${sourceLanguage}${targetLanguage}`
  const cjkLanguages = ['zh', 'ja', 'ko']
  const separateVocab =
    cjkLanguages.includes(targetLanguage) ||
    (cjkLanguages.includes(sourceLanguage) && targetLanguage === 'en' && sourceLanguage !== 'en')

  return {
    dstVocabName: separateVocab ? `trgvocab.${pair}.spm` : `vocab.${pair}.spm`,
    lexName: `lex.50.50.${pair}.s2t.bin`,
    modelName: `model.${pair}.intgemm.alphas.bin`,
    srcVocabName: separateVocab ? `srcvocab.${pair}.spm` : `vocab.${pair}.spm`
  }
}

function normalizeBcp47Language(language) {
  return language === 'zh' ? 'zh-Hans' : language
}

function selectBergamotRecords(records, names) {
  const requiredNames = Array.from(
    new Set([names.modelName, names.srcVocabName, names.dstVocabName])
  )
  const optionalNames = [names.lexName]
  const selected = []

  for (const name of requiredNames) {
    const record = records.find(
      (item) => bergamotRecordName(item) === name && item.version === preferredBergamotVersion
    )
    if (!record) return []
    selected.push(record)
  }

  for (const name of optionalNames) {
    const record = records.find(
      (item) => bergamotRecordName(item) === name && item.version === preferredBergamotVersion
    )
    if (record) selected.push(record)
  }

  return selected
}

function bergamotRecordName(record) {
  return record?.name || record?.attachment?.filename || ''
}

async function downloadBergamotRecord(record, dir) {
  const filename = bergamotRecordName(record)
  if (!filename || !record?.attachment?.location) {
    throw new Error('Firefox Bergamot model record is missing an attachment')
  }

  const dest = path.join(dir, filename)
  const expectedSize = Number(record.attachment.size || 0)
  if (await isUsableFile(dest, expectedSize)) return

  const url = `${firefoxBergamotAttachmentBase}/${record.attachment.location}`
  const response = await fetch(url, { redirect: 'follow' })
  if (!response.ok) throw new Error(`HTTP ${response.status} downloading ${filename}`)

  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.byteLength < minBergamotFileBytes) {
    throw new Error(`Downloaded ${filename} is too small`)
  }
  if (expectedSize > 0 && buffer.byteLength !== expectedSize) {
    throw new Error(`Downloaded ${filename} has unexpected size`)
  }

  await fs.promises.writeFile(dest, buffer)
}

async function isUsableFile(filePath, expectedSize = 0) {
  try {
    const stat = await fs.promises.stat(filePath)
    return (
      stat.isFile() &&
      stat.size >= minBergamotFileBytes &&
      (!expectedSize || stat.size === expectedSize)
    )
  } catch {
    return false
  }
}

async function fetchJson(url) {
  if (typeof fetch !== 'function') {
    throw new Error('QVAC model download requires fetch support in Electron main')
  }

  const response = await fetch(url)
  if (!response.ok) throw new Error(`HTTP ${response.status} fetching QVAC model records`)
  return response.json()
}

module.exports = {
  createQvacService
}
