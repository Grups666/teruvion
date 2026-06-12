/**
 * ProjectDiagnostics tests
 */

const { assert, describe, it } = require('../setup');
const { buildProjectImportDiagnosis } = require('../../core/project/ProjectDiagnostics');

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
});
