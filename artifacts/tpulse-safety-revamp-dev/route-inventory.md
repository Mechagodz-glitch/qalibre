# Route Inventory

Major reachable routes discovered after login.

| Module | Page | Route | Key UI Observed |
|---|---|---|---|
| Authentication | Sign In | `/auth/sign-in` | Login form, forgot-password link, SSO button |
| Dashboard | Dashboard | `/safety-and-surveillance/dashboard` | Shared filters, KPI cards, category tiles, chart panel, recent-record carousel, EOS assistant drawer |
| Analytics | Analytics | `/safety-and-surveillance/analytics` | Shared filters, summary cards, charts, treegrid, heat map |
| Timeline | Observation Review | `/safety-and-surveillance/review` | Shared filters, filter dialog, date-grouped review list, hourly timeline, media viewer, detail tabs |
| Observations | Observations view | `/safety-and-surveillance/actions` | View toggle, list toolbar, selectable observation cards, detail pane, comments |
| Actions | Actions subview | `/safety-and-surveillance/actions` | Action list, action detail form, linked observations, history drawer, comments drawer |
| Reports | Reports | `/safety-and-surveillance/reports` | Plant/period filters, report list, custom report modal, report detail actions |
| Notifications | Safety Notifications | `/safety-and-surveillance/notification` | Summary cards, Observation/Action tabs, filter dropdown, mute switch, mark-all/clear-all actions |
| Help | Help | `/safety-and-surveillance/help` | Categorization cards, category mapping cards, user-manual iframe slot |

## Notes

- The Observations and Actions views share the same base route and switch subviews inside the page.
- Help contains sub-tabs rather than separate top-level routes for Categorization, Category Mapping, and User Manual.
- Timeline detail, action history, comments, and filters are overlay/side-panel patterns, not distinct routes.
