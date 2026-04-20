# Enhanced Test Taxonomy

Updated for the QA Dataset Workbench to make `Smoke`, `Usability`, `Responsiveness`, and `Compatibility` more explicit and reusable.

## Refined Entries

### Smoke

- Purpose: fast release-confidence coverage for critical-path workflows and baseline availability.
- Strengthening applied:
  - emphasized post-deployment confidence
  - emphasized critical journeys and core integrations
  - clarified that smoke is not meant for deep edge-case exploration

### Usability

- Purpose: assess clarity, efficiency, discoverability, feedback quality, and recovery from user mistakes.
- Strengthening applied:
  - expanded beyond generic UX wording
  - made it more useful for dense admin and workflow-heavy applications
  - clarified when usability is not the right taxonomy focus

### Compatibility

- Purpose: assess cross-browser correctness and stability across supported client environments.
- Strengthening applied:
  - explicitly names `Chrome`, `Firefox`, `Microsoft Edge`, and `Safari`
  - calls out browser-sensitive controls such as date pickers, uploads, tables, modals, navigation, downloads, and clipboard-style behavior
  - removed vague wording and made browser support first-class

## New Entry

### Responsiveness

- Purpose: assess layout, readability, interaction, and stability across screen sizes.
- Coverage includes:
  - mobile
  - tablet
  - laptop
  - desktop
  - resizing and orientation changes where relevant
  - overflow, clipping, reflow, and breakpoint-sensitive navigation behavior

## Retained Entries

- Functional
- Integration
- API
- Regression
- E2E
- Performance
- Security
- Accessibility
- Data Integrity
- Recovery

## Modeling Notes

- `Responsiveness` is modeled as a first-class taxonomy entry instead of being buried inside `Compatibility`, because viewport behavior drives a distinct and reusable test dimension.
- `Compatibility` remains browser- and environment-focused, while `Responsiveness` covers breakpoint and layout behavior. This keeps overlap low and future test generation clearer.
- `Smoke` stays `P0` because it is release-gating by nature.
- `Responsiveness` is set to `P1` because layout and interaction breakpoints can block core usage even when raw functionality still exists.
- `Usability` and `Compatibility` stay at `P2` by default, while still allowing feature- or release-specific priority overrides later.
