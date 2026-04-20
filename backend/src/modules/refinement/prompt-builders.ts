import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ZodTypeAny } from 'zod';

import { getDatasetEntityDefinition } from '../datasets/dataset.registry.js';
import type { ApiDatasetItemType } from '../datasets/dataset.schemas.js';
import type { ApiRefinementMode } from './refinement.schemas.js';

const modeGuidance: Record<ApiRefinementMode, string> = {
  normalize:
    'Standardize terminology, list formatting, and field consistency without broadening the original scope.',
  expand:
    'Add missing but inferable reusable QA detail only where it is strongly supported by the current item.',
  deduplicate:
    'Remove duplicate or overlapping entries and merge materially similar guidance into cleaner canonical wording.',
  classify:
    'Improve categories, tags, and applicability classifications using evidence already present in the item.',
  strengthen:
    'Improve clarity, precision, and practical QA usefulness while preserving the original intent and boundaries.',
  generateStarterDataset:
    'Produce a clean starter-quality version of the item that is generic, reusable, and suitable for future dataset bootstrapping.',
};

export function buildRefinementPrompt(options: {
  itemType: ApiDatasetItemType;
  mode: ApiRefinementMode;
  payload: Record<string, unknown>;
  payloadSchema: ZodTypeAny;
  resultSchema: ZodTypeAny;
}) {
  const definition = getDatasetEntityDefinition(options.itemType);
  const payloadSchemaJson = JSON.stringify(
    zodToJsonSchema(options.payloadSchema as any, {
      name: `${options.itemType}_payload`,
      effectStrategy: 'any',
    }),
    null,
    2,
  );
  const resultSchemaJson = JSON.stringify(
    zodToJsonSchema(options.resultSchema as any, {
      name: `${options.itemType}_refinement_result`,
      effectStrategy: 'any',
    }),
    null,
    2,
  );

  return [
    {
      role: 'system' as const,
      content: [
        'You are refining structured QA dataset records for an internal dataset workbench.',
        'Return valid JSON only.',
        'Preserve the original intent and schema boundaries.',
        'Do not invent domain-specific business rules unless they are clearly inferable from the input.',
        'Prefer generic, reusable QA patterns suitable for future automated test-case generation foundations.',
      ].join('\n'),
    },
    {
      role: 'user' as const,
      content: [
        `Item type: ${definition.label}`,
        `Refinement mode: ${options.mode}`,
        `Mode objective: ${modeGuidance[options.mode]}`,
        '',
        'Payload schema for refinedData:',
        payloadSchemaJson,
        '',
        'Full response schema that must be returned:',
        resultSchemaJson,
        '',
        'Current item payload:',
        JSON.stringify(options.payload, null, 2),
        '',
        'Instructions:',
        '1. Keep the refinedData object fully compatible with the provided payload schema.',
        '2. Preserve original intent unless the input is contradictory or clearly malformed.',
        '3. Avoid unnecessary invention; prefer omission over fabrication.',
        '4. Use concise, enterprise-friendly language.',
        '4a. When standard reusable test cases are present, keep them as review-ready sentence-style baselines and improve them without collapsing their coverage breadth.',
        '5. Provide a confidence score from 0 to 1 and a short changeSummary list explaining the meaningful changes.',
      ].join('\n'),
    },
  ];
}
