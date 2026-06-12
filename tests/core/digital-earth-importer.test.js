/**
 * DigitalEarthImporter tests
 */

const { assert, describe, it } = require('../setup');
const DigitalEarthImporter = require('../../src/server/digital-earth-importer');

describe('DigitalEarthImporter', () => {
  it('should classify inputs through connector routing where possible', () => {
    const importer = new DigitalEarthImporter(null, null, null, null);

    assert.strictEqual(importer._identifyInputType('https://github.com/Grups666/teruvion'), 'git_hub');
    assert.strictEqual(importer._identifyInputType('10.1038/s41586-024-07145-1'), 'paper');
  });

  it('should keep generic URLs and text generic when no connector claims them', () => {
    const importer = new DigitalEarthImporter(null, null, null, null);

    assert.strictEqual(importer._identifyInputType('ftp://example.com/resource'), 'text');
    assert.strictEqual(importer._identifyInputType('short title'), 'text');
  });

  it('should preserve decomposed object metadata when creating store entities', () => {
    const importer = new DigitalEarthImporter(null, null, null, null);
    const entity = importer._createEntity({
      type: 'Dataset',
      attributes: {
        name: 'Fallback dataset'
      },
      metadata: {
        sourceDerived: true,
        confidence: 0.5,
        reviewStatus: 'needs-review'
      },
      provenance: {
        section: 'data availability',
        sourceText: 'Dataset availability is described in the source text.'
      }
    }, 'https://example.com/paper', 'project-1');

    assert.strictEqual(entity.metadata.sourceDerived, true);
    assert.strictEqual(entity.metadata.confidence, 0.5);
    assert.strictEqual(entity.metadata.reviewStatus, 'needs-review');
    assert.strictEqual(entity.metadata.source, 'https://example.com/paper');
    assert.strictEqual(entity.metadata.projectId, 'project-1');
    assert.strictEqual(entity.metadata.provenance.section, 'data availability');
  });
});
