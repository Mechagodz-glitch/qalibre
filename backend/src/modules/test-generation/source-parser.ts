import { parseFigmaSource, isFigmaUrl } from './figma-parser.js';
import path from 'node:path';

import type { SourceInput } from './generation.schemas.js';

type PreparedSourceInput = {
  kind: SourceInput['kind'];
  label: string;
  filename?: string;
  mimeType?: string;
  url?: string;
  notes?: string;
  parseStatus: 'provided' | 'parsed' | 'reference-only';
  contentText: string;
  imageDataUrl?: string;
};

const supportedTextMimePrefixes = ['text/'];
const supportedTextMimeTypes = new Set([
  'application/json',
  'application/xml',
  'application/javascript',
  'application/xhtml+xml',
  'application/x-yaml',
  'application/yaml',
]);

const maxExtractedTextLength = 30_000;

function trimText(value: string, maxLength = maxExtractedTextLength) {
  return value.replace(/\r\n/g, '\n').trim().slice(0, maxLength);
}

function decodeDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);

  if (!match) {
    throw new Error('Invalid data URL payload');
  }

  const mimeType = match[1] || 'application/octet-stream';
  const isBase64 = Boolean(match[2]);
  const rawPayload = match[3] ?? '';

  return {
    mimeType,
    buffer: isBase64
      ? Buffer.from(rawPayload, 'base64')
      : Buffer.from(decodeURIComponent(rawPayload), 'utf8'),
  };
}

function looksLikeText(mimeType?: string, filename?: string) {
  if (!mimeType && !filename) {
    return false;
  }

  if (mimeType) {
    if (supportedTextMimePrefixes.some((prefix) => mimeType.startsWith(prefix))) {
      return true;
    }

    if (supportedTextMimeTypes.has(mimeType)) {
      return true;
    }
  }

  const extension = filename ? path.extname(filename).toLowerCase() : '';
  return ['.txt', '.md', '.markdown', '.json', '.csv', '.yaml', '.yml', '.xml', '.html', '.htm', '.xhtml'].includes(extension);
}

function decodeHtmlEntities(value: string) {
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    const normalized = String(entity).toLowerCase();

    switch (normalized) {
      case 'nbsp':
        return ' ';
      case 'amp':
        return '&';
      case 'lt':
        return '<';
      case 'gt':
        return '>';
      case 'quot':
        return '"';
      case 'apos':
      case '#39':
        return "'";
      default:
        break;
    }

    if (normalized.startsWith('#x')) {
      const codePoint = Number.parseInt(normalized.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    if (normalized.startsWith('#')) {
      const codePoint = Number.parseInt(normalized.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }

    return match;
  });
}

function extractHtmlText(value: string) {
  const withoutComments = value.replace(/<!--[\s\S]*?-->/g, ' ');
  const withoutHiddenBlocks = withoutComments.replace(
    /<(script|style|noscript|template)[^>]*>[\s\S]*?<\/\1>/gi,
    ' ',
  );
  const withSemanticBreaks = withoutHiddenBlocks
    .replace(/<(br|hr)\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|section|article|header|footer|aside|main|nav|ul|ol|li|table|thead|tbody|tfoot|tr|td|th|h[1-6])>/gi, '\n')
    .replace(/<(li|td|th)\b[^>]*>/gi, ' ');
  const withoutTags = withSemanticBreaks.replace(/<[^>]+>/g, ' ');
  const decoded = decodeHtmlEntities(withoutTags);

  return trimText(
    decoded
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' '),
  );
}

async function parsePdf(buffer: Buffer) {
  const pdfModule = await import('pdf-parse');
  const pdfParse = (pdfModule.default ?? pdfModule) as (input: Buffer) => Promise<{ text?: string }>;
  const parsed = await pdfParse(buffer);
  return trimText(parsed.text ?? '');
}

async function parseDocx(buffer: Buffer) {
  const mammothModule = await import('mammoth');
  const mammoth = mammothModule.default ?? mammothModule;
  const parsed = await mammoth.extractRawText({ buffer });
  return trimText(parsed.value ?? '');
}

async function parseSpreadsheet(buffer: Buffer) {
  const xlsxModule = await import('xlsx');
  const XLSX = xlsxModule.default ?? xlsxModule;
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheetSummaries = workbook.SheetNames.map((sheetName: string) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      return `Sheet: ${sheetName}\nNo readable worksheet data was available.`;
    }

    const rows = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      blankrows: false,
      defval: '',
    }) as Array<Array<string | number | boolean>>;
    const previewRows = rows
      .slice(0, 60)
      .map((row) => row.map((value) => String(value)).join(' | '))
      .join('\n');

    return `Sheet: ${sheetName}\n${previewRows}`;
  });

  return trimText(sheetSummaries.join('\n\n'));
}

