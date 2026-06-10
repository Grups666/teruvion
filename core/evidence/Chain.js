/**
 * Evidence Chain Builder and Validator
 * Traces how conclusions derive from evidence
 */

const { RELATION_TYPES } = require('../registry/ontology');

class EvidenceChain {
  constructor(store) {
    this.store = store;
  }

  /**
   * Build evidence chain from a conclusion/claim
   * Traces back through "supported_by" and "derives_from" relations
   */
  async build(conclusionId) {
    const chain = [];
    const visited = new Set();

    await this._traverse(conclusionId, chain, visited, 0);

    return {
      conclusion: conclusionId,
      chain,
      valid: this.validate(chain),
      depth: Math.max(...chain.map(c => c.level), 0)
    };
  }

  /**
   * Recursively traverse the evidence chain
   */
  async _traverse(objectId, chain, visited, level) {
    if (visited.has(objectId)) return;
    visited.add(objectId);

    const entity = this.store.getEntity(objectId);
    if (!entity) return;

    chain.push({
      level,
      entity,
      objectId
    });

    // Find supporting evidence via "supported_by" relation
    const supportedBy = this.store.query(objectId, RELATION_TYPES.SUPPORTS);

    // Also check "derives_from" relation
    const derivesFrom = this.store.query(objectId, RELATION_TYPES.DERIVES_FROM);

    const supporters = [...supportedBy, ...derivesFrom];

    for (const supporterId of supporters) {
      await this._traverse(supporterId, chain, visited, level + 1);
    }
  }

  /**
   * Validate evidence chain completeness
   */
  validate(chain) {
    const issues = [];

    // Check if all nodes have provenance
    const missingProvenance = chain.filter(c =>
      !c.entity.metadata.source || c.entity.metadata.confidence < 0.3
    );

    if (missingProvenance.length > 0) {
      issues.push(`${missingProvenance.length} entities lack provenance or have low confidence`);
    }

    // Check for gaps (non-leaf nodes without support)
    const maxLevel = Math.max(...chain.map(c => c.level), 0);

    for (const node of chain) {
      // Skip leaf nodes (deepest level)
      if (node.level === maxLevel) continue;

      // Check if this node has supporting evidence
      const supporters = this.store.query(node.objectId, RELATION_TYPES.SUPPORTS);
      const derivers = this.store.query(node.objectId, RELATION_TYPES.DERIVES_FROM);

      if (supporters.length === 0 && derivers.length === 0) {
        issues.push(`Entity ${node.entity.getDisplayName()} lacks supporting evidence`);
      }
    }

    return {
      complete: issues.length === 0,
      issues
    };
  }

  /**
   * Visualize evidence chain as text
   */
  visualize(chainData) {
    let output = `Evidence Chain for: ${chainData.conclusion}\n\n`;

    // Group by level
    const byLevel = {};
    for (const node of chainData.chain) {
      if (!byLevel[node.level]) byLevel[node.level] = [];
      byLevel[node.level].push(node);
    }

    // Sort levels
    const levels = Object.keys(byLevel).sort((a, b) => a - b);

    for (const level of levels) {
      const indent = '  '.repeat(parseInt(level));

      for (const node of byLevel[level]) {
        output += `${indent}[${node.entity.type}] ${node.entity.getDisplayName()}\n`;

        if (node.entity.metadata.source) {
          output += `${indent}  └─ Source: ${node.entity.metadata.source}\n`;
        }

        if (node.entity.metadata.confidence < 1.0) {
          output += `${indent}  └─ Confidence: ${node.entity.metadata.confidence}\n`;
        }
      }
    }

    output += `\nDepth: ${chainData.depth}\n`;
    output += `Valid: ${chainData.valid.complete ? 'Yes' : 'No'}\n`;

    if (chainData.valid.issues.length > 0) {
      output += `\nIssues:\n`;
      for (const issue of chainData.valid.issues) {
        output += `  - ${issue}\n`;
      }
    }

    return output;
  }

  /**
   * Check if a claim is supported by sufficient evidence
   */
  isSufficient(claimId, minDepth = 2, minConfidence = 0.7) {
    const chainData = this.build(claimId);

    if (chainData.depth < minDepth) {
      return {
        sufficient: false,
        reason: `Evidence chain too shallow (depth ${chainData.depth} < ${minDepth})`
      };
    }

    const avgConfidence = chainData.chain.reduce((sum, node) =>
      sum + node.entity.metadata.confidence, 0
    ) / chainData.chain.length;

    if (avgConfidence < minConfidence) {
      return {
        sufficient: false,
        reason: `Average confidence too low (${avgConfidence.toFixed(2)} < ${minConfidence})`
      };
    }

    if (!chainData.valid.complete) {
      return {
        sufficient: false,
        reason: `Evidence chain incomplete: ${chainData.valid.issues.join(', ')}`
      };
    }

    return {
      sufficient: true,
      depth: chainData.depth,
      confidence: avgConfidence
    };
  }
}

module.exports = EvidenceChain;
