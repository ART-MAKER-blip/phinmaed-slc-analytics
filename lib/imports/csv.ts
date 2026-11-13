/**
 * Small RFC 4180 CSV parser: quoted fields, escaped quotes (""), commas and line breaks
 * inside quotes, CRLF or LF line endings, and a leading UTF-8 byte order mark.
 */
export function parseCsv(text: string): string[][] {
  const input = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < input.length) {
    const char = input[i];
    if (inQuotes) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
      } else {
        field += char;
      }
      i += 1;
      continue;
    }

    if (char === '"' && field === '') inQuotes = true;
    else if (char === ',') {
      row.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
      if (char === '\r' && input[i + 1] === '\n') i += 1;
    } else field += char;
    i += 1;
  }

  if (inQuotes) throw new Error('The file ends inside a quoted value. Check for a missing closing quote.');
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  // Drop blank lines, which spreadsheets often leave at the end.
  return rows.filter((r) => r.some((cell) => cell.trim() !== ''));
}

/** Quotes every cell so values with commas, quotes or formulas are kept as plain text. */
export function toCsv(rows: (string | number | null | undefined)[][]): string {
  return rows
    .map((row) =>
      row
        .map((cell) => {
          let value = cell === null || cell === undefined ? '' : String(cell);
          // Stop spreadsheet apps from running values that look like formulas.
          if (/^[=+\-@\t\r]/.test(value)) value = `'${value}`;
          return `"${value.replaceAll('"', '""')}"`;
        })
        .join(','),
    )
    .join('\r\n');
}
