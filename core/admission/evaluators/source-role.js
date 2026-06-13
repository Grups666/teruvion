/**
 * Source Role Evaluator
 * Determines what Digital Earth roles a source can play
 *
 * Design principle: LLM for semantic judgment, not keyword matching
 *
 * Two modes:
 * 1. LLM mode: Semantic understanding of source content
 * 2. Fallback mode: Type-based inference only (no keywords)
 */

const { LLMRoleEvaluator } = require('./llm-role-evaluator');
const { parseLLMJson } = require('../../utils/llm-json');

// Role definitions (descriptions only, no hardcoded keywords)
const SOURCE_ROLES = {
  earth_content: {
    name: 'earth_content',
    description: 'Contains Earth system knowledge (papers, reports, assessments)',
    sourceTypes: ['Report', 'AssessmentReport', 'WhitePaper', 'Documentation']
  },
  data_capability: {
    name: 'data_capability',
    description: 'Provides data for Earth analysis (datasets, data products)',
    sourceTypes: ['DatasetPage', 'DataCatalog', 'KnowledgeGraph']
  },
  observation_capability: {
    name: 'observation_capability',
    description: 'Provides Earth observation capability (sensors, gauges, satellites)',
    sourceTypes: ['Repository', 'Documentation', 'APIPage']
  },
  modeling_capability: {
    name: 'modeling_capability',
    description: 'Provides modeling/simulation capability (models, algorithms)',
    sourceTypes: ['Repository', 'ModelCard', 'Paper', 'Benchmark']
  },
  computing_capability: {
    name: 'computing_capability',
    description: 'Provides computing infrastructure (software, APIs, workflows)',
    sourceTypes: ['Repository', 'Package', 'APIPage', 'Documentation', 'TechnicalBlog']
  },
  governance_capability: {
    name: 'governance_capability',
    description: 'Provides governance/policy information (regulations, institutions, standards)',
    sourceTypes: ['PolicyDocument', 'StandardDocument', 'Report', 'AssessmentReport']
  },
  socioeconomic_capability: {
    name: 'socioeconomic_capability',
    description: 'Provides socioeconomic data (population, infrastructure, exposure)',
    sourceTypes: ['DatasetPage', 'Report', 'PolicyDocument']
  },
  evidence_assessment: {
    name: 'evidence_assessment',
    description: 'Provides evidence or assessment (claims, indicators, evaluations)',
    sourceTypes: ['Paper', 'Report', 'AssessmentReport', 'WhitePaper']
  },
  action_capability: {
    name: 'action_capability',
    description: 'Provides action/intervention information (measures, plans, responses)',
    sourceTypes: ['PolicyDocument', 'Report', 'News']
  },
  event_signal: {
    name: 'event_signal',
    description: 'Reports on Earth events (floods, droughts, disasters, changes)',
    sourceTypes: ['News', 'PressRelease', 'Report']
  }
};

class SourceRoleEvaluator {
  constructor(llm = null) {
    this.llm = llm;
    this.llmEvaluator = new LLMRoleEvaluator(llm);
  }

  /**
   * Main evaluation method
   * Uses LLM when available, fallback to type inference otherwise
   */
  async evaluate(metadata = {}) {
    if (this.llm) {
      return this.llmEvaluator.evaluateRoles(metadata);
    }
    return this.score(metadata);
  }

  /**
   * Fallback scoring without LLM
   * Uses type-based inference only
   */
  score(metadata = {}) {
    const type = this._normalizeSourceType(metadata.type);
    const roles = {};

    // Initialize all roles
    for (const roleName of Object.keys(SOURCE_ROLES)) {
      roles[roleName] = 0;
    }

    // Type-based scoring
    for (const [roleName, roleDef] of Object.entries(SOURCE_ROLES)) {
      const typeMatch = roleDef.sourceTypes.some(st =>
        type === this._normalizeSourceType(st)
      );
      if (typeMatch) {
        roles[roleName] = 0.5;
      }
    }

    // Content bonuses (structural indicators only, no keywords)
    this._addContentBonuses(roles, metadata);

    // Build detected roles
    const detectedRoles = Object.entries(roles)
      .filter(([_, score]) => score > 0)
      .map(([role, score]) => ({ role, score }))
      .sort((a, b) => b.score - a.score);

    return {
      roles,
      detectedRoles,
      primaryRole: detectedRoles[0]?.role || 'earth_content',
      roleCount: detectedRoles.length,
      isExplicitEarthSource: this._checkExplicitEarthSource(metadata),
      evaluationMethod: 'type-fallback'
    };
  }

