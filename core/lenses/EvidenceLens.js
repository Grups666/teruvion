/**
 * Evidence Lens
 * Claim-evidence chain visualization
 */

const Lens = require('./Lens');

class EvidenceLens extends Lens {
  getName() {
    return 'evidence';
  }

  getDescription() {
    return 'Claim-evidence chain visualization showing support relationships';
  }

  getRelevantEntityTypes() {
    return Object.entries(this.ontology.ENTITY_SCHEMAS || {})
      .filter(([, schema]) => schema.category === 'evidence' || schema.category === 'knowledge')
      .map(([type]) => type);
  }

  getRelevantRelationTypes() {
    return ['supports', 'contradicts', 'derives_from', 'refines'];
  }

  async render(projectId, options = {}) {
    const entities = this.getEntities(projectId);
    const maxDepth = options.maxDepth || 5;

    const claims = entities.filter(e => this._isEvidenceClaim(e));

    const chains = [];
    const summary = {
      totalClaims: claims.length,
      completeChains: 0,
      partialChains: 0,
      unconnected: 0,
      avgDepth: 0,
      avgConfidence: 0
    };

    let totalDepth = 0;
    let totalConfidence = 0;

    for (const claim of claims) {
      const chain = this._buildChain(claim.id, maxDepth);
      chains.push(chain);

      totalDepth += chain.depth;
      totalConfidence += chain.confidence || 0.5;

      if (chain.evidence.length > 0) {
        if (chain.isComplete) {
          summary.completeChains++;
        } else {
          summary.partialChains++;
        }
      } else {
        summary.unconnected++;
      }
    }

    if (claims.length > 0) {
      summary.avgDepth = totalDepth / claims.length;
      summary.avgConfidence = totalConfidence / claims.length;
    }

    // Build graph for visualization
    const graph = this._buildEvidenceGraph(chains, entities);

    return {
      type: 'evidence-chains',
      chains,
      graph,
      summary,
      metadata: this.generateMetadata(projectId, {
        totalChains: chains.length,
        maxDepthUsed: maxDepth
      })
    };
  }

  _buildChain(entityId, maxDepth, visited = new Set()) {
    const entity = this.store.getEntity(entityId);
    if (!entity || visited.has(entityId) || visited.size >= maxDepth) {
      return {
        entityId,
        evidence: [],
        depth: 0,
        isComplete: false,
        confidence: 0.5
      };
    }

    visited.add(entityId);

    const chain = {
      entityId,
      entity,
      type: entity.type,
      statement: this._getStatement(entity),
      confidence: entity.attributes.confidence || entity.metadata?.confidence || 0.5,
      verificationState: entity.verificationState,
      evidence: [],
      depth: 0,
      isComplete: false
    };

    // Find evidence supporting this claim
    // Use OPS index to find entities that support this one
    const incomingRelations = this.store.getRelations(entityId).incoming;
    const supportingEvidence = incomingRelations.filter(r =>
      this._isSupportRelation(r.predicate)
    );

    for (const rel of supportingEvidence) {
      const evidenceEntity = this.store.getEntity(rel.subject);
      if (evidenceEntity) {
        const subChain = this._buildChain(evidenceEntity.id, maxDepth, new Set(visited));
        chain.evidence.push({
          entityId: evidenceEntity.id,
          type: evidenceEntity.type,
          name: evidenceEntity.getDisplayName(),
          confidence: evidenceEntity.attributes.confidence || 0.5,
          relation: rel.predicate,
          subChain: subChain.evidence.length > 0 ? subChain : null
        });
      }
    }

    // Calculate chain depth and completeness
    chain.depth = this._calculateDepth(chain);
    chain.isComplete = chain.evidence.length > 0 || chain.depth > 0;

    return chain;
  }

  _calculateDepth(chain) {
    if (chain.evidence.length === 0) return 0;
    return 1 + Math.max(...chain.evidence.map(e =>
      e.subChain ? this._calculateDepth(e.subChain) : 0
    ));
  }

  _buildEvidenceGraph(chains, entities) {
    const nodes = [];
    const edges = [];
    const addedNodes = new Set();
    const addedEdges = new Set();

    for (const chain of chains) {
      this._addChainToGraph(chain, nodes, edges, addedNodes, addedEdges);
    }

    return { nodes, edges };
  }

  _addChainToGraph(chain, nodes, edges, addedNodes, addedEdges) {
    // Add claim node
    if (!addedNodes.has(chain.entityId)) {
      const entity = this.store.getEntity(chain.entityId);
      nodes.push({
        id: chain.entityId,
        type: chain.type,
        label: chain.statement,
        category: this._categorizeType(entity.type),
        layer: this._getLayer(entity.type),
        confidence: chain.confidence,
        verificationState: chain.verificationState
      });
      addedNodes.add(chain.entityId);
    }

    // Add evidence nodes and edges
    for (const evidence of chain.evidence) {
      if (!addedNodes.has(evidence.entityId)) {
        const entity = this.store.getEntity(evidence.entityId);
        nodes.push({
          id: evidence.entityId,
          type: evidence.type,
          label: evidence.name,
          category: this._categorizeType(evidence.type),
          layer: this._getLayer(evidence.type),
          confidence: evidence.confidence
        });
        addedNodes.add(evidence.entityId);
      }

      const edgeKey = `${evidence.entityId}-${evidence.relation}-${chain.entityId}`;
      if (!addedEdges.has(edgeKey)) {
        edges.push({
          source: evidence.entityId,
          target: chain.entityId,
          relation: evidence.relation
        });
        addedEdges.add(edgeKey);
      }

      // Recursively add sub-chain
      if (evidence.subChain) {
        this._addChainToGraph(evidence.subChain, nodes, edges, addedNodes, addedEdges);
      }
    }
  }

  /**
   * Validate evidence chain completeness
   */
  validateChain(chainId) {
    const chain = this._buildChain(chainId, 10);

    const issues = [];

    // Check for missing evidence
    const entity = this.store.getEntity(chainId);
    if (chain.evidence.length === 0 && entity && this._isEvidenceClaim(entity)) {
      issues.push({
        type: 'missing_evidence',
        message: 'Claim has no supporting evidence'
      });
    }

    // Check for low confidence
    if (chain.confidence < 0.5) {
      issues.push({
        type: 'low_confidence',
        message: `Low confidence: ${chain.confidence}`
      });
    }

    // Check for unverified entities
    if (chain.verificationState === 'extracted') {
      issues.push({
        type: 'unverified',
        message: 'Entity has not been verified'
      });
    }

    return {
      valid: issues.length === 0,
      issues
    };
  }

  _isEvidenceClaim(entity) {
    if (!entity) return false;

    const category = this._categorizeType(entity.type);
    const attributes = entity.attributes || {};

    if (category === 'evidence') {
      return Boolean(
        attributes.statement ||
        attributes.claim ||
        attributes.hypothesis ||
        attributes.conclusion ||
        attributes.assertion
      );
    }

    const relations = this.store.getRelations(entity.id);
    return relations.incoming.some(rel => this._isSupportRelation(rel.predicate));
  }

  _getStatement(entity) {
    const attributes = entity.attributes || {};
    return attributes.statement ||
      attributes.claim ||
      attributes.hypothesis ||
      attributes.conclusion ||
      attributes.assertion ||
      entity.getDisplayName();
  }

  _isSupportRelation(predicate) {
    const supportRelations = new Set([
      'supports',
      'supported_by',
      'contradicts',
      'derives_from',
      'refines',
      'based_on'
    ]);

    return supportRelations.has(predicate);
  }
}

module.exports = EvidenceLens;
