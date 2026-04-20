import type { PreparedSourceInput } from './source-parser.js';

export const pageTypeValues = ['dashboard', 'form', 'data_grid', 'workflow', 'settings', 'media', 'hybrid'] as const;
export const coverageBucketValues = [
  'page_level',
  'header_navigation',
  'filters',
  'kpi_cards',
  'charts',
  'cross_widget_consistency',
  'empty_loading_error',
  'accessibility_usability',
  'performance_regression',
] as const;
export const coverageScenarioTypeValues = [
  'positive',
  'negative',
  'edge',
  'boundary',
  'empty_state',
  'partial_data',
  'malformed_data',
  'stale_data',
  'loading',
  'error',
  'consistency',
  'performance',
  'accessibility',
  'usability',
  'resilience',
  'regression',
  'access_control',
] as const;
export const pageUnitTypeValues = [
  'page_level',
  'header_navigation',
  'filter_group',
  'date_control',
  'time_control',
  'toggle_control',
  'kpi_card',
  'summary_tile_grid',
  'bar_chart_widget',
  'stacked_bar_widget',
  'line_chart_widget',
  'donut_chart_widget',
  'record_carousel',
  'annotation_overlay',
  'assistant_panel',
  'comments_panel',
  'legend',
  'tooltip',
  'cross_widget_relation',
  'error_state_region',
  'loading_region',
  'empty_state_region',
] as const;

export type CoveragePageType = (typeof pageTypeValues)[number];
export type CoverageBucket = (typeof coverageBucketValues)[number];
export type CoverageScenarioType = (typeof coverageScenarioTypeValues)[number];
export type CoveragePageUnitType = (typeof pageUnitTypeValues)[number];

export const coverageRulePackDefinitions = {
  dashboard_base: 'Dashboard base behavior',
  header_navigation: 'Header and navigation behavior',
  date_control: 'Single-date and date-range behavior',
  time_control: 'Time-range and time-window control behavior',
  toggle_control: 'Toggle and mode-switch behavior',
  dropdown_filter: 'Dropdown and filter behavior',
  kpi_card: 'KPI value and refresh behavior',
  summary_tile_grid: 'Summary tile grids and drilldown behavior',
  bar_chart_widget: 'Bar chart behavior',
  stacked_bar_widget: 'Stacked bar behavior',
  line_chart_widget: 'Line chart behavior',
  donut_chart_widget: 'Donut chart behavior',
  record_carousel: 'Carousel navigation and record handoff behavior',
  annotation_overlay: 'Chart annotation and exclusion-window behavior',
  assistant_panel: 'Assistant drawer and guided insight behavior',
  comments_workflow: 'Comments, notes, mentions, and watch-list behavior',
  legend_consistency: 'Legend and color mapping consistency',
  tooltip_behavior: 'Tooltip invocation and content behavior',
  cross_widget_consistency: 'Cross-widget reconciliation and propagation',
  loading_state: 'Loading and refresh states',
  empty_state: 'Empty and no-data states',
  error_state: 'Error and malformed data states',
  accessibility_baseline: 'Accessibility baseline',
  usability_baseline: 'Usability baseline',
  performance_baseline: 'Performance baseline',
  regression_baseline: 'Regression baseline',
  api_backed_ui_baseline: 'API-backed UI consistency baseline',
} as const;

export type CoverageRulePack = keyof typeof coverageRulePackDefinitions;
export type CoverageFeatureSource = 'user_provided' | 'inferred_from_source';

export type CoverageFeature = {
  displayName: string;
  normalizedName: string;
  sources: CoverageFeatureSource[];
  required: boolean;
  relatedUnitIds: string[];
};

export type NormalizedPageUnit = {
  unitId: string;
  unitName: string;
  pageArea: string;
  unitType: CoveragePageUnitType;
  sourceEvidence: string[];
  subUnits: string[];
  mappedRulePacks: CoverageRulePack[];
  coverageBuckets: CoverageBucket[];
  requiredScenarioTypes: CoverageScenarioType[];
  minimumCases: number;
  keywords: string[];
};

export type NormalizedCrossRelation = {
  relationId: string;
  relationName: string;
  sourceUnitIds: string[];
  mappedRulePacks: CoverageRulePack[];
  coverageBucket: CoverageBucket;
  requiredScenarioTypes: CoverageScenarioType[];
  minimumCases: number;
};

export type CoverageBatchDirective = {
  batchId: string;
  label: string;
  requestedCaseCount: number;
  focusUnitIds: string[];
  focusBuckets: CoverageBucket[];
  focusScenarioTypes: CoverageScenarioType[];
  rulePackIds: CoverageRulePack[];
  instructions: string[];
};

export type CoveragePlan = {
  pageType: CoveragePageType;
  pageName: string;
  userFeatures: CoverageFeature[];
  detectedFeatures: CoverageFeature[];
  mergedFeatures: CoverageFeature[];
  units: NormalizedPageUnit[];
  crossRelations: NormalizedCrossRelation[];
  coverageByBucketMinimums: Record<CoverageBucket, number>;
  requiredRulePacks: CoverageRulePack[];
  requiredScenarioTypes: CoverageScenarioType[];
  batchDirectives: CoverageBatchDirective[];
  recommendedCaseCount: number;
  reasoning: string[];
};

export type CoverageValidationSummary = {
  pageType: CoveragePageType;
  unitsIdentified: number;
  unitsCovered: number;
  requestedUserFeatures: string[];
  detectedFeatures: string[];
  mergedFeatureSet: string[];
  coveredFeatures: string[];
  missingRequestedFeatures: string[];
  retryTriggeredForMissingFeatures: boolean;
  coverageByBucket: Record<CoverageBucket, number>;
  quotaStatus: 'met' | 'partially_met' | 'unmet';
  retryTriggered: boolean;
  missingUnits: string[];
  underCoveredUnits: Array<{ unitId: string; unitName: string; expected: number; actual: number }>;
  missingBuckets: Array<{ bucket: CoverageBucket; expected: number; actual: number }>;
  missingScenarioTypesByUnit: Array<{ unitId: string; unitName: string; missingScenarioTypes: CoverageScenarioType[] }>;
};

const MAX_GENERATED_TEST_CASES = 180;
const dashboardIndicators = [
  'dashboard',
  'summary',
  'widget',
  'kpi',
  'chart',
  'trend',
  'donut',
  'doughnut',
  'stacked bar',
  'bar graph',
  'bar chart',
  'tile grid',
  'summary cards',
  'analytics',
  'insights',
  'assistant drawer',
  'carousel',
  'filters',
  'occupancy',
  'loitering',
  'delay signal',
  'time range',
  'cumulative toggle',
  'watch list',
  'comments',
  'exclusion window',
] as const;
const formIndicators = ['form', 'submit', 'field', 'validation'];
const dataGridIndicators = ['table', 'grid', 'column', 'row', 'pagination'];
const workflowIndicators = ['workflow', 'stage', 'approval', 'step', 'transition'];
const settingsIndicators = ['settings', 'preferences', 'configuration'];
const mediaIndicators = ['video', 'image', 'gallery', 'media'];

const unitQuotaByType: Record<CoveragePageUnitType, number> = {
  page_level: 8,
  header_navigation: 5,
  filter_group: 8,
  date_control: 8,
  time_control: 8,
  toggle_control: 6,
  kpi_card: 6,
  summary_tile_grid: 10,
  bar_chart_widget: 12,
  stacked_bar_widget: 12,
  line_chart_widget: 12,
  donut_chart_widget: 12,
  record_carousel: 10,
  annotation_overlay: 8,
  assistant_panel: 8,
  comments_panel: 10,
  legend: 4,
  tooltip: 4,
  cross_widget_relation: 8,
  error_state_region: 4,
  loading_region: 4,
  empty_state_region: 4,
};

const bucketByUnitType: Record<CoveragePageUnitType, CoverageBucket> = {
  page_level: 'page_level',
  header_navigation: 'header_navigation',
  filter_group: 'filters',
  date_control: 'filters',
  time_control: 'filters',
  toggle_control: 'filters',
  kpi_card: 'kpi_cards',
  summary_tile_grid: 'kpi_cards',
  bar_chart_widget: 'charts',
  stacked_bar_widget: 'charts',
  line_chart_widget: 'charts',
  donut_chart_widget: 'charts',
  record_carousel: 'charts',
  annotation_overlay: 'charts',
  assistant_panel: 'page_level',
  comments_panel: 'page_level',
  legend: 'charts',
  tooltip: 'charts',
  cross_widget_relation: 'cross_widget_consistency',
  error_state_region: 'empty_loading_error',
  loading_region: 'empty_loading_error',
  empty_state_region: 'empty_loading_error',
};

