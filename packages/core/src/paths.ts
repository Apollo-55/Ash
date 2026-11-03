import { FOUNDRY_FOLDER_MAX_DEPTH } from './types.ts'

export function basename(path: string): string {
  const i = path.lastIndexOf('/')
  return i < 0 ? path : path.slice(i + 1)
}

export function dirname(path: string): string {
  const i = path.lastIndexOf('/')
  return i < 0 ? '' : path.slice(0, i)
}

export function extname(path: string): string {
  const b = basename(path)
  const i = b.lastIndexOf('.')
  return i <= 0 ? '' : b.slice(i + 1).toLowerCase()
}

export function stripExtension(path: string): string {
  const ext = extname(path)
  return ext ? path.slice(0, -(ext.length + 1)) : path
}

const TRANSLIT: Record<string, string> = {
  ä: 'ae', ö: 'oe', ü: 'ue', Ä: 'Ae', Ö: 'Oe', Ü: 'Ue', ß: 'ss',
}

/** File/dir name safe for Foundry's data storage and URLs: [A-Za-z0-9._-]. */
export function safeSegment(segment: string): string {
  const s = segment
    .replace(/[äöüÄÖÜß]/g, (c) => TRANSLIT[c])
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, '_')
    .replace(/[^A-Za-z0-9._-]/g, '')
    .replace(/_+/g, '_')
  return s || '_'
}

export function safePath(path: string): string {
  return path.split('/').map(safeSegment).join('/')
}

export function vaultSlug(name: string): string {
  return safeSegment(name).toLowerCase()
}

/**
 * Splits a vault folder path into Foundry folder levels, merging levels beyond
 * maxDepth into the deepest allowed level ("A / B").
 */
export function folderLevels(
  folderPath: string,
  rootFolder?: string,
  maxDepth = FOUNDRY_FOLDER_MAX_DEPTH
): string[] {
  const parts = folderPath ? folderPath.split('/').filter(Boolean) : []
  if (rootFolder) parts.unshift(rootFolder)
  if (parts.length <= maxDepth) return parts
  return [...parts.slice(0, maxDepth - 1), parts.slice(maxDepth - 1).join(' / ')]
}

/**
 * Minimal glob matcher for exclude patterns.
 * - "folder/"     → everything below folder
 * - "*"           → any chars except "/"
 * - "**"          → any chars including "/"
 * - pattern without "/" matches the basename anywhere ("*.canvas")
 */
export function matchesPattern(path: string, pattern: string): boolean {
  let p = pattern.trim()
  if (!p) return false
  if (p.startsWith('/')) p = p.slice(1)
  if (p.endsWith('/')) return path === p.slice(0, -1) || path.startsWith(p)
  const target = p.includes('/') ? path : basename(path)
  const re = new RegExp(
    '^' +
      p
        .split('**')
        .map((chunk) =>
          chunk
            .split('*')
            .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
            .join('[^/]*')
        )
        .join('.*') +
      '$'
  )
  return re.test(target) || (p.includes('/') && path.startsWith(p + '/'))
}

export function isExcluded(path: string, patterns: string[]): boolean {
  return patterns.some((p) => matchesPattern(path, p))
}

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'avif', 'bmp'])
const AUDIO_EXT = new Set(['mp3', 'ogg', 'wav', 'flac', 'm4a', 'opus', 'webm'])
const VIDEO_EXT = new Set(['mp4', 'm4v', 'ogv', 'mov'])

export type AssetKind = 'image' | 'audio' | 'video' | 'pdf' | 'other'

export function assetKind(path: string): AssetKind {
  const ext = extname(path)
  if (IMAGE_EXT.has(ext)) return 'image'
  if (AUDIO_EXT.has(ext)) return 'audio'
  if (VIDEO_EXT.has(ext)) return 'video'
  if (ext === 'pdf') return 'pdf'
  return 'other'
}

/** Files that are neither notes nor uploadable attachments. */
export function isVaultInternal(path: string): boolean {
  const ext = extname(path)
  return ext === 'canvas' || ext === 'base' || path.startsWith('.obsidian/') || path.startsWith('.trash/')
}
