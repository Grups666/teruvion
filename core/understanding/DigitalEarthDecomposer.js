/**
 * Digital Earth Decomposer
 * Decomposes sources into Digital Earth object graph based on activated ontology
 *
 * Key insight: Different sources require different extraction strategies.
 * A paper produces different objects than a GitHub repo or a dataset page.
 * This component uses the activated ontology from SourceAdmission to guide extraction.
 *
 * Pipeline:
 * 1. Source Role Detection → Activated Ontology (from SourceAdmission)
 * 2. Capability Extraction (Layer 2 objects)
 * 3. World Object Extraction (Layer 3 objects)
 * 4. Bridge Relation Extraction (Capability ↔ World connections)
 * 5. Provenance Grounding (trace to source sections)
 */

const ontology = require('../registry/ontology');

class DigitalEarthDecomposer {
  constructor(llm, options = {}) {
    this.llm = llm;
    this.options = {
      maxRetries: options.maxRetries || 2,
      confidenceThreshold: options.confidenceThreshold || 0.6,
      ...options
    };
  }

  /**
   * Decompose a source into Digital Earth objects
   * @param {string} input - Original input (DOI, URL, etc.)
   * @param {Object} content - Full content (text, metadata)
   * @param {Object} admissionResult - Result from SourceAdmission
   * @returns {Object} Decomposition result with sourceObjects, capabilityObjects, worldObjects
   */
  async decompose(input, content, admissionResult) {
    const startTime = Date.now();
    const depth = admissionResult.depth;

    // Initialize result structure
    const result = {
      input,
      sourceType: admissionResult.sourceType,
      depth,

      // Layer 1: Source objects (the source itself as an entity)
      sourceObject: null,

      // Layer 2: Capability objects (data, observation, modeling, computing, governance, action)
      capabilityObjects: [],

      // Layer 3: World objects (Earth systems, regions, variables, hazards, risks)
      worldObjects: [],

      // Evidence objects (claims, evidence chains)
      evidenceObjects: [],

      // Bridge relations (Capability ↔ World connections)
      bridgeRelations: [],

      // Provenance tracking
      provenance: {
        input,
        timestamp: new Date().toISOString(),
        sections: {}
      },

      // Metadata
      processingTime: 0,
      confidence: 0
    };

    // Skip deep extraction for light/reject
    if (depth === 'reject') {
      result.processingTime = Date.now() - startTime;
      return result;
    }

    try {
      // Step 1: Create source object (always)
      result.sourceObject = this._createSourceObject(input, content, admissionResult);

      // Step 2: Extract capabilities based on activated categories
      if (admissionResult.activatedCategories.length > 0) {
        const capabilities = await this._extractCapabilities(content, admissionResult);
        result.capabilityObjects = capabilities.objects;
        result.provenance.sections.capabilities = capabilities.sections;
      }

      // Step 3: Extract world objects based on activated layers
      if (admissionResult.activatedOntologyLayers.includes('world')) {
        const worldObjects = await this._extractWorldObjects(content, admissionResult);
        result.worldObjects = worldObjects.objects;
        result.provenance.sections.worldObjects = worldObjects.sections;
      }

      // Step 4: Extract evidence objects (for deep processing)
      if (depth === 'deep' || depth === 'structured') {
        const evidence = await this._extractEvidence(content, admissionResult);
        result.evidenceObjects = evidence.objects;
        result.provenance.sections.evidence = evidence.sections;
      }

      // Step 5: Build bridge relations
      if (depth === 'deep' || depth === 'structured') {
        result.bridgeRelations = this._buildBridgeRelations(
          result.capabilityObjects,
          result.worldObjects,
          result.evidenceObjects
        );
      }

      // Calculate overall confidence
      result.confidence = this._calculateConfidence(result);

    } catch (error) {
      result.error = error.message;
      result.confidence = 0;
    }

    result.processingTime = Date.now() - startTime;
    return result;
  }

