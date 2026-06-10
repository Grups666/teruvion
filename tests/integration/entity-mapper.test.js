/**
 * Entity Mapper Tests
 */

const { assert, describe, it } = require('../setup');
const { EntityMapper, TripleBuilder } = require('../../core/understanding');
const { MockTripleStore, MockEntity } = require('../helpers/mock-store');

describe('Entity Mapper', () => {
  it('should map dataset from understanding output', () => {
    const mapper = new EntityMapper();

    const ds = {
      name: 'ERA5-Land',
      acronym: 'ERA5L',
      type: 'reanalysis',
      variables: [{ name: 'temperature' }, { name: 'precipitation' }],
      spatial: { coverage: 'global', resolution: '0.1°' },
      temporal: { coverage: '1950-2022' },
      access: { url: 'https://test.com', license: 'CC-BY' },
      usage: { role: 'input' }
    };

    const result = mapper.map('dataset', ds, '10.1234/test');

    assert.ok(result, 'Should return mapped entity');
    assert.strictEqual(result.type, 'Dataset', 'Should be Dataset type');
    assert.strictEqual(result.attributes.name, 'ERA5-Land', 'Should map name');
    assert.ok(Array.isArray(result.attributes.variables), 'Should transform variables');
    assert.strictEqual(result.layer, 'capability', 'Should have layer info');
  });

  it('should map method from understanding output', () => {
    const mapper = new EntityMapper();

    const method = {
      name: 'LSTM Ensemble',
      aliases: ['Neural Hydrology'],
      category: 'machine-learning',
      architecture: { type: 'LSTM', layers: 3, hiddenSize: 256 },
      innovation: 'Novel ensemble approach',
      limitations: ['Requires large data']
    };

    const result = mapper.map('method', method, '10.1234/test');

    assert.ok(result, 'Should return mapped entity');
    assert.strictEqual(result.type, 'Method', 'Should be Method type');
    assert.strictEqual(result.attributes.name, 'LSTM Ensemble', 'Should map name');
    assert.strictEqual(result.attributes.architecture, 'LSTM', 'Should map architecture type');
    assert.strictEqual(result.layer, 'capability', 'Should have layer info');
    assert.strictEqual(result.category, 'modeling', 'Should have category');
  });

  it('should map region from understanding output', () => {
    const mapper = new EntityMapper();

    const region = {
      name: 'Amazon Basin',
      bbox: [-80, -20, -50, 5],
      description: 'South American river basin'
    };

    const result = mapper.map('region', region, '10.1234/test');

    assert.ok(result, 'Should return mapped entity');
    assert.strictEqual(result.type, 'Region', 'Should be Region type');
    assert.strictEqual(result.attributes.name, 'Amazon Basin', 'Should map name');
    assert.ok(Array.isArray(result.attributes.bbox), 'Should map bbox');
    assert.strictEqual(result.layer, 'world', 'Should be world layer');
  });

  it('should map all entities from understanding output', () => {
    const mapper = new EntityMapper();

    const understanding = {
      overview: {
        title: 'Test Paper',
        problem: 'Flood forecasting',
        domain: 'hydrology',
        worthReading: true
      },
      datasets: {
        datasets: [
          { name: 'ERA5-Land', type: 'reanalysis', variables: [{ name: 'temp' }] }
        ]
      },
      methods: {
        methods: [
          { name: 'LSTM', category: 'ml' }
        ]
      },
      spatial: {
        regions: [
          { name: 'Global', bbox: [-180, -90, 180, 90] }
        ]
      }
    };

    const result = mapper.mapAll(understanding, '10.1234/test', 'paper');

    assert.ok(result.entities.length >= 3, 'Should have at least 3 entities');
    assert.ok(result.collections.source, 'Should have source collection');
    assert.ok(result.collections.datasets, 'Should have datasets collection');
    assert.ok(result.collections.methods, 'Should have methods collection');
    assert.ok(result.collections.regions, 'Should have regions collection');

    // Source should be first
    assert.strictEqual(result.entities[0].type, 'Paper', 'First entity should be Paper');

    // Check layer info
    assert.ok(result.entities.some(e => e.layer), 'Entities should have layer info');
  });

  it('should handle missing data gracefully', () => {
    const mapper = new EntityMapper();

    const result = mapper.map('dataset', {}, '10.1234/test');

    // Should still create entity with defaults
    assert.ok(result, 'Should return entity even with missing data');
    assert.strictEqual(result.type, 'Dataset', 'Should still be Dataset type');
  });
});

