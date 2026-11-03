import type { MarkdownIt, StateCore, Token } from 'markdown-it'
import type { RenderEnv } from './env.ts'

interface CalloutMeta {
  kind: string
  rawType: string
  secret: boolean
  secretId?: string
  hasTitle?: boolean
}

const CALLOUT_RE = /^\[!([^\]\s]+)\]([+-]?)[ \t]*(.*)$/

/** Obsidian callout aliases → canonical type (used for styling). */
const ALIASES: Record<string, string> = {
  note: 'note', abstract: 'abstract', summary: 'abstract', tldr: 'abstract', info: 'info', todo: 'todo',
  tip: 'tip', hint: 'tip', important: 'tip', success: 'success', check: 'success', done: 'success',
  question: 'question', help: 'question', faq: 'question', warning: 'warning', caution: 'warning',
  attention: 'warning', failure: 'failure', fail: 'failure', missing: 'failure', danger: 'danger',
  error: 'danger', bug: 'bug', example: 'example', quote: 'quote', cite: 'quote',
  // German spellings
  notiz: 'note', hinweis: 'info', tipp: 'tip', warnung: 'warning', gefahr: 'danger', beispiel: 'example',
  zitat: 'quote', frage: 'question',
}

export const SECRET_TYPES = new Set(['geheim', 'secret'])

const DEFAULT_TITLES: Record<string, string> = {
  note: 'Notiz', abstract: 'Zusammenfassung', info: 'Info', todo: 'Aufgabe', tip: 'Tipp', success: 'Erledigt',
  question: 'Frage', warning: 'Warnung', failure: 'Fehlschlag', danger: 'Gefahr', bug: 'Fehler',
  example: 'Beispiel', quote: 'Zitat',
}

function findClose(tokens: Token[], openIdx: number): number {
  const level = tokens[openIdx].level
  for (let i = openIdx + 1; i < tokens.length; i++) {
    if (tokens[i].type === 'blockquote_close' && tokens[i].level === level) return i
  }
  return -1
}

function calloutRule(state: StateCore): void {
  const env = state.env as unknown as RenderEnv
  const tokens = state.tokens
  for (let i = 0; i < tokens.length; i++) {
    const open = tokens[i]
    if (open.type !== 'blockquote_open') continue
    const pOpen = tokens[i + 1]
    const inline = tokens[i + 2]
    if (pOpen?.type !== 'paragraph_open' || inline?.type !== 'inline') continue
    const [firstLine, ...rest] = inline.content.split('\n')
    const m = CALLOUT_RE.exec(firstLine)
    if (!m) continue
    const closeIdx = findClose(tokens, i)
    if (closeIdx < 0) continue

    const rawType = m[1].toLowerCase()
    const secret = SECRET_TYPES.has(rawType)
    const kind = secret ? 'secret' : (ALIASES[rawType] ?? 'note')
    const explicitTitle = m[3].trim()

    open.type = 'vtf_callout_open'
    open.meta = {
      kind,
      rawType,
      secret,
      secretId: secret ? env.secretId(env.secretCount++) : undefined,
    }
    tokens[closeIdx].type = 'vtf_callout_close'
    tokens[closeIdx].meta = { secret }

    const titleText = explicitTitle || (secret ? '' : (DEFAULT_TITLES[kind] ?? rawType))
    open.meta.hasTitle = Boolean(titleText)
    const inserted: Token[] = []
    if (titleText) {
      const tOpen = new state.Token('vtf_callout_title_open', 'div', 1)
      tOpen.meta = { secret }
      const tInline = new state.Token('inline', '', 0)
      tInline.content = titleText
      tInline.children = []
      tInline.map = inline.map
      const tClose = new state.Token('vtf_callout_title_close', 'div', -1)
      tClose.meta = { secret }
      inserted.push(tOpen, tInline, tClose)
    }

    const remaining = rest.join('\n')
    if (remaining.trim()) {
      inline.content = remaining
      tokens.splice(i + 1, 0, ...inserted)
    } else {
      // first paragraph contained only the title line → drop it
      tokens.splice(i + 1, 3, ...inserted)
    }
  }
}

export function calloutPlugin(md: MarkdownIt): void {
  // must run before "inline" so the remaining content and title get inline-parsed
  md.core.ruler.before('inline', 'vtf_callouts', calloutRule)
  const r = md.renderer.rules
  r.vtf_callout_open = (tokens, idx) => {
    const { kind, rawType, secret, secretId, hasTitle } = tokens[idx].meta as unknown as CalloutMeta
    if (secret) return `<section class="secret" id="secret-${secretId}">\n`
    const outer = `<div class="vtf-callout vtf-callout-${kind}" data-callout="${md.utils.escapeHtml(rawType)}">\n`
    return hasTitle ? outer : `${outer}<div class="vtf-callout-content">\n`
  }
  r.vtf_callout_close = (tokens, idx) => ((tokens[idx].meta as unknown as CalloutMeta).secret ? '</section>\n' : '</div>\n</div>\n')
  r.vtf_callout_title_open = (tokens, idx) =>
    (tokens[idx].meta as unknown as CalloutMeta).secret ? '<p class="vtf-secret-title"><strong>' : '<div class="vtf-callout-title">'
  r.vtf_callout_title_close = (tokens, idx) =>
    (tokens[idx].meta as unknown as CalloutMeta).secret ? '</strong></p>\n' : '</div>\n<div class="vtf-callout-content">\n'
}
