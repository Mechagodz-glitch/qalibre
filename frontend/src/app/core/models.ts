export type DatasetItemType =
  | 'componentCatalogue'
  | 'rulePack'
  | 'featureType'
  | 'testTaxonomy'
  | 'scenarioTemplate'
  | 'projectMemory'
  | 'priorityMapping'
  | 'severityMapping'
  | 'synonymAlias';

export type DatasetStatus = 'draft' | 'approved' | 'archived';
export type ExportFormat = 'json' | 'csv' | 'xlsx';
export type KnowledgeAssetKind = 'file' | 'pastedText' | 'manualInput';
export type KnowledgeAssetReviewStatus = 'raw' | 'reviewed' | 'linked' | 'archived';
export type RefinementMode =
  | 'normalize'
  | 'expand'
  | 'deduplicate'
  | 'classify'
  | 'strengthen'
  | 'generateStarterDataset';
export type GenerationMode = 'processAlpha' | 'processBeta' | 'manualRecovery';
export type GenerationRunStatus = 'pending' | 'completed' | 'failed';
export type GenerationReviewStatus = 'pending' | 'approved' | 'rejected';
export type TestCaseEntrySource = 'generated' | 'manual';
export type TestCaseFeedbackAction = 'approved' | 'rejected';
export type TestCaseFeedbackReason =
  | 'missing_coverage'
  | 'wrong_logic'
  | 'wrong_assumption'
  | 'duplicate'
  | 'poor_wording'
  | 'wrong_priority_or_severity'
  | 'not_applicable'
  | 'other';
export type KnowledgeScopeLevel = 'project' | 'module' | 'page';
export type KnowledgeSuggestionStatus = 'pending' | 'approved' | 'rejected' | 'applied';
export type KnowledgeSuggestionType = 'testcasePromotion' | 'autoStrengthening';
export type KnowledgeSuggestionTargetType = 'projectMemory' | 'componentCatalogue' | 'scenarioTemplate' | 'rulePack';
export type SourceKind = 'userStory' | 'prd' | 'mockup' | 'image' | 'video' | 'link' | 'note' | 'file';
export type ManualExecutionRunStatus = 'draft' | 'inProgress' | 'completed';
export type ManualExecutionCaseStatus = 'untested' | 'passed' | 'failed' | 'skipped';
export type AppUserRole = 'ADMIN' | 'USER';

export interface AppPageAccessDefinition {
  key: string;
  label: string;
  route: string;
  description: string;
  adminOnly?: boolean;
}

export interface AuthConfig {
  clientId: string;
  tenantId: string;
  authority: string;
  redirectPath: string;
  postLogoutRedirectPath: string;
  scopes: string[];
  pageAccessDefinitions: AppPageAccessDefinition[];
}

export interface CurrentUserProfile {
  id: string;
  email: string;
  name: string;
  role: AppUserRole;
  isActive: boolean;
  pageAccesses: string[];
  contributor: {
    id: string;
    name: string;
    roleTitle: string | null;
  } | null;
  contributorId: string | null;
  contributorName: string | null;
  accessiblePages: string[];
  isAdmin: boolean;
  lastLoginAt: string | null;
}

export interface AdminUserRecord extends CurrentUserProfile {
  createdAt: string;
  updatedAt: string;
}

export type ProjectQuarter = 'Q1' | 'Q2' | 'Q3' | 'Q4';

export interface AdminProjectQuarterAllocation {
  id: string;
  project: {
    id: string;
    name: string;
  };
  year: number;
  quarter: ProjectQuarter;
  tester: {
    id: string;
    name: string;
    roleTitle: string | null;
  } | null;
  createdAt: string;
  updatedAt: string;
}

export interface AdminProjectRecord {
  id: string;
  name: string;
  description: string | null;
}

export interface AdminProjectModuleRecord {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
}

export interface AdminProjectPageRecord {
  id: string;
  moduleId: string;
  name: string;
  description: string | null;
}

export interface AdminProjectFeatureRecord {
  id: string;
  pageId: string;
  name: string;
  description: string | null;
}

