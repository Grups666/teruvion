/**
 * DigitalEarthImporter - Unified Import Pipeline
 *
 * Single entry point for all source imports using the Digital Earth pipeline:
 * SourceAdmission → DigitalEarthDecomposer → TripleStore
 *
 * This replaces the legacy ResearchImporter and UnifiedIngest.
 */

const { Entity } = require('../../core/registry/TripleStore');
const { Project } = require('../../core/project/Project');
const { SourceAdmission } = require('../../core/admission/SourceAdmission');
const DigitalEarthDecomposer = require('../../core/understanding/DigitalEarthDecomposer');
const llm = require('../../core/utils/llm');
const ConnectorRegistry = require('../../core/connectors/ConnectorRegistry');
const ontology = require('../../core/registry/ontology');
const { summarizeSourceCoverage } = require('../../core/source/SourceCoverage');
const {
  buildProjectActionPlan,
  buildProjectImportDiagnosis,
  buildProjectReadinessSummary
} = require('../../core/project/ProjectDiagnostics');
const PaperIdentifierResolver = require('../../core/connectors/PaperIdentifierResolver');

class DigitalEarthImporter {
  constructor(store, eventLog, projectRegistry, sseNotify) {
    this.store = store;
    this.eventLog = eventLog;
    this.projectRegistry = projectRegistry;
    this.sseNotify = sseNotify;

    // Initialize pipeline components
    this.admission = new SourceAdmission(llm);
    this.decomposer = new DigitalEarthDecomposer(llm);

    // Connector registry for fetching
    const config = {
      githubToken: llm.getGitHubToken(),
      openAlexKey: llm.getOpenAlexKey()
    };
    this.connectorRegistry = new ConnectorRegistry(config);
    this.paperIdentifierResolver = new PaperIdentifierResolver(config);

    // Active analyses for cancellation
    this.activeAnalyses = new Map();
  }

  /**
   * Main import entry point
   * Creates project immediately, runs pipeline in background
   */
  async import(input) {
    console.log('[DigitalEarthImporter] Starting import:', input);

    const inputType = this._identifyInputType(input);

    // Create Project immediately (status: importing)
    const project = new Project(
      'Importing...',
      'Processing source through Digital Earth pipeline',
      {
        source: input,
        sourceType: inputType,
        importedAt: new Date().toISOString()
      }
    );

    project.startAnalysis(['admission', 'fetching', 'decomposition', 'storing']);
    this._updateProjectImportProtocol(project, { status: 'analyzing' });
    this.projectRegistry.addProject(project);
    await this.projectRegistry.save();

    console.log('[DigitalEarthImporter] Project created:', project.id);

    // Run background pipeline
    const abortController = new AbortController();
    this.activeAnalyses.set(project.id, abortController);

    this._runBackgroundPipeline(project.id, input, abortController.signal)
      .catch(err => {
        console.error('[DigitalEarthImporter] Pipeline failed:', err.message);
        project.failAnalysis(err.message);
        this.projectRegistry.save();
      })
      .finally(() => {
        this.activeAnalyses.delete(project.id);
      });

    return {
      success: true,
      projectId: project.id,
      status: 'importing',
      project: project.toJSON()
    };
  }

