/**
 * ProjectDiagnostics tests
 */

const { assert, describe, it } = require('../setup');
const {
  buildProjectActionPlan,
  buildProjectImportDiagnosis,
  buildProjectReadinessSummary
} = require('../../core/project/ProjectDiagnostics');

describe('ProjectDiagnostics', () => {
  it('should explain metadata-only imports without inventing missing structure', () => {
    const diagnosis = buildProjectImportDiagnosis({
      sourceCoverage: {
        contentLevel: 'metadata_only',
        label: 'Metadata only',
        detail: 'Extraction is limited to metadata fields'
      },
      decomposition: {
        sourceObject: { type: 'Paper', name: 'Sparse paper' },
        capabilityObjects: [],
        worldObjects: [],
        evidenceObjects: [],
        bridgeRelations: [],
        provenance: { extractionMethod: 'metadata' }
      },
      stored: { entities: 1, relations: 0 }
    });

    const byKey = Object.fromEntries(diagnosis.map(item => [item.key, item]));

    assert.strictEqual(byKey.source.status, 'limited');
    assert.strictEqual(byKey.source.value, 'Metadata only');
    assert.strictEqual(byKey.spatial.status, 'missing');
    assert.strictEqual(byKey.capability.status, 'missing');
    assert.strictEqual(byKey.evidence.status, 'limited');
    assert.strictEqual(byKey.graph.status, 'missing');
  });

  it('should mark rich object graphs as ready from durable counts', () => {
    const diagnosis = buildProjectImportDiagnosis({
      sourceCoverage: {
        contentLevel: 'full_text',
        label: 'Full text',
        detail: '4 sections, 1 figures, 0 tables',
        hasFullText: true,
        hasStructuredSections: true
      },
      decomposition: {
        sourceObject: { type: 'Paper', name: 'Rich paper' },
        capabilityObjects: [{ type: 'Dataset' }, { type: 'Workflow' }],
        worldObjects: [{ type: 'Region' }],
        evidenceObjects: [{ type: 'Claim' }],
        bridgeRelations: [{ type: 'studies' }],
        provenance: { extractionMethod: 'hybrid' }
      },
      stored: { entities: 5, relations: 3 }
    });

    const byKey = Object.fromEntries(diagnosis.map(item => [item.key, item]));

    assert.strictEqual(byKey.source.status, 'ready');
    assert.strictEqual(byKey.spatial.status, 'ready');
    assert.strictEqual(byKey.capability.status, 'ready');
    assert.strictEqual(byKey.evidence.status, 'ready');
    assert.strictEqual(byKey.graph.status, 'ready');
    assert.strictEqual(byKey.graph.value, '3 relations');
  });

  it('should report pipeline state before decomposition exists', () => {
    const pending = buildProjectImportDiagnosis({ status: 'analyzing' });
    assert.strictEqual(pending.length, 1);
    assert.strictEqual(pending[0].key, 'pipeline');
    assert.strictEqual(pending[0].status, 'pending');

    const failed = buildProjectImportDiagnosis({
      status: 'failed',
      error: 'Source rejected'
    });
    assert.strictEqual(failed.length, 1);
    assert.strictEqual(failed[0].status, 'missing');
    assert.strictEqual(failed[0].detail, 'Source rejected');
  });

  it('should summarize readiness from diagnostic hard signals', () => {
    const review = buildProjectReadinessSummary([
      { key: 'source', label: 'Source', status: 'limited' },
      { key: 'spatial', label: 'Spatial Anchor', status: 'missing' },
      { key: 'capability', label: 'Methods & Data', status: 'ready' },
      { key: 'evidence', label: 'Evidence', status: 'limited' },
      { key: 'graph', label: 'Object Links', status: 'ready' }
    ]);

    assert.strictEqual(review.status, 'review');
    assert.strictEqual(review.score, 40);
    assert.deepStrictEqual(review.blockers, ['Source', 'Spatial Anchor', 'Evidence']);

    const ready = buildProjectReadinessSummary([
      { key: 'source', label: 'Source', status: 'ready' },
      { key: 'spatial', label: 'Spatial Anchor', status: 'ready' }
    ]);

    assert.strictEqual(ready.status, 'ready');
    assert.strictEqual(ready.score, 100);

    const processing = buildProjectReadinessSummary([
      { key: 'pipeline', label: 'Pipeline', status: 'pending', detail: 'Still running' }
    ]);

    assert.strictEqual(processing.status, 'processing');
    assert.strictEqual(processing.nextStep, 'Still running');
  });

  it('should build action plans from diagnostic gaps', () => {
    const diagnosis = [
      { key: 'source', label: 'Source', status: 'limited', detail: 'Only metadata was available.' },
      { key: 'spatial', label: 'Spatial Anchor', status: 'missing', detail: 'No region was extracted.' },
      { key: 'capability', label: 'Methods & Data', status: 'missing', detail: 'No method was extracted.' },
      { key: 'evidence', label: 'Evidence', status: 'limited', detail: 'No claim evidence.' },
      { key: 'graph', label: 'Object Links', status: 'missing', detail: 'No relation evidence.' }
    ];
    const readiness = buildProjectReadinessSummary(diagnosis);
    const actions = buildProjectActionPlan(diagnosis, readiness);

    assert.strictEqual(actions[0].id, 'verify-source-coverage');
    assert.ok(actions.some(action => action.id === 'add-spatial-anchor'));
    assert.ok(actions.every(action => action.label && action.reason));
    assert.ok(actions.length <= 4);
  });

  it('should build action plans for processing imports', () => {
    const diagnosis = [
      { key: 'pipeline', label: 'Pipeline', status: 'pending', detail: 'Still running' }
    ];
    const readiness = buildProjectReadinessSummary(diagnosis);
    const actions = buildProjectActionPlan(diagnosis, readiness);

    assert.strictEqual(actions[0].id, 'wait-for-import');
    assert.strictEqual(actions[0].targetLayer, null);
    assert.strictEqual(actions[1].targetLayer, 'source');
  });
});