export interface PaginatedResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface DatasetItem {
  id: string;
  itemType: DatasetItemType;
  title: string;
  summary: string | null;
  tags: string[];
  status: DatasetStatus;
  version: number;
  archivedAt: string | null;
  project?: KnowledgeScopeSummary | null;
  module?: KnowledgeScopeSummary | null;
  page?: KnowledgeScopeSummary | null;
  scopeLevel?: KnowledgeScopeLevel | null;
  createdAt: string;
  updatedAt: string;
  payload: Record<string, unknown>;
}

export interface KnowledgeScopeSummary {
  id: string;
  name: string;
}

export interface KnowledgeAssetLink {
  id: string;
  datasetItemId: string;
  datasetItemType: DatasetItemType;
  datasetItemTitle: string;
  datasetItemStatus: DatasetStatus;
  notes: string | null;
  createdAt: string;
}

export interface KnowledgeAsset {
  id: string;
  title: string;
  summary: string | null;
  kind: KnowledgeAssetKind;
  sourceFormat: string | null;
  fileName: string | null;
  mimeType: string | null;
  contentText: string | null;
  previewDataUrl: string | null;
  extractedMetadata: Record<string, unknown> | null;
  tags: string[];
  reviewStatus: KnowledgeAssetReviewStatus;
  project: KnowledgeScopeSummary | null;
  module: KnowledgeScopeSummary | null;
  page: KnowledgeScopeSummary | null;
  links: KnowledgeAssetLink[];
  createdAt: string;
  updatedAt: string;
}

export interface KnowledgeLinkedAssetPreview {
  id: string;
  title: string;
  kind: KnowledgeAssetKind;
  sourceFormat: string | null;
}

export interface StructuredKnowledgeWorkspaceItem extends DatasetItem {
  linkedAssetsCount: number;
  linkedAssetsPreview: KnowledgeLinkedAssetPreview[];
}

export interface ProjectHierarchyPageOption {
  id: string;
  name: string;
  description: string | null;
  features: ProjectHierarchyFeatureOption[];
}

export interface ProjectHierarchyFeatureOption {
  id: string;
  name: string;
  description: string | null;
}

export interface ProjectHierarchyModuleOption {
  id: string;
  name: string;
  description: string | null;
  pages: ProjectHierarchyPageOption[];
}

export interface ProjectHierarchyOption {
  id: string;
  name: string;
  description: string | null;
  modules: ProjectHierarchyModuleOption[];
}

export interface KnowledgeBaseWorkspace {
  summary: {
    assetCount: number;
    structuredCount: number;
    linkedItemCount: number;
    needsReviewCount: number;
  };
  assets: KnowledgeAsset[];
  structuredItems: StructuredKnowledgeWorkspaceItem[];
  projectHierarchy: ProjectHierarchyOption[];
}

export interface KnowledgeAssetUpsertInput {
  title: string;
  summary?: string;
  kind: KnowledgeAssetKind;
  sourceFormat?: string;
  fileName?: string;
  mimeType?: string;
  contentText?: string;
  previewDataUrl?: string;
  extractedMetadata?: Record<string, unknown> | null;
  tags: string[];
  reviewStatus?: KnowledgeAssetReviewStatus;
  projectId?: string;
  moduleId?: string;
  pageId?: string;
  fileBase64?: string;
}

export interface DatasetVersion {
  id: string;
  version: number;
  snapshot: Record<string, unknown>;
  createdAt: string;
  createdBy: string;
}

export interface ApprovalHistoryEntry {
  id: string;
  itemType: DatasetItemType;
  versionBefore: number;
  versionAfter: number;
  action: string;
  actor: string;
  notes: string | null;
  createdAt: string;
}

export interface DashboardMetricPoint {
  label: string;
  value: number;
  accentColor?: string | null;
  secondaryLabel?: string | null;
}

export interface DashboardStatusTrendPoint {
  date: string;
  approved: number;
  pending: number;
  rejected: number;
}

export interface DashboardSuiteListItem {
  id: string;
  title: string;
  projectName: string;
  moduleName: string;
  pageName: string;
  contributorName: string;
  caseCount: number;
  reviewStatus: GenerationReviewStatus;
  mode: string;
  createdAt: string;
  approvedAt?: string | null;
  confidence: number;
  draftId: string | null;
}

