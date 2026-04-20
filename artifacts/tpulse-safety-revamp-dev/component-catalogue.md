# Component Catalogue

Generated from live portal exploration on 2026-03-25. The catalogue below consolidates repeated UI patterns into reusable components.

## Authentication / Sign In

- `[workflow] Login Form`: Main auth card with username/password entry, disabled-until-valid submit behavior, forgot-password link, and SSO entry.

## Shared Shell / All Post-Login Pages

- `[navigation] Sidebar Navigation Rail`: Left rail used for Home, Analytics, Timeline, Observations, Reports, Notification, and Help.
- `[navigation] User Avatar Menu`: Top-right profile trigger exposing Change Password and Logout.

## Dashboard / Dashboard

- `[selection] Shared Filter Bar`: Unit multiselect, date-range picker, and page-specific quick action controls in the header row.
- `[data_display] Metric Card`: KPI cards for counts, deltas, and open/closed splits.
- `[data_display] Category Summary Tile Grid`: Life Saving Rule category tiles with icon, label, and observation count.
- `[visualization] Visualization Panel`: Category trend and related visual summaries with local controls.
- `[data_display] Record Carousel`: Recent SIF and observation carousel with thumbnails, timestamps, and page controls.
- `[utility] Assistant Drawer`: EOS Insights panel with empty chat history, insight cards, suggested questions, and a disabled-until-typed composer.

## Analytics / Analytics

- `[selection] Shared Filter Bar`: Same unit/date controls reused in analytics.
- `[data_display] Metric Card`: Overview cards for total observations, critical observations, and most critical location.
- `[visualization] Visualization Panel`: Risk trend, hourly distribution, observation trend, and heat-map sections.
- `[data_display] Expandable Treegrid Table`: Unit-wise observations treegrid with expandable rows and inline actions.

## Timeline / Observation Review

- `[selection] Shared Filter Bar`: Same shared unit/date controls at the top of the page.
- `[workflow] Filter Dialog`: Read-only inspection confirmed zone/category/subcategory/risk filters plus Apply/Cancel/Reset controls.
- `[workflow] Timeline Explorer`: Date-grouped timeline list plus selected-day hourly exploration pattern.
- `[container] Record Detail Panel`: Selected observation detail area combining media, metadata, tabs, comments, and attachment affordances.

## Observations And Actions / Shared Base Page

- `[selection] Shared Filter Bar`: Same unit/date controls reused in the shared observations/actions shell.
- `[workflow] Filter Dialog`: Same modal filter surface reused from the timeline pattern.
- `[workflow] Action Toolbar`: Bulk actions, export, create entry points, toggles, counts, and sort controls.
- `[data_display] Selectable Record List`: Scrollable observation/action/report cards with summary metadata and optional selection controls.
- `[navigation] Pagination Control`: Reusable page navigator with result summary.

## Observations / Observation Detail Pane

- `[container] Record Detail Panel`: Observation-focused detail pane with preview media, tabs, status, and comment tools.

## Actions / Action Detail Pane

- `[container] Record Detail Panel`: Action-focused detail pane with assignment, approver, due date, description, linked observations, and evidence affordances.
- `[feedback] History Drawer`: Audit-style chronological drawer opened from the action detail pane.

## Reports / Reports

- `[workflow] Action Toolbar`: Filter row plus Custom Report entry point.
- `[data_display] Selectable Record List`: Report list entries using the same master-detail list pattern.
- `[navigation] Pagination Control`: Result pagination under the report list.
- `[workflow] Report Generation Modal`: Required-date custom report dialog with optional user selection.

## Notifications / Safety Notifications

- `[data_display] Metric Card`: Total and unread notification summary cards.
- `[feedback] Notification Center`: Tabbed Observation/Action notification workspace with filter dropdown, mute switch, and global actions.
- `[feedback] Notification Feed Item`: Feed rows with message text, time, location metadata, NEW badge, and icon-only item actions.
- `[navigation] Pagination Control`: Feed paging with a result summary.

## Help / Help

- `[data_display] Help Reference Workspace`: Tabbed help surface containing categorization cards, category-mapping cards, and the user-manual document slot.

## Deduplication Notes

- Shared filter behavior was merged into one reusable component instead of cataloguing separate unit picker and date picker entries.
- Observation and action detail behavior was merged into one `Record Detail Panel` entry because the interaction model is materially the same even though the fields differ.
- Report cards were merged into the same `Selectable Record List` pattern because the page still uses the same master-detail list behavior.
