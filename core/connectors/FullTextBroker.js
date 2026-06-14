/**
 * FullTextBroker - compliant full-text acquisition pipeline
 *
 * Fetches scholarly source text with priority: HTML > XML > PDF > Abstract.
 * Uses Unpaywall/OpenAlex/PMC access routes and records provenance.
 */

const fetch = require('node-fetch');
const cheerio = require('cheerio');

class FullTextBroker {
  constructor(config = {}) {
    this.config = config;
    this.email = config.email || 'research@teruvion.org'; // Unpaywall requires email
  }

  /**
   * Fetch full text when allowed and return structured sections + provenance.
   */
  async fetchFullText(doi, metadata = {}) {
    console.log('[FullTextBroker] Fetching full text for:', doi);

    // Step 1: locate open-access or publisher entry points.
    const accessPlan = await this._locateOA(doi, metadata);

    // Step 2: try sources in priority order.
    for (const source of accessPlan.sources) {
      try {
        console.log(`[FullTextBroker] Trying ${source.type}:`, source.url);

        const content = await this._fetchFromSource(source);
        const structured = await this._parseStructure(content, source.type);

        // Step 3: validate that the content is useful full text.
        if (this._validateFullText(structured)) {
          console.log(`[FullTextBroker] Successfully fetched ${source.type}`);

          return {
            level: 'full_text',
            sections: structured.sections,
            figures: structured.figures || [],
            tables: structured.tables || [],
            resources: structured.resources || [],
            references: structured.references || [],
            totalLength: structured.totalLength,
            provenance: {
              source: source.type,
              url: source.url,
              license: source.license,
              oaStatus: accessPlan.oaStatus,
              retrievedAt: new Date().toISOString(),
              doi: doi
            }
          };
        }
      } catch (err) {
        console.warn(`[FullTextBroker] Source ${source.type} failed:`, err.message);
        continue;
      }
    }

    // Fallback to abstract only
    console.log('[FullTextBroker] Full text unavailable, using abstract');

    return {
      level: 'abstract_only',
      sections: {
        abstract: metadata.abstract || metadata.title || ''
      },
      figures: [],
      tables: [],
      resources: this._extractMetadataResources(metadata),
      references: [],
      totalLength: (metadata.abstract || '').length,
      provenance: {
        source: 'openalex_abstract',
        warning: 'Full text unavailable. Analysis limited to abstract and metadata.',
        doi: doi,
        retrievedAt: new Date().toISOString()
      }
    };
  }

  /**
   * Locate open-access entry points with Unpaywall and OpenAlex.
   */
  async _locateOA(doi, metadata) {
    const sources = [];
    let oaStatus = 'unknown';

    // 1. Try Unpaywall API
    try {
      const unpaywallUrl = `https://api.unpaywall.org/v2/${doi}?email=${this.email}`;
      const response = await fetch(unpaywallUrl, {
        headers: { 'User-Agent': 'Teruvion/0.1.0' },
        timeout: 10000
      });

      if (response.ok) {
        const oaData = await response.json();
        oaStatus = oaData.is_oa ? (oaData.oa_status || 'oa') : 'closed';

        // Best OA location (PDF)
        if (oaData.best_oa_location?.url_for_pdf) {
          sources.push({
            type: 'oa_pdf',
            url: oaData.best_oa_location.url_for_pdf,
            license: oaData.best_oa_location.license,
            version: oaData.best_oa_location.version
          });
        }

        // Best OA location (HTML)
        if (oaData.best_oa_location?.url) {
          sources.push({
            type: 'oa_html',
            url: oaData.best_oa_location.url,
            license: oaData.best_oa_location.license,
            version: oaData.best_oa_location.version
          });
        }

        console.log('[FullTextBroker] Unpaywall OA status:', oaStatus);
      }
    } catch (err) {
      console.warn('[FullTextBroker] Unpaywall lookup failed:', err.message);
    }

    // 2. OpenAlex best_oa_location (fallback)
    if (metadata.best_oa_location?.url) {
      sources.push({
        type: 'openalex_oa',
        url: metadata.best_oa_location.url,
        license: metadata.best_oa_location.license || 'unknown'
      });
    }

    sources.push(this._doiLandingPageSource(doi));

    // 3. PMC for biomedical
    if (this._isPMC(doi, metadata)) {
      const pmcId = await this._resolvePMCId(doi);
      if (pmcId) {
        sources.push({
          type: 'pmc_xml',
          url: `https://www.ncbi.nlm.nih.gov/pmc/articles/${pmcId}`,
          license: 'open-access'
        });
      }
    }

    // Sort by priority: publisher/HTML > XML > PDF
    sources.sort((a, b) => {
      const priority = { publisher_html: 1, oa_html: 2, pmc_xml: 3, openalex_oa: 4, oa_pdf: 5 };
      return (priority[a.type] || 99) - (priority[b.type] || 99);
    });

    return { sources: this._dedupeSources(sources.filter(Boolean)), oaStatus };
  }

