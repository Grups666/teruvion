/**
 * Digital Earth Decomposer
 * Decomposes sources into Digital Earth object graph based on activated ontology
 *
 * Two-phase extraction:
 * 1. Metadata-driven extraction (fast, reliable, from connector metadata)
 * 2. LLM-assisted deep extraction (semantic understanding from source text)
 *
 * Pipeline:
 * 1. Source Role Detection → Activated Ontology (from SourceAdmission)
 * 2. Metadata Extraction (connector-provided structured data)
 * 3. LLM Extraction (semantic deep decomposition)
 * 4. Merge + Validate (combine both sources)
 * 5. Bridge Relations (Capability ↔ World connections)
 * 6. Provenance Grounding (trace to source sections)
 */

const ontology = require('../registry/ontology');
const DynamicOntologyActivation = require('./DynamicOntologyActivation');

class DigitalEarthDecomposer {
  constructor(llm, options = {}) {
    this.llm = llm;
    this.options = {
      maxRetries: options.maxRetries || 2,
      confidenceThreshold: options.confidenceThreshold || 0.6,
      useLLM: options.useLLM !== false, // Default to true
      ...options
    };
    this.ontologyActivator = new DynamicOntologyActivation();
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
        sections: {},
        extractionMethod: 'hybrid' // 'metadata', 'llm', or 'hybrid'
      },

      // Extraction metadata
      extractionMetadata: {
        metadataExtraction: null,
        llmExtraction: null,
        mergeStrategy: null
      },

