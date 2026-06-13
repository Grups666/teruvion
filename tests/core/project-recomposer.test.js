/**
 * ProjectRecomposer tests
 */

const { assert, describe, it } = require('../setup');
const { buildProjectRecomposition } = require('../../core/project/ProjectRecomposer');

describe('ProjectRecomposer', () => {
  it('should aggregate source briefs, route nodes, visuals, resources, and integrity without inventing evidence', () => {
    const recomposition = buildProjectRecomposition({
      decompositions: [{
        input: '10.5555/paper',
        sourceType: 'Paper',
        sourceObject: {
          id: 'paper-source',
          type: 'Paper',
          name: 'Forecast paper',
          attributes: { title: 'Forecast paper', url: 'https://example.org/paper' }
        },
        researchBrief: {
          title: 'Forecast paper',
          oneLine: 'A forecast workflow is evaluated against benchmark evidence.',
          keyPoints: [{
            id: 'kp-1',
            label: 'Input',
            value: 'Meteorological inputs feed the model.',
            detail: 'The route begins with weather inputs.'
          }, {
            id: 'kp-2',
            label: 'Finding',
            value: 'Forecast skill is evaluated against a benchmark.',
            detail: 'The source reports benchmark comparison evidence.'
          }]
        },
        workflowOutline: {
          nodes: [{
            id: 'data',
            label: 'Meteorological inputs',
            stage: 'data',
            summary: 'Inputs used by the workflow.',
            provenance: { sourceText: 'Meteorological inputs are used.' }
          }, {
            id: 'model',
            label: 'Forecast workflow',
            stage: 'method',
            summary: 'Transforms inputs into forecasts.',
            provenance: { sourceText: 'The forecast workflow transforms inputs.' }
          }],
          edges: [{ from: 'data', to: 'model', label: 'feeds' }]
        },
        capabilityObjects: [{ id: 'model-object' }],
        worldObjects: [],
        evidenceObjects: [{ id: 'claim-object' }],
        bridgeRelations: [{ from: 'model-object', to: 'claim-object', type: 'supports' }],
        visualEvidence: [{
          id: 'figure-1',
          label: 'Figure 1',
          kind: 'figure',
          caption: 'Forecast skill comparison.',
          interpretation: 'Shows skill differences.',
          howProduced: 'Computed from benchmark scores.',
          supportedClaim: 'Supports benchmark comparison.'
        }],
        externalResources: [{
          label: 'Input archive',
          url: 'https://example.org/data',
          type: 'dataset',
          routeRelevance: 'Provides model inputs.'
        }],
        resourceGraph: {
          edges: [{ from: 'resource-https-example-org-data', to: 'route-data', label: 'provides_input' }]
        },
        extractionIntegrity: {
          status: 'ready',
          routeQuality: { level: 'content', groundingScore: 100 },
          graphTraceability: { level: 'traceable' },
          visualEvidenceQuality: { level: 'complete' },
          resourceGraphQuality: { level: 'complete' },
          issues: []
        },
        provenance: { extractionMethod: 'hybrid' },
        confidence: 0.82
      }, {
        input: 'https://github.com/example/repo',
        sourceType: 'Repository',
        sourceObject: {
          id: 'repo-source',
          type: 'Repository',
          name: 'Forecast code',
          attributes: { url: 'https://github.com/example/repo' }
        },
        researchBrief: {
          title: 'Forecast code',
          oneLine: 'Repository documents the forecast workflow implementation.',
          keyPoints: [{
            label: 'Implementation',
            value: 'The repository documents the implementation path.',
            detail: 'Code source complements the paper route.'
          }]
        },
        workflowOutline: {
          nodes: [{
            id: 'implementation',
            label: 'Forecast workflow',
            stage: 'execution',
            summary: 'Runnable implementation path.'
          }],
          edges: []
        },
        capabilityObjects: [{ id: 'workflow-object' }],
        worldObjects: [],
        evidenceObjects: [],
        bridgeRelations: [],
        visualEvidence: [],
        externalResources: [{
          label: 'Forecast code',
          url: 'https://github.com/example/repo',
          type: 'repository',
          reproducibilityGrade: 'B'
        }],
        resourceGraph: { edges: [] },
        extractionIntegrity: {
          status: 'needs_review',
          routeQuality: { level: 'partial', groundingScore: 0 },
          issues: [{ severity: 'warning', detail: 'Needs runnable data.' }]
        },
        provenance: { extractionMethod: 'hybrid' },
        confidence: 0.7
      }]
    });

    assert.strictEqual(recomposition.schemaVersion, 'project-recomposition-v1');
    assert.strictEqual(recomposition.sourceCount, 2);
    assert.strictEqual(recomposition.sources[0].brief.keyPointCount, 2);
    assert.strictEqual(recomposition.aggregate.brief.keyPointCount, 3);
    assert.ok(recomposition.aggregate.brief.keyPoints.some(point => point.sourceId === 'paper-source'));
    assert.strictEqual(recomposition.aggregate.objectCounts.capability, 2);
    assert.ok(recomposition.aggregate.route.nodes.some(node => node.label === 'Meteorological inputs'));
    assert.ok(recomposition.aggregate.route.nodes.some(node => node.label === 'Forecast workflow'));
    assert.strictEqual(recomposition.aggregate.visualEvidence.count, 1);
    assert.strictEqual(recomposition.aggregate.visualEvidence.explainedCount, 1);
    assert.strictEqual(recomposition.aggregate.resources.reusableCount, 2);
    assert.strictEqual(recomposition.aggregate.limitations.length, 0);
    assert.ok(recomposition.aggregate.productQuality.score >= 68);
    assert.notStrictEqual(recomposition.aggregate.productQuality.level, 'weak');
    assert.strictEqual(recomposition.aggregate.integrity.status, 'needs_review');
    assert.deepStrictEqual(recomposition.aggregate.integrity.weakSourceIds, ['repo-source']);
  });
});
