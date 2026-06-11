/**
 * Teruvion REST API
 * Connects Core Engine (TripleStore, Projects, Decomposer) with web frontend
 *
 * Unified Digital Earth Pipeline:
 * SourceAdmission → DigitalEarthDecomposer → TripleStore
 */

const express = require('express');
const crypto = require('crypto');
const llm = require('../../core/utils/llm');
const { TripleStore } = require('../../core/registry/TripleStore');
const { ProjectRegistry } = require('../../core/project/Project');
const EventLog = require('../../core/events/EventLog');
const Exporter = require('../../core/project/Exporter');
const DigitalEarthImporter = require('./digital-earth-importer');
const { LensRegistry } = require('../../core/lenses');
const { SourceAdmission } = require('../../core/admission/SourceAdmission');
const ontology = require('../../core/registry/ontology');

const router = express.Router();

// ============================================================================
// CORE ENGINE INITIALIZATION
// ============================================================================

let store = null;
let eventLog = null;
let projectRegistry = null;
let exporter = null;
let importer = null;
let lensRegistry = null;

// SSE connection management
const sseClients = new Map();

// SSE notification function
function notifySSEClients(projectId, eventType, data) {
  const clients = sseClients.get(projectId);
  if (!clients || clients.size === 0) return;

  const message = `data: ${JSON.stringify({ type: eventType, data })}\n\n`;
  clients.forEach(client => {
    try {
      client.write(message);
    } catch (err) {
      console.error('[SSE] Write error:', err.message);
      clients.delete(client);
    }
  });
}

async function initializeCoreEngine() {
  if (store) return;

  store = new TripleStore();
  eventLog = new EventLog();
  projectRegistry = new ProjectRegistry();

  await store.load().catch(() => console.log('[API] No existing registry, starting fresh'));
  await eventLog.load().catch(() => console.log('[API] No existing event log, starting fresh'));
  await projectRegistry.load().catch(() => console.log('[API] No existing projects, starting fresh'));

  exporter = new Exporter(store, eventLog, projectRegistry);
  importer = new DigitalEarthImporter(store, eventLog, projectRegistry, notifySSEClients);
  lensRegistry = new LensRegistry(store, ontology, projectRegistry);

  console.log('[API] Core Engine initialized');
  console.log(`[API] Loaded ${store.entities.size} entities, ${projectRegistry.getAllProjects().length} projects`);
}

// Initialize on module load
initializeCoreEngine();

// ============================================================================
// ENTITIES API
// ============================================================================

