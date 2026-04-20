import { randomUUID } from 'node:crypto';
import path from 'node:path';

import xlsx from 'xlsx';

import { badRequest } from '../../lib/errors.js';

type ImportedExecutionCase = {
  sourceCaseId: string;
  title: string;
  objective: string;
  feature: string;
  scenario: string;
  testType: string;
  priority: string;
  severity: string;
  automationCandidate: boolean;
  preconditions: string[];
  testData: string[];
  tags: string[];
  sourceReferences: string[];
  notes: string | null;
  caseSnapshot: Record<string, unknown>;
};

type ParsedSheetRow = {
  rowNumber: number;
  values: Record<string, string>;
};

type RowCarryState = {
  feature: string;
  scenario: string;
  testType: string;
  priority: string;
  severity: string;
  preconditions: string[];
  testData: string[];
  tags: string[];
  sourceReferences: string[];
  notes: string | null;
};

export type ImportedExecutionSuite = {
  tempId: string;
  sourceType: 'uploadedDocument';
  sourceFileName: string;
  title: string;
  summary: string | null;
  caseCount: number;
  cases: ImportedExecutionCase[];
};

function normalizeString(value: unknown) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function normalizeHeader(value: unknown) {
  return normalizeString(value).toLowerCase().replace(/[^a-z0-9]+/g, '');
}

const rowValueAliases = {
  caseId: ['case id', 'test case id', 'testcase id', 'id'],
  title: ['title', 'test case', 'testcase', 'test case title'],
  description: ['description', 'details', 'test case description', 'testcase description'],
  objective: ['objective'],
  feature: ['feature', 'component', 'module', 'area', 'feature/section', 'feature section', 'section'],
  scenario: ['scenario', 'use case', 'flow', 'test scenario', 'testscenario'],
  testType: ['test type', 'type', 'category'],
  priority: ['priority'],
  severity: ['severity'],
  preconditions: ['preconditions', 'precondition'],
  testData: ['test data', 'data'],
  tags: ['tags', 'labels'],
  sourceReferences: ['source references', 'references', 'links', 'source link'],
  notes: ['notes', 'comment', 'comments', 'remarks'],
  steps: ['steps', 'step', 'action'],
  expectedResult: ['expected result', 'expected', 'result'],
} as const;

const headerDetectionAliases = [
  ...rowValueAliases.caseId,
  ...rowValueAliases.feature,
  ...rowValueAliases.scenario,
  ...rowValueAliases.description,
];

function hasDescriptionHeader(headers: Set<string>) {
  return rowValueAliases.description.some((alias) => headers.has(normalizeHeader(alias)));
}

function splitList(value: unknown) {
  return String(value ?? '')
    .split(/\r?\n|;|\|/g)
    .map((entry) => normalizeString(entry))
    .filter(Boolean);
}

function extractNormalizedRowValue(
  row: Record<string, string>,
  aliases: readonly string[],
) {
  for (const alias of aliases) {
    const value = row[normalizeHeader(alias)];
    const normalizedValue = normalizeString(value);
    if (normalizedValue) {
      return normalizedValue;
    }
  }

  return '';
}

function buildFallbackScenario(title: string, fallbackIndex: number) {
  const normalizedTitle = normalizeString(title);
  return normalizedTitle || `Scenario ${fallbackIndex + 1}`;
}

function decodeDataUrl(dataUrl: string) {
  const match = String(dataUrl ?? '').match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) {
    throw badRequest('Uploaded testcase document is not a valid data URL.');
  }

  const [, mimeType = 'application/octet-stream', isBase64, rawPayload = ''] = match;
  const buffer = isBase64
    ? Buffer.from(rawPayload, 'base64')
    : Buffer.from(decodeURIComponent(rawPayload), 'utf8');

  return {
    mimeType,
    buffer,
  };
}

function fileStem(fileName: string) {
  const normalized = normalizeString(fileName);
  if (!normalized) {
    return 'Imported testcases';
  }

  return path.parse(normalized).name || normalized;
}

function buildFallbackStep(title: string) {
  const normalizedTitle = normalizeString(title) || 'the uploaded manual testcase';
  return [
    {
      step: 1,
      action: `Execute ${normalizedTitle.charAt(0).toLowerCase()}${normalizedTitle.slice(1)} as documented in the uploaded source.`,
      expectedResult: 'The documented result is observed without deviations.',
    },
  ];
}