const rulePacksByUnitType: Record<CoveragePageUnitType, CoverageRulePack[]> = {
  page_level: ['dashboard_base', 'api_backed_ui_baseline', 'regression_baseline'],
  header_navigation: ['header_navigation', 'accessibility_baseline', 'usability_baseline', 'regression_baseline'],
  filter_group: ['dashboard_base', 'dropdown_filter', 'cross_widget_consistency', 'loading_state', 'error_state', 'accessibility_baseline', 'usability_baseline', 'regression_baseline'],
  date_control: ['dashboard_base', 'date_control', 'cross_widget_consistency', 'loading_state', 'error_state', 'accessibility_baseline', 'usability_baseline', 'regression_baseline'],
  time_control: ['dashboard_base', 'time_control', 'cross_widget_consistency', 'loading_state', 'error_state', 'accessibility_baseline', 'usability_baseline', 'regression_baseline'],
  toggle_control: ['dashboard_base', 'toggle_control', 'cross_widget_consistency', 'loading_state', 'error_state', 'accessibility_baseline', 'usability_baseline', 'regression_baseline'],
  kpi_card: ['dashboard_base', 'kpi_card', 'api_backed_ui_baseline', 'loading_state', 'empty_state', 'error_state', 'regression_baseline'],
  summary_tile_grid: ['dashboard_base', 'summary_tile_grid', 'api_backed_ui_baseline', 'loading_state', 'empty_state', 'error_state', 'accessibility_baseline', 'usability_baseline', 'regression_baseline'],
  bar_chart_widget: ['dashboard_base', 'bar_chart_widget', 'tooltip_behavior', 'cross_widget_consistency', 'loading_state', 'empty_state', 'error_state', 'accessibility_baseline', 'usability_baseline', 'performance_baseline', 'regression_baseline', 'api_backed_ui_baseline'],
  stacked_bar_widget: ['dashboard_base', 'stacked_bar_widget', 'legend_consistency', 'tooltip_behavior', 'cross_widget_consistency', 'loading_state', 'empty_state', 'error_state', 'accessibility_baseline', 'usability_baseline', 'performance_baseline', 'regression_baseline', 'api_backed_ui_baseline'],
  line_chart_widget: ['dashboard_base', 'line_chart_widget', 'legend_consistency', 'tooltip_behavior', 'cross_widget_consistency', 'loading_state', 'empty_state', 'error_state', 'accessibility_baseline', 'usability_baseline', 'performance_baseline', 'regression_baseline', 'api_backed_ui_baseline'],
  donut_chart_widget: ['dashboard_base', 'donut_chart_widget', 'legend_consistency', 'tooltip_behavior', 'cross_widget_consistency', 'loading_state', 'empty_state', 'error_state', 'accessibility_baseline', 'usability_baseline', 'performance_baseline', 'regression_baseline', 'api_backed_ui_baseline'],
  record_carousel: ['dashboard_base', 'record_carousel', 'api_backed_ui_baseline', 'loading_state', 'empty_state', 'error_state', 'accessibility_baseline', 'usability_baseline', 'regression_baseline'],
  annotation_overlay: ['annotation_overlay', 'tooltip_behavior', 'accessibility_baseline', 'usability_baseline', 'regression_baseline', 'api_backed_ui_baseline'],
  assistant_panel: ['dashboard_base', 'assistant_panel', 'api_backed_ui_baseline', 'loading_state', 'empty_state', 'error_state', 'accessibility_baseline', 'usability_baseline', 'regression_baseline'],
  comments_panel: ['comments_workflow', 'accessibility_baseline', 'usability_baseline', 'regression_baseline', 'api_backed_ui_baseline'],
  legend: ['legend_consistency', 'accessibility_baseline', 'usability_baseline', 'regression_baseline'],
  tooltip: ['tooltip_behavior', 'accessibility_baseline', 'usability_baseline'],
  cross_widget_relation: ['cross_widget_consistency', 'api_backed_ui_baseline', 'performance_baseline', 'regression_baseline'],
  error_state_region: ['error_state', 'api_backed_ui_baseline', 'accessibility_baseline'],
  loading_region: ['loading_state', 'api_backed_ui_baseline', 'accessibility_baseline'],
  empty_state_region: ['empty_state', 'api_backed_ui_baseline', 'accessibility_baseline', 'usability_baseline'],
};

const scenarioTypesByUnitType: Record<CoveragePageUnitType, CoverageScenarioType[]> = {
  page_level: ['positive', 'negative', 'edge', 'loading', 'error', 'accessibility', 'usability', 'regression'],
  header_navigation: ['positive', 'negative', 'accessibility', 'usability', 'regression'],
  filter_group: ['positive', 'negative', 'edge', 'boundary', 'loading', 'error', 'accessibility', 'usability'],
  date_control: ['positive', 'negative', 'edge', 'boundary', 'loading', 'error', 'accessibility', 'usability'],
  time_control: ['positive', 'negative', 'edge', 'boundary', 'loading', 'error', 'consistency', 'accessibility', 'usability', 'regression'],
  toggle_control: ['positive', 'negative', 'edge', 'consistency', 'loading', 'error', 'accessibility', 'usability', 'regression'],
  kpi_card: ['positive', 'negative', 'edge', 'empty_state', 'partial_data', 'consistency'],
  summary_tile_grid: ['positive', 'negative', 'edge', 'empty_state', 'partial_data', 'consistency', 'loading', 'error', 'accessibility', 'usability', 'regression'],
  bar_chart_widget: ['positive', 'edge', 'boundary', 'empty_state', 'partial_data', 'malformed_data', 'consistency', 'loading', 'error', 'accessibility', 'usability', 'performance', 'regression'],
  stacked_bar_widget: ['positive', 'edge', 'empty_state', 'partial_data', 'malformed_data', 'consistency', 'loading', 'error', 'accessibility', 'performance', 'regression', 'usability'],
  line_chart_widget: ['positive', 'boundary', 'empty_state', 'partial_data', 'malformed_data', 'consistency', 'loading', 'error', 'accessibility', 'performance', 'regression', 'usability'],
  donut_chart_widget: ['positive', 'edge', 'empty_state', 'partial_data', 'malformed_data', 'consistency', 'loading', 'error', 'accessibility', 'performance', 'regression', 'usability'],
  record_carousel: ['positive', 'negative', 'edge', 'empty_state', 'consistency', 'loading', 'error', 'accessibility', 'usability', 'regression'],
  annotation_overlay: ['positive', 'edge', 'loading', 'error', 'consistency', 'accessibility', 'usability', 'regression'],
  assistant_panel: ['positive', 'negative', 'edge', 'empty_state', 'loading', 'error', 'consistency', 'access_control', 'accessibility', 'usability', 'resilience', 'regression'],
  comments_panel: ['positive', 'negative', 'edge', 'loading', 'error', 'consistency', 'access_control', 'accessibility', 'usability', 'resilience', 'regression'],
  legend: ['positive', 'consistency', 'edge', 'accessibility'],
  tooltip: ['positive', 'edge', 'loading', 'accessibility'],
  cross_widget_relation: ['consistency', 'negative', 'partial_data', 'stale_data', 'loading', 'error', 'performance', 'regression'],
  error_state_region: ['error', 'malformed_data', 'resilience', 'accessibility'],
  loading_region: ['loading', 'positive', 'resilience', 'accessibility'],
  empty_state_region: ['empty_state', 'partial_data', 'accessibility', 'usability'],
};

