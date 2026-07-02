/** Title-case and normalize whitespace: "  raju  sharma " → "Raju Sharma" */
export function normalizeName(name: string): string {
  return name
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/** Lowercase key for deduplication: "Raju Sharma" → "raju sharma" */
export function nameKey(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}