      // Metadata
      processingTime: 0,
      confidence: 0
    };

    // Skip deep extraction for light/reject
    if (depth === 'reject') {
      result.processingTime = Date.now() - startTime;
      result.provenance.extractionMethod = 'none';
      return result;
    }

    try {
      // Step 1: Create source object (always from metadata)
      result.sourceObject = this._createSourceObject(input, content, admissionResult);

      // Step 2: Phase 1 - Metadata-driven extraction
      const metadataResult = this._extractFromMetadata(content, admissionResult);
      result.extractionMetadata.metadataExtraction = {
        capabilityCount: metadataResult.capabilityObjects.length,
        worldCount: metadataResult.worldObjects.length,
        evidenceCount: metadataResult.evidenceObjects.length
      };

      // Step 3: Phase 2 - LLM-assisted extraction (if LLM available and text exists)
      let llmResult = null;
      if (this.options.useLLM && this.llm && content.text && content.text.length > 100) {
        try {
          llmResult = await this._extractWithLLM(input, content, admissionResult);
          result.extractionMetadata.llmExtraction = {
            capabilityCount: llmResult.capabilityObjects?.length || 0,
            worldCount: llmResult.worldObjects?.length || 0,
            evidenceCount: llmResult.evidenceObjects?.length || 0,
            success: true
          };
        } catch (llmError) {
          result.extractionMetadata.llmExtraction = {
            success: false,
            error: llmError.message
          };
        }
      }

      // Step 4: Merge results (LLM takes precedence, metadata as fallback)
      const merged = this._mergeExtractions(metadataResult, llmResult, admissionResult);
      result.capabilityObjects = merged.capabilityObjects;
      result.worldObjects = merged.worldObjects;
      result.evidenceObjects = merged.evidenceObjects;
      result.extractionMetadata.mergeStrategy = merged.strategy;

      // Update provenance
      result.provenance.sections = merged.sections;
      result.provenance.extractionMethod = llmResult ? 'hybrid' : 'metadata';

      // Step 5: Build bridge relations
      if (depth === 'deep' || depth === 'structured') {
        result.bridgeRelations = this._buildBridgeRelations(
          result.capabilityObjects,
          result.worldObjects,
          result.evidenceObjects
        );
      }

      // Step 6: Validate all objects against ontology
      this._validateObjects(result);

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
   * Phase 1: Extract from connector-provided metadata
   */
  _extractFromMetadata(content, admissionResult) {
    const result = {
      capabilityObjects: [],
      worldObjects: [],
      evidenceObjects: [],
      sections: {}
    };

    const metadata = content.metadata || {};

    // Extract capabilities from metadata (synchronous since it's just data transformation)
    if (admissionResult.activatedCategories?.length > 0) {
      const capabilities = this._extractCapabilitiesSync(metadata, admissionResult);
      result.capabilityObjects = capabilities.objects;
      result.sections.capabilities = capabilities.sections;
    }

    // Extract world objects from metadata
    if (admissionResult.activatedOntologyLayers?.includes('world')) {
      const worldObjects = this._extractWorldObjectsSync(metadata, admissionResult);
      result.worldObjects = worldObjects.objects;
      result.sections.worldObjects = worldObjects.sections;
    }

    // Extract evidence from metadata
    if (admissionResult.depth === 'deep' || admissionResult.depth === 'structured') {
      const evidence = this._extractEvidenceSync(metadata, admissionResult);
      result.evidenceObjects = evidence.objects;
      result.sections.evidence = evidence.sections;
    }

    return result;
  }

  /**
   * Sync version of capability extraction (metadata-only)
   */
  _extractCapabilitiesSync(metadata, admissionResult) {
    const objects = [];
    const sections = {};
    const categories = admissionResult.activatedCategories || [];

    // Extract based on activated categories
    if (categories.includes('data')) {
      const dataObjects = this._extractDataCapabilities(metadata, '');
      objects.push(...dataObjects);
      sections.data = { count: dataObjects.length, sources: ['metadata'] };
    }

    if (categories.includes('observation')) {
      const obsObjects = this._extractObservationCapabilities(metadata, '');
      objects.push(...obsObjects);
      sections.observation = { count: obsObjects.length, sources: ['metadata'] };
    }

    if (categories.includes('modeling')) {
      const modelObjects = this._extractModelingCapabilities(metadata, '');
      objects.push(...modelObjects);
      sections.modeling = { count: modelObjects.length, sources: ['metadata'] };
    }

    if (categories.includes('computing')) {
      const computeObjects = this._extractComputingCapabilities(metadata, '');
      objects.push(...computeObjects);
      sections.computing = { count: computeObjects.length, sources: ['metadata'] };
    }

    if (categories.includes('governance')) {
      const govObjects = this._extractGovernanceCapabilities(metadata, '');
      objects.push(...govObjects);
      sections.governance = { count: govObjects.length, sources: ['metadata'] };
    }

    if (categories.includes('socioeconomic')) {
      const socioObjects = this._extractSocioeconomicCapabilities(metadata, '');
      objects.push(...socioObjects);
      sections.socioeconomic = { count: socioObjects.length, sources: ['metadata'] };
    }

    if (categories.includes('evidence')) {
      const evidenceObjects = this._extractEvidenceCapabilities(metadata, '');
      objects.push(...evidenceObjects);
      sections.evidence = { count: evidenceObjects.length, sources: ['metadata'] };
    }

    if (categories.includes('action')) {
      const actionObjects = this._extractActionCapabilities(metadata, '');
      objects.push(...actionObjects);
      sections.action = { count: actionObjects.length, sources: ['metadata'] };
    }

    return { objects, sections };
  }

  /**
   * Sync version of world objects extraction
   */
  _extractWorldObjectsSync(metadata, admissionResult) {
    const objects = [];
    const sections = {};
    const categories = admissionResult.activatedCategories || [];

    if (categories.includes('earth-object')) {
      const earthObjects = this._extractEarthObjects(metadata);
      objects.push(...earthObjects);
      sections.earthObjects = { count: earthObjects.length };
    }

    if (categories.includes('earth-variable')) {
      const variables = this._extractEarthVariables(metadata);
      objects.push(...variables);
      sections.earthVariables = { count: variables.length };
    }

    if (categories.includes('hazard')) {
      const hazards = this._extractHazards(metadata);
      objects.push(...hazards);
      sections.hazards = { count: hazards.length };
    }

    if (categories.includes('risk')) {
      const risks = this._extractRisks(metadata);
      objects.push(...risks);
      sections.risks = { count: risks.length };
    }

    if (categories.includes('model-output')) {
      const outputs = this._extractModelOutputs(metadata);
      objects.push(...outputs);
      sections.modelOutputs = { count: outputs.length };
    }

    return { objects, sections };
  }

  /**
   * Sync version of evidence extraction
   */
  _extractEvidenceSync(metadata, admissionResult) {
    const objects = [];
    const sections = {};

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
   * Phase 2: Extract using LLM with activated ontology
   */
  async _extractWithLLM(input, content, admissionResult) {
    if (!this.llm) return null;

    // Get activated ontology subset for LLM
    const activatedOntology = this.ontologyActivator.getActivatedOntology(admissionResult);

    // Build extraction prompt
    const prompt = this.ontologyActivator.generateExtractionPrompt(admissionResult, content);

    // Prepare LLM call
    const systemPrompt = `You are a Digital Earth knowledge extraction system. Extract structured objects from the source text according to the provided ontology.

IMPORTANT:
- Only extract objects explicitly mentioned in the text
- Include provenance information (sourceText: the exact text span that mentions this object)
- Assign confidence scores (0-1) based on how clearly the object is defined
- Validate entity types against the provided list
- Return valid JSON only`;

    const userPrompt = `${prompt}

## Source Text
${content.text?.substring(0, 15000) || 'No text available'}

Return JSON with this structure:
{
  "capabilityObjects": [
    {
      "type": "Dataset|Model|Sensor|...",
      "attributes": { "name": "...", ... },
      "confidence": 0.9,
      "provenance": { "section": "methods", "sourceText": "..." }
    }
  ],
  "worldObjects": [
    {
      "type": "Basin|Region|EarthVariable|...",
      "attributes": { "name": "...", ... },
      "confidence": 0.85,
      "provenance": { "section": "study_area", "sourceText": "..." }
    }
  ],
  "evidenceObjects": [
    {
      "type": "Claim|Evidence",
      "attributes": { "statement": "...", "confidence": 0.9 },
      "provenance": { "section": "results", "sourceText": "..." }
    }
  ],
  "bridgeRelations": [
    {
      "type": "covers|simulates|observes|...",
      "from": "entity-name-1",
      "to": "entity-name-2",
      "confidence": 0.8,
      "provenance": { "sourceText": "..." }
    }
  ]
}`;

    try {
      const response = await this.llm.chat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: 0.1,
        max_tokens: 4000
      });

      // Parse LLM response
      const responseText = response.choices?.[0]?.message?.content || response.content || '';
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in LLM response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Add IDs to objects
      const result = {
        capabilityObjects: (parsed.capabilityObjects || []).map(obj => ({
          ...obj,
          id: this._generateId(obj.type, obj.attributes?.name),
          layer: 'capability',
          extractionSource: 'llm'
        })),
        worldObjects: (parsed.worldObjects || []).map(obj => ({
          ...obj,
          id: this._generateId(obj.type, obj.attributes?.name),
          layer: 'world',
          extractionSource: 'llm'
        })),
        evidenceObjects: (parsed.evidenceObjects || []).map(obj => ({
          ...obj,
          id: this._generateId(obj.type, obj.attributes?.statement?.substring(0, 30)),
          layer: 'foundation',
          extractionSource: 'llm'
        })),
        bridgeRelations: parsed.bridgeRelations || [],
        sections: { llm: true }
      };

      return result;

    } catch (error) {
      console.error('LLM extraction failed:', error.message);
      throw error;
    }
  }

  /**
   * Merge metadata and LLM extraction results
   */
  _mergeExtractions(metadataResult, llmResult, admissionResult) {
    const result = {
      capabilityObjects: [],
      worldObjects: [],
      evidenceObjects: [],
      sections: {},
      strategy: llmResult ? 'llm-primary' : 'metadata-only'
    };

    if (!llmResult) {
      // No LLM result, use metadata only
      return {
        ...metadataResult,
        strategy: 'metadata-only'
      };
    }

    // Merge capability objects (LLM takes precedence, but keep unique metadata objects)
    const capabilityByName = new Map();

    // Add LLM objects first (higher priority)
    for (const obj of llmResult.capabilityObjects || []) {
      const key = obj.attributes?.name?.toLowerCase() || obj.id;
      if (key) capabilityByName.set(key, obj);
    }

    // Add metadata objects that aren't in LLM results
    for (const obj of metadataResult.capabilityObjects || []) {
      const key = obj.attributes?.name?.toLowerCase();
      if (key && !capabilityByName.has(key)) {
        obj.extractionSource = 'metadata';
        capabilityByName.set(key, obj);
      }
    }

    result.capabilityObjects = Array.from(capabilityByName.values());

    // Merge world objects
    const worldByName = new Map();
    for (const obj of llmResult.worldObjects || []) {
      const key = obj.attributes?.name?.toLowerCase() || obj.id;
      if (key) worldByName.set(key, obj);
    }
    for (const obj of metadataResult.worldObjects || []) {
      const key = obj.attributes?.name?.toLowerCase();
      if (key && !worldByName.has(key)) {
        obj.extractionSource = 'metadata';
        worldByName.set(key, obj);
      }
    }
    result.worldObjects = Array.from(worldByName.values());

    // Merge evidence objects
    const evidenceByKey = new Map();
    for (const obj of llmResult.evidenceObjects || []) {
      const key = obj.attributes?.statement?.substring(0, 50) || obj.id;
      if (key) evidenceByKey.set(key, obj);
    }
    for (const obj of metadataResult.evidenceObjects || []) {
      const key = obj.attributes?.statement?.substring(0, 50);
      if (key && !evidenceByKey.has(key)) {
        obj.extractionSource = 'metadata';
        evidenceByKey.set(key, obj);
      }
    }
    result.evidenceObjects = Array.from(evidenceByKey.values());

    // Merge sections
    result.sections = {
      ...metadataResult.sections,
      llmExtracted: true
    };

    return result;
  }

  /**
   * Validate all objects against ontology
   */
  _validateObjects(result) {
    const validate = (objects, label) => {
      for (const obj of objects) {
        try {
          ontology.validateEntityType(obj.type);
        } catch (err) {
          // Mark as invalid but don't remove
          obj.validationWarning = `Unknown type: ${obj.type}`;
        }

        // Ensure required fields
        if (!obj.id) {
          obj.id = this._generateId(obj.type, obj.attributes?.name || 'unknown');
        }
        if (!obj.provenance) {
          obj.provenance = { section: 'unknown' };
        }
        if (!obj.confidence) {
          obj.confidence = 0.7;
        }
      }
    };

    validate(result.capabilityObjects, 'capability');
    validate(result.worldObjects, 'world');
    validate(result.evidenceObjects, 'evidence');
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
        id: this._generateId('api', metadata.name || 'api'),
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
   *
   * IMPORTANT: These are "inferred fallback" relations based on type patterns.
   * They should be superseded by LLM-extracted semantic relations when available.
   *
   * The relations generated here are marked as:
   * - inferenceMethod: 'type-pattern' (vs 'llm-semantic')
   * - confidence: typically 0.5-0.7 (lower than LLM-extracted)
   */
  _buildBridgeRelations(capabilityObjects, worldObjects, evidenceObjects) {
    const relations = [];

    // Skip if no objects to bridge
    if (capabilityObjects.length === 0 && evidenceObjects.length === 0) {
      return relations;
    }

    // Dataset → Region coverage (INFERRED)
    // Only create if no LLM-extracted relations exist
    for (const cap of capabilityObjects) {
      if (cap.type === 'Dataset' && cap.extractionSource !== 'llm') {
        for (const world of worldObjects) {
          if (['Basin', 'Region', 'Watershed', 'Glacier', 'Lake'].includes(world.type)) {
            relations.push({
              type: 'covers',
              from: cap.id,
              to: world.id,
              confidence: 0.6,
              inferenceMethod: 'type-pattern',
              provenance: this._createProvenance('spatial', null, {
                note: 'Inferred from Dataset + Region type proximity. Verify with source text.'
              })
            });
          }
        }
      }

      // Model → Basin simulation (INFERRED)
      if (cap.type === 'Model' && cap.extractionSource !== 'llm') {
        for (const world of worldObjects) {
          if (['Basin', 'Watershed', 'River'].includes(world.type)) {
            relations.push({
              type: 'simulates',
              from: cap.id,
              to: world.id,
              confidence: 0.65,
              inferenceMethod: 'type-pattern',
              provenance: this._createProvenance('methods', null, {
                note: 'Inferred from Model + Basin proximity. Check if model actually simulates this basin.'
              })
            });
          }
        }
      }

      // Sensor/Satellite → Variable observation (INFERRED)
      if (['Satellite', 'Sensor', 'Gauge'].includes(cap.type) && cap.extractionSource !== 'llm') {
        for (const world of worldObjects) {
          if (world.type === 'EarthVariable') {
            relations.push({
              type: 'observes',
              from: cap.id,
              to: world.id,
              confidence: 0.65,
              inferenceMethod: 'type-pattern',
              provenance: this._createProvenance('methods', null, {
                note: 'Inferred observation relation. Verify with source text.'
              })
            });
          }
        }
      }

      // Intervention → Risk reduction (INFERRED)
      if (['Intervention', 'AdaptationMeasure', 'MitigationMeasure'].includes(cap.type)) {
        for (const world of worldObjects) {
          if (world.type === 'EarthRisk' || world.type === 'FloodRisk' || world.type === 'DroughtRisk') {
            relations.push({
              type: 'mitigates',
              from: cap.id,
              to: world.id,
              confidence: 0.55,
              inferenceMethod: 'type-pattern',
              provenance: this._createProvenance('discussion', null, {
                note: 'Inferred mitigation relation. Check if intervention specifically addresses this risk.'
              })
            });
          }
        }
      }
    }

    // Evidence → World Object support (INFERRED)
    for (const ev of evidenceObjects) {
      if (ev.type === 'Evidence' && ev.extractionSource !== 'llm') {
        for (const world of worldObjects) {
          if (['Hazard', 'EarthVariable', 'EarthRisk'].includes(world.type)) {
            relations.push({
              type: 'supports',
              from: ev.id,
              to: world.id,
              confidence: ev.metadata?.strength || 0.6,
              inferenceMethod: 'type-pattern',
              provenance: this._createProvenance(ev.provenance?.section, ev.provenance?.sourceText, {
                note: 'Inferred support relation. Verify evidence-world connection in source.'
              })
            });
          }
        }
      }
    }

    return relations;
  }

  /**
   * Create enhanced provenance object with span and verification support
   * @param {string} section - Section of source (e.g., 'methods', 'results')
   * @param {string} sourceText - The text span from source
   * @param {Object} options - Additional provenance options
   * @returns {Object} Provenance object
   */
  _createProvenance(section, sourceText = null, options = {}) {
    const provenance = {
      section: section || 'unknown',
      extractedAt: new Date().toISOString(),
      verificationStatus: 'unverified', // 'unverified', 'verified', 'disputed'
      evidenceStrength: options.evidenceStrength || 'moderate' // 'strong', 'moderate', 'weak', 'inferred'
    };

    // Add source text span if provided
    if (sourceText) {
      provenance.sourceText = sourceText;
      provenance.spanLength = sourceText.length;
    }

    // Add optional fields
    if (options.note) {
      provenance.note = options.note;
    }

    if (options.spanStart !== undefined) {
      provenance.spanStart = options.spanStart;
    }

    if (options.spanEnd !== undefined) {
      provenance.spanEnd = options.spanEnd;
    }

    if (options.sectionTitle) {
      provenance.sectionTitle = options.sectionTitle;
    }

    if (options.pageNumber) {
      provenance.pageNumber = options.pageNumber;
    }

    if (options.url) {
      provenance.url = options.url;
    }

    return provenance;
  }

  /**
   * Find text span in source text
   * @param {string} sourceText - Full source text
   * @param {string} searchText - Text to find
   * @returns {Object|null} Span info with start/end positions
   */
  _findTextSpan(sourceText, searchText) {
    if (!sourceText || !searchText) return null;

    const index = sourceText.indexOf(searchText);
    if (index === -1) return null;

    return {
      spanStart: index,
      spanEnd: index + searchText.length,
      spanLength: searchText.length,
      context: sourceText.substring(Math.max(0, index - 50), Math.min(sourceText.length, index + searchText.length + 50))
    };
  }

  /**
   * Update provenance with verification status
   * @param {Object} provenance - Provenance object to update
   * @param {string} status - 'verified', 'disputed', or 'unverified'
   * @param {string} verifiedBy - Who verified it
   * @param {string} notes - Verification notes
   */
  _updateVerificationStatus(provenance, status, verifiedBy = null, notes = null) {
    if (!provenance) return;

    provenance.verificationStatus = status;
    provenance.verifiedAt = new Date().toISOString();

    if (verifiedBy) {
      provenance.verifiedBy = verifiedBy;
    }

    if (notes) {
      provenance.verificationNotes = notes;
    }
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
