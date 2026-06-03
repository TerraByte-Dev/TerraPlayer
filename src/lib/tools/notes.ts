// Pure text statistics for the Scratchpad notes tool. No DOM, no React — kept self-contained so it can be
// unit-tested in isolation and reused anywhere.

export interface TextStats {
  chars: number
  words: number
  lines: number
}

/**
 * Count characters, words, and lines in a block of text.
 *
 * - chars: total length of the string (every code unit, including whitespace and newlines).
 * - words: runs of non-whitespace separated by any whitespace; leading/trailing whitespace is ignored.
 * - lines: number of line rows. An empty string is 0 lines; any non-empty text has at least 1 line, and
 *   each newline adds another row (so a trailing newline yields a final empty row, matching how a text
 *   editor renders the cursor on a fresh blank line).
 */
export function textStats(text: string): TextStats {
  const chars = text.length

  const trimmed = text.trim()
  const words = trimmed === '' ? 0 : trimmed.split(/\s+/).length

  // No characters at all => no lines. Otherwise it's (newline count + 1) rows.
  const lines = text === '' ? 0 : text.split('\n').length

  return { chars, words, lines }
}
