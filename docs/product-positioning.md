# Teruvion Product Positioning & Roadmap

## Core Vision

**Teruvion is the research-source layer of Digital Earth.**

It transforms multi-source research knowledge (papers, code, datasets, reports, news) into a structured Earth object graph, enabling spatial exploration, evidence tracking, workflow understanding, and continuous monitoring — ultimately supporting Earth system understanding, resource monitoring, risk prediction, and action design.

---

## Mission Statement

**Chinese**: 构建一个用于理解、探索和治理地球的动态数字地球系统

**English**: Build a living Digital Earth for understanding, exploring, and governing the planet

**Short**: Teruvion transforms research knowledge into a living Earth object graph.

---

## Four Core Objectives

| Objective | Description | Teruvion Role |
|-----------|-------------|---------------|
| **Understand Earth Systems** | How water cycles, climate drives events, ecosystems respond | Provide structured objects (Basin, ClimateModel, FloodEvent) and their connections |
| **Monitor Earth Resources** | Water availability, glacier balance, land use change | Track datasets (GRDC, ERA5), models (GloFAS), observations as objects |
| **Predict Earth Risks** | Floods, droughts, heatwaves, sea-level rise | Evidence chains linking prediction methods to validation data |
| **Support Earth Action** | Early warning, infrastructure planning, policy design | Workflow lens showing how research informs decisions |

---

## Three-Stage Core Loop

**Decomposition → Recomposition → Exploration**

### 1. Decomposition
Transform heterogeneous sources into Earth objects:

| Source | Extracted Objects |
|--------|------------------|
| Paper | Claims, Methods, Datasets, Regions, Evidence |
| GitHub repo | Models, Workflows, APIs, Dependencies |
| Dataset | Variables, Coverage, Access methods |
| Report | Assessments, Recommendations, Indicators |
| News | Events, Actors, Claims |

Each object is evidence-grounded and traceable to source.

### 2. Recomposition
Assemble objects into explorable views:

| Lens | Purpose | Example |
|------|---------|---------|
| **Map** | Spatial distribution | Global flood forecasting study regions |
| **Evidence** | Claim-evidence chains | "AI matches GloFAS reliability" → Figure 3 → ERA5-Land |
| **Workflow** | Method-data-model flow | LSTM ensemble → GloFAS → ERA5-Land → GRDC |
| **Timeline** | Evolution over time | Flood forecasting methods since 2015 |
| **Comparison** | Side-by-side analysis | LSTM vs Transformer vs GloFAS |

### 3. Exploration
Automatic tracking and discovery:
- Monitor new papers on tracked regions (Amazon Basin, Himalayan glaciers)
- Track dataset version updates (ERA5 v2024, GloFAS v4.0)
- Watch model repository commits (flood-forecasting repo)
- Detect news events (flood events, policy announcements)
- Find new connections (new dataset covering tracked basin)
- Alert on contradictions (new paper contradicts tracked claim)

---

## Market Positioning

### What We Are NOT
- ❌ Literature summarizer (ChatPDF, Elicit, SciSpace)
- ❌ Citation manager (Zotero, Mendeley)
- ❌ GIS platform (ArcGIS, QGIS)
- ❌ Digital Twin (static asset replicas)
- ❌ Knowledge graph for scholars only (ORKG)

### What We ARE
- ✅ **Multi-source Earth object graph platform**
- ✅ **Evidence-grounded knowledge infrastructure**
- ✅ **Spatial/evidence/workflow exploration layer**
- ✅ **Automatic Earth system monitoring**

### Unique Differentiator

We manage **Earth objects and their evidence relationships**, not just documents or citations.

| Platform | What It Manages |
|----------|-----------------|
| Zotero | What papers you have |
| ArcGIS | What geographic data you have |
| Digital Twin | What assets you monitor |
| **Teruvion** | What research knowledge contains and how it connects to Earth systems |

---

## Differentiation from Adjacent Categories

### vs. GIS (ArcGIS, QGIS, Earth Engine)
- GIS: Geographic data layers, spatial analysis, map rendering
- Teruvion: Research objects, evidence chains, workflow understanding
- **Key**: Our spatial objects carry claims, methods, provenance — not just geometry

### vs. Digital Twin
- Digital Twin: Asset replicas, real-time sensors, operational dashboards
- Teruvion: Research knowledge graph, evidence chains, scientific understanding
- **Key**: We connect knowledge to action, not sensors to displays

### vs. Research Tools (Elicit, ORKG)
- Research Tools: Paper search, metadata extraction, scholarly graphs
- Teruvion: Multi-source Earth objects, spatial lenses, continuous monitoring
- **Key**: We are Earth-domain aware, with spatial grounding and workflow understanding

---

## Three-Layer Roadmap

```
Layer 1: Research Source Layer (Current Alpha)
  ├─ Decompose papers, code, datasets, reports, news
  ├─ Store as Earth object graph
  ├─ Evidence chain tracking
  └─ Lens-based recomposition (map, evidence, workflow)

Layer 2: Earth System Object Graph (Year 1-3)
  ├─ Domain adapters: hydrology, climate, ecology, policy
  ├─ Multi-source aggregation per region/topic
  ├─ Cross-domain connections (water → climate → human)
  └─ Quality gates and provenance tracking

Layer 3: Digital Earth Intelligence (Year 5+)
  ├─ Agentic exploration (automatic monitoring)
  ├─ Prediction integration (model outputs as objects)
  ├─ Action support (decision workflows)
  └─ Governance interface (policy evidence chains)
```