// GET /api/entities - List all entities
router.get('/entities', async (req, res) => {
  try {
    const entities = Array.from(store.entities.values()).map(e => ({
      id: e.id,
      type: e.type,
      attributes: e.attributes,
      metadata: e.metadata,
      verificationState: e.verificationState,
      createdAt: e.createdAt
    }));
    res.json({ entities, count: entities.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/entities/:id - Get single entity
router.get('/entities/:id', async (req, res) => {
  try {
    const entity = store.getEntity(req.params.id);
    if (!entity) {
      return res.status(404).json({ error: 'Entity not found' });
    }
    res.json({ entity });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/entities/:id/relations - Get all relations for an entity
router.get('/entities/:id/relations', async (req, res) => {
  try {
    const entityId = req.params.id;
    const entity = store.getEntity(entityId);

    if (!entity) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    const relations = store.getRelations(entityId);

    res.json({
      entityId,
      entityType: entity.type,
      relations: [
        ...relations.outgoing.map(r => ({
          type: r.predicate,
          from: entityId,
          to: r.object,
          confidence: r.confidence || 0.7,
          isFallback: r.metadata?.isFallback || false,
          provenance: r.provenance
        })),
        ...relations.incoming.map(r => ({
          type: r.predicate,
          from: r.subject,
          to: entityId,
          confidence: r.confidence || 0.7,
          isFallback: r.metadata?.isFallback || false,
          provenance: r.provenance
        }))
      ]
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/entities/:id/explore - Get full explore data for an entity
router.get('/entities/:id/explore', async (req, res) => {
  try {
    const entityId = req.params.id;
    const entity = store.getEntity(entityId);

    if (!entity) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    const relations = store.getRelations(entityId);

    const relatedEntities = [];
    const sources = [];
    const capabilities = [];

    // Process outgoing relations
    for (const rel of relations.outgoing) {
      const target = store.getEntity(rel.object);
      if (target) {
        relatedEntities.push({
          id: target.id,
          type: target.type,
          name: target.attributes?.name || target.id,
          relation: rel.predicate,
          direction: 'outgoing'
        });

        if (target.type === 'Paper' || target.type === 'Repository') {
          sources.push(target.attributes?.title || target.id);
        }
      }
    }

    // Process incoming relations
    for (const rel of relations.incoming) {
      const source = store.getEntity(rel.subject);
      if (source) {
        relatedEntities.push({
          id: source.id,
          type: source.type,
          name: source.attributes?.name || source.id,
          relation: rel.predicate,
          direction: 'incoming'
        });

        if (source.type === 'Paper' || source.type === 'Repository') {
          sources.push(source.attributes?.title || source.id);
        }
      }
    }

    const entityCapabilities = determineCapabilities(entity, relations);

    res.json({
      entity: {
        id: entity.id,
        type: entity.type,
        name: entity.attributes?.name || entity.id,
        layer: getEntityLayer(entity.type),
        category: getEntityCategory(entity.type),
        attributes: entity.attributes
      },
      relatedEntities,
      sources: [...new Set(sources)],
      capabilities: entityCapabilities,
      relations: [
        ...relations.outgoing.map(r => ({
          type: r.predicate,
          from: entityId,
          to: r.object,
          confidence: r.confidence || 0.7
        })),
        ...relations.incoming.map(r => ({
          type: r.predicate,
          from: r.subject,
          to: entityId,
          confidence: r.confidence || 0.7
        }))
      ]
    });
  } catch (err) {
    console.error('[API] Explore error:', err);
    res.status(500).json({ error: err.message });
  }
});

// Helper functions
function getEntityLayer(type) {
  const worldTypes = ['Basin', 'Region', 'Watershed', 'River', 'Lake', 'Glacier', 'Hazard', 'FloodEvent', 'DroughtEvent'];
  const capabilityTypes = ['Dataset', 'Model', 'Sensor', 'Gauge', 'Algorithm', 'Claim', 'Evidence', 'Assessment'];
  const sourceTypes = ['Paper', 'Repository', 'Report', 'News', 'DatasetPage'];

  if (worldTypes.includes(type)) return 'world';
  if (capabilityTypes.includes(type)) return 'capability';
  if (sourceTypes.includes(type)) return 'source';
  return 'foundation';
}

function getEntityCategory(type) {
  const categories = {
    'Basin': 'earth-object',
    'Watershed': 'earth-object',
    'Region': 'earth-object',
    'Dataset': 'data',
    'Model': 'modeling',
    'Sensor': 'observation',
    'Gauge': 'observation',
    'Claim': 'evidence',
    'Evidence': 'evidence',
    'FloodEvent': 'hazard',
    'DroughtEvent': 'hazard',
    'Paper': 'earth-content',
    'Repository': 'computing'
  };
  return categories[type] || 'general';
}

function determineCapabilities(entity, relations) {
  const caps = [];
  const type = entity.type;

  if (type === 'Basin' || type === 'Watershed') {
    caps.push('View datasets covering this basin');
    caps.push('Find models validated here');
    caps.push('See flood/drought history');
    caps.push('Compare with similar basins');
  }

  if (type === 'Dataset') {
    caps.push('Download data');
    caps.push('View coverage map');
    caps.push('See data quality metrics');
    caps.push('Find papers using this data');
  }

  if (type === 'Model') {
    caps.push('View model architecture');
    caps.push('See validation results');
    caps.push('Compare with other models');
    caps.push('Run simulation');
  }

  const outgoingTypes = relations.outgoing.map(r => r.predicate);

  if (outgoingTypes.includes('simulates')) {
    caps.push('Run model simulation');
    caps.push('Compare model performance');
  }

  if (outgoingTypes.includes('covers')) {
    caps.push('Download dataset');
    caps.push('View data quality');
  }

  if (outgoingTypes.includes('observes')) {
    caps.push('View observation data');
    caps.push('Check station status');
  }

  if (outgoingTypes.includes('supports')) {
    caps.push('View evidence chain');
    caps.push('Check claim confidence');
  }

  return [...new Set(caps)];
}

// POST /api/registry/clear - Clear all entities AND projects
router.post('/registry/clear', async (req, res) => {
  try {
    console.log('[API] Clearing all data');

    store.entities.clear();
    store.triples = [];
    store.indexes.spo.clear();
    store.indexes.pos.clear();
    store.indexes.ops.clear();
    store.indexes.typeIndex.clear();
    projectRegistry.projects.clear();

    await store.save();
    await projectRegistry.save();

    res.json({ success: true, message: 'All data cleared' });
  } catch (err) {
    console.error('[API] Clear error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/entities/type/:type - Get entities by type
router.get('/entities/type/:type', async (req, res) => {
  try {
    const entities = Array.from(store.entities.values())
      .filter(e => e.type === req.params.type)
      .map(e => ({
        id: e.id,
        type: e.type,
        attributes: e.attributes,
        metadata: e.metadata,
        verificationState: e.verificationState,
        createdAt: e.createdAt
      }));
    res.json({ entities, count: entities.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// TRIPLES API
// ============================================================================

router.get('/triples', async (req, res) => {
  try {
    const triples = store.getAllTriples();
    res.json({ triples, count: triples.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/triples/:entityId', async (req, res) => {
  try {
    const outgoing = store.query(req.params.entityId);
    const incoming = store.queryInverse(null, req.params.entityId);
    res.json({ outgoing, incoming });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// IMPORT API (Unified Digital Earth Pipeline)
// ============================================================================

// POST /api/import - Import a source through the Digital Earth pipeline
router.post('/import', async (req, res) => {
  try {
    const { input } = req.body;
    if (!input) {
      return res.status(400).json({ error: 'Missing input field' });
    }

    console.log(`[API] Starting import: ${input}`);
    const result = await importer.import(input);

    res.json({
      success: true,
      projectId: result.projectId,
      status: result.status
    });
  } catch (err) {
    console.error('[API] Import error:', err);
    res.status(400).json({ error: err.message });
  }
});

// GET /api/projects/:projectId/events - SSE stream for real-time updates
router.get('/projects/:projectId/events', (req, res) => {
  const { projectId } = req.params;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  if (!sseClients.has(projectId)) {
    sseClients.set(projectId, new Set());
  }
  sseClients.get(projectId).add(res);

  console.log(`[SSE] Client connected for project ${projectId}`);

  const project = projectRegistry.getProject(projectId);
  if (project) {
    const summary = project.getAnalysisSummary();
    res.write(`data: ${JSON.stringify({ type: 'status', data: summary })}\n\n`);
  }

  req.on('close', () => {
    const clients = sseClients.get(projectId);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) {
        sseClients.delete(projectId);
      }
    }
    console.log(`[SSE] Client disconnected for project ${projectId}`);
  });
});

// POST /api/projects/:projectId/cancel - Cancel import
router.post('/projects/:projectId/cancel', (req, res) => {
  try {
    const { projectId } = req.params;
    const cancelled = importer.cancelImport(projectId);

    if (cancelled) {
      res.json({ success: true, message: 'Import cancelled' });
    } else {
      res.status(404).json({ error: 'No active import found for this project' });
    }
  } catch (err) {
    console.error('[API] Cancel error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/projects/:projectId/decomposition - Get decomposition result
router.get('/projects/:projectId/decomposition', (req, res) => {
  try {
    const decomposition = importer.getDecompositionByProject(req.params.projectId);
    if (!decomposition) {
      return res.status(404).json({ error: 'Decomposition not found' });
    }
    res.json({ decomposition });
  } catch (err) {
    console.error('[API] Get decomposition error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// PROJECTS API
// ============================================================================

router.get('/projects', async (req, res) => {
  try {
    const projects = projectRegistry.getAllProjects().map(p => p.toJSON());
    res.json({ projects, count: projects.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/projects/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;

    importer.cancelImport(projectId);

    const project = projectRegistry.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    project.entities.forEach(entityId => {
      store.entities.delete(entityId);
      store.triples = store.triples.filter(t =>
        t.subject !== entityId && t.object !== entityId
      );
    });

    projectRegistry.deleteProject(projectId);

    await store.save();
    await projectRegistry.save();

    console.log(`[API] Deleted project ${projectId} and ${project.entities.length} entities`);

    res.json({ success: true, message: 'Project deleted' });
  } catch (err) {
    console.error('[API] Delete error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/projects/:id', async (req, res) => {
  try {
    const project = projectRegistry.getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    res.json({ project: project.toJSON() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/projects', async (req, res) => {
  try {
    const { name, description, author } = req.body;
    if (!name) {
      return res.status(400).json({ error: 'Missing name field' });
    }

    const { Project } = require('../../core/project/Project');
    const project = new Project(name, description || '', { author });

    projectRegistry.addProject(project);
    await projectRegistry.save();

    res.json({ project: project.toJSON() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/projects/:id/entities', async (req, res) => {
  try {
    const project = projectRegistry.getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const { entityId } = req.body;
    if (!entityId) {
      return res.status(400).json({ error: 'Missing entityId field' });
    }

    const entity = store.getEntity(entityId);
    if (!entity) {
      return res.status(404).json({ error: 'Entity not found' });
    }

    project.addEntity(entityId, entity.type);
    await projectRegistry.save();

    res.json({ success: true, project: project.toJSON() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/projects/:id/export', async (req, res) => {
  try {
    const project = projectRegistry.getProject(req.params.id);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const { outputDir } = req.body;
    if (!outputDir) {
      return res.status(400).json({ error: 'Missing outputDir field' });
    }

    const result = await exporter.exportProject(req.params.id, outputDir);
    res.json({ success: true, result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/projects/:projectId/status', (req, res) => {
  try {
    const { projectId } = req.params;
    const project = projectRegistry.getProject(projectId);

    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const summary = project.getAnalysisSummary();

    res.json({
      projectId: project.id,
      name: project.name,
      description: project.description,
      analysis: summary,
      entities: {
        total: project.entities.length,
        datasets: project.datasets.length,
        regions: project.regions.length
      }
    });
  } catch (err) {
    console.error('[API] Status check error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// STATS API
// ============================================================================

router.get('/stats', async (req, res) => {
  try {
    const stats = store.stats();
    const projects = projectRegistry.getAllProjects();

    res.json({
      entities: stats.totalEntities,
      triples: stats.totalTriples,
      projects: projects.length,
      entitiesByType: stats.entitiesByType,
      triplesByRelation: stats.triplesByRelation,
      verificationStates: stats.verificationStates
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// EVENTS API
// ============================================================================

router.get('/events', async (req, res) => {
  try {
    const events = eventLog.events;
    res.json({ events, count: events.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// LENS API
// ============================================================================

router.get('/lenses', (req, res) => {
  try {
    const lenses = lensRegistry.getAvailableLenses();
    res.json({ lenses });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/projects/:projectId/lens/:lensName', async (req, res) => {
  try {
    const { projectId, lensName } = req.params;
    const options = req.query;

    const result = await lensRegistry.render(projectId, lensName, options);
    res.json(result);
  } catch (err) {
    console.error('[API] Lens render error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/projects/:projectId/lens', async (req, res) => {
  try {
    const { projectId } = req.params;
    const results = await lensRegistry.renderAll(projectId);
    res.json(results);
  } catch (err) {
    console.error('[API] Lens render all error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get('/projects/:projectId/recommended-lens', (req, res) => {
  try {
    const { projectId } = req.params;
    const recommended = lensRegistry.getRecommendedLens(projectId);
    res.json({ recommended });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// ONTOLOGY API
// ============================================================================

router.get('/ontology/types', (req, res) => {
  try {
    const types = ontology.getAllEntityTypes();
    const layers = ontology.getEntitiesByLayer();
    res.json({ types, layers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/ontology/relations', (req, res) => {
  try {
    const relations = ontology.getAllRelationTypes();
    res.json({ relations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/ontology/domains', (req, res) => {
  try {
    const domains = ontology.domainOntology.getLoadedDomainNames();
    res.json({ domains });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// SOURCE ADMISSION API
// ============================================================================

router.post('/admission/evaluate', async (req, res) => {
  try {
    const { input, content, metadata } = req.body;

    const admission = new SourceAdmission(llm);

    const result = content
      ? await admission.evaluate(input, content, metadata || {})
      : await admission.quickCheck(input);

    res.json(result);
  } catch (err) {
    console.error('[API] Admission error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// ALPHA ACCESS API
// ============================================================================

const {
  AlphaApplicationStore,
  AlphaInviteStore,
  AlphaMembershipStore
} = require('../alpha');

const {
  sendApplicationReceivedEmail,
  sendAlphaInviteEmail,
  sendAdminNewApplicationEmail
} = require('../email/client');

// Initialize alpha stores
let applicationStore = null;
let inviteStore = null;
let membershipStore = null;

async function initializeAlphaStores() {
  if (applicationStore) return;

  applicationStore = new AlphaApplicationStore();
  inviteStore = new AlphaInviteStore();
  membershipStore = new AlphaMembershipStore();

  await applicationStore.load().catch(() => console.log('[API] No existing applications'));
  await inviteStore.load().catch(() => console.log('[API] No existing invites'));
  await membershipStore.load().catch(() => console.log('[API] No existing memberships'));

  console.log('[API] Alpha stores initialized');
}

// Initialize alpha stores
initializeAlphaStores();

// Rate limiter for applications
const applyRateLimiter = {
  attempts: new Map(),

  check(ip) {
    const now = Date.now();
    const attempts = this.attempts.get(ip) || [];
    const recent = attempts.filter(t => now - t < 3600000); // 1 hour window

    if (recent.length >= 3) return false;
    recent.push(now);
    this.attempts.set(ip, recent);
    return true;
  }
};

// Helper: Validate email format
function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// Helper: Check admin secret
function requireAdmin(req, res) {
  const secret = Array.isArray(req.headers['x-admin-secret'])
    ? req.headers['x-admin-secret'][0]
    : req.headers['x-admin-secret'];
  const expectedSecret = llm.getAdminSecret();

  if (!expectedSecret) {
    console.error('[Alpha] ADMIN_SECRET or local adminSecret is not configured');
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }

  const secretBuffer = Buffer.from(String(secret || ''));
  const expectedBuffer = Buffer.from(expectedSecret);

  if (
    secretBuffer.length !== expectedBuffer.length
    || !crypto.timingSafeEqual(secretBuffer, expectedBuffer)
  ) {
    res.status(401).json({ error: 'Unauthorized' });
    return false;
  }
  return true;
}

// POST /api/alpha/apply - Submit application
router.post('/alpha/apply', async (req, res) => {
  try {
    const { name, email, affiliation, researchField, intendedUse, websiteOrProfile } = req.body;

    // Validate required fields
    if (!name || !email || !affiliation || !researchField || !intendedUse) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate email format
    if (!validateEmail(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }

    // Rate limit check
    const clientIp = req.ip || req.connection.remoteAddress;
    if (!applyRateLimiter.check(clientIp)) {
      return res.status(429).json({ error: 'Too many applications. Please try again later.' });
    }

    // Check for duplicate email
    const existing = applicationStore.findByEmail(email);
    if (existing) {
      return res.status(400).json({ error: 'An application with this email already exists' });
    }

    // Create application
    const application = applicationStore.create({
      name,
      email,
      affiliation,
      researchField,
      intendedUse,
      websiteOrProfile
    });

    await applicationStore.save();

    // Send confirmation email (non-blocking)
    sendApplicationReceivedEmail(email, name).catch(err =>
      console.error('[Alpha] Failed to send confirmation email:', err.message)
    );

    // Send admin notification (non-blocking)
    sendAdminNewApplicationEmail(application).catch(err =>
      console.error('[Alpha] Failed to send admin notification:', err.message)
    );

    console.log(`[Alpha] New application: ${application.id} from ${email}`);

    res.json({
      success: true,
      applicationId: application.id
    });
  } catch (err) {
    console.error('[Alpha] Apply error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/alpha/applications - List all applications (admin only)
router.get('/alpha/applications', async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const applications = applicationStore.getAll();
    res.json({ applications, count: applications.length });
  } catch (err) {
    console.error('[Alpha] Get applications error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/alpha/applications/:id/approve - Approve application (admin only)
router.post('/alpha/applications/:id/approve', async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { id } = req.params;
    const application = applicationStore.findById(id);

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    if (application.status !== 'pending') {
      return res.status(400).json({ error: `Application already ${application.status}` });
    }

    // Update status
    applicationStore.updateStatus(id, 'approved');

    // Create invite code
    const invite = inviteStore.create(application.email, id);

    await applicationStore.save();
    await inviteStore.save();

    // Send invite email (non-blocking)
    sendAlphaInviteEmail(application.email, invite.code).catch(err =>
      console.error('[Alpha] Failed to send invite email:', err.message)
    );

    console.log(`[Alpha] Application ${id} approved, invite: ${invite.code}`);

    res.json({
      success: true,
      inviteCode: invite.code
    });
  } catch (err) {
    console.error('[Alpha] Approve error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/alpha/applications/:id/reject - Reject application (admin only)
router.post('/alpha/applications/:id/reject', async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const { id } = req.params;
    const application = applicationStore.findById(id);

    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    if (application.status !== 'pending') {
      return res.status(400).json({ error: `Application already ${application.status}` });
    }

    applicationStore.updateStatus(id, 'rejected');
    await applicationStore.save();

    console.log(`[Alpha] Application ${id} rejected`);

    res.json({ success: true });
  } catch (err) {
    console.error('[Alpha] Reject error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/alpha/invites/verify - Verify invite code
router.post('/alpha/invites/verify', async (req, res) => {
  try {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({ error: 'Missing invite code' });
    }

    // Validate code format (8 chars, alphanumeric)
    const normalizedCode = code.toUpperCase().trim();
    if (!/^[A-Z0-9]{8}$/.test(normalizedCode)) {
      return res.json({ valid: false, error: 'Invalid code format' });
    }

    const invite = inviteStore.findByCode(normalizedCode);

    if (!invite) {
      return res.json({ valid: false, error: 'Invite code not found' });
    }

    if (invite.status === 'used') {
      return res.json({ valid: false, error: 'Invite code already used' });
    }

    if (inviteStore.isExpired(invite)) {
      return res.json({ valid: false, error: 'Invite code has expired' });
    }

    res.json({
      valid: true,
      email: invite.email
    });
  } catch (err) {
    console.error('[Alpha] Verify error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/alpha/memberships/activate - Activate membership
router.post('/alpha/memberships/activate', async (req, res) => {
  try {
    const { code, email, name } = req.body;

    if (!code || !email) {
      return res.status(400).json({ error: 'Missing code or email' });
    }

    const normalizedCode = code.toUpperCase().trim();
    const normalizedEmail = email.toLowerCase().trim();

    const invite = inviteStore.findByCode(normalizedCode);

    if (!invite) {
      return res.status(400).json({ error: 'Invalid invite code' });
    }

    if (invite.status === 'used') {
      return res.status(400).json({ error: 'Invite code already used' });
    }

    if (inviteStore.isExpired(invite)) {
      return res.status(400).json({ error: 'Invite code has expired' });
    }

    if (invite.email !== normalizedEmail) {
      return res.status(400).json({ error: 'Email does not match invite' });
    }

    // Check if already a member
    if (membershipStore.hasMembership(normalizedEmail)) {
      return res.status(400).json({ error: 'Email already has an active membership' });
    }

    // Mark invite as used
    inviteStore.markUsed(normalizedCode);

    // Create membership
    const membership = membershipStore.create(normalizedEmail, name || email.split('@')[0]);

    await inviteStore.save();
    await membershipStore.save();

    console.log(`[Alpha] Membership activated: ${membership.id} for ${normalizedEmail}`);

    res.json({
      success: true,
      membershipId: membership.id
    });
  } catch (err) {
    console.error('[Alpha] Activate error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/alpha/memberships - List all memberships (admin only)
router.get('/alpha/memberships', async (req, res) => {
  try {
    if (!requireAdmin(req, res)) return;

    const memberships = membershipStore.getAll();
    res.json({ memberships, count: memberships.length });
  } catch (err) {
    console.error('[Alpha] Get memberships error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