const explicitWidgetDefinitions: Array<{
  unitType: CoveragePageUnitType;
  unitName: string;
  pageArea: string;
  patterns: RegExp[];
  keywords: string[];
}> = [
  { unitType: 'filter_group', unitName: 'Shared Unit Selector', pageArea: 'Global Filters', patterns: [/unit (multi.?select|multiselect|dropdown|selector)/i, /\ball units\b/i, /select all/i, /shared filter bar/i], keywords: ['unit selector', 'multiselect', 'dropdown', 'shared filter'] },
  { unitType: 'date_control', unitName: 'Shared Date Range Picker', pageArea: 'Global Filters', patterns: [/date range picker/i, /date picker/i, /page-level date range/i, /\bselected dates\b/i, /\bcustom dates\b/i], keywords: ['date range', 'date picker', 'selected dates', 'custom dates'] },
  { unitType: 'toggle_control', unitName: 'All / Critical Scope Toggle', pageArea: 'Analytics Scope Controls', patterns: [/\ball\s*\/\s*critical\b/i, /\ball\b[\s\r\n]+critical\b/i, /critical-only/i], keywords: ['all critical toggle', 'critical scope', 'critical only'] },
  { unitType: 'kpi_card', unitName: 'Observations Recorded KPI Card', pageArea: 'Analytics Summary', patterns: [/observations recorded/i, /vs prev window/i, /previous equivalent window/i, /false positives?/i], keywords: ['observations recorded', 'prev window', 'window comparison', 'false positive'] },
  { unitType: 'kpi_card', unitName: 'Timely Observation Closure KPI Card', pageArea: 'Analytics Summary', patterns: [/timely observation closure/i, /closed within sla/i, /risk[- ]based sla/i], keywords: ['timely closure', 'sla', 'closure rate'] },
  { unitType: 'kpi_card', unitName: 'High Risk Observation Ratio KPI Card', pageArea: 'Analytics Summary', patterns: [/ratio of high risk observation/i, /high risk observations?/i, /overall observation.*high risk/i], keywords: ['high risk ratio', 'high risk observation ratio'] },
  { unitType: 'kpi_card', unitName: 'Safe Operating Hours KPI Card', pageArea: 'Analytics Summary', patterns: [/\bsoh%?\b/i, /safe operating hours/i, /hours without any high-risk observations/i], keywords: ['soh', 'safe operating hours', 'high-risk free hours'] },
  { unitType: 'toggle_control', unitName: 'Risk Hotspots Unit / Zone Toggle', pageArea: 'Risk Hotspots', patterns: [/where\s*-\s*risk hotspots/i, /risk hotspots/i, /\bunit\b[\s\r\n]+\bzone\b/i], keywords: ['risk hotspots', 'unit zone toggle', 'ranking toggle'] },
  { unitType: 'summary_tile_grid', unitName: 'Risk Hotspots Ranked List', pageArea: 'Risk Hotspots', patterns: [/where\s*-\s*risk hotspots/i, /risk hotspots/i, /high risk observations/i], keywords: ['risk hotspots', 'ranked list', 'high risk observations'] },
  { unitType: 'toggle_control', unitName: 'Time-Wise Trend Bar / Line Toggle', pageArea: 'Time-Wise Trend', patterns: [/time[- ]wise trend/i, /\bbar\b[\s\r\n]+\bline\b/i], keywords: ['time-wise trend', 'bar line toggle'] },
  { unitType: 'line_chart_widget', unitName: 'Time-Wise Trend Chart', pageArea: 'Time-Wise Trend', patterns: [/time[- ]wise trend/i, /\bavg:\s*\d+/i, /foot fall of observations/i], keywords: ['time-wise trend', 'average line', 'time buckets'] },
  { unitType: 'annotation_overlay', unitName: 'Time-Wise Trend Insight Strip', pageArea: 'Time-Wise Trend', patterns: [/\binsight:/i, /foot fall of observations/i], keywords: ['insight strip', 'peak period insight', 'time-wise insight'] },
  { unitType: 'toggle_control', unitName: 'Observation Heat Map Category / Sub-Category Toggle', pageArea: 'Observation Heat Map', patterns: [/observation heat map/i, /\bsub category\b/i, /\bcategory\b/i], keywords: ['observation heat map', 'category toggle', 'sub-category toggle'] },
  { unitType: 'summary_tile_grid', unitName: 'Observation Heat Map Matrix', pageArea: 'Observation Heat Map', patterns: [/observation heat map/i, /low risk/i, /high risk/i], keywords: ['observation heat map', 'matrix', 'risk scale'] },
  { unitType: 'toggle_control', unitName: 'Critical Incidents Unit / Zone Toggle', pageArea: 'Critical Incidents', patterns: [/critical incidents?/i, /\bsif\b/i, /\blci\b/i, /\bzone\b[\s\r\n]+\bunit\b/i], keywords: ['critical incidents', 'unit zone toggle', 'sif', 'lci'] },
  { unitType: 'summary_tile_grid', unitName: 'Critical Incidents Summary Panel', pageArea: 'Critical Incidents', patterns: [/critical incidents?/i, /\bsif reported\b/i, /\blci reported\b/i], keywords: ['critical incidents', 'sif reported', 'lci reported'] },
  { unitType: 'donut_chart_widget', unitName: 'Critical Incidents Zone Wise Split', pageArea: 'Critical Incidents', patterns: [/zone wise split/i, /\bzone 1\b/i, /\bzone 2\b/i], keywords: ['zone wise split', 'critical incidents split', 'zone totals'] },
  { unitType: 'kpi_card', unitName: 'Action Recorded KPI Card', pageArea: 'Action Insights', patterns: [/actions insights/i, /overdue actions/i, /avg days to close/i, /action recorded/i], keywords: ['action recorded', 'overdue actions', 'avg days to close'] },
  { unitType: 'toggle_control', unitName: 'Action Distribution Unit / Category Toggle', pageArea: 'Action Insights', patterns: [/action distribution/i, /\bunit\b\s*\/\s*\bcategory\b/i], keywords: ['action distribution', 'unit category toggle'] },
  { unitType: 'donut_chart_widget', unitName: 'Action Distribution Chart', pageArea: 'Action Insights', patterns: [/action distribution/i, /top 3 categories/i], keywords: ['action distribution', 'top 3 categories'] },
  { unitType: 'kpi_card', unitName: 'TRIR Calculator Card', pageArea: 'Action Insights', patterns: [/\btrir\b/i, /\btror\b/i, /industry benchmark/i, /performance status/i, /200,?000/i], keywords: ['trir', 'tror', 'benchmark', 'calculator'] },
  { unitType: 'toggle_control', unitName: 'Section-Level Date Mode Controls', pageArea: 'Summary Widgets', patterns: [/\bselected dates\b/i, /\bcustom dates\b/i, /section-level date range/i, /date mode/i], keywords: ['selected dates', 'custom dates', 'date mode', 'section override'] },
  { unitType: 'kpi_card', unitName: 'Dashboard Metric Cards', pageArea: 'Summary Widgets', patterns: [/\bmetric card\b/i, /summary cards?/i, /kpi cards?/i], keywords: ['metric card', 'summary card', 'kpi', 'counts'] },
  { unitType: 'donut_chart_widget', unitName: 'Distribution Summary Chart', pageArea: 'Summary Widgets', patterns: [/risk distribution/i, /distribution summary/i, /risk segregation/i], keywords: ['distribution', 'segmentation', 'chart', 'risk'] },
  { unitType: 'summary_tile_grid', unitName: 'Category Summary Tile Grid', pageArea: 'Summary Widgets', patterns: [/category summary tile grid/i, /life saving rule category/i, /life saving rules observations/i, /classification cards?/i, /observation type/i, /behavioral & environmental/i], keywords: ['tile grid', 'category summary', 'classification card', 'observation type'] },
  { unitType: 'toggle_control', unitName: 'Trend Visualization Tabs', pageArea: 'Visual Analytics', patterns: [/chart tabs?/i, /trend tabs?/i, /safety trend/i, /category trend/i], keywords: ['trend tabs', 'chart mode', 'safety trend', 'category trend'] },
  { unitType: 'line_chart_widget', unitName: 'Trend Visualization Panel', pageArea: 'Visual Analytics', patterns: [/\bvisualization panel\b/i, /trend visualization/i, /safety trend/i, /category trend/i, /trend graph/i], keywords: ['visualization panel', 'trend chart', 'trend graph'] },
  { unitType: 'record_carousel', unitName: 'Record Carousel', pageArea: 'Visual Analytics', patterns: [/\brecord carousel\b/i, /recent sif/i, /carousel navigation/i, /record handoff/i, /\bcarousel\b/i], keywords: ['carousel', 'record handoff', 'recent records', 'navigation'] },
  { unitType: 'assistant_panel', unitName: 'Assistant Drawer', pageArea: 'Insights & Assistant', patterns: [/\bassistant drawer\b/i, /\binsights panel\b/i, /\bask eos\b/i, /suggested questions?/i, /disabled-until-typed composer/i], keywords: ['assistant drawer', 'insights', 'ask assistant', 'suggested questions'] },
  { unitType: 'date_control', unitName: 'Historical Date Picker', pageArea: 'Global Filters', patterns: [/default(s)? to yesterday/i, /historical only/i, /today.?s date is disabled/i, /future dates.*disabled/i], keywords: ['date', 'historical', 'yesterday'] },
  { unitType: 'date_control', unitName: 'Cumulative Date Range Picker', pageArea: 'Cumulative Filters', patterns: [/cumulative date range/i, /cumulative stats across/i, /selected cumulative date range/i, /cumulative.*start.?end/i, /start.?end.*cumulative/i], keywords: ['date range', 'cumulative', 'range'] },
  { unitType: 'filter_group', unitName: 'Zone Multi-Select Filter', pageArea: 'Global Filters', patterns: [/multi-zone picker/i, /multi-select zone/i, /all zones/i, /selected zones/i, /more than one zone/i], keywords: ['zone', 'multi-select', 'dropdown'] },
  { unitType: 'filter_group', unitName: 'Cumulative Zone Multi-Select Filter', pageArea: 'Cumulative Filters', patterns: [/cumulative stats across -zones dropdown/i, /zones dropdown for cumulative stats/i, /cumulative widgets display aggregated data/i], keywords: ['zone dropdown', 'cumulative', 'multi-select'] },
  { unitType: 'kpi_card', unitName: 'Estimated Productivity Loss KPI Card', pageArea: 'Day-Wise Summary', patterns: [/estimated productivity loss card/i, /lost man-hours/i, /previous day difference/i, /cost per man hour/i, /value recovery potential/i], keywords: ['productivity loss', 'usd', 'man-hours'] },
  { unitType: 'kpi_card', unitName: 'Live Vs Planned Manpower KPI Cards', pageArea: 'Day-Wise Summary', patterns: [/live manpower/i, /planned manpower/i, /actual manpower/i], keywords: ['manpower', 'planned', 'live'] },
  { unitType: 'kpi_card', unitName: 'Overall Estimated Productivity Loss Summary', pageArea: 'Cumulative Summary', patterns: [/overall estimated productivity loss/i, /overall estimated loss/i, /total cumulative estimated loss/i], keywords: ['overall loss', 'summary indicator', 'cumulative loss'] },
  { unitType: 'stacked_bar_widget', unitName: 'Top Bottleneck Zone Stacked Bar', pageArea: 'Day-Wise Summary', patterns: [/top bottleneck zone/i, /bottleneck zone/i, /highest productivity loss/i], keywords: ['bottleneck', 'stacked bar', 'zone'] },
  { unitType: 'stacked_bar_widget', unitName: 'Primary Delay Signal Stacked Bar', pageArea: 'Day-Wise Summary', patterns: [/stacked orange bar/i, /delay categories as colored segments/i, /delay category distribution/i, /reason.*highest cost impact/i], keywords: ['delay signal', 'delay', 'stacked bar'] },
  { unitType: 'line_chart_widget', unitName: 'Estimated Productivity Loss Trend Line Chart', pageArea: 'Cumulative Stats Across', patterns: [/estimated productivity loss trend/i, /loss trend/i], keywords: ['trend', 'line chart', 'daily loss'] },
  { unitType: 'donut_chart_widget', unitName: 'Cumulative Zone-Wise Split Donut Chart', pageArea: 'Cumulative Stats Across', patterns: [/cumulative zone.?wise split/i, /cumulative stats across.*zone/i, /daily aggregation.*zone/i], keywords: ['zone split', 'donut', 'doughnut', 'percentages'] },
  { unitType: 'filter_group', unitName: 'Zone Single-Select Filter', pageArea: 'Zone-Level Filters', patterns: [/zone dropdown \(single-select\)/i, /single.?select zone/i, /selected zone name is displayed/i], keywords: ['zone filter', 'single-select', 'dropdown'] },
  { unitType: 'date_control', unitName: 'Zone Day-Wise Date Picker', pageArea: 'Zone-Level Filters', patterns: [/date selection \(day-wise\)/i], keywords: ['day-wise date', 'zone date', 'historical date'] },
  { unitType: 'time_control', unitName: 'Time Range Selector', pageArea: 'Zone-Level Filters', patterns: [/time range selector/i, /start time/i, /end time/i, /time window/i], keywords: ['time range', 'start time', 'end time', 'apply'] },
  { unitType: 'toggle_control', unitName: 'Day-Wise / Cumulative Toggle', pageArea: 'Zone-Level Filters', patterns: [/day-wise - cumulative toggle/i, /cumulative toggle/i, /switches from day-wise to cumulative/i], keywords: ['toggle', 'day-wise', 'cumulative'] },
  { unitType: 'kpi_card', unitName: 'Zone-Level Estimated Productivity Loss Card', pageArea: 'Zone View Summary', patterns: [/estimated productivity loss \(usd\).*zone level/i, /estimated productivity loss \(usd\) – zone level/i], keywords: ['zone level', 'estimated productivity loss', 'usd'] },
  { unitType: 'kpi_card', unitName: 'Live & Peak Occupancy Cards', pageArea: 'Zone View Summary', patterns: [/live & peak occupancy/i, /peak occupancy/i, /live occupancy/i], keywords: ['live occupancy', 'peak occupancy', 'occupancy'] },
  { unitType: 'line_chart_widget', unitName: 'Occupancy Trend Graph', pageArea: 'Zone View Analytics', patterns: [/occupancy trend graph/i, /occupancy trend/i, /occupancy values plotted/i], keywords: ['occupancy trend', 'occupancy graph', 'trend'] },
  { unitType: 'annotation_overlay', unitName: 'Occupancy Trend Exclusion Windows', pageArea: 'Zone View Analytics', patterns: [/exclusion window/i, /red dashed vertical bands/i, /info icon on an exclusion band/i], keywords: ['exclusion window', 'annotation', 'band', 'info icon'] },
  { unitType: 'kpi_card', unitName: 'Zone-Level Primary Delay Signal Card', pageArea: 'Zone View Summary', patterns: [/dominant delay category/i, /peak period for loitering/i, /edit duration popup/i], keywords: ['primary delay signal', 'dominant delay', 'actual duration', 'peak period'] },
  { unitType: 'bar_chart_widget', unitName: 'Loitering Time Lost Bar Chart', pageArea: 'Zone View Analytics', patterns: [/time lost due to loitering/i, /loitering graph/i, /bar graph/i], keywords: ['loitering', 'time lost', 'bar chart'] },
  { unitType: 'comments_panel', unitName: 'Comments & Notes Panel', pageArea: 'Comments & Collaboration', patterns: [/comments section/i, /notes section/i, /posts? a new comment/i, /tag(s|ged|ging)/i], keywords: ['comments', 'notes', 'mentions', 'discussion'] },
  { unitType: 'comments_panel', unitName: 'Comment Watch List & Notifications', pageArea: 'Comments & Collaboration', patterns: [/watch list/i, /watcher count/i, /watchers?/i, /tagged user/i, /comment notification/i], keywords: ['watch list', 'comment notifications', 'watchers', 'mentions'] },
  { unitType: 'date_control', unitName: 'Zone Cumulative Date Range Picker', pageArea: 'Cumulative Filters', patterns: [/cumulative date range picker/i, /two consecutive months/i, /selectable dates forward/i], keywords: ['cumulative date range', 'start date', 'end date'] },
  { unitType: 'line_chart_widget', unitName: 'Cumulative Occupancy Trend Graph', pageArea: 'Cumulative Analytics', patterns: [/cumulative occupancy trend/i, /one data point per day/i, /date-wise aggregation/i], keywords: ['cumulative occupancy', 'occupancy trend', 'daily aggregation'] },
  { unitType: 'bar_chart_widget', unitName: 'Cumulative Loitering Time Lost Bar Chart', pageArea: 'Cumulative Analytics', patterns: [/cumulative - total time lost due to loitering/i, /aggregated per day/i, /one bar per day/i], keywords: ['cumulative loitering', 'time lost', 'bar chart'] },
  { unitType: 'kpi_card', unitName: 'Cumulative Estimated Productivity Loss Card', pageArea: 'Cumulative Summary', patterns: [/cumulative - estimated productivity loss/i, /cumulative estimated productivity loss/i], keywords: ['cumulative estimated productivity loss', 'epl', 'date range'] },
  { unitType: 'kpi_card', unitName: 'Cumulative Peak Occupancy Card', pageArea: 'Cumulative Summary', patterns: [/cumulative - peak occupancy card/i, /cumulative peak occupancy/i], keywords: ['cumulative peak occupancy', 'peak occupancy'] },
  { unitType: 'kpi_card', unitName: 'Cumulative Primary Delay Signal Card', pageArea: 'Cumulative Summary', patterns: [/cumulative - primary delay signal/i, /aggregated actual duration/i], keywords: ['cumulative primary delay', 'delay signal'] },
];

