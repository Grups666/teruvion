/**
 * Ontology Index - Five Layer System
 * Main export that merges all layers:
 * Layer 0: Foundation Ontology (universal concepts)
 * Layer 1: Source Ontology (information sources)
 * Layer 2: Capability Ontology (building Digital Earth capabilities)
 * Layer 3: Digital Earth World Ontology (Earth objects and processes)
 * Layer 4: Domain Extensions (specialized domains)
 */

const foundation = require('./foundation');
const source = require('./source');
const capability = require('./capability');
const world = require('./world');
const domain = require('./domain');
const { OntologyExtension, ExtensionRegistry, getRegistry } = require('./extension-api');

// Lazy import to avoid circular dependency (relation-semantics imports this module)
let _bridgeRelations = null;
function getBridgeRelationSemantics() {
  if (!_bridgeRelations) {
    _bridgeRelations = require('./relation-semantics');
  }
  return _bridgeRelations;
}

// ============================================================================
// UNIFIED ENTITY TYPES (All 5 Layers)
// ============================================================================

/**
 * Get all entity types across all 5 layers
 */
function getAllEntityTypes() {
  const types = {};

  // Layer 0: Foundation
  for (const [key, def] of Object.entries(foundation.FOUNDATION_ENTITIES)) {
    types[key] = def.name;
  }

  // Layer 1: Source
  for (const [key, def] of Object.entries(source.SOURCE_ENTITIES)) {
    types[key] = def.name;
  }

  // Layer 2: Capability
  for (const [key, def] of Object.entries(capability.CAPABILITY_ENTITIES)) {
    types[key] = def.name;
  }

  // Layer 3: World
  for (const [key, def] of Object.entries(world.WORLD_ENTITIES)) {
    types[key] = def.name;
  }

  // Layer 4: Domain Extensions
  for (const domainName of domain.getLoadedDomainNames()) {
    const domainDef = domain.getDomain(domainName);
    if (domainDef && domainDef.entities) {
      for (const [key, def] of Object.entries(domainDef.entities)) {
        types[key] = def.name;
      }
    }
  }

  // Layer 5: Custom Extensions
  const registry = getRegistry();
  for (const ext of registry.getAll()) {
    for (const [key, def] of Object.entries(ext.entities)) {
      types[key] = def.name;
    }
  }

  return types;
}

/**
 * ENTITY_TYPES for legacy compatibility
 */
const ENTITY_TYPES = getAllEntityTypes();

// ============================================================================
// UNIFIED RELATION TYPES (All 5 Layers)
// ============================================================================

/**
 * Get all relation types across all 5 layers + bridge relations
 */
function getAllRelationTypes() {
  const relations = {};

  // Layer 0: Foundation
  for (const [key, def] of Object.entries(foundation.FOUNDATION_RELATIONS)) {
    relations[key] = def.name;
  }

  // Layer 1: Source
  for (const [key, def] of Object.entries(source.SOURCE_RELATIONS)) {
    relations[key] = def.name;
  }

  // Layer 2: Capability
  for (const [key, def] of Object.entries(capability.CAPABILITY_RELATIONS)) {
    relations[key] = def.name;
  }

  // Layer 3: World
  for (const [key, def] of Object.entries(world.WORLD_RELATIONS)) {
    relations[key] = def.name;
  }

  // Layer 4: Domain Extensions
  for (const domainName of domain.getLoadedDomainNames()) {
    const domainDef = domain.getDomain(domainName);
    if (domainDef && domainDef.relations) {
      for (const [key, def] of Object.entries(domainDef.relations)) {
        relations[key] = def.name;
      }
    }
  }

  // Layer 5: Custom Extensions
  const registry = getRegistry();
  for (const ext of registry.getAll()) {
    for (const [key, def] of Object.entries(ext.relations)) {
      relations[key] = def.name;
    }
  }

  // Bridge Relations (Capability ↔ World connections)
  const bridgeSemantics = getBridgeRelationSemantics().BRIDGE_RELATION_SEMANTICS;
  for (const [key, semantics] of Object.entries(bridgeSemantics)) {
    relations[key] = semantics.name;
  }

  return relations;
}

/**
 * RELATION_TYPES for legacy compatibility
 */
const RELATION_TYPES = getAllRelationTypes();

