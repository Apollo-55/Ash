import { parseDocument } from 'yaml'
import type { BlockIssue, ParsedBlock } from './systems/adapter.ts'

export const SCENE_BLOCK = 'szene'

export type GridType = 'square' | 'hex' | 'none'
export type Lighting = 'tag' | 'nacht' | 'dunkel'

export interface SceneBlockData {
  name?: string
  /** image reference ("[[deck.webp]]" or "deck.webp") */
  karte?: string
  /** id of a Leaflet block whose image and markers are used */
  leaflet?: string
  grid?: { type: GridType; size: number; distance: number; units: string }
  /** NPC links ("[[#Die Viper]]", "[[Notiz#Name]]", "[[Notiz]]") */
  nscs: string[]
  licht: Lighting
  nebel: boolean
  navigation: boolean
}

const KEYS: Record<string, string> = {
  name: 'name', karte: 'karte', bild: 'karte', leaflet: 'leaflet', raster: 'raster', nscs: 'nscs', tokens: 'nscs',
  licht: 'licht', nebel: 'nebel', navigation: 'navigation',
}
const GRID_TYPES: Record<string, GridType> = {
  quadrat: 'square', quadratisch: 'square', square: 'square', hex: 'hex', hexagon: 'hex', keins: 'none', kein: 'none', none: 'none', ohne: 'none',
}
const GRID_KEYS: Record<string, string> = { typ: 'typ', 'größe': 'size', groesse: 'size', pixel: 'size', schritt: 'distance', einheit: 'units' }
const LIGHTS: Lighting[] = ['tag', 'nacht', 'dunkel']

const show = (v: unknown) => (typeof v === 'string' ? `„${v}“` : JSON.stringify(v))

function toBool(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v
  const s = String(v).toLowerCase()
  if (['ja', 'an', 'yes', 'true'].includes(s)) return true
  if (['nein', 'aus', 'no', 'false'].includes(s)) return false
  return undefined
}

/** "[[x]]" parsed by YAML as nested arrays → back to the link text */
function linkText(v: unknown): string | null {
  if (typeof v === 'string') return v.trim()
  if (Array.isArray(v) && v.length === 1 && Array.isArray(v[0]) && v[0].length === 1 && typeof v[0][0] === 'string') return `[[${v[0][0]}]]`
  return null
}