function parseImportedCase(
  row: ParsedSheetRow,
  fallbackIndex: number,
  sheetName: string,
  carry: RowCarryState,
) {
  const sourceCaseId =
    extractNormalizedRowValue(row.values, rowValueAliases.caseId) ||
    `UPLOAD-${String(fallbackIndex + 1).padStart(3, '0')}`;
  const description = extractNormalizedRowValue(row.values, rowValueAliases.description);
  const explicitTitle = extractNormalizedRowValue(row.values, rowValueAliases.title);
  const scenarioValue = extractNormalizedRowValue(row.values, rowValueAliases.scenario);
  const featureValue = extractNormalizedRowValue(row.values, rowValueAliases.feature);
  const title =
    description ||
    explicitTitle ||
    scenarioValue ||
    carry.scenario ||
    `Uploaded testcase ${fallbackIndex + 1}`;
  const objective =
    description ||
    extractNormalizedRowValue(row.values, rowValueAliases.objective) ||
    explicitTitle ||
    scenarioValue ||
    title;
  const feature =
    featureValue ||
    carry.feature ||
    'Manual execution coverage';
  const scenario =
    scenarioValue ||
    carry.scenario ||
    buildFallbackScenario(title, fallbackIndex);
  const testType =
    extractNormalizedRowValue(row.values, rowValueAliases.testType) ||
    carry.testType ||
    'Functional';
  const priority =
    extractNormalizedRowValue(row.values, rowValueAliases.priority) ||
    carry.priority ||
    'P2';
  const severity =
    extractNormalizedRowValue(row.values, rowValueAliases.severity) ||
    carry.severity ||
    'Medium';
  const preconditions = splitList(
    extractNormalizedRowValue(row.values, rowValueAliases.preconditions),
  );
  const testData = splitList(extractNormalizedRowValue(row.values, rowValueAliases.testData));
  const tags = splitList(extractNormalizedRowValue(row.values, rowValueAliases.tags));
  const sourceReferences = splitList(
    extractNormalizedRowValue(row.values, rowValueAliases.sourceReferences),
  );
  const notes =
    extractNormalizedRowValue(row.values, rowValueAliases.notes) ||
    carry.notes ||
    null;
  const action = extractNormalizedRowValue(row.values, rowValueAliases.steps);
  const expectedResult = extractNormalizedRowValue(row.values, rowValueAliases.expectedResult);
  const steps = action || expectedResult
    ? [
        {
          step: 1,
          action: action || `Execute ${title.charAt(0).toLowerCase()}${title.slice(1)}.`,
          expectedResult: expectedResult || 'The documented expected result is observed.',
        },
      ]
    : buildFallbackStep(title);

  return {
    sourceCaseId,
    title,
    objective,
    feature,
    scenario,
    testType,
    priority,
    severity,
    automationCandidate: false,
    preconditions: preconditions.length ? preconditions : carry.preconditions,
    testData: testData.length ? testData : carry.testData,
    tags: tags.length ? tags : carry.tags,
    sourceReferences: sourceReferences.length ? sourceReferences : carry.sourceReferences,
    notes,
    caseSnapshot: {
      ...row.values,
      importedSheet: sheetName,
      importedRowNumber: row.rowNumber,
      importedPreconditions: preconditions.length ? preconditions : carry.preconditions,
      importedTestData: testData.length ? testData : carry.testData,
      importedSteps: steps,
      importedTags: tags.length ? tags : carry.tags,
    },
  };
}

function shouldKeepRow(caseEntry: ImportedExecutionCase) {
  return Boolean(
    normalizeString(caseEntry.title) ||
      normalizeString(caseEntry.objective) ||
      normalizeString(caseEntry.feature) ||
      normalizeString(caseEntry.scenario),
  );
}

function findHeaderRowIndex(rows: string[][]) {
  let bestIndex = -1;
  let bestScore = 0;

  rows.forEach((row, index) => {
    const normalizedRow = row.map((value) => normalizeHeader(value)).filter(Boolean);
    if (!normalizedRow.length) {
      return;
    }

    const headers = new Set(normalizedRow);
    const includesDescriptionHeader = hasDescriptionHeader(headers);
    const score = headerDetectionAliases.reduce((total, alias) => {
      return total + (headers.has(normalizeHeader(alias)) ? 1 : 0);
    }, 0);

    if (includesDescriptionHeader && score >= bestScore) {
      bestScore = score;
      bestIndex = index;
      return;
    }

    if (score > bestScore) {
      bestScore = score;
      bestIndex = index;
    }
  });

  return bestScore >= 1 ? bestIndex : -1;
}

