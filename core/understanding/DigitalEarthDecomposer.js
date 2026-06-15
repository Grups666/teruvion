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
const SectionParser = require('./SectionParser');
const { validateRelation, getValidRelations, getConfidenceCap, BRIDGE_RELATION_SEMANTICS } = require('../registry/ontology/relation-semantics');
const { assessSourceObjectGraphQuality } = require('../quality/SourceObjectGraphQuality');
const { parseLLMJson } = require('../utils/llm-json');

const CAPABILITY_EXTRACTION_PROTOCOL = [
  { category: 'data', method: '_extractDataCapabilities', section: 'data', syncSources: ['metadata'], fullSources: ['metadata', 'text'] },
  { category: 'observation', method: '_extractObservationCapabilities', section: 'observation', syncSources: ['metadata'], fullSources: ['text'] },
  { category: 'modeling', method: '_extractModelingCapabilities', section: 'modeling', syncSources: ['metadata'], fullSources: ['text', 'metadata'] },
  { category: 'computing', method: '_extractComputingCapabilities', section: 'computing', syncSources: ['metadata'], fullSources: ['metadata'] },
  { category: 'governance', method: '_extractGovernanceCapabilities', section: 'governance', syncSources: ['metadata'], fullSources: ['text'] },
  { category: 'socioeconomic', method: '_extractSocioeconomicCapabilities', section: 'socioeconomic', syncSources: ['metadata'], fullSources: ['text'] },
  { category: 'evidence', method: '_extractEvidenceCapabilities', section: 'evidence', syncSources: ['metadata'], fullSources: ['results', 'discussion'] },
  { category: 'action', method: '_extractActionCapabilities', section: 'action', syncSources: ['metadata'], fullSources: ['text'] }
];

const WORLD_EXTRACTION_PROTOCOL = [
  { category: 'earth-object', method: '_extractEarthObjects', section: 'earthObjects' },
  { category: 'earth-variable', method: '_extractEarthVariables', section: 'earthVariables' },
  { category: 'hazard', method: '_extractHazards', section: 'hazards' },
  { category: 'risk', method: '_extractRisks', section: 'risks' },
  { category: 'model-output', method: '_extractModelOutputs', section: 'modelOutputs' }
];

const WORKFLOW_STAGE_DEFINITIONS = {
  data: {
    key: 'data',
    label: 'Data',
    order: 10,
    fallbackSummary: 'Input data, variables, observations, or resource material used by the research route.'
  },
  method: {
    key: 'method',
    label: 'Method',
    order: 20,
    fallbackSummary: 'Method, model, algorithm, or analytical step used to transform source material.'
  },
  execution: {
    key: 'execution',
    label: 'Workflow',
    order: 30,
    fallbackSummary: 'Procedural workflow or executable route connecting data, methods, and outputs.'
  },
  resource: {
    key: 'resource',
    label: 'Resource',
    order: 35,
    fallbackSummary: 'Reusable research resource extracted from the source.'
  },
  context: {
    key: 'context',
    label: 'Context',
    order: 40,
    fallbackSummary: 'Spatial, temporal, hazard, risk, or Earth-system context interpreted by the research route.'
  },
  evidence: {
    key: 'evidence',
    label: 'Evidence',
    order: 50,
    fallbackSummary: 'Claim, result, figure, table, or evidence item used to review the research route.'
  }
};

const WORKFLOW_STAGE_BY_CATEGORY = {
  data: 'data',
  observation: 'data',
  'earth-variable': 'data',
  modeling: 'method',
  method: 'method',
  computing: 'execution',
  workflow: 'execution',
  process: 'execution',
  resource: 'resource',
  platform: 'resource',
  dependency: 'resource',
  code: 'resource',
  technical: 'resource',
  'earth-system': 'context',
  'earth-object': 'context',
  spatial: 'context',
  system: 'context',
  hazard: 'context',
  risk: 'context',
  exposure: 'context',
  infrastructure: 'context',
  'human-activity': 'context',
  scenario: 'context',
  'model-output': 'evidence',
  evidence: 'evidence',
  knowledge: 'evidence',
  feedback: 'evidence'
};

const TYPE_RESOLUTION_PROTOCOLS = {
  region: {
    fallback: 'Region',
    suffixes: [],
    categories: new Set(['earth-object', 'spatial'])
  },
  hazard: {
    fallback: 'Hazard',
    suffixes: ['Event'],
    categories: new Set(['hazard'])
  },
  intervention: {
    fallback: 'Intervention',
    suffixes: [],
    categories: new Set(['action']),
    parent: 'Intervention'
  }
};

const DEEP_DECOMPOSITION_AGENT_TASK = 'source-to-object-graph-decomposition';
const DEEP_DECOMPOSITION_SCHEMA_VERSION = 'source-object-graph-v1';

