/**
 * Dynamic Ontology Activation
 * Provides context-appropriate ontology subsets for LLM
 *
 * Key insight: LLM shouldn't see all 213 entity types at once.
 * Based on source admission result, we activate only relevant ontology layers
 * and provide focused extraction prompts.
 *
 * Example:
 * - Flood forecasting paper → activate: data, modeling, earth-variable, hazard
 * - Policy document → activate: governance, risk, action
 * - GitHub repo → activate: computing, modeling
 */

const ontology = require('../registry/ontology');

class DynamicOntologyActivation {
  constructor() {
    this.layerModules = {
      foundation: require('../registry/ontology/foundation'),
      source: require('../registry/ontology/source'),
      capability: require('../registry/ontology/capability'),
      world: require('../registry/ontology/world'),
      domain: require('../registry/ontology/domain')
    };
  }

  /**
   * Get activated ontology for LLM extraction
   * @param {Object} admissionResult - Result from SourceAdmission
   * @returns {Object} Activated ontology with relevant entity types and relations
   */
  getActivatedOntology(admissionResult) {
    const layers = admissionResult.activatedOntologyLayers || ['source'];
    const categories = admissionResult.activatedCategories || [];
    const primaryRole = admissionResult.primaryRole;

    const activated = {
      layers,
      categories,
      primaryRole,

      entityTypes: [],
      relationTypes: [],
      extractionHints: [],

      // Structured prompts for LLM
      entitySchema: {},
      relationSchema: {}
    };

    // Always include foundation and source layers
    activated.entityTypes.push(...this._getLayerEntities('foundation'));
    activated.entityTypes.push(...this._getLayerEntities('source'));

    // Add capability entities based on categories
    if (layers.includes('capability')) {
      const capEntities = this._getCapabilityEntities(categories);
      activated.entityTypes.push(...capEntities);
    }

    // Add world entities based on categories
    if (layers.includes('world')) {
      const worldEntities = this._getWorldEntities(categories);
      activated.entityTypes.push(...worldEntities);
    }

    // Add domain entities if present
    if (layers.includes('domain')) {
      const domainEntities = this._getDomainEntities(categories);
      activated.entityTypes.push(...domainEntities);
    }

    // Get relevant relations
    activated.relationTypes = this._getRelevantRelations(layers, categories);

    // Build schemas for LLM
    activated.entitySchema = this._buildEntitySchema(activated.entityTypes);
    activated.relationSchema = this._buildRelationSchema(activated.relationTypes);

    // Generate extraction hints
    activated.extractionHints = this._generateExtractionHints(primaryRole, categories);

    return activated;
  }

  /**
   * Get entity types for a specific layer
   */
  _getLayerEntities(layerName) {
    const module = this.layerModules[layerName];
    if (!module) return [];

    return Object.keys(module.ENTITY_TYPES || {});
  }

  /**
   * Get capability entities for specific categories
   */
  _getCapabilityEntities(categories) {
    const module = this.layerModules.capability;
    if (!module) return [];

    const entities = [];
    const categoryMap = {
      'data': ['Dataset', 'Variable', 'Coverage', 'Resolution', 'DataQuality', 'DataProduct'],
      'observation': ['Sensor', 'Satellite', 'Gauge', 'Station', 'RemoteSensingSystem', 'InSituNetwork'],
      'modeling': ['Model', 'Algorithm', 'Simulation', 'Forecasting', 'Calibration', 'Validation', 'UncertaintyQuantification'],
      'computing': ['Software', 'API', 'Workflow', 'Pipeline', 'Interface', 'CloudService'],
      'governance': ['Policy', 'Regulation', 'Institution', 'Stakeholder', 'Standard', 'Protocol', 'Agreement'],
      'socioeconomic': ['PopulationDataset', 'EconomicIndicator', 'LandUseClassification', 'InfrastructureInventory', 'ExposureDataset', 'VulnerabilityIndex'],
      'evidence': ['Assessment', 'Indicator', 'Index', 'EvidenceChain', 'EvaluationFramework', 'RiskAssessment', 'ImpactAssessment'],
      'action': ['Intervention', 'AdaptationMeasure', 'MitigationMeasure', 'ManagementAction', 'EmergencyResponse', 'ResourceAllocation']
    };

    for (const cat of categories) {
      if (categoryMap[cat]) {
        entities.push(...categoryMap[cat]);
      }
    }

    return [...new Set(entities)];
  }

