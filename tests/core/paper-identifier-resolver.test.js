/**
 * PaperIdentifierResolver tests
 */

const { assert, describe, it } = require('../setup');
const PaperIdentifierResolver = require('../../core/connectors/PaperIdentifierResolver');

describe('PaperIdentifierResolver', () => {
  it('should resolve DOI from direct DOI input', async () => {
    const resolver = new PaperIdentifierResolver();
    const result = await resolver.resolve('10.1038/s41586-024-07145-1');

    assert.strictEqual(result.doi, '10.1038/s41586-024-07145-1');
    assert.strictEqual(result.source, 'input');
  });

  it('should resolve DOI from doi.org URLs through URL parsing', async () => {
    const resolver = new PaperIdentifierResolver();
    const result = await resolver.resolve('https://doi.org/10.1038/s41586-024-07145-1');

    assert.strictEqual(result.doi, '10.1038/s41586-024-07145-1');
    assert.strictEqual(result.source, 'input');
  });

  it('should discover DOI from standard citation metadata', () => {
    const resolver = new PaperIdentifierResolver();
    const doi = resolver.resolveFromHTML(`
      <html>
        <head>
          <meta name="citation_doi" content="10.1038/s41586-024-07145-1" />
        </head>
        <body>Article page</body>
      </html>
    `);

    assert.strictEqual(doi, '10.1038/s41586-024-07145-1');
  });

  it('should not require publisher-specific URL patterns to discover DOI', () => {
    const resolver = new PaperIdentifierResolver();
    const doi = resolver.resolveFromHTML(`
      <html>
        <head>
          <meta name="dc.identifier" content="doi:10.5555/example.paper.2026" />
        </head>
        <body>Publisher landing page</body>
      </html>
    `);

    assert.strictEqual(doi, '10.5555/example.paper.2026');
  });

  it('should extract title metadata as a generic fallback when DOI is absent', () => {
    const resolver = new PaperIdentifierResolver();
    const title = resolver.resolveTitleFromHTML(`
      <html>
        <head>
          <meta name="citation_title" content="Global prediction of extreme floods in ungauged watersheds" />
        </head>
        <body>Publisher landing page</body>
      </html>
    `);

    assert.strictEqual(title, 'Global prediction of extreme floods in ungauged watersheds');
  });

  it('should allow generic non-GitHub URLs to be evaluated as possible paper URLs', () => {
    const resolver = new PaperIdentifierResolver();

    assert.strictEqual(resolver.canBePaperInput('https://publisher.example/article/123'), true);
    assert.strictEqual(resolver.canBePaperInput('https://github.com/example/repo'), false);
  });
});
