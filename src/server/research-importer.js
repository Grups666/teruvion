/**
 * ResearchImporter - 新版研究导入器
 *
 * 使用 ResearchUnderstanding 进行深度理解
 * 创建 Project 和结构化的研究对象
 */

const ResearchUnderstanding = require('../../core/understanding/ResearchUnderstanding');
const { Entity } = require('../../core/registry/TripleStore');
const { ENTITY_TYPES, RELATION_TYPES } = require('../../core/registry/ontology');
const { Project } = require('../../core/project/Project');

class ResearchImporter {
  constructor(store, eventLog, projectRegistry, sseNotify) {
    this.store = store;
    this.eventLog = eventLog;
    this.projectRegistry = projectRegistry;
    this.understanding = new ResearchUnderstanding();
    this.sseNotify = sseNotify; // SSE通知函数

    this.activeAnalyses = new Map(); // 正在运行的分析任务 projectId → AbortController
  }

  /**
   * Step 1: 立即创建 Project，后台运行深度理解
   */
  async analyze(input) {
    console.log('[ResearchImporter] Starting import:', input);

    const inputType = this._identifyInputType(input);

    // 立即创建 Project（状态: analyzing）
    const project = new Project(
      'Unnamed Project',  // 临时名称
      'Importing research...',
      {
        source: input,
        sourceType: inputType,
        importedAt: new Date().toISOString()
      }
    );

    project.startAnalysis(['fetching', 'overview', 'methods', 'datasets', 'experiments', 'results', 'reproducibility', 'crossRefs', 'spatial', 'converting']);
    this.projectRegistry.addProject(project);
    await this.projectRegistry.save();

    console.log('[ResearchImporter] Project created:', project.id);

    // 后台运行深度分析
    const abortController = new AbortController();
    this.activeAnalyses.set(project.id, abortController);

    this._runBackgroundAnalysis(project.id, input, inputType, abortController.signal)
      .catch(err => {
        console.error('[ResearchImporter] Background analysis failed:', err.message);
        project.failAnalysis(err.message);
        this.projectRegistry.save();
      })
      .finally(() => {
        this.activeAnalyses.delete(project.id);
      });

    return {
      success: true,
      projectId: project.id,
      status: 'analyzing'
    };
  }

  /**
   * 后台分析任务
   */
  async _runBackgroundAnalysis(projectId, input, inputType, signal) {
    const project = this.projectRegistry.getProject(projectId);
    if (!project) throw new Error('Project not found');

    try {
      // Phase 1: Fetch content
      project.updateProgress('fetching', 'started');
      const ConnectorRegistry = require('../../core/connectors/ConnectorRegistry');
      const llm = require('../../core/utils/llm');
      const config = {
        githubToken: llm.getGitHubToken(),
        openAlexKey: llm.getOpenAlexKey()
      };
      const registry = new ConnectorRegistry(config);
      const content = await registry.fetch(input);
      project.updateProgress('fetching', 'completed');
      await this.projectRegistry.save();

      if (signal.aborted) throw new Error('Analysis cancelled');

      // Phase 2: Deep understanding with progress tracking
      const result = await this._understandWithProgress(
        project,
        input,
        content,
        { type: inputType, ...content },
        signal
      );

      if (signal.aborted) throw new Error('Analysis cancelled');

      // Phase 3: Convert to entities
      project.updateProgress('converting', 'started');
      await this._convertToEntities(project, result.understanding, input, inputType);
      project.updateProgress('converting', 'completed');

      // 更新 Project 描述和元数据
      project.description = result.understanding.overview?.problem || 'Imported research';
      project.metadata.understanding = result.understanding;

      await this.projectRegistry.save();

      console.log('[ResearchImporter] Background analysis completed:', projectId);

      // SSE通知：analysis完成
      if (this.sseNotify) {
        this.sseNotify(projectId, 'completed', { status: 'completed' });
      }

    } catch (err) {
      if (err.message === 'Analysis cancelled') {
        project.cancelAnalysis();
      } else {
        project.failAnalysis(err.message);
      }
      await this.projectRegistry.save();

      // SSE通知：analysis失败或取消
      if (this.sseNotify) {
        this.sseNotify(projectId, 'status', { status: project.analysis.status });
      }

      throw err;
    }
  }

