# Exploration Notes

## Pages Explored

- Logged in through `/auth/sign-in` with the supplied credentials and landed on `/safety-and-surveillance/dashboard`.
- Visited every major post-login route visible in the left navigation rail: Dashboard, Analytics, Timeline, Observations, Reports, Notifications, and Help.
- Switched the shared observations page between its `OBSERVATIONS` and `ACTIONS` subviews.
- Opened safe read-only overlays/drawers where useful to confirm behavior: unit selector, date picker, timeline filters, action history, comments drawers, custom report modal, help tabs, and the avatar menu.

## Assumptions Used During Consolidation

- Repeated card, tab, filter, and list patterns were merged into reusable generic components instead of page-specific duplicates.
- `routeOrLocationHint` values reflect visible headings and placement rather than hidden internal route metadata.
- When a pattern appeared visually identical across modules, it was catalogued once and all visible occurrences were listed in `whereFound`.

## Intentionally Avoided

- Create Action, Add Observation, status changes, Mark SIF, Mark All Read, Clear All, export, report generation, file upload submission, and comment submission.
- Any action that would mutate records, change notification state, or create new portal data.
- Destructive or account-changing actions such as Logout and Change Password.

## What Could Not Be Fully Inspected

- Full document rendering inside Help > User Manual. The iframe source was visible, but the console reported a route/asset error for the PDF path.
- Full report-viewer behavior on the Reports page. The list and custom report modal were inspectable, but report rendering emitted worker/script errors.
- Deep accessibility behavior such as full keyboard traversal, screen-reader output, and responsive/mobile layout.

## Visible Technical Issues Observed

- Repeated CSP-style console errors about inline styles across several pages.
- Occasional image or vendor endpoint load failures.
- Reports emitted worker and external script errors while loading.
- One vendor resource failure appeared on the observations detail page.

## Scope Limits

- No mobile/responsive pass was performed.
- No hidden or permission-gated routes beyond the visible navigation shell were explored.
- The catalogue is grounded in visible behavior only; hidden business rules were not inferred unless the UI strongly implied them.
