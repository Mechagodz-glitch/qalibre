import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';

import { env } from '../../config/env.js';
import { serviceUnavailable } from '../../lib/errors.js';
import {
  buildCoverageSummaryLines,
  buildExpansionDirectives,
  validateCoveragePlan,
  type CoverageBatchDirective,
  type CoveragePlan,
  type CoverageValidationSummary,
} from './coverage-planner.js';
import {
  testCaseDraftAiResponseSchema,
  type ApiGenerationMode,
  type TestCaseDraftAiResponse,
} from './generation.schemas.js';
import { buildTestGenerationPrompt } from './prompt-builders.js';
import type { PreparedSourceInput } from './source-parser.js';

const openai = env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      maxRetries: 0,
    })
  : null;

const retryableStatusCodes = new Set([408, 409, 429, 500, 502, 503, 504, 520, 521, 522, 523, 524]);

const delay = (milliseconds: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const serialize = (value: unknown) => JSON.parse(JSON.stringify(value)) as unknown;

const isRetryableError = (error: unknown) => {
  if (typeof error !== 'object' || !error) {
    return false;
  }

  const status = 'status' in error && typeof error.status === 'number' ? error.status : undefined;
  const code = 'code' in error && typeof error.code === 'string' ? error.code : undefined;
  const name = 'name' in error && typeof error.name === 'string' ? error.name.toLowerCase() : '';
  const message = 'message' in error && typeof error.message === 'string' ? error.message.toLowerCase() : '';
  const looksLikeTransientGatewayFailure =
    /\b52[0-4]\b/.test(message) ||
    (message.includes('cloudflare') && message.includes('error')) ||
    message.includes('web server is returning an unknown error');

  return Boolean(
    (status && retryableStatusCodes.has(status)) ||
      code === 'ETIMEDOUT' ||
      code === 'ECONNRESET' ||
      name.includes('connection') ||
      message.includes('connection error') ||
      looksLikeTransientGatewayFailure,
  );
};

const isTimeoutError = (error: unknown) => {
  if (typeof error !== 'object' || !error) {
    return false;
  }

  const code = 'code' in error && typeof error.code === 'string' ? error.code : '';
  const name = 'name' in error && typeof error.name === 'string' ? error.name : '';
  const message = 'message' in error && typeof error.message === 'string' ? error.message : '';

  return (
    code === 'ETIMEDOUT' ||
    name.toLowerCase().includes('timeout') ||
    message.toLowerCase().includes('timed out')
  );
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

function serializeHeaders(headers: unknown) {
  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    return Object.fromEntries(headers.entries());
  }

  if (!isRecord(headers)) {
    return null;
  }

  const entries = Object.entries(headers).filter(([, value]) => typeof value === 'string');
  return entries.length > 0 ? Object.fromEntries(entries) : null;
}

function extractErrorCauseDetails(error: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 1 || (!isRecord(error) && !(error instanceof Error))) {
    return null;
  }

  const name =
    error instanceof Error
      ? error.name
      : 'name' in error && typeof error.name === 'string'
        ? error.name
        : 'UnknownError';
  const message =
    error instanceof Error
      ? error.message
      : 'message' in error && typeof error.message === 'string'
        ? error.message
        : String(error);
  const details: Record<string, unknown> = {
    name,
    message,
  };

  if ('code' in error && typeof error.code === 'string') {
    details.code = error.code;
  }

  if ('status' in error && typeof error.status === 'number') {
    details.status = error.status;
  }

  if ('type' in error && typeof error.type === 'string') {
    details.type = error.type;
  }

  if ('errno' in error && (typeof error.errno === 'number' || typeof error.errno === 'string')) {
    details.errno = error.errno;
  }

  if ('requestID' in error && typeof error.requestID === 'string') {
    details.requestId = error.requestID;
  } else if ('requestId' in error && typeof error.requestId === 'string') {
    details.requestId = error.requestId;
  }

  if ('headers' in error) {
    const headers = serializeHeaders(error.headers);
    if (headers) {
      details.headers = headers;
    }
  }

  if ('cause' in error) {
    const cause = extractErrorCauseDetails(error.cause, depth + 1);
    if (cause) {
      details.cause = cause;
    }
  }

  return details;
}

function createAbortError() {
  const error = new Error('Generation stopped by user.');
  error.name = 'AbortError';
  return error;
}

function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) {
    throw createAbortError();
  }
}

class StructuredOutputParseError extends Error {
  readonly rawResponse: Record<string, unknown> | null;

  constructor(message: string, rawResponse?: Record<string, unknown> | null) {
    super(message);
    this.name = 'StructuredOutputParseError';
    this.rawResponse = rawResponse ?? null;
  }
}

function stripMarkdownCodeFence(text: string) {
  const trimmed = text.trim();
  const match = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return match?.[1]?.trim() ?? trimmed;
}

function extractFirstJsonObject(text: string) {
  const start = text.indexOf('{');
  if (start === -1) {
    return '';
  }

  let depth = 0;
  let inString = false;
  let escaping = false;

  for (let index = start; index < text.length; index += 1) {
    const character = text[index];

    if (inString) {
      if (escaping) {
        escaping = false;
        continue;
      }

      if (character === '\\') {
        escaping = true;
        continue;
      }

      if (character === '"') {
        inString = false;
      }

      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === '{') {
      depth += 1;
      continue;
    }

    if (character === '}') {
      depth -= 1;
      if (depth === 0) {
        return text.slice(start, index + 1).trim();
      }
    }
  }

  return text.slice(start).trim();
}

function normalizeJsonCandidate(text: string) {
  return text
    .replace(/^\uFEFF/, '')
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,\s*([}\]])/g, '$1')
    .trim();
}

function buildJsonCandidates(outputText: string) {
  const trimmed = outputText.trim();
  const unfenced = stripMarkdownCodeFence(trimmed);
  const extracted = extractFirstJsonObject(unfenced || trimmed);
  const candidates = [
    { label: 'raw', text: trimmed },
    { label: 'unfenced', text: unfenced },
    { label: 'extracted-object', text: extracted },
    { label: 'normalized-raw', text: normalizeJsonCandidate(trimmed) },
    { label: 'normalized-unfenced', text: normalizeJsonCandidate(unfenced) },
    { label: 'normalized-extracted-object', text: normalizeJsonCandidate(extracted) },
  ];

  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (!candidate.text || seen.has(candidate.text)) {
      return false;
    }

    seen.add(candidate.text);
    return true;
  });
}