function isOrdinalValue(value: string) {
  return /^\d+(?:\.\d+)?$/.test(normalizeString(value));
}

function parseSheetRows(sheet: xlsx.WorkSheet) {
  const matrix = xlsx.utils.sheet_to_json<(string | number | boolean | null)[]>(sheet, {
    header: 1,
    defval: '',
    raw: false,
    blankrows: false,
  });

  const rows = matrix.map((row) => row.map((value) => normalizeString(value)));
  const headerIndex = findHeaderRowIndex(rows);
  if (headerIndex < 0) {
    return [];
  }

  const headerRow = rows[headerIndex] ?? [];
  const headerKeys = headerRow.map((value, columnIndex) => {
    const normalized = normalizeHeader(value);
    return normalized || `column${columnIndex + 1}`;
  });

  return rows.slice(headerIndex + 1).map((row, index) => {
    const values: Record<string, string> = {};
    headerKeys.forEach((headerKey, columnIndex) => {
      values[headerKey] = normalizeString(row[columnIndex]);
    });
    return {
      rowNumber: headerIndex + index + 2,
      values,
    };
  });
}

function isContextOnlyRow(row: ParsedSheetRow) {
  const nonEmptyValues = Object.values(row.values).filter(Boolean);
  if (!nonEmptyValues.length) {
    return true;
  }

  const hasCaseAnchor = Boolean(
    extractNormalizedRowValue(row.values, rowValueAliases.caseId) ||
      extractNormalizedRowValue(row.values, rowValueAliases.description) ||
      extractNormalizedRowValue(row.values, rowValueAliases.title),
  );

  return !hasCaseAnchor && nonEmptyValues.length <= 2;
}

function hasStructuredCaseValues(row: ParsedSheetRow) {
  return Boolean(
    extractNormalizedRowValue(row.values, rowValueAliases.caseId) ||
      extractNormalizedRowValue(row.values, rowValueAliases.title) ||
      extractNormalizedRowValue(row.values, rowValueAliases.feature) ||
      extractNormalizedRowValue(row.values, rowValueAliases.scenario) ||
      extractNormalizedRowValue(row.values, rowValueAliases.priority) ||
      extractNormalizedRowValue(row.values, rowValueAliases.severity) ||
      extractNormalizedRowValue(row.values, rowValueAliases.preconditions) ||
      extractNormalizedRowValue(row.values, rowValueAliases.testData) ||
      extractNormalizedRowValue(row.values, rowValueAliases.tags) ||
      extractNormalizedRowValue(row.values, rowValueAliases.sourceReferences) ||
      extractNormalizedRowValue(row.values, rowValueAliases.notes) ||
      extractNormalizedRowValue(row.values, rowValueAliases.steps) ||
      extractNormalizedRowValue(row.values, rowValueAliases.expectedResult),
  );
}

function extractRowTestType(row: ParsedSheetRow) {
  const explicitTestType = extractNormalizedRowValue(row.values, rowValueAliases.testType);
  if (explicitTestType) {
    return explicitTestType;
  }

  if (!isContextOnlyRow(row)) {
    return '';
  }

  const firstMeaningfulValue =
    Object.values(row.values)
      .map((value) => normalizeString(value))
      .find(Boolean) ?? '';

  if (!firstMeaningfulValue || isOrdinalValue(firstMeaningfulValue)) {
    return '';
  }

  return firstMeaningfulValue;
}

