#!/usr/bin/env node
/**
 * Evaluate source-to-object-graph decomposition quality.
 *
 * Default mode is deterministic and does not call an LLM. Use
 * --provider api or --provider claude-code to exercise deep extraction.
 */

const fs = require('fs');
const path = require('path');
const { SourceAdmission } = require('../core/admission/SourceAdmission');
const DigitalEarthDecomposer = require('../core/understanding/DigitalEarthDecomposer');
const { summarizeSourceCoverage } = require('../core/source/SourceCoverage');
const { buildProjectRecomposition } = require('../core/project/ProjectRecomposer');
const ConnectorRegistry = require('../core/connectors/ConnectorRegistry');

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const llm = loadLLM(options.provider, options);
  const sources = await loadSources(options);

  const summaries = [];
  for (const source of sources) {
    summaries.push(await evaluateSource(source, llm, options));
  }

  const output = summaries.length === 1
    ? summaries[0]
    : buildBenchmarkSummary(summaries, options);

  if (options.json) {
    process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
    return;
  }

  if (summaries.length === 1) {
    printSummary(summaries[0]);
  } else {
    printBenchmarkSummary(output);
  }
}

async function loadSources(options) {
  if (options.inputFile) return [readSourceFile(options.inputFile)];
  if (options.input) return [await fetchLiveSource(options.input, options)];
  return builtInFixtures(options.fixture);
}

async function fetchLiveSource(input, options = {}) {
  const llmConfig = require('../core/utils/llm');
  const registry = new ConnectorRegistry({
    githubToken: llmConfig.getGitHubToken(),
    openAlexKey: llmConfig.getOpenAlexKey()
  });

  const restoreLog = options.json ? console.log : null;
  if (options.json) console.log = () => {};
  try {
    const content = await registry.fetch(input);
    return {
      ...content,
      input,
      fetchedAt: new Date().toISOString(),
      live: true
    };
  } finally {
    if (restoreLog) console.log = restoreLog;
  }
}

async function evaluateSource(source, llm, options) {
  const admission = new SourceAdmission(llm);
  const decomposer = new DigitalEarthDecomposer(llm, {
    useLLM: options.provider !== 'none',
    deepExtractionTimeout: options.timeout
  });

  const admissionResult = await admission.evaluate(source.input, source, source.metadata || {});
  const sourceCoverage = summarizeSourceCoverage(source);
  const decomposition = await decomposer.decompose(source.input, source, admissionResult);
  const recomposition = buildProjectRecomposition({
    decomposition,
    sourceCoverage,
    admission: admissionResult
  });
  const summary = buildSummary({
    source,
    admissionResult,
    decomposition,
    recomposition,
    sourceCoverage,
    provider: options.provider
  });

  return summary;
}

function buildBenchmarkSummary(summaries, options = {}) {
  const scores = summaries.map(summary => summary.decomposition.productReadiness.score || 0);
  const projectScores = summaries.map(summary => summary.recomposition.projectQuality.score || 0);
  const weakSources = summaries.filter(summary => (
    summary.decomposition.productReadiness.level === 'weak'
    || summary.recomposition.projectQuality.level === 'weak'
    || summary.decomposition.route.quality === 'limited'
  ));

  return {
    schemaVersion: 'teruvion-decomposition-quality-benchmark-v1',
    provider: options.provider,
    fixture: options.fixture,
    sourceCount: summaries.length,
    pass: weakSources.length === 0,
    aggregate: {
      averageProductReadiness: average(scores),
      minProductReadiness: Math.min(...scores),
      averageProjectQuality: average(projectScores),
      minProjectQuality: Math.min(...projectScores),
      weakSourceCount: weakSources.length
    },
    sources: summaries
  };
}

