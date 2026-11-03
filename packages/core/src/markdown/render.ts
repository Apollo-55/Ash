import MarkdownItCtor, { type MarkdownIt, type StateCore, type Token } from 'markdown-it'
import { extname } from '../paths.ts'
import { calloutPlugin } from './callouts.ts'
import { slugifyHeading, type FenceHandler, type RenderEnv } from './env.ts'
import { renderAsset, renderNoteLink, uuidLink, wikilinkPlugin } from './wikilinks.ts'

const isExternal = (href: string) => /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//') || href.startsWith('#')

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

/** Plain text of an inline token (for heading anchors and link labels). */
function inlineText(children: Token[] | null): string {
  if (!children) return ''
  return children
    .map((c) => {
      if (c.type === 'text' || c.type === 'code_inline') return c.content
      if (c.type === 'vtf_wikilink') return c.meta?.alias ?? c.meta?.target ?? ''
      if (c.type === 'softbreak' || c.type === 'hardbreak') return ' '
      return ''
    })
    .join('')
    .trim()
}

/** Adds data-anchor to headings and records them in env.headings. */
function headingRule(state: StateCore): void {
  const env = state.env as unknown as RenderEnv
  const used = new Map<string, number>()
  const tokens = state.tokens
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i].type !== 'heading_open') continue
    const text = inlineText(tokens[i + 1]?.children ?? null)
    if (!text) continue
    let slug = slugifyHeading(text)
    const n = used.get(slug) ?? 0
    used.set(slug, n + 1)
    if (n > 0) slug = `${slug}-${n}`
    tokens[i].attrSet('data-anchor', slug)
    env.headings.push({ text, slug })
  }
}

/** Rewrites [text](Note.md) / [text](bild.png) to Foundry links and asset URLs. */
function markdownLinkRule(state: StateCore): void {
  const env = state.env as unknown as RenderEnv
  for (const block of state.tokens) {
    if (block.type !== 'inline' || !block.children) continue
    const children = block.children
    for (let i = 0; i < children.length; i++) {
      const t = children[i]
      if (t.type === 'image') {
        const src = String(t.attrGet('src') ?? '')
        if (isExternal(src)) continue
        const path = env.resolver.resolve(safeDecode(src), env.sourcePath)
        const html = path
          ? renderAsset(env, path, t.content || null, null, true)
          : (env.warn('unresolved-embed', `Bild „${safeDecode(src)}“ nicht gefunden.`), `<span class="vtf-unresolved">${state.md.utils.escapeHtml(t.content || src)}</span>`)
        const repl = new state.Token('html_inline', '', 0)
        repl.content = html
        children[i] = repl
        continue
      }
      if (t.type !== 'link_open') continue
      const href = String(t.attrGet('href') ?? '')
      if (isExternal(href)) continue
      const [rawPath, ...frag] = safeDecode(href).split('#')
      const path = env.resolver.resolve(rawPath, env.sourcePath)
      // find matching close
      let j = i + 1
      let depth = 1
      for (; j < children.length; j++) {
        if (children[j].type === 'link_open') depth++
        if (children[j].type === 'link_close' && --depth === 0) break
      }
      const label = inlineText(children.slice(i + 1, j)) || rawPath
      let html: string
      if (path && extname(path) === 'md') html = renderNoteLink(env, path, frag.join('#') || null, label, rawPath)
      else if (path) html = renderAsset(env, path, label, frag.join('#') || null, false)
      else {
        env.warn('unresolved-link', `Link „${rawPath}“ führt ins Leere, als Text übernommen.`)
        html = `<span class="vtf-unresolved">${state.md.utils.escapeHtml(label)}</span>`
      }
      const repl = new state.Token('html_inline', '', 0)
      repl.content = html
      children.splice(i, j - i + 1, repl)
    }
  }
}

/** "- [ ] x" / "- [x] x" → checkbox symbols (Foundry strips <input>). */
function taskRule(state: StateCore): void {
  const tokens = state.tokens
  for (let i = 2; i < tokens.length; i++) {
    const t = tokens[i]
    if (t.type !== 'inline' || tokens[i - 2]?.type !== 'list_item_open') continue
    const first = t.children?.[0]
    if (first?.type !== 'text') continue
    const m = /^\[([ xX])\]\s/.exec(first.content)
    if (!m) continue
    first.content = (m[1] === ' ' ? '☐ ' : '☑ ') + first.content.slice(m[0].length)
  }
}

export const builtinFenceHandlers: Record<string, FenceHandler> = {
  dataview: (_c, env) => {
    env.warn('dataview-skipped', 'Dataview-Abfrage ausgelassen.')
    return ''
  },
  dataviewjs: (_c, env) => {
    env.warn('dataview-skipped', 'DataviewJS-Block ausgelassen.')
    return ''
  },
  leaflet: (content, env) => {
    const images: string[] = []
    let inImageList = false
    for (const line of content.split('\n')) {
      const m = /^\s*image\s*:\s*(.*)$/.exec(line)
      if (m) {
        inImageList = !m[1].trim()
        if (m[1].trim()) images.push(m[1].trim())
        continue
      }
      if (inImageList) {
        const item = /^\s*-\s*(.+)$/.exec(line)
        if (item) images.push(item[1].trim())
        else if (line.trim()) inImageList = false
      }
    }
    const html = images
      .map((ref) => {
        const wl = /^\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]$/.exec(ref.replace(/^["']|["']$/g, ''))
        const name = wl ? wl[1] : ref.replace(/^["']|["']$/g, '')
        const path = env.resolver.resolve(name, env.sourcePath)
        if (!path) {
          env.warn('unresolved-embed', `Leaflet-Karte „${name}“ nicht gefunden.`)
          return ''
        }
        return renderAsset(env, path, null, null, true)
      })
      .filter(Boolean)
    return html.length ? `<figure class="vtf-map">${html.join('')}</figure>\n` : ''
  },
}

export function createMarkdown(): MarkdownIt {
  const md = new MarkdownItCtor({ html: true, breaks: true, linkify: false, typographer: false })
  md.use(wikilinkPlugin)
  md.use(calloutPlugin)
  md.core.ruler.after('inline', 'vtf_headings', headingRule)
  md.core.ruler.after('vtf_headings', 'vtf_md_links', markdownLinkRule)
  md.core.ruler.after('vtf_md_links', 'vtf_tasks', taskRule)

  const defaultFence = md.renderer.rules.fence!
  md.renderer.rules.fence = (tokens, idx, opts, rawEnv, self) => {
    const env = rawEnv as unknown as RenderEnv
    const info = tokens[idx].info.trim()
    const lang = info.split(/\s+/)[0]?.toLowerCase() ?? ''
    const handler = env.fenceHandlers[lang] ?? builtinFenceHandlers[lang]
    if (handler) return handler(tokens[idx].content, env, info)
    return defaultFence(tokens, idx, opts, rawEnv, self)
  }
  return md
}

let shared: MarkdownIt | null = null
export function getMarkdown(): MarkdownIt {
  return (shared ??= createMarkdown())
}

/** Renders a (pre-processed) note body to HTML. Fills env.headings and env.secretCount. */
export function renderBody(body: string, env: RenderEnv): string {
  env.headings = []
  env.secretCount = 0
  return getMarkdown().render(body, env as unknown as Record<string, unknown>)
}

export { uuidLink }
