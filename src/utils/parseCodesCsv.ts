const SKIP_WORDS = new Set([
  'CODE',
  'CODES',
  'PRINT',
  'PRINTTEXT',
  'PRINT TEXT',
  'CROWN',
  'TYPE',
  'MERCH',
  'CREDIT',
  'AIRPODS',
  'AMAZON',
  '4 PACK',
  '4PACK',
  'INSTANT',
  'INSTANT WIN',
  'GRAND PRIZE ENTRY',
]);

const looksLikeCode = (value: string) => /^[A-Z0-9-]{4,32}$/.test(value);

/** Parse pasted/uploaded CSV — supports one-code-per-line or Excel export (Crown #, Print Text, Type). */
export const parseCodesFromCsv = (raw: string): string[] => {
  const found: string[] = [];

  for (const line of raw.split(/\r?\n/)) {
    const cols = line
      .split(',')
      .map((c) => c.trim().replace(/^"|"$/g, ''))
      .filter((c, i, arr) => !(c === '' && i === arr.length - 1));

    if (!cols.length) continue;

    const joined = cols.join(',').toUpperCase();
    if (/CROWN\s*#|PRINT\s*TEXT|PRINTTEXT\/CODE|GRAND PRIZE ENTRY,INSTANT/i.test(joined) && cols.every((c) => !looksLikeCode(c.toUpperCase()) || SKIP_WORDS.has(c.toUpperCase()))) {
      continue;
    }

    // Skip instant-win rows (redeemed offline)
    if (cols.length >= 3 && /instant\s*win/i.test(cols[2])) continue;

    let candidate = '';
    if (cols.length >= 2) {
      // Prefer Print Text/Code column (B)
      candidate = cols[1].toUpperCase();
      if (!looksLikeCode(candidate) || SKIP_WORDS.has(candidate)) {
        candidate = cols.find((c) => looksLikeCode(c.toUpperCase()) && !SKIP_WORDS.has(c.toUpperCase()))?.toUpperCase() || '';
      }
    } else {
      candidate = cols[0].toUpperCase();
    }

    if (!candidate || !looksLikeCode(candidate) || SKIP_WORDS.has(candidate)) continue;
    found.push(candidate);
  }

  return [...new Set(found)];
};
