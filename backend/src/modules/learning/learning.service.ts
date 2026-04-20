import {
  DatasetItemType,
  DatasetStatus,
  DraftReviewStatus,
  KnowledgeScopeLevel,
  KnowledgeSuggestionStatus,
  KnowledgeSuggestionTargetType,
  KnowledgeSuggestionType,
  Prisma,
  RefinementMode,
} from '@prisma/client';

import { prisma } from '../../db/prisma.js';
import { buildDiffSummary } from '../../lib/diff.js';
import { conflict, notFound } from '../../lib/errors.js';
import { toPrismaJson } from '../../lib/json.js';
import { slugify } from '../../lib/slug.js';
import { createDatasetItem } from '../datasets/dataset.service.js';
import { parsePayloadForItemType } from '../datasets/dataset.mapper.js';
import { getDatasetEntityDefinition, toApiDatasetItemType } from '../datasets/dataset.registry.js';
import type { ApiDatasetItemType } from '../datasets/dataset.schemas.js';
import { approveRefinementDraft } from '../refinement/refinement.service.js';
import { coverageAnalysisSchema, type CoverageAnalysis } from '../test-generation/generation.schemas.js';
import type { KnowledgeSuggestionQuery } from './learning.schemas.js';

type SuggestionTargetType = 'projectMemory' | 'componentCatalogue' | 'scenarioTemplate' | 'rulePack';

function toDbScopeLevel(scopeLevel?: 'project' | 'module' | 'page' | null) {
  switch (scopeLevel) {
    case 'project':
      return KnowledgeScopeLevel.PROJECT;
    case 'module':
      return KnowledgeScopeLevel.MODULE;
    case 'page':
      return KnowledgeScopeLevel.PAGE;
    default:
      return null;
  }
}

function toApiScopeLevel(scopeLevel?: KnowledgeScopeLevel | null) {
  switch (scopeLevel) {
    case KnowledgeScopeLevel.PROJECT:
      return 'project' as const;
    case KnowledgeScopeLevel.MODULE:
      return 'module' as const;
    case KnowledgeScopeLevel.PAGE:
      return 'page' as const;
    default:
      return null;
  }
}

function dedupeStrings(values: string[]) {
  const seen = new Set<string>();
  const deduped: string[] = [];
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
    deduped.push(normalized);
  }
  return deduped;
}

type CoverageGapSignal = {
  kind: 'feature' | 'bucket' | 'unit' | 'scenario_type';
  key: string;
  label: string;
  title: string;
  feature: string;
  linkedComponents: string[];
  knownRule: string;
  riskNote: string;
};

function asStringList(value: unknown) {
  return Array.isArray(value) ? dedupeStrings(value.map((entry) => String(entry ?? ''))) : [];
}

function parseCoverageAnalysis(value: unknown): CoverageAnalysis | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }

  const parsed = coverageAnalysisSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function collectCoverageGapSignals(analysis: CoverageAnalysis) {
  const signals = new Map<string, CoverageGapSignal>();
  const pushSignal = (signal: CoverageGapSignal) => {
    if (!signal.label.trim() || signals.has(signal.key)) {
      return;
    }
    signals.set(signal.key, signal);
  };

  for (const feature of analysis.missingRequestedFeatures) {
    const label = String(feature ?? '').trim();
    if (!label) {
      continue;
    }
    pushSignal({
      kind: 'feature',
      key: `feature:${slugify(label) || 'unknown-feature'}`,
      label,
      title: `Verify that ${label} coverage is included for this page.`,
      feature: label,
      linkedComponents: [],
      knownRule: `Explicitly include coverage for ${label} whenever this page or feature set is generated.`,
      riskNote: `Coverage analysis repeatedly flagged ${label} as a missing requested feature.`,
    });
  }

  for (const bucket of analysis.missingBuckets) {
    const label = String(bucket.label ?? bucket.key ?? '').trim();
    if (!label) {
      continue;
    }
    pushSignal({
      kind: 'bucket',
      key: `bucket:${slugify(label) || 'unknown-bucket'}`,
      label,
      title: `Verify that ${label} scenarios are covered for this page.`,
      feature: label,
      linkedComponents: [],
      knownRule: `Future generation should explicitly add ${label} scenarios when this page is in scope.`,
      riskNote: `Coverage analysis repeatedly marked ${label} as a weak scenario bucket.`,
    });
  }

  for (const unit of analysis.underCoveredUnits) {
    const label = String(unit.label ?? unit.key ?? '').trim();
    if (!label) {
      continue;
    }
    pushSignal({
      kind: 'unit',
      key: `unit:${slugify(label) || 'unknown-unit'}`,
      label,
      title: `Verify that ${label} behavior is covered across expected scenarios.`,
      feature: label,
      linkedComponents: [label],
      knownRule: `Future generation should strengthen coverage for ${label} across the expected scenario set.`,
      riskNote: `Coverage analysis repeatedly marked ${label} as under-covered.`,
    });
  }

  for (const unit of analysis.missingScenarioTypesByUnit) {
    const label = String(unit.label ?? unit.key ?? '').trim();
    if (!label || !unit.missingScenarioTypes.length) {
      continue;
    }

    for (const scenarioType of unit.missingScenarioTypes) {
      const scenarioLabel = String(scenarioType ?? '').trim();
      if (!scenarioLabel) {
        continue;
      }
      pushSignal({
        kind: 'scenario_type',
        key: `scenario:${slugify(label) || 'unit'}:${slugify(scenarioLabel) || 'scenario'}`,
        label: `${label} - ${scenarioLabel}`,
        title: `Verify that ${scenarioLabel} scenarios are covered for ${label}.`,
        feature: label,
        linkedComponents: [label],
        knownRule: `Future generation should include ${scenarioLabel} coverage for ${label}.`,
        riskNote: `Coverage analysis repeatedly flagged missing ${scenarioLabel} scenarios for ${label}.`,
      });
    }
  }

  return [...signals.values()];
}

function buildCoverageGapFingerprintScope(input: {
  projectId?: string | null;
  moduleId?: string | null;
  pageId?: string | null;
}) {
  return input.pageId ?? input.moduleId ?? input.projectId ?? 'global';
}

