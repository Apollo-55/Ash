import type { ParsedBlock, StatblockOptions } from '../../../../packages/core/src/systems/adapter.ts'
import { findBySid, findWeapon } from './catalog.ts'
import { computeDerived, overrides } from './derived.ts'
import { ATTRIBUTES, type NamedEntry, type NscData } from './schema.ts'

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const entryText = (e: NamedEntry) => `${esc(e.name)}${e.value !== null ? ` ${e.value}` : ''}`

function issuesHtml(block: ParsedBlock<NscData>): string {
  if (!block.issues.length) return ''
  const icon = { error: '✖', warning: '⚠', info: 'ℹ' }
  return `<ul class="vtf-nsc-issues">${block.issues
    .map((i) => `<li class="vtf-nsc-${i.level}">${icon[i.level]} ${esc(i.message)}</li>`)
    .join('')}</ul>`
}

/** The stat box. Used in Obsidian (with issues and calculated values) and in the Foundry journal. */
export function renderStatblock(block: ParsedBlock<NscData>, opts: StatblockOptions = {}): string {
  const d = block.data
  if (!d) {
    return `<div class="vtf-nsc vtf-nsc-broken"><div class="vtf-nsc-head"><strong>${esc(block.name ?? 'NSC')}</strong></div>${
      opts.showIssues ? issuesHtml(block) : ''
    }</div>`
  }
  const derived = computeDerived(d)
  const over = new Map(overrides(d).map((o) => [o.key, o]))
  const calc = (key: keyof typeof derived) => {
    const o = over.get(key)
    return opts.showCalculated && o ? ` <span class="vtf-nsc-calc" title="vom System berechnet">(gerechnet ${o.calculated})</span>` : ''
  }

  const head = `<div class="vtf-nsc-head"><strong class="vtf-nsc-name">${esc(d.name)}</strong>${
    d.rolle ? ` <span class="vtf-nsc-role">${esc(d.rolle)}</span>` : ''
  }${opts.actorUuid ? ` <span class="vtf-nsc-link">@UUID[${opts.actorUuid}]{Zum Charakter}</span>` : ''}</div>`

  const attrs = ATTRIBUTES.some((a) => d.attributes[a] !== undefined)
    ? `<table class="vtf-nsc-attr"><tr>${ATTRIBUTES.map((a) => `<th>${a}</th>`).join('')}</tr><tr>${ATTRIBUTES.map(
        (a) => `<td>${d.attributes[a] ?? '–'}</td>`
      ).join('')}</tr></table>`
    : ''

  const vals: string[] = []
  const push = (label: string, v: number | undefined, key?: keyof typeof derived) => {
    if (v !== undefined) vals.push(`<span><b>${label}</b> ${v}${key ? calc(key) : ''}</span>`)
  }
  push('LeP', d.LeP)
  push('AuP', d.AuP)
  push('AsP', d.AsP)
  push('KaP', d.KaP)
  push('MR', d.MR, 'MR')
  push('RS', d.RS)
  push('WS', d.WS, 'WS')
  push('GS', d.GS, 'GS')
  push('INI', d.INI, 'INI')
  push('Ausweichen', d.ausweichen, 'ausweichen')
  push('SO', d.SO)
  const valueLine = vals.length ? `<p class="vtf-nsc-values">${vals.join(' · ')}</p>` : ''

  // TP/KK is not in the catalog, so the column only appears when a weapon of the block gives it
  const showKK = d.waffen.some((w) => w.KK)
  const weapons = d.waffen.length
    ? `<table class="vtf-nsc-weapons"><tr><th>Waffe</th><th>INI</th><th>AT</th><th>PA</th><th>TP</th>${showKK ? '<th>TP/KK</th>' : ''}<th>DK</th></tr>${d.waffen
        .map((w) => {
          const known = findWeapon(w.name, w.talent)
          const talent = w.talent ?? (known?.talent ? findBySid(known.talent)?.n : undefined)
          const tp = w.TP ?? known?.tp?.replace(/d/g, 'W') ?? ''
          const dk = w.DK ?? known?.dk ?? ''
          const at = w.FK !== undefined ? `FK ${w.FK}` : (w.AT ?? '')
          const talentHint = opts.showCalculated && talent && talent !== w.name ? ` <span class="vtf-nsc-calc">(${esc(talent)})</span>` : ''
          return `<tr><td>${esc(w.name)}${talentHint}</td><td>${w.INI ?? ''}</td><td>${at}</td><td>${w.PA ?? ''}</td><td>${esc(tp)}</td>${showKK ? `<td>${w.KK ? w.KK.join('/') : ''}</td>` : ''}<td>${esc(dk)}</td></tr>`
        })
        .join('')}</table>`
    : ''

  const line = (label: string, entries: NamedEntry[] | string[]) =>
    entries.length
      ? `<p class="vtf-nsc-list"><b>${label}:</b> ${(entries as (NamedEntry | string)[])
          .map((e) => (typeof e === 'string' ? esc(e) : entryText(e)))
          .join(', ')}</p>`
      : ''

  const lists = [
    line('Vorteile', d.vorteile),
    line('Nachteile', d.nachteile),
    line('Sonderfertigkeiten', d.sonderfertigkeiten),
    line('Talente', d.talente),
    line('Zauber', d.zauber),
    line('Liturgien', d.liturgien),
    line('Rüstung', d.ruestung),
  ].join('')

  const note = d.notiz ? `<p class="vtf-nsc-note">${esc(d.notiz)}</p>` : ''
  return `<div class="vtf-nsc">${head}${opts.showIssues ? issuesHtml(block) : ''}${attrs}${valueLine}${weapons}${lists}${note}</div>\n`
}
