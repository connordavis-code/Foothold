export interface TransactionExportRow {
  date: string;
  name: string;
  merchantName: string | null;
  amount: string;
  category: string | null;
  categoryOverride: string | null;
  accountName: string;
  pending: boolean;
}

const HEADERS: ReadonlyArray<keyof TransactionExportRow> = [
  'date',
  'name',
  'merchantName',
  'amount',
  'category',
  'categoryOverride',
  'accountName',
  'pending',
];

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function rowsToCsv(rows: TransactionExportRow[]): string {
  const lines: string[] = [HEADERS.join(',')];
  for (const row of rows) {
    lines.push(HEADERS.map((h) => escapeCell(row[h])).join(','));
  }
  return lines.join('\n');
}
