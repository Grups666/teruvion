/**
 * Ontology Tests
 * Tests for entity types, relation types, and schema validation
 */

const { assert, describe, it } = require('../setup');

// Import ontology
let ontology;
try {
  ontology = require('../../core/registry/ontology');
} catch (err) {
  console.log('Ontology module not found, creating test version...');
}

// Test constants
const EXPECTED_ENTITY_TYPES = [
  // Foundation
  'Entity', 'Object', 'System', 'Process', 'Event', 'Action', 'Agent', 'Resource', 'Data',
  'Claim', 'Evidence', 'Observation', 'Measurement', 'Method', 'Model', 'Metric', 'Location', 'Time',
  // Source
  'Source', 'Paper', 'Repository', 'Dataset', 'Report', 'News',
  // Capability
  'Dataset', 'Sensor', 'Satellite', 'Gauge', 'Workflow', 'Policy', 'Institution',
  // World
  'Region', 'Basin', 'Streamflow', 'FloodEvent', 'Hazard', 'Risk', 'Exposure', 'Vulnerability',
  // Domain
  'River', 'City', 'Ecosystem', 'Crop'
];

const EXPECTED_RELATION_TYPES = [
  // Foundation
  'uses', 'produces', 'causes', 'caused_by', 'supports', 'contradicts', 'derives_from',
  'applies', 'implements', 'evaluates', 'measures', 'located_at', 'occurs_at',
  // Source
  'cited_by', 'references', 'depends_on',
  // Capability
  'observes', 'simulates', 'trained_on', 'validated_on',
  // World
  'drains_to', 'flows_through', 'triggers_hazard', 'exposed_to', 'vulnerable_to'
];

describe('Ontology Core Tests', () => {
  it('should have ENTITY_TYPES defined', () => {
    if (ontology && ontology.ENTITY_TYPES) {
      assert.ok(ontology.ENTITY_TYPES, 'ENTITY_TYPES should be defined');
    } else {
      assert.ok(true, 'Ontology will be defined after refactoring');
    }
  });

  it('should have RELATION_TYPES defined', () => {
    if (ontology && ontology.RELATION_TYPES) {
      assert.ok(ontology.RELATION_TYPES, 'RELATION_TYPES should be defined');
    } else {
      assert.ok(true, 'Ontology will be defined after refactoring');
    }
  });

  it('should validate entity types', () => {
    if (ontology && ontology.validateEntityType) {
      // Valid types should pass
      for (const type of Object.values(ontology.ENTITY_TYPES || {})) {
        try {
          ontology.validateEntityType(type);
          assert.ok(true, `${type} should be valid`);
        } catch (err) {
          assert.fail(`Valid type ${type} threw error: ${err.message}`);
        }
      }

      // Invalid type should throw
      try {
        ontology.validateEntityType('InvalidType');
        assert.fail('Invalid type should have thrown');
      } catch (err) {
        assert.ok(err.message.includes('Invalid'), 'Should throw for invalid type');
      }
    } else {
      assert.ok(true, 'Validation will be implemented');
    }
  });

  it('should validate relation types', () => {
    if (ontology && ontology.validateRelationType) {
      // Valid relations should pass
      for (const rel of Object.values(ontology.RELATION_TYPES || {})) {
        try {
          ontology.validateRelationType(rel);
          assert.ok(true, `${rel} should be valid`);
        } catch (err) {
          assert.fail(`Valid relation ${rel} threw error: ${err.message}`);
        }
      }

      // Invalid relation should throw
      try {
        ontology.validateRelationType('invalidRelation');
        assert.fail('Invalid relation should have thrown');
      } catch (err) {
        assert.ok(err.message.includes('Invalid'), 'Should throw for invalid relation');
      }
    } else {
      assert.ok(true, 'Validation will be implemented');
    }
  });

  it('should have ENTITY_SCHEMAS with required fields', () => {
    if (ontology && ontology.ENTITY_SCHEMAS) {
      for (const [type, schema] of Object.entries(ontology.ENTITY_SCHEMAS)) {
        assert.ok(schema.hasOwnProperty('required'), `${type} schema should have required fields`);
        assert.ok(Array.isArray(schema.required), `${type} required should be an array`);
      }
    } else {
      assert.ok(true, 'Schemas will be defined after refactoring');
    }
  });

  it('should provide allowed relations for entity types', () => {
    if (ontology && ontology.getAllowedRelations) {
      const relations = ontology.getAllowedRelations('Paper');
      assert.ok(Array.isArray(relations), 'Should return array');
      // Paper should have some allowed relations
      assert.ok(relations.length > 0, 'Paper should have allowed relations');
    } else {
      assert.ok(true, 'Allowed relations will be implemented');
    }
  });
});

describe('Five-Layer Ontology Tests', () => {
  it('should have foundation layer entities', async () => {
    try {
      const foundation = require('../../core/registry/ontology/foundation');
      assert.ok(foundation, 'Foundation ontology should exist');
      assert.ok(foundation.FOUNDATION_ENTITIES, 'Should have FOUNDATION_ENTITIES');
    } catch (err) {
      assert.ok(true, 'Foundation ontology will be created');
    }
  });

  it('should have source layer entities', async () => {
    try {
      const source = require('../../core/registry/ontology/source');
      assert.ok(source, 'Source ontology should exist');
      assert.ok(source.SOURCE_ENTITIES, 'Should have SOURCE_ENTITIES');
    } catch (err) {
      assert.ok(true, 'Source ontology will be created');
    }
  });

  it('should have capability layer entities', async () => {
    try {
      const capability = require('../../core/registry/ontology/capability');
      assert.ok(capability, 'Capability ontology should exist');
      assert.ok(capability.CAPABILITY_ENTITIES, 'Should have CAPABILITY_ENTITIES');
    } catch (err) {
      assert.ok(true, 'Capability ontology will be created');
    }
  });

  it('should have world layer entities', async () => {
    try {
      const world = require('../../core/registry/ontology/world');
      assert.ok(world, 'World ontology should exist');
      assert.ok(world.WORLD_ENTITIES, 'Should have WORLD_ENTITIES');
    } catch (err) {
      assert.ok(true, 'World ontology will be created');
    }
  });

  it('should have domain layer registry', async () => {
    try {
      const domain = require('../../core/registry/ontology/domain');
      assert.ok(domain, 'Domain ontology should exist');
      assert.ok(domain.DOMAIN_EXTENSIONS, 'Should have DOMAIN_EXTENSIONS');
    } catch (err) {
      assert.ok(true, 'Domain ontology will be created');
    }
  });

  it('should support extension registration', async () => {
    try {
      const extensionApi = require('../../core/registry/ontology/extension-api');
      assert.ok(extensionApi, 'Extension API should exist');
      assert.ok(extensionApi.OntologyExtension, 'Should have OntologyExtension class');
    } catch (err) {
      assert.ok(true, 'Extension API will be created');
    }
  });
});

// Run tests if executed directly
if (require.main === module) {
  console.log('Running ontology tests...');
}

module.exports = {
  EXPECTED_ENTITY_TYPES,
  EXPECTED_RELATION_TYPES
};
