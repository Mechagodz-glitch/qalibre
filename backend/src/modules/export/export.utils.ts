import { z } from 'zod';

export const exportFormatSchema = z.enum(['json', 'csv', 'xlsx']);

export type ExportFormat = z.infer<typeof exportFormatSchema>;

type ExportCellValue = string | number | boolean;

type WorkbookSheet = {
  name: string;
  rows: Array<Record<string, unknown>>;
  columnOrder?: string[];
  columnWidths?: Record<string, number>;
  wrapTextColumns?: string[];
};

function sanitizeSheetName(value: string) {
  const sanitized = value.replace(/[\\/?*\[\]:]/g, ' ').trim().slice(0, 31);
  return sanitized || 'Sheet1';
}

function serializeCellValue(value: unknown): ExportCellValue {
  if (value === null || value === undefined) {
    return '';
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (Array.isArray(value)) {
    if (value.every((entry) => entry === null || ['string', 'number', 'boolean'].includes(typeof entry))) {
      return value
        .map((entry) => (entry === null || entry === undefined ? '' : String(entry)))
        .filter(Boolean)
        .join('\n');
    }

    return JSON.stringify(value);
  }

  return JSON.stringify(value);
}

export function prepareRowsForExport(rows: Array<Record<string, unknown>>, columnOrder?: string[]) {
  const columns =
    columnOrder && columnOrder.length > 0
      ? columnOrder
      : Array.from(new Set(rows.flatMap((row) => Object.keys(row))));

  return rows.map((row) =>
    Object.fromEntries(columns.map((column) => [column, serializeCellValue(row[column])])) as Record<
      string,
      ExportCellValue
    >,
  );
}

function resolveColumns(rows: Array<Record<string, unknown>>, columnOrder?: string[]) {
  return columnOrder && columnOrder.length > 0
    ? columnOrder
    : Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
}

function estimateColumnWidth(
  column: string,
  rows: Array<Record<string, ExportCellValue>>,
  explicitWidth?: number,
) {
  if (explicitWidth) {
    return explicitWidth;
  }

  const maxContentLength = Math.max(
    column.length,
    ...rows.map((row) =>
      String(row[column] ?? '')
        .split('\n')
        .reduce((longest, part) => Math.max(longest, part.length), 0),
    ),
  );

  return Math.min(Math.max(maxContentLength + 2, 12), 42);
}

async function loadXlsx() {
  const xlsxModule = await import('xlsx');
  return (xlsxModule.default ?? xlsxModule) as typeof import('xlsx');
}

export async function buildCsvBuffer(rows: Array<Record<string, unknown>>, columnOrder?: string[]) {
  const XLSX = await loadXlsx();
  const preparedRows = prepareRowsForExport(rows, columnOrder);
  const worksheet = XLSX.utils.json_to_sheet(preparedRows);
  const csv = XLSX.utils.sheet_to_csv(worksheet);
  return Buffer.from(csv, 'utf8');
}

export async function buildWorkbookBuffer(sheets: WorkbookSheet[]) {
  const XLSX = await loadXlsx();
  const workbook = XLSX.utils.book_new();

  for (const sheet of sheets) {
    const columns = resolveColumns(sheet.rows, sheet.columnOrder);
    const preparedRows = prepareRowsForExport(sheet.rows, columns);
    const worksheet = XLSX.utils.json_to_sheet(preparedRows);
    const wrapTextColumns = new Set((sheet.wrapTextColumns ?? []).filter(Boolean));

    worksheet['!cols'] = columns.map((column) => ({
      wch: estimateColumnWidth(column, preparedRows, sheet.columnWidths?.[column]),
    }));
    worksheet['!autofilter'] = worksheet['!ref'] ? { ref: worksheet['!ref'] } : undefined;

    if (worksheet['!ref']) {
      const range = XLSX.utils.decode_range(worksheet['!ref']);
      worksheet['!rows'] = Array.from({ length: range.e.r + 1 }, (_, rowIndex) => ({
        hpt: rowIndex === 0 ? 24 : wrapTextColumns.size ? 42 : 22,
      }));

      for (let rowIndex = range.s.r; rowIndex <= range.e.r; rowIndex += 1) {
        for (let columnIndex = range.s.c; columnIndex <= range.e.c; columnIndex += 1) {
          const column = columns[columnIndex] ?? '';
          const address = XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex });
          const cell = worksheet[address];
          if (!cell) {
            continue;
          }

          cell.s = {
            ...(cell.s ?? {}),
            alignment: {
              ...(cell.s?.alignment ?? {}),
              vertical: 'top',
              wrapText: wrapTextColumns.has(column),
            },
          };
        }
      }
    }

    XLSX.utils.book_append_sheet(workbook, worksheet, sanitizeSheetName(sheet.name));
  }

  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}

export function setAttachmentHeaders(reply: {
  header: (name: string, value: string) => unknown;
}, options: {
  format: ExportFormat;
  filenameBase: string;
}) {
  const extension = options.format === 'xlsx' ? 'xlsx' : options.format;
  const contentType =
    options.format === 'csv'
      ? 'text/csv; charset=utf-8'
      : options.format === 'xlsx'
        ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        : 'application/json; charset=utf-8';

  reply.header('Content-Type', contentType);
  reply.header('Content-Disposition', `attachment; filename=\"${options.filenameBase}.${extension}\"`);
}
