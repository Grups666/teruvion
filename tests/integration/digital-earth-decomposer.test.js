/**
 * Digital Earth Decomposer Tests
 */

const { assert, describe, it } = require('../setup');
const DigitalEarthDecomposer = require('../../core/understanding/DigitalEarthDecomposer');

describe('Digital Earth Decomposer', () => {
  it('should create source object for any input', async () => {
    const decomposer = new DigitalEarthDecomposer();
    const admissionResult = {
      sourceType: 'Paper',
      depth: 'light',
      activatedCategories: [],
      activatedOntologyLayers: ['source'],
      sourceRoles: { earth_content: 0.5 },
      primaryRole: 'earth_content',
      admitted: true
    };

    const result = await decomposer.decompose('10.1038/test-paper', {
      metadata: { title: 'Test Paper', doi: '10.1038/test-paper' }
    }, admissionResult);

    assert.ok(result.sourceObject, 'Should create source object');
    assert.strictEqual(result.sourceObject.type, 'Paper', 'Should be Paper type');
    assert.strictEqual(result.sourceObject.attributes.title, 'Test Paper');
  });

  it('should normalize article source type to Paper', async () => {
    const decomposer = new DigitalEarthDecomposer();
    const admissionResult = {
      sourceType: 'article',
      depth: 'light',
      activatedCategories: [],
      activatedOntologyLayers: ['source'],
      sourceRoles: { earth_content: 0.5 },
      primaryRole: 'earth_content',
      admitted: true
    };

    const result = await decomposer.decompose('https://publisher.example/article/1', {
      metadata: { title: 'Publisher Article' }
    }, admissionResult);

    assert.strictEqual(result.sourceType, 'Paper');
    assert.strictEqual(result.sourceObject.type, 'Paper');
  });

  it('should expose paper figures as visual evidence for inspection', async () => {
    const decomposer = new DigitalEarthDecomposer(null, { useLLM: false });
    const admissionResult = {
      sourceType: 'Paper',
      depth: 'structured',
      activatedCategories: ['evidence', 'modeling'],
      activatedOntologyLayers: ['source', 'capability'],
      sourceRoles: { earth_content: 0.8 },
      primaryRole: 'earth_content',
      admitted: true
    };

    const result = await decomposer.decompose('10.1038/example', {
      metadata: {
        title: 'Example AI flood forecasting paper',
        doi: '10.1038/example',
        url: 'https://publisher.example/articles/example'
      },
      sections: {
        methods: 'The model evaluates flood forecast reliability with precision and recall metrics. '.repeat(8)
      },
      figures: [{
        number: 'Figure 1',
        caption: 'Figure 1: Precision and recall distributions for flood forecast reliability across evaluation gauges.',
        imageUrl: 'https://publisher.example/articles/example/figures/1.png'
      }],
      provenance: {
        source: 'publisher_html',
        url: 'https://publisher.example/articles/example',
        retrievedAt: '2026-06-13T00:00:00.000Z'
      }
    }, admissionResult);

    assert.ok(Array.isArray(result.visualEvidence), 'Should expose visual evidence array');
    assert.strictEqual(result.visualEvidence.length, 1, 'Should preserve source figure evidence');
    assert.strictEqual(result.visualEvidence[0].label, 'Figure 1');
    assert.strictEqual(result.visualEvidence[0].routeRole, 'Evaluation evidence');
    assert.strictEqual(result.visualEvidence[0].imageUrl, 'https://publisher.example/articles/example/figures/1.png');
    assert.ok(result.visualEvidence[0].readHint.includes('metrics'), 'Should explain how to read the visual evidence');
  });

  it('should require visual evidence to be interpreted, not only retained', async () => {
    const decomposer = new DigitalEarthDecomposer(null, { useLLM: false });
    const admissionResult = {
      sourceType: 'Paper',
      depth: 'structured',
      activatedCategories: ['evidence', 'modeling'],
      activatedOntologyLayers: ['source', 'capability'],
      sourceRoles: { earth_content: 0.8 },
      primaryRole: 'earth_content',
      admitted: true
    };

    const result = await decomposer.decompose('10.1038/visual-gap', {
      metadata: {
        title: 'Visual evidence gap paper',
        doi: '10.1038/visual-gap',
        url: 'https://publisher.example/articles/visual-gap'
      },
      sections: {
        methods: 'The method compares model outputs with observed events.',
        results: 'The results report evaluation skill and error patterns.'
      },
      figures: [{
        number: 'Figure 1',
        caption: 'Figure 1: Error patterns across observed events and model forecasts.'
      }, {
        number: 'Figure 2',
        caption: 'Figure 2: Evaluation skill by lead time.'
      }]
    }, admissionResult);

    assert.strictEqual(result.extractionIntegrity.visualEvidenceQuality.level, 'weak');
    assert.strictEqual(result.extractionIntegrity.visualEvidenceQuality.visualCount, 2);
    assert.strictEqual(result.extractionIntegrity.visualEvidenceQuality.explainedCount, 0);
    assert.ok(
      result.extractionIntegrity.issues.some(issue => issue.id === 'visual-evidence'),
      'Should surface unexplained figures as an integrity issue'
    );
  });

  it('should require reusable resources to be linked and reviewable', async () => {
    const decomposer = new DigitalEarthDecomposer(null, { useLLM: false });
    const admissionResult = {
      sourceType: 'Paper',
      depth: 'structured',
      activatedCategories: ['data', 'modeling'],
      activatedOntologyLayers: ['source', 'capability'],
      sourceRoles: { modeling_capability: 0.8 },
      primaryRole: 'modeling_capability',
      admitted: true
    };

    const result = await decomposer.decompose('10.1038/resource-gap', {
      metadata: {
        title: 'Resource graph gap paper',
        doi: '10.1038/resource-gap',
        resources: [{
          url: 'https://example.org/archive/input-data',
          type: 'dataset',
          label: 'Input data archive',
          role: '',
          routeRelevance: '',
          verificationFocus: '',
          reviewHint: ''
        }]
      },
      sections: {
        abstract: 'The source describes a model but does not state how the external data archive links to the route.',
        methods: 'The model uses generic inputs to produce forecasts.'
      }
    }, admissionResult);

    assert.strictEqual(result.extractionIntegrity.resourceGraphQuality.level, 'weak');
    assert.strictEqual(result.extractionIntegrity.resourceGraphQuality.reusableResourceCount >= 1, true);
    assert.ok(
      result.extractionIntegrity.issues.some(issue => issue.id === 'resource-graph-quality'),
      'Should surface weak resource graph quality as an integrity issue'
    );
  });

  it('should preserve normalized paper metadata from connector top-level fields', async () => {
    const decomposer = new DigitalEarthDecomposer(null, { useLLM: false });
    const admissionResult = {
      sourceType: 'article',
      depth: 'structured',
      activatedCategories: [],
      activatedOntologyLayers: ['source'],
      sourceRoles: { earth_content: 0.7 },
      primaryRole: 'earth_content',
      admitted: true
    };

    const result = await decomposer.decompose('https://publisher.example/paper', {
      title: 'A reusable source-to-graph study',
      abstract: 'This study describes a reusable route for extracting research objects from source material.',
      authors: [{ name: 'A. Researcher' }, { name: 'B. Builder' }],
      year: 2026,
      venue: 'Journal of Source Graphs',
      metadata: {
        display_name: 'Raw OpenAlex title'
      }
    }, admissionResult);

    assert.strictEqual(result.sourceObject.attributes.title, 'A reusable source-to-graph study');
    assert.strictEqual(result.sourceObject.attributes.year, 2026);
    assert.strictEqual(result.sourceObject.attributes.venue, 'Journal of Source Graphs');
    assert.strictEqual(result.researchBrief.authors, 'A. Researcher, B. Builder');
    assert.strictEqual(result.researchBrief.year, 2026);
    assert.strictEqual(result.researchBrief.venue, 'Journal of Source Graphs');
  });

  it('should use connector content field as LLM source text', async () => {
    const sourceText = [
      '## Methods',
      'The AI flood model uses an LSTM architecture for streamflow forecasting.',
      'The AI flood model uses an LSTM architecture for streamflow forecasting.',
      'The AI flood model uses an LSTM architecture for streamflow forecasting.'
    ].join('\n');
    const llm = {
      async chat() {
        return {
          content: JSON.stringify({
            capabilityObjects: [{
              type: 'Model',
              attributes: { name: 'AI flood model' },
              provenance: {
                section: 'methods',
                sourceText: 'The AI flood model uses an LSTM architecture for streamflow forecasting.'
              },
              confidence: 0.8
            }],
            worldObjects: [],
            evidenceObjects: [],
            bridgeRelations: []
          })
        };
      }
    };
    const decomposer = new DigitalEarthDecomposer(llm);
    const admissionResult = {
      sourceType: 'Paper',
      depth: 'deep',
      activatedCategories: ['modeling', 'data', 'earth-object'],
      activatedOntologyLayers: ['source', 'capability', 'world'],
      sourceRoles: { modeling_capability: 0.9, data_capability: 0.7, earth_content: 0.7 },
      primaryRole: 'modeling_capability',
      admitted: true
    };

    const result = await decomposer.decompose('10.1038/test-paper', {
      type: 'paper',
      title: 'Paper with connector content',
      content: sourceText,
      metadata: { title: 'Paper with connector content' }
    }, admissionResult);

    assert.strictEqual(result.provenance.extractionMethod, 'hybrid');
    assert.ok(result.capabilityObjects.some(obj => obj.type === 'Model'), 'Should extract Model from content.content');
    assert.strictEqual(result.extractionMetadata.llmExtraction.success, true);
  });

  it('should route deep decomposition through the configured agent task contract', async () => {
    const calls = [];
    const llm = {
      getAgentStatus() {
        return { enabled: true, provider: 'claude-code' };
      },
      async chat(params) {
        calls.push(params);
        const userText = params.messages?.map(message => message.content).join('\n') || '';
        if (userText.includes('"task": "Critical Review"')) {
          return { content: JSON.stringify({ limitations: [] }) };
        }

        return {
          agent: { provider: 'claude-code', success: true },
          content: JSON.stringify({
            capabilityObjects: [{
              type: 'Model',
              attributes: { name: 'Flood forecasting LSTM' },
              provenance: {
                sourceText: 'The model uses an encoder-decoder LSTM for flood forecasting.'
              },
              confidence: 0.85
            }],
            worldObjects: [],
            evidenceObjects: [],
            bridgeRelations: [],
            researchRoute: {
              nodes: [
                {
                  id: 'lstm-model',
                  label: 'Encoder-decoder LSTM',
                  type: 'Method',
                  stage: 'method',
                  summary: 'Forecasting model described by the source.'
                }
              ],
              edges: []
            }
          })
        };
      }
    };
    const decomposer = new DigitalEarthDecomposer(llm);
    const admissionResult = {
      sourceType: 'Paper',
      depth: 'deep',
      activatedCategories: ['modeling'],
      activatedOntologyLayers: ['source', 'capability'],
      sourceRoles: { modeling_capability: 0.9 },
      primaryRole: 'modeling_capability',
      admitted: true
    };

    const result = await decomposer.decompose('10.1038/agent-contract', {
      type: 'paper',
      title: 'Agent contract paper',
      content: [
        'Abstract',
        'The model uses an encoder-decoder LSTM for flood forecasting.',
        'Methods',
        'The encoder-decoder LSTM transforms meteorological inputs into streamflow forecasts.'
      ].join('\n'),
      metadata: { title: 'Agent contract paper' }
    }, admissionResult);

    const extractionCall = calls.find(call => call.agentTask === 'source-to-object-graph-decomposition');
    assert.ok(extractionCall, 'Should call the LLM wrapper with a deep decomposition agent task');
    assert.strictEqual(extractionCall.agentSchema, 'source-object-graph-v1');
    assert.ok(extractionCall.timeout >= 300000, 'Deep decomposition should allow long-running agent harnesses');
    assert.ok(extractionCall.messages[0].content.includes('source-to-object-graph extraction worker'), 'Agent system prompt should bind Claude Code to extraction work');
    assert.ok(extractionCall.messages[0].content.includes('Do not inspect files'), 'Agent system prompt should not let Claude Code act as a repo/code worker');
    assert.ok(extractionCall.messages[1].content.includes('source-object-graph-v1'), 'Agent user prompt should declare the extraction schema');
    assert.ok(extractionCall.messages[1].content.includes('"sourceBrief"'), 'Agent prompt should request a user-facing low-loss source brief');
    assert.ok(extractionCall.messages[1].content.includes('"figureAnalyses"'), 'Agent prompt should request figure-level extraction hints');
    assert.ok(extractionCall.messages[1].content.includes('"resourceLinks"'), 'Agent prompt should request resource graph links');
    assert.strictEqual(result.extractionMetadata.llmExtraction.agentProvider, 'claude-code');
    assert.strictEqual(result.extractionMetadata.llmExtraction.agentTask, 'source-to-object-graph-decomposition');
    assert.strictEqual(result.extractionMetadata.llmExtraction.schemaVersion, 'source-object-graph-v1');
    assert.strictEqual(result.extractionMetadata.llmExtraction.success, true);
  });

  it('should recompose LLM insights into brief, gaps, and figure evidence', async () => {
    const llm = {
      async chat(params) {
        const userText = params.messages?.map(message => message.content).join('\n') || '';
        if (userText.includes('"task": "Critical Review"')) {
          return { content: JSON.stringify({ limitations: [] }) };
        }

        return {
          agent: { provider: 'claude-code', success: true },
          content: JSON.stringify({
            sourceBrief: {
              oneLine: 'The paper evaluates a forecast model that turns meteorological inputs into streamflow forecasts and compares skill against a benchmark.',
              keyPoints: [{
                id: 'brief-route',
                label: 'Technical Route',
                value: 'Meteorological inputs feed a sequence forecast model',
                detail: 'The route connects input variables, the forecasting model, and benchmark skill evidence.',
                provenance: { section: 'methods', sourceText: 'The model transforms meteorological inputs into streamflow forecasts.' },
                support: { routeNodeId: 'input-data' }
              }, {
                id: 'brief-internal',
                label: 'System State',
                value: 'Paper',
                detail: 'Internal label that should not become user-facing content.',
                provenance: { section: 'abstract', sourceText: 'This study evaluates a forecast model against a benchmark.' }
              }]
            },
            capabilityObjects: [{
              type: 'Model',
              attributes: { name: 'Sequence forecast model' },
              provenance: { section: 'methods', sourceText: 'The model transforms meteorological inputs into streamflow forecasts.' },
              confidence: 0.8
            }],
            worldObjects: [],
            evidenceObjects: [{
              type: 'Claim',
              attributes: { statement: 'The model improves forecast skill against the benchmark.' },
              provenance: { section: 'results', sourceText: 'The model improves forecast skill against the benchmark.' },
              confidence: 0.75
            }],
            bridgeRelations: [],
            keyFindings: [{
              id: 'skill-finding',
              label: 'Forecast skill improves',
              statement: 'The model improves forecast skill against the benchmark.',
              evidence: 'Reported in the results section.',
              section: 'results'
            }],
            researchGaps: [{
              id: 'external-validity',
              label: 'External validity needs review',
              detail: 'The excerpt does not prove whether the model generalizes beyond the reported evaluation.',
              severity: 'warning',
              section: 'discussion'
            }],
            figureAnalyses: [{
              figureId: 'Figure 1',
              interpretation: 'Figure 1 compares the model and benchmark across evaluation events.',
              howProduced: 'Computed from forecast scores over the evaluation period.',
              supportedClaim: 'Supports the reported benchmark comparison.'
            }],
            resourceLinks: [{
              url: 'https://zenodo.org/records/12345',
              routeNodeId: 'input-data',
              role: 'provides_input',
              evidence: 'The source states that the dataset archive provides evaluation inputs.',
              confidence: 0.82
            }],
            researchRoute: {
              nodes: [
                { id: 'input-data', label: 'Meteorological inputs', stage: 'data', type: 'Data', summary: 'Inputs for the forecast model.' },
                { id: 'model', label: 'Sequence forecast model', stage: 'method', type: 'Method', summary: 'Transforms inputs into forecasts.' },
                { id: 'skill', label: 'Benchmark skill comparison', stage: 'evidence', type: 'Evidence', summary: 'Compares model skill against a benchmark.' }
              ],
              edges: [
                { from: 'input-data', to: 'model', label: 'feeds' },
                { from: 'model', to: 'skill', label: 'supports' }
              ]
            }
          })
        };
      }
    };
    const decomposer = new DigitalEarthDecomposer(llm);
    const admissionResult = {
      sourceType: 'Paper',
      depth: 'deep',
      activatedCategories: ['modeling', 'evidence'],
      activatedOntologyLayers: ['source', 'capability'],
      sourceRoles: { modeling_capability: 0.9 },
      primaryRole: 'modeling_capability',
      admitted: true
    };

    const result = await decomposer.decompose('10.5555/insight-paper', {
      type: 'paper',
      title: 'Insight paper',
      content: [
        'Abstract',
        'This study evaluates a forecast model against a benchmark.',
        'Methods',
        'The model transforms meteorological inputs into streamflow forecasts.',
        'Results',
        'The model improves forecast skill against the benchmark.'
      ].join('\n'),
      figures: [{
        number: 'Figure 1',
        caption: 'Figure 1: Model and benchmark forecast skill comparison.'
      }],
      metadata: {
        title: 'Insight paper',
        resources: [{
          url: 'https://zenodo.org/records/12345',
          type: 'dataset',
          label: 'Evaluation data archive'
        }]
      }
    }, admissionResult);

    assert.strictEqual(result.extractionMetadata.llmExtraction.agentProvider, 'claude-code');
    assert.strictEqual(result.extractionMetadata.llmExtraction.keyFindingCount, 1);
    assert.strictEqual(result.extractionMetadata.llmExtraction.researchGapCount, 1);
    assert.strictEqual(result.extractionMetadata.llmExtraction.figureAnalysisCount, 1);
    assert.strictEqual(result.extractionMetadata.llmExtraction.resourceLinkCount, 1);
    assert.ok(result.researchBrief.oneLine.includes('forecast model'), 'Should preserve agent sourceBrief as product-level summary');
    assert.strictEqual(result.researchBrief.keyPoints[0].id, 'brief-route', 'SourceBrief key points should lead the user-facing brief');
    assert.ok(result.researchBrief.keyPoints.every(point => point.value !== 'Paper'), 'SourceBrief must not expose internal source/container labels');
    assert.ok(result.researchBrief.keyPoints.some(point => point.id === 'skill-finding'), 'Should expose LLM key finding in brief highlights');
    assert.ok(result.inferredLimitations.some(item => item.id === 'external-validity'), 'Should expose LLM research gap as limitation');
    assert.ok(result.visualEvidence.some(item => item.label === 'Figure 1' && item.interpretation?.includes('compares the model')), 'Should enrich visual evidence with figure analysis');
    assert.notStrictEqual(result.extractionIntegrity.briefQuality.level, 'weak', 'Grounded LLM insights and route support should keep brief reviewable');
    assert.ok(result.extractionIntegrity.briefQuality.groundedPointCount >= 4, 'Brief points should be grounded in insights, route nodes, objects, or resources');
    assert.strictEqual(result.extractionIntegrity.visualEvidenceQuality.level, 'complete', 'LLM figure analysis should satisfy visual evidence quality');
    assert.strictEqual(result.extractionIntegrity.visualEvidenceQuality.explainedCount, 1);
    assert.ok(result.resourceGraph.edges.some(edge => edge.label === 'provides_input' && edge.provenance?.method === 'llm-resource-link'), 'Should add validated LLM resource links to ResourceGraph');
  });

  it('should preserve agent-derived figure evidence and link resources to visual nodes', async () => {
    const llm = {
      async chat(params) {
        const userText = params.messages?.map(message => message.content).join('\n') || '';
        if (userText.includes('"task": "Critical Review"')) {
          return { content: JSON.stringify({ limitations: [] }) };
        }

        return {
          agent: { provider: 'claude-code', success: true },
          content: JSON.stringify({
            capabilityObjects: [{
              id: 'forecast-model',
              type: 'Model',
              name: 'Forecast model',
              description: 'Transforms forcing inputs into streamflow forecasts.',
              provenance: { section: 'methods', sourceText: 'The forecast model transforms forcing inputs into streamflow forecasts.' },
              confidence: 0.8
            }],
            worldObjects: [],
            evidenceObjects: [{
              id: 'skill-claim',
              type: 'Claim',
              name: 'Benchmark skill improves',
              statement: 'The model improves benchmark skill.',
              provenance: { section: 'results', sourceText: 'The model improves benchmark skill.' },
              confidence: 0.74
            }],
            bridgeRelations: [],
            figureAnalyses: [{
              figureId: 'Figure 2',
              caption: 'Figure 2: Benchmark skill difference across evaluation sites.',
              interpretation: 'The figure shows where forecast skill improves or degrades against the benchmark.',
              howProduced: 'Computed from benchmark skill differences across evaluation sites.',
              supportedClaim: 'Supports the benchmark skill improvement claim.',
              routeNodeId: 'skill-node',
              provenance: { section: 'results', sourceText: 'Figure 2 shows benchmark skill difference across evaluation sites.' }
            }],
            resourceLinks: [{
              url: 'https://example.org/supplement/figure-data',
              figureId: 'Figure 2',
              relation: 'supports_visual_evidence',
              role: 'figure data',
              evidence: 'Supplementary figure data supports Figure 2.',
              confidence: 0.78
            }],
            researchRoute: {
              nodes: [
                {
                  id: 'model-node',
                  label: 'Forecast model',
                  type: 'Model',
                  stage: 'method',
                  summary: 'Transforms forcing inputs into forecasts.',
                  provenance: { section: 'methods', sourceText: 'The forecast model transforms forcing inputs into streamflow forecasts.' },
                  children: [{ label: 'Transform', value: 'forcing inputs into forecasts', detail: 'Main model operation.' }]
                },
                {
                  id: 'skill-node',
                  label: 'Benchmark skill difference',
                  type: 'Finding',
                  stage: 'evidence',
                  summary: 'Skill difference across evaluation sites.',
                  provenance: { section: 'results', sourceText: 'Figure 2 shows benchmark skill difference across evaluation sites.' },
                  children: [{ label: 'Metric', value: 'benchmark skill difference', detail: 'Evaluation evidence.' }]
                }
              ],
              edges: [{ from: 'model-node', to: 'skill-node', label: 'evaluates' }]
            }
          })
        };
      }
    };
    const decomposer = new DigitalEarthDecomposer(llm);
    const admissionResult = {
      sourceType: 'Paper',
      depth: 'deep',
      activatedCategories: ['modeling', 'evidence'],
      activatedOntologyLayers: ['source', 'capability', 'foundation'],
      sourceRoles: { modeling_capability: 0.9 },
      primaryRole: 'modeling_capability',
      admitted: true
    };

    const result = await decomposer.decompose('10.5555/agent-figure', {
      type: 'paper',
      metadata: {
        title: 'Agent figure paper',
        resources: [{ url: 'https://example.org/supplement/figure-data', type: 'supplement', label: 'Figure data supplement' }]
      },
      content: [
        'Methods',
        'The forecast model transforms forcing inputs into streamflow forecasts.',
        'Results',
        'Figure 2 shows benchmark skill difference across evaluation sites.',
        'Supplementary figure data supports Figure 2.'
      ].join('\n')
    }, admissionResult);

    const figure = result.visualEvidence.find(item => item.label === 'Figure 2');
    assert.ok(figure, 'Agent figure analysis should create visual evidence when connector figures are absent');
    assert.strictEqual(figure.source, 'llm-figure-analysis');
    assert.ok(figure.interpretation.includes('forecast skill'), 'Agent visual interpretation should be preserved');
    assert.strictEqual(result.extractionIntegrity.visualEvidenceQuality.level, 'complete');
    assert.ok(
      result.resourceGraph.nodes.some(node => node.id === figure.id && node.kind === 'figure'),
      'ResourceGraph should expose visual evidence as linkable graph nodes'
    );
    assert.ok(
      result.resourceGraph.edges.some(edge => edge.to === figure.id && edge.label === 'supports_visual_evidence' && edge.provenance?.method === 'llm-resource-link'),
      'ResourceGraph should preserve explicit agent resource-to-figure relation'
    );
  });

  it('should merge fuzzy figure analysis with source figures instead of duplicating visuals', async () => {
    const llm = {
      async chat(params) {
        const userText = params.messages?.map(message => message.content).join('\n') || '';
        if (userText.includes('"task": "Critical Review"')) {
          return { content: JSON.stringify({ limitations: [] }) };
        }

        return {
          content: JSON.stringify({
            figureAnalyses: [{
              figure: 'model and benchmark skill comparison',
              caption: 'Model and benchmark forecast skill comparison over evaluation events.',
              interpretation: 'The visual compares forecast skill between the model and benchmark.',
              howProduced: 'It is produced from evaluation-period forecast scores.',
              supportedClaim: 'Supports the benchmark comparison claim.',
              provenance: {
                section: 'results',
                sourceText: 'Figure 1: Model and benchmark forecast skill comparison.'
              }
            }],
            researchRoute: {
              nodes: [
                { id: 'inputs', label: 'Meteorological inputs', stage: 'data', summary: 'Inputs for model evaluation.' },
                { id: 'model', label: 'Forecast model', stage: 'method', summary: 'Produces streamflow forecasts.' },
                { id: 'skill', label: 'Benchmark comparison', stage: 'evidence', summary: 'Compares forecast skill.' }
              ],
              edges: [
                { from: 'inputs', to: 'model', label: 'feeds' },
                { from: 'model', to: 'skill', label: 'evaluates' }
              ]
            }
          })
        };
      }
    };
    const decomposer = new DigitalEarthDecomposer(llm);
    const admissionResult = {
      sourceType: 'Paper',
      depth: 'deep',
      activatedCategories: ['modeling', 'evidence'],
      activatedOntologyLayers: ['source', 'capability'],
      sourceRoles: { modeling_capability: 0.9 },
      primaryRole: 'modeling_capability',
      admitted: true
    };

    const result = await decomposer.decompose('paper-with-figures', {
      type: 'paper',
      content: 'Methods\nThe forecast model produces streamflow forecasts.\nResults\nFigure 1: Model and benchmark forecast skill comparison.',
      figures: [{
        label: 'Figure 1',
        caption: 'Figure 1: Model and benchmark forecast skill comparison.'
      }]
    }, admissionResult);

    assert.strictEqual(result.visualEvidence.length, 1, 'Fuzzy figure analysis should enrich the source figure, not duplicate it');
    assert.ok(result.visualEvidence[0].interpretation.includes('forecast skill'));
    assert.strictEqual(result.extractionIntegrity.visualEvidenceQuality.level, 'complete');
  });

  it('should normalize agent schema aliases without losing content fields', async () => {
    const llm = {
      async chat(params) {
        const userText = params.messages?.map(message => message.content).join('\n') || '';
        if (userText.includes('"task": "Critical Review"')) {
          return { content: JSON.stringify({ limitations: [] }) };
        }

        return {
          agent: { provider: 'claude-code', success: true },
          content: JSON.stringify({
            capabilityObjects: [{
              id: 'sequence-model',
              type: 'Model',
              name: 'Sequence forecast model',
              description: 'Transforms meteorological inputs into streamflow forecasts.',
              properties: { architecture: 'encoder-decoder sequence model' },
              provenance: { section: 'methods', sourceText: 'The sequence forecast model transforms meteorological inputs into streamflow forecasts.' },
              confidence: 0.82
            }],
            worldObjects: [],
            evidenceObjects: [{
              id: 'skill-claim',
              type: 'Claim',
              name: 'Benchmark skill improves',
              statement: 'The model improves forecast skill against the benchmark.',
              provenance: { section: 'results', sourceText: 'The model improves forecast skill against the benchmark.' },
              confidence: 0.76
            }],
            bridgeRelations: [{
              from: 'sequence-model',
              to: 'skill-claim',
              type: 'supports',
              provenance: { section: 'results', sourceText: 'The model improves forecast skill against the benchmark.' }
            }],
            resourceLinks: [{
              url: 'https://zenodo.org/records/12345',
              routeNodeId: 'input-data',
              role: 'provides_input',
              evidence: 'The source states that the data archive provides model inputs.'
            }],
            researchRoute: {
              nodes: [
                { id: 'input-data', label: 'Meteorological inputs', stage: 'data', type: 'Data', summary: 'Input variables for the sequence model.' },
                { id: 'sequence-model', label: 'Sequence forecast model', stage: 'method', type: 'Method', summary: 'Transforms inputs into streamflow forecasts.' },
                { id: 'skill-claim', label: 'Benchmark skill improves', stage: 'evidence', type: 'Evidence', summary: 'Reported performance comparison.' }
              ],
              edges: [
                { from: 'input-data', to: 'sequence-model', label: 'feeds' },
                { from: 'sequence-model', to: 'skill-claim', label: 'supports' }
              ]
            }
          })
        };
      }
    };
    const decomposer = new DigitalEarthDecomposer(llm);
    const admissionResult = {
      sourceType: 'Paper',
      depth: 'deep',
      activatedCategories: ['modeling', 'data', 'evidence'],
      activatedOntologyLayers: ['source', 'capability', 'evidence'],
      sourceRoles: { modeling_capability: 0.9 },
      primaryRole: 'modeling_capability',
      admitted: true
    };

    const result = await decomposer.decompose('10.5555/schema-aliases', {
      type: 'paper',
      title: 'Schema alias paper',
      content: [
        'Methods',
        'The sequence forecast model transforms meteorological inputs into streamflow forecasts.',
        'Results',
        'The model improves forecast skill against the benchmark.',
        'Data availability',
        'The source states that the data archive provides model inputs.'
      ].join('\n'),
      metadata: {
        title: 'Schema alias paper',
        resources: [{ url: 'https://zenodo.org/records/12345', type: 'dataset', label: 'Model input archive' }]
      }
    }, admissionResult);

    const model = result.capabilityObjects.find(object => object.id === 'sequence-model');
    const claim = result.evidenceObjects.find(object => object.id === 'skill-claim');
    assert.strictEqual(model.attributes.name, 'Sequence forecast model');
    assert.strictEqual(model.attributes.description, 'Transforms meteorological inputs into streamflow forecasts.');
    assert.strictEqual(model.attributes.properties.architecture, 'encoder-decoder sequence model');
    assert.strictEqual(claim.attributes.statement, 'The model improves forecast skill against the benchmark.');
    assert.ok(result.resourceGraph.edges.some(edge => edge.provenance?.sourceText?.includes('data archive provides model inputs')), 'Resource link evidence should be preserved as provenance');
    assert.strictEqual(result.extractionIntegrity.schemaWarningCount, 0, 'Grounded schema aliases should not create quality warnings');
  });

  it('should normalize agent object-type aliases before entity storage', async () => {
    const llm = {
      async chat(params) {
        const userText = params.messages?.map(message => message.content).join('\n') || '';
        if (userText.includes('"task": "Critical Review"')) {
          return { content: JSON.stringify({ limitations: [] }) };
        }

        return {
          agent: { provider: 'claude-code', success: true },
          content: JSON.stringify({
            capabilityObjects: [{
              id: 'forecast-model',
              type: 'ModelObject',
              name: 'Forecast model',
              description: 'Transforms weather inputs into discharge forecasts.',
              provenance: { section: 'methods', sourceText: 'The forecast model transforms weather inputs into discharge forecasts.' },
              confidence: 0.83
            }],
            worldObjects: [{
              id: 'study-region',
              type: 'RegionObject',
              name: 'Study region',
              description: 'The evaluated river basins.',
              provenance: { section: 'study area', sourceText: 'The evaluated river basins are the study region.' },
              confidence: 0.78
            }],
            evidenceObjects: [{
              id: 'figure-skill',
              type: 'FigureObject',
              name: 'Skill comparison figure',
              statement: 'The figure compares forecast skill.',
              provenance: { section: 'figure 1', sourceText: 'Figure 1 compares forecast skill.' },
              confidence: 0.74
            }, {
              id: 'stated-limitation',
              type: 'Limitation',
              name: 'Limited evaluation scope',
              statement: 'The evaluation scope is limited.',
              provenance: { section: 'limitations', sourceText: 'The evaluation scope is limited.' },
              confidence: 0.71
            }],
            bridgeRelations: [],
            researchRoute: {
              nodes: [
                { id: 'forecast-model', label: 'Forecast model', stage: 'method', type: 'Model', summary: 'Transforms weather inputs.' },
                { id: 'figure-skill', label: 'Skill comparison', stage: 'evidence', type: 'Evidence', summary: 'Compares forecast skill.' }
              ],
              edges: [{ from: 'forecast-model', to: 'figure-skill', label: 'evaluated by' }]
            }
          })
        };
      }
    };
    const decomposer = new DigitalEarthDecomposer(llm);
    const admissionResult = {
      sourceType: 'Paper',
      depth: 'deep',
      activatedCategories: ['modeling', 'earth-object', 'evidence'],
      activatedOntologyLayers: ['source', 'capability', 'world', 'evidence'],
      sourceRoles: { modeling_capability: 0.9 },
      primaryRole: 'modeling_capability',
      admitted: true
    };

    const result = await decomposer.decompose('10.5555/object-aliases', {
      type: 'paper',
      title: 'Object alias paper',
      content: [
        'Methods',
        'The forecast model transforms weather inputs into discharge forecasts.',
        'Study area',
        'The evaluated river basins are the study region.',
        'Results',
        'Figure 1 compares forecast skill.'
      ].join('\n')
    }, admissionResult);

    assert.strictEqual(result.capabilityObjects.find(object => object.id === 'forecast-model').type, 'Model');
    assert.strictEqual(result.worldObjects.find(object => object.id === 'study-region').type, 'Region');
    assert.strictEqual(result.evidenceObjects.find(object => object.id === 'figure-skill').type, 'Evidence');
    assert.strictEqual(result.evidenceObjects.find(object => object.id === 'stated-limitation').type, 'Uncertainty');
    assert.strictEqual(result.capabilityObjects.find(object => object.id === 'forecast-model').metadata.originalLLMType, 'ModelObject');
  });

  it('should repair minor agent JSON syntax issues before schema validation', async () => {
    const llm = {
      async chat(params) {
        const userText = params.messages?.map(message => message.content).join('\n') || '';
        if (userText.includes('"task": "Critical Review"')) {
          return { content: JSON.stringify({ limitations: [] }) };
        }

        return {
          agent: { provider: 'claude-code', success: true },
          content: `{
            "capabilityObjects": [{
              "id": "workflow",
              "type": "WorkflowObject",
              "name": "Repository workflow",
              "description": "Prepares data and runs model evaluation.",
              "provenance": { "section": "readme", "sourceText": "The repository prepares data and runs model evaluation." },
              "confidence": 0.8,
            }],
            "worldObjects": [],
            "evidenceObjects": [],
            "bridgeRelations": [],
            "researchRoute": {
              "nodes": [
                { "id": "data", "label": "Input data", "stage": "data", "summary": "Input data for model evaluation." },
                { "id": "workflow", "label": "Repository workflow", "stage": "execution", "summary": "Prepares data and runs model evaluation." }
              ],
              "edges": [{ "from": "data", "to": "workflow", "label": "feeds" }],
            },
          }`
        };
      }
    };
    const decomposer = new DigitalEarthDecomposer(llm);
    const admissionResult = {
      sourceType: 'Repository',
      depth: 'deep',
      activatedCategories: ['computing', 'data'],
      activatedOntologyLayers: ['source', 'capability'],
      sourceRoles: { modeling_capability: 0.9 },
      primaryRole: 'modeling_capability',
      admitted: true
    };

    const result = await decomposer.decompose('https://github.com/example/workflow', {
      type: 'Repository',
      content: [
        'README',
        'The repository prepares data and runs model evaluation.',
        'The workflow reads configured input files, prepares intermediate artifacts, executes the model, and records benchmark outputs for review.'
      ].join('\n')
    }, admissionResult);

    assert.strictEqual(result.extractionMetadata.llmExtraction.success, true);
    assert.strictEqual(result.provenance.extractionMethod, 'hybrid');
    assert.ok(result.extractionMetadata.llmExtraction.schemaWarnings.some(warning => warning.includes('LLM JSON repaired')));
    assert.ok(result.workflowOutline.nodes.some(node => node.label === 'Repository workflow'));
  });

  it('should reject malformed LLM schema and preserve diagnostic visibility', async () => {
    const llm = {
      async chat(params) {
        const userText = params.messages?.map(message => message.content).join('\n') || '';
        if (userText.includes('"task": "Critical Review"')) {
          return { content: JSON.stringify({ limitations: [] }) };
        }

        return {
          agent: { provider: 'claude-code', success: true },
          content: JSON.stringify({
            capabilityObjects: { bad: true },
            worldObjects: [],
            evidenceObjects: [],
            bridgeRelations: [{ from: 'method' }],
            researchRoute: { nodes: 'bad', edges: 'bad' }
          })
        };
      }
    };
    const decomposer = new DigitalEarthDecomposer(llm);
    const admissionResult = {
      sourceType: 'Paper',
      depth: 'deep',
      activatedCategories: ['modeling'],
      activatedOntologyLayers: ['source', 'capability'],
      sourceRoles: { modeling_capability: 0.9 },
      primaryRole: 'modeling_capability',
      admitted: true
    };

    const result = await decomposer.decompose('10.1038/bad-schema', {
      type: 'paper',
      title: 'Bad schema paper',
      content: [
        'Abstract',
        'Here we show that artificial intelligence-based forecasting predicts extreme riverine events in ungauged watersheds.',
        'Methods',
        'The AI streamflow forecasting model uses an encoder-decoder model with LSTM networks over meteorological input data and forecast horizons.',
        'Data availability',
        'Reanalysis and reforecast data produced by the model are available at https://doi.org/10.5281/zenodo.10397664 for review.'
      ].join('\n'),
      metadata: { title: 'Bad schema paper' }
    }, admissionResult);

    assert.strictEqual(result.extractionMetadata.llmExtraction.success, false);
    assert.notStrictEqual(result.provenance.extractionMethod, 'hybrid');
    assert.ok(result.extractionMetadata.llmExtraction.schemaWarnings.length > 0, 'Should expose malformed schema warnings');
    assert.ok(result.extractionIntegrity.issues.some(issue => issue.id === 'schema-quality'), 'Schema warnings should be surfaced as extraction integrity issues');
    assert.ok(result.workflowOutline?.nodes?.length > 0, 'Should still expose a fallback route');
  });

  it('should preserve deep extraction request errors as visible fallback diagnostics', async () => {
    const llm = {
      getAgentStatus() {
        return { enabled: true, provider: 'claude-code' };
      },
      async chat(params) {
        const userText = params.messages?.map(message => message.content).join('\n') || '';
        if (userText.includes('"task": "Critical Review"')) {
          return { content: JSON.stringify({ limitations: [] }) };
        }
        throw new Error('Claude Code agent timed out after 300000ms');
      }
    };
    const decomposer = new DigitalEarthDecomposer(llm);
    const admissionResult = {
      sourceType: 'Paper',
      depth: 'deep',
      activatedCategories: ['modeling', 'data'],
      activatedOntologyLayers: ['source', 'capability'],
      sourceRoles: { modeling_capability: 0.9 },
      primaryRole: 'modeling_capability',
      admitted: true
    };

    const result = await decomposer.decompose('10.5555/timeout-paper', {
      type: 'paper',
      title: 'Timeout paper',
      content: [
        'Abstract',
        'This paper uses a forecasting model to predict streamflow from meteorological inputs.',
        'Methods',
        'The model consumes input data and produces forecast outputs for evaluation.'
      ].join('\n'),
      sections: {
        abstract: 'This paper uses a forecasting model to predict streamflow from meteorological inputs.',
        methods: 'The model consumes input data and produces forecast outputs for evaluation. '.repeat(3)
      },
      metadata: { title: 'Timeout paper' }
    }, admissionResult);

    assert.strictEqual(result.provenance.extractionMethod, 'source-text-fallback');
    assert.strictEqual(result.extractionMetadata.llmExtraction.success, false);
    assert.strictEqual(result.extractionMetadata.llmExtraction.agentProvider, 'claude-code');
    assert.ok(result.extractionMetadata.llmExtraction.requestErrors.some(item => item.error.includes('timed out')), 'Should expose deep extraction timeout diagnostics');
  });

  it('should prefer LLM content research route over protocol fallback route', async () => {
    const llm = {
      async chat(params) {
        const userText = params.messages?.map(message => message.content).join('\n') || '';
        if (userText.includes('"task": "Critical Review"')) {
          return { content: JSON.stringify({ limitations: [] }) };
        }

        return {
          content: JSON.stringify({
            capabilityObjects: [],
            worldObjects: [],
            evidenceObjects: [{
              type: 'Claim',
              id: 'baseline-claim',
              attributes: { statement: 'The model improves evaluation metrics against a baseline.' },
              provenance: {
                section: 'results',
                sourceText: 'The model improves evaluation metrics against a baseline.'
              },
              confidence: 0.8
            }],
            bridgeRelations: [],
            researchRoute: {
              title: 'Scenario evaluation route',
              summary: 'Scenario logs are transformed by a constraint planner into feasibility reports.',
              nodes: [
                {
                  id: 'scenario-logs',
                  label: 'Scenario Logs',
                  type: 'Data',
                  stage: 'data',
                  summary: 'Structured scenario records used as the input material.',
                  children: [
                    { label: 'Input', value: 'Scenario records', detail: 'Source material for planning evaluation.' }
                  ]
                },
                {
                  id: 'constraint-planner',
                  label: 'Constraint Planner',
                  type: 'Method',
                  stage: 'method',
                  summary: 'Planner applies constraints to evaluate candidate actions.',
                  children: [
                    { label: 'Core method', value: 'Constraint-based planning', detail: 'Transforms scenarios into ranked options.' }
                  ]
                },
                {
                  id: 'feasibility-report',
                  label: 'Feasibility Report',
                  type: 'Evidence',
                  stage: 'evidence',
                  summary: 'Report summarizes feasible options and reviewable outputs.',
                  children: [
                    { label: 'Output', value: 'Ranked feasible options', detail: 'Used for downstream review.' }
                  ]
                }
              ],
              edges: [
                { from: 'scenario-logs', to: 'constraint-planner', label: 'feeds' },
                { from: 'constraint-planner', to: 'feasibility-report', label: 'produces' }
              ]
            }
          })
        };
      }
    };
    const decomposer = new DigitalEarthDecomposer(llm);
    const admissionResult = {
      sourceType: 'Repository',
      depth: 'deep',
      activatedCategories: ['data', 'modeling', 'evidence'],
      activatedOntologyLayers: ['source', 'capability'],
      sourceRoles: { modeling_capability: 0.8 },
      primaryRole: 'modeling_capability',
      admitted: true
    };

    const result = await decomposer.decompose('https://example.com/scenario-toolkit', {
      type: 'repository',
      title: 'Scenario Toolkit',
      content: [
        'Overview',
        'The toolkit loads scenario logs, applies a constraint planner, and produces feasibility reports for review.',
        'Methods',
        'Scenario logs are transformed by the constraint planner before the final feasibility report is generated.',
        'Outputs',
        'The feasibility report contains ranked feasible options and supporting review notes.'
      ].join('\n'),
      metadata: {
        title: 'Scenario Toolkit',
        datasets: [{ name: 'Metadata Dataset' }],
        models: [{ name: 'Metadata Model' }]
      }
    }, admissionResult);

    const routeLabels = result.workflowOutline.nodes.map(node => node.label);

    assert.strictEqual(result.workflowOutline.provenance.method, 'llm-research-route');
    assert.deepStrictEqual(routeLabels, ['Scenario Logs', 'Constraint Planner', 'Feasibility Report']);
    assert.ok(result.workflowOutline.edges.some(edge => edge.from === 'scenario-logs' && edge.to === 'constraint-planner'));
    assert.ok(result.workflowOutline.nodes[1].children.some(child => child.value === 'Constraint-based planning'));
    assert.ok(routeLabels.every(label => !['Paper', 'Source', 'Repository', 'Connected'].includes(label)));
    assert.strictEqual(result.extractionMetadata.researchRoute.source, 'llm-research-route');
    assert.strictEqual(result.extractionMetadata.researchRoute.quality, 'content');
    assert.strictEqual(result.workflowOutline.provenance.routeQuality.level, 'content');
  });

  it('should mark source-only route outlines as limited rather than content graphs', async () => {
    const decomposer = new DigitalEarthDecomposer(null, { useLLM: false });
    const admissionResult = {
      sourceType: 'Paper',
      depth: 'deep',
      activatedCategories: [],
      activatedOntologyLayers: ['source'],
      sourceRoles: { earth_content: 0.7 },
      primaryRole: 'earth_content',
      admitted: true
    };

    const result = await decomposer.decompose('https://publisher.example/source-only', {
      metadata: {
        title: 'Source Only Research Item'
      }
    }, admissionResult);

    assert.strictEqual(result.extractionMetadata.researchRoute.quality, 'limited');
    assert.strictEqual(result.workflowOutline.provenance.routeQuality.level, 'limited');
    assert.strictEqual(result.workflowOutline.provenance.routeQuality.contentNodeCount, 0);
    assert.ok(result.extractionMetadata.researchRoute.reasons.includes('needs at least two content-level nodes'));
  });

  it('should build denser fallback routes from normalized source sections when LLM is unavailable', async () => {
    const decomposer = new DigitalEarthDecomposer(null, { useLLM: false });
    const admissionResult = {
      sourceType: 'Paper',
      depth: 'structured',
      activatedCategories: ['modeling', 'data', 'evidence'],
      activatedOntologyLayers: ['source', 'capability', 'world'],
      sourceRoles: { modeling_capability: 0.9, data_capability: 0.7 },
      primaryRole: 'modeling_capability',
      admitted: true
    };

    const result = await decomposer.decompose('10.5555/section-route', {
      type: 'paper',
      title: 'Section route paper',
      content: [
        'Abstract',
        'Here we show that a forecasting model improves event prediction using a reviewable evaluation protocol.',
        'Input data',
        'The study uses meteorological forcing, observed streamflow, and benchmark reanalysis records as model inputs.',
        'Model',
        'The forecasting system uses an encoder-decoder recurrent model to transform historical input sequences into future predictions.',
        'Experiments',
        'Cross-validation experiments test spatial and temporal generalization against a benchmark model using precision, recall, and F1 score.',
        'Results',
        'The reported results compare forecast skill across lead times, return periods, and regions.'
      ].join('\n'),
      sections: {
        abstract: 'Here we show that a forecasting model improves event prediction using a reviewable evaluation protocol.',
        'input data': 'The study uses meteorological forcing, observed streamflow, and benchmark reanalysis records as model inputs. '.repeat(3),
        model: 'The forecasting system uses an encoder-decoder recurrent model to transform historical input sequences into future predictions. '.repeat(3),
        experiments: 'Cross-validation experiments test spatial and temporal generalization against a benchmark model using precision, recall, and F1 score. '.repeat(3),
        results: 'The reported results compare forecast skill across lead times, return periods, and regions. '.repeat(3)
      },
      metadata: { title: 'Section route paper' }
    }, admissionResult);

    const stages = new Set((result.workflowOutline.nodes || []).map(node => node.stage));
    const labels = result.workflowOutline.nodes.map(node => node.label);

    assert.strictEqual(result.provenance.extractionMethod, 'source-text-fallback');
    assert.ok(stages.has('data'), 'Should expose a data/input node from sections');
    assert.ok(stages.has('method'), 'Should expose a method/model node from sections');
    assert.ok(stages.has('execution'), 'Should expose an execution/evaluation node from sections');
    assert.ok(stages.has('evidence'), 'Should expose an evidence/results node from sections');
    assert.ok(labels.some(label => /input data/i.test(label)), 'Should keep source-level data section meaning');
    assert.ok(labels.some(label => /model/i.test(label)), 'Should keep source-level method section meaning');
    assert.ok(labels.every(label => !['Paper', 'Source', 'Connected'].includes(label)), 'Should not use internal container labels');
  });

  it('should preserve content-level extraction while filtering non-article page modules', async () => {
    const llm = {
      async chat() {
        return {
          content: JSON.stringify({
            capabilityObjects: [
              {
                type: 'Dataset',
                id: 'historical-observations',
                attributes: {
                  name: 'Historical observations and forecast inputs',
                  role: 'input'
                },
                provenance: {
                  section: 'methods',
                  sourceText: 'The forecasting model uses an encoder-decoder architecture over historical observations and forecast inputs.'
                }
              },
              {
                type: 'Algorithm',
                id: 'encoder-decoder-model',
                attributes: {
                  name: 'Encoder-decoder sequence model',
                  architecture: 'Encoder and decoder recurrent layers with explicit forecast horizon',
                  forecastHorizon: 'seven days'
                },
                provenance: {
                  section: 'methods',
                  sourceText: 'The forecasting model uses an encoder-decoder architecture over historical observations and forecast inputs.'
                }
              },
              {
                type: 'Algorithm',
                id: 'unrelated-cited-model',
                attributes: {
                  name: 'Unrelated cited-by model'
                },
                provenance: {
                  section: 'This article is cited by',
                  sourceText: 'A later paper studies a different glacier system.'
                }
              }
            ],
            worldObjects: [
              {
                type: 'Region',
                id: 'unrelated-region',
                attributes: { name: 'Different glacier region' },
                provenance: {
                  section: 'associated content',
                  sourceText: 'Recommended content about another region.'
                }
              }
            ],
            evidenceObjects: [
              {
                type: 'Claim',
                id: 'main-result',
                attributes: {
                  statement: 'The model improves forecast reliability against the baseline across evaluation metrics.'
                },
                provenance: {
                  section: 'results',
                  sourceText: 'The model improves forecast reliability against the baseline across evaluation metrics.'
                }
              }
            ],
            bridgeRelations: [
              {
                type: 'forecasts',
                from: 'encoder-decoder-model',
                to: 'main-result',
                provenance: {
                  section: 'results',
                  sourceText: 'The model improves forecast reliability against the baseline across evaluation metrics.'
                }
              }
            ],
            researchRoute: {
              title: 'Research route',
              summary: 'Input observations are transformed by a forecasting model and evaluated against a baseline.',
              nodes: [
                {
                  id: 'inputs',
                  label: 'Historical observations',
                  type: 'Data',
                  stage: 'data',
                  summary: 'Observed source material used to train and evaluate the route.',
                  children: [{ label: 'Coverage', value: 'Historical observations plus forecast inputs' }]
                },
                {
                  id: 'model',
                  label: 'Encoder-decoder sequence model',
                  type: 'Method',
                  stage: 'method',
                  summary: 'Forecasting model with internal encoder and decoder steps.',
                  children: [{ label: 'Architecture', value: 'Encoder and decoder recurrent layers' }]
                },
                {
                  id: 'evaluation',
                  label: 'Baseline reliability comparison',
                  type: 'Evidence',
                  stage: 'evidence',
                  summary: 'Compares model outputs against a baseline using evaluation metrics.',
                  children: [{ label: 'Metric', value: 'Reliability across evaluation metrics' }]
                }
              ],
              edges: [
                { from: 'inputs', to: 'model', label: 'feeds' },
                { from: 'model', to: 'evaluation', label: 'supports' }
              ]
            }
          })
        };
      }
    };
    const decomposer = new DigitalEarthDecomposer(llm);
    const admissionResult = {
      sourceType: 'Paper',
      depth: 'deep',
      activatedCategories: ['data', 'modeling', 'earth-object', 'evidence'],
      activatedOntologyLayers: ['source', 'capability', 'world'],
      sourceRoles: { modeling_capability: 0.9, earth_content: 0.7 },
      primaryRole: 'modeling_capability',
      admitted: true
    };

    const result = await decomposer.decompose('https://publisher.example/article', {
      type: 'paper',
      metadata: {
        title: 'Generic forecasting paper',
        authors: [{ name: 'A. Researcher' }],
        year: 2026,
        venue: 'Example Journal'
      },
      content: [
        '# Abstract',
        'The paper studies a reusable forecasting route.',
        '# Methods',
        'The forecasting model uses an encoder-decoder architecture over historical observations and forecast inputs.',
        '# Results',
        'The model improves forecast reliability against the baseline across evaluation metrics.',
        '# This article is cited by',
        'A later paper studies a different glacier system.'
      ].join('\n'),
      figures: [{
        number: 'Figure 1',
        caption: 'Model reliability comparison across evaluation metrics and baselines.',
        imageUrl: 'https://publisher.example/figure1.png'
      }]
    }, admissionResult);

    assert.ok(result.capabilityObjects.some(object => object.id === 'encoder-decoder-model'), 'Should keep source-supported method object');
    assert.ok(!result.capabilityObjects.some(object => object.id === 'unrelated-cited-model'), 'Should remove cited-by capability objects');
    assert.ok(!result.worldObjects.some(object => object.id === 'unrelated-region'), 'Should remove associated-content world objects');
    assert.strictEqual(result.extractionMetadata.scopeFiltering.removedTotal, 2, 'Should report filtered out-of-scope objects');
    assert.ok(result.bridgeRelations.some(relation => relation.type === 'predicts' && relation.originalType === 'forecasts'), 'Should canonicalize relation vocabulary');
    assert.ok(result.evidenceGraph.nodes.some(node => node.kind === 'figure'), 'Should expose figures in evidence graph');
    assert.ok(result.evidenceGraph.edges.length > 0, 'Should link evidence to review material');
    assert.ok(result.resourceGraph.nodes.some(node => node.kind === 'resource'), 'Should expose reusable resources in resource graph');
    assert.ok(result.resourceGraph.summary.resourceCount > 0, 'Should summarize resource graph coverage');
    assert.ok(result.extractionIntegrity.resourceGraph, 'Should include resource graph integrity signals');
    assert.strictEqual(result.extractionIntegrity.routeQuality.level, 'content', 'Should preserve a content-level route with drilldown details');
    assert.strictEqual(result.extractionIntegrity.graphTraceability.level, 'traceable', 'Content graph should be traceable to objects, evidence, or resources');
    assert.strictEqual(result.extractionIntegrity.contentFidelity.level, 'content', 'Should cover expected source facets with low-loss content signals');
    assert.ok(result.extractionIntegrity.contentFidelity.coveredFacets.includes('method'), 'Should cover method facet');
    assert.ok(result.extractionIntegrity.contentFidelity.coveredFacets.includes('evidence'), 'Should cover evidence facet');
    assert.ok(result.extractionIntegrity.contentFidelity.coveredFacets.includes('visual'), 'Should cover visual evidence facet');
    assert.ok(!result.extractionIntegrity.issues.some(issue => issue.id === 'metadata-coverage'), 'Should not flag complete bibliographic metadata');
  });

  it('should flag low-fidelity routes that pass schema but lose source content', async () => {
    const llm = {
      async chat(params) {
        const userText = params.messages?.map(message => message.content).join('\n') || '';
        if (userText.includes('"task": "Critical Review"')) {
          return { content: JSON.stringify({ limitations: [] }) };
        }

        return {
          content: JSON.stringify({
            capabilityObjects: [],
            worldObjects: [],
            evidenceObjects: [{
              type: 'Claim',
              id: 'baseline-claim',
              attributes: { statement: 'The model improves evaluation metrics against a baseline.' },
              provenance: {
                section: 'results',
                sourceText: 'The model improves evaluation metrics against a baseline.'
              },
              confidence: 0.8
            }],
            bridgeRelations: [],
            researchRoute: {
              title: 'Thin route',
              summary: 'Source was imported.',
              nodes: [
                { id: 'paper', label: 'Paper', type: 'Source', stage: 'resource', summary: 'Source container.' },
                { id: 'connected', label: 'Connected', type: 'Evidence', stage: 'evidence', summary: 'Graph state.' }
              ],
              edges: [{ from: 'paper', to: 'connected', label: 'links' }]
            }
          })
        };
      }
    };
    const decomposer = new DigitalEarthDecomposer(llm);
    const admissionResult = {
      sourceType: 'Paper',
      depth: 'deep',
      activatedCategories: ['data', 'modeling', 'evidence'],
      activatedOntologyLayers: ['source', 'capability', 'evidence'],
      sourceRoles: { modeling_capability: 0.9 },
      primaryRole: 'modeling_capability',
      admitted: true
    };

    const result = await decomposer.decompose('10.5555/thin-route', {
      type: 'paper',
      metadata: {
        title: 'Thin route paper',
        authors: [{ name: 'A. Author' }],
        year: 2026,
        venue: 'Example Journal'
      },
      content: [
        'Abstract',
        'The study evaluates a forecasting model against observed outcomes.',
        'Methods',
        'The method uses input data to train a sequence model.',
        'Results',
        'The model improves evaluation metrics against a baseline.'
      ].join('\n'),
      sections: {
        abstract: 'The study evaluates a forecasting model against observed outcomes.',
        methods: 'The method uses input data to train a sequence model.',
        results: 'The model improves evaluation metrics against a baseline.'
      }
    }, admissionResult);

    assert.strictEqual(result.extractionMetadata.llmExtraction.success, true, 'The malformed content can still pass basic schema');
    assert.notStrictEqual(result.extractionIntegrity.contentFidelity.level, 'content', 'Integrity should reject content-empty schema-valid routes');
    assert.ok(result.extractionIntegrity.contentFidelity.missingFacets.includes('data'), 'Should detect missing data facet');
    assert.ok(result.extractionIntegrity.contentFidelity.missingFacets.includes('method'), 'Should detect missing method facet');
    assert.ok(result.extractionIntegrity.issues.some(issue => issue.id === 'content-fidelity'), 'Should surface content fidelity as a review issue');
  });

  it('should flag covered facets that lack provenance or graph support', async () => {
    const llm = {
      async chat(params) {
        const userText = params.messages?.map(message => message.content).join('\n') || '';
        if (userText.includes('"task": "Critical Review"')) {
          return { content: JSON.stringify({ limitations: [] }) };
        }

        return {
          content: JSON.stringify({
            capabilityObjects: [{
              type: 'Dataset',
              id: 'input-data',
              attributes: { name: 'Input dataset', description: 'Input data used by the model.' },
              confidence: 0.75
            }, {
              type: 'Model',
              id: 'forecast-model',
              attributes: { name: 'Forecast model', description: 'Model transforms inputs into forecasts.' },
              confidence: 0.75
            }],
            worldObjects: [],
            evidenceObjects: [{
              type: 'Claim',
              id: 'result-claim',
              attributes: { statement: 'The model improves evaluation metrics against a baseline.' },
              confidence: 0.75
            }],
            bridgeRelations: [],
            researchRoute: {
              title: 'Ungrounded route',
              summary: 'Input data feeds a model and produces an evaluation claim.',
              nodes: [
                { id: 'input-data', label: 'Input dataset', type: 'Data', stage: 'data', summary: 'Input data used by the model.', children: [{ label: 'Role', value: 'Input data' }] },
                { id: 'forecast-model', label: 'Forecast model', type: 'Method', stage: 'method', summary: 'Model transforms inputs into forecasts.', children: [{ label: 'Role', value: 'Forecast model' }] },
                { id: 'result-claim', label: 'Baseline evaluation result', type: 'Evidence', stage: 'evidence', summary: 'The model improves evaluation metrics.', children: [{ label: 'Metric', value: 'Evaluation metrics' }] }
              ],
              edges: [
                { from: 'input-data', to: 'forecast-model', label: 'feeds' },
                { from: 'forecast-model', to: 'result-claim', label: 'supports' }
              ]
            }
          })
        };
      }
    };
    const decomposer = new DigitalEarthDecomposer(llm);
    const admissionResult = {
      sourceType: 'Paper',
      depth: 'deep',
      activatedCategories: ['data', 'modeling', 'evidence'],
      activatedOntologyLayers: ['source', 'capability', 'evidence'],
      sourceRoles: { modeling_capability: 0.9 },
      primaryRole: 'modeling_capability',
      admitted: true
    };

    const result = await decomposer.decompose('10.5555/ungrounded-route', {
      type: 'paper',
      metadata: {
        title: 'Ungrounded route paper',
        authors: [{ name: 'A. Author' }],
        year: 2026,
        venue: 'Example Journal'
      },
      content: [
        'Abstract',
        'The study evaluates a forecasting model against observed outcomes.',
        'Methods',
        'The method uses input data to train a sequence model.',
        'Results',
        'The model improves evaluation metrics against a baseline.'
      ].join('\n'),
      sections: {
        abstract: 'The study evaluates a forecasting model against observed outcomes.',
        methods: 'The method uses input data to train a sequence model.',
        results: 'The model improves evaluation metrics against a baseline.'
      }
    }, admissionResult);

    assert.strictEqual(result.extractionIntegrity.contentFidelity.score, 100, 'Facet coverage can look complete');
    const weakOrUngrounded = [
      ...result.extractionIntegrity.contentFidelity.grounding.weaklyGroundedFacets,
      ...result.extractionIntegrity.contentFidelity.grounding.ungroundedFacets
    ];
    assert.ok(weakOrUngrounded.includes('data'), 'Should flag data without provenance');
    assert.ok(weakOrUngrounded.includes('method'), 'Should flag method without provenance');
    assert.ok(weakOrUngrounded.includes('evidence'), 'Should flag evidence without provenance or graph support');
    assert.ok(result.extractionIntegrity.issues.some(issue => issue.id === 'facet-grounding'), 'Should surface grounding issue separately from coverage');
  });

  it('should flag content routes whose nodes cannot be traced to objects, evidence, or resources', async () => {
    const llm = {
      async chat(params) {
        const userText = params.messages?.map(message => message.content).join('\n') || '';
        if (userText.includes('"task": "Critical Review"')) {
          return { content: JSON.stringify({ limitations: [] }) };
        }

        return {
          content: JSON.stringify({
            capabilityObjects: [{
              type: 'Model',
              id: 'forecast-model',
              attributes: { name: 'Forecast model' },
              provenance: { section: 'methods', sourceText: 'The method uses input data to train a sequence model.' },
              confidence: 0.75
            }],
            worldObjects: [],
            evidenceObjects: [{
              type: 'Claim',
              id: 'result-claim',
              attributes: { statement: 'The model improves evaluation metrics against a baseline.' },
              provenance: { section: 'results', sourceText: 'The model improves evaluation metrics against a baseline.' },
              confidence: 0.75
            }],
            bridgeRelations: [],
            researchRoute: {
              title: 'Decorative content route',
              summary: 'A route with content-like labels but no traceable route-node support.',
              nodes: [
                { id: 'synthetic-input', label: 'Regional input archive', type: 'Data', stage: 'data', summary: 'A dataset-like route node.', children: [{ label: 'Role', value: 'Input archive' }] },
                { id: 'synthetic-analysis', label: 'Skill calibration process', type: 'Method', stage: 'method', summary: 'A method-like route node.', children: [{ label: 'Role', value: 'Calibration process' }] },
                { id: 'synthetic-output', label: 'Operational warning product', type: 'Evidence', stage: 'evidence', summary: 'A finding-like route node.', children: [{ label: 'Role', value: 'Warning product' }] }
              ],
              edges: [
                { from: 'synthetic-input', to: 'synthetic-analysis', label: 'feeds' },
                { from: 'synthetic-analysis', to: 'synthetic-output', label: 'produces' }
              ]
            }
          })
        };
      }
    };
    const decomposer = new DigitalEarthDecomposer(llm);
    const admissionResult = {
      sourceType: 'Paper',
      depth: 'deep',
      activatedCategories: ['data', 'modeling', 'evidence'],
      activatedOntologyLayers: ['source', 'capability', 'evidence'],
      sourceRoles: { modeling_capability: 0.9 },
      primaryRole: 'modeling_capability',
      admitted: true
    };

    const result = await decomposer.decompose('10.5555/untraceable-route', {
      type: 'paper',
      metadata: {
        title: 'Untraceable route paper',
        authors: [{ name: 'A. Author' }],
        year: 2026,
        venue: 'Example Journal'
      },
      content: [
        'Abstract',
        'The study evaluates a forecasting model against observed outcomes.',
        'Methods',
        'The method uses input data to train a sequence model.',
        'Results',
        'The model improves evaluation metrics against a baseline.'
      ].join('\n'),
      sections: {
        abstract: 'The study evaluates a forecasting model against observed outcomes.',
        methods: 'The method uses input data to train a sequence model.',
        results: 'The model improves evaluation metrics against a baseline.'
      }
    }, admissionResult);

    assert.strictEqual(result.extractionIntegrity.routeQuality.level, 'content', 'The route can look content-level by structure');
    assert.strictEqual(result.extractionIntegrity.graphTraceability.level, 'weak', 'Traceability should reject decorative route nodes');
    assert.strictEqual(result.extractionIntegrity.graphTraceability.weakNodeCount, 3);
    assert.ok(result.extractionIntegrity.issues.some(issue => issue.id === 'graph-traceability'), 'Should surface graph traceability as a review issue');
  });

  it('should treat source-grounded route nodes as traceable even before object matching is perfect', async () => {
    const llm = {
      async chat(params) {
        const userText = params.messages?.map(message => message.content).join('\n') || '';
        if (userText.includes('"task": "Critical Review"')) {
          return { content: JSON.stringify({ limitations: [] }) };
        }

        return {
          content: JSON.stringify({
            capabilityObjects: [],
            worldObjects: [],
            evidenceObjects: [],
            bridgeRelations: [],
            researchRoute: {
              title: 'Grounded source route',
              summary: 'A source-grounded route assembled from explicit passages.',
              nodes: [
                {
                  id: 'meteorological-inputs',
                  label: 'Meteorological forcing inputs',
                  type: 'Data',
                  stage: 'data',
                  summary: 'Input forcing variables used by the forecast workflow.',
                  provenance: { section: 'methods', sourceText: 'The forecasting workflow uses meteorological forcing inputs.' },
                  children: [{ label: 'Variables', value: 'meteorological forcing inputs', detail: 'Inputs used by the workflow.' }]
                },
                {
                  id: 'forecast-workflow',
                  label: 'Sequence forecast workflow',
                  type: 'Workflow',
                  stage: 'execution',
                  summary: 'Workflow transforms forcing inputs into streamflow forecasts.',
                  provenance: { section: 'methods', sourceText: 'The workflow transforms forcing inputs into streamflow forecasts.' },
                  children: [{ label: 'Transform', value: 'forcing inputs into streamflow forecasts', detail: 'Main computational route.' }]
                },
                {
                  id: 'benchmark-comparison',
                  label: 'Benchmark skill comparison',
                  type: 'Finding',
                  stage: 'evidence',
                  summary: 'Forecast skill is compared against a benchmark.',
                  provenance: { section: 'results', sourceText: 'Forecast skill is compared against the benchmark.' },
                  children: [{ label: 'Evidence', value: 'benchmark skill comparison', detail: 'Reported evaluation result.' }]
                }
              ],
              edges: [
                { from: 'meteorological-inputs', to: 'forecast-workflow', label: 'feeds' },
                { from: 'forecast-workflow', to: 'benchmark-comparison', label: 'supports' }
              ]
            }
          })
        };
      }
    };
    const decomposer = new DigitalEarthDecomposer(llm);
    const admissionResult = {
      sourceType: 'Paper',
      depth: 'deep',
      activatedCategories: ['data', 'modeling', 'evidence'],
      activatedOntologyLayers: ['source', 'capability', 'foundation'],
      sourceRoles: { modeling_capability: 0.9 },
      primaryRole: 'modeling_capability',
      admitted: true
    };

    const result = await decomposer.decompose('10.5555/grounded-route', {
      type: 'paper',
      metadata: { title: 'Grounded route paper' },
      content: [
        'Methods',
        'The forecasting workflow uses meteorological forcing inputs.',
        'The workflow transforms forcing inputs into streamflow forecasts.',
        'Results',
        'Forecast skill is compared against the benchmark.'
      ].join('\n')
    }, admissionResult);

    assert.strictEqual(result.extractionIntegrity.routeQuality.groundedNodeCount, 3);
    assert.strictEqual(result.extractionIntegrity.routeQuality.groundingScore, 100);
    assert.strictEqual(result.extractionIntegrity.graphTraceability.level, 'traceable');
    assert.ok(result.extractionIntegrity.graphTraceability.details.every(item => item.level === 'traceable'));
  });

  it('should downgrade routes with low-information nodes even when stages and edges exist', async () => {
    const llm = {
      async chat(params) {
        const userText = params.messages?.map(message => message.content).join('\n') || '';
        if (userText.includes('"task": "Critical Review"')) {
          return { content: JSON.stringify({ limitations: [] }) };
        }

        return {
          content: JSON.stringify({
            capabilityObjects: [{
              type: 'Dataset',
              id: 'data-object',
              attributes: { name: 'Input data' },
              provenance: { section: 'methods', sourceText: 'The method uses input data to train a sequence model.' },
              confidence: 0.75
            }, {
              type: 'Model',
              id: 'model-object',
              attributes: { name: 'Forecast model' },
              provenance: { section: 'methods', sourceText: 'The method uses input data to train a sequence model.' },
              confidence: 0.75
            }],
            worldObjects: [],
            evidenceObjects: [{
              type: 'Claim',
              id: 'claim-object',
              attributes: { statement: 'The model improves evaluation metrics against a baseline.' },
              provenance: { section: 'results', sourceText: 'The model improves evaluation metrics against a baseline.' },
              confidence: 0.75
            }],
            bridgeRelations: [],
            researchRoute: {
              title: 'Low information route',
              summary: 'Input, method, output.',
              nodes: [
                { id: 'data-object', label: 'Input data', type: 'Data', stage: 'data', summary: 'Data.' },
                { id: 'model-object', label: 'Forecast model', type: 'Method', stage: 'method', summary: 'Model.' },
                { id: 'claim-object', label: 'Evaluation result', type: 'Evidence', stage: 'evidence', summary: 'Result.' }
              ],
              edges: [
                { from: 'data-object', to: 'model-object', label: 'feeds' },
                { from: 'model-object', to: 'claim-object', label: 'supports' }
              ]
            }
          })
        };
      }
    };
    const decomposer = new DigitalEarthDecomposer(llm);
    const admissionResult = {
      sourceType: 'Paper',
      depth: 'deep',
      activatedCategories: ['data', 'modeling', 'evidence'],
      activatedOntologyLayers: ['source', 'capability', 'evidence'],
      sourceRoles: { modeling_capability: 0.9 },
      primaryRole: 'modeling_capability',
      admitted: true
    };

    const result = await decomposer.decompose('10.5555/low-info-route', {
      type: 'paper',
      metadata: {
        title: 'Low information route paper',
        authors: [{ name: 'A. Author' }],
        year: 2026,
        venue: 'Example Journal'
      },
      content: [
        'Abstract',
        'The study evaluates a forecasting model against observed outcomes.',
        'Methods',
        'The method uses input data to train a sequence model.',
        'Results',
        'The model improves evaluation metrics against a baseline.'
      ].join('\n'),
      sections: {
        abstract: 'The study evaluates a forecasting model against observed outcomes.',
        methods: 'The method uses input data to train a sequence model.',
        results: 'The model improves evaluation metrics against a baseline.'
      }
    }, admissionResult);

    assert.notStrictEqual(result.extractionIntegrity.routeQuality.level, 'content');
    assert.ok(result.extractionIntegrity.routeQuality.lowInformationNodeCount >= 2);
    assert.notStrictEqual(result.extractionIntegrity.briefQuality.level, 'complete');
    assert.ok(result.extractionIntegrity.briefQuality.lowInformationPointCount > 0);
    assert.ok(
      result.extractionIntegrity.issues.some(issue => issue.id === 'route-quality' && issue.detail.includes('low-information route nodes')),
      'Should expose low-information route nodes as route quality issue'
    );
    assert.ok(
      result.extractionIntegrity.issues.some(issue => issue.id === 'brief-quality'),
      'Should expose low-information brief points as brief quality issue'
    );
  });

  it('should create source-text fallback objects when LLM extraction fails', async () => {
    const originalConsoleError = console.error;
    console.error = () => {};
    const llm = {
      async chat() {
        throw new Error('LLM API error 504: Gateway Time-out');
      }
    };
    const decomposer = new DigitalEarthDecomposer(llm);
    const admissionResult = {
      sourceType: 'article',
      depth: 'deep',
      activatedCategories: ['modeling', 'data', 'earth-object'],
      activatedOntologyLayers: ['source', 'capability', 'world'],
      sourceRoles: { modeling_capability: 0.9, data_capability: 0.7, earth_content: 0.7 },
      primaryRole: 'modeling_capability',
      admitted: true
    };

    let result;
    try {
      result = await decomposer.decompose('https://publisher.example/paper', {
        type: 'paper',
        title: 'Global prediction of extreme floods in ungauged watersheds',
        content: [
          'Abstract',
          'Here we show that artificial intelligence-based forecasting achieves reliability in predicting extreme riverine events in ungauged watersheds at up to a five-day lead time.',
          'Methods',
          'The AI streamflow forecasting model uses an encoder-decoder model with LSTM networks over meteorological input data and forecast horizons.',
          'Data availability',
          'Reanalysis and reforecast data produced by the model are available at https://doi.org/10.5281/zenodo.10397664 for review.'
        ].join('\n'),
        sections: {
          abstract: 'Here we show that artificial intelligence-based forecasting achieves reliability in predicting extreme riverine events in ungauged watersheds at up to a five-day lead time.',
          methods: 'The AI streamflow forecasting model uses an encoder-decoder model with LSTM networks over meteorological input data and forecast horizons.',
          'data availability': 'Reanalysis and reforecast data produced by the model are available at https://doi.org/10.5281/zenodo.10397664 for review.'
        },
        metadata: { title: 'Global prediction of extreme floods in ungauged watersheds' }
      }, admissionResult);
    } finally {
      console.error = originalConsoleError;
    }

    assert.strictEqual(result.sourceType, 'Paper');
    assert.strictEqual(result.provenance.extractionMethod, 'source-text-fallback');
    assert.strictEqual(result.extractionMetadata.llmExtraction.success, false);
    assert.strictEqual(result.extractionMetadata.mergeStrategy, 'source-text-fallback');
    assert.ok(result.capabilityObjects.some(obj => obj.type === 'Method'), 'Should create method object from source text');
    assert.ok(result.capabilityObjects.some(obj => obj.type === 'Dataset'), 'Should create dataset object from source text');
    assert.ok(result.evidenceObjects.some(obj => obj.type === 'Claim'), 'Should create claim object from abstract text');
    assert.ok(result.worldObjects.some(obj => obj.type === 'Region'), 'Should create global scope object from explicit source wording');
    assert.ok(result.researchBrief, 'Should build product-level research brief');
    assert.strictEqual(result.researchBrief.keyPoints[0].label, 'Core Route');
    assert.ok(result.researchBrief.keyPoints[0].value !== 'Paper', 'Brief should summarize content route, not source container');
    assert.ok(result.workflowOutline?.nodes?.length >= 2, 'Should build protocol-level workflow outline');
    assert.notStrictEqual(result.extractionMetadata.researchRoute.quality, 'limited', 'Source-text fallback should expose a reviewable route when method/data/evidence are present');
    const datasetResource = result.externalResources.find(resource => resource.type === 'dataset');
    assert.ok(datasetResource, 'Should expose external dataset resources');
    assert.ok(datasetResource.reviewHint?.includes('data version'), 'Dataset resources should explain what a researcher needs to verify');
    assert.strictEqual(datasetResource.investigationLabel, 'Verify data');
    assert.ok(datasetResource.routeRelevance?.includes('inputs'), 'Dataset resources should explain how they relate to the route');
    assert.ok(datasetResource.verificationFocus?.includes('coverage'), 'Dataset resources should expose a verification focus');
    assert.ok(Array.isArray(result.inferredLimitations), 'Should report inferred limitations for the UI');
  });

  it('should add optional LLM critical review limitations without replacing protocol fallback', async () => {
    const llm = {
      async chat(params) {
        const userText = params.messages?.map(message => message.content).join('\n') || '';
        if (userText.includes('"task": "Critical Review"')) {
          return {
            content: JSON.stringify({
              limitations: [{
                id: 'external-validity',
                label: 'External validity needs review',
                severity: 'warning',
                detail: 'The excerpt does not show whether the method was evaluated beyond the described study material.'
              }]
            })
          };
        }

        return {
          content: JSON.stringify({
            capabilityObjects: [],
            worldObjects: [],
            evidenceObjects: [],
            bridgeRelations: []
          })
        };
      }
    };
    const decomposer = new DigitalEarthDecomposer(llm);
    const admissionResult = {
      sourceType: 'Paper',
      depth: 'deep',
      activatedCategories: ['modeling'],
      activatedOntologyLayers: ['source', 'capability'],
      sourceRoles: { modeling_capability: 0.8 },
      primaryRole: 'modeling_capability',
      admitted: true
    };

    const result = await decomposer.decompose('10.5555/critical-review', {
      metadata: { title: 'Reviewable modeling paper' },
      content: [
        'Abstract',
        'This study presents a predictive model for a research workflow and reports promising results.',
        'Methods',
        'The model is trained and evaluated on the available study material with limited external information.',
        'Discussion',
        'The authors discuss potential use but do not provide enough detail for broad deployment.'
      ].join('\n')
    }, admissionResult);

    assert.strictEqual(result.extractionMetadata.criticalReview.success, true);
    assert.ok(result.inferredLimitations.some(item => item.source === 'llm-review'), 'Should include LLM review limitation');
    assert.ok(result.inferredLimitations.some(item => item.source === 'protocol'), 'Should preserve protocol limitations');
  });

  it('should extract capability objects based on activated categories', async () => {
    const decomposer = new DigitalEarthDecomposer();
    const admissionResult = {
      sourceType: 'Paper',
      depth: 'structured',
      activatedCategories: ['data', 'modeling'],
      activatedOntologyLayers: ['source', 'capability', 'world'],
      sourceRoles: { data_capability: 0.5, modeling_capability: 0.6 },
      primaryRole: 'modeling_capability',
      admitted: true
    };

    const result = await decomposer.decompose('10.1038/test-paper', {
      metadata: {
        title: 'Flood Forecasting with LSTM',
        datasets: [
          { name: 'ERA5-Land', variables: ['precipitation', 'temperature'], role: 'input' }
        ],
        models: [
          { name: 'LSTM-Ensemble', type: 'machine_learning', architecture: 'LSTM' }
        ]
      }
    }, admissionResult);

    assert.ok(result.capabilityObjects.length > 0, 'Should extract capability objects');
    const dataset = result.capabilityObjects.find(o => o.type === 'Dataset');
    const model = result.capabilityObjects.find(o => o.type === 'Model');
    assert.ok(dataset, 'Should have Dataset object');
    assert.ok(model, 'Should have Model object');
  });

  it('should record metadata extraction sections from activated category protocol', async () => {
    const decomposer = new DigitalEarthDecomposer();
    const admissionResult = {
      sourceType: 'Paper',
      depth: 'structured',
      activatedCategories: ['data', 'modeling'],
      activatedOntologyLayers: ['source', 'capability'],
      sourceRoles: { data_capability: 0.5, modeling_capability: 0.6 },
      primaryRole: 'modeling_capability',
      admitted: true
    };

    const result = await decomposer.decompose('10.1038/test-paper', {
      metadata: {
        title: 'Protocol extraction test',
        datasets: [{ name: 'Input Dataset' }],
        models: [{ name: 'Reusable Model' }]
      }
    }, admissionResult);

    assert.ok(result.provenance.sections.capabilities.data, 'Should record activated data section');
    assert.ok(result.provenance.sections.capabilities.modeling, 'Should record activated modeling section');
    assert.strictEqual(result.provenance.sections.capabilities.observation, undefined, 'Should not record inactive observation section');
  });

  it('should extract world objects for world-activated sources', async () => {
    const decomposer = new DigitalEarthDecomposer();
    const admissionResult = {
      sourceType: 'Paper',
      depth: 'deep',
      activatedCategories: ['earth-object', 'earth-variable', 'hazard'],
      activatedOntologyLayers: ['source', 'capability', 'world'],
      sourceRoles: { earth_content: 0.7, event_signal: 0.5 },
      primaryRole: 'earth_content',
      admitted: true
    };

    const result = await decomposer.decompose('10.1038/test-paper', {
      metadata: {
        title: 'Global Flood Risk Analysis',
        regions: [
          { name: 'Amazon Basin', type: 'basin', bbox: [-80, -20, -50, 5] }
        ],
        hazards: [
          { type: 'flood', name: '2022 Amazon Floods', magnitude: 'severe' }
        ]
      }
    }, admissionResult);

    assert.ok(result.worldObjects.length > 0, 'Should extract world objects');
    const basin = result.worldObjects.find(o => o.type === 'Basin');
    const hazard = result.worldObjects.find(o => o.type === 'FloodEvent');
    assert.ok(basin, 'Should have Basin object');
    assert.ok(hazard, 'Should have FloodEvent object');
  });

  it('should order workflow outline by generic research stages', async () => {
    const decomposer = new DigitalEarthDecomposer();
    const admissionResult = {
      sourceType: 'Paper',
      depth: 'deep',
      activatedCategories: ['data', 'modeling', 'earth-object', 'evidence'],
      activatedOntologyLayers: ['source', 'capability', 'world'],
      sourceRoles: { data_capability: 0.6, modeling_capability: 0.6, earth_content: 0.6 },
      primaryRole: 'modeling_capability',
      admitted: true
    };

    const result = await decomposer.decompose('10.5555/stage-protocol', {
      metadata: {
        title: 'Generic staged research protocol',
        datasets: [{ name: 'Input Observations' }],
        models: [{ name: 'Predictive Model' }],
        regions: [{ name: 'Study Region', type: 'region' }],
        claims: [{ statement: 'Model output improves reviewable performance.' }]
      }
    }, admissionResult);

    const routeNodes = result.workflowOutline.nodes.filter(node => node.id !== 'source');
    const stages = routeNodes.map(node => node.stage);
    const stageOrders = routeNodes.map(node => node.stageOrder);

    assert.ok(stages.includes('data'), 'Should include data stage');
    assert.ok(stages.includes('method'), 'Should include method stage');
    assert.ok(stages.includes('context'), 'Should include context stage');
    assert.ok(stages.includes('evidence'), 'Should include evidence stage');
    assert.deepStrictEqual(stageOrders, [...stageOrders].sort((a, b) => a - b), 'Should sort route nodes by stage order');
    assert.ok(routeNodes.every(node => node.type && node.summary), 'Each route node should have readable display fields');
    assert.ok(routeNodes.every(node => !['Paper', 'Source', 'Repository'].includes(node.label)), 'Overview route should show source content, not container labels');
    const nodeWithChildren = routeNodes.find(node => node.children?.length > 0);
    assert.ok(nodeWithChildren, 'Route nodes should expose content details for deeper in-panel graph drilldown');
    const childLabels = nodeWithChildren.children.map(child => child.label);
    assert.ok(childLabels.length > 0, 'Nested route details should preserve content-level fields');
  });

  it('should build route labels from source content without domain-specific term matching', async () => {
    const decomposer = new DigitalEarthDecomposer();
    const admissionResult = {
      sourceType: 'Repository',
      depth: 'structured',
      activatedCategories: ['data', 'modeling', 'computing', 'evidence'],
      activatedOntologyLayers: ['source', 'capability'],
      sourceRoles: { modeling_capability: 0.8 },
      primaryRole: 'modeling_capability',
      admitted: true
    };

    const result = await decomposer.decompose('https://example.com/route-toolkit', {
      metadata: {
        title: 'Route Toolkit',
        datasets: [{ name: 'Scenario Logs' }],
        algorithms: [{ name: 'Constraint Planner' }],
        workflows: [{ name: 'Batch Evaluation Pipeline' }],
        outputs: [{ name: 'Feasibility Report' }]
      }
    }, admissionResult);

    const routeLabels = result.workflowOutline.nodes.map(node => node.label);

    assert.ok(routeLabels.includes('Scenario Logs'), 'Should use data labels from metadata');
    assert.ok(routeLabels.includes('Constraint Planner'), 'Should use method labels from metadata');
    assert.ok(routeLabels.includes('Feasibility Report'), 'Should use output labels from metadata');
    assert.ok(routeLabels.every(label => !['Paper', 'Repository', 'Connected'].includes(label)), 'Should not expose container or system labels as research route content');
  });

  it('should classify workflow stages from ontology category instead of name patterns', () => {
    const decomposer = new DigitalEarthDecomposer();

    const unknownNamedLikeModel = decomposer._classifyWorkflowStage({
      type: 'ModelShapedUnknownThing',
      metadata: { category: 'unmapped' }
    }, 'capability');

    const ontologyDataset = decomposer._classifyWorkflowStage({
      type: 'Dataset',
      metadata: {}
    }, 'capability');

    const ontologyClaim = decomposer._classifyWorkflowStage({
      type: 'Claim',
      metadata: {}
    }, 'evidence');

    assert.strictEqual(unknownNamedLikeModel.key, 'resource', 'Unknown names should not be classified by substring');
    assert.strictEqual(ontologyDataset.key, 'data', 'Known ontology data type should map through schema category');
    assert.strictEqual(ontologyClaim.key, 'evidence', 'Known ontology evidence type should map through schema category');
  });

  it('should resolve extracted object types through ontology protocol', async () => {
    const decomposer = new DigitalEarthDecomposer();

    assert.strictEqual(
      decomposer._resolveOntologyEntityType('flood', 'hazard'),
      'FloodEvent',
      'Should resolve hazard shorthand through ontology suffix protocol'
    );
    assert.strictEqual(
      decomposer._resolveOntologyEntityType('unknown-hazard-kind', 'hazard'),
      'Hazard',
      'Should fall back to base hazard type for unknown hazard labels'
    );
    assert.strictEqual(
      decomposer._resolveOntologyEntityType('EngineeringMeasure', 'intervention'),
      'EngineeringMeasure',
      'Should accept ontology intervention subtypes without a local whitelist'
    );
    assert.strictEqual(
      decomposer._resolveOntologyEntityType('Basin', 'region'),
      'Basin',
      'Should accept ontology earth-object subtypes for regions'
    );
  });

  it('should build bridge relations between capabilities and world objects', async () => {
    // Enable fallback bridge relations for testing
    const decomposer = new DigitalEarthDecomposer(null, { allowFallbackBridgeRelations: true });
    const admissionResult = {
      sourceType: 'Paper',
      depth: 'deep',
      activatedCategories: ['data', 'modeling', 'earth-object'],
      activatedOntologyLayers: ['source', 'capability', 'world'],
      sourceRoles: { data_capability: 0.5, modeling_capability: 0.6 },
      primaryRole: 'modeling_capability',
      admitted: true
    };

    const result = await decomposer.decompose('10.1038/test-paper', {
      metadata: {
        title: 'Hydrological Modeling of the Danube',
        datasets: [{ name: 'ERA5-Land' }],
        models: [{ name: 'LSTM-Hydro', type: 'hydrological' }],
        regions: [{ name: 'Danube Basin', type: 'basin' }]
      }
    }, admissionResult);

    assert.ok(result.bridgeRelations.length > 0, 'Should build bridge relations');
    const coversRelation = result.bridgeRelations.find(r => r.type === 'covers');
    const simulatesRelation = result.bridgeRelations.find(r => r.type === 'simulates');
    assert.ok(coversRelation || simulatesRelation, 'Should have capability-world relations');
  });

  it('should skip extraction for rejected sources', async () => {
    const decomposer = new DigitalEarthDecomposer();
    const admissionResult = {
      sourceType: 'News',
      depth: 'reject',
      activatedCategories: [],
      activatedOntologyLayers: [],
      sourceRoles: {},
      primaryRole: null,
      admitted: false
    };

    const result = await decomposer.decompose('https://example.com/random', {
      metadata: { title: 'Random Article' }
    }, admissionResult);

    assert.ok(!result.sourceObject, 'Should not create source object for rejected');
    assert.strictEqual(result.capabilityObjects.length, 0);
    assert.strictEqual(result.worldObjects.length, 0);
  });

  it('should extract GitHub repo capabilities', async () => {
    const decomposer = new DigitalEarthDecomposer();
    const admissionResult = {
      sourceType: 'Repository',
      depth: 'structured',
      activatedCategories: ['computing', 'modeling'],
      activatedOntologyLayers: ['source', 'capability'],
      sourceRoles: { computing_capability: 0.7, modeling_capability: 0.5 },
      primaryRole: 'computing_capability',
      admitted: true
    };

    const result = await decomposer.decompose('https://github.com/google/flood-forecasting', {
      metadata: {
        name: 'flood-forecasting',
        language: 'Python',
        stars: 500,
        models: [{ name: 'LSTM-Flood', type: 'deep_learning' }],
        dependencies: [{ name: 'tensorflow' }, { name: 'numpy' }]
      }
    }, admissionResult);

    assert.ok(result.sourceObject, 'Should create source object');
    assert.strictEqual(result.sourceObject.type, 'Repository');
    assert.strictEqual(result.sourceObject.attributes.language, 'Python');

    const software = result.capabilityObjects.filter(o => o.type === 'Software');
    assert.ok(software.length >= 2, 'Should have software packages');

    const models = result.capabilityObjects.filter(o => o.type === 'Model');
    assert.ok(models.length >= 1, 'Should have model capabilities');
  });

  it('should extract GitHub datasets and workflows from normalized connector metadata', async () => {
    const decomposer = new DigitalEarthDecomposer();
    const admissionResult = {
      sourceType: 'Repository',
      depth: 'structured',
      activatedCategories: ['data', 'computing', 'modeling'],
      activatedOntologyLayers: ['source', 'capability'],
      sourceRoles: { data_capability: 0.5, computing_capability: 0.7, modeling_capability: 0.5 },
      primaryRole: 'computing_capability',
      admitted: true
    };

    const result = await decomposer.decompose('https://github.com/google/flood-forecasting', {
      name: 'flood-forecasting',
      metadata: {
        name: 'flood-forecasting',
        language: 'Python',
        datasets: [
          { name: 'ERA5-Land reanalysis data' },
          { name: 'GRDC streamflow observations' }
        ],
        models: [{ name: 'flood-forecasting', type: 'repository_model' }],
        dependencies: [{ name: 'torch' }, { name: 'numpy' }],
        workflows: [{ name: 'Script workflow', purpose: 'repository scripts' }],
        repositoryReview: {
          grade: 'B',
          summary: 'Static review found partial reproducibility material.',
          checks: {
            readme: true,
            license: false,
            dependencyManifest: true,
            notebookOrScript: true,
            dataInstructions: false,
            dockerfile: false,
            runInstructions: true
          },
          warnings: ['License is missing.'],
          reasons: ['README is available.']
        }
      }
    }, admissionResult);

    const types = result.capabilityObjects.map(o => o.type);
    assert.ok(types.includes('Dataset'), 'Should extract datasets');
    assert.ok(types.includes('Model'), 'Should extract model');
    assert.ok(types.includes('Software'), 'Should extract dependencies');
    assert.ok(types.includes('Workflow'), 'Should extract workflows');
    assert.strictEqual(result.sourceObject.name, 'flood-forecasting');
    assert.strictEqual(result.sourceObject.attributes.reproducibilityStatus, 'B');
    const repositoryResource = result.externalResources.find(resource => resource.type === 'repository');
    assert.ok(repositoryResource.reviewHint.includes('Static reproducibility grade B'));
    assert.ok(repositoryResource.verificationFocus.includes('License'));
  });

  it('should extract dataset capabilities', async () => {
    const decomposer = new DigitalEarthDecomposer();
    const admissionResult = {
      sourceType: 'DatasetPage',
      depth: 'structured',
      activatedCategories: ['data'],
      activatedOntologyLayers: ['source', 'capability', 'world'],
      sourceRoles: { data_capability: 0.8 },
      primaryRole: 'data_capability',
      admitted: true
    };

    const result = await decomposer.decompose('https://cds.climate.copernicus.eu/era5-land', {
      metadata: {
        title: 'ERA5-Land',
        variables: [{ name: 'temperature' }, { name: 'precipitation' }],
        spatialCoverage: 'global',
        temporalCoverage: '1950-2020'
      }
    }, admissionResult);

    assert.ok(result.sourceObject, 'Should create source object');
    assert.strictEqual(result.sourceObject.type, 'DatasetPage');

    const variables = result.capabilityObjects.filter(o => o.type === 'Variable');
    assert.ok(variables.length >= 2, 'Should have variable objects');
  });

  it('should not require claim-style evidence as a critical facet for dataset sources', async () => {
    const decomposer = new DigitalEarthDecomposer(null, { useLLM: false });
    const admissionResult = {
      sourceType: 'DatasetPage',
      depth: 'structured',
      activatedCategories: ['data'],
      activatedOntologyLayers: ['source', 'capability', 'world'],
      sourceRoles: { data_capability: 0.8 },
      primaryRole: 'data_capability',
      admitted: true
    };

    const result = await decomposer.decompose('fixture://dataset', {
      metadata: {
        type: 'Dataset',
        title: 'Global forcing dataset',
        variables: [{ name: 'precipitation' }, { name: 'temperature' }],
        spatialCoverage: 'global',
        temporalCoverage: '1950-present',
        resources: [{ label: 'Dataset catalog', url: 'https://example.org/dataset', type: 'dataset' }]
      },
      sections: {
        overview: 'The dataset provides hourly global forcing variables for land-surface analysis.',
        variables: 'Variables include precipitation and temperature.',
        coverage: 'The dataset covers global land areas from 1950 to present.',
        access: 'Data are available through a catalog API.'
      },
      content: 'Overview\nThe dataset provides hourly global forcing variables for land-surface analysis.\n\nVariables\nVariables include precipitation and temperature.\n\nCoverage\nThe dataset covers global land areas from 1950 to present.\n\nAccess\nData are available through a catalog API.'
    }, admissionResult);

    const fidelity = result.extractionIntegrity.contentFidelity;
    assert.ok(!fidelity.expectedFacets.includes('evidence'), 'Dataset coverage should not imply claim-style evidence');
    assert.ok(!fidelity.reasons.some(reason => reason.includes('missing critical facets: evidence')), 'Dataset should not require evidence as a critical facet');
  });

  it('should track provenance for all objects', async () => {
    const decomposer = new DigitalEarthDecomposer();
    const admissionResult = {
      sourceType: 'Paper',
      depth: 'structured',
      activatedCategories: ['data', 'earth-object'],
      activatedOntologyLayers: ['source', 'capability', 'world'],
      sourceRoles: { earth_content: 0.6 },
      primaryRole: 'earth_content',
      admitted: true
    };

    const result = await decomposer.decompose('10.1038/test-paper', {
      metadata: {
        title: 'Test Paper',
        datasets: [{ name: 'ERA5', confidence: 0.9 }],
        regions: [{ name: 'Amazon Basin', type: 'basin' }]
      }
    }, admissionResult);

    assert.ok(result.provenance, 'Should have provenance');
    assert.ok(result.provenance.sections, 'Should have provenance sections');

    // Check objects have provenance
    for (const obj of result.capabilityObjects) {
      assert.ok(obj.provenance, 'Capability object should have provenance');
      assert.ok(obj.provenance.section, 'Should have section');
    }

    for (const obj of result.worldObjects) {
      assert.ok(obj.provenance, 'World object should have provenance');
    }
  });

  it('should calculate extraction confidence', async () => {
    const decomposer = new DigitalEarthDecomposer();
    const admissionResult = {
      sourceType: 'Paper',
      depth: 'deep',
      activatedCategories: ['data', 'modeling', 'earth-object', 'hazard'],
      activatedOntologyLayers: ['source', 'capability', 'world'],
      sourceRoles: { earth_content: 0.7 },
      primaryRole: 'earth_content',
      admitted: true
    };

    const result = await decomposer.decompose('10.1038/test-paper', {
      metadata: {
        title: 'Comprehensive Study',
        datasets: [{ name: 'ERA5' }],
        models: [{ name: 'LSTM' }],
        regions: [{ name: 'Global' }],
        hazards: [{ type: 'flood' }]
      }
    }, admissionResult);

    assert.ok(result.confidence > 0, 'Should calculate confidence');
    assert.ok(result.confidence <= 1, 'Confidence should be <= 1');
  });
});

// Run tests if executed directly
if (require.main === module) {
  console.log('Running Digital Earth Decomposer tests...');
}

module.exports = {};