export interface DashboardReviewLoad {
  projectName: string;
  pendingDrafts: number;
  pendingCases: number;
}

export interface DashboardLowCoveragePage {
  projectName: string;
  moduleName: string;
  pageName: string;
  caseCount: number;
}

export interface DashboardTopContributor {
  name: string;
  caseCount: number;
  suiteCount: number;
  accentColor: string | null;
}

export interface DashboardSummary {
  kpis: {
    totalTestSuites: number;
    totalGeneratedTestCases: number;
    approvedTestCases: number;
    pendingReviewDrafts: number;
    rejectedDrafts: number;
    projectsCovered: number;
    modulesCovered: number;
    pagesCovered: number;
    approvalRate: number;
    averageConfidence: number;
  };
  charts: {
    casesByProject: DashboardMetricPoint[];
    casesByContributor: DashboardMetricPoint[];
    suitesByProject: DashboardMetricPoint[];
    draftStatusDistribution: DashboardMetricPoint[];
    taxonomyDistribution: DashboardMetricPoint[];
    generationModeDistribution: DashboardMetricPoint[];
    topModules: DashboardMetricPoint[];
    topPages: DashboardMetricPoint[];
    statusTrend: DashboardStatusTrendPoint[];
  };
  panels: {
    recentSuites: DashboardSuiteListItem[];
    recentApprovedSuites: DashboardSuiteListItem[];
    reviewLoadByProject: DashboardReviewLoad[];
    lowCoveragePages: DashboardLowCoveragePage[];
    topContributors: DashboardTopContributor[];
    actionItems: string[];
  };
}

export interface BulkRefinementResponse {
  requested: number;
  completed: number;
  failed: number;
  runIds: string[];
  draftIds: string[];
}

export interface RefinementRunSummary {
  id: string;
  itemType: DatasetItemType;
  itemId: string;
  itemTitle: string;
  mode: RefinementMode;
  model: string;
  status: 'pending' | 'completed' | 'failed';
  errorMessage: string | null;
  correlationId: string;
  createdAt: string;
  updatedAt: string;
  draftId: string | null;
}

export interface RefinementRunDetail extends RefinementRunSummary {
  requestPayload: Record<string, unknown>;
  rawResponse: unknown | null;
  parsedResponse: unknown | null;
}

export interface DiffEntry {
  path: string;
  before?: unknown;
  after?: unknown;
}

export interface DraftDiffSummary {
  added: DiffEntry[];
  removed: DiffEntry[];
  modified: DiffEntry[];
  aiSummary: string[];
}

export interface RefinementDraft {
  id: string;
  runId: string;
  itemType: DatasetItemType;
  itemId: string;
  itemTitle: string;
  mode: RefinementMode;
  model: string;
  reviewStatus: 'pending' | 'approved' | 'rejected';
  confidence: number;
  reviewerNotes: string | null;
  originalData: Record<string, unknown>;
  refinedData: Record<string, unknown>;
  diffSummary: DraftDiffSummary;
  createdAt: string;
  updatedAt: string;
}

export interface ImportFailure {
  index: number;
  componentId: string | null;
  componentName: string | null;
  message: string;
}

export interface ImportNormalizationSummary {
  namesTitleCased: number;
  categoriesNormalized: number;
  testTypesStandardized: number;
  arrayDuplicatesRemoved: number;
  emptyValuesRemoved: number;
}

export interface ComponentCatalogueImportSummary {
  dryRun: boolean;
  source: string;
  totalProcessed: number;
  inserted: number;
  updated: number;
  duplicates: number;
  failed: number;
  insertedIds: string[];
  updatedIds: string[];
  failures: ImportFailure[];
  normalization: ImportNormalizationSummary;
}

export interface GenerationKnowledgeBaseOption {
  id: string;
  title: string;
  summary: string | null;
  project?: KnowledgeScopeSummary | null;
  module?: KnowledgeScopeSummary | null;
  page?: KnowledgeScopeSummary | null;
  scopeLevel?: KnowledgeScopeLevel | null;
}

export interface GenerationContributorOption {
  id: string;
  name: string;
  roleTitle: string | null;
  department: string | null;
  location: string | null;
  accentColor: string | null;
  avatarUrl: string | null;
}

