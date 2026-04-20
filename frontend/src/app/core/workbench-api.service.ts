import { HttpClient, HttpParams } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';

import { environment } from '../../environments/environment';
import type {
  ApprovalHistoryEntry,
  ApprovedExecutionSuite,
  AdminUserRecord,
  AdminProjectRecord,
  AdminProjectModuleRecord,
  AdminProjectPageRecord,
  AdminProjectFeatureRecord,
  AdminProjectQuarterAllocation,
  BulkRefinementResponse,
  ComponentCatalogueImportSummary,
  CoverageAnalysis,
  AuthConfig,
  DashboardSummary,
  DatasetItem,
  DatasetItemType,
  DatasetStatus,
  DatasetVersion,
  ExportFormat,
  PaginatedResponse,
  RefinementDraft,
  RefinementMode,
  RefinementRunDetail,
  RefinementRunSummary,
  GenerationKnowledgeBaseOptions,
  GenerationMode,
  GenerationOptions,
  GenerationSelectedDatasetIds,
  GenerationSuiteContextInput,
  GenerationSourceInput,
  KnowledgeAsset,
  KnowledgeAssetUpsertInput,
  KnowledgeBaseWorkspace,
  KnowledgeSuggestion,
  LearningSuggestionListResponse,
  ManualExecutionBootstrap,
  ManualExecutionCaseResult,
  ManualExecutionCaseStatus,
  ManualExecutionImportedCase,
  ManualExecutionReport,
  ManualExecutionRunDetail,
  ManualExecutionRunSummary,
  ManualExecutionUploadedSuite,
  TestCaseFeedback,
  TestCaseFeedbackReason,
  TestGenerationDraft,
  TestGenerationDraftVersion,
  TestGenerationRunDetail,
  TestGenerationRunSummary,
  TestcaseLibraryResponse,
  CurrentUserProfile,
} from './models';

type DatasetListQuery = {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: DatasetStatus;
  includeArchived?: boolean;
};

