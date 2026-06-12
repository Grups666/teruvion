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
});
