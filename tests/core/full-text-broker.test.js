/**
 * FullTextBroker tests
 */

const { assert, describe, it } = require('../setup');
const FullTextBroker = require('../../core/connectors/FullTextBroker');

describe('FullTextBroker', () => {
  it('should build a generic DOI landing page source from a DOI', () => {
    const broker = new FullTextBroker();
    const source = broker._doiLandingPageSource('10.1038/s41586-024-07145-1');

    assert.ok(source, 'Should return a DOI source');
    assert.strictEqual(source.type, 'publisher_html');
    assert.strictEqual(source.url, 'https://doi.org/10.1038/s41586-024-07145-1');
  });

  it('should parse publisher article sections from heading-based HTML', () => {
    const broker = new FullTextBroker();
    const longMethods = 'We trained models and evaluated forecast reliability. '.repeat(260);
    const longMain = 'Extreme flood prediction in ungauged watersheds uses global hydrological data. '.repeat(170);
    const html = `
      <article>
        <section>
          <h2>Abstract</h2>
          <div>
            <p>Global prediction of extreme floods in ungauged watersheds.</p>
          </div>
        </section>
        <section>
          <h2>Main</h2>
          <div>
            <p>${longMain}</p>
          </div>
        </section>
        <section>
          <h2>Methods</h2>
          <div>
            <p>${longMethods}</p>
          </div>
        </section>
        <section>
          <h2>Data availability</h2>
          <p>
            Data are available from
            <a href="https://zenodo.org/records/10397664">Zenodo archive</a>.
            Code is available from
            <a href="https://github.com/example/flood-model">source code repository</a>.
          </p>
        </section>
        <figure>
          <figcaption>Model forecast reliability across regions.</figcaption>
        </figure>
      </article>
    `;

    const structured = broker._parseHTMLStructure(html);

    assert.ok(structured.sections.abstract, 'Should extract abstract');
    assert.ok(structured.sections.main.length > 100, 'Should extract main content');
    assert.ok(structured.sections.methods.length > 100, 'Should extract methods content');
    assert.ok(structured.totalLength > 10000, 'Should retain enough text for full-text validation');
    assert.ok(broker._validateFullText(structured), 'Should validate as full text');
    assert.strictEqual(structured.figures.length, 1, 'Should extract figure captions');
    assert.ok(structured.resources.some(resource => resource.type === 'dataset'), 'Should classify data repository links');
    assert.ok(structured.resources.some(resource => resource.type === 'repository'), 'Should classify code repository links');
  });

  it('should extract scholarly resource metadata without publisher-specific rules', () => {
    const broker = new FullTextBroker();
    const html = `
      <html>
        <head>
          <meta name="citation_pdf_url" content="https://publisher.example/article.pdf" />
          <meta name="citation_supplementary_material" content="https://publisher.example/supplement.zip" />
        </head>
        <body>
          <p>
            Supporting information and dataset are available at
            <a href="https://figshare.com/articles/dataset/example/123">dataset archive</a>.
          </p>
          <a href="/privacy">Privacy</a>
        </body>
      </html>
    `;

    const structured = broker._parseHTMLStructure(html);

    assert.ok(structured.resources.some(resource => resource.type === 'paper'), 'Should expose citation PDF');
    assert.ok(structured.resources.some(resource => resource.type === 'supplement'), 'Should expose supplementary material');
    assert.ok(structured.resources.some(resource => resource.type === 'dataset'), 'Should expose dataset archive');
    assert.ok(!structured.resources.some(resource => resource.url.includes('privacy')), 'Should skip navigation links');
  });
});