export interface GenerationProjectPageOption {
  id: string;
  name: string;
  description: string | null;
  features: GenerationProjectFeatureOption[];
}

export interface GenerationProjectFeatureOption {
  id: string;
  name: string;
  description: string | null;
}

export interface GenerationProjectModuleOption {
  id: string;
  name: string;
  description: string | null;
  pages: GenerationProjectPageOption[];
}

export interface GenerationProjectHierarchyOption {
  id: string;
  name: string;
  description: string | null;
  modules: GenerationProjectModuleOption[];
}

export interface GenerationKnowledgeBaseOptions {
  componentCatalogue: GenerationKnowledgeBaseOption[];
  featureType: GenerationKnowledgeBaseOption[];
  rulePack: GenerationKnowledgeBaseOption[];
  testTaxonomy: GenerationKnowledgeBaseOption[];
  scenarioTemplate: GenerationKnowledgeBaseOption[];
  projectMemory: GenerationKnowledgeBaseOption[];
  priorityMapping: GenerationKnowledgeBaseOption[];
  severityMapping: GenerationKnowledgeBaseOption[];
  synonymAlias: GenerationKnowledgeBaseOption[];
  contributors: GenerationContributorOption[];
  projectHierarchy: GenerationProjectHierarchyOption[];
}

export interface GenerationSourceInput {
  kind: SourceKind;
  label: string;
  filename?: string;
  mimeType?: string;
  contentText?: string;
  dataUrl?: string;
  url?: string;
  notes?: string;
}

export interface GenerationOptions {
  maxCases?: number;
  includeSmoke: boolean;
  includeFunctional: boolean;
  includeNegative: boolean;
  includeEdge: boolean;
  includeUsability: boolean;
  includeResponsiveness: boolean;
  includeCompatibility: boolean;
  targetBrowsers: string[];
  screenSizes: string[];
}

export interface GenerationSelectedDatasetIds {
  componentCatalogue: string[];
  featureType: string[];
  rulePack: string[];
  testTaxonomy: string[];
  scenarioTemplate: string[];
  projectMemory: string[];
  priorityMapping: string[];
  severityMapping: string[];
  synonymAlias: string[];
}

export interface GenerationSuiteContextInput {
  contributorId?: string;
  contributorName?: string;
  projectId?: string;
  projectName: string;
  moduleId?: string;
  moduleName: string;
  pageId?: string;
  pageName: string;
  featureId?: string;
  featureName?: string;
}

export interface GenerationUserFeatureInput {
  value: string;
}

export interface TestCaseStep {
  step: number;
  action: string;
  expectedResult: string;
}

export interface GeneratedTestCase {
  caseId: string;
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
  steps: TestCaseStep[];
  tags: string[];
  linkedComponents: string[];
  linkedFeatureTypes: string[];
  linkedRulePacks: string[];
  linkedTaxonomy: string[];
  sourceReferences: string[];
  notes: string;
  reviewStatus: GenerationReviewStatus;
  entrySource?: TestCaseEntrySource;
}

export interface TestCaseFeedback {
  id: string;
  draftId: string;
  runId: string;
  caseId: string;
  draftVersion: number;
  action: TestCaseFeedbackAction;
  reasonCode: TestCaseFeedbackReason | null;
  reasonDetails: string | null;
  replacementSummary: string | null;
  caseTitle: string;
  caseSnapshot: Record<string, unknown>;
  reviewerNotes: string | null;
  usedForLearning: boolean;
  createdBy: string;
  createdAt: string;
}

export interface CoverageGapSummaryEntry {
  key: string;
  label: string;
  expected?: number;
  actual?: number;
  missingScenarioTypes?: string[];
}

export interface CoverageAnalysis {
  overallScore: number;
  quotaStatus: 'met' | 'partially_met' | 'unmet';
  unitsIdentified: number;
  unitsCovered: number;
  missingRequestedFeatures: string[];
  missingBuckets: CoverageGapSummaryEntry[];
  underCoveredUnits: CoverageGapSummaryEntry[];
  missingScenarioTypesByUnit: CoverageGapSummaryEntry[];
  scoreByBucket: Record<string, number>;
  scoreByFeature: Record<string, number>;
  scoreByUnit: Record<string, number>;
  unknownAreas: string[];
  retryTriggered: boolean;
  retryTriggeredForMissingFeatures: boolean;
}

