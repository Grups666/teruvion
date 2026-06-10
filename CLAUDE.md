# Teruvion: Research Intelligence Platform

**Mission**: Transform research from linear documents into living, explorable object graphs.

**Vision**: Research Intelligence OS for Digital Earth.

---

## What It Is

Teruvion is a **multi-source research object graph platform** that decomposes papers, repos, datasets, reports, and news into structured objects—Dataset, Method, Claim, Evidence, Region—and their relationships, then recomposes them into maps, evidence chains, workflows, and comparisons.

**Core Loop**: **Decomposition → Recomposition → Exploration**

**Example**:
- **Decompose**: Nature paper on flood forecasting → extract datasets (ERA5-Land, GRDC), methods (LSTM ensemble), claims (AI matches GloFAS reliability), regions (global watersheds)
- **Recompose**: Generate map view showing all study regions, evidence chains linking claims to figures, workflow view of model pipeline
- **Explore**: System automatically tracks new papers, dataset updates, GitHub commits, and news events related to flood forecasting

---

## Product Positioning

**Teruvion = Research Intelligence OS built on a living research object graph**

We are NOT:
- ❌ A literature summarizer (ChatPDF/Elicit style)
- ❌ A citation manager (Zotero/Mendeley style)
- ❌ A GIS platform (ArcGIS/QGIS style)
- ❌ A single-domain tool

We ARE:
- ✅ A multi-source research object graph platform
- ✅ Evidence-grounded knowledge infrastructure
- ✅ Spatial/evidence/workflow exploration layer
- ✅ Automatic tracking and exploration system

**Analogy** (internal use only):
Like Palantir Foundry's ontology for enterprise data, but for research sources. We integrate heterogeneous research information into an ontology-grounded object graph and enable exploration, monitoring, and recomposition.

**Better external positioning**:
> Teruvion turns papers, repositories, datasets, reports, and news into a living research object graph, used for map-based exploration, evidence tracking, workflow understanding, comparison analysis, and automatic monitoring.

---

## Core Principles

### 1. Object-Centric, Not Process-Centric
Define what exists (entities + relations). Don't hardcode how they interact. Let LLM + user needs determine workflows.

### 2. Code is Infrastructure, Not Intelligence
- **Code does**: define ontology, store entities, fetch content, expose API, render UI
- **LLM does**: understand semantics, extract objects, judge relevance, verify claims
- **Never**: regex/keyword matching for semantic tasks, hardcoded domain logic

### 3. Three-Layer Ontology
- **Core Ontology**: Universal entities (Source, Entity, Claim, Evidence, Data, Method, Process, Event, System, Location, Time, Result, Metric, Uncertainty)
- **Source-type Ontology**: Extensions for paper/GitHub/report/news/dataset
- **Domain Ontology**: Optional extensions for hydrology/ML/policy

### 4. Source Admission
Not everything enters the platform. Evaluate:
- Research relevance (0-1)
- Information density
- Evidence potential
- Processing depth: deep | structured | light | reject

### 5. Evidence Provenance
Every object must trace back to source section:
```javascript
{
  "name": "ERA5-Land",
  "source_section": "Methods - Input data",
  "confidence": 0.93,
  "content_level": "full_text"
}
```

### 6. Adaptive Schemas
Let LLM decide structure based on source type and research domain. Don't force GitHub to have Methods, don't force news to have Datasets.

### 7. Quality Gates
- Abstract-only sources cannot generate fine-grained objects
- Claims must have evidence
- No hallucination: if source doesn't support object, mark as uncertain

---

## Architecture

### Source Flow
```
User Input (DOI/GitHub/URL/Title)
    ↓
Source Admission (research relevance check)
    ↓
Source Adapter (paper/GitHub/report/news/dataset)
    ↓
FullTextBroker (fetch full text or fallback to abstract)
    ↓
LLM Decomposition (extract objects with provenance)
    ↓
TripleStore (store entities + relations)
    ↓
Project (organize into research graph)
    ↓
Lens-based Recomposition (map/evidence/workflow/timeline views)
    ↓
Exploration Agent (automatic tracking and discovery)
```

### Layers

**Layer 1: Source Library**
- Collect papers, repos, datasets, reports, news
- Manage versions, provenance, credibility
- Similar to Zotero but multi-source

**Layer 2: Research Object Graph**
- Core entities + source-specific extensions
- Evidence chains, spatial objects, workflows
- This is the platform's "Palantir ontology" layer

**Layer 3: Interactive Lenses**
- Map lens (spatial view)
- Evidence lens (claim-evidence chains)
- Workflow lens (method/data/model flow)
- Timeline lens (evolution over time)
- Comparison lens (side-by-side analysis)
- System lens (architecture/dependencies)

**Layer 4: Exploration Agent**
- Automatic source hooking
- New paper tracking
- Dataset update monitoring
- GitHub commit watching
- News event detection
- Connection discovery

---

## Current Stage: Deep Decomposition MVP

**Goal**: Prove that a single paper/repo can be reliably decomposed into a high-quality research object graph.

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

## User Questions to Answer

1. **What does it study?** (problem, contribution, claims)
2. **Is it spatially relevant?** (regions, basins, coverage)
3. **What data and methods?** (datasets with roles, methods with details)
4. **What evidence supports claims?** (evidence chains)
5. **Can I visualize it?** (map, workflow, timeline)
6. **What's been extracted?** (object browser)
7. **What's missing/uncertain?** (quality indicators)
8. **What's new?** (automatic tracking)

---

## Development Guidelines

- **No pattern matching**: If it's semantic, use LLM
- **No hardcoded schemas**: Let LLM decide structure
- **No premature generalization**: Start with Earth science, prove quality first
- **Always show provenance**: Every object must link to source
- **Quality over coverage**: Better to extract 5 correct objects than 50 wrong ones
- **Test with real research**: Google Flood Forecasting is the benchmark

---

## Repository

Active: `https://github.com/Grups666/teruvion`

---

## Final Principle

> **Decomposition reveals structure. Recomposition creates insight. Exploration discovers what's next.**

Keep decomposition rigorous. Keep recomposition intuitive. Keep exploration continuous.
