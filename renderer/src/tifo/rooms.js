import { cleanAvatarDataUrl } from './identity.js'

export const MATCH_ROOMS_STORAGE_KEY = 'tifo:match-rooms:v1'

const DEFAULT_MATCH_ROOMS = [
  {
    away: 'SEN',
    awayAcc: '#7BC49A',
    awayAccent: '#7BC49A',
    awayName: 'Senegal',
    code: 'MAR-SEN-QF',
    detail: '218 fans',
    fans: 218,
    home: 'MAR',
    homeAcc: '#B87A70',
    homeAccent: '#B87A70',
    homeName: 'Morocco',
    live: true,
    region: 'AFCON · Quarter-final',
    round: 'AFCON · Quarter-final',
    title: 'Morocco vs Senegal',
    tone: 'ignite',
    unread: 0
  },
  {
    away: 'CIV',
    awayAcc: '#D48F5A',
    awayAccent: '#D48F5A',
    awayName: "Côte d'Ivoire",
    code: 'EGY-CIV-R16',
    detail: '154 fans',
    fans: 154,
    home: 'EGY',
    homeAcc: '#B87A70',
    homeAccent: '#B87A70',
    homeName: 'Egypt',
    live: false,
    region: 'AFCON · Round of 16',
    round: 'AFCON · Round of 16',
    title: "Egypt vs Côte d'Ivoire",
    tone: 'warning',
    unread: 0
  },
  {
    away: 'BRA',
    awayAcc: '#D4C25A',
    awayAccent: '#D4C25A',
    awayName: 'Brazil',
    code: 'ARG-BRA-WCQ',
    detail: '892 fans',
    fans: 892,
    home: 'ARG',
    homeAcc: '#7FA6D1',
    homeAccent: '#7FA6D1',
    homeName: 'Argentina',
    live: true,
    region: 'CONMEBOL · WC Qualifier',
    round: 'CONMEBOL · WC Qualifier',
    title: 'Argentina vs Brazil',
    tone: 'cold',
    unread: 12
  },
  {
    away: 'ARS',
    awayAcc: '#B87A70',
    awayAccent: '#B87A70',
    awayName: 'Arsenal',
    code: 'MCI-ARS-PL',
    detail: '621 fans',
    fans: 621,
    home: 'MCI',
    homeAcc: '#7FA6D1',
    homeAccent: '#7FA6D1',
    homeName: 'Man City',
    live: false,
    region: 'Premier League · MW 28',
    round: 'Premier League · MW 28',
    title: 'Man City vs Arsenal',
    tone: 'cold',
    unread: 0
  },
  {
    away: 'BAR',
    awayAcc: '#8B6F9E',
    awayAccent: '#8B6F9E',
    awayName: 'Barcelona',
    code: 'RMA-BAR-EC',
    detail: '1204 fans',
    fans: 1204,
    home: 'RMA',
    homeAcc: '#C7C3BB',
    homeAccent: '#C7C3BB',
    homeName: 'Real Madrid',
    live: false,
    region: 'El Clásico · La Liga',
    round: 'El Clásico · La Liga',
    title: 'Real Madrid vs Barcelona',
    tone: 'clean',
    unread: 0
  }
]

export function loadMatchRooms() {
  try {
    const raw = window.localStorage.getItem(MATCH_ROOMS_STORAGE_KEY)
    if (!raw) return seedRooms()
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return seedRooms()
    return parsed.map(cleanMatchRoom).filter(Boolean)
  } catch {
    return seedRooms()
  }
}

export function saveMatchRooms(rooms = []) {
  const cleanRooms = dedupeRooms(rooms.map(cleanMatchRoom).filter(Boolean))
  window.localStorage.setItem(MATCH_ROOMS_STORAGE_KEY, JSON.stringify(cleanRooms))
  return cleanRooms
}

