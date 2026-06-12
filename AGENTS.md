# Teruvion Agent Guidance

Teruvion is a source-to-object-graph foundation engine for Digital Earth intelligence. This repository must stay generic, modular, and evidence-driven. It is not a one-paper demo, a publisher-specific scraper, or a fixed hydrology app.

## Current Runtime

```text
Input
  -> SourceAdmission
  -> ConnectorRegistry
  -> DigitalEarthDecomposer
  -> TripleStore
  -> ProjectRegistry
  -> LensRegistry
  -> REST API
  -> Next.js frontend
```

Current accepted inputs include DOI, paper title, paper URL, generic URL, dataset/report/news pages when a connector can handle them, and GitHub repository URLs.

## Core Rule: Generalize From Source Contracts

Do not implement features for a single paper, publisher, repository, screenshot, or domain example.

Build against durable contracts:

- source metadata
- structured sections
- figures and tables
- resources and links
- source coverage
- ontology entities and relations
- provenance and extraction mode
- lens output contracts

If a feature works only because the source is Nature, GitHub, Zenodo, floods, LSTM, or one known DOI, it is not foundation code. Put source-specific handling in a connector only when it exposes a generic normalized contract to the rest of the system.

## Ontology Rule

The ontology is a reasoning and organization layer, not the user-facing content itself.

The UI should reveal what the imported source is actually about: inputs, methods, models, workflows, evidence, figures, results, limitations, spatial/temporal context, and reusable resources. It should not mainly show internal labels such as extraction depth, object layer, fallback state, or ontology category unless those labels help the user judge reliability.

## Multi-Source Direction

Design every new capability so it can later handle multiple sources in one project:

- paper plus repository
- paper plus dataset
- report plus policy resource
- news plus event/context source
- multiple papers for comparison
- repository plus documentation and release artifacts

Project-level views should be able to aggregate evidence, routes, resources, and limitations across sources without rewriting core logic.

## Evidence And Fallbacks

- Never fabricate evidence.
- Preserve provenance for every extracted object, relation, figure, table, resource, and limitation where possible.
- Mark LLM failures, metadata-only results, source-text fallback, abstract-only content, missing source coverage, and inferred fields visibly.
- Static inspection is allowed; running untrusted remote code is not allowed without a separate sandbox and explicit approval.

## Modularity

Prefer stable extension points over one-off branches:

- connectors normalize source-specific retrieval
- admission evaluates relevance and depth
- decomposer turns normalized source contracts into objects
- ontology defines entity and relation vocabulary
- lenses recompose stored graphs for UI/API
- frontend renders project-level user meaning, not raw storage internals

Avoid hardcoded domain assumptions in foundation code. Domain examples are allowed in tests and fixtures, but they must not become the only path through the system.

## Agent Runtime

LLM-heavy work must go through `core/utils/llm.js`, which can route to `core/agents/AgentRuntime.js`.

Current providers:

- `api`: direct HTTP LLM API, the default.
- `claude-code`: non-interactive Claude Code-compatible CLI provider.

Do not call Claude Code directly from admission, connectors, decomposers, lenses, or UI code. Use the shared wrapper so the same source admission, decomposition, route extraction, visual explanation, limitation review, and future deep-analysis jobs can switch providers by configuration.

Claude Code is a harness for longer reasoning and structured extraction. It is not evidence and does not bypass schema validation, provenance requirements, fallback visibility, or safe-execution rules.

## Documentation

Keep public docs concentrated in:

- `docs/vision-and-strategy.md`
- `docs/architecture.md`
- `docs/object-model.md`
- `docs/paper-to-teruvion.md`
- `docs/verification.md`

Keep this file and `CLAUDE.md` aligned when project-level agent rules change.

## Configuration

Do not commit real secrets. Local-only configuration belongs in `_local/`, which must stay private.

The public configuration contract is environment variables such as:

- `ANTHROPIC_API_KEY`
- `ANTHROPIC_MODEL`
- `ANTHROPIC_BASE_URL`
- `GITHUB_TOKEN`
- `OPENALEX_API_KEY`
- `OPENALEX_EMAIL`
- `ADMIN_SECRET`

## Verification

After meaningful implementation changes, run:

```bash
npm run check
npm test
cd frontend && npm run build
```

Do not claim a feature is complete unless it is implemented, reachable, and verified.
