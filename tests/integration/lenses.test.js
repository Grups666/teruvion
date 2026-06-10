/**
 * Lens Tests
 */

const { assert, describe, it } = require('../setup');
const { LensRegistry, MapLens, EvidenceLens, WorkflowLens } = require('../../core/lenses');
const { MockTripleStore, MockEntity, VERIFICATION_STATES } = require('../helpers/mock-store');

describe('Lens Registry', () => {
  it('should register default lenses', () => {
    const store = new MockTripleStore();
    const registry = new LensRegistry(store, {});

    const lenses = registry.getAvailableLenses();

    assert.ok(lenses.length >= 5, 'Should have 5+ default lenses');
    assert.ok(lenses.some(l => l.name === 'map'), 'Should have map lens');
    assert.ok(lenses.some(l => l.name === 'evidence'), 'Should have evidence lens');
    assert.ok(lenses.some(l => l.name === 'workflow'), 'Should have workflow lens');
  });

  it('should get lens by name', () => {
    const store = new MockTripleStore();
    const registry = new LensRegistry(store, {});

    const mapLens = registry.get('map');
    assert.ok(mapLens, 'Should get map lens');
    assert.strictEqual(mapLens.getName(), 'map', 'Lens name should be map');
  });

  it('should return undefined for unknown lens', () => {
    const store = new MockTripleStore();
    const registry = new LensRegistry(store, {});

    const unknown = registry.get('unknown');
    assert.strictEqual(unknown, undefined, 'Should return undefined for unknown lens');
  });
});

describe('Map Lens', () => {
  it('should render regions as GeoJSON features', async () => {
    const store = new MockTripleStore();

    // Add region entity
    const region = new MockEntity('Region', {
      name: 'Amazon Basin',
      bbox: [-80, -20, -50, 5],
      description: 'South American river basin'
    });
    store.addEntity(region);

    // Add dataset
    const dataset = new MockEntity('Dataset', {
      name: 'ERA5-Land',
      spatialCoverage: 'global'
    });
    const dsId = store.addEntity(dataset);
    store.addTriple(dsId, 'covers', region.id);

    const lens = new MapLens(store, {});
    const result = await lens.render(null);

    assert.strictEqual(result.type, 'FeatureCollection', 'Should be FeatureCollection');
    assert.ok(result.features.length >= 1, 'Should have features');
    assert.ok(result.regions.length >= 1, 'Should have regions');
    assert.ok(result.bounds, 'Should have bounds');
  });

  it('should handle basins and gauges', async () => {
    const store = new MockTripleStore();

    const basin = new MockEntity('Basin', {
      name: 'Mississippi Basin',
      bbox: [-120, 30, -80, 50],
      area: 3000000
    });
    store.addEntity(basin);

    const gauge = new MockEntity('Gauge', {
      name: 'St. Louis Gauge',
      stationId: 'USGS-123',
      river: 'Mississippi'
    });
    store.addEntity(gauge);

    const lens = new MapLens(store, {});
    const result = await lens.render(null);

    assert.ok(result.metadata.hasBasins, 'Should detect basins');
  });

  it('should calculate bounds from features', async () => {
    const store = new MockTripleStore();

    store.addEntity(new MockEntity('Region', { name: 'R1', bbox: [0, 0, 10, 10] }));
    store.addEntity(new MockEntity('Region', { name: 'R2', bbox: [5, 5, 15, 15] }));

    const lens = new MapLens(store, {});
    const result = await lens.render(null);

    assert.ok(result.bounds, 'Should have bounds');
    assert.ok(result.bounds[0] <= 0, 'Min longitude should be <= 0');
    assert.ok(result.bounds[2] >= 15, 'Max longitude should be >= 15');
  });
});

describe('Evidence Lens', () => {
  it('should build evidence chains from claims', async () => {
    const store = new MockTripleStore();

    // Create claim
    const claim = new MockEntity('Claim', {
      statement: 'The model achieves 85% accuracy',
      confidence: 0.9
    });
    const claimId = store.addEntity(claim);

    // Create supporting evidence
    const figure = new MockEntity('Figure', {
      name: 'Figure 2',
      figureNumber: 2,
      caption: 'Performance comparison'
    });
    const figId = store.addEntity(figure);

    // Figure supports claim
    store.addTriple(figId, 'supports', claimId);

    const lens = new EvidenceLens(store, {});
    const result = await lens.render(null);

    assert.strictEqual(result.type, 'evidence-chains', 'Should be evidence-chains type');
    assert.ok(result.chains.length >= 1, 'Should have chains');
    assert.ok(result.graph.nodes.length >= 2, 'Should have nodes in graph');
  });

  it('should calculate chain statistics', async () => {
    const store = new MockTripleStore();

    const claim = new MockEntity('Claim', { statement: 'Test claim' });
    const claimId = store.addEntity(claim);

    const evidence = new MockEntity('Figure', { name: 'Evidence' });
    const evId = store.addEntity(evidence);
    store.addTriple(evId, 'supports', claimId);

    const lens = new EvidenceLens(store, {});
    const result = await lens.render(null);

    assert.ok(result.summary.totalClaims >= 1, 'Should count claims');
    assert.ok(result.summary.completeChains >= 0, 'Should count complete chains');
    assert.ok(typeof result.summary.avgDepth === 'number', 'Should have avg depth');
  });
});