export function createMatchRoom(input = {}, existingRooms = loadMatchRooms()) {
  const homeName = cleanTeamName(input.homeName || input.home)
  const awayName = cleanTeamName(input.awayName || input.away)
  if (!homeName || !awayName) throw new Error('Home and away teams are required')

  const now = Date.now()
  const home = cleanTeamCode(input.home || homeName)
  const away = cleanTeamCode(input.away || awayName)
  const baseCode = cleanCode(`${home}-${away}`)
  const existingCodes = new Set(existingRooms.map((room) => room.code))
  let code = baseCode || `ROOM-${randomToken(4)}`
  while (existingCodes.has(code)) code = `${baseCode || 'ROOM'}-${randomToken(3)}`

  const round = cleanRound(input.round) || 'Custom match room'
  return {
    away,
    awayAcc: '#7FA6D1',
    awayAccent: '#7FA6D1',
    awayName,
    avatarDataUrl: cleanAvatarDataUrl(input.avatarDataUrl),
    code,
    createdAt: now,
    detail: 'Local room',
    fans: 1,
    home,
    homeAcc: '#6FA890',
    homeAccent: '#6FA890',
    homeName,
    kind: 'match',
    live: false,
    region: round,
    round,
    title: `${homeName} vs ${awayName}`,
    tone: 'clean',
    unread: 0,
    userCreated: true
  }
}

export function saveMatchRoom(room) {
  const rooms = loadMatchRooms()
  const clean = cleanMatchRoom(room)
  if (!clean) return rooms
  return saveMatchRooms([clean, ...rooms.filter((item) => item.code !== clean.code)])
}

export function deleteMatchRoom(roomCode) {
  const cleanCodeValue = cleanCode(roomCode)
  if (!cleanCodeValue) return loadMatchRooms()
  return saveMatchRooms(loadMatchRooms().filter((room) => room.code !== cleanCodeValue))
}

function seedRooms() {
  return DEFAULT_MATCH_ROOMS.map((room) => ({
    ...room,
    kind: 'match',
    userCreated: false
  }))
}

function dedupeRooms(rooms) {
  const seen = new Set()
  const next = []
  for (const room of rooms) {
    if (seen.has(room.code)) continue
    seen.add(room.code)
    next.push(room)
  }
  return next.slice(0, 80)
}

function cleanMatchRoom(room) {
  if (!room || typeof room !== 'object') return null
  const homeName = cleanTeamName(room.homeName || room.home)
  const awayName = cleanTeamName(room.awayName || room.away)
  const code = cleanCode(room.code || `${cleanTeamCode(homeName)}-${cleanTeamCode(awayName)}`)
  if (!homeName || !awayName || !code) return null

  const round = cleanRound(room.round || room.region || room.detail) || 'Match room'
  return {
    away: cleanTeamCode(room.away || awayName),
    awayAcc: cleanColor(room.awayAcc || room.awayAccent) || '#7FA6D1',
    awayAccent: cleanColor(room.awayAccent || room.awayAcc) || '#7FA6D1',
    awayName,
    avatarDataUrl: cleanAvatarDataUrl(room.avatarDataUrl),
    code,
    createdAt: Number.isFinite(room.createdAt) ? room.createdAt : Date.now(),
    detail: cleanRound(room.detail) || round,
    fans: Number.isFinite(room.fans) ? Math.max(1, Math.round(room.fans)) : 1,
    home: cleanTeamCode(room.home || homeName),
    homeAcc: cleanColor(room.homeAcc || room.homeAccent) || '#6FA890',
    homeAccent: cleanColor(room.homeAccent || room.homeAcc) || '#6FA890',
    homeName,
    kind: 'match',
    live: room.live === true,
    region: round,
    round,
    title: cleanTitle(room.title) || `${homeName} vs ${awayName}`,
    tone: ['ignite', 'warning', 'cold', 'clean'].includes(room.tone) ? room.tone : 'clean',
    unread: Number.isFinite(room.unread) ? Math.max(0, Math.round(room.unread)) : 0,
    userCreated: room.userCreated === true
  }
}

function cleanTitle(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .slice(0, 72)
}

function cleanTeamName(value) {
  return cleanTitle(value).slice(0, 40)
}

function cleanRound(value) {
  return cleanTitle(value).slice(0, 56)
}

function cleanTeamCode(value) {
  const words = cleanTitle(value).split(/\s+/).filter(Boolean)
  const raw =
    words.length >= 2 ? words.map((word) => word.slice(0, 1)).join('') : words[0]?.slice(0, 3) || ''
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 4)
}

function cleanCode(value) {
  return String(value || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48)
}

function cleanColor(value) {
  const color = typeof value === 'string' ? value.trim() : ''
  return /^#[0-9a-f]{6}$/i.test(color) ? color : ''
}

function randomToken(byteLength) {
  const bytes = new Uint8Array(byteLength)
  window.crypto.getRandomValues(bytes)
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}
