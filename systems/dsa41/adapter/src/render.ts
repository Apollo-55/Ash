import type { ParsedBlock, StatblockOptions } from '../../../../packages/core/src/systems/adapter.ts'
import { find, findBySid, findWeapon } from './catalog.ts'
import { computeDerived, overrides } from './derived.ts'
import { ARMOR_ZONES, ATTRIBUTES, entryLabel, SHIELD_CATEGORY_LABEL, shieldCategory, ZONE_LABEL, type NamedEntry, type NscArmor, type NscData, type NscShield, type NscWeapon } from './schema.ts'

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/** ranges and TP+ as written in the block: "(5/15/25/40/60) --> (1/1/0/0/-1)" */
const rangesText = (rw: NonNullable<NscWeapon['RW']>) => `(${rw.map((r) => r[0]).join('/')}) --> (${rw.map((r) => r[1]).join('/')})`

const entryText = (e: NamedEntry) => `${esc(entryLabel(e))}${e.value !== null ? ` ${e.value}` : ''}`

const armorText = (r: NscArmor) => {
  const zones = r.zones ? ` [${ARMOR_ZONES.map((z) => `${ZONE_LABEL[z]} ${r.zones![z]}`).join(' ')}]` : ''
  const values = [r.RS !== undefined ? `RS ${r.RS}${zones}` : '', r.BE !== undefined ? `BE ${r.BE}` : ''].filter(Boolean)
  return `${esc(r.name)}${values.length ? ` (${values.join(', ')})` : ''}`
}

const signed = (n: number) => (n > 0 ? `+${n}` : String(n))

/** "Großschild (WM -2/+5, INI -2, BF 2)" – WM and INI from the block, otherwise from the catalog; BF only from the block. */
const shieldText = (sh: NscShield, withCategory: boolean) => {
  const known = find(['shield'], sh.name)
  const wm = sh.WM ?? known?.wm
  const ini = sh.INI ?? known?.ini
  const values = [
    withCategory ? SHIELD_CATEGORY_LABEL[shieldCategory(sh)] : '',
    wm ? `WM ${signed(wm[0])}/${signed(wm[1])}` : '',
    ini !== undefined && (sh.INI !== undefined || ini !== 0) ? `INI ${signed(ini)}` : '',
    sh.BF !== undefined ? `BF ${sh.BF}` : '',
  ].filter(Boolean)
  return `${esc(sh.name)}${values.length ? ` (${values.join(', ')})` : ''}`
}

/** line label by what the block lists: Schilde, Parierwaffen or both (then each entry names its category) */
function shieldsLine(shields: NscShield[]): string {
  if (!shields.length) return ''
  const cats = new Set(shields.map(shieldCategory))
  const mixed = cats.size > 1
  const label = mixed ? 'Schilde/Parierwaffen' : cats.has('parryingWeapon') ? 'Parierwaffen' : 'Schilde'
  return `<p class="vtf-nsc-list"><b>${label}:</b> ${shields.map((sh) => shieldText(sh, mixed)).join(', ')}</p>`
}

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

  const origin = [d.rasse, d.kultur].filter(Boolean).map(esc).join(', ')
  const head = `<div class="vtf-nsc-head"><strong class="vtf-nsc-name">${esc(d.name)}</strong>${
    d.rolle ? ` <span class="vtf-nsc-role">${esc(d.rolle)}</span>` : ''
  }${origin ? ` <span class="vtf-nsc-origin">(${origin})</span>` : ''}${
    opts.actorUuid ? ` <span class="vtf-nsc-link">@UUID[${opts.actorUuid}]{Zum Charakter}</span>` : ''
  }</div>`

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
  if (d.mrMod !== undefined) vals.push(`<span><b>MR-Mod</b> ${d.mrMod > 0 ? '+' : ''}${d.mrMod}</span>`)
  push('RS', d.RS)
  push('WS', d.WS, 'WS')
  push('GS', d.GS, 'GS')
  push('INI', d.INI, 'INI')
  push('Ausweichen', d.ausweichen, 'ausweichen')
  push('SO', d.SO)
  const valueLine = vals.length ? `<p class="vtf-nsc-values">${vals.join(' · ')}</p>` : ''

  // TP/KK, BF and ranges (with TP+) are not in the catalog, so their columns only appear when a weapon of the block gives them
  const showKK = d.waffen.some((w) => w.KK)
  const showBF = d.waffen.some((w) => w.BF !== undefined)
  const showRW = d.waffen.some((w) => w.RW)
  const weapons = d.waffen.length
    ? `<table class="vtf-nsc-weapons"><tr><th>Waffe</th><th>INI</th><th>AT</th><th>PA</th><th>TP</th>${showKK ? '<th>TP/KK</th>' : ''}${showBF ? '<th>BF</th>' : ''}<th>DK</th>${showRW ? '<th>Reichweite</th>' : ''}</tr>${d.waffen
        .map((w) => {
          const known = findWeapon(w.name, w.talent)
          const talent = w.talent ?? (known?.talent ? findBySid(known.talent)?.n : undefined)
          const tp = w.TP ?? known?.tp?.replace(/d/g, 'W') ?? ''
          const dk = w.DK ?? known?.dk ?? ''
          const at = w.FK !== undefined ? `FK ${w.FK}` : (w.AT ?? '')
          const talentHint = opts.showCalculated && talent && talent !== w.name ? ` <span class="vtf-nsc-calc">(${esc(talent)})</span>` : ''
          return `<tr><td>${esc(w.name)}${talentHint}</td><td>${w.INI ?? ''}</td><td>${at}</td><td>${w.PA ?? ''}</td><td>${esc(tp)}</td>${showKK ? `<td>${w.KK ? w.KK.join('/') : ''}</td>` : ''}${showBF ? `<td>${w.BF ?? ''}</td>` : ''}<td>${esc(dk)}</td>${showRW ? `<td>${w.RW ? esc(rangesText(w.RW)) : ''}</td>` : ''}</tr>`
        })
        .join('')}</table>`
    : ''

  const line = (label: string, entries: NamedEntry[]) =>
    entries.length
      ? `<p class="vtf-nsc-list"><b>${label}:</b> ${entries.map(entryText).join(', ')}</p>`
      : ''

  const lists = [
    line('Vorteile', d.vorteile),
    line('Nachteile', d.nachteile),
    line('Sonderfertigkeiten', d.sonderfertigkeiten),
    line('Talente', d.talente),
    line('Zauber', d.zauber),
    line('Liturgien', d.liturgien),
    d.ruestung.length
      ? `<p class="vtf-nsc-list"><b>Rüstung:</b> ${d.ruestung.map(armorText).join(', ')}</p>`
      : '',
    shieldsLine(d.schilde),
  ].join('')

  const note = d.notiz ? `<p class="vtf-nsc-note">${esc(d.notiz)}</p>` : ''
  return `<div class="vtf-nsc">${head}${opts.showIssues ? issuesHtml(block) : ''}${attrs}${valueLine}${weapons}${lists}${note}</div>\n`
}
