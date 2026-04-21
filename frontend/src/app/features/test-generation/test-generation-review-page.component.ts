import { CommonModule } from '@angular/common';
import { animate, style, transition, trigger } from '@angular/animations';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AbstractControl, FormArray, FormBuilder, ReactiveFormsModule, Validators, ValidationErrors } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatDialog } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TextFieldModule } from '@angular/cdk/text-field';
import { forkJoin, of } from 'rxjs';
import { switchMap } from 'rxjs/operators';

import type {
  CoverageAnalysis,
  GeneratedTestCase,
  GenerationReviewStatus,
  KnowledgeSuggestionTargetType,
  TestCaseFeedback,
  TestCaseFeedbackReason,
  TestGenerationDraft,
} from '../../core/models';
import { GenerationMonitorService } from '../../core/generation-monitor.service';
import { NotificationService } from '../../core/notification.service';
import { WorkbenchApiService } from '../../core/workbench-api.service';
import { EmptyStateComponent } from '../../shared/components/empty-state.component';
import { StatusBadgeComponent } from '../../shared/components/status-badge.component';
import { CoverageAnalysisDialogComponent } from '../../shared/components/coverage-analysis-dialog.component';
import {
  TestcaseRejectionDialogComponent,
  type TestcaseRejectionDialogResult,
} from '../../shared/components/testcase-rejection-dialog.component';

@Component({
  selector: 'app-test-generation-review-page',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    CommonModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatCardModule,
    MatFormFieldModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatTooltipModule,
    TextFieldModule,
    EmptyStateComponent,
    StatusBadgeComponent,
  ],
  animations: [
    trigger('caseContentTransition', [
      transition(':enter', [
        style({
          opacity: 0,
          transform: 'translateY(-8px) scale(0.992)',
        }),
        animate(
          '220ms cubic-bezier(0.2, 0.8, 0.2, 1)',
          style({
            opacity: 1,
            transform: 'translateY(0) scale(1)',
          }),
        ),
      ]),
      transition(':leave', [
        animate(
          '160ms cubic-bezier(0.4, 0, 0.2, 1)',
          style({
            opacity: 0,
            transform: 'translateY(-5px) scale(0.994)',
          }),
        ),
      ]),
    ]),
    trigger('caseDetailTransition', [
      transition(':enter', [
        style({
          opacity: 0,
          height: 0,
          marginTop: 0,
          transform: 'translateY(-8px) scale(0.995)',
        }),
        animate(
          '240ms cubic-bezier(0.2, 0.8, 0.2, 1)',
          style({
            opacity: 1,
            height: '*',
            marginTop: '*',
            transform: 'translateY(0) scale(1)',
          }),
        ),
      ]),
      transition(':leave', [
        style({
          opacity: 1,
          height: '*',
          marginTop: '*',
          transform: 'translateY(0)',
        }),
        animate(
          '170ms cubic-bezier(0.4, 0, 0.2, 1)',
          style({
            opacity: 0,
            height: 0,
            marginTop: 0,
            transform: 'translateY(-6px) scale(0.996)',
          }),
        ),
      ]),
    ]),
  ],
  templateUrl: './test-generation-review-page.component.html',
  styleUrls: ['./test-generation-review-page.component.scss'],
})
export class TestGenerationReviewPageComponent {
  private static readonly CASE_TITLE_MAX_LENGTH = 500;

  private readonly api = inject(WorkbenchApiService);
  private readonly generationMonitor = inject(GenerationMonitorService);
  private readonly notifications = inject(NotificationService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);
  private readonly fb = inject(FormBuilder);
  private readonly destroyRef = inject(DestroyRef);

  readonly drafts = signal<TestGenerationDraft[]>([]);
  readonly selectedDraft = signal<TestGenerationDraft | null>(null);
  readonly draftSelectionId = signal<string | null>(null);
  readonly draftSearchTerm = signal('');
  readonly draftStatusFilter = signal<GenerationReviewStatus | 'all'>('all');
  readonly suiteEditMode = signal(false);
  readonly selectedCaseIndex = signal(-1);
  readonly loading = signal(true);
  readonly draftExporting = signal(false);
  readonly draftDeleting = signal(false);
  readonly caseSavingIndex = signal<number | null>(null);
  readonly caseSaveActionType = signal<'save' | 'delete' | null>(null);
  readonly caseReviewActionIndex = signal<number | null>(null);
  readonly caseReviewActionType = signal<'approve' | 'reject' | null>(null);
  readonly casePromotionIndex = signal<number | null>(null);
  readonly coverageFocus = signal<{ kind: 'feature' | 'bucket' | 'unit' | 'unknown' | null; key: string | null }>({
    kind: null,
    key: null,
  });
  readonly rejectionReasonOptions: Array<{ value: TestCaseFeedbackReason; label: string }> = [
    { value: 'missing_coverage', label: 'Missing coverage' },
    { value: 'wrong_logic', label: 'Wrong logic' },
    { value: 'wrong_assumption', label: 'Wrong assumption' },
    { value: 'duplicate', label: 'Duplicate testcase' },
    { value: 'poor_wording', label: 'Poor wording' },
    { value: 'wrong_priority_or_severity', label: 'Wrong priority or severity' },
    { value: 'not_applicable', label: 'Not applicable' },
    { value: 'other', label: 'Other' },
  ];
  readonly promotionTargetOptions: Array<{ value: KnowledgeSuggestionTargetType; label: string }> = [
    { value: 'projectMemory', label: 'Project memory' },
    { value: 'componentCatalogue', label: 'Component baseline' },
    { value: 'scenarioTemplate', label: 'Scenario template' },
    { value: 'rulePack', label: 'Rule pack' },
  ];
  private readonly trimmedRequiredValidator = (control: AbstractControl): ValidationErrors | null =>
    String(control.value ?? '').trim() ? null : { required: true };

  readonly form = this.fb.nonNullable.group({
    suiteTitle: ['', Validators.required],
    suiteSummary: [''],
    confidence: [0.75],
    inferredComponents: [''],
    inferredFeatureTypes: [''],
    inferredRulePacks: [''],
    inferredTaxonomy: [''],
    inferredScenarios: [''],
    inferredIntegrations: [''],
    assumptions: [''],
    gaps: [''],
    coverageSummary: [''],
    reviewerNotes: [''],
    testCases: this.fb.array([]),
  });

  readonly caseArray = this.form.controls.testCases as FormArray;
  readonly filteredDrafts = computed(() => {
    const searchTerm = this.draftSearchTerm().trim().toLowerCase();
    const statusFilter = this.draftStatusFilter();

    return this.drafts().filter((draft) => {
      const matchesStatus = statusFilter === 'all' ? true : draft.reviewStatus === statusFilter;
      const matchesSearch =
        !searchTerm ||
        [
          draft.title,
          draft.suiteContext.project?.name,
          draft.suiteContext.module?.name,
          draft.suiteContext.page?.name,
          draft.suiteContext.feature?.name,
          draft.suiteContext.path,
        ]
          .filter(Boolean)
          .some((token) => String(token).toLowerCase().includes(searchTerm));

      return matchesStatus && matchesSearch;
    });
  });

