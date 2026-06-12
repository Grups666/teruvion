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
    return 'Side-by-side comparison of compatible research objects';
  }

  getRelevantEntityTypes() {
    return Object.entries(this.ontology.ENTITY_SCHEMAS || {})
      .filter(([, schema]) => {
        const layer = schema.layer;
        return layer === 'capability' || layer === 'source' || layer === 'world' || layer === 'extension';
      })
      .map(([type]) => type);
  }

  getRelevantRelationTypes() {
    return ['compares', 'outperforms', 'evaluated_by'];
  }

  async render(projectId, options = {}) {
    const entities = this.getEntities(projectId);
    const compareIds = options.entityIds || [];

    let compareEntities = compareIds.length > 0
      ? compareIds.map(id => this.store.getEntity(id)).filter(Boolean)
      : this._selectComparableEntities(entities, options);

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
      entityType: this._describeComparisonScope(compareEntities),
      entities: compareEntities.map(e => ({
        id: e.id,
        name: e.getDisplayName(),
        type: e.type,
        layer: this._getLayer(e.type),
        category: this._categorizeType(e.type)
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

  _selectComparableEntities(entities, options) {
    if (options.entityType) {
      return entities.filter(e => e.type === options.entityType);
    }

    const typeBucket = this._largestBucket(entities, entity => entity.type);
    if (typeBucket.length >= 2) {
      return typeBucket;
    }

    const categoryBucket = this._largestBucket(entities, entity =>
      `${this._getLayer(entity.type)}:${this._categorizeType(entity.type)}`
    );

    if (categoryBucket.length >= 2) {
      return categoryBucket;
    }

    return entities;
  }

  _largestBucket(entities, keyFn) {
    const buckets = new Map();
    for (const entity of entities) {
      const key = keyFn(entity);
      if (!buckets.has(key)) {
        buckets.set(key, []);
      }
      buckets.get(key).push(entity);
    }

    return Array.from(buckets.values())
      .sort((a, b) => b.length - a.length)[0] || [];
  }

  _describeComparisonScope(entities) {
    const types = new Set(entities.map(e => e.type));
    if (types.size === 1) {
      return entities[0].type;
    }

    const layerCategories = new Set(entities.map(e =>
      `${this._getLayer(e.type)}:${this._categorizeType(e.type)}`
    ));

    if (layerCategories.size === 1) {
      return Array.from(layerCategories)[0];
    }

    return 'mixed';
  }
}

module.exports = ComparisonLens;
