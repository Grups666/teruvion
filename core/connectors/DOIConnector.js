/**
 * DOIConnector - Fetches paper metadata from DOI via OpenAlex API
 */

const BaseConnector = require('./BaseConnector');

class DOIConnector extends BaseConnector {
  /**
   * Check if input is a DOI
   */
  canHandle(input) {
    // DOI format: 10.xxxx/...
    return /^10\.\d{4,}\//.test(input) ||
           input.includes('doi.org/');
  }

  /**
   * Fetch paper metadata from OpenAlex
   */
  async fetch(input) {
    const cleanDoi = this._cleanDOI(input);
    const url = `https://api.openalex.org/works/https://doi.org/${cleanDoi}`;

    const headers = { 'User-Agent': 'Teruvion/0.1.0' };

    // Add API key if available
    if (this.config.openAlexKey) {
      headers['X-Api-Key'] = this.config.openAlexKey;
    }

    const response = await fetch(url, {
      headers,
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      throw new Error(`OpenAlex API error: ${response.status}`);
    }

    const paper = await response.json();

    return {
      type: 'paper',
      title: paper.title,
      doi: paper.doi,
      abstract: this._reconstructAbstract(paper.abstract_inverted_index),
      authors: (paper.authorships || []).map(a => ({
        name: a.author?.display_name,
        affiliation: a.institutions?.[0]?.display_name
      })),
      year: paper.publication_year,
      venue: paper.primary_location?.source?.display_name,
      keywords: (paper.concepts || []).slice(0, 10).map(c => c.display_name),
      citationCount: paper.cited_by_count,
      metadata: paper
    };
  }

  /**
   * Clean DOI from various formats
   */
  _cleanDOI(input) {
    return input
      .replace('https://doi.org/', '')
      .replace('http://doi.org/', '')
      .trim();
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
}

module.exports = DOIConnector;
