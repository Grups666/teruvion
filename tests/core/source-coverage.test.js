/**
 * SourceCoverage tests
 */

const { assert, describe, it } = require('../setup');
const { summarizeSourceCoverage } = require('../../core/source/SourceCoverage');

describe('SourceCoverage', () => {
  it('should summarize full text coverage with structured metrics', () => {
    const coverage = summarizeSourceCoverage({
      contentLevel: 'full_text',
      content: 'A'.repeat(1200),
      sections: {
        abstract: 'Abstract text',
        methods: 'Methods text',
        results: 'Results text'
      },
      figures: [{ number: 'Figure 1' }],
      tables: [{ number: 'Table 1' }],
      provenance: {
        source: 'publisher_html',
        retrievedAt: '2026-06-12T00:00:00.000Z'
      }
    });

    assert.strictEqual(coverage.label, 'Full text');
    assert.strictEqual(coverage.hasFullText, true);
    assert.strictEqual(coverage.metrics.sectionCount, 3);
    assert.strictEqual(coverage.metrics.figureCount, 1);
    assert.strictEqual(coverage.metrics.tableCount, 1);
    assert.deepStrictEqual(coverage.sectionNames, ['abstract', 'methods', 'results']);
  });

  it('should summarize abstract-only fallback coverage', () => {
    const coverage = summarizeSourceCoverage({
      contentLevel: 'abstract_only',
      sections: { abstract: 'Only an abstract is available.' },
      provenance: {
        source: 'openalex_abstract',
        warning: 'Full text unavailable.'
      }
    });

    assert.strictEqual(coverage.label, 'Abstract only');
    assert.strictEqual(coverage.hasFullText, false);
    assert.strictEqual(coverage.metrics.sectionCount, 1);
    assert.ok(coverage.warning, 'Should preserve warning');
  });

  it('should handle missing coverage without inventing source quality', () => {
    const coverage = summarizeSourceCoverage({});

    assert.strictEqual(coverage.contentLevel, 'unknown');
    assert.strictEqual(coverage.label, 'Unknown coverage');
    assert.strictEqual(coverage.hasStructuredSections, false);
    assert.strictEqual(coverage.metrics.textLength, 0);
  });
});
