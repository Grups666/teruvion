/**
 * Lens Registry
 * Manages available lenses and provides rendering interface
 */

const Lens = require('./Lens');
const MapLens = require('./MapLens');
const EvidenceLens = require('./EvidenceLens');
const WorkflowLens = require('./WorkflowLens');
const TimelineLens = require('./TimelineLens');
const ComparisonLens = require('./ComparisonLens');

class LensRegistry {
  constructor(store, ontology, projectRegistry = null) {
    this.store = store;
    this.ontology = ontology;
    this.projectRegistry = projectRegistry;
    this.lenses = new Map();

    this._registerDefaultLenses();
  }

  _registerDefaultLenses() {
    this.register(new MapLens(this.store, this.ontology, this.projectRegistry));
    this.register(new EvidenceLens(this.store, this.ontology, this.projectRegistry));
    this.register(new WorkflowLens(this.store, this.ontology, this.projectRegistry));
    this.register(new TimelineLens(this.store, this.ontology, this.projectRegistry));
    this.register(new ComparisonLens(this.store, this.ontology, this.projectRegistry));
  }

  /**
   * Register a lens
   */
  register(lens) {
    if (!(lens instanceof Lens)) {
      throw new Error('Must provide a Lens instance');
    }
    this.lenses.set(lens.getName(), lens);
    return this;
  }

  /**
   * Unregister a lens
   */
  unregister(lensName) {
    return this.lenses.delete(lensName);
  }

  /**
   * Get a lens by name
   */
  get(lensName) {
    return this.lenses.get(lensName);
  }

  /**
   * Check if a lens exists
   */
  has(lensName) {
    return this.lenses.has(lensName);
  }

  /**
   * Get all available lenses
   */
  getAvailableLenses() {
    return Array.from(this.lenses.values()).map(lens => ({
      name: lens.getName(),
      description: lens.getDescription(),
      entityTypes: lens.getRelevantEntityTypes(),
      relationTypes: lens.getRelevantRelationTypes()
    }));
  }

  /**
   * Render a specific lens view
   */
  async render(projectId, lensName, options = {}) {
    const lens = this.get(lensName);
    if (!lens) {
      throw new Error(`Unknown lens: ${lensName}. Available: ${Array.from(this.lenses.keys()).join(', ')}`);
    }
    return await lens.render(projectId, options);
  }

  /**
   * Render all lenses for a project
   */
  async renderAll(projectId, options = {}) {
    const results = {};

    for (const [name, lens] of this.lenses) {
      try {
        results[name] = await lens.render(projectId, options[name] || {});
      } catch (err) {
        results[name] = {
          error: err.message,
          lensName: name
        };
      }
    }

    return results;
  }

  /**
   * Get recommended lens based on entity types present
   */
  getRecommendedLens(projectId) {
    const entities = this.projectRegistry
      ? this.projectRegistry.getProject(projectId)?.entities || []
      : [];

    const entityCounts = {};
    for (const id of entities) {
      const entity = this.store.getEntity(id);
      if (entity) {
        entityCounts[entity.type] = (entityCounts[entity.type] || 0) + 1;
      }
    }

    // Recommend based on entity presence
    if (entityCounts['Region'] || entityCounts['Basin'] || entityCounts['Gauge']) {
      return 'map';
    }
    if (entityCounts['Claim'] || entityCounts['Hypothesis']) {
      return 'evidence';
    }
    if (entityCounts['Method'] || entityCounts['Workflow']) {
      return 'workflow';
    }
    if (entityCounts['Paper'] > 1) {
      return 'comparison';
    }

    return 'workflow'; // Default
  }
}

module.exports = LensRegistry;