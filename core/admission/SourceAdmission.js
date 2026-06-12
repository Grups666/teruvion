/**
 * Source Admission System for Digital Earth
 * Pre-processing evaluation before deep decomposition
 *
 * Pipeline: Input → Source Role Detection → Capability Assessment → Processing Depth
 *
 * Key insight: Not everything is "research-relevant" but many things are
 * Digital Earth-relevant. A policy report, population dataset, or flood news
 * may not be strong research sources, but they're critical for Digital Earth.
 */

const { SourceRoleEvaluator, detectSourceType, getActivatedOntology } = require('./evaluators/source-role');
const InformationDensityEvaluator = require('./evaluators/information-density');
const ontology = require('../registry/ontology');

const PROCESSING_DEPTHS_DE = {
  DEEP: 'deep',           // Full Digital Earth decomposition (all capabilities + world objects)
  STRUCTURED: 'structured', // Capability + selected world objects
  LIGHT: 'light',         // Source metadata + basic capabilities
  REJECT: 'reject'        // Not Digital Earth-relevant
};

class SourceAdmission {
  constructor(llm, options = {}) {
    this.llm = llm;
    this.options = {
      minScoreForProcessing: options.minScoreForProcessing || 0.15,
      skipEvaluators: options.skipEvaluators || [],
      useLLMTransferAssessment: options.useLLMTransferAssessment !== false,
      ...options
    };

    this.evaluators = {
      sourceRole: new SourceRoleEvaluator(llm),
      informationDensity: new InformationDensityEvaluator()
    };
  }

  /**
   * Evaluate a source input for Digital Earth admission
   * @param {string} input - The input (DOI, URL, title, etc.)
   * @param {Object} content - Content fetched from source
   * @param {Object} metadata - Additional metadata from connector
   * @returns {Object} Admission result with sourceRoles, activatedOntology, and decision
   */
  async evaluate(input, content = {}, metadata = {}) {
    const startTime = Date.now();

    const combinedMetadata = {
      ...content,
      ...(content.metadata || {}),
      ...metadata
    };
    delete combinedMetadata.metadata;

    // Detect source type after connector/content metadata has been normalized.
    const normalizedSourceType = this._normalizeSourceType(combinedMetadata.type);
    const detectionMetadata = { ...combinedMetadata };
    if (!normalizedSourceType) {
      delete detectionMetadata.type;
    }
    const sourceType = normalizedSourceType || detectSourceType(input, detectionMetadata);
    combinedMetadata.type = sourceType;

    // Evaluate source roles for Digital Earth
    // Use evaluate() for LLM-enhanced assessment, score() for rule-only
    let roleResult;
    if (this.llm && this.options.useLLMTransferAssessment) {
      roleResult = await this.evaluators.sourceRole.evaluate(combinedMetadata);
    } else {
      roleResult = this.evaluators.sourceRole.score(combinedMetadata);
    }

    // Evaluate information density
    const densityResult = this.evaluators.informationDensity.score(combinedMetadata);

    // Determine activated ontology layers and categories
    const activatedOntology = getActivatedOntology(roleResult.roles);

    // Make processing depth decision
    const decision = this._decide(roleResult, densityResult, activatedOntology);

    // Get activated entity types from ontology
    const activatedTypes = this._getActivatedTypes(activatedOntology);

    const elapsedMs = Date.now() - startTime;

    return {
      input,
      sourceType,
      admitted: decision.depth !== PROCESSING_DEPTHS_DE.REJECT,

      // Digital Earth specific outputs
      sourceRoles: roleResult.roles,
      detectedRoles: roleResult.detectedRoles,
      primaryRole: roleResult.primaryRole,
      isExplicitEarthSource: roleResult.isExplicitEarthSource,
      isTransferSource: roleResult.isTransferSource || false,
      transferReasons: roleResult.transferReasons || null,

      // Ontology activation
      activatedOntologyLayers: activatedOntology.layers,
      activatedCategories: activatedOntology.categories,
      activatedEntityTypes: activatedTypes,

      // Processing decision
      depth: decision.depth,
      score: decision.score,
      reasoning: decision.reasoning,
      estimatedValue: decision.estimatedValue,
      recommendedActions: decision.recommendedActions,

      // Metadata
      informationDensity: densityResult,
      evaluationMethod: roleResult.evaluationMethod || 'rule-based',
      elapsedMs
    };
  }

