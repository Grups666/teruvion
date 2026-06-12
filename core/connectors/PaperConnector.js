/**
 * PaperConnector - Universal paper fetcher using OpenAlex API
 * Handles: DOIs, paper URLs (Nature, arXiv, etc.), paper titles
 */

const BaseConnector = require('./BaseConnector');
const FullTextBroker = require('./FullTextBroker');
const fetch = require('node-fetch');
const PaperIdentifierResolver = require('./PaperIdentifierResolver');

class PaperConnector extends BaseConnector {
  constructor(config) {
    super(config);
    this.fullTextBroker = new FullTextBroker(config);
    this.identifierResolver = new PaperIdentifierResolver(config);
  }
  /**
   * Check if input could be a paper
   * Accepts: DOIs, paper URLs, or plain text titles
   */
  canHandle(input) {
    return this.identifierResolver.canBePaperInput(input);
  }

  /**
   * Fetch paper via OpenAlex + FullTextBroker
   */
  async fetch(input) {
    let queryUrl;

    // 1. Extract DOI from URL or direct DOI
    const resolved = await this.identifierResolver.resolve(input);
    const doi = resolved.doi;
    if (doi) {
      queryUrl = `https://api.openalex.org/works/https://doi.org/${doi}`;
    } else {
      if (this.identifierResolver.isURL(input)) {
        throw new Error('No DOI metadata found on paper URL');
      }

      // 2. Search by title
      const encodedTitle = encodeURIComponent(input.trim());
      queryUrl = `https://api.openalex.org/works?filter=display_name.search:${encodedTitle}&per-page=1`;
    }

    const headers = {
      'User-Agent': 'Teruvion/0.1.0 (mailto:research@teruvion.org)'
    };

    if (this.config.openAlexKey) {
      headers['Authorization'] = `Bearer ${this.config.openAlexKey}`;
    }

    const response = await fetch(queryUrl, {
      headers,
      signal: AbortSignal.timeout(15000)
    });

    if (!response.ok) {
      throw new Error(`OpenAlex API error: ${response.status}`);
    }

    const data = await response.json();

    // Handle search results vs direct work
    const paper = doi ? data : data.results?.[0];

    if (!paper) {
      throw new Error('Paper not found in OpenAlex database');
    }

    // Build structured content from metadata
    const abstract = this._reconstructAbstract(paper.abstract_inverted_index);
    const authors = (paper.authorships || []).map(a => ({
      name: a.author?.display_name,
      affiliation: a.institutions?.[0]?.display_name
    }));

    // Try to fetch full text via FullTextBroker
    let fullText = null;
    const paperDoi = paper.doi;

    if (paperDoi) {
      try {
        console.log('[PaperConnector] Attempting full text fetch for:', paperDoi);
        fullText = await this.fullTextBroker.fetchFullText(paperDoi, {
          abstract,
          title: paper.title,
          venue: paper.primary_location?.source?.display_name,
          best_oa_location: paper.best_oa_location
        });

        console.log('[PaperConnector] Full text level:', fullText.level);
      } catch (err) {
        console.warn('[PaperConnector] Full text fetch failed:', err.message);
      }
    }

    // Build content based on what we have
    const content = fullText?.level === 'full_text'
      ? this._buildContentFromFullText(paper, fullText)
      : this._buildContent(paper, abstract, authors);

    return {
      type: 'paper',
      title: paper.title || paper.display_name,
      doi: paper.doi,
      abstract: abstract,
      authors: authors,
      year: paper.publication_year,
      venue: paper.primary_location?.source?.display_name,
      keywords: (paper.concepts || []).slice(0, 10).map(c => c.display_name),
      citationCount: paper.cited_by_count,
      url: paper.doi || paper.id,
      content: content,
      // Include structured sections if available
      sections: fullText?.sections || { abstract },
      figures: fullText?.figures || [],
      tables: fullText?.tables || [],
      contentLevel: fullText?.level || 'abstract_only',
      provenance: fullText?.provenance || {
        source: 'openalex_metadata',
        warning: 'Full text not fetched'
      },
      metadata: paper
    };
  }

  /**
   * Build content from full text sections
   */
  _buildContentFromFullText(paper, fullText) {
    const parts = [];

    // Title
    parts.push(`# ${paper.title || paper.display_name}`);
    parts.push('');

    // Authors
    const authors = (paper.authorships || []).map(a => a.author?.display_name);
    if (authors.length > 0) {
      parts.push(`**Authors:** ${authors.slice(0, 10).join(', ')}${authors.length > 10 ? ', et al.' : ''}`);
    }

    // Venue & Year
    const venue = paper.primary_location?.source?.display_name;
    if (venue || paper.publication_year) {
      parts.push(`**Published:** ${venue || 'Unknown'} (${paper.publication_year || 'n.d.'})`);
    }

    // Citations
    if (paper.cited_by_count) {
      parts.push(`**Citations:** ${paper.cited_by_count}`);
    }

    parts.push('');

    // Add sections
    for (const [sectionName, sectionContent] of Object.entries(fullText.sections)) {
      if (sectionContent && sectionContent.length > 100) {
        parts.push(`## ${this._formatSectionName(sectionName)}`);
        parts.push(sectionContent.substring(0, 5000)); // Limit per section
        parts.push('');
      }
    }

    // Figures
    if (fullText.figures && fullText.figures.length > 0) {
      parts.push('## Figures');
      fullText.figures.forEach(fig => {
        parts.push(`- **${fig.number}**: ${fig.caption}`);
      });
      parts.push('');
    }

    return parts.join('\n');
  }

  /**
   * Format section name for display
   */
  _formatSectionName(name) {
    return name.charAt(0).toUpperCase() + name.slice(1).replace(/[_-]/g, ' ');
  }

  /**
   * Reconstruct abstract from OpenAlex inverted index
   */
  _reconstructAbstract(inverted) {
    if (!inverted) return '';

    const words = [];
    for (const [word, positions] of Object.entries(inverted)) {
      positions.forEach(pos => {
        words[pos] = word;
      });
    }

    return words.join(' ');
  }

  /**
   * Build rich text content from paper metadata
   */
  _buildContent(paper, abstract, authors) {
    const parts = [];

    // Title
    parts.push(`# ${paper.title || paper.display_name}`);
    parts.push('');

    // Authors
    if (authors.length > 0) {
      const authorStr = authors.slice(0, 10).map(a => a.name).join(', ');
      parts.push(`**Authors:** ${authorStr}${authors.length > 10 ? ', et al.' : ''}`);
    }

    // Venue & Year
    const venue = paper.primary_location?.source?.display_name;
    if (venue || paper.publication_year) {
      parts.push(`**Published:** ${venue || 'Unknown venue'} (${paper.publication_year || 'n.d.'})`);
    }

    // Citations
    if (paper.cited_by_count) {
      parts.push(`**Citations:** ${paper.cited_by_count}`);
    }

    parts.push('');

    // Abstract
    if (abstract) {
      parts.push('## Abstract');
      parts.push(abstract);
      parts.push('');
    }

    // Keywords
    const keywords = (paper.concepts || []).slice(0, 10).map(c => c.display_name);
    if (keywords.length > 0) {
      parts.push(`**Keywords:** ${keywords.join(', ')}`);
      parts.push('');
    }

    // Related works
    if (paper.referenced_works && paper.referenced_works.length > 0) {
      parts.push(`**References:** ${paper.referenced_works.length} cited works`);
    }

    return parts.join('\n');
  }

  getName() {
    return 'PaperConnector';
  }
}

module.exports = PaperConnector;