function parseArgs(args) {
  const options = {
    provider: 'none',
    fixture: 'long-paper',
    input: null,
    inputFile: null,
    timeout: 300000,
    json: false,
    fallback: false
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--provider') options.provider = normalizeProvider(args[++index]);
    else if (arg.startsWith('--provider=')) options.provider = normalizeProvider(arg.split('=')[1]);
    else if (arg === '--fixture') options.fixture = args[++index] || options.fixture;
    else if (arg.startsWith('--fixture=')) options.fixture = arg.split('=')[1] || options.fixture;
    else if (arg === '--input') options.input = args[++index] || null;
    else if (arg.startsWith('--input=')) options.input = arg.slice('--input='.length);
    else if (arg === '--input-file') options.inputFile = args[++index] || null;
    else if (arg.startsWith('--input-file=')) options.inputFile = arg.slice('--input-file='.length);
    else if (arg === '--timeout') options.timeout = Number(args[++index] || options.timeout);
    else if (arg.startsWith('--timeout=')) options.timeout = Number(arg.split('=')[1] || options.timeout);
    else if (arg === '--json') options.json = true;
    else if (arg === '--fallback') options.fallback = true;
    else if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }
  }

  return options;
}

function normalizeProvider(value) {
  const provider = String(value || 'none').toLowerCase();
  if (provider === 'api' || provider === 'claude-code' || provider === 'claudecode' || provider === 'claude_code') {
    return provider === 'api' ? 'api' : 'claude-code';
  }
  return 'none';
}

function loadLLM(provider, options = {}) {
  if (provider === 'none') return null;
  process.env.TERUVION_AGENT_PROVIDER = provider;
  if (provider !== 'api') {
    process.env.TERUVION_AGENT_FALLBACK_TO_API = options.fallback ? 'true' : 'false';
  }
  return require('../core/utils/llm');
}

function readSourceFile(filePath) {
  const resolved = path.resolve(filePath);
  const content = fs.readFileSync(resolved, 'utf8');
  return JSON.parse(content);
}

function buildSummary({ source, admissionResult, decomposition, recomposition, sourceCoverage, provider }) {
  const readiness = decomposition.extractionIntegrity?.productReadiness || {};
  const projectQuality = recomposition.aggregate?.productQuality || {};
  const llmExtraction = decomposition.extractionMetadata?.llmExtraction || {};
  return {
    source: {
      input: source.input,
      title: source.metadata?.title || source.title || source.input,
      type: source.type || source.metadata?.type || 'Source'
    },
    provider,
    admission: {
      admitted: admissionResult.admitted,
      depth: admissionResult.depth,
      primaryRole: admissionResult.primaryRole
    },
    coverage: {
      level: sourceCoverage.contentLevel,
      sections: sourceCoverage.metrics.sectionCount,
      figures: sourceCoverage.metrics.figureCount,
      tables: sourceCoverage.metrics.tableCount,
      textLength: sourceCoverage.metrics.textLength
    },
    decomposition: {
      extractionMethod: decomposition.provenance?.extractionMethod,
      llmExtraction: {
        success: llmExtraction.success ?? null,
        agentProvider: llmExtraction.agentProvider || null,
        schemaVersion: llmExtraction.schemaVersion || null,
        fallback: llmExtraction.agentRuns?.some?.(run => run?.fallback) || llmExtraction.agent?.fallback || null,
        error: llmExtraction.error || llmExtraction.requestErrors?.[0]?.error || null,
        schemaWarningCount: llmExtraction.schemaWarnings?.length || 0,
        routeNodeCount: llmExtraction.routeNodeCount || 0,
        figureAnalysisCount: llmExtraction.figureAnalysisCount || 0,
        resourceLinkCount: llmExtraction.resourceLinkCount || 0
      },
      confidence: decomposition.confidence,
      objects: {
        capability: decomposition.capabilityObjects?.length || 0,
        world: decomposition.worldObjects?.length || 0,
        evidence: decomposition.evidenceObjects?.length || 0,
        relations: decomposition.bridgeRelations?.length || 0
      },
      route: {
        nodes: decomposition.workflowOutline?.nodes?.length || 0,
        edges: decomposition.workflowOutline?.edges?.length || 0,
        quality: decomposition.extractionIntegrity?.routeQuality?.level
      },
      visuals: {
        count: decomposition.visualEvidence?.length || 0,
        quality: decomposition.extractionIntegrity?.visualEvidenceQuality?.level
      },
      resources: {
        count: decomposition.resourceGraph?.summary?.resourceCount || 0,
        linked: decomposition.resourceGraph?.summary?.linkedResourceCount || 0,
        quality: decomposition.extractionIntegrity?.resourceGraphQuality?.level
      },
      productReadiness: summarizeQuality(readiness)
    },
    recomposition: {
      sourceCount: recomposition.sourceCount,
      routeNodes: recomposition.aggregate?.route?.nodeCount || 0,
      routeEdges: recomposition.aggregate?.route?.edgeCount || 0,
      visualEvidence: recomposition.aggregate?.visualEvidence?.count || 0,
      resources: recomposition.aggregate?.resources?.count || 0,
      projectQuality: summarizeQuality(projectQuality)
    }
  };
}

