# Paper-to-Teruvion Pipeline

## Overview

The Paper-to-Teruvion pipeline transforms a paper reference (DOI, title, or GitHub repository) into a structured set of research objects that can be inspected, displayed on a map, assessed for reproducibility, and compared with other research.

## Pipeline Flow

```
Input: DOI / Title / GitHub URL
       │
       ▼
┌─────────────────────┐
│ Paper Lookup        │  ← OpenAlex API
│ (metadata)          │
└─────────────────────┘
       │
       ▼
┌─────────────────────┐
│ GitHub Inspection   │  ← GitHub API
│ (code artifacts)    │
└─────────────────────┘
       │
       ▼
┌─────────────────────┐
│ Object Extraction   │  ← LLM (Anthropic Claude)
│ (structuring)       │     or rule-based fallback
└─────────────────────┘
       │
       ▼
┌─────────────────────┐
│ Reproducibility     │  ← Static analysis
│ Assessment          │
└─────────────────────┘
       │
       ▼
   Research Objects
   (PaperObject, DataObject,
    WorkflowObject, RegionObject)
```

## API Endpoints

### POST /api/paper/lookup

Look up paper metadata from OpenAlex by DOI or title.

**Request:**
```json
{
  "doi": "10.1038/s41586-018-0123-y",
  "title": "Optional paper title for search"
}
```

**Response:**
```json
{
  "paper": {
    "type": "PaperObject",
    "id": "doi:10.1038/...",
    "doi": "...",
    "title": "...",
    "authors": [...],
    "year": 2018,
    "venue": "...",
    "abstract": "...",
    "keywords": [...],
    "url": "...",
    "provenance": {
      "source": "OpenAlex",
      "extractedAt": "2026-01-15T...",
      "confidence": "high"
    }
  },
  "warnings": []
}
```

**Configuration:**
- Requires `OPENALEX_API_KEY` and `OPENALEX_EMAIL` (recommended for politeness pool)
- Falls back to public OpenAlex API without authentication

### POST /api/github/inspect

Statically inspect a GitHub repository for reproducibility artifacts.

**Request:**
```json
{
  "repoUrl": "https://github.com/owner/repo",
  "branch": "main"
}
```

**Response:**
```json
{
  "repository": {
    "owner": "owner",
    "name": "repo",
    "url": "...",
    "description": "...",
    "stars": 42,
    "license": "MIT",
    "lastUpdated": "2025-01-01T..."
  },
  "artifacts": {
    "hasReadme": true,
    "hasLicense": true,
    "hasDependencies": true,
    "dependencyFiles": ["requirements.txt", "environment.yml"],
    "hasNotebooks": true,
    "notebookCount": 5,
    "hasScripts": true,
    "hasData": false,
    "hasDataInstructions": true,
    "hasDockerfile": false,
    "hasTests": true,
    "hasRunInstructions": true
  },
  "reproducibility": {
    "grade": "B",
    "confidence": "medium",
    "reasons": [...],
    "warnings": [...]
  }
}
```

**Configuration:**
- Requires `GITHUB_TOKEN` for higher rate limits and private repo access
- Works without token but with stricter rate limits (60 req/hour)

**Safety:**
- Read-only inspection - never executes repository code
- Only reads file metadata and small text files (README, license)
- Does not download large data files or binaries

### POST /api/object/extract

Combine paper metadata + GitHub analysis into structured research objects.

**Request:**
```json
{
  "paper": { ... PaperObject from lookup ... },
  "githubAnalysis": { ... result from /api/github/inspect ... },
  "extractionMode": "llm" | "rules" | "auto"
}
```

**Response:**
```json
{
  "objects": [
    { "type": "PaperObject", ... },
    { "type": "RegionObject", ... },
    { "type": "DataObject", ... },
    { "type": "WorkflowObject", ... }
  ],
  "extractionMethod": "llm" | "rules",
  "warnings": [],
  "confidence": "high" | "medium" | "low"
}
```

**LLM Extraction:**
- Uses Anthropic Claude when `ANTHROPIC_API_KEY` is configured
- Extracts study regions from abstract/title
- Identifies datasets and methods
- Assesses reproducibility narrative

**Rule-based Fallback:**
- Pattern matching for region names, dataset references
- Conservative extraction with clear "inferred" markers
- No fabricated information

### POST /api/object/compare

Compare two research objects and produce structured comparison.