  /**
   * Create the primary source object
   */
  _createSourceObject(input, content, admissionResult) {
    const sourceType = admissionResult.sourceType;
    const metadata = content.metadata || {};
    const text = content.text || '';

    const sourceObject = {
      type: sourceType,
      id: this._generateId(sourceType, input),
      attributes: {
        identifier: input,
        title: metadata.title || metadata.name || 'Untitled',
        type: sourceType.toLowerCase()
      },
      metadata: {
        sourceRoles: admissionResult.sourceRoles,
        primaryRole: admissionResult.primaryRole,
        admitted: admissionResult.admitted,
        depth: admissionResult.depth
      },
      provenance: {
        section: 'header',
        input
      }
    };

    // Add source-type-specific attributes
    switch (sourceType) {
      case 'Paper':
        sourceObject.attributes.doi = metadata.doi || input;
        sourceObject.attributes.year = metadata.year;
        sourceObject.attributes.authors = metadata.authors;
        sourceObject.attributes.venue = metadata.venue;
        sourceObject.attributes.abstract = metadata.abstract;
        break;

      case 'Repository':
        sourceObject.attributes.repo = input;
        sourceObject.attributes.language = metadata.language;
        sourceObject.attributes.stars = metadata.stars;
        sourceObject.attributes.license = metadata.license;
        sourceObject.attributes.description = metadata.description || metadata.readme?.substring(0, 500);
        break;

      case 'DatasetPage':
        sourceObject.attributes.url = input;
        sourceObject.attributes.variables = metadata.variables;
        sourceObject.attributes.coverage = metadata.spatialCoverage;
        sourceObject.attributes.temporalCoverage = metadata.temporalCoverage;
        break;

      case 'Report':
      case 'AssessmentReport':
        sourceObject.attributes.institution = metadata.institution;
        sourceObject.attributes.year = metadata.year;
        sourceObject.attributes.type = metadata.reportType || 'report';
        break;

      case 'PolicyDocument':
        sourceObject.attributes.jurisdiction = metadata.jurisdiction;
        sourceObject.attributes.effectiveDate = metadata.effectiveDate;
        sourceObject.attributes.issuingBody = metadata.issuingBody;
        break;

      case 'News':
        sourceObject.attributes.date = metadata.date || metadata.publishedDate;
        sourceObject.attributes.venue = metadata.venue || metadata.source;
        sourceObject.attributes.event = metadata.event;
        break;
    }

    return sourceObject;
  }

  /**
   * Extract capability objects based on activated categories
   */
  async _extractCapabilities(content, admissionResult) {
    const objects = [];
    const sections = {};
    const categories = admissionResult.activatedCategories;
    const text = content.text || '';
    const metadata = content.metadata || {};

    // Extract based on activated categories
    if (categories.includes('data')) {
      const dataObjects = this._extractDataCapabilities(metadata, text);
      objects.push(...dataObjects);
      sections.data = { count: dataObjects.length, sources: ['metadata', 'text'] };
    }

    if (categories.includes('observation')) {
      const obsObjects = this._extractObservationCapabilities(metadata, text);
      objects.push(...obsObjects);
      sections.observation = { count: obsObjects.length, sources: ['text'] };
    }

    if (categories.includes('modeling')) {
      const modelObjects = this._extractModelingCapabilities(metadata, text);
      objects.push(...modelObjects);
      sections.modeling = { count: modelObjects.length, sources: ['text', 'metadata'] };
    }

    if (categories.includes('computing')) {
      const computeObjects = this._extractComputingCapabilities(metadata, text);
      objects.push(...computeObjects);
      sections.computing = { count: computeObjects.length, sources: ['metadata'] };
    }

    if (categories.includes('governance')) {
      const govObjects = this._extractGovernanceCapabilities(metadata, text);
      objects.push(...govObjects);
      sections.governance = { count: govObjects.length, sources: ['text'] };
    }

    if (categories.includes('socioeconomic')) {
      const socioObjects = this._extractSocioeconomicCapabilities(metadata, text);
      objects.push(...socioObjects);
      sections.socioeconomic = { count: socioObjects.length, sources: ['text'] };
    }

    if (categories.includes('evidence')) {
      const evidenceObjects = this._extractEvidenceCapabilities(metadata, text);
      objects.push(...evidenceObjects);
      sections.evidence = { count: evidenceObjects.length, sources: ['results', 'discussion'] };
    }

    if (categories.includes('action')) {
      const actionObjects = this._extractActionCapabilities(metadata, text);
      objects.push(...actionObjects);
      sections.action = { count: actionObjects.length, sources: ['text'] };
    }

    return { objects, sections };
  }