function summarizeQuality(quality = {}) {
  return {
    level: quality.level || 'unknown',
    score: quality.score ?? null,
    weakComponents: quality.weakComponents || [],
    reasons: quality.reasons || []
  };
}

function printSummary(summary) {
  console.log('Teruvion decomposition quality');
  console.log(`Source: ${summary.source.title}`);
  console.log(`Provider: ${summary.provider}`);
  console.log(`Admission: ${summary.admission.depth} / ${summary.admission.primaryRole}`);
  console.log(`Coverage: ${summary.coverage.level}, ${summary.coverage.sections} sections, ${summary.coverage.figures} figures`);
  console.log(`Objects: ${summary.decomposition.objects.capability} capability, ${summary.decomposition.objects.world} world, ${summary.decomposition.objects.evidence} evidence, ${summary.decomposition.objects.relations} relations`);
  if (summary.provider !== 'none') {
    console.log(`LLM: success=${summary.decomposition.llmExtraction.success}, agent=${summary.decomposition.llmExtraction.agentProvider || 'n/a'}, fallback=${summary.decomposition.llmExtraction.fallback || 'none'}`);
    if (summary.decomposition.llmExtraction.error) console.log(`LLM error: ${summary.decomposition.llmExtraction.error}`);
  }
  console.log(`Route: ${summary.decomposition.route.nodes} nodes, ${summary.decomposition.route.edges} edges, ${summary.decomposition.route.quality}`);
  console.log(`Visuals: ${summary.decomposition.visuals.count}, ${summary.decomposition.visuals.quality}`);
  console.log(`Resources: ${summary.decomposition.resources.linked}/${summary.decomposition.resources.count} linked, ${summary.decomposition.resources.quality}`);
  console.log(`Product readiness: ${summary.decomposition.productReadiness.level} (${summary.decomposition.productReadiness.score ?? 'n/a'}%)`);
  if (summary.decomposition.productReadiness.reasons.length) {
    console.log(`Readiness reasons: ${summary.decomposition.productReadiness.reasons.join('; ')}`);
  }
  console.log(`Project quality: ${summary.recomposition.projectQuality.level} (${summary.recomposition.projectQuality.score ?? 'n/a'}%)`);
}

