import { DatasetItemType, DatasetStatus } from '@prisma/client';
import { z, type ZodTypeAny } from 'zod';

import {
  apiDatasetItemTypeValues,
  apiDatasetStatusValues,
  componentCataloguePayloadSchema,
  featureTypePayloadSchema,
  projectMemoryPayloadSchema,
  priorityMappingPayloadSchema,
  rulePackPayloadSchema,
  scenarioTemplatePayloadSchema,
  severityMappingPayloadSchema,
  synonymAliasPayloadSchema,
  testTaxonomyPayloadSchema,
  type ApiDatasetItemType,
  type ApiDatasetStatus,
} from './dataset.schemas.js';

export type DatasetEntityDefinition<TSchema extends ZodTypeAny = ZodTypeAny> = {
  key: ApiDatasetItemType;
  dbType: DatasetItemType;
  label: string;
  pluralLabel: string;
  description: string;
  titleField: string;
  summaryField?: string;
  tagsField?: string;
  payloadSchema: TSchema;
  exportFieldOrder: string[];
};

export const datasetEntityDefinitions: Record<ApiDatasetItemType, DatasetEntityDefinition> = {
  componentCatalogue: {
    key: 'componentCatalogue',
    dbType: DatasetItemType.COMPONENT_CATALOGUE,
    label: 'Component Catalogue',
    pluralLabel: 'Component Catalogue',
    description: 'Reusable UI or product components with QA behaviors and starter smoke coverage.',
    titleField: 'name',
    summaryField: 'description',
    tagsField: 'tags',
    payloadSchema: componentCataloguePayloadSchema,
    exportFieldOrder: [
      'componentId',
      'id',
      'name',
      'aliases',
      'category',
      'description',
      'whereFound',
      'variants',
      'states',
      'validations',
      'commonActions',
      'dependencies',
      'commonRisks',
      'applicableTestTypes',
      'smokeScenarios',
      'functionalScenarios',
      'negativeScenarios',
      'edgeScenarios',
      'standardTestCases',
      'accessibilityObservations',
      'notes',
      'tags',
      'status',
      'version',
      'createdAt',
      'updatedAt',
    ],
  },
  rulePack: {
    key: 'rulePack',
    dbType: DatasetItemType.RULE_PACK,
    label: 'Rule Pack',
    pluralLabel: 'Rule Packs',
    description: 'Heuristic bundles and required scenario guidance grouped by QA concern.',
    titleField: 'name',
    summaryField: 'description',
    tagsField: 'tags',
    payloadSchema: rulePackPayloadSchema,
    exportFieldOrder: [
      'id',
      'name',
      'description',
      'appliesToFeatureTypes',
      'appliesToComponents',
      'mandatoryScenarios',
      'negativeHeuristics',
      'edgeHeuristics',
      'securityHeuristics',
      'performanceHeuristics',
      'accessibilityHeuristics',
      'defaultPriority',
      'tags',
      'status',
      'version',
      'createdAt',
      'updatedAt',
    ],
  },
  featureType: {
    key: 'featureType',
    dbType: DatasetItemType.FEATURE_TYPE,
    label: 'Feature Type',
    pluralLabel: 'Feature Types',
    description: 'Reusable feature families that relate components, rules, and test buckets.',
    titleField: 'name',
    summaryField: 'description',
    tagsField: 'tags',
    payloadSchema: featureTypePayloadSchema,
    exportFieldOrder: [
      'id',
      'name',
      'description',
      'applicableComponents',
      'applicableRulePacks',
      'applicableTestTypes',
      'defaultScenarioBuckets',
      'tags',
      'status',
      'version',
      'createdAt',
      'updatedAt',
    ],
  },
  testTaxonomy: {
    key: 'testTaxonomy',
    dbType: DatasetItemType.TEST_TAXONOMY,
    label: 'Test Taxonomy',
    pluralLabel: 'Test Taxonomy',
    description: 'Definitions for test types, applicability, and default prioritization.',
    titleField: 'name',
    summaryField: 'description',
    tagsField: 'tags',
    payloadSchema: testTaxonomyPayloadSchema,
    exportFieldOrder: [
      'id',
      'name',
      'description',
      'whenApplicable',
      'whenNotApplicable',
      'defaultPriority',
      'tags',
      'status',
      'version',
      'createdAt',
      'updatedAt',
    ],
  },
  scenarioTemplate: {
    key: 'scenarioTemplate',
    dbType: DatasetItemType.SCENARIO_TEMPLATE,
    label: 'Scenario Template',
    pluralLabel: 'Scenario Templates',
    description: 'Patternized scenario structures for reusable manual or generated test design.',
    titleField: 'name',
    summaryField: 'description',
    tagsField: 'tags',
    payloadSchema: scenarioTemplatePayloadSchema,
    exportFieldOrder: [
      'id',
      'name',
      'scenarioType',
      'description',
      'preconditionPattern',
      'stepPattern',
      'expectedResultPattern',
      'tags',
      'examples',
      'status',
      'version',
      'createdAt',
      'updatedAt',
    ],
  },
  projectMemory: {
    key: 'projectMemory',
    dbType: DatasetItemType.PROJECT_MEMORY,
    label: 'Project Memory',
    pluralLabel: 'Project Memory',
    description: 'Project, module, or page-scoped product memory used to improve future generation quality.',
    titleField: 'name',
    summaryField: 'overview',
    tagsField: 'tags',
    payloadSchema: projectMemoryPayloadSchema,
    exportFieldOrder: [
      'id',
      'name',
      'overview',
      'businessTerminology',
      'workflows',
      'widgetRelationships',
      'knownRules',
      'knownRisks',
      'goldenScenarios',
      'exclusions',
      'linkedReusableComponents',
      'tags',
      'status',
      'version',
      'createdAt',
      'updatedAt',
    ],
  },
  priorityMapping: {
    key: 'priorityMapping',
    dbType: DatasetItemType.PRIORITY_MAPPING,
    label: 'Priority Mapping',
    pluralLabel: 'Priority Mappings',
    description: 'Rules that translate contextual QA risk into priority levels.',
    titleField: 'name',
    summaryField: 'description',
    tagsField: 'tags',
    payloadSchema: priorityMappingPayloadSchema,
    exportFieldOrder: [
      'id',
      'name',
      'description',
      'rules',
      'tags',
      'status',
      'version',
      'createdAt',
      'updatedAt',
    ],
  },
  severityMapping: {
    key: 'severityMapping',
    dbType: DatasetItemType.SEVERITY_MAPPING,
    label: 'Severity Mapping',
    pluralLabel: 'Severity Mappings',
    description: 'Rules that translate failure impact into severity levels.',
    titleField: 'name',
    summaryField: 'description',
    tagsField: 'tags',
    payloadSchema: severityMappingPayloadSchema,
    exportFieldOrder: [
      'id',
      'name',
      'description',
      'rules',
      'tags',
      'status',
      'version',
      'createdAt',
      'updatedAt',
    ],
  },
  synonymAlias: {
    key: 'synonymAlias',
    dbType: DatasetItemType.SYNONYM_ALIAS,
    label: 'Synonym / Alias',
    pluralLabel: 'Synonyms / Aliases',
    description: 'Canonical names and aliases used to normalize dataset terminology.',
    titleField: 'canonicalName',
    summaryField: 'notes',
    payloadSchema: synonymAliasPayloadSchema,
    exportFieldOrder: [
      'id',
      'sourceType',
      'canonicalName',
      'aliases',
      'notes',
      'status',
      'version',
      'createdAt',
      'updatedAt',
    ],
  },
};