**Request:**
```json
{
  "objectA": { ... },
  "objectB": { ... },
  "compareMode": "llm" | "rules" | "auto"
}
```

**Response:**
```json
{
  "comparison": {
    "type": "ComparisonResult",
    "objectAType": "PaperObject",
    "objectBType": "PaperObject",
    "similarities": [...],
    "differences": [...],
    "fieldComparison": {
      "title": { "a": "...", "b": "..." },
      "year": { "a": 2020, "b": 2024 },
      ...
    },
    "summary": "...",
    "method": "llm" | "rules"
  }
}
```

## Reproducibility Assessment

### Grading Rubric

| Grade | Description | Required Components |
|-------|-------------|---------------------|
| A | Likely runnable | README + License + Deps + Code + (Data or Instructions) + Run Instructions |
| B | Partially runnable | README + Code + Deps OR Data, missing some component |
| C | Code/data incomplete | README + (Code OR Data), missing major artifacts |
| D | Description only | README only, no executable code or data |
| E | Insufficient info | No assessable artifacts |

### Component Weights

The grader evaluates these components:
- **Documentation**: README, run instructions, examples (weight: high)
- **Dependencies**: requirements.txt, environment.yml, package.json (weight: high)
- **Code**: Scripts, notebooks, source code (weight: high)
- **Data**: Data files or clear data acquisition instructions (weight: high)
- **Containerization**: Dockerfile, docker-compose (weight: medium)
- **License**: Open source license (weight: medium)
- **Tests**: Test suite, CI configuration (weight: low)

### Output Format

```json
{
  "grade": "B",
  "confidence": "medium",
  "score": 0.65,
  "reasons": [
    "README documentation present",
    "Python dependencies declared in requirements.txt",
    "Multiple Jupyter notebooks for analysis"
  ],
  "warnings": [
    "No data files or download instructions found",
    "No automated tests detected",
    "License file missing"
  ],
  "checklist": {
    "hasReadme": true,
    "hasLicense": false,
    "hasDependencies": true,
    "hasCode": true,
    "hasNotebooks": true,
    "hasData": false,
    "hasDataInstructions": false,
    "hasDockerfile": false,
    "hasTests": false,
    "hasRunInstructions": true
  },
  "assessedAt": "2026-01-15T...",
  "assessmentMethod": "static-analysis"
}
```

## Safety Constraints

The pipeline operates under strict safety constraints:

1. **No code execution**: GitHub repos are inspected statically only
2. **No data fabrication**: Missing fields are explicitly marked as such
3. **No silent failures**: Failed lookups return clear error states
4. **No PII in logs**: API keys and tokens are never logged
5. **Rate limiting**: Respects upstream API rate limits
6. **Caching**: Results cached briefly to reduce API load
7. **Timeout**: Network operations have reasonable timeouts

## Error Handling

Each pipeline stage handles errors gracefully:

- **Network failures**: Return partial results with clear warnings
- **API errors**: Distinguish 4xx (request issue) from 5xx (provider issue)
- **Missing keys**: Fall back to mock/limited mode with clear notice
- **Malformed input**: Validate and return descriptive error
- **Quota exceeded**: Inform user, suggest waiting or alternative

## Provenance Tracking

Every produced object includes provenance:

```json
{
  "provenance": {
    "pipeline": "paper-to-teruvion",
    "version": "0.1.0",
    "stages": [
      {
        "stage": "openalex-lookup",
        "timestamp": "2026-01-15T...",
        "source": "https://api.openalex.org/...",
        "confidence": "high"
      },
      {
        "stage": "github-inspection",
        "timestamp": "2026-01-15T...",
        "source": "https://api.github.com/...",
        "confidence": "high"
      },
      {
        "stage": "llm-extraction",
        "timestamp": "2026-01-15T...",
        "model": "claude-3-5-sonnet-latest",
        "confidence": "medium"
      }
    ]
  }
}
```

## Limitations

The current pipeline has known limitations:

- **OpenAlex coverage**: Some papers may not be indexed
- **GitHub-only**: Other code hosts (GitLab, Bitbucket) not yet supported
- **Single repo**: Multi-repo papers handled as primary repo only
- **Static analysis**: Cannot verify code actually runs
- **English bias**: LLM extraction works best on English content
- **Rate limits**: Free tier APIs limit throughput

These limitations are documented in object provenance and reproducibility warnings.
