import { buildBundle, createSimpleResolver, type BuildOptions, type NoteInput } from '../src/index.ts'

export function build(
  notes: Record<string, string>,
  attachments: string[] = [],
  extra: Partial<BuildOptions> = {}
) {
  const noteInputs: NoteInput[] = Object.entries(notes).map(([path, content]) => ({ path, content }))
  const resolver = createSimpleResolver([...Object.keys(notes), ...attachments])
  return buildBundle({
    vaultName: 'Test Vault',
    notes: noteInputs,
    attachments,
    resolver,
    now: new Date('2026-01-01T00:00:00Z'),
    ...extra,
  })
}

export function html(notes: Record<string, string>, path: string, attachments: string[] = []) {
  const { bundle } = build(notes, attachments)
  const doc = bundle.documents.find((d) => d.sourcePath === path)!
  return { html: doc.pages[0].html!, bundle, doc }
}
