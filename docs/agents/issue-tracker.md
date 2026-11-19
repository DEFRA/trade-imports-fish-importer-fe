# Issue tracker: GitHub

Issues and specs for this repo live in GitHub Issues for
`DEFRA/trade-imports-fish-importer-fe`. Use the `gh` CLI for all operations,
from inside this repository.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`.
  Use a heredoc for multi-line bodies.
- **Read an issue**:
  `gh issue view <number> --json number,title,body,labels,comments`.
- **List issues**:
  `gh issue list --state open --json number,title,body,labels,comments`.
  Use appropriate `--label` and `--state` filters.
- **Make an issue a sub-issue of a parent**:
  `gh issue create --parent <parent> ...`, or
  `gh issue edit <parent> --add-sub-issue <child>` afterwards (`gh` 2.94+).
  Older `gh`: `gh api --method POST repos/DEFRA/trade-imports-fish-importer-fe/issues/<parent>/sub_issues -F sub_issue_id=<child-db-id>`.
  Without sub-issues, put `Part of #<parent>` at the top of the child body.
- **Blocking**: use GitHub's native issue dependencies.
  `gh issue create --blocked-by <n>,<n> ...`, or
  `gh issue edit <child> --add-blocked-by <blocker>` (`gh` 2.94+).
  Older `gh`: `gh api --method POST repos/DEFRA/trade-imports-fish-importer-fe/issues/<child>/dependencies/blocked_by -F issue_id=<blocker-db-id>`.
  Database IDs come from
  `gh api repos/DEFRA/trade-imports-fish-importer-fe/issues/<n> --jq .id`;
  they are not issue numbers or node IDs.
  Where dependencies are unavailable, put `Blocked by: #<n>, #<n>` at the
  top of the child body. A ticket is unblocked when every blocker is closed.
- **Count open blockers**:
  `gh api repos/DEFRA/trade-imports-fish-importer-fe/issues/<n> --jq .issue_dependencies_summary.blocked_by`.
  This counts open blockers only; 0 means startable.
- **Comment**: `gh issue comment <number> --body "..."`.
- **Apply or remove labels**:
  `gh issue edit <number> --add-label "..."` or `--remove-label "..."`.
- **Close**: first post the explanation with `gh issue comment <number> --body "..."`,
  then run `gh issue close <number>`.
  On an already-closed issue, `gh issue close --comment` drops the comment
  and still exits 0.

Before the first issue creation in a session, check the target with
`gh repo view --json nameWithOwner`. It must be
`DEFRA/trade-imports-fish-importer-fe`; confirm any different target with the
user before writing. In a fork, `gh` can default to the upstream parent.
Never file into `mattpocock/skills` unless the user owns it.

## Pull requests as a triage surface

**PRs as a request surface: no.**

GitHub shares one number space across issues and PRs. Resolve an ambiguous
number with `gh pr view <number>` and, if it is not a PR, `gh issue view <number>`.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Read it using the command under **Read an issue** above.

## Wayfinding operations

Used by `/wayfinder`. The map is a single issue with child issues as tickets.

- **Map**: an issue labelled `wayfinder:map`, holding Notes, Decisions-so-far
  and Fog. Create it with `gh issue create --label wayfinder:map`.
- **Child ticket**: link it to the map as a sub-issue. Where sub-issues are
  unavailable, add the child to a task list in the map body and put
  `Part of #<map>` at the top of the child body.
  Use `wayfinder:<type>` labels (`research`, `prototype`, `grilling`, `task`).
- **Frontier query**: list the map's open children, exclude those with open
  blockers or an assignee, and select the first in map order.
- **Claim**: `gh issue edit <n> --add-assignee @me`, the session's first write.
- **Resolve**: comment with the answer, close the child, then append a summary
  and link to the map's Decisions-so-far.
