/**
 * BaseConnector - Abstract base class for all connectors
 * Connectors fetch content from external sources (DOI, GitHub, URL, etc.)
 */

class BaseConnector {
  constructor(config = {}) {
    this.config = config;
  }

  /**
   * Check if this connector can handle the given input
   * @param {string} input - User input
   * @returns {boolean} - True if this connector can handle the input
   */
  canHandle(input) {
    throw new Error('canHandle() must be implemented by subclass');
  }

  /**
   * Fetch content from the source
   * @param {string} input - User input
   * @returns {Promise<Object>} - Fetched content
   */
  async fetch(input) {
    throw new Error('fetch() must be implemented by subclass');
  }

  /**
   * Get connector name
   * @returns {string}
   */
  getName() {
    return this.constructor.name;
  }
}

module.exports = BaseConnector;
