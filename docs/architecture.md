# Teruvion Architecture

## Current System

Teruvion currently implements a source-to-object-graph foundation.

```text
Input
  -> SourceAdmission
  -> ConnectorRegistry
     -> PaperConnector
     -> GitHubConnector
     -> GeoJSONConnector
     -> URLConnector
  -> DigitalEarthDecomposer
  -> TripleStore
  -> ProjectRegistry
  -> LensRegistry
  -> REST API
  -> Next.js frontend
```

The current runtime accepts DOI, paper title, paper URL, generic URL, GitHub repository inputs, and GeoJSON data URLs when a connector can normalize them. It stores entities and relations rather than returning only prose summaries.

## Runtime Components

- `src/server/api.js`: REST API and server route wiring.
- `src/server/digital-earth-importer.js`: background import pipeline.
- `core/admission`: source relevance, role, and depth evaluation.
- `core/connectors`: source-specific fetching and static inspection.
- `core/understanding/DigitalEarthDecomposer.js`: metadata, source-text, and LLM-assisted decomposition.
- `core/registry/TripleStore.js`: entity and relation storage.
- `core/project/Project.js`: import project state.
- `core/events/EventLog.js`: import event history.
- `core/lenses`: recomposed graph views such as map, evidence, workflow, timeline, and comparison.
- `core/project/ProjectRecomposer.js`: source-grounded project detail recomposition.
- `core/project/MapRecomposer.js`: source-grounded map visualization recomposition.
- `core/project/MapVisualizationStrategy.js`: product-facing map view planning over renderable features, attached result fields, evidence, resources, and agent hints.
- `core/project/RecompositionSemantics.js`: shared display primitives and labels used by recomposition modules.
- `core/presentation`: API-facing serialization helpers.
- `frontend`: interactive project, map, object, and alpha admin UI.

## Implemented API Shape

The implemented contract is unified import plus graph inspection:

```text
POST /api/import
GET  /api/projects
GET  /api/projects/:projectId
GET  /api/projects/:projectId/events
GET  /api/projects/:projectId/decomposition
POST /api/projects/:projectId/cancel

GET  /api/entities
GET  /api/entities/:id
GET  /api/entities/:id/relations
GET  /api/entities/:id/explore

GET  /api/triples
GET  /api/triples/:entityId

POST /api/admission/evaluate
GET  /api/lenses
GET  /api/projects/:projectId/lens/:lensName
```

The current server does not expose legacy standalone endpoints such as `/api/paper/lookup`, `/api/github/inspect`, `/api/object/extract`, or `/api/object/compare`.

## Extraction Modes

The decomposer can produce objects through several modes:

- `hybrid`: LLM extraction plus metadata/fallback support.
- `source-text-fallback`: explicit source sections produced reviewable objects when LLM extraction is unavailable or empty.
- `metadata`: connector metadata only.
- `none`: rejected source or no extraction.

Fallback modes must stay visible in project and object UI. The system should not present fallback output as verified intelligence.

## Agent Runtime

All LLM-heavy code should route through `core/utils/llm.js`. That wrapper now delegates to a switchable agent runtime before falling back to the direct HTTP LLM API.

Configured providers:

- `api`: default direct LLM API path.
- `claude-code`: non-interactive Claude Code-compatible CLI provider.

The provider is selected through environment variables or `_local/config/llm.local.jsonc`:

```bash
TERUVION_AGENT_PROVIDER=api
TERUVION_AGENT_PROVIDER=claude-code
TERUVION_AGENT_COMMAND=claude
TERUVION_AGENT_ARGS="-p --dangerously-skip-permissions"
TERUVION_AGENT_PROMPT_MODE=argument
TERUVION_AGENT_FALLBACK_TO_API=true
```

This runtime is intentionally below admission, decomposition, route extraction, limitation review, and future deep-analysis jobs. Business modules should not call Claude Code directly. They should call the shared LLM wrapper and let the configured agent provider decide how to execute the work.

Claude Code should be treated as a deep-analysis harness, not as a trusted source of evidence. Its outputs must still pass schema parsing, provenance checks, and visible fallback/error reporting.

## Design Principles

- **Object-centric**: sources become typed objects and relations.
- **Evidence-first**: preserve source, provenance, confidence, coverage, and verification state.
- **Single decomposition, multiple recompositions**: source decomposition is the shared base. Project detail views, map visualizations, lenses, and future panels should be independent recomposition modules over the same ontology-grounded objects rather than separate extraction paths.
- **Shared recomposition language**: detail, map, and future recomposition modules may assemble different views, but they must reuse the same stable terms for display primitives, evidence state, source identity, and provenance boundaries.
- **Map view planning as recomposition**: map and regional views should consume renderable spatial features, properties, figures, tables, resources, and provenance from the shared graph. They may accept LLM/agent hints for fields such as color, size, time series, and inspector focus, but those hints must be validated against available source-grounded fields before the frontend uses them.
- **Small core**: keep the foundation generic; push domain-specific behavior into ontology extensions, connectors, lenses, or future modules.
- **Multi-source by design**: project views and extraction protocols should support paper plus repository, paper plus dataset, report plus policy resource, news plus event context, and multiple comparable sources without special-case rewrites.
- **Normalized source contracts**: source-specific retrieval belongs in connectors; downstream code should consume normalized metadata, sections, figures, tables, resources, provenance, and coverage.
- **No silent fallback**: unavailable LLMs, abstract-only content, missing keys, and partial source coverage must be visible.
- **Static by default**: inspect remote repositories; do not execute untrusted code.
- **Model-agnostic**: treat LLMs as soft intelligence providers, not the durable product asset.
- **Code as hard link, LLM as soft link**: code defines protocols, storage, UI states, and verification boundaries; LLMs assist extraction and synthesis inside those boundaries.

## Generality Boundary

Foundation code must not be tuned to one article, publisher, repository, dataset host, or research domain. A connector may contain source-specific retrieval details, but only if it normalizes the result into reusable contracts for the decomposer and lenses.

Examples and fixtures can mention specific domains or sources, but production paths should answer the same generic questions:

- What source material is available?
- What structured sections, figures, tables, resources, and links were found?
- What objects and relations can be extracted with provenance?
- Which parts are verified, inferred, fallback, or missing?
- How can multiple sources be compared or merged inside one project?
- Which source-grounded results are map-ready now, which are only dataset/resource leads, and which would require future sandboxed execution?

## Extension Direction

The current codebase no longer has the old Tereon map-module manifest runtime. Future extension work should build on the current object graph architecture instead of reviving stale map-layer assumptions.

Likely extension points:

- connector interface for new source types
- ontology entity and relation registration
- decomposer extraction protocols
- lens registration
- review action builders
- future watchlist and monitoring task definitions

Extensions should declare what objects, relations, provenance, and lenses they add.

## Safety Boundary

Teruvion may inspect:

- repository metadata
- README and documentation
- dependency files
- notebooks and scripts as text
- dataset availability notes
- source text and metadata

Teruvion must not automatically run untrusted remote code without a separate sandbox architecture and explicit approval.