function printBenchmarkSummary(benchmark) {
  console.log('Teruvion decomposition quality benchmark');
  console.log(`Provider: ${benchmark.provider}`);
  console.log(`Fixture: ${benchmark.fixture}`);
  console.log(`Sources: ${benchmark.sourceCount}`);
  console.log(`Pass: ${benchmark.pass}`);
  console.log(`Average product readiness: ${benchmark.aggregate.averageProductReadiness}%`);
  console.log(`Minimum product readiness: ${benchmark.aggregate.minProductReadiness}%`);
  console.log(`Average project quality: ${benchmark.aggregate.averageProjectQuality}%`);
  console.log(`Minimum project quality: ${benchmark.aggregate.minProjectQuality}%`);
  for (const summary of benchmark.sources) {
    console.log(`- ${summary.source.type}: ${summary.source.title}`);
    console.log(`  readiness=${summary.decomposition.productReadiness.level} ${summary.decomposition.productReadiness.score}% route=${summary.decomposition.route.quality} visuals=${summary.decomposition.visuals.quality} resources=${summary.decomposition.resources.quality}`);
    if (summary.decomposition.productReadiness.reasons.length) {
      console.log(`  reasons=${summary.decomposition.productReadiness.reasons.join('; ')}`);
    }
  }
}

function average(values = []) {
  if (!values.length) return 0;
  return Math.round(values.reduce((total, value) => total + value, 0) / values.length);
}

function printHelp() {
  console.log(`Usage: node scripts/evaluate-decomposition-quality.js [options]

Options:
  --provider none|api|claude-code   LLM provider to use. Default: none.
  --fixture long-paper|all          Built-in fixture. Use all for multi-source benchmark.
  --input value                     Fetch and evaluate a real DOI, URL, GitHub repo, or title.
  --input-file path.json            Load a normalized source JSON file.
  --timeout ms                      Deep extraction timeout. Default: 300000.
  --fallback                        Allow agent provider to fallback to direct API.
  --json                            Print machine-readable JSON.
`);
}

function builtInFixtures(name) {
  const fixtures = {
    'long-paper': longPaperFixture(),
    repository: repositoryFixture(),
    dataset: datasetFixture(),
    report: reportFixture(),
    news: newsFixture()
  };

  if (name === 'all') return Object.values(fixtures);
  if (!fixtures[name]) {
    throw new Error(`Unknown fixture: ${name}`);
  }

  return [fixtures[name]];
}

function longPaperFixture() {
  return {
    type: 'Paper',
    input: 'fixture://long-paper-source-object-graph',
    contentLevel: 'full_text',
    metadata: {
      type: 'Paper',
      title: 'Multi-source flood forecasting workflow with visual and reusable evidence',
      authors: [{ name: 'Example Researcher' }],
      year: 2026,
      venue: 'Teruvion Quality Fixtures',
      abstract: 'This fixture describes a source with data inputs, a forecasting model, evaluation figures, reusable data, and limitations.'
    },
    sections: {
      abstract: 'The study evaluates a flood forecasting workflow that transforms meteorological reanalysis inputs into five-day discharge forecasts and benchmarked warnings.',
      introduction: 'Forecasting ungauged watersheds requires linking data inputs, model architecture, evaluation evidence, spatial context, and reusable resources.',
      data: 'The workflow uses ERA5-Land precipitation and temperature, catchment attributes, historical discharge observations, and a reforecast archive. Reanalysis and reforecast data are available at https://doi.org/10.5281/zenodo.10397664.',
      methods: 'The method trains an encoder-decoder sequence model with LSTM layers. Meteorological forcings and catchment attributes are encoded, forecast horizons are decoded, and outputs are calibrated against observed discharge.',
      results: 'The model improves five-day extreme flood detection against a benchmark system. Figure 1 compares nowcast F1 differences; Figure 2 shows reliability by lead time and region.',
      discussion: 'The workflow is strongest for large basins with sufficient historical data. Performance in data-sparse small catchments and operational transfer to new regions remains uncertain.',
      resources: 'The implementation is linked from https://github.com/example/flood-forecast-workflow. The data archive supports reanalysis and reforecast reproduction.'
    },
    content: [
      'Abstract',
      'The study evaluates a flood forecasting workflow that transforms meteorological reanalysis inputs into five-day discharge forecasts and benchmarked warnings.',
      'Data',
      'The workflow uses ERA5-Land precipitation and temperature, catchment attributes, historical discharge observations, and a reforecast archive. Reanalysis and reforecast data are available at https://doi.org/10.5281/zenodo.10397664.',
      'Methods',
      'The method trains an encoder-decoder sequence model with LSTM layers. Meteorological forcings and catchment attributes are encoded, forecast horizons are decoded, and outputs are calibrated against observed discharge.',
      'Results',
      'The model improves five-day extreme flood detection against a benchmark system. Figure 1 compares nowcast F1 differences; Figure 2 shows reliability by lead time and region.',
      'Discussion',
      'The workflow is strongest for large basins with sufficient historical data. Performance in data-sparse small catchments and operational transfer to new regions remains uncertain.'
    ].join('\n\n'),
    figures: [{
      label: 'Figure 1',
      kind: 'figure',
      caption: 'Differences between nowcast F1 scores for two-year return period flood events between the AI model and the benchmark system.',
      imageUrl: 'https://example.org/figures/figure-1.png'
    }, {
      label: 'Figure 2',
      kind: 'figure',
      caption: 'Reliability curves by forecast lead time and region, showing uncertainty and benchmark comparison.',
      imageUrl: 'https://example.org/figures/figure-2.png'
    }],
    resources: [{
      label: 'Reforecast data archive',
      url: 'https://doi.org/10.5281/zenodo.10397664',
      type: 'dataset',
      role: 'Provides model inputs and forecast outputs.'
    }, {
      label: 'Workflow implementation',
      url: 'https://github.com/example/flood-forecast-workflow',
      type: 'repository',
      role: 'Documents implementation and reproducibility path.'
    }],
    provenance: {
      source: 'fixture://long-paper-source-object-graph',
      level: 'full_text'
    }
  };
}

