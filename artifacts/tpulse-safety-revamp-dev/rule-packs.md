# Rule Packs

Updated on 2026-03-26 using:

- the saved tpulse exploration artifacts already in this repository
- the Home-page testcase workbook shared by the user
- a focused live dashboard re-check for current UI confirmation

## Shared Platform

### Authentication And Session Management

- Purpose: cover sign-in, session continuity, and account access.
- Applies to:
  - Feature types: `authentication`, `session-management`
  - Components: `Login Form`, `User Avatar Menu`, `Sidebar Navigation Rail`
- Key mandatory scenarios:
  - sign-in stays disabled until required credentials are present
  - valid sign-in reaches the authenticated shell
  - avatar menu exposes account actions
- Notable concerns:
  - Negative: invalid credentials must not silently navigate
  - Edge: autofill and long email values must not break state
  - Security: logout must remove access to protected pages
  - Accessibility: labels and keyboard submission need to work

### Shell Navigation And Account Access

- Purpose: validate persistent shell navigation and account-menu behavior.
- Applies to:
  - Feature types: `shell-navigation`, `cross-module-access`
  - Components: `Sidebar Navigation Rail`, `User Avatar Menu`, `Pagination Control`
- Key mandatory scenarios:
  - all major routes are reachable
  - active highlighting follows the current route
  - unread indicators stay aligned with the notification entry
- Notable concerns:
  - Negative: broken route transitions must not strand the user
  - Edge: long labels and large unread counts remain readable
  - Security: shell state must not leak across sessions
  - Accessibility: current-state cues cannot rely only on color

### Shared Filtering And Scope Control

- Purpose: validate the Home-page unit selector and page-level date range along with shared filter-state behavior.
- Applies to:
  - Feature types: `filtering`, `scope-control`, `dashboard-filtering`
  - Components: `Shared Filter Bar`, `Filter Dialog`
- Key mandatory scenarios:
  - unit selector shows `Select All` and the available units
  - all units are selected by default unless a persisted scope is intentionally restored
  - the user cannot leave the dashboard with zero selected units
  - unit changes refresh all dependent widgets
  - the date picker supports single-day and range selection and reopens with the applied range highlighted
  - changing units preserves dates and changing dates preserves units
- Notable concerns:
  - Negative: invalid ranges, future dates, and stale data after rapid changes
  - Edge: leap years, far-past dates, long unit lists, and config drift in the default date window
  - Security: filters must not expose out-of-scope data
  - Accessibility: unit and date controls need clear labels and predictable focus order

## Home Dashboard

### Dashboard KPI Cards And Segregation Drilldowns

- Purpose: validate product-specific Home summary cards such as `Total Observations`, `Risk Distribution`, and configured classification cards.
- Applies to:
  - Feature types: `dashboard-kpi`, `summary-cards`, `drilldown`
  - Components: `Metric Card`, `Visualization Panel`
- Key mandatory scenarios:
  - card totals equal the sum of their visible splits
  - risk-distribution segments match the underlying counts
  - classification buckets remain mutually exclusive
  - counts refresh correctly after scope changes and supported record mutations
  - drilldown views open once and retain page filters on close
- Notable concerns:
  - Negative: zero-total math and duplicate drilldown popups
  - Edge: skewed distributions, very small buckets, and very large counts
  - Security: drilldowns stay within selected scope
  - Accessibility: legends and counts must remain understandable without color alone

### Dashboard Trend Visualization Tabs

- Purpose: validate the `Safety Trend` and `Category Trend` Home chart views.
- Applies to:
  - Feature types: `dashboard-trends`, `chart-tabs`, `visualization`
  - Components: `Visualization Panel`, `Shared Filter Bar`
- Key mandatory scenarios:
  - both chart modes are available and switching between them does not reset page filters
  - tooltips show the correct date/category and count
  - chart axes, icons, and alignment match the visible data
  - filter changes update the active chart without stale values
- Notable concerns:
  - Negative: misleading tooltip states and broken no-data states
  - Edge: single-day selections, long date ranges, and very high category counts
  - Security: trend values must stay inside the current scope
  - Accessibility: chart mode and context must be understandable without hover alone

### Life Saving Rule Category Monitoring