function coverageGapScopeLevel(input: {
  projectId?: string | null;
  moduleId?: string | null;
  pageId?: string | null;
}) {
  if (input.pageId) {
    return 'page' as const;
  }
  if (input.moduleId) {
    return 'module' as const;
  }
  if (input.projectId) {
    return 'project' as const;
  }
  return null;
}

function scopeSummary(entity?: { id: string; name: string } | null) {
  return entity ? { id: entity.id, name: entity.name } : null;
}

function toSuggestionResponse(
  suggestion: Prisma.KnowledgeSuggestionGetPayload<{
    include: {
      targetDatasetItem: true;
      appliedDatasetItem: true;
      project: { select: { id: true; name: true } };
      module: { select: { id: true; name: true } };
      page: { select: { id: true; name: true } };
    };
  }>,
) {
  return {
    id: suggestion.id,
    type: suggestion.type === KnowledgeSuggestionType.TESTCASE_PROMOTION ? 'testcasePromotion' : 'autoStrengthening',
    targetType: (suggestion.targetType.charAt(0).toLowerCase() +
      suggestion.targetType.slice(1).toLowerCase().replace(/_(\w)/g, (_, token: string) => token.toUpperCase())) as SuggestionTargetType,
    triggerType: suggestion.triggerType,
    status:
      suggestion.status === KnowledgeSuggestionStatus.PENDING
        ? 'pending'
        : suggestion.status === KnowledgeSuggestionStatus.APPROVED
          ? 'approved'
          : suggestion.status === KnowledgeSuggestionStatus.REJECTED
            ? 'rejected'
            : 'applied',
    title: suggestion.title,
    summary: suggestion.summary ?? null,
    rationale: suggestion.rationale ?? null,
    evidence:
      suggestion.evidence && typeof suggestion.evidence === 'object'
        ? (suggestion.evidence as Record<string, unknown>)
        : {},
    proposedPayload:
      suggestion.proposedPayload && typeof suggestion.proposedPayload === 'object'
        ? (suggestion.proposedPayload as Record<string, unknown>)
        : {},
    sourceDraftId: suggestion.sourceDraftId ?? null,
    sourceRunId: suggestion.sourceRunId ?? null,
    sourceCaseId: suggestion.sourceCaseId ?? null,
    targetDatasetItemId: suggestion.targetDatasetItemId ?? null,
    targetDatasetItemTitle: suggestion.targetDatasetItem?.title ?? null,
    targetDatasetItemType: suggestion.targetDatasetItem ? toApiDatasetItemType(suggestion.targetDatasetItem.itemType) : null,
    project: scopeSummary(suggestion.project),
    module: scopeSummary(suggestion.module),
    page: scopeSummary(suggestion.page),
    scopeLevel: toApiScopeLevel(suggestion.scopeLevel),
    reviewerNotes: suggestion.reviewerNotes ?? null,
    reviewedAt: suggestion.reviewedAt?.toISOString() ?? null,
    reviewedBy: suggestion.reviewedBy ?? null,
    approvedAt: suggestion.approvedAt?.toISOString() ?? null,
    approvedBy: suggestion.approvedBy ?? null,
    appliedAt: suggestion.appliedAt?.toISOString() ?? null,
    appliedBy: suggestion.appliedBy ?? null,
    appliedDatasetItemId: suggestion.appliedDatasetItemId ?? null,
    appliedDatasetItemTitle: suggestion.appliedDatasetItem?.title ?? null,
    appliedRefinementRunId: suggestion.appliedRefinementRunId ?? null,
    appliedRefinementDraftId: suggestion.appliedRefinementDraftId ?? null,
    createdAt: suggestion.createdAt.toISOString(),
    updatedAt: suggestion.updatedAt.toISOString(),
  };
}

function targetTypeToApiItemType(targetType: SuggestionTargetType): ApiDatasetItemType {
  return targetType;
}

function targetTypeToDbTarget(targetType: SuggestionTargetType) {
  switch (targetType) {
    case 'projectMemory':
      return KnowledgeSuggestionTargetType.PROJECT_MEMORY;
    case 'componentCatalogue':
      return KnowledgeSuggestionTargetType.COMPONENT_CATALOGUE;
    case 'scenarioTemplate':
      return KnowledgeSuggestionTargetType.SCENARIO_TEMPLATE;
    case 'rulePack':
      return KnowledgeSuggestionTargetType.RULE_PACK;
  }
}

async function findScopedProjectMemoryTarget(input: {
  projectId?: string | null;
  moduleId?: string | null;
  pageId?: string | null;
}) {
  if (input.pageId) {
    const pageItem = await prisma.datasetItem.findFirst({
      where: {
        itemType: DatasetItemType.PROJECT_MEMORY,
        status: DatasetStatus.APPROVED,
        pageId: input.pageId,
      },
    });
    if (pageItem) {
      return pageItem;
    }
  }

  if (input.moduleId) {
    const moduleItem = await prisma.datasetItem.findFirst({
      where: {
        itemType: DatasetItemType.PROJECT_MEMORY,
        status: DatasetStatus.APPROVED,
        moduleId: input.moduleId,
        pageId: null,
      },
    });
    if (moduleItem) {
      return moduleItem;
    }
  }

  if (input.projectId) {
    return prisma.datasetItem.findFirst({
      where: {
        itemType: DatasetItemType.PROJECT_MEMORY,
        status: DatasetStatus.APPROVED,
        projectId: input.projectId,
        moduleId: null,
        pageId: null,
      },
    });
  }

  return null;
}

async function findNamedDatasetTarget(itemType: ApiDatasetItemType, preferredNames: string[]) {
  const definition = getDatasetEntityDefinition(itemType);
  const names = dedupeStrings(preferredNames);
  for (const name of names) {
    const target = await prisma.datasetItem.findFirst({
      where: {
        itemType: definition.dbType,
        status: DatasetStatus.APPROVED,
        OR: [{ title: { equals: name, mode: 'insensitive' } }, { summary: { contains: name, mode: 'insensitive' } }],
      },
    });
    if (target) {
      return target;
    }
  }
  return null;
}

function mergeStringArrayField(existing: unknown, incoming: unknown) {
  return dedupeStrings([...asStringList(existing), ...asStringList(incoming)]);
}

