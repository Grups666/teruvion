/**
 * TripleStore Tests
 * Tests for entity/triple CRUD operations, indexing, and persistence
 */

const { assert, describe, it, testUtils } = require('../setup');
const { MockTripleStore, MockEntity, MockTriple, VERIFICATION_STATES, TYPE_PREFIXES } = require('../helpers/mock-store');

describe('TripleStore Entity Tests', () => {
  it('should create entities with valid IDs', () => {
    const store = new MockTripleStore();

    const entity = new MockEntity('Paper', {
      title: 'Test Paper',
      authors: ['Author One'],
      year: 2024
    });

    const id = store.addEntity(entity);
    assert.ok(id.startsWith('paper-'), 'Paper ID should have paper- prefix');
    assert.ok(store.hasEntity(id), 'Entity should exist in store');
  });

  it('should use correct ID prefixes for each type', () => {
    const typesAndPrefixes = [
      { type: 'Paper', prefix: 'paper-' },
      { type: 'Dataset', prefix: 'dataset-' },
      { type: 'Method', prefix: 'method-' },
      { type: 'Claim', prefix: 'claim-' },
      { type: 'Region', prefix: 'region-' },
      { type: 'Source', prefix: 'src-' },
      { type: 'Location', prefix: 'loc-' }
    ];

    for (const { type, prefix } of typesAndPrefixes) {
      const entity = new MockEntity(type, { name: `Test ${type}` });
      assert.ok(entity.id.startsWith(prefix), `${type} ID should start with ${prefix}`);
    }
  });

  it('should get entities by type', () => {
    const store = new MockTripleStore();

    // Add multiple entities of different types
    store.addEntity(new MockEntity('Paper', { title: 'Paper 1' }));
    store.addEntity(new MockEntity('Paper', { title: 'Paper 2' }));
    store.addEntity(new MockEntity('Dataset', { name: 'Dataset 1' }));

    const papers = store.getEntitiesByType('Paper');
    assert.strictEqual(papers.length, 2, 'Should have 2 papers');

    const datasets = store.getEntitiesByType('Dataset');
    assert.strictEqual(datasets.length, 1, 'Should have 1 dataset');
  });

  it('should return correct entity attributes', () => {
    const store = new MockTripleStore();

    const entity = new MockEntity('Paper', {
      title: 'Test Paper Title',
      doi: '10.1234/test',
      year: 2024
    });

    const id = store.addEntity(entity);
    const retrieved = store.getEntity(id);

    assert.strictEqual(retrieved.attributes.title, 'Test Paper Title', 'Title should match');
    assert.strictEqual(retrieved.attributes.doi, '10.1234/test', 'DOI should match');
    assert.strictEqual(retrieved.type, 'Paper', 'Type should be Paper');
  });
});

describe('TripleStore Triple Tests', () => {
  it('should create triples between entities', () => {
    const store = new MockTripleStore();

    const paperId = store.addEntity(new MockEntity('Paper', { title: 'Paper' }));
    const datasetId = store.addEntity(new MockEntity('Dataset', { name: 'Dataset' }));

    const tripleId = store.addTriple(paperId, 'uses', datasetId);
    assert.ok(tripleId.startsWith('triple-'), 'Triple ID should have triple- prefix');

    const triples = store.getAllTriples();
    assert.strictEqual(triples.length, 1, 'Should have 1 triple');
    assert.strictEqual(triples[0].subject, paperId, 'Subject should match');
    assert.strictEqual(triples[0].predicate, 'uses', 'Predicate should match');
    assert.strictEqual(triples[0].object, datasetId, 'Object should match');
  });

  it('should reject triples with non-existent subject', () => {
    const store = new MockTripleStore();
    store.addEntity(new MockEntity('Dataset', { name: 'Dataset' }));

    try {
      store.addTriple('non-existent-id', 'uses', 'dataset-123');
      assert.fail('Should have thrown for non-existent subject');
    } catch (err) {
      assert.ok(err.message.includes('not found'), 'Should throw not found error');
    }
  });

  it('should allow literal values as objects', () => {
    const store = new MockTripleStore();
    const paperId = store.addEntity(new MockEntity('Paper', { title: 'Paper' }));

    // Literals don't need to be entities - '2024' doesn't match entity ID patterns
    store.addTriple(paperId, 'year', '2024');
    const triples = store.getAllTriples();
    assert.strictEqual(triples[0].object, '2024', 'Literal value should work');
  });
});

