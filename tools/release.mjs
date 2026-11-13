// Sets a new version everywhere and closes the "Unveröffentlicht" section of the changelog.
// Used by the GitHub workflow "Version veröffentlichen" (.github/workflows/release.yml).
//   node tools/release.mjs patch|minor|major|<x.y.z> [--notes <file>]
// Changes: server.mjs, module.json, manifest.json (Vault to Foundry), package.json files and
// package-lock.json of everything that carries the main version, CHANGELOG.md.
// The DSA-NSC-Generator keeps its own version.
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

export function nextVersion(current, bump) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(current)
  if (!m) throw new Error(`Aktuelle Version „${current}“ ist nicht x.y.z`)
  const [major, minor, patch] = m.slice(1).map(Number)
  if (bump === 'major') return `${major + 1}.0.0`
  if (bump === 'minor') return `${major}.${minor + 1}.0`
  if (bump === 'patch') return `${major}.${minor}.${patch + 1}`
  const t = /^(\d+)\.(\d+)\.(\d+)$/.exec(bump ?? '')
  if (!t) throw new Error('Angabe fehlt: patch, minor, major oder eine Version x.y.z')
  const newer = t.slice(1).map(Number).some((n, i, all) => n > [major, minor, patch][i] && all.slice(0, i).every((v, j) => v === [major, minor, patch][j]))
  if (!newer) throw new Error(`${bump} ist nicht neuer als ${current}`)
  return bump
}

/** "## Unveröffentlicht" becomes "## <version> (<date>)", with a new empty section above. notes: its entries. */
export function releaseChangelog(text, version, date) {
  const head = /^## Unveröffentlicht[ \t]*\n/m.exec(text)
  if (!head) throw new Error('CHANGELOG.md hat keinen Abschnitt „## Unveröffentlicht“')
  const start = head.index + head[0].length
  const next = text.slice(start).search(/^## /m)
  const end = next < 0 ? text.length : start + next
  const notes = text.slice(start, end).trim() || '- Keine Einträge.'
  return {
    notes,
    text: `${text.slice(0, head.index)}## Unveröffentlicht\n\n## ${version} (${date})\n\n${notes}\n${next < 0 ? '' : `\n${text.slice(end)}`}`,
  }
}

function main() {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
  const args = process.argv.slice(2)
  const notesFile = args.includes('--notes') ? args.splice(args.indexOf('--notes'), 2)[1] : null
  const read = (f) => readFileSync(join(root, f), 'utf8')
  const write = (f, text) => writeFileSync(join(root, f), text)
  const json = (f, change) => {
    const data = JSON.parse(read(f))
    change(data)
    write(f, JSON.stringify(data, null, 2) + '\n')
  }

  const server = read('packages/sync-service/server.mjs')
  const current = /^const VERSION = '([^']+)'$/m.exec(server)?.[1]
  if (!current) throw new Error('VERSION in packages/sync-service/server.mjs nicht gefunden')
  const version = nextVersion(current, args[0])
  // everything that can fail comes before the first write
  const changelog = releaseChangelog(read('CHANGELOG.md'), version, new Date().toISOString().slice(0, 10))

  write('packages/sync-service/server.mjs', server.replace(/^const VERSION = '[^']+'$/m, `const VERSION = '${version}'`))
  const set = (d) => (d.version = version)
  json('packages/foundry-module/module.json', set)
  json('packages/obsidian-plugin/manifest.json', set)
  const workspaces = ['packages/core', 'packages/foundry-module', 'packages/obsidian-plugin', 'packages/sync-service']
  json('package.json', set)
  for (const w of workspaces) json(`${w}/package.json`, set)
  json('package-lock.json', (lock) => {
    lock.version = version
    for (const key of ['', ...workspaces]) if (lock.packages?.[key]) lock.packages[key].version = version
  })

  write('CHANGELOG.md', changelog.text)
  if (notesFile) writeFileSync(notesFile, changelog.notes + '\n')

  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\nprevious=${current}\n`)
  console.log(`${current} → ${version}`)
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main()
  } catch (e) {
    console.error(`release: ${e.message}`)
    process.exit(1)
  }
}
