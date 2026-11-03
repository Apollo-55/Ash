import { parse as parseYaml } from 'yaml'

export interface SplitNote {
  frontmatter: Record<string, unknown> | null
  frontmatterError?: string
  body: string
}

/** Splits a leading YAML frontmatter block ("---" … "---") from the body. */
export function splitFrontmatter(raw: string): SplitNote {
  const text = raw.replace(/^﻿/, '')
  const m = /^---[ \t]*\r?\n([\s\S]*?)\r?\n(?:---|\.\.\.)[ \t]*(?:\r?\n|$)/.exec(text)
  if (!m) return { frontmatter: null, body: text }
  const body = text.slice(m[0].length)
  try {
    const data = parseYaml(m[1])
    return {
      frontmatter: data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : {},
      body,
    }
  } catch (e) {
    return { frontmatter: {}, frontmatterError: (e as Error).message, body }
  }
}

const FENCE_RE = /^ {0,3}(`{3,}|~{3,})/

export interface StripResult {
  text: string
  /** true if a %% comment was never closed (Obsidian hides the rest of the note). */
  unclosed: boolean
}

/**
 * Removes Obsidian comments (%%…%%, inline or across lines) and HTML comments.
 * Comment markers inside fenced code blocks and inline code spans are kept literally.
 * An unclosed %% comments out the rest of the note, exactly like Obsidian does.
 */
export function stripComments(input: string): StripResult {
  const lines = input.split('\n')
  const out: string[] = []
  let fence: string | null = null
  let inComment: '%%' | '<!--' | null = null

  for (const line of lines) {
    if (fence) {
      out.push(line)
      const m = FENCE_RE.exec(line)
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length && line.trim() === m[1]) fence = null
      continue
    }
    if (!inComment) {
      const m = FENCE_RE.exec(line)
      if (m) {
        fence = m[1]
        out.push(line)
        continue
      }
    }

    let result = ''
    let i = 0
    let touched = false
    while (i < line.length) {
      if (inComment) {
        const close = inComment === '%%' ? '%%' : '-->'
        const idx = line.indexOf(close, i)
        touched = true
        if (idx < 0) {
          i = line.length
          break
        }
        i = idx + close.length
        inComment = null
        continue
      }
      const ch = line[i]
      if (ch === '`') {
        let n = 1
        while (line[i + n] === '`') n++
        const run = '`'.repeat(n)
        const end = line.indexOf(run, i + n)
        if (end >= 0 && line[end + n] !== '`') {
          result += line.slice(i, end + n)
          i = end + n
        } else {
          result += run
          i += n
        }
        continue
      }
      if (line.startsWith('%%', i)) {
        inComment = '%%'
        i += 2
        touched = true
        continue
      }
      if (line.startsWith('<!--', i)) {
        inComment = '<!--'
        i += 4
        touched = true
        continue
      }
      result += ch
      i++
    }
    // Drop lines that consisted only of comment content, keep everything else.
    if (touched && result.trim() === '') {
      if (out.length && out[out.length - 1].trim() !== '') out.push('')
      continue
    }
    out.push(result)
  }
  return { text: out.join('\n'), unclosed: inComment !== null }
}

/** Removes Obsidian block ids ("text ^abc-1") outside of code fences. */
export function stripBlockIds(input: string): string {
  let fence: string | null = null
  return input
    .split('\n')
    .map((line) => {
      const m = FENCE_RE.exec(line)
      if (fence) {
        if (m && m[1][0] === fence[0] && line.trim() === m[1]) fence = null
        return line
      }
      if (m) {
        fence = m[1]
        return line
      }
      return line.replace(/(^|\s)\^[A-Za-z0-9-]+\s*$/, '')
    })
    .join('\n')
}