function extractResponseOutputText(response: unknown) {
  if (!isRecord(response)) {
    return '';
  }

  if (typeof response.output_text === 'string' && response.output_text.trim()) {
    return response.output_text.trim();
  }

  if (!Array.isArray(response.output)) {
    return '';
  }

  const chunks: string[] = [];

  for (const item of response.output) {
    if (!isRecord(item) || !Array.isArray(item.content)) {
      continue;
    }

    for (const content of item.content) {
      if (!isRecord(content)) {
        continue;
      }

      const type = typeof content.type === 'string' ? content.type : '';
      const text = typeof content.text === 'string' ? content.text : '';

      if ((type === 'output_text' || type === 'text') && text.trim()) {
        chunks.push(text.trim());
      }
    }
  }

  return chunks.join('\n').trim();
}

function extractIncompleteDetails(response: unknown) {
  if (!isRecord(response) || !isRecord(response.incomplete_details)) {
    return null;
  }

  return response.incomplete_details;
}

function isMaxOutputTokenTruncation(response: unknown) {
  if (!isRecord(response)) {
    return false;
  }

  const status = typeof response.status === 'string' ? response.status : '';
  const incompleteDetails = extractIncompleteDetails(response);
  const reason = incompleteDetails && typeof incompleteDetails.reason === 'string' ? incompleteDetails.reason : '';

  return status === 'incomplete' && reason === 'max_output_tokens';
}

function buildOpenAiFailureRawResponse(options: {
  batchIndex: number;
  totalBatches: number;
  requestedCaseCount: number;
  timeoutMs: number;
  maxOutputTokens: number;
  attempt: number;
  error: unknown;
}) {
  return {
    batchIndex: options.batchIndex,
    totalBatches: options.totalBatches,
    requestedCaseCount: options.requestedCaseCount,
    timeoutMs: options.timeoutMs,
    maxOutputTokens: options.maxOutputTokens,
    attempt: options.attempt + 1,
    error: extractErrorCauseDetails(options.error),
  } as Record<string, unknown>;
}

function isMaxOutputTokenFailureRawResponse(rawResponse: Record<string, unknown> | null) {
  if (!rawResponse || !isRecord(rawResponse)) {
    return false;
  }

  const incompleteDetails = isRecord(rawResponse.incompleteDetails) ? rawResponse.incompleteDetails : null;
  return Boolean(incompleteDetails && typeof incompleteDetails.reason === 'string' && incompleteDetails.reason === 'max_output_tokens');
}

function parseStructuredResponseText(outputText: string) {
  const candidates = buildJsonCandidates(outputText);
  let lastErrorMessage = 'OpenAI returned malformed structured output.';

  for (const candidate of candidates) {
    try {
      const parsedJson = JSON.parse(candidate.text) as unknown;
      const parsed = testCaseDraftAiResponseSchema.parse(parsedJson);
      return {
        parsed,
        strategy: candidate.label,
      };
    } catch (error) {
      lastErrorMessage = error instanceof Error ? error.message : 'Unknown parse error';
    }
  }

  throw new Error(lastErrorMessage);
}

function dedupeStrings(values: string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const normalized = value.trim();
    if (!normalized) {
      continue;
    }

    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(normalized);
  }

  return result;
}

function truncateText(value: string, maxLength: number) {
  const normalized = value.trim();
  if (!normalized) {
    return '';
  }

  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function compactLockedContextForBatch(lockedContext: Record<string, unknown> | undefined) {
  if (!lockedContext) {
    return undefined;
  }

  const compacted: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(lockedContext)) {
    if (typeof value === 'string') {
      const maxLength = key === 'suiteSummary' ? 520 : 220;
      compacted[key] = truncateText(value, maxLength);
      continue;
    }

    if (Array.isArray(value)) {
      compacted[key] = value
        .map((entry) => truncateText(String(entry), 160))
        .filter(Boolean)
        .slice(0, 8);
      continue;
    }

    compacted[key] = value;
  }

  return compacted;
}

function compactExistingCaseTitles(existingCaseTitles: string[]) {
  if (existingCaseTitles.length <= 18) {
    return existingCaseTitles;
  }

  const head = existingCaseTitles.slice(0, 6);
  const tail = existingCaseTitles.slice(-12);
  return dedupeStrings([...head, ...tail]);
}

function normalizeRequestedCaseCount(generationOptions: Record<string, unknown>) {
  const requested =
    typeof generationOptions.maxCases === 'number' && Number.isFinite(generationOptions.maxCases)
      ? generationOptions.maxCases
      : 60;

  return Math.max(1, Math.min(180, Math.floor(requested)));
}

function buildBatchPlan(mode: ApiGenerationMode, requestedCases: number, model: string) {
  const isNanoModel = model.toLowerCase().includes('nano');
  const processAlphaBatchSize = isNanoModel ? 6 : 4;
  const standardBatchSize = isNanoModel ? 8 : 6;

  if (requestedCases <= processAlphaBatchSize) {
    return [requestedCases];
  }

  const firstBatchSize = mode === 'processAlpha' ? processAlphaBatchSize : standardBatchSize;
  const followupBatchSize = mode === 'processAlpha' ? processAlphaBatchSize : standardBatchSize;
  const plan: number[] = [];
  let remaining = requestedCases;
  let isFirstBatch = true;

  while (remaining > 0) {
    const targetSize = isFirstBatch ? firstBatchSize : followupBatchSize;
    const size = Math.min(targetSize, remaining);
    plan.push(size);
    remaining -= size;
    isFirstBatch = false;
  }

  return plan;
}

function buildFallbackBatchDirectives(mode: ApiGenerationMode, requestedCases: number, model: string) {
  return buildBatchPlan(mode, requestedCases, model).map(
    (requestedCaseCount, index): CoverageBatchDirective => ({
      batchId: `batch:fallback-${index + 1}`,
      label: `Fallback batch ${index + 1}`,
      requestedCaseCount,
      focusUnitIds: [],
      focusBuckets: [],
      focusScenarioTypes: [],
      rulePackIds: [],
      instructions: ['Follow the supplied sources and knowledge-base context to generate high-signal coverage.'],
    }),
  );
}

function calculateDirectiveCaseLimit(model: string) {
  return model.toLowerCase().includes('nano') ? 8 : 6;
}