@Injectable({ providedIn: 'root' })
export class WorkbenchApiService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = environment.apiBaseUrl;

  getAuthConfig() {
    return this.http.get<AuthConfig>(`${this.apiBaseUrl}/auth/config`);
  }

  getCurrentUser() {
    return this.http.get<{ user: CurrentUserProfile }>(`${this.apiBaseUrl}/auth/me`);
  }

  listAdminUsers() {
    return this.http.get<{ items: AdminUserRecord[] }>(`${this.apiBaseUrl}/admin/users`);
  }

  deleteAdminUser(userId: string) {
    return this.http.delete<{ success: true }>(`${this.apiBaseUrl}/admin/users/${userId}`);
  }

  deleteAdminProject(projectId: string) {
    return this.http.delete<{ success: true }>(`${this.apiBaseUrl}/admin/projects/${projectId}`);
  }

  createAdminUser(body: {
    email: string;
    name: string;
    role: 'ADMIN' | 'USER';
    pageAccesses: string[];
    isActive: boolean;
    designation?: string | null;
  }) {
    return this.http.post<{ user: AdminUserRecord }>(`${this.apiBaseUrl}/admin/users`, body);
  }

  updateAdminUser(
    userId: string,
    body: {
      email: string;
      name: string;
      role: 'ADMIN' | 'USER';
      pageAccesses: string[];
      isActive: boolean;
      designation?: string | null;
    },
  ) {
    return this.http.put<{ user: AdminUserRecord }>(`${this.apiBaseUrl}/admin/users/${userId}`, body);
  }

  listProjectQuarterAllocations() {
    return this.http.get<{ items: AdminProjectQuarterAllocation[] }>(`${this.apiBaseUrl}/admin/project-allocations`);
  }

  upsertProjectQuarterAllocation(body: {
    projectId: string;
    year: number;
    quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
    testerContributorIds: string[];
  }) {
    return this.http.post<{ items: AdminProjectQuarterAllocation[] }>(
      `${this.apiBaseUrl}/admin/project-allocations`,
      body,
    );
  }

  syncProjectQuarterAllocations(body: {
    projectId: string;
    years: number[];
    quarters: Array<'Q1' | 'Q2' | 'Q3' | 'Q4'>;
    testerContributorIds: string[];
  }) {
    return this.http.post<{ items: AdminProjectQuarterAllocation[] }>(
      `${this.apiBaseUrl}/admin/project-allocations/sync`,
      body,
    );
  }

  createAdminProject(body: { name: string; description?: string | null }) {
    return this.http.post<{ project: AdminProjectRecord }>(`${this.apiBaseUrl}/admin/projects`, body);
  }

  updateAdminProject(projectId: string, body: { name: string; description?: string | null }) {
    return this.http.put<{ project: AdminProjectRecord }>(`${this.apiBaseUrl}/admin/projects/${projectId}`, body);
  }

  createAdminModule(body: { projectId: string; name: string; description?: string | null }) {
    return this.http.post<{ module: AdminProjectModuleRecord }>(`${this.apiBaseUrl}/admin/modules`, body);
  }

  updateAdminModule(moduleId: string, body: { projectId: string; name: string; description?: string | null }) {
    return this.http.put<{ module: AdminProjectModuleRecord }>(`${this.apiBaseUrl}/admin/modules/${moduleId}`, body);
  }

  deleteAdminModule(moduleId: string) {
    return this.http.delete<{ success: true }>(`${this.apiBaseUrl}/admin/modules/${moduleId}`);
  }

  createAdminPage(body: { moduleId: string; name: string; description?: string | null }) {
    return this.http.post<{ page: AdminProjectPageRecord }>(`${this.apiBaseUrl}/admin/pages`, body);
  }

  updateAdminPage(pageId: string, body: { moduleId: string; name: string; description?: string | null }) {
    return this.http.put<{ page: AdminProjectPageRecord }>(`${this.apiBaseUrl}/admin/pages/${pageId}`, body);
  }

  deleteAdminPage(pageId: string) {
    return this.http.delete<{ success: true }>(`${this.apiBaseUrl}/admin/pages/${pageId}`);
  }

  createAdminFeature(body: { pageId: string; name: string; description?: string | null }) {
    return this.http.post<{ feature: AdminProjectFeatureRecord }>(`${this.apiBaseUrl}/admin/features`, body);
  }

  updateAdminFeature(featureId: string, body: { pageId: string; name: string; description?: string | null }) {
    return this.http.put<{ feature: AdminProjectFeatureRecord }>(`${this.apiBaseUrl}/admin/features/${featureId}`, body);
  }

  deleteAdminFeature(featureId: string) {
    return this.http.delete<{ success: true }>(`${this.apiBaseUrl}/admin/features/${featureId}`);
  }

  getDashboard() {
    return this.http.get<DashboardSummary>(`${this.apiBaseUrl}/dashboard`);
  }

  listItems(itemType: DatasetItemType, query: DatasetListQuery) {
    return this.http.get<PaginatedResponse<DatasetItem>>(`${this.apiBaseUrl}/datasets/${itemType}`, {
      params: this.buildParams(query),
    });
  }

  getItem(itemType: DatasetItemType, id: string) {
    return this.http.get<{ item: DatasetItem }>(`${this.apiBaseUrl}/datasets/${itemType}/${id}`);
  }

  createItem(
    itemType: DatasetItemType,
    payload: Record<string, unknown>,
    status: DatasetStatus,
    scope?: { projectId?: string; moduleId?: string; pageId?: string; scopeLevel?: 'project' | 'module' | 'page' | null },
  ) {
    return this.http.post<{ item: DatasetItem }>(`${this.apiBaseUrl}/datasets/${itemType}`, {
      payload,
      status,
      ...(scope?.projectId ? { projectId: scope.projectId } : {}),
      ...(scope?.moduleId ? { moduleId: scope.moduleId } : {}),
      ...(scope?.pageId ? { pageId: scope.pageId } : {}),
      ...(scope?.scopeLevel ? { scopeLevel: scope.scopeLevel } : {}),
    });
  }

  updateItem(
    itemType: DatasetItemType,
    id: string,
    payload: Record<string, unknown>,
    status: DatasetStatus,
    scope?: { projectId?: string; moduleId?: string; pageId?: string; scopeLevel?: 'project' | 'module' | 'page' | null },
  ) {
    return this.http.put<{ item: DatasetItem }>(`${this.apiBaseUrl}/datasets/${itemType}/${id}`, {
      payload,
      status,
      ...(scope?.projectId ? { projectId: scope.projectId } : {}),
      ...(scope?.moduleId ? { moduleId: scope.moduleId } : {}),
      ...(scope?.pageId ? { pageId: scope.pageId } : {}),
      ...(scope?.scopeLevel ? { scopeLevel: scope.scopeLevel } : {}),
    });
  }

  cloneItem(itemType: DatasetItemType, id: string) {
    return this.http.post<{ item: DatasetItem }>(`${this.apiBaseUrl}/datasets/${itemType}/${id}/clone`, {});
  }

  archiveItem(itemType: DatasetItemType, id: string, notes = '') {
    return this.http.post<{ item: DatasetItem }>(`${this.apiBaseUrl}/datasets/${itemType}/${id}/archive`, { notes });
  }

  restoreItem(itemType: DatasetItemType, id: string, notes = '') {
    return this.http.post<{ item: DatasetItem }>(`${this.apiBaseUrl}/datasets/${itemType}/${id}/restore`, { notes });
  }

  deleteItem(itemType: DatasetItemType, id: string) {
    return this.http.delete<{ success: true }>(`${this.apiBaseUrl}/datasets/${itemType}/${id}`);
  }

  getVersions(itemType: DatasetItemType, id: string) {
    return this.http.get<{ items: DatasetVersion[] }>(`${this.apiBaseUrl}/datasets/${itemType}/${id}/versions`);
  }

  getApprovals(itemType: DatasetItemType, id: string) {
    return this.http.get<{ items: ApprovalHistoryEntry[] }>(`${this.apiBaseUrl}/datasets/${itemType}/${id}/approvals`);
  }

  bulkRefine(itemType: DatasetItemType, itemIds: string[], mode: RefinementMode) {
    return this.http.post<BulkRefinementResponse>(`${this.apiBaseUrl}/refinement/bulk`, {
      itemType,
      itemIds,
      mode,
    });
  }

  listDrafts(query: { page?: number; pageSize?: number; itemType?: DatasetItemType; reviewStatus?: string }) {
    return this.http.get<PaginatedResponse<RefinementDraft>>(`${this.apiBaseUrl}/refinement/drafts`, {
      params: this.buildParams(query),
    });
  }

  getDraft(draftId: string) {
    return this.http.get<{ draft: RefinementDraft }>(`${this.apiBaseUrl}/refinement/drafts/${draftId}`);
  }

  approveDraft(draftId: string, notes = '') {
    return this.http.post<{ draft: RefinementDraft; item?: DatasetItem }>(
      `${this.apiBaseUrl}/refinement/drafts/${draftId}/approve`,
      { notes },
    );
  }

  rejectDraft(draftId: string, notes = '') {
    return this.http.post<{ draft: RefinementDraft }>(`${this.apiBaseUrl}/refinement/drafts/${draftId}/reject`, {
      notes,
    });
  }

  listRuns(query: { page?: number; pageSize?: number; itemType?: DatasetItemType; status?: string }) {
    return this.http.get<PaginatedResponse<RefinementRunSummary>>(`${this.apiBaseUrl}/refinement/runs`, {
      params: this.buildParams(query),
    });
  }

  getRun(runId: string) {
    return this.http.get<{ run: RefinementRunDetail }>(`${this.apiBaseUrl}/refinement/runs/${runId}`);
  }

  exportDataset(itemType?: DatasetItemType, format: ExportFormat = 'xlsx') {
    let params = new HttpParams().set('format', format);
    if (itemType) {
      params = params.set('itemType', itemType);
    }
    return this.http.get(`${this.apiBaseUrl}/export`, {
      params,
      responseType: 'blob',
    });
  }

  importComponentCatalogue(body: { jsonText?: string; filePath?: string; dryRun?: boolean }) {
    return this.http.post<{ summary: ComponentCatalogueImportSummary }>(
      `${this.apiBaseUrl}/import/component-catalogue`,
      body,
    );
  }

  getKnowledgeBaseWorkspace(includeArchived = true) {
    return this.http.get<KnowledgeBaseWorkspace>(`${this.apiBaseUrl}/knowledge-base/workspace`, {
      params: this.buildParams({ includeArchived }),
    });
  }

  createKnowledgeAsset(body: KnowledgeAssetUpsertInput) {
    return this.http.post<{ asset: KnowledgeAsset }>(`${this.apiBaseUrl}/knowledge-base/assets`, body);
  }

  updateKnowledgeAsset(assetId: string, body: KnowledgeAssetUpsertInput) {
    return this.http.put<{ asset: KnowledgeAsset }>(`${this.apiBaseUrl}/knowledge-base/assets/${assetId}`, body);
  }

  deleteKnowledgeAsset(assetId: string) {
    return this.http.delete<{ success: true }>(`${this.apiBaseUrl}/knowledge-base/assets/${assetId}`);
  }

  createKnowledgeAssetLink(assetId: string, datasetItemId: string, notes = '') {
    return this.http.post<{ asset: KnowledgeAsset }>(`${this.apiBaseUrl}/knowledge-base/assets/${assetId}/links`, {
      datasetItemId,
      notes,
    });
  }

  deleteKnowledgeAssetLink(assetId: string, linkId: string) {
    return this.http.delete<{ asset: KnowledgeAsset }>(
      `${this.apiBaseUrl}/knowledge-base/assets/${assetId}/links/${linkId}`,
    );
  }

  getGenerationKnowledgeBase() {
    return this.http.get<GenerationKnowledgeBaseOptions>(`${this.apiBaseUrl}/test-generation/knowledge-base`);
  }

  createGenerationRun(body: {
    title: string;
    description: string;
    mode: GenerationMode;
    sourceInputs: GenerationSourceInput[];
    userFeatures?: string[];
    suiteContext: GenerationSuiteContextInput;
    selectedDatasetIds: GenerationSelectedDatasetIds;
    generationOptions: GenerationOptions;
  }) {
    return this.http.post<{ run: TestGenerationRunSummary }>(
      `${this.apiBaseUrl}/test-generation/runs`,
      body,
    );
  }

  listGenerationRuns(query: { page?: number; pageSize?: number; status?: string; mode?: GenerationMode; search?: string }) {
    return this.http.get<PaginatedResponse<TestGenerationRunSummary>>(`${this.apiBaseUrl}/test-generation/runs`, {
      params: this.buildParams(query),
    });
  }

  getGenerationRun(runId: string) {
    return this.http.get<{ run: TestGenerationRunDetail }>(`${this.apiBaseUrl}/test-generation/runs/${runId}`);
  }

  stopGenerationRun(runId: string) {
    return this.http.post<{ run: TestGenerationRunSummary }>(
      `${this.apiBaseUrl}/test-generation/runs/${runId}/stop`,
      {},
    );
  }

  regenerateGenerationRun(runId: string) {
    return this.http.post<{ run: TestGenerationRunSummary }>(
      `${this.apiBaseUrl}/test-generation/runs/${runId}/regenerate`,
      {},
    );
  }

  listGenerationDrafts(query: { page?: number; pageSize?: number; reviewStatus?: string }) {
    return this.http.get<PaginatedResponse<TestGenerationDraft>>(`${this.apiBaseUrl}/test-generation/drafts`, {
      params: this.buildParams(query),
    });
  }

  getGenerationDraft(draftId: string) {
    return this.http.get<{ draft: TestGenerationDraft }>(`${this.apiBaseUrl}/test-generation/drafts/${draftId}`);
  }

  updateGenerationDraft(
    draftId: string,
    body: {
      suiteTitle: string;
      suiteSummary: string;
      inferredComponents: string[];
      inferredFeatureTypes: string[];
      inferredRulePacks: string[];
      inferredTaxonomy: string[];
      inferredScenarios: string[];
      inferredIntegrations: string[];
      assumptions: string[];
      gaps: string[];
      coverageSummary: string[];
      coverageAnalysis?: CoverageAnalysis | null;
      confidence: number;
      testCases: TestGenerationDraft['testCases'];
      reviewerNotes: string;
    },
  ) {
    return this.http.put<{ draft: TestGenerationDraft }>(`${this.apiBaseUrl}/test-generation/drafts/${draftId}`, body);
  }

  approveGenerationDraft(draftId: string, notes = '') {
    return this.http.post<{ draft: TestGenerationDraft }>(
      `${this.apiBaseUrl}/test-generation/drafts/${draftId}/approve`,
      { notes },
    );
  }

  rejectGenerationDraft(draftId: string, notes = '') {
    return this.http.post<{ draft: TestGenerationDraft }>(
      `${this.apiBaseUrl}/test-generation/drafts/${draftId}/reject`,
      { notes },
    );
  }

  approveGenerationTestCase(draftId: string, caseId: string, body?: { reviewerNotes?: string }) {
    return this.http.post<{ draft: TestGenerationDraft; feedback: TestCaseFeedback }>(
      `${this.apiBaseUrl}/test-generation/drafts/${draftId}/test-cases/${encodeURIComponent(caseId)}/approve`,
      body ?? {},
    );
  }

  rejectGenerationTestCase(
    draftId: string,
    caseId: string,
    body: {
      reasonCode: TestCaseFeedbackReason;
      reasonDetails?: string;
      replacementSummary?: string;
      reviewerNotes?: string;
    },
  ) {
    return this.http.post<{ draft: TestGenerationDraft; feedback: TestCaseFeedback }>(
      `${this.apiBaseUrl}/test-generation/drafts/${draftId}/test-cases/${encodeURIComponent(caseId)}/reject`,
      body,
    );
  }

  getGenerationTestCaseFeedback(draftId: string, caseId: string) {
    return this.http.get<{ items: TestCaseFeedback[] }>(
      `${this.apiBaseUrl}/test-generation/drafts/${draftId}/test-cases/${encodeURIComponent(caseId)}/feedback`,
    );
  }

  promoteGenerationTestCase(
    draftId: string,
    caseId: string,
    body: { targetType?: 'projectMemory' | 'componentCatalogue' | 'scenarioTemplate' | 'rulePack'; notes?: string },
  ) {
    return this.http.post<{ suggestion: KnowledgeSuggestion }>(
      `${this.apiBaseUrl}/test-generation/drafts/${draftId}/test-cases/${encodeURIComponent(caseId)}/promote`,
      body,
    );
  }

  listLearningSuggestions(query: { page?: number; pageSize?: number; status?: string; type?: string; targetType?: string }) {
    return this.http.get<LearningSuggestionListResponse>(`${this.apiBaseUrl}/learning/suggestions`, {
      params: this.buildParams(query),
    });
  }

  approveLearningSuggestion(suggestionId: string, notes = '') {
    return this.http.post<{ suggestion: KnowledgeSuggestion; item?: DatasetItem; draft?: unknown }>(
      `${this.apiBaseUrl}/learning/suggestions/${suggestionId}/approve`,
      { notes },
    );
  }

  rejectLearningSuggestion(suggestionId: string, notes = '') {
    return this.http.post<{ suggestion: KnowledgeSuggestion }>(
      `${this.apiBaseUrl}/learning/suggestions/${suggestionId}/reject`,
      { notes },
    );
  }

  createManualRecoveryDraft(draftId: string) {
    return this.http.post<{ run: TestGenerationRunSummary; draft: TestGenerationDraft }>(
      `${this.apiBaseUrl}/test-generation/drafts/${draftId}/manual-recovery`,
      {},
    );
  }

  getGenerationDraftVersions(draftId: string) {
    return this.http.get<{ items: TestGenerationDraftVersion[] }>(
      `${this.apiBaseUrl}/test-generation/drafts/${draftId}/versions`,
    );
  }

  getTestcaseLibrary() {
    return this.http.get<TestcaseLibraryResponse>(`${this.apiBaseUrl}/test-generation/library`);
  }

  exportGeneratedTestCases(
    options?: {
      draftId?: string;
      projectId?: string;
      moduleId?: string;
      pageId?: string;
      featureId?: string;
    },
    format: ExportFormat = 'csv',
  ) {
    let params = new HttpParams().set('format', format);

    if (options?.draftId) {
      params = params.set('draftId', options.draftId);
    }
    if (options?.projectId) {
      params = params.set('projectId', options.projectId);
    }
    if (options?.moduleId) {
      params = params.set('moduleId', options.moduleId);
    }
    if (options?.pageId) {
      params = params.set('pageId', options.pageId);
    }
    if (options?.featureId) {
      params = params.set('featureId', options.featureId);
    }
    return this.http.get(`${this.apiBaseUrl}/test-generation/export`, {
      params,
      responseType: 'blob',
    });
  }

  getManualExecutionBootstrap() {
    return this.http.get<ManualExecutionBootstrap>(`${this.apiBaseUrl}/manual-execution/bootstrap`);
  }

  listApprovedExecutionSuites(query: { projectId: string; moduleId?: string; pageId?: string; featureId?: string }) {
    return this.http.get<{ items: ApprovedExecutionSuite[] }>(`${this.apiBaseUrl}/manual-execution/approved-suites`, {
      params: this.buildParams(query),
    });
  }

  listManualExecutionRuns(query: { page?: number; pageSize?: number; projectId?: string; status?: ManualExecutionRunSummary['status'] }) {
    return this.http.get<PaginatedResponse<ManualExecutionRunSummary>>(`${this.apiBaseUrl}/manual-execution/runs`, {
      params: this.buildParams(query),
    });
  }

  importManualExecutionTestcases(body: {
    fileName: string;
    mimeType?: string;
    dataUrl: string;
  }) {
    return this.http.post<{ suites: ManualExecutionUploadedSuite[] }>(`${this.apiBaseUrl}/manual-execution/import-testcases`, body);
  }

  createManualExecutionRun(body: {
    name: string;
    projectId?: string;
    projectName?: string;
    moduleId?: string;
    moduleName?: string;
    pageId?: string;
    pageName?: string;
    featureId?: string;
    featureName?: string;
    suiteIds: string[];
    suiteSelections?: Array<{
      suiteId: string;
      caseIds: string[];
    }>;
    uploadedSuites?: Array<{
      tempId: string;
      sourceType: 'uploadedDocument';
      sourceFileName: string;
      title: string;
      summary: string | null;
      caseCount: number;
      cases: ManualExecutionImportedCase[];
    }>;
    environment?: string;
    buildVersion?: string;
    assignedTester?: string;
    notes?: string;
  }) {
    return this.http.post<{ run: ManualExecutionRunDetail }>(`${this.apiBaseUrl}/manual-execution/runs`, body);
  }

  getManualExecutionRun(runId: string) {
    return this.http.get<{ run: ManualExecutionRunDetail }>(`${this.apiBaseUrl}/manual-execution/runs/${runId}`);
  }

  deleteManualExecutionRun(runId: string) {
    return this.http.delete<{ success: true }>(`${this.apiBaseUrl}/manual-execution/runs/${runId}`);
  }

  updateManualExecutionCaseResult(
    runId: string,
    caseResultId: string,
    body: {
      status: ManualExecutionCaseStatus;
      comment?: string;
      defectLink?: string;
    },
  ) {
    return this.http.patch<{ run: ManualExecutionRunSummary; caseResult: ManualExecutionCaseResult | null }>(
      `${this.apiBaseUrl}/manual-execution/runs/${runId}/cases/${caseResultId}`,
      body,
    );
  }

  completeManualExecutionRun(runId: string) {
    return this.http.post<{ run: ManualExecutionRunDetail }>(`${this.apiBaseUrl}/manual-execution/runs/${runId}/complete`, {});
  }

  getManualExecutionReport(runId: string) {
    return this.http.get<ManualExecutionReport>(`${this.apiBaseUrl}/manual-execution/runs/${runId}/report`);
  }

  exportManualExecutionRun(runId: string, format: 'csv' | 'xlsx' = 'xlsx') {
    return this.http.get(`${this.apiBaseUrl}/manual-execution/runs/${runId}/export`, {
      params: this.buildParams({ format }),
      responseType: 'blob',
    });
  }

  private buildParams(query: Record<string, unknown>) {
    let params = new HttpParams();

    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        params = params.set(key, String(value));
      }
    }

    return params;
  }
}
