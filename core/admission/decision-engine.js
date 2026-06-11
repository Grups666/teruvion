/**
 * Decision Engine
 * Combines scores from all evaluators to determine processing depth
 */

const PROCESSING_DEPTHS = {
  DEEP: 'deep',           // Full DigitalEarthDecomposer (5-layer ontology extraction)
  STRUCTURED: 'structured', // Essential extraction (methods, datasets, results)
  LIGHT: 'light',         // Metadata only (title, type, summary)
  REJECT: 'reject'        // Not research-relevant, skip processing
};

class DecisionEngine {
  decide(scores) {
    const { researchRelevance, informationDensity, evidencePotential } = scores;

    // Calculate weighted average (research relevance weighted highest)
    const weightedScore =
      (researchRelevance.score * 0.5) +
      (evidencePotential.score * 0.3) +
      (informationDensity.score * 0.2);

    // Decision logic
    if (weightedScore < 0.2 || !researchRelevance.isResearch) {
      return {
        depth: PROCESSING_DEPTHS.REJECT,
        score: weightedScore,
        reasoning: this._buildReasoning('reject', scores, weightedScore),
        estimatedValue: 'none',
        recommendedActions: []
      };
    }

    if (weightedScore < 0.35) {
      return {
        depth: PROCESSING_DEPTHS.LIGHT,
        score: weightedScore,
        reasoning: this._buildReasoning('light', scores, weightedScore),
        estimatedValue: 'low',
        recommendedActions: ['extract_metadata', 'classify_type']
      };
    }

    if (weightedScore < 0.55) {
      return {
        depth: PROCESSING_DEPTHS.STRUCTURED,
        score: weightedScore,
        reasoning: this._buildReasoning('structured', scores, weightedScore),
        estimatedValue: 'medium',
        recommendedActions: ['extract_metadata', 'extract_methods', 'extract_datasets', 'extract_results']
      };
    }

    return {
      depth: PROCESSING_DEPTHS.DEEP,
      score: weightedScore,
      reasoning: this._buildReasoning('deep', scores, weightedScore),
      estimatedValue: 'high',
      recommendedActions: [
        'extract_metadata', 'extract_methods', 'extract_datasets',
        'extract_experiments', 'extract_results', 'extract_claims',
        'build_evidence_chains', 'assess_reproducibility',
        'analyze_spatial', 'extract_cross_references'
      ]
    };
  }

  _buildReasoning(depth, scores, weightedScore) {
    const parts = [];

    parts.push(`Weighted score: ${weightedScore.toFixed(2)}`);
    parts.push(`Research relevance: ${scores.researchRelevance.score.toFixed(2)} (${scores.researchRelevance.researchType})`);

    if (scores.researchRelevance.domain) {
      parts.push(`Domain: ${scores.researchRelevance.domain}`);
    }

    if (scores.informationDensity.factors?.length > 0) {
      parts.push(`Density factors: ${scores.informationDensity.factors.join(', ')}`);
    }

    if (scores.evidencePotential.indicators?.length > 0) {
      parts.push(`Evidence indicators: ${scores.evidencePotential.indicators.join(', ')}`);
    }

    switch (depth) {
      case 'reject':
        parts.push('Not research-relevant enough for processing');
        break;
      case 'light':
        parts.push('Limited research value, metadata-only processing');
        break;
      case 'structured':
        parts.push('Moderate research value, structured extraction');
        break;
      case 'deep':
        parts.push('High research value, full deep decomposition');
        break;
    }

    return parts.join('. ');
  }
}

module.exports = { DecisionEngine, PROCESSING_DEPTHS };