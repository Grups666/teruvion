/**
 * Entity Mapper
 * Maps decomposition output to ontology entities
 *
 * Supports the Five-Layer Ontology:
 * - Layer 0: Foundation (universal concepts)
 * - Layer 1: Source (information sources)
 * - Layer 2: Capability (Digital Earth capabilities)
 * - Layer 3: World (Earth objects and processes)
 * - Layer 4: Domain (specialized extensions)
 */

const ontology = require('../registry/ontology');

class EntityMapper {
  constructor(store) {
    this.store = store;
    this.mappingRules = this._buildMappingRules();
  }

  /**
   * Build mapping rules for understanding types → entity types
   */
  _buildMappingRules() {
    return {
      // === Source Layer (Layer 1) ===
      source: {
        layer: 'source',
        entityType: 'Source',
        attributeMap: {
          identifier: 'identifier',
          type: 'type',
          title: 'title'
        },
        metadataMap: {
          url: 'sourceUrl'
        },
        sourceSection: 'header'
      },

      paper: {
        layer: 'source',
        entityType: 'Paper',
        attributeMap: {
          title: 'title',
          doi: 'doi',
          abstract: 'abstract',
          year: 'year',
          venue: 'venue',
          citationCount: 'citationCount',
          authors: 'authors'
        },
        metadataMap: {
          url: 'source',
          keywords: 'keywords'
        },
        sourceSection: 'metadata'
      },

      repository: {
        layer: 'source',
        entityType: 'Repository',
        attributeMap: {
          name: 'name',
          repo: 'repo',
          language: 'language',
          stars: 'stars',
          license: 'license',
          description: 'description'
        },
        metadataMap: {
          url: 'source',
          readme: 'readme',
          dependencies: 'dependencies'
        },
        sourceSection: 'metadata'
      },

      datasetPage: {
        layer: 'source',
        entityType: 'DatasetPage',
        attributeMap: {
          name: 'name',
          title: 'title',
          url: 'url',
          variables: 'variables',
          spatialCoverage: 'spatialCoverage',
          temporalCoverage: 'temporalCoverage'
        },
        metadataMap: {
          accessUrl: 'accessUrl',
          format: 'format'
        },
        sourceSection: 'metadata'
      },

      report: {
        layer: 'source',
        entityType: 'Report',
        attributeMap: {
          title: 'title',
          institution: 'institution',
          year: 'year',
          type: 'reportType'
        },
        metadataMap: {
          url: 'source'
        },
        sourceSection: 'metadata'
      },

      // === Capability Layer (Layer 2) ===
      // Data Category
      dataset: {
        layer: 'capability',
        category: 'data',
        entityType: 'Dataset',
        attributeMap: {
          name: 'name',
          acronym: 'acronym',
          variables: { to: 'variables', transform: vars => vars?.map(v => v.name || v) },
          'spatial.coverage': 'spatialCoverage',
          'spatial.resolution': 'spatialResolution',
          'temporal.coverage': 'temporalCoverage',
          'temporal.resolution': 'temporalResolution',
          size: 'size',
          role: 'role'
        },
        metadataMap: {
          'access.url': 'accessUrl',
          'access.license': 'license',
          confidence: 'confidence'
        },
        sourceSection: 'datasets'
      },

      variable: {
        layer: 'capability',
        category: 'data',
        entityType: 'Variable',
        attributeMap: {
          name: 'name',
          unit: 'unit',
          description: 'description',
          range: 'range'
        },
        metadataMap: {
          confidence: 'confidence'
        },
        sourceSection: 'variables'
      },

      coverage: {
        layer: 'capability',
        category: 'data',
        entityType: 'Coverage',
        attributeMap: {
          spatial: 'spatial',
          temporal: 'temporal',
          resolution: 'resolution'
        },
        sourceSection: 'data'
      },

      // Observation Category
      sensor: {
        layer: 'capability',
        category: 'observation',
        entityType: 'Sensor',
        attributeMap: {
          name: 'name',
          type: 'type',
          platform: 'platform',
          resolution: 'resolution'
        },
        sourceSection: 'methods'
      },

      satellite: {
        layer: 'capability',
        category: 'observation',
        entityType: 'Satellite',
        attributeMap: {
          name: 'name',
          sensors: 'sensors',
          resolution: 'resolution',
          revisitTime: 'revisitTime'
        },
        sourceSection: 'methods'
      },

      gauge: {
        layer: 'capability',
        category: 'observation',
        entityType: 'Gauge',
        attributeMap: {
          name: 'name',
          stationId: 'stationId',
          river: 'river',
          location: 'location'
        },
        sourceSection: 'methods'
      },

      station: {
        layer: 'capability',
        category: 'observation',
        entityType: 'Station',
        attributeMap: {
          name: 'name',
          id: 'stationId',
          type: 'stationType',
          location: 'location'
        },
        sourceSection: 'methods'
      },

      // Modeling Category
      model: {
        layer: 'capability',
        category: 'modeling',
        entityType: 'Model',
        attributeMap: {
          name: 'name',
          type: 'type',
          architecture: 'architecture',
          framework: 'framework',
          hyperparameters: 'hyperparameters'
        },
        metadataMap: {
          innovation: 'innovation',
          description: 'description'
        },
        sourceSection: 'methods'
      },

      algorithm: {
        layer: 'capability',
        category: 'modeling',
        entityType: 'Algorithm',
        attributeMap: {
          name: 'name',
          category: 'category',
          purpose: 'purpose'
        },
        sourceSection: 'methods'
      },

      simulation: {
        layer: 'capability',
        category: 'modeling',
        entityType: 'Simulation',
        attributeMap: {
          name: 'name',
          model: 'model',
          parameters: 'parameters',
          duration: 'duration'
        },
        sourceSection: 'methods'
      },

      calibration: {
        layer: 'capability',
        category: 'modeling',
        entityType: 'Calibration',
        attributeMap: {
          method: 'method',
          parameters: 'calibratedParams',
          performance: 'performance'
        },
        sourceSection: 'methods'
      },

      validation: {
        layer: 'capability',
        category: 'modeling',
        entityType: 'Validation',
        attributeMap: {
          method: 'method',
          metrics: 'metrics',
          dataset: 'validationDataset'
        },
        sourceSection: 'methods'
      },

      // Computing Category
      software: {
        layer: 'capability',
        category: 'computing',
        entityType: 'Software',
        attributeMap: {
          name: 'name',
          version: 'version',
          language: 'language'
        },
        sourceSection: 'dependencies'
      },

      api: {
        layer: 'capability',
        category: 'computing',
        entityType: 'API',
        attributeMap: {
          name: 'name',
          endpoint: 'endpoint',
          description: 'description'
        },
        sourceSection: 'metadata'
      },

      workflow: {
        layer: 'capability',
        category: 'computing',
        entityType: 'Workflow',
        attributeMap: {
          name: 'name',
          steps: 'steps',
          purpose: 'purpose'
        },
        metadataMap: {
          dependencies: 'dependencies'
        },
        sourceSection: 'methods'
      },

      pipeline: {
        layer: 'capability',
        category: 'computing',
        entityType: 'Pipeline',
        attributeMap: {
          name: 'name',
          stages: 'stages',
          input: 'input',
          output: 'output'
        },
        sourceSection: 'methods'
      },

      // Governance Category
      policy: {
        layer: 'capability',
        category: 'governance',
        entityType: 'Policy',
        attributeMap: {
          name: 'name',
          jurisdiction: 'jurisdiction',
          effectiveDate: 'effectiveDate',
          status: 'status'
        },
        sourceSection: 'text'
      },

      regulation: {
        layer: 'capability',
        category: 'governance',
        entityType: 'Regulation',
        attributeMap: {
          name: 'name',
          jurisdiction: 'jurisdiction',
          authority: 'authority',
          requirements: 'requirements'
        },
        sourceSection: 'text'
      },

      institution: {
        layer: 'capability',
        category: 'governance',
        entityType: 'Institution',
        attributeMap: {
          name: 'name',
          type: 'type',
          jurisdiction: 'jurisdiction'
        },
        sourceSection: 'metadata'
      },

      // Socioeconomic Category
      populationDataset: {
        layer: 'capability',
        category: 'socioeconomic',
        entityType: 'PopulationDataset',
        attributeMap: {
          name: 'name',
          source: 'source',
          resolution: 'resolution'
        },
        sourceSection: 'data'
      },

      exposureDataset: {
        layer: 'capability',
        category: 'socioeconomic',
        entityType: 'ExposureDataset',
        attributeMap: {
          name: 'name',
          type: 'type',
          coverage: 'coverage'
        },
        sourceSection: 'data'
      },

      vulnerabilityIndex: {
        layer: 'capability',
        category: 'socioeconomic',
        entityType: 'VulnerabilityIndex',
        attributeMap: {
          name: 'name',
          value: 'value',
          factors: 'factors'
        },
        sourceSection: 'results'
      },

      // Evidence Category
      assessment: {
        layer: 'capability',
        category: 'evidence',
        entityType: 'Assessment',
        attributeMap: {
          name: 'name',
          type: 'type',
          scope: 'scope',
          confidence: 'confidence'
        },
        sourceSection: 'results'
      },

      indicator: {
        layer: 'capability',
        category: 'evidence',
        entityType: 'Indicator',
        attributeMap: {
          name: 'name',
          value: 'value',
          unit: 'unit',
          trend: 'trend'
        },
        sourceSection: 'results'
      },

      // Action Category
      intervention: {
        layer: 'capability',
        category: 'action',
        entityType: 'Intervention',
        attributeMap: {
          name: 'name',
          type: 'type',
          target: 'target',
          status: 'status'
        },
        sourceSection: 'discussion'
      },

      adaptationMeasure: {
        layer: 'capability',
        category: 'action',
        entityType: 'AdaptationMeasure',
        attributeMap: {
          name: 'name',
          type: 'type',
          target: 'target'
        },
        sourceSection: 'discussion'
      },

      mitigationMeasure: {
        layer: 'capability',
        category: 'action',
        entityType: 'MitigationMeasure',
        attributeMap: {
          name: 'name',
          type: 'type',
          effect: 'effect'
        },
        sourceSection: 'discussion'
      },

      emergencyResponse: {
        layer: 'capability',
        category: 'action',
        entityType: 'EmergencyResponse',
        attributeMap: {
          name: 'name',
          trigger: 'trigger',
          actions: 'actions'
        },
        sourceSection: 'text'
      },

      // === World Layer (Layer 3) ===
      // Earth Objects
      region: {
        layer: 'world',
        category: 'earth-object',
        entityType: 'Region',
        attributeMap: {
          name: 'name',
          bbox: 'bbox',
          geometry: 'geometry',
          area: 'area',
          type: 'regionType'
        },
        sourceSection: 'spatial'
      },

      basin: {
        layer: 'world',
        category: 'earth-object',
        entityType: 'Basin',
        attributeMap: {
          name: 'name',
          bbox: 'bbox',
          geometry: 'geometry',
          area: 'area'
        },
        sourceSection: 'spatial'
      },

      watershed: {
        layer: 'world',
        category: 'earth-object',
        entityType: 'Watershed',
        attributeMap: {
          name: 'name',
          bbox: 'bbox',
          area: 'area'
        },
        sourceSection: 'spatial'
      },

      glacier: {
        layer: 'world',
        category: 'earth-object',
        entityType: 'Glacier',
        attributeMap: {
          name: 'name',
          location: 'location',
          area: 'area'
        },
        sourceSection: 'spatial'
      },

      lake: {
        layer: 'world',
        category: 'earth-object',
        entityType: 'Lake',
        attributeMap: {
          name: 'name',
          location: 'location',
          area: 'area'
        },
        sourceSection: 'spatial'
      },

      aquifer: {
        layer: 'world',
        category: 'earth-object',
        entityType: 'Aquifer',
        attributeMap: {
          name: 'name',
          location: 'location',
          type: 'aquiferType'
        },
        sourceSection: 'spatial'
      },

      river: {
        layer: 'world',
        category: 'earth-object',
        entityType: 'River',
        attributeMap: {
          name: 'name',
          length: 'length',
          basin: 'basin'
        },
        sourceSection: 'spatial'
      },

      // Earth Variables
      earthVariable: {
        layer: 'world',
        category: 'earth-variable',
        entityType: 'EarthVariable',
        attributeMap: {
          name: 'name',
          unit: 'unit',
          range: 'range',
          temporalResolution: 'temporalResolution'
        },
        sourceSection: 'variables'
      },

      streamflow: {
        layer: 'world',
        category: 'earth-variable',
        entityType: 'Streamflow',
        attributeMap: {
          name: 'name',
          unit: 'unit',
          gauge: 'gauge'
        },
        sourceSection: 'variables'
      },

      precipitation: {
        layer: 'world',
        category: 'earth-variable',
        entityType: 'Precipitation',
        attributeMap: {
          name: 'name',
          unit: 'unit',
          type: 'precipType'
        },
        sourceSection: 'variables'
      },

      temperature: {
        layer: 'world',
        category: 'earth-variable',
        entityType: 'Temperature',
        attributeMap: {
          name: 'name',
          unit: 'unit',
          type: 'tempType'
        },
        sourceSection: 'variables'
      },

      // Hazards
      hazard: {
        layer: 'world',
        category: 'hazard',
        entityType: 'Hazard',
        attributeMap: {
          name: 'name',
          type: 'type',
          magnitude: 'magnitude',
          probability: 'probability',
          location: 'location',
          date: 'date'
        },
        sourceSection: 'text'
      },

      floodEvent: {
        layer: 'world',
        category: 'hazard',
        entityType: 'FloodEvent',
        attributeMap: {
          name: 'name',
          type: 'floodType',
          magnitude: 'magnitude',
          location: 'location',
          date: 'date'
        },
        sourceSection: 'text'
      },

      droughtEvent: {
        layer: 'world',
        category: 'hazard',
        entityType: 'DroughtEvent',
        attributeMap: {
          name: 'name',
          severity: 'severity',
          location: 'location',
          duration: 'duration'
        },
        sourceSection: 'text'
      },

      heatwave: {
        layer: 'world',
        category: 'hazard',
        entityType: 'Heatwave',
        attributeMap: {
          name: 'name',
          intensity: 'intensity',
          duration: 'duration',
          location: 'location'
        },
        sourceSection: 'text'
      },

      wildfire: {
        layer: 'world',
        category: 'hazard',
        entityType: 'Wildfire',
        attributeMap: {
          name: 'name',
          location: 'location',
          area: 'area',
          date: 'date'
        },
        sourceSection: 'text'
      },

      // Risks
      earthRisk: {
        layer: 'world',
        category: 'risk',
        entityType: 'EarthRisk',
        attributeMap: {
          name: 'name',
          type: 'type',
          likelihood: 'likelihood',
          impact: 'impact',
          exposure: 'exposure'
        },
        sourceSection: 'results'
      },

      floodRisk: {
        layer: 'world',
        category: 'risk',
        entityType: 'FloodRisk',
        attributeMap: {
          name: 'name',
          location: 'location',
          probability: 'probability',
          impact: 'impact'
        },
        sourceSection: 'results'
      },

      droughtRisk: {
        layer: 'world',
        category: 'risk',
        entityType: 'DroughtRisk',
        attributeMap: {
          name: 'name',
          location: 'location',
          probability: 'probability'
        },
        sourceSection: 'results'
      },

      // Model Outputs
      forecast: {
        layer: 'world',
        category: 'model-output',
        entityType: 'Forecast',
        attributeMap: {
          name: 'name',
          variable: 'variable',
          leadTime: 'leadTime',
          resolution: 'resolution',
          skill: 'skill'
        },
        sourceSection: 'results'
      },

      projection: {
        layer: 'world',
        category: 'model-output',
        entityType: 'Projection',
        attributeMap: {
          name: 'name',
          scenario: 'scenario',
          timeHorizon: 'timeHorizon',
          variable: 'variable'
        },
        sourceSection: 'results'
      },

      // === Foundation Layer (Layer 0) ===
      claim: {
        layer: 'foundation',
        entityType: 'Claim',
        attributeMap: {
          statement: 'statement',
          confidence: 'confidence',
          type: 'type'
        },
        metadataMap: {
          evidence: 'evidence',
          figureRef: 'figureRef'
        },
        sourceSection: 'claims'
      },

      evidence: {
        layer: 'foundation',
        entityType: 'Evidence',
        attributeMap: {
          type: 'type',
          description: 'description',
          strength: 'strength'
        },
        metadataMap: {
          supportsClaim: 'supportsClaim'
        },
        sourceSection: 'results'
      },

      // Legacy mappings for backward compatibility
      method: {
        layer: 'capability',
        category: 'modeling',
        entityType: 'Method',
        attributeMap: {
          name: 'name',
          aliases: 'aliases',
          category: 'category',
          'architecture.type': 'architecture',
          'architecture.layers': 'layers'
        },
        metadataMap: {
          innovation: 'innovation',
          description: 'description'
        },
        sourceSection: 'methods'
      },

      experiment: {
        layer: 'capability',
        category: 'computing',
        entityType: 'Experiment',
        attributeMap: {
          name: 'name',
          purpose: 'purpose',
          design: 'design'
        },
        sourceSection: 'experiments'
      },

      result: {
        layer: 'foundation',
        entityType: 'Result',
        attributeMap: {
          mainResult: 'value',
          description: 'description'
        },
        metadataMap: {
          performanceBreakdown: 'performance'
        },
        sourceSection: 'results'
      }
    };
  }