  _normalizeSourceType(type) {
    return String(type || '')
      .trim()
      .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .toLowerCase();
  }

  /**
   * Add bonuses based on structural content indicators
   * NOT keyword matching - only checks for presence of structured fields
   */
  _addContentBonuses(roles, metadata) {
    // Data capability: presence of structured variables
    if (metadata.datasets?.length > 0 || metadata.variables?.length > 0) {
      roles.data_capability = Math.min(1.0, roles.data_capability + 0.3);
    }
    if (metadata.spatialCoverage || metadata.temporalCoverage) {
      roles.data_capability = Math.min(1.0, roles.data_capability + 0.2);
    }

    // Earth content: structured spatial, hazard, region, or Earth-variable context.
    if (
      metadata.regions?.length > 0 ||
      metadata.hazards?.length > 0 ||
      metadata.earthVariables?.length > 0 ||
      metadata.spatialCoverage
    ) {
      roles.earth_content = Math.min(1.0, roles.earth_content + 0.5);
    }

    // Modeling capability: presence of model metadata
    if (metadata.models?.length > 0 || metadata.architecture || metadata.hyperparameters || metadata.performance) {
      roles.modeling_capability = Math.min(1.0, roles.modeling_capability + 0.3);
    }

    // Computing capability: presence of code structure
    if (
      metadata.language ||
      metadata.dependencies?.length > 0 ||
      metadata.tree?.length > 5 ||
      metadata.algorithms?.length > 0 ||
      metadata.software?.length > 0 ||
      metadata.workflows?.length > 0
    ) {
      roles.computing_capability = Math.min(1.0, roles.computing_capability + 0.3);
    }

    // Governance capability: presence of jurisdiction
    if (metadata.jurisdiction || metadata.effectiveDate) {
      roles.governance_capability = Math.min(1.0, roles.governance_capability + 0.3);
    }

    // Event signal: presence of event metadata
    if (metadata.date && metadata.location) {
      roles.event_signal = Math.min(1.0, roles.event_signal + 0.3);
    }
  }

  /**
   * Check if source is explicitly Earth-related
   *
   * IMPORTANT: This uses structural indicators only, NOT semantic keyword matching.
   * The actual Earth-relevance determination is done by LLM in evaluateRoles().
   *
   * Structural indicators (deterministic):
   * - Has hazards metadata field (structured data, not keywords)
   * - Has regions metadata field (indicates geographic scope)
   * - Has institutions metadata field (indicates organizational context)
   *
   * This method returns a weak structural signal. LLM makes the final semantic judgment.
   */
  _checkExplicitEarthSource(metadata) {
    // Structural indicators only - presence of structured fields, not content matching
    if (metadata.hazards?.length > 0) return true;
    if (metadata.regions?.length > 0) return true;  // Has geographic scope
    if (metadata.institutions?.length > 0) return true;  // Has organizational context
    return false;
  }