  _normalizeSourceType(type) {
    if (!type) return null;

    const normalized = String(type).toLowerCase();
    const typeMap = {
      paper: 'Paper',
      doi: null,
      github: 'Repository',
      repository: 'Repository',
      dataset: 'Dataset',
      datasetpage: 'DatasetPage',
      report: 'Report',
      assessmentreport: 'AssessmentReport',
      policydocument: 'PolicyDocument',
      news: 'News',
      source: null
    };

    return Object.prototype.hasOwnProperty.call(typeMap, normalized)
      ? typeMap[normalized]
      : type;
  }

  /**
   * Decide processing depth based on source roles and density
   */
  _decide(roleResult, densityResult, activatedOntology) {
    const roles = roleResult.roles;
    const roleCount = roleResult.roleCount;

    // Calculate Digital Earth relevance score
    // Use max score across roles to ensure strong single-role sources are admitted
    const roleScores = Object.values(roles);
    const maxRoleScore = Math.max(...roleScores);
    const avgRoleScore = roleScores.reduce((a, b) => a + b, 0) / roleScores.length;

    // Weighted combination: max role (primary strength) + average role (breadth)
    const deRelevance = (maxRoleScore * 0.6) + (avgRoleScore * 0.4);

    // Combine with density
    const score = (deRelevance * 0.7) + (densityResult.score * 0.3);

    // Decision logic
    if (this._isWeakUncontextualizedEvent(roleResult, roles)) {
      return {
        depth: PROCESSING_DEPTHS_DE.REJECT,
        score,
        reasoning: 'Event-like source lacks structured Digital Earth context',
        estimatedValue: 'none',
        recommendedActions: []
      };
    }

    if (score < 0.15 || roleCount === 0) {
      return {
        depth: PROCESSING_DEPTHS_DE.REJECT,
        score,
        reasoning: this._buildReasoning('reject', roles, score),
        estimatedValue: 'none',
        recommendedActions: []
      };
    }

    if (score < 0.30 || roleCount < 2) {
      return {
        depth: PROCESSING_DEPTHS_DE.LIGHT,
        score,
        reasoning: this._buildReasoning('light', roles, score),
        estimatedValue: 'low',
        recommendedActions: ['extract_metadata', 'identify_capabilities', 'detect_source_role']
      };
    }

    if (score < 0.50 || activatedOntology.categories.length < 3) {
      return {
        depth: PROCESSING_DEPTHS_DE.STRUCTURED,
        score,
        reasoning: this._buildReasoning('structured', roles, score),
        estimatedValue: 'medium',
        recommendedActions: [
          'extract_metadata', 'extract_capabilities', 'extract_world_objects',
          'build_capability_relations', 'link_to_earth_variables'
        ]
      };
    }

    return {
      depth: PROCESSING_DEPTHS_DE.DEEP,
      score,
      reasoning: this._buildReasoning('deep', roles, score),
      estimatedValue: 'high',
      recommendedActions: [
        'full_decomposition', 'extract_all_capabilities', 'extract_all_world_objects',
        'build_bridge_relations', 'create_evidence_chains', 'link_to_risks',
        'identify_interventions', 'build_scenario_links'
      ]
    };
  }

  _isWeakUncontextualizedEvent(roleResult, roles) {
    const eventScore = roles.event_signal || 0;
    const otherScores = Object.entries(roles)
      .filter(([role]) => role !== 'event_signal')
      .map(([_, value]) => value);
    const maxOtherScore = Math.max(...otherScores, 0);

    return eventScore > 0 &&
      eventScore <= 0.3 &&
      maxOtherScore < 0.2 &&
      !roleResult.isExplicitEarthSource;
  }

  /**
   * Build reasoning string
   */
  _buildReasoning(depth, roles, score) {
    const topRoles = Object.entries(roles)
      .filter(([_, s]) => s >= 0.2)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([r, s]) => `${r}(${s.toFixed(2)})`)
      .join(', ');

    const parts = [
      `Digital Earth relevance: ${score.toFixed(2)}`,
      `Top roles: ${topRoles || 'none detected'}`
    ];

