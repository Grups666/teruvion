/**
 * ResearchUnderstanding - Near-lossless research decomposition
 *
 * Philosophy: Extract complete information, not summaries.
 * User should not need to read the original after seeing our decomposition.
 *
 * Strategy: Progressive depth extraction
 * - Layer 1: Overview (fast, cacheable)
 * - Layer 2: Deep technical details (methods, data, experiments)
 * - Layer 3: Reproducibility roadmap (step-by-step)
 * - Layer 4: Cross-references (code-paper-data mapping)
 */

const llm = require('../utils/llm');

class ResearchUnderstanding {
  async understand(input, content, metadata = {}) {
    console.log('[ResearchUnderstanding] Starting near-lossless decomposition...');

    const contextBlock = this._buildContext(content, metadata);

    // Layer 1: Fast overview
    const overview = await this._extractOverview(contextBlock, metadata);

    // Layer 2: Deep technical extraction (parallel calls)
    const [methods, datasets, experiments, results] = await Promise.all([
      this._extractMethods(contextBlock, overview),
      this._extractDatasets(contextBlock, overview),
      this._extractExperiments(contextBlock, overview),
      this._extractResults(contextBlock, overview)
    ]);

    // Layer 3: Reproducibility roadmap
    const reproducibility = await this._buildReproducibilityRoadmap(
      contextBlock,
      { methods, datasets, experiments },
      metadata
    );

    // Layer 4: Cross-references and spatial analysis
    const [crossRefs, spatial] = await Promise.all([
      this._extractCrossReferences(contextBlock, metadata),
      this._analyzeSpatial(contextBlock, { datasets, experiments })
    ]);

    return {
      input,
      inputType: metadata.type || 'unknown',
      understanding: {
        overview,
        methods,
        datasets,
        experiments,
        results,
        reproducibility,
        crossRefs,
        spatial
      },
      createdAt: new Date().toISOString()
    };
  }

  /**
   * Layer 1: Overview - Fast assessment
   */
  async _extractOverview(contextBlock, metadata) {
    const prompt = `Extract a high-level overview of this research material.

MATERIAL:
${contextBlock.substring(0, 15000)}

Return JSON:
{
  "title": "exact title",
  "problem": "what problem does this solve (1-2 sentences)",
  "contribution": "main contribution",
  "worthReading": "yes/maybe/no",
  "worthReadingWhy": "honest assessment in 2-3 sentences",
  "forYouIf": ["scenario 1", "scenario 2", "..."],
  "domain": "primary research field",
  "complexity": "beginner/intermediate/advanced/expert",
  "estimatedReadTime": "time to fully understand this"
}

Be honest and specific. Return ONLY valid JSON.`;

    return await llm.callJSON(prompt, {
      maxTokens: 1500,
      temperature: 0.2
    });
  }