  /**
   * Extract data capabilities (Dataset, Variable, Coverage, DataQuality)
   */
  _extractDataCapabilities(metadata, text) {
    const objects = [];
    const datasets = metadata.datasets || [];

    // Use metadata datasets if available
    for (const ds of datasets) {
      objects.push({
        type: 'Dataset',
        id: this._generateId('dataset', ds.name || ds),
        attributes: {
          name: ds.name || ds,
          acronym: ds.acronym,
          variables: ds.variables,
          spatialCoverage: ds.spatialCoverage || ds.coverage,
          temporalCoverage: ds.temporalCoverage,
          role: ds.role || 'input',
          accessUrl: ds.url || ds.accessUrl
        },
        metadata: {
          confidence: ds.confidence || 0.8
        },
        provenance: {
          section: 'datasets',
          sourceText: ds.originalText
        }
      });
    }

    // Also check for variables list
    if (metadata.variables && metadata.variables.length > 0) {
      for (const v of metadata.variables) {
        objects.push({
          type: 'Variable',
          id: this._generateId('variable', v.name || v),
          attributes: {
            name: v.name || v,
            unit: v.unit,
            description: v.description
          },
          metadata: { confidence: 0.9 },
          provenance: { section: 'variables' }
        });
      }
    }

    return objects;
  }

  /**
   * Extract observation capabilities (Sensor, Satellite, Gauge, Station)
   */
  _extractObservationCapabilities(metadata, text) {
    const objects = [];

    // Extract from satellite/sensor mentions
    const satellites = metadata.satellites || [];
    for (const sat of satellites) {
      objects.push({
        type: 'Satellite',
        id: this._generateId('satellite', sat.name || sat),
        attributes: {
          name: sat.name || sat,
          sensors: sat.sensors,
          resolution: sat.resolution,
          revisitTime: sat.revisitTime
        },
        metadata: { confidence: sat.confidence || 0.8 },
        provenance: { section: 'methods' }
      });
    }

    // Extract gauges/stations
    const gauges = metadata.gauges || metadata.stations || [];
    for (const gauge of gauges) {
      objects.push({
        type: 'Gauge',
        id: this._generateId('gauge', gauge.name || gauge.id || gauge),
        attributes: {
          name: gauge.name || gauge.id || gauge,
          stationId: gauge.id,
          river: gauge.river,
          location: gauge.location
        },
        metadata: { confidence: gauge.confidence || 0.8 },
        provenance: { section: 'methods' }
      });
    }

    return objects;
  }

  /**
   * Extract modeling capabilities (Model, Algorithm, Simulation, Calibration)
   */
  _extractModelingCapabilities(metadata, text) {
    const objects = [];
    const models = metadata.models || [];

    for (const model of models) {
      objects.push({
        type: 'Model',
        id: this._generateId('model', model.name || model),
        attributes: {
          name: model.name || model,
          type: model.type || 'machine_learning',
          architecture: model.architecture,
          framework: model.framework,
          hyperparameters: model.hyperparameters
        },
        metadata: {
          confidence: model.confidence || 0.8,
          innovation: model.innovation
        },
        provenance: {
          section: 'methods',
          sourceText: model.originalText
        }
      });
    }

    // Add algorithms mentioned
    const algorithms = metadata.algorithms || [];
    for (const algo of algorithms) {
      objects.push({
        type: 'Algorithm',
        id: this._generateId('algorithm', algo.name || algo),
        attributes: {
          name: algo.name || algo,
          category: algo.category,
          purpose: algo.purpose
        },
        metadata: { confidence: algo.confidence || 0.8 },
        provenance: { section: 'methods' }
      });
    }

    return objects;
  }

