/**
 * SourceObjectGraphQuality tests
 */

const { assert, describe, it } = require('../setup');
const {
  assessSourceObjectGraphQuality,
  assessProjectRecompositionQuality
} = require('../../core/quality/SourceObjectGraphQuality');

describe('SourceObjectGraphQuality', () => {
  it('should score a grounded source-to-object graph as product-ready', () => {
    const quality = assessSourceObjectGraphQuality({
      researchBrief: {
        oneLine: 'A model transforms meteorological data into evaluated forecasts.',
        keyPoints: [
          { label: 'Data', value: 'Meteorological inputs' },
          { label: 'Method', value: 'Forecast model' },
          { label: 'Finding', value: 'Benchmark evaluation' }
        ]
      },
      workflowOutline: {
        nodes: [
          { id: 'data', label: 'Meteorological inputs' },
          { id: 'method', label: 'Forecast model' },
          { id: 'finding', label: 'Benchmark evaluation' }
        ],
        edges: [
          { from: 'data', to: 'method' },
          { from: 'method', to: 'finding' }
        ]
      },
      visualEvidence: [{ interpretation: 'Explains model comparison.' }],
      externalResources: [{ type: 'dataset', url: 'https://example.org/data' }],
      resourceGraph: {
        summary: { resourceCount: 1, linkedResourceCount: 1 }
      },
      extractionIntegrity: {
        briefQuality: { level: 'complete', informationScore: 95, groundingScore: 90 },
        routeQuality: { level: 'content', informationScore: 92 },
        graphTraceability: { level: 'traceable', score: 90 },
        contentFidelity: { level: 'content', score: 92 },
        visualEvidenceQuality: { level: 'complete', explanationCoverage: 100 },
        resourceGraphQuality: { level: 'complete', linkCoverage: 100 }
      }
    }, { sourceCoverage: { contentLevel: 'full_text' } });

    assert.strictEqual(quality.level, 'product_ready');
    assert.ok(quality.score >= 82);
    assert.deepStrictEqual(quality.weakComponents, []);
  });

  it('should mark schema-valid but low-loss-poor output as weak', () => {
    const quality = assessSourceObjectGraphQuality({
      researchBrief: { oneLine: 'Paper.', keyPoints: [{ label: 'Source', value: 'Paper' }] },
      workflowOutline: { nodes: [{ id: 'source', label: 'Paper' }], edges: [] },
      extractionIntegrity: {
        briefQuality: { level: 'weak', informationScore: 20, groundingScore: 0, reasons: ['low-information brief'] },
        routeQuality: { level: 'limited', informationScore: 20, reasons: ['needs at least two content-level nodes'] },
        graphTraceability: { level: 'weak', score: 10 },
        contentFidelity: { level: 'weak', score: 25, missingFacets: ['data', 'method', 'evidence'] },
        visualEvidenceQuality: { level: 'missing', visualCount: 0 },
        resourceGraphQuality: { level: 'weak', resourceCount: 1, linkedResourceCount: 0 }
      }
    }, { sourceCoverage: { contentLevel: 'abstract_only' } });

    assert.strictEqual(quality.level, 'weak');
    assert.ok(quality.score < 68);
    assert.ok(quality.weakComponents.includes('brief'));
    assert.ok(quality.weakComponents.includes('route'));
  });

  it('should score project recomposition from aggregate contracts', () => {
    const quality = assessProjectRecompositionQuality({
      aggregate: {
        brief: {
          oneLine: 'A project combines paper and repository evidence.',
          keyPointCount: 3
        },
        route: { nodeCount: 4, edgeCount: 3 },
        visualEvidence: { count: 2, explainedCount: 2 },
        resources: { count: 2, linkedCount: 1 },
        integrity: { status: 'ready', warningCount: 0 }
      }
    });

    assert.strictEqual(quality.level, 'product_ready');
    assert.ok(quality.score >= 82);
  });
});