describe('Workflow Lens', () => {
  it('should build workflow graph', async () => {
    const store = new MockTripleStore();

    const paper = new MockEntity('Paper', { title: 'Test Paper' });
    const paperId = store.addEntity(paper);

    const dataset = new MockEntity('Dataset', { name: 'ERA5' });
    const dsId = store.addEntity(dataset);

    const method = new MockEntity('Method', { name: 'LSTM' });
    const methodId = store.addEntity(method);

    store.addTriple(paperId, 'uses', dsId);
    store.addTriple(paperId, 'applies', methodId);

    const lens = new WorkflowLens(store, {});
    const result = await lens.render(null);

    assert.strictEqual(result.type, 'workflow-graph', 'Should be workflow-graph');
    assert.ok(result.graph.nodes.length >= 3, 'Should have nodes');
    assert.ok(result.graph.edges.length >= 2, 'Should have edges');
  });

  it('should identify workflow stages', async () => {
    const store = new MockTripleStore();

    store.addEntity(new MockEntity('Dataset', { name: 'Input DS' }));
    store.addEntity(new MockEntity('Method', { name: 'Process' }));
    store.addEntity(new MockEntity('Experiment', { name: 'Exp' }));
    store.addEntity(new MockEntity('Result', { value: 'Result' }));

    const lens = new WorkflowLens(store, {});
    const result = await lens.render(null);

    assert.ok(result.stages.length >= 2, 'Should have stages');
    assert.ok(result.stages.some(s => s.type === 'input'), 'Should have input stage');
  });

  it('should trace data flow', async () => {
    const store = new MockTripleStore();

    const ds = new MockEntity('Dataset', { name: 'Training Data' });
    const dsId = store.addEntity(ds);

    const method = new MockEntity('Method', { name: 'Train' });
    const methodId = store.addEntity(method);

    store.addTriple(methodId, 'uses', dsId);

    const lens = new WorkflowLens(store, {});
    const result = await lens.render(null);

    assert.ok(result.dataFlow, 'Should have data flow');
    assert.ok(result.dataFlow.length >= 1, 'Should trace at least one flow');
  });
});

describe('Timeline Lens', () => {
  it('should extract temporal information', async () => {
    const store = new MockTripleStore();

    const paper1 = new MockEntity('Paper', { title: 'Paper 2020', year: 2020 });
    const paper2 = new MockEntity('Paper', { title: 'Paper 2022', year: 2022 });
    const dataset = new MockEntity('Dataset', { name: 'DS', temporalCoverage: '2010-2020' });

    store.addEntity(paper1);
    store.addEntity(paper2);
    store.addEntity(dataset);

    const { TimelineLens } = require('../../core/lenses');
    const lens = new TimelineLens(store, {});
    const result = await lens.render(null);

    assert.strictEqual(result.type, 'timeline', 'Should be timeline');
    assert.ok(result.events.length >= 3, 'Should have events');
    assert.ok(result.timeline.span, 'Should have timespan');
  });
});

describe('Comparison Lens', () => {
  it('should compare methods', async () => {
    const store = new MockTripleStore();

    const method1 = new MockEntity('Method', { name: 'LSTM', category: 'ml', architecture: 'LSTM' });
    const method2 = new MockEntity('Method', { name: 'Transformer', category: 'ml', architecture: 'Transformer' });

    store.addEntity(method1);
    store.addEntity(method2);

    const { ComparisonLens } = require('../../core/lenses');
    const lens = new ComparisonLens(store, {});
    const result = await lens.render(null, { entityType: 'Method' });

    assert.strictEqual(result.type, 'comparison', 'Should be comparison');
    assert.ok(result.entities.length >= 2, 'Should compare 2+ entities');
    assert.ok(result.comparison, 'Should have comparison data');
    assert.ok(result.differences.length >= 1, 'Should find differences');
  });
});

// Run tests if executed directly
if (require.main === module) {
  console.log('Running lens tests...');
}

module.exports = {};