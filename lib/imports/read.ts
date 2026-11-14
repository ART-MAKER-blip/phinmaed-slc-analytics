import 'server-only';
import { readXlsxFile } from './xlsx';
import { tableFromCsv } from './grades';

export class FileReadError extends Error {}

const SHEET_NAME = 'Grade Deliberation Report';

/**
 * Reads an uploaded SIS export into a table of strings (first row = headers).
 * Accepts .xlsx (the SIS download) and .csv (UTF-8).
 */
export async function readUploadTable(bytes: Buffer, filename: string): Promise<string[][]> {
  if (/\.xlsx$/i.test(filename)) {
    try {
      const sheets = await readXlsxFile(bytes);
      const sheet = sheets.find((s) => s.sheet.trim().toLowerCase() === SHEET_NAME.toLowerCase()) ?? sheets[0];
      if (!sheet) throw new FileReadError('The workbook has no sheets.');
      return sheet.data.map((row) => row.map(cellText));
    } catch (error) {
      if (error instanceof FileReadError) throw error;
      throw new FileReadError('The Excel file could not be read. Save it again as .xlsx, or as "CSV UTF-8".');
    }
  }
  if (/\.csv$/i.test(filename)) {
    let text: string;
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch {
      throw new FileReadError('The CSV file is not UTF-8 text. In Excel, use Save As > "CSV UTF-8".');
    }
    try {
      return tableFromCsv(text);
    } catch (error) {
      throw new FileReadError(error instanceof Error ? error.message : 'The CSV file could not be read.');
    }
  }
  throw new FileReadError('Upload the SIS export as .xlsx or .csv.');
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'number') return String(Math.round(value * 1e6) / 1e6);
  return String(value);
}

