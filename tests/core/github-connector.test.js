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
});
