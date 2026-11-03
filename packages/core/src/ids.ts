import { sha256 } from '@noble/hashes/sha2.js'
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js'

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

/** Foundry document ids: exactly 16 chars of [A-Za-z0-9]. */
export const FOUNDRY_ID_PATTERN = /^[A-Za-z0-9]{16}$/

/**
 * Deterministic Foundry id from arbitrary parts (vault name, source path, block name …).
 * Parts are joined with a separator that cannot occur in paths, so ["a/b","c"] ≠ ["a","b/c"].
 */
export function makeId(...parts: string[]): string {
  const digest = sha256(utf8ToBytes(parts.join('\u0000')))
  let n = 0n
  for (let i = 0; i < 16; i++) n = (n << 8n) | BigInt(digest[i])
  let id = ''
  for (let i = 0; i < 16; i++) {
    id += BASE62[Number(n % 62n)]
    n /= 62n
  }
  return id
}

/** Short content hash (hex) for change detection. */
export function hashString(text: string): string {
  return bytesToHex(sha256(utf8ToBytes(text))).slice(0, 32)
}

export function hashBytes(bytes: Uint8Array): string {
  return bytesToHex(sha256(bytes)).slice(0, 32)
}

/** JSON with sorted keys, so hashes do not depend on property order. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const obj = value as Record<string, unknown>
  return `{${Object.keys(obj)
    .filter((k) => obj[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`
}

export function hashObject(value: unknown): string {
  return hashString(stableStringify(value))
}
