// Pure, dependency-free helpers for the "import once, app owns" folder→playlist
// model. Unit-tested in electron/ipc/__tests__/library-seed-core.test.mjs and
// shared by the SQLite scan layer (library.ts). No fs/electron/sqlite here.

/**
 * Whether a library folder still needs its one-time playlist seeding.
 *
 * Contract: `seeded_at IS NULL` means "never seeded" → seed it now. Any stamped
 * timestamp (including the epoch-0 edge) means it has been seeded once and a
 * routine rescan must NOT re-create or overwrite the user's playlists.
 */
export function shouldSeedFolder(seededAt: number | null | undefined): boolean {
  return seededAt === null || seededAt === undefined
}
