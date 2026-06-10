/**
 * Comparison Lens
 * Side-by-side comparison of entities
 */

const Lens = require('./Lens');

class ComparisonLens extends Lens {
  getName() {
    return 'comparison';
  }

  getDescription() {
    return 'Side-by-side comparison of methods, datasets, or models';
  }

  getRelevantEntityTypes() {
    return ['Method', 'Model', 'Dataset', 'Experiment'];
  }

  getRelevantRelationTypes() {
    return ['compares', 'outperforms', 'evaluated_by'];
  }

  async render(projectId, options = {}) {
    const entities = this.getEntities(projectId);
    const entityType = options.entityType || 'Method';
    const compareIds = options.entityIds || [];

    // Get entities to compare
    let compareEntities = compareIds.length > 0
      ? compareIds.map(id => this.store.getEntity(id)).filter(Boolean)
      : entities.filter(e => e.type === entityType);

    if (compareEntities.length < 2) {
      return {
        type: 'comparison',
        error: 'Need at least 2 entities to compare',
        available: compareEntities.length
      };
    }

    // Extract comparison attributes
    const comparison = this._buildComparison(compareEntities);

    // Find performance metrics
    const metrics = this._extractMetrics(compareEntities);

    // Find differences
    const differences = this._findDifferences(compareEntities);

    return {
      type: 'comparison',
      entityType,
      entities: compareEntities.map(e => ({
        id: e.id,
        name: e.getDisplayName(),
        type: e.type
      })),
      comparison,
      metrics,
      differences,
      metadata: this.generateMetadata(projectId, {
        comparedCount: compareEntities.length
      })
    };
  }

  _buildComparison(entities) {
    const attributes = {};

    // Collect all attribute keys
    const allKeys = new Set();
    for (const e of entities) {
      Object.keys(e.attributes).forEach(k => allKeys.add(k));
    }

    // Build comparison matrix
    for (const key of allKeys) {
      attributes[key] = entities.map(e => ({
        entityId: e.id,
        value: e.attributes[key]
      }));
    }

    return attributes;
  }

  _extractMetrics(entities) {
    const metrics = [];

    for (const entity of entities) {
      const relations = this.store.getRelations(entity.id);
      const evaluations = relations.outgoing.filter(r =>
        r.predicate === 'evaluated_by' || r.predicate === 'outperforms'
      );

      for (const eval_ of evaluations) {
        const metric = this.store.getEntity(eval_.object);
        if (metric) {
          metrics.push({
            entityId: entity.id,
            entityName: entity.getDisplayName(),
            metricId: metric.id,
            metricName: metric.getDisplayName(),
            metricValue: metric.attributes?.value,
            relation: eval_.predicate
          });
        }
      }
    }

    return metrics;
  }

  _findDifferences(entities) {
    if (entities.length < 2) return [];

    const differences = [];
    const attrs1 = entities[0].attributes;
    const attrs2 = entities[1].attributes;

    // Find attributes that differ
    const allKeys = new Set([...Object.keys(attrs1), ...Object.keys(attrs2)]);

    for (const key of allKeys) {
      const val1 = attrs1[key];
      const val2 = attrs2[key];

      if (JSON.stringify(val1) !== JSON.stringify(val2)) {
        differences.push({
          attribute: key,
          values: [
            { entityId: entities[0].id, value: val1 },
            { entityId: entities[1].id, value: val2 }
          ]
        });
      }
    }

    return differences;
  }

  /**
   * Compare specific entities by ID
   */
  compareByIds(entityIds) {
    return this.render(null, { entityIds });
  }
}

module.exports = ComparisonLens;