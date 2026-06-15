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
const SpatialResourceSampler = require('../../core/connectors/SpatialResourceSampler');
const SpatialRepositoryDiscovery = require('../../core/connectors/SpatialRepositoryDiscovery');
const NamedLocationResolver = require('../../core/connectors/NamedLocationResolver');
const ontology = require('../../core/registry/ontology');
const { summarizeSourceCoverage } = require('../../core/source/SourceCoverage');
const {
  buildProjectActionPlan,
  buildProjectImportDiagnosis,
  buildProjectReadinessSummary
} = require('../../core/project/ProjectDiagnostics');
const { buildProjectRecomposition } = require('../../core/project/ProjectRecomposer');
const { buildMapRecomposition } = require('../../core/project/MapRecomposer');
const { planMapExpression } = require('../../core/project/MapExpressionPlanner');
const PaperIdentifierResolver = require('../../core/connectors/PaperIdentifierResolver');
const SourceAssetCache = require('../../core/source/SourceAssetCache');

class DigitalEarthImporter {
  constructor(store, eventLog, projectRegistry, sseNotify) {
    this.store = store;
    this.eventLog = eventLog;
    this.projectRegistry = projectRegistry;
    this.sseNotify = sseNotify;

    // Initialize pipeline components
    this.admission = new SourceAdmission(llm);
    const useLLM = process.env.TERUVION_DISABLE_LLM !== 'true';
    this.decomposer = new DigitalEarthDecomposer(llm, { useLLM });
    this.assetCache = new SourceAssetCache();

    // Connector registry for fetching
    const config = {
      githubToken: llm.getGitHubToken(),
      openAlexKey: llm.getOpenAlexKey()
    };
    this.connectorRegistry = new ConnectorRegistry(config);
    this.spatialSampler = new SpatialResourceSampler(config);
    this.spatialRepositoryDiscovery = new SpatialRepositoryDiscovery(config);
    this.namedLocationResolver = new NamedLocationResolver(config);
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
      await this.assetCache.cacheVisualEvidence(decomposition.visualEvidence);
      await this._enrichLinkedResources(decomposition, signal);
      await this._enrichNamedLocations(decomposition, signal);
      await planMapExpression({ decomposition, llm: this.decomposer.options?.useLLM === false ? null : llm });
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
      const projectRecomposition = buildProjectRecomposition({
        decomposition,
        sourceCoverage,
        admission: admissionResult
      });
      const mapRecomposition = buildMapRecomposition({
        decomposition,
        sourceCoverage,
        admission: admissionResult
      });
      project.metadata.decomposition = decomposition;
      project.metadata.admission = admissionResult;
      project.metadata.sourceCoverage = sourceCoverage;
      project.metadata.projectRecomposition = projectRecomposition;
      project.metadata.mapRecomposition = mapRecomposition;
      this._updateProjectImportProtocol(project, {
        status: project.analysis.status,
        sourceCoverage,
        decomposition,
        projectRecomposition,
        mapRecomposition,
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
      project.addEntity(sourceEntity.id, sourceEntity.type);
      entityCount++;
    }

    // 2. Store capability objects
    for (const cap of (decomposition.capabilityObjects || [])) {
      const entity = this._createEntity(cap, input, projectId);
      this.store.addEntity(entity);
      this._registerEntityKeys(entityMap, cap, entity.id);
      project.addEntity(entity.id, entity.type);
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
      project.addEntity(entity.id, entity.type);
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
      project.addEntity(entity.id, entity.type);
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
    const resolvedType = ontology.resolveEntityType(obj.type);
    const entityType = resolvedType.valid ? resolvedType.type : 'Entity';

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

    return new Entity(entityType, attrs, {
      id: obj.id,
      ...objectMetadata,
      originalType: resolvedType.changed || !resolvedType.valid
        ? (objectMetadata.originalType || resolvedType.originalType || obj.type)
        : objectMetadata.originalType,
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
    await this._discoverLinkedSpatialRepositoryResources(resources, signal);
    await this._enrichLinkedSpatialResources(decomposition, resources, signal);
    await this._enrichRepositoryResources(resources, signal);
  }

  async _enrichNamedLocations(decomposition = {}, signal) {
    const worldObjects = Array.isArray(decomposition.worldObjects)
      ? decomposition.worldObjects
      : (decomposition.worldObjects = []);
    const candidates = worldObjects
      .filter(object => this.namedLocationResolver.canResolve(object))
      .slice(0, this.namedLocationResolver.config.maxLocations || 4);

    for (const object of candidates) {
      if (signal?.aborted) throw new Error('Import cancelled');
      try {
        const resolved = await this.namedLocationResolver.resolve(object);
        if (!resolved) {
          object.metadata = {
            ...(object.metadata || {}),
            geocoding: {
              status: 'not-found',
              query: object.attributes?.location || object.name || null,
              checkedAt: new Date().toISOString()
            }
          };
          continue;
        }

        object.attributes = {
          ...(object.attributes || {}),
          coordinates: resolved.coordinates,
          bbox: object.attributes?.bbox || resolved.bbox || null,
          locationName: object.attributes?.locationName || resolved.query,
          geocodedDisplayName: resolved.displayName,
          properties: {
            ...(object.attributes?.properties || {}),
            geocodedDisplayName: resolved.displayName,
            geocodingProvider: resolved.provider
          }
        };
        object.confidence = Math.min(object.confidence || 0.72, resolved.confidence);
        object.provenance = {
          ...(object.provenance || {}),
          geocoding: {
            method: 'external-geocoding',
            provider: resolved.provider,
            query: resolved.query,
            displayName: resolved.displayName,
            checkedAt: new Date().toISOString()
          }
        };
        object.metadata = {
          ...(object.metadata || {}),
          geocoding: {
            status: 'resolved',
            provider: resolved.provider,
            query: resolved.query,
            rawType: resolved.rawType,
            rawClass: resolved.rawClass
          }
        };
      } catch (error) {
        object.metadata = {
          ...(object.metadata || {}),
          geocoding: {
            status: 'unavailable',
            error: error.message,
            checkedAt: new Date().toISOString()
          }
        };
      }
    }
  }

  async _discoverLinkedSpatialRepositoryResources(resources = [], signal) {
    const discoveredUrls = new Set(resources.map(resource => String(resource.url || '')).filter(Boolean));
    const candidates = resources
      .filter(resource => resource?.url && this.spatialRepositoryDiscovery.canDiscover(resource))
      .slice(0, 4);

    for (const resource of candidates) {
      if (signal?.aborted) throw new Error('Import cancelled');
      try {
        const discovery = await this.spatialRepositoryDiscovery.discover(resource);
        resource.discovery = {
          source: discovery.source || 'spatial-repository-discovery',
          status: discovery.status,
          platform: discovery.platform || null,
          candidateCount: discovery.diagnostics?.candidateCount || 0,
          returnedCount: discovery.resources?.length || 0,
          checkedAt: new Date().toISOString()
        };

        for (const discovered of discovery.resources || []) {
          if (!discovered?.url || discoveredUrls.has(String(discovered.url))) continue;
          resources.push(discovered);
          discoveredUrls.add(String(discovered.url));
        }
      } catch (error) {
        resource.discovery = {
          source: 'spatial-repository-discovery',
          status: 'unavailable',
          error: error.message,
          checkedAt: new Date().toISOString()
        };
      }
    }
  }

  async _enrichRepositoryResources(resources = [], signal) {
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

  async _enrichLinkedSpatialResources(decomposition = {}, resources = [], signal) {
    const worldObjects = Array.isArray(decomposition.worldObjects)
      ? decomposition.worldObjects
      : (decomposition.worldObjects = []);
    const existingSourceUrls = new Set(worldObjects
      .map(object => object.attributes?.sourceUrl || object.provenance?.sourceUrl || object.provenance?.url)
      .filter(Boolean)
      .map(String));

    const candidates = resources
      .filter(resource => resource?.url && !existingSourceUrls.has(String(resource.url)))
      .filter(resource => resource.samplingEligible !== false)
      .filter(resource => this.spatialSampler.canSample(resource.url, resource))
      .slice(0, 4);

    for (const resource of candidates) {
      if (signal?.aborted) throw new Error('Import cancelled');

      try {
        const sample = await this.spatialSampler.sample(resource.url, resource);
        const features = Array.isArray(sample?.geoFeatures)
          ? sample.geoFeatures.slice(0, 120)
          : [];

        for (const [index, feature] of features.entries()) {
          const featureId = feature.id || `feature-${index + 1}`;
          worldObjects.push({
            id: `linked-${this._slugifyResourceId(resource.url)}-${this._slugifyResourceId(featureId)}`,
            type: feature.type || 'Region',
            name: feature.name || feature.label || `Linked spatial feature ${index + 1}`,
            attributes: {
              geometry: feature.geometry || null,
              bbox: feature.bbox || null,
              displayPrimitive: feature.displayPrimitive || null,
              sourceUrl: resource.url,
              properties: feature.properties || {},
              ...(feature.properties || {})
            },
            confidence: feature.confidence || 0.86,
            provenance: {
              method: 'linked-spatial-sample',
              sourceUrl: resource.url,
              sourceResource: resource.label || resource.url,
              sourceFormat: sample.format || resource.format || resource.dataFormat || null,
              parentSource: decomposition.sourceObject?.id || decomposition.sourceObject?.name || null,
              sampledAt: new Date().toISOString()
            },
            metadata: {
              linkedResourceUrl: resource.url,
              linkedResourceFormat: sample.format || resource.format || resource.dataFormat || null
            }
          });
        }

        if (features.length === 0 && sample?.rasterMetadata?.bbox) {
          worldObjects.push({
            id: `linked-${this._slugifyResourceId(resource.url)}-coverage`,
            type: 'Region',
            name: `${resource.label || sample.title || 'Linked raster'} coverage`,
            attributes: {
              bbox: sample.rasterMetadata.bbox,
              displayPrimitive: 'raster-layer',
              sourceUrl: resource.url,
              properties: {
                format: sample.format || 'geotiff',
                width: sample.rasterMetadata.width,
                height: sample.rasterMetadata.height,
                samplesPerPixel: sample.rasterMetadata.samplesPerPixel
              }
            },
            confidence: 0.76,
            provenance: {
              method: 'linked-spatial-metadata-sample',
              sourceUrl: resource.url,
              sourceResource: resource.label || resource.url,
              sourceFormat: sample.format || resource.format || resource.dataFormat || null,
              parentSource: decomposition.sourceObject?.id || decomposition.sourceObject?.name || null,
              sampledAt: new Date().toISOString()
            },
            metadata: {
              linkedResourceUrl: resource.url,
              linkedResourceFormat: sample.format || resource.format || resource.dataFormat || null,
              rasterMetadata: sample.rasterMetadata
            }
          });
        }

        resource.enrichment = {
          source: 'linked-spatial-sample',
          status: sample?.status || (features.length > 0 ? 'sampled' : 'needs-review'),
          sampledFeatureCount: features.length,
          fullFeatureCount: sample?.featureCount || features.length,
          rasterMetadata: sample?.rasterMetadata || null,
          checkedAt: new Date().toISOString()
        };
        resource.format = resource.format || sample?.format || null;
        resource.dataFormat = resource.dataFormat || sample?.format || null;
        resource.routeRelevance = resource.routeRelevance || linkedSpatialRouteRelevance(sample, features.length);
        resource.verificationFocus = resource.verificationFocus || 'inspect sampled feature attributes and source provenance';
        resource.reviewHint = linkedSpatialReviewHint(sample, features.length);
      } catch (error) {
        resource.enrichment = {
          source: 'linked-spatial-sample',
          status: 'unavailable',
          error: error.message
        };
      }
    }
  }

  _slugifyResourceId(value) {
    return String(value || 'resource')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 56) || 'resource';
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

function linkedSpatialRouteRelevance(sample = {}, featureCount = 0) {
  if (featureCount > 0) {
    return `Linked ${sample.format || 'spatial'} resource sampled into ${featureCount} map feature(s).`;
  }
  if (sample.rasterMetadata?.bbox) {
    return `Linked ${sample.format || 'raster'} resource exposes bounded raster coverage metadata.`;
  }
  return `Linked ${sample.format || 'spatial'} resource needs review before map rendering.`;
}

function linkedSpatialReviewHint(sample = {}, featureCount = 0) {
  if (featureCount > 0) {
    return `Linked ${sample.format || 'spatial'} resource sampled. ${featureCount} feature(s) are map-ready; verify attributes before interpretation.`;
  }
  if (sample.rasterMetadata?.bbox) {
    return `Linked ${sample.format || 'raster'} metadata sampled. Coverage can be shown, but pixel values require a future raster preview/tile path.`;
  }
  return sample.diagnostics?.warning || 'Linked spatial resource was inspected, but no map-ready features were produced.';
}

module.exports = DigitalEarthImporter;
