// Generates packages/core/src/systems/dsa41/catalog.json from the dsa-41 pack sources (ref/dsa-41/src/packs).
// Only names, types, sids and a few weapon fields – used to validate dsa-nsc blocks offline and as lookup hints.
// Usage: node tools/gen-dsa41-catalog.mjs [path/to/dsa-4.1-system]
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parse } from 'yaml'

const repo = resolve(process.argv[2] ?? 'ref/dsa-41')
const system = JSON.parse(readFileSync(join(repo, 'src/system.json'), 'utf8'))
const TYPES = new Set(['talent', 'combatTalent', 'language', 'scripture', 'spell', 'liturgy', 'advantage', 'disadvantage',
  'specialAbility', 'meleeWeapon', 'rangedWeapon', 'shield', 'armor'])

const walk = (dir, out = []) => {
  for (const e of readdirSync(dir)) {
    const f = join(dir, e)
    if (statSync(f).isDirectory()) walk(f, out)
    else if (e.endsWith('.yml') && e !== '_folder.yml') out.push(f)
  }
  return out
}

const packs = system.packs.filter((p) => p.type === 'Item').map((p) => ({ name: p.name, label: p.label }))
const items = []
for (const p of packs) {
  for (const file of walk(join(repo, 'src', 'packs', p.name))) {
    const d = parse(readFileSync(file, 'utf8'))
    if (!d || !TYPES.has(d.type)) continue
    const s = d.system ?? {}
    const e = { n: d.name, t: d.type, s: s.sid ?? '', p: p.name }
    if (d.type === 'meleeWeapon' || d.type === 'rangedWeapon') {
      e.talent = s.talent ?? ''
      e.tp = s.damage ?? ''
      if (d.type === 'meleeWeapon') {
        e.dk = s.distanceClass ?? ''
        e.ini = Number(s.initiativeMod ?? 0)
        e.wm = [Number(s.weaponMod?.attack ?? 0), Number(s.weaponMod?.parry ?? 0)]
      }
    }
    if (d.type === 'combatTalent') e.cat = s.combat?.category ?? 'melee'
    if (d.type === 'armor') e.rs = Number(s.armorClass ?? 0)
    items.push(e)
  }
}
items.sort((a, b) => a.t.localeCompare(b.t) || a.n.localeCompare(b.n, 'de') || a.p.localeCompare(b.p))
const out = {
  _note: 'Generated from dsa-41 pack sources (Apache-2.0 / ORC). DAS SCHWARZE AUGE is a trademark of Ulisses Spiele GmbH.',
  system: system.id,
  version: system.version,
  packs,
  items,
}
writeFileSync('packages/core/src/systems/dsa41/catalog.json', JSON.stringify(out))
const count = {}
for (const i of items) count[i.t] = (count[i.t] ?? 0) + 1
console.log(`dsa-41 ${system.version}: ${items.length} Einträge`, count)