  constructor() {
    this.route.queryParamMap
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        switchMap((params) => {
          const draftId = params.get('draftId');
          return forkJoin({
            drafts: this.api.listGenerationDrafts({ page: 1, pageSize: 50 }),
            selected: draftId ? this.api.getGenerationDraft(draftId) : of(null),
          });
        }),
      )
      .subscribe({
        next: (result) => {
          const previousDraftId = this.selectedDraft()?.id ?? null;
          this.drafts.set(result.drafts.items);
          const selected = result.selected?.draft ?? result.drafts.items[0] ?? null;
          this.selectedDraft.set(selected);
          this.draftSelectionId.set(null);
          if (selected) {
            this.populateForm(selected);
          }
          if (selected && selected.id !== previousDraftId) {
            requestAnimationFrame(() => this.scrollReviewMainToTop());
          }
          this.loading.set(false);
        },
        error: () => {
          this.draftSelectionId.set(null);
          this.notifications.error('Unable to load generated drafts.');
          this.loading.set(false);
        },
      });
  }

  currentCaseGroup() {
    return this.caseArray.at(this.selectedCaseIndex()) as FormArray | any;
  }

  currentSteps() {
    return this.currentCaseGroup()?.get('steps') as FormArray;
  }

  getCaseGroup(index: number) {
    return this.caseArray.at(index) as FormArray | any;
  }

  getStepsForCase(index: number) {
    return this.getCaseGroup(index)?.get('steps') as FormArray;
  }

  isCaseExpanded(index: number) {
    return this.selectedCaseIndex() === index;
  }

  reviewedCaseSummary() {
    const statuses = this.caseArray.getRawValue().map((testCase: any) => String(testCase.reviewStatus || 'pending'));
    return {
      approved: statuses.filter((status) => status === 'approved').length,
      rejected: statuses.filter((status) => status === 'rejected').length,
      pending: statuses.filter((status) => status === 'pending').length,
      total: statuses.length,
    };
  }

  canFinalizeSelectedDraft() {
    const summary = this.reviewedCaseSummary();
    return (
      summary.pending === 0 &&
      summary.approved > 0 &&
      !this.hasUnsavedCases() &&
      this.caseSavingIndex() === null &&
      this.caseReviewActionIndex() === null
    );
  }

  isSelectedDraftLocked() {
    const draft = this.selectedDraft();
    return Boolean(draft && draft.reviewStatus !== 'pending' && !this.suiteEditMode());
  }

  canEnterSuiteEditMode() {
    const draft = this.selectedDraft();
    return Boolean(draft && draft.reviewStatus !== 'pending' && !this.suiteEditMode());
  }

  enableSuiteEditing() {
    if (!this.canEnterSuiteEditMode()) {
      return;
    }

    this.suiteEditMode.set(true);
    this.setSuiteEditingState(false);
    this.notifications.success('Suite editing enabled. Save or finalize to send it back through review.');
  }

  activeDraftCount() {
    return this.drafts().filter((draft) => draft.reviewStatus === 'pending').length;
  }

  visibleDraftCount() {
    return this.filteredDrafts().length;
  }

  setDraftSearchTerm(value: string) {
    this.draftSearchTerm.set(value);
  }

  toggleDraftStatusFilter(status: GenerationReviewStatus) {
    this.draftStatusFilter.update((current) => (current === status ? 'all' : status));
  }

  isDraftStatusActive(status: GenerationReviewStatus) {
    return this.draftStatusFilter() === status;
  }

  draftTesterName(draft: TestGenerationDraft) {
    return draft.suiteContext.contributor?.name?.trim() || 'Unassigned tester';
  }

  draftMetaLine(draft: TestGenerationDraft) {
    return `${draft.testCases.length} cases · v${draft.version}`;
  }

  draftScopeLine(draft: TestGenerationDraft) {
    const parts = [
      draft.suiteContext.project?.name?.trim(),
      draft.suiteContext.module?.name?.trim(),
      draft.suiteContext.page?.name?.trim(),
      draft.suiteContext.feature?.name?.trim(),
    ].filter((value): value is string => Boolean(value));

    return parts.length ? parts.join(' / ') : draft.suiteContext.path || 'Unassigned suite path';
  }

  queueMeta(draft: TestGenerationDraft) {
    return `${draft.testCases.length} cases · v${draft.version}`;
  }

  suiteDescriptionLine() {
    const draft = this.selectedDraft();
    if (!draft) {
      return '';
    }

    const target = draft.suiteContext.path || draft.title;
    return `Reviewing ${draft.testCases.length} AI-generated test cases for ${target}. Ensure all action steps align with current business logic.`;
  }

  currentCoverageAnalysis() {
    return this.selectedDraft()?.coverageAnalysis ?? null;
  }

  coverageScoreLabel() {
    const analysis = this.currentCoverageAnalysis();
    return analysis ? `${Math.round((analysis.overallScore || 0) * 100)}% coverage confidence` : 'Coverage analysis pending';
  }

  coverageScorePercent() {
    const analysis = this.currentCoverageAnalysis();
    return analysis ? Math.round((analysis.overallScore || 0) * 100) : 0;
  }

  coverageQuotaLabel() {
    const analysis = this.currentCoverageAnalysis();
    if (!analysis) {
      return 'No planner analysis available yet';
    }

    if (analysis.quotaStatus === 'met') {
      return 'Covered';
    }

    if (analysis.quotaStatus === 'partially_met') {
      return 'Needs review';
    }

    return 'Missing areas';
  }

  openCoverageAnalysisDialog() {
    const draft = this.selectedDraft();
    const analysis = draft?.coverageAnalysis ?? null;
    if (!draft || !analysis) {
      return;
    }

    this.dialog.open(CoverageAnalysisDialogComponent, {
      width: 'min(64rem, 94vw)',
      maxWidth: '94vw',
      data: {
        suiteTitle: draft.title,
        suitePath: draft.suiteContext.path || null,
        coverageSummary: draft.coverageSummary,
        analysis,
      },
    });
  }

  coverageFocusState() {
    return this.coverageFocus();
  }

  hasCoverageFocus() {
    return Boolean(this.coverageFocus().kind && this.coverageFocus().key);
  }

  setCoverageFocus(kind: 'feature' | 'bucket' | 'unit' | 'unknown', key: string) {
    const normalized = String(key ?? '').trim();
    if (!normalized) {
      return;
    }

    const current = this.coverageFocus();
    if (current.kind === kind && current.key === normalized) {
      this.coverageFocus.set({ kind: null, key: null });
      return;
    }

    this.coverageFocus.set({ kind, key: normalized });
  }

  clearCoverageFocus() {
    this.coverageFocus.set({ kind: null, key: null });
  }

  isCoverageFocusActive(kind: 'feature' | 'bucket' | 'unit' | 'unknown', key: string) {
    const current = this.coverageFocus();
    return current.kind === kind && current.key === key;
  }

  coverageFocusMatchCount() {
    if (!this.hasCoverageFocus()) {
      return this.caseArray.length;
    }

    let matches = 0;
    for (let index = 0; index < this.caseArray.length; index += 1) {
      if (this.caseMatchesCoverageFocus(index)) {
        matches += 1;
      }
    }
    return matches;
  }

  casePills(index: number) {
    const caseValue = this.caseArray.at(index)?.getRawValue();
    if (!caseValue) {
      return [];
    }

    const pills = [caseValue.testType, caseValue.severity];
    if (caseValue.automationCandidate) {
      pills.push('Automation');
    }

    return pills.filter(Boolean);
  }

  casePreview(index: number) {
    const caseValue = this.caseArray.at(index)?.getRawValue();
    if (!caseValue) {
      return 'No preview available.';
    }

    const firstStep = Array.isArray(caseValue.steps) ? caseValue.steps[0] : null;
    return caseValue.objective || firstStep?.action || caseValue.scenario || 'No preview available.';
  }

  displayCaseTitle(index: number) {
    return this.fullCaseTitle(index);
  }

  fullCaseTitle(index: number) {
    const caseValue = this.caseArray.at(index)?.getRawValue();
    if (!caseValue) {
      return 'Selected case';
    }

    const rawTitle = String(caseValue.title ?? '').trim();
    const objective = String(caseValue.objective ?? '').trim();
    const feature = String(caseValue.feature ?? '').trim();
    const scenario = String(caseValue.scenario ?? '').trim();
    const normalizedStoredTitle = this.normalizeStoredCaseTitle(rawTitle, caseValue as GeneratedTestCase);

    if (normalizedStoredTitle) {
      return normalizedStoredTitle;
    }

    if (objective && objective.length > rawTitle.length) {
      return objective;
    }

    if (rawTitle) {
      return rawTitle;
    }

    const readableTitle = this.normalizeReadableTitle({
      title: '',
      objective: '',
      feature,
      scenario,
    });

    return readableTitle || 'Selected case';
  }

  draftProgressWidth(draft: TestGenerationDraft) {
    if (!draft.testCases.length) {
      return 8;
    }

    const reviewed = draft.testCases.filter((item) => item.reviewStatus !== 'pending').length;
    if (!reviewed) {
      return draft.reviewStatus === 'pending' ? 18 : 100;
    }

    return Math.max(18, Math.round((reviewed / draft.testCases.length) * 100));
  }

  selectDraft(draftId: string) {
    if (draftId === this.selectedDraft()?.id) {
      return;
    }
    this.draftSelectionId.set(draftId);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { draftId },
      queryParamsHandling: 'merge',
    }).catch(() => {
      this.draftSelectionId.set(null);
      this.notifications.error('Unable to open the selected draft.');
    });
  }

  isDraftSwitching(draftId: string) {
    return this.draftSelectionId() === draftId;
  }

  selectCase(index: number) {
    const nextIndex = this.selectedCaseIndex() === index ? -1 : index;
    if (nextIndex >= 0) {
      this.normalizeEditableCaseTitle(nextIndex);
    }
    this.selectedCaseIndex.set(nextIndex);

    if (nextIndex >= 0) {
      requestAnimationFrame(() => this.ensureCaseVisible(nextIndex));
    }
  }

  addCase(insertAt?: number) {
    if (!this.ensureSuiteEditable('Adding test cases')) {
      return;
    }

    const requestedIndex =
      typeof insertAt === 'number' ? Math.max(0, Math.min(insertAt, this.caseArray.length)) : this.caseArray.length;
    const nextIndex = this.discardTransientManualCases(requestedIndex);
    const nextCase = this.createCaseGroup(undefined, {
      isManual: true,
      autoCaseId: this.buildSequentialCaseId(nextIndex + 1),
    });

    this.selectedCaseIndex.set(-1);

    if (nextIndex >= this.caseArray.length) {
      this.caseArray.push(nextCase);
    } else {
      this.caseArray.insert(nextIndex, nextCase);
    }

    this.renumberCaseIds();
    this.selectedCaseIndex.set(nextIndex);
    requestAnimationFrame(() => this.focusCaseTitle(nextIndex));
  }

  isCasePersisted(index: number) {
    return Boolean(this.getCaseGroup(index)?.get('persistedEntry')?.value);
  }

  hasValidCaseTitle(index: number) {
    return Boolean(String(this.getCaseGroup(index)?.get('title')?.value ?? '').trim());
  }

  canReviewCase(index: number) {
    return this.isCasePersisted(index) && this.hasValidCaseTitle(index);
  }

  isCaseBusy(index: number) {
    return this.caseSavingIndex() === index || this.caseReviewActionIndex() === index;
  }

  isCaseSaveBusy(index: number) {
    return this.caseSavingIndex() === index && this.caseSaveActionType() === 'save';
  }

  isCaseDeleteBusy(index: number) {
    return this.caseSavingIndex() === index && this.caseSaveActionType() === 'delete';
  }

  isCaseApproveBusy(index: number) {
    return this.caseReviewActionIndex() === index && this.caseReviewActionType() === 'approve';
  }

  isCaseRejectBusy(index: number) {
    return this.caseReviewActionIndex() === index && this.caseReviewActionType() === 'reject';
  }

  caseBusyLabel(index: number) {
    if (this.isCaseDeleteBusy(index)) {
      return 'Deleting testcase...';
    }

    if (this.isCaseApproveBusy(index)) {
      return 'Approving testcase...';
    }

    if (this.isCaseRejectBusy(index)) {
      return 'Rejecting testcase...';
    }

    if (this.isCaseSaveBusy(index)) {
      return 'Saving testcase...';
    }

    return 'Updating testcase...';
  }

  latestCaseFeedback(index: number) {
    const draft = this.selectedDraft();
    const caseId = String(this.getCaseGroup(index)?.get('caseId')?.value ?? '').trim();
    return this.getLatestFeedbackForCase(draft, caseId);
  }

  caseFeedbackLabel(index: number) {
    const feedback = this.latestCaseFeedback(index);
    if (!feedback) {
      return 'No structured review feedback saved yet.';
    }

    if (feedback.action === 'approved') {
      return 'Approved testcase';
    }

    return feedback.reasonCode ? this.rejectionReasonLabel(feedback.reasonCode) : 'Rejected testcase';
  }

  hasRejectEditorOpen(_index: number) {
    return false;
  }

  openRejectEditor(index: number) {
    const caseGroup = this.getCaseGroup(index);
    if (!caseGroup) {
      return;
    }

    if (!this.ensureSuiteEditable('Rejecting test cases')) {
      return;
    }

    if (!this.canReviewCase(index)) {
      this.notifications.error('Save the test case with a valid title before rejecting it.');
      return;
    }

    this.selectedCaseIndex.set(index);
    this.dialog
      .open(TestcaseRejectionDialogComponent, {
        width: 'min(34rem, calc(100vw - 2rem))',
        maxWidth: '95vw',
        autoFocus: false,
        data: {
          caseTitle: String(caseGroup.get('title')?.value ?? '').trim() || 'Untitled testcase',
          reasons: this.rejectionReasonOptions,
          initialValue: {
            reasonCode:
              (caseGroup.get('feedbackReasonCode')?.value as TestCaseFeedbackReason | null) ?? 'missing_coverage',
            reasonDetails: String(caseGroup.get('feedbackReasonDetails')?.value ?? ''),
            replacementSummary: String(caseGroup.get('replacementSummary')?.value ?? ''),
            reviewerNotes: String(caseGroup.get('feedbackReviewerNotes')?.value ?? ''),
          },
        },
      })
      .afterClosed()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((result: TestcaseRejectionDialogResult | undefined) => {
        if (!result) {
          return;
        }

        caseGroup.get('feedbackReasonCode')?.setValue(result.reasonCode);
        caseGroup.get('feedbackReasonDetails')?.setValue(result.reasonDetails);
        caseGroup.get('replacementSummary')?.setValue(result.replacementSummary);
        caseGroup.get('feedbackReviewerNotes')?.setValue(result.reviewerNotes);
        this.submitRejectCase(index);
      });
  }

  closeRejectEditor(index: number) {
    const caseGroup = this.getCaseGroup(index);
    if (!caseGroup) {
      return;
    }

    const feedback = this.latestCaseFeedback(index);
    caseGroup.get('feedbackReasonCode')?.setValue(feedback?.reasonCode ?? 'missing_coverage');
    caseGroup.get('feedbackReasonDetails')?.setValue(feedback?.reasonDetails ?? '');
    caseGroup.get('replacementSummary')?.setValue(feedback?.replacementSummary ?? '');
    caseGroup.get('feedbackReviewerNotes')?.setValue(feedback?.reviewerNotes ?? '');
  }

  saveCase(index: number) {
    const draft = this.selectedDraft();
    const caseGroup = this.caseArray.at(index);
    if (!draft || !caseGroup) {
      return;
    }

    if (!this.ensureSuiteEditable('Saving test cases')) {
      return;
    }
    const currentCaseId = String(caseGroup.get('caseId')?.value ?? '').trim();

    const titleControl = caseGroup.get('title');
    titleControl?.markAsTouched();

    if (!this.hasValidCaseTitle(index)) {
      this.notifications.error('Add a valid title before saving the test case.');
      return;
    }

    if (this.hasBlankCaseTitles()) {
      this.form.markAllAsTouched();
      this.notifications.error('Add titles for every test case before saving.');
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notifications.error('Resolve the invalid testcase fields before saving.');
      return;
    }

    this.caseSavingIndex.set(index);
    this.caseSaveActionType.set('save');
    this.api
      .updateGenerationDraft(draft.id, this.toUpdatePayload())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          const restoredIndex = this.resolveSavedCaseIndex(result.draft.testCases, currentCaseId, index);
          this.notifications.success('Test case saved.');
          this.selectedDraft.set(result.draft);
          this.replaceDraft(result.draft);
          this.populateForm(result.draft);
          this.selectedCaseIndex.set(-1);
          requestAnimationFrame(() => this.ensureCaseVisible(restoredIndex, 'center'));
          this.caseSavingIndex.set(null);
          this.caseSaveActionType.set(null);
        },
        error: () => {
          this.notifications.error('Unable to save the test case.');
          this.caseSavingIndex.set(null);
          this.caseSaveActionType.set(null);
        },
      });
  }

  setCaseReviewStatus(index: number, status: GenerationReviewStatus) {
    const caseGroup = this.caseArray.at(index);
    if (!caseGroup) {
      return;
    }

    if (!this.canReviewCase(index)) {
      this.notifications.error('Save the test case with a valid title before approving or rejecting it.');
      return;
    }

    if (status === 'approved') {
      this.approveCase(index);
      return;
    }

    if (status === 'rejected') {
      this.openRejectEditor(index);
      return;
    }

    caseGroup.get('reviewStatus')?.setValue(status);
  }

  approveCase(index: number) {
    const draft = this.selectedDraft();
    const caseGroup = this.getCaseGroup(index);
    if (!draft || !caseGroup) {
      return;
    }

    if (!this.ensureSuiteEditable('Approving test cases')) {
      return;
    }

    if (this.hasBlankCaseTitles()) {
      this.form.markAllAsTouched();
      this.notifications.error('Add titles for every test case before saving review decisions.');
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notifications.error('Resolve the invalid testcase fields before approving.');
      return;
    }

    const caseId = String(caseGroup.get('caseId')?.value ?? '').trim();
    if (!caseId) {
      this.notifications.error('Case ID is missing for this testcase.');
      return;
    }

    this.caseReviewActionIndex.set(index);
    this.caseReviewActionType.set('approve');
    this.api
      .updateGenerationDraft(draft.id, this.toUpdatePayload())
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        switchMap(() =>
          this.api.approveGenerationTestCase(draft.id, caseId, {
            reviewerNotes: String(caseGroup.get('feedbackReviewerNotes')?.value ?? '').trim() || undefined,
          }),
        ),
      )
      .subscribe({
        next: (result) => {
          this.notifications.success('Testcase approved.');
          this.applyDraftUpdate(result.draft);
          this.caseReviewActionIndex.set(null);
          this.caseReviewActionType.set(null);
        },
        error: () => {
          this.notifications.error('Unable to approve the testcase.');
          this.caseReviewActionIndex.set(null);
          this.caseReviewActionType.set(null);
        },
      });
  }

  submitRejectCase(index: number) {
    const draft = this.selectedDraft();
    const caseGroup = this.getCaseGroup(index);
    if (!draft || !caseGroup) {
      return;
    }

    if (!this.ensureSuiteEditable('Rejecting test cases')) {
      return;
    }

    if (this.hasBlankCaseTitles()) {
      this.form.markAllAsTouched();
      this.notifications.error('Add titles for every test case before saving review decisions.');
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notifications.error('Resolve the invalid testcase fields before rejecting.');
      return;
    }

    const caseId = String(caseGroup.get('caseId')?.value ?? '').trim();
    const reasonCode = caseGroup.get('feedbackReasonCode')?.value as TestCaseFeedbackReason | null;
    if (!caseId || !reasonCode) {
      this.notifications.error('Choose a rejection reason before rejecting the testcase.');
      return;
    }

    this.caseReviewActionIndex.set(index);
    this.caseReviewActionType.set('reject');
    this.api
      .updateGenerationDraft(draft.id, this.toUpdatePayload())
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        switchMap(() =>
          this.api.rejectGenerationTestCase(draft.id, caseId, {
            reasonCode,
            reasonDetails: String(caseGroup.get('feedbackReasonDetails')?.value ?? '').trim() || undefined,
            replacementSummary: String(caseGroup.get('replacementSummary')?.value ?? '').trim() || undefined,
            reviewerNotes: String(caseGroup.get('feedbackReviewerNotes')?.value ?? '').trim() || undefined,
          }),
        ),
      )
      .subscribe({
        next: (result) => {
          this.notifications.success('Structured rejection saved.');
          this.applyDraftUpdate(result.draft);
          this.caseReviewActionIndex.set(null);
          this.caseReviewActionType.set(null);
        },
        error: () => {
          this.notifications.error('Unable to reject the testcase.');
          this.caseReviewActionIndex.set(null);
          this.caseReviewActionType.set(null);
        },
      });
  }

  promoteCase(index: number) {
    const draft = this.selectedDraft();
    const caseGroup = this.getCaseGroup(index);
    if (!draft || !caseGroup) {
      return;
    }

    if (!this.canReviewCase(index) || String(caseGroup.get('reviewStatus')?.value ?? 'pending') !== 'approved') {
      this.notifications.error('Approve the testcase before promoting it into reusable knowledge.');
      return;
    }

    const caseId = String(caseGroup.get('caseId')?.value ?? '').trim();
    if (!caseId) {
      this.notifications.error('Case ID is missing for this testcase.');
      return;
    }

    this.casePromotionIndex.set(index);
    this.api
      .promoteGenerationTestCase(draft.id, caseId, {
        targetType: (caseGroup.get('promotionTarget')?.value as KnowledgeSuggestionTargetType | null) ?? 'projectMemory',
        notes: String(caseGroup.get('promotionNotes')?.value ?? '').trim() || undefined,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          const label = this.promotionTargetLabel(
            (caseGroup.get('promotionTarget')?.value as KnowledgeSuggestionTargetType | null) ?? 'projectMemory',
          );
          this.notifications.success(`Learning suggestion created for ${label.toLowerCase()}.`);
          caseGroup.get('promotionNotes')?.setValue('', { emitEvent: false });
          caseGroup.get('promotionTarget')?.setValue(result.suggestion.targetType, { emitEvent: false });
          this.casePromotionIndex.set(null);
        },
        error: () => {
          this.notifications.error('Unable to create the learning suggestion.');
          this.casePromotionIndex.set(null);
        },
      });
  }

  removeCase(index: number) {
    if (!this.ensureSuiteEditable('Deleting test cases')) {
      return;
    }

    if (this.caseArray.length === 1) {
      this.notifications.error('At least one test case must remain in the draft.');
      return;
    }

    const draft = this.selectedDraft();
    const persistedEntry = this.isCasePersisted(index);

    if (!draft || !persistedEntry) {
      this.caseArray.removeAt(index);
      if (!this.caseArray.length) {
        this.selectedCaseIndex.set(-1);
        return;
      }

      this.renumberCaseIds();
      this.selectedCaseIndex.set(-1);
      return;
    }

    const nextIndex = Math.max(0, Math.min(index, this.caseArray.length - 2));
    const payload = this.toUpdatePayload();
    payload.testCases.splice(index, 1);

    this.caseSavingIndex.set(index);
    this.caseSaveActionType.set('delete');
    this.api
      .updateGenerationDraft(draft.id, payload)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          const restoredIndex = Math.max(0, Math.min(nextIndex, Math.max(0, result.draft.testCases.length - 1)));
          this.notifications.success('Test case deleted.');
          this.selectedDraft.set(result.draft);
          this.replaceDraft(result.draft);
          this.populateForm(result.draft);
          this.selectedCaseIndex.set(-1);
          requestAnimationFrame(() => this.ensureCaseVisible(restoredIndex, 'center'));
          this.caseSavingIndex.set(null);
          this.caseSaveActionType.set(null);
        },
        error: () => {
          this.notifications.error('Unable to delete the test case.');
          this.caseSavingIndex.set(null);
          this.caseSaveActionType.set(null);
        },
      });
  }

  addStep(caseIndex: number) {
    if (!this.ensureSuiteEditable('Adding steps')) {
      return;
    }

    const steps = this.getSteps(caseIndex);
    const caseGroup = this.caseArray.at(caseIndex);
    const isManual = Boolean(caseGroup?.get('manualEntry')?.value);
    steps.push(this.createStepGroup({ step: steps.length + 1, action: '', expectedResult: '' }, { required: !isManual }));
  }

  removeStep(caseIndex: number, stepIndex: number) {
    if (!this.ensureSuiteEditable('Deleting steps')) {
      return;
    }

    this.getSteps(caseIndex).removeAt(stepIndex);
  }

  save() {
    const draft = this.selectedDraft();
    if (!draft) {
      return;
    }

    if (!this.ensureSuiteEditable('Saving the suite')) {
      return;
    }

    if (this.hasBlankCaseTitles()) {
      this.form.markAllAsTouched();
      this.notifications.error('Add a title for every test case before saving.');
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notifications.error('Resolve the invalid draft fields before saving.');
      return;
    }

    this.api
      .updateGenerationDraft(draft.id, this.toUpdatePayload())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.notifications.success('Draft edits saved.');
          this.selectedDraft.set(result.draft);
          this.replaceDraft(result.draft);
          this.populateForm(result.draft);
        },
        error: () => this.notifications.error('Unable to save draft edits.'),
      });
  }

  approve() {
    const draft = this.selectedDraft();
    if (!draft) {
      return;
    }

    if (!this.ensureSuiteEditable('Finalizing the suite')) {
      return;
    }

    if (this.hasBlankCaseTitles()) {
      this.form.markAllAsTouched();
      this.notifications.error('Add a title for every test case before finalizing the suite.');
      return;
    }

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.notifications.error('Resolve invalid fields before finalizing the reviewed suite.');
      return;
    }

    this.api
      .updateGenerationDraft(draft.id, this.toUpdatePayload())
      .pipe(
        takeUntilDestroyed(this.destroyRef),
        switchMap(() => this.api.approveGenerationDraft(draft.id, this.form.controls.reviewerNotes.getRawValue())),
      )
      .subscribe({
        next: (result) => {
          this.notifications.success('Reviewed suite finalized.');
          this.selectedDraft.set(result.draft);
          this.replaceDraft(result.draft);
          this.populateForm(result.draft);
        },
        error: () => this.notifications.error('Finalize action failed.'),
      });
  }

  reject() {
    const draft = this.selectedDraft();
    if (!draft) {
      return;
    }

    if (!this.ensureSuiteEditable('Rejecting the suite')) {
      return;
    }

    this.api
      .rejectGenerationDraft(draft.id, this.form.controls.reviewerNotes.getRawValue())
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.notifications.success('Draft rejected.');
          this.selectedDraft.set(result.draft);
          this.replaceDraft(result.draft);
          this.populateForm(result.draft);
        },
        error: () => this.notifications.error('Reject action failed.'),
      });
  }

  deleteDraft() {
    const draft = this.selectedDraft();
    if (!draft || this.draftDeleting()) {
      return;
    }

    const confirmed = window.confirm(
      `Delete "${draft.title}" permanently? This will remove the entire suite from the suits deck.`,
    );
    if (!confirmed) {
      return;
    }

    const nextDraft =
      this.filteredDrafts().filter((item) => item.id !== draft.id)[0] ??
      this.drafts().filter((item) => item.id !== draft.id)[0] ??
      null;

    this.draftDeleting.set(true);
    this.api
      .deleteGenerationDraft(draft.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: () => {
          this.draftDeleting.set(false);
          this.notifications.success('Draft deleted.');
          this.applyDraftDeletion(draft.id, nextDraft);
        },
        error: () => {
          this.draftDeleting.set(false);
          this.notifications.error('Delete draft action failed.');
        },
      });
  }

  manualRecovery() {
    const draft = this.selectedDraft();
    if (!draft) {
      return;
    }

    this.api
      .createManualRecoveryDraft(draft.id)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.notifications.success('Manual recovery draft created.');
          this.drafts.set([result.draft, ...this.drafts()]);
          this.selectedDraft.set(result.draft);
          this.populateForm(result.draft);
          this.router.navigate([], {
            relativeTo: this.route,
            queryParams: { draftId: result.draft.id },
            queryParamsHandling: 'merge',
          });
        },
        error: () => this.notifications.error('Unable to create a manual recovery draft.'),
      });
  }

  regenerate() {
    const draft = this.selectedDraft();
    if (!draft) {
      return;
    }

    this.api
      .regenerateGenerationRun(draft.runId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          this.generationMonitor.trackRun(result.run);
          this.notifications.success('Regeneration started. You can continue reviewing other suites while it runs.');
        },
        error: () => this.notifications.error('Regeneration failed.'),
      });
  }

  exportDraft() {
    const draft = this.selectedDraft();
    if (!draft || this.draftExporting()) {
      return;
    }

    this.draftExporting.set(true);
    this.api
      .exportGeneratedTestCases({ draftId: draft.id })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (blob) => {
          this.downloadBlob(blob, `${draft.title.replace(/\s+/g, '-').toLowerCase()}-test-cases.csv`);
          this.draftExporting.set(false);
          this.notifications.success('Suite downloaded.');
        },
        error: () => {
          this.draftExporting.set(false);
          this.notifications.error('Download failed.');
        },
      });
  }

  private populateForm(draft: TestGenerationDraft) {
    while (this.caseArray.length) {
      this.caseArray.removeAt(0);
    }

    this.suiteEditMode.set(false);
    this.caseSavingIndex.set(null);
    this.caseSaveActionType.set(null);
    this.caseReviewActionIndex.set(null);
    this.caseReviewActionType.set(null);
    this.casePromotionIndex.set(null);

    this.form.patchValue({
      suiteTitle: draft.title,
      suiteSummary: draft.summary ?? '',
      confidence: draft.confidence,
      inferredComponents: draft.inferredContext.components.join('\n'),
      inferredFeatureTypes: draft.inferredContext.featureTypes.join('\n'),
      inferredRulePacks: draft.inferredContext.rulePacks.join('\n'),
      inferredTaxonomy: draft.inferredContext.taxonomy.join('\n'),
      inferredScenarios: draft.inferredContext.scenarios.join('\n'),
      inferredIntegrations: draft.inferredContext.integrations.join('\n'),
      assumptions: draft.inferredContext.assumptions.join('\n'),
      gaps: draft.inferredContext.gaps.join('\n'),
      coverageSummary: draft.coverageSummary.join('\n'),
      reviewerNotes: draft.reviewerNotes ?? '',
    });

    for (const testCase of draft.testCases) {
      this.caseArray.push(
        this.createCaseGroup(testCase, {
          feedback: this.getLatestFeedbackForCase(draft, testCase.caseId),
        }),
      );
    }

    this.renumberCaseIds();
    this.selectedCaseIndex.set(-1);
    this.setSuiteEditingState(draft.reviewStatus !== 'pending');
  }

  private replaceDraft(draft: TestGenerationDraft) {
    this.drafts.set(this.drafts().map((item) => (item.id === draft.id ? draft : item)));
  }

  private applyDraftDeletion(deletedDraftId: string, nextDraft: TestGenerationDraft | null) {
    this.drafts.set(this.drafts().filter((item) => item.id !== deletedDraftId));
    this.draftSelectionId.set(null);

    if (nextDraft) {
      this.selectedDraft.set(nextDraft);
      this.populateForm(nextDraft);
      requestAnimationFrame(() => this.scrollReviewMainToTop());
    } else {
      this.selectedDraft.set(null);
    }

    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { draftId: nextDraft?.id ?? null },
      queryParamsHandling: 'merge',
    });
  }

  private applyDraftUpdate(draft: TestGenerationDraft, indexToKeepOpen?: number) {
    this.selectedDraft.set(draft);
    this.replaceDraft(draft);
    this.populateForm(draft);
    if (typeof indexToKeepOpen === 'number') {
      const safeIndex = Math.max(0, Math.min(indexToKeepOpen, Math.max(0, this.caseArray.length - 1)));
      this.selectedCaseIndex.set(safeIndex);
      requestAnimationFrame(() => this.ensureCaseVisible(safeIndex, 'nearest'));
    }
  }

  private getLatestFeedbackForCase(draft: TestGenerationDraft | null, caseId?: string | null) {
    if (!draft || !caseId) {
      return null;
    }

    const feedbackItems = draft.testCaseFeedback
      .filter((feedback) => feedback.caseId === caseId)
      .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());

    return feedbackItems[0] ?? null;
  }

  private createCaseGroup(
    testCase?: GeneratedTestCase,
    options?: {
      isManual?: boolean;
      autoCaseId?: string;
      feedback?: TestCaseFeedback | null;
    },
  ) {
    const isManual = options?.isManual ?? !testCase;
    const feedback = options?.feedback ?? null;
    const storedTitle = String(testCase?.title ?? '').trim();
    const readableStoredTitle = this.normalizeStoredCaseTitle(storedTitle, testCase);
    const readableTitle = readableStoredTitle || this.buildReadableCaseTitle(testCase);
    const detailedDescription = this.buildDetailedDescription(testCase, readableTitle);
    const initialTitle = isManual ? '' : readableTitle;
    const initialDescription = isManual ? '' : detailedDescription;
    return this.fb.nonNullable.group({
      manualEntry: [isManual],
      persistedEntry: [!isManual],
      caseId: [testCase?.caseId ?? options?.autoCaseId ?? ''],
      title: [initialTitle, [this.trimmedRequiredValidator, Validators.maxLength(TestGenerationReviewPageComponent.CASE_TITLE_MAX_LENGTH)]],
      reviewStatus: [testCase?.reviewStatus ?? 'pending'],
      entrySource: [testCase?.entrySource ?? (isManual ? 'manual' : 'generated')],
      objective: [initialDescription],
      feature: [testCase?.feature ?? ''],
      scenario: [testCase?.scenario ?? ''],
      testType: [testCase?.testType ?? 'Functional'],
      priority: [testCase?.priority ?? 'P2'],
      severity: [testCase?.severity ?? 'Medium'],
      automationCandidate: [testCase?.automationCandidate ?? false],
      preconditions: [testCase?.preconditions.join('\n') ?? ''],
      testData: [testCase?.testData.join('\n') ?? ''],
      tags: [testCase?.tags.join('\n') ?? ''],
      linkedComponents: [testCase?.linkedComponents.join('\n') ?? ''],
      linkedFeatureTypes: [testCase?.linkedFeatureTypes.join('\n') ?? ''],
      linkedRulePacks: [testCase?.linkedRulePacks.join('\n') ?? ''],
      linkedTaxonomy: [testCase?.linkedTaxonomy.join('\n') ?? ''],
      sourceReferences: [testCase?.sourceReferences.join('\n') ?? ''],
      notes: [testCase?.notes ?? ''],
      feedbackReasonCode: [feedback?.reasonCode ?? 'missing_coverage'],
      feedbackReasonDetails: [feedback?.reasonDetails ?? ''],
      replacementSummary: [feedback?.replacementSummary ?? ''],
      feedbackReviewerNotes: [feedback?.reviewerNotes ?? ''],
      promotionTarget: ['projectMemory' as KnowledgeSuggestionTargetType],
      promotionNotes: [''],
      steps: this.fb.array(
        (testCase?.steps ?? [{ step: 1, action: '', expectedResult: '' }]).map((step) =>
          this.createStepGroup(step, { required: !isManual }),
        ),
      ),
    });
  }

  private createStepGroup(
    step: { step: number; action: string; expectedResult: string },
    options?: { required?: boolean },
  ) {
    const actionValidators = options?.required === false ? [] : [Validators.required];
    return this.fb.nonNullable.group({
      step: [step.step],
      action: [step.action, actionValidators],
      expectedResult: [step.expectedResult],
    });
  }

  private getSteps(caseIndex: number) {
    return this.caseArray.at(caseIndex).get('steps') as FormArray;
  }

  private toUpdatePayload() {
    return {
      suiteTitle: this.form.controls.suiteTitle.getRawValue(),
      suiteSummary: this.form.controls.suiteSummary.getRawValue(),
      inferredComponents: this.splitLines(this.form.controls.inferredComponents.getRawValue()),
      inferredFeatureTypes: this.splitLines(this.form.controls.inferredFeatureTypes.getRawValue()),
      inferredRulePacks: this.splitLines(this.form.controls.inferredRulePacks.getRawValue()),
      inferredTaxonomy: this.splitLines(this.form.controls.inferredTaxonomy.getRawValue()),
      inferredScenarios: this.splitLines(this.form.controls.inferredScenarios.getRawValue()),
      inferredIntegrations: this.splitLines(this.form.controls.inferredIntegrations.getRawValue()),
      assumptions: this.splitLines(this.form.controls.assumptions.getRawValue()),
      gaps: this.splitLines(this.form.controls.gaps.getRawValue()),
      coverageSummary: this.splitLines(this.form.controls.coverageSummary.getRawValue()),
      confidence: Number(this.form.controls.confidence.getRawValue()),
      reviewerNotes: this.form.controls.reviewerNotes.getRawValue(),
      testCases: this.caseArray.getRawValue().map((testCase: any, index: number) => this.normalizeDraftCase(testCase, index)),
    };
  }

  private splitLines(value: string) {
    return value
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
  }

  private hasUnsavedCases() {
    return this.caseArray.controls.some((control) => !Boolean(control.get('persistedEntry')?.value));
  }

  private hasBlankCaseTitles() {
    return this.caseArray.controls.some((control) => !String(control.get('title')?.value ?? '').trim());
  }

  private normalizeDraftCase(testCase: any, index: number) {
    const rawTitle = this.limitCaseTitle(String(testCase.title ?? '').trim());
    const title =
      rawTitle ||
      this.limitCaseTitle(
        this.normalizeReadableTitle({
          title: '',
          objective: '',
          feature: String(testCase.feature ?? '').trim(),
          scenario: String(testCase.scenario ?? '').trim(),
        }),
      );
    const caseId = this.buildSequentialCaseId(index + 1);
    const defaultObjective = title ? `Verify ${title.charAt(0).toLowerCase()}${title.slice(1)}` : 'Verify the expected behavior.';
    const steps = Array.isArray(testCase.steps) ? testCase.steps : [];
    const normalizedSteps = steps
      .map((step: any, stepIndex: number) => ({
        step: stepIndex + 1,
        action: String(step?.action ?? '').trim(),
        expectedResult: String(step?.expectedResult ?? '').trim(),
      }))
      .filter((step: { action: string; expectedResult: string }) => step.action);

    const fallbackSteps =
      normalizedSteps.length > 0
        ? normalizedSteps.map((step: { action: string; expectedResult: string }, stepIndex: number) => ({
            step: stepIndex + 1,
            action: step.action || 'Open the relevant page or workflow context.',
            expectedResult: step.expectedResult || 'The action completes successfully.',
          }))
        : [
            {
              step: 1,
              action: 'Open the relevant page or workflow context.',
              expectedResult: 'The action completes successfully.',
            },
          ];

    return {
      caseId,
      title,
      reviewStatus: testCase.reviewStatus || 'pending',
      objective: this.normalizeDetailedDescription({
        objective: String(testCase.objective ?? '').trim(),
        title,
        feature: this.clampShortText(String(testCase.feature ?? '').trim(), 200) || 'Manual Coverage',
        scenario: this.clampShortText(String(testCase.scenario ?? '').trim(), 200) || 'Manual testcase addition',
        testType: this.clampShortText(String(testCase.testType ?? '').trim(), 200) || 'Functional',
        firstAction: fallbackSteps[0]?.action ?? '',
        notes: String(testCase.notes ?? '').trim(),
        fallback: defaultObjective,
      }),
      feature: this.clampShortText(String(testCase.feature ?? '').trim(), 200) || 'Manual Coverage',
      scenario: this.clampShortText(String(testCase.scenario ?? '').trim(), 200) || 'Manual testcase addition',
      testType: this.clampShortText(String(testCase.testType ?? '').trim(), 200) || 'Functional',
      priority: this.clampShortText(String(testCase.priority ?? '').trim(), 200) || 'P2',
      severity: this.clampShortText(String(testCase.severity ?? '').trim(), 200) || 'Medium',
      automationCandidate: Boolean(testCase.automationCandidate),
      preconditions: this.splitLines(String(testCase.preconditions ?? '')),
      testData: this.splitLines(String(testCase.testData ?? '')),
      tags: this.splitLines(String(testCase.tags ?? '')),
      linkedComponents: this.splitLines(String(testCase.linkedComponents ?? '')),
      linkedFeatureTypes: this.splitLines(String(testCase.linkedFeatureTypes ?? '')),
      linkedRulePacks: this.splitLines(String(testCase.linkedRulePacks ?? '')),
      linkedTaxonomy: this.splitLines(String(testCase.linkedTaxonomy ?? '')),
      sourceReferences: this.splitLines(String(testCase.sourceReferences ?? '')),
      notes: String(testCase.notes ?? '').trim(),
      steps: fallbackSteps,
    };
  }

  private renumberCaseIds() {
    const prefix = this.resolveCaseIdPrefix();
    this.caseArray.controls.forEach((control, index) => {
      control.get('caseId')?.setValue(`${prefix}-${String(index + 1).padStart(3, '0')}`, {
        emitEvent: false,
      });
    });
  }

  private buildSequentialCaseId(index: number) {
    return `${this.resolveCaseIdPrefix()}-${String(index).padStart(3, '0')}`;
  }

  private discardTransientManualCases(insertAt: number) {
    let nextIndex = insertAt;

    for (let index = this.caseArray.length - 1; index >= 0; index -= 1) {
      const control = this.caseArray.at(index);
      const isTransientManual = Boolean(control.get('manualEntry')?.value) && !Boolean(control.get('persistedEntry')?.value);
      if (!isTransientManual) {
        continue;
      }

      this.caseArray.removeAt(index);
      if (index < nextIndex) {
        nextIndex -= 1;
      }
    }

    return Math.max(0, Math.min(nextIndex, this.caseArray.length));
  }

  private resolveSavedCaseIndex(testCases: GeneratedTestCase[], caseId: string, fallbackIndex: number) {
    const matchedIndex = caseId
      ? testCases.findIndex((testCase) => String(testCase.caseId ?? '').trim() === caseId)
      : -1;

    const resolvedIndex = matchedIndex >= 0 ? matchedIndex : fallbackIndex;
    return Math.max(0, Math.min(resolvedIndex, Math.max(0, testCases.length - 1)));
  }

  private resolveCaseIdPrefix() {
    const existingIds = this.caseArray.controls
      .map((control) => String(control.get('caseId')?.value ?? '').trim())
      .filter(Boolean);

    const firstExistingId = existingIds[0];
    if (firstExistingId) {
      const sequentialMatch = firstExistingId.match(/^(.*?)-(\d{3,})$/);
      if (sequentialMatch?.[1]) {
        return sequentialMatch[1];
      }
    }

    const selectedDraftId = this.selectedDraft()?.testCases
      .map((testCase) => String(testCase.caseId ?? '').trim())
      .find(Boolean);

    if (selectedDraftId) {
      const sequentialMatch = selectedDraftId.match(/^(.*?)-(\d{3,})$/);
      if (sequentialMatch?.[1]) {
        return sequentialMatch[1];
      }
    }

    return this.buildCaseIdPrefix();
  }

  private buildCaseIdPrefix() {
    const draft = this.selectedDraft();
    const tokens = [draft?.suiteContext.project?.name, draft?.suiteContext.module?.name, draft?.suiteContext.page?.name]
      .map((value) => this.toCaseIdToken(value ?? ''))
      .filter(Boolean)
      .slice(0, 3);

    return ['TC', ...(tokens.length ? tokens : ['MANUAL'])].join('-');
  }

  private toCaseIdToken(value: string) {
    return value.toUpperCase().replace(/[^A-Z0-9]+/g, '').slice(0, 12);
  }

  private truncateDisplayTitle(value: string) {
    return value.length > 120 ? `${value.slice(0, 117).trim()}...` : value;
  }

  private limitCaseTitle(value: string) {
    return String(value ?? '').trim().slice(0, TestGenerationReviewPageComponent.CASE_TITLE_MAX_LENGTH);
  }

  private clampShortText(value: string, maxLength: number) {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
      return '';
    }

    if (normalized.length <= maxLength) {
      return normalized;
    }

    return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
  }

  private buildReadableCaseTitle(testCase?: GeneratedTestCase) {
    return this.normalizeReadableTitle({
      title: testCase?.title ?? '',
      objective: testCase?.objective ?? '',
      feature: testCase?.feature ?? '',
      scenario: testCase?.scenario ?? '',
    });
  }

  private normalizeStoredCaseTitle(title: string, testCase?: GeneratedTestCase) {
    const storedTitle = String(title ?? '').trim();
    if (!storedTitle) {
      return '';
    }

    if (!this.looksStructuredCaseTitle(storedTitle, testCase)) {
      return this.limitCaseTitle(storedTitle);
    }

    return this.rebuildStructuredCaseTitle(testCase, storedTitle);
  }

  private rebuildStructuredCaseTitle(testCase?: Partial<GeneratedTestCase>, rawTitle = '') {
    const feature = String(testCase?.feature ?? '').trim();
    const scenario = String(testCase?.scenario ?? '').trim();
    const scenarioDrivenTitle = this.buildSentenceStyleTitle(
      this.cleanTitleClause(scenario || feature || rawTitle),
      feature,
      scenario,
    );

    if (scenarioDrivenTitle) {
      return this.limitCaseTitle(scenarioDrivenTitle);
    }

    return this.limitCaseTitle(
      this.normalizeReadableTitle({
        title: rawTitle,
        objective: '',
        feature,
        scenario,
      }),
    );
  }

  private buildDetailedDescription(testCase: GeneratedTestCase | undefined, readableTitle: string) {
    return this.normalizeDetailedDescription({
      objective: testCase?.objective ?? '',
      title: readableTitle,
      feature: testCase?.feature ?? '',
      scenario: testCase?.scenario ?? '',
      testType: testCase?.testType ?? '',
      firstAction: testCase?.steps?.[0]?.action ?? '',
      notes: testCase?.notes ?? '',
      fallback: `${readableTitle || 'Expected behavior'} should work correctly.`,
    });
  }

  private normalizeReadableTitle(input: { title: string; objective: string; feature: string; scenario: string }) {
    const objective = this.cleanTitleFragment(input.objective, 420);
    const feature = this.cleanTitleFragment(input.feature, 72);
    const scenario = this.cleanTitleFragment(input.scenario, 86);
    const rawTitle = this.cleanTitleFragment(input.title, TestGenerationReviewPageComponent.CASE_TITLE_MAX_LENGTH);
    const normalizedFeature = this.normalizeComparisonText(feature);
    const normalizedScenario = this.normalizeComparisonText(scenario);
    const normalizedTitle = this.normalizeComparisonText(rawTitle);
    const prefersScenarioClause =
      /(?:\.\.\.|…)$/.test(rawTitle) ||
      /[_:()]/.test(String(input.title ?? '')) ||
      (/^verify\s+/i.test(String(input.title ?? '')) && !/^verify that\s+/i.test(String(input.title ?? ''))) ||
      (Boolean(normalizedFeature) &&
        Boolean(normalizedScenario) &&
        normalizedTitle.includes(normalizedFeature) &&
        normalizedTitle.includes(normalizedScenario));
    const titleClause = this.cleanTitleClause(prefersScenarioClause ? scenario || feature || rawTitle : rawTitle || scenario || feature);
    const sentenceTitle = this.buildSentenceStyleTitle(titleClause, feature, scenario);
    if (sentenceTitle) {
      return sentenceTitle;
    }

    if (objective) {
      const strippedObjective = objective
        .replace(/^verify that\s+/i, '')
        .replace(/^verify\s+/i, '')
        .replace(/[.]+$/g, '')
        .trim();

      if (strippedObjective) {
        return `Verify that ${this.lowercaseFirst(strippedObjective)}.`;
      }
    }

    return 'Verify that the selected coverage works correctly.';
  }

  private cleanTitleClause(value: string) {
    return this.cleanTitleFragment(
      String(value ?? '')
        .replace(/^verify that\s+/i, '')
        .replace(/^verify\s+/i, '')
        .replace(/[.…]+/g, ' ')
        .replace(/[()]/g, ' ')
        .replace(/[.]{3,}/g, ' ')
        .replace(/\bpage[_\s-]?level\b/gi, 'page level')
        .replace(/\bunit[_\s-]?type\b/gi, '')
        .replace(/\bcoverage[_\s-]?bucket\b/gi, '')
        .replace(/\bpage[_\s-]?area\b/gi, '')
        .replace(/\bscenario[_\s-]?type\b/gi, '')
        .replace(/\b[a-z]+(?:_[a-z]+)+:[a-z0-9-]+\b/gi, ' ')
        .replace(/\b[a-z]+:[a-z0-9-]{4,}\b/gi, ' '),
      TestGenerationReviewPageComponent.CASE_TITLE_MAX_LENGTH,
    );
  }

  private buildSentenceStyleTitle(clause: string, feature: string, scenario: string) {
    const cleanedClause = this.cleanTitleClause(clause);
    const cleanedFeature = this.cleanTitleFragment(feature, 120);
    const cleanedScenario = this.cleanTitleFragment(scenario, 160);
    const subject = cleanedFeature
      ? `the ${this.lowercaseFirst(cleanedFeature)}`
      : cleanedScenario
        ? `the ${this.lowercaseFirst(cleanedScenario)}`
        : 'the feature';

    const clauseToUse = cleanedClause || cleanedScenario || cleanedFeature;
    if (!clauseToUse) {
      return '';
    }

    const selectionRefreshMatch = clauseToUse.match(/^(.+?) selection refresh and reconciliation$/i);
    if (selectionRefreshMatch?.[1]) {
      return `Verify that selecting ${this.withLeadingDeterminer(selectionRefreshMatch[1])} refreshes and reconciles the page correctly.`;
    }

    const refreshAfterMatch = clauseToUse.match(/^widget refresh after (.+)$/i);
    if (refreshAfterMatch?.[1]) {
      return `Verify that widgets refresh correctly after ${this.lowercaseFirst(refreshAfterMatch[1])}.`;
    }

    const refreshOnMatch = clauseToUse.match(/^widget refresh on (.+)$/i);
    if (refreshOnMatch?.[1]) {
      return `Verify that widgets refresh correctly when ${this.lowercaseFirst(refreshOnMatch[1])}.`;
    }

    const resilienceMatch = clauseToUse.match(/^(.+?) resilience (?:against|during|under) (.+)$/i);
    if (resilienceMatch?.[2]) {
      return `Verify that ${subject} handles ${this.lowercaseFirst(resilienceMatch[2])} correctly.`;
    }

    const switchingMatch = clauseToUse.match(/^(.+?) switching$/i);
    if (switchingMatch?.[1]) {
      return `Verify that ${this.lowercaseFirst(switchingMatch[1])} can be switched correctly.`;
    }

    const persistenceMatch = clauseToUse.match(/^state persistence after (.+)$/i);
    if (persistenceMatch?.[1]) {
      return `Verify that state persists correctly after ${this.lowercaseFirst(persistenceMatch[1])}.`;
    }

    const keyboardMatch = clauseToUse.match(/^keyboard (.+)$/i);
    if (keyboardMatch?.[1]) {
      return `Verify that ${subject} supports keyboard ${this.lowercaseFirst(keyboardMatch[1])} correctly.`;
    }

    const layoutMatch = clauseToUse.match(/^(.+?) (?:responsiveness and )?layout stability$/i);
    if (layoutMatch) {
      return `Verify that ${subject} remains responsive and layout stays stable.`;
    }

    if (/^(when|if|while|after|before|once)\b/i.test(clauseToUse)) {
      return `Verify that ${this.lowercaseFirst(clauseToUse)}.`;
    }

    return `Verify that ${this.lowercaseFirst(clauseToUse)} works correctly.`;
  }

  private lowercaseFirst(value: string) {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
      return '';
    }

    return normalized.charAt(0).toLowerCase() + normalized.slice(1).toLowerCase();
  }

  private withLeadingDeterminer(value: string) {
    const normalized = this.lowercaseFirst(value);
    if (!normalized) {
      return '';
    }

    if (/^(the|a|an|this|that|these|those|selected|current|new)\b/i.test(normalized)) {
      return normalized;
    }

    return `the ${normalized}`;
  }

  private looksStructuredCaseTitle(value: string, testCase?: GeneratedTestCase) {
    const normalized = String(value ?? '').trim();
    if (!normalized) {
      return false;
    }

    const comparisonValue = this.normalizeComparisonText(normalized);
    const featureKey = this.normalizeComparisonText(testCase?.feature ?? '');
    const scenarioKey = this.normalizeComparisonText(testCase?.scenario ?? '');
    const repeatsFeature = Boolean(featureKey) && comparisonValue.split(featureKey).length > 2;
    const mirrorsFeatureScenario =
      normalized.startsWith('Verify ') &&
      !/^Verify that\b/i.test(normalized) &&
      Boolean(featureKey) &&
      Boolean(scenarioKey) &&
      comparisonValue.includes(featureKey) &&
      comparisonValue.includes(scenarioKey);
    const verifyFragmentTitle = /^Verify\s+/i.test(normalized) && !/^Verify that\b/i.test(normalized);

    return (
      normalized.endsWith('...') ||
      normalized.endsWith('…') ||
      /[_]/.test(normalized) ||
      /[:()]/.test(normalized) ||
      verifyFragmentTitle ||
      repeatsFeature ||
      mirrorsFeatureScenario ||
      /\b(page[_\s-]?area|page[_\s-]?level|unit(?:[_\s-]?type)?|coverage[_\s-]?bucket|scenario[_\s-]?type)\b/i.test(
        normalized,
      ) ||
      /\b[a-z]+(?:_[a-z]+)+:[a-z0-9-]+\b/i.test(normalized) ||
      /\b[a-z]+:[a-z0-9-]{4,}\b/i.test(normalized)
    );
  }

  private normalizeDetailedDescription(input: {
    objective: string;
    title: string;
    feature: string;
    scenario: string;
    testType: string;
    firstAction: string;
    notes: string;
    fallback: string;
  }) {
    const existing = String(input.objective ?? '').trim();
    const normalizedExistingSentence = this.normalizeExistingDetailedDescription(existing);
    const title = String(input.title ?? '').trim();
    const normalizedExisting = this.normalizeComparisonText(normalizedExistingSentence);
    const normalizedTitle = this.normalizeComparisonText(title);

    if (
      normalizedExistingSentence &&
      normalizedExisting &&
      normalizedExisting !== normalizedTitle &&
      normalizedExistingSentence.length >= Math.min(50, title.length + 8)
    ) {
      return normalizedExistingSentence;
    }

    const feature = this.cleanTitleFragment(input.feature, 80) || 'the feature';
    const scenario = this.cleanTitleFragment(input.scenario, 100) || 'the intended scenario';
    const testType = this.cleanTitleFragment(input.testType, 40) || 'functional';
    const firstAction = this.cleanTitleFragment(input.firstAction, 140);
    const notes = this.cleanTitleFragment(input.notes, 180);
    const behavior = this.cleanTitleFragment(title.replace(/^verify\s+/i, ''), 140) || 'the expected behavior';

    const sentences = [
      `Validate ${feature.toLowerCase()} for ${scenario.toLowerCase()} in this ${testType.toLowerCase()} testcase.`,
      `Confirm ${behavior.charAt(0).toLowerCase()}${behavior.slice(1)} without contradictory UI state or incorrect data handling.`,
    ];

    if (firstAction) {
      sentences.push(`Start by ${firstAction.charAt(0).toLowerCase()}${firstAction.slice(1)}.`);
    }

    if (notes) {
      sentences.push(`Pay attention to ${notes.charAt(0).toLowerCase()}${notes.slice(1)}.`);
    }

    return sentences.join(' ') || input.fallback;
  }

  private normalizeExistingDetailedDescription(value: string) {
    const normalized = String(value ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!normalized) {
      return '';
    }

    const deDoubled = normalized
      .replace(/^verify that ensure that\s+/i, 'Verify that ')
      .replace(/^verify ensure that\s+/i, 'Verify that ')
      .replace(/^verify that verify that\s+/i, 'Verify that ')
      .replace(/^ensure that verify that\s+/i, 'Ensure that ');

    const stripped = deDoubled
      .replace(/^verify that\s+/i, '')
      .replace(/^verify\s+/i, '')
      .replace(/^ensure that\s+/i, '')
      .trim();

    if (!stripped) {
      return '';
    }

    return `${stripped.charAt(0).toUpperCase()}${stripped.slice(1)}`.replace(/[. ]*$/g, '').trim() + '.';
  }

  private normalizeEditableCaseTitle(index: number) {
    const caseGroup = this.getCaseGroup(index);
    if (!caseGroup) {
      return;
    }

    const rawTitle = String(caseGroup.get('title')?.value ?? '').trim();
    const normalizedTitle = this.normalizeStoredCaseTitle(rawTitle, caseGroup.getRawValue() as GeneratedTestCase);
    if (!normalizedTitle || normalizedTitle === rawTitle) {
      return;
    }

    caseGroup.get('title')?.setValue(normalizedTitle, { emitEvent: false });
  }

  private cleanTitleFragment(value: string, maxLength: number) {
    const normalized = String(value ?? '')
      .replace(/[_]+/g, ' ')
      .replace(/\s*[·-]\s*/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!normalized) {
      return '';
    }

    return normalized.length > maxLength ? normalized.slice(0, maxLength).trim() : normalized;
  }

  private normalizeComparisonText(value: string) {
    return String(value ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private rejectionReasonLabel(reasonCode: TestCaseFeedbackReason) {
    return this.rejectionReasonOptions.find((option) => option.value === reasonCode)?.label ?? 'Rejected testcase';
  }

  private promotionTargetLabel(targetType: KnowledgeSuggestionTargetType) {
    return this.promotionTargetOptions.find((option) => option.value === targetType)?.label ?? 'Project memory';
  }

  caseMatchesCoverageFocus(index: number) {
    const focus = this.coverageFocus();
    if (!focus.kind || !focus.key) {
      return true;
    }

    const caseValue = this.getCaseGroup(index)?.getRawValue();
    if (!caseValue) {
      return false;
    }

    const haystack = [
      caseValue.title,
      caseValue.objective,
      caseValue.feature,
      caseValue.scenario,
      caseValue.testType,
      caseValue.priority,
      caseValue.severity,
      caseValue.notes,
      caseValue.tags,
      caseValue.linkedComponents,
      caseValue.linkedFeatureTypes,
      caseValue.linkedRulePacks,
      caseValue.linkedTaxonomy,
      caseValue.sourceReferences,
    ]
      .map((value) => this.normalizeComparisonText(String(value ?? '')))
      .join(' ');

    return haystack.includes(this.normalizeComparisonText(focus.key));
  }

  caseIsCoverageMuted(index: number) {
    return this.hasCoverageFocus() && !this.caseMatchesCoverageFocus(index);
  }

  private downloadBlob(blob: Blob, filename: string) {
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = filename;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => window.URL.revokeObjectURL(url), 0);
  }

  private ensureCaseVisible(index: number, block: ScrollLogicalPosition = 'nearest') {
    const card = document.querySelector<HTMLElement>(`[data-case-card-index="${index}"]`);
    const scrollContainer = document.querySelector<HTMLElement>('.review-main');
    if (!card || !scrollContainer) {
      return;
    }

    const cardRect = card.getBoundingClientRect();
    const containerRect = scrollContainer.getBoundingClientRect();
    const padding = 16;
    const aboveViewport = cardRect.top < containerRect.top + padding;
    const belowViewport = cardRect.bottom > containerRect.bottom - padding;

    if (aboveViewport || belowViewport) {
      card.scrollIntoView({ behavior: 'auto', block, inline: 'nearest' });
    }
  }

  private focusCaseTitle(index: number) {
    const card = document.querySelector<HTMLElement>(`[data-case-card-index="${index}"]`);
    if (!card) {
      return;
    }

    const titleField = card.querySelector<HTMLElement>('.jira-title-field');
    const titleInput = titleField?.querySelector<HTMLTextAreaElement>('textarea');

    card.scrollIntoView({ behavior: 'auto', block: 'start', inline: 'nearest' });
    titleInput?.focus({ preventScroll: true });
    try {
      titleInput?.setSelectionRange(0, 0);
    } catch {}
  }

  private scrollReviewMainToTop() {
    const scrollContainer = document.querySelector<HTMLElement>('.review-main');
    scrollContainer?.scrollTo({ top: 0, behavior: 'auto' });
  }

  private ensureSuiteEditable(actionLabel: string) {
    if (!this.isSelectedDraftLocked()) {
      return true;
    }

    this.notifications.error(`${actionLabel} is disabled for finalized or rejected suites. Click Edit Suite to continue.`);
    return false;
  }

  private setSuiteEditingState(locked: boolean) {
    if (locked) {
      this.form.disable({ emitEvent: false });
      return;
    }

    this.form.enable({ emitEvent: false });
  }
}
