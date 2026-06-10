# Teruvion: Digital Earth Research Layer

**Mission**: Build a living Digital Earth for understanding, exploring, and governing the planet.

---

## What is Teruvion?

Teruvion is the **research-source layer of Digital Earth** — a platform that transforms multi-source research knowledge into a structured Earth object graph, enabling spatial exploration, evidence tracking, workflow understanding, and continuous monitoring.

### What We Are NOT
- ❌ Literature summarizer (ChatPDF, Elicit)
- ❌ Citation manager (Zotero, Mendeley)
- ❌ GIS platform (ArcGIS, QGIS)
- ❌ Digital Twin (static asset replicas)
- ❌ Single-domain tool

### What We ARE
- ✅ **Multi-source Earth object graph platform**
- ✅ **Evidence-grounded knowledge infrastructure**
- ✅ **Spatial/evidence/workflow exploration layer**
- ✅ **Automatic Earth system monitoring**

---

## Why Digital Earth?

The Earth is a complex system of interactions:
- **Water** flows through basins, glaciers, aquifers, atmosphere
- **Climate** drives floods, droughts, heatwaves, sea-level rise
- **Ecosystems** respond to human activity and natural cycles
- **Human systems** depend on and modify all of these

Understanding this system requires:
1. **Multi-source knowledge**: Papers, datasets, models, reports, news
2. **Structured objects**: Not documents, but entities and relationships
3. **Evidence chains**: Traceable from claim to source
4. **Spatial grounding**: Where things happen, how they connect
5. **Continuous monitoring**: What's changing, what's new

Teruvion provides the object graph layer that makes this possible.

---

## Four Core Objectives

| Objective | What it Means | Teruvion Contribution |
|-----------|---------------|----------------------|
| **Understand Earth Systems** | How water cycles, how climate drives events, how ecosystems respond | Decompose research into Basin, ClimateModel, FloodEvent, Ecosystem objects |
| **Monitor Earth Resources** | Water availability, glacier mass balance, land use change | Track datasets (GRDC, ERA5), models ( GloFAS), observations (satellite) |
| **Predict Earth Risks** | Floods, droughts, heatwaves, sea-level rise | Evidence chains linking prediction methods to validation data |
| **Support Earth Action** | Early warning, infrastructure planning, policy design | Workflow lens showing how research informs decisions |

---

## Core Method: Decompose → Recompose → Explore

### Decomposition
Transform heterogeneous sources into Earth objects:

| Source | Extracted Objects |
|--------|------------------|
| Paper | Claims, Methods, Datasets, Regions, Evidence |
| GitHub repo | Models, Workflows, APIs, Dependencies |
| Dataset | Variables, Coverage, Access methods |
| Report | Assessments, Recommendations, Indicators |
| News | Events, Actors, Claims |

Each object is evidence-grounded and traceable to source section.

### Recomposition
Assemble objects into explorable views:

| Lens | Purpose |
|------|---------|
| **Map** | Spatial distribution of regions, datasets, events, coverage |
| **Evidence** | Claim → Figure → Method → Data chains with confidence |
| **Workflow** | Method → Dataset → Model → Result flow |
| **Timeline** | Evolution of methods, datasets, understanding |
| **Comparison** | Side-by-side method/dataset/result analysis |

### Exploration
Automatic tracking and discovery:
- Monitor new papers on tracked regions/topics
- Track dataset version updates (ERA5, GloFAS)
- Watch model repository commits
- Detect news events and policy changes
- Find new connections between sources
- Alert on contradictions or opportunities

---

## Three-Layer Roadmap

```
Layer 1: Research Source Layer (Current Alpha)
  ├─ Decompose papers, code, datasets, reports, news
  ├─ Store as Earth object graph
  ├─ Evidence chain tracking
  └─ Lens-based recomposition

Layer 2: Earth System Object Graph (Year 1-3)
  ├─ Domain-specific adapters (hydrology, climate, ecology)
  ├─ Multi-source aggregation per region/topic
  ├─ Cross-domain connections (water-climate-human)
  └─ Quality gates and provenance

Layer 3: Digital Earth Intelligence (Year 5+)
  ├─ Agentic exploration (automatic monitoring)
  ├─ Prediction integration (model outputs as objects)
  ├─ Action support (decision workflows)
  └─ Governance interface (policy evidence chains)
```

