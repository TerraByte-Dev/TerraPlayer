// Pure, dependency-free helpers for library name editing + playlist membership.
// Unit-tested in src/lib/__tests__/library-core.test.mjs and shared by the
// renderer for instant inline feedback; the SQLite layer guards independently.

/** Collapse internal runs of whitespace and trim the ends. */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ')
}

export type RenameCheck =
  | { ok: true; name: string }
  | { ok: false; reason: 'empty' | 'duplicate'; message: string }

/**
 * Validate renaming a tag/playlist to `raw` given the other items' names.
 * `others` MUST exclude the item being renamed, so a no-op (or case-only) edit
 * is always allowed. Duplicate detection is case-insensitive on the normalized
 * name, so "Rock" collides with "rock".
 */
export function validateRename(raw: string, others: readonly string[]): RenameCheck {
  const name = normalizeName(raw)
  if (!name) return { ok: false, reason: 'empty', message: 'Name can’t be empty' }
  const lower = name.toLowerCase()
  if (others.some((o) => normalizeName(o).toLowerCase() === lower)) {
    return { ok: false, reason: 'duplicate', message: 'A name like that already exists' }
  }
  return { ok: true, name }
}

/**
 * True when the track is already a member of the playlist — used to label the
 * picker "added" and to skip a redundant add (mirrors the DB's INSERT OR IGNORE
 * so the UI never creates a duplicate membership).
 */
export function isInPlaylist(memberTrackIds: readonly number[], trackId: number): boolean {
  return memberTrackIds.includes(trackId)
}
