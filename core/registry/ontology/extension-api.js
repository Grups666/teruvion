/**
 * Ontology Extension API
 * Provides API for dynamically adding new entity types and relations
 */

/**
 * OntologyExtension class
 * Represents a custom extension to the ontology
 */
class OntologyExtension {
  constructor(namespace, definition) {
    if (!namespace || typeof namespace !== 'string') {
      throw new Error('Extension must have a valid namespace');
    }

    this.namespace = namespace;
    this.name = definition.name || namespace;
    this.description = definition.description || '';
    this.entities = definition.entities || {};
    this.relations = definition.relations || {};
    this.metadata = definition.metadata || {};

    // Validate
    this._validate();
  }

  _validate() {
    // Validate entities
    for (const [entityName, entityDef] of Object.entries(this.entities)) {
      if (!entityDef.name) {
        throw new Error(`Entity ${entityName} must have a name`);
      }
      if (!entityDef.extends) {
        throw new Error(`Entity ${entityName} must specify a parent type via 'extends'`);
      }
    }

    // Validate relations
    for (const [relName, relDef] of Object.entries(this.relations)) {
      if (!relDef.name) {
        throw new Error(`Relation ${relName} must have a name`);
      }
    }
  }

  /**
   * Get all entity type names in this extension
   */
  getEntityNames() {
    return Object.keys(this.entities);
  }

  /**
   * Get all relation type names in this extension
   */
  getRelationNames() {
    return Object.keys(this.relations);
  }

  /**
   * Get entity definition
   */
  getEntity(entityName) {
    return this.entities[entityName] || null;
  }

  /**
   * Get relation definition
   */
  getRelation(relationName) {
    return this.relations[relationName] || null;
  }

  /**
   * Convert to JSON for serialization
   */
  toJSON() {
    return {
      namespace: this.namespace,
      name: this.name,
      description: this.description,
      entities: this.entities,
      relations: this.relations,
      metadata: this.metadata
    };
  }

  /**
   * Create from JSON
   */
  static fromJSON(json) {
    return new OntologyExtension(json.namespace, {
      name: json.name,
      description: json.description,
      entities: json.entities,
      relations: json.relations,
      metadata: json.metadata
    });
  }
}

/**
 * ExtensionRegistry class
 * Manages registered extensions
 */
class ExtensionRegistry {
  constructor() {
    this.extensions = new Map();
  }

  /**
   * Register an extension
   */
  register(extension) {
    if (!(extension instanceof OntologyExtension)) {
      throw new Error('Must provide an OntologyExtension instance');
    }

    if (this.extensions.has(extension.namespace)) {
      console.warn(`Extension ${extension.namespace} already registered, overwriting`);
    }

    this.extensions.set(extension.namespace, extension);
    return true;
  }

  /**
   * Unregister an extension
   */
  unregister(namespace) {
    return this.extensions.delete(namespace);
  }

  /**
   * Get an extension by namespace
   */
  get(namespace) {
    return this.extensions.get(namespace);
  }

  /**
   * Check if an extension is registered
   */
  has(namespace) {
    return this.extensions.has(namespace);
  }

  /**
   * Get all registered extensions
   */
  getAll() {
    return Array.from(this.extensions.values());
  }

  /**
   * Get all entity types from all extensions
   */
  getAllEntities() {
    const entities = {};
    for (const extension of this.extensions.values()) {
      for (const [name, def] of Object.entries(extension.entities)) {
        entities[name] = { ...def, source: extension.namespace };
      }
    }
    return entities;
  }

  /**
   * Get all relation types from all extensions
   */
  getAllRelations() {
    const relations = {};
    for (const extension of this.extensions.values()) {
      for (const [name, def] of Object.entries(extension.relations)) {
        relations[name] = { ...def, source: extension.namespace };
      }
    }
    return relations;
  }

  /**
   * Find which extension provides a given entity type
   */
  findEntityProvider(entityName) {
    for (const extension of this.extensions.values()) {
      if (extension.entities[entityName]) {
        return extension.namespace;
      }
    }
    return null;
  }

  /**
   * Find which extension provides a given relation type
   */
  findRelationProvider(relationName) {
    for (const extension of this.extensions.values()) {
      if (extension.relations[relationName]) {
        return extension.namespace;
      }
    }
    return null;
  }
}

// Global extension registry
const globalRegistry = new ExtensionRegistry();

/**
 * Create and register an extension from a definition
 */
function createExtension(namespace, definition) {
  const extension = new OntologyExtension(namespace, definition);
  globalRegistry.register(extension);
  return extension;
}

/**
 * Load an extension from JSON
 */
function loadExtension(json) {
  const extension = OntologyExtension.fromJSON(json);
  globalRegistry.register(extension);
  return extension;
}

/**
 * Get the global registry
 */
function getRegistry() {
  return globalRegistry;
}

module.exports = {
  OntologyExtension,
  ExtensionRegistry,
  createExtension,
  loadExtension,
  getRegistry
};