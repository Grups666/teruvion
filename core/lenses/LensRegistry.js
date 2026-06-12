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

const WORKFLOW_CATEGORIES = new Set(['data', 'modeling', 'computing', 'process', 'method']);
const EVIDENCE_RELATIONS = new Set(['supports', 'supports_claim', 'contradicts']);
const WORKFLOW_RELATIONS = new Set(['uses', 'applies', 'produces', 'implements', 'depends_on', 'trained_on']);

class LensRegistry {
  constructor(store, ontology, projectRegistry = null) {
    this.store = store;
    this.ontology = ontology && typeof ontology.getEntityLayer === 'function'
      ? ontology
      : require('../registry/ontology');
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
   * Get recommended lens based on object structure and ontology metadata.
   */
  getRecommendedLens(projectId) {
    const entities = this._getProjectEntities(projectId);
    if (entities.length === 0) return 'workflow';

    const scores = {
      map: 0,
      evidence: 0,
      workflow: 0,
      comparison: entities.length > 1 ? 1 : 0,
      timeline: 0
    };

    for (const entity of entities) {
      const layer = this._getLayer(entity.type);
      const category = this._getCategory(entity.type);
      const attributes = entity.attributes || {};

      if (this._hasSpatialSignal(attributes)) scores.map += 3;
      if (layer === 'world') scores.map += 1;

      if (category === 'evidence' || category === 'knowledge') scores.evidence += 3;
      if (this._hasEvidenceSignal(attributes)) scores.evidence += 1;

      if (WORKFLOW_CATEGORIES.has(category)) {
        scores.workflow += 2;
      }
      if (this._hasWorkflowSignal(attributes)) scores.workflow += 1;

      if (this._hasTemporalSignal(attributes)) scores.timeline += 2;
    }

    for (const entity of entities) {
      const relations = this._getStoreRelations(entity.id);
      const relationCount = (relations.outgoing?.length || 0) + (relations.incoming?.length || 0);
      if (relationCount > 0) scores.comparison += 1;
      if ((relations.outgoing || []).some(r => EVIDENCE_RELATIONS.has(r.predicate))) {
        scores.evidence += 2;
      }
      if ((relations.outgoing || []).some(r => WORKFLOW_RELATIONS.has(r.predicate))) {
        scores.workflow += 2;
      }
    }

    const priority = ['map', 'workflow', 'evidence', 'comparison', 'timeline'];
    return priority
      .map(name => ({ name, score: scores[name] }))
      .sort((a, b) => b.score - a.score || priority.indexOf(a.name) - priority.indexOf(b.name))[0].name;
  }

  _getProjectEntities(projectId) {
    if (!this.projectRegistry || !projectId) {
      return Array.from(this.store.entities?.values?.() || []);
    }
    const project = this.projectRegistry.getProject(projectId);
    if (!project) return [];
    return project.entities
      .map(id => this.store.getEntity(id))
      .filter(Boolean);
  }

  _getLayer(type) {
    return this.ontology?.getEntityLayer?.(type) || 'unknown';
  }

  _getCategory(type) {
    return this.ontology?.ENTITY_SCHEMAS?.[type]?.category || 'general';
  }

  _hasSpatialSignal(attributes) {
    return Boolean(
      attributes.geometry ||
      attributes.bbox ||
      attributes.centroid ||
      attributes.location ||
      attributes.spatialCoverage
    );
  }

  _hasTemporalSignal(attributes) {
    return Boolean(
      attributes.year ||
      attributes.date ||
      attributes.time ||
      attributes.start ||
      attributes.end ||
      attributes.temporalCoverage
    );
  }

  _hasEvidenceSignal(attributes) {
    return Boolean(
      attributes.statement ||
      attributes.claim ||
      attributes.evidence ||
      attributes.confidence
    );
  }

  _hasWorkflowSignal(attributes) {
    return Boolean(
      attributes.inputs ||
      attributes.outputs ||
      attributes.steps ||
      attributes.parameters ||
      attributes.dependencies
    );
  }

  _getStoreRelations(entityId) {
    if (typeof this.store.getRelations === 'function') {
      return this.store.getRelations(entityId);
    }
    return { outgoing: [], incoming: [] };
  }
}

module.exports = LensRegistry;