export function parseSceneBlock(source: string): ParsedBlock<SceneBlockData> {
  const issues: BlockIssue[] = []
  const error = (message: string) => issues.push({ level: 'error', message })
  const doc = parseDocument(source, { uniqueKeys: true, prettyErrors: true })
  if (doc.errors.length) {
    for (const e of doc.errors) error(`YAML-Fehler${e.linePos?.[0]?.line ? ` in Zeile ${e.linePos[0].line}` : ''}: ${e.message.split('\n')[0].replace(/ at line \d+, column \d+:?$/, '')}`)
    return { name: null, data: null, issues }
  }
  const raw = doc.toJS() as unknown
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    error('Der Block muss aus „Schlüssel: Wert“-Zeilen bestehen.')
    return { name: null, data: null, issues }
  }
  const data: SceneBlockData = { nscs: [], licht: 'tag', nebel: false, navigation: true }
  for (const [rawKey, value] of Object.entries(raw as Record<string, unknown>)) {
    const key = KEYS[rawKey.trim().toLowerCase()]
    if (!key) {
      error(`Unbekannter Schlüssel „${rawKey}“ (erlaubt: name, karte, leaflet, raster, nscs, licht, nebel, navigation).`)
      continue
    }
    switch (key) {
      case 'name':
        if (value !== null && value !== undefined) data.name = String(value)
        break
      case 'karte': {
        const t = linkText(value)
        if (!t) error(`karte: ${show(value)} ist kein Bild (z. B. "[[deck.webp]]").`)
        else data.karte = t
        break
      }
      case 'leaflet':
        if (typeof value !== 'string' && typeof value !== 'number') error(`leaflet: ${show(value)} ist keine Karten-ID.`)
        else data.leaflet = String(value).trim()
        break
      case 'raster': {
        if (typeof value === 'string' && GRID_TYPES[value.toLowerCase()] === 'none') {
          data.grid = { type: 'none', size: 100, distance: 1, units: 'Schritt' }
          break
        }
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
          error('raster: z. B. { typ: quadrat, größe: 100, schritt: 1 } oder „keins“.')
          break
        }
        const g = { type: 'square' as GridType, size: 100, distance: 1, units: 'Schritt' }
        for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
          const gk = GRID_KEYS[k.toLowerCase()]
          if (!gk) error(`raster: unbekannter Schlüssel „${k}“ (erlaubt: typ, größe, schritt, einheit).`)
          else if (gk === 'typ') {
            const t = GRID_TYPES[String(v).toLowerCase()]
            if (!t) error(`raster: typ ${show(v)} ungültig (quadrat, hex, keins).`)
            else g.type = t
          } else if (gk === 'units') g.units = String(v)
          else {
            const n = Number(v)
            if (!Number.isFinite(n) || n <= 0) error(`raster: ${k} ${show(v)} ist keine positive Zahl.`)
            else if (gk === 'size' && (n < 50 || n > 1000)) error(`raster: größe ${n} – Foundry erlaubt 50 bis 1000 Pixel pro Feld.`)
            else (g as Record<string, unknown>)[gk] = n
          }
        }
        data.grid = g
        break
      }
      case 'nscs': {
        const list = Array.isArray(value) && !linkText(value) ? value : [value]
        for (const v of list) {
          const t = linkText(v)
          if (!t || !/^\[\[[^\]]+\]\]$/.test(t)) error(`nscs: ${show(v)} ist kein Link wie "[[#Die Viper]]".`)
          else data.nscs.push(t)
        }
        break
      }
      case 'licht': {
        const l = String(value).toLowerCase() as Lighting
        if (!LIGHTS.includes(l)) error(`licht: ${show(value)} ungültig (tag, nacht, dunkel).`)
        else data.licht = l
        break
      }
      case 'nebel':
      case 'navigation': {
        const b = toBool(value)
        if (b === undefined) error(`${key}: ${show(value)} ungültig (ja, nein).`)
        else data[key] = b
        break
      }
    }
  }
  if (!data.karte && !data.leaflet) error('Es fehlt „karte:“ oder „leaflet:“ – ohne Bild keine Szene.')
  if (data.karte && data.leaflet) error('Bitte nur „karte:“ oder „leaflet:“ angeben, nicht beides.')
  if (issues.some((i) => i.level === 'error' && /fehlt|nicht beides|YAML/.test(i.message))) return { name: data.name ?? null, data: null, issues }
  return { name: data.name ?? null, data, issues }
}

// ---- Leaflet -----------------------------------------------------------------------------------

export interface LeafletBlock {
  id: string
  /** image references as written ("[[Südaventurien.png]]") */
  images: string[]
  maxZoom: number
  /** custom bounds set in the block; pixel conversion is not possible then */
  hasBounds: boolean
}

export interface LeafletMarker {
  loc: [number, number]
  link?: string | null
  description?: string | null
}

