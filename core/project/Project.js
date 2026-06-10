/**
 * Project - Aggregates research objects into a cohesive project
 * A project is a collection of entities, regions, papers, datasets, models, workflows, and evidence chains
 * that together represent a complete research effort.
 */

const fs = require('fs').promises;
const path = require('path');

class Project {
  constructor(name, description, metadata = {}) {
    this.id = metadata.id || generateProjectId();
    this.name = name;
    this.description = description;

    // Collections
    this.entities = [];         // All entity IDs
    this.regions = [];          // Region entity IDs
    this.papers = [];           // Paper entity IDs
    this.datasets = [];         // Dataset entity IDs
    this.models = [];           // Model entity IDs
    this.workflows = [];        // Workflow entity IDs
    this.evidenceChains = [];   // Evidence chain IDs

    // Metadata
    this.metadata = {
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      author: metadata.author || null,
      status: metadata.status || 'active',
      tags: metadata.tags || [],
      ...metadata
    };

    // Analysis progress (for import tracking)
    this.analysis = {
      status: 'pending',  // pending/analyzing/completed/failed/cancelled
      startedAt: null,
      completedAt: null,
      currentPhase: null,  // 当前阶段
      progress: {
        completed: [],     // 已完成的模块 ['overview', 'datasets']
        inProgress: null,  // 正在处理的模块
        pending: [],       // 待处理的模块
        details: {}        // 模块详情 { datasets: { found: 3, total: 7 } }
      },
      error: null
    };
  }

  /**
   * Add an entity to the project
   */
  addEntity(entityId, entityType = null) {
    if (!this.entities.includes(entityId)) {
      this.entities.push(entityId);
      this._updateTimestamp();
    }

    // Also add to type-specific collections
    if (entityType) {
      switch (entityType) {
        case 'Region':
          if (!this.regions.includes(entityId)) {
            this.regions.push(entityId);
          }
          break;
        case 'Paper':
          if (!this.papers.includes(entityId)) {
            this.papers.push(entityId);
          }
          break;
        case 'Dataset':
          if (!this.datasets.includes(entityId)) {
            this.datasets.push(entityId);
          }
          break;
        case 'Model':
          if (!this.models.includes(entityId)) {
            this.models.push(entityId);
          }
          break;
        case 'Workflow':
          if (!this.workflows.includes(entityId)) {
            this.workflows.push(entityId);
          }
          break;
      }
    }
  }

  /**
   * Remove an entity from the project
   */
  removeEntity(entityId) {
    this.entities = this.entities.filter(id => id !== entityId);
    this.regions = this.regions.filter(id => id !== entityId);
    this.papers = this.papers.filter(id => id !== entityId);
    this.datasets = this.datasets.filter(id => id !== entityId);
    this.models = this.models.filter(id => id !== entityId);
    this.workflows = this.workflows.filter(id => id !== entityId);
    this._updateTimestamp();
  }

  /**
   * Add an evidence chain
   */
  addEvidenceChain(chainId) {
    if (!this.evidenceChains.includes(chainId)) {
      this.evidenceChains.push(chainId);
      this._updateTimestamp();
    }
  }

  /**
   * Update project metadata
   */
  updateMetadata(updates) {
    this.metadata = { ...this.metadata, ...updates };
    this._updateTimestamp();
  }

  /**
   * Start analysis tracking
   */
  startAnalysis(phases = ['overview', 'datasets', 'methods', 'experiments', 'results', 'reproducibility', 'crossRefs', 'spatial']) {
    this.analysis = {
      status: 'analyzing',
      startedAt: new Date().toISOString(),
      completedAt: null,
      currentPhase: null,
      progress: {
        completed: [],
        inProgress: null,
        pending: [...phases],
        details: {}
      },
      error: null
    };
    this._updateTimestamp();
  }

  /**
   * Update analysis progress
   */
  updateProgress(phase, status, details = {}) {
    if (!this.analysis) {
      this.startAnalysis();
    }

    const { progress } = this.analysis;

    if (status === 'started') {
      progress.inProgress = phase;
      progress.pending = progress.pending.filter(p => p !== phase);
      this.analysis.currentPhase = phase;
    } else if (status === 'completed') {
      if (!progress.completed.includes(phase)) {
        progress.completed.push(phase);
      }
      if (progress.inProgress === phase) {
        progress.inProgress = null;
      }
      progress.details[phase] = details;

      // 全部完成
      if (progress.pending.length === 0 && !progress.inProgress) {
        this.analysis.status = 'completed';
        this.analysis.completedAt = new Date().toISOString();
      }
    } else if (status === 'failed') {
      if (progress.inProgress === phase) {
        progress.inProgress = null;
      }
      progress.details[phase] = { ...details, failed: true };
    }

    this._updateTimestamp();
  }

