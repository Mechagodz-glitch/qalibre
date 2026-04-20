import { ApprovalAction, DatasetStatus } from '@prisma/client';

import { prisma } from '../src/db/prisma.js';
import { toPrismaJson } from '../src/lib/json.js';
import { slugify } from '../src/lib/slug.js';
import { getDefaultComponentStandardTestCases } from '../src/modules/datasets/component-standard-test-cases.js';
import { buildOrderedExportObject, deriveMetadataFromPayload, toDatasetItemResponse } from '../src/modules/datasets/dataset.mapper.js';
import { getDatasetEntityDefinition } from '../src/modules/datasets/dataset.registry.js';
import type { ApiDatasetItemType } from '../src/modules/datasets/dataset.schemas.js';

const actor = 'seed-script';

const contributorSeeds = [
  {
    name: 'Akshaya Kumar Vijayaganeshvara Moorthi',
    roleTitle: 'QA Engineer (QA 2)',
    department: 'Stability & Security',
    location: 'Chennai Headquarters',
    accentColor: '#63d1c3',
  },
  {
    name: 'Khyati Dhawan',
    roleTitle: 'QA Engineer (QA 2)',
    department: 'Stability & Security',
    location: 'Chennai Headquarters',
    accentColor: '#65d0c8',
  },
  {
    name: 'Naren Vishwa Swaminathan',
    roleTitle: 'QA Engineer (QA 2)',
    department: 'Stability & Security',
    location: 'Chennai Headquarters',
    accentColor: '#7bc6ff',
  },
  {
    name: 'Ruban Chakravarthy V',
    roleTitle: 'QA Engineer (QA 2)',
    department: 'Stability & Security',
    location: 'Chennai Headquarters',
    accentColor: '#4b9df1',
  },
  {
    name: 'Sakthivel M',
    roleTitle: 'Senior QA Engineer (QA 3)',
    department: 'Stability & Security',
    location: 'Chennai Headquarters',
    accentColor: '#87c766',
  },
  {
    name: 'Sowndarya Saravanan',
    roleTitle: 'Senior QA Engineer (QA 3)',
    department: 'Stability & Security',
    location: 'Chennai Headquarters',
    accentColor: '#d86baf',
  },
  {
    name: 'Vaishnavi M',
    roleTitle: 'Associate Manager QA (MQA1)',
    department: 'Stability & Security',
    location: 'Chennai Headquarters',
    accentColor: '#8cc95d',
  },
] as const;

const projectHierarchySeeds = [
  {
    name: 'Safety Assistant',
    description: 'Centralized safety analytics, surveillance, and operational risk workflows.',
    modules: [
      {
        name: 'Dashboard',
        description: 'Home-level analytics, KPI cards, and trend monitoring.',
        pages: [
          {
            name: 'Home Dashboard',
            routeHint: '/safety-and-surveillance/dashboard',
            description: 'Risk, observation, and life-saving-rule overview surface.',
          },
          {
            name: 'Analytics Overview',
            routeHint: '/safety-and-surveillance/analytics',
            description: 'Deeper analytical trend and category drilldowns.',
          },
        ],
      },
      {
        name: 'Observations',
        description: 'Observation listing, detail review, and drilldown workflows.',
        pages: [
          {
            name: 'Observation List',
            routeHint: '/safety-and-surveillance/observations',
            description: 'Primary record list for observation management and filtering.',
          },
          {
            name: 'Timeline Review',
            routeHint: '/safety-and-surveillance/timeline',
            description: 'Chronological review of observation events.',
          },
        ],
      },
      {
        name: 'Actions & Reports',
        description: 'Corrective actions, notifications, and report access.',
        pages: [
          {
            name: 'Actions Workspace',
            routeHint: '/safety-and-surveillance/actions',
            description: 'Action tracking and follow-up management.',
          },
          {
            name: 'Reports Viewer',
            routeHint: '/safety-and-surveillance/reports',
            description: 'Report list and document viewing workflow.',
          },
        ],
      },
    ],
  },
  {
    name: 'QA Dataset Workbench',
    description: 'Dataset authoring, AI refinement, and standardized test case generation.',
    modules: [
      {
        name: 'Knowledge Base',
        description: 'Authoring and refinement of reusable QA datasets.',
        pages: [
          {
            name: 'Dataset Command Center',
            routeHint: '/',
            description: 'Executive summary of authored datasets and workflow state.',
          },
        ],
      },
      {
        name: 'Generation',
        description: 'Source-driven and manual test case generation workflow.',
        pages: [
          {
            name: 'Test Case Generator',
            routeHint: '/test-generator',
            description: 'Process Alpha and Process Beta suite generation.',
          },
          {
            name: 'Generated Review',
            routeHint: '/test-generator/review',
            description: 'Review, edit, and approve generated suites.',
          },
        ],
      },
    ],
  },
] as const;

