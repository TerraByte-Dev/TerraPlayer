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

/** The counts a drop reports back; mirrors AddPathsResult without the paths. */
export interface DropCounts {
  folders: number
  indexed: number
  unchanged: number
  skipped: number
  duplicates: number
  unsupported: number
  errors: readonly string[]
}

/**
 * What to tell the user after a drop, or null when the outcome speaks for itself
 * (the song is on screen and selected). Anything the drop turned away has to be
 * said out loud — a file that silently fails to appear reads as a broken app.
 * `revealed` means a song was scrolled to, which already answers "did it work?".
 */
export function describeDrop(r: DropCounts, revealed: boolean): string | null {
  if (r.unsupported > 0) {
    const n = r.unsupported
    return `Skipped ${n} file${n > 1 ? 's' : ''} — TerraPlayer plays .mp3 and .m4a.`
  }
  if (r.errors.length > 0) return r.errors[0]
  // The reveal landed on the copy already in the library, not on what was dropped,
  // so saying nothing would imply the dropped file was added. It wasn't.
  if (r.duplicates > 0 && r.indexed === 0 && r.unchanged === 0 && r.skipped === 0) {
    const n = r.duplicates
    return `Already in your library — ${n > 1 ? `${n} songs are` : 'that song is'} here under another name.`
  }
  // Nothing landed, nothing was rejected, and nothing was revealed: the file is
  // neither in the library nor accounted for (e.g. it collided with an existing
  // song's content fingerprint), so don't leave the drop unanswered.
  if (!revealed && r.folders === 0 && r.indexed === 0 && r.unchanged === 0 && r.skipped === 0) {
    return 'Nothing was added — that song is already in your library.'
  }
  return null
}