const featurePageAreaByUnitType: Record<CoveragePageUnitType, string> = {
  page_level: 'Requested Feature Coverage',
  header_navigation: 'Header & Navigation',
  filter_group: 'Global Filters',
  date_control: 'Global Filters',
  time_control: 'Global Filters & Time Controls',
  toggle_control: 'Global Filters & Mode Switches',
  kpi_card: 'Summary Widgets',
  summary_tile_grid: 'Summary Widgets',
  bar_chart_widget: 'Visual Analytics',
  stacked_bar_widget: 'Visual Analytics',
  line_chart_widget: 'Visual Analytics',
  donut_chart_widget: 'Visual Analytics',
  record_carousel: 'Visual Analytics',
  annotation_overlay: 'Chart Annotations',
  assistant_panel: 'Insights & Assistant',
  comments_panel: 'Comments & Collaboration',
  legend: 'Chart Legends & Summaries',
  tooltip: 'Chart Interactions',
  cross_widget_relation: 'Cross-Widget Consistency',
  error_state_region: 'State Handling',
  loading_region: 'State Handling',
  empty_state_region: 'State Handling',
};

function normalizeWhitespace(value: string) {
  return value.replace(/\r\n/g, '\n').replace(/\s+/g, ' ').trim();
}

function normalizeFeatureName(value: string) {
  let normalized = normalizeWhitespace(value).toLowerCase();
  normalized = normalized
    .replace(/\bdate picker\b/g, 'date control')
    .replace(/\bzone picker\b/g, 'zone filter')
    .replace(/\bzone dropdown\b/g, 'zone filter')
    .replace(/\bdropdown filter\b/g, 'zone filter')
    .replace(/\bmulti[- ]zone\b/g, 'zone filter')
    .replace(/\bsingle[- ]select\b/g, 'single select')
    .replace(/\btime range selector\b/g, 'time control')
    .replace(/\bbar graph\b/g, 'bar chart')
    .replace(/\btime[- ]wise\b/g, 'time wise')
    .replace(/\ball\s*\/\s*critical\b/g, 'all critical toggle')
    .replace(/\bsub[- ]category\b/g, 'sub category')
    .replace(/\brisk hotspots?\b/g, 'risk hotspot')
    .replace(/\boccupance\b/g, 'occupancy')
    .replace(/\bwatch list\b/g, 'watchlist')
    .replace(/\bcumulative toggle\b/g, 'mode toggle')
    .replace(/\b(historical|cumulative|overall|primary|top|estimated)\b/g, ' ')
    .replace(/\bkpi card\b/g, ' ')
    .replace(/\bcard\b/g, ' ')
    .replace(/\bestimated productivity loss trend\b/g, 'productivity loss trend')
    .replace(/\btrend line chart\b/g, 'line chart')
    .replace(/\bdoughnut chart\b/g, 'donut chart')
    .replace(/\bzone-wise\b/g, 'zone wise')
    .replace(/\bcross-widget\b/g, 'cross widget')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

  return normalized;
}

function tokenizeFeatureName(value: string) {
  return normalizeFeatureName(value)
    .split(' ')
    .map((token) => token.trim())
    .filter((token) => token.length >= 2);
}

function inferFeatureUnitType(value: string): CoveragePageUnitType {
  const normalized = normalizeFeatureName(value);

  if (
    normalized.includes('comment') ||
    normalized.includes('note') ||
    normalized.includes('watchlist') ||
    normalized.includes('notification') ||
    normalized.includes('mention')
  ) {
    return 'comments_panel';
  }
  if (normalized.includes('assistant') || normalized.includes('insight') || normalized.includes('ask eos')) {
    return 'assistant_panel';
  }
  if (normalized.includes('all critical toggle') || normalized.includes('unit zone toggle') || normalized.includes('bar line toggle')) {
    return 'toggle_control';
  }
  if (normalized.includes('carousel') || normalized.includes('handoff')) {
    return 'record_carousel';
  }
  if (
    normalized.includes('risk hotspot') ||
    normalized.includes('heat map') ||
    normalized.includes('critical incident') ||
    normalized.includes('sif') ||
    normalized.includes('lci')
  ) {
    return 'summary_tile_grid';
  }
  if (
    normalized.includes('tile') ||
    normalized.includes('classification card') ||
    normalized.includes('observation type') ||
    normalized.includes('life saving rule')
  ) {
    return 'summary_tile_grid';
  }
  if (normalized.includes('exclusion window') || normalized.includes('annotation') || normalized.includes('overlay')) {
    return 'annotation_overlay';
  }
  if (
    normalized.includes('time control') ||
    normalized.includes('time range') ||
    normalized.includes('start time') ||
    normalized.includes('end time')
  ) {
    return 'time_control';
  }
  if (normalized.includes('toggle') || normalized.includes('mode switch')) {
    return 'toggle_control';
  }
  if (normalized.includes('loiter') || normalized.includes('bar chart')) {
    return 'bar_chart_widget';
  }
  if (
    normalized.includes('observations recorded') ||
    normalized.includes('timely observation closure') ||
    normalized.includes('safe operating hours') ||
    normalized.includes('high risk observation ratio') ||
    normalized.includes('ratio of high risk') ||
    normalized.includes('trir') ||
    normalized.includes('tror') ||
    normalized.includes('benchmark')
  ) {
    return 'kpi_card';
  }
  if (normalized.includes('date')) {
    return 'date_control';
  }
  if (
    normalized.includes('zone filter') ||
    normalized.includes('dropdown') ||
    normalized.includes('multi select') ||
    normalized.includes('single select')
  ) {
    return 'filter_group';
  }
  if (normalized.includes('occupancy trend') || normalized.includes('trend graph') || normalized.includes('curve')) {
    return 'line_chart_widget';
  }
  if (normalized.includes('distribution')) {
    return 'donut_chart_widget';
  }
  if (normalized.includes('kpi') || normalized.includes('summary') || normalized.includes('manpower') || normalized.includes('loss')) {
    return 'kpi_card';
  }
  if (normalized.includes('occupancy')) {
    return 'kpi_card';
  }
  if (normalized.includes('stacked') || normalized.includes('bottleneck') || normalized.includes('delay')) {
    return 'stacked_bar_widget';
  }
  if (normalized.includes('line chart') || normalized.includes('trend')) {
    return 'line_chart_widget';
  }
  if (normalized.includes('donut') || normalized.includes('doughnut') || normalized.includes('pie')) {
    return 'donut_chart_widget';
  }
  if (normalized.includes('legend') || normalized.includes('color')) {
    return 'legend';
  }
  if (normalized.includes('tooltip') || normalized.includes('hover')) {
    return 'tooltip';
  }
  if (normalized.includes('consistency') || normalized.includes('sync')) {
    return 'cross_widget_relation';
  }
  if (normalized.includes('loading')) {
    return 'loading_region';
  }
  if (normalized.includes('empty') || normalized.includes('no data')) {
    return 'empty_state_region';
  }
  if (normalized.includes('error')) {
    return 'error_state_region';
  }
  if (normalized.includes('header') || normalized.includes('navigation') || normalized.includes('menu')) {
    return 'header_navigation';
  }

  return 'page_level';
}

