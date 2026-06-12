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
  });
});