---

## Current Alpha: v0.1

**Positioning**: Teruvion v0.1 is the **Deep Decomposition Engine** that proves a single source can be reliably transformed into high-quality Earth objects.

**Focus**: Earth science / hydrology / climate AI

**Success Criteria**:
- Full text acquisition (or abstract-only labeling)
- Datasets with roles (input, target, validation — not hardcoded)
- Methods with technical details
- Claims with evidence chains
- Objects traceable to source sections
- Spatial objects rendered on map

---

## Market Size Analysis

### TAM (Total Addressable Market)
Digital Earth / Earth intelligence tools emerging market
Conservative TAM: **$5B-20B** (cross of GIS, research tools, climate intelligence)

### SAM (Serviceable Addressable Market)
Earth science research intelligence:
- Global hydrology/climate research community
- Climate risk companies
- Government agencies (water, environment)
- International organizations

Conservative SAM: **$1B-5B**

### SOM (Serviceable Obtainable Market)
Year 1-3: Earth science vertical
- Individual researchers × $15/month
- Labs × $2,000/year
- Institutions × $30,000/year
- **Target: $0.5M-5M ARR**

Year 5+: Cross-domain expansion
- **Target: $5M-50M ARR**

---

## Strategic Roadmap

### Year 1: Credible Alpha
**Goal**: Prove deep decomposition works in Earth science

**Product**: Source Explorer + Earth Object Card + Map/Evidence Lens

**Focus**: Hydrology / Climate AI / Flood forecasting

**Success Metrics**:
- 20-50 high-quality demos
- 3-5 multi-source project examples
- 1 public demo (Global flood forecasting research object)
- Early adopters using regularly

### Year 3: Earth Research Workspace
**Goal**: Become Earth science research intelligence workspace

**Product**: Topic-level Earth object graph + multi-source aggregation

**New Features**:
- Topic creation: "Global AI flood forecasting", "Himalayan glaciers"
- Automatic source hooking
- Project graph aggregation
- Evidence chains (cross-source)
- Dataset/model monitoring
- Research trend analysis
- Comparison matrices

### Year 5: Earth Intelligence Platform
**Goal**: Evidence and object graph layer for Earth sector institutions

**Expansion**:
- Climate risk companies
- Insurance/reinsurance
- Government (water, environment, meteorology)
- International organizations (WMO, UN)
- Energy/water utilities
- Agricultural enterprises

**Core Value**: Continuous monitoring of scientific evidence, data updates, model progress, regional risks

### Year 10: Digital Earth Research Layer
**Goal**: Cross-domain Earth object graph platform

**Vision**:
- Domain adapters: hydrology, climate, ecology, agriculture, policy
- Universal core ontology
- Domain-specific extensions
- Agentic exploration engine
- AI scientist integration
- Governance decision support

---

## Key Risks & Mitigations

### Risk 1: Quality Failure
**Mitigation**: Quality gates at every extraction; confidence scores; source spans; abstract-only marking; user correction

### Risk 2: Premature Generalization
**Mitigation**: Core ontology universal; first domain deeply vertical (Earth science); expand domain-by-domain

### Risk 3: Product Complexity
**Mitigation**: First screen simple (Source as object card); advanced lenses accessible; progressive disclosure

### Risk 4: Copyright Issues
**Mitigation**: OA sources (Unpaywall); user-uploaded PDFs; abstract-only fallback; provenance tracking

### Risk 5: Slow Revenue
**Mitigation**: Individual for growth; Lab for stability; Institution/enterprise for major contracts; Vertical domains with commercial demand

---

## Most Realistic Path

### Step 1: Community Demo + Open Source
Build compelling demos:
- Global flood forecasting research object
- Himalayan glacier mass balance
- Human water use impacts
- Urban flood risk

Each shows: paper + repo + dataset + map + claims + evidence + workflow + updates

### Step 2: Lab Workspace
Sell to:
- Hydrology/climate labs
- AI for Earth science teams
- Environmental data science groups

Value: Manage an Earth research direction, not just literature

### Step 3: Institution Platform
Sell to:
- Climate risk companies
- Environmental consultancies
- Insurance/reinsurance
- Government agencies
- International organizations

Value: Continuous tracking of Earth evidence, data, models, regional risks

---

## Final Strategic Statement

**Mission**: Build a living Digital Earth for understanding, exploring, and governing the planet.

**Position**: Research-source layer of Digital Earth — transforms multi-source knowledge into structured Earth objects.

**Shortest description**:
> Teruvion transforms papers, datasets, models, and news into a living Earth object graph, enabling spatial exploration, evidence tracking, workflow understanding, and automatic monitoring.

**Core philosophy**:
> Decomposition reveals Earth's structure. Recomposition creates Earth insights. Exploration discovers what's changing.