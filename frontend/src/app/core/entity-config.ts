import type { DatasetItemType, RefinementMode } from './models';

export type EntityFieldType = 'text' | 'textarea' | 'stringList' | 'json';

export interface EntityFieldConfig {
  key: string;
  label: string;
  type: EntityFieldType;
  required?: boolean;
  hint?: string;
  rows?: number;
}

export interface EntityConfig {
  key: DatasetItemType;
  route: string;
  label: string;
  pluralLabel: string;
  description: string;
  supportsBulkRefinement: boolean;
  fields: EntityFieldConfig[];
}

export const datasetStatusOptions = [
  { value: 'draft', label: 'Draft' },
  { value: 'approved', label: 'Approved' },
] as const;

export const refinementModeOptions: Array<{ value: RefinementMode; label: string; description: string }> = [
  { value: 'normalize', label: 'Normalize', description: 'Standardize terminology and structure.' },
  { value: 'expand', label: 'Expand', description: 'Add missing but inferable QA detail.' },
  { value: 'deduplicate', label: 'Deduplicate', description: 'Merge overlapping entries and reduce repetition.' },
  { value: 'classify', label: 'Classify', description: 'Improve tags and applicability classification.' },
  { value: 'strengthen', label: 'Strengthen', description: 'Make the item clearer and more reusable.' },
  { value: 'generateStarterDataset', label: 'Generate Starter Dataset', description: 'Create a stronger starter-quality version.' },
];

