/**
 * Source Role Evaluator
 * Determines what Digital Earth roles a source can play
 *
 * Key insight: Not everything is "research-relevant" but many things are
 * Digital Earth-relevant. A policy report, population dataset, or flood news
 * may not be strong research sources, but they're critical for Digital Earth.
 *
 * Two-phase evaluation:
 * 1. Rule-based keyword matching (fast, reliable)
 * 2. LLM-based transfer potential assessment (for non-obvious sources)
 *
 * Transfer Capability Sources:
 * - A GNN paper may not have Earth keywords, but can model spatial networks
 * - A materials science paper may help with sensor materials
 * - A supply chain paper may help with infrastructure resilience
 */

const SOURCE_ROLES = {
  earth_content: {
    name: 'earth_content',
    description: 'Contains Earth system knowledge (papers, reports, assessments)',
    sourceTypes: ['Paper', 'Preprint', 'Report', 'AssessmentReport', 'WhitePaper', 'Documentation'],
    keywords: ['earth', 'climate', 'hydrology', 'water', 'flood', 'drought', 'ecosystem', 'geology', 'ocean', 'atmosphere', 'glacier', 'basin', 'watershed'],
    transferIndicators: ['spatiotemporal', 'network', 'system', 'dynamic', 'feedback']
  },
  data_capability: {
    name: 'data_capability',
    description: 'Provides data for Earth analysis (datasets, data products)',
    sourceTypes: ['DatasetPage', 'DataCatalog', 'KnowledgeGraph'],
    keywords: ['dataset', 'data', 'variables', 'coverage', 'era5', 'grdc', 'glofas', 'modis', 'sentinel', 'landsat', 'elevation', 'precipitation', 'temperature'],
    transferIndicators: ['time series', 'spatial data', 'multivariate', 'quality control']
  },
  observation_capability: {
    name: 'observation_capability',
    description: 'Provides Earth observation capability (sensors, gauges, satellites)',
    sourceTypes: ['Repository', 'Documentation', 'APIPage'],
    keywords: ['sensor', 'gauge', 'station', 'satellite', 'observation', 'monitoring', 'remote sensing', 'in-situ', 'network', 'station'],
    transferIndicators: ['measurement', 'sampling', 'calibration', 'noise reduction', 'signal processing']
  },
  modeling_capability: {
    name: 'modeling_capability',
    description: 'Provides modeling/simulation capability (models, algorithms)',
    sourceTypes: ['Repository', 'ModelCard', 'Paper', 'Benchmark'],
    keywords: ['model', 'simulation', 'forecast', 'prediction', 'lstm', 'transformer', 'gnn', 'cnn', 'hydrological', 'climate model', 'calibration', 'validation'],
    transferIndicators: ['graph neural network', 'attention', 'spatial', 'temporal', 'physics-informed', 'uncertainty', 'ensemble', 'transfer learning', 'domain adaptation']
  },
  computing_capability: {
    name: 'computing_capability',
    description: 'Provides computing infrastructure (software, APIs, workflows)',
    sourceTypes: ['Repository', 'Package', 'APIPage', 'Documentation', 'TechnicalBlog'],
    keywords: ['software', 'package', 'api', 'workflow', 'pipeline', 'framework', 'library', 'toolkit', 'platform', 'cloud'],
    transferIndicators: ['parallel computing', 'optimization', 'visualization', 'data pipeline', 'distributed']
  },
  governance_capability: {
    name: 'governance_capability',
    description: 'Provides governance/policy information (regulations, institutions, standards)',
    sourceTypes: ['PolicyDocument', 'StandardDocument', 'Report', 'AssessmentReport'],
    keywords: ['policy', 'regulation', 'standard', 'institution', 'governance', 'compliance', 'wmo', 'ipcc', 'fema', 'directive', 'law', 'act'],
    transferIndicators: ['decision-making', 'multi-stakeholder', 'coordination', 'implementation']
  },
  socioeconomic_capability: {
    name: 'socioeconomic_capability',
    description: 'Provides socioeconomic data (population, infrastructure, exposure)',
    sourceTypes: ['DatasetPage', 'Report', 'PolicyDocument'],
    keywords: ['population', 'gdp', 'infrastructure', 'exposure', 'vulnerability', 'land use', 'urban', 'building', 'asset', 'economic', 'demographic'],
    transferIndicators: ['human behavior', 'resource allocation', 'risk perception', 'decision support']
  },
  evidence_assessment: {
    name: 'evidence_assessment',
    description: 'Provides evidence or assessment (claims, indicators, evaluations)',
    sourceTypes: ['Paper', 'Report', 'AssessmentReport', 'WhitePaper'],
    keywords: ['assessment', 'evaluation', 'indicator', 'index', 'evidence', 'finding', 'conclusion', 'confidence', 'risk assessment', 'impact'],
    transferIndicators: ['validation', 'benchmarking', 'quality metrics', 'reproducibility']
  },
  action_capability: {
    name: 'action_capability',
    description: 'Provides action/intervention information (measures, plans, responses)',
    sourceTypes: ['PolicyDocument', 'Report', 'News'],
    keywords: ['adaptation', 'mitigation', 'intervention', 'action', 'plan', 'measure', 'response', 'management', 'early warning', 'evacuation'],
    transferIndicators: ['optimization', 'resource management', 'scheduling', 'coordination']
  },
  event_signal: {
    name: 'event_signal',
    description: 'Reports on Earth events (floods, droughts, disasters, changes)',
    sourceTypes: ['News', 'PressRelease', 'Report'],
    keywords: ['flood', 'drought', 'earthquake', 'wildfire', 'landslide', 'heatwave', 'cyclone', 'hurricane', 'disaster', 'event', 'crisis', 'emergency', 'warning'],
    transferIndicators: ['real-time', 'alert', 'anomaly detection', 'rapid assessment']
  }
};