  /**
   * Mark analysis as failed
   */
  failAnalysis(error) {
    this.analysis.status = 'failed';
    this.analysis.completedAt = new Date().toISOString();
    this.analysis.error = error;
    this._updateTimestamp();
  }

  /**
   * Cancel analysis
   */
  cancelAnalysis() {
    this.analysis.status = 'cancelled';
    this.analysis.completedAt = new Date().toISOString();
    this._updateTimestamp();
  }

  /**
   * Get analysis summary for UI
   */
  getAnalysisSummary() {
    return {
      status: this.analysis.status,
      currentPhase: this.analysis.currentPhase,
      completed: this.analysis.progress.completed,
      inProgress: this.analysis.progress.inProgress,
      pending: this.analysis.progress.pending,
      details: this.analysis.progress.details,
      error: this.analysis.error,
      startedAt: this.analysis.startedAt,
      completedAt: this.analysis.completedAt,
      duration: this.analysis.completedAt
        ? new Date(this.analysis.completedAt) - new Date(this.analysis.startedAt)
        : new Date() - new Date(this.analysis.startedAt)
    };
  }

  /**
   * Get project summary
   */
  getSummary() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      counts: {
        entities: this.entities.length,
        regions: this.regions.length,
        papers: this.papers.length,
        datasets: this.datasets.length,
        models: this.models.length,
        workflows: this.workflows.length,
        evidenceChains: this.evidenceChains.length
      },
      metadata: this.metadata
    };
  }

  /**
   * Export project to JSON
   */
  toJSON() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      entities: this.entities,
      regions: this.regions,
      papers: this.papers,
      datasets: this.datasets,
      models: this.models,
      workflows: this.workflows,
      evidenceChains: this.evidenceChains,
      metadata: this.metadata,
      analysis: this.analysis  // 保存 analysis 状态
    };
  }

  /**
   * Load project from JSON
   */
  static fromJSON(json) {
    const project = new Project(json.name, json.description, json.metadata);
    project.id = json.id;
    project.entities = json.entities || [];
    project.regions = json.regions || [];
    project.papers = json.papers || [];
    project.datasets = json.datasets || [];
    project.models = json.models || [];
    project.workflows = json.workflows || [];
    project.evidenceChains = json.evidenceChains || [];

    // 恢复 analysis 字段（如果存在）
    if (json.analysis) {
      project.analysis = json.analysis;
    }

    return project;
  }

  /**
   * Private: Update timestamp
   */
  _updateTimestamp() {
    this.metadata.updated = new Date().toISOString();
  }
}

/**
 * ProjectRegistry - Manages multiple projects
 */
class ProjectRegistry {
  constructor(storagePath = null) {
    this.projects = new Map();  // id -> Project
    this.storagePath = storagePath || path.join(__dirname, '../../_local/projects.json');
  }

  /**
   * Add a project
   */
  addProject(project) {
    if (!(project instanceof Project)) {
      throw new Error('Must provide Project instance');
    }
    this.projects.set(project.id, project);
    return project.id;
  }

  /**
   * Get a project by ID
   */
  getProject(projectId) {
    return this.projects.get(projectId);
  }

  /**
   * Get all projects
   */
  getAllProjects() {
    return Array.from(this.projects.values());
  }

  /**
   * Delete a project
   */
  deleteProject(projectId) {
    return this.projects.delete(projectId);
  }

  /**
   * Save projects to disk
   */
  async save() {
    const data = {
      projects: Array.from(this.projects.values()).map(p => p.toJSON())
    };

    const dir = path.dirname(this.storagePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(this.storagePath, JSON.stringify(data, null, 2));
  }

  /**
   * Load projects from disk
   */
  async load() {
    try {
      const data = await fs.readFile(this.storagePath, 'utf-8');
      const parsed = JSON.parse(data);

      this.projects.clear();
      for (const projectData of parsed.projects || []) {
        const project = Project.fromJSON(projectData);
        this.projects.set(project.id, project);
      }
    } catch (err) {
      if (err.code !== 'ENOENT') {
        throw err;
      }
      // File doesn't exist yet, start with empty registry
    }
  }
}

// ============================================================================
// HELPERS
// ============================================================================

function generateProjectId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substr(2, 6);
  return `project-${timestamp}-${random}`;
}

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  Project,
  ProjectRegistry
};