  /**
   * Extract computing capabilities (Software, API, Workflow, Pipeline)
   */
  _extractComputingCapabilities(metadata, text) {
    const objects = [];

    // Software/packages
    const packages = metadata.packages || metadata.dependencies || [];
    for (const pkg of packages) {
      objects.push({
        type: 'Software',
        id: this._generateId('software', pkg.name || pkg),
        attributes: {
          name: pkg.name || pkg,
          version: pkg.version,
          language: metadata.language
        },
        metadata: { confidence: 0.9 },
        provenance: { section: 'dependencies' }
      });
    }

    // Workflows
    const workflows = metadata.workflows || [];
    for (const wf of workflows) {
      objects.push({
        type: 'Workflow',
        id: this._generateId('workflow', wf.name || wf),
        attributes: {
          name: wf.name || wf,
          steps: wf.steps,
          purpose: wf.purpose
        },
        metadata: { confidence: wf.confidence || 0.8 },
        provenance: { section: 'methods' }
      });
    }

    // APIs
    if (metadata.type === 'APIPage' || metadata.apiEndpoint) {
      objects.push({
        type: 'API',
        id: this._generateId('api', metadata.name || input),
        attributes: {
          name: metadata.name,
          endpoint: metadata.apiEndpoint,
          description: metadata.description
        },
        metadata: { confidence: 0.9 },
        provenance: { section: 'header' }
      });
    }

    return objects;
  }

  /**
   * Extract governance capabilities (Policy, Regulation, Institution)
   */
  _extractGovernanceCapabilities(metadata, text) {
    const objects = [];

    // Institutions
    const institutions = metadata.institutions || [];
    for (const inst of institutions) {
      objects.push({
        type: 'Institution',
        id: this._generateId('institution', inst.name || inst),
        attributes: {
          name: inst.name || inst,
          type: inst.type,
          jurisdiction: inst.jurisdiction
        },
        metadata: { confidence: inst.confidence || 0.8 },
        provenance: { section: 'metadata' }
      });
    }

    // Policies/regulations
    const policies = metadata.policies || [];
    for (const policy of policies) {
      objects.push({
        type: 'Policy',
        id: this._generateId('policy', policy.name || policy),
        attributes: {
          name: policy.name || policy,
          jurisdiction: policy.jurisdiction,
          effectiveDate: policy.effectiveDate,
          status: policy.status
        },
        metadata: { confidence: policy.confidence || 0.8 },
        provenance: { section: 'text' }
      });
    }

    return objects;
  }

  /**
   * Extract socioeconomic capabilities
   */
  _extractSocioeconomicCapabilities(metadata, text) {
    const objects = [];

    // Population data
    if (metadata.population || metadata.demographicData) {
      objects.push({
        type: 'PopulationDataset',
        id: this._generateId('population', metadata.population?.name || 'population'),
        attributes: {
          name: metadata.population?.name || 'Population Data',
          source: metadata.population?.source,
          resolution: metadata.population?.resolution
        },
        metadata: { confidence: 0.8 },
        provenance: { section: 'data' }
      });
    }

    // Exposure data
    const exposures = metadata.exposures || [];
    for (const exp of exposures) {
      objects.push({
        type: 'ExposureDataset',
        id: this._generateId('exposure', exp.name || exp),
        attributes: {
          name: exp.name || exp,
          type: exp.type,
          coverage: exp.coverage
        },
        metadata: { confidence: exp.confidence || 0.8 },
        provenance: { section: 'data' }
      });
    }

    return objects;
  }

  /**
   * Extract evidence capabilities (Assessment, Indicator, EvidenceChain)
   */
  _extractEvidenceCapabilities(metadata, text) {
    const objects = [];

    // Assessments
    const assessments = metadata.assessments || [];
    for (const assess of assessments) {
      objects.push({
        type: 'Assessment',
        id: this._generateId('assessment', assess.name || assess),
        attributes: {
          name: assess.name || assess,
          type: assess.type,
          scope: assess.scope,
          confidence: assess.confidence
        },
        metadata: { confidence: assess.confidence || 0.8 },
        provenance: { section: 'results' }
      });
    }

    // Indicators
    const indicators = metadata.indicators || [];
    for (const ind of indicators) {
      objects.push({
        type: 'Indicator',
        id: this._generateId('indicator', ind.name || ind),
        attributes: {
          name: ind.name || ind,
          value: ind.value,
          unit: ind.unit,
          trend: ind.trend
        },
        metadata: { confidence: ind.confidence || 0.8 },
        provenance: { section: 'results' }
      });
    }

    return objects;
  }