  /**
   * Layer 2a: Deep method extraction with technical details
   */
  async _extractMethods(contextBlock, overview) {
    console.log('[ResearchUnderstanding] Extracting methods...');

    const prompt = `Extract COMPLETE technical details about all methods/models in this research.

CONTEXT: ${overview.title}
MATERIAL:
${contextBlock}

For each method/model, extract:
1. Full name and aliases
2. Core algorithm/architecture (detailed description)
3. Key innovation (what makes it different from prior work)
4. Mathematical formulation (if available, extract equations)
5. Hyperparameters and configuration
6. Input specifications (dimensions, format, preprocessing)
7. Output specifications (what it produces)
8. Training procedure (if ML model)
9. Computational requirements
10. Known limitations
11. Code location (file/function names if this is a repo)
12. Dependencies (libraries, frameworks)

Return JSON:
{
  "methods": [
    {
      "name": "official name",
      "aliases": ["alternative names"],
      "category": "ML/deep-learning/physical-model/statistical/hybrid",
      "architecture": {
        "description": "detailed technical description (preserve technical language)",
        "components": ["component 1", "component 2", "..."],
        "equations": ["equation 1 as text", "equation 2", "..."],
        "diagram": "ASCII diagram if structure is complex"
      },
      "innovation": "what's genuinely new (be specific)",
      "hyperparameters": {
        "param1": "value or range",
        "param2": "value or range"
      },
      "inputSpec": {
        "format": "description",
        "dimensions": "shape/size",
        "preprocessing": "steps applied to input"
      },
      "outputSpec": {
        "format": "description",
        "meaning": "what the output represents"
      },
      "training": {
        "procedure": "how it's trained",
        "lossFunction": "loss function used",
        "optimizer": "optimizer and settings",
        "duration": "training time",
        "hardware": "GPU/CPU requirements"
      },
      "limitations": ["limitation 1", "limitation 2"],
      "codeLocation": "file.py:function_name or null",
      "dependencies": ["lib1==version", "lib2"]
    }
  ]
}

CRITICAL: Extract actual technical details from the material, not generic descriptions.
If equations exist, preserve them as text.
If code is present, note exact file and function names.
If this is a software library/framework rather than research with experiments, focus on architecture and capabilities.
Return ONLY valid JSON, no markdown, no explanation, no preamble.`;

    try {
      const result = await llm.callJSON(prompt, {
        maxTokens: 8000,  // 深度方法提取需要更多 tokens
        temperature: 0.1
      });
      console.log('[ResearchUnderstanding] Methods extracted:', result.methods?.length || 0);
      return result;
    } catch (err) {
      console.warn('[ResearchUnderstanding] Method extraction failed:', err.message);
      return { methods: [] };
    }
  }

  /**
   * Layer 2b: Deep dataset extraction
   */
  async _extractDatasets(contextBlock, overview) {
    console.log('[ResearchUnderstanding] Extracting datasets...');

    const prompt = `Extract COMPLETE information about ALL datasets used in this research.

CONTEXT: ${overview.title}
MATERIAL:
${contextBlock}

For each dataset, extract:
1. Official full name (not acronym)
2. What it contains (specific variables/measurements)
3. Spatial coverage (exact regions/coordinates)
4. Temporal coverage (exact date ranges)
5. Resolution (spatial and temporal)
6. Size (number of records, file size)
7. Format (file format, schema)
8. Access method (URL, API, requires registration?)
9. License and restrictions
10. Quality issues or caveats
11. How it's used in this research
12. Preprocessing steps applied
13. Citation information

Return JSON:
{
  "datasets": [
    {
      "name": "FULL official name",
      "acronym": "short name if different",
      "type": "observations/reanalysis/simulation/benchmark",
      "description": "what this dataset contains (detailed)",
      "variables": [
        {
          "name": "variable name",
          "unit": "unit",
          "description": "what it measures"
        }
      ],
      "spatial": {
        "coverage": "geographic description",
        "resolution": "resolution",
        "coordinateSystem": "CRS or null",
        "bbox": [minLon, minLat, maxLon, maxLat] or null
      },
      "temporal": {
        "coverage": "date range",
        "resolution": "hourly/daily/monthly",
        "gaps": "known gaps or null"
      },
      "size": {
        "records": "number or estimate",
        "fileSize": "size or estimate",
        "format": "file format"
      },
      "access": {
        "url": "download URL or null",
        "method": "direct download/API/requires account",
        "license": "license type",
        "restrictions": "any restrictions or null"
      },
      "quality": {
        "issues": ["known issue 1", "..."],
        "validation": "how quality was assessed"
      },
      "usage": {
        "role": "how used in this research",
        "preprocessing": ["step 1", "step 2"],
        "subset": "if only subset used, describe"
      },
      "citation": "how to cite this dataset"
    }
  ]
}

Extract REAL details from the material. If information isn't present, use null.
If this is a library/framework, list datasets used in examples or benchmarks.
Return ONLY valid JSON, no markdown, no explanation.`;

    try {
      const result = await llm.callJSON(prompt, {
        maxTokens: 8000,
        temperature: 0.1
      });
      console.log('[ResearchUnderstanding] Datasets extracted:', result.datasets?.length || 0);
      return result;
    } catch (err) {
      console.warn('[ResearchUnderstanding] Dataset extraction failed:', err.message);
      return { datasets: [] };
    }
  }