function splitRequestedCaseCount(requestedCases: number, maxCasesPerBatch: number) {
  const limit = Math.max(1, Math.floor(maxCasesPerBatch));

  if (requestedCases <= limit) {
    return [requestedCases];
  }

  const chunks: number[] = [];
  let remaining = requestedCases;

  while (remaining > 0) {
    let nextSize = Math.min(limit, remaining);

    if (remaining - nextSize === 1 && nextSize > 1) {
      nextSize -= 1;
    }

    chunks.push(nextSize);
    remaining -= nextSize;
  }

  return chunks;
}

function splitCoverageDirective(directive: CoverageBatchDirective, requestedCaseCounts: number[]) {
  if (requestedCaseCounts.length <= 1) {
    return [directive];
  }

  return requestedCaseCounts.map((requestedCaseCount, index) => ({
    ...directive,
    batchId: `${directive.batchId}:part-${index + 1}`,
    label: `${directive.label} (${index + 1}/${requestedCaseCounts.length})`,
    requestedCaseCount,
    instructions: [
      ...directive.instructions,
      `This split batch is part ${index + 1} of ${requestedCaseCounts.length}. Generate up to ${requestedCaseCount} additional unique cases for this part only.`,
    ],
  }));
}

function normalizeCoverageDirectivesForModel(directives: CoverageBatchDirective[], model: string) {
  const maxCasesPerBatch = calculateDirectiveCaseLimit(model);
  return directives.flatMap((directive) =>
    splitCoverageDirective(directive, splitRequestedCaseCount(directive.requestedCaseCount, maxCasesPerBatch)),
  );
}

export type GenerationRunProgressPhase =
  | 'queued'
  | 'initial_generation'
  | 'coverage_validation'
  | 'remediation'
  | 'finalizing'
  | 'completed'
  | 'failed';

export type GenerationRunProgressUpdate = {
  phase: GenerationRunProgressPhase;
  completedBatches: number;
  totalBatches: number;
  generatedCaseCount: number;
  retryTriggered: boolean;
  previewTitles: string[];
  rawResponse: Record<string, unknown>;
  parsedResponse: Record<string, unknown>;
  coverageValidation: CoverageValidationSummary | null;
  model: string;
};

function calculateMaxOutputTokens(requestedCases: number, attempt = 0) {
  const baseBudget = Math.max(4_000, Math.min(8_000, 1_400 + requestedCases * 900));
  const retryBonus = attempt * 2_000;
  return Math.min(12_000, baseBudget + retryBonus);
}

function calculateGenerationTimeoutMs(options: {
  mode: ApiGenerationMode;
  requestedCases: number;
  promptInput: unknown;
  batchIndex?: number;
  totalBatches?: number;
}) {
  const promptSize = JSON.stringify(options.promptInput).length;
  const promptBonus = Math.min(35_000, Math.ceil(promptSize / 1_000) * 850);
  const caseBonus = Math.min(20_000, options.requestedCases * 2_000);
  const heavyBatchBonus =
    options.requestedCases >= 12 ? 30_000 : options.requestedCases >= 10 ? 20_000 : options.requestedCases >= 8 ? 10_000 : 0;
  const lateBatchBonus =
    options.batchIndex && options.totalBatches && options.batchIndex >= Math.ceil(options.totalBatches * 0.75) ? 20_000 : 0;
  const veryLargeRunBonus =
    options.totalBatches && options.totalBatches >= 45
      ? 45_000
      : options.totalBatches && options.totalBatches >= 35
        ? 30_000
        : options.totalBatches && options.totalBatches >= 24
          ? 15_000
          : 0;
  const modeFloor = options.mode === 'processAlpha' ? 120_000 : 95_000;

  return Math.max(
    env.OPENAI_TIMEOUT_MS,
    modeFloor,
    45_000 + promptBonus + caseBonus + heavyBatchBonus + lateBatchBonus + veryLargeRunBonus,
  );
}

function testCaseKey(testCase: TestCaseDraftAiResponse['testCases'][number]) {
  const unitTags = Array.isArray(testCase.tags)
    ? testCase.tags
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.startsWith('unit:'))
        .sort()
        .join('|')
    : '';
  const componentKey = Array.isArray(testCase.linkedComponents)
    ? [...testCase.linkedComponents].map((value) => value.trim().toLowerCase()).sort().join('|')
    : '';

  return [testCase.title, testCase.feature, testCase.scenario, unitTags, componentKey]
    .map((value) => value.trim().toLowerCase())
    .join('::');
}

function mergeTestCases(
  baseCases: TestCaseDraftAiResponse['testCases'],
  nextCases: TestCaseDraftAiResponse['testCases'],
) {
  const merged: TestCaseDraftAiResponse['testCases'] = [];
  const seen = new Set<string>();

  for (const testCase of [...baseCases, ...nextCases]) {
    const key = testCaseKey(testCase);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(testCase);
  }

  return merged;
}

function mergeBatchResponses(base: TestCaseDraftAiResponse, next: TestCaseDraftAiResponse): TestCaseDraftAiResponse {
  return {
    suiteTitle: base.suiteTitle || next.suiteTitle,
    suiteSummary: base.suiteSummary || next.suiteSummary,
    inferredComponents: dedupeStrings([...base.inferredComponents, ...next.inferredComponents]),
    inferredFeatureTypes: dedupeStrings([...base.inferredFeatureTypes, ...next.inferredFeatureTypes]),
    inferredRulePacks: dedupeStrings([...base.inferredRulePacks, ...next.inferredRulePacks]),
    inferredTaxonomy: dedupeStrings([...base.inferredTaxonomy, ...next.inferredTaxonomy]),
    inferredScenarios: dedupeStrings([...base.inferredScenarios, ...next.inferredScenarios]),
    inferredIntegrations: dedupeStrings([...base.inferredIntegrations, ...next.inferredIntegrations]),
    assumptions: dedupeStrings([...base.assumptions, ...next.assumptions]),
    gaps: dedupeStrings([...base.gaps, ...next.gaps]),
    coverageSummary: dedupeStrings([...base.coverageSummary, ...next.coverageSummary]),
    confidence: Number((((base.confidence ?? 0.7) + (next.confidence ?? 0.7)) / 2).toFixed(2)),
    testCases: mergeTestCases(base.testCases, next.testCases),
  };
}