describe('TripleStore Index Tests', () => {
  it('should query outgoing relations (SPO index)', () => {
    const store = new MockTripleStore();

    const paperId = store.addEntity(new MockEntity('Paper', { title: 'Paper' }));
    const datasetId = store.addEntity(new MockEntity('Dataset', { name: 'Dataset' }));
    const methodId = store.addEntity(new MockEntity('Method', { name: 'Method' }));

    store.addTriple(paperId, 'uses', datasetId);
    store.addTriple(paperId, 'applies', methodId);

    const results = store.query(paperId);
    assert.strictEqual(results.length, 2, 'Should have 2 outgoing relations');
  });

  it('should query specific predicate', () => {
    const store = new MockTripleStore();

    const paperId = store.addEntity(new MockEntity('Paper', { title: 'Paper' }));
    const dataset1 = store.addEntity(new MockEntity('Dataset', { name: 'Dataset 1' }));
    const dataset2 = store.addEntity(new MockEntity('Dataset', { name: 'Dataset 2' }));
    store.addEntity(new MockEntity('Method', { name: 'Method' }));

    store.addTriple(paperId, 'uses', dataset1);
    store.addTriple(paperId, 'uses', dataset2);

    const results = store.query(paperId, 'uses');
    assert.strictEqual(results.length, 2, 'Should have 2 uses relations');
  });

  it('should query incoming relations (OPS index)', () => {
    const store = new MockTripleStore();

    const paper1 = store.addEntity(new MockEntity('Paper', { title: 'Paper 1' }));
    const paper2 = store.addEntity(new MockEntity('Paper', { title: 'Paper 2' }));
    const datasetId = store.addEntity(new MockEntity('Dataset', { name: 'Dataset' }));

    store.addTriple(paper1, 'uses', datasetId);
    store.addTriple(paper2, 'uses', datasetId);

    const results = store.queryInverse('uses', datasetId);
    assert.strictEqual(results.length, 2, 'Should have 2 incoming relations');
  });

  it('should get both outgoing and incoming relations', () => {
    const store = new MockTripleStore();

    const paperId = store.addEntity(new MockEntity('Paper', { title: 'Paper' }));
    const datasetId = store.addEntity(new MockEntity('Dataset', { name: 'Dataset' }));
    const claimId = store.addEntity(new MockEntity('Claim', { statement: 'Claim' }));

    // Paper uses Dataset (outgoing)
    store.addTriple(paperId, 'uses', datasetId);

    // Claim supported by Paper (incoming to Paper)
    store.addTriple(claimId, 'supported_by', paperId);

    const relations = store.getRelations(paperId);
    assert.strictEqual(relations.outgoing.length, 1, 'Should have 1 outgoing');
    assert.strictEqual(relations.incoming.length, 1, 'Should have 1 incoming');
  });
});

describe('TripleStore Persistence Tests', () => {
  it('should serialize to JSON with all fields', () => {
    const store = new MockTripleStore();

    const entity = new MockEntity('Paper', { title: 'Paper' });
    entity.verificationState = VERIFICATION_STATES.VERIFIED;
    entity.reviewedBy = 'tester';
    entity.reviewedAt = '2024-01-01T00:00:00Z';

    const id = store.addEntity(entity);
    store.addTriple(id, 'uses', store.addEntity(new MockEntity('Dataset', { name: 'Dataset' })));

    const json = store.toJSON();

    assert.strictEqual(json.version, '1.1', 'Version should be 1.1');
    assert.ok(Array.isArray(json.entities), 'Should have entities array');
    assert.ok(Array.isArray(json.triples), 'Should have triples array');

    // Verify entity has all fields including verification state
    const entityJson = json.entities[0];
    assert.ok(entityJson.hasOwnProperty('verificationState'), 'Should have verificationState');
    assert.ok(entityJson.hasOwnProperty('reviewedBy'), 'Should have reviewedBy');
    assert.ok(entityJson.hasOwnProperty('reviewedAt'), 'Should have reviewedAt');
  });

  it('should deserialize from JSON preserving verification state', () => {
    const store = new MockTripleStore();

    // Create and verify an entity
    const entity = new MockEntity('Paper', { title: 'Paper' });
    entity.verificationState = VERIFICATION_STATES.VERIFIED;
    entity.reviewedBy = 'tester';
    const id = store.addEntity(entity);

    // Serialize
    const json = store.toJSON();

    // Deserialize
    const newStore = MockTripleStore.fromJSON(json);
    const restored = newStore.getEntity(id);

    assert.strictEqual(restored.verificationState, VERIFICATION_STATES.VERIFIED, 'Verification state should persist');
    assert.strictEqual(restored.reviewedBy, 'tester', 'Reviewer should persist');
  });

  it('should handle migration from v1.0 format', () => {
    // Simulate old format without verification state
    const oldFormat = {
      version: '1.0',
      entities: [
        {
          id: 'paper-123',
          type: 'Paper',
          attributes: { title: 'Old Paper' },
          createdAt: '2023-01-01T00:00:00Z',
          metadata: {}
          // No verificationState
        }
      ],
      triples: []
    };

    const store = MockTripleStore.fromJSON(oldFormat);
    const entity = store.getEntity('paper-123');

    // Should default to 'extracted' state
    assert.strictEqual(entity.verificationState, VERIFICATION_STATES.EXTRACTED, 'Should default to extracted');
  });
});