function scoreFeatureUnitMatch(featureName: string, unit: NormalizedPageUnit) {
  const featureTokens = tokenizeFeatureName(featureName);
  if (featureTokens.length === 0) {
    return 0;
  }

  const candidates = [unit.unitName, unit.pageArea, ...unit.keywords].map((value) => normalizeFeatureName(value));
  let score = 0;

  for (const token of featureTokens) {
    if (candidates.some((candidate) => candidate.includes(token))) {
      score += 1;
    }
  }

  if (candidates.some((candidate) => candidate === normalizeFeatureName(featureName))) {
    score += 3;
  }

  return score;
}

function buildSyntheticFeatureUnit(featureName: string) {
  const unitType = inferFeatureUnitType(featureName);
  return createUnit({
    unitName: normalizeWhitespace(featureName),
    unitType,
    pageArea: featurePageAreaByUnitType[unitType],
    sourceEvidence: [`User-requested feature: ${normalizeWhitespace(featureName)}`],
    keywords: tokenizeFeatureName(featureName),
  });
}

function dedupeStrings(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = normalizeWhitespace(value);
    if (!normalized) {
      return false;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  }).map((value) => normalizeWhitespace(value));
}

function slugifyValue(value: string) {
  return normalizeWhitespace(value).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
}

function flattenText(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    return value.map((entry) => flattenText(entry)).join(' ');
  }
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).map((entry) => flattenText(entry)).join(' ');
  }
  return '';
}

function buildCorpus(options: {
  title: string;
  description: string;
  userFeatures?: string[];
  sourceInputs: PreparedSourceInput[];
  knowledgeBaseContext?: Record<string, unknown>;
}) {
  return normalizeWhitespace([
    options.title,
    options.description,
    ...(options.userFeatures ?? []),
    flattenText(options.knowledgeBaseContext),
    ...options.sourceInputs.flatMap((source) => [source.label, source.filename ?? '', source.notes ?? '', source.url ?? '', source.contentText]),
  ].filter(Boolean).join('\n'));
}

function extractEvidenceSnippets(sourceInputs: PreparedSourceInput[], patterns: RegExp[], fallback: string) {
  const matches: string[] = [];
  for (const source of sourceInputs) {
    const lines = [source.label, source.notes ?? '', ...source.contentText.split('\n').slice(0, 300)]
      .map((line) => line.trim())
      .filter(Boolean);
    for (const line of lines) {
      if (patterns.some((pattern) => pattern.test(line))) {
        matches.push(line);
      }
      if (matches.length >= 4) {
        return dedupeStrings(matches);
      }
    }
  }
  return matches.length > 0 ? dedupeStrings(matches) : [fallback];
}

function classifyPageType(corpus: string): CoveragePageType {
  const lower = corpus.toLowerCase();
  const scores = {
    dashboard: dashboardIndicators.filter((indicator) => lower.includes(indicator)).length,
    form: formIndicators.filter((indicator) => lower.includes(indicator)).length,
    data_grid: dataGridIndicators.filter((indicator) => lower.includes(indicator)).length,
    workflow: workflowIndicators.filter((indicator) => lower.includes(indicator)).length,
    settings: settingsIndicators.filter((indicator) => lower.includes(indicator)).length,
    media: mediaIndicators.filter((indicator) => lower.includes(indicator)).length,
  };
  const ranked = Object.entries(scores).sort((left, right) => right[1] - left[1]);
  const [topType, topScore] = ranked[0] as [Exclude<CoveragePageType, 'hybrid'>, number];
  const [, secondScore] = ranked[1] as [Exclude<CoveragePageType, 'hybrid'>, number];

  if (topScore === 0) {
    return 'hybrid';
  }
  if (secondScore > 0 && topScore - secondScore <= 1) {
    return 'hybrid';
  }
  return topType;
}

function createUnit(input: {
  unitName: string;
  unitType: CoveragePageUnitType;
  pageArea: string;
  sourceEvidence: string[];
  keywords: string[];
  subUnits?: string[];
}) {
  return {
    unitId: `${input.unitType}:${slugifyValue(input.unitName)}`,
    unitName: input.unitName,
    pageArea: input.pageArea,
    unitType: input.unitType,
    sourceEvidence: dedupeStrings(input.sourceEvidence),
    subUnits: dedupeStrings(input.subUnits ?? []),
    mappedRulePacks: rulePacksByUnitType[input.unitType],
    coverageBuckets: dedupeStrings([
      bucketByUnitType[input.unitType],
      ...(input.unitType === 'loading_region' || input.unitType === 'empty_state_region' || input.unitType === 'error_state_region'
        ? []
        : ['accessibility_usability', 'performance_regression']),
    ]) as CoverageBucket[],
    requiredScenarioTypes: scenarioTypesByUnitType[input.unitType],
    minimumCases: unitQuotaByType[input.unitType],
    keywords: dedupeStrings(input.keywords),
  } satisfies NormalizedPageUnit;
}

function addUnit(units: NormalizedPageUnit[], unit: NormalizedPageUnit) {
  if (!units.some((existing) => existing.unitId === unit.unitId)) {
    units.push(unit);
  }
}

