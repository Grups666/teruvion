# MVP v0.1 Goals: Source-To-Object Graph Foundation

## Vision

Build the research-source layer of Teruvion: a narrow but working foundation that turns a DOI, paper title, paper URL, or GitHub repository into ontology-grounded entities and relations.

The long-term vision is a resource-oriented Digital Earth. The current implementation should stay focused on source admission, connector fetching, decomposition, storage, and inspection.

## Current Runtime Scope

Implemented scope centers on:

- source admission with processing-depth decisions
- PaperConnector for DOI, title, and paper URLs
- GitHubConnector for static repository inspection
- LLM-assisted DigitalEarthDecomposer
- TripleStore for entities and relations
- ProjectRegistry for import state
- EventLog for progress and history
- LensRegistry for recomposed project views
- frontend exploration over imported graph data

## Explicit Non-Goals

This MVP does not include:

- user authentication
- cloud deployment
- paid SaaS workflow
- automatic execution of remote GitHub code
- real-time research monitoring
- automatic Exploration Agent runtime
- full Digital Earth operating layer
- standalone Paper-to-Teruvion endpoints outside the current unified import pipeline

## Success Criteria

MVP v0.1 is healthy when:

1. Source admission works for supported inputs.
2. Paper and GitHub connectors fetch real metadata or fail visibly.
3. Decomposition produces traceable entities and relations.
4. Abstract-only or partial-source limitations are visible.
5. Stored entities can be listed, opened, and explored.
6. Relations and triples can be inspected through the API.
7. Project progress and events can be inspected.
8. Lenses render useful recompositions from stored graph data.
9. Documentation matches the implemented API surface.
10. `npm test`, `npm run check`, and frontend build checks pass.

## Architecture Principles

- Object-centric: store entities and relations, not only prose summaries.
- Evidence-first: preserve source and confidence where possible.
- Local-first: keep the system runnable from a clone without cloud infrastructure.
- Safe by default: inspect remote repositories statically and do not run them.
- No silent fallback: mark missing keys, partial imports, or unavailable providers clearly.
- Small core: add extension points before adding domain-specific assumptions.

## Current Benchmark Domain

Earth science, hydrology, and climate research remain useful benchmark domains because they naturally combine:

- spatial regions
- datasets
- models and methods
- events and hazards
- evidence chains
- reproducibility questions

These domains are benchmarks, not core assumptions. Foundation code should use generic object names and reserve domain-specific names for modules or extracted entities.

## Future Directions

Future stages may add:

- static reproducibility grading as a first-class endpoint
- richer compare-anything workflows
- multi-source aggregation per region
- monitoring of new papers, datasets, repositories, and events
- Digital Earth operating-layer workflows

Future items must remain labeled as future work until implemented and verified.