type SeedRecord = {
  itemType: ApiDatasetItemType;
  payload: Record<string, unknown>;
};

const seedRecords: SeedRecord[] = [
  {
    itemType: 'componentCatalogue',
    payload: {
      name: 'Dropdown',
      aliases: ['Select', 'Single Select', 'Single Select Dropdown'],
      category: 'Input Control',
      description: 'Single-selection list control that reveals options on demand.',
      states: ['default', 'focused', 'disabled', 'loading', 'error', 'empty', 'selected'],
      validations: ['required selection', 'placeholder text', 'keyboard navigation', 'option filtering'],
      commonRisks: ['selected value not persisted', 'stale option list', 'broken keyboard support'],
      applicableTestTypes: ['smoke', 'functional', 'accessibility', 'compatibility'],
      smokeScenarios: ['Open the dropdown and select a valid option', 'Persist a saved selection after reload'],
      standardTestCases: getDefaultComponentStandardTestCases('Dropdown', ['Single Select Dropdown']),
      tags: ['form', 'selection', 'input'],
    },
  },
  {
    itemType: 'componentCatalogue',
    payload: {
      name: 'Multiselect',
      aliases: ['Multi Select', 'Tag Picker', 'Multiselect Dropdown'],
      category: 'Input Control',
      description: 'Control that allows multiple options to be chosen and reviewed together.',
      states: ['default', 'focused', 'disabled', 'loading', 'error', 'with selections'],
      validations: ['max selection count', 'chip removal', 'search filtering', 'required selection'],
      commonRisks: ['duplicate values', 'selection loss on blur', 'overflowed chip rendering'],
      applicableTestTypes: ['smoke', 'functional', 'usability', 'accessibility'],
      smokeScenarios: ['Select multiple options and save', 'Remove one selected option cleanly'],
      standardTestCases: getDefaultComponentStandardTestCases('Multiselect', ['Multiselect Dropdown']),
      tags: ['form', 'selection', 'multi-value'],
    },
  },
  {
    itemType: 'componentCatalogue',
    payload: {
      name: 'Date Picker',
      aliases: ['Calendar Picker', 'Date Selector', 'Single Date Picker'],
      category: 'Input Control',
      description: 'Calendar-driven date entry control for a single date value.',
      states: ['default', 'focused', 'disabled', 'error', 'readonly', 'selected date'],
      validations: ['min and max date', 'manual entry parsing', 'timezone-safe save', 'format display'],
      commonRisks: ['off-by-one date', 'locale mismatch', 'invalid manual input accepted'],
      applicableTestTypes: ['smoke', 'functional', 'compatibility', 'localization'],
      smokeScenarios: ['Pick a valid date from the calendar', 'Save a date and confirm it renders correctly'],
      standardTestCases: getDefaultComponentStandardTestCases('Date Picker', ['Single Date Picker']),
      tags: ['form', 'date', 'calendar'],
    },
  },
  {
    itemType: 'componentCatalogue',
    payload: {
      name: 'Date Range Picker',
      aliases: ['Range Calendar', 'Date Span Picker'],
      category: 'Input Control',
      description: 'Date selection control that captures both a start and end date.',
      states: ['default', 'focused', 'disabled', 'error', 'partial selection', 'complete selection'],
      validations: ['start before end', 'range limit', 'preset ranges', 'clear action'],
      commonRisks: ['end date before start date', 'partial range persistence', 'preset mismatch'],
      applicableTestTypes: ['smoke', 'functional', 'compatibility', 'localization'],
      smokeScenarios: ['Choose a valid start and end date', 'Clear an existing range and save'],
      standardTestCases: getDefaultComponentStandardTestCases('Date Range Picker'),
      tags: ['form', 'date', 'range'],
    },
  },
  {
    itemType: 'componentCatalogue',
    payload: {
      name: 'Table',
      aliases: ['Grid', 'Data Table'],
      category: 'Data Display',
      description: 'Structured tabular view for records, sorting, filtering, and row actions.',
      states: ['default', 'loading', 'empty', 'sorted', 'filtered', 'paginated'],
      validations: ['column sorting', 'filter persistence', 'row action targeting', 'empty state rendering'],
      commonRisks: ['sort order incorrect', 'stale row actions', 'column misalignment'],
      applicableTestTypes: ['smoke', 'functional', 'usability', 'accessibility', 'performance'],
      smokeScenarios: ['Load the table and verify visible data', 'Sort a column and confirm order changes'],
      tags: ['data-display', 'grid', 'table'],
    },
  },
  {
    itemType: 'componentCatalogue',
    payload: {
      name: 'Chart',
      aliases: ['Graph', 'Visualization'],
      category: 'Data Visualization',
      description: 'Graphical data display component such as line, bar, or pie chart.',
      states: ['default', 'loading', 'empty', 'error', 'interactive'],
      validations: ['legend accuracy', 'tooltip content', 'axis formatting', 'empty data rendering'],
      commonRisks: ['visual mismatch with source data', 'incorrect tooltip labels', 'responsive overflow'],
      applicableTestTypes: ['smoke', 'functional', 'usability', 'compatibility'],
      smokeScenarios: ['Render chart with valid data', 'Hover a data point and verify tooltip details'],
      tags: ['analytics', 'visualization', 'data-display'],
    },
  },
  {
    itemType: 'componentCatalogue',
    payload: {
      name: 'Modal',
      aliases: ['Dialog', 'Popup'],
      category: 'Overlay',
      description: 'Overlay container used for focused actions or confirmations.',
      states: ['closed', 'open', 'submitting', 'error', 'disabled actions'],
      validations: ['focus trap', 'close affordance', 'background scroll lock', 'escape key support'],
      commonRisks: ['focus escape', 'double submission', 'background interaction leakage'],
      applicableTestTypes: ['smoke', 'functional', 'accessibility', 'usability'],
      smokeScenarios: ['Open and close the modal cleanly', 'Submit a primary modal action successfully'],
      tags: ['overlay', 'dialog', 'interaction'],
    },
  },
  {
    itemType: 'componentCatalogue',
    payload: {
      name: 'File Upload',
      aliases: ['Uploader', 'Attachment Field'],
      category: 'Input Control',
      description: 'Component for selecting, uploading, validating, and previewing files.',
      states: ['default', 'uploading', 'uploaded', 'error', 'disabled', 'retrying'],
      validations: ['allowed file types', 'max size', 'upload retry', 'progress visibility'],
      commonRisks: ['silent upload failure', 'wrong file accepted', 'duplicate file submission'],
      applicableTestTypes: ['smoke', 'functional', 'security', 'performance'],
      smokeScenarios: ['Upload a supported file successfully', 'Reject an invalid file type with a clear error'],
      tags: ['file', 'attachment', 'input'],
    },
  },
  {
    itemType: 'componentCatalogue',
    payload: {
      name: 'Text Input',
      aliases: ['Input Field', 'Single Line Input', 'Text Input Field'],
      category: 'Input Control',
      description: 'Single-line text field for direct data entry.',
      states: ['default', 'focused', 'disabled', 'readonly', 'error', 'filled'],
      validations: ['required', 'min and max length', 'masking', 'inline validation feedback'],
      commonRisks: ['trim mismatch', 'input reset on rerender', 'invalid characters accepted'],
      applicableTestTypes: ['smoke', 'functional', 'accessibility', 'compatibility'],
      smokeScenarios: ['Enter valid text and save', 'Show validation feedback for invalid input'],
      standardTestCases: getDefaultComponentStandardTestCases('Text Input', ['Text Input Field']),
      tags: ['form', 'text', 'input'],
    },
  },
  {
    itemType: 'componentCatalogue',
    payload: {
      name: 'Textarea',
      aliases: ['Multi-line Input', 'Rich Text Plain Field', 'Text Area'],
      category: 'Input Control',
      description: 'Multi-line text field used for longer free-form content.',
      states: ['default', 'focused', 'disabled', 'readonly', 'error', 'resized'],
      validations: ['max length', 'line break handling', 'pasted content', 'autosize behavior'],
      commonRisks: ['content truncation', 'unexpected formatting loss', 'autosize layout shift'],
      applicableTestTypes: ['smoke', 'functional', 'usability', 'compatibility'],
      smokeScenarios: ['Enter and persist multi-line content', 'Display a validation error for too much text'],
      standardTestCases: getDefaultComponentStandardTestCases('Textarea', ['Text Area']),
      tags: ['form', 'text', 'multi-line'],
    },
  },
  {
    itemType: 'componentCatalogue',
    payload: {
      name: 'Tabs',
      aliases: ['Tab Set', 'Segmented View'],
      category: 'Navigation',
      description: 'Horizontal navigation control that switches between related content panels.',
      states: ['default', 'active tab', 'disabled tab', 'overflowed', 'loading panel'],
      validations: ['tab switch persistence', 'keyboard navigation', 'disabled tab handling', 'deep linking'],
      commonRisks: ['wrong panel shown', 'state loss on tab switch', 'focus order mismatch'],
      applicableTestTypes: ['smoke', 'functional', 'accessibility', 'usability'],
      smokeScenarios: ['Switch between tabs and verify content changes', 'Preserve the active tab on refresh when applicable'],
      tags: ['navigation', 'layout', 'stateful'],
    },
  },
  {
    itemType: 'componentCatalogue',
    payload: {
      name: 'Pagination',
      aliases: ['Pager', 'Page Controls'],
      category: 'Navigation',
      description: 'Navigation control used to move across paged result sets.',
      states: ['default', 'first page', 'middle page', 'last page', 'disabled'],
      validations: ['page boundary rules', 'current page indicator', 'page size switch', 'result count sync'],
      commonRisks: ['wrong page index', 'disabled controls active', 'page reset after filter'],
      applicableTestTypes: ['smoke', 'functional', 'usability', 'compatibility'],
      smokeScenarios: ['Move to the next page and confirm data changes', 'Prevent going past the last page'],
      standardTestCases: getDefaultComponentStandardTestCases('Pagination'),
      tags: ['navigation', 'data-display', 'paging'],
    },
  },
  {
    itemType: 'componentCatalogue',
    payload: {
      name: 'Login Form',
      aliases: ['Sign In Form', 'Authentication Form'],
      category: 'Form',
      description: 'Credential entry form used to authenticate a user into the application.',
      states: ['default', 'submitting', 'error', 'locked', 'success'],
      validations: ['required credentials', 'password masking', 'failed login feedback', 'remember me handling'],
      commonRisks: ['error disclosure', 'session mismatch', 'double submit on enter key'],
      applicableTestTypes: ['smoke', 'functional', 'security', 'accessibility'],
      smokeScenarios: ['Log in with valid credentials', 'Reject invalid credentials with a safe error message'],
      tags: ['authentication', 'form', 'security'],
    },
  },
  {
    itemType: 'rulePack',
    payload: {
      name: 'Form Validation',
      description: 'Reusable heuristics for validating required fields, inline feedback, and submission rules.',
      appliesToFeatureTypes: ['forms', 'authentication'],
      appliesToComponents: ['text input', 'textarea', 'dropdown', 'multiselect', 'date picker'],
      mandatoryScenarios: ['required field validation', 'invalid data rejection', 'successful save path'],
      negativeHeuristics: ['submit empty form', 'enter malformed values', 'bypass client-side validation'],
      edgeHeuristics: ['boundary lengths', 'rapid field switching', 'state reset after save'],
      securityHeuristics: ['sensitive value masking', 'error message safety'],
      performanceHeuristics: ['debounced validation', 'large form responsiveness'],
      accessibilityHeuristics: ['error announcement', 'label and hint association', 'keyboard-only completion'],
      defaultPriority: 'P1',
      tags: ['form', 'validation'],
    },
  },
  {
    itemType: 'rulePack',
    payload: {
      name: 'Authentication',
      description: 'Coverage guidance for login, logout, session persistence, and access control boundaries.',
      appliesToFeatureTypes: ['authentication'],
      appliesToComponents: ['login form', 'modal'],
      mandatoryScenarios: ['valid login', 'invalid login', 'logout', 'session timeout'],
      negativeHeuristics: ['invalid password attempts', 'expired session reuse', 'unauthorized route access'],
      edgeHeuristics: ['remember me persistence', 'multi-tab session state'],
      securityHeuristics: ['credential masking', 'safe failure messaging', 'token invalidation on logout'],
      performanceHeuristics: ['login latency handling'],
      accessibilityHeuristics: ['keyboard login flow', 'focus on error'],
      defaultPriority: 'P0',
      tags: ['auth', 'security'],
    },
  },
  {
    itemType: 'rulePack',
    payload: {
      name: 'Dashboard',
      description: 'Guidance for validating cards, charts, filters, and summary data on dashboard experiences.',
      appliesToFeatureTypes: ['dashboard analytics'],
      appliesToComponents: ['chart', 'table', 'tabs', 'pagination'],
      mandatoryScenarios: ['default dashboard load', 'filter application', 'data refresh'],
      negativeHeuristics: ['empty widgets', 'partial API failure', 'stale cache display'],
      edgeHeuristics: ['large datasets', 'responsive dashboard layout', 'mixed timezone data'],
      securityHeuristics: ['role-based widget visibility'],
      performanceHeuristics: ['initial load time', 'widget refresh timing'],
      accessibilityHeuristics: ['chart alternatives', 'widget heading structure'],
      defaultPriority: 'P1',
      tags: ['dashboard', 'analytics'],
    },
  },
  {
    itemType: 'rulePack',
    payload: {
      name: 'API Validation',
      description: 'Rules for request/response contract checks, error handling, and data integrity verification.',
      appliesToFeatureTypes: ['data management', 'dashboard analytics'],
      appliesToComponents: ['table', 'chart', 'file upload'],
      mandatoryScenarios: ['successful response mapping', 'error response handling', 'empty response handling'],
      negativeHeuristics: ['unexpected status codes', 'schema mismatch', 'partial payloads'],
      edgeHeuristics: ['slow responses', 'retries', 'duplicate submissions'],
      securityHeuristics: ['authorization failure handling', 'sensitive data exclusion'],
      performanceHeuristics: ['response time thresholds', 'large payload rendering'],
      accessibilityHeuristics: ['error state visibility'],
      defaultPriority: 'P1',
      tags: ['api', 'integration'],
    },
  },
  {
    itemType: 'rulePack',
    payload: {
      name: 'File Upload',
      description: 'Coverage rules for upload constraints, progress handling, and file replacement behaviors.',
      appliesToFeatureTypes: ['data management'],
      appliesToComponents: ['file upload', 'modal'],
      mandatoryScenarios: ['valid file upload', 'invalid type rejection', 'oversize file rejection'],
      negativeHeuristics: ['network interruption', 'duplicate upload', 'cancel mid-upload'],
      edgeHeuristics: ['multiple sequential uploads', 'very small files', 'filename special characters'],
      securityHeuristics: ['unsafe file type rejection', 'download permission checks'],
      performanceHeuristics: ['large file upload responsiveness'],
      accessibilityHeuristics: ['screen-reader upload status', 'keyboard file selection'],
      defaultPriority: 'P1',
      tags: ['file', 'integration'],
    },
  },
  {
    itemType: 'rulePack',
    payload: {
      name: 'Date / Time',
      description: 'Guidance for date parsing, timezone display, and boundary validation.',
      appliesToFeatureTypes: ['forms', 'dashboard analytics'],
      appliesToComponents: ['date picker', 'date range picker', 'table'],
      mandatoryScenarios: ['valid date entry', 'range validation', 'timezone-safe persistence'],
      negativeHeuristics: ['invalid manual entry', 'future date when disallowed', 'cross-timezone save mismatch'],
      edgeHeuristics: ['DST boundaries', 'leap year dates', 'locale-specific formats'],
      securityHeuristics: [],
      performanceHeuristics: ['calendar render responsiveness'],
      accessibilityHeuristics: ['calendar keyboard support', 'date error announcements'],
      defaultPriority: 'P1',
      tags: ['date', 'time'],
    },
  },
  {
    itemType: 'rulePack',
    payload: {
      name: 'Table / Grid',
      description: 'Guidance for sorting, filtering, pagination, selection, and bulk action coverage.',
      appliesToFeatureTypes: ['data management', 'dashboard analytics'],
      appliesToComponents: ['table', 'pagination'],
      mandatoryScenarios: ['default load', 'sorting', 'filtering', 'pagination'],
      negativeHeuristics: ['stale row selection', 'incorrect sort order', 'empty state mismatch'],
      edgeHeuristics: ['very large datasets', 'column overflow', 'filter plus pagination interaction'],
      securityHeuristics: ['row action permission checks'],
      performanceHeuristics: ['large grid responsiveness', 'incremental render behavior'],
      accessibilityHeuristics: ['table semantics', 'sortable header announcements'],
      defaultPriority: 'P1',
      tags: ['table', 'grid'],
    },
  },
  {
    itemType: 'featureType',
    payload: {
      name: 'Forms',
      description: 'Feature family centered on structured user input, validation, and submission.',
      applicableComponents: ['text input', 'textarea', 'dropdown', 'multiselect', 'date picker', 'date range picker'],
      applicableRulePacks: ['form validation', 'date / time'],
      applicableTestTypes: ['smoke', 'functional', 'accessibility', 'compatibility'],
      defaultScenarioBuckets: ['happy path', 'validation', 'edge cases', 'error handling'],
      tags: ['form', 'input'],
    },
  },
  {
    itemType: 'featureType',
    payload: {
      name: 'Authentication',
      description: 'Feature family for identity entry, session management, and authorization boundaries.',
      applicableComponents: ['login form', 'modal'],
      applicableRulePacks: ['authentication', 'form validation'],
      applicableTestTypes: ['smoke', 'functional', 'security', 'accessibility'],
      defaultScenarioBuckets: ['login success', 'login failure', 'session lifecycle', 'access control'],
      tags: ['auth', 'security'],
    },
  },
  {
    itemType: 'featureType',
    payload: {
      name: 'Dashboard Analytics',
      description: 'Feature family for KPI surfaces, filters, charts, and analytical summaries.',
      applicableComponents: ['chart', 'table', 'tabs', 'pagination', 'date range picker'],
      applicableRulePacks: ['dashboard', 'api validation', 'date / time', 'table / grid'],
      applicableTestTypes: ['smoke', 'functional', 'performance', 'usability'],
      defaultScenarioBuckets: ['default load', 'filter interaction', 'visual accuracy', 'refresh behavior'],
      tags: ['dashboard', 'analytics'],
    },
  },
  {
    itemType: 'featureType',
    payload: {
      name: 'Data Management',
      description: 'Feature family for upload, listing, filtering, and editing business records.',
      applicableComponents: ['table', 'file upload', 'modal', 'pagination'],
      applicableRulePacks: ['api validation', 'file upload', 'table / grid'],
      applicableTestTypes: ['smoke', 'functional', 'integration', 'security'],
      defaultScenarioBuckets: ['create', 'update', 'delete', 'list interaction'],
      tags: ['crud', 'data'],
    },
  },
  {
    itemType: 'testTaxonomy',
    payload: {
      name: 'Smoke',
      description: 'Fast confidence checks for critical user flows and baseline system availability.',
      whenApplicable: ['high-priority workflows', 'deployment verification', 'core path confirmation'],
      whenNotApplicable: ['deep exploratory analysis', 'non-critical edge-case-only changes'],
      defaultPriority: 'P0',
      tags: ['baseline', 'critical-path'],
    },
  },
  {
    itemType: 'testTaxonomy',
    payload: {
      name: 'Functional',
      description: 'Checks that business behavior and user-visible flows work as expected.',
      whenApplicable: ['feature behavior changes', 'form logic', 'UI interactions'],
      whenNotApplicable: ['pure non-functional benchmarking'],
      defaultPriority: 'P1',
      tags: ['behavior', 'business-logic'],
    },
  },
  {
    itemType: 'testTaxonomy',
    payload: {
      name: 'Integration',
      description: 'Checks interactions between UI, services, APIs, and supporting dependencies.',
      whenApplicable: ['external API usage', 'data synchronization', 'multi-service workflows'],
      whenNotApplicable: ['fully isolated local-only behavior'],
      defaultPriority: 'P1',
      tags: ['integration', 'dependency'],
    },
  },
  {
    itemType: 'testTaxonomy',
    payload: {
      name: 'API',
      description: 'Focused validation of request contracts, response structures, and error handling.',
      whenApplicable: ['API-backed screens', 'contract-sensitive changes', 'payload transformations'],
      whenNotApplicable: ['pure presentation changes with no network impact'],
      defaultPriority: 'P1',
      tags: ['api', 'contract'],
    },
  },
  {
    itemType: 'testTaxonomy',
    payload: {
      name: 'Regression',
      description: 'Checks that previously working behavior remains intact after change.',
      whenApplicable: ['shared component changes', 'risk of side effects', 'bug fix verification'],
      whenNotApplicable: ['disconnected one-off prototypes'],
      defaultPriority: 'P1',
      tags: ['stability', 'coverage'],
    },
  },
  {
    itemType: 'testTaxonomy',
    payload: {
      name: 'E2E',
      description: 'Checks full user journeys through multiple layers of the application stack.',
      whenApplicable: ['critical workflows', 'journey validation across pages', 'release readiness'],
      whenNotApplicable: ['tiny isolated unit behaviors'],
      defaultPriority: 'P1',
      tags: ['journey', 'workflow'],
    },
  },
  {
    itemType: 'testTaxonomy',
    payload: {
      name: 'Performance',
      description: 'Checks responsiveness, rendering speed, and throughput under expected load.',
      whenApplicable: ['large datasets', 'dashboard screens', 'upload-heavy features'],
      whenNotApplicable: ['small static copy changes'],
      defaultPriority: 'P2',
      tags: ['non-functional', 'latency'],
    },
  },
  {
    itemType: 'testTaxonomy',
    payload: {
      name: 'Security',
      description: 'Checks confidentiality, integrity, authorization, and safe failure behavior.',
      whenApplicable: ['authentication', 'uploads', 'sensitive data', 'permissioned actions'],
      whenNotApplicable: ['public non-sensitive static content'],
      defaultPriority: 'P0',
      tags: ['security', 'risk'],
    },
  },
  {
    itemType: 'testTaxonomy',
    payload: {
      name: 'Accessibility',
      description: 'Checks keyboard support, semantics, contrast, and assistive-technology usability.',
      whenApplicable: ['interactive UI components', 'forms', 'navigation', 'modals'],
      whenNotApplicable: ['non-interactive backend-only changes'],
      defaultPriority: 'P1',
      tags: ['a11y', 'inclusive'],
    },
  },
  {
    itemType: 'testTaxonomy',
    payload: {
      name: 'Usability',
      description: 'Checks clarity, feedback quality, and user efficiency for intended tasks.',
      whenApplicable: ['new workflows', 'dashboard redesigns', 'high-touch inputs'],
      whenNotApplicable: ['purely technical background changes'],
      defaultPriority: 'P2',
      tags: ['ux', 'clarity'],
    },
  },
  {
    itemType: 'testTaxonomy',
    payload: {
      name: 'Compatibility',
      description: 'Checks behavior across supported browsers, viewports, and environments.',
      whenApplicable: ['responsive UI', 'browser-sensitive widgets', 'date or file APIs'],
      whenNotApplicable: ['server-only jobs'],
      defaultPriority: 'P2',
      tags: ['browser', 'environment'],
    },
  },
  {
    itemType: 'testTaxonomy',
    payload: {
      name: 'Data Integrity',
      description: 'Checks that saved, transformed, and displayed data remains correct and consistent.',
      whenApplicable: ['editing workflows', 'imports', 'API mapping'],
      whenNotApplicable: ['static-only presentational changes'],
      defaultPriority: 'P1',
      tags: ['data', 'consistency'],
    },
  },
  {
    itemType: 'testTaxonomy',
    payload: {
      name: 'Recovery',
      description: 'Checks graceful behavior after transient failures, retries, or interrupted actions.',
      whenApplicable: ['uploads', 'network-dependent flows', 'autosave or long-running actions'],
      whenNotApplicable: ['read-only static paths'],
      defaultPriority: 'P2',
      tags: ['resilience', 'failure-handling'],
    },
  },
  {
    itemType: 'scenarioTemplate',
    payload: {
      name: 'Successful Form Submission',
      scenarioType: 'happy-path',
      description: 'Reusable pattern for validating a successful submission flow.',
      preconditionPattern: 'User has access to the form and any required setup data exists.',
      stepPattern: 'Enter valid values into required inputs, submit the form, and wait for completion feedback.',
      expectedResultPattern: 'Submission succeeds, success feedback is shown, and persisted data matches the entered values.',
      tags: ['form', 'submission'],
      examples: ['Create a new record with valid mandatory fields', 'Update profile information with valid input'],
    },
  },
  {
    itemType: 'scenarioTemplate',
    payload: {
      name: 'Validation Error Handling',
      scenarioType: 'negative',
      description: 'Reusable pattern for verifying safe handling of invalid input.',
      preconditionPattern: 'User is on a screen with client-side or server-side validation rules.',
      stepPattern: 'Enter invalid or incomplete data, attempt submission, and observe validation feedback.',
      expectedResultPattern: 'Submission is blocked or safely rejected, and actionable error feedback is shown near the relevant inputs.',
      tags: ['validation', 'negative'],
      examples: ['Submit a required field as empty', 'Enter an unsupported date range'],
    },
  },
  {
    itemType: 'scenarioTemplate',
    payload: {
      name: 'State Persistence After Refresh',
      scenarioType: 'stability',
      description: 'Reusable pattern for verifying whether important state survives a reload or revisit.',
      preconditionPattern: 'The feature stores state or selections that should persist or intentionally reset.',
      stepPattern: 'Perform the state-changing action, refresh or navigate away and back, then inspect the restored state.',
      expectedResultPattern: 'The feature restores or resets state according to product expectations without corruption.',
      tags: ['persistence', 'state'],
      examples: ['Keep selected filters after refresh', 'Retain saved dropdown values after reopening the page'],
    },
  },
  {
    itemType: 'priorityMapping',
    payload: {
      name: 'Default Priority Mapping',
      description: 'Starter mapping for converting scenario criticality into execution priority.',
      rules: [
        { condition: 'Blocks login, checkout, save, or other critical path behavior', mappedValue: 'P0', notes: 'Highest urgency' },
        { condition: 'Breaks common user workflows with no simple workaround', mappedValue: 'P1' },
        { condition: 'Impacts secondary workflows or has an acceptable workaround', mappedValue: 'P2' },
        { condition: 'Minor polish or low-frequency scenario impact', mappedValue: 'P3' },
      ],
      tags: ['priority', 'starter'],
    },
  },
  {
    itemType: 'severityMapping',
    payload: {
      name: 'Default Severity Mapping',
      description: 'Starter mapping for translating observed impact into defect severity.',
      rules: [
        { condition: 'System crash, data loss, or security breach', mappedValue: 'Critical' },
        { condition: 'Major feature broken for most users or key role paths', mappedValue: 'High' },
        { condition: 'Feature degraded with workaround available', mappedValue: 'Medium' },
        { condition: 'Cosmetic or low-impact issue', mappedValue: 'Low' },
      ],
      tags: ['severity', 'starter'],
    },
  },
  {
    itemType: 'synonymAlias',
    payload: {
      sourceType: 'componentCatalogue',
      canonicalName: 'Dropdown',
      aliases: ['Select', 'Single Select'],
      notes: 'Normalize alternative naming for single-selection list controls.',
    },
  },
  {
    itemType: 'synonymAlias',
    payload: {
      sourceType: 'componentCatalogue',
      canonicalName: 'Table',
      aliases: ['Grid', 'Data Grid', 'Data Table'],
      notes: 'Normalize grid and table terminology.',
    },
  },
  {
    itemType: 'synonymAlias',
    payload: {
      sourceType: 'componentCatalogue',
      canonicalName: 'Date Picker',
      aliases: ['Calendar Picker', 'Date Selector'],
      notes: 'Normalize date selection control terminology.',
    },
  },
];

