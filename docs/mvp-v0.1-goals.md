# MVP v0.1 Goals: Deep Decomposition for Digital Earth

## Vision

Build the **research-source layer of Digital Earth** — proving that a single source (paper + GitHub) can be reliably decomposed into high-quality Earth objects, enabling spatial exploration, evidence tracking, and workflow understanding.

## Digital Earth Context

Teruvion's ultimate mission is to build a living Digital Earth for understanding, exploring, and governing the planet. v0.1 is the **Deep Decomposition Engine** that proves the foundation works:

| Layer | Goal | Status |
|-------|------|--------|
| **Layer 1: Research Source** | Decompose sources into Earth objects | **Alpha v0.1** |
| **Layer 2: Earth System Graph** | Multi-source aggregation per region | Year 1-3 |
| **Layer 3: Digital Earth Intelligence** | Agentic monitoring, action support | Year 5+ |

## Core Capabilities

### 1. Three-Layer Ontology
- **Core Layer**: 14 universal entities (Source, Entity, Claim, Evidence, Data, Method, Process, Event, System, Location, Time, Result, Metric, Uncertainty)
- **Source-Type Layer**: Paper, Code, Dataset, Report, News, ResearchQuestion, Hypothesis, Theory, Figure, Model, Experiment, Workflow, Region, TimeRange
- **Domain Layer**: Hydrology (Basin, Watershed, Gauge, Streamflow, FloodEvent), Machine Learning (NeuralNetwork, TrainingRun), Policy (Institution, Regulation)

### 2. Source Admission
Evaluate sources before processing:
- Research relevance (0-1 score)
- Information density assessment
- Evidence potential evaluation
- Processing depth decision: deep | structured | light | reject

### 3. Deep Decomposition
- FullTextBroker: Fetch full text (or mark abstract-only)
- LLM extraction: Objects with provenance (section trace)
- EntityMapper: Map understanding to ontology entities
- TripleBuilder: Build evidence chains and relationships

### 4. Lens-based Recomposition
- **Map Lens**: Render regions, basins, gauges, coverage as GeoJSON
- **Evidence Lens**: Build claim-evidence chains with confidence
- **Workflow Lens**: Trace method → dataset → model → result flow
- **Timeline Lens**: Extract temporal evolution (years, time ranges)
- **Comparison Lens**: Side-by-side entity comparison

### 5. Spatial Object Rendering
- Regions with bbox → Polygon conversion
- Dataset coverage visualization
- Basin/Watershed/Gauge support
- Global bounds calculation

### 6. Quality Gates
- Abstract-only sources labeled clearly
- Claims must have evidence chains
- Confidence scores never artificially high
- Source section spans shown
- No hallucination: uncertain objects marked

## Non-Goals for MVP

This MVP explicitly does NOT include:
- User authentication or multi-user support
- Cloud deployment or SaaS infrastructure
- Automated code execution
- Full Layer 2 aggregation (multi-source projects)
- Real-time Exploration Agent
- Full Digital Earth Intelligence

## Success Criteria

MVP v0.1 is complete when:

1. ✅ Three-layer ontology implemented and tested
2. ✅ TripleStore with persistence, ID generation, verification state
3. ✅ Source Admission with relevance/density/potential evaluation
4. ✅ EntityMapper + TripleBuilder connecting understanding to store
5. ✅ 5 lenses (map, evidence, workflow, timeline, comparison) rendering
6. ✅ API endpoints for lenses, ontology, admission
7. Full decomposition pipeline tested (paper → objects → lenses)
8. Quality gates implemented and verified
9. All tests pass (`npm test`)
10. Documentation updated for Digital Earth framing

## Architecture Principles

All implementation follows Teruvion core principles:

- **Object-Centric**: Define entities + relations, don't hardcode workflows
- **Code is Infrastructure**: Code stores/retrieves; LLM understands/extracts
- **Three-Layer Ontology**: Core + Source-Type + Domain extensions
- **Source Admission**: Evaluate before processing
- **Evidence Provenance**: Every object traces to source section
- **Adaptive Schemas**: LLM decides structure based on source type
- **Quality Gates**: Claims have evidence; no hallucination

## Vertical Domain

**Earth science / Hydrology / Climate AI**

Natural fit:
- Papers with spatial context (regions, basins)
- Datasets with coverage (ERA5-Land, GRDC)
- Models with workflow (LSTM, GloFAS)
- Events with location (floods, droughts)

High value:
- Spatial relevance for Digital Earth
- Evidence chains linking claims to validation
- Multi-source integration potential

## Example Benchmark

**Google Flood Forecasting Paper**

Expected decomposition:
- Paper → source entity with metadata
- Datasets → ERA5-Land (input), GRDC (target), GloFAS (baseline)
- Methods → LSTM ensemble, ensemble post-processing
- Regions → Global, 80+ countries, specific basins
- Claims → "AI matches GloFAS reliability", "20-year return period"
- Evidence → Figure 2 (validation), Figure 3 (skill scores)

Expected lenses:
- Map → Global coverage, basin boundaries
- Evidence → Claims linked to figures and data
- Workflow → LSTM → ERA5 → GloFAS → GRDC flow
- Timeline → 2018-2021 development period

## Timeline

This is the foundation implementation. Focus on:
- Correct ontology architecture
- Reliable decomposition pipeline
- Working lens recomposition
- Quality gate verification

Not on:
- Feature breadth
- UI polish
- Performance optimization