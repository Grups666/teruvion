/**
 * RepositoryFileClassifier tests
 */

const { assert, describe, it } = require('../setup');
const RepositoryFileClassifier = require('../../core/connectors/RepositoryFileClassifier');

describe('RepositoryFileClassifier', () => {
  it('should classify repository files by structural conventions', () => {
    const classifier = new RepositoryFileClassifier();

    assert.strictEqual(classifier.classify('requirements.txt').role, 'dependency_manifest');
    assert.strictEqual(classifier.classify('CITATION.cff').role, 'citation_metadata');
    assert.strictEqual(classifier.classify('data/README.md').role, 'data_descriptor');
    assert.strictEqual(classifier.classify('examples/run.py').role, 'example_entrypoint');
    assert.strictEqual(classifier.classify('docs/usage.md').role, 'documentation');
  });

  it('should not classify arbitrary semantic substrings as structural files', () => {
    const classifier = new RepositoryFileClassifier();

    assert.strictEqual(classifier.classify('src/paperclip.js'), null);
    assert.strictEqual(classifier.classify('src/database.py'), null);
    assert.strictEqual(classifier.classify('notes/my-dataset-ideas.py'), null);
  });

  it('should select high-value files without including README twice', () => {
    const classifier = new RepositoryFileClassifier();
    const selected = classifier.selectKeyFiles([
      'README.md',
      'src/database.py',
      'requirements.txt',
      'data/README.md',
      'docs/usage.md',
      'main.py'
    ]);

    assert.deepStrictEqual(selected.slice(0, 3), [
      'requirements.txt',
      'data/README.md',
      'main.py'
    ]);
    assert.ok(!selected.includes('README.md'), 'README is fetched separately');
  });
});