function mergeSuggestedPayload(
  targetType: SuggestionTargetType,
  existingPayload: Record<string, unknown> | null,
  proposedPayload: Record<string, unknown>,
) {
  if (!existingPayload) {
    return proposedPayload;
  }

  switch (targetType) {
    case 'projectMemory':
      return {
        ...existingPayload,
        name: String(existingPayload.name ?? proposedPayload.name ?? 'Project Memory').trim(),
        overview: String(proposedPayload.overview ?? existingPayload.overview ?? '').trim(),
        businessTerminology: mergeStringArrayField(existingPayload.businessTerminology, proposedPayload.businessTerminology),
        workflows: mergeStringArrayField(existingPayload.workflows, proposedPayload.workflows),
        widgetRelationships: mergeStringArrayField(existingPayload.widgetRelationships, proposedPayload.widgetRelationships),
        knownRules: mergeStringArrayField(existingPayload.knownRules, proposedPayload.knownRules),
        knownRisks: mergeStringArrayField(existingPayload.knownRisks, proposedPayload.knownRisks),
        goldenScenarios: mergeStringArrayField(existingPayload.goldenScenarios, proposedPayload.goldenScenarios),
        exclusions: mergeStringArrayField(existingPayload.exclusions, proposedPayload.exclusions),
        linkedReusableComponents: mergeStringArrayField(
          existingPayload.linkedReusableComponents,
          proposedPayload.linkedReusableComponents,
        ),
        tags: mergeStringArrayField(existingPayload.tags, proposedPayload.tags),
      };
    case 'componentCatalogue':
      return {
        ...existingPayload,
        standardTestCases: mergeStringArrayField(existingPayload.standardTestCases, proposedPayload.standardTestCases),
        commonRisks: mergeStringArrayField(existingPayload.commonRisks, proposedPayload.commonRisks),
        smokeScenarios: mergeStringArrayField(existingPayload.smokeScenarios, proposedPayload.smokeScenarios),
        functionalScenarios: mergeStringArrayField(existingPayload.functionalScenarios, proposedPayload.functionalScenarios),
        negativeScenarios: mergeStringArrayField(existingPayload.negativeScenarios, proposedPayload.negativeScenarios),
        edgeScenarios: mergeStringArrayField(existingPayload.edgeScenarios, proposedPayload.edgeScenarios),
        notes: String(existingPayload.notes ?? proposedPayload.notes ?? '').trim(),
        tags: mergeStringArrayField(existingPayload.tags, proposedPayload.tags),
      };
    case 'scenarioTemplate':
      return {
        ...existingPayload,
        description: String(proposedPayload.description ?? existingPayload.description ?? '').trim(),
        preconditionPattern: String(
          proposedPayload.preconditionPattern ?? existingPayload.preconditionPattern ?? '',
        ).trim(),
        stepPattern: String(proposedPayload.stepPattern ?? existingPayload.stepPattern ?? '').trim(),
        expectedResultPattern: String(
          proposedPayload.expectedResultPattern ?? existingPayload.expectedResultPattern ?? '',
        ).trim(),
        examples: mergeStringArrayField(existingPayload.examples, proposedPayload.examples),
        tags: mergeStringArrayField(existingPayload.tags, proposedPayload.tags),
      };
    case 'rulePack':
      return {
        ...existingPayload,
        description: String(proposedPayload.description ?? existingPayload.description ?? '').trim(),
        mandatoryScenarios: mergeStringArrayField(existingPayload.mandatoryScenarios, proposedPayload.mandatoryScenarios),
        negativeHeuristics: mergeStringArrayField(existingPayload.negativeHeuristics, proposedPayload.negativeHeuristics),
        edgeHeuristics: mergeStringArrayField(existingPayload.edgeHeuristics, proposedPayload.edgeHeuristics),
        performanceHeuristics: mergeStringArrayField(existingPayload.performanceHeuristics, proposedPayload.performanceHeuristics),
        accessibilityHeuristics: mergeStringArrayField(existingPayload.accessibilityHeuristics, proposedPayload.accessibilityHeuristics),
        tags: mergeStringArrayField(existingPayload.tags, proposedPayload.tags),
      };
  }
}

async function createSyntheticRefinementAndApprove(input: {
  actor: string;
  notes?: string;
  targetItem: Prisma.DatasetItemGetPayload<{}>;
  suggestionId: string;
  refinedPayload: Record<string, unknown>;
}) {
  const apiItemType = toApiDatasetItemType(input.targetItem.itemType);
  const originalPayload = parsePayloadForItemType<Record<string, unknown>>(apiItemType, input.targetItem.data);
  const diffSummary = buildDiffSummary(originalPayload, input.refinedPayload);

  const created = await prisma.$transaction(async (transaction) => {
    const run = await transaction.refinementRun.create({
      data: {
        itemType: input.targetItem.itemType,
        itemId: input.targetItem.id,
        mode: RefinementMode.STRENGTHEN,
        model: 'learning-suggestion',
        requestPayload: toPrismaJson({
          source: 'learning-suggestion',
          suggestionId: input.suggestionId,
          itemType: apiItemType,
        }),
        rawResponse: toPrismaJson({
          source: 'learning-suggestion',
          suggestionId: input.suggestionId,
        }),
        parsedResponse: toPrismaJson({
          refinedData: input.refinedPayload,
          changeSummary: ['Applied approved learning suggestion.'],
        }),
        status: 'COMPLETED',
        correlationId: `learning:${input.suggestionId}`,
      },
    });

    const draft = await transaction.refinementDraft.create({
      data: {
        runId: run.id,
        itemType: input.targetItem.itemType,
        itemId: input.targetItem.id,
        originalData: toPrismaJson(originalPayload),
        refinedData: toPrismaJson(input.refinedPayload),
        diffSummary: toPrismaJson({
          ...diffSummary,
          aiSummary: ['Applied approved learning suggestion.'],
        }),
        confidence: 0.84,
      },
    });

    return { run, draft };
  });

  const approved = await approveRefinementDraft(created.draft.id, input.actor, input.notes);
  return {
    runId: created.run.id,
    draftId: created.draft.id,
    itemId: approved.item.id,
    itemTitle: approved.item.title,
  };
}

async function markFeedbackLearningConsumed(feedbackIds: string[]) {
  if (!feedbackIds.length) {
    return;
  }

  await prisma.testCaseFeedback.updateMany({
    where: {
      id: {
        in: feedbackIds,
      },
    },
    data: {
      usedForLearning: true,
    },
  });
}