// Fields that indicate transfer potential to Digital Earth
const TRANSFER_POTENTIAL_INDICATORS = [
  'spatiotemporal',
  'graph neural network',
  'attention mechanism',
  'physics-informed',
  'domain adaptation',
  'transfer learning',
  'uncertainty quantification',
  'time series forecasting',
  'anomaly detection',
  'multi-scale',
  'network analysis',
  'optimization',
  'resource allocation',
  'decision support',
  'risk analysis',
  'simulation',
  'forecasting',
  'prediction',
  'calibration',
  'validation'
];

class SourceRoleEvaluator {
  constructor(llm = null) {
    this.llm = llm;
  }

  /**
   * Phase 1: Rule-based scoring (fast, reliable)
   */
  score(metadata = {}) {
    const roles = {};
    const detectedRoles = [];

    const type = (metadata.type || '').toLowerCase();
    const title = (metadata.title || metadata.name || '').toLowerCase();
    const description = (metadata.description || metadata.abstract || metadata.readme || '').toLowerCase();
    const combinedText = `${title} ${description}`;

    for (const [roleName, roleDef] of Object.entries(SOURCE_ROLES)) {
      let score = 0;

      // Check source type match
      const typeMatch = roleDef.sourceTypes.some(st =>
        type === st.toLowerCase() || type.includes(st.toLowerCase())
      );
      if (typeMatch) {
        score += 0.4;
      }

      // Check keyword match
      const keywordMatches = roleDef.keywords.filter(kw =>
        combinedText.includes(kw)
      );
      if (keywordMatches.length > 0) {
        score += Math.min(0.5, keywordMatches.length * 0.1);
      }

      // Check transfer indicator match
      const transferMatches = roleDef.transferIndicators?.filter(ti =>
        combinedText.includes(ti)
      ) || [];
      if (transferMatches.length > 0) {
        score += Math.min(0.3, transferMatches.length * 0.08);
      }

      // Check content-specific indicators
      score += this._contentBonus(roleName, metadata);

      // Cap at 1.0
      score = Math.min(1.0, score);

      roles[roleName] = Math.round(score * 100) / 100;

      if (score >= 0.2) {
        detectedRoles.push({
          role: roleName,
          score,
          typeMatch,
          keywordMatches: keywordMatches.slice(0, 3),
          transferMatches: transferMatches.slice(0, 3)
        });
      }
    }

    return {
      roles,
      detectedRoles: detectedRoles.sort((a, b) => b.score - a.score),
      primaryRole: detectedRoles.length > 0 ? detectedRoles[0].role : 'earth_content',
      roleCount: detectedRoles.filter(r => r.score >= 0.2).length,
      isExplicitEarthSource: this._isExplicitEarthSource(combinedText, detectedRoles)
    };
  }

