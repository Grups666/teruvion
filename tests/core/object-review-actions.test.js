/**
 * ObjectReviewActions tests
 */

const { assert, describe, it } = require('../setup');
const ontology = require('../../core/registry/ontology');
const {
  buildObjectReviewActions,
  formatActionLabel
} = require('../../core/review/ObjectReviewActions');

describe('ObjectReviewActions', () => {
  it('should build review checks from ontology layer and category', () => {
    const actions = buildObjectReviewActions(
      { type: 'Dataset', metadata: { confidence: 0.7 } },
      { outgoing: [], incoming: [] },
      ontology
    );

    assert.ok(actions.includes('Inspect linked world objects'), 'Should use capability layer');
    assert.ok(actions.includes('Review data evidence'), 'Should use ontology category');
    assert.ok(actions.includes('Review extraction confidence'), 'Should use metadata confidence');
  });

  it('should build relation checks without domain-specific action text', () => {
    const actions = buildObjectReviewActions(
      { type: 'Region', metadata: {} },
      {
        outgoing: [{ predicate: 'covers' }, { predicate: 'supports_claim' }],
        incoming: []
      },
      ontology
    );

    assert.ok(actions.includes('Trace graph connections'), 'Should expose graph tracing');
    assert.ok(actions.includes('Compare connected objects'), 'Should expose comparison when multiple relations exist');
    assert.ok(actions.includes('Inspect covers relation'), 'Should expose relation-specific review');
    assert.ok(actions.includes('Inspect supports claim relation'), 'Should format relation labels');
    assert.ok(!actions.some(action => action.includes('basin')), 'Should not hard-code domain object names');
    assert.ok(!actions.some(action => action.includes('Download dataset')), 'Should not promise unavailable commands');
  });

  it('should format action labels from protocol names', () => {
    assert.strictEqual(formatActionLabel('supports_claim'), 'supports claim');
    assert.strictEqual(formatActionLabel('earth-object'), 'earth object');
  });
});
