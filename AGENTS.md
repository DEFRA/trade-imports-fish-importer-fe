# Agent instructions

## Scope

These instructions apply throughout this repository. For every new or changed
frontend page, follow GDS guidance and GOV.UK best practices by default, without
requiring the user to repeat this requirement.

## Frontend standards

- Follow the [GOV.UK Design System](https://design-system.service.gov.uk/),
  [Service Manual](https://www.gov.uk/service-manual) and
  [GOV.UK content guidance](https://www.gov.uk/guidance/content-design).
- Use established GOV.UK components and patterns rather than bespoke equivalents.
  Check the relevant guidance before implementing a page or interaction.
- Reuse the project's shared Nunjucks layout, macros, styles and route conventions.
  Prefer the installed `govuk-frontend` macros over duplicating component markup.
- Use GOV.UK typography, spacing, grid layouts and responsive patterns. Add custom
  CSS or JavaScript only where existing components and utilities do not meet the
  user need.
- Use plain English, sentence case, descriptive headings and meaningful link and
  button text. Follow the [GOV.UK style guide](https://www.gov.uk/guidance/style-guide).
- Keep each page focused on a clear user need. For question journeys, start with
  one thing per page and use the relevant Design System pattern.
- Keep essential requirements visible. Use `govukDetails` for supplementary
  explanations, not information everyone needs to complete the task.
- Avoid creating journey or session state merely to display informational pages.
  Initialise state only when the page or journey requires it.
- Explain any necessary departure from the guidance. Existing pages are examples
  of project integration, not proof of compliance or a reason to repeat an issue.

## Accessibility and forms

- Meet [WCAG 2.2 AA](https://www.w3.org/TR/WCAG22/) and follow the
  [Service Manual accessibility guidance](https://www.gov.uk/service-manual/helping-people-to-use-your-service).
- Use semantic HTML, a descriptive page title, one clear main heading and a logical
  heading hierarchy. Preserve the shared layout's landmarks and skip link.
- Ensure keyboard access, visible focus, sufficient contrast and usable layouts
  when zoomed or viewed on small screens. Do not rely on colour alone.
- Give inputs visible, programmatically associated labels. Use fieldsets, legends,
  hints and autocomplete attributes where appropriate.
- Validate submitted data on the server. For validation failures, preserve entered
  values, show an error summary linked to the affected fields, provide matching
  inline errors and prefix the page title with `Error:` as GOV.UK guidance requires.
- Use progressive enhancement: core page content and form submission must work
  without client-side JavaScript.

## Notification journey

- Before adding or changing notification routes, forms or draft/session handling,
  read the [notification journey documentation](docs/notification-journey.md).
- Reuse the [shared notification guard](src/server/routes/notification/guard.js)
  on protected GET and POST routes, preserving the documented prerequisites,
  draft-identity checks and stale-form behaviour.

## Project examples

- Shared page layout: [page.njk](src/server/common/templates/layouts/page.njk).
- Page structure and component imports:
  [home page](src/server/routes/home/index.njk).
- Form and CSRF token integration:
  [cookie preferences page](src/server/routes/cookies/policy.njk).
- Informational content, supplementary document guidance and start navigation:
  [notification guidance page](src/server/routes/notification/guidance/index.njk).
- Rendered-page assertions and checks for unnecessary session creation:
  [guidance page tests](src/server/routes/notification/guidance/controller.test.js).

## Validation

- Add or update focused tests for changed page behaviour, including applicable
  validation, error and successful submission paths, using existing test patterns.
- Use the existing `server.inject()` and Cheerio patterns to test rendered HTML,
  including meaningful content, heading structure and navigation destinations.
- Run the relevant tests and existing lint or frontend build commands for the
  changes made; see [package.json](package.json) for available scripts.
- For page changes, check keyboard navigation, focus, responsive layout and form
  errors in the browser where available. Use existing accessibility tooling where
  available; automated checks alone do not establish accessibility compliance.
- State what was verified and identify any checks that could not be completed.

## Agent skills

### Issue tracker

Issues and specs are tracked in GitHub Issues for
`DEFRA/trade-imports-fish-importer-fe`. See [issue tracker](docs/agents/issue-tracker.md).

### Domain docs

Single-context layout: root `GLOSSARY.md` and `docs/adr/`.
See [domain docs](docs/agents/domain.md).