export async function createKnowledgeSuggestionIfAbsent(input: {
  type: 'testcasePromotion' | 'autoStrengthening';
  targetType: SuggestionTargetType;
  triggerType: string;
  fingerprint: string;
  title: string;
  summary?: string | null;
  rationale?: string | null;
  evidence: Record<string, unknown>;
  proposedPayload: Record<string, unknown>;
  sourceDraftId?: string | null;
  sourceRunId?: string | null;
  sourceCaseId?: string | null;
  targetDatasetItemId?: string | null;
  projectId?: string | null;
  moduleId?: string | null;
  pageId?: string | null;
  scopeLevel?: 'project' | 'module' | 'page' | null;
  createdBy: string;
}) {
  const existing = await prisma.knowledgeSuggestion.findFirst({
    where: {
      fingerprint: input.fingerprint,
      status: {
        in: [KnowledgeSuggestionStatus.PENDING, KnowledgeSuggestionStatus.APPROVED, KnowledgeSuggestionStatus.APPLIED],
      },
    },
    include: {
      targetDatasetItem: true,
      appliedDatasetItem: true,
      project: { select: { id: true, name: true } },
      module: { select: { id: true, name: true } },
      page: { select: { id: true, name: true } },
    },
  });

  if (existing) {
    return { suggestion: toSuggestionResponse(existing), created: false };
  }

  const created = await prisma.knowledgeSuggestion.create({
    data: {
      type: input.type === 'testcasePromotion' ? KnowledgeSuggestionType.TESTCASE_PROMOTION : KnowledgeSuggestionType.AUTO_STRENGTHENING,
      targetType: targetTypeToDbTarget(input.targetType),
      triggerType: input.triggerType,
      fingerprint: input.fingerprint,
      title: input.title,
      summary: input.summary ?? null,
      rationale: input.rationale ?? null,
      evidence: toPrismaJson(input.evidence),
      proposedPayload: toPrismaJson(input.proposedPayload),
      sourceDraftId: input.sourceDraftId ?? null,
      sourceRunId: input.sourceRunId ?? null,
      sourceCaseId: input.sourceCaseId ?? null,
      targetDatasetItemId: input.targetDatasetItemId ?? null,
      projectId: input.projectId ?? null,
      moduleId: input.moduleId ?? null,
      pageId: input.pageId ?? null,
      scopeLevel: toDbScopeLevel(input.scopeLevel),
      createdBy: input.createdBy,
    },
    include: {
      targetDatasetItem: true,
      appliedDatasetItem: true,
      project: { select: { id: true, name: true } },
      module: { select: { id: true, name: true } },
      page: { select: { id: true, name: true } },
    },
  });

  return { suggestion: toSuggestionResponse(created), created: true };
}