  /**
   * Layer 2c: Experiment extraction
   */
  async _extractExperiments(contextBlock, overview) {
    console.log('[ResearchUnderstanding] Extracting experiments...');

    const prompt = `Extract COMPLETE details about experiments conducted in this research.

CONTEXT: ${overview.title}
MATERIAL:
${contextBlock}

IMPORTANT: If this is a software library/framework rather than a research paper, return {"experiments": []}.

For each experiment, extract:
1. Purpose/hypothesis
2. Experimental design
3. Exact configuration (parameters, settings)
4. Baselines compared against
5. Evaluation metrics
6. Results (quantitative values)
7. Ablation studies
8. Statistical significance tests

Return JSON:
{
  "experiments": [
    {
      "name": "experiment name or description",
      "purpose": "what this experiment tests",
      "design": {
        "type": "comparison/ablation/sensitivity/case-study",
        "procedure": "step-by-step description"
      },
      "configuration": {
        "key": "value"
      },
      "baselines": ["baseline 1", "baseline 2"],
      "metrics": [
        {
          "name": "metric name",
          "description": "what it measures",
          "higherBetter": true/false
        }
      ],
      "ablations": [
        {
          "component": "what was removed/changed",
          "impact": "observed effect"
        }
      ]
    }
  ]
}

Return ONLY valid JSON, no markdown, no explanation, no preamble.
If this is a software library/framework, return {"experiments": []}.`;

    try {
      const result = await llm.callJSON(prompt, {
        maxTokens: 3000,
        temperature: 0.1
      });
      console.log('[ResearchUnderstanding] Experiments extracted:', result.experiments?.length || 0);
      return result;
    } catch (err) {
      console.warn('[ResearchUnderstanding] Experiment extraction failed:', err.message);
      return { experiments: [] };
    }
  }

  /**
   * Layer 2d: Results extraction with actual numbers
   */
  async _extractResults(contextBlock, overview) {
    console.log('[ResearchUnderstanding] Extracting results...');

    const prompt = `Extract COMPLETE quantitative results from this research.

CONTEXT: ${overview.title}
MATERIAL:
${contextBlock}

Extract:
1. Main result (primary metric with value)
2. All performance numbers (tables/figures)
3. Comparison with baselines (exact numbers)
4. Statistical significance
5. Error bars / confidence intervals
6. Performance by region/subset
7. Failure cases

Return JSON:
{
  "mainResult": {
    "metric": "metric name",
    "value": "value with unit",
    "context": "on which dataset/task"
  },
  "detailedResults": [
    {
      "setting": "experimental setting",
      "metric": "metric name",
      "value": "value",
      "baseline": "baseline value or null",
      "improvement": "percentage or null",
      "significance": "p-value or null"
    }
  ],
  "performanceBreakdown": {
    "byRegion": [{"region": "name", "performance": "value"}],
    "byScenario": [{"scenario": "name", "performance": "value"}]
  },
  "limitations": {
    "failureCases": ["case 1", "case 2"],
    "knownIssues": ["issue 1", "issue 2"]
  },
  "figuresAndTables": [
    {
      "reference": "Figure 3 or Table 2",
      "caption": "caption text",
      "keyTakeaway": "main message"
    }
  ]
}

Extract ACTUAL numbers from the material. If no quantitative results, return null fields.
Return ONLY valid JSON, no markdown, no explanation.`;

    try {
      const result = await llm.callJSON(prompt, {
        maxTokens: 3000,
        temperature: 0.1
      });
      console.log('[ResearchUnderstanding] Results extracted');
      return result;
    } catch (err) {
      console.warn('[ResearchUnderstanding] Results extraction failed:', err.message);
      return { mainResult: null, detailedResults: [], performanceBreakdown: {}, limitations: {}, figuresAndTables: [] };
    }
  }