  /**
   * Map understanding data to entity
   * @param {string} understandingType - Type in understanding output (dataset, method, etc.)
   * @param {Object} data - The understanding data
   * @param {string} input - Original input (for provenance)
   * @returns {Object|null} Entity data ready for TripleStore
   */
  map(understandingType, data, input) {
    const rule = this.mappingRules[understandingType];
    if (!rule) {
      console.warn(`No mapping rule for type: ${understandingType}`);
      return null;
    }

    const attributes = {};
    const metadata = {
      source: input,
      extractedBy: 'ResearchUnderstanding',
      confidence: data.confidence || 0.8
    };

    // Apply attribute mapping
    for (const [fromPath, toSpec] of Object.entries(rule.attributeMap)) {
      const value = this._getNestedValue(data, fromPath);
      if (value !== undefined && value !== null) {
        if (typeof toSpec === 'string') {
          attributes[toSpec] = value;
        } else if (typeof toSpec === 'object') {
          const toField = toSpec.to;
          const transformed = toSpec.transform ? toSpec.transform(value) : value;
          attributes[toField] = transformed;
        }
      }
    }

    // Apply metadata mapping
    if (rule.metadataMap) {
      for (const [fromPath, toSpec] of Object.entries(rule.metadataMap)) {
        const value = this._getNestedValue(data, fromPath);
        if (value !== undefined && value !== null) {
          if (typeof toSpec === 'string') {
            metadata[toSpec] = value;
          } else if (typeof toSpec === 'object') {
            const toField = toSpec.to;
            const transformed = toSpec.transform ? toSpec.transform(value) : value;
            metadata[toField] = transformed;
          }
        }
      }
    }

    // Validate entity type
    try {
      ontology.validateEntityType(rule.entityType);
      ontology.validateEntityAttributes(rule.entityType, attributes);
    } catch (err) {
      console.warn(`Validation failed for ${rule.entityType}: ${err.message}`);
    }

    // Build source section for provenance
    const provenance = {
      section: rule.sourceSection,
      input: input,
      timestamp: new Date().toISOString()
    };

    return {
      type: rule.entityType,
      layer: rule.layer,
      category: rule.category,
      attributes,
      metadata,
      provenance
    };
  }