function buildDashboardUnits(options: { title: string; sourceInputs: PreparedSourceInput[]; corpus: string }) {
  const units: NormalizedPageUnit[] = [];

  addUnit(
    units,
    createUnit({
      unitName: 'Dashboard Overview & Page-Level Behavior',
      unitType: 'page_level',
      pageArea: 'Page-Level Experience',
      sourceEvidence: [options.title || 'Dashboard page context'],
      keywords: ['dashboard', 'overview', 'page-level'],
    }),
  );

  addUnit(
    units,
    createUnit({
      unitName: 'Header & Navigation',
      unitType: 'header_navigation',
      pageArea: 'Header & Navigation',
      sourceEvidence: extractEvidenceSnippets(
        options.sourceInputs,
        [/header/i, /navigation/i, /menu/i, /sidebar/i, /tabs?/i, /breadcrumb/i],
        'Dashboard navigation and header affordances inferred from page-level dashboard context.',
      ),
      keywords: ['header', 'navigation', 'menu', 'sidebar'],
    }),
  );

  for (const definition of explicitWidgetDefinitions) {
    if (!definition.patterns.some((pattern) => pattern.test(options.corpus))) {
      continue;
    }

    addUnit(
      units,
      createUnit({
        unitName: definition.unitName,
        unitType: definition.unitType,
        pageArea: definition.pageArea,
        sourceEvidence: extractEvidenceSnippets(options.sourceInputs, definition.patterns, definition.unitName),
        keywords: definition.keywords,
      }),
    );
  }

  const hasCharts = units.some((unit) =>
    ['bar_chart_widget', 'stacked_bar_widget', 'line_chart_widget', 'donut_chart_widget', 'record_carousel', 'annotation_overlay'].includes(unit.unitType),
  );
  if (hasCharts) {
    addUnit(
      units,
      createUnit({
        unitName: 'Legends & Side Breakdowns',
        unitType: 'legend',
        pageArea: 'Chart Legends & Summaries',
        sourceEvidence: extractEvidenceSnippets(
          options.sourceInputs,
          [/legend/i, /color/i, /zone contribution/i, /percentage/i, /breakdown/i, /list/i],
          'Chart legends and side breakdowns are implied by chart widgets and zone split summaries.',
        ),
        keywords: ['legend', 'breakdown', 'side list', 'color mapping'],
      }),
    );
    addUnit(
      units,
      createUnit({
        unitName: 'Chart Tooltips & Hover States',
        unitType: 'tooltip',
        pageArea: 'Chart Interactions',
        sourceEvidence: extractEvidenceSnippets(
          options.sourceInputs,
          [/tooltip/i, /hover/i, /exact loss amount/i, /show.*on hover/i],
          'Interactive widgets imply tooltip and hover-state coverage.',
        ),
        keywords: ['tooltip', 'hover', 'popover'],
      }),
    );
  }

  const hasFilters = units.some((unit) =>
    ['filter_group', 'date_control', 'time_control', 'toggle_control'].includes(unit.unitType),
  );
  const dependentWidgets = units.filter((unit) =>
    ['kpi_card', 'summary_tile_grid', 'bar_chart_widget', 'stacked_bar_widget', 'line_chart_widget', 'donut_chart_widget', 'record_carousel', 'annotation_overlay', 'assistant_panel'].includes(unit.unitType),
  ).length;
  if (hasFilters && dependentWidgets >= 2) {
    addUnit(
      units,
      createUnit({
        unitName: 'Cross-Widget Consistency',
        unitType: 'cross_widget_relation',
        pageArea: 'Cross-Widget Consistency',
        sourceEvidence: extractEvidenceSnippets(
          options.sourceInputs,
          [/filters apply to all cards/i, /sync trend chart and zone split/i, /update instantly/i, /refresh automatically/i],
          'Shared filtering and synchronized widgets require cross-widget reconciliation coverage.',
        ),
        keywords: ['sync', 'shared filters', 'consistency', 'reconciliation'],
      }),
    );
  }

  addUnit(
    units,
    createUnit({
      unitName: 'Loading State Regions',
      unitType: 'loading_region',
      pageArea: 'State Handling',
      sourceEvidence: extractEvidenceSnippets(
        options.sourceInputs,
        [/loading/i, /load within/i, /refresh/i, /auto-refresh/i],
        'Dashboard widgets must expose stable loading behavior during initial load and filter refresh.',
      ),
      keywords: ['loading', 'refresh', 'spinner'],
    }),
  );
  addUnit(
    units,
    createUnit({
      unitName: 'Empty State Regions',
      unitType: 'empty_state_region',
      pageArea: 'State Handling',
      sourceEvidence: extractEvidenceSnippets(
        options.sourceInputs,
        [/no data available/i, /empty/i, /no-data/i],
        'Dashboard widgets must explain empty and no-data states clearly.',
      ),
      keywords: ['empty', 'no data', 'fallback'],
    }),
  );
  addUnit(
    units,
    createUnit({
      unitName: 'Error State Regions',
      unitType: 'error_state_region',
      pageArea: 'State Handling',
      sourceEvidence: extractEvidenceSnippets(
        options.sourceInputs,
        [/error/i, /failed/i, /invalid/i, /malformed/i],
        'Dashboard widgets must tolerate malformed or failed data responses.',
      ),
      keywords: ['error', 'malformed', 'failure'],
    }),
  );

  const corpusHasCumulativeContext = /\bcumulative\b/i.test(options.corpus);
  const corpusHasDistributionSummary = /risk distribution|distribution summary|risk segregation/i.test(options.corpus);
  const analyticsKpiNames = new Set([
    normalizeFeatureName('Observations Recorded KPI Card'),
    normalizeFeatureName('Timely Observation Closure KPI Card'),
    normalizeFeatureName('High Risk Observation Ratio KPI Card'),
    normalizeFeatureName('Safe Operating Hours KPI Card'),
  ]);
  const hasSpecificAnalyticsKpis = units.some((unit) =>
    analyticsKpiNames.has(normalizeFeatureName(unit.unitName)),
  );

  return units.filter((unit) => {
    const normalizedUnitName = normalizeFeatureName(unit.unitName);

    if (
      !corpusHasCumulativeContext &&
      ['cumulative date range control', 'zone wise split donut chart'].includes(normalizedUnitName) &&
      normalizeFeatureName(unit.pageArea).includes('cumulative')
    ) {
      return false;
    }

    if (!corpusHasDistributionSummary && normalizedUnitName === normalizeFeatureName('Distribution Summary Chart')) {
      return false;
    }

    if (hasSpecificAnalyticsKpis && normalizedUnitName === normalizeFeatureName('Dashboard Metric Cards')) {
      return false;
    }

    return true;
  });
}

function buildFallbackUnits(options: { title: string; sourceInputs: PreparedSourceInput[]; pageType: CoveragePageType }) {
  const units = [
    createUnit({
      unitName: `${options.pageType} Page-Level Behavior`,
      unitType: 'page_level',
      pageArea: 'Page-Level Experience',
      sourceEvidence: [options.title || `${options.pageType} page`],
      keywords: [options.pageType, 'page-level'],
    }),
    createUnit({
      unitName: 'Loading State Regions',
      unitType: 'loading_region',
      pageArea: 'State Handling',
      sourceEvidence: ['Fallback loading coverage for non-dashboard page types.'],
      keywords: ['loading'],
    }),
    createUnit({
      unitName: 'Empty State Regions',
      unitType: 'empty_state_region',
      pageArea: 'State Handling',
      sourceEvidence: ['Fallback empty-state coverage for non-dashboard page types.'],
      keywords: ['empty state'],
    }),
    createUnit({
      unitName: 'Error State Regions',
      unitType: 'error_state_region',
      pageArea: 'State Handling',
      sourceEvidence: ['Fallback error-state coverage for non-dashboard page types.'],
      keywords: ['error state'],
    }),
  ];

  if (/filter|dropdown/i.test(buildCorpus({ title: options.title, description: '', sourceInputs: options.sourceInputs }))) {
    addUnit(
      units,
      createUnit({
        unitName: 'Primary Filters',
        unitType: 'filter_group',
        pageArea: 'Primary Interaction',
        sourceEvidence: extractEvidenceSnippets(options.sourceInputs, [/filter/i, /dropdown/i], 'Detected filter controls.'),
        keywords: ['filter', 'dropdown'],
      }),
    );
  }

  return units;
}

function computeCoverageMinimums(units: NormalizedPageUnit[]) {
  const minimums = Object.fromEntries(coverageBucketValues.map((bucket) => [bucket, 0])) as Record<CoverageBucket, number>;
  for (const unit of units) {
    minimums[bucketByUnitType[unit.unitType]] += unit.minimumCases;
  }
  minimums.accessibility_usability = Math.max(minimums.accessibility_usability, 8);
  minimums.performance_regression = Math.max(minimums.performance_regression, 6);
  minimums.empty_loading_error = Math.max(minimums.empty_loading_error, 12);
  return minimums;
}

function buildCrossRelations(units: NormalizedPageUnit[]) {
  const filterUnits = units.filter((unit) =>
    ['filter_group', 'date_control', 'time_control', 'toggle_control'].includes(unit.unitType),
  );
  const dependentUnits = units.filter((unit) =>
    ['kpi_card', 'summary_tile_grid', 'bar_chart_widget', 'stacked_bar_widget', 'line_chart_widget', 'donut_chart_widget', 'record_carousel', 'annotation_overlay', 'assistant_panel'].includes(unit.unitType),
  );
  if (filterUnits.length === 0 || dependentUnits.length < 2) {
    return [] as NormalizedCrossRelation[];
  }

  return [
    {
      relationId: 'relation:shared-filter-synchronization',
      relationName: 'Shared filter synchronization across widgets',
      sourceUnitIds: [...filterUnits.map((unit) => unit.unitId), ...dependentUnits.map((unit) => unit.unitId)],
      mappedRulePacks: ['cross_widget_consistency', 'api_backed_ui_baseline', 'performance_baseline', 'regression_baseline'],
      coverageBucket: 'cross_widget_consistency',
      requiredScenarioTypes: ['consistency', 'loading', 'error', 'stale_data', 'performance', 'regression'],
      minimumCases: 8,
    } satisfies NormalizedCrossRelation,
  ];
}

function extractDetectedFeatures(units: NormalizedPageUnit[]): CoverageFeature[] {
  return units
    .filter((unit) => !['page_level', 'loading_region', 'empty_state_region', 'error_state_region'].includes(unit.unitType))
    .map((unit) => ({
      displayName: unit.unitName,
      normalizedName: normalizeFeatureName(unit.unitName),
      sources: ['inferred_from_source'] as CoverageFeatureSource[],
      required: false,
      relatedUnitIds: [unit.unitId],
    }));
}

function mergeCoverageFeatures(options: {
  units: NormalizedPageUnit[];
  userFeatures: string[];
  detectedFeatures: CoverageFeature[];
}) {
  const merged = new Map<string, CoverageFeature>();

  const findMergeKey = (featureName: string, relatedUnitIds: string[]) => {
    const normalizedFeatureName = normalizeFeatureName(featureName);

    for (const [key, existing] of merged.entries()) {
      const overlapsUnits = existing.relatedUnitIds.some((unitId) => relatedUnitIds.includes(unitId));
      if (key === normalizedFeatureName || overlapsUnits) {
        return key;
      }
    }

    return normalizedFeatureName;
  };

  const upsertFeature = (feature: CoverageFeature) => {
    const mergeKey = findMergeKey(feature.displayName, feature.relatedUnitIds);
    const existing = merged.get(mergeKey);
    if (!existing) {
      merged.set(mergeKey, {
        displayName: feature.displayName,
        normalizedName: mergeKey,
        sources: [...feature.sources],
        required: feature.required,
        relatedUnitIds: dedupeStrings(feature.relatedUnitIds),
      });
      return;
    }

    const preferredDisplayName =
      feature.required && !existing.required ? feature.displayName : existing.displayName;

    merged.set(mergeKey, {
      displayName: preferredDisplayName,
      normalizedName: mergeKey,
      sources: dedupeStrings([...existing.sources, ...feature.sources]) as CoverageFeatureSource[],
      required: existing.required || feature.required,
      relatedUnitIds: dedupeStrings([...existing.relatedUnitIds, ...feature.relatedUnitIds]),
    });
  };

  for (const feature of options.detectedFeatures) {
    upsertFeature(feature);
  }

  const normalizedUserFeatures: CoverageFeature[] = [];
  for (const featureName of dedupeStrings(options.userFeatures)) {
    const relatedUnits = options.units.filter((unit) => scoreFeatureUnitMatch(featureName, unit) > 0);
    const relatedUnitIds = relatedUnits.map((unit) => unit.unitId);

    if (relatedUnitIds.length === 0) {
      const syntheticUnit = buildSyntheticFeatureUnit(featureName);
      addUnit(options.units, syntheticUnit);
      relatedUnitIds.push(syntheticUnit.unitId);
    }

    const feature: CoverageFeature = {
      displayName: normalizeWhitespace(featureName),
      normalizedName: normalizeFeatureName(featureName),
      sources: ['user_provided'],
      required: true,
      relatedUnitIds,
    };
    normalizedUserFeatures.push(feature);
    upsertFeature(feature);
  }

  return {
    userFeatures: normalizedUserFeatures,
    mergedFeatures: [...merged.values()],
  };
}