  /**
   * Assess transfer potential using LLM
   */
  async assessTransferPotential(metadata, ruleResult) {
    if (!this.llm) {
      return {
        transferPotential: null,
        reason: 'No LLM available'
      };
    }

    // If already explicit Earth source, no transfer assessment needed
    if (ruleResult.isExplicitEarthSource) {
      return {
        transferPotential: 0,
        reason: 'Already explicit Earth source'
      };
    }

    const title = metadata.title || metadata.name || '';
    const abstract = metadata.abstract || metadata.description || metadata.readme || '';

    if (abstract.length < 100) {
      return {
        transferPotential: null,
        reason: 'Insufficient text'
      };
    }

    const prompt = `Assess Digital Earth transfer potential for this source.

Digital Earth needs sources that can help with:
- Observing/monitoring Earth systems
- Modeling/simulating Earth processes
- Assessing risks and vulnerabilities
- Supporting decision-making
- Analyzing spatiotemporal patterns

This source may not be explicitly Earth-related, but could have transferable capabilities.

Title: ${title}
Description: ${abstract.substring(0, 2000)}

Assess:
1. transferPotential (0-1): How much could this contribute to Digital Earth?
2. relevantRoles: Which Digital Earth roles could benefit?
3. transferReasons: What specific capabilities could transfer?

Return JSON:
{
  "transferPotential": 0.0-1.0,
  "relevantRoles": ["role1", "role2"],
  "transferReasons": ["reason1"],
  "confidence": 0.0-1.0
}`;

    try {
      const response = await this.llm.chat({
        messages: [
          { role: 'system', content: 'You assess transfer potential of research sources to Digital Earth applications.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 400
      });

      const responseText = response.choices?.[0]?.message?.content || response.content || '';
      const result = parseLLMJson(responseText, { attachWarning: false });

      return {
        transferPotential: result.transferPotential || 0,
        relevantRoles: result.relevantRoles || [],
        transferReasons: result.transferReasons || [],
        confidence: result.confidence || 0.5,
        isTransferSource: result.transferPotential >= 0.4
      };

    } catch (error) {
      return {
        transferPotential: null,
        reason: `LLM assessment failed: ${error.message}`
      };
    }
  }
}

/**
 * Determine activated ontology layers based on roles
 * Simplified - uses LLM judgment embedded in role scores
 */
function getActivatedOntology(roles) {
  const layers = new Set(['source', 'foundation']);
  const categories = new Set();

  if (roles.earth_content >= 0.2 || roles.evidence_assessment >= 0.2) {
    layers.add('capability');
    categories.add('evidence');
    categories.add('modeling');
  }

  if (roles.data_capability >= 0.2) {
    layers.add('capability');
    categories.add('data');
    layers.add('world');
    categories.add('earth-variable');
  }

  if (roles.observation_capability >= 0.2) {
    layers.add('capability');
    categories.add('observation');
    layers.add('world');
    categories.add('earth-variable');
  }

  if (roles.modeling_capability >= 0.2) {
    layers.add('capability');
    categories.add('modeling');
    layers.add('world');
    categories.add('earth-process');
    categories.add('model-output');
  }

  if (roles.computing_capability >= 0.2) {
    layers.add('capability');
    categories.add('computing');
  }

  if (roles.governance_capability >= 0.2) {
    layers.add('capability');
    categories.add('governance');
    layers.add('world');
    categories.add('risk');
  }

  if (roles.socioeconomic_capability >= 0.2) {
    layers.add('capability');
    categories.add('socioeconomic');
    layers.add('world');
    categories.add('exposure');
  }

  if (roles.action_capability >= 0.2) {
    layers.add('capability');
    categories.add('action');
    layers.add('world');
    categories.add('risk');
  }

  if (roles.event_signal >= 0.2) {
    layers.add('world');
    categories.add('hazard');
    categories.add('earth-object');
  }

  return {
    layers: Array.from(layers),
    categories: Array.from(categories)
  };
}

/**
 * Detect source type from input
 *
 * IMPORTANT: This function only identifies STRUCTURAL patterns (DOI, GitHub URL).
 * Domain patterns like data portals are routing hints, NOT final type determination.
 *
 * Final source type should be determined by:
 * 1. Explicit metadata.type if provided
 * 2. LLM semantic classification when available
 * 3. Fallback to generic 'Source' type
 *
 * Separation of concerns:
 * - detectSourceType: identifies URL/DOI structure → connector routing
 * - LLMRoleEvaluator.detectSourceTypeWithLLM(): semantic classification → entity type
 */
function detectSourceType(input, metadata = {}) {
  // Use metadata type if explicitly provided
  if (metadata.type) return metadata.type;

  const inputStr = (input || '').toLowerCase();

  // Structural patterns (deterministic, safe to use)
  // DOI pattern - identifies academic paper structure
  if (/10\.\d{4,}\/\S+/.test(inputStr)) return 'Paper';

  // GitHub pattern - identifies code repository structure
  if (/github\.com\/[\w-]+\/[\w-]+/.test(inputStr)) return 'Repository';

  // Domain routing hints removed - these should be connector routing logic
  // not type detection. LLM will decide actual type based on content.
  // e.g., an external URL could be DatasetPage, APIPage, Documentation, or Source

  // For other inputs, return generic type
  // LLM or metadata will refine this
  return 'Source';
}

module.exports = {
  SourceRoleEvaluator,
  SOURCE_ROLES,
  getActivatedOntology,
  detectSourceType
};