// ============================================================================
// SCHEMA MANAGEMENT
// ============================================================================

/**
 * Get schema for any entity type (searches all 5 layers)
 */
function getEntitySchema(typeName) {
  // Layer 0: Foundation
  const foundationSchema = foundation.getEntitySchema(typeName);
  if (foundationSchema) {
    return { ...foundationSchema, layer: 'foundation' };
  }

  // Layer 1: Source
  const sourceSchema = source.getMergedSchema(typeName);
  if (sourceSchema) {
    return sourceSchema;
  }

  // Layer 2: Capability
  const capabilitySchema = capability.getMergedSchema(typeName);
  if (capabilitySchema) {
    return capabilitySchema;
  }

  // Layer 3: World
  const worldSchema = world.getMergedSchema(typeName);
  if (worldSchema) {
    return worldSchema;
  }

  // Layer 4: Domain
  const domainSchema = domain.getDomainEntitySchema(typeName);
  if (domainSchema) {
    return domainSchema;
  }

  // Layer 5: Custom Extensions
  const registry = getRegistry();
  for (const ext of registry.getAll()) {
    const entityDef = ext.getEntity(typeName);
    if (entityDef) {
      const parentSchema = getEntitySchema(entityDef.extends);
      if (parentSchema) {
        return {
          name: typeName,
          extends: entityDef.extends,
          layer: 'extension',
          source: ext.namespace,
          description: entityDef.description,
          required: [...parentSchema.required, ...entityDef.additionalRequired],
          optional: [...parentSchema.optional, ...entityDef.additionalOptional],
          defaults: { ...parentSchema.defaults, ...entityDef.additionalDefaults }
        };
      }
    }
  }

  return null;
}

/**
 * ENTITY_SCHEMAS for legacy compatibility
 */
const ENTITY_SCHEMAS = {};

function buildEntitySchemas() {
  for (const typeName of Object.keys(ENTITY_TYPES)) {
    const schema = getEntitySchema(typeName);
    if (schema) {
      ENTITY_SCHEMAS[typeName] = schema;
    }
  }
}

// Build schemas on load
buildEntitySchemas();

// ============================================================================
// ONTOLOGY LANGUAGE PROTOCOL
// ============================================================================

const ENTITY_TYPE_LANGUAGE_ALIASES = {
  DataObject: 'Data',
  DatasetObject: 'Dataset',
  DataProductObject: 'DataProduct',
  DataResourceObject: 'Data',
  ModelObject: 'Model',
  MethodObject: 'Method',
  AlgorithmObject: 'Algorithm',
  WorkflowObject: 'Workflow',
  PipelineObject: 'Pipeline',
  SoftwareObject: 'Software',
  ResourceObject: 'Resource',
  RegionObject: 'Region',
  EventObject: 'Event',
  HazardObject: 'Hazard',
  RiskObject: 'Risk',
  VariableObject: 'Variable',
  EarthVariableObject: 'EarthVariable',
  ActorObject: 'Agent',
  InstitutionObject: 'Institution',
  ClaimObject: 'Claim',
  Finding: 'Claim',
  FindingObject: 'Claim',
  Result: 'Claim',
  ResultObject: 'Claim',
  EvidenceObject: 'Evidence',
  Figure: 'Evidence',
  FigureObject: 'Evidence',
  Table: 'Evidence',
  TableObject: 'Evidence',
  MetricObject: 'Metric',
  Gap: 'Uncertainty',
  GapObject: 'Uncertainty',
  ResearchGap: 'Uncertainty',
  ResearchGapObject: 'Uncertainty',
  Limitation: 'Uncertainty',
  LimitationObject: 'Uncertainty',
  UncertaintyObject: 'Uncertainty',
  ObservationObject: 'Observation',
  MeasurementObject: 'Measurement',
  SourceObject: 'Source',
  PaperObject: 'Paper',
  RepositoryObject: 'Repository'
};

const EXTRACTION_TYPE_CONTRACT = {
  capabilityObjects: [
    'Dataset', 'Data', 'Model', 'Method', 'Workflow', 'Algorithm', 'Software', 'Resource'
  ],
  worldObjects: [
    'Region', 'EarthObject', 'Event', 'Hazard', 'EarthVariable', 'Variable', 'Resource', 'Agent', 'Institution'
  ],
  evidenceObjects: [
    'Claim', 'Evidence', 'Observation', 'Measurement', 'Metric', 'Uncertainty', 'DataQuality'
  ],
  routeNodes: [
    'Data', 'Variable', 'Method', 'Model', 'Workflow', 'Context', 'Finding', 'Limitation', 'Resource'
  ]
};

