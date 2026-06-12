# Teruvion Project Guidance

Teruvion is a Digital Earth foundation engine. The current repository implements a source-to-object-graph pipeline, not the full long-term Digital Earth platform.

## Current Goal

Keep the foundation small, object-centric, traceable, and verifiable.

Current runtime focus:

- import a DOI, paper title, paper URL, or GitHub repository URL
- evaluate whether the source is relevant
- fetch metadata or repository context through connectors
- decompose the source into ontology-grounded entities and relations
- store results in `TripleStore`
- inspect results through project, entity, relation, and lens APIs
- render useful frontend exploration views over the stored graph

## Current Architecture

```text
Input
  -> SourceAdmission
  -> ConnectorRegistry
     -> PaperConnector
     -> GitHubConnector
  -> DigitalEarthDecomposer
  -> TripleStore
  -> ProjectRegistry
  -> LensRegistry
```

The actual API contract is documented in `README.md`, `docs/architecture.md`, and `docs/paper-to-teruvion.md`.

## Do Not Assume These Exist

The current server does not expose these older MVP endpoints:

- `POST /api/paper/lookup`
- `POST /api/github/inspect`
- `POST /api/object/extract`
- `POST /api/object/compare`

Do not build new code or docs around those endpoints unless the task explicitly reintroduces them.

## Documentation Structure

Keep public docs concentrated in:

- `docs/vision-and-strategy.md`
- `docs/architecture.md`
- `docs/object-model.md`
- `docs/paper-to-teruvion.md`
- `docs/verification.md`

Avoid reintroducing multiple overlapping roadmap or positioning documents. If strategy changes, update `vision-and-strategy.md`; if implementation changes, update `architecture.md` or `paper-to-teruvion.md`.

## Foundation Principles

- Keep core logic decoupled from any one domain.
- Do not implement source understanding for one paper, one publisher, one repository, or one screenshot. Generalize from normalized source contracts.
- Source-specific handling belongs inside connectors and must return generic metadata, sections, figures, tables, resources, provenance, and coverage to the rest of the system.
- Treat papers, repositories, datasets, methods, regions, claims, evidence, workflows, and resources as inspectable objects.
- Prefer stable protocols and extension points over one-off feature paths.
- Preserve provenance and uncertainty.
- Never fabricate evidence.
- Never execute untrusted remote repository code by default.
- Mark fallback, partial, inferred, or abstract-only results clearly.
- Keep `_local/` private and out of Git.

## Multi-Source And Ontology Rules

Teruvion must evolve toward multi-source projects, not single-source demos. New features should work for paper plus repository, paper plus dataset, report plus policy resource, news plus event context, and multiple comparable sources without rewriting foundation logic.

The ontology is an internal reasoning and organization layer. User-facing views should reveal the imported source's real content: inputs, methods, models, workflows, figures, evidence, results, limitations, spatial/temporal context, and reusable resources. Do not make the UI primarily display internal ontology labels, extraction depth, or fallback mechanics unless they help the user judge reliability.

Build against durable contracts:

- source metadata
- structured sections
- figures and tables
- resources and links
- source coverage
- ontology entities and relations
- provenance and extraction mode
- lens output contracts

## Configuration

Use environment variables as the public contract:

- `ANTHROPIC_API_KEY`
- `ANTHROPIC_MODEL`
- `ANTHROPIC_BASE_URL`
- `GITHUB_TOKEN`
- `OPENALEX_API_KEY`
- `OPENALEX_EMAIL`
- `PORT`
- `ADMIN_SECRET`

Local-only overrides may live in `_local/config/llm.local.jsonc`.
The alpha admin secret may also live in `_local/config/admin.local.json`:

```json
{
  "adminSecret": "replace-with-a-long-random-secret"
}
```

Admin routes must require the `x-admin-secret` header and must fail closed when no secret is configured.

## Development Rules

- Use current code as the source of truth.
- Keep docs aligned with implemented APIs.
- Remove unused legacy modules instead of preserving dead abstractions.
- Do not commit real secrets.
- Run `npm test`, `npm run check`, and frontend build checks after meaningful changes.
- If a feature is future work, label it as future work rather than implemented behavior.

## Active Repository

`https://github.com/Grups666/teruvion`
