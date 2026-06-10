/**
 * Layer 0: Foundation Ontology
 * The most abstract, universal types that form the basis of any complex system.
 *
 * This layer is domain-agnostic, source-agnostic, and purpose-agnostic.
 * It answers: "What basic concepts exist in ANY complex system?"
 *
 * Design Principles:
 * - Not specific to Earth science, research, or any domain
 * - Maximum stability (rarely changes)
 * - Minimum viable set for building higher layers
 */

// ============================================================================
// FOUNDATION ENTITY TYPES (24 universal types)
// ============================================================================

const FOUNDATION_ENTITIES = {
  // === Existence Layer (What exists?) ===

  Entity: {
    name: 'Entity',
    layer: 'foundation',
    category: 'existence',
    description: 'Any thing that has identity and can be referenced',
    required: ['name'],
    optional: ['description', 'aliases', 'tags'],
    defaults: {}
  },

  Object: {
    name: 'Object',
    layer: 'foundation',
    category: 'existence',
    description: 'A concrete or abstract object with properties',
    required: ['name'],
    optional: ['properties', 'state', 'lifecycle'],
    defaults: {}
  },

  System: {
    name: 'System',
    layer: 'foundation',
    category: 'existence',
    description: 'A system of interacting components',
    required: ['name'],
    optional: ['components', 'boundaries', 'interfaces', 'behavior'],
    defaults: { components: [], interfaces: [] }
  },

  State: {
    name: 'State',
    layer: 'foundation',
    category: 'existence',
    description: 'A state or condition of an entity or system',
    required: ['name'],
    optional: ['properties', 'transitions', 'stability'],
    defaults: {}
  },

  // === Process Layer (What happens?) ===

  Process: {
    name: 'Process',
    layer: 'foundation',
    category: 'process',
    description: 'A process or transformation that changes state',
    required: ['name'],
    optional: ['inputs', 'outputs', 'steps', 'duration', 'triggers'],
    defaults: { steps: [] }
  },

  Event: {
    name: 'Event',
    layer: 'foundation',
    category: 'process',
    description: 'An occurrence at a specific time and possibly place',
    required: ['name'],
    optional: ['timestamp', 'magnitude', 'impact', 'causes', 'effects'],
    defaults: {}
  },

  Action: {
    name: 'Action',
    layer: 'foundation',
    category: 'process',
    description: 'An intentional action taken by an agent',
    required: ['name'],
    optional: ['agent', 'target', 'purpose', 'outcome'],
    defaults: {}
  },

  Intervention: {
    name: 'Intervention',
    layer: 'foundation',
    category: 'process',
    description: 'A deliberate intervention to change a system state',
    required: ['name'],
    optional: ['type', 'target', 'mechanism', 'effectiveness', 'sideEffects'],
    defaults: {}
  },

  // === Agent Layer (Who/what acts?) ===

  Agent: {
    name: 'Agent',
    layer: 'foundation',
    category: 'agent',
    description: 'An entity that can act or make decisions',
    required: ['name'],
    optional: ['type', 'capabilities', 'goals', 'constraints'],
    defaults: {}
  },

  // === Resource Layer (What is used?) ===

  Resource: {
    name: 'Resource',
    layer: 'foundation',
    category: 'resource',
    description: 'A resource that can be used, consumed, or produced',
    required: ['name'],
    optional: ['type', 'quantity', 'unit', 'availability', 'constraints'],
    defaults: {}
  },

  Data: {
    name: 'Data',
    layer: 'foundation',
    category: 'resource',
    description: 'Data as a resource',
    required: ['name'],
    optional: ['format', 'size', 'schema', 'quality', 'provenance'],
    defaults: {}
  },

  // === Knowledge Layer (What is known?) ===

  Claim: {
    name: 'Claim',
    layer: 'foundation',
    category: 'knowledge',
    description: 'A statement or assertion requiring support',
    required: ['statement'],
    optional: ['confidence', 'scope', 'limitations', 'validity'],
    defaults: { confidence: 0.8 }
  },

  Evidence: {
    name: 'Evidence',
    layer: 'foundation',
    category: 'knowledge',
    description: 'Material that supports or contradicts a claim',
    required: ['type'],
    optional: ['source', 'confidence', 'relevance', 'strength'],
    defaults: { confidence: 0.8 }
  },

  Observation: {
    name: 'Observation',
    layer: 'foundation',
    category: 'knowledge',
    description: 'A direct observation of reality',
    required: ['name'],
    optional: ['observer', 'method', 'timestamp', 'uncertainty', 'context'],
    defaults: {}
  },

  Measurement: {
    name: 'Measurement',
    layer: 'foundation',
    category: 'knowledge',
    description: 'A quantified observation with value and unit',
    required: ['name', 'value'],
    optional: ['unit', 'uncertainty', 'method', 'timestamp', 'location'],
    defaults: {}
  },

  // === Method Layer (How is it done?) ===

  Method: {
    name: 'Method',
    layer: 'foundation',
    category: 'method',
    description: 'A method, technique, or approach for doing something',
    required: ['name', 'category'],
    optional: ['description', 'parameters', 'requirements', 'limitations'],
    defaults: {}
  },

  Model: {
    name: 'Model',
    layer: 'foundation',
    category: 'method',
    description: 'A model representing or simulating some aspect of reality',
    required: ['name'],
    optional: ['type', 'representation', 'assumptions', 'validation', 'performance'],
    defaults: {}
  },

  Metric: {
    name: 'Metric',
    layer: 'foundation',
    category: 'method',
    description: 'A metric for measuring or evaluating something',
    required: ['name', 'value'],
    optional: ['unit', 'baseline', 'target', 'interpretation'],
    defaults: {}
  },

  // === Uncertainty Layer (How certain?) ===

  Uncertainty: {
    name: 'Uncertainty',
    layer: 'foundation',
    category: 'uncertainty',
    description: 'Uncertainty or error bounds',
    required: ['value'],
    optional: ['type', 'confidenceInterval', 'distribution', 'sources'],
    defaults: { type: 'standard_error' }
  },

  Scenario: {
    name: 'Scenario',
    layer: 'foundation',
    category: 'uncertainty',
    description: 'A possible future state or condition',
    required: ['name'],
    optional: ['probability', 'assumptions', 'pathway', 'indicators'],
    defaults: {}
  },

  Risk: {
    name: 'Risk',
    layer: 'foundation',
    category: 'uncertainty',
    description: 'A risk combining hazard, exposure, and vulnerability',
    required: ['name'],
    optional: ['hazard', 'exposure', 'vulnerability', 'probability', 'impact'],
    defaults: {}
  },

  // === Context Layer (Where/when?) ===

  Location: {
    name: 'Location',
    layer: 'foundation',
    category: 'context',
    description: 'A spatial location or region',
    required: ['name'],
    optional: ['geometry', 'bbox', 'centroid', 'area', 'crs'],
    defaults: {}
  },

  Time: {
    name: 'Time',
    layer: 'foundation',
    category: 'context',
    description: 'A temporal extent or point',
    required: ['value'],
    optional: ['unit', 'resolution', 'extent', 'calendar'],
    defaults: { unit: 'ISO' }
  },

  Relation: {
    name: 'Relation',
    layer: 'foundation',
    category: 'context',
    description: 'A relationship between entities',
    required: ['type', 'subject', 'object'],
    optional: ['properties', 'strength', 'temporal', 'conditional'],
    defaults: {}
  }
};

