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

If the LLM is unavailable, callers must surface the failure or fall back explicitly. The system should not silently label speculative extraction as verified.

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
