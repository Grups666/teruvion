/**
 * Workflow Lens
 * Method/data/model pipeline visualization
 */

const Lens = require('./Lens');

class WorkflowLens extends Lens {
  getName() {
    return 'workflow';
  }

  getDescription() {
    return 'Method/data/model pipeline visualization showing computational flow';
  }

  getRelevantEntityTypes() {
    return ['Method', 'Dataset', 'Model', 'Workflow', 'Process', 'Experiment'];
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
    const stages = [];

    // Input stage (datasets)
    const inputs = entities.filter(e =>
      e.type === 'Dataset' &&
      this._isInputOnly(e, entities)
    );
    if (inputs.length > 0) {
      stages.push({
        name: 'Input Data',
        type: 'input',
        entities: inputs.map(e => ({
          id: e.id,
          name: e.getDisplayName(),
          type: e.type
        }))
      });
    }

    // Processing stage (methods, models)
    const processing = entities.filter(e =>
      ['Method', 'Model'].includes(e.type)
    );
    if (processing.length > 0) {
      stages.push({
        name: 'Processing',
        type: 'processing',
        entities: processing.map(e => ({
          id: e.id,
          name: e.getDisplayName(),
          type: e.type
        }))
      });
    }

    // Experiment stage
    const experiments = entities.filter(e => e.type === 'Experiment');
    if (experiments.length > 0) {
      stages.push({
        name: 'Experiments',
        type: 'experiment',
        entities: experiments.map(e => ({
          id: e.id,
          name: e.getDisplayName(),
          type: e.type
        }))
      });
    }

    // Output stage (results, metrics)
    const outputs = entities.filter(e =>
      ['Result', 'Metric'].includes(e.type) ||
      this._isOutputOnly(e, entities)
    );
    if (outputs.length > 0) {
      stages.push({
        name: 'Output',
        type: 'output',
        entities: outputs.map(e => ({
          id: e.id,
          name: e.getDisplayName(),
          type: e.type
        }))
      });
    }

    return stages;
  }

  _isInputOnly(entity, allEntities) {
    // Check if this entity is only used (not produced)
    const relations = this.store.getRelations(entity.id);
    const hasIncoming = relations.incoming.some(r =>
      r.predicate === 'produces'
    );
    return !hasIncoming;
  }

  _isOutputOnly(entity, allEntities) {
    // Check if this entity is only produced
    const relations = this.store.getRelations(entity.id);
    const hasOutgoing = relations.outgoing.some(r =>
      ['uses', 'applies'].includes(r.predicate)
    );
    return !hasOutgoing;
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

    for (const entity of entities) {
      if (['Dataset', 'Method', 'Model', 'Experiment'].includes(entity.type)) {
        visit(entity.id);
      }
    }

    // Group by position in order
    const position = {};
    order.forEach((id, i) => position[id] = i);

    // Create pipeline stages
    const stageSize = Math.ceil(order.length / 4);
    for (let i = 0; i < 4; i++) {
      const stageEntities = order.slice(i * stageSize, (i + 1) * stageSize);
      if (stageEntities.length > 0) {
        pipeline.stages.push({
          position: i,
          name: ['Input', 'Process', 'Experiment', 'Output'][i],
          entities: stageEntities.map(id => {
            const e = this.store.getEntity(id);
            return {
              id,
              name: e?.getDisplayName() || id,
              type: e?.type
            };
          })
        });
      }
    }

    return pipeline;
  }

  _traceDataFlow(entities) {
    const flows = [];

    // Find all data flow chains
    const datasets = entities.filter(e => e.type === 'Dataset');

    for (const ds of datasets) {
      const flow = this._traceFromDataset(ds);
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

  _traceFromDataset(dataset) {
    const path = [{ type: 'dataset', name: dataset.getDisplayName(), id: dataset.id }];

    // Find methods using this dataset
    const relations = this.store.getRelations(dataset.id);
    const users = relations.incoming.filter(r =>
      r.predicate === 'uses' || r.predicate === 'trained_on'
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

        // Recursively trace from this method
        const subPath = this._traceFromMethod(userEntity);
        path.push(...subPath);
      }
    }

    return path;
  }

  _traceFromMethod(method) {
    const path = [];

    // Find what this method produces
    const relations = this.store.getRelations(method.id);
    const outputs = relations.outgoing.filter(r =>
      r.predicate === 'produces'
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
}

module.exports = WorkflowLens;