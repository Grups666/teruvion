# Teruvion Object Model

## Overview

Teruvion organizes knowledge as typed, inspectable, comparable objects rather than anonymous data blobs. Each object has clear identity, provenance, spatial/temporal context, and connections to other objects.

## Core Object Types

### RegionObject

Represents a spatial area of interest - a study region, administrative boundary, watershed, or custom-defined area.

**Key Properties:**
- `id`: Unique identifier
- `type`: "RegionObject"
- `name`: Human-readable name
- `geometry`: GeoJSON geometry (Point, Polygon, MultiPolygon)
- `bbox`: Bounding box [minLon, minLat, maxLon, maxLat]
- `properties`: Domain-specific metadata
- `source`: Where this region came from
- `provenance`: Creation/modification history

**Use Cases:**
- Study area boundaries from papers
- Administrative regions
- Watershed/basin delineations
- Custom research regions

### PaperObject

Represents a scientific paper with extracted metadata, spatial context, datasets, methods, and reproducibility status.

**Key Properties:**
- `id`: Unique identifier (DOI preferred)
- `type`: "PaperObject"
- `title`: Paper title
- `authors`: List of author objects
- `year`: Publication year
- `venue`: Journal/conference
- `doi`: Digital Object Identifier
- `url`: Primary URL
- `abstract`: Paper abstract
- `studyRegions`: Array of RegionObjects
- `datasets`: Array of DataObject references
- `methods`: Methodology descriptions
- `code`: GitHub repository information
- `reproducibility`: ReproducibilityStatus object
- `keywords`: Extracted keywords
- `provenance`: How this object was created

**Use Cases:**
- Paper catalog and search
- Spatial distribution of research
- Reproducibility assessment
- Method/dataset discovery

### DataObject

Represents a dataset, data source, or data artifact referenced or produced by research.

**Key Properties:**
- `id`: Unique identifier
- `type`: "DataObject"
- `name`: Dataset name
- `description`: Dataset description
- `format`: Data format (GeoTIFF, NetCDF, CSV, etc.)
- `spatialCoverage`: Spatial extent (bbox or geometry)
- `temporalCoverage`: Time range
- `resolution`: Spatial/temporal resolution
- `source`: Original source/provider
- `accessUrl`: Where to access the data
- `license`: Data license
- `citation`: How to cite the data
- `usedBy`: Papers/workflows using this data
- `provenance`: Creation/extraction history

**Use Cases:**
- Dataset discovery
- Data provenance tracking
- Understanding data dependencies
- Dataset comparison

### WorkflowObject

Represents a computational workflow, analysis pipeline, or methodological procedure.

**Key Properties:**
- `id`: Unique identifier
- `type`: "WorkflowObject"
- `name`: Workflow name
- `description`: Workflow description
- `steps`: Array of workflow step objects
- `inputs`: Required input data/parameters
- `outputs`: Generated outputs
- `code`: Code repository information
- `environment`: Runtime environment (Docker, conda, etc.)
- `reproducibility`: ReproducibilityStatus object
- `usedBy`: Papers using this workflow
- `provenance`: Creation history

**Workflow Steps:**
Each step includes:
- `name`: Step name
- `description`: What this step does
- `tool`: Software/library used
- `parameters`: Configuration parameters
- `inputs`: Input data/files
- `outputs`: Output data/files

**Use Cases:**
- Workflow reuse and adaptation
- Understanding analysis procedures
- Reproducibility assessment
- Method comparison

### ReproducibilityStatus

Assesses how reproducible a paper or workflow is based on available artifacts.

**Grade Levels:**
- **A**: Likely runnable - all key components present
- **B**: Partially runnable - some components missing
- **C**: Code/data incomplete - significant gaps
- **D**: Description only - no executable artifacts
- **E**: Insufficient information - cannot assess

**Key Properties:**
- `grade`: Reproducibility grade (A-E)
- `confidence`: Confidence level (high/medium/low)
- `reasons`: List of supporting reasons
- `warnings`: List of potential issues
- `checklist`: Detailed component checklist
- `assessedAt`: When assessment was performed
- `assessmentMethod`: How it was assessed (static/dynamic)

**Checklist Components:**
- `hasReadme`: README file present
- `hasLicense`: License file present
- `hasDependencies`: Requirements/environment file present
- `hasData`: Data files or data instructions present
- `hasCode`: Runnable scripts or notebooks present
- `hasDockerfile`: Docker configuration present
- `hasTests`: Test suite present
- `hasDocumentation`: Usage documentation present
- `hasExamples`: Example outputs or demo notebooks

**Use Cases:**
- Assess paper reproducibility
- Identify reproducibility gaps
- Guide improvement efforts
- Compare reproducibility across papers

## Object Registry

The system maintains a central registry of all loaded objects with:
- Unique ID → Object mapping
- Type-based indexing
- Spatial indexing for geometry-bearing objects
- Cross-references between objects

## Object Provenance

Every object tracks its provenance:
- **Source**: Where it came from (API, file, user input, extraction)
- **Creator**: What created it (manual, LLM, API integration)
- **CreatedAt**: When it was created
- **Modified**: Modification history
- **Confidence**: Confidence level for inferred data
- **Verification**: Verification status

## Uncertainty and Confidence

Objects distinguish between:
- **Verified facts**: Directly from authoritative sources
- **Extracted information**: Parsed from text/metadata
- **Inferred information**: Derived through reasoning
- **Uncertain information**: Low-confidence extractions

Each field can have an associated confidence score and source attribution.

## Object Relationships

Objects reference each other to form knowledge graphs:
- PaperObject → RegionObject (study regions)
- PaperObject → DataObject (datasets used)
- PaperObject → WorkflowObject (methods used)
- WorkflowObject → DataObject (data dependencies)
- DataObject → PaperObject (papers using this data)

## Extension Points

The object model is designed for extension:
- New object types can be added
- Existing object types can be extended with domain-specific fields
- Custom validators and extractors can be registered
- Object schemas are versioned for migration

## Implementation

Objects are represented as JSON with:
- Required type discrimination
- Optional fields with clear semantics
- Extensible metadata dictionaries
- Schema validation
- Serialization/deserialization utilities
