/**
 * Workflow Lens
 * Workflow graph visualization
 */

const Lens = require('./Lens');

const WORKFLOW_ENTITY_LAYERS = new Set(['capability', 'foundation', 'domain', 'extension']);
const PROCESSING_CATEGORIES = new Set(['modeling', 'computing', 'process', 'method']);
const INPUT_CATEGORIES = new Set(['data', 'resource', 'observation']);
const INPUT_USE_RELATIONS = new Set(['uses', 'applies', 'trained_on', 'depends_on']);
const OUTPUT_RELATIONS = new Set(['produces', 'generates', 'outputs']);
const STAGE_ORDER = [
  ['input', 'Input'],
  ['processing', 'Processing'],
  ['experiment', 'Experiment'],
  ['output', 'Output']
];

class WorkflowLens extends Lens {
  getName() {
    return 'workflow';
  }

  getDescription() {
    return 'Workflow visualization showing object flow through relations';
  }

  getRelevantEntityTypes() {
    return Object.entries(this.ontology.ENTITY_SCHEMAS || {})
      .filter(([_, schema]) => WORKFLOW_ENTITY_LAYERS.has(schema.layer))
      .map(([type]) => type);
  }

  getRelevantRelationTypes() {
    return ['uses', 'applies', 'produces', 'implements', 'depends_on', 'trained_on', 'consists_of'];
  }

  async render(projectId, options = {}) {
    const entities = this.getEntities(projectId);
    const layout = options.layout || 'hierarchical';

    const graph = this.buildGraph(projectId, { layout });

    // Identify workflow stages
    const stages = this._identifyStages(entities);

    // Build pipeline view
    const pipeline = this._buildPipeline(entities, graph);

    // Identify data flow
    const dataFlow = this._traceDataFlow(entities);

    return {
      type: 'workflow-graph',
      graph,
      stages,
      pipeline,
      dataFlow,
      metadata: this.generateMetadata(projectId, {
        layout,
        totalNodes: graph.nodes.length,
        totalEdges: graph.edges.length,
        stageCount: stages.length
      })
    };
  }

  _identifyStages(entities) {
    const grouped = {
      input: [],
      processing: [],
      experiment: [],
      output: []
    };

    for (const entity of entities) {
      const stage = this._inferStage(entity);
      grouped[stage].push(entity);
    }

    return STAGE_ORDER
      .filter(([type]) => grouped[type].length > 0)
      .map(([type, name]) => ({
        name,
        type,
        entities: grouped[type].map(e => this._stageEntity(e))
      }));
  }

  _inferStage(entity) {
    const category = this._categorizeType(entity.type);
    const attributes = entity.attributes || {};
    const relations = this.store.getRelations(entity.id);
    const incomingPredicates = new Set(relations.incoming.map(r => r.predicate));
    const outgoingPredicates = new Set(relations.outgoing.map(r => r.predicate));

    if (
      attributes.result !== undefined ||
      attributes.value !== undefined ||
      attributes.metric !== undefined ||
      incomingPredicates.has('produces')
    ) {
      return 'output';
    }

    if (
      attributes.experiment ||
      attributes.trial ||
      attributes.scenario ||
      category === 'assessment'
    ) {
      return 'experiment';
    }

    if (
      PROCESSING_CATEGORIES.has(category) ||
      attributes.steps ||
      attributes.parameters ||
      outgoingPredicates.has('produces')
    ) {
      return 'processing';
    }

    if (
      INPUT_CATEGORIES.has(category) ||
      outgoingPredicates.has('uses') ||
      outgoingPredicates.has('provides')
    ) {
      return 'input';
    }

    if (relations.incoming.length > 0 && relations.outgoing.length === 0) return 'output';
    if (relations.outgoing.length > 0 && relations.incoming.length === 0) return 'input';
    return 'processing';
  }

  _buildPipeline(entities, graph) {
    const pipeline = {
      stages: [],
      connections: []
    };

    // Topological sort for pipeline ordering
    const visited = new Set();
    const order = [];

    const visit = (entityId) => {
      if (visited.has(entityId)) return;
      visited.add(entityId);

      const relations = this.store.getRelations(entityId);
      for (const rel of relations.outgoing) {
        visit(rel.object);
      }

      order.push(entityId);
    };

    for (const entity of entities) visit(entity.id);

    // Group by position in order
    const position = {};
    order.forEach((id, i) => position[id] = i);

    const stageBuckets = new Map();
    for (const id of order) {
      const entity = this.store.getEntity(id);
      if (!entity) continue;
      const stage = this._inferStage(entity);
      if (!stageBuckets.has(stage)) stageBuckets.set(stage, []);
      stageBuckets.get(stage).push(id);
    }

    for (const [index, [stage]] of STAGE_ORDER.entries()) {
      const stageEntities = stageBuckets.get(stage) || [];
      if (stageEntities.length === 0) continue;
      pipeline.stages.push({
        position: index,
        name: this._stageName(stage),
        entities: stageEntities.map(id => {
          const e = this.store.getEntity(id);
          return e ? this._stageEntity(e) : { id, name: id, type: undefined };
        })
      });
    }

    return pipeline;
  }

  _traceDataFlow(entities) {
    const flows = [];

    const sources = entities.filter(e => this._inferStage(e) === 'input');

    for (const ds of sources) {
      const flow = this._traceFromInput(ds);
      if (flow.length > 1) {
        flows.push({
          source: ds.getDisplayName(),
          sourceId: ds.id,
          path: flow
        });
      }
    }

    return flows;
  }

  _traceFromInput(input) {
    const path = [{ type: 'input', name: input.getDisplayName(), id: input.id }];

    const relations = this.store.getRelations(input.id);
    const users = relations.incoming.filter(r =>
      INPUT_USE_RELATIONS.has(r.predicate)
    );

    for (const user of users) {
      const userEntity = this.store.getEntity(user.subject);
      if (userEntity) {
        path.push({
          type: 'method',
          name: userEntity.getDisplayName(),
          id: userEntity.id,
          relation: user.predicate
        });

        const subPath = this._traceFromProcessor(userEntity);
        path.push(...subPath);
      }
    }

    return path;
  }

  _traceFromProcessor(processor) {
    const path = [];

    const relations = this.store.getRelations(processor.id);
    const outputs = relations.outgoing.filter(r =>
      OUTPUT_RELATIONS.has(r.predicate)
    );

    for (const output of outputs) {
      const outputEntity = this.store.getEntity(output.object);
      if (outputEntity) {
        path.push({
          type: 'output',
          name: outputEntity.getDisplayName(),
          id: outputEntity.id,
          relation: 'produces'
        });
      }
    }

    return path;
  }

  _stageEntity(entity) {
    return {
      id: entity.id,
      name: entity.getDisplayName(),
      type: entity.type
    };
  }

  _stageName(stage) {
    return {
      input: 'Input',
      processing: 'Processing',
      experiment: 'Experiment',
      output: 'Output'
    }[stage] || 'Stage';
  }
}

module.exports = WorkflowLens;
