/**
 * Source Role Evaluator
 * Determines what Digital Earth roles a source can play
 *
 * Key insight: Not everything is "research-relevant" but many things are
 * Digital Earth-relevant. A policy report, population dataset, or flood news
 * may not be strong research sources, but they're critical for Digital Earth.
 */

const SOURCE_ROLES = {
  earth_content: {
    name: 'earth_content',
    description: 'Contains Earth system knowledge (papers, reports, assessments)',
    sourceTypes: ['Paper', 'Preprint', 'Report', 'AssessmentReport', 'WhitePaper', 'Documentation'],
    keywords: ['earth', 'climate', 'hydrology', 'water', 'flood', 'drought', 'ecosystem', 'geology', 'ocean', 'atmosphere', 'glacier', 'basin', 'watershed']
  },
  data_capability: {
    name: 'data_capability',
    description: 'Provides data for Earth analysis (datasets, data products)',
    sourceTypes: ['DatasetPage', 'DataCatalog', 'KnowledgeGraph'],
    keywords: ['dataset', 'data', 'variables', 'coverage', 'era5', 'grdc', 'glofas', 'modis', 'sentinel', 'landsat', 'elevation', 'precipitation', 'temperature']
  },
  observation_capability: {
    name: 'observation_capability',
    description: 'Provides Earth observation capability (sensors, gauges, satellites)',
    sourceTypes: ['Repository', 'Documentation', 'APIPage'],
    keywords: ['sensor', 'gauge', 'station', 'satellite', 'observation', 'monitoring', 'remote sensing', 'in-situ', 'network', 'station']
  },
  modeling_capability: {
    name: 'modeling_capability',
    description: 'Provides modeling/simulation capability (models, algorithms)',
    sourceTypes: ['Repository', 'ModelCard', 'Paper', 'Benchmark'],
    keywords: ['model', 'simulation', 'forecast', 'prediction', 'lstm', 'transformer', 'gnn', 'cnn', 'hydrological', 'climate model', 'calibration', 'validation']
  },
  computing_capability: {
    name: 'computing_capability',
    description: 'Provides computing infrastructure (software, APIs, workflows)',
    sourceTypes: ['Repository', 'Package', 'APIPage', 'Documentation', 'TechnicalBlog'],
    keywords: ['software', 'package', 'api', 'workflow', 'pipeline', 'framework', 'library', 'toolkit', 'platform', 'cloud']
  },
  governance_capability: {
    name: 'governance_capability',
    description: 'Provides governance/policy information (regulations, institutions, standards)',
    sourceTypes: ['PolicyDocument', 'StandardDocument', 'Report', 'AssessmentReport'],
    keywords: ['policy', 'regulation', 'standard', 'institution', 'governance', 'compliance', 'wmo', 'ipcc', 'fema', 'directive', 'law', 'act']
  },
  socioeconomic_capability: {
    name: 'socioeconomic_capability',
    description: 'Provides socioeconomic data (population, infrastructure, exposure)',
    sourceTypes: ['DatasetPage', 'Report', 'PolicyDocument'],
    keywords: ['population', 'gdp', 'infrastructure', 'exposure', 'vulnerability', 'land use', 'urban', 'building', 'asset', 'economic', 'demographic']
  },
  evidence_assessment: {
    name: 'evidence_assessment',
    description: 'Provides evidence or assessment (claims, indicators, evaluations)',
    sourceTypes: ['Paper', 'Report', 'AssessmentReport', 'WhitePaper'],
    keywords: ['assessment', 'evaluation', 'indicator', 'index', 'evidence', 'finding', 'conclusion', 'confidence', 'risk assessment', 'impact']
  },
  action_capability: {
    name: 'action_capability',
    description: 'Provides action/intervention information (measures, plans, responses)',
    sourceTypes: ['PolicyDocument', 'Report', 'News'],
    keywords: ['adaptation', 'mitigation', 'intervention', 'action', 'plan', 'measure', 'response', 'management', 'early warning', 'evacuation']
  },
  event_signal: {
    name: 'event_signal',
    description: 'Reports on Earth events (floods, droughts, disasters, changes)',
    sourceTypes: ['News', 'PressRelease', 'Report'],
    keywords: ['flood', 'drought', 'earthquake', 'wildfire', 'landslide', 'heatwave', 'cyclone', 'hurricane', 'disaster', 'event', 'crisis', 'emergency', 'warning']
  }
};

class SourceRoleEvaluator {
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
          keywordMatches: keywordMatches.slice(0, 3)
        });
      }
    }

    return {
      roles,
      detectedRoles: detectedRoles.sort((a, b) => b.score - a.score),
      primaryRole: detectedRoles.length > 0 ? detectedRoles[0].role : 'earth_content',
      roleCount: detectedRoles.filter(r => r.score >= 0.2).length
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