async function extractTextFromDataUrl(input: SourceInput) {
  if (!input.dataUrl) {
    return {
      parseStatus: 'reference-only' as const,
      contentText: '',
      imageDataUrl: undefined,
      mimeType: input.mimeType,
    };
  }

  const decoded = decodeDataUrl(input.dataUrl);
  const mimeType = input.mimeType ?? decoded.mimeType;
  const extension = input.filename ? path.extname(input.filename).toLowerCase() : '';
  const isHtmlDocument =
    mimeType === 'text/html' ||
    mimeType === 'application/xhtml+xml' ||
    ['.html', '.htm', '.xhtml'].includes(extension);

  if (mimeType.startsWith('image/')) {
    return {
      parseStatus: 'provided' as const,
      contentText: trimText(input.notes ?? ''),
      imageDataUrl: input.dataUrl,
      mimeType,
    };
  }

  if (looksLikeText(mimeType, input.filename)) {
    const rawText = decoded.buffer.toString('utf8');
    return {
      parseStatus: 'parsed' as const,
      contentText: isHtmlDocument ? extractHtmlText(rawText) || trimText(rawText) : trimText(rawText),
      imageDataUrl: undefined,
      mimeType,
    };
  }

  if (mimeType === 'application/pdf' || extension === '.pdf') {
    return {
      parseStatus: 'parsed' as const,
      contentText: await parsePdf(decoded.buffer),
      imageDataUrl: undefined,
      mimeType,
    };
  }

  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    extension === '.docx'
  ) {
    return {
      parseStatus: 'parsed' as const,
      contentText: await parseDocx(decoded.buffer),
      imageDataUrl: undefined,
      mimeType,
    };
  }

  if (
    mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mimeType === 'application/vnd.ms-excel' ||
    extension === '.xlsx' ||
    extension === '.xls'
  ) {
    return {
      parseStatus: 'parsed' as const,
      contentText: await parseSpreadsheet(decoded.buffer),
      imageDataUrl: undefined,
      mimeType,
    };
  }

  return {
    parseStatus: 'reference-only' as const,
    contentText: trimText(input.notes ?? ''),
    imageDataUrl: undefined,
    mimeType,
  };
}

export async function prepareSourceInputs(inputs: SourceInput[]) {
  const prepared: PreparedSourceInput[] = [];

  for (const input of inputs) {
    const directText = trimText(input.contentText ?? '');
    const directNotes = trimText(input.notes ?? '', 6_000);

    if (input.dataUrl) {
      const parsed = await extractTextFromDataUrl(input);
      const parsedText = parsed.contentText || directText;

      prepared.push({
        kind: input.kind,
        label: input.label,
        filename: input.filename,
        mimeType: parsed.mimeType,
        url: input.url,
        notes: directNotes || undefined,
        parseStatus: parsed.parseStatus,
        contentText: parsedText,
        imageDataUrl: parsed.imageDataUrl,
      });
      continue;
    }

    if (directText) {
      prepared.push({
        kind: input.kind,
        label: input.label,
        filename: input.filename,
        mimeType: input.mimeType,
        url: input.url,
        notes: directNotes || undefined,
        parseStatus: 'provided',
        contentText: directText,
      });
      continue;
    }

    if (isFigmaUrl(input.url)) {
      const parsed = await parseFigmaSource(input.url!);
      const combinedText = trimText([parsed.contentText, directNotes].filter(Boolean).join('\n\n'));

      prepared.push({
        kind: input.kind,
        label: input.label,
        filename: input.filename,
        mimeType: parsed.mimeType ?? input.mimeType,
        url: input.url,
        notes: directNotes || undefined,
        parseStatus: parsed.parseStatus,
        contentText: combinedText,
        imageDataUrl: parsed.imageDataUrl,
      });
      continue;
    }

    prepared.push({
      kind: input.kind,
      label: input.label,
      filename: input.filename,
      mimeType: input.mimeType,
      url: input.url,
      notes: directNotes || undefined,
      parseStatus: 'reference-only',
      contentText: '',
    });
  }

  const summary = {
    totalSources: prepared.length,
    parsedSources: prepared.filter((source) => source.parseStatus === 'parsed').length,
    imageSources: prepared.filter((source) => Boolean(source.imageDataUrl)).length,
    referenceOnlySources: prepared.filter((source) => source.parseStatus === 'reference-only').length,
  };

  return {
    prepared,
    summary,
  };
}

export type { PreparedSourceInput };