  /**
   * Get world entities for specific categories
   */
  _getWorldEntities(categories) {
    const entities = [];
    const categoryMap = {
      'earth-object': ['Region', 'Basin', 'Watershed', 'Glacier', 'Lake', 'Aquifer', 'Coastline', 'MountainRange'],
      'earth-variable': ['EarthVariable', 'Streamflow', 'Precipitation', 'Temperature', 'SoilMoisture', 'GroundwaterLevel', 'Evapotranspiration'],
      'earth-process': ['EarthProcess', 'WaterCycle', 'CarbonCycle', 'Erosion', 'Sedimentation'],
      'hazard': ['Hazard', 'FloodEvent', 'DroughtEvent', 'Heatwave', 'Wildfire', 'Landslide'],
      'risk': ['EarthRisk', 'FloodRisk', 'DroughtRisk', 'Exposure', 'Vulnerability'],
      'infrastructure': ['Infrastructure', 'Dam', 'Reservoir', 'PowerGrid', 'WaterSupplySystem'],
      'model-output': ['ModelOutput', 'Forecast', 'Projection'],
      'scenario': ['EarthScenario', 'ClimateScenario', 'DevelopmentScenario']
    };

    for (const cat of categories) {
      if (categoryMap[cat]) {
        entities.push(...categoryMap[cat]);
      }
    }

    return [...new Set(entities)];
  }

  /**
   * Get domain entities
   */
  _getDomainEntities(categories) {
    // Map categories to domains
    const domainMap = {
      'hydrology': ['River', 'StreamReach', 'GaugeStation', 'HydrologicalModel', 'RainfallRunoffModel', 'FlashFlood', 'RiverineFlood'],
      'climate': ['ClimateZone', 'ClimateIndex', 'ENSO', 'ClimateModel', 'GCM', 'RCM', 'ClimateProjection'],
      'urban': ['City', 'Building', 'DrainageNetwork', 'UrbanFlood', 'UrbanHeatIsland'],
      'energy': ['Substation', 'TransmissionLine', 'RenewableGeneration', 'EnergyStorage', 'HydropowerPlant'],
      'ecology': ['Ecosystem', 'Vegetation', 'Habitat', 'Species', 'BiodiversityIndex', 'CarbonSink']
    };

    const entities = [];
    for (const [domain, types] of Object.entries(domainMap)) {
      if (categories.includes(domain)) {
        entities.push(...types);
      }
    }

    return [...new Set(entities)];
  }

  /**
   * Get relevant relations for layers and categories
   */
  _getRelevantRelations(layers, categories) {
    const relations = [];

    // Foundation relations (always included)
    relations.push('is_a', 'has_part', 'part_of', 'causes', 'caused_by', 'uses', 'produces', 'supports', 'contradicts');

    // Source relations
    if (layers.includes('source')) {
      relations.push('cited_by', 'cites', 'references', 'has_dataset', 'depends_on', 'published_by');
    }

    // Capability relations
    if (layers.includes('capability')) {
      relations.push('uses', 'produces', 'implements', 'observes', 'observed_by', 'simulates', 'trained_on', 'validated_on');

      if (categories.includes('data')) {
        relations.push('has_variable', 'has_coverage', 'derived_from_data');
      }
      if (categories.includes('observation')) {
        relations.push('observes', 'measures', 'part_of_network');
      }
      if (categories.includes('modeling')) {
        relations.push('simulates', 'calibrated_with', 'validated_on', 'implements_method');
      }
      if (categories.includes('governance')) {
        relations.push('issued_by', 'applies_to', 'implements_policy');
      }
      if (categories.includes('action')) {
        relations.push('targets_entity', 'responds_to', 'reduces_risk');
      }
    }

    // World relations
    if (layers.includes('world')) {
      relations.push('located_at', 'occurs_at', 'affects', 'interacts_with');

      if (categories.includes('earth-object')) {
        relations.push('drains_to', 'upstream_of', 'downstream_of', 'flows_through');
      }
      if (categories.includes('hazard')) {
        relations.push('triggers_hazard', 'exacerbates', 'mitigates_hazard');
      }
      if (categories.includes('risk')) {
        relations.push('exposed_to', 'vulnerable_to', 'generates_risk');
      }
      if (categories.includes('model-output')) {
        relations.push('projects', 'under_scenario');
      }
    }

    return [...new Set(relations)];
  }

  /**
   * Build entity schema for LLM
   */
  _buildEntitySchema(entityTypes) {
    const schema = {};

    for (const type of entityTypes) {
      const typeSchema = ontology.getEntitySchema(type);
      if (typeSchema) {
        schema[type] = {
          layer: typeSchema.layer,
          category: typeSchema.category,
          required: typeSchema.required || [],
          properties: typeSchema.properties || {},
          description: typeSchema.description || ''
        };
      }
    }

    return schema;
  }

  /**
   * Build relation schema for LLM
   */
  _buildRelationSchema(relationTypes) {
    const schema = {};

    for (const relType of relationTypes) {
      const relSchema = ontology.RELATION_SCHEMAS?.[relType];
      if (relSchema) {
        schema[relType] = relSchema;
      } else {
        // Provide basic schema for common relations
        schema[relType] = {
          type: relType,
          description: `${relType} relation`
        };
      }
    }

    return schema;
  }

