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
      activatedCategories: ['modeling'],
      activatedOntologyLayers: ['source', 'capability'],
      sourceRoles: { modeling_capability: 0.9 },
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
    assert.ok(result.workflowOutline?.nodes?.length >= 2, 'Should build protocol-level workflow outline');
    assert.ok(result.externalResources.some(resource => resource.type === 'dataset'), 'Should expose external dataset resources');
    assert.ok(Array.isArray(result.inferredLimitations), 'Should report inferred limitations for the UI');
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
        workflows: [{ name: 'Script workflow', purpose: 'repository scripts' }]
      }
    }, admissionResult);

    const types = result.capabilityObjects.map(o => o.type);
    assert.ok(types.includes('Dataset'), 'Should extract datasets');
    assert.ok(types.includes('Model'), 'Should extract model');
    assert.ok(types.includes('Software'), 'Should extract dependencies');
    assert.ok(types.includes('Workflow'), 'Should extract workflows');
    assert.strictEqual(result.sourceObject.name, 'flood-forecasting');
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