export interface KnowledgeSuggestion {
  id: string;
  type: KnowledgeSuggestionType;
  targetType: KnowledgeSuggestionTargetType;
  triggerType: string;
  status: KnowledgeSuggestionStatus;
  title: string;
  summary: string | null;
  rationale: string | null;
  evidence: Record<string, unknown>;
  proposedPayload: Record<string, unknown>;
  sourceDraftId: string | null;
  sourceRunId: string | null;
  sourceCaseId: string | null;
  targetDatasetItemId: string | null;
  targetDatasetItemTitle: string | null;
  targetDatasetItemType: DatasetItemType | null;
  project: KnowledgeScopeSummary | null;
  module: KnowledgeScopeSummary | null;
  page: KnowledgeScopeSummary | null;
  scopeLevel: KnowledgeScopeLevel | null;
  reviewerNotes: string | null;
  reviewedAt: string | null;
  reviewedBy: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  appliedAt: string | null;
  appliedBy: string | null;
  appliedDatasetItemId: string | null;
  appliedDatasetItemTitle: string | null;
  appliedRefinementRunId: string | null;
  appliedRefinementDraftId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GenerationSuiteContext {
  contributor: {
    id: string;
    name: string;
    roleTitle: string | null;
    accentColor: string | null;
  } | null;
  project: {
    id: string;
    name: string;
  } | null;
  module: {
    id: string;
    name: string;
  } | null;
  page: {
    id: string;
    name: string;
  } | null;
  feature: {
    id: string;
    name: string;
  } | null;
  path: string | null;
}

export interface TestGenerationRunSummary {
  id: string;
  title: string;
  mode: GenerationMode;
  model: string;
  status: GenerationRunStatus;
  errorMessage: string | null;
  correlationId: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  draftId: string | null;
  suiteContext: GenerationSuiteContext;
  progress: {
    phase: 'queued' | 'initial_generation' | 'coverage_validation' | 'remediation' | 'finalizing' | 'completed' | 'failed';
    completedBatches: number;
    totalBatches: number;
    generatedCaseCount: number;
    retryTriggered: boolean;
    previewTitles: string[];
  } | null;
}

export interface TestGenerationRunDetail extends TestGenerationRunSummary {
  requestPayload: Record<string, unknown>;
  sourceSummary: Record<string, unknown>;
  rawResponse: unknown | null;
  parsedResponse: unknown | null;
}

export interface TestGenerationDraft {
  id: string;
  runId: string;
  title: string;
  summary: string | null;
  version: number;
  mode: GenerationMode;
  model: string;
  reviewStatus: GenerationReviewStatus;
  confidence: number;
  reviewerNotes: string | null;
  suiteContext: GenerationSuiteContext;
  inferredContext: {
    components: string[];
    featureTypes: string[];
    rulePacks: string[];
    taxonomy: string[];
    scenarios: string[];
    integrations: string[];
    assumptions: string[];
    gaps: string[];
  };
  coverageSummary: string[];
  coverageAnalysis: CoverageAnalysis | null;
  testCases: GeneratedTestCase[];
  testCaseFeedback: TestCaseFeedback[];
  approvedAt: string | null;
  approvedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TestGenerationDraftVersion {
  id: string;
  version: number;
  snapshot: Record<string, unknown>;
  createdAt: string;
  createdBy: string;
}

export type TestcaseLibraryNodeKind = 'client' | 'module' | 'page' | 'feature';

export interface TestcaseLibraryNode {
  id: string;
  name: string;
  kind: TestcaseLibraryNodeKind;
  path: string;
  qaOwners: string[];
  approvedSuiteCount: number;
  approvedCaseCount: number;
  scope: {
    projectId: string | null;
    moduleId: string | null;
    pageId: string | null;
    featureId: string | null;
  };
  children: TestcaseLibraryNode[];
}

export interface TestcaseLibraryResponse {
  summary: {
    clientCount: number;
    moduleCount: number;
    pageCount: number;
    featureCount: number;
    approvedSuiteCount: number;
    approvedCaseCount: number;
  };
  items: TestcaseLibraryNode[];
}

export interface LearningSuggestionListResponse extends PaginatedResponse<KnowledgeSuggestion> {}

export interface ManualExecutionBootstrap {
  projectHierarchy: ProjectHierarchyOption[];
  testerOptions: Array<{
    id: string;
    name: string;
    roleTitle: string | null;
  }>;
  summary: {
    approvedSuiteCount: number;
    inProgressRunCount: number;
    completedRunCount: number;
  };
}

export interface ManualExecutionImportedCase {
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
}

export interface ManualExecutionUploadedSuite {
  tempId: string;
  sourceType: 'uploadedDocument';
  sourceFileName: string;
  title: string;
  summary: string | null;
  caseCount: number;
  cases: ManualExecutionImportedCase[];
}

export interface ManualExecutionSelectableCase {
  sourceCaseId: string;
  title: string;
  feature: string;
  scenario: string;
  testType: string;
  priority: string;
  severity: string;
  notes: string | null;
}

export interface ApprovedExecutionSuite {
  id: string;
  runId: string;
  title: string;
  summary: string | null;
  version: number;
  caseCount: number;
  approvedAt: string | null;
  approvedBy: string | null;
  suiteContext: {
    project: KnowledgeScopeSummary | null;
    module: KnowledgeScopeSummary | null;
    page: KnowledgeScopeSummary | null;
    feature: KnowledgeScopeSummary | null;
    path: string | null;
  };
  cases: ManualExecutionSelectableCase[];
}

export interface ManualExecutionRunTotals {
  total: number;
  untested: number;
  passed: number;
  failed: number;
  skipped: number;
  completionPercent: number;
}

export interface ManualExecutionRunSummary {
  id: string;
  name: string;
  status: ManualExecutionRunStatus;
  project: KnowledgeScopeSummary;
  module: KnowledgeScopeSummary | null;
  page: KnowledgeScopeSummary | null;
  feature: KnowledgeScopeSummary | null;
  environment: string | null;
  buildVersion: string | null;
  assignedTester: string | null;
  notes: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
  completedBy: string | null;
  suiteCount: number;
  totals: ManualExecutionRunTotals;
}

export interface ManualExecutionRunSuite {
  id: string;
  sourceType: 'approvedSuite' | 'uploadedDocument';
  sourceDraftId: string | null;
  sourceRunId: string | null;
  sourceDraftVersion: number | null;
  sourceFileName: string | null;
  suiteTitle: string;
  suiteSummary: string | null;
  suitePath: string | null;
  sourceProjectName: string | null;
  sourceModuleName: string | null;
  sourcePageName: string | null;
  sourceFeatureId: string | null;
  sourceFeatureName: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  caseCount: number;
  orderIndex: number;
}

export interface ManualExecutionCaseResult {
  id: string;
  runId: string;
  runSuiteId: string;
  suiteTitle: string;
  sourceCaseId: string;
  orderIndex: number;
  title: string;
  objective: string;
  feature: string;
  scenario: string;
  testType: string;
  priority: string;
  severity: string;
  automationCandidate: boolean;
  tags: string[];
  sourceReferences: string[];
  notes: string | null;
  caseSnapshot: Record<string, unknown>;
  status: ManualExecutionCaseStatus;
  comment: string | null;
  defectLink: string | null;
  executedAt: string | null;
  executedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ManualExecutionRunDetail extends ManualExecutionRunSummary {
  suites: ManualExecutionRunSuite[];
  caseResults: ManualExecutionCaseResult[];
}

export interface ManualExecutionReportMetric {
  label: string;
  value: number;
  color: string;
}

export interface ManualExecutionReportBreakdown {
  label: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  untested: number;
}

export interface ManualExecutionReportValue {
  label: string;
  value: number;
}

export interface ManualExecutionReport {
  run: ManualExecutionRunSummary & {
    suites: ManualExecutionRunSuite[];
  };
  charts: {
    statusBreakdown: ManualExecutionReportMetric[];
    bySuite: ManualExecutionReportBreakdown[];
    failuresByFeature: ManualExecutionReportValue[];
    failuresBySeverity: ManualExecutionReportValue[];
  };
  caseResults: ManualExecutionCaseResult[];
}