function buildLockedContext(parsed: TestCaseDraftAiResponse) {
  return {
    suiteTitle: parsed.suiteTitle,
    suiteSummary: parsed.suiteSummary,
    inferredComponents: parsed.inferredComponents,
    inferredFeatureTypes: parsed.inferredFeatureTypes,
    inferredRulePacks: parsed.inferredRulePacks,
    inferredTaxonomy: parsed.inferredTaxonomy,
    inferredScenarios: parsed.inferredScenarios,
    inferredIntegrations: parsed.inferredIntegrations,
    coverageSummary: parsed.coverageSummary,
  };
}

function buildPreviewTitles(parsed: TestCaseDraftAiResponse, maxItems = 12) {
  return parsed.testCases
    .slice(0, maxItems)
    .map((testCase) => testCase.title.trim())
    .filter(Boolean);
}

function buildLiveProgressRawResponse(options: {
  phase: GenerationRunProgressPhase;
  completedBatches: number;
  totalBatches: number;
  generatedCaseCount: number;
  retryTriggered: boolean;
  previewTitles: string[];
  coverageValidation: CoverageValidationSummary | null;
  batchResponses: Array<Record<string, unknown>>;
}) {
  const lastBatch =
    options.batchResponses.length > 0 ? options.batchResponses[options.batchResponses.length - 1] : null;

  return {
    progress: {
      phase: options.phase,
      completedBatches: options.completedBatches,
      totalBatches: options.totalBatches,
      generatedCaseCount: options.generatedCaseCount,
      retryTriggered: options.retryTriggered,
      previewTitles: options.previewTitles,
    },
    coverageValidation: options.coverageValidation,
    retryTriggered: options.retryTriggered,
    batchCount: options.batchResponses.length,
    lastBatch:
      lastBatch && typeof lastBatch.batchIndex === 'number'
        ? {
            batchIndex: lastBatch.batchIndex,
            totalBatches: lastBatch.totalBatches,
            requestedCaseCount: lastBatch.requestedCaseCount,
            receivedCaseCount: lastBatch.receivedCaseCount,
            status: lastBatch.status,
            parseStrategy: lastBatch.parseStrategy,
          }
        : null,
  } as Record<string, unknown>;
}

function buildLiveParsedResponse(parsed: TestCaseDraftAiResponse) {
  return {
    ...parsed,
    testCases: parsed.testCases.slice(0, 24),
  };
}

function inferScenarioTypeTag(
  testCase: TestCaseDraftAiResponse['testCases'][number],
  batchDirective?: CoverageBatchDirective,
  index = 0,
) {
  const text = [testCase.title, testCase.feature, testCase.scenario, testCase.objective, ...(testCase.tags ?? [])]
    .join(' ')
    .toLowerCase();

  if (text.includes('loading') || text.includes('spinner') || text.includes('skeleton')) {
    return 'loading';
  }
  if (text.includes('empty') || text.includes('no data')) {
    return 'empty_state';
  }
  if (text.includes('partial')) {
    return 'partial_data';
  }
  if (text.includes('malformed') || text.includes('invalid payload')) {
    return 'malformed_data';
  }
  if (text.includes('stale')) {
    return 'stale_data';
  }
  if (text.includes('accessibility') || text.includes('keyboard') || text.includes('focus') || text.includes('screen reader')) {
    return 'accessibility';
  }
  if (text.includes('usability') || text.includes('readability') || text.includes('discoverability')) {
    return 'usability';
  }
  if (text.includes('performance') || text.includes('latency') || text.includes('3 second') || text.includes('large range')) {
    return 'performance';
  }
  if (text.includes('regression')) {
    return 'regression';
  }
  if (text.includes('consistency') || text.includes('sync') || text.includes('reconcile') || text.includes('alignment')) {
    return 'consistency';
  }
  if (text.includes('boundary') || text.includes('range') || text.includes('future date') || text.includes('previous day')) {
    return 'boundary';
  }
  if (text.includes('error') || text.includes('failure') || text.includes('fallback')) {
    return 'error';
  }
  if (text.includes('resilience') || text.includes('retry') || text.includes('recover')) {
    return 'resilience';
  }
  if (text.includes('negative') || text.includes('invalid') || text.includes('unsupported') || text.includes('blocked')) {
    return 'negative';
  }
  if (text.includes('edge') || text.includes('zero') || text.includes('single') || text.includes('many') || text.includes('long label')) {
    return 'edge';
  }

  return batchDirective?.focusScenarioTypes[index % batchDirective.focusScenarioTypes.length] ?? 'positive';
}

function chooseUnitIdForCase(
  testCase: TestCaseDraftAiResponse['testCases'][number],
  coveragePlan: CoveragePlan | undefined,
  batchDirective: CoverageBatchDirective | undefined,
  index: number,
) {
  if (!coveragePlan || !batchDirective || batchDirective.focusUnitIds.length === 0) {
    return '';
  }

  const text = [
    testCase.title,
    testCase.feature,
    testCase.scenario,
    ...(testCase.linkedComponents ?? []),
    ...(testCase.tags ?? []),
  ]
    .join(' ')
    .toLowerCase();

  let bestUnitId = '';
  let bestScore = -1;

  for (const unitId of batchDirective.focusUnitIds) {
    const unit = coveragePlan.units.find((entry) => entry.unitId === unitId);
    if (!unit) {
      continue;
    }

    const candidates = [unit.unitName, unit.pageArea, ...unit.keywords].map((value) => value.toLowerCase());
    const score = candidates.reduce((total, candidate) => (candidate && text.includes(candidate) ? total + 1 : total), 0);
    if (score > bestScore) {
      bestScore = score;
      bestUnitId = unitId;
    }
  }

  return bestScore > 0 ? bestUnitId : batchDirective.focusUnitIds[index % batchDirective.focusUnitIds.length];
}