  /**
   * Get nested value from object using dot-separated path
   */
  _getNestedValue(obj, path) {
    if (!obj) return undefined;
    return path.split('.').reduce((current, key) => {
      return current?.[key];
    }, obj);
  }

  /**
   * Map entire understanding output to multiple entities
   * @param {Object} understanding - Full ResearchUnderstanding output
   * @param {string} input - Original input
   * @param {string} inputType - Type of input (paper, github, etc.)
   * @returns {Object} Mapped entities with type collections
   */
  mapAll(understanding, input, inputType) {
    const result = {
      entities: [],
      collections: {},
      provenance: {
        input,
        inputType,
        timestamp: new Date().toISOString()
      }
    };

    // Map datasets
    if (understanding.datasets?.datasets) {
      result.collections.datasets = [];
      for (const ds of understanding.datasets.datasets) {
        const mapped = this.map('dataset', ds, input);
        if (mapped) {
          result.entities.push(mapped);
          result.collections.datasets.push(mapped);
        }
      }
    }

    // Map methods
    if (understanding.methods?.methods) {
      result.collections.methods = [];
      for (const method of understanding.methods.methods) {
        const mapped = this.map('method', method, input);
        if (mapped) {
          result.entities.push(mapped);
          result.collections.methods.push(mapped);
        }
      }
    }

    // Map experiments
    if (understanding.experiments?.experiments) {
      result.collections.experiments = [];
      for (const exp of understanding.experiments.experiments) {
        const mapped = this.map('experiment', exp, input);
        if (mapped) {
          result.entities.push(mapped);
          result.collections.experiments.push(mapped);
        }
      }
    }

    // Map regions (spatial analysis)
    if (understanding.spatial?.regions) {
      result.collections.regions = [];
      for (const region of understanding.spatial.regions) {
        const mapped = this.map('region', region, input);
        if (mapped) {
          result.entities.push(mapped);
          result.collections.regions.push(mapped);
        }
      }
    }

    // Map claims (from overview or results)
    if (understanding.claims?.claims) {
      result.collections.claims = [];
      for (const claim of understanding.claims.claims) {
        const mapped = this.map('claim', claim, input);
        if (mapped) {
          result.entities.push(mapped);
          result.collections.claims.push(mapped);
        }
      }
    }

    // Create primary source entity
    const sourceType = inputType === 'github' ? 'Code' :
                       inputType === 'dataset' ? 'Dataset' :
                       inputType === 'report' ? 'Report' : 'Paper';

    const sourceEntity = this.createSourceEntity(understanding, input, sourceType);
    result.entities.unshift(sourceEntity);
    result.collections.source = [sourceEntity];

    return result;
  }

