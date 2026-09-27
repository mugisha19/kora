/** A textarea with one item per line → the list the API expects (trimmed, blank lines dropped). */
export function linesToList(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}