  /**
   * Generate extraction hints for LLM based on primary role
   */
  _generateExtractionHints(primaryRole, categories) {
    const hints = [];

    const roleHints = {
      'earth_content': [
        'Extract key Earth system concepts and claims',
        'Identify Earth variables, regions, and processes studied',
        'Link evidence to specific sections (figures, tables, results)'
      ],
      'data_capability': [
        'Focus on dataset metadata: variables, coverage, resolution',
        'Identify data sources and access information',
        'Note data quality and temporal coverage'
      ],
      'observation_capability': [
        'Extract observation systems: sensors, satellites, gauges',
        'Identify spatial coverage and resolution of observations',
        'Note data products derived from observations'
      ],
      'modeling_capability': [
        'Extract model architecture and parameters',
        'Identify training data and validation approach',
        'Note model performance metrics and limitations'
      ],
      'computing_capability': [
        'Extract software dependencies and APIs',
        'Identify workflows and pipelines',
        'Note computing requirements and platforms'
      ],
      'governance_capability': [
        'Extract policies and regulations',
        'Identify institutions and jurisdictions',
        'Note compliance requirements and standards'
      ],
      'socioeconomic_capability': [
        'Extract population and economic data',
        'Identify exposure and vulnerability indicators',
        'Note demographic and infrastructure information'
      ],
      'evidence_assessment': [
        'Extract key assessments and findings',
        'Identify indicators and confidence levels',
        'Link evidence to specific claims'
      ],
      'action_capability': [
        'Extract interventions and measures',
        'Identify targets and outcomes',
        'Note implementation details and timeline'
      ],
      'event_signal': [
        'Extract event details: location, date, magnitude',
        'Identify affected regions and populations',
        'Note early warning signals and responses'
      ]
    };

    if (primaryRole && roleHints[primaryRole]) {
      hints.push(...roleHints[primaryRole]);
    }

    // Add category-specific hints
    for (const cat of categories) {
      const catHint = this._getCategoryHint(cat);
      if (catHint) {
        hints.push(catHint);
      }
    }

    return hints;
  }

  /**
   * Get extraction hint for a category
   */
  _getCategoryHint(category) {
    const hints = {
      'data': 'Extract all datasets with their variables, spatial/temporal coverage, and access information',
      'observation': 'Identify observation systems and their spatial coverage',
      'modeling': 'Extract models, algorithms, and their configurations',
      'computing': 'List software, workflows, and computing resources used',
      'governance': 'Extract policies, regulations, and institutional arrangements',
      'socioeconomic': 'Identify population, economic, and exposure data',
      'evidence': 'Extract assessments, indicators, and evidence chains',
      'action': 'Extract interventions, measures, and their targets',
      'earth-object': 'Identify geographic regions, basins, and Earth features',
      'earth-variable': 'Extract Earth variables studied (streamflow, precipitation, etc.)',
      'hazard': 'Identify hazard events and their characteristics',
      'risk': 'Extract risk assessments, exposure, and vulnerability',
      'model-output': 'Identify forecasts and projections'
    };

    return hints[category] || null;
  }

  /**
   * Generate LLM extraction prompt
   * @param {Object} admissionResult - SourceAdmission result
   * @param {Object} content - Source content
   * @returns {string} Prompt for LLM
   */
  generateExtractionPrompt(admissionResult, content) {
    const activated = this.getActivatedOntology(admissionResult);

    const promptParts = [
      `You are extracting structured information for a Digital Earth knowledge graph.`,
      ``,
      `Source Type: ${admissionResult.sourceType}`,
      `Primary Role: ${admissionResult.primaryRole}`,
      `Activated Layers: ${activated.layers.join(', ')}`,
      `Activated Categories: ${activated.categories.join(', ')}`,
      ``,
      `## Entity Types to Extract`,
      `Focus on these entity types:`,
      activated.entityTypes.slice(0, 20).map(t => `- ${t}`).join('\n'),
      ``,
      `## Extraction Hints`,
      ...activated.extractionHints,
      ``,
      `## Output Format`,
      `Return a JSON object with:`,
      `- sourceObject: { type, attributes }`,
      `- capabilityObjects: [{ type, id, attributes, provenance }]`,
      `- worldObjects: [{ type, id, attributes, provenance }]`,
      `- evidenceObjects: [{ type, statement, confidence, provenance }]`,
      `- bridgeRelations: [{ type, from, to, confidence }]`,
      ``,
      `Each object must include provenance with section reference.`
    ];

    return promptParts.join('\n');
  }

  /**
   * Get statistics about activated ontology
   */
  getStats(admissionResult) {
    const activated = this.getActivatedOntology(admissionResult);

    return {
      totalEntityTypes: activated.entityTypes.length,
      totalRelationTypes: activated.relationTypes.length,
      layers: activated.layers,
      categories: activated.categories,
      extractionHintsCount: activated.extractionHints.length
    };
  }
}

module.exports = DynamicOntologyActivation;
