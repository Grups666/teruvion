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
          <img
            src="/articles/example/figures/1-small.png"
            srcset="/articles/example/figures/1-small.png 320w, /articles/example/figures/1-large.png 1600w"
          />
          <figcaption>Model forecast reliability across regions.</figcaption>
        </figure>
        <table>
          <caption>Table 1: Forecast skill by lead time.</caption>
          <tr><th>Lead time</th><th>Skill</th></tr>
          <tr><td>0 day</td><td>0.72</td></tr>
          <tr><td>5 day</td><td>0.64</td></tr>
        </table>
      </article>
    `;

    const structured = broker._parseHTMLStructure(html, 'https://publisher.example/articles/example');

    assert.ok(structured.sections.abstract, 'Should extract abstract');
    assert.ok(structured.sections.main.length > 100, 'Should extract main content');
    assert.ok(structured.sections.methods.length > 100, 'Should extract methods content');
    assert.ok(structured.totalLength > 10000, 'Should retain enough text for full-text validation');
    assert.ok(broker._validateFullText(structured), 'Should validate as full text');
    assert.strictEqual(structured.figures.length, 1, 'Should extract figure captions');
    assert.strictEqual(
      structured.figures[0].imageUrl,
      'https://publisher.example/articles/example/figures/1-large.png',
      'Should choose the highest-resolution srcset figure URL against the source page'
    );
    assert.strictEqual(structured.tables.length, 1, 'Should extract table captions');
    assert.deepStrictEqual(structured.tables[0].headers, ['Lead time', 'Skill']);
    assert.deepStrictEqual(structured.tables[0].rows, [['0 day', '0.72'], ['5 day', '0.64']]);
    assert.ok(structured.resources.some(resource => resource.type === 'dataset'), 'Should classify data repository links');
    assert.ok(structured.resources.some(resource => resource.type === 'repository'), 'Should classify code repository links');
  });

  it('should enrich linked image-backed tables from detail pages', async () => {
    const broker = new FullTextBroker();
    broker._fetchHTMLWithCookies = async url => {
      assert.strictEqual(url, 'https://publisher.example/articles/example/tables/1');
      return `
        <header>
          <img src="https://cdn.publisher.example/chrome/logo.svg" />
        </header>
        <main>
          <h1>Extended Data Table 1 Evaluation metrics</h1>
          <div class="table-image">
            <img src="//cdn.publisher.example/tables/table1-large.jpg" />
          </div>
        </main>
      `;
    };

    const html = `
      <article>
        <section>
          <h2>Main</h2>
          <p>${'Article text for a source with a linked table detail page. '.repeat(200)}</p>
        </section>
        <div class="article-table">
          <figure>
            <figcaption><b>Extended Data Table 1 Evaluation metrics</b></figcaption>
            <a data-test="table-link" href="/articles/example/tables/1">Full size table</a>
          </figure>
        </div>
      </article>
    `;

    const structured = await broker._parseStructure({
      type: 'html',
      text: html,
      url: 'https://publisher.example/articles/example'
    }, 'publisher_html');

    assert.strictEqual(structured.tables.length, 1, 'Should keep the linked table');
    assert.strictEqual(
      structured.tables[0].imageUrl,
      'https://cdn.publisher.example/tables/table1-large.jpg',
      'Should enrich image-backed table from its detail page'
    );
    assert.strictEqual(
      structured.tables[0].detailUrl,
      'https://publisher.example/articles/example/tables/1',
      'Should preserve the source detail URL'
    );
  });

  it('should prefer structured high-resolution figure candidates over inline previews', () => {
    const broker = new FullTextBroker();
    const html = `
      <html>
        <head>
          <script type="application/ld+json">
            {
              "@context": "https://schema.org",
              "@type": "ScholarlyArticle",
              "image": [
                "https://cdn.publisher.example/articles/example/figures/figure1-1600.png"
              ]
            }
          </script>
        </head>
        <body>
          <article>
            <section>
              <h2>Main</h2>
              <p>${'The paper studies a reusable source-to-evidence workflow. '.repeat(200)}</p>
            </section>
            <figure>
              <a href="/articles/example/figures/1">Full size image</a>
              <picture>
                <source srcset="/articles/example/figures/figure1-480.webp 480w" type="image/webp" />
                <img src="/articles/example/figures/figure1-480.png" />
              </picture>
              <figcaption>Figure 1. Evaluation map for the extracted workflow.</figcaption>
            </figure>
          </article>
        </body>
      </html>
    `;

    const structured = broker._parseHTMLStructure(html, 'https://publisher.example/articles/example');

    assert.strictEqual(structured.figures.length, 1, 'Should extract the figure');
    assert.strictEqual(
      structured.figures[0].imageUrl,
      'https://cdn.publisher.example/articles/example/figures/figure1-1600.png',
      'Should use structured high-resolution image candidates when they are available'
    );
    assert.strictEqual(
      structured.figures[0].detailUrl,
      'https://publisher.example/articles/example/figures/1',
      'Should preserve a generic figure detail link for later enrichment'
    );
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

  it('should trim section-title text accidentally attached to resource URLs', () => {
    const broker = new FullTextBroker();

    assert.strictEqual(
      broker._normalizeResourceURL('https://g.co/floodhub.Extended'),
      'https://g.co/floodhub',
      'Should remove attached title-like URL suffixes'
    );
  });

  it('should exclude publisher page modules from article body sections', () => {
    const broker = new FullTextBroker();
    const methodText = 'The study transforms input observations through a reusable model and evaluates outputs. '.repeat(80);
    const relatedText = 'A later study on a different mountain glacier is shown because this article is cited by another paper. '.repeat(40);
    const html = `
      <article>
        <section>
          <h2>Methods</h2>
          <p>${methodText}</p>
        </section>
        <section>
          <h2>This article is cited by</h2>
          <p>${relatedText}</p>
        </section>
        <section>
          <h2>Author information</h2>
          <p>Author contribution and affiliation text should not become a research object.</p>
        </section>
      </article>
    `;

    const structured = broker._parseHTMLStructure(html, 'https://publisher.example/articles/example');

    assert.ok(structured.sections.methods, 'Should keep article method content');
    assert.ok(!structured.sections['this article is cited by'], 'Should drop cited-by page modules');
    assert.ok(!structured.sections['author information'], 'Should drop author-info page modules');
    assert.ok(!Object.values(structured.sections).join(' ').includes('mountain glacier'), 'Should not leak related content into extraction text');
  });

  it('should prefer article body headings over page-level recommendation headings', () => {
    const broker = new FullTextBroker();
    const methodText = 'The source method trains a reusable model from input observations and evaluates forecast outputs. '.repeat(80);
    const relatedText = 'A different recommended article about an unrelated glacier catchment should stay outside the article source contract. '.repeat(40);
    const html = `
      <html>
        <body>
          <main>
            <article>
              <section>
                <h2>Methods</h2>
                <p>${methodText}</p>
              </section>
            </article>
            <aside class="c-article-further-reading">
              <h2>More articles</h2>
              <p>${relatedText}</p>
              <h3 class="c-article-further-reading__title" data-test="article-title">Unrelated glacier catchment case study</h3>
              <p>${relatedText}</p>
            </aside>
          </main>
        </body>
      </html>
    `;

    const structured = broker._parseHTMLStructure(html, 'https://publisher.example/articles/example');

    assert.ok(structured.sections.methods, 'Should keep the article body method section');
    assert.ok(!structured.sections['more articles'], 'Should drop recommendation module headings');
    assert.ok(!structured.sections['unrelated glacier catchment case study'], 'Should not parse page-level recommendation titles as article sections');
    assert.ok(!Object.values(structured.sections).join(' ').includes('unrelated glacier'), 'Should not leak recommendation text into source sections');
  });
});
