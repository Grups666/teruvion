/**
 * Teruvion REST API
 * Connects Core Engine (TripleStore, Projects, Connectors) with web frontend
 */

const express = require('express');
const path = require('path');
const { TripleStore } = require('../../core/registry/TripleStore');
const { ProjectRegistry } = require('../../core/project/Project');
const EventLog = require('../../core/events/EventLog');
const UnifiedIngest = require('../../core/ingest/UnifiedIngest');
const Exporter = require('../../core/project/Exporter');
const ResearchImporter = require('./research-importer');
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
let ingest = null;
let exporter = null;
let researchImporter = null;
let lensRegistry = null;

// SSE连接管理
const sseClients = new Map(); // projectId → Set of response objects

// SSE通知函数
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
  if (store) return; // Already initialized

  store = new TripleStore();
  eventLog = new EventLog();
  projectRegistry = new ProjectRegistry();

  await store.load().catch(() => console.log('[API] No existing registry, starting fresh'));
  await eventLog.load().catch(() => console.log('[API] No existing event log, starting fresh'));
  await projectRegistry.load().catch(() => console.log('[API] No existing projects, starting fresh'));

  ingest = new UnifiedIngest(store, eventLog);
  exporter = new Exporter(store, eventLog, projectRegistry);
  researchImporter = new ResearchImporter(store, eventLog, projectRegistry, notifySSEClients);

  // Initialize lens registry
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

