import { describe, expect, it } from 'vitest'
import { vaultsForWorld, type ServerVault } from '../src/server-sync.ts'

const vault = (slug: string): ServerVault => ({ slug, name: slug, revision: 3, updatedAt: '', applied: 0 })

describe('Welt und Vault', () => {
  const all = [vault('kampagne'), vault('andere-kampagne')]
  it('ohne Verbindung zeigt die Welt alle Vaults', () => {
    expect(vaultsForWorld(all, '')).toEqual({ vaults: all, missing: false })
  })
  it('verbunden nur die eigene', () => {
    expect(vaultsForWorld(all, 'kampagne')).toEqual({ vaults: [all[0]], missing: false })
  })
  it('meldet, wenn die eigene Vault nicht mehr auf dem Server liegt', () => {
    expect(vaultsForWorld(all, 'weg')).toEqual({ vaults: [], missing: true })
  })
})