function normalizeTypeToken(value) {
  return String(value || '').replace(/[\s_-]+/g, '').toLowerCase();
}

function buildEntityTypeAliasIndex() {
  const index = new Map();

  for (const [key, name] of Object.entries(ENTITY_TYPES)) {
    index.set(normalizeTypeToken(key), name);
    index.set(normalizeTypeToken(name), name);
    index.set(normalizeTypeToken(`${name}Object`), name);
  }

  for (const [alias, canonical] of Object.entries(ENTITY_TYPE_LANGUAGE_ALIASES)) {
    index.set(normalizeTypeToken(alias), canonical);
  }

  return index;
}

function resolveEntityType(typeName, options = {}) {
  const raw = String(typeName || '').trim();
  if (!raw) {
    return {
      type: raw,
      changed: false,
      valid: false,
      reason: 'empty'
    };
  }

  const aliasIndex = buildEntityTypeAliasIndex();
  const resolved = aliasIndex.get(normalizeTypeToken(raw)) || raw;
  let valid = false;
  try {
    validateEntityType(resolved);
    valid = true;
  } catch {
    valid = false;
  }

  return {
    type: valid || options.allowUnknown ? resolved : raw,
    originalType: raw,
    changed: resolved !== raw,
    valid,
    reason: valid ? 'ontology-type' : 'unknown'
  };
}

function getExtractionTypeContract() {
  return {
    ...EXTRACTION_TYPE_CONTRACT,
    entityAliases: { ...ENTITY_TYPE_LANGUAGE_ALIASES }
  };
}

// ============================================================================
// VALIDATION
// ============================================================================

/**
 * Validate entity type against all 5 layers
 */
function validateEntityType(type) {
  const validTypes = Object.values(ENTITY_TYPES);
  if (!validTypes.includes(type)) {
    throw new Error(`Invalid entity type: ${type}. Valid types: ${validTypes.join(', ')}`);
  }
  return true;
}

/**
 * Validate relation type against all 5 layers
 */
function validateRelationType(relation) {
  const validRelations = Object.values(RELATION_TYPES);
  if (!validRelations.includes(relation)) {
    throw new Error(`Invalid relation type: ${relation}. Valid relations: ${validRelations.join(', ')}`);
  }
  return true;
}

/**
 * Validate entity attributes against schema
 */
function validateEntityAttributes(type, attributes) {
  const schema = getEntitySchema(type);
  if (!schema) {
    // No schema found, allow unknown types with minimal validation
    if (!attributes.name) {
      attributes.name = `Unnamed ${type}`;
    }
    return true;
  }

  // Fill in defaults for missing required fields
  for (const req of schema.required) {
    if (attributes[req] === undefined) {
      if (schema.defaults[req] !== undefined) {
        attributes[req] = schema.defaults[req];
      } else {
        // Set sensible defaults based on field name
        attributes[req] = req === 'name' ? `Unnamed ${type}` :
                          req === 'type' ? 'unknown' :
                          req === 'identifier' ? `id-${Date.now()}` :
                          req === 'statement' ? 'No statement' :
                          req === 'value' ? 0 :
                          req === 'category' ? 'general' :
                          req === 'stationId' ? `station-${Date.now()}` :
                          req === 'repo' ? 'unknown-repo' :
                          req === 'title' ? `Untitled ${type}` :
                          req === 'standardId' ? `std-${Date.now()}` :
                          '';
      }
    }
  }

  return true;
}

// ============================================================================
// ALLOWED RELATIONS
// ============================================================================

/**
 * Get allowed relations for an entity type
 */