async function seedItem(record: SeedRecord) {
  const definition = getDatasetEntityDefinition(record.itemType);
  const payload = definition.payloadSchema.parse(record.payload) as Record<string, unknown>;
  const metadata = deriveMetadataFromPayload(record.itemType, payload);
  const slug = slugify(metadata.title) || 'item';

  const existing = await prisma.datasetItem.findUnique({
    where: {
      itemType_slug: {
        itemType: definition.dbType,
        slug,
      },
    },
  });

  if (existing) {
    return false;
  }

  const created = await prisma.datasetItem.create({
    data: {
      itemType: definition.dbType,
      slug,
      title: metadata.title,
      summary: metadata.summary,
      tags: metadata.tags,
      status: DatasetStatus.APPROVED,
      version: 1,
      data: toPrismaJson(payload),
    },
  });

  const response = toDatasetItemResponse(created);

  await prisma.datasetVersion.create({
    data: {
      itemId: created.id,
      itemType: definition.dbType,
      version: 1,
      snapshot: toPrismaJson(buildOrderedExportObject(record.itemType, response)),
      createdBy: actor,
    },
  });

  await prisma.approvalHistory.create({
    data: {
      itemId: created.id,
      itemType: definition.dbType,
      versionBefore: 0,
      versionAfter: 1,
      action: ApprovalAction.SEEDED,
      actor,
      notes: 'Starter dataset seeded',
    },
  });

  return true;
}