function slugifyTagValue(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function normalizeFeatureText(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function chooseRequiredFeaturesForCase(options: {
  testCase: TestCaseDraftAiResponse['testCases'][number];
  coveragePlan?: CoveragePlan;
  chosenUnitId?: string;
}) {
  if (!options.coveragePlan) {
    return [];
  }

  const text = [
    options.testCase.title,
    options.testCase.feature,
    options.testCase.scenario,
    options.testCase.objective,
    ...(options.testCase.linkedComponents ?? []),
    ...(options.testCase.tags ?? []),
  ]
    .join(' ');
  const normalizedText = normalizeFeatureText(text);

  return options.coveragePlan.userFeatures.filter((feature) => {
    if (options.chosenUnitId && feature.relatedUnitIds.includes(options.chosenUnitId)) {
      return true;
    }

    return normalizedText.includes(feature.normalizedName);
  });
}

function enrichParsedResponseCoverageMetadata(options: {
  parsed: TestCaseDraftAiResponse;
  coveragePlan?: CoveragePlan;
  batchDirective?: CoverageBatchDirective;
}) {
  if (!options.batchDirective) {
    return options.parsed;
  }

  const enrichedCases = options.parsed.testCases.map((testCase, index) => {
    const tags = new Set((testCase.tags ?? []).map((value) => value.trim().toLowerCase()).filter(Boolean));
    const chosenUnitId = chooseUnitIdForCase(testCase, options.coveragePlan, options.batchDirective, index);
    const chosenUnit = chosenUnitId
      ? options.coveragePlan?.units.find((unit) => unit.unitId === chosenUnitId) ?? null
      : null;
    const chosenBucket =
      options.batchDirective?.focusBuckets[0] ??
      (chosenUnit ? chosenUnit.coverageBuckets[0] : undefined);
    const scenarioType = inferScenarioTypeTag(testCase, options.batchDirective, index);
    const matchedRequiredFeatures = chooseRequiredFeaturesForCase({
      testCase,
      coveragePlan: options.coveragePlan,
      chosenUnitId: chosenUnitId || undefined,
    });

    if (chosenUnit) {
      tags.add(`page-area:${chosenUnit.pageArea.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`);
      tags.add(`unit:${chosenUnit.unitId}`);
      tags.add(`unit-type:${chosenUnit.unitType}`);
    }
    if (chosenBucket) {
      tags.add(`coverage-bucket:${chosenBucket}`);
    }
    if (scenarioType) {
      tags.add(`scenario-type:${scenarioType}`);
    }
    for (const feature of matchedRequiredFeatures) {
      tags.add(`requested-feature:${slugifyTagValue(feature.normalizedName)}`);
    }

    return {
      ...testCase,
      tags: [...tags],
      linkedComponents:
        chosenUnit && !(testCase.linkedComponents?.length ?? 0)
          ? [chosenUnit.unitName]
          : testCase.linkedComponents,
      linkedRulePacks:
        chosenUnit && !(testCase.linkedRulePacks?.length ?? 0)
          ? chosenUnit.mappedRulePacks
          : testCase.linkedRulePacks,
    };
  });

  return {
    ...options.parsed,
    testCases: enrichedCases,
  };
}

type GenerationBatchExecutionOptions = {
  mode: ApiGenerationMode;
  title: string;
  description: string;
  sourceInputs: PreparedSourceInput[];
  generationOptions: Record<string, unknown>;
  knowledgeBaseContext: Record<string, unknown>;
  coveragePlan?: CoveragePlan;
  suiteScope?: {
    path: string | null;
    featureName: string | null;
  };
  correlationId: string;
  model: string;
  batchIndex: number;
  totalBatches: number;
  requestedCaseCount: number;
  existingCaseTitles: string[];
  lockedContext?: Record<string, unknown>;
  batchDirective?: CoverageBatchDirective;
  abortSignal?: AbortSignal;
  splitDepth?: number;
};

type GenerationBatchExecutionResult = {
  parsedResponse: TestCaseDraftAiResponse;
  rawResponse: Record<string, unknown>;
};

async function runSingleGenerationBatch(
  options: GenerationBatchExecutionOptions,
): Promise<GenerationBatchExecutionResult> {
  const generationOptions = {
    ...options.generationOptions,
  };
  const input = buildTestGenerationPrompt({
    mode: options.mode,
    title: options.title,
    description: options.description,
    sourceInputs: options.sourceInputs,
    generationOptions,
    knowledgeBaseContext: options.knowledgeBaseContext,
    coveragePlan: options.coveragePlan,
    suiteScope: options.suiteScope,
    resultSchema: testCaseDraftAiResponseSchema,
    batchContext: {
      batchIndex: options.batchIndex,
      totalBatches: options.totalBatches,
      requestedCaseCount: options.requestedCaseCount,
      existingCaseTitles: compactExistingCaseTitles(options.existingCaseTitles),
      lockedContext: compactLockedContextForBatch(options.lockedContext),
      batchDirective: options.batchDirective,
    },
  });
  const timeoutMs = calculateGenerationTimeoutMs({
    mode: options.mode,
    requestedCases: options.requestedCaseCount,
    promptInput: input,
    batchIndex: options.batchIndex,
    totalBatches: options.totalBatches,
  });
  let lastError: unknown;
  let lastFailureRawResponse: Record<string, unknown> | null = null;

  for (let attempt = 0; attempt <= env.OPENAI_MAX_RETRIES; attempt += 1) {
    throwIfAborted(options.abortSignal);

    try {
      const maxOutputTokens = calculateMaxOutputTokens(options.requestedCaseCount, attempt);
      const response = await openai!.responses.create(
        {
          model: options.model,
          input: input as any,
          max_output_tokens: maxOutputTokens,
          reasoning: {
            effort: 'low',
          },
          text: {
            format: zodTextFormat(testCaseDraftAiResponseSchema, 'test_case_generation_result'),
          },
        },
        {
          timeout: timeoutMs,
          signal: options.abortSignal,
          headers: {
            'X-Client-Request-Id': `${options.correlationId}:batch-${options.batchIndex}`,
          },
        },
      );
      const outputText = extractResponseOutputText(response);
      const rawResponse = {
        response: serialize(response),
        requestId: response._request_id ?? null,
        timeoutMs,
        maxOutputTokens,
        batchIndex: options.batchIndex,
        totalBatches: options.totalBatches,
        requestedCaseCount: options.requestedCaseCount,
        status: typeof response.status === 'string' ? response.status : null,
        incompleteDetails: extractIncompleteDetails(response),
        outputText,
      } as Record<string, unknown>;

      if (isMaxOutputTokenTruncation(response)) {
        throw new StructuredOutputParseError(
          `OpenAI response was truncated by max_output_tokens on generation batch ${options.batchIndex}/${options.totalBatches}.`,
          rawResponse,
        );
      }

      if (!outputText) {
        throw new StructuredOutputParseError(
          `OpenAI returned no text output on generation batch ${options.batchIndex}/${options.totalBatches}.`,
          rawResponse,
        );
      }

      let parsedResult: { parsed: TestCaseDraftAiResponse; strategy: string };
      try {
        parsedResult = parseStructuredResponseText(outputText);
      } catch (error) {
        const parseMessage = error instanceof Error ? error.message : 'Unknown parse error';
        throw new StructuredOutputParseError(
          `OpenAI returned malformed structured JSON on generation batch ${options.batchIndex}/${options.totalBatches}: ${parseMessage}`,
          rawResponse,
        );
      }

      const enrichedParsed = enrichParsedResponseCoverageMetadata({
        parsed: parsedResult.parsed,
        coveragePlan: options.coveragePlan,
        batchDirective: options.batchDirective,
      });

      return {
        parsedResponse: enrichedParsed,
        rawResponse: {
          ...rawResponse,
          parseStrategy: parsedResult.strategy,
          receivedCaseCount: enrichedParsed.testCases.length,
        } as Record<string, unknown>,
      };
    } catch (error) {
      lastError = error;
      lastFailureRawResponse =
        error instanceof StructuredOutputParseError
          ? error.rawResponse
          : buildOpenAiFailureRawResponse({
              batchIndex: options.batchIndex,
              totalBatches: options.totalBatches,
              requestedCaseCount: options.requestedCaseCount,
              timeoutMs,
              maxOutputTokens: calculateMaxOutputTokens(options.requestedCaseCount, attempt),
              attempt,
              error,
            });

      if (
        attempt < env.OPENAI_MAX_RETRIES &&
        (isRetryableError(error) || error instanceof StructuredOutputParseError)
      ) {
        throwIfAborted(options.abortSignal);
        await delay(500 * (attempt + 1));
        continue;
      }

      break;
    }
  }

  if (lastFailureRawResponse && isTimeoutError(lastError) && options.requestedCaseCount > 1 && (options.splitDepth ?? 0) < 4) {
    return rerunGenerationBatchWithSplit(options, lastFailureRawResponse);
  }

  if (isTimeoutError(lastError)) {
    throw serviceUnavailable(
      `OpenAI request timed out after ${Math.round(timeoutMs / 1000)}s on generation batch ${options.batchIndex}/${options.totalBatches}. Reduce source size or increase OPENAI_TIMEOUT_MS.`,
      lastFailureRawResponse,
    );
  }

  if (
    lastFailureRawResponse &&
    isMaxOutputTokenFailureRawResponse(lastFailureRawResponse) &&
    options.requestedCaseCount > 1 &&
    (options.splitDepth ?? 0) < 4
  ) {
    return rerunGenerationBatchWithSplit(options, lastFailureRawResponse);
  }

  if (lastFailureRawResponse) {
    const message =
      lastError instanceof Error ? lastError.message : 'OpenAI request failed before a response was returned.';
    throw serviceUnavailable(
      `OpenAI request failed on generation batch ${options.batchIndex}/${options.totalBatches}: ${message}`,
      lastFailureRawResponse,
    );
  }

  throw lastError;
}

function buildSplitRetryBatchDirectives(batchDirective: CoverageBatchDirective | undefined, requestedCaseCount: number) {
  const baseDirective: CoverageBatchDirective =
    batchDirective ??
    ({
      batchId: 'batch:split-retry',
      label: 'Split retry batch',
      requestedCaseCount,
      focusUnitIds: [],
      focusBuckets: [],
      focusScenarioTypes: [],
      rulePackIds: [],
      instructions: ['Continue generating unique coverage without duplicating prior cases.'],
    } satisfies CoverageBatchDirective);

  return splitCoverageDirective(
    baseDirective,
    splitRequestedCaseCount(requestedCaseCount, Math.max(1, Math.ceil(requestedCaseCount / 2))),
  ).map((directive) => ({
    ...directive,
    instructions: [
      ...directive.instructions,
      'This split retry was triggered because the prior response hit max_output_tokens.',
    ],
  }));
}

async function rerunGenerationBatchWithSplit(
  options: GenerationBatchExecutionOptions,
  failureRawResponse: Record<string, unknown>,
): Promise<GenerationBatchExecutionResult> {
  const splitDirectives = buildSplitRetryBatchDirectives(options.batchDirective, options.requestedCaseCount);
  const childBatchResponses: Array<Record<string, unknown>> = [];
  let mergedResponse: TestCaseDraftAiResponse | null = null;
  let existingCaseTitles = [...options.existingCaseTitles];
  let lockedContext = options.lockedContext;

  for (const splitDirective of splitDirectives) {
    const childBatch: GenerationBatchExecutionResult = await runSingleGenerationBatch({
      ...options,
      requestedCaseCount: splitDirective.requestedCaseCount,
      existingCaseTitles,
      lockedContext,
      batchDirective: splitDirective,
      splitDepth: (options.splitDepth ?? 0) + 1,
    });

    childBatchResponses.push(childBatch.rawResponse);
    mergedResponse = mergedResponse ? mergeBatchResponses(mergedResponse, childBatch.parsedResponse) : childBatch.parsedResponse;
    existingCaseTitles = dedupeStrings([
      ...existingCaseTitles,
      ...childBatch.parsedResponse.testCases.map(
        (testCase: TestCaseDraftAiResponse['testCases'][number]) => testCase.title,
      ),
    ]);
    lockedContext = mergedResponse ? buildLockedContext(mergedResponse) : lockedContext;
  }

  if (!mergedResponse) {
    throw serviceUnavailable(
      `OpenAI request failed on generation batch ${options.batchIndex}/${options.totalBatches}: split retry did not return a parsed generation result.`,
      failureRawResponse,
    );
  }

  return {
    parsedResponse: mergedResponse,
    rawResponse: {
      batchIndex: options.batchIndex,
      totalBatches: options.totalBatches,
      requestedCaseCount: options.requestedCaseCount,
      receivedCaseCount: mergedResponse.testCases.length,
      status: 'split_retry_completed',
      parseStrategy: 'split-merge',
      splitRetry: true,
      splitDepth: (options.splitDepth ?? 0) + 1,
      splitRequestedCaseCounts: splitDirectives.map((directive) => directive.requestedCaseCount),
      originalFailure: failureRawResponse,
      childBatches: childBatchResponses,
    } as Record<string, unknown>,
  };
}

function calculateBatchConcurrency(model: string, totalBatches: number) {
  if (totalBatches <= 1) {
    return 1;
  }

  if (totalBatches >= 24) {
    return 1;
  }

  if (totalBatches >= 10) {
    return 2;
  }

  if (model.toLowerCase().includes('nano')) {
    return Math.min(4, totalBatches);
  }

  return Math.min(3, totalBatches);
}

async function processGenerationDirectiveSet(options: {
  directives: CoverageBatchDirective[];
  phase: Extract<GenerationRunProgressPhase, 'initial_generation' | 'remediation'>;
  totalBatches: number;
  completedBatchCount: number;
  mode: ApiGenerationMode;
  title: string;
  description: string;
  sourceInputs: PreparedSourceInput[];
  generationOptions: Record<string, unknown>;
  knowledgeBaseContext: Record<string, unknown>;
  coveragePlan?: CoveragePlan;
  suiteScope?: {
    path: string | null;
    featureName: string | null;
  };
  correlationId: string;
  model: string;
  mergedResponse: TestCaseDraftAiResponse | null;
  batchResponses: Array<Record<string, unknown>>;
  retryTriggered: boolean;
  onProgress?: (update: GenerationRunProgressUpdate) => Promise<void> | void;
  abortSignal?: AbortSignal;
}) {
  let completedBatchCount = options.completedBatchCount;
  let mergedResponse = options.mergedResponse;

  const concurrency = calculateBatchConcurrency(options.model, options.directives.length);

  for (let startIndex = 0; startIndex < options.directives.length; startIndex += concurrency) {
    throwIfAborted(options.abortSignal);
    const directivesChunk = options.directives.slice(startIndex, startIndex + concurrency);
    const contextSnapshot = mergedResponse ? buildLockedContext(mergedResponse) : undefined;
    const existingCaseTitlesSnapshot = mergedResponse ? mergedResponse.testCases.map((testCase) => testCase.title) : [];

    await Promise.all(
      directivesChunk.map(async (batchDirective, chunkOffset) => {
        const batch = await runSingleGenerationBatch({
          mode: options.mode,
          title: options.title,
          description: options.description,
          sourceInputs: options.sourceInputs,
          generationOptions: options.generationOptions,
          knowledgeBaseContext: options.knowledgeBaseContext,
          coveragePlan: options.coveragePlan,
          suiteScope: options.suiteScope,
          correlationId: options.correlationId,
          model: options.model,
          batchIndex: completedBatchCount + chunkOffset + 1,
          totalBatches: options.totalBatches,
          requestedCaseCount: batchDirective.requestedCaseCount,
          existingCaseTitles: existingCaseTitlesSnapshot,
          lockedContext: contextSnapshot,
          batchDirective,
          abortSignal: options.abortSignal,
        });

        options.batchResponses.push(batch.rawResponse);
        mergedResponse = mergedResponse ? mergeBatchResponses(mergedResponse, batch.parsedResponse) : batch.parsedResponse;
        completedBatchCount += 1;

        if (options.onProgress && mergedResponse) {
          const previewTitles = buildPreviewTitles(mergedResponse);
          await options.onProgress({
            phase: options.phase,
            completedBatches: completedBatchCount,
            totalBatches: options.totalBatches,
            generatedCaseCount: mergedResponse.testCases.length,
            retryTriggered: options.retryTriggered,
            previewTitles,
            rawResponse: buildLiveProgressRawResponse({
              phase: options.phase,
              completedBatches: completedBatchCount,
              totalBatches: options.totalBatches,
              generatedCaseCount: mergedResponse.testCases.length,
              retryTriggered: options.retryTriggered,
              previewTitles,
              coverageValidation: null,
              batchResponses: options.batchResponses,
            }),
            parsedResponse: serialize(buildLiveParsedResponse(mergedResponse)) as Record<string, unknown>,
            coverageValidation: null,
            model: options.model,
          });
        }
      }),
    );
  }

  return {
    completedBatchCount,
    mergedResponse,
  };
}

export async function runTestGenerationWithOpenAi(options: {
  mode: ApiGenerationMode;
  title: string;
  description: string;
  sourceInputs: PreparedSourceInput[];
  generationOptions: Record<string, unknown>;
  knowledgeBaseContext: Record<string, unknown>;
  coveragePlan?: CoveragePlan;
  suiteScope?: {
    path: string | null;
    featureName: string | null;
  };
  correlationId: string;
  model?: string;
  onProgress?: (update: GenerationRunProgressUpdate) => Promise<void> | void;
  abortSignal?: AbortSignal;
}) {
  if (!openai) {
    throw serviceUnavailable('OPENAI_API_KEY is not configured');
  }

  const model = options.model ?? env.OPENAI_MODEL;
  throwIfAborted(options.abortSignal);
  const requestedCases = normalizeRequestedCaseCount(options.generationOptions);
  const plannedInitialBatchDirectives =
    options.coveragePlan && options.coveragePlan.batchDirectives.length > 0
      ? options.coveragePlan.batchDirectives
      : buildFallbackBatchDirectives(options.mode, requestedCases, model);
  const initialBatchDirectives = normalizeCoverageDirectivesForModel(plannedInitialBatchDirectives, model);
  const batchResponses: Array<Record<string, unknown>> = [];
  let mergedResponse: TestCaseDraftAiResponse | null = null;
  let retryTriggered = false;
  let completedBatchCount = 0;
  let finalCoverageSummary = options.coveragePlan
    ? validateCoveragePlan(options.coveragePlan, [], {
        retryTriggered: false,
      })
    : null;
  let totalBatches = initialBatchDirectives.length;

  if (options.onProgress) {
    await options.onProgress({
      phase: 'queued',
      completedBatches: 0,
      totalBatches,
      generatedCaseCount: 0,
      retryTriggered: false,
      previewTitles: [],
      rawResponse: buildLiveProgressRawResponse({
        phase: 'queued',
        completedBatches: 0,
        totalBatches,
        generatedCaseCount: 0,
        retryTriggered: false,
        previewTitles: [],
        coverageValidation: finalCoverageSummary,
        batchResponses,
      }),
      parsedResponse: {},
      coverageValidation: finalCoverageSummary,
      model,
    });
  }

  const initialProcessing = await processGenerationDirectiveSet({
    directives: initialBatchDirectives,
    phase: 'initial_generation',
    totalBatches,
    completedBatchCount,
    mode: options.mode,
    title: options.title,
    description: options.description,
    sourceInputs: options.sourceInputs,
    generationOptions: options.generationOptions,
    knowledgeBaseContext: options.knowledgeBaseContext,
    coveragePlan: options.coveragePlan,
    suiteScope: options.suiteScope,
    correlationId: options.correlationId,
    model,
    mergedResponse,
    batchResponses,
    retryTriggered: false,
    onProgress: options.onProgress,
    abortSignal: options.abortSignal,
  });
  mergedResponse = initialProcessing.mergedResponse;
  completedBatchCount = initialProcessing.completedBatchCount;

  if (options.coveragePlan && mergedResponse) {
    finalCoverageSummary = validateCoveragePlan(
      options.coveragePlan,
      mergedResponse.testCases as Array<Record<string, unknown>>,
      { retryTriggered: false },
    );

    if (options.onProgress) {
      const previewTitles = buildPreviewTitles(mergedResponse);
      await options.onProgress({
        phase: 'coverage_validation',
        completedBatches: completedBatchCount,
        totalBatches,
        generatedCaseCount: mergedResponse.testCases.length,
        retryTriggered: false,
        previewTitles,
        rawResponse: buildLiveProgressRawResponse({
          phase: 'coverage_validation',
          completedBatches: completedBatchCount,
          totalBatches,
          generatedCaseCount: mergedResponse.testCases.length,
          retryTriggered: false,
          previewTitles,
          coverageValidation: finalCoverageSummary,
          batchResponses,
        }),
        parsedResponse: serialize(buildLiveParsedResponse(mergedResponse)) as Record<string, unknown>,
        coverageValidation: finalCoverageSummary,
        model,
      });
    }

    if (finalCoverageSummary.quotaStatus !== 'met') {
      const remediationDirectives = normalizeCoverageDirectivesForModel(
        buildExpansionDirectives(options.coveragePlan, finalCoverageSummary),
        model,
      );

      if (remediationDirectives.length > 0) {
        retryTriggered = true;
        totalBatches = initialBatchDirectives.length + remediationDirectives.length;

        const remediationProcessing = await processGenerationDirectiveSet({
          directives: remediationDirectives,
          phase: 'remediation',
          totalBatches,
          completedBatchCount,
          mode: options.mode,
          title: options.title,
          description: options.description,
          sourceInputs: options.sourceInputs,
    generationOptions: options.generationOptions,
    knowledgeBaseContext: options.knowledgeBaseContext,
    coveragePlan: options.coveragePlan,
    suiteScope: options.suiteScope,
    correlationId: options.correlationId,
          model,
          mergedResponse,
          batchResponses,
          retryTriggered: true,
          onProgress: options.onProgress,
          abortSignal: options.abortSignal,
        });
        mergedResponse = remediationProcessing.mergedResponse;
        completedBatchCount = remediationProcessing.completedBatchCount;

        if (!mergedResponse) {
          throw serviceUnavailable('OpenAI remediation pass did not return a parsed generation result.');
        }

        finalCoverageSummary = validateCoveragePlan(
          options.coveragePlan,
          mergedResponse.testCases as Array<Record<string, unknown>>,
          { retryTriggered: true },
        );
      }
    }
  }

  const finalResponse = mergedResponse
    ? {
        ...mergedResponse,
        coverageSummary: dedupeStrings([
          ...mergedResponse.coverageSummary,
          ...(options.coveragePlan?.reasoning ?? []),
          ...(finalCoverageSummary ? buildCoverageSummaryLines(finalCoverageSummary) : []),
        ]),
        inferredFeatureTypes: dedupeStrings([
          ...mergedResponse.inferredFeatureTypes,
          ...(
            options.coveragePlan?.mergedFeatures.map((feature) => feature.displayName) ?? []
          ),
        ]),
        testCases: mergedResponse.testCases,
      }
    : null;

  if (!finalResponse) {
    throw serviceUnavailable('OpenAI did not return a parsed generation result.');
  }

  if (options.onProgress) {
    const previewTitles = buildPreviewTitles(finalResponse);
    await options.onProgress({
      phase: 'finalizing',
      completedBatches: completedBatchCount,
      totalBatches,
      generatedCaseCount: finalResponse.testCases.length,
      retryTriggered,
      previewTitles,
      rawResponse: buildLiveProgressRawResponse({
        phase: 'finalizing',
        completedBatches: completedBatchCount,
        totalBatches,
        generatedCaseCount: finalResponse.testCases.length,
        retryTriggered,
        previewTitles,
        coverageValidation: finalCoverageSummary,
        batchResponses,
      }),
      parsedResponse: serialize(buildLiveParsedResponse(finalResponse)) as Record<string, unknown>,
      coverageValidation: finalCoverageSummary,
      model,
    });
  }

  return {
    requestPayload: {
      mode: options.mode,
      model,
      generationOptions: options.generationOptions,
      batchPlan: initialBatchDirectives.map((directive) => ({
        batchId: directive.batchId,
        label: directive.label,
        requestedCaseCount: directive.requestedCaseCount,
        focusUnitIds: directive.focusUnitIds,
        focusBuckets: directive.focusBuckets,
      })),
      coveragePlan: options.coveragePlan
        ? {
            pageType: options.coveragePlan.pageType,
            units: options.coveragePlan.units.length,
            crossRelations: options.coveragePlan.crossRelations.length,
            userFeatures: options.coveragePlan.userFeatures.map((feature) => feature.displayName),
            detectedFeatures: options.coveragePlan.detectedFeatures.map((feature) => feature.displayName),
            mergedFeatures: options.coveragePlan.mergedFeatures.map((feature) => feature.displayName),
            recommendedCaseCount: options.coveragePlan.recommendedCaseCount,
          }
        : null,
    },
    rawResponse: {
      batches: batchResponses,
      coverageValidation: finalCoverageSummary,
      retryTriggered,
      progress: {
        phase: 'completed',
        completedBatches: completedBatchCount,
        totalBatches,
        generatedCaseCount: finalResponse.testCases.length,
        retryTriggered,
        previewTitles: buildPreviewTitles(finalResponse),
      },
    } as Record<string, unknown>,
    parsedResponse: finalResponse,
    model,
  };
}
