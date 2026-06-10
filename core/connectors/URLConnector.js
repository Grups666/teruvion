/**
 * URLConnector - Fetches content from generic URLs
 */

const BaseConnector = require('./BaseConnector');

class URLConnector extends BaseConnector {
  /**
   * Check if input is a URL
   */
  canHandle(input) {
    return input.startsWith('http://') || input.startsWith('https://');
  }

  /**
   * Fetch content from URL
   */
  async fetch(input) {
    const response = await fetch(input, {
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) {
      throw new Error(`HTTP error: ${response.status}`);
    }

    const text = await response.text();

    return {
      type: 'url',
      url: input,
      content: text.substring(0, 50000) // Limit size
    };
  }
}

module.exports = URLConnector;
