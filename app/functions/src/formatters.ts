export function formatMxn(value: number): string {
  if (!Number.isFinite(value) || value < 0 || value > 999_999_999_99)
    throw new Error('Invalid MXN amount')

  const cents = Math.round(value * 100)
  const whole = Math.floor(cents / 100).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')

  return `$${whole}.${String(cents % 100).padStart(2, '0')} MXN`
}

export function safePdfText(value: string): string {
  // The PDF uses WinAnsi fonts and Latin-1 bytes. Preserve Spanish glyphs;
  // unsupported characters must not wrap into unrelated single-byte glyphs.
  return value
    .normalize('NFC')
    .replace(/[^\x20-\x7E\xA0-\xFF]/gu, '?')
}