describe('TripleStore ID Generation Tests', () => {
  it('should generate readable IDs with proper prefixes', () => {
    const testCases = [
      { type: 'Paper', expectedPrefix: 'paper-' },
      { type: 'Dataset', expectedPrefix: 'dataset-' },
      { type: 'Method', expectedPrefix: 'method-' },
      { type: 'Claim', expectedPrefix: 'claim-' },
      { type: 'Region', expectedPrefix: 'region-' },
      { type: 'ResearchQuestion', expectedPrefix: 'rq-' },
      { type: 'Hypothesis', expectedPrefix: 'hypo-' },
      { type: 'Model', expectedPrefix: 'model-' },
      { type: 'Experiment', expectedPrefix: 'exp-' },
      { type: 'Basin', expectedPrefix: 'basin-' },
      { type: 'Gauge', expectedPrefix: 'gauge-' },
      { type: 'NeuralNetwork', expectedPrefix: 'nn-' }
    ];

    for (const { type, expectedPrefix } of testCases) {
      const entity = new MockEntity(type, { name: `Test ${type}` });
      assert.ok(entity.id.startsWith(expectedPrefix),
        `${type} ID should start with ${expectedPrefix}, got ${entity.id}`);
    }
  });

  it('should generate unique IDs', () => {
    const ids = new Set();
    for (let i = 0; i < 100; i++) {
      const entity = new MockEntity('Paper', { title: 'Test' });
      assert.ok(!ids.has(entity.id), `ID should be unique: ${entity.id}`);
      ids.add(entity.id);
    }
  });

  it('should generate IDs with timestamp and random components', () => {
    const entity = new MockEntity('Paper', { title: 'Test' });
    const parts = entity.id.split('-');

    // Should have prefix, timestamp, and random
    assert.ok(parts.length >= 3, 'ID should have prefix-timestamp-random format');
  });
});

describe('TripleStore Statistics Tests', () => {
  it('should return correct statistics', () => {
    const store = new MockTripleStore();

    store.addEntity(new MockEntity('Paper', { title: 'Paper 1' }));
    store.addEntity(new MockEntity('Paper', { title: 'Paper 2' }));
    store.addEntity(new MockEntity('Dataset', { name: 'Dataset' }));

    const stats = store.stats();
    assert.strictEqual(stats.totalEntities, 3, 'Should have 3 entities');
    assert.strictEqual(stats.typeCounts.Paper, 2, 'Should have 2 papers');
    assert.strictEqual(stats.typeCounts.Dataset, 1, 'Should have 1 dataset');
  });

  it('should count verification states', () => {
    const store = new MockTripleStore();

    const entity1 = new MockEntity('Paper', { title: 'Paper 1' });
    const entity2 = new MockEntity('Paper', { title: 'Paper 2' });
    entity2.verificationState = VERIFICATION_STATES.VERIFIED;

    store.addEntity(entity1);
    store.addEntity(entity2);

    const stats = store.stats();
    assert.strictEqual(stats.verificationCounts.extracted, 1, 'Should have 1 extracted');
    assert.strictEqual(stats.verificationCounts.verified, 1, 'Should have 1 verified');
  });
});

describe('TripleStore Verification Tests', () => {
  it('should verify entities', () => {
    const store = new MockTripleStore();
    const id = store.addEntity(new MockEntity('Paper', { title: 'Paper' }));

    store.verifyEntity(id, 'tester');

    const entity = store.getEntity(id);
    assert.strictEqual(entity.verificationState, VERIFICATION_STATES.VERIFIED, 'Should be verified');
    assert.strictEqual(entity.reviewedBy, 'tester', 'Should have reviewer');
    assert.ok(entity.reviewedAt, 'Should have review timestamp');
  });

  it('should get unverified entities', () => {
    const store = new MockTripleStore();

    const entity1 = new MockEntity('Paper', { title: 'Paper 1' });
    const entity2 = new MockEntity('Paper', { title: 'Paper 2' });
    entity2.verificationState = VERIFICATION_STATES.VERIFIED;

    store.addEntity(entity1);
    store.addEntity(entity2);

    const unverified = store.getUnverifiedEntities();
    assert.strictEqual(unverified.length, 1, 'Should have 1 unverified');
    assert.strictEqual(unverified[0].attributes.title, 'Paper 1', 'Should be Paper 1');
  });
});

describe('TripleStore Clear Tests', () => {
  it('should clear all data', () => {
    const store = new MockTripleStore();

    const paperId = store.addEntity(new MockEntity('Paper', { title: 'Paper' }));
    const datasetId = store.addEntity(new MockEntity('Dataset', { name: 'Dataset' }));
    store.addTriple(paperId, 'uses', datasetId);

    store.clear();

    assert.strictEqual(store.entities.size, 0, 'Entities should be empty');
    assert.strictEqual(store.triples.length, 0, 'Triples should be empty');
    assert.strictEqual(store.stats().totalEntities, 0, 'Stats should show 0');
  });
});

// Run tests if executed directly
if (require.main === module) {
  console.log('Running TripleStore tests...');
}

module.exports = {
  MockTripleStore,
  MockEntity
};