    switch (depth) {
      case 'reject':
        parts.push('Not Digital Earth-relevant enough for processing');
        break;
      case 'light':
        parts.push('Limited Digital Earth value, metadata-only processing');
        break;
      case 'structured':
        parts.push('Moderate Digital Earth value, capability and world object extraction');
        break;
      case 'deep':
        parts.push('High Digital Earth value, full decomposition');
        break;
    }

    return parts.join('. ');
  }

  /**
   * Get activated entity types from ontology based on layers and categories
   */
  _getActivatedTypes(activatedOntology) {
    const types = [];
    const allTypes = ontology.getAllEntityTypes();
    const schemas = ontology.ENTITY_SCHEMAS;

    for (const [key, typeName] of Object.entries(allTypes)) {
      const schema = schemas[typeName];
      if (!schema) continue;

      // Check if type belongs to activated layer
      if (activatedOntology.layers.includes(schema.layer)) {
        types.push({
          name: typeName,
          layer: schema.layer,
          category: schema.category
        });
      }
    }

    return types;
  }

  /**
   * Quick admission check (lighter evaluation, no LLM)
   * @param {string} input - The input to check
   * @param {Object} metadata - Basic metadata
   * @returns {Object} Quick admission result
   */
  async quickCheck(input, metadata = {}) {
    const sourceType = detectSourceType(input, metadata);

    const roleResult = this.evaluators.sourceRole.score({
      ...metadata,
      type: sourceType
    });

    const activatedOntology = getActivatedOntology(roleResult.roles);

    const deRelevance = Object.values(roleResult.roles).reduce((sum, s) => sum + s, 0) / 10;
    const depth = deRelevance >= 0.4 ? PROCESSING_DEPTHS_DE.DEEP :
                  deRelevance >= 0.25 ? PROCESSING_DEPTHS_DE.STRUCTURED :
                  deRelevance >= 0.15 ? PROCESSING_DEPTHS_DE.LIGHT : PROCESSING_DEPTHS_DE.REJECT;

    return {
      input,
      sourceType,
      admitted: depth !== PROCESSING_DEPTHS_DE.REJECT,
      depth,
      primaryRole: roleResult.primaryRole,
      score: deRelevance,
      activatedOntologyLayers: activatedOntology.layers,
      activatedCategories: activatedOntology.categories
    };
  }

  /**
   * Batch evaluate multiple inputs
   */
  async batchEvaluate(inputs) {
    const results = [];

    for (const input of inputs) {
      try {
        const result = await this.evaluate(
          input.input || input,
          input.content || {},
          input.metadata || {}
        );
        results.push(result);
      } catch (err) {
        results.push({
          input: input.input || input,
          admitted: false,
          depth: PROCESSING_DEPTHS_DE.REJECT,
          error: err.message
        });
      }
    }

    return results;
  }

  /**
   * Get statistics on admission decisions
   */
  getStats(results) {
    const stats = {
      total: results.length,
      admitted: results.filter(r => r.admitted).length,
      rejected: results.filter(r => !r.admitted).length,
      byDepth: {},
      byRole: {},
      avgScore: 0,
      avgElapsedMs: 0
    };

    for (const depth of Object.values(PROCESSING_DEPTHS_DE)) {
      stats.byDepth[depth] = results.filter(r => r.depth === depth).length;
    }

    // Aggregate role statistics
    for (const result of results) {
      if (result.sourceRoles) {
        for (const [role, score] of Object.entries(result.sourceRoles)) {
          stats.byRole[role] = (stats.byRole[role] || 0) + score;
        }
      }
    }

    // Normalize role scores
    if (results.length > 0) {
      for (const role of Object.keys(stats.byRole)) {
        stats.byRole[role] = stats.byRole[role] / results.length;
      }
    }

    if (results.length > 0) {
      stats.avgScore = results.reduce((sum, r) => sum + (r.score || 0), 0) / results.length;
      stats.avgElapsedMs = results.reduce((sum, r) => sum + (r.elapsedMs || 0), 0) / results.length;
    }

    return stats;
  }
}

module.exports = {
  SourceAdmission,
  PROCESSING_DEPTHS: PROCESSING_DEPTHS_DE
};
