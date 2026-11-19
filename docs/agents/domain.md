# Domain docs

How engineering skills should consume this repository's domain documentation
when exploring the codebase.

## Before exploring, read these

- `GLOSSARY.md` at the repository root.
- Relevant ADRs in `docs/adr/` at the repository root.

If these files do not exist, proceed without creating placeholders or proposing
upfront documentation work. The `/domain-modeling` skill, also reached through
`/grill-with-docs`, creates them lazily when terms or decisions are resolved.

## File structure

This is a single-context repository:

- `GLOSSARY.md`: shared domain vocabulary.
- `docs/adr/`: architecture decision records.
- `src/`: application code.

## Use the glossary's vocabulary

When naming a domain concept in an issue title, refactor proposal, hypothesis
or test name, use the term defined in `GLOSSARY.md`. Do not drift to synonyms
the glossary explicitly avoids.

If a needed concept is missing, reconsider whether it is established project
language or note the gap for `/domain-modeling`.

## Flag ADR conflicts

If a proposal contradicts an existing ADR, surface the conflict explicitly
rather than silently overriding the decision. Identify the ADR and explain
why reopening the decision may be worthwhile.
