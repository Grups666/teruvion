# Teruvion Object Model

## Purpose

Teruvion organizes research and Earth intelligence as typed, inspectable graph objects.

The implementation is not a fixed set of standalone `PaperObject` or `RegionObject` JSON classes. The current runtime stores ontology-grounded entities and relations in `TripleStore`, grouped by project and recomposed through lenses.

## Entity Layers

The ontology is organized into five layers:

- **Foundation**: generic concepts such as Entity, Source, Claim, Evidence, Method, Model, Metric, Process, Agent.
- **Source**: Paper, Repository, DatasetPage, Report, PolicyDocument, News, and related source-bearing entities.
- **Capability**: Dataset, Variable, Model, Algorithm, Workflow, Software, API, Assessment, Indicator, Intervention, and related capability objects.
- **World**: Region, Basin, EarthVariable, Hazard, Risk, Event, Infrastructure, Scenario, ModelOutput, and related Earth objects.
- **Domain**: hydrology, climate, urban, energy, ecology, agriculture, and future domain extensions.

The core should use generic layer and entity protocols. Domain-specific entities are valid extracted objects, but foundation code should not become hardcoded to one domain.

The ontology should guide extraction and comparison; it should not become the main thing displayed to users. A user imports a source to understand the source itself: its materials, method, workflow, figures, evidence, results, limitations, and reusable resources. Internal labels such as layer, depth, fallback mode, or category should support trust and inspection, not replace the source content.

## Entity Shape

Stored entities follow the `TripleStore` entity shape:

```json
{
  "id": "Dataset_abcd1234",
  "type": "Dataset",
  "attributes": {
    "name": "ERA5-Land",
    "description": "..."
  },
  "metadata": {
    "source": "https://example.org/source",
    "projectId": "project_...",
    "confidence": 0.8,
    "extractedBy": "DigitalEarthDecomposer",
    "sourceDerived": true,
    "provenance": {
      "section": "data availability",
      "sourceText": "..."
    }
  },
  "verificationState": "extracted",
  "createdAt": "..."
}
```

Important fields:

- `type`: ontology entity type.
- `attributes`: user-facing and domain-facing object fields.
- `metadata.source`: input or source link.
- `metadata.projectId`: project grouping.
- `metadata.confidence`: extraction confidence.
- `metadata.provenance`: source section, source span, notes, and fallback status.
- `verificationState`: extracted, reviewed, verified, uncertain, or rejected.

## Relation Shape

Relations are triples:

```json
{
  "subject": "Paper_...",
  "predicate": "produces",
  "object": "Dataset_...",
  "metadata": {
    "confidence": 0.8,
    "provenance": {}
  }
}
```

Relations should represent inspectable claims about object structure:

- source produces capability
- source studies world object
- dataset covers region
- model predicts variable or hazard
- evidence supports claim
- workflow uses dataset or model

Where source evidence is weak or missing, relation confidence must remain conservative.

## Source Objects

Source objects represent imported materials:

- Paper
- Repository
- DatasetPage
- Report
- PolicyDocument
- News
- generic Source where no richer type is known

Source objects are entry points into the graph. They should preserve title, identifier, URL, DOI, authors, venue, repository metadata, source coverage, and admission metadata when available.

Multiple source objects may belong to one project. The object model should support linking a paper to its repository, data archive, supplement, report, related news item, or comparison paper without adding one-off fields to the core.

## Capability Objects

Capability objects represent what a source provides or describes:

- Dataset
- Variable
- Model
- Algorithm
- Workflow
- Software
- API
- Assessment
- Indicator
- Intervention

They answer:

- What method, data, model, workflow, or tool exists?
- What is it for?
- What source supports its existence?
- What world object can it observe, model, predict, assess, or affect?

## World Objects

World objects represent Earth-side targets and contexts:

- Region or Basin
- EarthVariable
- Hazard
- Risk
- Event
- Infrastructure
- Scenario
- ModelOutput

They answer:

- What Earth system, region, process, variable, risk, or event is involved?
- Is there spatial or temporal metadata?
- Which sources, capabilities, claims, or workflows connect to it?

## Evidence Objects

Evidence objects represent reviewable support:

- Claim
- Evidence
- EvidenceChain
- Assessment
- Indicator

They should distinguish:

- direct source statements
- extracted facts
- inferred information
- fallback extraction
- unsupported or uncertain claims

Every evidence object should preserve provenance where possible.

## Extraction Modes And Trust

Objects may be created by:

- connector metadata
- source text fallback
- LLM-assisted extraction
- future user edits
- future monitoring tasks

The extraction mode must remain visible. A `source-text-fallback` object is useful because it is inspectable, but it is not the same as a verified expert object.

## Lenses

Lenses recompose stored objects into views:

- Map: spatial entities and features.
- Evidence: claims, evidence, and support chains.
- Workflow: method, data, model, software, and output flow.
- Timeline: temporal objects and events.
- Comparison: comparable object sets.

Lenses do not replace the graph. They are views over graph state.

## Future Extension Rules

New object types should be added through ontology extension patterns, not ad hoc route logic.

Before adding a type or relation, define:

- layer
- category
- required and optional attributes
- allowed relations
- provenance expectations
- UI review behavior
- verification path

The object model should grow by protocol, not by scattered special cases.