  /**
   * Extract action capabilities (Intervention, AdaptationMeasure, EmergencyResponse)
   */
  _extractActionCapabilities(metadata, text) {
    const objects = [];

    const interventions = metadata.interventions || metadata.measures || [];
    for (const interv of interventions) {
      const interventionType = interv.type || 'intervention';
      const entityType = interventionType.includes('adaptation') ? 'AdaptationMeasure' :
                         interventionType.includes('mitigation') ? 'MitigationMeasure' :
                         interventionType.includes('emergency') ? 'EmergencyResponse' : 'Intervention';

      objects.push({
        type: entityType,
        id: this._generateId('intervention', interv.name || interv),
        attributes: {
          name: interv.name || interv,
          type: interventionType,
          target: interv.target,
          status: interv.status
        },
        metadata: { confidence: interv.confidence || 0.8 },
        provenance: { section: 'discussion' }
      });
    }

    return objects;
  }

  /**
   * Extract world objects (Earth systems, regions, variables, hazards, risks)
   */
  async _extractWorldObjects(content, admissionResult) {
    const objects = [];
    const sections = {};
    const metadata = content.metadata || {};
    const categories = admissionResult.activatedCategories;

    // Earth objects (basins, glaciers, lakes, etc.)
    if (categories.includes('earth-object')) {
      const earthObjects = this._extractEarthObjects(metadata);
      objects.push(...earthObjects);
      sections.earthObjects = { count: earthObjects.length };
    }

    // Earth variables (streamflow, precipitation, temperature)
    if (categories.includes('earth-variable')) {
      const variables = this._extractEarthVariables(metadata);
      objects.push(...variables);
      sections.earthVariables = { count: variables.length };
    }

    // Hazards (floods, droughts, heatwaves)
    if (categories.includes('hazard')) {
      const hazards = this._extractHazards(metadata);
      objects.push(...hazards);
      sections.hazards = { count: hazards.length };
    }

    // Risks (exposure, vulnerability)
    if (categories.includes('risk')) {
      const risks = this._extractRisks(metadata);
      objects.push(...risks);
      sections.risks = { count: risks.length };
    }

    // Model outputs (forecasts, projections)
    if (categories.includes('model-output')) {
      const outputs = this._extractModelOutputs(metadata);
      objects.push(...outputs);
      sections.modelOutputs = { count: outputs.length };
    }

    return { objects, sections };
  }

  /**
   * Extract Earth objects (regions, basins, glaciers, etc.)
   */
  _extractEarthObjects(metadata) {
    const objects = [];
    const regions = metadata.regions || metadata.studyAreas || [];

    for (const region of regions) {
      const regionType = region.type || 'Region';
      const entityType = this._mapRegionType(regionType);

      objects.push({
        type: entityType,
        id: this._generateId('region', region.name || region),
        attributes: {
          name: region.name || region,
          bbox: region.bbox,
          geometry: region.geometry,
          area: region.area,
          type: regionType
        },
        metadata: {
          confidence: region.confidence || 0.8
        },
        provenance: {
          section: 'spatial',
          sourceText: region.originalText
        }
      });
    }

    return objects;
  }

  /**
   * Map region type string to entity type
   */
  _mapRegionType(regionType) {
    const mapping = {
      'basin': 'Basin',
      'watershed': 'Watershed',
      'river': 'River',
      'lake': 'Lake',
      'glacier': 'Glacier',
      'aquifer': 'Aquifer',
      'coastline': 'Coastline',
      'region': 'Region',
      'country': 'Region',
      'continent': 'Region'
    };
    return mapping[regionType.toLowerCase()] || 'Region';
  }

  /**
   * Extract Earth variables
   */
  _extractEarthVariables(metadata) {
    const objects = [];
    const variables = metadata.earthVariables || [];

    for (const v of variables) {
      objects.push({
        type: 'EarthVariable',
        id: this._generateId('earthvar', v.name || v),
        attributes: {
          name: v.name || v,
          unit: v.unit,
          range: v.range,
          temporalResolution: v.temporalResolution
        },
        metadata: { confidence: v.confidence || 0.8 },
        provenance: { section: 'variables' }
      });
    }

    return objects;
  }

