/**
 * LLM-Based Role Evaluator
 * Uses LLM for semantic role assignment instead of keyword matching
 *
 * Key design:
 * - LLM judges role relevance from description, not keyword presence
 * - LLM detects transfer potential for non-obvious sources
 * - Rules are minimal fallbacks, LLM is primary
 */

class LLMRoleEvaluator {
  constructor(llm) {
    this.llm = llm;
    // Check if LLM has chat method
    this.hasLLM = llm && typeof llm.chat === 'function';
  }

  /**
   * Evaluate source roles using LLM semantic understanding
   * Returns role scores based on LLM judgment, not keyword counting
   */
  async evaluateRoles(metadata) {
    if (!this.hasLLM) {
      return this._fallbackEvaluation(metadata);
    }

    const title = metadata.title || metadata.name || '';
    const description = metadata.description || metadata.abstract || metadata.readme || '';
    const type = metadata.type || '';

    // Build prompt for LLM role evaluation
    const prompt = `Evaluate this source for Digital Earth Intelligence Platform roles.

Digital Earth roles are:
- earth_content: Contains Earth system knowledge (climate, hydrology, floods, ecosystems)
- data_capability: Provides datasets for Earth analysis (ERA5, GRDC, satellite data)
- observation_capability: Provides observation systems (sensors, satellites, gauges)
- modeling_capability: Provides models/algorithms (LSTM, hydrological models, forecast systems)
- computing_capability: Provides software/tools (Python packages, APIs, workflows)
- governance_capability: Provides policy/regulations (IPCC reports, WMO standards)
- socioeconomic_capability: Provides socioeconomic data (population, GDP, infrastructure)
- evidence_assessment: Provides assessments/indicators (risk assessments, evaluations)
- action_capability: Provides interventions/actions (adaptation measures, emergency response)
- event_signal: Reports Earth events (flood news, disaster reports)

Source Information:
Type: ${type}
Title: ${title}
Description: ${description.substring(0, 2000)}

Task:
1. Score each role (0-1) based on semantic relevance to Digital Earth
2. Consider transfer potential: Can this source's capabilities be applied to Earth systems?
3. Identify the primary role (highest relevance)
4. Explain why for the primary role

Return JSON:
{
  "roles": {
    "earth_content": 0.0-1.0,
    "data_capability": 0.0-1.0,
    "observation_capability": 0.0-1.0,
    "modeling_capability": 0.0-1.0,
    "computing_capability": 0.0-1.0,
    "governance_capability": 0.0-1.0,
    "socioeconomic_capability": 0.0-1.0,
    "evidence_assessment": 0.0-1.0,
    "action_capability": 0.0-1.0,
    "event_signal": 0.0-1.0
  },
  "primaryRole": "role_name",
  "reasons": ["reason1", "reason2"],
  "transferPotential": 0.0-1.0,
  "transferReasons": ["what capabilities could transfer to Digital Earth"]
}`;

    try {
      const response = await this.llm.chat({
        messages: [
          { role: 'system', content: 'You are a Digital Earth source evaluator. Score roles based on semantic relevance, not keyword presence.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 800
      });

      const responseText = response.choices?.[0]?.message?.content || response.content || '';
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON in response');
      }

      const result = JSON.parse(jsonMatch[0]);

      // Normalize scores
      for (const role of Object.keys(result.roles)) {
        result.roles[role] = Math.max(0, Math.min(1, result.roles[role] || 0));
      }

      return {
        roles: result.roles,
        primaryRole: result.primaryRole,
        detectedRoles: Object.entries(result.roles)
          .filter(([_, score]) => score >= 0.2)
          .map(([role, score]) => ({ role, score }))
          .sort((a, b) => b.score - a.score),
        reasons: result.reasons || [],
        transferPotential: result.transferPotential || 0,
        transferReasons: result.transferReasons || [],
        evaluationMethod: 'llm'
      };

    } catch (error) {
      console.error('LLM role evaluation failed:', error.message);
      return this._fallbackEvaluation(metadata);
    }
  }

  /**
   * Minimal fallback when LLM unavailable
   * Uses source type inference, not keyword matching
   */
  _fallbackEvaluation(metadata) {
    const type = metadata.type || '';
    const roles = {};

    // Minimal type-based inference
    const typeRoleMap = {
      'Paper': { earth_content: 0.5, modeling_capability: 0.3 },
      'Preprint': { earth_content: 0.4 },
      'Report': { governance_capability: 0.4, evidence_assessment: 0.3 },
      'AssessmentReport': { evidence_assessment: 0.6, governance_capability: 0.4 },
      'Repository': { computing_capability: 0.5, modeling_capability: 0.3 },
      'ModelCard': { modeling_capability: 0.7 },
      'DatasetPage': { data_capability: 0.7 },
      'DataCatalog': { data_capability: 0.6 },
      'PolicyDocument': { governance_capability: 0.7, action_capability: 0.4 },
      'StandardDocument': { governance_capability: 0.6 },
      'News': { event_signal: 0.7 },
      'PressRelease': { event_signal: 0.6 }
    };

    const typeRoles = typeRoleMap[type] || { earth_content: 0.3 };

    // Initialize all roles with 0
    const allRoles = [
      'earth_content', 'data_capability', 'observation_capability',
      'modeling_capability', 'computing_capability', 'governance_capability',
      'socioeconomic_capability', 'evidence_assessment', 'action_capability', 'event_signal'
    ];

    for (const role of allRoles) {
      roles[role] = typeRoles[role] || 0;
    }

    const detectedRoles = Object.entries(roles)
      .filter(([_, score]) => score > 0)
      .map(([role, score]) => ({ role, score }))
      .sort((a, b) => b.score - a.score);

    return {
      roles,
      primaryRole: detectedRoles[0]?.role || 'earth_content',
      detectedRoles,
      reasons: [`Inferred from source type: ${type}`],
      transferPotential: null,
      transferReasons: [],
      evaluationMethod: 'type-fallback'
    };
  }

  /**
   * Detect source type from input using minimal rules
   * LLM should override this when available
   */
  detectSourceType(input, metadata = {}) {
    // Use metadata type if provided
    if (metadata.type) return metadata.type;

    const inputStr = (input || '').toLowerCase();

    // Minimal pattern detection (DOI, GitHub only)
    if (/10\.\d{4,}\/\S+/.test(inputStr)) return 'Paper';
    if (/github\.com\/[\w-]+\/[\w-]+/.test(inputStr)) return 'Repository';

    // Let LLM decide for other cases
    return 'Source';
  }

  /**
   * LLM-based source type detection for ambiguous inputs
   */
  async detectSourceTypeWithLLM(input, metadata) {
    if (!this.llm) {
      return this.detectSourceType(input, metadata);
    }

    const title = metadata.title || '';
    const description = metadata.description || '';

    const prompt = `Detect the source type for this Digital Earth source.

Source types:
- Paper: Scientific paper, journal article, preprint
- Report: Technical report, assessment, white paper
- Repository: GitHub repo, code package, software
- Dataset: Data catalog, dataset page, data portal
- PolicyDocument: Policy, regulation, standard
- News: News article, press release, blog post
- Documentation: Technical docs, API docs, manuals

Input: ${input}
Title: ${title}
Description: ${description.substring(0, 500)}

Return JSON:
{
  "type": "SourceType",
  "confidence": 0.0-1.0,
  "reason": "explanation"
}`;

    try {
      const response = await this.llm.chat({
        messages: [
          { role: 'system', content: 'You classify Digital Earth source types.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1,
        max_tokens: 200
      });

      const responseText = response.choices?.[0]?.message?.content || response.content || '';
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) return this.detectSourceType(input, metadata);

      const result = JSON.parse(jsonMatch[0]);
      return result.type || this.detectSourceType(input, metadata);

    } catch (error) {
      return this.detectSourceType(input, metadata);
    }
  }
}

module.exports = { LLMRoleEvaluator };