class DigitalEarthDecomposer {
  constructor(llm, options = {}) {
    this.llm = llm;
    this.options = {
      maxRetries: options.maxRetries || 2,
      confidenceThreshold: options.confidenceThreshold || 0.6,
      useLLM: options.useLLM !== false, // Default to true
      maxChunkSize: options.maxChunkSize || 8000,
      maxLLMChunks: options.maxLLMChunks || 6,
      llmTimeout: options.llmTimeout || 45000,
      deepExtractionTimeout: options.deepExtractionTimeout || Math.max(options.llmTimeout || 0, 300000),
      maxAgentSourceChars: options.maxAgentSourceChars || 28000,
      // Fallback bridge relations are disabled by default
      // LLM-extracted relations are preferred
      allowFallbackBridgeRelations: options.allowFallbackBridgeRelations || false,
      ...options
    };
    this.ontologyActivator = new DynamicOntologyActivation();
    this.sectionParser = new SectionParser();
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
    const normalizedSourceType = this._normalizeSourceType(admissionResult.sourceType);
    const normalizedAdmissionResult = {
      ...admissionResult,
      sourceType: normalizedSourceType
    };

    // Initialize result structure
    const result = {
      input,
      sourceType: normalizedSourceType,
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

      // Claim/figure/resource graph for source-grounded review.
      evidenceGraph: null,

      // Reusable resource graph for code/data/source investigation.
      resourceGraph: null,

      // Integrity report for lossy extraction, filtering, and validation issues.
      extractionIntegrity: null,

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
      result.sourceObject = this._createSourceObject(input, content, normalizedAdmissionResult);

      // Step 2: Phase 1 - Metadata-driven extraction
      const metadataResult = this._extractFromMetadata(content, normalizedAdmissionResult);
      result.extractionMetadata.metadataExtraction = {
        capabilityCount: metadataResult.capabilityObjects.length,
        worldCount: metadataResult.worldObjects.length,
        evidenceCount: metadataResult.evidenceObjects.length
      };

      // Step 3: Phase 2 - LLM-assisted extraction (if LLM available and text exists)
      let llmResult = null;
      const sourceText = this._getSourceText(content);
      const textFallbackResult = this._extractFromSourceText(content, normalizedAdmissionResult);
      result.extractionMetadata.textFallbackExtraction = {
        capabilityCount: textFallbackResult.capabilityObjects.length,
        worldCount: textFallbackResult.worldObjects.length,
        evidenceCount: textFallbackResult.evidenceObjects.length,
        relationCount: textFallbackResult.bridgeRelations.length
      };
      if (this.options.useLLM && this.llm && sourceText.length > 100) {
        try {
          const rawLLMResult = await this._extractWithLLM(input, content, normalizedAdmissionResult);
          llmResult = rawLLMResult;
          if (!this._hasExtractionObjects(rawLLMResult) && !this._hasResearchRoute(rawLLMResult?.researchRoute) && !this._hasLLMInsights(rawLLMResult?.llmInsights)) {
            llmResult = null;
          }
          result.extractionMetadata.llmExtraction = {
            capabilityCount: llmResult?.capabilityObjects?.length || 0,
            worldCount: llmResult?.worldObjects?.length || 0,
            evidenceCount: llmResult?.evidenceObjects?.length || 0,
            relationCount: llmResult?.bridgeRelations?.length || 0,
            routeNodeCount: llmResult?.researchRoute?.nodes?.length || 0,
            keyFindingCount: rawLLMResult?.llmInsights?.keyFindings?.length || 0,
            researchGapCount: rawLLMResult?.llmInsights?.researchGaps?.length || 0,
            figureAnalysisCount: rawLLMResult?.llmInsights?.figureAnalyses?.length || 0,
            resourceLinkCount: rawLLMResult?.llmInsights?.resourceLinks?.length || 0,
            agentTask: rawLLMResult?.agentTask || DEEP_DECOMPOSITION_AGENT_TASK,
            schemaVersion: rawLLMResult?.schemaVersion || DEEP_DECOMPOSITION_SCHEMA_VERSION,
            agentProvider: rawLLMResult?.agentRuns?.[0]?.provider || rawLLMResult?.agent?.provider || this.llm?.getAgentStatus?.()?.provider || 'api',
            agentRuns: rawLLMResult?.agentRuns || [],
            schemaWarnings: rawLLMResult?.schemaWarnings || [],
            requestErrors: rawLLMResult?.requestErrors || [],
            success: Boolean(llmResult)
          };
        } catch (llmError) {
          result.extractionMetadata.llmExtraction = {
            success: false,
            error: llmError.message
          };
        }
      }

      // Step 4: Merge results (LLM takes precedence, metadata as fallback)
      const merged = this._mergeExtractions(metadataResult, llmResult, normalizedAdmissionResult, textFallbackResult);
      const scopeFiltering = this._filterOutOfScopeExtraction(merged);
      result.capabilityObjects = merged.capabilityObjects;
      result.worldObjects = merged.worldObjects;
      result.evidenceObjects = merged.evidenceObjects;
      result.llmInsights = merged.llmInsights || this._emptyLLMInsights();
      result.extractionMetadata.mergeStrategy = merged.strategy;
      result.extractionMetadata.scopeFiltering = scopeFiltering;
      result.extractionMetadata.researchRoute = merged.researchRoute
        ? {
            source: merged.researchRoute.provenance?.method || 'llm-research-route',
            nodeCount: merged.researchRoute.nodes.length,
            edgeCount: merged.researchRoute.edges.length
          }
        : { source: 'protocol-fallback', nodeCount: 0, edgeCount: 0 };

      // Update provenance
      result.provenance.sections = merged.sections;
      result.provenance.extractionMethod = llmResult
        ? 'hybrid'
        : (this._hasExtractionObjects(textFallbackResult) ? 'source-text-fallback' : 'metadata');

      // Step 5: Build bridge relations
      if (depth === 'deep' || depth === 'structured') {
        // First, collect LLM-extracted relations from merge result
        const llmRelations = merged.bridgeRelations || [];

        // Only build fallback relations if explicitly allowed
        // Default is disabled — LLM should provide semantic relations
        let inferredRelations = [];
        if (this.options.allowFallbackBridgeRelations) {
          inferredRelations = this._buildBridgeRelations(
            result.capabilityObjects,
            result.worldObjects,
            result.evidenceObjects,
            llmRelations // Pass LLM relations to avoid duplicates
          );
        }

        // Combine: LLM relations first (higher priority), then inferred
        result.bridgeRelations = this._validateAndMergeBridgeRelations(llmRelations, inferredRelations);
      }

      // Step 6: Validate all objects against ontology
      this._validateObjects(result);

      // Step 7: Validate provenance (source text verification)
      this._validateProvenance(result, sourceText);

      // Calculate overall confidence
      result.confidence = this._calculateConfidence(result);
      result.workflowOutline = merged.researchRoute || this._buildWorkflowOutline(result, content);
      const routeQuality = this._assessResearchRouteQuality(result.workflowOutline);
      if (result.workflowOutline?.provenance) {
        result.workflowOutline.provenance.routeQuality = routeQuality;
      }
      result.extractionMetadata.researchRoute = {
        ...(result.extractionMetadata.researchRoute || {}),
        source: result.workflowOutline?.provenance?.method || result.extractionMetadata.researchRoute?.source || 'protocol-fallback',
        nodeCount: result.workflowOutline?.nodes?.length || 0,
        edgeCount: result.workflowOutline?.edges?.length || 0,
        quality: routeQuality.level,
        contentNodeCount: routeQuality.contentNodeCount,
        stageCount: routeQuality.stageCount,
        reasons: routeQuality.reasons
      };
      result.visualEvidence = this._extractVisualEvidence(content, result);
      result.externalResources = this._extractExternalResources(result, content);
      result.resourceGraph = this._buildResourceGraph(result, content);
      result.evidenceGraph = this._buildEvidenceGraph(result, content);
      result.researchBrief = this._buildResearchBrief(result, content, normalizedAdmissionResult);
      result.extractionIntegrity = this._buildExtractionIntegrity(result, content);
      result.inferredLimitations = this._buildInferredLimitations(result);
      result.inferredLimitations = await this._buildCriticalLimitations(result, content, result.inferredLimitations);

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
    if (new Set(admissionResult.activatedOntologyLayers || []).has('world')) {
      const worldObjects = this._extractWorldObjectsSync(metadata, admissionResult);
      result.worldObjects = worldObjects.objects;
      result.sections.worldObjects = worldObjects.sections;
    }

    if (Array.isArray(metadata.geoFeatures) && metadata.geoFeatures.length > 0 && result.worldObjects.length === 0) {
      result.worldObjects = this._extractEarthObjects({ geoFeatures: metadata.geoFeatures });
      result.sections.worldObjects = {
        explicitGeoFeatures: 'Connector-provided GeoJSON features preserved as spatial objects.'
      };
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
   * Source-text fallback used when LLM extraction is unavailable or empty.
   * This does not infer hidden semantics. It creates low-confidence objects from
   * explicit scholarly sections so the UI can still expose inspectable research
   * structure instead of collapsing to a title-only object.
   */
  _extractFromSourceText(content, admissionResult) {
    const result = {
      capabilityObjects: [],
      worldObjects: [],
      evidenceObjects: [],
      bridgeRelations: [],
      sections: {}
    };

    const sourceText = this._getSourceText(content);
    const sections = this._normalizedSectionMap(content, admissionResult.sourceType);
    const metadata = content.metadata || {};

    if (!sourceText || sourceText.length < 100) {
      return result;
    }

    const methodSection = this._findSectionByRole(sections, ['method', 'model', 'experiment', 'algorithm']);
    if (methodSection) {
      const name = this._humanizeSectionTitle(methodSection.key, 'Source-described method');
      result.capabilityObjects.push(this._createSourceTextObject({
        type: methodSection.key.includes('model') ? 'Model' : 'Method',
        idPrefix: methodSection.key.includes('model') ? 'model' : 'method',
        name,
        description: this._firstSentence(methodSection.text),
        section: methodSection.key,
        sourceText: this._shortSourceText(methodSection.text),
        role: 'method'
      }));
      result.sections.methodFallback = { count: 1, section: methodSection.key };
    }

    const dataSection = this._findSectionByRole(sections, ['data availability', 'input data', 'data', 'dataset']);
    if (dataSection) {
      const datasetName = this._extractFirstUrl(dataSection.text)
        || this._humanizeSectionTitle(dataSection.key, 'Source-described dataset');
      result.capabilityObjects.push(this._createSourceTextObject({
        type: 'Dataset',
        idPrefix: 'dataset',
        name: datasetName,
        description: this._firstSentence(dataSection.text),
        section: dataSection.key,
        sourceText: this._shortSourceText(dataSection.text),
        role: 'data'
      }));
      result.sections.dataFallback = { count: 1, section: dataSection.key };
    }

    const workflowSection = this._findSectionByRole(sections, ['workflow', 'experiment', 'methods']);
    if (workflowSection) {
      const workflowName = `${metadata.title || content.title || 'Source-described'} workflow`;
      result.capabilityObjects.push(this._createSourceTextObject({
        type: 'Workflow',
        idPrefix: 'workflow',
        name: workflowName,
        description: this._firstSentence(workflowSection.text),
        section: workflowSection.key,
        sourceText: this._shortSourceText(workflowSection.text),
        role: 'workflow'
      }));
      result.sections.workflowFallback = { count: 1, section: workflowSection.key };
    }

    const abstractSection = this._findSectionByRole(sections, ['abstract']) || { key: 'abstract', text: metadata.abstract || content.abstract || '' };
    if (abstractSection.text) {
      const claimText = this._selectClaimSentence(abstractSection.text);
      if (claimText) {
        result.evidenceObjects.push(this._createExtractedObject({
          type: 'Claim',
          idPrefix: 'claim',
          idSeed: claimText.substring(0, 80),
          attributes: {
            statement: claimText,
            type: 'source-stated-summary'
          },
          metadata: {
            sourceDerived: true,
            confidence: 0.5
          },
          provenance: this._createProvenance(abstractSection.key, claimText, {
            evidenceStrength: 'weak',
            note: 'Source-text fallback claim. Review before treating as a verified conclusion.'
          })
        }));
        result.sections.claimFallback = { count: 1, section: abstractSection.key };
      }

      if (this._hasScopeSignal(abstractSection.text, metadata.title || content.title || '')) {
        result.worldObjects.push(this._createExtractedObject({
          type: 'Region',
          idPrefix: 'region',
          idSeed: 'global-scope',
          attributes: {
            name: 'Global scope',
            type: 'global',
            description: 'The source explicitly describes a global study or system scope.'
          },
          metadata: {
            sourceDerived: true,
            confidence: 0.45
          },
          provenance: this._createProvenance(abstractSection.key, this._shortSourceText(abstractSection.text), {
            evidenceStrength: 'weak',
            note: 'Scope object derived from explicit source wording; no precise geometry is available.'
          })
        }));
        result.sections.scopeFallback = { count: 1, section: abstractSection.key };
      }
    }

    const eventLocation = this._extractEventLocationFallback(content, admissionResult, sourceText);
    if (eventLocation) {
      result.worldObjects.push(this._createExtractedObject({
        type: eventLocation.eventType,
        idPrefix: 'event',
        idSeed: eventLocation.name,
        attributes: {
          name: eventLocation.name,
          locationName: eventLocation.locationName,
          location: eventLocation.locationName,
          description: eventLocation.description,
          displayPrimitive: 'point-layer'
        },
        metadata: {
          sourceDerived: true,
          confidence: 0.46,
          reviewState: 'needs-review'
        },
        provenance: this._createProvenance(eventLocation.section, eventLocation.sourceText, {
          evidenceStrength: 'weak',
          note: 'Event location fallback derived from explicit source/admission text; geocoding remains reviewable.'
        })
      }));
      result.sections.eventLocationFallback = { count: 1, section: eventLocation.section };
    }

    const evidenceSection = this._findSectionByRole(sections, [
      'results',
      'result',
      'key findings',
      'findings',
      'impact details',
      'impact',
      'overall performance',
      'temperature records',
      'future risks',
      'current status',
      'assessment'
    ]);
    if (evidenceSection) {
      const evidenceClaim = this._selectClaimSentence(evidenceSection.text);
      const alreadyExtracted = evidenceClaim && result.evidenceObjects.some(object => {
        const statement = object.attributes?.statement || '';
        return this._textOverlapScore(statement, evidenceClaim) > 0.8;
      });
      if (evidenceClaim && !alreadyExtracted) {
        result.evidenceObjects.push(this._createExtractedObject({
          type: 'Claim',
          idPrefix: 'claim',
          idSeed: evidenceClaim.substring(0, 80),
          attributes: {
            statement: evidenceClaim,
            type: 'source-stated-evidence'
          },
          metadata: {
            sourceDerived: true,
            confidence: 0.5
          },
          provenance: this._createProvenance(evidenceSection.key, evidenceClaim, {
            evidenceStrength: 'weak',
            note: 'Source-text fallback evidence. Review before treating as a verified conclusion.'
          })
        }));
        result.sections.evidenceFallback = { count: 1, section: evidenceSection.key };
      }
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

    this._runCategoryExtractionProtocol({
      protocol: CAPABILITY_EXTRACTION_PROTOCOL,
      categories,
      metadata,
      text: '',
      sourceMode: 'syncSources',
      objects,
      sections
    });

    return { objects, sections };
  }

  /**
   * Sync version of world objects extraction
   */
  _extractWorldObjectsSync(metadata, admissionResult) {
    const objects = [];
    const sections = {};
    const categories = admissionResult.activatedCategories || [];

    this._runCategoryExtractionProtocol({
      protocol: WORLD_EXTRACTION_PROTOCOL,
      categories,
      metadata,
      objects,
      sections
    });

    return { objects, sections };
  }

  _runCategoryExtractionProtocol({ protocol, categories, metadata, text, sourceMode, objects, sections }) {
    const activeCategories = new Set(categories || []);

    for (const step of protocol) {
      if (!activeCategories.has(step.category)) continue;

      const extractor = this[step.method];
      if (typeof extractor !== 'function') {
        throw new Error(`Missing extractor method: ${step.method}`);
      }

      const extracted = text === undefined
        ? extractor.call(this, metadata)
        : extractor.call(this, metadata, text);

      objects.push(...extracted);

      const section = {
        count: extracted.length
      };

      const sources = sourceMode ? step[sourceMode] : null;
      if (sources) {
        section.sources = sources;
      }

      sections[step.section] = section;
    }
  }

  _createExtractedObject({ type, idPrefix, idSeed, attributes = {}, metadata = {}, confidence, provenance = {} }) {
    return {
      type,
      id: this._generateId(idPrefix || type, idSeed || attributes.name || type),
      attributes,
      metadata: {
        ...metadata,
        confidence: confidence ?? metadata.confidence ?? 0.8
      },
      provenance
    };
  }

  _resolveOntologyEntityType(rawType, protocolName) {
    const protocol = TYPE_RESOLUTION_PROTOCOLS[protocolName];
    if (!protocol) {
      throw new Error(`Unknown type resolution protocol: ${protocolName}`);
    }

    const candidates = this._buildTypeCandidates(rawType, protocol);
    for (const candidate of candidates) {
      const schema = ontology.getEntitySchema(candidate);
      if (!schema) continue;

      if (protocol.categories && !protocol.categories.has(schema.category)) continue;
      if (protocol.parent && !this._isTypeOrSubtype(candidate, protocol.parent)) continue;

      return candidate;
    }

    return protocol.fallback;
  }

  _buildTypeCandidates(rawType, protocol) {
    const base = this._canonicalTypeCandidate(rawType || protocol.fallback);
    const candidates = [base];

    for (const suffix of protocol.suffixes || []) {
      candidates.push(`${base}${suffix}`);
    }

    candidates.push(protocol.fallback);
    return [...new Set(candidates.filter(Boolean))];
  }

  _canonicalTypeCandidate(value) {
    if (typeof value !== 'string') return null;
    const parts = [];
    let current = '';

    for (const char of value) {
      const code = char.charCodeAt(0);
      const isDigit = code >= 48 && code <= 57;
      const isUpper = code >= 65 && code <= 90;
      const isLower = code >= 97 && code <= 122;
      if (isDigit || isUpper || isLower) {
        current += char;
      } else if (current) {
        parts.push(current);
        current = '';
      }
    }

    if (current) {
      parts.push(current);
    }

    if (parts.length === 0) return null;

    return parts
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
  }

  _isTypeOrSubtype(type, parentType) {
    return new Set(ontology.getTypeHierarchy(type)).has(parentType);
  }

  /**
   * Sync version of evidence extraction
   */
  _extractEvidenceSync(metadata, admissionResult) {
    return this._extractEvidenceObjectsFromMetadata(metadata);
  }

  _compactAgentSystemPrompt() {
    return [
      'You are a source-to-object-graph extraction worker for Teruvion, not a coding assistant.',
      'Use only the supplied source text and normalized metadata. Do not inspect files, call tools, browse, or modify the repository.',
      'Extract what the source is actually about: data, variables, methods, models, workflow steps, figures, tables, findings, limitations, resources, and spatial/temporal context.',
      'The ontology is an organization layer. Do not make user-facing route nodes named Paper, Source, Connected, Global view, Evidence available, Workflow readable, or other internal Teruvion states.',
      'Preserve provenance and uncertainty. Do not fabricate evidence, citations, resources, metrics, or claims.',
      'Return JSON only. No markdown, comments, or prose outside JSON.'
    ].join('\n');
  }

  _buildCompactAgentExtractionPrompt(admissionResult, content) {
    const metadata = content?.metadata || {};
    const typeContract = ontology.getExtractionTypeContract();
    const sourceSummary = {
      sourceType: admissionResult.sourceType,
      depth: admissionResult.depth,
      primaryRole: admissionResult.primaryRole,
      activatedCategories: admissionResult.activatedCategories || [],
      activatedOntologyLayers: admissionResult.activatedOntologyLayers || [],
      title: content?.title || metadata.title || '',
      doi: metadata.doi || content?.doi || '',
      url: metadata.url || content?.url || ''
    };
    const capabilityTypes = typeContract.capabilityObjects.join('|');
    const worldTypes = typeContract.worldObjects.join('|');
    const evidenceTypes = typeContract.evidenceObjects.join('|');
    const routeTypes = typeContract.routeNodes.join('|');

    return `Task: build a low-loss, source-grounded object graph for Teruvion.

Source context:
${JSON.stringify(sourceSummary, null, 2)}

Return JSON matching source-object-graph-v1:
{
  "capabilityObjects": [
    {
      "id": "stable-id",
      "type": "${capabilityTypes}",
      "name": "Concrete source term",
      "description": "What the source says",
      "properties": {},
      "provenance": { "sourceText": "verbatim supporting text", "section": "section label" },
      "confidence": 0.0
    }
  ],
  "worldObjects": [
    {
      "id": "stable-id",
      "type": "${worldTypes}",
      "name": "Concrete source term",
      "description": "What the source says",
      "properties": {},
      "provenance": { "sourceText": "verbatim supporting text", "section": "section label" },
      "confidence": 0.0
    }
  ],
  "evidenceObjects": [
    {
      "id": "stable-id",
      "type": "${evidenceTypes}",
      "name": "Concrete source term",
      "statement": "Claim, finding, metric, limitation, or visual evidence",
      "properties": {},
      "provenance": { "sourceText": "verbatim supporting text", "section": "section label" },
      "confidence": 0.0
    }
  ],
  "bridgeRelations": [
    {
      "from": "object-id",
      "to": "object-id",
      "type": "feeds|supports|interprets|evaluates|uses|produces|measures|predicts|models|compares|limited_by|linked_to",
      "label": "short relation label",
      "provenance": { "sourceText": "verbatim supporting text", "section": "section label" },
      "confidence": 0.0
    }
  ],
  "sourceBrief": {
    "oneLine": "Dense source-grounded summary of what the source actually does",
    "keyPoints": [
      {
        "id": "brief-point-id",
        "label": "Finding|Method|Input|Gap|Limitation|Resource",
        "value": "Concrete source content",
        "detail": "Why it matters and how it connects to the route",
        "provenance": { "sourceText": "verbatim supporting text", "section": "section" },
        "support": { "routeNodeId": "node-id", "objectId": "object-id", "resourceUrl": "https://..." }
      }
    ]
  },
  "researchRoute": {
    "title": "What this source does",
    "summary": "One sentence technical/content route",
    "nodes": [
      {
        "id": "stable-id",
        "label": "Concrete data/method/model/result/resource",
        "type": "${routeTypes}",
        "stage": "data|method|execution|context|evidence|resource",
        "summary": "How this node contributes",
        "provenance": { "sourceText": "verbatim supporting text", "section": "section label" },
        "support": { "objectId": "object-id", "resourceUrl": "https://...", "evidenceId": "evidence-id" },
        "children": [
          { "label": "Specific detail", "value": "Source content", "detail": "Why it matters" }
        ]
      }
    ],
    "edges": [
      { "from": "node-id", "to": "node-id", "label": "feeds|supports|evaluates|produces|constrains|links" }
    ]
  },
  "keyFindings": [
    { "id": "finding-id", "statement": "Source-grounded finding", "provenance": { "sourceText": "verbatim text", "section": "section" }, "confidence": 0.0 }
  ],
  "researchGaps": [
    { "id": "gap-id", "statement": "Source-grounded gap or uncertainty", "provenance": { "sourceText": "verbatim text", "section": "section" }, "confidence": 0.0 }
  ],
  "limitations": [
    { "id": "limitation-id", "statement": "Source-grounded limitation", "provenance": { "sourceText": "verbatim text", "section": "section" }, "confidence": 0.0 }
  ],
  "figureAnalyses": [
    {
      "figure": "Figure/Table label",
      "caption": "caption if present",
      "interpretation": "What the visual shows",
      "howProduced": "How the visual/result was produced if stated",
      "supportedClaim": "Which claim or route node it supports",
      "provenance": { "sourceText": "caption or nearby text", "section": "section" },
      "confidence": 0.0
    }
  ],
  "resourceLinks": [
    {
      "url": "https://...",
      "resourceType": "code|data|model|documentation|external",
      "label": "source label",
      "role": "input data|code implementation|benchmark|supplement|evidence|reproducibility",
      "targetId": "object-or-route-node-id",
      "relation": "provides_input|implements|documents|supports|benchmarks|supplements",
      "provenance": { "sourceText": "verbatim text", "section": "section" },
      "confidence": 0.0
    }
  ],
  "mapVisualizationHints": [
    {
      "visualGoal": "What a map or regional visualization should help the user understand",
      "geometryRole": "regions|points|routes|raster|attachments|unknown",
      "colorBy": "field or object property to use for classification if present",
      "sizeBy": "numeric field or object property to use for point/region emphasis if present",
      "timeSeriesFields": ["fields that should be inspectable as time series if present"],
      "inspectorFocus": ["fields or concepts that should appear in the map detail panel"],
      "sourceGrounding": { "sourceText": "verbatim supporting text", "section": "section" },
      "confidence": 0.0
    }
  ]
}

Extraction quality rules:
- Prefer concrete source terms over ontology labels.
- Treat sourceBrief as the user-facing low-loss digest: summarize the real source content, not Teruvion's internal ontology state.
- For papers, capture inputs, datasets, variables, model/method architecture, evaluation design, metrics, quantitative results, figures/tables, limitations, and reusable resources when present.
- For repositories, capture architecture, entry points, dependencies, data expectations, runnable workflows, tests, docs, licenses, and limitations when present.
- For reports/news/datasets, adapt the same contract to actors, events, indicators, resources, methods, evidence, and decisions.
- Omit fields you cannot support; do not invent missing details.
- Keep node labels short but meaningful. Put details in summaries, properties, children, or evidence objects.
- Each researchRoute node should include provenance.sourceText or support to an extracted object/resource/evidence when available.
- Return only JSON.`;
  }

  /**
   * Phase 2: Extract using LLM with activated ontology
   */
  async _extractWithLLM(input, content, admissionResult) {
    if (!this.llm) return null;

    // Parse source text into sections
    const fullText = this._getSourceText(content);
    const parsedSections = this.sectionParser.parse(fullText, admissionResult.sourceType);

    // Get activated ontology subset for LLM
    const activatedOntology = this.ontologyActivator.getActivatedOntology(admissionResult);

    const agentStatus = this.llm?.getAgentStatus?.();
    const useAgentPrompt = Boolean(agentStatus?.enabled);

    // Build extraction prompt. Claude Code-style harnesses are stronger at
    // reasoning but slower to start, so keep their contract compact and
    // task-bound instead of sending the full ontology activation prompt.
    const prompt = useAgentPrompt
      ? this._buildCompactAgentExtractionPrompt(admissionResult, content)
      : this.ontologyActivator.generateExtractionPrompt(admissionResult, content);

    // Process chunks (most important sections first)
    const chunks = parsedSections.chunks;
    const allResults = [];
    const diagnosticResults = [];
    const requestErrors = [];
    let hadRequestError = false;

    // System prompt for LLM
    const systemPrompt = useAgentPrompt
      ? this._compactAgentSystemPrompt()
      : `You are a Digital Earth knowledge extraction system. Extract structured objects from the source text according to the provided ontology.

IMPORTANT:
- Only extract objects explicitly mentioned in the text
- Include provenance information with EXACT sourceText (copy verbatim from source)
- Provide spanStart if you can estimate character position
- Assign confidence scores (0-1) based on how clearly the object is defined
- Validate entity types against the provided list
- For bridgeRelations, explain the evidence in the provenance
- Also build researchRoute when the text exposes a technical route, workflow, repository architecture, or content structure
- researchRoute overview nodes must describe source content: inputs, data, variables, methods, models, processes, context, outputs, findings, limitations, or reusable resources
- Do not use container/system labels such as Paper, Source, Repository, Connected, Global view, Workflow readable, or Evidence available as overview route nodes
- researchRoute node children can describe deeper internal structure for in-panel drilldown
- Preserve content with low information loss: keep concrete data sources, variables, model architecture, parameters, evaluation design, metrics, quantitative findings, limitations, figures/tables, and reusable resources when present
- Do not extract publisher page modules such as cited-by lists, associated/recommended content, author contribution panels, metrics widgets, legal text, navigation, or advertisements
- Prefer source-grounded content over ontology labels. Ontology organizes the extraction; it is not itself the paper's content
- Return valid JSON only`;

    if (useAgentPrompt) {
      return this._extractWithAgentSourcePacket({
        prompt,
        systemPrompt,
        admissionResult,
        chunks,
        fullText
      });
    }

    // Process each chunk
    for (const chunk of chunks) {
      const chunkPrompt = `${prompt}

## Research Route Contract
If the section exposes how the source actually works, include a researchRoute object:
- nodes should be content-level units, not Teruvion system states
- useful node labels include concrete data, inputs, variables, methods, models, workflow steps, spatial/temporal context, results, claims, limitations, or reusable resources
- each node may include children for deeper drilldown inside the same graph panel
- edges should describe how one content unit feeds, supports, interprets, refines, or relates to another
- if the section does not support a real route, omit researchRoute instead of fabricating one
- when figures/tables are described, extract claim-like evidence objects and link them through bridgeRelations where source text supports the relation
- include keyFindings, researchGaps, limitations, figureAnalyses, and resourceLinks when the text supports them; these are UI recomposition hints, not independent evidence
- figureAnalyses must reference a source figure/table label or caption and explain what the visual shows, how it was produced, and what claim or route step it supports
- researchGaps and limitations must be source-grounded and include provenance or section; do not invent future work
- resourceLinks should connect a URL/resource to a route node, evidence object, figure, dataset, code, or reproducibility role when the source states the link
- mapVisualizationHints should describe how already-available source results or data fields should be recomposed into an interactive map. Do not request code execution or invent unavailable result data.
- use bridge relation vocabulary when possible: covers, observes, measures, simulates, predicts, models, has_variable, represents, mitigates, targets, responds_to, governs, assesses, supports, contradicts, applicable_to, transferable_to, limited_by

## Source Text (Section: ${chunk.sections.join(', ')})
${chunk.text}

Return JSON for this chunk. Focus on extracting objects mentioned in this section.`;

      try {
        const response = await this.llm.chat({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: chunkPrompt }
          ],
          agentTask: DEEP_DECOMPOSITION_AGENT_TASK,
          agentSchema: DEEP_DECOMPOSITION_SCHEMA_VERSION,
          agentContext: {
            sourceType: admissionResult.sourceType,
            depth: admissionResult.depth,
            sections: chunk.sections,
            chunkIndex: chunk.index
          },
          temperature: 0.1,
          max_tokens: 4000,
          timeout: this.options.deepExtractionTimeout
        });

        // Parse LLM response
        const responseText = response.choices?.[0]?.message?.content || response.content || '';
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) continue;

        const parsed = this._coerceLLMExtractionSchema(this._parseLLMJson(jsonMatch[0]));

        // Add chunk context to results
        if (this._hasExtractionObjects(parsed) || this._hasResearchRoute(parsed.researchRoute) || this._hasLLMInsights(parsed)) {
          allResults.push({
            ...parsed,
            agentInfo: response.agent || null,
            chunkInfo: {
              sections: chunk.sections,
              importance: chunk.importance,
              index: chunk.index
            }
          });
        } else if (parsed.schemaWarnings?.length || response.agent) {
          diagnosticResults.push({
            ...parsed,
            agentInfo: response.agent || null,
            chunkInfo: {
              sections: chunk.sections,
              importance: chunk.importance,
              index: chunk.index
            }
          });
        }

        // Keep enough high-importance chunks for low-loss extraction while
        // avoiding runaway agent/API cost on very long sources.
        if (allResults.length >= this.options.maxLLMChunks) break;

      } catch (error) {
        hadRequestError = true;
        requestErrors.push({
          chunkIndex: chunk.index,
          sections: chunk.sections,
          error: error.message
        });
        console.error(`LLM extraction failed for chunk ${chunk.index}:`, error.message);
        continue;
      }
    }

    // If no chunks, try full text (fallback)
    if (allResults.length === 0 && fullText.length > 0 && !hadRequestError) {
      const fallbackPrompt = `${prompt}

## Source Text
${fullText.substring(0, this.options.maxChunkSize)}

Return JSON with this structure:
{
  "capabilityObjects": [],
  "worldObjects": [],
  "evidenceObjects": [],
  "bridgeRelations": [],
  "evidenceGraph": {
    "claims": [
      { "id": "claim-id", "statement": "Source-stated finding or limitation", "supports": ["figure-or-resource-id"] }
    ]
  },
  "researchRoute": {
    "title": "Research route",
    "summary": "One sentence describing what this source does.",
    "nodes": [
      {
        "id": "short-stable-id",
        "label": "Content-level node label",
        "type": "Data|Method|Workflow|Context|Evidence|Resource",
        "stage": "data|method|execution|context|evidence|resource",
        "summary": "What this node contributes.",
        "status": "ready|review|blocked|pending",
        "children": [
          { "label": "Detail label", "value": "Specific content", "detail": "Why it matters or how it connects" }
        ]
      }
    ],
    "edges": [
      { "from": "source-node-id", "to": "target-node-id", "label": "feeds|supports|interprets|refines|relates" }
    ]
  }
}`;

      try {
        const response = await this.llm.chat({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: fallbackPrompt }
          ],
          agentTask: DEEP_DECOMPOSITION_AGENT_TASK,
          agentSchema: DEEP_DECOMPOSITION_SCHEMA_VERSION,
          agentContext: {
            sourceType: admissionResult.sourceType,
            depth: admissionResult.depth,
            fallback: true
          },
          temperature: 0.1,
          max_tokens: 4000,
          timeout: this.options.deepExtractionTimeout
        });

        const responseText = response.choices?.[0]?.message?.content || response.content || '';
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = this._coerceLLMExtractionSchema(this._parseLLMJson(jsonMatch[0]));
          if (this._hasExtractionObjects(parsed) || this._hasResearchRoute(parsed.researchRoute) || this._hasLLMInsights(parsed)) {
            allResults.push({
              ...parsed,
              agentInfo: response.agent || null
            });
          } else if (parsed.schemaWarnings?.length || response.agent) {
            diagnosticResults.push({
              ...parsed,
              agentInfo: response.agent || null
            });
          }
        }
      } catch (error) {
        requestErrors.push({
          fallback: true,
          error: error.message
        });
        console.error('LLM extraction failed (fallback):', error.message);
        throw error;
      }
    }

    // Merge all chunk results
    const mergedResult = this._mergeChunkResults([...allResults, ...diagnosticResults]);
    mergedResult.requestErrors = requestErrors;
    return mergedResult;
  }

  async _extractWithAgentSourcePacket({ prompt, systemPrompt, admissionResult, chunks, fullText }) {
    const sourcePacket = this._buildAgentSourcePacket(chunks, fullText);
    const requestErrors = [];

    const agentPrompt = `${prompt}

## Source Packet
The following packet contains prioritized sections from the source. Extract one coherent source-object graph across the packet instead of treating each section as an isolated chunk.

${sourcePacket.text}

## Source Packet Requirements
- Build one unified sourceBrief, researchRoute, object set, evidence set, resource list, and limitation/gap list for the whole source packet.
- Preserve concrete source content with low information loss: inputs, datasets, variables, methods, model architecture, evaluation design, figures/tables, metrics, quantitative findings, limitations, and reusable resources when present.
- Do not use Teruvion internal states as route nodes.
- If a detail is not present in the packet, omit it or mark it as unavailable; do not infer it from the source title alone.
- If the source exposes map-ready result data, dataset links, classified regions, points, routes, rasters, or time series, include mapVisualizationHints grounded in those fields. These hints are soft recomposition guidance; do not invent missing geometry or results.

Return JSON for the whole source packet.`;

    try {
      const response = await this.llm.chat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: agentPrompt }
        ],
        agentTask: DEEP_DECOMPOSITION_AGENT_TASK,
        agentSchema: DEEP_DECOMPOSITION_SCHEMA_VERSION,
        agentContext: {
          sourceType: admissionResult.sourceType,
          depth: admissionResult.depth,
          mode: 'source-packet',
          sections: sourcePacket.sections,
          sourcePacketChars: sourcePacket.text.length
        },
        temperature: 0.1,
        max_tokens: 6000,
        timeout: this._getDeepExtractionTimeout()
      });

      const responseText = response.choices?.[0]?.message?.content || response.content || '';
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return this._mergeChunkResults([{
          schemaWarnings: ['agent source-packet response did not contain JSON'],
          agentInfo: response.agent || null
        }]);
      }

      const parsed = this._coerceLLMExtractionSchema(this._parseLLMJson(jsonMatch[0]));
      const mergedResult = this._mergeChunkResults([{
        ...parsed,
        agentInfo: response.agent || null,
        chunkInfo: {
          sections: sourcePacket.sections,
          index: 0,
          mode: 'source-packet'
        }
      }]);
      mergedResult.requestErrors = requestErrors;
      return mergedResult;
    } catch (error) {
      requestErrors.push({
        mode: 'source-packet',
        sections: sourcePacket.sections,
        error: error.message
      });
      console.error('LLM extraction failed for source packet:', error.message);
      const mergedResult = this._mergeChunkResults([]);
      mergedResult.requestErrors = requestErrors;
      return mergedResult;
    }
  }

  _buildAgentSourcePacket(chunks = [], fullText = '') {
    const maxChars = this.options.maxAgentSourceChars;
    const selected = [];
    let usedChars = 0;

    for (const chunk of chunks) {
      const text = String(chunk.text || '').trim();
      if (!text) continue;
      const header = `\n\n### Sections: ${chunk.sections.join(', ')}\n`;
      const available = maxChars - usedChars - header.length;
      if (available <= 0) break;
      const chunkText = text.length > available
        ? `${text.slice(0, Math.max(0, available - 80)).trim()}\n[section truncated by source packet budget]`
        : text;
      selected.push({
        sections: chunk.sections,
        text: `${header}${chunkText}`
      });
      usedChars += header.length + chunkText.length;
    }

    if (selected.length === 0 && fullText) {
      selected.push({
        sections: ['source'],
        text: `\n\n### Sections: source\n${String(fullText).slice(0, maxChars)}`
      });
    }

    return {
      sections: [...new Set(selected.flatMap(item => item.sections))],
      text: selected.map(item => item.text).join('')
    };
  }

  _getDeepExtractionTimeout() {
    const agentStatus = this.llm?.getAgentStatus?.();
    const configuredAgentTimeout = Number(agentStatus?.timeout || 0);
    if (agentStatus?.enabled && configuredAgentTimeout > 0) {
      return Math.max(this.options.deepExtractionTimeout, configuredAgentTimeout);
    }
    return this.options.deepExtractionTimeout;
  }

  _parseLLMJson(rawText = '') {
    return parseLLMJson(rawText);
  }

  _coerceLLMExtractionSchema(parsed) {
    const result = (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? { ...parsed } : {};
    const warnings = [];

    const coerceArray = (field) => {
      if (result[field] === undefined || result[field] === null) {
        result[field] = [];
        return;
      }
      if (!Array.isArray(result[field])) {
        warnings.push(`${field} must be an array`);
        result[field] = [];
      }
    };

    coerceArray('capabilityObjects');
    coerceArray('worldObjects');
    coerceArray('evidenceObjects');
    coerceArray('bridgeRelations');
    coerceArray('keyFindings');
    coerceArray('researchGaps');
    coerceArray('limitations');
    coerceArray('figureAnalyses');
    coerceArray('resourceLinks');
    coerceArray('mapVisualizationHints');
    result.sourceBrief = this._coerceSourceBriefSchema(result.sourceBrief, warnings);

    const normalizeObject = (obj, field, index) => {
      if (!obj || typeof obj !== 'object') return obj;
      const resolvedType = ontology.resolveEntityType(obj.type);
      if (resolvedType.changed) {
        obj.metadata = {
          ...(obj.metadata || {}),
          originalLLMType: resolvedType.originalType
        };
        obj.type = resolvedType.type;
        warnings.push(`${field}[${index}] type resolved by ontology protocol to ${resolvedType.type}`);
      }
      if (!obj.attributes || typeof obj.attributes !== 'object' || Array.isArray(obj.attributes)) {
        obj.attributes = {};
      }
      if (obj.name && !obj.attributes.name) obj.attributes.name = obj.name;
      if (obj.description && !obj.attributes.description) obj.attributes.description = obj.description;
      if (obj.statement && !obj.attributes.statement) obj.attributes.statement = obj.statement;
      if (obj.properties && typeof obj.properties === 'object' && !Array.isArray(obj.properties) && !obj.attributes.properties) {
        obj.attributes.properties = obj.properties;
      }
      if (field === 'evidenceObjects' && !obj.attributes.statement) {
        obj.attributes.statement = obj.name || obj.description || obj.label || '';
      }
      if (!this._hasGroundingProvenance(obj.provenance)) {
        warnings.push(`${field}[${index}] lacks source-grounding provenance`);
      }
      return obj;
    };

    result.capabilityObjects = result.capabilityObjects.filter((obj, index) => {
      const valid = obj && typeof obj === 'object' && typeof obj.type === 'string';
      if (!valid) warnings.push(`capabilityObjects[${index}] is missing type`);
      return valid;
    }).map((obj, index) => normalizeObject(obj, 'capabilityObjects', index));

    result.worldObjects = result.worldObjects.filter((obj, index) => {
      const valid = obj && typeof obj === 'object' && typeof obj.type === 'string';
      if (!valid) warnings.push(`worldObjects[${index}] is missing type`);
      return valid;
    }).map((obj, index) => normalizeObject(obj, 'worldObjects', index));

    result.evidenceObjects = result.evidenceObjects.filter((obj, index) => {
      const valid = obj && typeof obj === 'object' && typeof obj.type === 'string';
      if (!valid) warnings.push(`evidenceObjects[${index}] is missing type`);
      return valid;
    }).map((obj, index) => normalizeObject(obj, 'evidenceObjects', index));

    result.bridgeRelations = result.bridgeRelations.filter((rel, index) => {
      const valid = rel && typeof rel === 'object' && rel.from && rel.to && rel.type;
      if (!valid) warnings.push(`bridgeRelations[${index}] is missing from/to/type`);
      else if (!this._hasGroundingProvenance(rel.provenance)) warnings.push(`bridgeRelations[${index}] lacks source-grounding provenance`);
      return valid;
    });

    result.keyFindings = result.keyFindings.filter((item, index) => {
      const valid = item && typeof item === 'object' && (item.statement || item.label || item.value);
      if (!valid) warnings.push(`keyFindings[${index}] is missing statement`);
      else if (!this._hasGroundingProvenance(item.provenance) && !item.section) warnings.push(`keyFindings[${index}] lacks source-grounding provenance`);
      return valid;
    });

    result.researchGaps = result.researchGaps.filter((item, index) => {
      const valid = item && typeof item === 'object' && (item.label || item.statement || item.detail);
      if (!valid) warnings.push(`researchGaps[${index}] is missing label or detail`);
      else if (!this._hasGroundingProvenance(item.provenance) && !item.section) warnings.push(`researchGaps[${index}] lacks source-grounding provenance`);
      return valid;
    });

    result.limitations = result.limitations.filter((item, index) => {
      const valid = item && typeof item === 'object' && (item.label || item.statement || item.detail);
      if (!valid) warnings.push(`limitations[${index}] is missing label or detail`);
      else if (!this._hasGroundingProvenance(item.provenance) && !item.section) warnings.push(`limitations[${index}] lacks source-grounding provenance`);
      return valid;
    });

    result.figureAnalyses = result.figureAnalyses.filter((item, index) => {
      const valid = item && typeof item === 'object' && (item.figureId || item.label || item.caption || item.title);
      if (!valid) warnings.push(`figureAnalyses[${index}] is missing figure reference`);
      else if (!this._hasGroundingProvenance(item.provenance) && !item.caption) warnings.push(`figureAnalyses[${index}] lacks caption or source-grounding provenance`);
      return valid;
    });

    result.resourceLinks = result.resourceLinks.filter((item, index) => {
      const resourceUrl = item && typeof item === 'object' ? this._resourceLinkUrl(item) : '';
      const valid = item && typeof item === 'object'
        && (resourceUrl || item.resourceId)
        && (item.role || item.target || item.targetId || item.routeNodeId || item.evidenceId || item.figureId || item.visualId);
      if (!valid) warnings.push(`resourceLinks[${index}] is missing resource or target`);
      else {
        if ((!item.provenance || typeof item.provenance !== 'object') && item.evidence) {
          item.provenance = { sourceText: item.evidence };
        }
        if (!this._hasGroundingProvenance(item.provenance)) warnings.push(`resourceLinks[${index}] lacks source-grounding provenance`);
      }
      return valid;
    });

    result.mapVisualizationHints = result.mapVisualizationHints.filter((item, index) => {
      const valid = item && typeof item === 'object'
        && (item.visualGoal || item.geometryRole || item.colorBy || item.sizeBy || item.inspectorFocus || item.timeSeriesFields);
      if (!valid) warnings.push(`mapVisualizationHints[${index}] is missing visualization guidance`);
      else if (!this._hasGroundingProvenance(item.sourceGrounding || item.provenance) && !item.section) {
        warnings.push(`mapVisualizationHints[${index}] lacks source-grounding provenance`);
      }
      return valid;
    });

    if (result.researchRoute !== undefined && result.researchRoute !== null) {
      if (!result.researchRoute || typeof result.researchRoute !== 'object' || Array.isArray(result.researchRoute)) {
        warnings.push('researchRoute must be an object');
        result.researchRoute = null;
      } else {
        const route = { ...result.researchRoute };
        if (route.nodes !== undefined && !Array.isArray(route.nodes)) {
          warnings.push('researchRoute.nodes must be an array');
          route.nodes = [];
        }
        if (route.edges !== undefined && !Array.isArray(route.edges)) {
          warnings.push('researchRoute.edges must be an array');
          route.edges = [];
        }
        route.nodes = (route.nodes || []).filter((node, index) => {
          const valid = node && typeof node === 'object' && (node.id || node.label);
          if (!valid) warnings.push(`researchRoute.nodes[${index}] is missing id or label`);
          else {
            if (node.label && this._isGenericRouteLabel(node.label)) warnings.push(`researchRoute.nodes[${index}] uses internal or generic label`);
            if (!node.summary && !node.detail && !Array.isArray(node.children)) warnings.push(`researchRoute.nodes[${index}] lacks summary or drilldown detail`);
          }
          return valid;
        });
        route.edges = (route.edges || []).filter((edge, index) => {
          const valid = edge && typeof edge === 'object' && edge.from && edge.to;
          if (!valid) warnings.push(`researchRoute.edges[${index}] is missing from/to`);
          return valid;
        });
        result.researchRoute = route.nodes.length > 0 ? route : null;
      }
    } else {
      result.researchRoute = null;
    }

    result.schemaWarnings = [
      ...(Array.isArray(result.schemaWarnings) ? result.schemaWarnings : []),
      ...warnings
    ];
    result.agentTask = DEEP_DECOMPOSITION_AGENT_TASK;
    result.schemaVersion = DEEP_DECOMPOSITION_SCHEMA_VERSION;

    return result;
  }

  _hasLLMInsights(result = {}) {
    return ['keyFindings', 'researchGaps', 'limitations', 'figureAnalyses', 'resourceLinks', 'mapVisualizationHints']
      .some(field => Array.isArray(result[field]) && result[field].length > 0)
      || Boolean(result.sourceBrief?.oneLine || result.sourceBrief?.keyPoints?.length);
  }

  _emptyLLMInsights() {
    return {
      sourceBrief: null,
      keyFindings: [],
      researchGaps: [],
      limitations: [],
      figureAnalyses: [],
      resourceLinks: [],
      mapVisualizationHints: []
    };
  }

  _appendLLMInsights(target = {}, source = {}) {
    target.sourceBrief = this._mergeSourceBriefInsights(target.sourceBrief, source.sourceBrief);
    const fields = ['keyFindings', 'researchGaps', 'limitations', 'figureAnalyses', 'resourceLinks', 'mapVisualizationHints'];
    for (const field of fields) {
      if (!Array.isArray(target[field])) target[field] = [];
      for (const item of source[field] || []) {
        const key = this._llmInsightKey(field, item);
        if (!key) continue;
        if (!target[field].some(existing => this._llmInsightKey(field, existing) === key)) {
          target[field].push(item);
        }
      }
    }
  }

  _coerceSourceBriefSchema(sourceBrief, warnings = []) {
    if (sourceBrief === undefined || sourceBrief === null) return null;
    if (!sourceBrief || typeof sourceBrief !== 'object' || Array.isArray(sourceBrief)) {
      warnings.push('sourceBrief must be an object');
      return null;
    }

    const result = {
      oneLine: this._summarizeText(sourceBrief.oneLine || sourceBrief.summary || sourceBrief.abstract || '', 360),
      keyPoints: []
    };

    const rawKeyPoints = Array.isArray(sourceBrief.keyPoints)
      ? sourceBrief.keyPoints
      : Array.isArray(sourceBrief.highlights)
        ? sourceBrief.highlights
        : [];

    result.keyPoints = rawKeyPoints
      .map((point, index) => {
        const normalized = this._normalizeSourceBriefPoint(point, index);
        if (!normalized) {
          warnings.push(`sourceBrief.keyPoints[${index}] is missing user-facing content`);
          return null;
        }
        if (!this._hasGroundingProvenance(normalized.provenance) && !normalized.support?.sourceText) {
          warnings.push(`sourceBrief.keyPoints[${index}] lacks source-grounding provenance`);
        }
        return normalized;
      })
      .filter(Boolean)
      .slice(0, 8);

    if (!result.oneLine && result.keyPoints.length === 0) return null;
    if (!result.oneLine && result.keyPoints[0]) {
      result.oneLine = this._summarizeText(`${result.keyPoints[0].value}. ${result.keyPoints[0].detail || ''}`, 280);
    }
    return result;
  }

  _normalizeSourceBriefPoint(point = {}, index = 0) {
    if (typeof point === 'string' || typeof point === 'number') {
      const value = this._summarizeText(String(point), 120);
      if (!value || this._isGenericRouteLabel(value)) return null;
      return {
        id: `source-brief-${index + 1}`,
        label: 'Key Point',
        value,
        detail: '',
        source: 'llm-source-brief',
        support: { sourceText: value }
      };
    }
    if (!point || typeof point !== 'object') return null;

    const value = this._summarizeText(point.value || point.statement || point.summary || point.description || point.title || '', 120);
    const label = this._summarizeText(point.label || point.kind || point.type || 'Key Point', 60);
    const detail = this._summarizeText(point.detail || point.reason || point.evidence || point.explanation || point.description || '', 220);
    const text = `${label} ${value} ${detail}`;
    if (!value || this._isGenericRouteLabel(value) || this._isInternalRouteChild(label, value) || this._significantTokens(text).size < 3) {
      return null;
    }

    return {
      id: point.id || `source-brief-${index + 1}`,
      label,
      value,
      detail,
      source: 'llm-source-brief',
      provenance: point.provenance || point.section ? {
        ...(point.provenance || {}),
        section: point.section || point.provenance?.section
      } : null,
      support: {
        ...(point.support || {}),
        kind: 'llm-source-brief',
        sourceText: point.provenance?.sourceText || point.evidence || point.statement || point.value || null,
        routeNodeId: point.routeNodeId || point.support?.routeNodeId || null,
        objectId: point.objectId || point.support?.objectId || null,
        resourceUrl: point.resourceUrl || point.support?.resourceUrl || null
      }
    };
  }

  _mergeSourceBriefInsights(target = null, source = null) {
    const targetBrief = target && typeof target === 'object' ? target : { oneLine: '', keyPoints: [] };
    if (!source || typeof source !== 'object') return targetBrief.oneLine || targetBrief.keyPoints?.length ? targetBrief : null;

    const result = {
      oneLine: targetBrief.oneLine || source.oneLine || '',
      keyPoints: Array.isArray(targetBrief.keyPoints) ? [...targetBrief.keyPoints] : []
    };
    const seen = new Set(result.keyPoints.map(point => this._llmInsightKey('sourceBrief', point)).filter(Boolean));

    for (const point of source.keyPoints || []) {
      const key = this._llmInsightKey('sourceBrief', point);
      if (!key || seen.has(key)) continue;
      seen.add(key);
      result.keyPoints.push(point);
      if (result.keyPoints.length >= 8) break;
    }

    if (!result.oneLine && source.oneLine) result.oneLine = source.oneLine;
    return result.oneLine || result.keyPoints.length > 0 ? result : null;
  }

  _llmInsightKey(field, item = {}) {
    if (!item || typeof item !== 'object') return null;
    return [
      field,
      item.id,
      item.figureId,
      item.url,
      item.label,
      item.statement,
      item.value,
      item.detail,
      item.caption,
      item.visualGoal,
      item.geometryRole,
      item.colorBy,
      item.sizeBy
    ].filter(Boolean).join(':').toLowerCase().slice(0, 180);
  }

  /**
   * Merge results from multiple chunks
   */
  _mergeChunkResults(chunkResults) {
    const result = {
      capabilityObjects: [],
      worldObjects: [],
      evidenceObjects: [],
      bridgeRelations: [],
      researchRoute: null,
      sections: { chunks: chunkResults.length },
      agentTask: DEEP_DECOMPOSITION_AGENT_TASK,
      schemaVersion: DEEP_DECOMPOSITION_SCHEMA_VERSION,
      agentRuns: [],
      schemaWarnings: [],
      llmInsights: {
        keyFindings: [],
        researchGaps: [],
        limitations: [],
        figureAnalyses: [],
        resourceLinks: [],
        mapVisualizationHints: []
      }
    };

    const seenCapabilities = new Map();
    const seenWorld = new Map();
    const seenEvidence = new Map();
    const seenRelations = new Set();
    const routeCandidates = [];

    for (const chunkResult of chunkResults) {
      if (chunkResult.agentInfo) {
        result.agentRuns.push(chunkResult.agentInfo);
      }
      if (Array.isArray(chunkResult.schemaWarnings) && chunkResult.schemaWarnings.length > 0) {
        result.schemaWarnings.push(...chunkResult.schemaWarnings);
      }
      this._appendLLMInsights(result.llmInsights, chunkResult);

      // Merge capability objects
      for (const obj of chunkResult.capabilityObjects || []) {
        const key = `${obj.type}:${obj.attributes?.name?.toLowerCase()}`;
        if (!seenCapabilities.has(key)) {
          // Enhance provenance with chunk info
          if (chunkResult.chunkInfo && obj.provenance) {
            obj.provenance.sections = chunkResult.chunkInfo.sections;
            obj.provenance.chunkIndex = chunkResult.chunkInfo.index;
          }
          obj.id = obj.id || this._generateId(obj.type, obj.attributes?.name);
          obj.layer = 'capability';
          obj.extractionSource = 'llm';
          seenCapabilities.set(key, obj);
        }
      }

      // Merge world objects
      for (const obj of chunkResult.worldObjects || []) {
        const key = `${obj.type}:${obj.attributes?.name?.toLowerCase()}`;
        if (!seenWorld.has(key)) {
          if (chunkResult.chunkInfo && obj.provenance) {
            obj.provenance.sections = chunkResult.chunkInfo.sections;
            obj.provenance.chunkIndex = chunkResult.chunkInfo.index;
          }
          obj.id = obj.id || this._generateId(obj.type, obj.attributes?.name);
          obj.layer = 'world';
          obj.extractionSource = 'llm';
          seenWorld.set(key, obj);
        }
      }

      // Merge evidence objects
      for (const obj of chunkResult.evidenceObjects || []) {
        const key = `${obj.type}:${obj.attributes?.statement?.substring(0, 50)}`;
        if (!seenEvidence.has(key)) {
          if (chunkResult.chunkInfo && obj.provenance) {
            obj.provenance.sections = chunkResult.chunkInfo.sections;
            obj.provenance.chunkIndex = chunkResult.chunkInfo.index;
          }
          obj.id = obj.id || this._generateId(obj.type, obj.attributes?.statement?.substring(0, 30));
          obj.layer = 'foundation';
          obj.extractionSource = 'llm';
          seenEvidence.set(key, obj);
        }
      }

      // Merge bridge relations
      for (const rel of chunkResult.bridgeRelations || []) {
        const key = `${rel.type}:${rel.from}:${rel.to}`;
        if (!seenRelations.has(key)) {
          if (chunkResult.chunkInfo && rel.provenance) {
            rel.provenance.sections = chunkResult.chunkInfo.sections;
          }
          seenRelations.add(key);
          result.bridgeRelations.push(rel);
        }
      }

      if (this._hasResearchRoute(chunkResult.researchRoute)) {
        routeCandidates.push(chunkResult.researchRoute);
      }
    }

    result.capabilityObjects = Array.from(seenCapabilities.values());
    result.worldObjects = Array.from(seenWorld.values());
    result.evidenceObjects = Array.from(seenEvidence.values());
    result.researchRoute = this._mergeResearchRoutes(routeCandidates);

    return result;
  }

  /**
   * Merge metadata and LLM extraction results
   */
  _mergeExtractions(metadataResult, llmResult, admissionResult, textFallbackResult = null) {
    const result = {
      capabilityObjects: [],
      worldObjects: [],
      evidenceObjects: [],
      sections: {},
      llmInsights: this._emptyLLMInsights(),
      strategy: llmResult ? 'llm-primary' : 'metadata-only'
    };

    if (!llmResult) {
      const fallbackResult = textFallbackResult || {};
      const hasTextFallback = this._hasExtractionObjects(fallbackResult);
      const merged = this._mergeNonLLMExtractions(metadataResult, fallbackResult);

      return {
        ...merged,
        researchRoute: null,
        strategy: hasTextFallback ? 'source-text-fallback' : 'metadata-only'
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

    result.bridgeRelations = llmResult.bridgeRelations || [];
    result.researchRoute = this._normalizeResearchRoute(llmResult.researchRoute);
    result.llmInsights = llmResult.llmInsights || this._emptyLLMInsights();

    // Merge sections
    result.sections = {
      ...metadataResult.sections,
      ...(textFallbackResult?.sections || {}),
      llmExtracted: true
    };

    return result;
  }

  _mergeNonLLMExtractions(metadataResult, textFallbackResult = {}) {
    const mergeObjects = (metadataObjects = [], fallbackObjects = []) => {
      const byKey = new Map();

      for (const obj of fallbackObjects) {
        const key = `${obj.type}:${obj.attributes?.name?.toLowerCase() || obj.id}`;
        if (key) {
          obj.extractionSource = obj.extractionSource || 'source-text-fallback';
          byKey.set(key, obj);
        }
      }

      for (const obj of metadataObjects) {
        const key = `${obj.type}:${obj.attributes?.name?.toLowerCase() || obj.id}`;
        if (key && !byKey.has(key)) {
          obj.extractionSource = obj.extractionSource || 'metadata';
          byKey.set(key, obj);
        }
      }

      return Array.from(byKey.values());
    };

    return {
      capabilityObjects: mergeObjects(metadataResult.capabilityObjects, textFallbackResult.capabilityObjects),
      worldObjects: mergeObjects(metadataResult.worldObjects, textFallbackResult.worldObjects),
      evidenceObjects: mergeObjects(metadataResult.evidenceObjects, textFallbackResult.evidenceObjects),
      bridgeRelations: textFallbackResult.bridgeRelations || [],
      llmInsights: this._emptyLLMInsights(),
      sections: {
        ...(metadataResult.sections || {}),
        ...(textFallbackResult.sections || {}),
        sourceTextFallback: this._hasExtractionObjects(textFallbackResult)
      }
    };
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
    const sourceType = this._normalizeSourceType(admissionResult.sourceType);
    const metadata = this._getNormalizedMetadata(content);
    const text = content.text || '';

    // Get name from content (GitHub returns name at top level)
    const name = content.name || metadata.title || metadata.name || 'Untitled';

    const sourceObject = {
      type: sourceType,
      id: this._generateId(sourceType, input),
      name: name,
      attributes: {
        identifier: input,
        title: name,
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
        sourceObject.attributes.reproducibilityStatus = metadata.repositoryReview?.grade || metadata.reproducibilityStatus;
        sourceObject.attributes.repositoryReview = metadata.repositoryReview;
        break;

      case 'DatasetPage':
        sourceObject.attributes.url = input;
        sourceObject.attributes.variables = metadata.variables;
        sourceObject.attributes.coverage = metadata.spatialCoverage;
        sourceObject.attributes.spatialCoverage = metadata.spatialCoverage;
        sourceObject.attributes.spatialResolution = metadata.spatialResolution;
        sourceObject.attributes.temporalCoverage = metadata.temporalCoverage;
        sourceObject.attributes.temporalResolution = metadata.temporalResolution;
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
        sourceObject.attributes.location = metadata.location;
        break;
    }

    return sourceObject;
  }

  _getSourceText(content = {}) {
    return content.text || content.content || content.fullText || '';
  }

  _getNormalizedMetadata(content = {}) {
    const metadata = content.metadata || {};
    return {
      ...metadata,
      title: content.title || metadata.title || metadata.display_name,
      name: content.name || metadata.name || metadata.display_name,
      abstract: content.abstract || metadata.abstract,
      authors: content.authors || metadata.authors,
      year: content.year || metadata.year || metadata.publication_year,
      publicationYear: content.publicationYear || metadata.publicationYear || metadata.publication_year,
      venue: content.venue || metadata.venue || metadata.journal || metadata.primary_location?.source?.display_name,
      journal: content.journal || metadata.journal || metadata.primary_location?.source?.display_name,
      doi: content.doi || metadata.doi,
      url: content.url || metadata.url || metadata.doi,
      resources: content.resources || metadata.resources,
      figures: content.figures || metadata.figures,
      tables: content.tables || metadata.tables,
      spatialCoverage: content.spatialCoverage || metadata.spatialCoverage || metadata.coverage,
      temporalCoverage: content.temporalCoverage || metadata.temporalCoverage || metadata.temporal,
      spatialResolution: content.spatialResolution || metadata.spatialResolution || metadata.resolution,
      temporalResolution: content.temporalResolution || metadata.temporalResolution || metadata.frequency
    };
  }

  _hasExtractionObjects(result) {
    if (!result) return false;
    return Boolean(
      result.capabilityObjects?.length
      || result.worldObjects?.length
      || result.evidenceObjects?.length
      || result.bridgeRelations?.length
    );
  }

  _hasResearchRoute(route) {
    return Boolean(route?.nodes?.length >= 2);
  }

  _filterOutOfScopeExtraction(merged = {}) {
    const removed = {
      capabilityObjects: 0,
      worldObjects: 0,
      evidenceObjects: 0,
      bridgeRelations: 0,
      sections: []
    };

    const filterObjects = (objects = [], key) => {
      const kept = [];
      for (const object of objects) {
        if (this._isOutOfScopeProvenance(object.provenance)) {
          removed[key] += 1;
          const section = this._provenanceSectionText(object.provenance);
          if (section && !removed.sections.includes(section)) removed.sections.push(section);
          continue;
        }
        kept.push(object);
      }
      return kept;
    };

    merged.capabilityObjects = filterObjects(merged.capabilityObjects, 'capabilityObjects');
    merged.worldObjects = filterObjects(merged.worldObjects, 'worldObjects');
    merged.evidenceObjects = filterObjects(merged.evidenceObjects, 'evidenceObjects');

    const validIds = new Set([
      ...(merged.capabilityObjects || []).map(object => object.id),
      ...(merged.worldObjects || []).map(object => object.id),
      ...(merged.evidenceObjects || []).map(object => object.id)
    ].filter(Boolean));

    const relations = [];
    for (const relation of merged.bridgeRelations || []) {
      if (this._isOutOfScopeProvenance(relation.provenance)) {
        removed.bridgeRelations += 1;
        continue;
      }
      if ((relation.from && !validIds.has(relation.from)) || (relation.to && !validIds.has(relation.to))) {
        relation.requiresEndpointReview = true;
      }
      relations.push(relation);
    }
    merged.bridgeRelations = relations;

    return {
      ...removed,
      removedTotal: removed.capabilityObjects + removed.worldObjects + removed.evidenceObjects + removed.bridgeRelations
    };
  }

  _isOutOfScopeProvenance(provenance = {}) {
    const sectionText = this._provenanceSectionText(provenance);
    if (!sectionText) return false;

    const skipFragments = [
      'this article is cited by',
      'cited by',
      'associated content',
      'related articles',
      'similar content',
      'recommended',
      'author information',
      'author contributions',
      'competing interests',
      'ethics declarations',
      'additional information',
      'rights and permissions',
      'about this article',
      'metrics',
      'comments',
      'references'
    ];

    return skipFragments.some(fragment => sectionText.includes(fragment));
  }

  _provenanceSectionText(provenance = {}) {
    const sections = Array.isArray(provenance.sections) ? provenance.sections.join(' ') : '';
    return [
      provenance.section,
      provenance.sectionTitle,
      sections
    ].filter(Boolean).join(' ').toLowerCase().trim();
  }

  _assessResearchRouteQuality(route = {}) {
    const nodes = Array.isArray(route.nodes) ? route.nodes : [];
    const contentNodes = nodes.filter(node => {
      const label = node.label || node.name || node.title || '';
      return node.id !== 'source' && label && !this._isGenericRouteLabel(label);
    });
    const stages = new Set(contentNodes.map(node => node.stage).filter(Boolean));
    const edges = Array.isArray(route.edges)
      ? route.edges.filter(edge => edge?.from && edge?.to && edge.from !== edge.to)
      : [];
    const detailNodeCount = contentNodes.filter(node => Array.isArray(node.children) && node.children.length > 0).length;
    const informativeNodes = contentNodes.filter(node => this._isInformativeRouteNode(node));
    const lowInformationNodes = contentNodes.filter(node => !this._isInformativeRouteNode(node));
    const groundedNodes = contentNodes.filter(node => this._isGroundedRouteNode(node));
    const informationScore = contentNodes.length > 0
      ? Math.round((informativeNodes.length / contentNodes.length) * 100)
      : 0;
    const groundingScore = contentNodes.length > 0
      ? Math.round((groundedNodes.length / contentNodes.length) * 100)
      : 0;
    const reasons = [];

    if (contentNodes.length < 2) {
      reasons.push('needs at least two content-level nodes');
    }
    if (stages.size < 2) {
      reasons.push('needs multiple research stages');
    }
    if (edges.length === 0) {
      reasons.push('needs explicit route edges');
    }
    if (detailNodeCount === 0) {
      reasons.push('needs drilldown details');
    }
    if (lowInformationNodes.length > 0) {
      reasons.push(`low-information route nodes: ${lowInformationNodes.slice(0, 3).map(node => node.label || node.name || node.id).join(', ')}`);
    }
    if (groundingScore < 50 && contentNodes.length > 0) {
      reasons.push(`weakly grounded route nodes: ${contentNodes.filter(node => !this._isGroundedRouteNode(node)).slice(0, 3).map(node => node.label || node.name || node.id).join(', ')}`);
    }

    let level = 'limited';
    if (contentNodes.length >= 3 && stages.size >= 2 && edges.length > 0) {
      level = detailNodeCount > 0 && informationScore >= 75 ? 'content' : 'partial';
    } else if (contentNodes.length >= 2 && edges.length > 0) {
      level = 'partial';
    }
    if (level === 'content' && informationScore < 100) level = 'partial';
    if (informationScore < 50 && contentNodes.length > 0) level = 'limited';

    return {
      level,
      contentNodeCount: contentNodes.length,
      stageCount: stages.size,
      edgeCount: edges.length,
      detailNodeCount,
      informativeNodeCount: informativeNodes.length,
      lowInformationNodeCount: lowInformationNodes.length,
      groundedNodeCount: groundedNodes.length,
      informationScore,
      groundingScore,
      reasons
    };
  }

  _isGroundedRouteNode(node = {}) {
    if (this._hasGroundingProvenance(node.provenance)) return true;
    if (node.support?.sourceText) return true;
    if (node.support?.objectId || node.support?.resourceUrl || node.support?.evidenceId) return true;
    return false;
  }

  _isInformativeRouteNode(node = {}) {
    const label = String(node.label || node.name || node.title || '').trim();
    const summary = String(node.summary || node.description || '').trim();
    const children = Array.isArray(node.children) ? node.children : [];
    const contentChildren = children.filter(child => {
      const childText = `${child?.label || ''} ${child?.value || ''} ${child?.detail || ''}`.trim();
      return childText
        && !this._isInternalRouteChild(child?.label, child?.value)
        && this._isInformativeRouteDetail(childText);
    });
    const labelTokens = this._significantTokens(label);
    const summaryTokens = this._significantTokens(summary);
    const summaryGeneric = this._isGenericRouteLabel(summary)
      || /^source material|^content-level route|^derived from/i.test(summary)
      || summaryTokens.size < 3;

    if (!label || this._isLowInformationRouteLabel(label)) return false;
    if (contentChildren.length > 0) return true;
    if (summaryTokens.size >= 4 && !summaryGeneric) return true;
    return labelTokens.size >= 3 && summaryTokens.size >= 2 && !summaryGeneric;
  }

  _isInformativeRouteDetail(value = '') {
    const normalized = String(value || '').trim();
    if (!normalized) return false;
    if (this._isGenericRouteLabel(normalized)) return false;
    return this._significantTokens(normalized).size >= 3;
  }

  _assessContentFidelity(result = {}, content = {}) {
    const expected = this._expectedContentFacets(content, result);
    const covered = this._coveredContentFacets(result);
    const missing = expected.filter(facet => !covered.includes(facet));
    const expectedCount = expected.length;
    const coveredExpectedCount = expected.filter(facet => covered.includes(facet)).length;
    const score = expectedCount > 0 ? Math.round((coveredExpectedCount / expectedCount) * 100) : 100;
    const grounding = this._assessFacetGrounding(result, expected, covered);
    const routeLabels = (result.workflowOutline?.nodes || [])
      .filter(node => node.id !== 'source')
      .map(node => node.label || node.name || node.title || '')
      .filter(Boolean);
    const internalRouteLabels = routeLabels.filter(label => this._isGenericRouteLabel(label));
    const criticalMissing = missing.filter(facet => this._criticalContentFacets(result, content).includes(facet));

    let level = 'content';
    const reasons = [];
    if (expectedCount === 0) {
      level = 'unknown';
      reasons.push('no durable source facets were available to assess low-loss coverage');
    } else if (score < 50 || criticalMissing.length > 0) {
      level = 'weak';
      if (criticalMissing.length > 0) reasons.push(`missing critical facets: ${criticalMissing.join(', ')}`);
      if (score < 50) reasons.push('less than half of expected source facets are represented');
    } else if (score < 80 || missing.length > 0) {
      level = 'partial';
      reasons.push(`missing facets: ${missing.join(', ')}`);
    }

    if (internalRouteLabels.length > 0) {
      level = level === 'content' ? 'partial' : level;
      reasons.push(`route still exposes internal labels: ${internalRouteLabels.slice(0, 3).join(', ')}`);
    }
    if (grounding.ungroundedFacets.length > 0) {
      level = level === 'content' ? 'partial' : level;
      reasons.push(`facets lack provenance or graph support: ${grounding.ungroundedFacets.join(', ')}`);
    } else if (grounding.weaklyGroundedFacets.length > 0) {
      level = level === 'content' ? 'partial' : level;
      reasons.push(`facets need stronger provenance support: ${grounding.weaklyGroundedFacets.join(', ')}`);
    }

    return {
      level,
      score,
      expectedFacets: expected,
      coveredFacets: covered.filter(facet => expected.includes(facet)),
      missingFacets: missing,
      grounding,
      internalRouteLabels,
      reasons
    };
  }

  _criticalContentFacets(result = {}, content = {}) {
    const typeText = [
      result.sourceType,
      result.sourceObject?.type,
      result.sourceObject?.attributes?.type,
      this._getNormalizedMetadata(content).type,
      content.type
    ].join(' ').toLowerCase();

    if (/dataset|data catalog|datacatalog|datasetpage/.test(typeText)) {
      return ['data', 'context', 'resource'];
    }
    if (/repository|github|software|code|package/.test(typeText)) {
      return ['method', 'resource'];
    }
    if (/news|event|press/.test(typeText)) {
      return ['source', 'context', 'evidence'];
    }
    if (/report|policy|assessment/.test(typeText)) {
      return ['source', 'evidence', 'context'];
    }
    return ['data', 'method', 'evidence'];
  }

  _assessFacetGrounding(result = {}, expected = [], covered = []) {
    const expectedCovered = expected.filter(facet => covered.includes(facet));
    const groundedFacets = [];
    const weaklyGroundedFacets = [];
    const ungroundedFacets = [];
    const details = {};

    for (const facet of expectedCovered) {
      const detail = this._facetGroundingDetail(result, facet);
      details[facet] = detail;
      if (detail.level === 'grounded') groundedFacets.push(facet);
      else if (detail.level === 'weak') weaklyGroundedFacets.push(facet);
      else ungroundedFacets.push(facet);
    }

    const denominator = expectedCovered.length;
    const score = denominator > 0
      ? Math.round(((groundedFacets.length + weaklyGroundedFacets.length * 0.5) / denominator) * 100)
      : 100;

    return {
      score,
      groundedFacets,
      weaklyGroundedFacets,
      ungroundedFacets,
      details
    };
  }

  _facetGroundingDetail(result = {}, facet = '') {
    const routeNodes = result.workflowOutline?.nodes || [];
    const routeEdges = result.workflowOutline?.edges || [];
    const hasRouteStage = (...stages) => routeNodes.some(node => stages.includes(node.stage));
    const hasRouteEdgeForStage = (...stages) => {
      const stageIds = new Set(routeNodes.filter(node => stages.includes(node.stage)).map(node => node.id));
      return routeEdges.some(edge => stageIds.has(edge.from) || stageIds.has(edge.to));
    };
    const objects = [
      ...(result.capabilityObjects || []),
      ...(result.worldObjects || []),
      ...(result.evidenceObjects || [])
    ];
    const hasObjectProvenance = predicate => objects.some(object => predicate(object) && this._hasGroundingProvenance(object.provenance));
    const sourceHasProvenance = this._hasGroundingProvenance(result.sourceObject?.provenance);

    if (facet === 'source') {
      return {
        level: sourceHasProvenance ? 'grounded' : 'weak',
        reason: sourceHasProvenance ? 'source object has provenance' : 'source object exists without detailed provenance'
      };
    }
    if (facet === 'data') {
      const objectGrounded = hasObjectProvenance(object => this._objectLooksLikeFacet(object, 'data'));
      const linkedResource = (result.resourceGraph?.summary?.linkedResourceCount || 0) > 0
        && (result.resourceGraph?.summary?.datasetCount || 0) > 0;
      return this._facetGroundingResult(objectGrounded || linkedResource, hasRouteStage('data'), hasRouteEdgeForStage('data'), 'data object/resource is grounded');
    }
    if (facet === 'method') {
      const objectGrounded = hasObjectProvenance(object => this._objectLooksLikeFacet(object, 'method'));
      const linkedResource = (result.resourceGraph?.summary?.linkedResourceCount || 0) > 0
        && (result.resourceGraph?.summary?.repositoryCount || 0) > 0;
      return this._facetGroundingResult(objectGrounded || linkedResource, hasRouteStage('method', 'execution'), hasRouteEdgeForStage('method', 'execution'), 'method object/resource is grounded');
    }
    if (facet === 'evidence') {
      const objectGrounded = hasObjectProvenance(object => ['Claim', 'Evidence', 'Finding', 'Metric'].includes(object.type));
      const linkedClaim = (result.evidenceGraph?.summary?.linkedClaimCount || 0) > 0;
      return this._facetGroundingResult(objectGrounded || linkedClaim, hasRouteStage('evidence'), hasRouteEdgeForStage('evidence'), 'evidence object or linked claim is grounded');
    }
    if (facet === 'visual') {
      const visuals = result.visualEvidence || [];
      const visualQuality = this._assessVisualEvidenceQuality(result, {});
      const visualGrounded = visuals.some(visual => visual.caption || visual.sourceUrl || this._hasGroundingProvenance(visual.provenance));
      const linkedVisual = (result.evidenceGraph?.summary?.visualCount || 0) > 0;
      const explainedVisual = visualQuality.explainedCount > 0 || visualQuality.supportedClaimCount > 0;
      return this._facetGroundingResult(
        (visualGrounded || linkedVisual) && explainedVisual,
        visuals.length > 0,
        false,
        'visual evidence has caption, explanation, and claim support'
      );
    }
    if (facet === 'resource') {
      const resourceQuality = this._assessResourceGraphQuality(result);
      const resourceCount = result.resourceGraph?.summary?.resourceCount || 0;
      const linkedCount = result.resourceGraph?.summary?.linkedResourceCount || 0;
      return this._facetGroundingResult(
        linkedCount > 0 && !['missing', 'weak'].includes(resourceQuality.level),
        resourceCount > 0,
        false,
        'resources are typed, reviewable, and linked to route or evidence'
      );
    }
    if (facet === 'context') {
      const objectGrounded = hasObjectProvenance(object => ['Region', 'Event', 'Hazard', 'Risk', 'Coverage'].includes(object.type));
      return this._facetGroundingResult(objectGrounded, hasRouteStage('context') || (result.worldObjects || []).length > 0, hasRouteEdgeForStage('context'), 'context object is grounded');
    }
    if (facet === 'limitation') {
      const limitationGrounded = (result.llmInsights?.limitations || []).some(item => this._hasGroundingProvenance(item.provenance) || item.section)
        || (result.llmInsights?.researchGaps || []).some(item => this._hasGroundingProvenance(item.provenance) || item.section);
      return this._facetGroundingResult(limitationGrounded, (result.inferredLimitations || []).length > 0, false, 'limitation is source-grounded');
    }

    return { level: 'weak', reason: 'facet is covered but has no specific grounding protocol' };
  }

  _facetGroundingResult(grounded, weakSignal, linkedRoute, groundedReason) {
    if (grounded) return { level: 'grounded', reason: groundedReason };
    if (linkedRoute) return { level: 'weak', reason: 'route node is linked but lacks direct provenance/resource support' };
    if (weakSignal) return { level: 'weak', reason: 'facet appears in route or objects but lacks direct provenance/resource support' };
    return { level: 'ungrounded', reason: 'facet is covered only by derived summary without inspectable support' };
  }

  _hasGroundingProvenance(provenance = {}) {
    const section = String(provenance?.section || provenance?.sectionTitle || '').trim().toLowerCase();
    const sections = Array.isArray(provenance?.sections)
      ? provenance.sections.map(item => String(item || '').trim().toLowerCase()).filter(Boolean)
      : [];
    const hasSpecificSection = Boolean(section && !['unknown', 'content', 'source', 'header'].includes(section))
      || sections.some(item => !['unknown', 'content', 'source', 'header'].includes(item));

    return Boolean(
      provenance
      && (
        provenance.sourceText
        || hasSpecificSection
        || provenance.input
        || provenance.url
      )
    );
  }

  _expectedContentFacets(content = {}, result = {}) {
    const metadata = this._getNormalizedMetadata(content);
    const sections = this._contentSectionNames(content);
    const text = this._getSourceText(content);
    const facets = new Set();

    const hasSection = (...needles) => sections.some(section => needles.some(needle => section.includes(needle)));
    const hasText = (...needles) => {
      const normalizedText = String(text || '').toLowerCase();
      return needles.some(needle => normalizedText.includes(needle));
    };

    if (metadata.title || content.title || result.sourceObject) facets.add('source');
    if (
      hasSection('data', 'dataset', 'input', 'availability', 'materials')
      || hasText('input data', 'data source', 'dataset', 'observations')
      || metadata.resources?.some?.(resource => /data|dataset|archive/i.test(`${resource.type || ''} ${resource.label || ''} ${resource.url || ''}`))
    ) {
      facets.add('data');
    }
    if (hasSection('method', 'model', 'algorithm', 'workflow', 'implementation', 'approach') || hasText('method', 'model', 'algorithm', 'workflow')) {
      facets.add('method');
    }
    if (
      hasSection('result', 'finding', 'key findings', 'evaluation', 'discussion', 'conclusion', 'impact', 'impact details', 'current status', 'assessment')
      || hasText('result', 'finding', 'evaluat', 'compared', 'affected', 'displaced', 'damage')
    ) {
      facets.add('evidence');
    }
    if ((content.figures || metadata.figures || []).length > 0 || (content.tables || metadata.tables || []).length > 0) {
      facets.add('visual');
    }
    if (
      (metadata.resources || []).length > 0
      || (result.externalResources || []).length > 0
      || hasSection('code availability', 'data availability', 'software', 'repository')
    ) {
      facets.add('resource');
    }
    if (hasSection('limitation', 'uncertainty', 'discussion') || hasText('limitation', 'uncertain', 'future work')) {
      facets.add('limitation');
    }
    if (
      metadata.spatialCoverage
      || metadata.temporalCoverage
      || (result.worldObjects || []).length > 0
      || hasSection('study area', 'spatial', 'temporal', 'region', 'location')
    ) {
      facets.add('context');
    }

    return Array.from(facets);
  }

  _coveredContentFacets(result = {}) {
    const facets = new Set();
    const routeNodes = result.workflowOutline?.nodes || [];
    const routeStages = new Set(routeNodes.map(node => node.stage).filter(Boolean));
    const capabilityObjects = result.capabilityObjects || [];
    const evidenceObjects = result.evidenceObjects || [];
    const worldObjects = result.worldObjects || [];
    const insights = result.llmInsights || {};

    if (result.sourceObject || routeNodes.length > 0) facets.add('source');
    if (routeStages.has('data') || capabilityObjects.some(object => this._objectLooksLikeFacet(object, 'data'))) facets.add('data');
    if (
      routeStages.has('method')
      || routeStages.has('execution')
      || capabilityObjects.some(object => this._objectLooksLikeFacet(object, 'method'))
    ) {
      facets.add('method');
    }
    if (routeStages.has('evidence') || evidenceObjects.length > 0 || (insights.keyFindings || []).length > 0) facets.add('evidence');
    if ((result.visualEvidence || []).length > 0 || result.evidenceGraph?.summary?.figureCount > 0) facets.add('visual');
    if ((result.externalResources || []).length > 0 || result.resourceGraph?.summary?.resourceCount > 0 || routeStages.has('resource')) facets.add('resource');
    if ((insights.limitations || []).length > 0 || (insights.researchGaps || []).length > 0 || (result.inferredLimitations || []).length > 0) facets.add('limitation');
    const sourceAttributes = result.sourceObject?.attributes || {};
    if (
      worldObjects.length > 0
      || routeStages.has('context')
      || sourceAttributes.coverage
      || sourceAttributes.spatialCoverage
      || sourceAttributes.temporalCoverage
      || sourceAttributes.spatialResolution
      || sourceAttributes.temporalResolution
    ) {
      facets.add('context');
    }

    return Array.from(facets);
  }

  _assessVisualEvidenceQuality(result = {}, content = {}) {
    const metadata = this._getNormalizedMetadata(content);
    const rawSourceVisuals = [
      ...(Array.isArray(content.figures) ? content.figures : []),
      ...(Array.isArray(content.tables) ? content.tables : []),
      ...(Array.isArray(metadata.figures) ? metadata.figures : []),
      ...(Array.isArray(metadata.tables) ? metadata.tables : [])
    ];
    const seenSourceVisuals = new Set();
    const sourceVisuals = rawSourceVisuals.filter((visual, index) => {
      const key = this._visualEvidenceIdentity(visual, index);
      if (seenSourceVisuals.has(key)) return false;
      seenSourceVisuals.add(key);
      return true;
    });
    const visuals = Array.isArray(result.visualEvidence) ? result.visualEvidence : [];
    const expectedCount = sourceVisuals.length;
    const visualCount = visuals.length;
    const captionCount = visuals.filter(visual => String(visual.caption || '').trim()).length;
    const explainedCount = visuals.filter(visual => (
      String(visual.interpretation || '').trim()
      || String(visual.howProduced || '').trim()
      || String(visual.supportedClaim || '').trim()
    )).length;
    const producedCount = visuals.filter(visual => String(visual.howProduced || '').trim()).length;
    const supportedClaimCount = visuals.filter(visual => String(visual.supportedClaim || visual.supports || '').trim()).length;
    const groundedCount = visuals.filter(visual => (
      this._hasGroundingProvenance(visual.provenance)
      || String(visual.caption || '').trim()
      || String(visual.sourceUrl || '').trim()
    )).length;
    const evidenceLinkedCount = result.evidenceGraph?.summary?.linkedClaimCount || 0;
    const expectedCoverage = expectedCount > 0
      ? Math.min(100, Math.round((visualCount / expectedCount) * 100))
      : (visualCount > 0 ? 100 : 100);
    const explanationCoverage = visualCount > 0
      ? Math.round((explainedCount / visualCount) * 100)
      : (expectedCount > 0 ? 0 : 100);
    const groundingCoverage = visualCount > 0
      ? Math.round((groundedCount / visualCount) * 100)
      : (expectedCount > 0 ? 0 : 100);

    let level = 'complete';
    const reasons = [];
    if (expectedCount === 0 && visualCount === 0) {
      level = 'not_applicable';
    } else if (visualCount === 0) {
      level = 'missing';
      reasons.push('source exposes figures or tables but no visual evidence was retained');
    } else {
      if (captionCount < visualCount) reasons.push('some visual evidence is missing captions');
      if (explainedCount === 0) reasons.push('visual evidence lacks source-grounded interpretation');
      if (producedCount === 0) reasons.push('visual evidence does not explain how figures or tables were produced');
      if (supportedClaimCount === 0 && evidenceLinkedCount === 0) reasons.push('visual evidence is not connected to claims or route evidence');
      if (groundingCoverage < 100) reasons.push('some visual evidence lacks provenance or source links');

      if (expectedCount > 0 && expectedCoverage < 50) level = 'weak';
      else if (explainedCount === 0 || groundingCoverage < 50) level = 'weak';
      else if (reasons.length > 0 || expectedCoverage < 100 || explanationCoverage < 80) level = 'partial';
    }

    return {
      level,
      expectedCount,
      visualCount,
      captionCount,
      explainedCount,
      producedCount,
      supportedClaimCount,
      evidenceLinkedCount,
      groundedCount,
      expectedCoverage,
      explanationCoverage,
      groundingCoverage,
      reasons
    };
  }

  _visualEvidenceIdentity(visual = {}, index = 0) {
    const label = String(visual.number || visual.label || visual.name || visual.title || '').trim().toLowerCase();
    const caption = String(visual.caption || visual.description || visual.text || '').trim().toLowerCase();
    const url = String(visual.imageUrl || visual.url || visual.href || '').trim().toLowerCase();
    return [label, caption.slice(0, 160), url].filter(Boolean).join('|') || `visual-${index}`;
  }

  _assessResourceGraphQuality(result = {}) {
    const graph = result.resourceGraph || {};
    const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
    const edges = Array.isArray(graph.edges) ? graph.edges : [];
    const resources = nodes.filter(node => node.kind === 'resource');
    const resourceIds = new Set(resources.map(node => node.id));
    const reusableTypes = new Set(['repository', 'code', 'dataset', 'supplement']);
    const reusableResources = resources.filter(resource => reusableTypes.has(String(resource.type || '').toLowerCase()));
    const meaningfulEdges = edges.filter(edge => {
      const resourceId = resourceIds.has(edge.from) ? edge.from : resourceIds.has(edge.to) ? edge.to : null;
      if (!resourceId) return false;
      const target = resourceIds.has(edge.from) ? edge.to : edge.from;
      return target !== 'route-source';
    });
    const linkedResourceIds = new Set(meaningfulEdges
      .map(edge => resourceIds.has(edge.from) ? edge.from : edge.to));
    const llmLinkedCount = meaningfulEdges.filter(edge => edge.provenance?.method === 'llm-resource-link').length;
    const roleCount = resources.filter(resource => String(resource.role || '').trim()).length;
    const verificationFocusCount = resources.filter(resource => String(resource.verificationFocus || resource.reviewHint || '').trim()).length;
    const provenanceLinkedCount = meaningfulEdges.filter(edge => this._hasGroundingProvenance(edge.provenance)).length;
    const resourceCount = resources.length;
    const linkedResourceCount = linkedResourceIds.size;
    const reusableResourceCount = reusableResources.length;
    const linkCoverage = resourceCount > 0 ? Math.round((linkedResourceCount / resourceCount) * 100) : 100;
    const reusableLinkCoverage = reusableResourceCount > 0
      ? Math.round((reusableResources.filter(resource => linkedResourceIds.has(resource.id)).length / reusableResourceCount) * 100)
      : 100;
    const reviewCoverage = resourceCount > 0 ? Math.round((verificationFocusCount / resourceCount) * 100) : 100;

    let level = 'complete';
    const reasons = [];
    if (resourceCount === 0) {
      level = 'not_applicable';
    } else {
      if (linkedResourceCount === 0) reasons.push('resources are not linked to content route or evidence nodes');
      if (reusableResourceCount > 0 && reusableLinkCoverage < 50) reasons.push('reusable resources are weakly connected to the research route');
      if (roleCount < resourceCount) reasons.push('some resources lack role labels');
      if (verificationFocusCount < resourceCount) reasons.push('some resources lack verification focus or review hints');
      if (meaningfulEdges.length > 0 && provenanceLinkedCount === 0 && llmLinkedCount === 0) reasons.push('resource links lack source-grounded provenance');

      if (linkedResourceCount === 0 || (reusableResourceCount > 0 && reusableLinkCoverage < 50)) level = 'weak';
      else if (reusableResourceCount > 0 && provenanceLinkedCount === 0 && llmLinkedCount === 0) level = 'weak';
      else if (reasons.length > 0 || linkCoverage < 100 || reviewCoverage < 100) level = 'partial';
    }

    return {
      level,
      resourceCount,
      linkedResourceCount,
      reusableResourceCount,
      llmLinkedCount,
      roleCount,
      verificationFocusCount,
      provenanceLinkedCount,
      linkCoverage,
      reusableLinkCoverage,
      reviewCoverage,
      reasons
    };
  }

  _assessSourceBriefQuality(result = {}) {
    const brief = result.researchBrief || {};
    const keyPoints = Array.isArray(brief.keyPoints) ? brief.keyPoints : [];
    const expectedIds = ['route', 'method', 'material', 'evidence'];
    const presentFacets = new Set(keyPoints.map(point => this._sourceBriefFacet(point)).filter(Boolean));
    const missingExpected = expectedIds.filter(id => !presentFacets.has(id));
    const routeNodeIds = new Set((result.workflowOutline?.nodes || []).map(node => node.id));
    const objectIds = new Set([
      ...(result.capabilityObjects || []),
      ...(result.worldObjects || []),
      ...(result.evidenceObjects || [])
    ].map(object => object.id).filter(Boolean));
    const resources = result.externalResources || [];

    const informativePoints = [];
    const groundedPoints = [];
    const lowInformationPoints = [];
    const ungroundedPoints = [];

    for (const point of keyPoints) {
      const text = `${point.label || ''} ${point.value || ''} ${point.detail || ''}`;
      const informative = this._isInformativeBriefPoint(point);
      const grounded = this._isGroundedBriefPoint(point, { routeNodeIds, objectIds, resources });
      if (informative) informativePoints.push(point);
      else lowInformationPoints.push(point);
      if (grounded) groundedPoints.push(point);
      else ungroundedPoints.push(point);
      if (this._isGenericRouteLabel(point.value) || this._isGenericRouteLabel(point.detail) || this._significantTokens(text).size < 3) {
        if (!lowInformationPoints.includes(point)) lowInformationPoints.push(point);
      }
    }

    const pointCount = keyPoints.length;
    const informationScore = pointCount > 0 ? Math.round((informativePoints.length / pointCount) * 100) : 0;
    const groundingScore = pointCount > 0 ? Math.round((groundedPoints.length / pointCount) * 100) : 0;
    const reasons = [];
    if (pointCount < 3) reasons.push('source brief needs at least three key points');
    if (missingExpected.length > 0) reasons.push(`missing brief facets: ${missingExpected.join(', ')}`);
    if (lowInformationPoints.length > 0) {
      reasons.push(`low-information brief points: ${lowInformationPoints.slice(0, 3).map(point => point.label || point.id).join(', ')}`);
    }
    if (ungroundedPoints.length > 0) {
      reasons.push(`brief points lack route/object/resource support: ${ungroundedPoints.slice(0, 3).map(point => point.label || point.id).join(', ')}`);
    }

    let level = 'complete';
    if (pointCount === 0) level = 'missing';
    else if (informationScore < 50 || groundingScore < 50 || missingExpected.length >= 2) level = 'weak';
    else if (reasons.length > 0 || informationScore < 100 || groundingScore < 100) level = 'partial';

    return {
      level,
      pointCount,
      informativePointCount: informativePoints.length,
      groundedPointCount: groundedPoints.length,
      lowInformationPointCount: lowInformationPoints.length,
      ungroundedPointCount: ungroundedPoints.length,
      informationScore,
      groundingScore,
      missingExpected,
      reasons
    };
  }

  _isInformativeBriefPoint(point = {}) {
    const value = String(point.value || '').trim();
    const detail = String(point.detail || '').trim();
    if (!value || this._isGenericRouteLabel(value) || /^needs\b/i.test(value)) return false;
    if (/^no .* available/i.test(detail) || /^needs extraction/i.test(detail)) return false;
    const tokens = this._significantTokens(`${value} ${detail}`);
    return tokens.size >= 4;
  }

  _isGroundedBriefPoint(point = {}, context = {}) {
    if (this._hasGroundingProvenance(point.provenance)) return true;
    const support = point.support || {};
    if (support.sourceText) return true;
    if (support.routeNodeId && context.routeNodeIds?.has?.(support.routeNodeId)) return true;
    if (Array.isArray(support.routeNodeIds) && support.routeNodeIds.some(id => context.routeNodeIds?.has?.(id))) return true;
    if (support.objectId && context.objectIds?.has?.(support.objectId)) return true;
    if (support.resourceUrl && (context.resources || []).some(resource => this._urlsEquivalent(resource.url, support.resourceUrl))) return true;
    return false;
  }

  _sourceBriefFacet(point = {}) {
    const explicit = String(point.facet || point.id || '').trim().toLowerCase();
    if (['route', 'method', 'material', 'evidence'].includes(explicit)) return explicit;

    const text = [
      point.label,
      point.kind,
      point.type,
      point.support?.kind,
      point.value
    ].filter(Boolean).join(' ').toLowerCase();

    if (/route|workflow|pipeline|process|technical path|core path/.test(text)) return 'route';
    if (/method|mechanism|model|algorithm|architecture|execution|implementation/.test(text)) return 'method';
    if (/material|input|context|dataset|data|variable|coverage|region|resource/.test(text)) return 'material';
    if (/evidence|result|finding|claim|metric|evaluation|benchmark|resource/.test(text)) return 'evidence';
    return explicit || null;
  }

  _contentSectionNames(content = {}) {
    const explicitSections = content.sections;
    if (Array.isArray(explicitSections)) {
      return explicitSections
        .map(section => typeof section === 'string' ? section : section?.title || section?.heading || section?.name)
        .filter(Boolean)
        .map(section => String(section).toLowerCase());
    }
    if (explicitSections && typeof explicitSections === 'object') {
      return Object.keys(explicitSections).map(section => String(section).toLowerCase());
    }

    return Object.keys(this._normalizedSectionMap(content, content.type || content.metadata?.type || 'Source'))
      .map(section => String(section).toLowerCase());
  }

  _objectLooksLikeFacet(object = {}, facet = '') {
    const schema = ontology.getEntitySchema?.(object.type) || {};
    const text = [
      object.type,
      object.name,
      object.category,
      object.metadata?.category,
      schema.category,
      object.attributes?.name,
      object.attributes?.type,
      object.attributes?.role,
      object.attributes?.description
    ].filter(Boolean).join(' ').toLowerCase();

    const facetSignals = {
      data: ['data', 'dataset', 'variable', 'observation', 'input'],
      method: ['method', 'model', 'algorithm', 'workflow', 'computing', 'software', 'repository']
    };
    return (facetSignals[facet] || []).some(signal => text.includes(signal));
  }

  _buildResearchBrief(result, content = {}, admissionResult = {}) {
    const source = result.sourceObject || {};
    const attributes = source.attributes || {};
    const metadata = this._getNormalizedMetadata(content);
    const abstract = attributes.abstract || metadata.abstract || content.abstract || '';
    const authors = attributes.authors || metadata.authors || [];
    const authorText = Array.isArray(authors)
      ? authors.map(author => typeof author === 'string' ? author : author?.name).filter(Boolean).slice(0, 6).join(', ')
      : String(authors || '');
    const institutionText = this._collectAttributeValues([
      metadata.institutions,
      metadata.affiliations,
      metadata.institution,
      attributes.institution
    ]).slice(0, 5).join(', ');
    const title = attributes.title || source.name || metadata.title || result.input || 'Untitled source';
    const routeNodes = (result.workflowOutline?.nodes || [])
      .filter(node => node.id !== 'source' && node.label && !this._isGenericRouteLabel(node.label));
    const routeSummary = result.workflowOutline?.summary || '';
    const dataOrContextNode = routeNodes.find(node => ['data', 'context', 'resource'].includes(node.stage))
      || routeNodes[0];
    const methodNode = routeNodes.find(node => ['method', 'execution'].includes(node.stage));
    const evidenceNode = routeNodes.find(node => node.stage === 'evidence')
      || routeNodes[routeNodes.length - 1];
    const routeValue = routeNodes.length > 0
      ? routeNodes.slice(0, 4).map(node => node.label).join(' -> ')
      : 'Route still forming';
    const externalResources = result.externalResources || [];
    const strongestResource = externalResources.find(resource => ['repository', 'code', 'dataset'].includes(String(resource.type || '').toLowerCase()))
      || externalResources[0];
    const llmInsights = result.llmInsights || {};
    const sourceBriefInsight = llmInsights.sourceBrief || {};
    const sourceBriefKeyPoints = (sourceBriefInsight.keyPoints || [])
      .map((point, index) => this._normalizeSourceBriefPoint(point, index))
      .filter(Boolean)
      .slice(0, 4);
    const insightKeyPoints = (llmInsights.keyFindings || [])
      .slice(0, 3)
      .map((item, index) => ({
        id: item.id || `llm-finding-${index + 1}`,
        label: item.label || 'Key Finding',
        value: this._summarizeText(item.statement || item.value || item.label, 90),
        detail: this._summarizeText(item.detail || item.evidence || item.provenance?.sourceText || 'Source-grounded finding from deep extraction.', 180),
        source: 'llm-insight',
        provenance: item.provenance || item.section ? {
          ...(item.provenance || {}),
          section: item.section || item.provenance?.section
        } : null,
        support: {
          kind: 'llm-insight',
          sourceText: item.provenance?.sourceText || item.evidence || item.statement || null
        }
      }));

    const keyPoints = this._prioritizeSourceBriefPoints([
      ...sourceBriefKeyPoints,
      ...insightKeyPoints,
      {
        id: 'route',
        label: 'Core Route',
        value: this._summarizeText(routeValue, 90),
        detail: routeNodes.length > 0
          ? this._summarizeText(routeSummary || 'Main content route extracted from the source.', 180)
          : 'The available source material does not yet expose a clear content route.',
        support: {
          kind: 'research-route',
          routeNodeIds: routeNodes.map(node => node.id).slice(0, 6),
          routeQuality: result.workflowOutline?.provenance?.routeQuality?.level || null
        }
      },
      {
        id: 'method',
        label: 'Method / Mechanism',
        value: this._summarizeText(methodNode?.label || result.capabilityObjects?.[0]?.name || result.capabilityObjects?.[0]?.attributes?.name || 'Needs extraction', 70),
        detail: methodNode?.summary
          || result.capabilityObjects?.[0]?.attributes?.description
          || 'No explicit method, model, code path, or workflow mechanism is available yet.',
        support: {
          kind: 'method',
          routeNodeId: methodNode?.id || null,
          objectId: methodNode?.objectId || result.capabilityObjects?.[0]?.id || null
        }
      },
      {
        id: 'material',
        label: 'Input / Context',
        value: this._summarizeText(dataOrContextNode?.label || result.worldObjects?.[0]?.name || result.worldObjects?.[0]?.attributes?.name || 'Needs anchor', 70),
        detail: dataOrContextNode?.summary
          || result.worldObjects?.[0]?.attributes?.description
          || 'No verified data, resource, spatial, temporal, or Earth-system anchor was extracted yet.',
        support: {
          kind: 'material',
          routeNodeId: dataOrContextNode?.id || null,
          objectId: dataOrContextNode?.objectId || result.worldObjects?.[0]?.id || null
        }
      },
      {
        id: 'evidence',
        label: strongestResource ? 'Evidence / Resource' : 'Result / Evidence',
        value: this._summarizeText(evidenceNode?.label || result.evidenceObjects?.[0]?.attributes?.statement || result.evidenceObjects?.[0]?.name || strongestResource?.label || 'Needs verification', 70),
        detail: evidenceNode?.summary
          || result.evidenceObjects?.[0]?.attributes?.statement
          || strongestResource?.reviewHint
          || 'No claim-level evidence chain or linked resource is available yet.',
        support: {
          kind: strongestResource ? 'resource-evidence' : 'evidence',
          routeNodeId: evidenceNode?.id || null,
          objectId: evidenceNode?.objectId || result.evidenceObjects?.[0]?.id || null,
          resourceUrl: strongestResource?.url || null
        }
      }
    ].filter(point => !this._isGenericRouteLabel(point.value) && !this._isInternalRouteChild(point.label, point.value)));

    return {
      title,
      sourceType: source.type || result.sourceType || 'Source',
      authors: authorText,
      institutions: institutionText,
      year: attributes.year || metadata.year || metadata.publicationYear || null,
      venue: attributes.venue || metadata.venue || metadata.journal || null,
      url: attributes.url || attributes.doi || attributes.identifier || result.input || null,
      oneLine: this._summarizeText(sourceBriefInsight.oneLine || abstract || attributes.description || metadata.description || title, 280),
      keyPoints,
      confidence: result.confidence,
      provenance: {
        method: 'protocol-derived',
        llm: result.extractionMetadata?.llmExtraction?.success === true,
        admissionDepth: admissionResult.depth || result.depth
      }
    };
  }

  _prioritizeSourceBriefPoints(points = [], limit = 8) {
    const validPoints = points.filter(Boolean);
    const requiredFacets = ['route', 'method', 'material', 'evidence'];
    const selected = [];
    const seen = new Set();

    const addPoint = point => {
      const key = this._llmInsightKey('sourceBrief', point) || `${point.id || ''}:${point.label || ''}:${point.value || ''}`;
      if (!key || seen.has(key) || selected.length >= limit) return;
      seen.add(key);
      selected.push(point);
    };

    for (const facet of requiredFacets) {
      const point = validPoints.find(candidate => this._sourceBriefFacet(candidate) === facet);
      if (point) addPoint(point);
    }

    for (const point of validPoints) addPoint(point);

    return selected;
  }

  _buildWorkflowOutline(result, content = {}) {
    const contentRoute = this._buildContentWorkflowRoute(result, content);
    if (contentRoute.nodes.length >= 2) {
      return contentRoute;
    }

    const nodes = [];
    const edges = [];
    const source = result.sourceObject || {};

    if (source.id) {
      nodes.push({
        id: 'source',
        objectId: source.id,
        label: source.name || source.attributes?.title || 'Source',
        type: source.type || 'Source',
        summary: 'Primary research source for this project.',
        status: 'ready',
        children: this._sourceChildren(source)
      });
    }

    const routeObjects = [
      ...(result.capabilityObjects || []).slice(0, 8).map(object => ({ object, layer: 'capability' })),
      ...(result.worldObjects || []).slice(0, 5).map(object => ({ object, layer: 'world' })),
      ...(result.evidenceObjects || []).slice(0, 5).map(object => ({ object, layer: 'evidence' }))
    ];

    const routeNodes = routeObjects
      .map(({ object, layer }, index) => {
        const stage = this._classifyWorkflowStage(object, layer);
        return {
          id: `${stage.key}-${index + 1}`,
          objectId: object.id,
          label: object.name || object.attributes?.name || object.type || `${stage.label} node`,
          type: stage.label,
          stage: stage.key,
          stageOrder: stage.order,
          objectType: object.type || layer,
          summary: this._objectSummary(object, stage.fallbackSummary),
          status: object.confidence >= 0.7 ? 'ready' : 'review',
          children: this._objectChildren(object)
        };
      })
      .sort((a, b) => (a.stageOrder - b.stageOrder) || a.label.localeCompare(b.label))
      .slice(0, 10);

    nodes.push(...routeNodes);

    for (let i = 1; i < nodes.length; i += 1) {
      edges.push({
        from: i === 1 ? 'source' : nodes[i - 1].id,
        to: nodes[i].id,
        label: this._workflowEdgeLabel(nodes[i - 1], nodes[i])
      });
    }

    for (const relation of result.bridgeRelations || []) {
      edges.push({
        from: relation.from || relation.source || relation.sourceId || 'source',
        to: relation.to || relation.target || relation.targetId || 'source',
        label: relation.type || 'relates'
      });
    }

    return {
      title: 'Technical route',
      summary: nodes.length > 1
        ? 'A protocol-level route assembled from extracted source, capability, world, and evidence objects.'
        : 'Only the source capsule is available; deeper method and evidence nodes need richer source material.',
      nodes,
      edges,
      provenance: {
        method: 'protocol-derived',
        relationCount: result.bridgeRelations?.length || 0
      }
    };
  }

  _buildContentWorkflowRoute(result, content = {}) {
    const nodes = [];
    const edges = [];
    const routeObjects = [
      ...(result.capabilityObjects || []).map(object => ({ object, layer: 'capability' })),
      ...(result.worldObjects || []).map(object => ({ object, layer: 'world' })),
      ...(result.evidenceObjects || []).map(object => ({ object, layer: 'evidence' }))
    ];
    const objectsByStage = new Map();
    const stageFallbacks = this._buildRouteFallbacksFromMetadata(content);

    for (const item of routeObjects) {
      const stage = this._classifyWorkflowStage(item.object, item.layer);
      if (!objectsByStage.has(stage.key)) objectsByStage.set(stage.key, []);
      objectsByStage.get(stage.key).push(item.object);
    }

    const addStageNode = (stageKey) => {
      const stage = WORKFLOW_STAGE_DEFINITIONS[stageKey];
      const fallback = stageFallbacks[stageKey] || {};
      const objects = objectsByStage.get(stageKey) || [];
      const primary = objects.find(object => !this._isGenericRouteLabel(object.name || object.attributes?.name || object.type))
        || objects[0];
      let label = primary
        ? this._contentRouteLabel(primary, stageKey)
        : fallback.label;
      if (fallback.label && this._isLowInformationRouteLabel(label)) {
        label = fallback.label;
      }

      const stageSummary = fallback.summary || stage.fallbackSummary;
      let summary = primary
        ? this._objectSummary(primary, stageSummary) || stageSummary
        : stageSummary;
      if (fallback.summary && this._isLowInformationRouteLabel(label)) {
        summary = fallback.summary;
      }

      const primaryChildren = primary
        ? this._contentRouteChildren(primary, stageKey)
        : [];
      const children = [
        ...primaryChildren,
        ...(fallback.children || [])
      ].slice(0, 8);

      if (!label || this._isGenericRouteLabel(label)) return;

      nodes.push({
        id: `${stageKey}-${nodes.length + 1}`,
        objectId: primary?.id || null,
        label: this._summarizeText(label, 82),
        type: stage.label,
        stage: stage.key,
        stageOrder: stage.order,
        objectType: primary?.type || stage.label,
        summary: this._summarizeText(summary, 240),
        status: primary?.confidence >= 0.7 ? 'ready' : 'review',
        children
      });
    };

    addStageNode('data');
    addStageNode('method');
    addStageNode('execution');
    addStageNode('context');
    addStageNode('evidence');
    addStageNode('resource');

    nodes.sort((a, b) => (a.stageOrder - b.stageOrder) || a.label.localeCompare(b.label));

    for (let i = 1; i < nodes.length; i += 1) {
      edges.push({
        from: nodes[i - 1].id,
        to: nodes[i].id,
        label: this._workflowEdgeLabel(nodes[i - 1], nodes[i])
      });
    }

    return {
      title: 'Research route',
      summary: nodes.length >= 2
        ? 'Content-level route assembled from extracted data, method, context, and finding signals.'
        : 'The source does not yet expose enough content-level route material.',
      nodes,
      edges,
      provenance: {
        method: 'content-route',
        relationCount: result.bridgeRelations?.length || 0
      }
    };
  }

  _buildRouteFallbacksFromMetadata(content = {}) {
    const metadata = this._getNormalizedMetadata(content);
    const sections = this._normalizedSectionMap(content, metadata.type || content.type || 'Source');
    const source = {
      ...metadata,
      datasets: metadata.datasets || content.datasets,
      dataSources: metadata.dataSources || content.dataSources,
      variables: metadata.variables || content.variables,
      inputs: metadata.inputs || content.inputs,
      observations: metadata.observations || content.observations,
      models: metadata.models || content.models,
      methods: metadata.methods || content.methods,
      algorithms: metadata.algorithms || content.algorithms,
      workflows: metadata.workflows || content.workflows,
      regions: metadata.regions || content.regions,
      studyRegions: metadata.studyRegions || content.studyRegions,
      locations: metadata.locations || content.locations,
      hazards: metadata.hazards || content.hazards,
      risks: metadata.risks || content.risks,
      results: metadata.results || content.results,
      findings: metadata.findings || content.findings,
      claims: metadata.claims || content.claims,
      outputs: metadata.outputs || content.outputs,
      conclusions: metadata.conclusions || content.conclusions
    };

    const sectionFallbacks = {
      data: this._routeFallbackFromSections('data', sections, ['input data', 'target and evaluation data', 'data availability', 'data', 'dataset', 'observations']),
      method: this._routeFallbackFromSections('method', sections, ['model', 'method', 'algorithm', 'approach']),
      execution: this._routeFallbackFromSections('execution', sections, ['experiment', 'evaluation', 'validation', 'forecast lead time', 'return periods', 'workflow', 'training']),
      context: this._routeFallbackFromSections('context', sections, ['main', 'study area', 'continent', 'region', 'basin', 'watershed', 'hazard', 'risk']),
      evidence: this._routeFallbackFromSections('evidence', sections, ['result', 'finding', 'conclusion', 'discussion', 'improves', 'reliability', 'figures', 'tables']),
      resource: this._routeFallbackFromSections('resource', sections, ['code availability', 'data availability', 'supplementary'])
    };

    return {
      data: this._mergeRouteFallbacks(
        this._routeFallbackFromFields('data', source, ['datasets', 'dataSources', 'variables', 'inputs', 'observations']),
        sectionFallbacks.data
      ),
      method: this._mergeRouteFallbacks(
        this._routeFallbackFromFields('method', source, ['models', 'methods', 'algorithms', 'workflows']),
        sectionFallbacks.method
      ),
      execution: sectionFallbacks.execution,
      context: this._mergeRouteFallbacks(
        this._routeFallbackFromFields('context', source, ['regions', 'studyRegions', 'locations', 'hazards', 'risks']),
        sectionFallbacks.context
      ),
      evidence: this._mergeRouteFallbacks(
        this._routeFallbackFromFields('evidence', source, ['results', 'findings', 'claims', 'outputs', 'conclusions']),
        sectionFallbacks.evidence
      ),
      resource: sectionFallbacks.resource
    };
  }

  _mergeRouteFallbacks(primary = {}, secondary = {}) {
    const children = [
      ...(primary.children || []),
      ...(secondary.children || [])
    ];
    const labels = [
      primary.label,
      secondary.label
    ].filter(value => value && !this._isGenericRouteLabel(value));

    return {
      label: labels[0] || null,
      summary: primary.summary || secondary.summary || '',
      children: children.slice(0, 8)
    };
  }

  _routeFallbackFromFields(stageKey, source, fields) {
    const children = [];
    for (const field of fields) {
      for (const item of this._normalizeRouteItems(source[field])) {
        children.push({
          label: this._humanizeSectionTitle(field, field),
          value: this._summarizeText(item.label, 120),
          detail: item.detail || `${WORKFLOW_STAGE_DEFINITIONS[stageKey].label} detail from structured source metadata.`
        });
      }
    }

    const labels = children.map(child => child.value).filter(value => !this._isGenericRouteLabel(value));
    return {
      label: labels.length > 0 ? labels.slice(0, 2).join(' + ') : null,
      summary: labels.length > 0
        ? `${WORKFLOW_STAGE_DEFINITIONS[stageKey].label} route includes ${labels.slice(0, 4).join(', ')}.`
        : '',
      children: children.slice(0, 6)
    };
  }

  _routeFallbackFromSections(stageKey, sections = {}, roleHints = []) {
    const entries = Object.entries(sections)
      .map(([key, text]) => ({ key, text: typeof text === 'string' ? text.trim() : '' }))
      .filter(entry => entry.key && entry.text.length > 80);
    const matched = [];
    const seen = new Set();

    for (const hint of roleHints) {
      const normalizedHint = String(hint || '').toLowerCase();
      for (const entry of entries) {
        const normalizedKey = entry.key.toLowerCase();
        if (seen.has(normalizedKey)) continue;
        if (normalizedKey === normalizedHint || normalizedKey.includes(normalizedHint)) {
          seen.add(normalizedKey);
          matched.push(entry);
          break;
        }
      }
      if (matched.length >= 4) break;
    }

    const children = matched.map(entry => ({
      label: 'Section',
      value: this._humanizeSectionTitle(entry.key, entry.key),
      detail: this._summarizeText(this._firstSentence(entry.text) || entry.text, 220)
    }));
    const labels = children.map(child => child.value).filter(value => !this._isGenericRouteLabel(value));

    return {
      label: labels.length > 0 ? labels.slice(0, 2).join(' + ') : null,
      summary: matched.length > 0
        ? this._summarizeText(this._firstSentence(matched[0].text) || matched[0].text, 260)
        : '',
      children
    };
  }

  _normalizeRouteItems(value) {
    const values = Array.isArray(value) ? value : value ? [value] : [];
    return values
      .map(item => {
        if (typeof item === 'string' || typeof item === 'number') {
          return { label: String(item), detail: '' };
        }
        if (!item || typeof item !== 'object') return null;
        const label = item.name
          || item.title
          || item.label
          || item.statement
          || item.description
          || item.url
          || item.type;
        const detail = item.description
          || item.summary
          || item.role
          || item.type
          || '';
        return label ? { label: String(label), detail: this._summarizeText(String(detail), 160) } : null;
      })
      .filter(Boolean);
  }

  _contentRouteLabel(object = {}, stageKey = '') {
    const attributes = object.attributes || {};
    const explicit = this._pickRouteDisplayValue(attributes, stageKey)
      || object.name;
    if (explicit && !this._isGenericRouteLabel(explicit)) {
      return explicit;
    }

    const children = this._contentRouteChildren(object, stageKey);
    const childValues = children.map(child => child.value).filter(value => !this._isGenericRouteLabel(value));
    if (childValues.length > 0) return childValues.slice(0, 2).join(' + ');

    return null;
  }

  _pickRouteDisplayValue(attributes = {}, stageKey = '') {
    const fields = this._routeDisplayFields(stageKey);
    for (const field of fields) {
      const value = attributes[field];
      const displayValue = this._routeValueToText(value);
      if (displayValue && !this._isGenericRouteLabel(displayValue)) return displayValue;
    }
    return null;
  }

  _routeDisplayFields(stageKey = '') {
    const common = ['name', 'title', 'label', 'summary', 'description'];
    const byStage = {
      data: ['name', 'title', 'variable', 'variables', 'dataSource', 'source', 'role', 'description'],
      method: ['name', 'title', 'method', 'algorithm', 'architecture', 'approach', 'description'],
      context: ['name', 'title', 'region', 'location', 'scope', 'hazard', 'risk', 'description'],
      evidence: ['statement', 'finding', 'result', 'output', 'conclusion', 'summary', 'description']
    };
    return [...(byStage[stageKey] || []), ...common];
  }

  _routeValueToText(value) {
    if (value === undefined || value === null || value === '') return null;
    if (Array.isArray(value)) {
      const labels = this._normalizeRouteItems(value).map(item => item.label);
      return labels.length > 0 ? labels.slice(0, 2).join(' + ') : null;
    }
    if (typeof value === 'object') {
      return this._normalizeRouteItems(value)[0]?.label || null;
    }
    return String(value);
  }

  _contentRouteChildren(object = {}, stageKey = '') {
    const children = this._objectChildren(object)
      .filter(child => !this._isInternalRouteChild(child.label, child.value))
      .slice(0, 5);
    if (children.length > 0) return children;

    const provenanceText = object.provenance?.sourceText;
    return provenanceText ? [{
      label: WORKFLOW_STAGE_DEFINITIONS[stageKey]?.label || 'Source Detail',
      value: this._summarizeText(provenanceText, 120),
      detail: 'Source-grounded text attached to this route node.'
    }] : [];
  }

  _isInternalRouteChild(label, value) {
    const normalizedLabel = String(label || '').toLowerCase().trim();
    const normalizedValue = String(value || '').toLowerCase().trim();
    return ['object type', 'confidence', 'field', 'depth', 'extraction'].includes(normalizedLabel)
      || ['paper', 'source', 'deep', 'hybrid extraction', 'metadata only'].includes(normalizedValue)
      || /^\d+%$/.test(normalizedValue);
  }

  _isGenericRouteLabel(value) {
    const normalized = String(value || '').toLowerCase().trim();
    return !normalized
      || /^https?:\/\//i.test(normalized)
      || ['paper', 'source', 'repository', 'connected', 'global view', 'workflow readable', 'evidence available', 'method', 'methods', 'dataset', 'workflow', 'claim', 'main', 'results'].includes(normalized);
  }

  _isLowInformationRouteLabel(value) {
    const normalized = String(value || '').toLowerCase().trim();
    return this._isGenericRouteLabel(normalized)
      || /^https?:\/\//i.test(normalized)
      || ['data', 'resource', 'context', 'evidence', 'output', 'outputs'].includes(normalized)
      || (normalized.length > 70 && normalized.split(/\s+/).length > 7)
      || normalized.length < 4;
  }

  _classifyWorkflowStage(object, layer) {
    const schema = ontology.getEntitySchema?.(object?.type);
    const category = String(
      object?.metadata?.category
      || object?.category
      || schema?.category
      || ''
    ).toLowerCase();
    const schemaLayer = schema?.layer || layer;
    const stageKey = WORKFLOW_STAGE_BY_CATEGORY[category] || this._workflowStageKeyByLayer(schemaLayer || layer);
    return WORKFLOW_STAGE_DEFINITIONS[stageKey] || WORKFLOW_STAGE_DEFINITIONS.resource;
  }

  _workflowStageKeyByLayer(layer) {
    if (layer === 'world') return 'context';
    if (layer === 'evidence') return 'evidence';
    if (layer === 'source') return 'resource';
    return 'resource';
  }

  _workflowEdgeLabel(previous, next) {
    if (!previous || previous.id === 'source') return 'introduces';
    if (previous.stage === next.stage) return 'refines';
    if (next.stage === 'evidence') return 'supports';
    if (next.stage === 'context') return 'interprets';
    return 'feeds';
  }

  _mergeResearchRoutes(routes = []) {
    const normalizedRoutes = routes
      .map(route => this._normalizeResearchRoute(route))
      .filter(Boolean);
    if (normalizedRoutes.length === 0) return null;

    const result = {
      title: normalizedRoutes[0].title || 'Research route',
      summary: normalizedRoutes.map(route => route.summary).filter(Boolean)[0] || 'Content-level research route extracted from the source.',
      nodes: [],
      edges: [],
      provenance: {
        method: 'llm-research-route',
        routeCount: normalizedRoutes.length
      }
    };
    const nodeByKey = new Map();
    const edgeKeys = new Set();

    for (const route of normalizedRoutes) {
      for (const node of route.nodes || []) {
        const key = node.id || this._slugifyRouteId(node.label);
        if (!key || nodeByKey.has(key)) continue;
        nodeByKey.set(key, node);
      }
    }

    result.nodes = Array.from(nodeByKey.values())
      .sort((a, b) => (a.stageOrder - b.stageOrder) || a.label.localeCompare(b.label))
      .slice(0, 12);
    const validNodeIds = new Set(result.nodes.map(node => node.id));

    for (const route of normalizedRoutes) {
      for (const edge of route.edges || []) {
        if (!validNodeIds.has(edge.from) || !validNodeIds.has(edge.to)) continue;
        const key = `${edge.from}:${edge.to}:${edge.label || ''}`;
        if (edgeKeys.has(key)) continue;
        edgeKeys.add(key);
        result.edges.push(edge);
      }
    }

    if (result.edges.length === 0) {
      result.edges = this._routeEdgesFromNodeOrder(result.nodes);
    }

    return result.nodes.length >= 2 ? result : null;
  }

  _normalizeResearchRoute(route = {}) {
    if (!route || typeof route !== 'object' || !Array.isArray(route.nodes)) return null;

    const rawPairs = route.nodes
      .map((node, index) => ({ raw: node, normalized: this._normalizeResearchRouteNode(node, index), index }))
      .filter(pair => pair.normalized);
    if (rawPairs.length < 2) return null;

    const nodes = [];
    const usedIds = new Set();
    const idAliases = new Map();
    for (const pair of rawPairs) {
      const node = pair.normalized;
      let id = node.id;
      let suffix = 2;
      while (usedIds.has(id)) {
        id = `${node.id}-${suffix}`;
        suffix += 1;
      }
      usedIds.add(id);
      const normalizedNode = { ...node, id };
      nodes.push(normalizedNode);
      [pair.raw?.id, pair.raw?.label, pair.raw?.name, pair.raw?.title, String(pair.index + 1)].filter(Boolean).forEach(alias => {
        idAliases.set(String(alias), normalizedNode.id);
      });
    }

    const validNodeIds = new Set(nodes.map(node => node.id));
    const edges = [];
    const edgeKeys = new Set();
    for (const edge of route.edges || []) {
      const from = idAliases.get(String(edge?.from || edge?.source || '')) || edge?.from || edge?.source;
      const to = idAliases.get(String(edge?.to || edge?.target || '')) || edge?.to || edge?.target;
      if (!validNodeIds.has(from) || !validNodeIds.has(to) || from === to) continue;
      const normalizedEdge = {
        from,
        to,
        label: this._summarizeText(edge.label || edge.type || 'relates', 40)
      };
      const key = `${normalizedEdge.from}:${normalizedEdge.to}:${normalizedEdge.label}`;
      if (edgeKeys.has(key)) continue;
      edgeKeys.add(key);
      edges.push(normalizedEdge);
    }

    return {
      title: this._summarizeText(route.title || 'Research route', 80),
      summary: this._summarizeText(route.summary || route.description || 'Content-level route extracted from the source.', 260),
      nodes,
      edges: edges.length > 0 ? edges : this._routeEdgesFromNodeOrder(nodes),
      provenance: {
        method: 'llm-research-route',
        confidence: route.confidence || null
      }
    };
  }

  _normalizeResearchRouteNode(node = {}, index = 0) {
    if (!node || typeof node !== 'object') return null;
    const label = this._summarizeText(node.label || node.name || node.title || '', 82);
    if (!label || this._isGenericRouteLabel(label)) return null;

    const stage = this._normalizeWorkflowStage(node.stage || node.type || node.category);
    const definition = WORKFLOW_STAGE_DEFINITIONS[stage];
    const summary = this._summarizeText(
      node.summary
        || node.description
        || node.detail
        || node.provenance?.sourceText
        || node.support?.sourceText
        || definition.fallbackSummary,
      240
    );

    return {
      id: this._slugifyRouteId(node.id || label || `route-${index + 1}`),
      objectId: node.objectId || null,
      label,
      type: this._summarizeText(node.type || definition.label, 40),
      stage,
      stageOrder: definition.order,
      objectType: node.objectType || node.type || definition.label,
      summary,
      provenance: node.provenance && typeof node.provenance === 'object' ? node.provenance : null,
      support: node.support && typeof node.support === 'object'
        ? {
            objectId: node.support.objectId || node.objectId || null,
            resourceUrl: node.support.resourceUrl || node.resourceUrl || null,
            evidenceId: node.support.evidenceId || node.evidenceId || null,
            sourceText: node.support.sourceText || node.provenance?.sourceText || null
          }
        : {
            objectId: node.objectId || null,
            resourceUrl: node.resourceUrl || null,
            evidenceId: node.evidenceId || null,
            sourceText: node.provenance?.sourceText || null
          },
      status: this._normalizeRouteStatus(node.status),
      children: this._normalizeResearchRouteChildren(node.children || node.details || node.innerRoute)
    };
  }

  _normalizeResearchRouteChildren(children) {
    const items = Array.isArray(children) ? children : children ? [children] : [];
    return items
      .map((child, index) => {
        if (typeof child === 'string' || typeof child === 'number') {
          const value = this._summarizeText(String(child), 140);
          return value ? { label: `Detail ${index + 1}`, value, detail: '' } : null;
        }
        if (!child || typeof child !== 'object') return null;
        const label = this._summarizeText(child.label || child.name || child.title || `Detail ${index + 1}`, 60);
        const value = this._summarizeText(child.value || child.summary || child.description || child.detail || child.type || '', 140);
        const detail = this._summarizeText(child.detail || child.reason || child.evidence || child.description || '', 220);
        if (!value || this._isInternalRouteChild(label, value)) return null;
        return { label, value, detail };
      })
      .filter(Boolean)
      .slice(0, 8);
  }

  _normalizeWorkflowStage(value) {
    const normalized = String(value || '').toLowerCase().trim();
    if (WORKFLOW_STAGE_DEFINITIONS[normalized]) return normalized;
    if (WORKFLOW_STAGE_BY_CATEGORY[normalized]) return WORKFLOW_STAGE_BY_CATEGORY[normalized];
    if (['input', 'inputs', 'variable', 'variables', 'observation', 'observations'].includes(normalized)) return 'data';
    if (['model', 'models', 'algorithm', 'algorithms', 'analysis', 'methodology'].includes(normalized)) return 'method';
    if (['pipeline', 'process', 'procedure', 'step'].includes(normalized)) return 'execution';
    if (['region', 'location', 'spatial', 'temporal', 'hazard', 'risk'].includes(normalized)) return 'context';
    if (['output', 'outputs', 'result', 'results', 'finding', 'findings', 'claim', 'claims'].includes(normalized)) return 'evidence';
    return 'resource';
  }

  _normalizeRouteStatus(status) {
    const normalized = String(status || '').toLowerCase().trim();
    return ['ready', 'review', 'blocked', 'pending'].includes(normalized) ? normalized : 'review';
  }

  _routeEdgesFromNodeOrder(nodes = []) {
    const ordered = [...nodes].sort((a, b) => (a.stageOrder - b.stageOrder) || a.label.localeCompare(b.label));
    const edges = [];
    for (let i = 1; i < ordered.length; i += 1) {
      edges.push({
        from: ordered[i - 1].id,
        to: ordered[i].id,
        label: this._workflowEdgeLabel(ordered[i - 1], ordered[i])
      });
    }
    return edges;
  }

  _slugifyRouteId(value) {
    const slug = String(value || 'route-node')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 48);
    return slug || 'route-node';
  }

  _extractExternalResources(result, content = {}) {
    const resources = [];
    const addResource = (candidate = {}) => {
      const url = candidate.url || candidate.href || candidate.doi || candidate.repo;
      if (!url) return;
      const normalizedUrl = String(url);
      if (resources.some(resource => resource.url === normalizedUrl)) return;
      const type = candidate.type || this._classifyResourceUrl(normalizedUrl);
      resources.push({
        label: candidate.label || candidate.name || candidate.title || this._resourceLabelFromUrl(normalizedUrl),
        url: normalizedUrl,
        type,
        role: candidate.role || this._resourceRole(type),
        source: candidate.source || 'metadata',
        provenance: candidate.provenance || {
          method: candidate.source || 'metadata',
          section: candidate.section || candidate.source || 'metadata',
          sourceText: candidate.sourceText || (candidate.source === 'sourceText' ? normalizedUrl : null),
          url: normalizedUrl
        },
        investigationLabel: candidate.investigationLabel || this._resourceInvestigationLabel(type),
        routeRelevance: candidate.routeRelevance || this._resourceRouteRelevance(type, candidate.source),
        verificationFocus: candidate.verificationFocus || this._resourceVerificationFocus(type),
        reviewHint: candidate.reviewHint || this._resourceReviewHint(type, candidate.source)
      });
    };

    const sourceAttributes = result.sourceObject?.attributes || {};
    addResource({
      label: sourceAttributes.title || result.sourceObject?.name,
      url: sourceAttributes.url || sourceAttributes.identifier,
      type: result.sourceType === 'Repository' ? 'repository' : 'source',
      role: 'primary source',
      source: 'sourceObject',
      reviewHint: this._sourceResourceReviewHint(result.sourceObject, result.sourceType),
      routeRelevance: this._sourceResourceRouteRelevance(result.sourceObject, result.sourceType),
      verificationFocus: this._sourceResourceVerificationFocus(result.sourceObject, result.sourceType)
    });

    const metadata = content.metadata || {};
    for (const url of this._extractUrlsFromText(this._getSourceText(content))) {
      addResource({ url, source: 'sourceText' });
    }

    [
      metadata.url,
      metadata.htmlUrl,
      metadata.pdfUrl,
      metadata.doi,
      metadata.repo,
      metadata.repository,
      metadata.codeUrl,
      metadata.dataUrl
    ].forEach(url => addResource({ url, source: 'metadata' }));

    for (const list of [metadata.links, metadata.resources, metadata.datasets, metadata.codeRepositories]) {
      if (!Array.isArray(list)) continue;
      for (const item of list) {
        if (typeof item === 'string') addResource({ url: item, source: 'metadata' });
        else addResource({ ...item, source: 'metadata' });
      }
    }

    for (const object of [...(result.capabilityObjects || []), ...(result.evidenceObjects || [])]) {
      const attributes = object.attributes || {};
      [attributes.url, attributes.doi, attributes.repo, attributes.repository, attributes.source].forEach(url => {
        addResource({
          label: object.name || attributes.name || object.type,
          url,
          type: object.type === 'Dataset' ? 'dataset' : undefined,
          role: object.type || 'object source',
          source: 'object'
        });
      });
    }

    return resources.slice(0, 12);
  }

  _extractVisualEvidence(content = {}, result = {}) {
    const visuals = [];
    const metadata = content.metadata || {};
    const provenance = content.provenance || {};
    const sourceUrl = provenance.url
      || metadata.url
      || metadata.htmlUrl
      || metadata.doi
      || result.sourceObject?.attributes?.url
      || result.input;

    const addVisual = (candidate = {}, kind = 'figure', index = 0) => {
      const caption = this._summarizeText(
        candidate.caption || candidate.description || candidate.text || candidate.title || '',
        520
      );
      if (!caption) return;

      const label = candidate.number || candidate.label || candidate.name || `${kind === 'table' ? 'Table' : 'Figure'} ${index + 1}`;
      const role = this._visualEvidenceRole(caption, kind);
      const id = `${kind}-${this._slugifyRouteId(label)}-${index + 1}`;

      visuals.push({
        id,
        kind,
        label,
        title: this._summarizeText(label, 90),
        caption,
        imageUrl: candidate.imageUrl || candidate.url || candidate.href || null,
        originalImageUrl: candidate.originalImageUrl || null,
        tableData: kind === 'table' ? this._normalizeTableData(candidate) : null,
        sourceUrl,
        source: candidate.source || provenance.source || 'source-structure',
        routeRole: role,
        supports: this._visualEvidenceSupport(caption, role),
        readHint: this._visualEvidenceReadHint(role, kind),
        provenance: {
          doi: provenance.doi || metadata.doi || null,
          retrievedAt: provenance.retrievedAt || null,
          extraction: 'publisher-structure'
        }
      });
    };

    (Array.isArray(content.figures) ? content.figures : [])
      .slice(0, 12)
      .forEach((figure, index) => addVisual(figure, 'figure', index));

    (Array.isArray(content.tables) ? content.tables : [])
      .slice(0, 8)
      .forEach((table, index) => addVisual(table, 'table', index));

    this._applyFigureAnalyses(visuals, result.llmInsights?.figureAnalyses || [], { sourceUrl, metadata, provenance });

    return this._dedupeVisualEvidence(visuals);
  }

  _applyFigureAnalyses(visuals = [], analyses = [], context = {}) {
    for (const [index, analysis] of (analyses || []).entries()) {
      let visual = this._matchVisualAnalysis(visuals, analysis);
      if (!visual) {
        visual = this._visualEvidenceFromAnalysis(analysis, index, context);
        if (!visual) continue;
        visuals.push(visual);
      }

      const interpretation = this._summarizeText(
        analysis.interpretation
        || analysis.explanation
        || analysis.statement
        || analysis.detail
        || '',
        360
      );
      const generation = this._summarizeText(
        analysis.howProduced
        || analysis.method
        || analysis.generatedFrom
        || '',
        260
      );
      const supportedClaim = this._summarizeText(
        analysis.supports
        || analysis.supportedClaim
        || analysis.claim
        || '',
        260
      );

      visual.interpretation = interpretation || visual.interpretation;
      visual.howProduced = generation || visual.howProduced;
      visual.supportedClaim = supportedClaim || visual.supportedClaim;
      visual.routeNodeId = analysis.routeNodeId || analysis.targetId || visual.routeNodeId || null;
      visual.readHint = interpretation
        ? `${visual.readHint} ${interpretation}`
        : visual.readHint;
      visual.provenance = {
        ...(visual.provenance || {}),
        analysis: 'llm-insight',
        section: analysis.section || analysis.provenance?.section || visual.provenance?.section
      };
    }
  }

  _visualEvidenceFromAnalysis(analysis = {}, index = 0, context = {}) {
    if (!analysis || typeof analysis !== 'object') return null;
    const label = analysis.figureId || analysis.figure || analysis.label || analysis.title || `Figure ${index + 1}`;
    const caption = this._summarizeText(
      analysis.caption
      || analysis.provenance?.sourceText
      || analysis.interpretation
      || analysis.statement
      || '',
      520
    );
    if (!caption) return null;

    const kind = String(analysis.kind || analysis.type || label || '').toLowerCase().includes('table') ? 'table' : 'figure';
    const role = this._visualEvidenceRole(`${caption} ${analysis.interpretation || ''} ${analysis.supportedClaim || ''}`, kind);
    const id = `${kind}-${this._slugifyRouteId(label)}-${index + 1}`;
    return {
      id,
      kind,
      label: this._summarizeText(label, 90),
      title: this._summarizeText(label, 90),
      caption,
      imageUrl: analysis.imageUrl || analysis.url || null,
      sourceUrl: analysis.sourceUrl || context.sourceUrl || null,
      source: 'llm-figure-analysis',
      routeRole: role,
      supports: this._visualEvidenceSupport(caption, role),
      readHint: this._visualEvidenceReadHint(role, kind),
      routeNodeId: analysis.routeNodeId || analysis.targetId || null,
      provenance: {
        doi: context.provenance?.doi || context.metadata?.doi || null,
        retrievedAt: context.provenance?.retrievedAt || null,
        extraction: 'llm-figure-analysis',
        section: analysis.section || analysis.provenance?.section || null,
        sourceText: analysis.provenance?.sourceText || analysis.caption || null
      }
    };
  }

  _matchVisualAnalysis(visuals = [], analysis = {}) {
    const candidates = [
      analysis.figureId,
      analysis.figure,
      analysis.label,
      analysis.title,
      analysis.caption,
      analysis.provenance?.sourceText
    ].filter(Boolean).map(value => String(value).toLowerCase());

    const exact = visuals.find(visual => {
      const haystack = `${visual.id} ${visual.label} ${visual.title} ${visual.caption}`.toLowerCase();
      return candidates.some(candidate => candidate && haystack.includes(candidate));
    });
    if (exact) return exact;

    const analysisText = [
      analysis.figureId,
      analysis.figure,
      analysis.label,
      analysis.title,
      analysis.caption,
      analysis.interpretation,
      analysis.supportedClaim,
      analysis.provenance?.sourceText
    ].filter(Boolean).join(' ');

    let best = null;
    let bestScore = 0;
    for (const visual of visuals) {
      const visualText = [visual.label, visual.title, visual.caption].filter(Boolean).join(' ');
      const score = this._textOverlapScore(analysisText, visualText);
      if (score > bestScore) {
        best = visual;
        bestScore = score;
      }
    }

    return bestScore >= 0.18 ? best : null;
  }

  _dedupeVisualEvidence(visuals = []) {
    const deduped = [];
    for (const visual of visuals) {
      const match = deduped.find(existing => {
        if (existing.id && visual.id && existing.id === visual.id) return true;
        const labelMatch = String(existing.label || '').toLowerCase() === String(visual.label || '').toLowerCase();
        const captionOverlap = this._textOverlapScore(existing.caption || '', visual.caption || '');
        return labelMatch || captionOverlap >= 0.65;
      });
      if (!match) {
        deduped.push(visual);
        continue;
      }

      match.interpretation = match.interpretation || visual.interpretation || null;
      match.howProduced = match.howProduced || visual.howProduced || null;
      match.supportedClaim = match.supportedClaim || visual.supportedClaim || null;
      match.routeNodeId = match.routeNodeId || visual.routeNodeId || null;
      match.imageUrl = match.imageUrl || visual.imageUrl || null;
      match.originalImageUrl = match.originalImageUrl || visual.originalImageUrl || null;
      match.tableData = match.tableData || visual.tableData || null;
      match.sourceUrl = match.sourceUrl || visual.sourceUrl || null;
      match.provenance = {
        ...(match.provenance || {}),
        ...(visual.provenance || {}),
        mergedFromDuplicate: true
      };
    }
    return deduped;
  }

  _visualEvidenceRole(caption = '', kind = 'figure') {
    const value = String(caption || '').toLowerCase();
    if (value.includes('method') || value.includes('architecture') || value.includes('workflow') || value.includes('pipeline')) {
      return 'Method structure';
    }
    if (value.includes('data') || value.includes('dataset') || value.includes('variable') || value.includes('sample')) {
      return 'Input evidence';
    }
    if (value.includes('performance') || value.includes('score') || value.includes('precision') || value.includes('recall') || value.includes('accuracy') || value.includes('reliability')) {
      return 'Evaluation evidence';
    }
    if (value.includes('result') || value.includes('distribution') || value.includes('comparison') || value.includes('difference')) {
      return 'Result evidence';
    }
    return kind === 'table' ? 'Tabular evidence' : 'Visual evidence';
  }

  _visualEvidenceSupport(caption = '', role = 'Visual evidence') {
    const first = this._firstSentence(caption) || caption;
    return `${role}: ${this._summarizeText(first, 180)}`;
  }

  _visualEvidenceReadHint(role = 'Visual evidence', kind = 'figure') {
    const objectName = kind === 'table' ? 'table' : 'figure';
    if (role === 'Evaluation evidence') {
      return `Use this ${objectName} to inspect metrics, baselines, uncertainty, and whether the reported comparison supports the paper's claim.`;
    }
    if (role === 'Method structure') {
      return `Use this ${objectName} to reconstruct the method path before trusting the workflow graph.`;
    }
    if (role === 'Input evidence') {
      return `Use this ${objectName} to verify input variables, data coverage, or source material behind the route.`;
    }
    return `Use this ${objectName} as direct source evidence; verify axes, caption, context, and the claim it supports.`;
  }

  _normalizeTableData(candidate = {}) {
    const headers = Array.isArray(candidate.headers)
      ? candidate.headers.map(value => this._summarizeText(value, 120)).filter(Boolean)
      : [];
    const rows = Array.isArray(candidate.rows)
      ? candidate.rows
          .filter(row => Array.isArray(row))
          .map(row => row.map(value => this._summarizeText(value, 180)).filter(value => value !== ''))
          .filter(row => row.length > 0)
          .slice(0, 50)
      : [];

    if (headers.length === 0 && rows.length === 0) return null;
    return { headers, rows };
  }

  _buildResourceGraph(result = {}, content = {}) {
    const nodes = [];
    const edges = [];
    const nodeIds = new Set();
    const addNode = (node) => {
      if (!node?.id || nodeIds.has(node.id)) return;
      nodeIds.add(node.id);
      nodes.push(node);
    };

    const resources = result.externalResources || [];
    for (const resource of resources) {
      const id = this._resourceGraphNodeId(resource);
      addNode({
        id,
        kind: 'resource',
        label: this._summarizeText(resource.label || resource.url || 'Resource', 90),
        type: resource.type || 'external',
        role: resource.role || this._resourceRole(resource.type),
        url: resource.url,
        routeRelevance: resource.routeRelevance || '',
        verificationFocus: resource.verificationFocus || '',
        reviewHint: resource.reviewHint || '',
        reproducibilityGrade: resource.reproducibilityGrade || resource.enrichment?.grade || null,
        source: resource.source || 'resource',
        provenance: resource.provenance || null
      });
    }

    for (const routeNode of result.workflowOutline?.nodes || []) {
      addNode({
        id: `route-${routeNode.id}`,
        kind: 'route-node',
        label: routeNode.label,
        type: routeNode.stage || 'route',
        summary: routeNode.summary || '',
        routeNodeId: routeNode.id
      });
    }

    for (const evidence of result.evidenceObjects || []) {
      addNode({
        id: `evidence-${evidence.id}`,
        kind: 'evidence',
        label: this._summarizeText(evidence.attributes?.statement || evidence.attributes?.name || evidence.name || evidence.type, 90),
        summary: this._summarizeText(evidence.attributes?.statement || evidence.provenance?.sourceText || '', 220)
      });
    }

    for (const visual of result.visualEvidence || []) {
      addNode({
        id: visual.id,
        kind: visual.kind || 'figure',
        label: this._summarizeText(visual.label || visual.title || 'Visual evidence', 90),
        type: visual.kind || 'figure',
        summary: this._summarizeText(visual.interpretation || visual.caption || visual.supports || '', 260),
        routeNodeId: visual.routeNodeId || null,
        sourceUrl: visual.sourceUrl || null
      });
    }

    for (const resource of resources) {
      const resourceId = this._resourceGraphNodeId(resource);
      const resourceText = [
        resource.label,
        resource.type,
        resource.role,
        resource.routeRelevance,
        resource.verificationFocus,
        resource.reviewHint
      ].filter(Boolean).join(' ');

      for (const routeNode of result.workflowOutline?.nodes || []) {
        const stageMatch = this._resourceMatchesRouteStage(resource, routeNode.stage);
        const overlap = this._textOverlapScore(resourceText, `${routeNode.label} ${routeNode.summary}`);
        if (stageMatch || overlap >= 0.12) {
          edges.push({
            from: resourceId,
            to: `route-${routeNode.id}`,
            label: stageMatch ? this._resourceRouteEdgeLabel(resource, routeNode.stage) : 'relates_to',
            confidence: stageMatch ? 0.65 : 0.5,
            provenance: {
              method: stageMatch ? 'resource-role' : 'text-overlap',
              overlap,
              sourceText: resource.provenance?.sourceText || null,
              section: resource.provenance?.section || null,
              url: resource.provenance?.url || resource.url || null
            }
          });
        }
      }

      for (const evidence of result.evidenceObjects || []) {
        const overlap = this._textOverlapScore(resourceText, [
          evidence.attributes?.statement,
          evidence.attributes?.description,
          evidence.provenance?.sourceText
        ].filter(Boolean).join(' '));
        if (overlap >= 0.14) {
          edges.push({
            from: resourceId,
            to: `evidence-${evidence.id}`,
            label: 'grounds',
            confidence: 0.55,
            provenance: {
              method: 'text-overlap',
              overlap,
              sourceText: resource.provenance?.sourceText || null,
              section: resource.provenance?.section || null,
              url: resource.provenance?.url || resource.url || null
            }
          });
        }
      }
    }

    for (const link of result.llmInsights?.resourceLinks || []) {
      const resourceId = this._resolveResourceLinkResourceId(link, resources);
      const targetId = this._resolveResourceLinkTargetId(link, result);
      if (!resourceId || !targetId) continue;

      edges.push({
        from: resourceId,
        to: targetId,
        label: this._summarizeText(link.relation || link.role || link.label || 'supports', 40),
        confidence: typeof link.confidence === 'number' ? Math.min(Math.max(link.confidence, 0), 1) : 0.72,
        provenance: {
          method: 'llm-resource-link',
          role: link.role || null,
          relation: link.relation || null,
          section: link.section || link.provenance?.section || null,
          sourceText: link.provenance?.sourceText || link.evidence || null
        }
      });
    }

    const edgeByKey = new Map();
    for (const edge of edges) {
      if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to) || edge.from === edge.to) continue;
      const key = `${edge.from}:${edge.to}:${edge.label}`;
      const existing = edgeByKey.get(key);
      if (!existing || edge.provenance?.method === 'llm-resource-link') {
        edgeByKey.set(key, edge);
      }
    }
    const uniqueEdges = Array.from(edgeByKey.values());

    return {
      nodes,
      edges: uniqueEdges,
      summary: {
        resourceCount: resources.length,
        repositoryCount: resources.filter(resource => String(resource.type || '').toLowerCase() === 'repository').length,
        datasetCount: resources.filter(resource => String(resource.type || '').toLowerCase() === 'dataset').length,
        linkedResourceCount: new Set(uniqueEdges.map(edge => edge.from).filter(id => id.startsWith('resource-'))).size,
        reusableResourceCount: resources.filter(resource => ['repository', 'code', 'dataset', 'supplement'].includes(String(resource.type || '').toLowerCase())).length
      },
      provenance: {
        method: 'protocol-derived',
        warning: resources.length > 0 && uniqueEdges.length === 0
          ? 'Resources were found but could not be linked to route or evidence nodes.'
          : undefined
      }
    };
  }

  _resourceGraphNodeId(resource = {}) {
    return `resource-${this._slugifyRouteId(resource.url || resource.label || resource.type || 'resource')}`;
  }

  _resolveResourceLinkResourceId(link = {}, resources = []) {
    if (link.resourceId && String(link.resourceId).startsWith('resource-')) return link.resourceId;
    const url = this._normalizeExtractedUrl(this._resourceLinkUrl(link));
    const match = resources.find(resource => {
      if (url && this._urlsEquivalent(resource.url, url)) return true;
      if (link.resourceId && this._resourceGraphNodeId(resource) === link.resourceId) return true;
      const label = String(link.label || link.resourceLabel || link.resource?.label || link.resource || '').toLowerCase();
      if (label && String(resource.label || '').toLowerCase() === label) return true;
      return false;
    });
    return match ? this._resourceGraphNodeId(match) : null;
  }

  _resourceLinkUrl(link = {}) {
    if (typeof link.resource === 'string') return link.url || link.resourceUrl || link.href || link.resource;
    return link.url
      || link.resourceUrl
      || link.href
      || link.resource?.url
      || link.resource?.href
      || '';
  }

  _urlsEquivalent(a, b) {
    const normalize = value => String(value || '').trim().replace(/\/+$/, '').toLowerCase();
    const left = normalize(a);
    const right = normalize(b);
    return Boolean(left && right && (left === right || left.startsWith(right) || right.startsWith(left)));
  }

  _resolveResourceLinkTargetId(link = {}, result = {}) {
    const routeTarget = link.routeNodeId || link.target || link.targetId;
    if (routeTarget) {
      const normalized = String(routeTarget);
      const direct = normalized.startsWith('route-') ? normalized : `route-${normalized}`;
      if ((result.workflowOutline?.nodes || []).some(node => `route-${node.id}` === direct)) {
        return direct;
      }

      const byLabel = (result.workflowOutline?.nodes || []).find(node => {
        const target = normalized.toLowerCase();
        return String(node.label || '').toLowerCase() === target
          || String(node.stage || '').toLowerCase() === target;
      });
      if (byLabel) return `route-${byLabel.id}`;
    }

    const evidenceTarget = link.evidenceId || link.claimId;
    if (evidenceTarget) {
      const direct = String(evidenceTarget).startsWith('evidence-') ? String(evidenceTarget) : `evidence-${evidenceTarget}`;
      if ((result.evidenceObjects || []).some(object => `evidence-${object.id}` === direct)) {
        return direct;
      }
    }

    const visualTarget = link.figureId || link.visualId || link.tableId;
    if (visualTarget) {
      const normalized = String(visualTarget).toLowerCase();
      const visual = (result.visualEvidence || []).find(item => {
        return String(item.id || '').toLowerCase() === normalized
          || String(item.label || '').toLowerCase() === normalized
          || String(item.title || '').toLowerCase() === normalized;
      });
      if (visual) return visual.id;
    }

    return null;
  }

  _resourceMatchesRouteStage(resource = {}, stage = '') {
    const type = String(resource.type || '').toLowerCase();
    const role = String(resource.role || '').toLowerCase();
    if (stage === 'data') return ['dataset', 'data'].includes(type) || role.includes('data');
    if (stage === 'method' || stage === 'execution') return ['repository', 'code', 'software'].includes(type) || role.includes('code') || role.includes('software');
    if (stage === 'evidence') return ['source', 'paper', 'doi', 'supplement'].includes(type) || role.includes('evidence') || role.includes('source');
    return false;
  }

  _resourceRouteEdgeLabel(resource = {}, stage = '') {
    const type = String(resource.type || '').toLowerCase();
    if (stage === 'data') return 'provides_input';
    if (stage === 'method' || stage === 'execution') return type === 'repository' ? 'may_implement' : 'supports_method';
    if (stage === 'evidence') return 'supports_evidence';
    return 'relates_to';
  }

  _buildEvidenceGraph(result = {}, content = {}) {
    const nodes = [];
    const edges = [];
    const nodeIds = new Set();

    const addNode = (node) => {
      if (!node?.id || nodeIds.has(node.id)) return;
      nodeIds.add(node.id);
      nodes.push(node);
    };

    for (const object of result.evidenceObjects || []) {
      const attributes = object.attributes || {};
      addNode({
        id: object.id,
        kind: 'claim',
        label: this._summarizeText(attributes.statement || attributes.name || object.name || object.type || 'Evidence', 90),
        summary: this._summarizeText(attributes.statement || attributes.description || object.provenance?.sourceText || '', 260),
        provenance: object.provenance || null,
        confidence: object.metadata?.confidence ?? object.confidence ?? null
      });
    }

    for (const visual of result.visualEvidence || []) {
      addNode({
        id: visual.id,
        kind: visual.kind || 'figure',
        label: this._summarizeText(visual.label || visual.title || 'Visual evidence', 90),
        summary: this._summarizeText(visual.caption || visual.supports || '', 360),
        sourceUrl: visual.sourceUrl,
        imageUrl: visual.imageUrl || null,
        role: visual.routeRole || visual.role || 'Visual evidence',
        provenance: visual.provenance || null
      });
    }

    for (const resource of result.externalResources || []) {
      const id = this._resourceGraphNodeId(resource);
      addNode({
        id,
        kind: 'resource',
        label: this._summarizeText(resource.label || resource.url || 'Resource', 90),
        summary: this._summarizeText(resource.reviewHint || resource.routeRelevance || resource.role || '', 260),
        sourceUrl: resource.url,
        role: resource.role || resource.type || 'resource'
      });
    }

    for (const node of result.workflowOutline?.nodes || []) {
      if (node.stage !== 'evidence') continue;
      addNode({
        id: `route-${node.id}`,
        kind: 'route-evidence',
        label: node.label,
        summary: node.summary,
        routeNodeId: node.id
      });
    }

    const evidenceObjects = result.evidenceObjects || [];
    const visuals = result.visualEvidence || [];
    const resources = result.externalResources || [];

    for (const evidence of evidenceObjects) {
      const evidenceText = [
        evidence.attributes?.statement,
        evidence.attributes?.description,
        evidence.provenance?.sourceText
      ].filter(Boolean).join(' ');

      for (const visual of visuals) {
        const overlap = this._textOverlapScore(evidenceText, visual.caption || visual.supports || '');
        const roleMatch = /evaluation|result|evidence/i.test(visual.routeRole || visual.role || '');
        if (overlap >= 0.16 || roleMatch) {
          edges.push({
            from: evidence.id,
            to: visual.id,
            label: 'supported_by',
            confidence: overlap >= 0.16 ? 0.7 : 0.45,
            provenance: {
              method: overlap >= 0.16 ? 'text-overlap' : 'visual-role',
              overlap
            }
          });
        }
      }

      for (const resource of resources) {
        const resourceId = this._resourceGraphNodeId(resource);
        const overlap = this._textOverlapScore(evidenceText, `${resource.label || ''} ${resource.role || ''} ${resource.routeRelevance || ''}`);
        if (overlap >= 0.14) {
          edges.push({
            from: evidence.id,
            to: resourceId,
            label: 'grounded_in',
            confidence: 0.6,
            provenance: { method: 'text-overlap', overlap }
          });
        }
      }
    }

    for (const routeNode of result.workflowOutline?.nodes || []) {
      if (routeNode.stage !== 'evidence') continue;
      for (const visual of visuals) {
        const overlap = this._textOverlapScore(`${routeNode.label} ${routeNode.summary}`, visual.caption || '');
        if (overlap >= 0.12 || /evaluation|result/i.test(visual.routeRole || '')) {
          edges.push({
            from: `route-${routeNode.id}`,
            to: visual.id,
            label: 'review_with',
            confidence: overlap >= 0.12 ? 0.65 : 0.45,
            provenance: { method: overlap >= 0.12 ? 'text-overlap' : 'visual-role', overlap }
          });
        }
      }
    }

    const seenEdges = new Set();
    const uniqueEdges = edges.filter(edge => {
      if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to) || edge.from === edge.to) return false;
      const key = `${edge.from}:${edge.to}:${edge.label}`;
      if (seenEdges.has(key)) return false;
      seenEdges.add(key);
      return true;
    });

    return {
      nodes,
      edges: uniqueEdges,
      summary: {
        claimCount: nodes.filter(node => node.kind === 'claim').length,
        visualCount: nodes.filter(node => ['figure', 'table'].includes(node.kind)).length,
        resourceCount: nodes.filter(node => node.kind === 'resource').length,
        linkedClaimCount: new Set(uniqueEdges.map(edge => edge.from).filter(id => evidenceObjects.some(object => object.id === id))).size
      },
      provenance: {
        method: 'protocol-derived',
        warning: uniqueEdges.length === 0 ? 'No claim-level evidence links could be established from extracted objects.' : undefined
      }
    };
  }

  _textOverlapScore(left = '', right = '') {
    const leftTokens = this._significantTokens(left);
    const rightTokens = this._significantTokens(right);
    if (leftTokens.size === 0 || rightTokens.size === 0) return 0;
    let intersection = 0;
    for (const token of leftTokens) {
      if (rightTokens.has(token)) intersection += 1;
    }
    return intersection / Math.min(leftTokens.size, rightTokens.size);
  }

  _significantTokens(value = '') {
    const stop = new Set([
      'the', 'and', 'for', 'with', 'from', 'that', 'this', 'are', 'was', 'were',
      'have', 'has', 'had', 'into', 'over', 'under', 'between', 'using', 'used',
      'source', 'section', 'figure', 'table', 'data', 'model'
    ]);

    const tokens = String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .split(/\s+/)
      .filter(token => token.length >= 4 && !stop.has(token));

    return new Set(tokens.slice(0, 80));
  }

  _assessGraphTraceability(result = {}) {
    const routeNodes = (result.workflowOutline?.nodes || [])
      .filter(node => node?.id && node.id !== 'source' && !this._isGenericRouteLabel(node.label || node.name || node.title || ''));
    const routeEdges = Array.isArray(result.workflowOutline?.edges) ? result.workflowOutline.edges : [];
    const objects = [
      ...(result.capabilityObjects || []),
      ...(result.worldObjects || []),
      ...(result.evidenceObjects || [])
    ];
    const resourceEdges = result.resourceGraph?.edges || [];
    const evidenceEdges = result.evidenceGraph?.edges || [];
    const details = [];

    for (const node of routeNodes) {
      const routeId = `route-${node.id}`;
      const resourceTrace = this._routeNodeResourceTrace(routeId, result.resourceGraph || {});
      const linkedEvidence = evidenceEdges.some(edge => edge.from === routeId || edge.to === routeId);
      const linkedRoute = routeEdges.some(edge => edge.from === node.id || edge.to === node.id);
      const objectMatch = this._findTraceableObjectForRouteNode(node, objects);
      const groundedObject = objectMatch && this._hasGroundingProvenance(objectMatch.provenance);
      const groundedRouteNode = this._isGroundedRouteNode(node);

      let level = 'untraced';
      let reason = 'route node has no object, resource, evidence, or route support';
      if (groundedRouteNode || groundedObject || resourceTrace.level === 'strong' || linkedEvidence) {
        level = 'traceable';
        reason = groundedRouteNode
          ? 'route node has source-grounded provenance or support'
          : groundedObject
            ? 'route node maps to a source-grounded object'
            : resourceTrace.level === 'strong'
              ? 'route node is linked to a resource'
              : 'route node is linked to evidence';
      } else if (objectMatch || resourceTrace.level === 'weak' || linkedRoute) {
        level = 'weak';
        reason = objectMatch
          ? 'route node maps to an object without strong provenance'
          : resourceTrace.level === 'weak'
            ? resourceTrace.reason
            : 'route node is only connected inside the route outline';
      }

      details.push({
        id: node.id,
        label: node.label,
        stage: node.stage,
        level,
        reason,
        objectId: objectMatch?.id || node.objectId || null
      });
    }

    const total = details.length;
    const traceable = details.filter(item => item.level === 'traceable');
    const weak = details.filter(item => item.level === 'weak');
    const untraced = details.filter(item => item.level === 'untraced');
    const score = total > 0
      ? Math.round(((traceable.length + weak.length * 0.5) / total) * 100)
      : 100;

    let level = 'traceable';
    const reasons = [];
    if (total === 0) {
      level = 'unknown';
      reasons.push('no content-level route nodes were available for traceability assessment');
    } else if (traceable.length === 0 || score < 50 || untraced.length > 0) {
      level = 'weak';
      if (traceable.length === 0) reasons.push('no route node is strongly linked to source-grounded objects, evidence, or reusable resources');
      if (untraced.length > 0) reasons.push(`untraced route nodes: ${untraced.slice(0, 4).map(item => item.label).join(', ')}`);
      if (score < 50) reasons.push('less than half of route nodes have object/resource/evidence support');
    } else if (score < 80 || weak.length > 0) {
      level = 'partial';
      reasons.push(`weakly traced route nodes: ${weak.slice(0, 4).map(item => item.label).join(', ')}`);
    }

    return {
      level,
      score,
      routeNodeCount: total,
      traceableNodeCount: traceable.length,
      weakNodeCount: weak.length,
      untracedNodeCount: untraced.length,
      details,
      reasons
    };
  }

  _routeNodeResourceTrace(routeId, resourceGraph = {}) {
    const edges = resourceGraph.edges || [];
    const nodes = resourceGraph.nodes || [];
    const resourceById = new Map(nodes.filter(node => node.kind === 'resource').map(node => [node.id, node]));
    let weakReason = '';

    for (const edge of edges) {
      if (edge.from !== routeId && edge.to !== routeId) continue;
      const resourceId = edge.from === routeId ? edge.to : edge.from;
      const resource = resourceById.get(resourceId);
      if (!resource) continue;
      const type = String(resource.type || '').toLowerCase();
      const method = String(edge.provenance?.method || '').toLowerCase();
      const reusable = ['dataset', 'repository', 'code', 'software', 'supplement', 'model', 'documentation'].includes(type);
      if (method === 'llm-resource-link' || reusable) {
        return { level: 'strong', reason: 'route node is linked to a reusable or agent-grounded resource' };
      }
      weakReason = 'route node is only linked to a generic source/resource';
    }

    return weakReason ? { level: 'weak', reason: weakReason } : { level: 'none', reason: '' };
  }

  _findTraceableObjectForRouteNode(node = {}, objects = []) {
    const directId = node.objectId || node.id;
    const direct = objects.find(object => object.id === directId || object.attributes?.id === directId);
    if (direct) return direct;

    const nodeText = [
      node.label,
      node.summary,
      node.type,
      node.stage,
      ...(node.children || []).map(child => `${child.label || ''} ${child.value || ''} ${child.detail || ''}`)
    ].filter(Boolean).join(' ');

    let best = null;
    let bestScore = 0;
    for (const object of objects) {
      const objectText = [
        object.id,
        object.type,
        object.attributes?.name,
        object.attributes?.description,
        object.attributes?.statement,
        object.provenance?.sourceText
      ].filter(Boolean).join(' ');
      const score = this._textOverlapScore(nodeText, objectText);
      if (score > bestScore) {
        best = object;
        bestScore = score;
      }
    }

    return bestScore >= 0.18 ? best : null;
  }

  _buildExtractionIntegrity(result = {}, content = {}) {
    const routeQuality = this._assessResearchRouteQuality(result.workflowOutline || {});
    const contentFidelity = this._assessContentFidelity(result, content);
    const graphTraceability = this._assessGraphTraceability(result);
    const visualEvidenceQuality = this._assessVisualEvidenceQuality(result, content);
    const resourceGraphQuality = this._assessResourceGraphQuality(result);
    const briefQuality = this._assessSourceBriefQuality(result);
    const productReadiness = assessSourceObjectGraphQuality({
      ...result,
      extractionIntegrity: {
        routeQuality,
        graphTraceability,
        contentFidelity,
        visualEvidenceQuality,
        resourceGraphQuality,
        briefQuality
      }
    }, { sourceCoverage: content.sourceCoverage || content.coverage || {} });
    const unknownRelations = (result.bridgeRelations || []).filter(relation => relation.isUnknownType);
    const endpointReviewRelations = (result.bridgeRelations || []).filter(relation => relation.requiresEndpointReview);
    const schemaWarnings = Array.isArray(result.extractionMetadata?.llmExtraction?.schemaWarnings)
      ? result.extractionMetadata.llmExtraction.schemaWarnings
      : [];
    const metadata = this._getNormalizedMetadata(content);
    const missingBibliographicFields = [];
    if (result.sourceType === 'Paper') {
      if (!metadata.authors?.length && !result.sourceObject?.attributes?.authors?.length) missingBibliographicFields.push('authors');
      if (!metadata.year && !metadata.publicationYear && !result.sourceObject?.attributes?.year) missingBibliographicFields.push('year');
      if (!metadata.venue && !metadata.journal && !result.sourceObject?.attributes?.venue) missingBibliographicFields.push('venue');
    }

    const issues = [];
    const scopeFiltering = result.extractionMetadata?.scopeFiltering || {};
    if (scopeFiltering.removedTotal > 0) {
      issues.push({
        id: 'scope-filtered',
        severity: 'warning',
        detail: `${scopeFiltering.removedTotal} out-of-scope extracted item(s) were removed before graph construction.`
      });
    }
    if (schemaWarnings.length > 0) {
      issues.push({
        id: 'schema-quality',
        severity: schemaWarnings.some(item => String(item).includes('must be') || String(item).includes('missing')) ? 'warning' : 'info',
        detail: `${schemaWarnings.length} LLM/agent schema quality warning(s): ${schemaWarnings.slice(0, 3).join('; ')}.`
      });
    }
    if (routeQuality.level !== 'content') {
      issues.push({
        id: 'route-quality',
        severity: 'warning',
        detail: `Research route quality is ${routeQuality.level}: ${routeQuality.reasons.join(', ') || 'review required'}.`
      });
    }
    if (graphTraceability.level === 'weak' || graphTraceability.level === 'partial') {
      issues.push({
        id: 'graph-traceability',
        severity: graphTraceability.level === 'weak' ? 'warning' : 'info',
        detail: `Research graph traceability is ${graphTraceability.level} (${graphTraceability.score}%): ${graphTraceability.reasons.join(', ') || 'review route-to-evidence links.'}`
      });
    }
    if (contentFidelity.level === 'weak' || contentFidelity.level === 'partial') {
      issues.push({
        id: 'content-fidelity',
        severity: contentFidelity.level === 'weak' ? 'warning' : 'info',
        detail: `Content fidelity is ${contentFidelity.level} (${contentFidelity.score}%): ${contentFidelity.reasons.join(', ') || 'review source coverage.'}`
      });
    }
    if (
      contentFidelity.grounding?.ungroundedFacets?.length > 0
      || contentFidelity.grounding?.weaklyGroundedFacets?.length > 0
    ) {
      const weakFacets = [
        ...(contentFidelity.grounding.ungroundedFacets || []),
        ...(contentFidelity.grounding.weaklyGroundedFacets || [])
      ];
      issues.push({
        id: 'facet-grounding',
        severity: contentFidelity.grounding.ungroundedFacets?.length > 0 ? 'warning' : 'info',
        detail: `Covered facets need stronger provenance or graph links: ${weakFacets.join(', ')}.`
      });
    }
    if (visualEvidenceQuality.level === 'missing' || visualEvidenceQuality.level === 'weak' || visualEvidenceQuality.level === 'partial') {
      issues.push({
        id: 'visual-evidence',
        severity: visualEvidenceQuality.level === 'partial' ? 'info' : 'warning',
        detail: `Visual evidence quality is ${visualEvidenceQuality.level}: ${visualEvidenceQuality.reasons.join(', ') || 'review figure/table extraction.'}`
      });
    }
    if (resourceGraphQuality.level === 'weak' || resourceGraphQuality.level === 'partial') {
      issues.push({
        id: 'resource-graph-quality',
        severity: resourceGraphQuality.level === 'partial' ? 'info' : 'warning',
        detail: `Resource graph quality is ${resourceGraphQuality.level}: ${resourceGraphQuality.reasons.join(', ') || 'review resource-to-route links.'}`
      });
    }
    if (briefQuality.level === 'missing' || briefQuality.level === 'weak' || briefQuality.level === 'partial') {
      issues.push({
        id: 'brief-quality',
        severity: briefQuality.level === 'partial' ? 'info' : 'warning',
        detail: `Source brief quality is ${briefQuality.level}: ${briefQuality.reasons.join(', ') || 'review brief grounding and information density.'}`
      });
    }
    if (productReadiness.level === 'weak') {
      issues.push({
        id: 'product-readiness',
        severity: 'warning',
        detail: `Source-to-object graph product readiness is weak (${productReadiness.score}%): ${productReadiness.reasons.join(', ') || 'review source brief, route, evidence, and resources.'}`
      });
    }
    if (unknownRelations.length > 0) {
      issues.push({
        id: 'unknown-relations',
        severity: 'warning',
        detail: `${unknownRelations.length} relation(s) use vocabulary outside the ontology.`
      });
    }
    if (endpointReviewRelations.length > 0) {
      issues.push({
        id: 'relation-endpoints',
        severity: 'warning',
        detail: `${endpointReviewRelations.length} relation endpoint(s) could not be resolved to extracted object ids.`
      });
    }
    if (missingBibliographicFields.length > 0) {
      issues.push({
        id: 'metadata-coverage',
        severity: 'info',
        detail: `Missing bibliographic fields: ${missingBibliographicFields.join(', ')}.`
      });
    }
    if ((result.evidenceGraph?.summary?.linkedClaimCount || 0) === 0 && (result.evidenceObjects?.length || 0) > 0) {
      issues.push({
        id: 'evidence-links',
        severity: 'warning',
        detail: 'Evidence objects are present but are not linked to visual/resource evidence.'
      });
    }
    if (
      (result.resourceGraph?.summary?.resourceCount || 0) > 0
      && (result.resourceGraph?.summary?.linkedResourceCount || 0) === 0
    ) {
      issues.push({
        id: 'resource-links',
        severity: 'warning',
        detail: 'Resources are present but are not linked to route or evidence nodes.'
      });
    }

    return {
      status: issues.some(issue => issue.severity === 'warning') ? 'needs_review' : 'ready',
      routeQuality,
      graphTraceability,
      contentFidelity,
      visualEvidenceQuality,
      resourceGraphQuality,
      briefQuality,
      productReadiness,
      missingBibliographicFields,
      schemaWarningCount: schemaWarnings.length,
      unknownRelationCount: unknownRelations.length,
      endpointReviewRelationCount: endpointReviewRelations.length,
      scopeFilteredCount: scopeFiltering.removedTotal || 0,
      evidenceGraph: result.evidenceGraph?.summary || null,
      resourceGraph: result.resourceGraph?.summary || null,
      issues
    };
  }

  _buildInferredLimitations(result) {
    const limitations = this._normalizeInsightLimitations(result.llmInsights);
    if ((result.worldObjects?.length || 0) === 0) {
      limitations.push({
        id: 'spatial-context',
        label: 'No verified study area',
        severity: 'warning',
        detail: 'The current source did not expose a verified bbox, point, polygon, or region object.',
        source: 'protocol'
      });
    }
    if ((result.capabilityObjects?.length || 0) === 0) {
      limitations.push({
        id: 'method-route',
        label: 'Technical route is sparse',
        severity: 'warning',
        detail: 'No explicit method, model, data, code, or workflow object was extracted from available source material.',
        source: 'protocol'
      });
    }
    if ((result.evidenceObjects?.length || 0) === 0) {
      limitations.push({
        id: 'evidence-chain',
        label: 'Evidence chain is limited',
        severity: 'info',
        detail: 'No claim-level evidence object is available for direct inspection.',
        source: 'protocol'
      });
    }
    if ((result.bridgeRelations?.length || 0) === 0) {
      limitations.push({
        id: 'relations',
        label: 'Graph links are sparse',
        severity: 'info',
        detail: 'Extracted objects are not yet connected by verified relations, so comparison and reasoning should remain cautious.',
        source: 'protocol'
      });
    }
    if (result.extractionMetadata?.llmExtraction?.success === false) {
      limitations.push({
        id: 'llm-extraction',
        label: 'LLM extraction unavailable',
        severity: 'info',
        detail: 'The current project used metadata or source-text fallback extraction instead of deep LLM extraction.',
        source: 'protocol'
      });
    }
    return limitations;
  }

  _normalizeInsightLimitations(llmInsights = {}) {
    const items = [
      ...(llmInsights.researchGaps || []),
      ...(llmInsights.limitations || [])
    ];

    return items.slice(0, 6).map((item, index) => ({
      id: item.id || `llm-gap-${index + 1}`,
      label: this._summarizeText(item.label || item.statement || 'Source-grounded limitation', 80),
      severity: item.severity || 'info',
      detail: this._summarizeText(item.detail || item.statement || item.evidence || item.provenance?.sourceText || '', 260),
      source: 'llm-extraction',
      provenance: item.provenance || item.section ? {
        ...(item.provenance || {}),
        section: item.section || item.provenance?.section
      } : undefined
    })).filter(item => item.label && item.detail);
  }

  async _buildCriticalLimitations(result, content = {}, fallbackLimitations = []) {
    const sourceText = this._getSourceText(content);
    if (!this.options.useLLM || !this.llm || sourceText.length < 100) {
      return fallbackLimitations;
    }

    try {
      const response = await this.llm.chat({
        messages: [
          {
            role: 'system',
            content: [
              'You are a skeptical research reviewer for a Digital Earth research workspace.',
              'Identify limitations only from the supplied metadata, extracted objects, and source text.',
              'Do not fabricate missing experiments, datasets, repositories, or claims.',
              'Return valid JSON only.'
            ].join(' ')
          },
          {
            role: 'user',
            content: this._buildCriticalReviewPrompt(result, content, fallbackLimitations)
          }
        ],
        temperature: 0.1,
        max_tokens: 1200,
        timeout: Math.min(this.options.llmTimeout || 45000, 45000)
      });

      const responseText = response.choices?.[0]?.message?.content || response.content || '';
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return fallbackLimitations;

      const parsed = this._parseLLMJson(jsonMatch[0]);
      const llmLimitations = this._normalizeCriticalLimitations(parsed.limitations || parsed.inferredLimitations || []);
      if (llmLimitations.length === 0) return fallbackLimitations;

      result.extractionMetadata.criticalReview = {
        success: true,
        limitationCount: llmLimitations.length
      };
      return this._mergeLimitations(fallbackLimitations, llmLimitations);
    } catch (error) {
      result.extractionMetadata.criticalReview = {
        success: false,
        error: error.message
      };
      return fallbackLimitations;
    }
  }

  _buildCriticalReviewPrompt(result, content = {}, fallbackLimitations = []) {
    const source = result.sourceObject || {};
    const attributes = source.attributes || {};
    const sourceText = this._getSourceText(content);
    const compactObjects = [
      ...(result.capabilityObjects || []),
      ...(result.worldObjects || []),
      ...(result.evidenceObjects || [])
    ].slice(0, 18).map(object => ({
      type: object.type,
      name: object.name || object.attributes?.name || object.attributes?.title,
      category: object.metadata?.category,
      confidence: object.confidence || object.metadata?.confidence
    }));

    return JSON.stringify({
      task: 'Critical Review',
      instruction: 'Return JSON: {"limitations":[{"id":"short-kebab-id","label":"short title","severity":"info|warning","detail":"one concrete limitation","source":"llm-review"}]}. Focus on limitations useful to a researcher after reading the paper.',
      source: {
        type: source.type || result.sourceType,
        title: attributes.title || source.name,
        venue: attributes.venue,
        year: attributes.year
      },
      extractedObjects: compactObjects,
      existingProtocolLimitations: fallbackLimitations,
      sourceExcerpt: sourceText.slice(0, 6000)
    }, null, 2);
  }

  _normalizeCriticalLimitations(limitations) {
    if (!Array.isArray(limitations)) return [];
    return limitations
      .map((item, index) => {
        if (!item || typeof item !== 'object') return null;
        const label = this._summarizeText(item.label || item.title || '', 80);
        const detail = this._summarizeText(item.detail || item.reason || item.description || '', 260);
        if (!label || !detail) return null;
        return {
          id: this._slugifyLimitationId(item.id || label || `llm-limitation-${index + 1}`),
          label,
          severity: item.severity === 'warning' || item.severity === 'error' ? item.severity : 'info',
          detail,
          source: 'llm-review'
        };
      })
      .filter(Boolean)
      .slice(0, 4);
  }

  _mergeLimitations(fallbackLimitations, llmLimitations) {
    const byId = new Map();
    for (const limitation of [...llmLimitations, ...fallbackLimitations]) {
      if (!limitation?.id) continue;
      if (!byId.has(limitation.id)) {
        byId.set(limitation.id, limitation);
      }
    }
    return Array.from(byId.values()).slice(0, 6);
  }

  _slugifyLimitationId(value) {
    return String(value || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80) || 'llm-limitation';
  }

  _sourceChildren(source) {
    const attributes = source.attributes || {};
    return [
      attributes.venue ? { label: 'Venue', value: attributes.venue } : null,
      attributes.year ? { label: 'Year', value: String(attributes.year) } : null,
      attributes.authors ? { label: 'Authors', value: Array.isArray(attributes.authors) ? attributes.authors.slice(0, 5).join(', ') : String(attributes.authors) } : null
    ]
      .filter(Boolean)
      .map(child => ({
        ...child,
        children: this._routeChildDetails(source, child.label, child.value)
      }));
  }

  _objectChildren(object) {
    const attributes = object.attributes || {};
    return Object.entries(attributes)
      .filter(([, value]) => value !== undefined && value !== null && value !== '')
      .slice(0, 5)
      .map(([key, value]) => ({
        label: this._humanizeSectionTitle(key, key),
        value: Array.isArray(value) ? value.slice(0, 4).join(', ') : this._summarizeText(String(value), 140),
        children: this._routeChildDetails(object, key, value)
      }));
  }

  _routeChildDetails(object = {}, attributeKey = '', attributeValue = '') {
    const provenance = object.provenance || {};
    const confidence = typeof object.confidence === 'number'
      ? object.confidence
      : typeof object.metadata?.confidence === 'number' ? object.metadata.confidence : null;
    const details = [
      object.type ? {
        label: 'Object Type',
        value: object.type,
        detail: 'Ontology role used to place this node in the research route.'
      } : null,
      confidence !== null ? {
        label: 'Confidence',
        value: `${Math.round(confidence * 100)}%`,
        detail: 'Review signal from extraction, not a guarantee of correctness.'
      } : null,
      provenance.method || provenance.source || provenance.section ? {
        label: 'Evidence',
        value: provenance.method || provenance.source || provenance.section,
        detail: provenance.section
          ? `Linked to source section: ${provenance.section}.`
          : 'Derived from available source, connector, or extraction protocol.'
      } : null,
      {
        label: 'Field',
        value: this._humanizeSectionTitle(attributeKey, attributeKey || 'Detail'),
        detail: Array.isArray(attributeValue)
          ? `List with ${attributeValue.length} visible item${attributeValue.length === 1 ? '' : 's'}.`
          : 'Scalar detail from the selected route node.'
      }
    ];

    return details.filter(Boolean).slice(0, 4);
  }

  _objectSummary(object, fallback) {
    const attributes = object.attributes || {};
    return this._summarizeText(
      attributes.summary
      || attributes.description
      || attributes.statement
      || attributes.abstract
      || object.provenance?.sourceText
      || fallback,
      220
    );
  }

  _collectAttributeValues(values) {
    const result = [];
    for (const value of values) {
      if (!value) continue;
      if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === 'string') result.push(item);
          else if (item?.name) result.push(item.name);
          else if (item?.institution) result.push(item.institution);
        }
      } else if (typeof value === 'string') {
        result.push(value);
      }
    }
    return [...new Set(result.filter(Boolean))];
  }

  _summarizeText(text, maxLength = 200) {
    const normalized = String(text || '').replace(/\s+/g, ' ').trim();
    if (normalized.length <= maxLength) return normalized;
    return `${normalized.slice(0, Math.max(0, maxLength - 1)).trim()}...`;
  }

  _resourceLabelFromUrl(url) {
    try {
      const parsed = new URL(url.startsWith('http') ? url : `https://doi.org/${url.replace(/^doi:/i, '')}`);
      return parsed.hostname.replace(/^www\./, '');
    } catch {
      return 'External resource';
    }
  }

  _extractUrlsFromText(text) {
    const matches = String(text || '').match(/https?:\/\/[^\s)>\]},"']+/gi) || [];
    return [...new Set(matches.map(url => this._normalizeExtractedUrl(url)))].filter(Boolean);
  }

  _normalizeExtractedUrl(url) {
    let normalized = String(url || '').trim().replace(/[.;,]+$/, '');
    normalized = normalized.replace(/\.([A-Z][A-Za-z]{5,})$/, '');
    return normalized || null;
  }

  _classifyResourceUrl(url) {
    const value = String(url).toLowerCase();
    if (value.includes('github.com')) return 'repository';
    if (
      value.includes('zenodo') ||
      value.includes('figshare') ||
      value.includes('dataverse') ||
      value.includes('dryad') ||
      value.includes('pangaea') ||
      value.includes('osf.io') ||
      value.includes('huggingface.co/datasets')
    ) return 'dataset';
    if (value.includes('doi.org') || /^10\./.test(value)) return 'doi';
    if (value.endsWith('.pdf')) return 'paper';
    return 'external';
  }

  _resourceRole(type = '') {
    const roles = {
      repository: 'code or method implementation',
      code: 'code or method implementation',
      dataset: 'data or evidence source',
      supplement: 'supplementary evidence',
      paper: 'source document',
      doi: 'source identifier',
      source: 'primary source'
    };
    return roles[String(type || '').toLowerCase()] || 'referenced resource';
  }

  _resourceReviewHint(type = '', source = '') {
    const normalizedType = String(type || '').toLowerCase();
    const normalizedSource = String(source || '').toLowerCase();
    if (normalizedType === 'repository' || normalizedType === 'code') {
      return 'Inspect README, license, dependencies, examples, and run instructions before treating it as reproducible code.';
    }
    if (normalizedType === 'dataset') {
      return 'Check access terms, data version, variables, spatial/temporal coverage, and download instructions.';
    }
    if (normalizedType === 'supplement') {
      return 'Use this to verify methods, tables, figures, or additional experiment details not visible in the main text.';
    }
    if (normalizedType === 'paper' || normalizedType === 'doi' || normalizedType === 'source') {
      return normalizedSource === 'sourceobject'
        ? 'Use this as the canonical source before trusting extracted claims.'
        : 'Open this source to verify extracted claims and citation context.';
    }
    return 'Review this link before using it as evidence, data, or implementation support.';
  }

  _sourceResourceReviewHint(sourceObject = {}, sourceType = '') {
    const review = sourceObject?.attributes?.repositoryReview;
    if (sourceType === 'Repository' && review?.grade) {
      const warning = review.warnings?.[0];
      return `Static reproducibility grade ${review.grade}. ${warning || review.summary || 'Inspect repository structure before reuse.'}`;
    }
    return null;
  }

  _sourceResourceRouteRelevance(sourceObject = {}, sourceType = '') {
    const review = sourceObject?.attributes?.repositoryReview;
    if (sourceType === 'Repository' && review?.summary) {
      return review.summary;
    }
    return null;
  }

  _sourceResourceVerificationFocus(sourceObject = {}, sourceType = '') {
    const review = sourceObject?.attributes?.repositoryReview;
    if (sourceType !== 'Repository' || !review?.checks) return null;
    const missing = Object.entries(review.checks)
      .filter(([, passed]) => !passed)
      .map(([key]) => this._humanizeSectionTitle(key, key))
      .slice(0, 3);
    return missing.length > 0
      ? `missing ${missing.join(', ')}`
      : 'README, license, dependencies, runnable examples, and data instructions';
  }

  _resourceInvestigationLabel(type = '') {
    const labels = {
      repository: 'Reproduce method',
      code: 'Reproduce method',
      dataset: 'Verify data',
      supplement: 'Inspect details',
      paper: 'Check evidence',
      doi: 'Check citation',
      source: 'Read source'
    };
    return labels[String(type || '').toLowerCase()] || 'Review link';
  }

  _resourceRouteRelevance(type = '', source = '') {
    const normalizedType = String(type || '').toLowerCase();
    const normalizedSource = String(source || '').toLowerCase();
    if (normalizedType === 'repository' || normalizedType === 'code') {
      return 'May explain the implementation path behind the route graph.';
    }
    if (normalizedType === 'dataset') {
      return 'May verify the inputs, variables, coverage, or evidence behind the route graph.';
    }
    if (normalizedType === 'supplement') {
      return 'May contain method details, tables, figures, or ablation evidence missing from the main source.';
    }
    if (normalizedType === 'paper' || normalizedType === 'doi' || normalizedType === 'source') {
      return normalizedSource === 'sourceobject'
        ? 'Canonical source for checking the extracted route and brief.'
        : 'Related source for checking citation context and claims.';
    }
    return 'Linked material that may support or qualify the extracted route.';
  }

  _resourceVerificationFocus(type = '') {
    const focuses = {
      repository: 'README, license, dependencies, examples, run instructions',
      code: 'README, license, dependencies, examples, run instructions',
      dataset: 'access terms, version, variables, spatial/temporal coverage',
      supplement: 'methods, tables, figures, additional experiment details',
      paper: 'claims, methods, citation context',
      doi: 'metadata, citation context, source availability',
      source: 'claims, methods, evidence, limitations'
    };
    return focuses[String(type || '').toLowerCase()] || 'evidence role, access, provenance, and limitations';
  }

  _normalizeSourceType(type) {
    if (!type) return 'Source';
    const normalized = String(type).toLowerCase();
    const typeMap = {
      paper: 'Paper',
      article: 'Paper',
      journalarticle: 'Paper',
      preprint: 'Paper',
      repository: 'Repository',
      github: 'Repository',
      datasetpage: 'DatasetPage',
      dataset: 'DatasetPage',
      report: 'Report',
      assessmentreport: 'AssessmentReport',
      policydocument: 'PolicyDocument',
      news: 'News'
    };

    return Object.prototype.hasOwnProperty.call(typeMap, normalized)
      ? typeMap[normalized]
      : type;
  }

  _findSectionByRole(sections = {}, roleHints = []) {
    const entries = Object.entries(sections)
      .filter(([, value]) => typeof value === 'string' && value.trim().length > 80);

    for (const hint of roleHints) {
      const normalizedHint = hint.toLowerCase();
      const exact = entries.find(([key]) => key.toLowerCase() === normalizedHint);
      if (exact) {
        return { key: exact[0], text: exact[1].trim() };
      }

      const partial = entries.find(([key]) => key.toLowerCase().includes(normalizedHint));
      if (partial) {
        return { key: partial[0], text: partial[1].trim() };
      }
    }

    return null;
  }

  _normalizedSectionMap(content = {}, sourceType = 'Source') {
    const existing = content.sections;
    if (existing && typeof existing === 'object' && !Array.isArray(existing)) {
      return existing;
    }

    const sourceText = this._getSourceText(content);
    if (!sourceText) return {};

    const parsed = this.sectionParser.parse(sourceText, this._normalizeSourceType(sourceType));
    const sectionMap = {};

    for (const section of parsed.sections || []) {
      const text = String(section.text || '').trim();
      if (text.length < 20) continue;

      const keys = [
        section.type,
        section.title
      ]
        .filter(Boolean)
        .map(key => String(key).replace(/^#+\s*/, '').trim().toLowerCase())
        .filter(Boolean);

      for (const key of keys) {
        if (!sectionMap[key]) {
          sectionMap[key] = text;
        }
      }
    }

    return sectionMap;
  }

  _humanizeSectionTitle(sectionKey, fallback) {
    if (!sectionKey) return fallback;
    return sectionKey
      .split(/\s+/)
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ') || fallback;
  }

  _shortSourceText(text, maxLength = 600) {
    if (!text) return null;
    const normalized = text.replace(/\s+/g, ' ').trim();
    return normalized.length > maxLength
      ? `${normalized.substring(0, maxLength).trim()}...`
      : normalized;
  }

  _firstSentence(text) {
    const normalized = this._shortSourceText(text, 800);
    if (!normalized) return undefined;
    const sentence = normalized.match(/^(.{80,}?[.!?])\s/);
    return sentence ? sentence[1] : normalized;
  }

  _selectClaimSentence(text) {
    const normalized = this._shortSourceText(text, 1200);
    if (!normalized) return null;

    const sentences = normalized
      .split(/(?<=[.!?])\s+/)
      .map(sentence => sentence.trim())
      .filter(sentence => sentence.length >= 80);

    return sentences.find(sentence => /\b(show|shows|demonstrate|achieve|achieves|provide|provides|improve|improves|result|results)\b/i.test(sentence))
      || sentences[0]
      || null;
  }

  _extractFirstUrl(text) {
    if (!text) return null;
    const match = text.match(/https?:\/\/[^\s),;]+/i);
    return match ? match[0] : null;
  }

  _hasScopeSignal(...texts) {
    return texts.some(text => typeof text === 'string' && /\bglobal\b/i.test(text));
  }

  _extractEventLocationFallback(content = {}, admissionResult = {}, sourceText = '') {
    const eventScore = Number(admissionResult.sourceRoles?.event_signal || 0);
    if (eventScore < 0.5) return null;

    const metadata = content.metadata || {};
    const candidateText = [
      content.title,
      metadata.title,
      metadata.description,
      content.abstract,
      metadata.abstract,
      ...(Array.isArray(admissionResult.transferReasons) ? admissionResult.transferReasons : []),
      this._firstSentence(sourceText)
    ].filter(Boolean).join(' ');

    const locationName = this._extractExplicitPlacePair(candidateText);
    if (!locationName) return null;

    const title = content.title || metadata.title || 'Reported Earth event';
    const description = metadata.description || this._firstSentence(sourceText) || `Source reports an event at ${locationName}.`;
    return {
      eventType: 'Event',
      name: title,
      locationName,
      description: this._shortSourceText(description, 400),
      section: 'event-location-fallback',
      sourceText: this._shortSourceText(candidateText, 600)
    };
  }

  _extractExplicitPlacePair(text = '') {
    const normalized = this._shortSourceText(text, 1600) || '';
    const pair = normalized.match(/\b([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,3}),\s+([A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){0,3})\b/);
    if (!pair) return null;
    const place = `${pair[1]}, ${pair[2]}`.replace(/\s+/g, ' ').trim();
    if (place.length < 4 || place.length > 80) return null;
    return place;
  }

  _createSourceTextObject({ type, idPrefix, name, description, section, sourceText, role }) {
    return this._createExtractedObject({
      type,
      idPrefix,
      idSeed: name,
      attributes: {
        name,
        description,
        role
      },
      metadata: {
        sourceDerived: true,
        confidence: 0.5
      },
      provenance: this._createProvenance(section, sourceText, {
        evidenceStrength: 'weak',
        note: 'Created from explicit source text because LLM extraction was unavailable or empty.'
      })
    });
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

    this._runCategoryExtractionProtocol({
      protocol: CAPABILITY_EXTRACTION_PROTOCOL,
      categories,
      metadata,
      text,
      sourceMode: 'fullSources',
      objects,
      sections
    });

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
      objects.push(this._createExtractedObject({
        type: 'Dataset',
        idPrefix: 'dataset',
        idSeed: ds.name || ds,
        attributes: {
          name: ds.name || ds,
          acronym: ds.acronym,
          variables: ds.variables,
          spatialCoverage: ds.spatialCoverage || ds.coverage,
          temporalCoverage: ds.temporalCoverage,
          role: ds.role || 'input',
          accessUrl: ds.url || ds.accessUrl
        },
        confidence: ds.confidence || 0.8,
        provenance: {
          section: 'datasets',
          sourceText: ds.originalText
        }
      }));
    }

    // Also check for variables list
    if (metadata.variables && metadata.variables.length > 0) {
      for (const v of metadata.variables) {
        objects.push(this._createExtractedObject({
          type: 'Variable',
          idPrefix: 'variable',
          idSeed: v.name || v,
          attributes: {
            name: v.name || v,
            unit: v.unit,
            description: v.description
          },
          confidence: 0.9,
          provenance: { section: 'variables' }
        }));
      }
    }

    if (metadata.spatialCoverage || metadata.spatialResolution || metadata.temporalCoverage || metadata.temporalResolution) {
      objects.push(this._createExtractedObject({
        type: 'Coverage',
        idPrefix: 'coverage',
        idSeed: metadata.title || metadata.name || metadata.url || 'coverage',
        attributes: {
          spatialCoverage: metadata.spatialCoverage,
          spatialResolution: metadata.spatialResolution,
          temporalCoverage: metadata.temporalCoverage,
          temporalResolution: metadata.temporalResolution
        },
        confidence: 0.8,
        provenance: { section: 'metadata' }
      }));
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
      objects.push(this._createExtractedObject({
        type: 'Satellite',
        idPrefix: 'satellite',
        idSeed: sat.name || sat,
        attributes: {
          name: sat.name || sat,
          sensors: sat.sensors,
          resolution: sat.resolution,
          revisitTime: sat.revisitTime
        },
        confidence: sat.confidence || 0.8,
        provenance: { section: 'methods' }
      }));
    }

    // Extract gauges/stations
    const gauges = metadata.gauges || metadata.stations || [];
    for (const gauge of gauges) {
      objects.push(this._createExtractedObject({
        type: 'Gauge',
        idPrefix: 'gauge',
        idSeed: gauge.name || gauge.id || gauge,
        attributes: {
          name: gauge.name || gauge.id || gauge,
          stationId: gauge.id,
          river: gauge.river,
          location: gauge.location
        },
        confidence: gauge.confidence || 0.8,
        provenance: { section: 'methods' }
      }));
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
      objects.push(this._createExtractedObject({
        type: 'Model',
        idPrefix: 'model',
        idSeed: model.name || model,
        attributes: {
          name: model.name || model,
          type: model.type || 'machine_learning',
          architecture: model.architecture,
          framework: model.framework,
          hyperparameters: model.hyperparameters
        },
        metadata: {
          innovation: model.innovation
        },
        confidence: model.confidence || 0.8,
        provenance: {
          section: 'methods',
          sourceText: model.originalText
        }
      }));
    }

    // Add algorithms mentioned
    const algorithms = metadata.algorithms || [];
    for (const algo of algorithms) {
      objects.push(this._createExtractedObject({
        type: 'Algorithm',
        idPrefix: 'algorithm',
        idSeed: algo.name || algo,
        attributes: {
          name: algo.name || algo,
          category: algo.category,
          purpose: algo.purpose
        },
        confidence: algo.confidence || 0.8,
        provenance: { section: 'methods' }
      }));
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
      objects.push(this._createExtractedObject({
        type: 'Software',
        idPrefix: 'software',
        idSeed: pkg.name || pkg,
        attributes: {
          name: pkg.name || pkg,
          version: pkg.version,
          language: metadata.language
        },
        confidence: 0.9,
        provenance: { section: 'dependencies' }
      }));
    }

    // Workflows
    const workflows = metadata.workflows || [];
    for (const wf of workflows) {
      objects.push(this._createExtractedObject({
        type: 'Workflow',
        idPrefix: 'workflow',
        idSeed: wf.name || wf,
        attributes: {
          name: wf.name || wf,
          steps: wf.steps,
          purpose: wf.purpose
        },
        confidence: wf.confidence || 0.8,
        provenance: { section: 'methods' }
      }));
    }

    // APIs
    if (metadata.type === 'APIPage' || metadata.apiEndpoint) {
      objects.push(this._createExtractedObject({
        type: 'API',
        idPrefix: 'api',
        idSeed: metadata.name || 'api',
        attributes: {
          name: metadata.name,
          endpoint: metadata.apiEndpoint,
          description: metadata.description
        },
        confidence: 0.9,
        provenance: { section: 'header' }
      }));
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
      objects.push(this._createExtractedObject({
        type: 'Institution',
        idPrefix: 'institution',
        idSeed: inst.name || inst,
        attributes: {
          name: inst.name || inst,
          type: inst.type,
          jurisdiction: inst.jurisdiction
        },
        confidence: inst.confidence || 0.8,
        provenance: { section: 'metadata' }
      }));
    }

    // Policies/regulations
    const policies = metadata.policies || [];
    for (const policy of policies) {
      objects.push(this._createExtractedObject({
        type: 'Policy',
        idPrefix: 'policy',
        idSeed: policy.name || policy,
        attributes: {
          name: policy.name || policy,
          jurisdiction: policy.jurisdiction,
          effectiveDate: policy.effectiveDate,
          status: policy.status
        },
        confidence: policy.confidence || 0.8,
        provenance: { section: 'text' }
      }));
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
      objects.push(this._createExtractedObject({
        type: 'PopulationDataset',
        idPrefix: 'population',
        idSeed: metadata.population?.name || 'population',
        attributes: {
          name: metadata.population?.name || 'Population Data',
          source: metadata.population?.source,
          resolution: metadata.population?.resolution
        },
        confidence: 0.8,
        provenance: { section: 'data' }
      }));
    }

    // Exposure data
    const exposures = metadata.exposures || [];
    for (const exp of exposures) {
      objects.push(this._createExtractedObject({
        type: 'ExposureDataset',
        idPrefix: 'exposure',
        idSeed: exp.name || exp,
        attributes: {
          name: exp.name || exp,
          type: exp.type,
          coverage: exp.coverage
        },
        confidence: exp.confidence || 0.8,
        provenance: { section: 'data' }
      }));
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
      objects.push(this._createExtractedObject({
        type: 'Assessment',
        idPrefix: 'assessment',
        idSeed: assess.name || assess,
        attributes: {
          name: assess.name || assess,
          type: assess.type,
          scope: assess.scope,
          confidence: assess.confidence
        },
        confidence: assess.confidence || 0.8,
        provenance: { section: 'results' }
      }));
    }

    // Indicators
    const indicators = metadata.indicators || [];
    for (const ind of indicators) {
      objects.push(this._createExtractedObject({
        type: 'Indicator',
        idPrefix: 'indicator',
        idSeed: ind.name || ind,
        attributes: {
          name: ind.name || ind,
          value: ind.value,
          unit: ind.unit,
          trend: ind.trend
        },
        confidence: ind.confidence || 0.8,
        provenance: { section: 'results' }
      }));
    }

    return objects;
  }

  /**
   * Extract action capabilities
   *
   * IMPORTANT: This method does NOT use pattern matching to determine entity type.
   * The type comes from:
   * 1. Explicit metadata.type field (preferred)
   * 2. LLM extraction (semantic understanding)
   * 3. Default to base 'Intervention' type (no keyword guessing)
   */
  _extractActionCapabilities(metadata, text) {
    const objects = [];

    const interventions = metadata.interventions || metadata.measures || [];
    for (const interv of interventions) {
      // Use explicit type if provided, otherwise default to Intervention
      // LLM extraction may provide a specific ontology subtype.
      const entityType = this._resolveOntologyEntityType(
        interv.entityType || interv.type,
        'intervention'
      );

      objects.push(this._createExtractedObject({
        type: entityType,
        idPrefix: 'intervention',
        idSeed: interv.name || interv,
        attributes: {
          name: interv.name || interv,
          type: interv.type, // Keep original type as attribute for LLM to classify
          target: interv.target,
          status: interv.status
        },
        confidence: interv.confidence || 0.8,
        provenance: { section: 'discussion' }
      }));
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

    this._runCategoryExtractionProtocol({
      protocol: WORLD_EXTRACTION_PROTOCOL,
      categories,
      metadata,
      objects,
      sections
    });

    return { objects, sections };
  }

  /**
   * Extract Earth objects (regions, basins, glaciers, etc.)
   */
  _extractEarthObjects(metadata) {
    const objects = [];
    const regions = [
      ...(metadata.regions || []),
      ...(metadata.studyAreas || []),
      ...(metadata.geoFeatures || [])
    ];

    for (const region of regions) {
      const regionType = region.type || 'Region';
      const entityType = this._resolveOntologyEntityType(regionType, 'region');

      objects.push(this._createExtractedObject({
        type: entityType,
        idPrefix: 'region',
        idSeed: region.name || region,
        attributes: {
          name: region.name || region,
          bbox: region.bbox,
          geometry: region.geometry,
          coordinates: region.coordinates,
          displayPrimitive: region.displayPrimitive,
          geometryKind: region.geometryKind,
          area: region.area,
          type: regionType,
          sourceUrl: region.sourceUrl,
          properties: region.properties
        },
        confidence: region.confidence || 0.8,
        provenance: {
          section: 'spatial',
          sourceText: region.originalText,
          sourceUrl: region.sourceUrl
        }
      }));
    }

    return objects;
  }

  /**
   * Extract Earth variables
   */
  _extractEarthVariables(metadata) {
    const objects = [];
    const variables = metadata.earthVariables || [];

    for (const v of variables) {
      objects.push(this._createExtractedObject({
        type: 'EarthVariable',
        idPrefix: 'earthvar',
        idSeed: v.name || v,
        attributes: {
          name: v.name || v,
          unit: v.unit,
          range: v.range,
          temporalResolution: v.temporalResolution
        },
        confidence: v.confidence || 0.8,
        provenance: { section: 'variables' }
      }));
    }

    return objects;
  }

  /**
   * Extract hazards
   */
  _extractHazards(metadata) {
    const objects = [];
    const hazards = [...(metadata.hazards || [])];

    if (metadata.event) {
      hazards.push({
        type: metadata.event,
        name: metadata.title || metadata.event,
        location: metadata.location,
        date: metadata.date || metadata.publishedDate,
        confidence: 0.8
      });
    }

    for (const h of hazards) {
      const hazardType = h.type || 'Hazard';
      const entityType = this._resolveOntologyEntityType(hazardType, 'hazard');

      objects.push(this._createExtractedObject({
        type: entityType,
        idPrefix: 'hazard',
        idSeed: h.name || h.type || h,
        attributes: {
          name: h.name || h.type || h,
          type: hazardType,
          magnitude: h.magnitude,
          probability: h.probability,
          location: h.location,
          date: h.date
        },
        confidence: h.confidence || 0.8,
        provenance: { section: 'text' }
      }));
    }

    return objects;
  }

  /**
   * Extract risks (exposure, vulnerability)
   */
  _extractRisks(metadata) {
    const objects = [];

    // Risk assessments
    const risks = metadata.risks || [];
    for (const r of risks) {
      objects.push(this._createExtractedObject({
        type: 'EarthRisk',
        idPrefix: 'risk',
        idSeed: r.name || r.type || 'risk',
        attributes: {
          name: r.name || r.type || 'Risk Assessment',
          type: r.type,
          likelihood: r.likelihood,
          impact: r.impact,
          exposure: r.exposure
        },
        confidence: r.confidence || 0.8,
        provenance: { section: 'results' }
      }));
    }

    const impacts = [...(metadata.impacts || []), ...(metadata.exposures || [])];
    for (const impact of impacts) {
      objects.push(this._createExtractedObject({
        type: impact.type || 'Exposure',
        idPrefix: 'exposure',
        idSeed: impact.name || impact.location || impact.id || 'impact',
        attributes: {
          name: impact.name || impact.location || 'Exposure',
          affectedPopulation: impact.affectedPopulation,
          affectedAssets: impact.affectedAssets,
          location: impact.location,
          date: impact.date,
          description: impact.description
        },
        confidence: impact.confidence || 0.8,
        provenance: { section: impact.section || 'impact' }
      }));
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
      objects.push(this._createExtractedObject({
        type: 'Forecast',
        idPrefix: 'forecast',
        idSeed: f.name || f.variable || 'forecast',
        attributes: {
          name: f.name || f.variable || 'Forecast',
          variable: f.variable,
          leadTime: f.leadTime,
          resolution: f.resolution,
          skill: f.skill
        },
        confidence: f.confidence || 0.8,
        provenance: { section: 'results' }
      }));
    }

    const projections = metadata.projections || [];
    for (const p of projections) {
      objects.push(this._createExtractedObject({
        type: 'Projection',
        idPrefix: 'projection',
        idSeed: p.name || p.scenario || 'projection',
        attributes: {
          name: p.name || p.scenario || 'Projection',
          scenario: p.scenario,
          timeHorizon: p.timeHorizon,
          variable: p.variable
        },
        confidence: p.confidence || 0.8,
        provenance: { section: 'results' }
      }));
    }

    return objects;
  }

  /**
   * Extract evidence objects (claims, evidence chains)
   */
  async _extractEvidence(content, admissionResult) {
    const metadata = content.metadata || {};
    return this._extractEvidenceObjectsFromMetadata(metadata);
  }

  _extractEvidenceObjectsFromMetadata(metadata) {
    const objects = [];
    const sections = {};

    const claims = metadata.claims || [];
    for (const claim of claims) {
      objects.push(this._createExtractedObject({
        type: 'Claim',
        idPrefix: 'claim',
        idSeed: claim.statement?.substring(0, 50) || claim.id || 'claim',
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
      }));
    }
    sections.claims = { count: claims.length };

    const evidenceItems = metadata.evidence || [];
    for (const ev of evidenceItems) {
      objects.push(this._createExtractedObject({
        type: 'Evidence',
        idPrefix: 'evidence',
        idSeed: ev.description?.substring(0, 50) || ev.id || 'evidence',
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
      }));
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
  _buildBridgeRelations(capabilityObjects, worldObjects, evidenceObjects, llmRelations = []) {
    const relations = [];
    const existingKeys = new Set();

    // Track LLM-extracted relation keys to avoid duplicates
    for (const rel of llmRelations) {
      if (rel.from && rel.to && rel.type) {
        existingKeys.add(`${rel.type}:${rel.from}:${rel.to}`);
      }
    }

    // Skip if no objects to bridge
    if (capabilityObjects.length === 0 && evidenceObjects.length === 0) {
      return relations;
    }

    // Use relation semantics for fallback relations
    // Instead of hardcoded type arrays, check against relation semantics
    for (const cap of capabilityObjects) {
      // Skip if LLM already provided relations for this object
      // (check if any LLM relation involves this object)
      const hasLLMRelation = llmRelations.some(r => r.from === cap.id || r.to === cap.id);
      if (hasLLMRelation) continue;

      for (const world of worldObjects) {
        // Get valid relations between these types using semantics
        const validRels = getValidRelations(cap.type, world.type);

        for (const relInfo of validRels) {
          // Only create fallback relations
          if (!relInfo.fallbackAllowed) continue;

          const key = `${relInfo.type}:${cap.id}:${world.id}`;
          if (existingKeys.has(key)) continue;

          // Create fallback relation using semantics
          const semantics = BRIDGE_RELATION_SEMANTICS[relInfo.type];
          if (!semantics) continue;

          relations.push({
            type: relInfo.type,
            from: cap.id,
            to: world.id,
            confidence: semantics.fallbackConditions?.confidenceCap || 0.5,
            inferenceMethod: 'semantics-fallback',
            isFallback: true,
            provenance: this._createProvenance('inferred', null, {
              note: semantics.fallbackConditions?.note || 'Inferred relation. Verify with source text.'
            })
          });
          existingKeys.add(key);
        }
      }
    }

    // Evidence → World Object support (use semantics)
    for (const ev of evidenceObjects) {
      // Skip if LLM already provided relations for this object
      const hasLLMRelation = llmRelations.some(r => r.from === ev.id || r.to === ev.id);
      if (hasLLMRelation) continue;

      for (const world of worldObjects) {
        const validRels = getValidRelations(ev.type, world.type);

        for (const relInfo of validRels) {
          if (!relInfo.fallbackAllowed) continue;

          const key = `${relInfo.type}:${ev.id}:${world.id}`;
          if (existingKeys.has(key)) continue;

          const semantics = BRIDGE_RELATION_SEMANTICS[relInfo.type];
          if (!semantics) continue;

          relations.push({
            type: relInfo.type,
            from: ev.id,
            to: world.id,
            confidence: semantics.fallbackConditions?.confidenceCap || 0.5,
            inferenceMethod: 'semantics-fallback',
            isFallback: true,
            provenance: this._createProvenance(ev.provenance?.section, ev.provenance?.sourceText, {
              note: semantics.fallbackConditions?.note || 'Inferred relation. Verify evidence-world connection.'
            })
          });
          existingKeys.add(key);
        }
      }
    }

    return relations;
  }

  /**
   * Validate and merge LLM-extracted and inferred bridge relations
   */
  _validateAndMergeBridgeRelations(llmRelations, inferredRelations) {
    const merged = [];
    const seenKeys = new Set();

    // Process LLM relations first (higher priority)
    for (const rel of llmRelations) {
      const validated = this._validateBridgeRelation(rel, 'llm');
      if (validated) {
        const key = `${validated.type}:${validated.from}:${validated.to}`;
        if (!seenKeys.has(key)) {
          merged.push(validated);
          seenKeys.add(key);
        }
      }
    }

    // Add inferred relations (lower priority)
    for (const rel of inferredRelations) {
      const key = `${rel.type}:${rel.from}:${rel.to}`;
      if (!seenKeys.has(key)) {
        merged.push(rel);
        seenKeys.add(key);
      }
    }

    return merged;
  }

  /**
   * Validate a single bridge relation using relation semantics
   * Returns null if invalid, otherwise returns enhanced relation
   */
  _validateBridgeRelation(rel, source = 'unknown', subjectType = null, objectType = null) {
    // Required fields
    if (!rel.type || !rel.from || !rel.to) {
      return null;
    }

    const originalType = rel.type;
    rel.type = this._canonicalRelationType(rel.type);
    if (rel.type !== originalType) {
      rel.originalType = originalType;
      rel.normalizedType = rel.type;
    }

    // Get relation semantics
    const semantics = BRIDGE_RELATION_SEMANTICS[rel.type];

    // Check if relation type is known
    if (!semantics) {
      // Unknown relation type - keep but flag for review
      rel.isUnknownType = true;
      rel.validationWarning = `Unknown relation type: ${rel.type}`;
    } else {
      // Validate against domain/range constraints if types available
      if (subjectType && objectType) {
        const validation = validateRelation(rel.type, subjectType, objectType);
        if (!validation.valid) {
          // Don't reject, but flag the issue
          rel.validationWarning = validation.reason;
          rel.requiresTypeReview = true;
        }
      }
    }

    // Determine confidence based on evidence and source
    const hasSourceEvidence = !!rel.provenance?.sourceText;
    const confidenceCap = getConfidenceCap(rel.type, hasSourceEvidence);

    // Set confidence with cap
    if (rel.confidence === undefined) {
      rel.confidence = hasSourceEvidence ? 0.85 : confidenceCap;
    } else {
      rel.confidence = Math.min(rel.confidence, confidenceCap);
    }

    // Set inference method
    rel.inferenceMethod = rel.inferenceMethod || source;
    rel.extractionSource = source;

    // Mark fallback status
    if (semantics?.fallbackConditions?.allowed && !hasSourceEvidence) {
      rel.isFallback = true;
      rel.requiresVerification = true;
      rel.fallbackNote = semantics.fallbackConditions.note;
    }

    // Ensure provenance exists
    if (!rel.provenance) {
      rel.provenance = this._createProvenance('unknown', null, {
        note: `Relation extracted via ${source}`
      });
    }

    // If LLM provided sourceText, mark for validation
    if (rel.provenance?.sourceText) {
      rel.provenance.hasSourceText = true;
    }

    // Add semantics info for downstream use
    if (semantics) {
      rel.semantics = {
        description: semantics.description,
        inverse: semantics.inverse,
        cardinality: semantics.cardinality
      };
    }

    return rel;
  }

  _canonicalRelationType(type) {
    const normalized = String(type || '')
      .toLowerCase()
      .trim()
      .replace(/[\s_]+/g, '-');

    if (!normalized) return type;
    if (BRIDGE_RELATION_SEMANTICS[normalized]) return normalized;

    const aliases = {
      'covers': 'covers',
      'covered-by': 'covers',
      'observes': 'observes',
      'observed-by': 'observes',
      'measures': 'measures',
      'measured-by': 'measures',
      'simulates': 'simulates',
      'simulate': 'simulates',
      'predicts': 'predicts',
      'predict': 'predicts',
      'forecasts': 'predicts',
      'forecast': 'predicts',
      'models': 'models',
      'model': 'models',
      'has-variable': 'has_variable',
      'contains-variable': 'has_variable',
      'uses-variable': 'has_variable',
      'represents': 'represents',
      'mitigates': 'mitigates',
      'targets': 'targets',
      'responds-to': 'responds_to',
      'responds': 'responds_to',
      'governs': 'governs',
      'assesses': 'assesses',
      'evaluates': 'assesses',
      'validates': 'assesses',
      'calibrates': 'assesses',
      'compares-to': 'assesses',
      'compares': 'assesses',
      'supports': 'supports',
      'feeds': 'supports',
      'uses': 'supports',
      'uses-data': 'supports',
      'trains': 'supports',
      'input-to': 'supports',
      'contradicts': 'contradicts',
      'applicable-to': 'applicable_to',
      'applies-to': 'applicable_to',
      'transferable-to': 'transferable_to',
      'limited-by': 'limited_by',
      'constrained-by': 'limited_by'
    };

    return aliases[normalized] || normalized;
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
      provenance.hasSourceText = true;
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

    // Add chunk info if available
    if (options.chunkIndex !== undefined) {
      provenance.chunkIndex = options.chunkIndex;
    }

    return provenance;
  }

  /**
   * Validate provenance for all extracted objects
   * Checks that sourceText actually appears in the source
   * @param {Object} result - Decomposition result
   * @param {string} fullText - Full source text
   */
  _validateProvenance(result, fullText) {
    if (!fullText) return;

    const allObjects = [
      ...result.capabilityObjects,
      ...result.worldObjects,
      ...result.evidenceObjects
    ];

    for (const obj of allObjects) {
      if (obj.provenance?.sourceText) {
        const validation = this.sectionParser.validateSourceText(
          obj.provenance.sourceText,
          fullText,
          0.7 // threshold
        );

        obj.provenance.sourceTextValidation = {
          valid: validation.valid,
          matchType: validation.matchType,
          confidence: validation.confidence
        };

        // If valid, find span position
        if (validation.valid) {
          const span = this.sectionParser.findSpan(obj.provenance.sourceText, fullText);
          if (span) {
            obj.provenance.spanStart = span.start;
            obj.provenance.spanEnd = span.end;
            obj.provenance.section = span.section;
            if (span.sectionTitle) {
              obj.provenance.sectionTitle = span.sectionTitle;
            }
          }
        }
      }
    }

    // Also validate bridge relations
    for (const rel of result.bridgeRelations) {
      if (rel.provenance?.sourceText) {
        const validation = this.sectionParser.validateSourceText(
          rel.provenance.sourceText,
          fullText,
          0.7
        );

        rel.provenance.sourceTextValidation = {
          valid: validation.valid,
          matchType: validation.matchType,
          confidence: validation.confidence
        };
      }
    }
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
      capabilities: (result.capabilityObjects || []).length,
      world: (result.worldObjects || []).length,
      evidence: (result.evidenceObjects || []).length,
      relations: (result.bridgeRelations || []).length
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