  /**
   * Extract hazards
   */
  _extractHazards(metadata) {
    const objects = [];
    const hazards = metadata.hazards || [];

    for (const h of hazards) {
      const hazardType = h.type || 'Hazard';
      const entityType = this._mapHazardType(hazardType);

      objects.push({
        type: entityType,
        id: this._generateId('hazard', h.name || h.type || h),
        attributes: {
          name: h.name || h.type || h,
          type: hazardType,
          magnitude: h.magnitude,
          probability: h.probability,
          location: h.location,
          date: h.date
        },
        metadata: { confidence: h.confidence || 0.8 },
        provenance: { section: 'text' }
      });
    }

    return objects;
  }

  /**
   * Map hazard type to entity type
   */
  _mapHazardType(hazardType) {
    const mapping = {
      'flood': 'FloodEvent',
      'drought': 'DroughtEvent',
      'heatwave': 'Heatwave',
      'wildfire': 'Wildfire',
      'landslide': 'Landslide',
      'earthquake': 'EarthEvent',
      'cyclone': 'EarthEvent',
      'hurricane': 'EarthEvent'
    };
    return mapping[hazardType.toLowerCase()] || 'Hazard';
  }

  /**
   * Extract risks (exposure, vulnerability)
   */
  _extractRisks(metadata) {
    const objects = [];

    // Risk assessments
    const risks = metadata.risks || [];
    for (const r of risks) {
      objects.push({
        type: 'EarthRisk',
        id: this._generateId('risk', r.name || r.type || 'risk'),
        attributes: {
          name: r.name || r.type || 'Risk Assessment',
          type: r.type,
          likelihood: r.likelihood,
          impact: r.impact,
          exposure: r.exposure
        },
        metadata: { confidence: r.confidence || 0.8 },
        provenance: { section: 'results' }
      });
    }

    return objects;
  }

  /**
   * Extract model outputs (forecasts, projections)
   */
  _extractModelOutputs(metadata) {
    const objects = [];

    const forecasts = metadata.forecasts || [];
    for (const f of forecasts) {
      objects.push({
        type: 'Forecast',
        id: this._generateId('forecast', f.name || f.variable || 'forecast'),
        attributes: {
          name: f.name || f.variable || 'Forecast',
          variable: f.variable,
          leadTime: f.leadTime,
          resolution: f.resolution,
          skill: f.skill
        },
        metadata: { confidence: f.confidence || 0.8 },
        provenance: { section: 'results' }
      });
    }

    const projections = metadata.projections || [];
    for (const p of projections) {
      objects.push({
        type: 'Projection',
        id: this._generateId('projection', p.name || p.scenario || 'projection'),
        attributes: {
          name: p.name || p.scenario || 'Projection',
          scenario: p.scenario,
          timeHorizon: p.timeHorizon,
          variable: p.variable
        },
        metadata: { confidence: p.confidence || 0.8 },
        provenance: { section: 'results' }
      });
    }

    return objects;
  }

  /**
   * Extract evidence objects (claims, evidence chains)
   */
  async _extractEvidence(content, admissionResult) {
    const objects = [];
    const sections = {};
    const metadata = content.metadata || {};

    // Claims
    const claims = metadata.claims || [];
    for (const claim of claims) {
      objects.push({
        type: 'Claim',
        id: this._generateId('claim', claim.statement?.substring(0, 50) || claim.id || 'claim'),
        attributes: {
          statement: claim.statement,
          confidence: claim.confidence,
          type: claim.type
        },
        metadata: {
          evidence: claim.evidence,
          figureRef: claim.figureRef
        },
        provenance: {
          section: claim.section || 'results',
          sourceText: claim.originalText
        }
      });
    }
    sections.claims = { count: claims.length };

    // Evidence items
    const evidenceItems = metadata.evidence || [];
    for (const ev of evidenceItems) {
      objects.push({
        type: 'Evidence',
        id: this._generateId('evidence', ev.description?.substring(0, 50) || ev.id || 'evidence'),
        attributes: {
          type: ev.type || 'empirical',
          description: ev.description,
          strength: ev.strength
        },
        metadata: {
          supportsClaim: ev.supportsClaim
        },
        provenance: {
          section: ev.section || 'results',
          figureRef: ev.figureRef,
          tableRef: ev.tableRef
        }
      });
    }
    sections.evidence = { count: evidenceItems.length };

    return { objects, sections };
  }

