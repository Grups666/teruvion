/**
 * PaperIdentifierResolver
 *
 * Resolves stable scholarly identifiers from user input.
 * Hard links: DOI syntax, doi.org URLs, and standard scholarly HTML metadata.
 * Content understanding stays outside this resolver.
 */

const fetch = require('node-fetch');
const cheerio = require('cheerio');

class PaperIdentifierResolver {
  constructor(config = {}) {
    this.config = config;
    this.htmlMetadataSelectors = config.htmlMetadataSelectors || [
      'meta[name="citation_doi"]',
      'meta[name="dc.identifier"]',
      'meta[name="DC.Identifier"]',
      'meta[property="og:doi"]'
    ];
  }

  canBePaperInput(input) {
    if (this.resolveFromText(input)) return true;
    if (this.isURL(input)) return !this.isGitHubURL(input);
    return this.looksLikeTitle(input);
  }

  async resolve(input) {
    const direct = this.resolveFromText(input);
    if (direct) return { doi: direct, source: 'input' };

    if (!this.isURL(input)) {
      return { doi: null, source: 'none' };
    }

    const doi = await this.resolveFromHTMLURL(input);
    return {
      doi,
      source: doi ? 'html_metadata' : 'none'
    };
  }

  async resolveMetadata(input) {
    if (!this.isURL(input)) {
      return { doi: this.resolveFromText(input), title: null, source: 'input' };
    }

    try {
      const html = await this.fetchHTML(input);
      if (!html) return { doi: null, title: null, source: 'none' };
      return {
        doi: this.resolveFromHTML(html),
        title: this.resolveTitleFromHTML(html),
        source: 'html_metadata'
      };
    } catch (err) {
      console.warn('[PaperIdentifierResolver] Metadata discovery failed:', err.message);
      return { doi: null, title: null, source: 'none' };
    }
  }

  resolveFromText(text) {
    if (!text) return null;

    const trimmed = String(text).trim();
    const doiUrl = this.extractDOIFromDOIURL(trimmed);
    if (doiUrl) return doiUrl;

    return this.extractDOIFromText(trimmed);
  }

  extractDOIFromDOIURL(input) {
    try {
      const url = new URL(input);
      if (url.hostname.toLowerCase() !== 'doi.org') return null;
      const candidate = decodeURIComponent(url.pathname.replace(/^\/+/, ''));
      return this.extractDOIFromText(candidate);
    } catch {
      return null;
    }
  }

  async resolveFromHTMLURL(input) {
    try {
      const html = await this.fetchHTML(input);
      return html ? this.resolveFromHTML(html) : null;
    } catch (err) {
      console.warn('[PaperIdentifierResolver] DOI discovery failed:', err.message);
      return null;
    }
  }

  async fetchHTML(input) {
    const response = await fetch(input, {
      headers: {
        'User-Agent': 'Teruvion/0.12.76 (https://teruvion.org)',
        'Accept': 'text/html'
      },
      signal: AbortSignal.timeout(this.config.htmlTimeout || 20000),
      follow: 10
    });

    if (!response.ok) return null;

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) return null;

    return response.text();
  }

  resolveFromHTML(html) {
    const $ = cheerio.load(html);

    for (const selector of this.htmlMetadataSelectors) {
      const value = $(selector).attr('content');
      const doi = this.extractDOIFromText(value);
      if (doi) return doi;
    }

    return this.extractDOIFromText($('body').text().slice(0, 20000));
  }

  resolveTitleFromHTML(html) {
    const $ = cheerio.load(html);
    const candidates = [
      $('meta[name="citation_title"]').attr('content'),
      $('meta[property="og:title"]').attr('content'),
      $('meta[name="dc.title"]').attr('content'),
      $('meta[name="DC.Title"]').attr('content'),
      $('h1').first().text(),
      $('title').first().text()
    ];

    for (const candidate of candidates) {
      const title = this.cleanTitle(candidate);
      if (title && title.split(/\s+/).length >= 3) return title;
    }

    return null;
  }

  cleanTitle(title) {
    return String(title || '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  extractDOIFromText(text) {
    if (!text) return null;
    const match = String(text).match(/\b10\.\d{4,9}\/[^\s"'<>]+/i);
    return match ? match[0].replace(/[.,;:)]+$/, '') : null;
  }

  isURL(input) {
    try {
      const url = new URL(input);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  isGitHubURL(input) {
    try {
      return new URL(input).hostname.toLowerCase() === 'github.com';
    } catch {
      return false;
    }
  }

  looksLikeTitle(input) {
    if (!input || this.isURL(input)) return false;
    return String(input).trim().split(/\s+/).length >= 3;
  }
}

module.exports = PaperIdentifierResolver;
