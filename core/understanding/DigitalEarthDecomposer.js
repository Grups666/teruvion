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

class DigitalEarthDecomposer {
  constructor(llm, options = {}) {
    this.llm = llm;
    this.options = {
      maxRetries: options.maxRetries || 2,
      confidenceThreshold: options.confidenceThreshold || 0.6,
      useLLM: options.useLLM !== false, // Default to true
      maxChunkSize: options.maxChunkSize || 8000,
      llmTimeout: options.llmTimeout || 45000,
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
          llmResult = await this._extractWithLLM(input, content, normalizedAdmissionResult);
          if (!this._hasExtractionObjects(llmResult) && !this._hasResearchRoute(llmResult?.researchRoute)) {
            llmResult = null;
          }
          result.extractionMetadata.llmExtraction = {
            capabilityCount: llmResult?.capabilityObjects?.length || 0,
            worldCount: llmResult?.worldObjects?.length || 0,
            evidenceCount: llmResult?.evidenceObjects?.length || 0,
            relationCount: llmResult?.bridgeRelations?.length || 0,
            routeNodeCount: llmResult?.researchRoute?.nodes?.length || 0,
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
      result.capabilityObjects = merged.capabilityObjects;
      result.worldObjects = merged.worldObjects;
      result.evidenceObjects = merged.evidenceObjects;
      result.extractionMetadata.mergeStrategy = merged.strategy;
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
      result.externalResources = this._extractExternalResources(result, content);
      result.visualEvidence = this._extractVisualEvidence(content, result);
      result.researchBrief = this._buildResearchBrief(result, content, normalizedAdmissionResult);
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
    const sections = content.sections || {};
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

    // Build extraction prompt
    const prompt = this.ontologyActivator.generateExtractionPrompt(admissionResult, content);

    // Process chunks (most important sections first)
    const chunks = parsedSections.chunks;
    const allResults = [];
    let hadRequestError = false;

    // System prompt for LLM
    const systemPrompt = `You are a Digital Earth knowledge extraction system. Extract structured objects from the source text according to the provided ontology.

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
- Return valid JSON only`;

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

## Source Text (Section: ${chunk.sections.join(', ')})
${chunk.text}

Return JSON for this chunk. Focus on extracting objects mentioned in this section.`;

      try {
        const response = await this.llm.chat({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: chunkPrompt }
          ],
          temperature: 0.1,
          max_tokens: 4000,
          timeout: this.options.llmTimeout
        });

        // Parse LLM response
        const responseText = response.choices?.[0]?.message?.content || response.content || '';
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (!jsonMatch) continue;

        const parsed = JSON.parse(jsonMatch[0]);

        // Add chunk context to results
        if (parsed.capabilityObjects || parsed.worldObjects || parsed.evidenceObjects || parsed.researchRoute) {
          allResults.push({
            ...parsed,
            chunkInfo: {
              sections: chunk.sections,
              importance: chunk.importance,
              index: chunk.index
            }
          });
        }

        // Limit processing to top 3 chunks for efficiency
        if (allResults.length >= 3) break;

      } catch (error) {
        hadRequestError = true;
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
          temperature: 0.1,
          max_tokens: 4000,
          timeout: this.options.llmTimeout
        });

        const responseText = response.choices?.[0]?.message?.content || response.content || '';
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          allResults.push(JSON.parse(jsonMatch[0]));
        }
      } catch (error) {
        console.error('LLM extraction failed (fallback):', error.message);
        throw error;
      }
    }

    // Merge all chunk results
    return this._mergeChunkResults(allResults);
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
      sections: { chunks: chunkResults.length }
    };

    const seenCapabilities = new Map();
    const seenWorld = new Map();
    const seenEvidence = new Map();
    const seenRelations = new Set();
    const routeCandidates = [];

    for (const chunkResult of chunkResults) {
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
    const metadata = content.metadata || {};
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

    let level = 'limited';
    if (contentNodes.length >= 3 && stages.size >= 2 && edges.length > 0) {
      level = detailNodeCount > 0 ? 'content' : 'partial';
    } else if (contentNodes.length >= 2 && edges.length > 0) {
      level = 'partial';
    }

    return {
      level,
      contentNodeCount: contentNodes.length,
      stageCount: stages.size,
      edgeCount: edges.length,
      detailNodeCount,
      reasons
    };
  }

  _buildResearchBrief(result, content = {}, admissionResult = {}) {
    const source = result.sourceObject || {};
    const attributes = source.attributes || {};
    const metadata = content.metadata || {};
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

    const keyPoints = [
      {
        id: 'route',
        label: 'Core Route',
        value: this._summarizeText(routeValue, 90),
        detail: routeNodes.length > 0
          ? this._summarizeText(routeSummary || 'Main content route extracted from the source.', 180)
          : 'The available source material does not yet expose a clear content route.'
      },
      {
        id: 'method',
        label: 'Method / Mechanism',
        value: this._summarizeText(methodNode?.label || result.capabilityObjects?.[0]?.name || result.capabilityObjects?.[0]?.attributes?.name || 'Needs extraction', 70),
        detail: methodNode?.summary
          || result.capabilityObjects?.[0]?.attributes?.description
          || 'No explicit method, model, code path, or workflow mechanism is available yet.'
      },
      {
        id: 'material',
        label: 'Input / Context',
        value: this._summarizeText(dataOrContextNode?.label || result.worldObjects?.[0]?.name || result.worldObjects?.[0]?.attributes?.name || 'Needs anchor', 70),
        detail: dataOrContextNode?.summary
          || result.worldObjects?.[0]?.attributes?.description
          || 'No verified data, resource, spatial, temporal, or Earth-system anchor was extracted yet.'
      },
      {
        id: 'evidence',
        label: strongestResource ? 'Evidence / Resource' : 'Result / Evidence',
        value: this._summarizeText(evidenceNode?.label || result.evidenceObjects?.[0]?.attributes?.statement || result.evidenceObjects?.[0]?.name || strongestResource?.label || 'Needs verification', 70),
        detail: evidenceNode?.summary
          || result.evidenceObjects?.[0]?.attributes?.statement
          || strongestResource?.reviewHint
          || 'No claim-level evidence chain or linked resource is available yet.'
      }
    ];

    return {
      title,
      sourceType: source.type || result.sourceType || 'Source',
      authors: authorText,
      institutions: institutionText,
      year: attributes.year || metadata.year || metadata.publicationYear || null,
      venue: attributes.venue || metadata.venue || metadata.journal || null,
      url: attributes.url || attributes.doi || attributes.identifier || result.input || null,
      oneLine: this._summarizeText(abstract || attributes.description || metadata.description || title, 280),
      keyPoints,
      confidence: result.confidence,
      provenance: {
        method: 'protocol-derived',
        llm: result.extractionMetadata?.llmExtraction?.success === true,
        admissionDepth: admissionResult.depth || result.depth
      }
    };
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
      const label = primary
        ? this._contentRouteLabel(primary, stageKey)
        : fallback.label;
      const stageSummary = fallback.summary || stage.fallbackSummary;
      const summary = primary
        ? this._objectSummary(primary, stageSummary) || stageSummary
        : stageSummary;
      const children = primary
        ? this._contentRouteChildren(primary, stageKey)
        : fallback.children || [];

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
    addStageNode('context');
    addStageNode('evidence');

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
    const metadata = content.metadata || {};
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

    return {
      data: this._routeFallbackFromFields('data', source, ['datasets', 'dataSources', 'variables', 'inputs', 'observations']),
      method: this._routeFallbackFromFields('method', source, ['models', 'methods', 'algorithms', 'workflows']),
      context: this._routeFallbackFromFields('context', source, ['regions', 'studyRegions', 'locations', 'hazards', 'risks']),
      evidence: this._routeFallbackFromFields('evidence', source, ['results', 'findings', 'claims', 'outputs', 'conclusions'])
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
      || ['paper', 'source', 'repository', 'connected', 'global view', 'workflow readable', 'evidence available', 'method', 'dataset', 'workflow', 'claim'].includes(normalized)
      || normalized.endsWith(' workflow');
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
      node.summary || node.description || node.detail || definition.fallbackSummary,
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

    return visuals;
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

  _buildInferredLimitations(result) {
    const limitations = [];
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

      const parsed = JSON.parse(jsonMatch[0]);
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
    return [...new Set(matches.map(url => url.replace(/[.;,]+$/, '')))];
  }

  _classifyResourceUrl(url) {
    const value = String(url).toLowerCase();
    if (value.includes('github.com')) return 'repository';
    if (value.includes('zenodo') || value.includes('figshare') || value.includes('dataverse')) return 'dataset';
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
    const regions = metadata.regions || metadata.studyAreas || [];

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
          area: region.area,
          type: regionType
        },
        confidence: region.confidence || 0.8,
        provenance: {
          section: 'spatial',
          sourceText: region.originalText
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
