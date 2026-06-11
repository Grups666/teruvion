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