// POST /api/registry/clear - Clear all entities AND projects
router.post('/registry/clear', async (req, res) => {
  try {
    console.log('[API] Clearing all data');

    // Clear entities
    store.entities.clear();
    store.triples = [];
    store.indexes.spo.clear();
    store.indexes.pos.clear();
    store.indexes.ops.clear();
    store.indexes.typeIndex.clear();

    // Clear projects
    projectRegistry.projects.clear();

    await store.save();
    await projectRegistry.save();

    res.json({
      success: true,
      message: 'All data cleared'
    });
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

// GET /api/triples - Get all triples
router.get('/triples', async (req, res) => {
  try {
    const triples = store.getAllTriples();
    res.json({ triples, count: triples.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/triples/:entityId - Get triples for an entity
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
// INGEST API
// ============================================================================

// POST /api/ingest - Import research object
router.post('/ingest', async (req, res) => {
  try {
    const { input } = req.body;
    if (!input) {
      return res.status(400).json({ error: 'Missing input field' });
    }

    console.log(`[API] Ingesting: ${input}`);
    const result = await ingest.ingest(input);

    await store.save();
    await eventLog.save();

    res.json({
      success: true,
      understanding: result.understanding,
      entityIds: result.entityIds,
      tripleIds: result.tripleIds,
      message: `Imported ${result.entityIds?.length || 0} entities`
    });
  } catch (err) {
    console.error('[API] Ingest error:', err);
    res.status(400).json({ error: err.message });
  }
});

// ============================================================================
// PROJECTS API
// ============================================================================

// GET /api/projects - List all projects
router.get('/projects', async (req, res) => {
  try {
    const projects = projectRegistry.getAllProjects().map(p => p.toJSON());
    res.json({ projects, count: projects.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/projects/:projectId - Delete project and clean up files
router.delete('/projects/:projectId', async (req, res) => {
  try {
    const { projectId } = req.params;

    // Cancel if analyzing
    researchImporter.cancelAnalysis(projectId);

    // Get project to check entities
    const project = projectRegistry.getProject(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Remove all entities associated with this project
    project.entities.forEach(entityId => {
      store.entities.delete(entityId);
      // Remove triples referencing this entity
      store.triples = store.triples.filter(t =>
        t.subject !== entityId && t.object !== entityId
      );
    });

    // Delete project
    projectRegistry.deleteProject(projectId);

    // Save changes
    await store.save();
    await projectRegistry.save();

    console.log(`[API] Deleted project ${projectId} and ${project.entities.length} entities`);

    res.json({ success: true, message: 'Project deleted' });
  } catch (err) {
    console.error('[API] Delete error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/projects/:id - Get project details
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

// POST /api/projects - Create new project
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

// POST /api/projects/:id/entities - Add entity to project
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

// POST /api/projects/:id/export - Export project
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

// ============================================================================
// STATS API
// ============================================================================

// GET /api/stats - Get registry statistics
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

// GET /api/events - Get event log
router.get('/events', async (req, res) => {
  try {
    const events = eventLog.events;
    res.json({ events, count: events.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// RESEARCH IMPORT API
// ============================================================================

// POST /api/research/analyze - Start background analysis (returns immediately)
router.post('/research/analyze', async (req, res) => {
  try {
    const { input } = req.body;
    if (!input) {
      return res.status(400).json({ error: 'Missing input field' });
    }

    console.log(`[API] Starting research import: ${input}`);
    const result = await researchImporter.analyze(input);

    res.json({
      success: true,
      projectId: result.projectId,
      status: result.status
    });
  } catch (err) {
    console.error('[API] Research import error:', err);
    res.status(400).json({ error: err.message });
  }
});

// GET /api/projects/:projectId/events - SSE stream for real-time updates
router.get('/projects/:projectId/events', (req, res) => {
  const { projectId } = req.params;

  // 设置SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  // 注册client
  if (!sseClients.has(projectId)) {
    sseClients.set(projectId, new Set());
  }
  sseClients.get(projectId).add(res);

  console.log(`[SSE] Client connected for project ${projectId}`);

  // 发送初始状态
  const project = projectRegistry.getProject(projectId);
  if (project) {
    const summary = project.getAnalysisSummary();
    res.write(`data: ${JSON.stringify({ type: 'status', data: summary })}\n\n`);
  }

  // 客户端断开连接时清理
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

// GET /api/projects/:projectId/status - Get analysis progress
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

// POST /api/projects/:projectId/cancel - Cancel analysis
router.post('/projects/:projectId/cancel', (req, res) => {
  try {
    const { projectId } = req.params;
    const cancelled = researchImporter.cancelAnalysis(projectId);

    if (cancelled) {
      res.json({ success: true, message: 'Analysis cancelled' });
    } else {
      res.status(404).json({ error: 'No active analysis found for this project' });
    }
  } catch (err) {
    console.error('[API] Cancel error:', err);
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/projects/:projectId - Delete project and clean up files
// GET /api/research/understanding/:projectId - 获取完整的研究理解
router.get('/research/understanding/:projectId', (req, res) => {
  try {
    const understanding = researchImporter.getUnderstandingByProject(req.params.projectId);
    if (!understanding) {
      return res.status(404).json({ error: 'Understanding not found' });
    }
    res.json({ understanding });
  } catch (err) {
    console.error('[API] Get understanding error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ============================================================================
// LENS API
// ============================================================================

// GET /api/lenses - List available lenses
router.get('/lenses', (req, res) => {
  try {
    const lenses = lensRegistry.getAvailableLenses();
    res.json({ lenses });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/projects/:projectId/lens/:lensName - Render a specific lens
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

// GET /api/projects/:projectId/lens - Render all lenses
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

// GET /api/projects/:projectId/recommended-lens - Get recommended lens
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

// GET /api/ontology/types - Get all entity types
router.get('/ontology/types', (req, res) => {
  try {
    const types = ontology.getAllEntityTypes();
    const layers = ontology.getEntitiesByLayer();
    res.json({ types, layers });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ontology/relations - Get all relation types
router.get('/ontology/relations', (req, res) => {
  try {
    const relations = ontology.getAllRelationTypes();
    res.json({ relations });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/ontology/domains - Get loaded domain extensions
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

// POST /api/admission/evaluate - Evaluate source for admission
router.post('/admission/evaluate', async (req, res) => {
  try {
    const { input, content, metadata } = req.body;

    // Create admission instance (without LLM for now, using heuristics only)
    const admission = new SourceAdmission(null, { skipEvaluators: ['researchRelevance'] });

    // Use quick check if no content provided
    const result = content
      ? await admission.evaluate(input, content, metadata || {})
      : await admission.quickCheck(input);

    res.json(result);
  } catch (err) {
    console.error('[API] Admission error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
