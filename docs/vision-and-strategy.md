# Teruvion Vision And Strategy

## One-Line Positioning

Teruvion is a Digital Earth intelligence platform for research integration and active world monitoring.

It turns papers, repositories, datasets, reports, maps, models, events, and future monitoring feeds into persistent Digital Earth objects, evidence chains, workflows, and user-specific intelligence state.

## Mission

Teruvion's mission is to build a living Digital Earth intelligence platform that helps people understand, research, monitor, and act on complex Earth-system problems.

There are two product missions:

1. **Research integration**: provide a unified workspace where users can organize papers, data, code, models, maps, workflows, figures, evidence, and conclusions without constantly switching between GIS tools, notebooks, document editors, reference managers, and data portals.
2. **Active intelligence push**: run continuous monitoring and analysis over regions, resources, risks, models, datasets, events, and claims, then push evidence-backed updates to users based on their interests and responsibilities.

The source-to-object graph is the method, not the final purpose. The purpose is to make Digital Earth research and monitoring more integrated, explainable, reproducible, and actionable.

Current product focus is narrower:

```text
source -> Digital Earth object graph -> map/evidence/workflow/comparison views -> reviewable intelligence
```

The project must not jump directly to a complete Digital Earth operating layer before the source-to-object foundation is reliable.

## What Teruvion Is

Teruvion is:

- a Digital Earth research workspace
- a source decomposition and recomposition engine
- a persistent object graph and provenance layer
- a map, evidence, workflow, and comparison workspace
- a workflow and model/data/region alignment layer
- a future monitoring, watchlist, and intelligence-push system for Earth-related change

It should manage objects and their relationships, not only documents or chat responses.

The platform should eventually let a user move from question to source collection, data discovery, map visualization, workflow assembly, evidence review, report generation, and monitoring without losing provenance or context.

## What Teruvion Is Not

Teruvion should not become:

- a generic AI paper summarizer
- a ChatGPT wrapper for PDFs and webpages
- a generic GitHub repository analyzer
- a file hosting service
- a replacement for Google Earth, ArcGIS, QGIS, Cesium, GEE, Copernicus, Hugging Face, GitHub, Zenodo, or Figshare
- a cloud data warehouse or map rendering infrastructure company

Those platforms should be connected to and orchestrated, not duplicated.

Teruvion should become the intelligence layer that connects source material, Earth data systems, models, maps, workflows, reports, and user intent.

## Product Thesis

Advanced Digital Earth products should move beyond static maps and isolated dashboards. A flagship Digital Earth intelligence platform should provide eight capabilities:

1. **World objectization**: regions, datasets, models, events, resources, figures, claims, and workflows become inspectable objects, not anonymous files or map marks.
2. **Multi-source real-time fusion**: papers, news, reports, repositories, data portals, sensors, model outputs, and monitoring feeds can be connected into one project state.
3. **Reasoning on maps**: users can ask where, when, why, what changed, what may happen next, and what evidence supports the answer.
4. **Reproducible workflows**: results retain source URLs, data versions, parameters, code references, model versions, execution state, uncertainty, and review history.
5. **Agent-assisted research execution**: agents can help find data, read papers, construct routes, explain figures, compare evidence, plan visualizations, and assemble reports, while remaining bounded by source contracts, schema validation, provenance, permissions, and safe execution rules.
6. **Personalized intelligence push**: users can watch regions, risks, datasets, variables, models, resources, or claims and receive updates when new evidence changes the situation.
7. **Spatial-temporal-causal intelligence**: the system should connect where something happens, when it changes, why it matters, what it affects, and what actions or scenarios may follow.
8. **Multi-modal interaction**: web workspaces, map views, notebooks, reports, agent conversation, and future VR/AR interfaces should share the same source-grounded object graph instead of becoming separate product silos.

The long-term value is not a single import, summary, or visualization. It is persistent Earth intelligence state that becomes more useful as the user, team, or institution works inside it.

## Why Not OpenAI Or Anthropic

OpenAI, Anthropic, Gemini, and other model companies will keep absorbing generic intelligence capabilities:

- reading papers and webpages
- summarizing reports
- understanding repositories
- running general agents
- generating code and research drafts
- calling tools

Teruvion should not build its moat on those generic capabilities.

The defensible product is the persistent vertical state around Digital Earth:

- domain-specific ontology
- long-lived object graph
- provenance and trust layer
- user interest graph
- watchlists and monitoring tasks
- external orchestration across Earth data, model, source, and communication systems
- product workflows for researchers, teams, analysts, and institutions