function getAllowedRelations(entityType) {
  // Map of entity types to their allowed relation types
  const allowedRelationsMap = {
    // Source types
    'Paper': ['uses', 'applies', 'references', 'studies', 'proposes', 'has_figure', 'cited_by', 'produces', 'cites'],
    'Repository': ['uses', 'implements', 'depends_on', 'produces', 'references', 'depends_on_software'],
    'Dataset': ['covers', 'has_variable', 'subset_of', 'derived_from_data', 'used_by', 'references'],

    // Capability types
    'Model': ['uses', 'applies', 'implements', 'trained_on', 'produces', 'evaluated_by', 'validated_on', 'simulates'],
    'Claim': ['supports', 'contradicts', 'derives_from', 'refines', 'evaluated_by', 'based_on', 'supports_claim'],
    'Method': ['uses', 'applies', 'implements', 'produces', 'evaluated_by', 'compares', 'refines', 'based_on'],
    'Workflow': ['uses', 'applies', 'implements', 'consists_of', 'executes', 'depends_on', 'depends_on_software', 'runs_on'],
    'Sensor': ['observes', 'part_of_network', 'has_coverage'],
    'Gauge': ['observes', 'measures', 'part_of_network', 'drains_to'],

    // World types
    'Basin': ['drains_to', 'upstream_of', 'downstream_of', 'part_of_system', 'flows_through', 'discharges_to'],
    'Region': ['contains', 'adjacent_to', 'drains_to', 'part_of_system'],
    'FloodEvent': ['triggers_hazard', 'affects', 'located_at', 'occurs_at', 'causes', 'caused_by'],
    'Hazard': ['exposed_to', 'vulnerable_to', 'generates_risk', 'mitigates_hazard', 'triggers_hazard'],
    'Risk': ['exposed_to', 'vulnerable_to', 'generates_risk', 'mitigates_hazard', 'reduces_risk'],

    // Domain types
    'HydrologicalModel': ['uses', 'forecasts', 'calibrates_with', 'evaluated_by', 'outperforms', 'models_basin', 'simulates'],
    'River': ['drains_to', 'upstream_of', 'downstream_of', 'flows_through', 'discharges_to'],
    'GaugeStation': ['measures', 'drains_to', 'studies', 'observes', 'measured_at']
  };

  return allowedRelationsMap[entityType] || [];
}

// ============================================================================
// LAYER CLASSIFICATION
// ============================================================================

/**
 * Determine which layer an entity type belongs to
 */
function getEntityLayer(typeName) {
  // Layer 0: Foundation
  if (foundation.FOUNDATION_ENTITIES[typeName]) {
    return 'foundation';
  }

  // Layer 1: Source
  if (source.isSourceType(typeName)) {
    return 'source';
  }

  // Layer 2: Capability
  if (capability.isCapabilityType(typeName)) {
    return 'capability';
  }

  // Layer 3: World
  if (world.isWorldType(typeName)) {
    return 'world';
  }

  // Layer 4: Domain
  if (domain.isDomainEntity(typeName)) {
    return 'domain';
  }

  // Layer 5: Extension
  const registry = getRegistry();
  const provider = registry.findEntityProvider(typeName);
  if (provider) {
    return 'extension';
  }

  return 'unknown';
}

/**
 * Get entities organized by layer
 */
function getEntitiesByLayer() {
  const layers = {
    foundation: [],
    source: [],
    capability: [],
    world: [],
    domain: [],
    extension: []
  };

  for (const typeName of Object.keys(ENTITY_TYPES)) {
    const layer = getEntityLayer(typeName);
    if (layers[layer]) {
      layers[layer].push(typeName);
    }
  }

  return layers;
}

/**
 * Get entities organized by category (for each layer)
 */
function getEntitiesByCategory() {
  return {
    foundation: foundation.getEntitiesByCategory(),
    source: source.getSourceTypesByCategory(),
    capability: capability.getCapabilityTypesByCategory(),
    world: world.getWorldTypesByCategory(),
    domain: {} // Domains are organized by domain name
  };
}

/**
 * Get relation organized by category
 */
function getRelationsByCategory() {
  return {
    foundation: foundation.getRelationsByCategory(),
    source: {}, // Source relations don't have categories in same way
    capability: {}, // Capability relations organized differently
    world: {} // World relations organized differently
  };
}

// ============================================================================
// EXTENSION REGISTRATION
// ============================================================================

/**
 * Register a new domain extension
 */