// ============================================================================
// FOUNDATION RELATION TYPES (30 universal relations)
// ============================================================================

const FOUNDATION_RELATIONS = {
  // === Existence Relations ===
  is_a: {
    name: 'is_a',
    layer: 'foundation',
    category: 'existence',
    description: 'Subject is an instance of the object type',
    domain: ['Entity', 'Object'],
    range: ['Entity', 'Object', 'System']
  },

  has_part: {
    name: 'has_part',
    layer: 'foundation',
    category: 'existence',
    description: 'Subject has the object as a part',
    domain: ['System', 'Object', 'Entity'],
    range: ['System', 'Object', 'Entity']
  },

  part_of: {
    name: 'part_of',
    layer: 'foundation',
    category: 'existence',
    description: 'Subject is a part of the object',
    domain: ['System', 'Object', 'Entity'],
    range: ['System', 'Object', 'Entity']
  },

  connected_to: {
    name: 'connected_to',
    layer: 'foundation',
    category: 'existence',
    description: 'Subject is connected to the object',
    domain: ['Object', 'System', 'Entity'],
    range: ['Object', 'System', 'Entity']
  },

  // === Process Relations ===
  causes: {
    name: 'causes',
    layer: 'foundation',
    category: 'process',
    description: 'Subject causes the object',
    domain: ['Process', 'Event', 'Action', 'Entity'],
    range: ['Process', 'Event', 'State', 'Entity']
  },

  caused_by: {
    name: 'caused_by',
    layer: 'foundation',
    category: 'process',
    description: 'Subject is caused by the object',
    domain: ['Process', 'Event', 'State', 'Entity'],
    range: ['Process', 'Event', 'Action', 'Entity']
  },

  triggers: {
    name: 'triggers',
    layer: 'foundation',
    category: 'process',
    description: 'Subject triggers the object process',
    domain: ['Event', 'State', 'Entity'],
    range: ['Process', 'Event', 'Action']
  },

  precedes: {
    name: 'precedes',
    layer: 'foundation',
    category: 'process',
    description: 'Subject precedes the object temporally',
    domain: ['Event', 'Process', 'Time'],
    range: ['Event', 'Process', 'Time']
  },

  follows: {
    name: 'follows',
    layer: 'foundation',
    category: 'process',
    description: 'Subject follows the object temporally',
    domain: ['Event', 'Process', 'Time'],
    range: ['Event', 'Process', 'Time']
  },

  // === Agent Relations ===
  performs: {
    name: 'performs',
    layer: 'foundation',
    category: 'agent',
    description: 'Subject (agent) performs the object (action)',
    domain: ['Agent'],
    range: ['Action', 'Process', 'Intervention']
  },

  performed_by: {
    name: 'performed_by',
    layer: 'foundation',
    category: 'agent',
    description: 'Subject is performed by the object (agent)',
    domain: ['Action', 'Process', 'Intervention'],
    range: ['Agent']
  },

  targets: {
    name: 'targets',
    layer: 'foundation',
    category: 'agent',
    description: 'Subject (action) targets the object',
    domain: ['Action', 'Intervention'],
    range: ['Entity', 'Object', 'System']
  },

  // === Resource Relations ===
  uses: {
    name: 'uses',
    layer: 'foundation',
    category: 'resource',
    description: 'Subject uses the object as a resource',
    domain: ['Process', 'Agent', 'Method', 'Model'],
    range: ['Resource', 'Data', 'Entity']
  },

  produces: {
    name: 'produces',
    layer: 'foundation',
    category: 'resource',
    description: 'Subject produces the object',
    domain: ['Process', 'Method', 'Model', 'Agent'],
    range: ['Resource', 'Data', 'Entity', 'State']
  },

  consumes: {
    name: 'consumes',
    layer: 'foundation',
    category: 'resource',
    description: 'Subject consumes the object resource',
    domain: ['Process', 'Agent', 'Method'],
    range: ['Resource', 'Data']
  },

  // === Knowledge Relations ===
  claims: {
    name: 'claims',
    layer: 'foundation',
    category: 'knowledge',
    description: 'Subject makes the object claim',
    domain: ['Agent', 'Entity', 'Source'],
    range: ['Claim']
  },

  supports: {
    name: 'supports',
    layer: 'foundation',
    category: 'knowledge',
    description: 'Subject supports the object claim',
    domain: ['Evidence', 'Data', 'Observation', 'Measurement'],
    range: ['Claim']
  },

  contradicts: {
    name: 'contradicts',
    layer: 'foundation',
    category: 'knowledge',
    description: 'Subject contradicts the object claim',
    domain: ['Evidence', 'Data', 'Observation', 'Measurement'],
    range: ['Claim']
  },

  derives_from: {
    name: 'derives_from',
    layer: 'foundation',
    category: 'knowledge',
    description: 'Subject derives from the object',
    domain: ['Claim', 'Data', 'Result'],
    range: ['Entity', 'Data', 'Method', 'Source']
  },

  // === Method Relations ===
  applies: {
    name: 'applies',
    layer: 'foundation',
    category: 'method',
    description: 'Subject applies the object method',
    domain: ['Agent', 'Process', 'Model'],
    range: ['Method', 'Model']
  },

  implements: {
    name: 'implements',
    layer: 'foundation',
    category: 'method',
    description: 'Subject implements the object method/model',
    domain: ['Entity', 'System', 'Process'],
    range: ['Method', 'Model']
  },

  evaluates: {
    name: 'evaluates',
    layer: 'foundation',
    category: 'method',
    description: 'Subject evaluates the object',
    domain: ['Method', 'Model', 'Metric'],
    range: ['Entity', 'Model', 'Claim', 'Process']
  },

  evaluated_by: {
    name: 'evaluated_by',
    layer: 'foundation',
    category: 'method',
    description: 'Subject is evaluated by the object',
    domain: ['Entity', 'Model', 'Claim', 'Process'],
    range: ['Method', 'Model', 'Metric']
  },

  measures: {
    name: 'measures',
    layer: 'foundation',
    category: 'method',
    description: 'Subject measures the object',
    domain: ['Method', 'Instrument', 'Agent'],
    range: ['Entity', 'Property', 'Metric']
  },

  measured_by: {
    name: 'measured_by',
    layer: 'foundation',
    category: 'method',
    description: 'Subject is measured by the object',
    domain: ['Entity', 'Property', 'Metric'],
    range: ['Method', 'Instrument', 'Agent']
  },

  // === Context Relations ===
  located_at: {
    name: 'located_at',
    layer: 'foundation',
    category: 'context',
    description: 'Subject is located at the object location',
    domain: ['Entity', 'Object', 'Event', 'Process'],
    range: ['Location']
  },

  occurs_at: {
    name: 'occurs_at',
    layer: 'foundation',
    category: 'context',
    description: 'Subject occurs at the object time',
    domain: ['Event', 'Process', 'Action'],
    range: ['Time']
  },

  during: {
    name: 'during',
    layer: 'foundation',
    category: 'context',
    description: 'Subject occurs during the object time period',
    domain: ['Event', 'Process', 'Action'],
    range: ['Time']
  },

  relates_to: {
    name: 'relates_to',
    layer: 'foundation',
    category: 'context',
    description: 'Subject relates to the object in some way',
    domain: ['Entity'],
    range: ['Entity']
  }
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getEntityTypes() {
  const types = {};
  for (const [key, def] of Object.entries(FOUNDATION_ENTITIES)) {
    types[key] = def.name;
  }
  return types;
}

function getRelationTypes() {
  const relations = {};
  for (const [key, def] of Object.entries(FOUNDATION_RELATIONS)) {
    relations[key] = def.name;
  }
  return relations;
}

function getEntitySchema(typeName) {
  for (const def of Object.values(FOUNDATION_ENTITIES)) {
    if (def.name === typeName) {
      return {
        required: [...def.required],
        optional: [...def.optional],
        defaults: { ...def.defaults },
        description: def.description,
        layer: 'foundation',
        category: def.category
      };
    }
  }
  return null;
}

function getRelationDefinition(relationName) {
  for (const def of Object.values(FOUNDATION_RELATIONS)) {
    if (def.name === relationName) {
      return { ...def };
    }
  }
  return null;
}

function validateEntityType(type) {
  const validTypes = Object.values(FOUNDATION_ENTITIES).map(d => d.name);
  return validTypes.includes(type);
}

function validateRelationType(relation) {
  const validRelations = Object.values(FOUNDATION_RELATIONS).map(d => d.name);
  return validRelations.includes(relation);
}

function validateEntityAttributes(type, attributes) {
  const schema = getEntitySchema(type);
  if (!schema) return false;

  for (const req of schema.required) {
    if (attributes[req] === undefined && schema.defaults[req] === undefined) {
      return false;
    }
  }
  return true;
}

function getEntitiesByCategory() {
  const categories = {};
  for (const [key, def] of Object.entries(FOUNDATION_ENTITIES)) {
    const cat = def.category;
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(def.name);
  }
  return categories;
}

function getRelationsByCategory() {
  const categories = {};
  for (const [key, def] of Object.entries(FOUNDATION_RELATIONS)) {
    const cat = def.category;
    if (!categories[cat]) categories[cat] = [];
    categories[cat].push(def.name);
  }
  return categories;
}

module.exports = {
  FOUNDATION_ENTITIES,
  FOUNDATION_RELATIONS,
  getEntityTypes,
  getRelationTypes,
  getEntitySchema,
  getRelationDefinition,
  validateEntityType,
  validateRelationType,
  validateEntityAttributes,
  getEntitiesByCategory,
  getRelationsByCategory
};