  /**
   * Check if source is explicitly Earth-related (has Earth keywords)
   */
  _isExplicitEarthSource(text, detectedRoles) {
    const earthKeywords = SOURCE_ROLES.earth_content.keywords;
    const hasEarthKeywords = earthKeywords.some(kw => text.includes(kw));
    const hasHighEarthScore = detectedRoles.some(r => r.role === 'earth_content' && r.score >= 0.3);
    return hasEarthKeywords || hasHighEarthScore;
  }

  /**
   * Phase 2: LLM-based transfer potential assessment
   * Called when source is not explicitly Earth-related
   */
  async assessTransferPotential(metadata, ruleResult) {
    if (!this.llm) {
      return {
        transferPotential: null,
        refinement: null,
        reason: 'No LLM available for transfer assessment'
      };
    }

    // Skip if already explicitly Earth-related
    if (ruleResult.isExplicitEarthSource) {
      return {
        transferPotential: 0,
        refinement: null,
        reason: 'Already explicit Earth source, no transfer assessment needed'
      };
    }

    const title = metadata.title || metadata.name || '';
    const abstract = metadata.abstract || metadata.description || metadata.readme || '';

    // Skip if insufficient text
    if (abstract.length < 100) {
      return {
        transferPotential: null,
        refinement: null,
        reason: 'Insufficient text for transfer assessment'
      };
    }

    const prompt = `Assess the Digital Earth transfer potential of this source.

Digital Earth Intelligence Platform needs sources that can help:
- Observe/monitor Earth systems (water, climate, ecosystems)
- Model/simulate Earth processes (hydrology, climate, hazards)
- Assess risks and vulnerabilities (floods, droughts, heatwaves)
- Support decision-making and interventions
- Analyze spatiotemporal patterns and networks

This source may not be explicitly about Earth science, but it might have transferable capabilities.

## Source
Title: ${title}
Abstract/Description: ${abstract.substring(0, 2000)}

## Assessment Task
1. Score transfer potential (0-1): How much could this source contribute to Digital Earth construction?
2. Identify relevant Digital Earth roles: modeling_capability, computing_capability, observation_capability, data_capability, governance_capability, action_capability
3. Explain WHY: What specific capabilities could transfer?

Return JSON:
{
  "transferPotential": 0.0-1.0,
  "relevantRoles": ["role1", "role2"],
  "transferReasons": ["reason1", "reason2"],
  "capabilityTypes": ["specific capability this could enable"],
  "confidence": 0.0-1.0
}`;

    try {
      const response = await this.llm.chat({
        messages: [
          { role: 'system', content: 'You are a Digital Earth relevance assessor. Evaluate transfer potential of research sources to Earth system applications.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.2,
        max_tokens: 500
      });

      const responseText = response.choices?.[0]?.message?.content || response.content || '';
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON in response');
      }

      const assessment = JSON.parse(jsonMatch[0]);

      return {
        transferPotential: assessment.transferPotential || 0,
        relevantRoles: assessment.relevantRoles || [],
        transferReasons: assessment.transferReasons || [],
        capabilityTypes: assessment.capabilityTypes || [],
        confidence: assessment.confidence || 0.5,
        isTransferSource: assessment.transferPotential >= 0.4
      };

    } catch (error) {
      console.error('Transfer potential assessment failed:', error.message);
      return {
        transferPotential: null,
        refinement: null,
        reason: `LLM assessment failed: ${error.message}`
      };
    }
  }

  /**
   * Combined evaluation: rule-based + LLM refinement
   */
  async evaluate(metadata = {}) {
    // Phase 1: Rule-based scoring
    const ruleResult = this.score(metadata);

    // Phase 2: LLM transfer assessment (if needed and available)
    let transferResult = null;

    if (!ruleResult.isExplicitEarthSource && this.llm) {
      transferResult = await this.assessTransferPotential(metadata, ruleResult);

      // Merge transfer assessment into roles
      if (transferResult?.isTransferSource) {
        for (const role of transferResult.relevantRoles) {
          if (ruleResult.roles[role] !== undefined) {
            // Boost role score with transfer potential
            const boost = transferResult.transferPotential * 0.3;
            ruleResult.roles[role] = Math.min(1.0, ruleResult.roles[role] + boost);
          } else {
            // Add new role from transfer assessment
            ruleResult.roles[role] = transferResult.transferPotential * 0.5;
          }
        }

        // Update detected roles
        ruleResult.detectedRoles = Object.entries(ruleResult.roles)
          .filter(([_, score]) => score >= 0.2)
          .map(([role, score]) => ({
            role,
            score,
            source: roleResult.roles[role] >= 0.3 ? 'rule+transfer' : 'transfer'
          }))
          .sort((a, b) => b.score - a.score);

        ruleResult.primaryRole = ruleResult.detectedRoles[0]?.role || ruleResult.primaryRole;
        ruleResult.isTransferSource = true;
        ruleResult.transferReasons = transferResult.transferReasons;
      }
    }

    return {
      ...ruleResult,
      transferAssessment: transferResult,
      evaluationMethod: ruleResult.isExplicitEarthSource ? 'rule-based' :
                        (transferResult?.isTransferSource ? 'rule+llm-transfer' : 'rule-based')
    };
  }

  _contentBonus(roleName, metadata) {
    let bonus = 0;

    switch (roleName) {
      case 'data_capability':
        if (metadata.variables?.length > 0) bonus += 0.2;
        if (metadata.spatialCoverage) bonus += 0.15;
        if (metadata.temporalCoverage) bonus += 0.1;
        break;

      case 'modeling_capability':
        if (metadata.architecture || metadata.hyperparameters) bonus += 0.2;
        if (metadata.performance || metadata.metrics) bonus += 0.15;
        break;

      case 'computing_capability':
        if (metadata.language) bonus += 0.1;
        if (metadata.tree?.length > 5) bonus += 0.15;
        if (metadata.dependencies?.length > 0) bonus += 0.1;
        break;

      case 'governance_capability':
        if (metadata.jurisdiction) bonus += 0.2;
        if (metadata.effectiveDate) bonus += 0.15;
        break;

      case 'evidence_assessment':
        if (metadata.sections?.results) bonus += 0.2;
        if (metadata.figures?.length > 0) bonus += 0.1;
        break;

      case 'event_signal':
        if (metadata.date || metadata.timestamp) bonus += 0.15;
        if (metadata.location) bonus += 0.1;
        break;
    }

    return bonus;
  }
}

/**
 * Determine activated ontology layers and categories based on source roles
 */
function getActivatedOntology(roles) {
  const layers = new Set(['source']); // Always include source layer
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

  // Always include foundation
  layers.add('foundation');

  return {
    layers: Array.from(layers),
    categories: Array.from(categories)
  };
}

/**
 * Determine source type from input and metadata
 */
function detectSourceType(input, metadata = {}) {
  const inputStr = (input || '').toLowerCase();

  if (metadata.type) return metadata.type;

  // DOI pattern
  if (/10\.\d{4,}\/\S+/.test(inputStr)) return 'Paper';

  // GitHub URL
  if (/github\.com\/[\w-]+\/[\w-]+/.test(inputStr)) return 'Repository';

  // Dataset indicators
  if (inputStr.includes('dataset') || inputStr.includes('data.gov') || inputStr.includes('copernicus')) return 'DatasetPage';

  // Policy indicators
  if (inputStr.includes('policy') || inputStr.includes('regulation') || inputStr.includes('directive')) return 'PolicyDocument';

  // News indicators
  if (inputStr.includes('news') || inputStr.includes('reuters') || inputStr.includes('bbc')) return 'News';

  // Report indicators
  if (inputStr.includes('report') || inputStr.includes('assessment') || inputStr.includes('ipcc')) return 'Report';

  // Default
  return 'Source';
}

module.exports = {
  SourceRoleEvaluator,
  SOURCE_ROLES,
  getActivatedOntology,
  detectSourceType
};
