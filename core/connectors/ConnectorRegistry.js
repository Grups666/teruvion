/**
 * ConnectorRegistry - Manages all connectors and routes inputs to appropriate connector
 */

const PaperConnector = require('./PaperConnector');
const GitHubConnector = require('./GitHubConnector');
const GeoJSONConnector = require('./GeoJSONConnector');
const URLConnector = require('./URLConnector');

class ConnectorRegistry {
  constructor(config = {}) {
    this.config = config;
    this.connectors = [];

    // Register connectors (order matters - first match wins)
    this.registerConnector(new GitHubConnector(config));
    this.registerConnector(new GeoJSONConnector(config));
    this.registerConnector(new PaperConnector(config));
    this.registerConnector(new URLConnector(config));
  }

  /**
   * Register a new connector
   */
  registerConnector(connector) {
    this.connectors.push(connector);
  }

  /**
   * Find the appropriate connector for the input
   */
  findConnector(input) {
    for (const connector of this.connectors) {
      if (connector.canHandle(input)) {
        return connector;
      }
    }
    return null;
  }

  /**
   * Fetch content using the appropriate connector
   */
  async fetch(input) {
    const candidates = this.connectors.filter(connector => connector.canHandle(input));

    if (candidates.length === 0) {
      throw new Error('No connector found for input type');
    }

    const errors = [];
    for (const connector of candidates) {
      try {
        console.log(`[ConnectorRegistry] Using ${connector.getName()} for input`);
        return await connector.fetch(input);
      } catch (error) {
        errors.push(`${connector.getName()}: ${error.message}`);
      }
    }

    throw new Error(`All connectors failed for input: ${errors.join('; ')}`);
  }

  /**
   * Get all registered connectors
   */
  getConnectors() {
    return this.connectors;
  }
}

module.exports = ConnectorRegistry;