  /**
   * Build bridge relations between capabilities and world objects
   */
  _buildBridgeRelations(capabilityObjects, worldObjects, evidenceObjects) {
    const relations = [];

    // Dataset → Region coverage
    for (const cap of capabilityObjects) {
      if (cap.type === 'Dataset') {
        for (const world of worldObjects) {
          if (['Basin', 'Region', 'Watershed', 'Glacier', 'Lake'].includes(world.type)) {
            relations.push({
              type: 'covers',
              from: cap.id,
              to: world.id,
              confidence: 0.7,
              provenance: { section: 'spatial' }
            });
          }
        }
      }

      // Model → Basin simulation
      if (cap.type === 'Model') {
        for (const world of worldObjects) {
          if (['Basin', 'Watershed', 'River'].includes(world.type)) {
            relations.push({
              type: 'simulates',
              from: cap.id,
              to: world.id,
              confidence: 0.8,
              provenance: { section: 'methods' }
            });
          }
        }
      }

      // Sensor/Satellite → Variable observation
      if (['Satellite', 'Sensor', 'Gauge'].includes(cap.type)) {
        for (const world of worldObjects) {
          if (world.type === 'EarthVariable') {
            relations.push({
              type: 'observes',
              from: cap.id,
              to: world.id,
              confidence: 0.8,
              provenance: { section: 'methods' }
            });
          }
        }
      }

      // Intervention → Risk reduction
      if (['Intervention', 'AdaptationMeasure', 'MitigationMeasure'].includes(cap.type)) {
        for (const world of worldObjects) {
          if (world.type === 'EarthRisk') {
            relations.push({
              type: 'mitigates',
              from: cap.id,
              to: world.id,
              confidence: 0.7,
              provenance: { section: 'discussion' }
            });
          }
        }
      }
    }

    // Evidence → World Object support
    for (const ev of evidenceObjects) {
      if (ev.type === 'Evidence') {
        for (const world of worldObjects) {
          if (['Hazard', 'EarthVariable', 'EarthRisk'].includes(world.type)) {
            relations.push({
              type: 'supports',
              from: ev.id,
              to: world.id,
              confidence: ev.metadata?.strength || 0.7,
              provenance: ev.provenance
            });
          }
        }
      }
    }

    return relations;
  }

  /**
   * Calculate overall confidence of extraction
   */
  _calculateConfidence(result) {
    const counts = {
      source: result.sourceObject ? 1 : 0,
      capabilities: result.capabilityObjects.length,
      world: result.worldObjects.length,
      evidence: result.evidenceObjects.length,
      relations: result.bridgeRelations.length
    };

    if (counts.source === 0) return 0;

    // Base confidence on extraction completeness
    const depth = result.depth;
    let expectedCounts = { capabilities: 0, world: 0, evidence: 0, relations: 0 };

    if (depth === 'deep') {
      expectedCounts = { capabilities: 3, world: 5, evidence: 2, relations: 5 };
    } else if (depth === 'structured') {
      expectedCounts = { capabilities: 2, world: 3, evidence: 1, relations: 3 };
    } else if (depth === 'light') {
      expectedCounts = { capabilities: 1, world: 0, evidence: 0, relations: 0 };
    }

    let totalScore = 1.0; // Source object always exists

    for (const [key, expected] of Object.entries(expectedCounts)) {
      const actual = counts[key];
      const ratio = expected > 0 ? Math.min(actual / expected, 1) : (actual > 0 ? 1 : 0);
      totalScore += ratio;
    }

    return Math.min(totalScore / 5, 1.0);
  }

  /**
   * Generate entity ID
   */
  _generateId(type, name) {
    const slug = (name || 'unknown')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);
    const prefix = type.toLowerCase().replace(/[^a-z]/g, '').substring(0, 3);
    return `${prefix}-${slug}-${Date.now().toString(36)}`;
  }
}

module.exports = DigitalEarthDecomposer;
