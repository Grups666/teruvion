# Teruvion

Teruvion is a Digital Earth foundation engine for turning research sources into inspectable object graphs.

Current focus: import papers, paper titles, DOI references, and GitHub repositories; decompose them into ontology-grounded entities and relations; then inspect the results through project, entity, relation, and lens APIs.

Teruvion is not trying to replace Google Earth, Cesium, ArcGIS, QGIS, Zotero, or literature summarizers. Its core difference is objectization: sources become traceable research objects, evidence chains, workflows, spatial entities, and comparisons that can be inspected and recomposed.

## Current Architecture

```text
Source input (DOI / title / paper URL / GitHub URL)
  -> SourceAdmission
  -> ConnectorRegistry
  -> DigitalEarthDecomposer
  -> TripleStore
  -> ProjectRegistry
  -> LensRegistry
```

Main runtime components:

- `src/server/api.js`: Express API surface.
- `src/server/digital-earth-importer.js`: unified import pipeline.
- `core/connectors/PaperConnector.js`: DOI, paper URL, and title import through OpenAlex and full-text fallback.
- `core/connectors/GitHubConnector.js`: static GitHub repository inspection.
- `core/understanding/DigitalEarthDecomposer.js`: LLM-assisted source decomposition.
- `core/registry/TripleStore.js`: entity and relation storage.
- `core/lenses`: recomposed views over stored graph data.
- `frontend`: Next.js frontend for interactive exploration.

## What Is Implemented Now

- Unified source import through `POST /api/import`.
- Paper metadata import through OpenAlex-backed `PaperConnector`.
- GitHub repository metadata, README, tree, and key-file inspection.
- Source admission before decomposition.
- Entity and relation storage in `TripleStore`.
- Project status, events, cancellation, export, and decomposition lookup.
- Lens-based recomposition for graph views.
- Frontend exploration of imported projects and entities.

## Not Current Runtime Features

These are product directions or previous MVP notes, not current API contracts:

- automatic research monitoring
- real-time Exploration Agent
- cloud deployment
- user accounts
- automatic execution of remote GitHub code
- standalone `/api/paper/lookup`, `/api/github/inspect`, `/api/object/extract`, or `/api/object/compare` endpoints

Use `docs/paper-to-teruvion.md` for the current Paper-to-Teruvion pipeline contract.

## Configuration

Environment variables are the public configuration contract:

```bash
ANTHROPIC_API_KEY=
ANTHROPIC_MODEL=claude-3-5-sonnet-latest
ANTHROPIC_BASE_URL=https://api.anthropic.com
GITHUB_TOKEN=
OPENALEX_API_KEY=
OPENALEX_EMAIL=
PORT=3000
ADMIN_SECRET=
```

Local private overrides can also be stored in `_local/config/llm.local.jsonc`. `_local/` is ignored by Git and must not be committed.

For the alpha admin UI, configure a long random admin secret through `ADMIN_SECRET` or a local-only file:

```json
{
  "adminSecret": "replace-with-a-long-random-secret"
}
```

Save that as `_local/config/admin.local.json`, or add `adminSecret` to `_local/config/llm.local.jsonc`. Admin routes require the `x-admin-secret` header.

## Install

```bash
git clone https://github.com/Grups666/teruvion.git
cd teruvion
npm install
cd frontend
npm install
```

## Run

Start the API server:

```bash
npm run server
```

Start the frontend in another terminal:

```bash
cd frontend
npm run dev
```

Import a source:

```bash
curl -X POST http://localhost:3000/api/import ^
  -H "Content-Type: application/json" ^
  -d "{\"input\":\"10.1038/s41586-024-07145-8\"}"
```

Inspect stored entities:

```bash
curl http://localhost:3000/api/entities
```

## API Surface

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

## Test

```bash
npm test
npm run check
cd frontend
npm run build
```

Alpha email/admin smoke test on a configured host:

```bash
npm run test:email
node scripts/test-alpha-apply.js
```

## Repository

Active repository: `https://github.com/Grups666/teruvion`

## License

ISC