export const entityConfigs: Record<DatasetItemType, EntityConfig> = {
  componentCatalogue: {
    key: 'componentCatalogue',
    route: 'components',
    label: 'Component Catalogue',
    pluralLabel: 'Component Catalogue',
    description: 'Manage reusable UI components and their QA starter knowledge.',
    supportsBulkRefinement: true,
    fields: [
      { key: 'componentId', label: 'Component ID', type: 'text' },
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'aliases', label: 'Aliases', type: 'stringList' },
      { key: 'category', label: 'Category', type: 'text', required: true },
      { key: 'description', label: 'Description', type: 'textarea', rows: 4 },
      { key: 'whereFound', label: 'Where Found JSON', type: 'json', hint: 'Array of { module, page, routeOrLocationHint } objects.', rows: 8 },
      { key: 'variants', label: 'Variants', type: 'stringList' },
      { key: 'states', label: 'States', type: 'stringList' },
      { key: 'validations', label: 'Validations', type: 'stringList' },
      { key: 'commonActions', label: 'Common Actions', type: 'stringList' },
      { key: 'dependencies', label: 'Dependencies', type: 'stringList' },
      { key: 'commonRisks', label: 'Common Risks', type: 'stringList' },
      { key: 'applicableTestTypes', label: 'Applicable Test Types', type: 'stringList' },
      { key: 'smokeScenarios', label: 'Smoke Scenarios', type: 'stringList' },
      { key: 'functionalScenarios', label: 'Functional Scenarios', type: 'stringList' },
      { key: 'negativeScenarios', label: 'Negative Scenarios', type: 'stringList' },
      { key: 'edgeScenarios', label: 'Edge Scenarios', type: 'stringList' },
      { key: 'standardTestCases', label: 'Standard Test Cases', type: 'stringList', rows: 12 },
      { key: 'accessibilityObservations', label: 'Accessibility Observations', type: 'stringList' },
      { key: 'notes', label: 'Notes', type: 'textarea', rows: 4 },
      { key: 'tags', label: 'Tags', type: 'stringList' },
    ],
  },
  rulePack: {
    key: 'rulePack',
    route: 'rule-packs',
    label: 'Rule Pack',
    pluralLabel: 'Rule Packs',
    description: 'Manage reusable QA heuristic packs and scenario expectations.',
    supportsBulkRefinement: true,
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'description', label: 'Description', type: 'textarea', rows: 4 },
      { key: 'appliesToFeatureTypes', label: 'Applies To Feature Types', type: 'stringList' },
      { key: 'appliesToComponents', label: 'Applies To Components', type: 'stringList' },
      { key: 'mandatoryScenarios', label: 'Mandatory Scenarios', type: 'stringList' },
      { key: 'negativeHeuristics', label: 'Negative Heuristics', type: 'stringList' },
      { key: 'edgeHeuristics', label: 'Edge Heuristics', type: 'stringList' },
      { key: 'securityHeuristics', label: 'Security Heuristics', type: 'stringList' },
      { key: 'performanceHeuristics', label: 'Performance Heuristics', type: 'stringList' },
      { key: 'accessibilityHeuristics', label: 'Accessibility Heuristics', type: 'stringList' },
      { key: 'tags', label: 'Tags', type: 'stringList' },
    ],
  },
  featureType: {
    key: 'featureType',
    route: 'feature-types',
    label: 'Feature Type',
    pluralLabel: 'Feature Types',
    description: 'Manage reusable feature families, their components, and scenario buckets.',
    supportsBulkRefinement: false,
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'description', label: 'Description', type: 'textarea', rows: 4 },
      { key: 'applicableComponents', label: 'Applicable Components', type: 'stringList' },
      { key: 'applicableRulePacks', label: 'Applicable Rule Packs', type: 'stringList' },
      { key: 'applicableTestTypes', label: 'Applicable Test Types', type: 'stringList' },
      { key: 'defaultScenarioBuckets', label: 'Default Scenario Buckets', type: 'stringList' },
      { key: 'tags', label: 'Tags', type: 'stringList' },
    ],
  },
  testTaxonomy: {
    key: 'testTaxonomy',
    route: 'taxonomy',
    label: 'Test Taxonomy',
    pluralLabel: 'Test Taxonomy',
    description: 'Manage reusable test-type definitions and applicability guidance.',
    supportsBulkRefinement: false,
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'description', label: 'Description', type: 'textarea', rows: 4 },
      { key: 'whenApplicable', label: 'When Applicable', type: 'stringList' },
      { key: 'whenNotApplicable', label: 'When Not Applicable', type: 'stringList' },
      { key: 'tags', label: 'Tags', type: 'stringList' },
    ],
  },
  scenarioTemplate: {
    key: 'scenarioTemplate',
    route: 'scenario-templates',
    label: 'Scenario Template',
    pluralLabel: 'Scenario Templates',
    description: 'Manage reusable scenario patterns for future AI-assisted test design.',
    supportsBulkRefinement: false,
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'scenarioType', label: 'Scenario Type', type: 'text', required: true },
      { key: 'description', label: 'Description', type: 'textarea', rows: 4 },
      { key: 'preconditionPattern', label: 'Precondition Pattern', type: 'textarea', rows: 3 },
      { key: 'stepPattern', label: 'Step Pattern', type: 'textarea', rows: 4 },
      { key: 'expectedResultPattern', label: 'Expected Result Pattern', type: 'textarea', rows: 4 },
      { key: 'tags', label: 'Tags', type: 'stringList' },
      { key: 'examples', label: 'Examples', type: 'stringList' },
    ],
  },
  projectMemory: {
    key: 'projectMemory',
    route: 'project-memory',
    label: 'Project Memory',
    pluralLabel: 'Project Memory',
    description: 'Manage project, module, and page-scoped product memory that improves future generation quality.',
    supportsBulkRefinement: true,
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'overview', label: 'Overview', type: 'textarea', rows: 4 },
      { key: 'businessTerminology', label: 'Business Terminology', type: 'stringList' },
      { key: 'workflows', label: 'Workflows', type: 'stringList' },
      { key: 'widgetRelationships', label: 'Widget Relationships', type: 'stringList' },
      { key: 'knownRules', label: 'Known Rules', type: 'stringList' },
      { key: 'knownRisks', label: 'Known Risks', type: 'stringList' },
      { key: 'goldenScenarios', label: 'Golden Scenarios', type: 'stringList' },
      { key: 'exclusions', label: 'Exclusions', type: 'stringList' },
      { key: 'linkedReusableComponents', label: 'Linked Reusable Components', type: 'stringList' },
      { key: 'tags', label: 'Tags', type: 'stringList' },
    ],
  },
  priorityMapping: {
    key: 'priorityMapping',
    route: 'priority-mappings',
    label: 'Priority Mapping',
    pluralLabel: 'Priority Mappings',
    description: 'Manage deterministic priority rules for future generator usage.',
    supportsBulkRefinement: false,
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'description', label: 'Description', type: 'textarea', rows: 4 },
      { key: 'rules', label: 'Rules JSON', type: 'json', hint: 'Array of { condition, mappedValue, notes? } objects.', rows: 8 },
      { key: 'tags', label: 'Tags', type: 'stringList' },
    ],
  },
  severityMapping: {
    key: 'severityMapping',
    route: 'severity-mappings',
    label: 'Severity Mapping',
    pluralLabel: 'Severity Mappings',
    description: 'Manage deterministic severity rules for future generator usage.',
    supportsBulkRefinement: false,
    fields: [
      { key: 'name', label: 'Name', type: 'text', required: true },
      { key: 'description', label: 'Description', type: 'textarea', rows: 4 },
      { key: 'rules', label: 'Rules JSON', type: 'json', hint: 'Array of { condition, mappedValue, notes? } objects.', rows: 8 },
      { key: 'tags', label: 'Tags', type: 'stringList' },
    ],
  },
  synonymAlias: {
    key: 'synonymAlias',
    route: 'synonyms',
    label: 'Synonym / Alias',
    pluralLabel: 'Synonyms / Aliases',
    description: 'Manage canonical names and alias sets used for normalization.',
    supportsBulkRefinement: false,
    fields: [
      { key: 'sourceType', label: 'Source Type', type: 'text', required: true },
      { key: 'canonicalName', label: 'Canonical Name', type: 'text', required: true },
      { key: 'aliases', label: 'Aliases', type: 'stringList' },
      { key: 'notes', label: 'Notes', type: 'textarea', rows: 4 },
    ],
  },
};

export const entityConfigList = Object.values(entityConfigs).filter((config) => config.key !== 'priorityMapping');

export function getEntityConfig(itemType: DatasetItemType): EntityConfig {
  return entityConfigs[itemType];
}

export function createEmptyPayload(itemType: DatasetItemType): Record<string, unknown> {
  return Object.fromEntries(
    getEntityConfig(itemType).fields.map((field) => [
      field.key,
      field.type === 'json' ? [] : field.type === 'stringList' ? [] : '',
    ]),
  );
}
