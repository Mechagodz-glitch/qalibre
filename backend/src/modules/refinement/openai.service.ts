import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z, type ZodTypeAny } from 'zod';

import { env } from '../../config/env.js';
import { serviceUnavailable } from '../../lib/errors.js';
import { buildRefinementPrompt } from './prompt-builders.js';
import type { ApiDatasetItemType } from '../datasets/dataset.schemas.js';
import type { ApiRefinementMode } from './refinement.schemas.js';

const openai = env.OPENAI_API_KEY
  ? new OpenAI({
      apiKey: env.OPENAI_API_KEY,
      maxRetries: 0,
    })
  : null;

const retryableStatusCodes = new Set([408, 409, 429, 500, 502, 503, 504]);

const delay = (milliseconds: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, milliseconds);
  });

const isRetryableError = (error: unknown) => {
  if (typeof error !== 'object' || !error) {
    return false;
  }

  const status = 'status' in error && typeof error.status === 'number' ? error.status : undefined;
  const code = 'code' in error && typeof error.code === 'string' ? error.code : undefined;

  return Boolean((status && retryableStatusCodes.has(status)) || code === 'ETIMEDOUT' || code === 'ECONNRESET');
};

const serialize = (value: unknown) => JSON.parse(JSON.stringify(value)) as unknown;

export function buildRefinementResultSchema(payloadSchema: ZodTypeAny) {
  return z.object({
    refinedData: payloadSchema,
    confidence: z.number().min(0).max(1),
    changeSummary: z.array(z.string().trim().min(1).max(300)).min(1).max(8),
  });
}

export async function runRefinementWithOpenAi(options: {
  itemType: ApiDatasetItemType;
  mode: ApiRefinementMode;
  payload: Record<string, unknown>;
  correlationId: string;
  model?: string;
}): Promise<{
  requestPayload: Record<string, unknown>;
  rawResponse: Record<string, unknown>;
  parsedResponse: {
    refinedData: Record<string, unknown>;
    confidence: number;
    changeSummary: string[];
  };
  model: string;
}> {
  if (!openai) {
    throw serviceUnavailable('OPENAI_API_KEY is not configured');
  }

  const payloadSchema = options.itemType
    ? (await import('../datasets/dataset.registry.js')).getDatasetEntityDefinition(options.itemType).payloadSchema
    : z.record(z.string(), z.unknown());
  const resultSchema = buildRefinementResultSchema(payloadSchema);
  const input = buildRefinementPrompt({
    itemType: options.itemType,
    mode: options.mode,
    payload: options.payload,
    payloadSchema,
    resultSchema,
  });

  let lastError: unknown;

  for (let attempt = 0; attempt <= env.OPENAI_MAX_RETRIES; attempt += 1) {
    try {
      const response = await openai.responses.parse(
        {
          model: options.model ?? env.OPENAI_MODEL,
          input,
          text: {
            format: zodTextFormat(resultSchema, 'dataset_refinement_result'),
          },
        },
        {
          timeout: env.OPENAI_TIMEOUT_MS,
          headers: {
            'X-Client-Request-Id': options.correlationId,
          },
        },
      );

      const parsed = resultSchema.parse(response.output_parsed) as {
        refinedData: Record<string, unknown>;
        confidence: number;
        changeSummary: string[];
      };

      return {
        requestPayload: {
          itemType: options.itemType,
          mode: options.mode,
          model: options.model ?? env.OPENAI_MODEL,
          input,
        },
        rawResponse: {
          response: serialize(response),
          requestId: response._request_id ?? null,
        } as Record<string, unknown>,
        parsedResponse: parsed,
        model: options.model ?? env.OPENAI_MODEL,
      };
    } catch (error) {
      lastError = error;

      if (attempt < env.OPENAI_MAX_RETRIES && isRetryableError(error)) {
        await delay(500 * (attempt + 1));
        continue;
      }

      break;
    }
  }

  throw lastError;
}