async function seedContributors() {
  let createdCount = 0;

  for (const contributor of contributorSeeds) {
    const slug = slugify(contributor.name);
    const existing = await prisma.contributor.findUnique({
      where: {
        slug,
      },
    });

    if (existing) {
      continue;
    }

    await prisma.contributor.create({
      data: {
        slug,
        ...contributor,
      },
    });
    createdCount += 1;
  }

  return createdCount;
}

async function seedProjectHierarchy() {
  let createdCount = 0;

  for (const projectSeed of projectHierarchySeeds) {
    const project = await prisma.project.upsert({
      where: {
        slug: slugify(projectSeed.name),
      },
      create: {
        slug: slugify(projectSeed.name),
        name: projectSeed.name,
        description: projectSeed.description,
      },
      update: {
        description: projectSeed.description,
      },
    });

    for (const moduleSeed of projectSeed.modules) {
      const module = await prisma.projectModule.upsert({
        where: {
          projectId_slug: {
            projectId: project.id,
            slug: slugify(moduleSeed.name),
          },
        },
        create: {
          projectId: project.id,
          slug: slugify(moduleSeed.name),
          name: moduleSeed.name,
          description: moduleSeed.description,
        },
        update: {
          description: moduleSeed.description,
        },
      });

      for (const pageSeed of moduleSeed.pages) {
        const existing = await prisma.projectPage.findUnique({
          where: {
            moduleId_slug: {
              moduleId: module.id,
              slug: slugify(pageSeed.name),
            },
          },
        });

        if (!existing) {
          createdCount += 1;
        }

        await prisma.projectPage.upsert({
          where: {
            moduleId_slug: {
              moduleId: module.id,
              slug: slugify(pageSeed.name),
            },
          },
          create: {
            moduleId: module.id,
            slug: slugify(pageSeed.name),
            name: pageSeed.name,
            routeHint: pageSeed.routeHint,
            description: pageSeed.description,
          },
          update: {
            routeHint: pageSeed.routeHint,
            description: pageSeed.description,
          },
        });
      }
    }
  }

  return createdCount;
}

async function main() {
  let createdCount = 0;

  for (const record of seedRecords) {
    const created = await seedItem(record);
    if (created) {
      createdCount += 1;
    }
  }

  const contributorCount = await seedContributors();
  const hierarchyCount = await seedProjectHierarchy();

  console.log(
    `Seed complete. Added ${createdCount} dataset records, ${contributorCount} contributors, and ${hierarchyCount} project pages.`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
