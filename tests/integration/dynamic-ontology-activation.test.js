/**
 * Dynamic Ontology Activation Tests
 */

const { assert, describe, it } = require('../setup');
const DynamicOntologyActivation = require('../../core/understanding/DynamicOntologyActivation');

describe('Dynamic Ontology Activation', () => {
  it('should activate correct layers for paper source', () => {
    const activator = new DynamicOntologyActivation();
    const admissionResult = {
      sourceType: 'Paper',
      primaryRole: 'earth_content',
      activatedOntologyLayers: ['source', 'capability', 'world'],
      activatedCategories: ['data', 'modeling', 'earth-variable']
    };

    const activated = activator.getActivatedOntology(admissionResult);

    assert.ok(activated.layers.includes('source'), 'Should include source layer');
    assert.ok(activated.layers.includes('capability'), 'Should include capability layer');
    assert.ok(activated.layers.includes('world'), 'Should include world layer');
    assert.ok(activated.entityTypes.length > 0, 'Should have entity types');
    assert.ok(activated.relationTypes.length > 0, 'Should have relation types');
  });

  it('should limit entity types based on categories', () => {
    const activator = new DynamicOntologyActivation();
    const admissionResult = {
      sourceType: 'Paper',
      primaryRole: 'data_capability',
      activatedOntologyLayers: ['source', 'capability'],
      activatedCategories: ['data']
    };

    const activated = activator.getActivatedOntology(admissionResult);

    // Should include data capability entities
    assert.ok(activated.entityTypes.includes('Dataset'), 'Should include Dataset');
    assert.ok(activated.entityTypes.includes('Variable'), 'Should include Variable');

    // Should NOT include unrelated entities
    assert.ok(!activated.entityTypes.includes('Policy'), 'Should not include Policy');
    assert.ok(!activated.entityTypes.includes('FloodEvent'), 'Should not include FloodEvent');
  });

  it('should generate extraction hints based on role', () => {
    const activator = new DynamicOntologyActivation();
    const admissionResult = {
      sourceType: 'Paper',
      primaryRole: 'modeling_capability',
      activatedOntologyLayers: ['source', 'capability'],
      activatedCategories: ['modeling']
    };

    const activated = activator.getActivatedOntology(admissionResult);

    assert.ok(activated.extractionHints.length > 0, 'Should have extraction hints');
    assert.ok(
      activated.extractionHints.some(h => h.includes('model') || h.includes('architecture')),
      'Should have modeling-related hints'
    );
  });

  it('should generate LLM extraction prompt', () => {
    const activator = new DynamicOntologyActivation();
    const admissionResult = {
      sourceType: 'Paper',
      primaryRole: 'earth_content',
      activatedOntologyLayers: ['source', 'capability', 'world'],
      activatedCategories: ['data', 'earth-variable']
    };

    const prompt = activator.generateExtractionPrompt(admissionResult, {});

    assert.ok(prompt.includes('Source Type: Paper'), 'Should include source type');
    assert.ok(prompt.includes('Primary Role: earth_content'), 'Should include primary role');
    assert.ok(prompt.includes('Entity Types'), 'Should list entity types');
    assert.ok(prompt.includes('Extraction Hints'), 'Should include extraction hints');
    assert.ok(prompt.includes('JSON'), 'Should mention JSON output format');
  });

  it('should include relevant relations for world layer', () => {
    const activator = new DynamicOntologyActivation();
    const admissionResult = {
      sourceType: 'Paper',
      primaryRole: 'earth_content',
      activatedOntologyLayers: ['source', 'capability', 'world'],
      activatedCategories: ['earth-object', 'hazard']
    };

    const activated = activator.getActivatedOntology(admissionResult);

    assert.ok(activated.relationTypes.includes('located_at'), 'Should include located_at');
    assert.ok(activated.relationTypes.includes('drains_to'), 'Should include drains_to for earth-object');
  });

  it('should provide statistics', () => {
    const activator = new DynamicOntologyActivation();
    const admissionResult = {
      sourceType: 'Repository',
      primaryRole: 'computing_capability',
      activatedOntologyLayers: ['source', 'capability'],
      activatedCategories: ['computing', 'modeling']
    };

    const stats = activator.getStats(admissionResult);

    assert.ok(stats.totalEntityTypes > 0, 'Should count entity types');
    assert.ok(stats.totalRelationTypes > 0, 'Should count relation types');
    assert.ok(stats.layers.includes('capability'), 'Should list activated layers');
    assert.ok(stats.categories.includes('computing'), 'Should list activated categories');
  });

  it('should activate governance entities for policy documents', () => {
    const activator = new DynamicOntologyActivation();
    const admissionResult = {
      sourceType: 'PolicyDocument',
      primaryRole: 'governance_capability',
      activatedOntologyLayers: ['source', 'capability', 'world'],
      activatedCategories: ['governance', 'risk']
    };

    const activated = activator.getActivatedOntology(admissionResult);

    assert.ok(activated.entityTypes.includes('Policy'), 'Should include Policy');
    assert.ok(activated.entityTypes.includes('Regulation'), 'Should include Regulation');
    assert.ok(activated.entityTypes.includes('Institution'), 'Should include Institution');
  });

  it('should activate hazard entities for event signals', () => {
    const activator = new DynamicOntologyActivation();
    const admissionResult = {
      sourceType: 'News',
      primaryRole: 'event_signal',
      activatedOntologyLayers: ['source', 'world'],
      activatedCategories: ['hazard', 'earth-object']
    };

    const activated = activator.getActivatedOntology(admissionResult);

    assert.ok(activated.entityTypes.includes('FloodEvent'), 'Should include FloodEvent');
    assert.ok(activated.entityTypes.includes('DroughtEvent'), 'Should include DroughtEvent');
    assert.ok(activated.relationTypes.includes('triggers_hazard'), 'Should include hazard relations');
  });
});

// Run tests if executed directly
if (require.main === module) {
  console.log('Running Dynamic Ontology Activation tests...');
}

module.exports = {};
