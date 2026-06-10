/**
 * Base Lens Class
 * Abstract base for all lens implementations
 *
 * Lenses transform the research graph into view-specific formats
 */

class Lens {
  constructor(store, ontology, projectRegistry = null) {
    this.store = store;
    this.ontology = ontology;
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
    // Layer-based categorization
    const layerCategories = {
      // Layer 0: Foundation
      foundation: ['Entity', 'Claim', 'Evidence', 'Data', 'Process', 'Event', 'Action', 'Agent', 'Uncertainty', 'Result', 'Metric'],

      // Layer 1: Source
      source: ['Source', 'Paper', 'Preprint', 'Repository', 'DatasetPage', 'Report', 'AssessmentReport', 'News', 'PolicyDocument', 'StandardDocument'],

      // Layer 2: Capability - Data
      data: ['Dataset', 'Variable', 'Coverage', 'Resolution', 'DataQuality', 'DataProduct'],

      // Layer 2: Capability - Observation
      observation: ['Sensor', 'Satellite', 'Gauge', 'Station', 'RemoteSensingSystem', 'InSituNetwork'],

      // Layer 2: Capability - Modeling
      modeling: ['Model', 'Algorithm', 'Simulation', 'Forecasting', 'Calibration', 'Validation', 'Method'],

      // Layer 2: Capability - Computing
      computing: ['Software', 'API', 'Workflow', 'Pipeline', 'CloudService', 'Interface'],

      // Layer 2: Capability - Governance
      governance: ['Policy', 'Regulation', 'Institution', 'Stakeholder', 'Standard', 'Agreement'],

      // Layer 2: Capability - Socioeconomic
      socioeconomic: ['PopulationDataset', 'EconomicIndicator', 'ExposureDataset', 'VulnerabilityIndex'],

      // Layer 2: Capability - Evidence
      evidence: ['Assessment', 'Indicator', 'EvidenceChain', 'RiskAssessment', 'ImpactAssessment'],

      // Layer 2: Capability - Action
      action: ['Intervention', 'AdaptationMeasure', 'MitigationMeasure', 'EmergencyResponse'],

      // Layer 3: World - Earth Objects
      'earth-object': ['Region', 'Basin', 'Watershed', 'Glacier', 'Lake', 'Aquifer', 'Coastline', 'River'],

      // Layer 3: World - Earth Variables
      'earth-variable': ['EarthVariable', 'Streamflow', 'Precipitation', 'Temperature', 'SoilMoisture', 'GroundwaterLevel'],

      // Layer 3: World - Hazards
      hazard: ['Hazard', 'FloodEvent', 'DroughtEvent', 'Heatwave', 'Wildfire', 'Landslide'],

      // Layer 3: World - Risks
      risk: ['EarthRisk', 'FloodRisk', 'DroughtRisk', 'Exposure', 'Vulnerability'],

      // Layer 3: World - Infrastructure
      infrastructure: ['Infrastructure', 'Dam', 'Reservoir', 'PowerGrid', 'WaterSupplySystem'],

      // Layer 3: World - Model Outputs
      'model-output': ['ModelOutput', 'Forecast', 'Projection'],

      // Layer 3: World - Scenarios
      scenario: ['EarthScenario', 'ClimateScenario', 'DevelopmentScenario'],

      // Legacy compatibility
      knowledge: ['Claim', 'Hypothesis'],
      resource: ['Paper', 'Dataset', 'Model', 'Code', 'Figure'],
      context: ['Location', 'TimeRange', 'Time'],
      process: ['Workflow', 'Process', 'Event']
    };

    for (const [cat, types] of Object.entries(layerCategories)) {
      if (types.includes(type)) return cat;
    }

    return 'other';
  }

  /**
   * Get layer for entity type
   */
  _getLayer(type) {
    const layerMap = {
      foundation: ['Entity', 'Claim', 'Evidence', 'Data', 'Process', 'Event', 'Action', 'Agent', 'Uncertainty', 'Result', 'Metric'],
      source: ['Source', 'Paper', 'Preprint', 'Repository', 'DatasetPage', 'Report', 'News', 'PolicyDocument'],
      capability: ['Dataset', 'Variable', 'Model', 'Sensor', 'Satellite', 'Gauge', 'Algorithm', 'Software', 'Workflow', 'Policy', 'Intervention', 'Assessment'],
      world: ['Region', 'Basin', 'Watershed', 'Glacier', 'Lake', 'EarthVariable', 'Streamflow', 'Precipitation', 'Hazard', 'FloodEvent', 'EarthRisk', 'Forecast', 'Projection'],
      domain: []
    };

    for (const [layer, types] of Object.entries(layerMap)) {
      if (types.includes(type)) return layer;
    }

    return 'unknown';
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