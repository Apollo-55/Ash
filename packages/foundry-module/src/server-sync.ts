import { MODULE_ID, SETTINGS } from './constants.ts'
import { importBundle, validateBundle, type ImportReport } from './importer.ts'

/** Data folder written by the vtf-sync service (and by the ZIP import's uploads). */
const ROOT = 'vault-to-foundry'

export interface ServerVault {
  slug: string
  name: string
  revision: number
  updatedAt: string
  applied: number
}

const FilePicker = () => foundry.applications.apps.FilePicker.implementation

async function fetchJson(path: string): Promise<any | null> {
  try {
    const res = await fetch(`${foundry.utils.getRoute(path)}?t=${Date.now()}`, { cache: 'no-store' })
    return res.ok ? await res.json() : null
  } catch {
    return null
  }
}

const applied = (): Record<string, number> => game.settings.get(MODULE_ID, SETTINGS.syncRevisions) ?? {}

/** The vault this world is connected to ("" = none yet). Set by the first apply, cleared in the module settings. */
export const boundVault = (): string => String(game.settings.get(MODULE_ID, SETTINGS.boundVault) ?? '').trim()

/** Which vaults a world offers: only its own once connected; missing = its vault is not on the server. */
export function vaultsForWorld(vaults: ServerVault[], bound: string): { vaults: ServerVault[]; missing: boolean } {
  if (!bound) return { vaults, missing: false }
  const own = vaults.filter((v) => v.slug === bound)
  return { vaults: own, missing: !own.length }
}

/** Vaults the sync service has delivered (folders with revision.json). */
export async function listServerVaults(): Promise<ServerVault[]> {
  let dirs: string[] = []
  try {
    dirs = (await FilePicker().browse('data', ROOT)).dirs ?? []
  } catch {
    return []
  }
  const out: ServerVault[] = []
  for (const dir of dirs) {
    const rev = await fetchJson(`${dir}/revision.json`)
    if (!rev?.revision || !rev.vault?.slug) continue
    out.push({ slug: rev.vault.slug, name: rev.vault.name ?? rev.vault.slug, revision: rev.revision, updatedAt: rev.updatedAt, applied: applied()[rev.vault.slug] ?? 0 })
  }
  return out
}

/** Number of vaults with changes that were not applied yet (for the button marker). */
export async function pendingCount(): Promise<number> {
  return vaultsForWorld(await listServerVaults(), boundVault()).vaults.filter((v) => v.revision > v.applied).length
}

export async function applyServerVault(slug: string, opts: { forceDocuments?: boolean; onProgress?: (pct: number, msg: string) => void } = {}): Promise<ImportReport> {
  const rev = await fetchJson(`${ROOT}/${slug}/revision.json`)
  const raw = await fetchJson(`${ROOT}/${slug}/bundle.json`)
  if (!raw) throw new Error(`Keine bundle.json für „${slug}“ auf dem Server.`)
  const bundle = validateBundle(raw)
  const report = await importBundle(null, bundle, { ...opts, revision: rev?.revision })
  if (rev?.revision) await game.settings.set(MODULE_ID, SETTINGS.syncRevisions, { ...applied(), [slug]: rev.revision })
  if (!boundVault() && !report.errors.length) await game.settings.set(MODULE_ID, SETTINGS.boundVault, slug)
  return report
}

const ago = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'gerade eben'
  if (min < 60) return `vor ${min} Min.`
  if (min < 48 * 60) return `vor ${Math.round(min / 60)} Std.`
  return new Date(iso).toLocaleString('de-DE')
}

/** Dialog: which vault, what changed since the last apply; nothing happens without the button. */
export async function openSyncDialog(run: (slug: string, forceDocuments: boolean) => Promise<unknown>): Promise<void> {
  const all = await listServerVaults()
  if (!all.length) {
    ui.notifications.warn('Auf dem Server liegt noch kein Vault. Obsidian synchronisiert nach dem Speichern automatisch, sobald im Plugin Server-Adresse und Token eingetragen sind.')
    return
  }
  const bound = boundVault()
  const { vaults, missing } = vaultsForWorld(all, bound)
  if (missing) {
    ui.notifications.warn(`Diese Welt ist mit der Vault „${bound}“ verbunden, die liegt aber nicht auf dem Server. Verbindung lösen: Einstellungen → Vault to Foundry.`)
    return
  }
  const esc = (s: unknown) => foundry.utils.escapeHTML(String(s))
  const rows = vaults
    .map((v, i) => {
      const status = v.revision > v.applied ? `<strong>neue Änderungen</strong> (Revision ${v.revision}, zuletzt übernommen ${v.applied || '–'})` : `aktuell (Revision ${v.revision})`
      return `<label class="vtf-vault-row"><input type="radio" name="vault" value="${esc(v.slug)}" ${i === 0 ? 'checked' : ''}>
        <span><b>${esc(v.name)}</b> – ${status}, synchronisiert ${esc(ago(v.updatedAt))}</span></label>`
    })
    .join('')
  const result = await foundry.applications.api.DialogV2.wait({
    window: { title: 'Vault synchronisieren', icon: 'fa-solid fa-rotate' },
    position: { width: 520 },
    content: `<p>Übernimmt den Stand, den Obsidian auf den Server geschickt hat. Bilder liegen schon auf dem Server.</p>
      <p class="hint">${bound ? 'Diese Welt ist mit dieser Vault verbunden. Lösen: Einstellungen → Vault to Foundry.' : 'Die erste Übernahme verbindet diese Welt mit der gewählten Vault.'}</p>
      <div class="vtf-vaults">${rows}</div>
      <div class="form-group"><label>Alle Journale neu schreiben</label><div class="form-fields"><input type="checkbox" name="forceDocuments"></div>
      <p class="hint">Sonst werden unveränderte Notizen übersprungen.</p></div>`,
    buttons: [
      {
        action: 'apply',
        label: 'Übernehmen',
        icon: 'fa-solid fa-check',
        default: true,
        callback: (_e: Event, button: HTMLButtonElement) => {
          const el = button.form!.elements as any
          const checked = [...button.form!.querySelectorAll('input[name="vault"]')].find((r: any) => r.checked) as HTMLInputElement | undefined
          return { slug: checked?.value, force: el.forceDocuments.checked }
        },
      },
      { action: 'cancel', label: 'Abbrechen' },
    ],
    rejectClose: false,
  })
  if (!result || typeof result !== 'object' || !result.slug) return
  await run(result.slug, result.force)
}
