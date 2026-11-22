import { isSnapshot, type AccountSnapshot } from './accountStorage'

/**
 * PostgreSQL JSONB cannot store U+0000 inside JSON strings or object keys.
 * Transport the *entire* snapshot as base64-encoded UTF-8 JSON instead of
 * removing or changing question IDs, notes, answers, or imported questions.
 * This is an encoding for compatibility, NOT encryption; RLS remains essential.
 */
const CODEC = 'firstpass-utf8-base64-v1'

export interface CloudSnapshot {
  codec: typeof CODEC
  payload: string
}

export function encodeCloudSnapshot(snapshot: AccountSnapshot): CloudSnapshot {
  const bytes = new TextEncoder().encode(JSON.stringify(snapshot))
  const pieces: string[] = []
  // Avoid a browser argument-limit error on large progress snapshots.
  for (let offset = 0; offset < bytes.length; offset += 8192) {
    pieces.push(String.fromCharCode(...bytes.subarray(offset, offset + 8192)))
  }
  return { codec: CODEC, payload: btoa(pieces.join('')) }
}

export function decodeCloudSnapshot(value: unknown): AccountSnapshot {
  // Preserve compatibility with snapshots saved before this transport fix.
  if (isSnapshot(value)) return value
  if (!value || typeof value !== 'object') throw new Error('Invalid cloud progress format. Your browser progress was not changed.')
  const cloud = value as Partial<CloudSnapshot>
  if (cloud.codec !== CODEC || typeof cloud.payload !== 'string') {
    throw new Error('Unknown cloud progress format. Your browser progress was not changed.')
  }
  try {
    const binary = atob(cloud.payload)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const decoded: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    if (!isSnapshot(decoded)) throw new Error('Progress snapshot failed validation')
    return decoded
  } catch {
    throw new Error('Could not decode cloud progress. Your browser progress was not changed.')
  }
}