  /**
   * 带进度追踪的理解过程
   */
  async _understandWithProgress(project, input, content, metadata, signal) {
    const contextBlock = this.understanding._buildContext(content, metadata);

    // Overview - extract title and use as project name
    project.updateProgress('overview', 'started');
    await this.projectRegistry.save();
    const overview = await this.understanding._extractOverview(contextBlock, metadata);
    project.updateProgress('overview', 'completed', { title: overview.title });

    // Update project name and description from overview
    if (overview.title && overview.title.trim()) {
      project.name = overview.title.trim().substring(0, 100);
    }
    project.description = overview.problem || 'Imported research';
    await this.projectRegistry.save();

    // SSE notify: name updated
    if (this.sseNotify) {
      this.sseNotify(project.id, 'overview', { name: project.name });
    }

    if (signal.aborted) throw new Error('Analysis cancelled');

    // 并行: methods, datasets, experiments, results
    const parallelPhases = [
      { name: 'methods', fn: () => this.understanding._extractMethods(contextBlock, overview) },
      { name: 'datasets', fn: () => this.understanding._extractDatasets(contextBlock, overview) },
      { name: 'experiments', fn: () => this.understanding._extractExperiments(contextBlock, overview) },
      { name: 'results', fn: () => this.understanding._extractResults(contextBlock, overview) }
    ];

    const parallelResults = await Promise.all(
      parallelPhases.map(async phase => {
        if (signal.aborted) throw new Error('Analysis cancelled');

        project.updateProgress(phase.name, 'started');
        await this.projectRegistry.save();

        const result = await phase.fn();

        if (signal.aborted) throw new Error('Analysis cancelled');

        const count = result[phase.name]?.length || Object.keys(result).length || 0;
        project.updateProgress(phase.name, 'completed', { count });
        await this.projectRegistry.save();

        return { name: phase.name, data: result };
      })
    );

    if (signal.aborted) throw new Error('Analysis cancelled');

    const methods = parallelResults.find(r => r.name === 'methods').data;
    const datasets = parallelResults.find(r => r.name === 'datasets').data;
    const experiments = parallelResults.find(r => r.name === 'experiments').data;
    const results = parallelResults.find(r => r.name === 'results').data;

    // Reproducibility
    project.updateProgress('reproducibility', 'started');
    await this.projectRegistry.save();
    const reproducibility = await this.understanding._buildReproducibilityRoadmap(
      contextBlock,
      { methods, datasets, experiments },
      metadata
    );
    project.updateProgress('reproducibility', 'completed', { grade: reproducibility.grade });
    await this.projectRegistry.save();

    if (signal.aborted) throw new Error('Analysis cancelled');

    // 并行: crossRefs, spatial
    project.updateProgress('crossRefs', 'started');
    project.updateProgress('spatial', 'started');
    await this.projectRegistry.save();

    const [crossRefs, spatial] = await Promise.all([
      this.understanding._extractCrossReferences(contextBlock, metadata),
      this.understanding._analyzeSpatial(contextBlock, { datasets, experiments })
    ]);

    project.updateProgress('crossRefs', 'completed', { papers: crossRefs.papers?.length || 0 });
    project.updateProgress('spatial', 'completed', { hasSpatial: spatial.hasSpatialDimension });
    await this.projectRegistry.save();

    return {
      input,
      inputType: metadata.type || 'unknown',
      understanding: {
        overview,
        methods,
        datasets,
        experiments,
        results,
        reproducibility,
        crossRefs,
        spatial
      },
      createdAt: new Date().toISOString()
    };
  }