  /**
   * Layer 3: Reproducibility roadmap - step-by-step guide
   */
  async _buildReproducibilityRoadmap(contextBlock, extracted, metadata) {
    console.log('[ResearchUnderstanding] Building reproducibility roadmap...');

    const prompt = `Build a COMPLETE step-by-step reproducibility roadmap.

RESEARCH: ${extracted.methods.methods?.[0]?.name || 'this research'}
MATERIAL:
${contextBlock.substring(0, 15000)}

Create an actionable roadmap with:
1. Prerequisites (hardware, software, accounts)
2. Installation steps (exact commands)
3. Data acquisition (where to download, how big, how long)
4. Preprocessing pipeline (exact scripts/commands)
5. Training procedure (commands, expected time, checkpoints)
6. Evaluation steps
7. Expected outputs
8. Common pitfalls and solutions
9. Estimated time and cost

Return JSON:
{
  "grade": "A/B/C/D/E",
  "gradeReason": "why this grade",
  "estimatedEffort": "hours to days",
  "estimatedCost": "compute cost if applicable",
  "prerequisites": {
    "hardware": ["requirement 1", "..."],
    "software": ["requirement 1", "..."],
    "accounts": ["service 1", "..."],
    "skills": ["skill 1", "..."]
  },
  "steps": [
    {
      "phase": "Installation/Data/Training/Evaluation",
      "order": 1,
      "description": "what this step does",
      "commands": ["exact command 1", "command 2"],
      "expectedDuration": "time estimate",
      "expectedOutput": "what you should see",
      "troubleshooting": ["common issue → solution"]
    }
  ],
  "dataAcquisition": {
    "totalSize": "size estimate",
    "downloadTime": "time estimate",
    "sources": [
      {
        "name": "dataset name",
        "url": "URL or null",
        "size": "size",
        "method": "download method"
      }
    ]
  },
  "knownPitfalls": [
    {
      "issue": "problem description",
      "solution": "how to fix",
      "source": "where this was reported"
    }
  ],
  "alternativeApproaches": ["simpler alternative 1", "..."]
}

Be specific with commands, times, and sizes.
Return ONLY valid JSON, no markdown, no explanation.`;

    try {
      const result = await llm.callJSON(prompt, {
        maxTokens: 8000,
        temperature: 0.2
      });
      console.log('[ResearchUnderstanding] Reproducibility roadmap built, grade:', result.grade);
      return result;
    } catch (err) {
      console.warn('[ResearchUnderstanding] Reproducibility roadmap failed:', err.message);
      return { grade: 'E', gradeReason: 'Could not assess', steps: [] };
    }
  }

  /**
   * Layer 4a: Cross-references (code-paper-data mapping)
   */
  async _extractCrossReferences(contextBlock, metadata) {
    console.log('[ResearchUnderstanding] Extracting cross-references...');
    if (metadata.type !== 'github') {
      return { applicable: false };
    }

    const prompt = `Map relationships between code, papers, and data in this repository.

MATERIAL:
${contextBlock.substring(0, 12000)}

Extract:
1. Which paper(s) does this code implement?
2. Which code files implement which methods/figures?
3. Which scripts process which datasets?
4. Entry points (main scripts users should run)

Return JSON:
{
  "papers": [
    {
      "title": "paper title",
      "reference": "citation or URL",
      "implementedMethods": ["method 1", "..."],
      "implementedFigures": ["Figure 3", "..."]
    }
  ],
  "codeMap": [
    {
      "file": "path/to/file.py",
      "purpose": "what this file does",
      "implements": "Method X from Paper Y",
      "dependencies": ["file1.py", "file2.py"]
    }
  ],
  "dataFlow": [
    {
      "script": "script name",
      "input": ["dataset 1", "..."],
      "output": ["output 1", "..."],
      "purpose": "what this script does"
    }
  ],
  "entryPoints": [
    {
      "script": "main.py or CLI command",
      "purpose": "what running this does",
      "example": "python main.py --config config.yaml"
    }
  ],
  "readingPath": [
    "Step 1: Start with X",
    "Step 2: Then read Y",
    "..."
  ]
}

Return ONLY valid JSON, no markdown, no explanation.`;

    try {
      const result = await llm.callJSON(prompt, {
        maxTokens: 3000,
        temperature: 0.2
      });
      console.log('[ResearchUnderstanding] Cross-references extracted');
      return result;
    } catch (err) {
      console.warn('[ResearchUnderstanding] Cross-reference extraction failed:', err.message);
      return { applicable: true, papers: [], codeMap: [], dataFlow: [], entryPoints: [] };
    }
  }