export async function listKnowledgeSuggestions(query: KnowledgeSuggestionQuery) {
  const where: Prisma.KnowledgeSuggestionWhereInput = {
    ...(query.status
      ? {
          status: query.status.toUpperCase() as KnowledgeSuggestionStatus,
        }
      : {}),
    ...(query.type
      ? {
          type: query.type === 'testcasePromotion' ? KnowledgeSuggestionType.TESTCASE_PROMOTION : KnowledgeSuggestionType.AUTO_STRENGTHENING,
        }
      : {}),
    ...(query.targetType
      ? {
          targetType: targetTypeToDbTarget(query.targetType),
        }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.knowledgeSuggestion.findMany({
      where,
      include: {
        targetDatasetItem: true,
        appliedDatasetItem: true,
        project: { select: { id: true, name: true } },
        module: { select: { id: true, name: true } },
        page: { select: { id: true, name: true } },
      },
      orderBy: [{ createdAt: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.knowledgeSuggestion.count({ where }),
  ]);

  return {
    items: items.map(toSuggestionResponse),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalPages: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

export async function rejectKnowledgeSuggestion(suggestionId: string, actor: string, notes?: string) {
  const suggestion = await prisma.knowledgeSuggestion.findUnique({
    where: { id: suggestionId },
    include: {
      targetDatasetItem: true,
      appliedDatasetItem: true,
      project: { select: { id: true, name: true } },
      module: { select: { id: true, name: true } },
      page: { select: { id: true, name: true } },
    },
  });

  if (!suggestion) {
    throw notFound('Learning suggestion not found.');
  }

  if (suggestion.status !== KnowledgeSuggestionStatus.PENDING) {
    throw conflict('Only pending learning suggestions can be rejected.');
  }

  const updated = await prisma.knowledgeSuggestion.update({
    where: { id: suggestionId },
    data: {
      status: KnowledgeSuggestionStatus.REJECTED,
      reviewerNotes: notes ?? null,
      reviewedAt: new Date(),
      reviewedBy: actor,
    },
    include: {
      targetDatasetItem: true,
      appliedDatasetItem: true,
      project: { select: { id: true, name: true } },
      module: { select: { id: true, name: true } },
      page: { select: { id: true, name: true } },
    },
  });

  return { suggestion: toSuggestionResponse(updated) };
}

export async function approveKnowledgeSuggestion(suggestionId: string, actor: string, notes?: string) {
  const suggestion = await prisma.knowledgeSuggestion.findUnique({
    where: { id: suggestionId },
    include: {
      targetDatasetItem: true,
      project: { select: { id: true, name: true } },
      module: { select: { id: true, name: true } },
      page: { select: { id: true, name: true } },
    },
  });

  if (!suggestion) {
    throw notFound('Learning suggestion not found.');
  }

  if (suggestion.status !== KnowledgeSuggestionStatus.PENDING) {
    throw conflict('Only pending learning suggestions can be approved.');
  }

  const targetType = (suggestion.targetType.charAt(0).toLowerCase() +
    suggestion.targetType.slice(1).toLowerCase().replace(/_(\w)/g, (_, token: string) => token.toUpperCase())) as SuggestionTargetType;
  const proposedPayload =
    suggestion.proposedPayload && typeof suggestion.proposedPayload === 'object'
      ? (suggestion.proposedPayload as Record<string, unknown>)
      : {};

  let appliedDatasetItemId: string | null = null;
  let appliedRefinementRunId: string | null = null;
  let appliedRefinementDraftId: string | null = null;
  let itemResponse: Awaited<ReturnType<typeof createDatasetItem>> | null = null;

  if (suggestion.targetDatasetItemId) {
    const targetItem = await prisma.datasetItem.findUnique({
      where: { id: suggestion.targetDatasetItemId },
    });

    if (!targetItem) {
      throw notFound('The learning suggestion target record could not be found.');
    }

    const existingPayload = parsePayloadForItemType<Record<string, unknown>>(targetTypeToApiItemType(targetType), targetItem.data);
    const refinedPayload = mergeSuggestedPayload(targetType, existingPayload, proposedPayload);
    const applied = await createSyntheticRefinementAndApprove({
      actor,
      notes,
      targetItem,
      suggestionId,
      refinedPayload,
    });
    appliedDatasetItemId = applied.itemId;
    appliedRefinementRunId = applied.runId;
    appliedRefinementDraftId = applied.draftId;
  } else {
    itemResponse = await createDatasetItem(
      targetTypeToApiItemType(targetType),
      {
        payload: proposedPayload,
        status: 'approved',
        projectId: suggestion.projectId ?? undefined,
        moduleId: suggestion.moduleId ?? undefined,
        pageId: suggestion.pageId ?? undefined,
        scopeLevel: toApiScopeLevel(suggestion.scopeLevel) ?? undefined,
      },
      actor,
    );
    appliedDatasetItemId = itemResponse.id;
  }

  const updated = await prisma.knowledgeSuggestion.update({
    where: { id: suggestionId },
    data: {
      status: KnowledgeSuggestionStatus.APPLIED,
      reviewerNotes: notes ?? null,
      reviewedAt: new Date(),
      reviewedBy: actor,
      approvedAt: new Date(),
      approvedBy: actor,
      appliedAt: new Date(),
      appliedBy: actor,
      appliedDatasetItemId,
      appliedRefinementRunId,
      appliedRefinementDraftId,
    },
    include: {
      targetDatasetItem: true,
      appliedDatasetItem: true,
      project: { select: { id: true, name: true } },
      module: { select: { id: true, name: true } },
      page: { select: { id: true, name: true } },
    },
  });

  await triggerAutoStrengtheningForAppliedSuggestion(updated.id, actor);

  return {
    suggestion: toSuggestionResponse(updated),
    item: itemResponse ?? null,
  };
}

function buildProjectMemoryPayload(input: {
  name: string;
  overview: string;
  title: string;
  feature: string;
  linkedComponents: string[];
  knownRule?: string;
  riskNote?: string;
}) {
  return {
    name: input.name,
    overview: input.overview,
    businessTerminology: dedupeStrings([input.feature]),
    workflows: [] as string[],
    widgetRelationships: [] as string[],
    knownRules: dedupeStrings(input.knownRule ? [input.knownRule] : []),
    knownRisks: dedupeStrings(input.riskNote ? [input.riskNote] : []),
    goldenScenarios: dedupeStrings([input.title]),
    exclusions: [] as string[],
    linkedReusableComponents: dedupeStrings(input.linkedComponents),
    tags: dedupeStrings(['project-memory', ...input.linkedComponents.map((value) => slugify(value))]),
  };
}

export async function createPromotionSuggestionFromTestCase(input: {
  actor: string;
  draftId: string;
  runId: string;
  caseId: string;
  caseData: Record<string, unknown>;
  suiteContext: {
    projectId?: string | null;
    projectName?: string | null;
    moduleId?: string | null;
    moduleName?: string | null;
    pageId?: string | null;
    pageName?: string | null;
    path?: string | null;
  };
  targetType: SuggestionTargetType;
  notes?: string;
}) {
  const title = String(input.caseData.title ?? '').trim();
  const feature = String(input.caseData.feature ?? '').trim();
  const scenario = String(input.caseData.scenario ?? '').trim();
  const objective = String(input.caseData.objective ?? '').trim();
  const linkedComponents = asStringList(input.caseData.linkedComponents);
  const linkedRulePacks = asStringList(input.caseData.linkedRulePacks);
  const linkedTaxonomy = asStringList(input.caseData.linkedTaxonomy);

  const targetDatasetItem =
    input.targetType === 'projectMemory'
      ? await findScopedProjectMemoryTarget({
          projectId: input.suiteContext.projectId,
          moduleId: input.suiteContext.moduleId,
          pageId: input.suiteContext.pageId,
        })
      : await findNamedDatasetTarget(
          targetTypeToApiItemType(input.targetType),
          input.targetType === 'componentCatalogue'
            ? linkedComponents
            : input.targetType === 'rulePack'
              ? linkedRulePacks
              : [scenario || feature || title],
        );

  const scopeName =
    input.suiteContext.pageName?.trim() ||
    input.suiteContext.moduleName?.trim() ||
    input.suiteContext.projectName?.trim() ||
    'Project Memory';

  let proposedPayload: Record<string, unknown>;
  let rationale = '';

  switch (input.targetType) {
    case 'projectMemory':
      proposedPayload = buildProjectMemoryPayload({
        name: `${scopeName} QA Memory`,
        overview: objective || `Approved testcase promoted from ${input.suiteContext.path ?? scopeName}.`,
        title,
        feature,
        linkedComponents,
        knownRule: scenario ? `Ensure ${scenario}.` : undefined,
      });
      rationale = 'Promote this approved testcase into project-scoped reusable memory for future runs.';
      break;
    case 'componentCatalogue':
      proposedPayload = {
        name: linkedComponents[0] || feature || 'Reusable Component',
        category: 'Behavioral Pattern',
        description: objective || `Reusable testcase promoted from ${scopeName}.`,
        aliases: linkedComponents,
        variants: [] as string[],
        states: [] as string[],
        validations: [] as string[],
        commonActions: [] as string[],
        dependencies: [] as string[],
        commonRisks: [] as string[],
        applicableTestTypes: linkedTaxonomy,
        smokeScenarios: [] as string[],
        functionalScenarios: [] as string[],
        negativeScenarios: [] as string[],
        edgeScenarios: [] as string[],
        standardTestCases: dedupeStrings([title]),
        accessibilityObservations: [] as string[],
        notes: input.notes ?? '',
        tags: dedupeStrings(['promoted-testcase', ...linkedComponents.map((value) => slugify(value))]),
      };
      rationale = 'Promote this approved testcase into reusable component baseline coverage.';
      break;
    case 'scenarioTemplate':
      proposedPayload = {
        name: scenario || title,
        scenarioType: linkedTaxonomy[0] || 'Functional',
        description: objective || title,
        preconditionPattern: asStringList(input.caseData.preconditions)[0] ?? '',
        stepPattern:
          Array.isArray(input.caseData.steps) && input.caseData.steps.length > 0
            ? String((input.caseData.steps[0] as Record<string, unknown>).action ?? '')
            : '',
        expectedResultPattern:
          Array.isArray(input.caseData.steps) && input.caseData.steps.length > 0
            ? String((input.caseData.steps[0] as Record<string, unknown>).expectedResult ?? '')
            : '',
        tags: dedupeStrings(['promoted-testcase', slugify(scenario || title)]),
        examples: dedupeStrings([title]),
      };
      rationale = 'Promote this approved testcase into a reusable scenario template.';
      break;
    case 'rulePack':
      proposedPayload = {
        name: linkedRulePacks[0] || `${feature || scopeName} Rule Pack`,
        description: objective || title,
        appliesToFeatureTypes: feature ? [feature] : [],
        appliesToComponents: linkedComponents,
        mandatoryScenarios: dedupeStrings([title]),
        negativeHeuristics: [] as string[],
        edgeHeuristics: [] as string[],
        securityHeuristics: [] as string[],
        performanceHeuristics: [] as string[],
        accessibilityHeuristics: [] as string[],
        defaultPriority: String(input.caseData.priority ?? 'P2'),
        tags: dedupeStrings(['promoted-testcase', slugify(feature || scopeName)]),
      };
      rationale = 'Promote this approved testcase into reusable rule-pack coverage guidance.';
      break;
  }

  const fingerprint = [
    'promotion',
    input.targetType,
    targetDatasetItem?.id ?? input.suiteContext.pageId ?? input.suiteContext.moduleId ?? input.suiteContext.projectId ?? 'global',
    slugify(title) || 'testcase',
  ].join(':');

  return createKnowledgeSuggestionIfAbsent({
    type: 'testcasePromotion',
    targetType: input.targetType,
    triggerType: 'approved_testcase_promotion',
    fingerprint,
    title: `Promote testcase: ${title}`,
    summary: objective || null,
    rationale,
    evidence: {
      title,
      feature,
      scenario,
      suiteContext: input.suiteContext,
      linkedComponents,
      linkedRulePacks,
      linkedTaxonomy,
    },
    proposedPayload,
    sourceDraftId: input.draftId,
    sourceRunId: input.runId,
    sourceCaseId: input.caseId,
    targetDatasetItemId: targetDatasetItem?.id ?? null,
    projectId: input.suiteContext.projectId ?? null,
    moduleId: input.suiteContext.moduleId ?? null,
    pageId: input.suiteContext.pageId ?? null,
    scopeLevel: input.suiteContext.pageId
      ? 'page'
      : input.suiteContext.moduleId
        ? 'module'
        : input.suiteContext.projectId
          ? 'project'
          : null,
    createdBy: input.actor,
  });
}

export async function triggerAutoStrengtheningForFeedback(input: {
  actor: string;
  feedbackId: string;
  suiteContext: {
    projectId?: string | null;
    projectName?: string | null;
    moduleId?: string | null;
    moduleName?: string | null;
    pageId?: string | null;
    pageName?: string | null;
    path?: string | null;
  };
}) {
  const feedback = await prisma.testCaseFeedback.findUnique({
    where: { id: input.feedbackId },
  });

  if (!feedback || !feedback.reasonCode || feedback.usedForLearning) {
    return null;
  }

  const snapshot =
    feedback.caseSnapshot && typeof feedback.caseSnapshot === 'object'
      ? (feedback.caseSnapshot as Record<string, unknown>)
      : {};
  const linkedComponents = asStringList(snapshot.linkedComponents);
  const feature = String(snapshot.feature ?? '').trim();
  const fingerprintBase = [feedback.reasonCode, linkedComponents[0] || feature || feedback.caseTitle]
    .map((value) => slugify(String(value ?? '')) || 'na')
    .join(':');

  const candidateFeedback = await prisma.testCaseFeedback.findMany({
    where: {
      reasonCode: feedback.reasonCode,
      usedForLearning: false,
    },
  });

  const matched = candidateFeedback.filter((entry) => {
    const entrySnapshot =
      entry.caseSnapshot && typeof entry.caseSnapshot === 'object'
        ? (entry.caseSnapshot as Record<string, unknown>)
        : {};
    const entryComponents = asStringList(entrySnapshot.linkedComponents);
    const entryFeature = String(entrySnapshot.feature ?? '').trim();
    const entryKey = [entry.reasonCode, entryComponents[0] || entryFeature || entry.caseTitle]
      .map((value) => slugify(String(value ?? '')) || 'na')
      .join(':');
    return entryKey === fingerprintBase;
  });

  const distinctRuns = new Set(matched.map((entry) => entry.runId));
  if (distinctRuns.size < 2) {
    return null;
  }

  const targetType: SuggestionTargetType =
    linkedComponents.length > 0 && feedback.reasonCode === 'MISSING_COVERAGE' ? 'componentCatalogue' : 'projectMemory';
  const targetDatasetItem =
    targetType === 'componentCatalogue'
      ? await findNamedDatasetTarget('componentCatalogue', linkedComponents)
      : await findScopedProjectMemoryTarget({
          projectId: input.suiteContext.projectId,
          moduleId: input.suiteContext.moduleId,
          pageId: input.suiteContext.pageId,
        });

  const proposedPayload =
    targetType === 'componentCatalogue'
      ? {
          name: linkedComponents[0] || feature || 'Reusable Component',
          category: 'Behavioral Pattern',
          description: `Strengthened from repeated testcase rejection feedback for ${linkedComponents[0] || feature || feedback.caseTitle}.`,
          aliases: linkedComponents,
          variants: [] as string[],
          states: [] as string[],
          validations: [] as string[],
          commonActions: [] as string[],
          dependencies: [] as string[],
          commonRisks: dedupeStrings([`Repeated reviewer rejection due to ${String(feedback.reasonCode).toLowerCase().replace(/_/g, ' ')}.`]),
          applicableTestTypes: [] as string[],
          smokeScenarios: [] as string[],
          functionalScenarios: [] as string[],
          negativeScenarios: [] as string[],
          edgeScenarios: [] as string[],
          standardTestCases: dedupeStrings(matched.map((entry) => entry.caseTitle)),
          accessibilityObservations: [] as string[],
          notes: '',
          tags: dedupeStrings(['auto-strengthening', slugify(linkedComponents[0] || feature || feedback.caseTitle)]),
        }
      : buildProjectMemoryPayload({
          name: `${input.suiteContext.pageName?.trim() || input.suiteContext.projectName?.trim() || 'Project'} QA Memory`,
          overview: `Strengthened from repeated testcase rejection feedback for ${input.suiteContext.path ?? 'the current suite'}.`,
          title: feedback.caseTitle,
          feature,
          linkedComponents,
          riskNote: `Repeated testcase rejection reason: ${String(feedback.reasonCode).toLowerCase().replace(/_/g, ' ')}.`,
        });

  const created = await createKnowledgeSuggestionIfAbsent({
    type: 'autoStrengthening',
    targetType,
    triggerType: 'repeated_rejection_pattern',
    fingerprint: `auto:${targetType}:${fingerprintBase}`,
    title: `Strengthen knowledge from repeated rejection: ${feedback.caseTitle}`,
    summary: `Detected ${distinctRuns.size} distinct runs with the same rejection pattern.`,
    rationale: 'Repeated testcase rejection patterns indicate reusable knowledge is weak or incomplete.',
    evidence: {
      reasonCode: String(feedback.reasonCode).toLowerCase(),
      caseTitle: feedback.caseTitle,
      matchCount: matched.length,
      distinctRuns: [...distinctRuns],
    },
    proposedPayload,
    sourceDraftId: feedback.draftId,
    sourceRunId: feedback.runId,
    sourceCaseId: feedback.caseId,
    targetDatasetItemId: targetDatasetItem?.id ?? null,
    projectId: input.suiteContext.projectId ?? null,
    moduleId: input.suiteContext.moduleId ?? null,
    pageId: input.suiteContext.pageId ?? null,
    scopeLevel: input.suiteContext.pageId
      ? 'page'
      : input.suiteContext.moduleId
        ? 'module'
        : input.suiteContext.projectId
          ? 'project'
          : null,
    createdBy: input.actor,
  });

  if (created.created) {
    await markFeedbackLearningConsumed(matched.map((entry) => entry.id));
  }

  return created.suggestion;
}

export async function triggerAutoStrengtheningForApprovedDraft(input: {
  actor: string;
  draftId: string;
  suiteContext: {
    projectId?: string | null;
    projectName?: string | null;
    moduleId?: string | null;
    moduleName?: string | null;
    pageId?: string | null;
    pageName?: string | null;
    path?: string | null;
  };
}) {
  const draft = await prisma.testCaseDraft.findUnique({
    where: { id: input.draftId },
    include: {
      run: true,
    },
  });

  if (!draft || draft.reviewStatus !== DraftReviewStatus.APPROVED) {
    return [];
  }

  const createdSuggestions: Array<Awaited<ReturnType<typeof createKnowledgeSuggestionIfAbsent>>['suggestion']> = [];
  const cases = Array.isArray(draft.generatedCases)
    ? draft.generatedCases
        .filter((testCase) => testCase && typeof testCase === 'object' && !Array.isArray(testCase))
        .map((testCase) => testCase as Record<string, unknown>)
    : [];

  const approvedManualCases = cases.filter(
    (testCase) =>
      String(testCase.entrySource ?? '').toLowerCase() === 'manual' &&
      String(testCase.reviewStatus ?? '').toLowerCase() === 'approved',
  );

  if (approvedManualCases.length > 0) {
    const priorDrafts = await prisma.testCaseDraft.findMany({
      where: {
        id: { not: input.draftId },
        reviewStatus: DraftReviewStatus.APPROVED,
        run: { pageId: draft.run.pageId },
      },
      include: {
        run: true,
      },
    });

    for (const manualCase of approvedManualCases) {
      const fingerprintBase = slugify(
        `${(manualCase.linkedComponents as string[] | undefined)?.[0] ?? manualCase.feature ?? manualCase.title ?? 'manual-case'}`,
      );
      const distinctRuns = new Set<string>([draft.runId]);
      for (const priorDraft of priorDrafts) {
        const priorCases = Array.isArray(priorDraft.generatedCases)
          ? priorDraft.generatedCases
              .filter((testCase) => testCase && typeof testCase === 'object' && !Array.isArray(testCase))
              .map((testCase) => testCase as Record<string, unknown>)
          : [];
        if (
          priorCases.some(
            (candidate) =>
              String(candidate.entrySource ?? '').toLowerCase() === 'manual' &&
              slugify(
                `${(candidate.linkedComponents as string[] | undefined)?.[0] ?? candidate.feature ?? candidate.title ?? 'manual-case'}`,
              ) === fingerprintBase,
          )
        ) {
          distinctRuns.add(priorDraft.runId);
        }
      }

      if (distinctRuns.size < 2) {
        continue;
      }

      const created = await createPromotionSuggestionFromTestCase({
        actor: input.actor,
        draftId: draft.id,
        runId: draft.runId,
        caseId: String(manualCase.caseId ?? ''),
        caseData: manualCase,
        suiteContext: input.suiteContext,
        targetType: 'projectMemory',
        notes: 'Auto-suggested from repeated approved manual testcase additions.',
      });
      createdSuggestions.push(created.suggestion);
    }
  }

  return createdSuggestions;
}

export async function triggerAutoStrengtheningForCoverageAnalysis(input: {
  actor: string;
  draftId: string;
  suiteContext: {
    projectId?: string | null;
    projectName?: string | null;
    moduleId?: string | null;
    moduleName?: string | null;
    pageId?: string | null;
    pageName?: string | null;
    path?: string | null;
  };
}) {
  const draft = await prisma.testCaseDraft.findUnique({
    where: { id: input.draftId },
  });

  if (!draft || draft.reviewStatus !== DraftReviewStatus.APPROVED) {
    return [];
  }

  const currentAnalysis = parseCoverageAnalysis(draft.coverageAnalysis);
  if (!currentAnalysis) {
    return [];
  }

  if (!input.suiteContext.pageId && !input.suiteContext.moduleId && !input.suiteContext.projectId) {
    return [];
  }

  const currentSignals = collectCoverageGapSignals(currentAnalysis);
  if (!currentSignals.length) {
    return [];
  }

  const priorDrafts = await prisma.testCaseDraft.findMany({
    where: {
      id: { not: input.draftId },
      reviewStatus: DraftReviewStatus.APPROVED,
      run: input.suiteContext.pageId
        ? { pageId: input.suiteContext.pageId }
        : input.suiteContext.moduleId
          ? { page: { moduleId: input.suiteContext.moduleId } }
          : input.suiteContext.projectId
            ? { page: { module: { projectId: input.suiteContext.projectId } } }
            : undefined,
    },
    select: {
      id: true,
      runId: true,
      coverageAnalysis: true,
    },
  });

  const priorGapMap = new Map<string, Set<string>>();
  for (const priorDraft of priorDrafts) {
    const priorAnalysis = parseCoverageAnalysis(priorDraft.coverageAnalysis);
    if (!priorAnalysis) {
      continue;
    }
    for (const signal of collectCoverageGapSignals(priorAnalysis)) {
      const runs = priorGapMap.get(signal.key) ?? new Set<string>();
      runs.add(priorDraft.runId);
      priorGapMap.set(signal.key, runs);
    }
  }

  const targetDatasetItem = await findScopedProjectMemoryTarget({
    projectId: input.suiteContext.projectId,
    moduleId: input.suiteContext.moduleId,
    pageId: input.suiteContext.pageId,
  });

  const createdSuggestions: Array<Awaited<ReturnType<typeof createKnowledgeSuggestionIfAbsent>>['suggestion']> = [];
  const scopeKey = buildCoverageGapFingerprintScope(input.suiteContext);
  const scopeLevel = coverageGapScopeLevel(input.suiteContext);
  const memoryName =
    input.suiteContext.pageName?.trim() ||
    input.suiteContext.moduleName?.trim() ||
    input.suiteContext.projectName?.trim() ||
    'Project QA Memory';

  for (const signal of currentSignals) {
    const distinctRuns = new Set<string>([draft.runId, ...(priorGapMap.get(signal.key) ?? [])]);
    if (distinctRuns.size < 2) {
      continue;
    }

    const created = await createKnowledgeSuggestionIfAbsent({
      type: 'autoStrengthening',
      targetType: 'projectMemory',
      triggerType: 'repeated_coverage_gap',
      fingerprint: `coverage-gap:${scopeKey}:${signal.key}`,
      title: `Strengthen coverage memory: ${signal.label}`,
      summary: `Coverage analysis flagged ${signal.label} in ${distinctRuns.size} approved runs for the same scope.`,
      rationale: 'Repeated coverage gaps indicate the scoped reusable knowledge should better steer future generation runs.',
      evidence: {
        gapKind: signal.kind,
        gapKey: signal.key,
        gapLabel: signal.label,
        distinctRuns: [...distinctRuns],
        quotaStatus: currentAnalysis.quotaStatus,
        unitsCovered: currentAnalysis.unitsCovered,
        unitsIdentified: currentAnalysis.unitsIdentified,
        suitePath: input.suiteContext.path ?? null,
      },
      proposedPayload: buildProjectMemoryPayload({
        name: memoryName,
        overview: `Strengthened from repeated coverage-analysis gaps for ${input.suiteContext.path ?? memoryName}.`,
        title: signal.title,
        feature: signal.feature,
        linkedComponents: signal.linkedComponents,
        knownRule: signal.knownRule,
        riskNote: signal.riskNote,
      }),
      sourceDraftId: draft.id,
      sourceRunId: draft.runId,
      targetDatasetItemId: targetDatasetItem?.id ?? null,
      projectId: input.suiteContext.projectId ?? null,
      moduleId: input.suiteContext.moduleId ?? null,
      pageId: input.suiteContext.pageId ?? null,
      scopeLevel,
      createdBy: input.actor,
    });

    createdSuggestions.push(created.suggestion);
  }

  return createdSuggestions;
}

export async function triggerAutoStrengtheningForAppliedSuggestion(suggestionId: string, actor: string) {
  const suggestion = await prisma.knowledgeSuggestion.findUnique({
    where: { id: suggestionId },
  });

  if (!suggestion || suggestion.type !== KnowledgeSuggestionType.TESTCASE_PROMOTION || !suggestion.appliedDatasetItemId) {
    return null;
  }

  const related = await prisma.knowledgeSuggestion.findMany({
    where: {
      type: KnowledgeSuggestionType.TESTCASE_PROMOTION,
      status: KnowledgeSuggestionStatus.APPLIED,
      appliedDatasetItemId: suggestion.appliedDatasetItemId,
    },
  });

  const distinctRuns = new Set(related.map((entry) => entry.sourceRunId).filter((value): value is string => Boolean(value)));
  if (distinctRuns.size < 2) {
    return null;
  }

  const targetItem = await prisma.datasetItem.findUnique({
    where: { id: suggestion.appliedDatasetItemId },
  });
  if (!targetItem) {
    return null;
  }

  const apiItemType = toApiDatasetItemType(targetItem.itemType) as SuggestionTargetType;
  const payload = parsePayloadForItemType<Record<string, unknown>>(apiItemType, targetItem.data);

  return createKnowledgeSuggestionIfAbsent({
    type: 'autoStrengthening',
    targetType: apiItemType,
    triggerType: 'repeated_applied_promotions',
    fingerprint: `promotion-strengthen:${suggestion.appliedDatasetItemId}`,
    title: `Strengthen reusable knowledge from repeated promotions: ${targetItem.title}`,
    summary: `Detected ${distinctRuns.size} applied testcase promotions targeting the same reusable knowledge record.`,
    rationale: 'Repeated approved promotions indicate this reusable knowledge should be strengthened further.',
    evidence: {
      targetItemId: targetItem.id,
      distinctRuns: [...distinctRuns],
      appliedSuggestionIds: related.map((entry) => entry.id),
    },
    proposedPayload: payload,
    sourceDraftId: suggestion.sourceDraftId,
    sourceRunId: suggestion.sourceRunId,
    sourceCaseId: suggestion.sourceCaseId,
    targetDatasetItemId: targetItem.id,
    projectId: suggestion.projectId,
    moduleId: suggestion.moduleId,
    pageId: suggestion.pageId,
    scopeLevel: toApiScopeLevel(suggestion.scopeLevel),
    createdBy: actor,
  });
}