function registerDomainExtension(domainName, definition) {
  const result = domain.registerDomain(domainName, definition);
  if (result) {
    // Rebuild schemas and types
    Object.assign(ENTITY_TYPES, getAllEntityTypes());
    Object.assign(RELATION_TYPES, getAllRelationTypes());
    buildEntitySchemas();
  }
  return result;
}

/**
 * Register a custom extension
 */
function registerCustomExtension(namespace, definition) {
  const extension = new OntologyExtension(namespace, definition);
  getRegistry().register(extension);
  // Rebuild schemas and types
  Object.assign(ENTITY_TYPES, getAllEntityTypes());
  Object.assign(RELATION_TYPES, getAllRelationTypes());
  buildEntitySchemas();
  return extension;
}

// ============================================================================
// TYPE NAME RESOLUTION
// ============================================================================

/**
 * Resolve a type name to its canonical form
 */
function resolveTypeName(typeName) {
  return resolveEntityType(typeName, { allowUnknown: true }).type;
}

/**
 * Get parent type for a type
 */
function getParentType(typeName) {
  const schema = getEntitySchema(typeName);
  return schema?.extends || null;
}

/**
 * Get full type hierarchy for a type
 */
function getTypeHierarchy(typeName) {
  const hierarchy = [typeName];
  let current = typeName;

  while (current) {
    const parent = getParentType(current);
    if (parent && !hierarchy.includes(parent)) {
      hierarchy.push(parent);
      current = parent;
    } else {
      break;
    }
  }

  return hierarchy;
}

// ============================================================================
// STATISTICS
// ============================================================================

/**
 * Get statistics about the ontology
 */
function getOntologyStats() {
  const layerStats = getEntitiesByLayer();

  return {
    totalEntities: Object.keys(ENTITY_TYPES).length,
    totalRelations: Object.keys(RELATION_TYPES).length,
    byLayer: {
      foundation: layerStats.foundation.length,
      source: layerStats.source.length,
      capability: layerStats.capability.length,
      world: layerStats.world.length,
      domain: layerStats.domain.length,
      extension: layerStats.extension.length
    },
    domainsLoaded: domain.getLoadedDomainNames(),
    extensionsLoaded: getRegistry().getAll().map(e => e.namespace)
  };
}

// ============================================================================
// BRIDGE RELATION WRAPPERS
// ============================================================================

/**
 * Get BRIDGE_RELATION_SEMANTICS (lazy-loaded)
 */
function getBridgeRelations() {
  return getBridgeRelationSemantics().BRIDGE_RELATION_SEMANTICS;
}

/**
 * Validate a bridge relation (lazy-loaded)
 */
function validateBridgeRelation(relationType, subjectType, objectType, options) {
  return getBridgeRelationSemantics().validateRelation(relationType, subjectType, objectType, options);
}

/**
 * Get confidence cap for a relation (lazy-loaded)
 */
function getBridgeConfidenceCap(relationType, hasSourceEvidence) {
  return getBridgeRelationSemantics().getConfidenceCap(relationType, hasSourceEvidence);
}

/**
 * Get valid relations between types (lazy-loaded)
 */
function getValidBridgeRelations(subjectType, objectType) {
  return getBridgeRelationSemantics().getValidRelations(subjectType, objectType);
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  // Legacy compatibility exports
  ENTITY_TYPES,
  RELATION_TYPES,
  ENTITY_SCHEMAS,

  // Validation functions
  validateEntityType,
  validateRelationType,
  validateEntityAttributes,
  getAllowedRelations,

  // Schema access
  getEntitySchema,
  getAllEntityTypes,
  getAllRelationTypes,

  // Layer management
  getEntityLayer,
  getEntitiesByLayer,
  getEntitiesByCategory,
  getRelationsByCategory,

  // Extension management
  registerDomainExtension,
  registerCustomExtension,

  // Type resolution
  resolveTypeName,
  resolveEntityType,
  getExtractionTypeContract,
  getParentType,
  getTypeHierarchy,

  // Statistics
  getOntologyStats,

  // Layer modules (for direct access)
  foundation,
  source,
  capability,
  world,
  domain,

  // Extension API
  OntologyExtension,
  ExtensionRegistry,
  getRegistry,

  // Bridge Relation Semantics (lazy-loaded wrappers to avoid circular dependency)
  getBridgeRelations,
  validateBridgeRelation,
  getBridgeConfidenceCap,
  getValidBridgeRelations
};