  /**
   * 取消分析
   */
  cancelAnalysis(projectId) {
    const controller = this.activeAnalyses.get(projectId);
    if (controller) {
      controller.abort();
      console.log('[ResearchImporter] Analysis cancelled:', projectId);
      return true;
    }
    return false;
  }

  /**
   * 将理解结果转换为实体
   */
  async _convertToEntities(project, understanding, input, inputType) {
    const { overview, methods, datasets, experiments, results, reproducibility, crossRefs, spatial } = understanding;

    const created = {
      projectId: project.id,
      entities: [],
      triples: []
    };

    // 1. 创建基础实体（Paper 或 Code）
    const baseType = inputType === 'github' ? ENTITY_TYPES.CODE : ENTITY_TYPES.PAPER;
    const baseEntity = new Entity(baseType, {
      title: overview.title,
      abstract: overview.problem,
      authors: [],
      year: new Date().getFullYear()
    }, {
      source: input,
      extractedBy: 'ResearchUnderstanding',
      worthReading: overview.worthReading
    });

    this.store.addEntity(baseEntity);
    created.entities.push(baseEntity.id);
    project.addEntity(baseEntity.id, baseType);

    // 2. 创建 Dataset 实体
    if (datasets.datasets && datasets.datasets.length > 0) {
      for (const dataset of datasets.datasets) {
        const dsEntity = new Entity(ENTITY_TYPES.DATASET, {
          name: dataset.name,
          format: dataset.type,
          variables: dataset.variables?.map(v => v.name || v) || [],
          spatialCoverage: dataset.spatial?.coverage,
          spatialResolution: dataset.spatial?.resolution,
          temporalCoverage: dataset.temporal?.coverage,
          temporalResolution: dataset.temporal?.resolution,
          accessible: dataset.access?.method,
          source: dataset.access?.url || dataset.citation
        }, {
          source: input,
          extractedBy: 'ResearchUnderstanding',
          role: dataset.usage?.role,
          size: dataset.size?.fileSize,
          quality: dataset.quality?.issues?.join('; ')
        });

        this.store.addEntity(dsEntity);
        created.entities.push(dsEntity.id);
        project.addEntity(dsEntity.id, ENTITY_TYPES.DATASET);

        this.store.addTriple(baseEntity.id, RELATION_TYPES.USES, dsEntity.id);
        created.triples.push({ from: baseEntity.id, to: dsEntity.id, relation: 'uses' });
      }
    }

    // 3. 创建 Method 实体
    if (methods.methods && methods.methods.length > 0) {
      for (const method of methods.methods) {
        const methodEntity = new Entity(ENTITY_TYPES.METHOD, {
          name: method.name,
          category: method.category,
          description: method.architecture?.description || method.innovation,
          implementation: method.codeLocation || method.dependencies?.join(', '),
          keyFeatures: method.architecture?.components || []
        }, {
          source: input,
          extractedBy: 'ResearchUnderstanding',
          innovation: method.innovation,
          hyperparameters: JSON.stringify(method.hyperparameters || {}),
          limitations: method.limitations?.join('; ')
        });

        this.store.addEntity(methodEntity);
        created.entities.push(methodEntity.id);
        project.addEntity(methodEntity.id, ENTITY_TYPES.METHOD);

        this.store.addTriple(baseEntity.id, RELATION_TYPES.APPLIES, methodEntity.id);
        created.triples.push({ from: baseEntity.id, to: methodEntity.id, relation: 'applies' });
      }
    }

    // 4. 创建 Experiment 实体
    if (experiments.experiments && experiments.experiments.length > 0) {
      for (const exp of experiments.experiments) {
        const expEntity = new Entity(ENTITY_TYPES.EXPERIMENT, {
          name: exp.name,
          design: exp.design?.procedure,
          execution: JSON.stringify(exp.configuration || {}),
          reproducibility: reproducibility?.grade || 'unknown'
        }, {
          source: input,
          extractedBy: 'ResearchUnderstanding',
          purpose: exp.purpose,
          baselines: exp.baselines?.join(', ')
        });

        this.store.addEntity(expEntity);
        created.entities.push(expEntity.id);
        project.addEntity(expEntity.id, ENTITY_TYPES.EXPERIMENT);

        this.store.addTriple(baseEntity.id, RELATION_TYPES.CONSISTS_OF, expEntity.id);
        created.triples.push({ from: baseEntity.id, to: expEntity.id, relation: 'consists_of' });
      }
    }

    // 5. 创建 Region 实体
    if (spatial.hasSpatialDimension && spatial.regions && spatial.regions.length > 0) {
      for (const region of spatial.regions) {
        if (region.coordinates && region.coordinates.length === 4) {
          const regionEntity = new Entity(ENTITY_TYPES.REGION, {
            name: region.name,
            type: region.type,
            bbox: region.coordinates,
            description: region.description || `${region.scale} scale study region`
          }, {
            source: input,
            extractedBy: 'ResearchUnderstanding'
          });

          this.store.addEntity(regionEntity);
          created.entities.push(regionEntity.id);
          project.addEntity(regionEntity.id, ENTITY_TYPES.REGION);

          this.store.addTriple(baseEntity.id, RELATION_TYPES.STUDIES, regionEntity.id);
          created.triples.push({ from: baseEntity.id, to: regionEntity.id, relation: 'studies' });
        } else {
          // 无坐标 → 创建 Claim
          const claim = new Entity(ENTITY_TYPES.CLAIM, {
            statement: `Study region: ${region.name}`,
            confidence: 0.7
          }, {
            source: input,
            extractedBy: 'ResearchUnderstanding'
          });

          this.store.addEntity(claim);
          created.entities.push(claim.id);
          project.addEntity(claim.id, ENTITY_TYPES.CLAIM);

          this.store.addTriple(baseEntity.id, RELATION_TYPES.SUPPORTS, claim.id);
          created.triples.push({ from: baseEntity.id, to: claim.id, relation: 'supports' });
        }
      }
    }

    // 6. 创建 Claim 实体（结果）
    if (results.detailedResults && results.detailedResults.length > 0) {
      for (const result of results.detailedResults.slice(0, 5)) {
        const claim = new Entity(ENTITY_TYPES.CLAIM, {
          statement: `${result.setting}: ${result.metric} = ${result.value}`,
          confidence: result.significance ? 0.9 : 0.7
        }, {
          source: input,
          extractedBy: 'ResearchUnderstanding',
          baseline: result.baseline,
          improvement: result.improvement
        });

        this.store.addEntity(claim);
        created.entities.push(claim.id);
        project.addEntity(claim.id, ENTITY_TYPES.CLAIM);

        this.store.addTriple(baseEntity.id, RELATION_TYPES.SUPPORTS, claim.id);
        created.triples.push({ from: baseEntity.id, to: claim.id, relation: 'supports' });
      }
    }

    // 保存
    await this.store.save();
    this.projectRegistry.addProject(project);
    await this.projectRegistry.save();

    console.log('[ResearchImporter] Entities created:', created.entities.length);

    return created;
  }

  /**
   * 通过 Project ID 获取研究理解
   */
  getUnderstandingByProject(projectId) {
    const project = this.projectRegistry.getProject(projectId);
    if (!project || !project.metadata.understanding) {
      return null;
    }

    return project.metadata.understanding;
  }

  /**
   * 识别输入类型
   */
  _identifyInputType(input) {
    if (input.includes('github.com')) return 'github';
    if (/^10\.\d{4,}\//.test(input)) return 'doi';
    if (input.includes('doi.org')) return 'doi';
    if (input.startsWith('http')) return 'url';
    return 'text';
  }
}

module.exports = ResearchImporter;
