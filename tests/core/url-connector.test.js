/**
 * URLConnector tests
 */

const { assert, describe, it } = require('../setup');
const URLConnector = require('../../core/connectors/URLConnector');

describe('URLConnector', () => {
  it('should normalize generic HTML pages into a source contract', async () => {
    const originalFetch = global.fetch;
    global.fetch = async url => {
      assert.strictEqual(url, 'https://news.example/flood-event');
      return {
        ok: true,
        async text() {
          return `
            <html>
              <head>
                <meta property="og:title" content="Flooding hits Lewistown, Pennsylvania" />
                <meta name="description" content="Flooding hit streets after severe storms." />
                <link rel="canonical" href="/flood-event" />
              </head>
              <body>
                <header>Navigation</header>
                <main>
                  <p>Flooding hit the streets of Lewistown, Pennsylvania after severe storms.</p>
                  <p>Emergency responders warned residents to avoid flooded roads.</p>
                  <p>This public report gives enough readable source text for generic admission and later review without relying on a publisher-specific parser.</p>
                  <p>The page includes a named location, an event description, and linked reusable resources so downstream components can decide whether it is worth map recomposition.</p>
                  <a href="https://zenodo.org/records/12345">event dataset</a>
                  <a href="https://github.com/example/flood-analysis">analysis repository</a>
                  <a href="https://doi.org/10.5555/example">related paper</a>
                </main>
              </body>
            </html>
          `;
        }
      };
    };

    try {
      const connector = new URLConnector();
      const source = await connector.fetch('https://news.example/flood-event');

      assert.strictEqual(source.type, 'url');
      assert.strictEqual(source.title, 'Flooding hits Lewistown, Pennsylvania');
      assert.ok(source.content.includes('Lewistown, Pennsylvania'), 'Should keep readable source text');
      assert.strictEqual(source.metadata.canonicalUrl, 'https://news.example/flood-event');
      assert.strictEqual(source.metadata.sourceLevel, 'readable_text');
      assert.ok(source.metadata.resources.some(resource => resource.type === 'dataset'));
      assert.ok(source.metadata.resources.some(resource => resource.type === 'repository'));
      assert.ok(source.metadata.resources.some(resource => resource.type === 'doi'));
    } finally {
      global.fetch = originalFetch;
    }
  });
});
