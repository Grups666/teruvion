/**
 * GitHubConnector tests
 */

const { assert, describe, it } = require('../setup');
const GitHubConnector = require('../../core/connectors/GitHubConnector');

describe('GitHubConnector', () => {
  it('should accept repository URLs through URL parsing', () => {
    const connector = new GitHubConnector();

    assert.strictEqual(connector.canHandle('https://github.com/Grups666/teruvion'), true);
    assert.strictEqual(connector.canHandle('https://github.com/Grups666/teruvion.git?tab=readme'), true);
  });

  it('should reject non-repository or non-GitHub URLs', () => {
    const connector = new GitHubConnector();

    assert.strictEqual(connector.canHandle('https://github.com/Grups666'), false);
    assert.strictEqual(connector.canHandle('https://example.com/github.com/owner/repo'), false);
  });

  it('should build static repository reproducibility review from structural files', () => {
    const connector = new GitHubConnector();
    const metadata = connector._buildMetadata({
      owner: 'example',
      repo: 'route-toolkit',
      repoData: {
        name: 'route-toolkit',
        full_name: 'example/route-toolkit',
        description: 'Example toolkit',
        language: 'Python',
        stargazers_count: 5,
        topics: [],
        license: { spdx_id: 'MIT' },
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-02T00:00:00Z',
        size: 12,
        forks_count: 1,
        open_issues_count: 0
      },
      readme: [
        '# Route Toolkit',
        '## Usage',
        'Run the example with python run.py.',
        '## Data',
        '- scenario logs'
      ].join('\n'),
      tree: [
        'README.md',
        'LICENSE',
        'requirements.txt',
        'run.py',
        'notebooks/demo.ipynb',
        'data/README.md'
      ],
      keyFiles: {
        'requirements.txt': 'numpy>=1.0.0'
      }
    });

    assert.strictEqual(metadata.repositoryReview.grade, 'A');
    assert.strictEqual(metadata.repositoryReview.checks.readme, true);
    assert.strictEqual(metadata.repositoryReview.checks.license, true);
    assert.strictEqual(metadata.repositoryReview.checks.dependencyManifest, true);
    assert.ok(metadata.repositoryReview.reasons.some(reason => reason.includes('Dependency')));
  });
});