function splitIntoGroups<T>(items: T[], maxGroupSize: number) {
  const groups: T[][] = [];
  let current: T[] = [];

  for (const item of items) {
    current.push(item);
    if (current.length === maxGroupSize) {
      groups.push(current);
      current = [];
    }
  }

  if (current.length > 0) {
    groups.push(current);
  }

  return groups;
}

function clampRecommendedCaseCount(count: number) {
  return Math.max(1, Math.min(MAX_GENERATED_TEST_CASES, count));
}

function buildBatchDirectives(units: NormalizedPageUnit[], crossRelations: NormalizedCrossRelation[]) {
  const directives: CoverageBatchDirective[] = [];

  for (const unit of units) {
    directives.push({
      batchId: `batch:${unit.unitId}`,
      label: `${unit.pageArea} · ${unit.unitName}`,
      requestedCaseCount: unit.minimumCases,
      focusUnitIds: [unit.unitId],
      focusBuckets: [bucketByUnitType[unit.unitType]],
      focusScenarioTypes: unit.requiredScenarioTypes,
      rulePackIds: unit.mappedRulePacks,
      instructions: [
        `Treat "${unit.unitName}" as an independent testable unit.`,
        `Generate at least ${unit.minimumCases} materially distinct cases for this unit.`,
      ],
    });
  }

  for (const relation of crossRelations) {
    directives.push({
      batchId: `batch:${relation.relationId}`,
      label: relation.relationName,
      requestedCaseCount: relation.minimumCases,
      focusUnitIds: relation.sourceUnitIds,
      focusBuckets: [relation.coverageBucket],
      focusScenarioTypes: relation.requiredScenarioTypes,
      rulePackIds: relation.mappedRulePacks,
      instructions: [
        `Focus on synchronized behavior across these units: ${relation.sourceUnitIds.join(', ')}.`,
        `Generate at least ${relation.minimumCases} consistency and reconciliation cases.`,
      ],
    });
  }

  const interactiveUnits = units.filter((unit) =>
    ['header_navigation', 'filter_group', 'date_control', 'time_control', 'toggle_control', 'summary_tile_grid', 'bar_chart_widget', 'stacked_bar_widget', 'line_chart_widget', 'donut_chart_widget', 'record_carousel', 'annotation_overlay', 'assistant_panel', 'comments_panel', 'tooltip'].includes(
      unit.unitType,
    ),
  );
  if (interactiveUnits.length > 0) {
    directives.push({
      batchId: 'batch:accessibility-usability',
      label: 'Accessibility and usability sweep',
      requestedCaseCount: 8,
      focusUnitIds: interactiveUnits.map((unit) => unit.unitId),
      focusBuckets: ['accessibility_usability'],
      focusScenarioTypes: ['accessibility', 'usability'],
      rulePackIds: ['accessibility_baseline', 'usability_baseline', 'regression_baseline'],
      instructions: ['Generate cross-cutting accessibility and usability cases across interactive units.'],
    });
  }

  const dynamicUnits = units.filter((unit) =>
    ['filter_group', 'date_control', 'time_control', 'toggle_control', 'kpi_card', 'summary_tile_grid', 'bar_chart_widget', 'stacked_bar_widget', 'line_chart_widget', 'donut_chart_widget', 'record_carousel', 'annotation_overlay', 'assistant_panel', 'comments_panel', 'cross_widget_relation'].includes(
      unit.unitType,
    ),
  );
  if (dynamicUnits.length > 0) {
    directives.push({
      batchId: 'batch:performance-regression',
      label: 'Performance and regression sweep',
      requestedCaseCount: 6,
      focusUnitIds: dynamicUnits.map((unit) => unit.unitId),
      focusBuckets: ['performance_regression'],
      focusScenarioTypes: ['performance', 'regression', 'resilience'],
      rulePackIds: ['performance_baseline', 'regression_baseline', 'api_backed_ui_baseline'],
      instructions: ['Generate cross-cutting performance, resilience, and regression coverage across dynamic units.'],
    });
  }

  return directives;
}

export function buildCoveragePlan(options: {
  title: string;
  description: string;
  userFeatures?: string[];
  scopeFeatureName?: string;
  sourceInputs: PreparedSourceInput[];
  knowledgeBaseContext?: Record<string, unknown>;
}) {
  const corpus = buildCorpus(options);
  const pageType = classifyPageType(corpus);
  const pageName = normalizeWhitespace(options.title || 'Generated Page');
  const baseUnits =
    pageType === 'dashboard' || pageType === 'hybrid'
      ? buildDashboardUnits({ title: pageName, sourceInputs: options.sourceInputs, corpus })
      : buildFallbackUnits({ title: pageName, sourceInputs: options.sourceInputs, pageType });
  const scopedFeatureName = normalizeWhitespace(options.scopeFeatureName ?? '');

  let units = baseUnits;
  let detectedFeatures = extractDetectedFeatures(units);
  let mergedCoverage = mergeCoverageFeatures({
    units,
    userFeatures: options.userFeatures ?? [],
    detectedFeatures,
  });

  if (scopedFeatureName) {
    const scopedFeature =
      mergedCoverage.userFeatures.find((feature) => feature.normalizedName === normalizeFeatureName(scopedFeatureName)) ??
      mergedCoverage.userFeatures[0] ??
      null;
    const scopedUnitIds = new Set(scopedFeature?.relatedUnitIds ?? []);

    units = units.filter((unit) => scopedUnitIds.size === 0 || scopedUnitIds.has(unit.unitId));
    detectedFeatures = extractDetectedFeatures(units);
    mergedCoverage = mergeCoverageFeatures({
      units,
      userFeatures: [scopedFeatureName],
      detectedFeatures,
    });
  }

  const { userFeatures, mergedFeatures } = mergedCoverage;
  const crossRelations = buildCrossRelations(units);
  const coverageByBucketMinimums = computeCoverageMinimums(units);
  const batchDirectives = buildBatchDirectives(units, crossRelations);
  const recommendedCaseCount = clampRecommendedCaseCount(
    batchDirectives.reduce((total, directive) => total + directive.requestedCaseCount, 0),
  );

  return {
    pageType,
    pageName,
    userFeatures,
    detectedFeatures,
    mergedFeatures,
    units,
    crossRelations,
    coverageByBucketMinimums,
    requiredRulePacks: dedupeStrings([
      ...units.flatMap((unit) => unit.mappedRulePacks),
      ...crossRelations.flatMap((relation) => relation.mappedRulePacks),
    ]) as CoverageRulePack[],
    requiredScenarioTypes: dedupeStrings([
      ...units.flatMap((unit) => unit.requiredScenarioTypes),
      ...crossRelations.flatMap((relation) => relation.requiredScenarioTypes),
    ]) as CoverageScenarioType[],
    batchDirectives,
    recommendedCaseCount,
    reasoning: [
      `Classified page as ${pageType}.`,
      scopedFeatureName ? `Feature-scoped generation active for ${scopedFeatureName}.` : null,
      `Identified ${units.length} units and ${crossRelations.length} cross-widget relations.`,
      userFeatures.length > 0
        ? `User-requested features requiring guaranteed coverage: ${userFeatures.map((feature) => feature.displayName).join(', ')}.`
        : 'No explicit user-requested features were provided.',
      detectedFeatures.length > 0
        ? `Detected supplementary features from supporting evidence: ${detectedFeatures.map((feature) => feature.displayName).join(', ')}.`
        : 'No additional supplementary features were detected from supporting evidence.',
      `Recommended approximately ${recommendedCaseCount} test cases based on unit and cross-cutting quotas.`,
    ].filter((entry): entry is string => Boolean(entry)),
  } satisfies CoveragePlan;
}

function getNormalizedTags(testCase: Record<string, unknown>) {
  return Array.isArray(testCase.tags)
    ? testCase.tags.map((value) => normalizeWhitespace(String(value).toLowerCase())).filter(Boolean)
    : [];
}

function extractTagValues(testCase: Record<string, unknown>, prefix: string) {
  return getNormalizedTags(testCase)
    .filter((tag) => tag.startsWith(prefix))
    .map((tag) => tag.slice(prefix.length))
    .filter(Boolean);
}

