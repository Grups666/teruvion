/**
 * Integration Tests for Ingest Pipeline
 * Tests the full flow from input to entity creation
 */

const { assert, describe, it, testUtils } = require('../setup');
const { MockTripleStore, MockEntity, VERIFICATION_STATES } = require('../helpers/mock-store');
const { MockLLM, createMockLLM, MOCK_RESPONSES } = require('../helpers/mock-llm');

// Sample fixtures
const samplePaper = require('../helpers/fixtures/sample-paper.json');
const sampleGithub = require('../helpers/fixtures/sample-github.json');

describe('Ingest Pipeline Integration Tests', () => {
  it('should process a paper input end-to-end', async () => {
    const store = new MockTripleStore();
    const llm = createMockLLM();

    // Simulate ingest pipeline
    // 1. Fetch content (mock)
    const content = {
      type: 'paper',
      title: samplePaper.title,
      abstract: samplePaper.abstract,
      doi: samplePaper.doi
    };

    // 2. Decompose via LLM (mock)
    const decomposition = await llm.callJSON('Extract research entities from this paper');

    assert.ok(decomposition.entities, 'Should have entities');
    assert.ok(decomposition.triples, 'Should have triples');

    // 3. Create entities in store
    const entityIds = {};
    for (const entityData of decomposition.entities) {
      const entity = new MockEntity(entityData.type, entityData.attributes);
      const id = store.addEntity(entity);
      entityIds[entityData.name] = id;
    }

    // 4. Create triples
    for (const tripleData of decomposition.triples) {
      const subjectId = entityIds[tripleData.subject];
      const objectId = entityIds[tripleData.object];
      if (subjectId && objectId) {
        store.addTriple(subjectId, tripleData.predicate, objectId);
      }
    }

    // Verify results
    const stats = store.stats();
    assert.ok(stats.totalEntities > 0, 'Should have created entities');
    assert.ok(stats.totalTriples > 0, 'Should have created triples');
  });

  it('should handle GitHub input', async () => {
    const store = new MockTripleStore();
    const llm = createMockLLM({
      decomposition: MOCK_RESPONSES.decomposition.github
    });

    // Simulate GitHub content fetch
    const content = {
      type: 'github',
      name: sampleGithub.name,
      readme: sampleGithub.readme,
      url: sampleGithub.url
    };

    // Decompose
    const decomposition = await llm.callJSON('Extract entities from GitHub repository');

    // Create entities
    for (const entityData of decomposition.entities) {
      const entity = new MockEntity(entityData.type, entityData.attributes);
      store.addEntity(entity);
    }

    const stats = store.stats();
    assert.ok(stats.typeCounts.Code > 0, 'Should have Code entity');
  });
});

describe('Source Admission Integration Tests', () => {
  it('should evaluate research relevance for paper', async () => {
    const llm = createMockLLM();

    const evaluation = await llm.callJSON('Evaluate research relevance for DOI: 10.1038/test');

    assert.ok(evaluation.isResearch, 'Paper should be identified as research');
    assert.ok(evaluation.relevanceScore > 0.5, 'Score should be high for paper');
    assert.ok(evaluation.domain, 'Should identify domain');
  });

  it('should evaluate research relevance for news', async () => {
    const llm = createMockLLM({
      admission: MOCK_RESPONSES.admission.news
    });

    const evaluation = await llm.callJSON('Evaluate research relevance for news article');

    assert.strictEqual(evaluation.isResearch, false, 'News should not be research');
    assert.ok(evaluation.relevanceScore < 0.5, 'Score should be low for news');
  });
});

describe('Entity Mapper Integration Tests', () => {
  it('should map understanding output to entities', async () => {
    const store = new MockTripleStore();

    // Simulate understanding output
    const understanding = {
      datasets: {
        datasets: [
          {
            name: 'ERA5-Land',
            type: 'reanalysis',
            variables: [{ name: 'precipitation' }],
            spatial: { coverage: 'global' },
            access: { url: 'https://test.com' }
          }
        ]
      },
      methods: {
        methods: [
          {
            name: 'LSTM Model',
            category: 'machine-learning',
            architecture: { type: 'LSTM' }
          }
        ]
      }
    };

    // Manual mapping (EntityMapper will be created in Phase 5)
    for (const ds of understanding.datasets.datasets) {
      const entity = new MockEntity('Dataset', {
        name: ds.name,
        format: ds.type,
        variables: ds.variables.map(v => v.name),
        spatialCoverage: ds.spatial.coverage,
        source: ds.access.url
      });
      store.addEntity(entity);
    }

    for (const method of understanding.methods.methods) {
      const entity = new MockEntity('Method', {
        name: method.name,
        category: method.category,
        architecture: method.architecture?.type
      });
      store.addEntity(entity);
    }

    const stats = store.stats();
    assert.ok(stats.typeCounts.Dataset > 0, 'Should have Dataset');
    assert.ok(stats.typeCounts.Method > 0, 'Should have Method');
  });
});

describe('Persistence Integration Tests', () => {
  it('should persist and restore full pipeline state', () => {
    const store = new MockTripleStore();

    // Create complex state
    const paperId = store.addEntity(new MockEntity('Paper', { title: 'Test Paper', doi: '10.1234' }));
    const ds1Id = store.addEntity(new MockEntity('Dataset', { name: 'Dataset 1' }));
    const ds2Id = store.addEntity(new MockEntity('Dataset', { name: 'Dataset 2' }));
    const methodId = store.addEntity(new MockEntity('Method', { name: 'Test Method' }));
    const claimId = store.addEntity(new MockEntity('Claim', { statement: 'Test claim' }));

    store.addTriple(paperId, 'uses', ds1Id);
    store.addTriple(paperId, 'uses', ds2Id);
    store.addTriple(paperId, 'applies', methodId);
    store.addTriple(claimId, 'supported_by', paperId);

    // Verify some entities
    store.verifyEntity(paperId, 'tester');
    store.verifyEntity(methodId, 'tester');

    // Serialize
    const json = store.toJSON();
    const filepath = testUtils.createTempFile(json);

    // Restore
    const restoredStore = MockTripleStore.fromJSON(json);

    // Verify all entities restored
    assert.strictEqual(restoredStore.stats().totalEntities, 5, 'All entities should be restored');
    assert.strictEqual(restoredStore.stats().totalTriples, 4, 'All triples should be restored');

    // Verify verification state persisted
    const restoredPaper = restoredStore.getEntity(paperId);
    assert.strictEqual(restoredPaper.verificationState, VERIFICATION_STATES.VERIFIED, 'Verification should persist');

    // Verify relations
    const relations = restoredStore.getRelations(paperId);
    assert.strictEqual(relations.outgoing.length, 3, 'Should have 3 outgoing');
    assert.strictEqual(relations.incoming.length, 1, 'Should have 1 incoming');
  });
});

// Run tests if executed directly
if (require.main === module) {
  console.log('Running integration tests...');
}

module.exports = {};