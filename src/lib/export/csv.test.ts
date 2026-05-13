import { describe, it, expect } from 'vitest';
import { rowsToCsv, type TransactionExportRow } from './csv';

const baseRow: TransactionExportRow = {
  date: '2026-05-10',
  name: 'STARBUCKS',
  merchantName: 'Starbucks',
  amount: '5.50',
  category: 'FOOD_AND_DRINK',
  categoryOverride: null,
  accountName: 'Wells Fargo Checking',
  pending: false,
};

describe('rowsToCsv', () => {
  it('returns header-only for empty rows', () => {
    const csv = rowsToCsv([]);
    expect(csv).toBe('date,name,merchantName,amount,category,categoryOverride,accountName,pending');
  });

  it('renders a single row after the header', () => {
    const csv = rowsToCsv([baseRow]);
    const lines = csv.split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe('2026-05-10,STARBUCKS,Starbucks,5.50,FOOD_AND_DRINK,,Wells Fargo Checking,false');
  });

  it('escapes commas by wrapping in quotes', () => {
    const csv = rowsToCsv([{ ...baseRow, name: 'AMAZON, INC' }]);
    expect(csv).toContain('"AMAZON, INC"');
  });

  it('escapes double quotes by doubling them inside quotes', () => {
    const csv = rowsToCsv([{ ...baseRow, name: 'WHATABURGER "ORIGINAL"' }]);
    expect(csv).toContain('"WHATABURGER ""ORIGINAL"""');
  });

  it('escapes newlines by wrapping in quotes', () => {
    const csv = rowsToCsv([{ ...baseRow, name: 'LINE1\nLINE2' }]);
    expect(csv).toContain('"LINE1\nLINE2"');
  });

  it('renders null fields as empty string', () => {
    const csv = rowsToCsv([{ ...baseRow, merchantName: null, category: null }]);
    const fields = csv.split('\n')[1].split(',');
    expect(fields[2]).toBe(''); // merchantName slot
    expect(fields[4]).toBe(''); // category slot
  });

  it('preserves signed amounts as stored (positive=cash-out invariant)', () => {
    const out = rowsToCsv([{ ...baseRow, amount: '50.00' }]);
    const inflow = rowsToCsv([{ ...baseRow, amount: '-100.00' }]);
    expect(out.split('\n')[1]).toContain(',50.00,');
    expect(inflow.split('\n')[1]).toContain(',-100.00,');
  });

  it('populates categoryOverride column when set', () => {
    const csv = rowsToCsv([{ ...baseRow, categoryOverride: 'Custom Category' }]);
    expect(csv.split('\n')[1].split(',')[5]).toBe('Custom Category');
  });

  it('serializes pending as the literal string true/false', () => {
    const t = rowsToCsv([{ ...baseRow, pending: true }]);
    expect(t.split('\n')[1]).toMatch(/,true$/);
  });
});