function repositoryFixture() {
  return {
    type: 'Repository',
    input: 'https://github.com/example/flood-forecast-workflow',
    contentLevel: 'full_text',
    metadata: {
      type: 'Repository',
      title: 'Flood forecast workflow repository',
      url: 'https://github.com/example/flood-forecast-workflow',
      resources: [{
        label: 'Example model card',
        url: 'https://example.org/model-card',
        type: 'documentation'
      }]
    },
    sections: {
      readme: 'This repository implements a flood forecasting workflow. The pipeline prepares ERA5-Land forcing data, trains an LSTM encoder-decoder model, evaluates benchmark skill, and exports forecast artifacts.',
      installation: 'Dependencies are listed in package.json and requirements.txt. The workflow can be run with npm test and python train.py after data paths are configured.',
      data: 'Input data are expected under data/raw and include precipitation, temperature, catchment attributes, and historical discharge observations.',
      reproducibility: 'The repository includes README instructions, scripts, tests, notebooks, and a license. Data access instructions are documented, but raw data are not bundled.'
    },
    content: [
      'README',
      'This repository implements a flood forecasting workflow.',
      'Pipeline',
      'The pipeline prepares ERA5-Land forcing data, trains an LSTM encoder-decoder model, evaluates benchmark skill, and exports forecast artifacts.',
      'Data',
      'Input data are expected under data/raw and include precipitation, temperature, catchment attributes, and historical discharge observations.',
      'Reproducibility',
      'The repository includes README instructions, scripts, tests, notebooks, and a license. Data access instructions are documented, but raw data are not bundled.'
    ].join('\n\n'),
    resources: [{
      label: 'Repository',
      url: 'https://github.com/example/flood-forecast-workflow',
      type: 'repository',
      role: 'Implementation and reproducibility path.'
    }]
  };
}

