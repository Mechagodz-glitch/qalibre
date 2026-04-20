import { zodToJsonSchema } from 'zod-to-json-schema';
import type { ZodTypeAny } from 'zod';

import type { CoverageBatchDirective, CoveragePlan } from './coverage-planner.js';
import type { ApiGenerationMode } from './generation.schemas.js';
import type { PreparedSourceInput } from './source-parser.js';

const modeInstructions: Record<ApiGenerationMode, string> = {
  processAlpha:
    'Infer components, feature types, scenarios, integrations, and likely high-value test coverage from the provided source-of-truth materials plus the approved QA knowledge base.',
  processBeta:
    'Generate a strong, standardized test case set primarily from the user-selected knowledge-base items, using any supplied source materials only to sharpen scope and terminology.',
  manualRecovery:
    'Recover from a rejected draft by preserving valid existing knowledge, tightening weak areas, and returning a stronger reviewed-ready test case set.',
};

const screenSizeResolutionMap: Record<string, string> = {
  mobile: '390 x 844 px',
  tablet: '768 x 1024 px',
  laptop: '1366 x 768 px',
  desktop: '1920 x 1080 px',
  '4K TV': '3840 x 2160 px',
};

function compactPromptText(value: string, maxLength = 7_000) {
  const normalized = value.replace(/\r\n/g, '\n').trim();
  if (normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function buildScreenSizePromptDetails(generationOptions: Record<string, unknown>) {
  const rawScreenSizes = Array.isArray(generationOptions.screenSizes) ? generationOptions.screenSizes : [];
  const resolved = rawScreenSizes
    .map((value) => String(value ?? '').trim())
    .filter(Boolean)
    .map((value) => ({
      label: value,
      resolution: screenSizeResolutionMap[value] ?? null,
    }));

  return {
    generationOptionsForPrompt: {
      ...generationOptions,
      screenSizes: resolved.map((entry) =>
        entry.resolution ? `${entry.label} (${entry.resolution})` : entry.label,
      ),
    },
    screenSizeGuidance: resolved.length
      ? `Selected screen sizes with required tester-visible resolutions:\n${JSON.stringify(resolved)}`
      : null,
  };
}

export function buildTestGenerationPrompt(options: {
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
  resultSchema: ZodTypeAny;
  batchContext?: {
    batchIndex: number;
    totalBatches: number;
    requestedCaseCount: number;
    existingCaseTitles: string[];
    lockedContext?: Record<string, unknown>;
    batchDirective?: CoverageBatchDirective;
  };
}) {
  const resultSchemaJson = JSON.stringify(
    zodToJsonSchema(options.resultSchema as any, {
      name: 'test_case_generation_result',
      effectStrategy: 'any',
    }),
  );
  const { generationOptionsForPrompt, screenSizeGuidance } = buildScreenSizePromptDetails(options.generationOptions);
  const baseContent: Array<Record<string, unknown>> = [
    {
      type: 'input_text',
      text: [
        `Generation title: ${options.title}`,
        options.description ? `Generation description: ${options.description}` : null,
        `Mode: ${options.mode}`,
        `Mode objective: ${modeInstructions[options.mode]}`,
        options.suiteScope?.path ? `Suite path: ${options.suiteScope.path}` : null,
        options.suiteScope?.featureName ? `Feature-scoped generation target: ${options.suiteScope.featureName}` : null,
        options.batchContext
          ? `Batch: ${options.batchContext.batchIndex} of ${options.batchContext.totalBatches}`
          : null,
        options.batchContext
          ? `Batch objective: generate up to ${options.batchContext.requestedCaseCount} additional unique test cases that close uncovered feature, state, and scenario gaps without duplicating previously generated coverage.`
          : null,
        '',
        'Critical instructions:',
        '1. Supporting documents, stories, PRDs, mockups, screenshots, and other supplied materials are the source of truth.',
        '2. Use the QA knowledge base to infer reusable coverage, terminology, component behaviors, and scenario depth.',
        '3. If sources conflict with the knowledge base, follow the provided sources and note the conflict in gaps or assumptions.',
        '3a. When a component knowledge-base record includes standard test cases, treat them as reusable baseline coverage for that component.',
        '3b. Adapt those baseline cases to the exact page context, labels, filters, and widgets shown in the supplied sources instead of copying them verbatim.',
        '3c. Expand those baseline cases with source-specific behaviors, edge cases, and integration checks that are evident from the supplied materials.',
        '3d. Do not import unrelated dashboard components from loosely relevant knowledge-base records. If a widget, card, toggle, chart, matrix, or calculator is not directly named or strongly implied by the supplied sources, leave it out and record uncertainty in gaps.',
        '4. Prefer complete, standardized, reviewable manual test cases over vague scenario bullets.',
        '5. Do not invent business rules that are not evident from the source materials or clearly implied by reusable QA patterns.',
        '6. Cover happy path, negative, edge, and non-functional concerns when requested.',
        '7. Return valid JSON only and conform exactly to the provided schema.',
        '8. Generate as many test cases as needed to cover the explicit features, states, filters, workflows, calculations, edge cases, and requested non-functional concerns in the provided evidence, up to the system safety limit. Avoid filler and duplication.',
        options.suiteScope?.featureName
          ? `8a. Feature scope is active for "${options.suiteScope.featureName}". Generate cases only for that feature. Do not add unrelated page-area coverage outside this feature unless the source shows a direct dependency required to exercise it.`
          : null,
        '9. Use industry-standard naming: every test case title must start with "Verify".',
        '10. Structure the suite feature-wise: group related cases under a concrete product feature or section, and keep feature labels reusable and stable across related cases.',
        '11. Use the scenario field for a specific behavior cluster, not a generic label. Good scenarios are like "Default selection behavior", "Date range boundary handling", "Widget refresh after filter change", or "Popover drilldown navigation". Avoid vague scenario names like "Validation", "Workflow test", or "Functionality check".',
        '12. Each title must be descriptive enough to stand alone without relying on the objective field for basic context, but keep it readable. Prefer one clear feature/widget plus one clear behavior. Avoid repeating the feature, scenario, unit id, or structural metadata inside the title.',
        '13. Mirror industry-standard manual test case writing: specific feature, specific scenario, direct action, direct expected result, and review-ready wording.',
        '14. Strive for near-complete coverage of every explicitly described feature, filter, widget, drilldown, state, and requested non-functional dimension. If the evidence is insufficient, record the limitation in gaps instead of inventing behavior.',
        '15. Keep each test case concise and standardized: usually 4-6 steps, short preconditions, short test data, and short notes.',
        '16. Keep inferred lists compact. Usually return no more than 8-12 items for components, feature types, rule packs, assumptions, gaps, and coverage summary unless the source truly requires more.',
        options.batchContext
          ? '17. This is a continuation batch. Every new test case must be materially distinct from the previously generated case titles and scenarios.'
          : null,
        '18. Do not summarize a rich dashboard into a small generic testcase set. Every identified unit must be treated independently.',
        '19. Do not stop after happy path coverage. Include negative, edge, boundary, empty, loading, error, accessibility, usability, performance, resilience, regression, and consistency coverage where applicable.',
        '20. Every chart or widget must be covered independently. Include cross-widget consistency whenever filters or shared context exist.',
        '20a. Treat time-range controls, mode toggles, exclusion-window annotations, comments, notes, mentions, and watch-list behaviors as independent testable units whenever the evidence shows them.',
        '20b. For analytics pages that expose day-wise and cumulative modes, cover both views independently and validate that switching modes preserves the correct scope and refresh behavior.',
        '20c. Treat tile grids, tabbed visualization panels, carousels, record handoffs, section-level date overrides, and assistant drawers as independent units whenever the evidence shows them.',
        '20d. When counts, distributions, drilldowns, or summary splits are shown, include reconciliation coverage so totals, segments, and opened detail views stay consistent with the visible scope.',
        '20e. When supporting sources explicitly name dashboard sections, KPI cards, toggles, ranked lists, heat maps, split views, benchmark calculators, or comparison badges, treat each named section as its own coverage unit instead of collapsing it into a generic dashboard widget.',
        '20f. When the evidence includes formulas, previous-window deltas, threshold color bands, benchmark constants, role-based access rules, persistence requirements, or toggle-specific behavior, generate explicit validation for those rules rather than only generic rendering checks.',
        '21. Use tags to preserve grouping and validation metadata. Every test case must include these tags: `page-area:<value>`, `unit:<unit-id>`, `unit-type:<value>`, `scenario-type:<value>`, and `coverage-bucket:<value>`.',
        '22. Use the feature field as a stable page-area or component grouping label, not a vague product-wide label.',
        '23. Use linkedRulePacks to reflect the mapped rule packs for the covered unit. Use linkedComponents to name the specific widget/control/unit being covered.',
        '24. All user-provided features are mandatory coverage targets. Generate test cases for every user-provided feature even if the source material is sparse.',
        '25. Detected supplementary features from supporting sources should also receive coverage when the evidence supports them, but they must not displace mandatory user-provided features.',
        '26. Do not collapse multiple user-entered features into one generic testcase cluster. Preserve clear feature-wise or unit-wise separation.',
        '27. Order the final suite feature-wise. Within each feature, place functional or primary behavior coverage first, then edge and boundary cases, then negative scenarios, then the remaining state, accessibility, usability, performance, regression, and resilience coverage.',
        '27a. Complete one feature cluster before moving to the next. Do not alternate between unrelated features once a feature section has started.',
        '28. Use priority only when it is justified by business or workflow impact. If unsure, prefer P2 over extreme values.',
        '29. When screen sizes are selected, explicitly mention the exact screen size label and resolution inside the generated testcase content so the tester knows the execution target. Use the objective, steps, notes, or test data if needed. Example: "Validate layout on 4K TV (3840 x 2160 px)".',
        options.suiteScope?.featureName
          ? '29a. If screen sizes are selected in feature scope, keep responsiveness validation constrained to the selected feature only. Do not append page-wide responsiveness cases.'
          : '29a. If screen sizes are selected, reserve the final suite section for overall page responsiveness coverage, with clear page-level responsiveness validation for each selected screen size.',
        '',
        'Requested generation options:',
        JSON.stringify(generationOptionsForPrompt),
        screenSizeGuidance,
        options.coveragePlan
          ? `Mandatory user-provided features:\n${JSON.stringify(
              options.coveragePlan.userFeatures.map((feature) => ({
                name: feature.displayName,
                normalizedName: feature.normalizedName,
                relatedUnitIds: feature.relatedUnitIds,
              })),
            )}`
          : null,
        options.coveragePlan
          ? `Detected supplementary features:\n${JSON.stringify(
              options.coveragePlan.detectedFeatures.map((feature) => ({
                name: feature.displayName,
                normalizedName: feature.normalizedName,
                relatedUnitIds: feature.relatedUnitIds,
              })),
            )}`
          : null,
        options.coveragePlan ? `Coverage plan:\n${JSON.stringify(options.coveragePlan)}` : null,
        options.batchContext?.batchDirective
          ? `Current batch directive:\n${JSON.stringify(options.batchContext.batchDirective)}`
          : null,
        options.batchContext && options.batchContext.existingCaseTitles.length > 0
          ? `Previously generated case titles:\n${options.batchContext.existingCaseTitles.join('\n')}`
          : null,
        options.batchContext?.lockedContext
          ? `Locked suite context to preserve unless the sources strongly contradict it:\n${JSON.stringify(
              options.batchContext.lockedContext,
            )}`
          : null,
        '',
        'Knowledge base context:',
        JSON.stringify(options.knowledgeBaseContext),
        '',
        'Required generation sequence:',
        '1. Review the provided page units, mapped rule packs, required scenario types, and quota expectations.',
        '2. Review mandatory user-provided features first, then supplementary detected features.',
        '3. Focus only on the current batch directive while preserving overall suite coherence.',
        '4. Expand scenario candidates for each focus unit across the required categories.',
        '5. Generate detailed, review-ready test cases only after unit decomposition is satisfied.',
        '',
        'Response schema:',
        resultSchemaJson,
      ]
        .filter(Boolean)
        .join('\n'),
    },
  ];

  const sourceBlocks = options.sourceInputs.flatMap((source, index) => {
    const blocks: Array<Record<string, unknown>> = [
      {
        type: 'input_text',
        text: [
          `Source ${index + 1}`,
          `Kind: ${source.kind}`,
          `Label: ${source.label}`,
          source.filename ? `Filename: ${source.filename}` : null,
          source.mimeType ? `Mime type: ${source.mimeType}` : null,
          source.url ? `URL: ${source.url}` : null,
          source.notes ? `Notes: ${source.notes}` : null,
          `Parse status: ${source.parseStatus}`,
          source.contentText
            ? `Extracted content:\n${compactPromptText(source.contentText)}`
            : 'No extractable text was available for this source.',
        ]
          .filter(Boolean)
          .join('\n'),
      },
    ];

    if (source.imageDataUrl) {
      blocks.push({
        type: 'input_image',
        image_url: source.imageDataUrl,
      });
    }

    return blocks;
  });

  return [
    {
      role: 'system' as const,
      content: [
        {
          type: 'input_text',
          text: [
            'You generate standardized QA test cases for an internal test case generation workbench.',
            'You are not writing automation code.',
            'You are producing review-ready manual test cases backed by supplied product sources and an internal QA knowledge base.',
          ].join('\n'),
        },
      ],
    },
    {
      role: 'user' as const,
      content: [...baseContent, ...sourceBlocks],
    },
  ];
}