/** Reads the options of a ```leaflet block (simple "key: value" lines plus image lists). */
export function parseLeafletBlock(content: string): LeafletBlock | null {
  let id: string | null = null
  let maxZoom = 10
  let hasBounds = false
  const images: string[] = []
  let inImages = false
  for (const line of content.split('\n')) {
    const m = /^\s*([A-Za-z]+)\s*:\s*(.*)$/.exec(line)
    if (m) {
      inImages = false
      const [, k, v] = m
      if (k === 'id') id = v.trim().replace(/^["']|["']$/g, '')
      else if (k === 'maxZoom' && Number.isFinite(Number(v))) maxZoom = Number(v)
      else if (k === 'bounds') hasBounds = true
      else if (k === 'image') {
        if (v.trim()) images.push(v.trim())
        else inImages = true
      }
      continue
    }
    const item = inImages ? /^\s*-\s*(.+)$/.exec(line) : null
    if (item) images.push(item[1].trim())
  }
  return id ? { id, images, maxZoom, hasBounds } : null
}

/** Leaflet plugin settings (data.json) → markers per map id */
export function leafletMarkersFromPluginData(json: unknown): Record<string, LeafletMarker[]> {
  const out: Record<string, LeafletMarker[]> = {}
  const maps = (json as { mapMarkers?: { id?: string; markers?: LeafletMarker[] }[] })?.mapMarkers ?? []
  for (const m of maps) {
    if (!m.id) continue
    out[m.id] = [...(out[m.id] ?? []), ...(m.markers ?? []).filter((x) => Array.isArray(x.loc) && x.loc.length === 2)]
  }
  return out
}

export const LEAFLET_DATA_PATH = 'plugins/obsidian-leaflet-plugin/data.json'

/** Pixel position of a Leaflet marker on the image (top left = 0,0). */
export function leafletToPixel(loc: [number, number], maxZoom: number): { x: number; y: number } {
  const scale = 2 ** (maxZoom - 1)
  return { x: Math.round(loc[1] * scale), y: Math.round(-loc[0] * scale) }
}

// ---- Rendering ---------------------------------------------------------------------------------

const esc = (s: unknown) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

export interface SceneCardOptions {
  sceneUuid?: string
  /** URL of the map image for a preview */
  imageSrc?: string | null
  showIssues?: boolean
  /** resolved names of the NPC tokens */
  tokenNames?: string[]
  pinCount?: number
  fallbackName?: string
}

const GRID_LABEL: Record<GridType, string> = { square: 'Quadrat', hex: 'Hex', none: 'kein Raster' }

export function renderSceneCard(block: ParsedBlock<SceneBlockData>, opts: SceneCardOptions = {}): string {
  const d = block.data
  const name = block.name ?? opts.fallbackName ?? 'Szene'
  const issues = opts.showIssues && block.issues.length
    ? `<ul class="vtf-nsc-issues">${block.issues.map((i) => `<li class="vtf-nsc-${i.level}">${i.level === 'error' ? '✖' : i.level === 'warning' ? '⚠' : 'ℹ'} ${esc(i.message)}</li>`).join('')}</ul>`
    : ''
  const link = opts.sceneUuid ? ` <span class="vtf-nsc-link">@UUID[${opts.sceneUuid}]{Szene öffnen}</span>` : ''
  if (!d) return `<div class="vtf-scene vtf-scene-broken"><div class="vtf-nsc-head"><strong>🗺 ${esc(name)}</strong></div>${issues}</div>\n`
  const grid = d.grid ?? (d.leaflet ? { type: 'none' as GridType, size: 100, distance: 1, units: 'Schritt' } : { type: 'square' as GridType, size: 100, distance: 1, units: 'Schritt' })
  const facts = [
    d.leaflet ? `Leaflet-Karte „${esc(d.leaflet)}“` : null,
    grid.type === 'none' ? 'kein Raster' : `${GRID_LABEL[grid.type]}, ${grid.size} px = ${grid.distance} ${esc(grid.units)}`,
    { tag: 'Tag', nacht: 'Nacht', dunkel: 'Dunkel' }[d.licht],
    d.nebel ? 'Nebel des Krieges' : null,
    opts.pinCount ? `${opts.pinCount} Pins` : null,
  ].filter(Boolean)
  const tokens = (opts.tokenNames ?? []).length ? `<p class="vtf-nsc-list"><b>Tokens:</b> ${opts.tokenNames!.map(esc).join(', ')}</p>` : ''
  const img = opts.imageSrc ? `<img class="vtf-scene-preview" src="${esc(opts.imageSrc)}" alt="">` : ''
  return `<div class="vtf-scene"><div class="vtf-nsc-head"><strong>🗺 ${esc(name)}</strong>${link}</div>${issues}<p class="vtf-nsc-values">${facts.join(' · ')}</p>${tokens}${img}</div>\n`
}