  /**
   * Create the primary source entity
   */
  createSourceEntity(understanding, input, sourceType) {
    const overview = understanding.overview || {};
    const metadata = understanding.metadata || {};

    const attributes = {
      type: sourceType.toLowerCase(),
      identifier: input,
      title: overview.title || 'Untitled'
    };

    if (sourceType === 'Paper') {
      attributes.doi = metadata.doi || input;
      attributes.year = metadata.year;
      attributes.authors = metadata.authors?.map(a => a.name || a);
      attributes.venue = metadata.venue;
      attributes.abstract = overview.problem;
    }

    if (sourceType === 'Code') {
      attributes.repo = input;
      attributes.language = metadata.language;
      attributes.stars = metadata.stars;
      attributes.license = metadata.license;
    }

    ontology.validateEntityAttributes(sourceType, attributes);

    return {
      type: sourceType,
      layer: 'source',
      attributes,
      metadata: {
        source: input,
        extractedBy: 'ResearchUnderstanding',
        domain: overview.domain,
        worthReading: overview.worthReading,
        complexity: overview.complexity
      },
      provenance: {
        section: 'overview',
        input: input,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Map Digital Earth Decomposer output to entities
   * @param {Object} decompositionResult - Output from DigitalEarthDecomposer
   * @param {string} input - Original input
   * @returns {Object} Mapped entities organized by layer
   */
  mapDecomposition(decompositionResult, input) {
    const result = {
      entities: [],
      byLayer: {
        foundation: [],
        source: [],
        capability: [],
        world: [],
        domain: []
      },
      byCategory: {},
      relations: [],
      provenance: decompositionResult.provenance
    };

    // Map source object (Layer 1)
    if (decompositionResult.sourceObject) {
      const sourceEntity = this._mapSourceObject(decompositionResult.sourceObject, input);
      result.entities.push(sourceEntity);
      result.byLayer.source.push(sourceEntity);
    }

    // Map capability objects (Layer 2)
    for (const obj of decompositionResult.capabilityObjects) {
      const entity = this._mapDecomposedObject(obj, input);
      if (entity) {
        result.entities.push(entity);
        result.byLayer.capability.push(entity);

        // Organize by category
        const category = obj.metadata?.category || 'general';
        if (!result.byCategory[category]) result.byCategory[category] = [];
        result.byCategory[category].push(entity);
      }
    }

    // Map world objects (Layer 3)
    for (const obj of decompositionResult.worldObjects) {
      const entity = this._mapDecomposedObject(obj, input);
      if (entity) {
        result.entities.push(entity);
        result.byLayer.world.push(entity);

        const category = obj.metadata?.category || 'earth-object';
        if (!result.byCategory[category]) result.byCategory[category] = [];
        result.byCategory[category].push(entity);
      }
    }

    // Map evidence objects (Layer 0 - foundation)
    for (const obj of decompositionResult.evidenceObjects) {
      const entity = this._mapDecomposedObject(obj, input);
      if (entity) {
        result.entities.push(entity);
        result.byLayer.foundation.push(entity);
      }
    }

    // Map bridge relations
    for (const rel of decompositionResult.bridgeRelations) {
      result.relations.push({
        type: rel.type,
        from: rel.from,
        to: rel.to,
        confidence: rel.confidence,
        provenance: rel.provenance
      });
    }

    return result;
  }

  /**
   * Map a source object from decomposition
   */
  _mapSourceObject(sourceObj, input) {
    return {
      id: sourceObj.id,
      type: sourceObj.type,
      layer: 'source',
      attributes: sourceObj.attributes,
      metadata: {
        source: input,
        sourceRoles: sourceObj.metadata?.sourceRoles,
        primaryRole: sourceObj.metadata?.primaryRole,
        admitted: sourceObj.metadata?.admitted
      },
      provenance: sourceObj.provenance || { section: 'header', input }
    };
  }

  /**
   * Map a decomposed object to entity format
   */
  _mapDecomposedObject(obj, input) {
    if (!obj || !obj.type) return null;

    const mappingKey = this._getMappingKey(obj.type);
    const rule = this.mappingRules[mappingKey];

    const entity = {
      id: obj.id,
      type: obj.type,
      layer: rule?.layer || obj.metadata?.layer || 'capability',
      category: rule?.category || obj.metadata?.category,
      attributes: obj.attributes || {},
      metadata: {
        source: input,
        confidence: obj.metadata?.confidence || 0.8,
        ...obj.metadata
      },
      provenance: obj.provenance || { section: 'unknown', input }
    };

    // Validate if ontology supports it
    try {
      ontology.validateEntityType(entity.type);
    } catch (err) {
      // Type might be valid but not registered yet
      entity.metadata.validationWarning = err.message;
    }

    return entity;
  }

  /**
   * Get mapping key from entity type (camelCase to lowercase first word)
   */
  _getMappingKey(entityType) {
    // Handle compound names like FloodEvent -> floodEvent
    if (!entityType) return null;
    return entityType.charAt(0).toLowerCase() + entityType.slice(1);
  }

  /**
   * Get entities by layer
   * @param {Object} mappedResult - Result from mapDecomposition
   * @param {string} layer - Layer name (foundation, source, capability, world, domain)
   * @returns {Array} Entities in that layer
   */
  getEntitiesByLayer(mappedResult, layer) {
    return mappedResult.byLayer[layer] || [];
  }

  /**
   * Get entities by category
   * @param {Object} mappedResult - Result from mapDecomposition
   * @param {string} category - Category name
   * @returns {Array} Entities in that category
   */
  getEntitiesByCategory(mappedResult, category) {
    return mappedResult.byCategory[category] || [];
  }
}

module.exports = EntityMapper;