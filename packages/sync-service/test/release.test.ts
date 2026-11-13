import { describe, expect, it } from 'vitest'
// @ts-expect-error plain .mjs build script without types
import { nextVersion, releaseChangelog } from '../../../tools/release.mjs'

// tools/release.mjs: the version bump behind the GitHub button "Version veröffentlichen"
describe('release', () => {
  it('nextVersion: patch, minor, major und feste Version', () => {
    expect(nextVersion('1.0.5', 'patch')).toBe('1.0.6')
    expect(nextVersion('1.0.5', 'minor')).toBe('1.1.0')
    expect(nextVersion('1.9.5', 'major')).toBe('2.0.0')
    expect(nextVersion('1.0.5', '1.2.0')).toBe('1.2.0')
    expect(() => nextVersion('1.0.5', '1.0.5')).toThrow(/nicht neuer/)
    expect(() => nextVersion('1.0.5', '1.0.4')).toThrow(/nicht neuer/)
    expect(() => nextVersion('1.0.5', '0.9.9')).toThrow(/nicht neuer/)
    expect(() => nextVersion('1.0.5', undefined)).toThrow(/Angabe fehlt/)
  })

  it('releaseChangelog: Unveröffentlicht wird zur Version, darüber ein leerer Abschnitt', () => {
    const before = '# Änderungen\n\n## Unveröffentlicht\n\n**Sync**\n\n- Neu A\n- Neu B\n\n## 1.0.0 (2026-11-03)\n\n- Alt\n'
    const r = releaseChangelog(before, '1.0.6', '2026-11-13')
    expect(r.notes).toBe('**Sync**\n\n- Neu A\n- Neu B')
    expect(r.text).toBe('# Änderungen\n\n## Unveröffentlicht\n\n## 1.0.6 (2026-11-13)\n\n**Sync**\n\n- Neu A\n- Neu B\n\n## 1.0.0 (2026-11-03)\n\n- Alt\n')
    // again right away: an empty section still gives a release entry
    const again = releaseChangelog(r.text, '1.0.7', '2026-11-14')
    expect(again.notes).toBe('- Keine Einträge.')
    expect(again.text).toContain('## Unveröffentlicht\n\n## 1.0.7 (2026-11-14)\n\n- Keine Einträge.\n\n## 1.0.6 (2026-11-13)\n')
    expect(() => releaseChangelog('# Änderungen\n', '1.0.0', 'x')).toThrow(/Unveröffentlicht/)
  })
})