function datasetFixture() {
  return {
    type: 'Dataset',
    input: 'fixture://dataset-era5-land',
    contentLevel: 'full_text',
    metadata: {
      type: 'Dataset',
      title: 'ERA5-Land forcing dataset',
      temporalCoverage: '1950-present',
      spatialCoverage: 'global',
      resources: [{
        label: 'Dataset landing page',
        url: 'https://example.org/datasets/era5-land',
        type: 'dataset'
      }]
    },
    sections: {
      overview: 'ERA5-Land provides hourly global land-surface forcing variables at 9 km resolution.',
      variables: 'Variables include precipitation, 2m temperature, soil moisture, evapotranspiration, runoff, snow depth, and radiation.',
      coverage: 'The dataset covers global land areas from 1950 to present with hourly temporal resolution.',
      access: 'Data are accessed through a catalog API and can be downloaded as NetCDF or GRIB files.'
    },
    content: [
      'Overview',
      'ERA5-Land provides hourly global land-surface forcing variables at 9 km resolution.',
      'Variables',
      'Variables include precipitation, 2m temperature, soil moisture, evapotranspiration, runoff, snow depth, and radiation.',
      'Coverage',
      'The dataset covers global land areas from 1950 to present with hourly temporal resolution.',
      'Access',
      'Data are accessed through a catalog API and can be downloaded as NetCDF or GRIB files.'
    ].join('\n\n'),
    resources: [{
      label: 'Dataset catalog',
      url: 'https://example.org/datasets/era5-land',
      type: 'dataset',
      role: 'Provides data access and metadata.'
    }]
  };
}

function reportFixture() {
  return {
    type: 'Report',
    input: 'fixture://wmo-early-warning-report',
    contentLevel: 'full_text',
    metadata: {
      type: 'Report',
      title: 'Early warning coverage and climate risk assessment',
      year: 2026,
      institution: 'Example Meteorological Organization'
    },
    sections: {
      summary: 'The report assesses gaps in early warning coverage for climate hazards and recommends investments in observation networks, alert dissemination, and local response capacity.',
      indicators: 'Indicators include population coverage, warning lead time, observation station density, and response plan availability.',
      findings: 'Coverage remains lowest in vulnerable regions with high flood and heat risk. Strengthening governance and communication channels improves warning uptake.',
      actions: 'Recommended actions include expanding observation networks, integrating risk data, funding local response plans, and monitoring progress annually.'
    },
    content: [
      'Summary',
      'The report assesses gaps in early warning coverage for climate hazards and recommends investments in observation networks, alert dissemination, and local response capacity.',
      'Indicators',
      'Indicators include population coverage, warning lead time, observation station density, and response plan availability.',
      'Findings',
      'Coverage remains lowest in vulnerable regions with high flood and heat risk. Strengthening governance and communication channels improves warning uptake.',
      'Actions',
      'Recommended actions include expanding observation networks, integrating risk data, funding local response plans, and monitoring progress annually.'
    ].join('\n\n')
  };
}

function newsFixture() {
  return {
    type: 'News',
    input: 'fixture://flood-event-news',
    contentLevel: 'full_text',
    metadata: {
      type: 'News',
      title: 'Severe flooding disrupts transport and power in delta region',
      date: '2026-05-12',
      location: 'Example Delta Region'
    },
    sections: {
      event: 'Severe flooding affected the Example Delta Region after three days of heavy rainfall. Roads, power substations, and agricultural areas were disrupted.',
      impact: 'Authorities reported evacuations, transport delays, crop losses, and temporary power outages across several districts.',
      response: 'Emergency teams opened shelters, restored critical roads, and warned residents to avoid flooded low-lying areas.',
      context: 'The event followed above-average seasonal rainfall and exposed drainage and infrastructure vulnerabilities.'
    },
    content: [
      'Event',
      'Severe flooding affected the Example Delta Region after three days of heavy rainfall. Roads, power substations, and agricultural areas were disrupted.',
      'Impact',
      'Authorities reported evacuations, transport delays, crop losses, and temporary power outages across several districts.',
      'Response',
      'Emergency teams opened shelters, restored critical roads, and warned residents to avoid flooded low-lying areas.',
      'Context',
      'The event followed above-average seasonal rainfall and exposed drainage and infrastructure vulnerabilities.'
    ].join('\n\n')
  };
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