  _doiLandingPageSource(doi) {
    const normalized = (doi || '').replace(/^https?:\/\/doi\.org\//i, '');
    if (!normalized) return null;

    return {
      type: 'publisher_html',
      url: `https://doi.org/${normalized}`,
      license: 'publisher-page',
      version: 'published'
    };
  }

  _dedupeSources(sources) {
    const seen = new Set();
    const unique = [];

    for (const source of sources) {
      const key = `${source.type}:${source.url}`;
      if (seen.has(key)) continue;
      seen.add(key);
      unique.push(source);
    }

    return unique;
  }

  /**
   * Fetch content from a source entry.
   */
  async _fetchFromSource(source) {
    const response = await fetch(source.url, {
      headers: {
        'User-Agent': 'Teruvion/0.1.0 (https://teruvion.org)',
        'Accept': 'text/html,application/xml,application/pdf'
      },
      timeout: 15000,
      follow: 20
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';

    // HTML
    if (contentType.includes('text/html')) {
      return {
        type: 'html',
        text: await response.text(),
        url: response.url || source.url
      };
    }

    // XML/JATS
    if (contentType.includes('xml')) {
      return {
        type: 'xml',
        text: await response.text(),
        url: response.url || source.url
      };
    }

    // PDF requires a separate parser.
    if (contentType.includes('pdf')) {
      // For MVP, we'll just note PDF availability but not parse
      // GROBID integration would be needed for proper PDF parsing
      console.log('[FullTextBroker] PDF detected, would need GROBID parsing');
      throw new Error('PDF parsing not implemented yet - try HTML source');
    }

    // Default to text
    return {
      type: 'text',
      text: await response.text(),
      url: response.url || source.url
    };
  }

  /**
   * Parse content structure into sections/resources.
   */
  async _parseStructure(content, sourceType) {
    if (content.type === 'html') {
      const structured = this._parseHTMLStructure(content.text, content.url);
      await this._enrichLinkedTables(structured.tables, content.url);
      return structured;
    }

    if (content.type === 'xml') {
      return this._parseXMLStructure(content.text, content.url);
    }

    // Fallback: try to detect sections in plain text
    return this._parseTextStructure(content.text);
  }

  /**
   * Parse HTML structure with section detection.
   */
  _parseHTMLStructure(html, baseUrl = '') {
    const $ = cheerio.load(html);
    const sections = {};
    const figures = [];
    const tables = [];
    const resources = [];
    const pageImageCandidates = this._extractPageImageCandidates($, baseUrl);

    // Common section patterns (not hardcoded keywords, just HTML structure hints)
    const sectionSelectors = [
      'section[id]',
      'div[section]',
      'h1, h2, h3',
      '.article-section',
      '.section-title'
    ];

    const sectionRoot = this._articleSectionRoot($);

    // Extract abstract from common scholarly HTML metadata or containers.
    const abstract = this._cleanText(
      sectionRoot.find('abstract, .abstract, #abstract, [data-test="abstract"], [role="doc-abstract"]').first().text()
    );
    if (abstract) {
      sections.abstract = abstract;
    }

    // Extract sections based on heading text. Publisher pages often mix article
    // body headings with page modules such as recommendations, cited-by lists,
    // author contribution panels, metrics, and legal/footer material. Keep the
    // parser generic, but do not pass those modules into downstream extraction.
    sectionRoot.find('h1, h2, h3').each((i, el) => {
      const heading = this._normalizeSectionName($(el).text());
      if (this._shouldSkipSectionHeading(heading)) return;
      if (this._isInsideNonArticleModule($, el)) return;

      let content = this._cleanText($(el).nextUntil('h1, h2, h3').text());

      if (content.length < 100) {
        content = this._cleanText(
          $(el)
            .closest('section, [data-container-section], [role="doc-abstract"]')
            .find('[data-test="section-content"], p, li')
            .text()
        );
      }

      const minSectionLength = heading === 'abstract' ? 20 : 100;

      // Detect section type from heading (LLM will classify later)
      if (
        heading
        && content.length > minSectionLength
        && !sections[heading]
        && !this._looksLikeNonArticleModule(content)
      ) {
        // Store with original heading as key
        sections[heading] = content.substring(0, 10000); // Limit per section
      }
    });

    // Extract figures. Some publisher pages style tables as figure-like blocks;
    // preserve them, but route table captions into the table channel.
    $('figure, .figure').each((i, el) => {
      const caption = $(el).find('figcaption, .caption').text().trim();
      const label = $(el).find('label, .label').text().trim();
      if (caption) {
        if (this._looksLikeTableCaption(caption)) {
          const detailUrl = this._extractTableDetailUrl($, el, baseUrl);
          tables.push({
            number: label || `Table ${tables.length + 1}`,
            caption,
            imageUrl: this._extractFigureImageUrl($, el, baseUrl),
            detailUrl,
            ...this._extractTableData($, el)
          });
          return;
        }

        figures.push({
          number: label || `Figure ${i + 1}`,
          caption: caption,
          imageUrl: this._extractFigureImageUrl($, el, baseUrl, {
            pageCandidate: pageImageCandidates[figures.length]
          }),
          detailUrl: this._extractFigureDetailUrl($, el, baseUrl)
        });
      }
    });

    // Extract tables
    $('table, .table').each((i, el) => {
      const caption = $(el).find('caption, .caption').text().trim();
      const tableData = this._extractTableData($, el);
      tables.push({
        number: `Table ${i + 1}`,
        caption: caption,
        imageUrl: this._extractFigureImageUrl($, el, baseUrl),
        detailUrl: this._extractTableDetailUrl($, el, baseUrl),
        ...tableData
      });
    });

    resources.push(...this._extractHTMLResources($));

    // Calculate total length
    const totalLength = Object.values(sections).reduce((sum, s) => sum + s.length, 0);

    return {
      sections,
      figures,
      tables,
      resources,
      references: [], // Would need reference parser
      totalLength
    };
  }

  async _enrichLinkedTables(tables = [], baseUrl = '') {
    for (const table of tables) {
      if (!table || !table.detailUrl) continue;
      if (table.imageUrl || (Array.isArray(table.rows) && table.rows.length > 0)) continue;

      try {
        const detailHtml = await this._fetchHTMLWithCookies(table.detailUrl);
        const $ = cheerio.load(detailHtml);
        const tableData = this._extractTableData($, $.root());
        const imageUrl = this._extractTableImageUrl($, $.root(), table.detailUrl);
        const detailCaption = this._cleanText(
          $('h1, [data-test="table-caption"], figcaption, caption').first().text()
        );

        if (imageUrl) table.imageUrl = imageUrl;
        if (detailCaption && (!table.caption || detailCaption.length > table.caption.length)) {
          table.caption = detailCaption;
        }
        if (tableData.headers.length || tableData.rows.length) {
          table.headers = tableData.headers;
          table.rows = tableData.rows;
        }
        table.sourceUrl = table.detailUrl;
      } catch (error) {
        table.detailFetchWarning = error.message;
      }
    }

    return tables;
  }

  async _fetchHTMLWithCookies(url) {
    let currentUrl = url;
    const cookies = new Map();

    for (let redirects = 0; redirects < 20; redirects += 1) {
      const response = await fetch(currentUrl, {
        redirect: 'manual',
        timeout: 15000,
        headers: {
          'User-Agent': 'Teruvion/0.1.0 (https://teruvion.org)',
          'Accept': 'text/html,application/xhtml+xml',
          ...(cookies.size ? { Cookie: Array.from(cookies.entries()).map(([key, value]) => `${key}=${value}`).join('; ') } : {})
        }
      });

      this._storeResponseCookies(response, cookies);

      if (response.status >= 300 && response.status < 400) {
        const location = response.headers.get('location');
        if (!location) throw new Error(`Redirect without location from ${currentUrl}`);
        currentUrl = new URL(location, currentUrl).toString();
        continue;
      }

      if (!response.ok) {
        throw new Error(`Table detail request failed with HTTP ${response.status}`);
      }

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html')) {
        throw new Error(`Table detail is not HTML: ${contentType || 'unknown content type'}`);
      }

      return response.text();
    }

    throw new Error('Table detail exceeded redirect limit');
  }

  _storeResponseCookies(response, cookies) {
    const raw = typeof response.headers.raw === 'function'
      ? response.headers.raw()['set-cookie'] || []
      : [];

    for (const cookieLine of raw) {
      const pair = String(cookieLine || '').split(';')[0];
      const separator = pair.indexOf('=');
      if (separator <= 0) continue;
      cookies.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim());
    }
  }

  _articleSectionRoot($) {
    const candidates = [
      'article',
      '[role="main"]',
      'main',
      '[data-test="article-body"]',
      '[data-article-body]',
      '.article',
      '.article-body'
    ];

    for (const selector of candidates) {
      const candidate = $(selector).first();
      if (candidate.length && this._cleanText(candidate.text()).length > 1000) {
        return candidate;
      }
    }

    return $.root();
  }

  _normalizeSectionName(text) {
    return this._cleanText(text)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  }

  _shouldSkipSectionHeading(heading = '') {
    const normalized = String(heading || '').toLowerCase().trim();
    if (!normalized) return true;

    const exactSkip = new Set([
      'references',
      'acknowledgements',
      'acknowledgments',
      'author information',
      'authors and affiliations',
      'author contributions',
      'contributions',
      'corresponding author',
      'competing interests',
      'ethics declarations',
      'additional information',
      'rights and permissions',
      'about this article',
      'metrics',
      'comments',
      'supplementary information',
      'peer review',
      'peer review information',
      'data availability statement',
      'about the journal',
      'search',
      'author researcher services'
    ]);
    if (exactSkip.has(normalized)) return true;

    const skipFragments = [
      'this article is cited by',
      'cited by',
      'associated content',
      'related articles',
      'similar content',
      'recommended',
      'more from',
      'browse articles',
      'journal information',
      'advertisement',
      'subscribe',
      'sign up',
      'download pdf'
    ];

    return skipFragments.some(fragment => normalized.includes(fragment));
  }

  _isInsideNonArticleModule($, el) {
    let current = $(el);
    for (let depth = 0; depth < 8 && current.length; depth += 1) {
      const attrs = current.attr() || {};
      const haystack = [
        current[0]?.tagName,
        attrs.id,
        attrs.class,
        attrs.role,
        ...Object.entries(attrs)
          .filter(([key]) => key.startsWith('data-'))
          .map(([key, value]) => `${key}=${value}`)
      ].filter(Boolean).join(' ').toLowerCase();

      if (/\b(supplementary|figure|figures|table|tables)\b/.test(haystack)) {
        return false;
      }

      if (/(further[-_\s]?reading|related[-_\s]?article|recommended|recommendation|cited[-_\s]?by|citation[-_\s]?list|ref[-_\s]?item|article[-_\s]?title|associated[-_\s]?content)/i.test(haystack)) {
        return true;
      }

      current = current.parent();
    }

    return false;
  }

  _looksLikeNonArticleModule(text = '') {
    const normalized = String(text || '').toLowerCase();
    if (!normalized) return true;

    const navigationSignals = [
      'sign up for alerts',
      'subscribe to journal',
      'rights and permissions',
      'reprints and permissions',
      'springer nature',
      'privacy policy',
      'terms and conditions',
      'cookie',
      'article metrics'
    ];

    return navigationSignals.some(signal => normalized.includes(signal))
      && normalized.length < 2500;
  }

  _looksLikeTableCaption(caption = '') {
    return /^\s*(extended\s+data\s+)?table\s+\d+/i.test(String(caption || ''));
  }

  _cleanText(text) {
    return (text || '').replace(/\s+/g, ' ').trim();
  }

  _extractFigureImageUrl($, el, baseUrl = '', options = {}) {
    const candidates = [];
    this._collectElementImageCandidates($, el, baseUrl, candidates);

    if (options.pageCandidate) {
      candidates.push({
        url: options.pageCandidate.url,
        source: options.pageCandidate.source || 'page-structured-image',
        score: options.pageCandidate.score || 0
      });
    }

    const best = this._selectBestImageUrl(candidates);
    return best || undefined;
  }

  _extractPageImageCandidates($, baseUrl = '') {
    const candidates = [];

    $('script[type="application/ld+json"]').each((i, el) => {
      const parsed = this._parseJSONSafe($(el).contents().text());
      for (const node of this._flattenJSONLD(parsed)) {
        this._collectStructuredImageValue(node?.image, baseUrl, candidates, 'json-ld-image');
      }
    });

    $('meta[property="og:image"], meta[name="og:image"], meta[name="twitter:image"]').each((i, el) => {
      const url = this._normalizeResourceURL(this._resolveResourceURL($(el).attr('content'), baseUrl));
      if (url) candidates.push({ url, source: 'meta-image', score: 1200 });
    });

    return this._dedupeImageCandidates(candidates);
  }

  _parseJSONSafe(text = '') {
    const value = String(text || '').trim();
    if (!value) return null;
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }

  _flattenJSONLD(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value.flatMap(item => this._flattenJSONLD(item));
    if (typeof value !== 'object') return [];

    const nested = [];
    for (const child of Object.values(value)) {
      if (child && typeof child === 'object') {
        nested.push(...this._flattenJSONLD(child));
      }
    }

    return [value, ...nested];
  }

  _collectStructuredImageValue(value, baseUrl, candidates, source) {
    if (!value) return;

    if (typeof value === 'string') {
      const url = this._normalizeResourceURL(this._resolveResourceURL(value, baseUrl));
      if (url) candidates.push({ url, source, score: this._scoreImageUrl(url, 1800) });
      return;
    }

    if (Array.isArray(value)) {
      value.forEach(item => this._collectStructuredImageValue(item, baseUrl, candidates, source));
      return;
    }

    if (typeof value === 'object') {
      const raw = value.url || value.contentUrl || value.thumbnailUrl;
      const url = this._normalizeResourceURL(this._resolveResourceURL(raw, baseUrl));
      const declaredWidth = Number.parseInt(value.width, 10) || 0;
      if (url) candidates.push({ url, source, score: this._scoreImageUrl(url, declaredWidth || 1800) });
    }
  }

  _collectElementImageCandidates($, el, baseUrl, candidates) {
    $(el).find('img, source').each((i, image) => {
      const attrs = [
        ['data-full', 2200],
        ['data-original', 2200],
        ['data-zoom-src', 2100],
        ['data-high-res-src', 2100],
        ['data-srcset', 1600],
        ['srcset', 1500],
        ['data-src', 900],
        ['src', 800]
      ];

      for (const [attr, baseScore] of attrs) {
        const raw = $(image).attr(attr);
        if (!raw) continue;
        this._pushImageCandidate(raw, baseUrl, candidates, attr, baseScore);
      }
    });

    $(el).find('a[href]').each((i, anchor) => {
      const href = String($(anchor).attr('href') || '');
      if (!this._looksLikeDirectImageURL(href)) return;
      this._pushImageCandidate(href, baseUrl, candidates, 'image-link', 2000);
    });
  }

  _pushImageCandidate(raw, baseUrl, candidates, source, baseScore = 1) {
    for (const parsed of this._parseImageCandidates(raw)) {
      const resolved = this._normalizeResourceURL(this._resolveResourceURL(parsed.url, baseUrl));
      if (!resolved) continue;
      candidates.push({
        url: resolved,
        source,
        score: this._scoreImageUrl(resolved, Math.max(baseScore, parsed.score || 0))
      });
    }
  }

  _parseImageCandidates(raw = '') {
    const value = String(raw || '').trim();
    if (!value) return [];

    return value.split(',').map(candidate => {
      const parts = candidate.trim().split(/\s+/);
      const url = parts[0];
      const descriptor = parts[1] || '';
      const width = descriptor.endsWith('w') ? Number.parseInt(descriptor, 10) : 0;
      const density = descriptor.endsWith('x') ? Number.parseFloat(descriptor) * 1000 : 0;
      return { url, score: width || density || 1 };
    }).filter(candidate => candidate.url);
  }

  _scoreImageUrl(url = '', baseScore = 1) {
    const value = String(url || '');
    const sizeHints = [
      /(?:^|[?&])(?:w|width)=([0-9]{3,5})(?:&|$)/i,
      /(?:^|[?&])(?:h|height)=([0-9]{3,5})(?:&|$)/i,
      /(?:^|[^\d])(?:lw|w|width)([0-9]{3,5})(?:[^\d]|$)/i
    ];

    let hintedSize = 0;
    for (const pattern of sizeHints) {
      const match = value.match(pattern);
      if (match) hintedSize = Math.max(hintedSize, Number.parseInt(match[1], 10) || 0);
    }

    const formatBonus = /\.(png|jpe?g|tiff?)(\?|#|$)/i.test(value) ? 80 : 0;
    return Math.max(baseScore || 1, hintedSize || 0) + formatBonus;
  }

  _selectBestImageUrl(candidates = []) {
    const deduped = this._dedupeImageCandidates(candidates);
    deduped.sort((a, b) => (b.score || 0) - (a.score || 0));
    return deduped[0]?.url || null;
  }

  _dedupeImageCandidates(candidates = []) {
    const seen = new Map();
    for (const candidate of candidates) {
      if (!candidate?.url) continue;
      const existing = seen.get(candidate.url);
      if (!existing || (candidate.score || 0) > (existing.score || 0)) {
        seen.set(candidate.url, candidate);
      }
    }
    return Array.from(seen.values());
  }

  _looksLikeDirectImageURL(url = '') {
    return /\.(png|jpe?g|webp|gif|tiff?)(\?|#|$)/i.test(String(url || ''));
  }

  _extractFigureDetailUrl($, el, baseUrl = '') {
    const links = $(el).find('a[href]').toArray();
    for (const anchor of links) {
      const href = String($(anchor).attr('href') || '');
      const label = [
        $(anchor).attr('data-test'),
        $(anchor).attr('data-track-action'),
        $(anchor).attr('aria-label'),
        this._cleanText($(anchor).text())
      ].filter(Boolean).join(' ').toLowerCase();

      if (/\b(figure|figures|image|full size|full-size|view larger|enlarge)\b/.test(label) || /\/figures?\//i.test(href)) {
        const resolved = this._resolveResourceURL(href, baseUrl);
        return this._normalizeResourceURL(resolved) || undefined;
      }
    }

    return undefined;
  }

  _extractTableImageUrl($, el, baseUrl = '') {
    const selectors = [
      '[class*="table"] img',
      '[class*="table"] source',
      '[id*="table"] img',
      '[id*="table"] source',
      '[data-test*="table"] img',
      '[data-test*="table"] source',
      'table img',
      'table source'
    ];

    for (const selector of selectors) {
      const image = $(el).find(selector).first();
      if (!image.length) continue;

      const raw = image.attr('data-full')
        || image.attr('data-original')
        || image.attr('data-srcset')
        || image.attr('srcset')
        || image.attr('data-src')
        || image.attr('src');

      if (!raw) continue;

      const bestCandidate = this._selectBestImageCandidate(raw);
      const resolved = this._resolveResourceURL(bestCandidate, baseUrl);
      const normalized = this._normalizeResourceURL(resolved);
      if (normalized) return normalized;
    }

    return undefined;
  }

  _extractTableDetailUrl($, el, baseUrl = '') {
    const links = $(el).find('a[href]').toArray();
    for (const anchor of links) {
      const href = String($(anchor).attr('href') || '');
      const text = this._cleanText($(anchor).text()).toLowerCase();
      const label = [
        $(anchor).attr('data-test'),
        $(anchor).attr('data-track-action'),
        $(anchor).attr('aria-label'),
        text
      ].filter(Boolean).join(' ').toLowerCase();

      if (/\btable(s)?\b/.test(label) || /\/tables?\//i.test(href)) {
        const resolved = this._resolveResourceURL(href, baseUrl);
        return this._normalizeResourceURL(resolved) || undefined;
      }
    }

    return undefined;
  }

  _selectBestImageCandidate(raw = '') {
    const value = String(raw || '').trim();
    if (!value.includes(',')) return value.split(/\s+/)[0];

    const candidates = value
      .split(',')
      .map(candidate => {
        const parts = candidate.trim().split(/\s+/);
        const url = parts[0];
        const descriptor = parts[1] || '';
        const width = descriptor.endsWith('w') ? Number.parseInt(descriptor, 10) : 0;
        const density = descriptor.endsWith('x') ? Number.parseFloat(descriptor) * 1000 : 0;
        return { url, score: width || density || 1 };
      })
      .filter(candidate => candidate.url);

    candidates.sort((a, b) => b.score - a.score);
    return candidates[0]?.url || value.split(/\s+/)[0];
  }

  _extractTableData($, el) {
    const headers = [];
    const rows = [];

    $(el).find('tr').each((rowIndex, row) => {
      const cells = [];
      $(row).children('th, td').each((cellIndex, cell) => {
        const text = this._cleanText($(cell).text());
        if (!text) return;
        cells.push(text);
        if (rowIndex === 0 && $(cell).is('th')) {
          headers[cellIndex] = text;
        }
      });
      if (cells.length > 0) rows.push(cells);
    });

    const normalizedHeaders = headers.filter(Boolean);
    const bodyRows = normalizedHeaders.length > 0 ? rows.slice(1) : rows;
    return {
      headers: normalizedHeaders,
      rows: bodyRows.slice(0, 50)
    };
  }

  _resolveResourceURL(url, baseUrl = '') {
    if (!url || typeof url !== 'string') return null;
    const trimmed = url.trim();
    if (!trimmed || trimmed.startsWith('data:')) return null;
    if (/^\/\//.test(trimmed)) return `https:${trimmed}`;
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    if (!baseUrl) return trimmed;

    try {
      return new URL(trimmed, baseUrl).toString();
    } catch {
      return trimmed;
    }
  }

  /**
   * Parse XML/JATS scholarly article structure.
   */
  _parseXMLStructure(xml, baseUrl = '') {
    const $ = cheerio.load(xml, { xmlMode: true });
    const sections = {};
    const figures = [];
    const resources = [];

    // JATS standard tags
    sections.abstract = $('abstract').text().trim();
    sections.introduction = $('intro, section[sec-type="intro"]').text().trim();
    sections.methods = $('methods, section[sec-type="methods"]').text().trim();
    sections.results = $('results, section[sec-type="results"]').text().trim();
    sections.discussion = $('discussion, section[sec-type="discussion"]').text().trim();
    sections.dataAvailability = $('data-availability, availability').text().trim();
    sections.codeAvailability = $('code-availability').text().trim();

    // Extract figures
    $('fig').each((i, el) => {
      const graphicHref = $(el).find('graphic, inline-graphic').first().attr('xlink:href')
        || $(el).find('graphic, inline-graphic').first().attr('href');
      figures.push({
        number: $(el).attr('id') || `Figure ${i + 1}`,
        caption: $(el).find('caption').text().trim(),
        imageUrl: this._normalizeResourceURL(this._resolveResourceURL(graphicHref, baseUrl)) || undefined
      });
    });

    $('ext-link, uri, self-uri').each((i, el) => {
      const href = $(el).attr('xlink:href') || $(el).attr('href') || $(el).text();
      this._pushResource(resources, {
        url: href,
        label: this._cleanText($(el).text()) || href,
        source: 'xml'
      });
    });

    const totalLength = Object.values(sections).reduce((sum, s) => sum + (s || '').length, 0);

    return {
      sections,
      figures,
      tables: [],
      resources,
      references: [],
      totalLength
    };
  }

  /**
   * Parse plain text structure as fallback.
   */
  _parseTextStructure(text) {
    const sections = {};

    // Just store whole text as 'content'
    sections.content = text.substring(0, 50000);

    return {
      sections,
      figures: [],
      tables: [],
      resources: this._extractTextResources(text),
      references: [],
      totalLength: text.length
    };
  }

  _extractHTMLResources($) {
    const resources = [];

    const metaSelectors = [
      'meta[name="citation_pdf_url"]',
      'meta[name="citation_fulltext_html_url"]',
      'meta[name="citation_public_url"]',
      'meta[name="citation_abstract_html_url"]',
      'meta[name="citation_supplementary_material"]',
      'meta[name="dc.identifier"]',
      'meta[property="og:url"]'
    ];

    for (const selector of metaSelectors) {
      $(selector).each((i, el) => {
        const value = $(el).attr('content');
        this._pushResource(resources, {
          url: value,
          label: this._resourceLabelFromURL(value),
          source: 'html_metadata'
        });
      });
    }

    $('a[href]').each((i, el) => {
      const href = $(el).attr('href');
      const label = this._cleanText($(el).text()) || this._resourceLabelFromURL(href);
      const context = this._cleanText($(el).closest('p, li, section, div').text()).slice(0, 500);
      this._pushResource(resources, {
        url: href,
        label,
        context,
        source: 'html_anchor'
      });
    });

    return resources.slice(0, 40);
  }

  _extractMetadataResources(metadata = {}) {
    const resources = [];
    [
      metadata.url,
      metadata.htmlUrl,
      metadata.pdfUrl,
      metadata.doi,
      metadata.repository,
      metadata.repo,
      metadata.dataUrl,
      metadata.codeUrl
    ].forEach(url => this._pushResource(resources, { url, source: 'metadata' }));
    return resources;
  }

  _extractTextResources(text) {
    const resources = [];
    const matches = String(text || '').match(/https?:\/\/[^\s)>\]},"']+/gi) || [];
    for (const url of matches) {
      this._pushResource(resources, {
        url: url.replace(/[.;,]+$/, ''),
        label: this._resourceLabelFromURL(url),
        source: 'text'
      });
    }
    return resources;
  }

  _pushResource(resources, candidate = {}) {
    const normalizedUrl = this._normalizeResourceURL(candidate.url);
    if (!normalizedUrl) return;

    const type = candidate.type || this._classifyResource(normalizedUrl, candidate.label, candidate.context);
    if (type === 'navigation') return;

    if (resources.some(resource => resource.url === normalizedUrl)) return;

    resources.push({
      label: candidate.label || this._resourceLabelFromURL(normalizedUrl),
      url: normalizedUrl,
      type,
      role: this._resourceRole(type),
      source: candidate.source || 'resource_discovery',
      context: candidate.context || undefined
    });
  }

  _normalizeResourceURL(url) {
    if (!url || typeof url !== 'string') return null;
    const trimmed = url.trim();
    if (!trimmed || trimmed.startsWith('#') || /^mailto:/i.test(trimmed) || /^javascript:/i.test(trimmed)) return null;
    if (/^10\.\d{4,9}\//i.test(trimmed)) return `https://doi.org/${trimmed}`;
    if (/^https?:\/\//i.test(trimmed)) return this._trimResourceURLPunctuation(trimmed);
    return null;
  }

  _trimResourceURLPunctuation(url) {
    let normalized = String(url || '').replace(/[.;,]+$/, '');
    normalized = normalized.replace(/\.([A-Z][A-Za-z]{5,})$/, '');
    return normalized;
  }

  _classifyResource(url, label = '', context = '') {
    const value = `${url} ${label} ${context}`.toLowerCase();
    if (value.includes('github.com') || value.includes('gitlab.com') || value.includes('bitbucket.org')) return 'repository';
    if (value.includes('zenodo') || value.includes('figshare') || value.includes('dataverse') || value.includes('dryad') || value.includes('pangaea')) return 'dataset';
    if (value.includes('supplement') || value.includes('supporting information') || value.includes('additional file')) return 'supplement';
    if (value.includes('data availability') || value.includes('dataset') || value.includes('data repository')) return 'dataset';
    if (value.includes('code availability') || value.includes('source code') || value.includes('software')) return 'code';
    if (url.toLowerCase().endsWith('.pdf')) return 'paper';
    if (url.toLowerCase().includes('doi.org')) return 'doi';
    if (value.includes('privacy') || value.includes('cookie') || value.includes('terms') || value.includes('login') || value.includes('subscribe')) return 'navigation';
    return 'external';
  }

  _resourceRole(type) {
    const roles = {
      repository: 'code repository',
      dataset: 'data resource',
      supplement: 'supplementary material',
      code: 'code resource',
      paper: 'paper file',
      doi: 'persistent identifier',
      external: 'referenced resource'
    };
    return roles[type] || 'referenced resource';
  }

  _resourceLabelFromURL(url) {
    try {
      const parsed = new URL(this._normalizeResourceURL(url) || url);
      return parsed.hostname.replace(/^www\./, '');
    } catch {
      return 'External resource';
    }
  }

  /**
   * Validate whether parsed content is useful full text.
   */
  _validateFullText(structured) {
    // Must have substantial content
    if (structured.totalLength < 10000) {
      console.log('[FullTextBroker] Content too short:', structured.totalLength);
      return false;
    }

    // Should have at least Methods or Results section
    const hasMethods = structured.sections.methods ||
                       Object.keys(structured.sections).some(k => k.includes('method'));
    const hasResults = structured.sections.results ||
                       Object.keys(structured.sections).some(k => k.includes('result'));

    if (!hasMethods && !hasResults) {
      console.log('[FullTextBroker] Missing Methods/Results sections');
      return false;
    }

    return true;
  }

  /**
   * Check whether the paper may have a PMC route.
   */
  _isPMC(doi, metadata) {
    return metadata.venue?.toLowerCase().includes('pmc') ||
           metadata.venue?.toLowerCase().includes('pubmed') ||
           metadata.host?.display_name?.toLowerCase().includes('pmc') ||
           doi.includes('pmc');
  }

  /**
   * Resolve PMC ID from DOI when available.
   */
  async _resolvePMCId(doi) {
    try {
      const url = `https://www.ncbi.nlm.nih.gov/pmc/utils/idconv/v1.0/?doi=${doi}&format=json`;
      const response = await fetch(url, { timeout: 5000 });

      if (response.ok) {
        const data = await response.json();
        return data.records?.[0]?.pmcid;
      }
    } catch (err) {
      console.warn('[FullTextBroker] PMC ID resolution failed:', err.message);
    }

    return null;
  }
}

module.exports = FullTextBroker;