- Purpose: validate the `Life Saving Rule Category` section, including `Compact`, `Expanded`, `Selected Dates`, and `Custom Dates`.
- Applies to:
  - Feature types: `category-monitoring`, `life-saving-rules`, `section-level-filtering`
  - Components: `Category Summary Tile Grid`, `Shared Filter Bar`
- Key mandatory scenarios:
  - category totals stay correct for the active unit scope and active date mode
  - compact and expanded states switch cleanly
  - expanded segregation adds back to the category total
  - `Selected Dates` follows the page-level date range
  - `Custom Dates` uses a section-level date range without resetting the unit filter
  - switching back to `Selected Dates` restores page-level date behavior
- Notable concerns:
  - Negative: invalid custom ranges and silent overwrites from page-level date changes
  - Edge: long category names, large counts, zero-data categories, and stale expanded values after rapid changes
  - Security: custom-date overrides must not leak records outside the intended temporal scope
  - Accessibility: date-mode controls and expanded-state cues need clear labeling

### High Risk Observation Carousel And Handoff

- Purpose: validate the Home `Recent SIF & Observations` carousel and its handoff to observation detail.
- Applies to:
  - Feature types: `carousel`, `high-risk-monitoring`, `record-handoff`
  - Components: `Record Carousel`, `Selectable Record List`
- Key mandatory scenarios:
  - the carousel shows the latest qualifying SIF/high-risk content based on the product rule
  - fallback behavior works when no qualifying records exist
  - auto-scroll and manual next/previous controls both work
  - clicking a card opens the intended observation detail context
- Notable concerns:
  - Negative: non-qualifying records, broken manual/auto-scroll interaction, and wrong-record navigation
  - Edge: fewer than the display limit, more than the display limit, and missing thumbnails
  - Security: handoff must not expose an unrelated observation
  - Accessibility: navigation controls need discernible names

### Dashboard Insights Assistant Interaction

- Purpose: validate the `EOS Insights` panel and ask flow.
- Applies to:
  - Feature types: `assistant-insights`, `dashboard-assistant`
  - Components: `Assistant Drawer`
- Key mandatory scenarios:
  - insight cards, history state, suggested questions, and the composer render
  - send stays disabled until a valid prompt is entered
  - `Ask EOS` actions stay aligned to the visible insight context
- Notable concerns:
  - Negative: empty-history and failed-inference states must remain usable
  - Edge: long history and long narrative content stay scrollable
  - Security: assistant context must remain tied to the active user and current scope
  - Accessibility: headings and buttons need clear labels

## Cross-Module Operations

### Analytics Visualization And Hierarchical Data

- Purpose: validate analytics charts, summary cards, and the expandable treegrid.
- Applies to:
  - Feature types: `analytics`, `visualization`
  - Components: `Metric Card`, `Visualization Panel`, `Expandable Treegrid Table`, `Shared Filter Bar`
- Key mandatory scenarios:
  - analytics cards and charts follow the selected units and date range
  - chart controls switch data slices correctly
  - treegrid expansion preserves parent-child alignment
- Notable concerns:
  - Negative: chart failures and orphaned expansion states
  - Edge: large time ranges and large unit hierarchies
  - Security: analytics drilldowns stay scoped
  - Accessibility: charts need titles/context and treegrid structure should remain discernible

### Timeline Review And Media Inspection

- Purpose: validate timeline selection, scoped detail refresh, and review-pane stability.
- Applies to:
  - Feature types: `timeline-review`, `observation-inspection`
  - Components: `Timeline Explorer`, `Record Detail Panel`, `Shared Filter Bar`, `Filter Dialog`
- Key mandatory scenarios:
  - selecting a day updates the matching detail context
  - sort and filter changes preserve coherent timeline state
  - detail metadata stays tied to the selected timeline item
- Notable concerns:
  - Negative: empty selected-day states and timeline/detail mismatches
  - Edge: dense days and large date ranges
  - Security: review paths must not leak out-of-scope records
  - Accessibility: selected-state cues should not rely only on color

### Record List Selection And Master Detail

- Purpose: validate shared list, toolbar, detail-pane, and pagination behavior across observation/action/report-style pages.
- Applies to:
  - Feature types: `record-management`, `master-detail`
  - Components: `Action Toolbar`, `Selectable Record List`, `Record Detail Panel`, `Pagination Control`
