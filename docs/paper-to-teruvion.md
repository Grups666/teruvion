# Paper-to-Teruvion Pipeline

## Current Scope

Paper-to-Teruvion is currently implemented as part of the unified Digital Earth import pipeline. The public API does not expose separate lookup, inspect, extract, or compare endpoints. Instead, the system accepts a source through one import endpoint, runs admission, connector fetching, LLM-assisted decomposition, and storage, then exposes the resulting entities through project, entity, relation, and lens APIs.

Current source types:

- DOI
- paper title
- paper publisher URL
- GitHub repository URL

## Current Flow

```text
Input: DOI / Title / Paper URL / GitHub URL
  -> POST /api/import
  -> SourceAdmission
  -> ConnectorRegistry
     -> PaperConnector for DOI, title, or paper URLs
     -> GitHubConnector for GitHub repositories
  -> DigitalEarthDecomposer
  -> TripleStore
  -> ProjectRegistry
  -> LensRegistry
```

The pipeline is intentionally source-centric and object-centric. It stores extracted entities and relations rather than returning a single fixed PaperObject payload.

## Map And Regional Recomposition

Map visualization is a recomposition over the same source object graph, not a separate extraction path. When a paper, repository, report, dataset page, or other source exposes map-ready result geometry, feature properties, figures, tables, dataset links, or reusable resources, the decomposer preserves those as source-grounded objects and attachments.

`MapRecomposer` then separates:

- renderable spatial anchors and result features;
- data or resource leads that need review before display;
- figure/table evidence that can explain a mapped result;
- blocked candidates that would require future sandboxed code execution.

`MapVisualizationStrategy` builds the product-facing view plan. It chooses generic map modes such as classified regions, scaled points, routes/flows, or source overview; selects color, size, legend, metrics, time-series fields, and inspector fields from available properties; and validates optional LLM/agent hints against real fields before using them.

This means the agent can help decide how to present already-available result data, but it cannot invent missing geometry, run untrusted code, or bypass provenance and fallback visibility.

## Actual API Surface

### Import

```http
POST /api/import
Content-Type: application/json
```

```json
{
  "input": "10.1038/s41586-024-07145-8"
}
```

Returns a project id immediately while the background pipeline runs:

```json
{
  "success": true,
  "projectId": "project_...",
  "status": "importing"
}
```

### Project Status

```http
GET /api/projects
GET /api/projects/:projectId
GET /api/projects/:projectId/events
GET /api/projects/:projectId/decomposition
POST /api/projects/:projectId/cancel
```

These endpoints are the current way to inspect import progress, stored project metadata, decomposition output, and event history.

### Entities And Relations

```http
GET /api/entities
GET /api/entities/:id
GET /api/entities/:id/relations
GET /api/entities/:id/explore
GET /api/triples
GET /api/triples/:entityId
```

These endpoints expose the object graph produced by import. The system currently stores ontology entities such as source, dataset, method, claim, evidence, region, process, and related Digital Earth objects.

### Lenses

```http
GET /api/lenses
GET /api/projects/:projectId/lens/:lensName
```

Available lenses are provided by `LensRegistry`. Current lens output is derived from the stored graph; it is not a separate compare-object API.

### Admission

```http
POST /api/admission/evaluate
```

This performs the lightweight source relevance and processing-depth decision used by the import pipeline.

## Connectors

### PaperConnector

`PaperConnector` handles DOI, paper URLs, and title-like text. It uses OpenAlex metadata and `FullTextBroker` when full text is available. If only abstract-level content is available, the output should remain marked as limited by source coverage.

Current decomposition behavior:

- When full text is available, the decomposer can use source sections such as abstract, methods, data availability, and code availability.
- When LLM extraction succeeds, the project is marked as hybrid extraction.
- When LLM extraction is unavailable or empty, the system may create low-confidence `source-text-fallback` objects from explicit source sections.
- Source-text fallback objects are reviewable objects, not verified conclusions.
- Metadata, confidence, source-derived flags, and provenance notes are preserved into stored entities.

Configuration:

- `OPENALEX_API_KEY` is optional.
- `OPENALEX_EMAIL` is available for integrations that need a contact email.
- `_local/config/llm.local.jsonc` may provide local-only overrides, but public behavior should rely on environment variables.

### GitHubConnector

`GitHubConnector` handles `github.com/owner/repo` URLs. It reads repository metadata, README content, the repository tree, and selected small text files that help the decomposer understand dependencies, code entry points, paper references, and dataset notes.

Safety constraints:

- It performs static inspection only.
- It does not execute remote repository code.
- It skips inaccessible or large files.

Configuration:

- `GITHUB_TOKEN` is optional but recommended for rate limits.

## LLM Use

`core/utils/llm.js` reads configuration from environment variables first and optional local config second:

- `ANTHROPIC_API_KEY`
- `ANTHROPIC_MODEL`
- `ANTHROPIC_BASE_URL`
- `GITHUB_TOKEN`
- `OPENALEX_API_KEY`
- `OPENALEX_EMAIL`
- `TERUVION_AGENT_PROVIDER`
- `TERUVION_AGENT_COMMAND`
- `TERUVION_AGENT_ARGS`
- `TERUVION_AGENT_PROMPT_MODE`
- `TERUVION_AGENT_TIMEOUT` (defaults to `600000` ms for Claude Code-compatible long extraction jobs)
- `TERUVION_AGENT_FALLBACK_TO_API`

Agent provider options:

- `api`: direct HTTP LLM API, default.
- `claude-code`: route LLM-heavy calls through a Claude Code-compatible CLI.

The agent runtime sits behind the shared LLM wrapper, so admission, decomposition, route extraction, figure explanation, limitation review, and future deep-analysis jobs can switch providers without business modules calling Claude Code directly.

If the LLM is unavailable, callers must surface the failure or fall back explicitly. The system should not silently label speculative extraction as verified.

The frontend should display this distinction. A source-text fallback project means the system found usable source text, but deep semantic extraction was not available enough to produce a richer graph.

## Reproducibility Status

The current code supports provenance, verification state, and graph inspection, but there is not yet a standalone `/api/github/inspect` reproducibility endpoint. Any documentation or UI should describe reproducibility as graph/provenance state unless a dedicated static checker endpoint is reintroduced.

Future static reproducibility checks should remain read-only and may inspect:

- README
- license
- dependency files
- notebooks
- scripts
- data or data instructions
- Dockerfile
- run instructions

Suggested grades remain:

| Grade | Meaning |
|-------|---------|
| A | likely runnable |
| B | partially runnable |
| C | code/data incomplete |
| D | description only |
| E | insufficient information |

Do not claim runnable status without evidence.

## Removed Legacy Contract

Earlier MVP notes mentioned these separate endpoints:

- `POST /api/paper/lookup`
- `POST /api/github/inspect`
- `POST /api/object/extract`
- `POST /api/object/compare`

They are not part of the current API. Use `/api/import`, project APIs, entity APIs, and lens APIs as the current contract.

## Limitations

- OpenAlex coverage may be incomplete.
- Full text is not guaranteed.
- GitHub import is static inspection only.
- Compare behavior is currently lens/graph based, not a dedicated object comparison endpoint.
- Automatic monitoring and Exploration Agent behavior are future-stage concepts, not current runtime behavior.