export function validateCoveragePlan(
  plan: CoveragePlan,
  testCases: Array<Record<string, unknown>>,
  options?: { retryTriggered?: boolean },
) {
  const coverageByBucket = Object.fromEntries(coverageBucketValues.map((bucket) => [bucket, 0])) as Record<
    CoverageBucket,
    number
  >;
  const unitCoverage = new Map<string, number>();
  const scenarioCoverage = new Map<string, Set<CoverageScenarioType>>();

  for (const unit of plan.units) {
    unitCoverage.set(unit.unitId, 0);
    scenarioCoverage.set(unit.unitId, new Set<CoverageScenarioType>());
  }

  for (const testCase of testCases) {
    const unitIds = extractTagValues(testCase, 'unit:');
    const buckets = extractTagValues(testCase, 'coverage-bucket:').filter((value): value is CoverageBucket =>
      (coverageBucketValues as readonly string[]).includes(value),
    );
    const scenarioTypes = extractTagValues(testCase, 'scenario-type:').filter((value): value is CoverageScenarioType =>
      (coverageScenarioTypeValues as readonly string[]).includes(value),
    );

    for (const bucket of buckets) {
      coverageByBucket[bucket] += 1;
    }

    for (const unitId of unitIds) {
      unitCoverage.set(unitId, (unitCoverage.get(unitId) ?? 0) + 1);
      const set = scenarioCoverage.get(unitId) ?? new Set<CoverageScenarioType>();
      scenarioTypes.forEach((scenarioType) => set.add(scenarioType));
      scenarioCoverage.set(unitId, set);
    }
  }

  const missingUnits: string[] = [];
  const underCoveredUnits: CoverageValidationSummary['underCoveredUnits'] = [];
  const missingScenarioTypesByUnit: CoverageValidationSummary['missingScenarioTypesByUnit'] = [];

  for (const unit of plan.units) {
    const actual = unitCoverage.get(unit.unitId) ?? 0;
    if (actual === 0) {
      missingUnits.push(unit.unitName);
    }
    if (actual < unit.minimumCases) {
      underCoveredUnits.push({ unitId: unit.unitId, unitName: unit.unitName, expected: unit.minimumCases, actual });
    }
    const coveredScenarios = scenarioCoverage.get(unit.unitId) ?? new Set<CoverageScenarioType>();
    const missingScenarioTypes = unit.requiredScenarioTypes.filter((scenarioType) => !coveredScenarios.has(scenarioType));
    if (missingScenarioTypes.length > 0) {
      missingScenarioTypesByUnit.push({ unitId: unit.unitId, unitName: unit.unitName, missingScenarioTypes });
    }
  }

  const missingBuckets = coverageBucketValues
    .map((bucket) => ({ bucket, expected: plan.coverageByBucketMinimums[bucket], actual: coverageByBucket[bucket] }))
    .filter((entry) => entry.expected > entry.actual);
  const unitsCovered = plan.units.length - missingUnits.length;
  const coveredFeatures = plan.mergedFeatures
    .filter((feature) => {
      const relatedUnitCovered = feature.relatedUnitIds.some((unitId) => (unitCoverage.get(unitId) ?? 0) > 0);
      if (relatedUnitCovered) {
        return true;
      }

      return testCases.some((testCase) => {
        const text = normalizeFeatureName(
          [
            testCase.title,
            testCase.feature,
            testCase.scenario,
            ...(Array.isArray(testCase.linkedComponents) ? testCase.linkedComponents.map(String) : []),
            ...(Array.isArray(testCase.tags) ? testCase.tags.map(String) : []),
          ]
            .filter(Boolean)
            .join(' '),
        );
        return text.includes(feature.normalizedName);
      });
    })
    .map((feature) => feature.displayName);
  const missingRequestedFeatures = plan.userFeatures
    .filter((feature) => !coveredFeatures.some((covered) => normalizeFeatureName(covered) === feature.normalizedName))
    .map((feature) => feature.displayName);
  const quotaStatus =
    missingUnits.length === 0 &&
    underCoveredUnits.length === 0 &&
    missingBuckets.length === 0 &&
    missingScenarioTypesByUnit.length === 0 &&
    missingRequestedFeatures.length === 0
      ? 'met'
      : unitsCovered > 0 || coveredFeatures.length > 0
        ? 'partially_met'
        : 'unmet';

  return {
    pageType: plan.pageType,
    unitsIdentified: plan.units.length,
    unitsCovered,
    requestedUserFeatures: plan.userFeatures.map((feature) => feature.displayName),
    detectedFeatures: plan.detectedFeatures.map((feature) => feature.displayName),
    mergedFeatureSet: plan.mergedFeatures.map((feature) => feature.displayName),
    coveredFeatures,
    missingRequestedFeatures,
    retryTriggeredForMissingFeatures: Boolean(options?.retryTriggered) && missingRequestedFeatures.length > 0,
    coverageByBucket,
    quotaStatus,
    retryTriggered: Boolean(options?.retryTriggered),
    missingUnits,
    underCoveredUnits,
    missingBuckets,
    missingScenarioTypesByUnit,
  } satisfies CoverageValidationSummary;
}

export function buildCoverageSummaryLines(summary: CoverageValidationSummary) {
  const lines = [
    `Coverage planner classified page type as ${summary.pageType}.`,
    `Units covered: ${summary.unitsCovered}/${summary.unitsIdentified}.`,
    `Quota status: ${summary.quotaStatus}.`,
    `Requested user features: ${summary.requestedUserFeatures.length > 0 ? summary.requestedUserFeatures.join(', ') : 'none'}.`,
    `Detected supplementary features: ${summary.detectedFeatures.length > 0 ? summary.detectedFeatures.join(', ') : 'none'}.`,
    `Covered features: ${summary.coveredFeatures.length > 0 ? summary.coveredFeatures.join(', ') : 'none'}.`,
    `Coverage buckets: ${coverageBucketValues.map((bucket) => `${bucket}=${summary.coverageByBucket[bucket]}`).join(', ')}.`,
  ];
  if (summary.retryTriggered) {
    lines.push('Coverage expansion retry was triggered for missing coverage buckets or units.');
  }
  if (summary.retryTriggeredForMissingFeatures) {
    lines.push('Feature coverage retry was triggered because one or more requested user features were not yet covered.');
  }
  if (summary.missingUnits.length > 0) {
    lines.push(`Missing units: ${summary.missingUnits.join(', ')}.`);
  }
  if (summary.missingRequestedFeatures.length > 0) {
    lines.push(`Missing requested features: ${summary.missingRequestedFeatures.join(', ')}.`);
  }
  if (summary.missingBuckets.length > 0) {
    lines.push(`Buckets below quota: ${summary.missingBuckets.map((entry) => `${entry.bucket} (${entry.actual}/${entry.expected})`).join(', ')}.`);
  }
  return lines;
}

export function buildExpansionDirectives(plan: CoveragePlan, summary: CoverageValidationSummary) {
  const unitsById = new Map(plan.units.map((unit) => [unit.unitId, unit]));
  const remediationUnits = summary.underCoveredUnits
    .map((entry) => unitsById.get(entry.unitId))
    .filter((unit): unit is NormalizedPageUnit => Boolean(unit));
  const directives: CoverageBatchDirective[] = [];

  splitIntoGroups(remediationUnits, 2).forEach((group, index) => {
    directives.push({
      batchId: `batch:remediation-units-${index + 1}`,
      label: `Coverage expansion batch ${index + 1}`,
      requestedCaseCount: clampRecommendedCaseCount(
        group.reduce((total, unit) => total + Math.max(2, unit.minimumCases - (summary.underCoveredUnits.find((entry) => entry.unitId === unit.unitId)?.actual ?? 0)), 0),
      ),
      focusUnitIds: group.map((unit) => unit.unitId),
      focusBuckets: dedupeStrings(group.map((unit) => bucketByUnitType[unit.unitType])) as CoverageBucket[],
      focusScenarioTypes: dedupeStrings(
        summary.missingScenarioTypesByUnit.filter((entry) => group.some((unit) => unit.unitId === entry.unitId)).flatMap((entry) => entry.missingScenarioTypes),
      ) as CoverageScenarioType[],
      rulePackIds: dedupeStrings(group.flatMap((unit) => unit.mappedRulePacks)) as CoverageRulePack[],
      instructions: [`Backfill missing quota and scenario categories for ${group.map((unit) => unit.unitName).join(', ')}.`],
    });
  });

  if (summary.missingBuckets.length > 0) {
    directives.push({
      batchId: 'batch:remediation-cross-cutting',
      label: 'Cross-cutting quota remediation',
      requestedCaseCount: clampRecommendedCaseCount(
        summary.missingBuckets.reduce((total, entry) => total + Math.max(1, entry.expected - entry.actual), 0),
      ),
      focusUnitIds: plan.units.map((unit) => unit.unitId),
      focusBuckets: summary.missingBuckets.map((entry) => entry.bucket),
      focusScenarioTypes: dedupeStrings(summary.missingScenarioTypesByUnit.flatMap((entry) => entry.missingScenarioTypes)) as CoverageScenarioType[],
      rulePackIds: plan.requiredRulePacks,
      instructions: [`Prioritize missing coverage buckets: ${summary.missingBuckets.map((entry) => entry.bucket).join(', ')}.`],
    });
  }

  if (summary.missingRequestedFeatures.length > 0) {
    const missingFeatureUnits = dedupeStrings(
      plan.userFeatures
        .filter((feature) => summary.missingRequestedFeatures.includes(feature.displayName))
        .flatMap((feature) => feature.relatedUnitIds),
    );

    if (missingFeatureUnits.length > 0) {
      const units = missingFeatureUnits
        .map((unitId) => unitsById.get(unitId))
        .filter((unit): unit is NormalizedPageUnit => Boolean(unit));

      directives.push({
        batchId: 'batch:remediation-required-features',
        label: 'Required feature remediation',
        requestedCaseCount: clampRecommendedCaseCount(
          Math.max(summary.missingRequestedFeatures.length * 4, units.reduce((total, unit) => total + Math.max(2, unit.minimumCases), 0)),
        ),
        focusUnitIds: units.map((unit) => unit.unitId),
        focusBuckets: dedupeStrings(units.map((unit) => bucketByUnitType[unit.unitType])) as CoverageBucket[],
        focusScenarioTypes: dedupeStrings(units.flatMap((unit) => unit.requiredScenarioTypes)) as CoverageScenarioType[],
        rulePackIds: dedupeStrings(units.flatMap((unit) => unit.mappedRulePacks)) as CoverageRulePack[],
        instructions: [
          `Backfill missing mandatory user-requested features: ${summary.missingRequestedFeatures.join(', ')}.`,
          'Every named feature in this batch is mandatory and must receive explicit testcase coverage.',
        ],
      });
    }
  }

  return directives;
}