function parseSheetSuites(fileName: string, workbook: xlsx.WorkBook) {
  const documentLabel = fileStem(fileName);

  const suites: Array<ImportedExecutionSuite | null> = workbook.SheetNames.map((sheetName, sheetIndex) => {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      return null;
    }

    const rows = parseSheetRows(sheet);
    const carry: RowCarryState = {
      feature: '',
      scenario: '',
      testType: '',
      priority: '',
      severity: '',
      preconditions: [],
      testData: [],
      tags: [],
      sourceReferences: [],
      notes: null,
    };
    const validationErrors: string[] = [];

    const cases = rows
      .flatMap((row, rowIndex) => {
        const feature = extractNormalizedRowValue(row.values, rowValueAliases.feature);
        const scenario = extractNormalizedRowValue(row.values, rowValueAliases.scenario);
        const priority = extractNormalizedRowValue(row.values, rowValueAliases.priority);
        const severity = extractNormalizedRowValue(row.values, rowValueAliases.severity);
        const preconditions = splitList(
          extractNormalizedRowValue(row.values, rowValueAliases.preconditions),
        );
        const testData = splitList(
          extractNormalizedRowValue(row.values, rowValueAliases.testData),
        );
        const tags = splitList(extractNormalizedRowValue(row.values, rowValueAliases.tags));
        const sourceReferences = splitList(
          extractNormalizedRowValue(row.values, rowValueAliases.sourceReferences),
        );
        const notes = extractNormalizedRowValue(row.values, rowValueAliases.notes) || null;

        if (feature) {
          carry.feature = feature;
        }

        if (scenario) {
          carry.scenario = scenario;
        }

        if (priority) {
          carry.priority = priority;
        }

        if (severity) {
          carry.severity = severity;
        }

        if (preconditions.length) {
          carry.preconditions = preconditions;
        }

        if (testData.length) {
          carry.testData = testData;
        }

        if (tags.length) {
          carry.tags = tags;
        }

        if (sourceReferences.length) {
          carry.sourceReferences = sourceReferences;
        }

        if (notes) {
          carry.notes = notes;
        }

        const rowTestType = extractRowTestType(row);
        const caseId = extractNormalizedRowValue(row.values, rowValueAliases.caseId);
        const description = extractNormalizedRowValue(row.values, rowValueAliases.description);
        const explicitTitle = extractNormalizedRowValue(row.values, rowValueAliases.title);

        if (!description && hasStructuredCaseValues(row)) {
          validationErrors.push(
            `Row ${row.rowNumber} in "${normalizeString(sheetName) || 'Sheet'}" is missing "Test case Description". This field is required for manual testcase upload.`,
          );
          return [];
        }

        if (isContextOnlyRow(row)) {
          if (rowTestType) {
            carry.testType = rowTestType;
          }
          return [];
        }

        const importedCase = parseImportedCase(row, rowIndex, sheetName, carry);
        if (!shouldKeepRow(importedCase)) {
          return [];
        }

        if (rowTestType && (!caseId || (!description && !explicitTitle))) {
          carry.testType = rowTestType;
        } else if (rowTestType && rowTestType.toLowerCase() !== normalizeString(caseId).toLowerCase()) {
          carry.testType = rowTestType;
        }

        carry.feature = importedCase.feature;
        carry.scenario = importedCase.scenario;
        carry.priority = importedCase.priority;
        carry.severity = importedCase.severity;

        return [importedCase];
      });

    const firstValidationError = validationErrors[0];
    if (firstValidationError) {
      throw badRequest(firstValidationError);
    }

    if (!cases.length) {
      return null;
    }

    const title =
      workbook.SheetNames.length > 1
        ? `${documentLabel} - ${normalizeString(sheetName) || `Sheet ${sheetIndex + 1}`}`
        : documentLabel;

    return {
      tempId: randomUUID(),
      sourceType: 'uploadedDocument' as const,
      sourceFileName: normalizeString(fileName) || `${documentLabel}.xlsx`,
      title,
      summary: `Imported from ${normalizeString(fileName) || 'uploaded execution document'}.`,
      caseCount: cases.length,
      cases,
    };
  });

  return suites.filter((suite): suite is ImportedExecutionSuite => suite !== null);
}

export async function parseManualExecutionImport(input: {
  fileName: string;
  mimeType?: string;
  dataUrl: string;
}) {
  const fileName = normalizeString(input.fileName);
  if (!fileName) {
    throw badRequest('Uploaded testcase document file name is required.');
  }

  const { buffer } = decodeDataUrl(input.dataUrl);
  const workbook = xlsx.read(buffer, { type: 'buffer' });
  const suites = parseSheetSuites(fileName, workbook);

  if (!suites.length) {
    throw badRequest('No testcase rows could be extracted from the uploaded testcase document.');
  }

  return {
    suites,
  };
}