- Key mandatory scenarios:
  - list metadata remains stable
  - selection updates the correct detail pane
  - bulk-action enablement follows selection state
  - pagination changes the visible result slice cleanly
- Notable concerns:
  - Negative: invalid retained selection and disabled rows toggling
  - Edge: long titles and large result sets
  - Security: row and bulk actions must stay gated
  - Accessibility: nested interactive list regions need a sensible focus order

### Action Workflow And Audit History

- Purpose: validate action-detail governance, linked observations, comments/evidence constraints, and history review.
- Applies to:
  - Feature types: `action-workflow`, `audit-history`
  - Components: `Action Toolbar`, `Record Detail Panel`, `History Drawer`
- Key mandatory scenarios:
  - action metadata stays internally consistent
  - history opens against the correct selected action
  - linked observations remain scoped to the action
  - visible upload/comment constraints remain discoverable
- Notable concerns:
  - Negative: wrong-record history and incorrectly enabled workflow actions
  - Edge: long history streams and large linked sections
  - Security: audit/history scope must stay record-specific
  - Accessibility: titled sections and keyboard drawer control matter

## Reports, Alerts, And Help

### Reports And Document Access

- Purpose: validate report request entry and viewer resilience.
- Applies to:
  - Feature types: `reporting`, `document-access`
  - Components: `Report Generation Modal`, `Selectable Record List`, `Pagination Control`, `Action Toolbar`
- Key mandatory scenarios:
  - required dates gate report generation
  - report list metadata and pagination stay stable
  - viewer failures degrade gracefully
- Notable concerns:
  - Negative: missing dates and viewer crashes
  - Edge: wide date ranges and large report lists
  - Security: report scope must stay limited to selected criteria
  - Accessibility: modal labels and focus trapping need to hold

### Notification Feed And Alert Triage

- Purpose: validate notification counts, tabbed feed behavior, unread integrity, and per-item/global actions.
- Applies to:
  - Feature types: `notifications`, `alert-triage`
  - Components: `Notification Center`, `Notification Feed Item`, `Metric Card`, `Sidebar Navigation Rail`, `Pagination Control`
- Key mandatory scenarios:
  - Observation and Action tabs switch feed content correctly
  - summary counts align with the displayed feed
  - unread indicators stay aligned between shell and notification center
  - item-level actions target the correct row
- Notable concerns:
  - Negative: accidental global actions and broken deep links
  - Edge: large feeds and large unread counts
  - Security: actions must affect only the intended feed/user context
  - Accessibility: icon-only actions need discernible names

### Help And Reference Content Delivery

- Purpose: validate tabbed help/reference content and the embedded manual slot.
- Applies to:
  - Feature types: `help-reference`, `embedded-documentation`
  - Components: `Help Reference Workspace`
- Key mandatory scenarios:
  - help tabs render and switch cleanly
  - category and mapping content stay aligned to the active tab
  - the manual frame attempts to load while preserving a stable container
- Notable concerns:
  - Negative: silent blank states when assets fail
  - Edge: long help lists and mixed static/document content
  - Security: embedded reference content should stay within the expected help context
  - Accessibility: tabs need clear labels and missing-manual fallbacks need readable text

## Tailoring Notes

- The Home-page testcase workbook materially strengthened the dashboard rule packs, especially around:
  - unit-selection guardrails
  - date-range persistence and invalid-range handling
  - summary-card math and drilldowns
  - Selected Dates vs Custom Dates behavior
  - carousel qualification and handoff logic
  - trend-chart tab switching and tooltip correctness

- The focused live dashboard re-check confirmed that the current product still exposes:
  - `All Units`
  - a page-level date-range picker
  - `Total Observations`
  - `Risk Distribution`
  - `Life Saving Rule Category`
  - `Selected Dates`
  - `Custom Dates`
  - `Category Trend`
  - `Safety Trend`
  - `Recent SIF & Observations`
  - `EOS Insights`

## Assumptions And Uncertainties

- The workbook appears to reflect a Home-page QA plan that is partly stable and partly configuration-sensitive.
- One workbook section refers to a `Behavioral & Environmental` card, while the live dashboard currently exposes an `Observation Type` card. The rule pack therefore treats classification-card behavior as configurable instead of hardcoding one label set.
- The workbook mentions shifting expectations for the default date window. The rule pack therefore checks configured default-range consistency rather than hardcoding a fixed duration.