export const datasetItemTypeSchema = z.enum(apiDatasetItemTypeValues);
export const datasetStatusSchema = z.enum(apiDatasetStatusValues);

const dbTypeToApiMap = Object.values(datasetEntityDefinitions).reduce<Record<DatasetItemType, ApiDatasetItemType>>(
  (accumulator, definition) => {
    accumulator[definition.dbType] = definition.key;
    return accumulator;
  },
  {} as Record<DatasetItemType, ApiDatasetItemType>,
);

const apiStatusToDbMap: Record<ApiDatasetStatus, DatasetStatus> = {
  draft: DatasetStatus.DRAFT,
  approved: DatasetStatus.APPROVED,
  archived: DatasetStatus.ARCHIVED,
};

const dbStatusToApiMap: Record<DatasetStatus, ApiDatasetStatus> = {
  [DatasetStatus.DRAFT]: 'draft',
  [DatasetStatus.APPROVED]: 'approved',
  [DatasetStatus.ARCHIVED]: 'archived',
};

export const getDatasetEntityDefinition = (itemType: ApiDatasetItemType) => datasetEntityDefinitions[itemType];

export const toDbDatasetStatus = (status: ApiDatasetStatus) => apiStatusToDbMap[status];
export const toApiDatasetStatus = (status: DatasetStatus) => dbStatusToApiMap[status];
export const toApiDatasetItemType = (itemType: DatasetItemType) => dbTypeToApiMap[itemType];
