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

  it('should downgrade readiness when extraction integrity has warnings', () => {
    const diagnosis = buildProjectImportDiagnosis({
      sourceCoverage: {
        contentLevel: 'full_text',
        label: 'Full text',
        detail: 'Structured source text is available.',
        hasFullText: true,
        hasStructuredSections: true
      },
      decomposition: {
        sourceObject: { id: 'source-1', type: 'Paper' },
        capabilityObjects: [{ id: 'model-1' }],
        worldObjects: [{ id: 'region-1' }],
        evidenceObjects: [{ id: 'claim-1' }],
        bridgeRelations: [{ type: 'supports', from: 'model-1', to: 'claim-1' }],
        extractionIntegrity: {
          status: 'needs_review',
          issues: [{
            id: 'scope-filtered',
            severity: 'warning',
            detail: '1 out-of-scope extracted item was removed before graph construction.'
          }]
        },
        provenance: { extractionMethod: 'hybrid' }
      },
      stored: { entities: 4, relations: 1 }
    });
    const readiness = buildProjectReadinessSummary(diagnosis);

    assert.ok(diagnosis.some(item => item.key === 'integrity' && item.status === 'limited'));
    assert.strictEqual(readiness.status, 'review');
    assert.ok(readiness.blockers.includes('Extraction Integrity'));
  });

  it('should surface content fidelity gaps in extraction integrity diagnosis', () => {
    const diagnosis = buildProjectImportDiagnosis({
      sourceCoverage: {
        contentLevel: 'full_text',
        label: 'Full text',
        detail: 'Structured source text is available.',
        hasFullText: true,
        hasStructuredSections: true
      },
      decomposition: {
        sourceObject: { id: 'source-1', type: 'Paper' },
        capabilityObjects: [{ id: 'model-1' }],
        worldObjects: [],
        evidenceObjects: [{ id: 'claim-1' }],
        bridgeRelations: [{ type: 'supports', from: 'model-1', to: 'claim-1' }],
        extractionIntegrity: {
          status: 'needs_review',
          contentFidelity: {
            level: 'weak',
            score: 50,
            missingFacets: ['data', 'method']
          },
          issues: [{
            id: 'content-fidelity',
            severity: 'warning',
            detail: 'Content fidelity is weak (50%): missing critical facets: data, method.'
          }]
        },
        provenance: { extractionMethod: 'hybrid' }
      },
      stored: { entities: 3, relations: 1 }
    });

    const integrity = diagnosis.find(item => item.key === 'integrity');

    assert.strictEqual(integrity.status, 'limited');
    assert.ok(integrity.detail.includes('Content fidelity 50%'));
    assert.ok(integrity.detail.includes('missing data, method'));
  });

  it('should surface weak graph traceability in extraction integrity diagnosis', () => {
    const diagnosis = buildProjectImportDiagnosis({
      sourceCoverage: {
        contentLevel: 'full_text',
        label: 'Full text',
        detail: 'Structured source text is available.',
        hasFullText: true,
        hasStructuredSections: true
      },
      decomposition: {
        sourceObject: { id: 'source-1', type: 'Paper' },
        capabilityObjects: [{ id: 'model-1' }],
        worldObjects: [{ id: 'region-1' }],
        evidenceObjects: [{ id: 'claim-1' }],
        bridgeRelations: [{ type: 'supports', from: 'model-1', to: 'claim-1' }],
        extractionIntegrity: {
          status: 'needs_review',
          graphTraceability: {
            level: 'weak',
            score: 50,
            routeNodeCount: 3,
            traceableNodeCount: 0,
            weakNodeCount: 3,
            untracedNodeCount: 0
          },
          issues: [{
            id: 'graph-traceability',
            severity: 'warning',
            detail: 'Research graph traceability is weak (50%): no route node is strongly linked to source-grounded objects, evidence, or reusable resources.'
          }]
        },
        provenance: { extractionMethod: 'hybrid' }
      },
      stored: { entities: 4, relations: 1 }
    });
    const readiness = buildProjectReadinessSummary(diagnosis);
    const actions = buildProjectActionPlan(diagnosis, readiness);
    const integrity = diagnosis.find(item => item.key === 'integrity');

    assert.strictEqual(integrity.status, 'limited');
    assert.ok(integrity.detail.includes('Graph traceability 50%'));
    assert.ok(integrity.detail.includes('3 weakly traced route node'));
    assert.ok(actions.some(action => action.id === 'review-extraction-integrity'));
  });

  it('should surface unexplained visual evidence in extraction integrity diagnosis', () => {
    const diagnosis = buildProjectImportDiagnosis({
      sourceCoverage: {
        contentLevel: 'full_text',
        label: 'Full text',
        detail: 'Structured source text is available.',
        hasFullText: true,
        hasStructuredSections: true
      },
      decomposition: {
        sourceObject: { id: 'source-1', type: 'Paper' },
        capabilityObjects: [{ id: 'model-1' }],
        worldObjects: [],
        evidenceObjects: [{ id: 'claim-1' }],
        bridgeRelations: [{ type: 'supports', from: 'model-1', to: 'claim-1' }],
        visualEvidence: [{ id: 'figure-1', caption: 'Figure 1: Evaluation result.' }],
        extractionIntegrity: {
          status: 'needs_review',
          visualEvidenceQuality: {
            level: 'weak',
            expectedCount: 1,
            visualCount: 1,
            explainedCount: 0,
            reasons: ['visual evidence lacks source-grounded interpretation']
          },
          issues: [{
            id: 'visual-evidence',
            severity: 'warning',
            detail: 'Visual evidence quality is weak: visual evidence lacks source-grounded interpretation.'
          }]
        },
        provenance: { extractionMethod: 'hybrid' }
      },
      stored: { entities: 3, relations: 1 }
    });

    const integrity = diagnosis.find(item => item.key === 'integrity');

    assert.strictEqual(integrity.status, 'limited');
    assert.ok(integrity.detail.includes('Visual evidence weak'));
    assert.ok(integrity.detail.includes('0/1 figure/table item(s) explained'));
  });

  it('should surface weak resource graph quality in extraction integrity diagnosis', () => {
    const diagnosis = buildProjectImportDiagnosis({
      sourceCoverage: {
        contentLevel: 'full_text',
        label: 'Full text',
        detail: 'Structured source text is available.',
        hasFullText: true,
        hasStructuredSections: true
      },
      decomposition: {
        sourceObject: { id: 'source-1', type: 'Paper' },
        capabilityObjects: [{ id: 'model-1' }],
        worldObjects: [],
        evidenceObjects: [{ id: 'claim-1' }],
        bridgeRelations: [{ type: 'supports', from: 'model-1', to: 'claim-1' }],
        resourceGraph: {
          summary: { resourceCount: 2, linkedResourceCount: 0, reusableResourceCount: 1 }
        },
        extractionIntegrity: {
          status: 'needs_review',
          resourceGraphQuality: {
            level: 'weak',
            resourceCount: 2,
            linkedResourceCount: 0,
            reusableResourceCount: 1,
            reasons: ['resources are not linked to content route or evidence nodes']
          },
          issues: [{
            id: 'resource-graph-quality',
            severity: 'warning',
            detail: 'Resource graph quality is weak: resources are not linked to content route or evidence nodes.'
          }]
        },
        provenance: { extractionMethod: 'hybrid' }
      },
      stored: { entities: 3, relations: 1 }
    });

    const integrity = diagnosis.find(item => item.key === 'integrity');

    assert.strictEqual(integrity.status, 'limited');
    assert.ok(integrity.detail.includes('Resource graph weak'));
    assert.ok(integrity.detail.includes('0/2 resource(s) linked'));
  });

  it('should surface weak source brief quality in extraction integrity diagnosis', () => {
    const diagnosis = buildProjectImportDiagnosis({
      sourceCoverage: {
        contentLevel: 'full_text',
        label: 'Full text',
        detail: 'Structured source text is available.',
        hasFullText: true,
        hasStructuredSections: true
      },
      decomposition: {
        sourceObject: { id: 'source-1', type: 'Paper' },
        capabilityObjects: [{ id: 'model-1' }],
        worldObjects: [],
        evidenceObjects: [{ id: 'claim-1' }],
        bridgeRelations: [{ type: 'supports', from: 'model-1', to: 'claim-1' }],
        researchBrief: {
          keyPoints: [{ id: 'method', label: 'Method', value: 'Model', detail: 'Model.' }]
        },
        extractionIntegrity: {
          status: 'needs_review',
          briefQuality: {
            level: 'weak',
            pointCount: 1,
            informativePointCount: 0,
            groundedPointCount: 0,
            reasons: ['source brief needs at least three key points']
          },
          issues: [{
            id: 'brief-quality',
            severity: 'warning',
            detail: 'Source brief quality is weak: source brief needs at least three key points.'
          }]
        },
        provenance: { extractionMethod: 'hybrid' }
      },
      stored: { entities: 3, relations: 1 }
    });

    const integrity = diagnosis.find(item => item.key === 'integrity');

    assert.strictEqual(integrity.status, 'limited');
    assert.ok(integrity.detail.includes('Source brief weak'));
    assert.ok(integrity.detail.includes('0/1 point(s) informative'));
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

    const cancelled = buildProjectImportDiagnosis({
      status: 'cancelled'
    });
    assert.strictEqual(cancelled[0].value, 'Cancelled');
    assert.strictEqual(cancelled[0].status, 'missing');
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
    assert.strictEqual(actions[0].operation, 'inspect');
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
    assert.strictEqual(actions[0].operation, 'wait');
    assert.strictEqual(actions[0].targetLayer, null);
    assert.strictEqual(actions[1].id, 'cancel-import');
    assert.strictEqual(actions[1].operation, 'cancel');
    assert.strictEqual(actions[1].priority, 'high');
  });

  it('should build action plans for cancelled imports', () => {
    const diagnosis = buildProjectImportDiagnosis({ status: 'cancelled' });
    const readiness = buildProjectReadinessSummary(diagnosis);
    const actions = buildProjectActionPlan(diagnosis, readiness);

    assert.strictEqual(readiness.status, 'blocked');
    assert.strictEqual(actions[0].id, 'restart-import');
    assert.strictEqual(actions[0].operation, 'reimport');
    assert.strictEqual(actions[0].priority, 'high');
  });
});
