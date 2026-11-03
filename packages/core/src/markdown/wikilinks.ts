import type { MarkdownIt, StateInline } from 'markdown-it'
import { assetKind, basename, extname, stripExtension } from '../paths.ts'
import { normalizeHeading, type RenderEnv } from './env.ts'

export interface ParsedWikilink {
  embed: boolean
  target: string
  /** text after "#" (heading, "^block" or "page=N") */
  subpath: string | null
  alias: string | null
}

export function parseWikilinkInner(inner: string, embed: boolean): ParsedWikilink {
  // Inside tables the pipe is escaped as "\|"
  let s = inner.replace(/\\\|/g, '|')
  let alias: string | null = null
  const pipe = s.indexOf('|')
  if (pipe >= 0) {
    alias = s.slice(pipe + 1).trim()
    s = s.slice(0, pipe)
  }
  let subpath: string | null = null
  const hash = s.indexOf('#')
  if (hash >= 0) {
    subpath = s.slice(hash + 1).trim()
    s = s.slice(0, hash)
  }
  return { embed, target: s.trim(), subpath: subpath || null, alias: alias || null }
}

function wikilinkRule(state: StateInline, silent: boolean): boolean {
  const start = state.pos
  const src = state.src
  const embed = src.charCodeAt(start) === 0x21 /* ! */
  const open = embed ? start + 1 : start
  if (!src.startsWith('[[', open)) return false
  const close = src.indexOf(']]', open + 2)
  if (close < 0) return false
  const inner = src.slice(open + 2, close)
  if (!inner.trim() || inner.includes('\n') || inner.includes('[[')) return false
  if (!silent) {
    const token = state.push('vtf_wikilink', '', 0)
    token.meta = parseWikilinkInner(inner, embed) as unknown as Record<string, unknown>
    token.content = inner
  }
  state.pos = close + 2
  return true
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** Label safe for @UUID[…]{label} and HTML text. */
export function uuidLabel(label: string): string {
  return esc(label.replace(/[{}]/g, (c) => (c === '{' ? '(' : ')')).replace(/\]/g, ')'))
}

export function uuidLink(uuid: string, label: string): string {
  return `@UUID[${uuid}]{${uuidLabel(label)}}`
}

function unresolved(label: string): string {
  return `<span class="vtf-unresolved">${esc(label)}</span>`
}

/** Renders a link to another note/heading. Shared by wikilinks and markdown links. */
export function renderNoteLink(
  env: RenderEnv,
  targetPath: string,
  subpath: string | null,
  alias: string | null,
  rawTarget: string
): string {
  const target = env.targets.get(targetPath)
  const displayBase = target?.name ?? stripExtension(basename(rawTarget || targetPath))
  if (!target) {
    env.warn('unresolved-link', `Link auf „${rawTarget || targetPath}“: Notiz wird nicht exportiert, als Text übernommen.`)
    return unresolved(alias ?? displayBase)
  }
  if (!subpath || subpath.startsWith('^')) return uuidLink(target.uuid, alias ?? displayBase)

  const anchor = target.anchors?.get(normalizeHeading(subpath))
  if (anchor) return uuidLink(anchor.uuid, alias ?? anchor.name)

  const wanted = normalizeHeading(subpath)
  const heading = target.headings?.find((h) => normalizeHeading(h.text) === wanted)
  const label = alias ?? `${displayBase} › ${subpath}`
  if (!heading || !target.pageUuid) {
    env.warn('unresolved-heading', `Überschrift „${subpath}“ in „${displayBase}“ nicht gefunden, verlinke die Notiz.`)
    return uuidLink(target.uuid, label)
  }
  return uuidLink(`${target.pageUuid}#${heading.slug}`, label)
}