describe('Triple Builder', () => {
  it('should build triples from entity collections', () => {
    const store = new MockTripleStore();

    // Create source
    const sourceId = store.addEntity(new MockEntity('Paper', { title: 'Test Paper' }));

    // Create related entities
    const dsId = store.addEntity(new MockEntity('Dataset', { name: 'Test Dataset' }));
    const methodId = store.addEntity(new MockEntity('Method', { name: 'Test Method' }));
    const regionId = store.addEntity(new MockEntity('Region', { name: 'Test Region' }));

    const entityCollections = {
      datasets: [{ id: dsId, attributes: { name: 'Test Dataset' } }],
      methods: [{ id: methodId, attributes: { name: 'Test Method' } }],
      regions: [{ id: regionId, attributes: { name: 'Test Region' } }]
    };

    const builder = new TripleBuilder(store);
    const triples = builder.build(sourceId, entityCollections, {});

    assert.ok(triples.length >= 3, 'Should have at least 3 triples');
    assert.ok(triples.some(t => t.predicate === 'uses'), 'Should have uses triple');
    assert.ok(triples.some(t => t.predicate === 'applies'), 'Should have applies triple');
    assert.ok(triples.some(t => t.predicate === 'studies'), 'Should have studies triple');
  });

  it('should add triples to store', () => {
    const store = new MockTripleStore();

    const sourceId = store.addEntity(new MockEntity('Paper', { title: 'Test' }));
    const dsId = store.addEntity(new MockEntity('Dataset', { name: 'Dataset' }));

    const builder = new TripleBuilder(store);
    const triples = [
      { subject: sourceId, predicate: 'uses', object: dsId, metadata: {} }
    ];

    const ids = builder.addToStore(triples);

    assert.strictEqual(ids.length, 1, 'Should add 1 triple');
    assert.strictEqual(store.getAllTriples().length, 1, 'Store should have 1 triple');
  });

  it('should build and add in one step', () => {
    const store = new MockTripleStore();

    const sourceId = store.addEntity(new MockEntity('Paper', { title: 'Test' }));
    const dsId = store.addEntity(new MockEntity('Dataset', { name: 'Dataset' }));
    const methodId = store.addEntity(new MockEntity('Method', { name: 'Method' }));

    const entityCollections = {
      datasets: [{ id: dsId, attributes: {} }],
      methods: [{ id: methodId, attributes: {} }]
    };

    const builder = new TripleBuilder(store);
    const result = builder.buildAndAdd(sourceId, entityCollections, {});

    assert.ok(result.tripleIds.length >= 2, 'Should create at least 2 triples');
    assert.ok(result.stats.byRelation.uses, 'Should have uses count');
    assert.ok(result.stats.byRelation.applies, 'Should have applies count');
  });
});

describe('Entity Mapper + Triple Builder Integration', () => {
  it('should map understanding to entities and build triples', () => {
    const store = new MockTripleStore();
    const mapper = new EntityMapper(store);
    const builder = new TripleBuilder(store);

    const understanding = {
      overview: { title: 'Integration Test Paper', domain: 'test' },
      datasets: {
        datasets: [{ name: 'DS1', type: 'test', variables: [{ name: 'v1' }] }]
      },
      methods: {
        methods: [{ name: 'M1', category: 'test' }]
      },
      spatial: {
        regions: [{ name: 'Global', bbox: [-180, -90, 180, 90] }]
      }
    };

    // Map entities
    const mapped = mapper.mapAll(understanding, 'test-input', 'paper');

    // Add entities to store and assign IDs
    const entityIds = {};
    for (const entity of mapped.entities) {
      const e = new MockEntity(entity.type, entity.attributes, entity.metadata);
      const id = store.addEntity(e);
      entity.id = id;
    }

    // Update collections with IDs
    for (const [key, collection] of Object.entries(mapped.collections)) {
      collection.forEach((entity, i) => {
        if (mapped.entities.find(e => e.type === entity.type && e.attributes.name === entity.attributes?.name)) {
          const matchedEntity = mapped.entities.find(e => e.type === entity.type && e.attributes.name === entity.attributes?.name);
          if (matchedEntity) collection[i] = matchedEntity;
        }
      });
    }

    // Build triples
    const sourceId = mapped.entities[0].id;
    const result = builder.buildAndAdd(sourceId, mapped.collections, understanding);

    assert.ok(store.entities.size >= 4, 'Should have 4+ entities');
    assert.ok(result.stats.added >= 3, 'Should have added 3+ triples');
  });
});

// Run tests if executed directly
if (require.main === module) {
  console.log('Running entity mapper tests...');
}

module.exports = {};