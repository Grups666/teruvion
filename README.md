# Teruvion: Digital Earth Intelligence Platform

**Mission**: Transform research sources into living, explorable Earth object graphs.

---

## What is Teruvion?

Teruvion is a **multi-source research object graph platform** that decomposes papers, repositories, datasets, reports, and news into structured objects—Dataset, Method, Claim, Evidence, Region—and their relationships, then recomposes them into maps, evidence chains, workflows, and comparisons.

### Core Loop: Decomposition → Recomposition → Exploration

**Example**:
- **Decompose**: Nature paper on flood forecasting → extract datasets (ERA5-Land, GRDC), methods (LSTM ensemble), claims (AI matches GloFAS reliability), regions (global watersheds)
- **Recompose**: Generate map view showing all study regions, evidence chains linking claims to figures, workflow view of model pipeline
- **Explore**: System automatically tracks new papers, dataset updates, GitHub commits, and news events related to flood forecasting

---

## What We Are

- ✅ **Multi-source research object graph platform**
- ✅ **Evidence-grounded knowledge infrastructure**
- ✅ **Spatial/evidence/workflow exploration layer**
- ✅ **Automatic tracking and exploration system**

## What We Are NOT

- ❌ Literature summarizer (ChatPDF, Elicit)
- ❌ Citation manager (Zotero, Mendeley)
- ❌ GIS platform (ArcGIS, QGIS)
- ❌ Digital Twin (static asset replicas)
- ❌ Single-domain tool

---

## Architecture

### Unified Digital Earth Pipeline

```
Source Input (DOI/GitHub/URL/Title)
    ↓
Source Admission (research relevance + Digital Earth roles)
    ↓
Connector (fetch content + metadata)
    ↓
DigitalEarthDecomposer (two-phase extraction: metadata + LLM)
    ↓
TripleStore (entities + relations + provenance)
    ↓
Lens-based Recomposition (map/evidence/workflow/timeline views)
    ↓
Exploration Agent (automatic tracking)
```

### Five-Layer Ontology

| Layer | Purpose | Example Types |
|-------|---------|---------------|
| **Foundation** | Universal concepts | Entity, Claim, Evidence, Method, Process |
| **Source** | Information sources | Paper, Repository, Dataset, Report, News |
| **Capability** | Digital Earth capabilities | Dataset, Model, Sensor, Gauge, Policy |
| **World** | Earth system objects | Basin, Region, FloodEvent, Hazard, Risk |
| **Domain** | Specialized extensions | HydrologicalModel, ClimateScenario |

### Bridge Relations

Capability ↔ World connections:
- `covers`: Dataset → Basin (spatial coverage)
- `simulates`: Model → Basin (simulation domain)
- `observes`: Sensor → Variable (observation capability)
- `mitigates`: Intervention → Hazard (risk reduction)

---

## Core Features

### 1. Multi-Source Import
```bash
# Import a paper
node cli/teruvion.js ingest "10.1038/s41586-024-07145-8"

# Import a GitHub repo
node cli/teruvion.js ingest "https://github.com/google-research/flood-forecasting"

# Import by title
node cli/teruvion.js ingest "Global prediction of extreme floods"
```

### 2. Source Admission
Evaluates Digital Earth relevance before processing:
- **deep**: Full decomposition with bridge relations
- **structured**: Essential extraction (capabilities + world objects)
- **light**: Metadata only
- **reject**: Not Digital Earth-relevant

### 3. LLM-Enhanced Extraction
- Section-aware chunking for long documents
- Provenance with span positions (trace to original text)
- Bridge relation semantic judgment (not hardcoded)

### 4. Interactive Exploration
- `/explore` - Click entities → see connections
- Layer filtering (World / Capability / Source)
- "What can you do?" capability suggestions

### 5. Lens-based Views
- **Map Lens**: Spatial distribution of regions, coverage
- **Evidence Lens**: Claim → Figure → Method chains
- **Workflow Lens**: Method → Dataset → Model flow
- **Timeline Lens**: Evolution of understanding

---

## Installation

```bash
git clone https://github.com/Grups666/teruvion.git
cd teruvion
npm install
```

Create `_local/config/llm.local.jsonc` with your LLM API credentials:

```jsonc
{
  "apiKey": "your-api-key",
  "apiUrl": "https://api.example.com",
  "models": {
    "engineering": "claude-sonnet-4-6"
  },
  "integrations": {
    "github": { "token": "ghp_xxx" },
    "openAlex": { "apiKey": "xxx" }
  }
}
```

Optional: Create `_local/config/email.local.json` for email notifications:

```json
{
  "provider": "resend",
  "apiKey": "re_xxx",
  "from": "Teruvion <alpha@teruvion.com>",
  "adminEmail": "admin@example.com"
}
```

---

## Quick Start

```bash
# Start the API server
npm run server

# Start the frontend (in another terminal)
cd frontend && npm run dev

# Import a source
curl -X POST http://localhost:3000/api/import -H "Content-Type: application/json" -d '{"input":"10.1038/s41586-024-07145-8"}'

# View entities
curl http://localhost:3000/api/entities

# Explore an entity
curl http://localhost:3000/api/entities/{id}/explore
```

---

## API Reference

### Import
```
POST /api/import
Body: { "input": "DOI/URL/title" }
Returns: { projectId, status }
```

### Entities
```
GET /api/entities              # List all entities
GET /api/entities/:id          # Get single entity
GET /api/entities/:id/relations  # Get entity relations
GET /api/entities/:id/explore  # Full explore view
```

### Admission
```
POST /api/admission/evaluate   # Quick admission check
```

### Lenses
```
GET /api/lenses                          # List available lenses
GET /api/projects/:id/lens/:lensName     # Render specific lens
```

---

## Testing

```bash
# Run all tests
npm test

# Syntax check
npm run check
```

---

## Repository

`https://github.com/Grups666/teruvion`

---

## License

ISC

---

> **Decomposition reveals structure. Recomposition creates insight. Exploration discovers what's next.**