  /**
   * Layer 4b: Spatial analysis
   */
  async _analyzeSpatial(contextBlock, extracted) {
    console.log('[ResearchUnderstanding] Analyzing spatial aspects...');
    const hasGeoMention = /\b(region|basin|watershed|country|lat|lon|coordinate|spatial|geographic)\b/i.test(contextBlock);

    if (!hasGeoMention) {
      return { hasSpatialDimension: false };
    }

    const prompt = `Analyze spatial/geographic aspects of this research.

DATASETS: ${JSON.stringify(extracted.datasets?.datasets || [], null, 2)}
MATERIAL SAMPLE:
${contextBlock.substring(0, 8000)}

Determine:
1. Does this research have meaningful spatial data?
2. Study regions (with coordinates if available)
3. Can results be visualized on a map?
4. Spatial performance patterns

Return JSON:
{
  "hasSpatialDimension": true/false,
  "regions": [
    {
      "name": "region name",
      "type": "basin/country/continent/grid/point",
      "scale": "global/continental/regional/local",
      "coordinates": [minLon, minLat, maxLon, maxLat] or null,
      "description": "what was studied here"
    }
  ],
  "canVisualize": true/false,
  "visualizationSuggestion": "what could be shown on a map",
  "spatialFiles": ["file1.geojson", "..."] or []
}

Return ONLY valid JSON, no markdown, no explanation.`;

    try {
      const result = await llm.callJSON(prompt, {
        maxTokens: 2000,
        temperature: 0.2
      });
      console.log('[ResearchUnderstanding] Spatial analysis complete, has spatial:', result.hasSpatialDimension);
      return result;
    } catch (err) {
      console.warn('[ResearchUnderstanding] Spatial analysis failed:', err.message);
      return { hasSpatialDimension: false };
    }
  }

  /**
   * Build context from connector output
   */
  _buildContext(content, metadata) {
    if (typeof content === 'string') return content.substring(0, 20000);

    const parts = [];

    // Paper content (from PaperConnector)
    if (content.content) {
      parts.push(content.content);
    }

    // GitHub repository metadata
    if (metadata.name) parts.push(`Repository: ${metadata.name}`);
    if (metadata.description) parts.push(`Description: ${metadata.description}`);
    if (metadata.stars) parts.push(`Stars: ${metadata.stars}`);
    if (metadata.topics?.length) parts.push(`Topics: ${metadata.topics.join(', ')}`);
    if (metadata.language) parts.push(`Language: ${metadata.language}`);
    if (metadata.license) parts.push(`License: ${metadata.license}`);

    if (metadata.tree?.length) {
      parts.push(`\nFile tree (${metadata.tree.length} files):\n${metadata.tree.slice(0, 150).join('\n')}`);
    }

    if (metadata.readme) parts.push(`\n--- README ---\n${metadata.readme}`);

    if (metadata.keyFiles && Object.keys(metadata.keyFiles).length > 0) {
      for (const [path, fileContent] of Object.entries(metadata.keyFiles)) {
        parts.push(`\n--- ${path} ---\n${fileContent.substring(0, 8000)}`);
      }
    }

    return parts.join('\n').substring(0, 35000);
  }
}

module.exports = ResearchUnderstanding;