function sizeAttrs(alias: string | null): { attrs: string; alt: string } {
  if (!alias) return { attrs: '', alt: '' }
  const m = /^(\d+)(?:x(\d+))?$/.exec(alias)
  if (m) return { attrs: ` width="${m[1]}"${m[2] ? ` height="${m[2]}"` : ''}`, alt: '' }
  const m2 = /^(.*?)\|(\d+)(?:x(\d+))?$/.exec(alias)
  if (m2) return { attrs: ` width="${m2[2]}"${m2[3] ? ` height="${m2[3]}"` : ''}`, alt: m2[1] }
  return { attrs: '', alt: alias }
}

export function renderAsset(env: RenderEnv, path: string, alias: string | null, subpath: string | null, embed: boolean): string {
  const url = env.assetUrl(path)
  const name = basename(path)
  if (!url) {
    env.warn('unresolved-embed', `Anhang „${name}“ ist nicht im Export enthalten.`)
    return unresolved(alias ?? name)
  }
  const kind = assetKind(path)
  const src = esc(encodeURI(url))
  if (kind === 'pdf') {
    const pdf = env.targets.get(path)
    const page = subpath && /^page=(\d+)/.exec(subpath)?.[1]
    const label = alias ?? (page ? `${stripExtension(name)}, S. ${page}` : stripExtension(name))
    const direct = `<a class="vtf-pdf-direct" href="${src}${page ? `#page=${page}` : ''}" target="_blank" rel="noopener">${
      page ? `S. ${page} öffnen` : 'PDF öffnen'
    }</a>`
    return pdf ? `${uuidLink(pdf.uuid, label)} <span class="vtf-pdf-ref">(${direct})</span>` : direct
  }
  if (!embed) return `<a href="${src}" target="_blank" rel="noopener">${esc(alias ?? name)}</a>`
  if (kind === 'image') {
    const { attrs, alt } = sizeAttrs(alias)
    return `<img src="${src}" alt="${esc(alt)}"${attrs}>`
  }
  if (kind === 'audio') return `<audio controls src="${src}"></audio>`
  if (kind === 'video') return `<video controls src="${src}"></video>`
  return `<a href="${src}" target="_blank" rel="noopener">${esc(alias ?? name)}</a>`
}

export function renderWikilink(link: ParsedWikilink, env: RenderEnv): string {
  // [[#Heading]] → same note
  const targetPath = link.target ? env.resolver.resolve(link.target, env.sourcePath) : env.sourcePath
  if (!targetPath) {
    const label = link.alias ?? (link.subpath ? `${link.target} › ${link.subpath}` : link.target)
    if (link.embed && extname(link.target)) {
      env.warn('unresolved-embed', `Eingebettete Datei „${link.target}“ nicht gefunden.`)
    } else {
      env.warn('unresolved-link', `Link „${link.target}“ führt ins Leere, als Text übernommen.`)
    }
    return unresolved(label)
  }
  if (extname(targetPath) === 'md') {
    // ![[Other note]] / ![[Note#Heading]]: show the content (up to 2 levels deep), otherwise a link
    if (link.embed && env.embedNote && (env.embedDepth ?? 0) < 2 && !link.subpath?.startsWith('^')) {
      const html = env.embedNote(targetPath, link.subpath, (env.embedDepth ?? 0) + 1)
      if (html !== null) {
        const title = renderNoteLink(env, targetPath, link.subpath, link.alias, link.target)
        return `</p><div class="vtf-embed"><div class="vtf-embed-title">${title}</div>\n${html}</div><p>`
      }
    }
    return renderNoteLink(env, targetPath, link.subpath, link.alias, link.target)
  }
  return renderAsset(env, targetPath, link.alias, link.subpath, link.embed)
}

export function wikilinkPlugin(md: MarkdownIt): void {
  md.inline.ruler.before('link', 'vtf_wikilink', wikilinkRule)
  md.renderer.rules.vtf_wikilink = (tokens, idx, _opts, env) =>
    renderWikilink(tokens[idx].meta as unknown as ParsedWikilink, env as unknown as RenderEnv)
}