  /**
   * Background pipeline execution
   */
  async _runBackgroundPipeline(projectId, input, signal) {
    const project = this.projectRegistry.getProject(projectId);
    if (!project) throw new Error('Project not found');

    try {
      // Phase 1: Fetch content
      project.updateProgress('fetching', 'started');
      this._notifyProgress(projectId, 'fetching', 'started');

      const content = await this.connectorRegistry.fetch(input);
      project.updateProgress('fetching', 'completed');
      await this.projectRegistry.save();

      if (signal.aborted) throw new Error('Import cancelled');

      // Phase 2: Source Admission
      project.updateProgress('admission', 'started');
      this._notifyProgress(projectId, 'admission', 'started');

      const admissionResult = await this.admission.evaluate(input, content, {});
      console.log('[DigitalEarthImporter] Admission:', {
        admitted: admissionResult.admitted,
        depth: admissionResult.depth,
        primaryRole: admissionResult.primaryRole
      });

      if (!admissionResult.admitted) {
        throw new Error(`Source rejected: ${admissionResult.reasoning}`);
      }

      project.updateProgress('admission', 'completed', {
        depth: admissionResult.depth,
        primaryRole: admissionResult.primaryRole
      });
      await this.projectRegistry.save();

      if (signal.aborted) throw new Error('Import cancelled');

      // Phase 3: Digital Earth Decomposition
      project.updateProgress('decomposition', 'started');
      this._notifyProgress(projectId, 'decomposition', 'started');

      const decomposition = await this.decomposer.decompose(input, content, admissionResult);
      await this._enrichLinkedResources(decomposition, signal);
      console.log('[DigitalEarthImporter] Decomposition:', {
        capabilities: decomposition.capabilityObjects?.length || 0,
        world: decomposition.worldObjects?.length || 0,
        evidence: decomposition.evidenceObjects?.length || 0,
        bridges: decomposition.bridgeRelations?.length || 0
      });

      project.updateProgress('decomposition', 'completed', {
        capabilities: decomposition.capabilityObjects?.length || 0,
        world: decomposition.worldObjects?.length || 0
      });
      await this.projectRegistry.save();

      if (signal.aborted) throw new Error('Import cancelled');

      // Phase 4: Store in TripleStore
      project.updateProgress('storing', 'started');
      this._notifyProgress(projectId, 'storing', 'started');

      const stored = await this._storeDecomposition(project, decomposition, input);
      console.log('[DigitalEarthImporter] Stored:', stored);

      project.updateProgress('storing', 'completed', {
        entities: stored.entities,
        relations: stored.relations
      });

      // Update project name from source object
      if (decomposition.sourceObject?.name) {
        project.name = decomposition.sourceObject.name.substring(0, 100);
      } else if (decomposition.sourceObject?.title) {
        project.name = decomposition.sourceObject.title.substring(0, 100);
      }
      project.description = decomposition.sourceObject?.description || 'Imported source';

      // Store decomposition metadata
      const sourceCoverage = summarizeSourceCoverage(content);
      project.metadata.decomposition = decomposition;
      project.metadata.admission = admissionResult;
      project.metadata.sourceCoverage = sourceCoverage;
      this._updateProjectImportProtocol(project, {
        status: project.analysis.status,
        sourceCoverage,
        decomposition,
        stored
      });

      await this.projectRegistry.save();
      await this.store.save();

      console.log('[DigitalEarthImporter] Pipeline completed:', projectId);

      // Notify completion
      this._notifyProgress(projectId, 'completed', {
        status: 'completed',
        entities: stored.entities,
        relations: stored.relations
      });

    } catch (err) {
      if (err.message === 'Import cancelled') {
        project.cancelAnalysis();
      } else {
        project.failAnalysis(err.message);
      }
      this._updateProjectImportProtocol(project, {
        status: project.analysis.status,
        error: err.message
      });
      await this.projectRegistry.save();

      this._notifyProgress(projectId, 'error', {
        status: 'failed',
        error: err.message
      });

      throw err;
    }
  }

