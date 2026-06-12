/**
 * EntityPresenter tests
 */

const { assert, describe, it } = require('../setup');
const ontology = require('../../core/registry/ontology');
const {
  getEntityDisplayName,
  serializeEntity,
  serializeEntitySummary,
  serializeRelatedEntity,
  isSourceEntity,
  getSourceLabel
} = require('../../core/presentation/EntityPresenter');

describe('EntityPresenter', () => {
  it('should serialize entity display contracts from ontology metadata', () => {
    const entity = {
      id: 'dataset-1',
      type: 'Dataset',
      attributes: {
        title: 'ERA5-Land'
      },
      metadata: {
        confidence: 0.82
      },
      verificationState: 'verified',
      createdAt: '2026-01-01T00:00:00.000Z'
    };

    const serialized = serializeEntity(entity, ontology);

    assert.strictEqual(serialized.id, 'dataset-1');
    assert.strictEqual(serialized.name, 'ERA5-Land');
    assert.strictEqual(serialized.layer, ontology.getEntityLayer('Dataset'));
    assert.strictEqual(serialized.category, ontology.ENTITY_SCHEMAS.Dataset.category);
    assert.deepStrictEqual(serialized.attributes, entity.attributes);
    assert.deepStrictEqual(serialized.metadata, entity.metadata);
    assert.strictEqual(serialized.verificationState, 'verified');
  });

  it('should keep related entity presentation consistent with summaries', () => {
    const entity = {
      id: 'paper-1',
      type: 'Paper',
      attributes: {
        title: 'Global prediction of extreme floods'
      }
    };

    const summary = serializeEntitySummary(entity, ontology);
    const related = serializeRelatedEntity(entity, 'supports_claim', 'incoming', ontology);

    assert.deepStrictEqual(summary, {
      id: 'paper-1',
      type: 'Paper',
      name: 'Global prediction of extreme floods',
      layer: ontology.getEntityLayer('Paper'),
      category: ontology.ENTITY_SCHEMAS.Paper.category
    });
    assert.strictEqual(related.relation, 'supports_claim');
    assert.strictEqual(related.direction, 'incoming');
    assert.strictEqual(related.name, summary.name);
  });

  it('should identify source objects and labels without type-specific route code', () => {
    const paper = {
      id: 'paper-1',
      type: 'Paper',
      attributes: {
        title: 'Source title'
      }
    };
    const region = {
      id: 'region-1',
      type: 'Region',
      attributes: {
        name: 'Study region'
      }
    };

    assert.strictEqual(isSourceEntity(paper, ontology), true);
    assert.strictEqual(isSourceEntity(region, ontology), false);
    assert.strictEqual(getSourceLabel(paper), 'Source title');
  });

  it('should fall back through display name fields to id', () => {
    assert.strictEqual(getEntityDisplayName({ id: 'a', attributes: { name: 'Name' } }), 'Name');
    assert.strictEqual(getEntityDisplayName({ id: 'b', attributes: { title: 'Title' } }), 'Title');
    assert.strictEqual(getEntityDisplayName({ id: 'c', attributes: { label: 'Label' } }), 'Label');
    assert.strictEqual(getEntityDisplayName({ id: 'd', attributes: {} }), 'd');
  });
});