OpenAI and Anthropic provide intelligence. Teruvion should own the Digital Earth workspace where intelligence becomes objects, evidence, workflows, monitoring, and decisions.

If Teruvion degrades into "AI summary plus file storage", it has no durable moat.

## Strategic Assets To Own

Teruvion should own:

- **Ontology**: Foundation, Source, Capability, World, and Domain layers.
- **Object graph**: sources, datasets, methods, models, regions, variables, hazards, risks, claims, evidence, workflows, and user interests.
- **Provenance**: source spans, extraction method, confidence, verification state, uncertainty, and audit notes.
- **Capability-to-world bridge**: how datasets, methods, models, and workflows connect to regions, processes, variables, risks, and actions.
- **User interest graph**: watched regions, hazards, variables, models, datasets, claims, thresholds, and projects.
- **Orchestration logic**: when to call external APIs, models, repositories, data platforms, email, reports, or future execution systems.
- **Product experience**: project panels, inspectors, lenses, review flows, monitoring views, and team workflows.

The durable product asset is the Digital Earth intelligence state: a source-grounded, provenance-aware, user-specific graph that can be recomposed for research, visualization, reporting, comparison, and monitoring.

## Infrastructure To Externalize

Teruvion should generally externalize:

- large Earth data storage and compute: GEE, Copernicus CDS, NASA Earthdata, Microsoft Planetary Computer, AWS Open Data
- code, model, and dataset hosting: GitHub, Hugging Face, Zenodo, Figshare
- object storage: S3-compatible storage, Cloudflare R2, Supabase Storage
- auth, email, and payment rails: Clerk, Supabase, Resend, Postmark, Stripe, Paddle
- search/vector/database infrastructure: Postgres, pgvector, Qdrant, Typesense, Meilisearch
- basemaps and map rendering primitives: OSM-compatible providers, MapLibre, Mapbox-compatible providers

Teruvion should record calls, interpret outputs, track provenance, and connect results back to the object graph.

## Product Boundary

Lead with:

- connect sources
- decompose research into Digital Earth objects
- inspect provenance and uncertainty
- compare objects and workflows
- visualize source-grounded spatial results
- integrate research materials into one project workspace
- track regions, risks, resources, datasets, models, and claims
- deliver evidence-backed updates

Do not lead with:

- upload and summarize a paper
- chat with a report
- analyze a repository once
- host files
- draw decorative graphs

The paid value is recurring dependency, not novelty.

## Commercial Logic

Teruvion becomes commercially meaningful when missing or misunderstanding Earth-related information has real cost.

Likely value drivers:

- saving expert analysis time
- reducing missed-signal risk
- maintaining a shared evidence base
- producing audit-ready reports
- monitoring datasets, models, regions, resources, risks, and claims
- connecting internal models and data with external scientific evidence

Weak value drivers:

- one-off summaries
- generic document upload
- non-personalized alerts
- ungrounded recommendations
- graphs without provenance

## User And Buyer Segments

Early users:

- individual researchers
- PhD students and postdocs
- research engineers
- Earth science practitioners

They are useful for feedback, demos, and community, but may not be the main revenue base.

More realistic early paying users:

- labs and PI-led research teams
- Earth science, hydrology, climate, and environmental data groups
- environmental and climate-risk consultancies
- water, energy, agriculture, infrastructure, and insurance teams with region-based exposure
- government, international organization, and institutional pilot teams

## Roadmap Stages

### Stage 1: Credible Alpha

Prove that a source can become a reviewable Digital Earth object graph.

Current focus:

- DOI, title, paper URL, and GitHub import
- source admission
- connector fetching
- ontology-grounded decomposition
- source coverage and fallback visibility
- project, entity, graph, and lens exploration
- figures, tables, resources, and map/regional recomposition
- alpha application and admin workflow

### Stage 2: Earth Research Workspace

Turn one-off imports into multi-source project memory.

Likely capabilities:

- topic/project workspaces
- multi-source aggregation
- object comparison
- richer evidence chains
- integrated figures, tables, maps, workflows, and source briefs
- research writing and report assembly
- source update detection
- user watchlists
- recurring research digests

### Stage 3: Digital Earth Intelligence Layer

Move from research workspace to institutional intelligence.

Likely capabilities:

- monitoring by region, resource, risk, dataset, model, and claim
- private data and model connectors
- active intelligence push by user interest graph
- team workflows and review permissions
- report and alert generation
- scenario and decision-support workflows

## Strategic Rule

Every major feature should strengthen at least one of:

- ontology
- persistent graph
- provenance
- user/workspace state
- external orchestration
- reviewable product workflow

If a feature only produces a one-time AI answer, it is strategically weak.