  /**
   * Store decomposition results in TripleStore
   */
  async _storeDecomposition(project, decomposition, input) {
    const entityMap = new Map(); // name → entityId
    let entityCount = 0;
    let relationCount = 0;
    const projectId = project.id;
    let sourceId = null;

    // 1. Store source object
    if (decomposition.sourceObject) {
      const sourceEntity = this._createEntity(decomposition.sourceObject, input, projectId);
      this.store.addEntity(sourceEntity);
      sourceId = sourceEntity.id;
      this._registerEntityKeys(entityMap, decomposition.sourceObject, sourceEntity.id);
      project.addEntity(sourceEntity.id, decomposition.sourceObject.type);
      entityCount++;
    }

    // 2. Store capability objects
    for (const cap of (decomposition.capabilityObjects || [])) {
      const entity = this._createEntity(cap, input, projectId);
      this.store.addEntity(entity);
      this._registerEntityKeys(entityMap, cap, entity.id);
      project.addEntity(entity.id, cap.type);
      entityCount++;

      // Create relation from source to capability
      if (sourceId) {
        try {
          this.store.addTriple(sourceId, 'produces', entity.id, { confidence: 0.8 });
          relationCount++;
        } catch (e) {
          // Skip invalid relations
        }
      }
    }

    // 3. Store world objects
    for (const world of (decomposition.worldObjects || [])) {
      const entity = this._createEntity(world, input, projectId);
      this.store.addEntity(entity);
      this._registerEntityKeys(entityMap, world, entity.id);
      project.addEntity(entity.id, world.type);
      entityCount++;

      // Create relation from source to world
      if (sourceId) {
        try {
          this.store.addTriple(sourceId, 'studies', entity.id, { confidence: 0.8 });
          relationCount++;
        } catch (e) {
          // Skip invalid relations
        }
      }
    }

    // 4. Store evidence objects
    for (const evidence of (decomposition.evidenceObjects || [])) {
      const entity = this._createEntity(evidence, input, projectId);
      this.store.addEntity(entity);
      this._registerEntityKeys(entityMap, evidence, entity.id);
      project.addEntity(entity.id, evidence.type);
      entityCount++;
    }

    // 5. Store bridge relations
    for (const bridge of (decomposition.bridgeRelations || [])) {
      const fromId = entityMap.get(bridge.from) || bridge.from;
      const toId = entityMap.get(bridge.to) || bridge.to;

      if (fromId && toId && fromId !== toId) {
        try {
          this.store.addTriple(fromId, bridge.type, toId, {
            confidence: bridge.confidence || 0.7,
            provenance: bridge.provenance
          });
          relationCount++;
        } catch (e) {
          // Skip invalid relations
        }
      }
    }

    return { entities: entityCount, relations: relationCount };
  }

  /**
   * Create a TripleStore Entity from decomposition object
   */
  _createEntity(obj, source, projectId) {
    const objectMetadata = obj.metadata || {};

    // Merge attributes, ensuring name is preserved
    const attrs = {
      ...obj.attributes,
      ...obj,
      name: obj.name || obj.attributes?.name || obj.id?.split('/').pop() || 'Unnamed',
    };

    // Remove internal fields from attributes
    delete attrs.id;
    delete attrs.type;
    delete attrs.confidence;
    delete attrs.provenance;
    delete attrs.metadata;

    return new Entity(obj.type, attrs, {
      id: obj.id,
      ...objectMetadata,
      source,
      projectId,
      extractedBy: 'DigitalEarthDecomposer',
      confidence: typeof objectMetadata.confidence === 'number'
        ? objectMetadata.confidence
        : (obj.confidence || 0.8),
      provenance: obj.provenance || objectMetadata.provenance
    });
  }

  _updateProjectImportProtocol(project, payload = {}) {
    const importDiagnosis = buildProjectImportDiagnosis(payload);
    const importReadiness = buildProjectReadinessSummary(importDiagnosis);
    project.metadata.importDiagnosis = importDiagnosis;
    project.metadata.importReadiness = importReadiness;
    project.metadata.importActions = buildProjectActionPlan(importDiagnosis, importReadiness);
  }