**Current Alpha**: We are proving that a single source (paper + GitHub) can be reliably decomposed into high-quality Earth objects.

---

## Architecture

### Source Flow
```
Input (DOI/GitHub/URL/Title)
    ↓
Source Admission (research relevance check)
    ↓
Source Adapter (paper/GitHub/report/news/dataset)
    ↓
FullTextBroker (fetch full text or fallback)
    ↓
LLM Decomposition (extract objects with provenance)
    ↓
TripleStore (entities + relations)
    ↓
Project (organize into research graph)
    ↓
Lens-based Recomposition (map/evidence/workflow views)
    ↓
Exploration Agent (automatic tracking)
```

### Three-Layer Ontology

**Core Layer**: 14 universal entities
- Source, Entity, Claim, Evidence, Data, Method, Process, Event, System, Location, Time, Result, Metric, Uncertainty

**Source-Type Layer**: Extensions for source types
- Paper, Code (GitHub), Dataset, Report, News
- ResearchQuestion, Hypothesis, Theory (extends Claim)
- Figure (extends Evidence), Model (extends Method)
- Experiment, Workflow (extends Process)
- Region (extends Location), TimeRange (extends Time)

**Domain Layer**: Optional extensions
- **Hydrology**: Basin, Watershed, Gauge, Streamflow, FloodEvent, HydrologicalModel
- **Machine Learning**: NeuralNetwork, TrainingRun, Benchmark, Checkpoint
- **Policy**: Institution, Regulation, Stakeholder, Impact

---

## Differentiation from GIS & Digital Twin

### vs. GIS (ArcGIS, QGIS, Earth Engine)
- **GIS** focuses on: Geographic data layers, spatial analysis, map rendering
- **Teruvion** focuses on: Research objects, evidence chains, workflow understanding
- **Key difference**: We are research-aware, not just geo-aware. Our spatial objects carry claims, methods, provenance.

### vs. Digital Twin (static replicas)
- **Digital Twin** focuses on: Asset replicas, real-time monitoring, operational control
- **Teruvion** focuses on: Research knowledge graph, evidence tracking, scientific understanding
- **Key difference**: We connect knowledge to action, not just sensors to dashboards. Our objects are evidence-grounded claims, not just measurements.

---

## Current Stage: Alpha v0.1

**Goal**: Prove that a single source can be reliably decomposed into high-quality Earth objects.

**Success Criteria**:
- Full text acquisition (or clear abstract-only labeling)
- Dataset roles correctly inferred (not hardcoded)
- Methods with technical details (not generic names)
- Claims with evidence chains
- Each object traceable to source section
- Spatial objects extracted and mapped

**Vertical Domain**: Earth science / hydrology / climate
- Natural fit: paper + dataset + model + region + event
- High value: spatial relevance, evidence chains, multi-source integration

---

## Core Principles

1. **Object-Centric**: Define what exists (entities + relations), don't hardcode workflows
2. **Code is Infrastructure**: Code stores/retrieves/render; LLM understands/extracts/judges
3. **Three-Layer Ontology**: Core + Source-Type + Domain extensions
4. **Source Admission**: Not everything enters; evaluate relevance and depth
5. **Evidence Provenance**: Every object traces to source section
6. **Adaptive Schemas**: Let LLM decide structure based on source type
7. **Quality Gates**: Claims must have evidence; no hallucination

---

## Installation

```bash
npm install
```

Create `_local/config/llm.local.jsonc` with your LLM API credentials.

---

## Quick Start

```bash
# Import a paper by DOI
node cli/teruvion.js ingest "10.1038/s41586-021-03275-y"

# Import a GitHub repository
node cli/teruvion.js ingest "https://github.com/google-research/flood-forecasting"

# List entities
node cli/teruvion.js list --type Region

# Query relationships
node cli/teruvion.js query paper-xxxxx uses
```

---

## Repository

Active: `https://github.com/Grups666/teruvion`

---

## Final Principle

> **Decomposition reveals structure. Recomposition creates insight. Exploration discovers what's next.**

We build the object graph layer of Digital Earth — where research knowledge becomes structured, traceable, and alive.