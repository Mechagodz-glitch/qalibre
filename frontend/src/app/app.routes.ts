import { Routes } from '@angular/router';

import { entityConfigList } from './core/entity-config';
import { DashboardPageComponent } from './features/dashboard/dashboard-page.component';
import { AdminPageComponent } from './features/admin/admin-page.component';
import { AuthCallbackPageComponent } from './features/auth/auth-callback-page.component';
import { DatasetDetailPageComponent } from './features/datasets/dataset-detail-page.component';
import { DatasetEditorPageComponent } from './features/datasets/dataset-editor-page.component';
import { DatasetListPageComponent } from './features/datasets/dataset-list-page.component';
import { KnowledgeBaseWorkspaceComponent } from './features/knowledge-base/knowledge-base-workspace.component';
import { ManualExecutionDashboardPageComponent } from './features/manual-execution/manual-execution-dashboard-page.component';
import { ManualExecutionPageComponent } from './features/manual-execution/manual-execution-page.component';
import { ManualExecutionReportPageComponent } from './features/manual-execution/manual-execution-report-page.component';
import { ManualExecutionRunPageComponent } from './features/manual-execution/manual-execution-run-page.component';
import { ManualExecutionTestExecutionPageComponent } from './features/manual-execution/manual-execution-test-execution-page.component';
import { ManualExecutionWorkspacePageComponent } from './features/manual-execution/manual-execution-workspace-page.component';
import { LoginPageComponent } from './features/auth/login-page.component';
import { TestGenerationExportPageComponent } from './features/test-generation/test-generation-export-page.component';
import { TestGenerationPageComponent } from './features/test-generation/test-generation-page.component';
import { TestGenerationReviewPageComponent } from './features/test-generation/test-generation-review-page.component';
import { TestGenerationRunListPageComponent } from './features/test-generation/test-generation-run-list-page.component';
import { authGuard } from './core/auth.guard';

const datasetRoutes: Routes = entityConfigList.flatMap((entity) => [
  {
    path: entity.route,
    component: DatasetListPageComponent,
    canActivate: [authGuard],
    data: { itemType: entity.key, pageKey: 'knowledgeBase' },
  },
  {
    path: `${entity.route}/new`,
    component: DatasetEditorPageComponent,
    canActivate: [authGuard],
    data: { itemType: entity.key, pageKey: 'knowledgeBase' },
  },
  {
    path: `${entity.route}/:id/edit`,
    component: DatasetEditorPageComponent,
    canActivate: [authGuard],
    data: { itemType: entity.key, pageKey: 'knowledgeBase' },
  },
  {
    path: `${entity.route}/:id`,
    component: DatasetDetailPageComponent,
    canActivate: [authGuard],
    data: { itemType: entity.key, pageKey: 'knowledgeBase' },
  },
]);

export const routes: Routes = [
  {
    path: '',
    component: DashboardPageComponent,
    canActivate: [authGuard],
    data: { pageKey: 'dashboard' },
  },
  {
    path: 'login',
    component: LoginPageComponent,
    data: { public: true },
  },
  {
    path: 'auth/callback',
    component: AuthCallbackPageComponent,
    data: { public: true },
  },
  {
    path: 'knowledge-base',
    component: KnowledgeBaseWorkspaceComponent,
    canActivate: [authGuard],
    data: { pageKey: 'knowledgeBase' },
  },
  ...datasetRoutes,
  {
    path: 'test-generator',
    component: TestGenerationPageComponent,
    canActivate: [authGuard],
    data: { pageKey: 'generator' },
  },
  {
    path: 'test-generator/review',
    component: TestGenerationReviewPageComponent,
    canActivate: [authGuard],
    data: { pageKey: 'testSuites' },
  },
  {
    path: 'test-generator/runs',
    component: TestGenerationRunListPageComponent,
    canActivate: [authGuard],
    data: { pageKey: 'generationRuns' },
  },
  {
    path: 'test-generator/export',
    component: TestGenerationExportPageComponent,
    canActivate: [authGuard],
    data: { pageKey: 'exports' },
  },
  {
    path: 'manual-execution',
    component: ManualExecutionWorkspacePageComponent,
    canActivate: [authGuard],
    data: { pageKey: 'manualExecution' },
    children: [
      {
        path: '',
        pathMatch: 'full',
        redirectTo: 'dashboard',
      },
      {
        path: 'dashboard',
        component: ManualExecutionDashboardPageComponent,
      },
      {
        path: 'test-run',
        component: ManualExecutionPageComponent,
      },
      {
        path: 'test-execution',
        component: ManualExecutionTestExecutionPageComponent,
      },
      {
        path: 'test-execution/:runId',
        component: ManualExecutionRunPageComponent,
      },
      {
        path: 'test-execution/:runId/report',
        component: ManualExecutionReportPageComponent,
      },
    ],
  },
  {
    path: 'manual-execution/create',
    redirectTo: 'manual-execution/test-run',
    pathMatch: 'full',
  },
  {
    path: 'manual-execution/runs/:runId',
    redirectTo: 'manual-execution/test-execution/:runId',
    pathMatch: 'full',
  },
  {
    path: 'manual-execution/runs/:runId/report',
    redirectTo: 'manual-execution/test-execution/:runId/report',
    pathMatch: 'full',
  },
  {
    path: 'refinement/queue',
    redirectTo: 'knowledge-base',
    pathMatch: 'full',
  },
  {
    path: 'refinement/runs',
    redirectTo: 'knowledge-base',
    pathMatch: 'full',
  },
  {
    path: 'refinement/runs/:runId',
    redirectTo: 'knowledge-base',
    pathMatch: 'full',
  },
  {
    path: 'export',
    redirectTo: 'knowledge-base',
    pathMatch: 'full',
  },
  {
    path: 'admin',
    component: AdminPageComponent,
    canActivate: [authGuard],
    data: { pageKey: 'admin', adminOnly: true },
  },
  {
    path: '**',
    redirectTo: '',
  },
];