  async _enrichLinkedResources(decomposition = {}, signal) {
    const resources = decomposition.externalResources || [];
    const candidates = resources
      .filter(resource => resource?.url && String(resource.type || '').toLowerCase() === 'repository')
      .slice(0, 2);

    for (const resource of candidates) {
      if (signal?.aborted) throw new Error('Import cancelled');
      const connector = this.connectorRegistry.findConnector(resource.url);
      if (!connector || connector.getName() !== 'GitHubConnector') continue;

      try {
        const linkedContent = await connector.fetch(resource.url);
        const review = linkedContent?.metadata?.repositoryReview;
        if (!review) continue;

        resource.reproducibilityGrade = review.grade;
        resource.routeRelevance = review.summary || resource.routeRelevance;
        resource.verificationFocus = this._resourceVerificationFocusFromReview(review) || resource.verificationFocus;
        resource.reviewHint = `Static reproducibility grade ${review.grade}. ${review.warnings?.[0] || review.summary || 'Inspect repository before reuse.'}`;
        resource.investigationLabel = resource.investigationLabel || 'Reproduce method';
        resource.enrichment = {
          source: 'github-static-review',
          checkedAt: new Date().toISOString(),
          grade: review.grade
        };
      } catch (error) {
        resource.enrichment = {
          source: 'github-static-review',
          status: 'unavailable',
          error: error.message
        };
      }
    }
  }

  _resourceVerificationFocusFromReview(review = {}) {
    if (!review.checks) return null;
    const missing = Object.entries(review.checks)
      .filter(([, passed]) => !passed)
      .map(([key]) => key.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase())
      .slice(0, 3);
    return missing.length > 0
      ? `missing ${missing.join(', ')}`
      : 'README, license, dependencies, runnable examples, and data instructions';
  }

  _registerEntityKeys(entityMap, obj, entityId) {
    for (const key of this._getObjectReferenceKeys(obj)) {
      entityMap.set(key, entityId);
    }
  }

  _getObjectReferenceKeys(obj = {}) {
    const attrs = obj.attributes || {};
    const candidates = [
      obj.id,
      obj.name,
      obj.title,
      obj.label,
      obj.statement,
      attrs.id,
      attrs.name,
      attrs.title,
      attrs.label,
      attrs.statement
    ];

    if (typeof obj.statement === 'string') {
      candidates.push(obj.statement.substring(0, 50));
    }
    if (typeof attrs.statement === 'string') {
      candidates.push(attrs.statement.substring(0, 50));
    }

    return candidates
      .filter(value => typeof value === 'string' && value.trim().length > 0)
      .map(value => value.trim());
  }

  /**
   * Cancel an active import
   */
  cancelImport(projectId) {
    const controller = this.activeAnalyses.get(projectId);
    if (controller) {
      controller.abort();
      console.log('[DigitalEarthImporter] Import cancelled:', projectId);
      const project = this.projectRegistry.getProject(projectId);
      if (project) {
        project.cancelAnalysis();
        this._updateProjectImportProtocol(project, { status: 'cancelled' });
        this.projectRegistry.save().catch(err => {
          console.error('[DigitalEarthImporter] Failed to save cancelled project:', err.message);
        });
      }
      return true;
    }
    return false;
  }

  /**
   * Get decomposition result by project ID
   */
  getDecompositionByProject(projectId) {
    const project = this.projectRegistry.getProject(projectId);
    if (!project || !project.metadata.decomposition) {
      return null;
    }
    return project.metadata.decomposition;
  }

  /**
   * Get admission result by project ID
   */
  getAdmissionByProject(projectId) {
    const project = this.projectRegistry.getProject(projectId);
    if (!project || !project.metadata.admission) {
      return null;
    }
    return project.metadata.admission;
  }

  /**
   * Notify SSE clients of progress
   */
  _notifyProgress(projectId, phase, status) {
    if (this.sseNotify) {
      const payload = typeof status === 'object' && status !== null
        ? { phase, ...status, timestamp: Date.now() }
        : { phase, status, timestamp: Date.now() };

      this.sseNotify(projectId, 'progress', payload);
    }
  }

  /**
   * Identify input type from string
   */
  _identifyInputType(input) {
    const connector = this.connectorRegistry.findConnector(input);
    if (connector) {
      return connector.getName()
        .replace(/Connector$/, '')
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .toLowerCase();
    }

    if (this.paperIdentifierResolver.isURL(input)) return 'url';
    return 'text';
  }
}

module.exports = DigitalEarthImporter;
