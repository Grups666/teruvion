/**
 * Base Lens Class
 * Abstract base for all lens implementations
 *
 * Lenses transform the research graph into view-specific formats
 */

class Lens {
  constructor(store, ontology, projectRegistry = null) {
    this.store = store;
    this.ontology = ontology && typeof ontology.getEntityLayer === 'function'
      ? ontology
      : require('../registry/ontology');
    this.projectRegistry = projectRegistry;
  }

  /**
   * Get lens name (override in subclass)
   */
  getName() {
    throw new Error('Lens.getName() must be implemented by subclass');
  }

  /**
   * Get lens description (override in subclass)
   */
  getDescription() {
    throw new Error('Lens.getDescription() must be implemented by subclass');
  }

  /**
   * Get entity types relevant to this lens
   */
  getRelevantEntityTypes() {
    return [];
  }

  /**
   * Get relation types relevant to this lens
   */
  getRelevantRelationTypes() {
    return [];
  }

  /**
   * Render the lens view (override in subclass)
   * @param {string} projectId - Project ID to render
   * @param {Object} options - Rendering options
   * @returns {Object} Rendered output
   */
  async render(projectId, options = {}) {
    throw new Error('Lens.render() must be implemented by subclass');
  }

  /**
   * Get entities from project or entire store
   */
  getEntities(projectId) {
    if (this.projectRegistry && projectId) {
      const project = this.projectRegistry.getProject(projectId);
      if (!project) return [];

      return project.entities
        .map(id => this.store.getEntity(id))
        .filter(Boolean);
    }

    // Return all entities if no project
    return Array.from(this.store.entities.values());
  }

  /**
   * Get entities of specific type
   */
  getEntitiesOfType(projectId, type) {
    return this.getEntities(projectId).filter(e => e.type === type);
  }

  /**
   * Get relations for entities
   */
  getEntityRelations(entityId) {
    return this.store.getRelations(entityId);
  }

  /**
   * Build a graph structure from entities and relations
   */
  buildGraph(projectId, options = {}) {
    const entities = this.getEntities(projectId);
    const nodes = [];
    const edges = [];

    for (const entity of entities) {
      nodes.push({
        id: entity.id,
        type: entity.type,
        label: entity.getDisplayName(),
        category: this._categorizeType(entity.type),
        attributes: entity.attributes,
        verificationState: entity.verificationState
      });

      const relations = this.store.getRelations(entity.id);
      for (const rel of relations.outgoing) {
        // Only include if target is in the same project
        if (entities.some(e => e.id === rel.object)) {
          edges.push({
            source: entity.id,
            target: rel.object,
            relation: rel.predicate
          });
        }
      }
    }

    return { nodes, edges };
  }

  /**
   * Categorize entity type for visualization
   * Updated to support Five-Layer Ontology
   */
  _categorizeType(type) {
    return this.ontology.ENTITY_SCHEMAS?.[type]?.category || 'other';
  }

  /**
   * Get layer for entity type
   */
  _getLayer(type) {
    return this.ontology.getEntityLayer(type);
  }

  /**
   * Generate metadata for rendered output
   */
  generateMetadata(projectId, additionalInfo = {}) {
    const entities = this.getEntities(projectId);
    const stats = {
      totalEntities: entities.length,
      byType: {},
      byCategory: {}
    };

    for (const entity of entities) {
      stats.byType[entity.type] = (stats.byType[entity.type] || 0) + 1;
      const cat = this._categorizeType(entity.type);
      stats.byCategory[cat] = (stats.byCategory[cat] || 0) + 1;
    }

    return {
      lensName: this.getName(),
      projectId,
      renderedAt: new Date().toISOString(),
      stats,
      ...additionalInfo
    };
  }
}

module.exports = Lens;
